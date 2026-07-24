import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PanelAuthError, requirePanelPrincipal } from '../_shared/panelAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-device-credential',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_BODY_BYTES = 16 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type JsonBody = Record<string, unknown>;

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

function text(value: unknown) {
  return String(value ?? '').trim();
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function readBody(request: Request): Promise<JsonBody> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('Requisição muito grande.');

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error('Requisição muito grande.');
  if (!raw) return {};

  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonBody;
}

async function authorizeDevice(request: Request, body: JsonBody, supabase: any) {
  const deviceCode = text(body.deviceCode);
  const deviceUuid = text(body.deviceUuid);
  const credential = text(request.headers.get('x-device-credential'));

  if (!deviceCode || !deviceUuid || !credential) return false;
  if (deviceCode.length > 80 || deviceUuid.length > 160 || credential.length > 256) return false;

  const credentialHash = await sha256Hex(credential);
  const { data, error } = await supabase
    .from('panel_devices')
    .select('id, status, subscription_expires_at, device_uuid, device_credential_hash')
    .eq('device_code', deviceCode)
    .maybeSingle();

  if (error || !data) return false;
  if (data.status !== 'active') return false;
  if (!data.device_uuid || data.device_uuid !== deviceUuid) return false;
  if (!data.device_credential_hash || data.device_credential_hash !== credentialHash) return false;

  const expiresAt = data.subscription_expires_at
    ? new Date(String(data.subscription_expires_at)).getTime()
    : 0;
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function authorize(request: Request, body: JsonBody, supabase: any) {
  const authorization = text(request.headers.get('authorization'));
  if (authorization) {
    try {
      const principal = await requirePanelPrincipal(
        request,
        supabase,
        ['owner', 'admin', 'seller'],
      );
      return { kind: 'panel', principal };
    } catch (error) {
      if (!(error instanceof PanelAuthError)) throw error;
    }
  }

  if (await authorizeDevice(request, body, supabase)) {
    return { kind: 'device', principal: null };
  }

  return null;
}

async function latestRelease(supabase: any) {
  const { data, error } = await supabase
    .from('app_releases')
    .select(
      'version_code, version_name, storage_path, sha256, signer_sha256, file_size_bytes, notes, mandatory, published_at',
    )
    .eq('published', true)
    .order('version_code', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao consultar versão publicada: ${error.message}`);
  return data;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !secretKey) throw new Error('Serviço de atualização não configurado.');

    const supabase = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await readBody(request);
    const authorization = await authorize(request, body, supabase);
    if (!authorization) return json({ error: 'Acesso à atualização não autorizado.' }, 403);

    const release = await latestRelease(supabase);
    if (!release) return json({ error: 'Nenhuma versão foi publicada.' }, 404);
    if (!SHA256_PATTERN.test(String(release.sha256 || ''))) {
      throw new Error('Metadados da versão publicada são inválidos.');
    }

    const action = text(body.action) || 'manifest';
    const manifest = {
      schemaVersion: 2,
      versionCode: Number(release.version_code),
      versionName: String(release.version_name),
      sha256: String(release.sha256),
      signerSha256: String(release.signer_sha256),
      fileSizeBytes: Number(release.file_size_bytes),
      mandatory: release.mandatory === true,
      notes: String(release.notes || ''),
      publishedAt: String(release.published_at),
    };

    if (action === 'manifest') return json(manifest);
    if (action !== 'download') return json({ error: 'Ação inválida.' }, 400);

    const { data, error } = await supabase.storage
      .from('app-releases')
      .createSignedUrl(String(release.storage_path), SIGNED_URL_TTL_SECONDS, {
        download: `ronecaPlayerTV-v${release.version_name}.apk`,
      });

    if (error || !data?.signedUrl) {
      throw new Error(`Falha ao autorizar download: ${error?.message || 'URL ausente'}`);
    }

    return json({
      ...manifest,
      apkUrl: data.signedUrl,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error('Falha no serviço de atualização.', error);
    return json({ error: 'Não foi possível consultar a atualização.' }, 500);
  }
});
