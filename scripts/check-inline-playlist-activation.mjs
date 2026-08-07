import fs from 'node:fs';

const failures = [];
const fail = message => failures.push(String(message));

const files = {
  controller: 'admin-panel/playlist-flow-controller.js',
  entry: 'admin-panel/unified-playlist-entry.js',
  loader: 'scripts/generate-panel-config.mjs',
  wizard: 'admin-panel/seller-activation-wizard.js',
  adminFlow: 'admin-panel/admin-device-flow.js',
  registration: 'supabase/functions/playlist-registration/index.ts',
  canonical: 'supabase/functions/seller-device-flow/index.ts',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) fail(`Arquivo obrigatório ausente: ${path}`);
}

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => [name, fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '']),
);

for (const token of [
  '__ronecaPlaylistFlowControllerInstalled',
  "registrationInvoke({ action: 'list' })",
  "action: 'create'",
  'createPromises',
  'operationLocks',
  '__ronecaPlaylistFlowController',
  'A validação seguirá sem interferir em ativação ou renovação',
]) {
  if (!source.controller.includes(token)) fail(`Controlador de cadastro não contém: ${token}`);
}

for (const forbidden of [
  'PlaylistSavedPendingError',
  "wrapBefore('activatePending'",
  "wrapBefore('sellerUxActivateDevice'",
  "wrapBefore('sellerUxRenewDevice'",
  'setInterval(',
  "callPanelFunction('admin-inline-playlist'",
  "action: 'refreshSellerPlaylistCache'",
]) {
  if (source.controller.includes(forbidden)) fail(`Controlador de cadastro ainda interfere no fluxo comercial: ${forbidden}`);
}

for (const token of [
  '__ronecaUnifiedPlaylistEntryInstalled',
  'Login Xtream',
  'buildUrl',
  'prepare(key)',
  "key: 'admin-base'",
  "key: 'seller-base'",
  'O cadastro da lista é independente da ativação',
]) {
  if (!source.entry.includes(token)) fail(`Cadastro universal não contém: ${token}`);
}

for (const forbidden of [
  '__roneca_new_playlist__',
  'MutationObserver',
  'sellerUxActivateDevice',
  'sellerUxRenewDevice',
  'activatePending',
  'admin-inline-playlist',
]) {
  if (source.entry.includes(forbidden)) fail(`Cadastro universal contém acoplamento comercial proibido: ${forbidden}`);
}

for (const token of [
  'loadUnifiedPlaylistEntry',
  'unified-playlist-entry.js?v=2.0',
  'loadPlaylistFlowController',
  'playlist-flow-controller.js?v=2.0',
  'loadAdminDeviceFlow',
  'admin-device-flow.js?v=1.0',
  'loadPlaylistCommercialQualification',
]) {
  if (!source.loader.includes(token)) fail(`Carregador não contém: ${token}`);
}

for (const forbidden of [
  'loadInlinePlaylistActivation',
  'inline-playlist-activation.js',
  'playlist-save-feedback-hotfix.js',
  "pages: ['dashboard'],\n    style: './playlist-edit-module.css",
]) {
  if (source.loader.includes(forbidden)) fail(`Carregador ainda publica módulo comercial concorrente: ${forbidden}`);
}

for (const token of [
  "const FLOW_FUNCTION = 'seller-device-flow'",
  'RonecaSellerDeviceFlowUI',
  'openActivation',
  'openRenewal',
  'openChange',
  "action = 'activate'",
  "action = 'renew'",
  "action = 'changePlaylists'",
  'Cadastrar nova lista',
  'Cadastrar nova reserva',
]) {
  if (!source.wizard.includes(token)) fail(`Wizard comercial do vendedor não contém: ${token}`);
}

for (const forbidden of [
  'sellerUxActivateDevice',
  'sellerUxRenewDevice',
  'sellerActivationPlaylist',
  'sellerActivationBackupPlaylist',
  'sellerRenewPlaylist',
  'sellerRenewBackupPlaylist',
]) {
  if (source.wizard.includes(forbidden)) fail(`Wizard ainda expõe contrato comercial antigo: ${forbidden}`);
}

for (const token of [
  "const FLOW_FUNCTION = 'seller-device-flow'",
  'window.activatePending = activatePending',
  'window.renewDevice = openRenewal',
  'window.adminChangeDevicePlaylists = openPlaylistChange',
  "action: 'activate'",
  "action: 'renew'",
  "action: 'changePlaylists'",
]) {
  if (!source.adminFlow.includes(token)) fail(`Fluxo comercial do ADM não contém: ${token}`);
}

for (const token of [
  'register_playlist_source_transaction',
  'source_fingerprint',
  'commerciallyUsable',
]) {
  if (!source.registration.includes(token)) fail(`Cadastro canônico não contém: ${token}`);
}

for (const token of [
  "['activate', 'renew', 'changePlaylists']",
  "rpc('seller_device_flow_transaction_v4'",
  'p_customer_notes',
  'idempotencyKey',
  'Renovação não altera cliente nem listas',
  'Alterar listas não muda cliente, plano ou validade',
]) {
  if (!source.canonical.includes(token)) fail(`seller-device-flow não contém: ${token}`);
}

for (const [name, content] of Object.entries(source)) {
  if (/console\.(?:log|debug|info|warn|error)\s*\([^)]*(?:playlistUrl|playlist_url|password|username|token)/i.test(content)) {
    fail(`${files[name]} pode registrar credenciais em log.`);
  }
}

if (failures.length) {
  const message = failures.join(' | ').replace(/[\r\n]+/g, ' ').slice(0, 4000);
  console.log(`::error file=scripts/check-inline-playlist-activation.mjs,title=Contrato comercial canônico inválido::${message}`);
  console.log(message);
  process.exit(1);
}

console.log('✅ Cadastro de listas desacoplado; ativação, renovação e troca pertencem somente ao seller-device-flow v4.');
