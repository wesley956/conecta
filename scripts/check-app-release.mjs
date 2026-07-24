import fs from 'node:fs';

const files = {
  edge: 'supabase/functions/app-release/index.ts',
  migration: 'supabase/migrations/2026072401_protected_apk_distribution.sql',
  workflow: '.github/workflows/release-native-android.yml',
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
  [source.workflow, "SUPABASE_SERVICE_ROLE_KEY", 'A publicação automática não usa segredo protegido.'],
  [source.workflow, "storage/v1/object/app-releases", 'O workflow não envia o APK ao Storage.'],
  [source.android, 'fetchAuthorizedManifest("download")', 'O APK não renova a autorização ao baixar.'],
  [source.android, "verifyChecksum", 'A validação SHA-256 do APK foi removida.'],
  [source.android, "verifyPackageAndSignature", 'A validação do pacote/assinatura foi removida.'],
  [source.auth, "'app-release': true", 'A sessão do painel não autoriza a função de release.'],
  [source.panel, "Gerando link temporário", 'O painel não oferece link para o Downloader.'],
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

console.log('Publicação protegida do APK validada.');

