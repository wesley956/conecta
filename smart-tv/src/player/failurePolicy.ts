export type PlaybackFailureKind =
  | "offline"
  | "transient_network"
  | "timeout"
  | "access_denied"
  | "not_found"
  | "rate_limited"
  | "server_unavailable"
  | "manifest"
  | "unsupported_format"
  | "decoder"
  | "stalled"
  | "unknown";

export type PlaybackFailureCode =
  | "NET_OFFLINE"
  | "NET_TIMEOUT"
  | "NET_CONNECTION_RESET"
  | "HTTP_401"
  | "HTTP_403"
  | "HTTP_404"
  | "HTTP_429"
  | "HTTP_5XX"
  | "MEDIA_MANIFEST_INVALID"
  | "MEDIA_UNSUPPORTED_FORMAT"
  | "MEDIA_UNSUPPORTED_CODEC"
  | "PLAYER_STALL"
  | "PLAYER_DECODER_ERROR"
  | "PLAYER_UNKNOWN";

export interface PlaybackFailureDecision {
  kind: PlaybackFailureKind;
  code: PlaybackFailureCode;
  retryableSameSource: boolean;
  switchSource: boolean;
  userMessage: string;
}

const RETRY_BACKOFF_MS = [2_000, 4_000, 8_000] as const;
export const STABLE_PLAYBACK_WINDOW_MS = 8_000;
export const STABLE_PROGRESS_SECONDS = 2;

export function retryDelayMs(attempt: number): number | null {
  return RETRY_BACKOFF_MS[attempt] ?? null;
}

export function classifyPlaybackFailure(reason: string, offline: boolean): PlaybackFailureDecision {
  const value = reason.toLowerCase();
  if (offline) return decision("offline", "NET_OFFLINE", false, false, "Sem conexão com a internet.");

  if (/\b401\b/.test(value)) return decision("access_denied", "HTTP_401", false, true, "Acesso recusado pelo fornecedor.");
  if (/\b403\b/.test(value)) return decision("access_denied", "HTTP_403", false, true, "Acesso recusado pelo fornecedor.");
  if (/\b404\b|\b410\b|não encontr|indisponível no servidor/.test(value)) return decision("not_found", "HTTP_404", false, true, "Conteúdo indisponível no servidor.");
  if (/\b429\b|limite|rate.?limit/.test(value)) return decision("rate_limited", "HTTP_429", true, false, "O servidor limitou temporariamente as tentativas.");
  if (/\b5\d\d\b|servidor indispon|gateway|service unavailable/.test(value)) return decision("server_unavailable", "HTTP_5XX", true, false, "O servidor está temporariamente indisponível.");
  if (/manifest|m3u8|playlist invál|segment/.test(value)) return decision("manifest", "MEDIA_MANIFEST_INVALID", false, true, "A transmissão retornou um manifesto inválido.");
  if (/codec|decod/.test(value)) return decision("decoder", "MEDIA_UNSUPPORTED_CODEC", false, true, "Este conteúdo não pôde ser decodificado nesta TV.");
  if (/formato|não suportad|not supported/.test(value)) return decision("unsupported_format", "MEDIA_UNSUPPORTED_FORMAT", false, true, "Este formato não é suportado nesta TV.");
  if (/stall|parou de avançar|sem avanço/.test(value)) return decision("stalled", "PLAYER_STALL", true, false, "O servidor parou de enviar o conteúdo.");
  if (/tempo|timeout|demorou|esgotado|carregamento/.test(value)) return decision("timeout", "NET_TIMEOUT", true, false, "A conexão com o servidor demorou demais.");
  if (/rede|network|conexão|connection|reset|offline/.test(value)) return decision("transient_network", "NET_CONNECTION_RESET", true, false, "A conexão com o servidor foi interrompida.");
  return decision("unknown", "PLAYER_UNKNOWN", false, true, "Não foi possível reproduzir este conteúdo.");
}

function decision(
  kind: PlaybackFailureKind,
  code: PlaybackFailureCode,
  retryableSameSource: boolean,
  switchSource: boolean,
  userMessage: string
): PlaybackFailureDecision {
  return { kind, code, retryableSameSource, switchSource, userMessage };
}
