import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { DEMO_PLAYLIST_NAME } from './catalog.ts';
import { ensureInfrastructure, type ReviewAccount } from './infrastructure.ts';

const REVIEW_PROVIDER = 'lg';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonBody = Record<string, unknown>;
type ReviewDeviceSummary = {
  id: string;
  deviceCode: string | null;
  status: string;
  platform: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
  activatedAt: string;
  revokedAt: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
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

async function readBody(request: Request): Promise<JsonBody> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 32 * 1024) throw new Error('Payload muito grande.');
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object' ? payload as JsonBody : {};
  } catch {
    return {};
  }
}

function text(value: unknown, limit = 300) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, limit) : '';
}

function normalizeDeviceCode(value: unknown) {
  return text(value, 80).toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function bearerToken(request: Request) {
  const authorization = text(request.headers.get('authorization'), 16 * 1024);
  return authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1] || '';
}

function isAllowedWebOsDevice(value: unknown) {
  return ['webos', 'lg', 'lg-webos', 'webos-tv'].includes(text(value, 50).toLowerCase());
}

async function requireReviewAccount(request: Request, supabase: any) {
  const token = bearerToken(request);
  if (!token) return { error: json({ error: 'Session not provided.' }, 401), account: null };

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) return { error: json({ error: 'Invalid or expired session.' }, 401), account: null };

  const { data: account, error: accountError } = await supabase
    .from('panel_review_accounts')
    .select('id, auth_user_id, name, active, expires_at, max_devices, seller_id, customer_id, plan_id, playlist_id')
    .eq('auth_user_id', user.id)
    .eq('provider', REVIEW_PROVIDER)
    .maybeSingle();

  if (accountError) return { error: json({ error: 'Could not validate the review account.' }, 500), account: null };
  if (!account || account.active !== true) return { error: json({ error: 'Review account is not active.' }, 403), account: null };
  if (new Date(account.expires_at).getTime() <= Date.now()) return { error: json({ error: 'Review account has expired.' }, 403), account: null };

  await supabase.from('panel_review_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', account.id);
  return { error: null, account: account as ReviewAccount };
}

async function listDevices(supabase: any, accountId: string): Promise<ReviewDeviceSummary[]> {
  const { data, error } = await supabase.from('panel_review_devices').select(`
    id, activated_at, revoked_at,
    device:panel_devices(id, device_code, status, device_type, app_version, last_seen_at, subscription_expires_at)
  `).eq('review_account_id', accountId).order('activated_at', { ascending: false });
  if (error) throw new Error(`Could not load review devices: ${error.message}`);

  return (data || []).map((entry: any): ReviewDeviceSummary => {
    const device = Array.isArray(entry.device) ? entry.device[0] : entry.device;
    return {
      id: String(entry.id),
      deviceCode: device?.device_code || null,
      status: device?.status || 'unknown',
      platform: device?.device_type || null,
      appVersion: device?.app_version || null,
      lastSeenAt: device?.last_seen_at || null,
      expiresAt: device?.subscription_expires_at || null,
      activatedAt: String(entry.activated_at),
      revokedAt: entry.revoked_at || null,
    };
  });
}

async function audit(
  supabase: any,
  action: string,
  deviceId: string,
  description: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.from('panel_audit_logs').insert({
    action,
    entity_type: 'device',
    entity_id: deviceId,
    description,
    metadata,
  });
  if (error) console.error('LG review audit failed.', { code: error.code || null });
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    const auth = await requireReviewAccount(request, supabase);
    if (auth.error || !auth.account) return auth.error;

    const body = await readBody(request);
    const action = text(body.action || 'status', 60);
    const account = await ensureInfrastructure(supabase, auth.account);

    if (action === 'status' || action === 'list') {
      const devices = await listDevices(supabase, account.id);
      return json({
        ok: true,
        account: {
          name: account.name,
          provider: REVIEW_PROVIDER,
          expiresAt: account.expires_at,
          maxDevices: account.max_devices,
          activeDevices: devices.filter(device => !device.revokedAt).length,
        },
        catalog: {
          name: DEMO_PLAYLIST_NAME,
          channels: 1,
          movies: 2,
          series: 1,
          licensing: 'Apple HLS developer test stream and Blender Foundation open movies with attribution.',
        },
        devices,
      });
    }

    if (action === 'lookup' || action === 'activate') {
      const deviceCode = normalizeDeviceCode(body.deviceCode);
      if (!deviceCode) return json({ error: 'Enter the activation code shown on the TV.' }, 400);

      const { data: device, error: deviceError } = await supabase.from('panel_devices')
        .select('id, device_code, status, device_type, app_version, seller_id, last_seen_at')
        .eq('device_code', deviceCode).maybeSingle();
      if (deviceError) return json({ error: 'Could not look up the device.' }, 500);
      if (!device) return json({ error: 'Device code not found. Keep the app open on the activation screen and try again.' }, 404);
      if (!isAllowedWebOsDevice(device.device_type)) return json({ error: 'This review account can activate LG webOS devices only.' }, 400);
      if (device.seller_id && device.seller_id !== account.seller_id) return json({ error: 'This device is already linked to another account.' }, 409);
      if (device.status === 'blocked') return json({ error: 'This television is blocked and cannot be activated for review.' }, 409);

      if (action === 'lookup') {
        return json({ ok: true, device: {
          deviceCode: device.device_code,
          status: device.status,
          platform: device.device_type,
          appVersion: device.app_version || null,
          lastSeenAt: device.last_seen_at || null,
          canActivate: !device.seller_id || device.seller_id === account.seller_id,
        }});
      }

      const { count, error: countError } = await supabase.from('panel_review_devices')
        .select('id', { count: 'exact', head: true })
        .eq('review_account_id', account.id).is('revoked_at', null).neq('device_id', device.id);
      if (countError) return json({ error: 'Could not validate the activation limit.' }, 500);
      if (Number(count || 0) >= Number(account.max_devices || 5)) return json({ error: 'The review-device limit has been reached.' }, 409);

      const now = new Date().toISOString();
      const expiresAt = account.expires_at;
      const { error: updateError } = await supabase.from('panel_devices').update({
        status: 'active',
        seller_id: account.seller_id,
        customer_id: account.customer_id,
        plan_id: account.plan_id,
        playlist_id: account.playlist_id,
        client_name: 'LG Quality Assurance',
        subscription_expires_at: expiresAt,
        updated_at: now,
      }).eq('id', device.id);
      if (updateError) return json({ error: `Could not activate the device: ${updateError.message}` }, 500);

      const { error: clearAssignmentsError } = await supabase.from('panel_device_playlists').delete().eq('device_id', device.id);
      if (clearAssignmentsError) return json({ error: `Could not prepare the review catalog: ${clearAssignmentsError.message}` }, 500);

      const { error: assignmentError } = await supabase.from('panel_device_playlists').insert({
        device_id: device.id,
        playlist_id: account.playlist_id,
        priority: 1,
        active: true,
        consecutive_failures: 0,
        cooldown_until: null,
        last_error: null,
        updated_at: now,
      });
      if (assignmentError) return json({ error: `Could not assign the review catalog: ${assignmentError.message}` }, 500);

      const { error: linkError } = await supabase.from('panel_review_devices').upsert({
        review_account_id: account.id,
        device_id: device.id,
        activated_at: now,
        revoked_at: null,
        updated_at: now,
      }, { onConflict: 'device_id' });
      if (linkError) return json({ error: `Could not register the review device: ${linkError.message}` }, 500);

      await audit(supabase, 'lg_review.device_activated', device.id,
        `LG review device ${device.device_code} activated`, {
          reviewAccountId: account.id,
          provider: REVIEW_PROVIDER,
          deviceCode: device.device_code,
          expiresAt,
        });

      return json({
        ok: true,
        message: 'Device activated. Return to the TV; the catalog will load automatically.',
        device: {
          deviceCode: device.device_code,
          status: 'active',
          platform: device.device_type,
          appVersion: device.app_version || null,
          expiresAt,
        },
      });
    }

    if (action === 'deactivate') {
      const deviceCode = normalizeDeviceCode(body.deviceCode);
      if (!deviceCode) return json({ error: 'Device code is required.' }, 400);

      const { data: device, error: deviceError } = await supabase.from('panel_devices')
        .select('id, device_code, seller_id').eq('device_code', deviceCode).maybeSingle();
      if (deviceError || !device) return json({ error: 'Review device not found.' }, 404);

      const { data: reviewLink, error: linkLookupError } = await supabase.from('panel_review_devices')
        .select('id').eq('review_account_id', account.id).eq('device_id', device.id).is('revoked_at', null).maybeSingle();
      if (linkLookupError) return json({ error: 'Could not validate the review device.' }, 500);
      if (!reviewLink || device.seller_id !== account.seller_id) return json({ error: 'This device does not belong to the review account.' }, 403);

      const now = new Date().toISOString();
      await supabase.from('panel_device_playlists').delete().eq('device_id', device.id);
      const { error: resetError } = await supabase.from('panel_devices').update({
        status: 'pending',
        seller_id: null,
        customer_id: null,
        plan_id: null,
        playlist_id: null,
        client_name: null,
        subscription_expires_at: null,
        updated_at: now,
      }).eq('id', device.id);
      if (resetError) return json({ error: `Could not deactivate the device: ${resetError.message}` }, 500);

      await supabase.from('panel_review_devices').update({ revoked_at: now, updated_at: now }).eq('id', reviewLink.id);
      await audit(supabase, 'lg_review.device_deactivated', device.id,
        `LG review device ${device.device_code} deactivated`, {
          reviewAccountId: account.id,
          provider: REVIEW_PROVIDER,
          deviceCode: device.device_code,
        });

      return json({ ok: true, message: 'Device deactivated and ready for a new activation test.' });
    }

    return json({ error: 'Invalid action.' }, 400);
  } catch (error) {
    console.error('lg-review-panel:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected review-panel error.' }, 500);
  }
});
