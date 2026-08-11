import { platform } from "./platform";

const URL_PATTERN = /\bhttps?:\/\/[^\s)\]}>,]+/gi;
const AUTH_PATTERN = /\b(?:authorization|bearer|basic|token|password|passwd|pass|username|user|credential|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;
const EMBEDDED_AUTH_PATTERN = /\/\/[^/@\s]+:[^/@\s]+@/g;
const QUERY_PATTERN = /\?[^\s)\]}>,]+/g;

export function sanitizeDiagnosticText(value: unknown, limit = 320): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const sanitized = raw
    .replace(EMBEDDED_AUTH_PATTERN, "//[credencial ocultada]@")
    .replace(URL_PATTERN, "[origem ocultada]")
    .replace(AUTH_PATTERN, match => `${match.split(/[:=]/, 1)[0]}=[oculto]`)
    .replace(QUERY_PATTERN, "?[parâmetros ocultados]")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.slice(0, Math.max(32, limit));
}

function fallbackSuffix(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function base32(bytes: Uint8Array, length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let index = 0; index < bytes.length && result.length < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length];
  }
  return result.padEnd(length, "X");
}

export async function buildSupportCode(deviceCode: string | null, deviceUuid: string | null): Promise<string | null> {
  if (!deviceCode && !deviceUuid) return null;
  const platformCode = platform === "webos" ? "LG" : platform === "tizen" ? "SZ" : "TV";
  const identity = `${platform}|${deviceCode || "-"}|${deviceUuid || "-"}`;
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    return `RP-${platformCode}-${base32(new Uint8Array(digest), 6)}`;
  } catch {
    return `RP-${platformCode}-${fallbackSuffix(identity)}`;
  }
}
