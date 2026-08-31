import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';

declare const EdgeRuntime: undefined | { waitUntil(promise: Promise<unknown>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BODY_BYTES = 16 * 1024;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('Requisição excede o limite permitido.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error('Requisição excede o limite permitido.');
  }
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function requiredUuid(value: unknown) {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Lista inválida.');
  }
  return id;
}

async function triggerCache(playlistId: string) {
  const response = await fetch(`${getEnv('SUPABASE_URL')}/functions/v1/playlist-cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getEnv('ADMIN_PANEL_TOKEN'),
    },
    body: JSON.stringify({ action: 'refresh', playlistId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 409) {
    throw new Error(body?.error || body?.message || `Falha HTTP ${response.status}.`);
  }
  return body;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const principal = await requirePanelPrincipal(request, supabase, ['seller']);
    if (!principal.sellerId) throw new PanelAuthError('Conta de vendedor sem vínculo comercial.', 403);

    const body = await readBody(request);
    const playlistId = requiredUuid(body.playlistId);

    const { data: permission, error: permissionError } = await supabase
      .from('panel_seller_playlists')
      .select('playlist_id')
      .eq('seller_id', principal.sellerId)
      .eq('playlist_id', playlistId)
      .eq('active', true)
      .maybeSingle();
    if (permissionError) throw new Error('Não foi possível validar a lista do vendedor.');
    if (!permission) throw new PanelAuthError('Esta lista não pertence ao vendedor.', 403);

    const { data: playlist, error: playlistError } = await supabase
      .from('panel_playlists')
      .select('id, active, playlist_cache_updated_at, playlist_cache_status')
      .eq('id', playlistId)
      .maybeSingle();
    if (playlistError || !playlist) throw new Error('Lista não encontrada.');
    if (playlist.active === false) return json({ error: 'Esta lista está inativa.' }, 409);

    const task = triggerCache(playlistId).catch(error => {
      console.error('seller-playlist-refresh falhou em segundo plano', {
        message: error instanceof Error ? error.message.slice(0, 240) : 'Falha desconhecida',
      });
    });
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(task);
    } else {
      await task;
    }

    return json({
      ok: true,
      playlistId,
      previousCacheUpdatedAt: playlist.playlist_cache_updated_at || null,
      message: 'Atualização do catálogo iniciada. O cache atual continuará disponível até a nova versão ficar pronta.',
    }, 202);
  } catch (error) {
    if (error instanceof PanelAuthError) return panelAuthErrorResponse(error, CORS);
    const message = error instanceof Error ? error.message : 'Não foi possível atualizar o catálogo.';
    console.error('seller-playlist-refresh error', { message: message.slice(0, 240) });
    return json({ error: message || 'Não foi possível atualizar o catálogo.' }, 400);
  }
});
