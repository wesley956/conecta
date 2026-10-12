import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  assertWebOrigin,
  openWebPayload,
  readWebJson,
  requireWebSession,
  sealWebPayload,
  text,
  webCorsHeaders,
  webJson,
} from '../_shared/webPlayerSecurity.ts';
import { enforceWebRateLimit } from '../_shared/webRateLimit.ts';
import {
  devicePlaylistAssignments,
  downloadCachePart,
  parseContentToken,
  resolveContentFromCache,
  resolveLogicalContent,
  type PlaylistAssignment,
  type WebContentToken,
  type WebContentType,
} from '../_shared/webPlayerCatalog.ts';
import { classifyRecoveryError, sanitizedRecoveryCode } from '../_shared/webPlayerRecovery.ts';

const PLAYBACK_TOKEN_TTL_MS = 10 * 60 * 1000;
// TTL do token que aponta para o arquivo real quando ele é empacotado como manifesto HLS
// sintético (ver `wrapAsHls` em `authorize`). Precisa cobrir o download completo de um
// filme/episódio longo pelo hls.js, não só os 10 min do token do manifesto — por isso é bem
// maior que PLAYBACK_TOKEN_TTL_MS. Também usado (ver `mediaTokenTtlMs` em `authorize`) como
// validade do `mediaToken` de conteúdo NÃO empacotado (`file`), pelo mesmo motivo: é o único
// token que o <video> nativo usa durante toda a reprodução.
const WRAP_SEGMENT_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
// Precisa superar com folga o maior TTL de mídia em uso (`WRAP_SEGMENT_TOKEN_TTL_MS`, 4h) —
// o `recoveryToken` emitido junto com um `mediaToken` de 4h (conteúdo `file`) só é usado pela
// renovação proativa do cliente perto do fim dessas 4h (ver `WebPlayerCore.tsx`, ~90s antes de
// expirar); se `RECOVERY_TOKEN_TTL_MS` fosse mais curto que isso (era 60 min, incidente
// 2026-10-11), essa renovação chegaria com o `recoveryToken` já expirado há horas e o servidor
// recusaria com `WEB_RECOVERY_TOKEN_INVALID` — o cliente trata esse 401 como sessão inválida e
// desloga o Acesso Web no meio de um filme, bem pior do que o recarregamento que motivou dar
// 4h ao `mediaToken` de conteúdo `file` em primeiro lugar.
const RECOVERY_TOKEN_TTL_MS = WRAP_SEGMENT_TOKEN_TTL_MS + 30 * 60 * 1000;
const HOMOLOG_ORIGIN = 'https://raw.githack.com';
// Ver nota em _shared/webPlayerSecurity.ts (incidente 2026-10-08): rede de segurança
// independente do secret WEB_PLAYER_ORIGINS para o domínio de produção real.
const PRODUCTION_ORIGIN = 'https://ronecaplaytv.pp.ua';

type RecoveryToken = {
  v: number;
  kind: 'recovery';
  sessionId: string;
  deviceId: string;
  type: WebContentType;
  contentKey: string;
  playlistId: string;
  playlistPriority: number;
  sourceId: string;
  seriesSourceId?: string;
  seriesName?: string;
  urlIndex: number;
  sameOriginAttempts: number;
  exp: number;
};
type Resolved = { assignment: PlaylistAssignment; item: Record<string, unknown> };

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('WEB_SERVER_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function candidateUrls(item: Record<string, unknown>) {
  const candidates = [...(Array.isArray(item.playbackUrls) ? item.playbackUrls : []), item.url];
  const seen = new Set<string>();
  return candidates.flatMap(value => {
    const raw = String(value || '').trim();
    if (!raw || seen.has(raw)) return [];
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
      seen.add(raw); return [url.toString()];
    } catch { return []; }
  }).slice(0, 8);
}

function browserCompatibleUrl(urlString: string, contentType: WebContentType) {
  if (contentType !== 'channel') return urlString;
  try {
    const url = new URL(urlString);
    if (/\.ts$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\.ts$/i, '.m3u8');
      return url.toString();
    }
  } catch { /* mantém URL original */ }
  return urlString;
}

function mediaKind(urlString: string, contentType: WebContentType): 'hls' | 'file' | 'unknown' {
  try {
    const pathname = new URL(urlString).pathname.toLowerCase();
    if (pathname.endsWith('.m3u8')) return 'hls';
    if (contentType === 'channel' && pathname.endsWith('.ts')) return 'hls';
    if (/\.(mp4|m4v|webm|mov|mkv|ts)$/i.test(pathname)) return 'file';
  } catch { /* unknown */ }
  return 'unknown';
}

const SNIFF_TIMEOUT_MS = 6_000;
const SNIFF_MAX_BYTES = 4_096;

// `mediaKind()` acima só olha a EXTENSÃO da URL — mas vários fornecedores Xtream entregam
// MPEG-TS cru numa URL de aparência `.mp4` (causa original dos WEB_MEDIA_CODEC_ERROR, ver
// `wrapAsHls` abaixo), enquanto OUTROS fornecedores entregam um MP4/WebM genuíno na mesma
// forma de URL. Empacotar OS DOIS casos no manifesto HLS sintético (como fazíamos antes desta
// função existir) quebra o caso genuíno: o demuxer do hls.js é feito para MPEG-TS ou para
// segmentos fMP4/CMAF fragmentados, não para um MP4 clássico (moov/mdat) de arquivo único —
// resultado era `WEB_HLS_DECODER_ERROR` fatal depois de esgotar `recoverMediaError()`
// (incidente 2026-10-11, filmes/séries reproduzindo "Origens esgotadas" mesmo após os fixes
// de range/progressive/wrapped). Por isso cheiramos os primeiros bytes reais do arquivo
// (assinatura binária, não a URL) para decidir: só empacotamos quando os bytes confirmam TS
// cru (ou quando a sondagem falha/é inconclusiva — mantemos o fallback seguro de empacotar,
// que é o comportamento documentado e testado até aqui); quando os bytes confirmam um
// container MP4/WebM de verdade, servimos como `file` igual ao fluxo anterior ao wrap (que já
// funcionava bem para esses casos via `<video>` nativo + Range).
async function sniffContainerKind(url: string): Promise<'ts' | 'mp4' | 'webm' | 'unknown'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SNIFF_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${SNIFF_MAX_BYTES - 1}` },
      signal: controller.signal,
    });
    if (!response.body) return 'unknown';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (total < SNIFF_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
    } finally {
      try { await reader.cancel(); } catch { /* ignora */ }
    }
    if (total < 4) return 'unknown';
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    // MPEG-TS: byte de sincronismo 0x47 a cada 188 bytes.
    if (total >= 377 && buffer[0] === 0x47 && buffer[188] === 0x47 && buffer[376] === 0x47) return 'ts';
    // ISO BMFF (mp4/m4v/mov, fragmentado ou não): caixa `ftyp` no offset 4.
    if (total >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return 'mp4';
    // EBML (mkv/webm): assinatura 0x1A45DFA3.
    if (total >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

function directSafe(urlString: string) {
  if (!/^(1|true|yes)$/i.test(String(Deno.env.get('WEB_ALLOW_DIRECT_SAFE') || ''))) return false;
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if ([...url.searchParams.keys()].some(key => /user|pass|token|auth|key|credential/i.test(key))) return false;
    if (/\/(live|movie|series)\/[^/]+\/[^/]+\//i.test(url.pathname)) return false;
    return true;
  } catch { return false; }
}

function gatewayOriginAllowed(request: Request) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return false;
  const configured = String(Deno.env.get('WEB_PLAYER_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (configured.includes(origin) || origin === HOMOLOG_ORIGIN || origin === PRODUCTION_ORIGIN) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

async function resolveEpisodeFromSeriesCache(
  supabase: ReturnType<typeof serviceClient>,
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: WebContentToken,
) {
  const assignments = await devicePlaylistAssignments(supabase, session);
  const assignment = assignments.find(item => item.playlistId === token.playlistId);
  if (!assignment || !token.seriesSourceId) throw new Error('WEB_EPISODE_NOT_FOUND');
  const seriesItems = await downloadCachePart(supabase, assignment.seriesPath, 'series');
  const series = seriesItems.find(item => String(item.id || '') === token.seriesSourceId);
  if (!series) throw new Error('WEB_EPISODE_NOT_FOUND');
  if (Array.isArray(series.seasons)) {
    for (const seasonValue of series.seasons) {
      if (!seasonValue || typeof seasonValue !== 'object' || !Array.isArray((seasonValue as any).episodes)) continue;
      const episode = (seasonValue as any).episodes.find((item: any) => String(item?.id || '') === token.sourceId);
      if (episode) return { assignment, item: episode as Record<string, unknown> };
    }
  }
  const xtreamSeriesId = String(series.xtreamSeriesId || series.xtream_series_id || '').trim();
  if (/^\d{1,20}$/.test(xtreamSeriesId)) {
    const detail = await supabase.storage.from('playlist-cache').download(`${token.playlistId}/series-details/${xtreamSeriesId}.json`);
    if (!detail.error && detail.data) {
      const cached = JSON.parse(await detail.data.text());
      if (Array.isArray(cached?.seasons)) {
        for (const season of cached.seasons) {
          if (!Array.isArray(season?.episodes)) continue;
          const episode = season.episodes.find((item: any) => String(item?.id || '') === token.sourceId);
          if (episode) return { assignment, item: episode as Record<string, unknown> };
        }
      }
    }
  }
  throw new Error('WEB_EPISODE_NOT_FOUND');
}

async function resolveInitial(
  supabase: ReturnType<typeof serviceClient>,
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: WebContentToken,
): Promise<Resolved> {
  if (token.type === 'episode') {
    try { return await resolveContentFromCache(supabase, session, token) as Resolved; }
    catch { return await resolveEpisodeFromSeriesCache(supabase, session, token) as Resolved; }
  }
  return await resolveContentFromCache(supabase, session, token) as Resolved;
}

async function recoveryToken(
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: Pick<WebContentToken, 'type'|'contentKey'|'sourceId'|'seriesSourceId'|'seriesName'>,
  assignment: PlaylistAssignment,
  urlIndex: number,
  sameOriginAttempts: number,
) {
  return await sealWebPayload({
    v: 1, kind: 'recovery', sessionId: session.id, deviceId: session.deviceId, type: token.type,
    contentKey: token.contentKey, playlistId: assignment.playlistId, playlistPriority: assignment.priority,
    sourceId: token.sourceId,
    ...(token.seriesSourceId ? { seriesSourceId: token.seriesSourceId } : {}),
    ...(token.seriesName ? { seriesName: token.seriesName } : {}),
    urlIndex, sameOriginAttempts, exp: Date.now() + RECOVERY_TOKEN_TTL_MS,
  });
}

async function authorize(
  request: Request,
  session: Awaited<ReturnType<typeof requireWebSession>>,
  token: Pick<WebContentToken, 'type'|'contentKey'|'sourceId'|'seriesSourceId'|'seriesName'>,
  resolved: Resolved,
  urlIndex: number,
  sameOriginAttempts: number,
  recovery?: { classification: string; backoffMs: number; failover: boolean },
) {
  const urls = candidateUrls(resolved.item);
  const rawSelected = urls[urlIndex];
  if (!rawSelected) throw new Error('WEB_CONTENT_UNAVAILABLE');
  const selected = browserCompatibleUrl(rawSelected, token.type);
  const rawKind = mediaKind(selected, token.type);
  const nextRecoveryToken = await recoveryToken(session, token, resolved.assignment, urlIndex, sameOriginAttempts);
  const expiresAtMs = Date.now() + PLAYBACK_TOKEN_TTL_MS;

  if (directSafe(selected)) return webJson(request, {
    ok: true, mode: 'direct-safe', playbackUrl: selected, mediaKind: rawKind, wrapped: false, contentType: token.type,
    contentKey: token.contentKey, playlistRole: resolved.assignment.role,
    alternativesAvailable: Math.max(0, urls.length - urlIndex - 1), recoveryToken: nextRecoveryToken,
    expiresAt: new Date(expiresAtMs).toISOString(), ...(recovery ? { recovery } : {}),
  });

  const gatewayEnabled =
    /^(1|true|yes)$/i.test(String(Deno.env.get('WEB_MEDIA_GATEWAY_ENABLED') || '')) ||
    gatewayOriginAllowed(request);
  if (!gatewayEnabled) return webJson(request, {
    ok: false, code: 'WEB_MEDIA_GATEWAY_REQUIRED', message: 'Esta mídia precisa do gateway Web, ainda não habilitado neste ambiente.',
  }, 409);

  // O <video> nativo do Chrome não decodifica MPEG-TS cru, comum em respostas de
  // fornecedores Xtream mesmo quando a URL/Content-Type sugere .mp4 (causa confirmada dos
  // WEB_MEDIA_CODEC_ERROR). Para esse caso entregamos um manifesto HLS sintético de um
  // segmento só: o hls.js baixa e demuxa o conteúdo verdadeiro a partir dos bytes recebidos.
  // Mas ESSE empacotamento só serve para TS cru — um MP4/WebM genuíno (muito comum em outros
  // fornecedores) quebra dentro do demuxer do hls.js (ver `sniffContainerKind` acima,
  // incidente 2026-10-11, `WEB_HLS_DECODER_ERROR`). Por isso só decidimos pelo wrap depois de
  // olhar os bytes reais do arquivo, não só a extensão da URL.
  let wrapAsHls = rawKind !== 'hls';
  let effectiveKind: 'hls' | 'file' | 'unknown' = rawKind;
  if (wrapAsHls) {
    const sniffed = await sniffContainerKind(selected);
    if (sniffed === 'mp4' || sniffed === 'webm') {
      wrapAsHls = false;
      effectiveKind = 'file';
    }
  }
  const kind: 'hls' | 'file' | 'unknown' = wrapAsHls ? 'hls' : effectiveKind;

  const segmentToken = wrapAsHls ? await sealWebPayload({
    v: 1, kind: 'media', sessionId: session.id, deviceId: session.deviceId, contentType: token.type,
    contentKey: token.contentKey, playlistId: resolved.assignment.playlistId, playlistRole: resolved.assignment.role,
    url: selected, exp: Date.now() + WRAP_SEGMENT_TOKEN_TTL_MS,
  }) : null;

  // Quando o conteúdo é servido como `file` (não empacotado — HLS real de canal continua
  // curto, sem mudança), este é o ÚNICO token que o <video> nativo usa durante TODA a
  // reprodução — pode ser um filme de horas — porque o navegador reabre conexões/faz novas
  // requisições de range para esse mesmo URL ao longo do tempo (buffer, reconexão, seek). Os
  // 10 min de `PLAYBACK_TOKEN_TTL_MS` bastam para HLS (real ou empacotado: o download pesado
  // do empacotado usa o `segmentToken` de 4h acima; o HLS real de canal já se renova sozinho
  // via replay da playlist), mas para o arquivo direto eram curtos demais: a renovação
  // proativa do cliente (`WebPlayerCore.tsx`, ~90s antes de expirar) troca a `playbackUrl`, o
  // que força `video.src` a trocar e recarregar do zero — causa confirmada de "depois de
  // alguns minutos aparece carregando de novo" (incidente 2026-10-11, consequência direta de
  // ativar o caminho `file` na correção anterior). Por isso só o `file` recebe a mesma
  // validade longa do `segmentToken`.
  const mediaTokenTtlMs = kind === 'file' ? WRAP_SEGMENT_TOKEN_TTL_MS : PLAYBACK_TOKEN_TTL_MS;
  const mediaExpiresAtMs = Date.now() + mediaTokenTtlMs;

  const mediaToken = await sealWebPayload({
    v: 1, kind: 'media', sessionId: session.id, deviceId: session.deviceId, contentType: token.type,
    contentKey: token.contentKey, playlistId: resolved.assignment.playlistId, playlistRole: resolved.assignment.role,
    url: selected, exp: mediaExpiresAtMs,
    ...(wrapAsHls ? { wrap: true, segmentToken } : {}),
  });
  const functionsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  return webJson(request, {
    ok: true, mode: 'gateway', playbackUrl: `${functionsUrl}/web-player-media?token=${encodeURIComponent(mediaToken)}`,
    // `wrapped` diz ao cliente que isto é o manifesto HLS SINTÉTICO de um segmento só (ver
    // comentário acima sobre `wrapAsHls`), não um manifesto HLS real com múltiplos segmentos.
    // O player web usa isso para forçar o hls.js mesmo em navegadores com suporte nativo a
    // HLS (`video.canPlayType('application/vnd.apple.mpegurl')` truthy) — o player nativo do
    // navegador espera um manifesto HLS de verdade e não lida bem com nosso truque de um
    // único "segmento" cobrindo o arquivo inteiro (causa confirmada de filmes/episódios
    // travando em "Preparando…" indefinidamente até esgotar as origens, incidente
    // 2026-10-11: o navegador do usuário tinha suporte nativo a HLS e caía no
    // `attachNative()`, que não sabe demuxar/tocar esse manifesto sintético).
    mediaKind: kind, wrapped: wrapAsHls, contentType: token.type, contentKey: token.contentKey, playlistRole: resolved.assignment.role,
    alternativesAvailable: Math.max(0, urls.length - urlIndex - 1), recoveryToken: nextRecoveryToken,
    // Precisa bater com a validade real do `mediaToken` acima (`mediaExpiresAtMs`), não a
    // curta `expiresAtMs` de 10 min — é este valor que o cliente usa para agendar a renovação
    // proativa (`WebPlayerCore.tsx`, ~90s antes de expirar); se ficasse descasado, o player
    // renovaria achando o token curto (10 min) enquanto o token de verdade (longo, no caso
    // `file`) ainda era válido, recarregando o vídeo sem necessidade.
    expiresAt: new Date(mediaExpiresAtMs).toISOString(), ...(recovery ? { recovery } : {}),
  });
}

async function recover(request: Request, body: Record<string, unknown>) {
  const supabase = serviceClient();
  const session = await requireWebSession(request, supabase);
  await enforceWebRateLimit(supabase, 'playback', `session:${session.id}`);
  const opaque = text(body.recoveryToken, 4096);
  const errorCode = sanitizedRecoveryCode(body.errorCode);
  if (!opaque) return webJson(request, { ok: false, code: 'WEB_RECOVERY_TOKEN_REQUIRED' }, 400);
  const state = await openWebPayload<RecoveryToken & Record<string, unknown>>(opaque);
  if (
    state.v !== 1 || state.kind !== 'recovery' || state.sessionId !== session.id || state.deviceId !== session.deviceId ||
    typeof state.contentKey !== 'string' || typeof state.playlistId !== 'string' ||
    !['channel','movie','episode'].includes(String(state.type)) || Number(state.exp || 0) <= Date.now()
  ) return webJson(request, { ok: false, code: 'WEB_RECOVERY_TOKEN_INVALID' }, 401);
  const attempt = Math.max(0, Math.min(3, Number(state.sameOriginAttempts || 0)));
  const decision = classifyRecoveryError(errorCode, attempt);
  if (decision.classification === 'cancelled') return webJson(request, { ok: false, code: 'WEB_RECOVERY_CANCELLED', terminal: true }, 409);
  if (decision.classification === 'session') return webJson(request, { ok: false, code: 'WEB_SESSION_INVALID', terminal: true }, 401);
  if (decision.classification === 'offline') return webJson(request, { ok: false, code: 'WEB_OFFLINE', waitForOnline: true }, 409);

  const contentToken: WebContentToken = {
    v: 1, deviceId: session.deviceId, playlistId: state.playlistId, type: state.type, sourceId: state.sourceId,
    contentKey: state.contentKey, seriesSourceId: state.seriesSourceId, seriesName: state.seriesName, exp: Date.now() + 60_000,
  };
  let current: Resolved | null = null;
  try { current = await resolveInitial(supabase, session, contentToken); } catch { current = null; }
  if (decision.classification === 'token_expired' && current) return await authorize(request, session, state, current, state.urlIndex, attempt, {
    classification: decision.classification, backoffMs: 0, failover: false,
  });
  if (decision.retrySameOrigin && current) return await authorize(request, session, state, current, state.urlIndex, attempt + 1, {
    classification: decision.classification, backoffMs: decision.backoffMs, failover: false,
  });
  if (current && decision.advanceOrigin) {
    const nextIndex = state.urlIndex + 1;
    if (nextIndex < candidateUrls(current.item).length) return await authorize(request, session, state, current, nextIndex, 0, {
      classification: decision.classification, backoffMs: 0, failover: false,
    });
  }
  if (decision.advanceOrigin) {
    try {
      const next = await resolveLogicalContent(supabase, session, state.type, state.contentKey, { afterPriority: state.playlistPriority }) as Resolved;
      return await authorize(request, session, state, next, 0, 0, {
        classification: decision.classification, backoffMs: 0, failover: next.assignment.role === 'backup',
      });
    } catch { /* exhausted */ }
  }
  return webJson(request, {
    ok: false, code: 'WEB_RECOVERY_EXHAUSTED', terminal: true, classification: decision.classification,
    message: 'As alternativas autorizadas para este conteúdo foram esgotadas.',
  }, 404);
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: webCorsHeaders(request) });
  if (request.method !== 'POST') return webJson(request, { ok: false, code: 'WEB_METHOD_NOT_ALLOWED' }, 405);
  try {
    assertWebOrigin(request);
    const body = await readWebJson(request);
    const action = text(body.action, 32) || 'authorize';
    if (action === 'recover') return await recover(request, body);
    const contentId = text(body.contentId, 4096);
    if (!contentId) return webJson(request, { ok: false, code: 'WEB_CONTENT_ID_REQUIRED' }, 400);
    const supabase = serviceClient();
    const session = await requireWebSession(request, supabase);
    await enforceWebRateLimit(supabase, 'playback', `session:${session.id}`);
    const token = await parseContentToken(contentId, session);
    if (token.type === 'series') return webJson(request, { ok: false, code: 'WEB_SERIES_NOT_DIRECTLY_PLAYABLE' }, 400);
    const resolved = await resolveInitial(supabase, session, token);
    return await authorize(request, session, token, resolved, 0, 0);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEB_PLAYBACK_ERROR';
    if (code === 'WEB_RATE_LIMITED') return webJson(request, { ok: false, code }, 429);
    if (code.startsWith('WEB_SESSION_') || code.startsWith('WEB_DEVICE_')) return webJson(request, { ok: false, code, message: 'Sua sessão não está mais disponível.' }, 401);
    if (/WEB_CONTENT|WEB_EPISODE|WEB_LOGICAL/.test(code)) return webJson(request, { ok: false, code: 'WEB_CONTENT_NOT_FOUND' }, 404);
    if (code === 'WEB_ORIGIN_NOT_ALLOWED') return webJson(request, { ok: false, code }, 403);
    console.error('web-player-playback error', { code });
    return webJson(request, { ok: false, code: 'WEB_PLAYBACK_UNAVAILABLE' }, 503);
  }
});
