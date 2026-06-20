// Utilitário compartilhado por fetchM3U.ts e xtreamSeries.ts.
//
// Problema que isso resolve: várias APIs Xtream, quando a conta é
// inválida, está bloqueada, expirou, ou o painel está em manutenção,
// respondem HTTP 200 com uma página HTML (ex: "<!DOCTYPE html>...",
// uma tela de login, um bloqueio de Cloudflare, etc.) em vez de JSON.
// Antes, isso ia direto para `JSON.parse()` e estourava um
// `SyntaxError: Unexpected token < in JSON at position 0`, que
// aparecia cru para o usuário na tela de Séries.
//
// Esta função detecta esse caso ANTES de tentar o parse e gera uma
// mensagem clara em pt-BR, além de também tratar JSON truncado/inválido
// de forma amigável.

export class SeriesApiError extends Error {}

function previewText(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function looksLikeHtml(content: string) {
  const start = content.trimStart().slice(0, 200).toLowerCase();
  return (
    start.startsWith('<!doctype') ||
    start.startsWith('<html') ||
    start.startsWith('<?xml') ||
    (start.startsWith('<') && start.includes('<body'))
  );
}

/**
 * Recebe texto cru de uma resposta HTTP e tenta interpretá-lo como JSON.
 * Lança SeriesApiError com mensagem amigável quando:
 * - a resposta é HTML (página de erro, login, bloqueio, manutenção);
 * - a resposta está vazia;
 * - o JSON está malformado/truncado.
 */
export function parseJsonOrThrow<T>(rawText: string, context: string): T {
  const text = typeof rawText === 'string' ? rawText : String(rawText ?? '');
  const trimmed = text.trim();

  if (!trimmed) {
    throw new SeriesApiError(
      `${context}: o servidor respondeu vazio. Tente novamente em instantes.`
    );
  }

  if (looksLikeHtml(trimmed)) {
    throw new SeriesApiError(
      `${context}: o servidor retornou uma página HTML em vez de dados (provável login expirado, ` +
      `bloqueio ou manutenção no painel Xtream). Início da resposta: "${previewText(trimmed)}"`
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new SeriesApiError(
      `${context}: a resposta não é um JSON válido. Início da resposta: "${previewText(trimmed)}"`
    );
  }
}

/** Normaliza o payload do CapacitorHttp (pode vir como string ou já como objeto). */
export function parseCapacitorJsonOrThrow<T>(data: unknown, context: string): T {
  if (typeof data === 'string') {
    return parseJsonOrThrow<T>(data, context);
  }

  if (data && typeof data === 'object') {
    return data as T;
  }

  throw new SeriesApiError(`${context}: resposta vazia ou em formato inesperado.`);
}
