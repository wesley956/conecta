import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'false',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ ok: false, code: 'WEB_PANEL_METHOD_NOT_ALLOWED' }, 405);

  const authorization = request.headers.get('authorization') || '';
  if (!authorization) return json({ ok: false, code: 'WEB_PANEL_AUTH_REQUIRED' }, 401);

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const anonKey = request.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !anonKey) return json({ ok: false, code: 'WEB_PANEL_NOT_CONFIGURED' }, 503);

  try {
    const upstream = await fetch(`${supabaseUrl}/functions/v1/web-access-panel-core`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
        apikey: anonKey,
        'x-client-info': request.headers.get('x-client-info') || 'roneca-web-access-panel',
      },
      body: await request.text(),
    });

    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    return new Response(await upstream.text(), { status: upstream.status, headers });
  } catch (error) {
    console.error('web-access-panel proxy error', { code: error instanceof Error ? error.message : 'UNKNOWN' });
    return json({ ok: false, code: 'WEB_PANEL_UNAVAILABLE' }, 503);
  }
});
