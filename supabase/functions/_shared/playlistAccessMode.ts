export type PlaylistAccessMode = 'server_cache' | 'direct' | 'blocked';

export type PlaylistCacheAttempt = {
  method: 'm3u' | 'xtream';
  status: 'success' | 'error' | 'skipped';
  error?: string | null;
};

export type PlaylistCacheFailure = {
  accessMode: PlaylistAccessMode;
  code: string;
  message: string;
  directEligible: boolean;
};

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function failedMessages(attempts: PlaylistCacheAttempt[]) {
  return attempts
    .filter(attempt => attempt.status === 'error' && attempt.error)
    .map(attempt => normalized(attempt.error));
}

function removeUrlsAndQueryCredentials(value: string) {
  return value
    .replace(/https?:\/\/[^\s|)]+/g, ' ')
    .replace(/\b(?:username|user|login|password|pass|pwd)\s*=\s*[^&\s|)]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyPlaylistCacheFailure(
  attempts: PlaylistCacheAttempt[],
  playlistType: unknown,
): PlaylistCacheFailure {
  const messages = failedMessages(attempts);
  const combined = messages.join(' | ');
  const credentialSignals = removeUrlsAndQueryCredentials(combined);
  const supportsDirect = ['m3u', 'xtream'].includes(normalized(playlistType));
  const allApplicableFailed = attempts.some(attempt => attempt.status === 'error')
    && attempts.every(attempt => attempt.status !== 'success');

  const unsafeOrInvalidUrl = /url externa invalida|somente urls http|enderecos privados|host nao permitido|allowed_hosts|protocolo.*nao permitido/.test(combined);
  if (unsafeOrInvalidUrl) {
    return {
      accessMode: 'blocked',
      code: 'INVALID_OR_BLOCKED_URL',
      message: 'A URL da lista é inválida ou não está liberada pelas regras de segurança.',
      directEligible: false,
    };
  }

  const timedOut = /tempo limite|timed? ?out|timeout|aborterror/.test(combined);
  if (supportsDirect && timedOut && allApplicableFailed) {
    return {
      accessMode: 'direct',
      code: 'DATACENTER_TIMEOUT',
      message: 'O provedor não respondeu ao servidor. O aparelho usará acesso direto.',
      directEligible: true,
    };
  }

  const allHttp404 = messages.length > 0 && messages.every(message => /http 404/.test(message));
  if (supportsDirect && allHttp404 && allApplicableFailed) {
    return {
      accessMode: 'blocked',
      code: 'PROVIDER_ENDPOINT_NOT_FOUND',
      message: 'O provedor não encontrou o endpoint solicitado. Confira o endereço antes de usar acesso direto.',
      directEligible: false,
    };
  }

  const datacenterBlocked = /http (403|406|409|418|429|451|500|502|503|504|520|521|522|523|524)|connection reset|connection refused|network error|fetch failed|dns|tcp connect error/.test(combined);
  if (supportsDirect && datacenterBlocked && allApplicableFailed) {
    return {
      accessMode: 'direct',
      code: 'DATACENTER_BLOCKED',
      message: 'O provedor bloqueou ou recusou o servidor. O aparelho usará acesso direto.',
      directEligible: true,
    };
  }

  const invalidCredentials = /http 401|nao autoriz|unauthori[sz]ed|invalid (user|username|password|credential)|credencia(?:is)? invalida|usuario.*senha|username.*password|login.*negad|authentication failed|auth.*(?:0|false)/.test(credentialSignals);
  if (invalidCredentials) {
    return {
      accessMode: 'blocked',
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas ou não autorizadas pelo provedor.',
      directEligible: false,
    };
  }

  const invalidContent = /nao retornou uma lista m3u valida|nenhum canal|nenhum.*filme|nenhuma.*serie|resposta nao e json|0 filmes/.test(combined);
  if (invalidContent) {
    return {
      accessMode: 'blocked',
      code: 'INVALID_PLAYLIST_CONTENT',
      message: 'A origem respondeu, mas não entregou um catálogo válido.',
      directEligible: false,
    };
  }

  return {
    accessMode: 'blocked',
    code: 'CACHE_BUILD_FAILED',
    message: 'Não foi possível validar a lista com segurança.',
    directEligible: false,
  };
}

export function resolvePlaylistAccessMode(
  cacheStatus: unknown,
  storedMode: unknown,
  errorCode: unknown,
  cacheError: unknown,
  playlistType: unknown = 'm3u',
): PlaylistAccessMode {
  if (String(cacheStatus ?? '') === 'ready') return 'server_cache';

  const mode = String(storedMode ?? '');
  if (mode === 'direct' || mode === 'blocked') return mode;
  if (mode === 'server_cache' && !errorCode && !cacheError) return 'server_cache';

  const legacyAttempt: PlaylistCacheAttempt = {
    method: 'm3u',
    status: 'error',
    error: [errorCode, cacheError].filter(Boolean).join(': '),
  };
  return classifyPlaylistCacheFailure([legacyAttempt], playlistType).accessMode;
}

export function isPlaylistUsable(
  cacheStatus: unknown,
  storedMode: unknown,
  errorCode: unknown,
  cacheError: unknown,
  playlistType: unknown = 'm3u',
) {
  return cacheStatus === 'ready'
    || resolvePlaylistAccessMode(cacheStatus, storedMode, errorCode, cacheError, playlistType) === 'direct';
}
