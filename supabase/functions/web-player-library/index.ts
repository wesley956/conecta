import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
  readWebJson,
  requireWebSession,
  text,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
import { enforceWebRateLimit } from '../_shared/webRateLimit.ts';
import {
  librarySnapshot,
  resetProgress,
  setFavorite,
  setPreferences,
  setProgress,
  validContentKey,
  validContentType,
} from '../_shared/librarySync.ts';

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request);
    const supabase = serviceClient();
    const session = await requireWebSession(request, supabase);
    await enforceWebRateLimit(supabase, 'catalog', `library:${session.id}`);
    const action = text(body.action, 32) || 'get';

    if (action === 'get') {
      return webJson(request, { ok: true, ...(await librarySnapshot(supabase, session.libraryScopeKey)) });
    }

    const contentKey = action === 'preferences' ? null : validContentKey(body.contentKey);
    const contentType = action === 'preferences' ? null : validContentType(body.contentType);
    if (action !== 'preferences' && (!contentKey || !contentType)) {
      return webJson(request, { ok: false, code: 'LIBRARY_CONTENT_INVALID' }, 400);
    }

    if (action === 'favorite') {
      const active = body.active === true;
      return webJson(request, { ok: true, favorite: await setFavorite(supabase, session.libraryScopeKey, contentKey!, contentType!, active) });
    }
    if (action === 'progress') {
      const positionMs = Number(body.positionMs);
      const durationMs = Number(body.durationMs);
      return webJson(request, { ok: true, progress: await setProgress(supabase, session.libraryScopeKey, contentKey!, contentType!, positionMs, durationMs) });
    }
    if (action === 'reset-progress') {
      return webJson(request, { ok: true, progress: await resetProgress(supabase, session.libraryScopeKey, contentKey!) });
    }
    if (action === 'preferences') {
      return webJson(request, {
        ok: true,
        preferences: await setPreferences(supabase, session.libraryScopeKey, {
          aspectMode: body.aspectMode,
          language: body.language,
          subtitleLanguage: body.subtitleLanguage,
        }),
      });
    }
    return webJson(request, { ok: false, code: 'WEB_ACTION_INVALID' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'LIBRARY_SYNC_UNAVAILABLE';
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    if (code === 'WEB_RATE_LIMITED') return webJson(request, { ok: false, code }, 429);
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) {
      return webJson(request, { ok: false, code }, 401);
    }
    if (code.startsWith('LIBRARY_')) return webJson(request, { ok: false, code }, 400);
    console.error('web-player-library error', { code });
    return webJson(request, { ok: false, code: 'LIBRARY_SYNC_UNAVAILABLE' }, 503);
  }
});
