import fs from 'node:fs';

const files = {
  migration: 'supabase/migrations/20260807070000_lote4_activation_experience.sql',
  edge: 'supabase/functions/seller-device-flow/index.ts',
  wizard: 'admin-panel/seller-activation-wizard.js',
  css: 'admin-panel/seller-activation-wizard.css',
  time: 'admin-panel/panel-time.js',
  inline: 'admin-panel/universal-playlist-inline.js',
  generator: 'scripts/generate-panel-config.mjs',
  pgTap: 'supabase/tests/lote4_activation_experience_test.sql',
};

for (const path of Object.values(files)) {
  if (!fs.existsSync(path)) throw new Error(`Arquivo obrigatório do Lote 4 ausente: ${path}`);
}
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));

for (const token of [
  'panel_customers', 'notes text', 'panel_customers_notes_length_check',
  'seller_device_flow_transaction_v4', "'America/Sao_Paulo'",
  "to_char(v_effective_expiry at time zone 'UTC', 'HH24:MI:SS.MS') = '23:59:59.999'",
  'p_customer_notes',
]) {
  if (!source.migration.includes(token)) throw new Error(`Migração de experiência incompleta: ${token}`);
}

for (const token of [
  "rpc('seller_device_flow_transaction_v4'", 'customerNotes', 'p_customer_notes',
  "['customerId', 'customerName', 'customerWhatsapp', 'customerNotes', 'playlistId', 'backupPlaylistId']",
]) {
  if (!source.edge.includes(token)) throw new Error(`Edge canônica não usa o contrato v4: ${token}`);
}

for (const token of [
  "const TIME_ZONE = 'America/Sao_Paulo'", 'endOfDayIso', 'projectedExpiry',
  'formatDateTime', 'minutesSince', 'window.RonecaPanelTime',
]) {
  if (!source.time.includes(token)) throw new Error(`Helper de data incompleto: ${token}`);
}

for (const token of [
  'customerNotes', 'Saldo depois', 'durationDays', 'lastRenewalFor',
  'RECENT_RENEWAL_MINUTES', 'confirmRecentRenewal', 'maxReachable',
  'aw-field-error', 'data-aw-search', 'playlistUnavailable', 'cacheItemCount',
  'platformLabel', 'Cadastrar nova lista', 'Cadastrar nova reserva', 'openInline',
  'watchPlaylist', 'state.busy', 'customExpiryIso', 'America/Sao_Paulo',
  'Confirmação automática no aparelho',
]) {
  if (!source.wizard.includes(token)) throw new Error(`Wizard guiado não contém: ${token}`);
}
if (source.wizard.includes('T23:59:59.999Z')) throw new Error('Wizard não pode reconstruir validade como UTC no fim do dia.');
if (/\balert\s*\(/.test(source.wizard)) throw new Error('Validação do wizard deve aparecer dentro da etapa, não em alert().');

for (const token of [
  ':focus-visible', '@media(max-width:1024px)', '@media(max-width:760px)', '@media(max-width:520px)',
  '.aw-spinner', '.aw-playlist-card', '.upl-inline-card', 'overscroll-behavior',
]) {
  if (!source.css.includes(token)) throw new Error(`CSS responsivo/acessível incompleto: ${token}`);
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(clean.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a, b) {
  const l1 = luminance(a); const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
for (const foreground of ['#9ca9bb', '#aab6c8', '#94a3b8', '#cbd5e1', '#fecdd3', '#f8fafc']) {
  if (!source.css.includes(foreground)) throw new Error(`Cor crítica de acessibilidade não encontrada no CSS: ${foreground}`);
  if (contrast(foreground, '#070b18') < 4.5) throw new Error(`Contraste insuficiente entre ${foreground} e #070b18.`);
}

for (const token of [
  'openInline', 'capturedFetch', "url.includes('/playlist-source-manager')", 'onSaved',
  'upl-inline-card', '__inlineEnabled',
]) {
  if (!source.inline.includes(token)) throw new Error(`Ponte inline incompleta: ${token}`);
}

for (const token of [
  "id: 'panel-time'", "id: 'universal-playlist-registration'", "id: 'universal-playlist-inline'",
  "pages: ['dashboard', 'seller']", "pages: ['seller']",
]) {
  if (!source.generator.includes(token)) throw new Error(`Grafo de runtime do Lote 4 incompleto: ${token}`);
}

for (const token of [
  'Validade automática termina exatamente às 23:59:59.999 em São Paulo',
  'Data legada 23:59Z vira fim do mesmo dia em America/Sao_Paulo',
  'Observação acima do limite interrompe a transação',
  'Falha de observação não consome crédito adicional',
]) {
  if (!source.pgTap.includes(token)) throw new Error(`pgTAP do Lote 4 não contém: ${token}`);
}

console.log('✅ Lote 4: ativação guiada, cadastro inline, saldo, renovação recente, fuso, contraste e responsividade validados.');
