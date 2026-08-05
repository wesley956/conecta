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

serve(async request => {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await requirePanelPrincipal(request, supabase, ['owner']);

    const { data: legacyRows, error: legacyError } = await supabase
      .from('panel_playlists')
      .select('id, name, playlist_url, playlist_type, max_connections')
      .eq('active', true)
      .is('source_fingerprint', null)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (legacyError) throw new Error('Não foi possível carregar os metadados legados.');

    let processed = 0;
    let canonicalSources = 0;
    let failures = 0;
    const canonicalIds = new Set<string>();

    for (const row of legacyRows || []) {
      try {
        const playlistUrl = String(row.playlist_url || '').trim();
        if (!playlistUrl) {
          failures += 1;
          continue;
        }
        const fingerprint = await playlistSourceFingerprint(
          getEnv('SUPABASE_SERVICE_ROLE_KEY'),
          playlistUrl,
        );
        const { data, error } = await supabase.rpc('register_playlist_source_transaction', {
          p_name: String(row.name || 'Lista legada').slice(0, 180),
          p_playlist_url: playlistUrl,
          p_playlist_type: String(row.playlist_type || 'm3u'),
          p_max_connections: Math.max(1, Math.min(50, Number(row.max_connections || 1))),
          p_source_fingerprint: fingerprint,
          p_seller_id: null,
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.playlist_id) canonicalIds.add(String(result.playlist_id));
        processed += 1;
      } catch (error) {
        failures += 1;
        console.error('Falha sanitizada no backfill de fingerprint.', {
          message: redactPlaylistSecrets(error instanceof Error ? error.message : error, 240),
        });
      }
    }

    canonicalSources = canonicalIds.size;
    return json(request, {
      ok: failures === 0,
      data: {
        legacyRows: (legacyRows || []).length,
        processed,
        canonicalSources,
        failures,
      },
    }, failures === 0 ? 200 : 207);
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
