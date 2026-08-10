import fs from 'node:fs';

const files = {
  edge: 'supabase/functions/app-release/index.ts',
  migration: 'supabase/migrations/2026072401_protected_apk_distribution.sql',
  multiPlatformMigration: 'supabase/migrations/2026072402_multi_platform_app_releases.sql',
  workflow: '.github/workflows/release-native-android.yml',
  webosWorkflow: '.github/workflows/build-lg-webos-installer.yml',
  webosValidator: 'smart-tv/scripts/validate-webos-package.mjs',
  android: 'native-android/app/src/main/java/com/ronecaplaytv/nativeapp/update/AppUpdateManager.kt',
  auth: 'admin-panel/panel-auth-session.js',
  panel: 'admin-panel/app-release.js',
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]),
);

const required = [
  [source.migration, "public.app_releases", 'A tabela de releases não foi criada.'],
  [source.migration, "'app-releases'", 'O bucket privado não foi configurado.'],
  [source.migration, "public, anon, authenticated", 'A leitura direta não foi revogada.'],
  [source.edge, "requirePanelPrincipal", 'O download do painel não valida o papel autenticado.'],
  [source.edge, "x-device-credential", 'O download do aparelho não exige credencial.'],
  [source.edge, "createSignedUrl", 'A Edge Function não gera URL temporária.'],
  [source.edge, "60 * 60", 'O link do Downloader precisa expirar em uma hora.'],
  [source.workflow, "SUPABASE_SERVICE_ROLE_KEY", 'A publicação automática Android não usa segredo protegido.'],
  [source.workflow, "storage/v1/object/app-releases", 'O workflow Android não envia o APK ao Storage.'],
  [source.android, 'fetchAuthorizedManifest("download")', 'O APK não renova a autorização ao baixar.'],
  [source.android, "verifyChecksum", 'A validação SHA-256 do APK foi removida.'],
  [source.android, "verifyPackageAndSignature", 'A validação do pacote/assinatura foi removida.'],
  [source.auth, "'app-release': true", 'A sessão do painel não autoriza a função de release.'],
  [source.panel, "Gerando link temporário", 'O painel não oferece link para o Downloader.'],
  [source.multiPlatformMigration, "platform in ('android', 'webos', 'tizen')", 'As plataformas de release não estão protegidas.'],
  [source.edge, ".eq('platform', platform)", 'A função não separa releases por plataforma.'],
  [source.edge, "downloadUrl", 'A função não entrega URL genérica para LG e Samsung.'],
  [source.panel, "LG webOS", 'O painel não oferece o aplicativo LG.'],
  [source.panel, "Samsung Tizen", 'O painel não oferece o aplicativo Samsung.'],

  // LG-P07: o workflow de build webOS só produz e valida candidatos. Promoção
  // para RC/Stable é uma operação explícita separada e não pode acontecer em
  // qualquer push comum na main.
  [source.webosWorkflow, "package:webos:verified", 'O workflow LG não executa o gate de empacotamento verificado.'],
  [source.webosWorkflow, "webos-release-metadata.json", 'O workflow LG não preserva os metadados rastreáveis do candidato.'],
  [source.webosWorkflow, "SHA256SUMS", 'O workflow LG não preserva o SHA-256 do candidato.'],
  [source.webosWorkflow, "Ele NÃO promove nem publica Stable", 'O workflow LG não declara a separação entre build e promoção.'],
  [source.webosValidator, 'platform: "webos"', 'O candidato LG não registra a plataforma webOS.'],
  [source.webosValidator, 'status: "CANDIDATE"', 'O IPK gerado não é identificado como candidato.'],
  [source.webosValidator, 'crypto.createHash("sha256")', 'O gate LG não calcula SHA-256 do IPK.'],
  [source.webosValidator, 'com.ronecaplaytv.app', 'O gate LG não valida o App ID oficial.'],
];

for (const [haystack, needle, message] of required) {
  if (!haystack.includes(needle)) throw new Error(message);
}

if (source.edge.includes('getPublicUrl')) {
  throw new Error('O bucket privado não pode gerar URL pública.');
}
if (/service[_-]?role/i.test(source.panel)) {
  throw new Error('O navegador não pode receber referência à chave service_role.');
}

const forbiddenWebosBuildPublishing = [
  ['SUPABASE_SERVICE_ROLE_KEY', 'O workflow de build LG voltou a carregar a chave service_role.'],
  ['storage/v1/object/app-releases', 'O workflow de build LG voltou a publicar IPK diretamente no Storage.'],
  ['published: true', 'O workflow de build LG voltou a marcar candidato como Stable/publicado.'],
  ['on_conflict=platform%2Cversion_code', 'O workflow de build LG voltou a gravar release de produção diretamente.'],
];

for (const [needle, message] of forbiddenWebosBuildPublishing) {
  if (source.webosWorkflow.includes(needle)) throw new Error(message);
}

console.log('Distribuição protegida validada: Android publica pelo fluxo protegido; webOS apenas gera candidato até promoção explícita.');
