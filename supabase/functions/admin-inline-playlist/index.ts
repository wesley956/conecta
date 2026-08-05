import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  PanelAuthError,
  panelAuthErrorResponse,
  requirePanelPrincipal,
} from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_BODY_BYTES = 64 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
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
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function compatibilityProxy(
  request: Request,
  payload: Record<string, unknown>,
) {
  const authorization = String(request.headers.get('authorization') || '').trim();
  const apiKey = String(
    request.headers.get('apikey')
      || Deno.env.get('SUPABASE_ANON_KEY')
      || '',
  ).trim();
  if (!authorization || !apiKey) throw new PanelAuthError('Sessão do painel não informada.', 401);

  const response = await fetch(`${getEnv('SUPABASE_URL')}/functions/v1/playlist-registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authorization,
      apikey: apiKey,
    },
    body: JSON.stringify({
      action: 'create',
      requestId: `legacy-inline:${crypto.randomUUID()}`,
      name: payload.name,
      playlistUrl: payload.playlistUrl,
      playlistType: payload.playlistType,
      maxConnections: payload.maxConnections || 1,
      sellerId: payload.sellerId || null,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      error: result.error || result.message || `Falha HTTP ${response.status}.`,
    }, response.status);
  }

  const playlist = result.playlist || {};
  const readyCache = playlist.qualificationStatus === 'ready_cache';
  return json({
    ...result,
    ok: true,
    saved: true,
    playlistId: result.playlistId,
    playlistName: playlist.name || String(payload.name || 'Lista'),
    sellerId: payload.sellerId || null,
    cache: {
      ok: readyCache,
      processing: result.commerciallyUsable !== true,
      accessMode: playlist.accessMode || null,
    },
    message: result.message || 'Lista salva. Acompanhe a homologação antes de ativar.',
  }, response.status);
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await requirePanelPrincipal(request, supabase, ['owner', 'admin']);
    const body = await readBody(request);
    return await compatibilityProxy(request, body);
  } catch (error) {
    if (error instanceof PanelAuthError) {
      return panelAuthErrorResponse(error, corsHeaders);
    }
    return json({
      error: error instanceof Error
        ? error.message
        : 'Falha inesperada ao encaminhar o cadastro da lista.',
    }, 400);
  }
});
