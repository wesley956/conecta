export type RecoveryClass =
  | 'offline'
  | 'timeout'
  | 'auth'
  | 'not_found'
  | 'rate_limited'
  | 'upstream'
  | 'token_expired'
  | 'gateway'
  | 'cors'
  | 'mixed_content'
  | 'manifest'
  | 'codec'
  | 'decoder'
  | 'stall'
  | 'cancelled'
  | 'session';

export type RecoveryDecision = {
  classification: RecoveryClass;
  retrySameOrigin: boolean;
  advanceOrigin: boolean;
  backoffMs: number;
};

const TRANSIENT = new Set<RecoveryClass>(['offline','timeout','rate_limited','upstream','gateway','stall','token_expired']);

export function classifyRecoveryError(value: unknown, attempt = 0): RecoveryDecision {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9_:-]/g, '').slice(0, 80);
  let classification: RecoveryClass = 'upstream';

  if (/CANCEL|ABORT|USER/.test(code)) classification = 'cancelled';
  else if (/SESSION|DEVICE_EXPIRED|DEVICE_BLOCKED|REVOK/.test(code)) classification = 'session';
  else if (/OFFLINE|NETWORK_OFFLINE/.test(code)) classification = 'offline';
  else if (/TOKEN.*EXPIR|PLAYBACK.*EXPIR/.test(code)) classification = 'token_expired';
  else if (/TIMEOUT|TIMED_OUT/.test(code)) classification = 'timeout';
  else if (/401|403|AUTH|FORBIDDEN/.test(code)) classification = 'auth';
  else if (/404|410|NOT_FOUND|GONE/.test(code)) classification = 'not_found';
  else if (/429|RATE/.test(code)) classification = 'rate_limited';
  else if (/MIXED/.test(code)) classification = 'mixed_content';
  else if (/CORS/.test(code)) classification = 'cors';
  else if (/CODEC|CONTAINER|FORMAT/.test(code)) classification = 'codec';
  else if (/DECODER|MEDIA_ERROR/.test(code)) classification = 'decoder';
  else if (/MANIFEST|SEGMENT|HLS/.test(code)) classification = 'manifest';
  else if (/STALL|WATCHDOG/.test(code)) classification = 'stall';
  else if (/GATEWAY/.test(code)) classification = 'gateway';
  else if (/5\d\d|UPSTREAM/.test(code)) classification = 'upstream';

  const retrySameOrigin = TRANSIENT.has(classification) && attempt < 3 && classification !== 'offline';
  const advanceOrigin = !['cancelled','session','offline','token_expired'].includes(classification);
  const schedule = [2_000, 4_000, 8_000];
  return {
    classification,
    retrySameOrigin,
    advanceOrigin,
    backoffMs: classification === 'token_expired' ? 0 : retrySameOrigin ? schedule[Math.min(attempt, schedule.length - 1)] : 0,
  };
}

export function sanitizedRecoveryCode(value: unknown) {
  const result = String(value || 'WEB_UNKNOWN')
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return result || 'WEB_UNKNOWN';
}
