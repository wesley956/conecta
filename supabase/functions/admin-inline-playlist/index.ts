import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, panelAuthErrorResponse, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object'
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function requiredText(value: unknown, label: string, maximumLength: number) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  if (text.length > maximumLength) throw new Error(`${label} excede o tamanho permitido.`);
  return text;
}

function textOrNull(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizePlaylistType(value: unknown) {
  const type = String(value ?? 'm3u').trim().toLowerCase();
  return ['m3u', 'xtream', 'stalker'].includes(type) ? type : 'm3u';
}

function validatePlaylistUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('URL da lista inválida.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('A URL da lista precisa usar HTTP ou HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Não informe credenciais antes do domínio da URL. Use os parâmetros fornecidos pelo provedor.');
  }
  return value;
}

async function triggerPlaylistCache(supabaseUrl: string, playlistId: string) {
  const adminToken = Deno.env.get('ADMIN_PANEL_TOKEN') || '';
  if (!adminToken) {
    return { ok: false, skipped: true, error: 'Geração automática de cache não configurada.' };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: data.error || data.message || `Falha HTTP ${response.status} ao gerar cache.`,
    };
  }
  return data;
}

serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido.' }, 405);
  }

  let supabase: any = null;
  let createdPlaylistId: string | null = null;

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const principal = await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await readBody(request);
    const name = requiredText(body.name, 'Nome da lista', 180);
    const playlistUrl = validatePlaylistUrl(requiredText(body.playlistUrl, 'URL da lista', 4096));
    const playlistType = normalizePlaylistType(body.playlistType);
    const sellerId = textOrNull(body.sellerId);
    const now = new Date().toISOString();

    let sellerName: string | null = null;
    if (sellerId) {
      const { data: seller, error: sellerError } = await supabase
        .from('panel_sellers')
        .select('id, name, status')
        .eq('id', sellerId)
        .maybeSingle();

      if (sellerError || !seller) {
        return json({ error: sellerError?.message || 'Vendedor não encontrado.' }, 404);
      }
      if (seller.status !== 'active') {
        return json({ error: 'O vendedor escolhido está bloqueado ou inativo.' }, 400);
      }
      sellerName = seller.name || null;
    }

    const { data: playlist, error: playlistError } = await supabase
      .from('panel_playlists')
      .insert({
        name,
        playlist_url: playlistUrl,
        playlist_type: playlistType,
        active: true,
        playlist_updated_at: now,
        playlist_cache_status: 'missing',
        playlist_cache_error: null,
      })
      .select('id, name')
      .single();

    if (playlistError || !playlist?.id) {
      return json({ error: playlistError?.message || 'Não foi possível criar a lista.' }, 500);
    }
    createdPlaylistId = String(playlist.id);

    if (sellerId) {
      const { error: permissionError } = await supabase
        .from('panel_seller_playlists')
        .upsert({
          seller_id: sellerId,
          playlist_id: createdPlaylistId,
          active: true,
          updated_at: now,
        }, {
          onConflict: 'seller_id,playlist_id',
        });

      if (permissionError) {
        await supabase.from('panel_playlists').delete().eq('id', createdPlaylistId);
        createdPlaylistId = null;
        return json({ error: `Não foi possível liberar a lista ao vendedor: ${permissionError.message}` }, 500);
      }
    }

    const cache = await triggerPlaylistCache(supabaseUrl, createdPlaylistId);

    const { error: auditError } = await supabase.from('panel_audit_logs').insert({
      action: 'playlist.created_during_device_activation',
      entity_type: 'playlist',
      entity_id: createdPlaylistId,
      description: `Lista criada durante liberação de aparelho: ${name}`,
      metadata: {
        playlistType,
        sellerId,
        sellerName,
        cacheReady: cache?.ok === true,
        performedByUserId: principal.userId,
      },
    });

    if (auditError) {
      console.error('Não foi possível registrar a auditoria da lista criada.', {
        playlistId: createdPlaylistId,
        message: auditError.message,
      });
    }

    return json({
      ok: true,
      playlistId: createdPlaylistId,
      playlistName: playlist.name,
      sellerId,
      cache,
      message: cache?.ok
        ? 'Lista cadastrada, vinculada e com cache pronto.'
        : 'Lista cadastrada e vinculada, mas o cache ainda não ficou pronto. Tente novamente para atualizar o cache.',
    }, 201);
  } catch (error) {
    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders);
    }

    console.error('Falha ao criar lista durante a liberação.', {
      createdPlaylistId,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({
      error: error instanceof Error ? error.message : 'Falha inesperada ao criar a lista.',
    }, 400);
  }
});
