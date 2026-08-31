import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

declare const EdgeRuntime: undefined | { waitUntil(promise: Promise<unknown>): void };

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ATTEMPT_COOLDOWN_MS = 60 * 60 * 1000;
const BATCH_SIZE = 4;
const CANDIDATE_LIMIT = 80;
const MAX_TOKEN_LENGTH = 512;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
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
  return { ok: response.ok || response.status === 409, busy: response.status === 409 };
}

async function runRefreshBatch(supabase: any, playlistIds: string[]) {
  const outcomes = await Promise.allSettled(playlistIds.map(id => triggerCache(id)));
  const failed = outcomes.filter(item => item.status === 'rejected').length;
  const busy = outcomes.filter(item => item.status === 'fulfilled' && item.value.busy).length;
  if (failed > 0) {
    console.error('playlist-cache-auto: algumas atualizações falharam', {
      scheduled: playlistIds.length,
      failed,
      busy,
    });
  }

  // Mantém uma leitura leve no fim para que erros de conexão com o banco também
  // apareçam nos logs da execução automática, sem expor IDs ou dados das listas.
  await supabase.from('panel_playlists').select('id', { head: true, count: 'exact' }).limit(1);
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const token = String(request.headers.get('x-scheduler-token') || '').trim();
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      return json({ ok: false, code: 'SCHEDULER_UNAUTHORIZED' }, 401);
    }

    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authorized, error: authError } = await supabase.rpc(
      'verify_playlist_cache_scheduler_token',
      { p_token: token },
    );
    if (authError || authorized !== true) {
      return json({ ok: false, code: 'SCHEDULER_UNAUTHORIZED' }, 403);
    }

    const staleBefore = new Date(Date.now() - REFRESH_INTERVAL_MS).toISOString();
    const cooldownBefore = new Date(Date.now() - ATTEMPT_COOLDOWN_MS).toISOString();

    const { data: candidates, error: candidateError } = await supabase
      .from('panel_playlists')
      .select('id, playlist_cache_updated_at')
      .eq('active', true)
      .eq('playlist_cache_status', 'ready')
      .gt('playlist_cache_item_count', 0)
      .lte('playlist_cache_updated_at', staleBefore)
      .order('playlist_cache_updated_at', { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (candidateError) throw new Error('Não foi possível localizar caches vencidos.');

    const ids = (candidates || []).map((row: any) => String(row.id)).filter(Boolean);
    if (!ids.length) {
      return json({
        ok: true,
        refreshIntervalHours: 6,
        scheduled: 0,
        message: 'Nenhum cache precisa de atualização agora.',
      });
    }

    const { data: recentAttempts, error: attemptsError } = await supabase
      .from('playlist_cache_generation_attempts')
      .select('playlist_id, started_at')
      .in('playlist_id', ids)
      .gte('started_at', cooldownBefore);
    if (attemptsError) throw new Error('Não foi possível verificar tentativas recentes de cache.');

    const coolingDown = new Set((recentAttempts || []).map((row: any) => String(row.playlist_id)));
    const selected = ids.filter(id => !coolingDown.has(id)).slice(0, BATCH_SIZE);

    if (!selected.length) {
      return json({
        ok: true,
        refreshIntervalHours: 6,
        scheduled: 0,
        message: 'Os caches vencidos já tiveram uma tentativa recente e estão em período de proteção.',
      });
    }

    const task = runRefreshBatch(supabase, selected).catch(error => {
      console.error('playlist-cache-auto background error', {
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
      refreshIntervalHours: 6,
      scheduled: selected.length,
      message: 'Atualização automática dos caches vencidos iniciada.',
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na atualização automática.';
    console.error('playlist-cache-auto error', { message: message.slice(0, 240) });
    return json({ ok: false, code: 'AUTO_REFRESH_UNAVAILABLE', message }, 503);
  }
});
