import fs from 'node:fs';

process.on('uncaughtException', error => {
  const message = String(error?.message || error || 'Falha desconhecida')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 1000);
  console.error(`::error file=scripts/check-inline-playlist-activation.mjs,title=Fluxo de listas inválido::${message}`);
  process.exit(1);
});

const files = {
  controller: 'admin-panel/playlist-flow-controller.js',
  entry: 'admin-panel/unified-playlist-entry.js',
  loader: 'scripts/generate-panel-config.mjs',
  registration: 'supabase/functions/playlist-registration/index.ts',
  compatibility: 'supabase/functions/admin-inline-playlist/index.ts',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, fs.readFileSync(path, 'utf8')]),
);

const requiredControllerTokens = [
  '__ronecaPlaylistFlowControllerInstalled',
  "registrationInvoke({ action: 'list' })",
  "action: 'create'",
  'PlaylistSavedPendingError',
  'createPromises',
  'operationLocks',
  "wrapBefore('activatePending'",
  "wrapBefore('sellerUxActivateDevice'",
  "wrapBefore('sellerUxRenewDevice'",
  '__ronecaPlaylistFlowController',
  'Não cadastre novamente',
];
for (const token of requiredControllerTokens) {
  if (!source.controller.includes(token)) {
    throw new Error(`Controlador único não contém: ${token}`);
  }
}

for (const forbidden of [
  'setInterval(',
  "callPanelFunction('admin-inline-playlist'",
  "action: 'refreshSellerPlaylistCache'",
  "action: 'refreshPlaylistCache'",
]) {
  if (source.controller.includes(forbidden)) {
    throw new Error(`Controlador único contém comportamento legado proibido: ${forbidden}`);
  }
}

for (const token of [
  '__roneca_new_playlist__',
  'Login Xtream',
  'buildUrl',
  'prepare(key)',
  'MutationObserver',
  'Nova lista principal',
  'Nova lista reserva',
]) {
  if (!source.entry.includes(token)) throw new Error(`Entrada unificada não contém: ${token}`);
}

for (const forbidden of [
  'admin-inline-playlist',
  'createSellerPlaylist',
  'function before(',
  'function after(',
  'wrapFunctions',
  'cache?.ok',
]) {
  if (source.entry.includes(forbidden)) {
    throw new Error(`A entrada visual não pode controlar o fluxo comercial: ${forbidden}`);
  }
}

for (const token of [
  'loadUnifiedPlaylistEntry',
  'loadPlaylistFlowController',
  'playlist-flow-controller.js?v=1.0',
  'loadPlaylistCommercialQualification',
  '(dashboard|seller)',
]) {
  if (!source.loader.includes(token)) throw new Error(`Carregador não contém: ${token}`);
}

for (const forbidden of [
  'loadInlinePlaylistActivation',
  'inline-playlist-activation.js',
  'loadPlaylistSaveFeedback',
  'playlist-save-feedback-hotfix.js',
]) {
  if (source.loader.includes(forbidden)) {
    throw new Error(`Carregador ainda publica o módulo concorrente: ${forbidden}`);
  }
}

for (const token of [
  'register_playlist_source_transaction',
  'source_fingerprint',
  'saved:',
  'reused:',
  'commerciallyUsable',
  'nextAction',
]) {
  if (!source.registration.includes(token)) {
    throw new Error(`Cadastro canônico não contém: ${token}`);
  }
}

for (const token of [
  'playlist-registration',
  "action: 'create'",
  'compatibilityProxy',
]) {
  if (!source.compatibility.includes(token)) {
    throw new Error(`Compatibilidade administrativa não contém: ${token}`);
  }
}

for (const [name, content] of Object.entries(source)) {
  if (/console\.(?:log|debug|info|warn|error)\s*\([^)]*(?:playlistUrl|playlist_url|password|username|token)/i.test(content)) {
    throw new Error(`${files[name]} pode registrar credenciais em log.`);
  }
}

console.log('✅ Fluxo único de listas validado sem wrappers concorrentes ou rotas legadas de criação.');
