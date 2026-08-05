import fs from 'node:fs';

const failures = [];
const fail = message => failures.push(String(message));

const files = {
  controller: 'admin-panel/playlist-flow-controller.js',
  entry: 'admin-panel/unified-playlist-entry.js',
  loader: 'scripts/generate-panel-config.mjs',
  registration: 'supabase/functions/playlist-registration/index.ts',
  compatibility: 'supabase/functions/admin-inline-playlist/index.ts',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) fail(`Arquivo obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [
    name,
    fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '',
  ]),
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
    fail(`Controlador único não contém: ${token}`);
  }
}

for (const forbidden of [
  'setInterval(',
  "callPanelFunction('admin-inline-playlist'",
  "action: 'refreshSellerPlaylistCache'",
  "action: 'refreshPlaylistCache'",
]) {
  if (source.controller.includes(forbidden)) {
    fail(`Controlador único contém comportamento legado proibido: ${forbidden}`);
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
  if (!source.entry.includes(token)) fail(`Entrada unificada não contém: ${token}`);
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
    fail(`A entrada visual não pode controlar o fluxo comercial: ${forbidden}`);
  }
}

for (const token of [
  'loadUnifiedPlaylistEntry',
  'loadPlaylistFlowController',
  'playlist-flow-controller.js?v=1.0',
  'loadPlaylistCommercialQualification',
  '(dashboard|seller)',
]) {
  if (!source.loader.includes(token)) fail(`Carregador não contém: ${token}`);
}

for (const forbidden of [
  'loadInlinePlaylistActivation',
  'inline-playlist-activation.js',
  'loadPlaylistSaveFeedback',
  'playlist-save-feedback-hotfix.js',
]) {
  if (source.loader.includes(forbidden)) {
    fail(`Carregador ainda publica o módulo concorrente: ${forbidden}`);
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
    fail(`Cadastro canônico não contém: ${token}`);
  }
}

for (const token of [
  'playlist-registration',
  "action: 'create'",
  'compatibilityProxy',
]) {
  if (!source.compatibility.includes(token)) {
    fail(`Compatibilidade administrativa não contém: ${token}`);
  }
}

for (const [name, content] of Object.entries(source)) {
  if (/console\.(?:log|debug|info|warn|error)\s*\([^)]*(?:playlistUrl|playlist_url|password|username|token)/i.test(content)) {
    fail(`${files[name]} pode registrar credenciais em log.`);
  }
}

if (failures.length) {
  const message = failures.join(' | ').replace(/[\r\n]+/g, ' ').slice(0, 4000);
  console.error(`::error file=scripts/check-inline-playlist-activation.mjs,title=Contrato do fluxo de listas inválido::${message}`);
  console.error(message);
  process.exit(1);
}

console.log('✅ Fluxo único de listas validado sem wrappers concorrentes ou rotas legadas de criação.');
