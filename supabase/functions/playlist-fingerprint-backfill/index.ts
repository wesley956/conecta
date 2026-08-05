import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';
import {
  playlistSourceFingerprint,
  redactPlaylistSecrets,
} from '../_shared/playlistSource.ts';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://wesley956.github.io',
  'https://conecta-five-iota.vercel.app',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function allowedOrigins() {
  const configured = String(Deno.env.get('PANEL_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(request: Request) {
  const origin = String(request.headers.get('origin') || '').trim();
  const allowed = allowedOrigins();
  const selected = origin && allowed.has(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': selected,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(request: Request, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function qualificationRank(value: unknown) {
  const ranks: Record<string, number> = {
    ready_cache: 0,
    ready_direct: 1,
    awaiting_device_test: 2,
    validating: 3,
    retryable_error: 4,
    blocked: 5,
  };
  return ranks[String(value || '')] ?? 6;
}

function compareCanonical(left: any, right: any) {
  const qualification = qualificationRank(left.playlist_qualification_status)
    - qualificationRank(right.playlist_qualification_status);
  if (qualification !== 0) return qualification;

  const leftCache = left.playlist_cache_status === 'ready' ? 0 : 1;
  const rightCache = right.playlist_cache_status === 'ready' ? 0 : 1;
  if (leftCache !== rightCache) return leftCache - rightCache;

  const items = Number(right.playlist_cache_item_count || 0)
    - Number(left.playlist_cache_item_count || 0);
  if (items !== 0) return items;

  const leftCreated = new Date(left.created_at || 0).getTime();
  const rightCreated = new Date(right.created_at || 0).getTime();
  return leftCreated - rightCreated;
}

async function registerSingleSource(supabase: any, row: any, fingerprint: string) {
  const { data, error } = await supabase.rpc('register_playlist_source_transaction', {
    p_name: String(row.name || 'Lista legada').slice(0, 180),
    p_playlist_url: String(row.playlist_url || '').trim(),
    p_playlist_type: String(row.playlist_type || 'm3u'),
    p_max_connections: Math.max(1, Math.min(50, Number(row.max_connections || 1))),
    p_source_fingerprint: fingerprint,
    p_seller_id: null,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.playlist_id) throw new Error('O cadastro canônico não retornou a lista processada.');
  return String(result.playlist_id);
}

serve(async request => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await requirePanelPrincipal(request, supabase, ['owner', 'admin']);

    const { data: activeRows, error: loadError } = await supabase
      .from('panel_playlists')
      .select(`
        id,
        name,
        playlist_url,
        playlist_type,
        max_connections,
        source_fingerprint,
        playlist_qualification_status,
        playlist_cache_status,
        playlist_cache_item_count,
        created_at
      `)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(2000);
    if (loadError) throw new Error('Não foi possível carregar os metadados das listas.');

    const groups = new Map<string, any[]>();
    let examined = 0;
    let failures = 0;

    for (const row of activeRows || []) {
      try {
        const playlistUrl = String(row.playlist_url || '').trim();
        if (!playlistUrl) throw new Error('Lista ativa sem origem válida.');
        const fingerprint = String(row.source_fingerprint || '').trim()
          || await playlistSourceFingerprint(getEnv('SUPABASE_SERVICE_ROLE_KEY'), playlistUrl);
        if (!groups.has(fingerprint)) groups.set(fingerprint, []);
        groups.get(fingerprint)!.push({ ...row, computedFingerprint: fingerprint });
        examined += 1;
      } catch (error) {
        failures += 1;
        console.error('Falha sanitizada ao calcular fingerprint legado.', {
          message: redactPlaylistSecrets(error instanceof Error ? error.message : error, 240),
        });
      }
    }

    let fingerprinted = 0;
    let consolidated = 0;
    let canonicalSources = 0;

    for (const [fingerprint, rows] of groups.entries()) {
      try {
        const ordered = [...rows].sort(compareCanonical);
        const canonical = ordered[0];
        canonicalSources += 1;

        if (ordered.length === 1) {
          if (!canonical.source_fingerprint) {
            const canonicalId = await registerSingleSource(supabase, canonical, fingerprint);
            if (canonicalId !== String(canonical.id)) {
              const { error: consolidationError } = await supabase.rpc(
                'consolidate_playlist_source_transaction',
                {
                  p_canonical_id: canonicalId,
                  p_duplicate_id: canonical.id,
                  p_source_fingerprint: fingerprint,
                },
              );
              if (consolidationError) throw consolidationError;
              consolidated += 1;
            } else {
              fingerprinted += 1;
            }
          }
          continue;
        }

        for (const duplicate of ordered.slice(1)) {
          const { data, error } = await supabase.rpc('consolidate_playlist_source_transaction', {
            p_canonical_id: canonical.id,
            p_duplicate_id: duplicate.id,
            p_source_fingerprint: fingerprint,
          });
          if (error) throw error;
          if (data?.ok !== true) throw new Error('A consolidação não retornou confirmação.');
          consolidated += 1;
        }

        if (!canonical.source_fingerprint) {
          const canonicalId = await registerSingleSource(supabase, canonical, fingerprint);
          if (canonicalId !== String(canonical.id)) {
            throw new Error('A origem canônica mudou durante o backfill.');
          }
          fingerprinted += 1;
        }
      } catch (error) {
        failures += 1;
        console.error('Falha sanitizada no backfill de fingerprint.', {
          message: redactPlaylistSecrets(error instanceof Error ? error.message : error, 240),
        });
      }
    }

    const { count: remainingWithoutFingerprint, error: countError } = await supabase
      .from('panel_playlists')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .is('source_fingerprint', null);
    if (countError) throw new Error('Não foi possível conferir o resultado do backfill.');

    return json(request, {
      ok: failures === 0 && Number(remainingWithoutFingerprint || 0) === 0,
      data: {
        examined,
        fingerprinted,
        consolidated,
        canonicalSources,
        failures,
        remainingWithoutFingerprint: Number(remainingWithoutFingerprint || 0),
      },
    }, failures === 0 && Number(remainingWithoutFingerprint || 0) === 0 ? 200 : 207);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, headers);
    return json(request, {
      error: redactPlaylistSecrets(
        error instanceof Error ? error.message : 'Falha no backfill protegido.',
        400,
      ),
    }, 400);
  }
});
