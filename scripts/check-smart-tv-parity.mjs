import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const app = read("smart-tv/src/App.tsx");
const player = read("smart-tv/src/player/PlayerScreen.tsx");
const failurePolicy = read("smart-tv/src/player/failurePolicy.ts");
const catalog = read("smart-tv/src/catalog.ts");
const session = read("smart-tv/src/deviceSession.ts");
const settings = read("smart-tv/src/playerSettings.ts");
const tizenPlayer = read("smart-tv/src/player/tizenPlayer.ts");
const html5Player = read("smart-tv/src/player/html5Player.ts");
const smartPackage = JSON.parse(read("smart-tv/package.json"));
const webos = JSON.parse(read("smart-tv/platforms/webos/appinfo.json"));
const tizen = read("smart-tv/platforms/tizen/config.xml");
const config = read("supabase/config.toml");
const diagnostics = read("supabase/functions/playback-diagnostics-report/index.ts");
const internalVersion = session.match(/APP_VERSION = "([^"]+)"/)?.[1];

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

requireCheck(internalVersion === "1.0.0", "A versão interna Smart TV precisa ser 1.0.0.");
requireCheck(webos.version === internalVersion, "O appinfo.json da LG diverge da versão interna.");
requireCheck(tizen.includes(`version="${internalVersion}"`), "O config.xml da Samsung diverge da versão interna.");
requireCheck(smartPackage.scripts["package:tizen"], "O pacote estrutural Tizen não está configurado.");
requireCheck(smartPackage.scripts["package:tizen:signed"], "O pacote assinado Tizen não está configurado.");
requireCheck(app.includes("recoveredPlayback"), "O aplicativo não resolve conteúdo na lista reserva.");
requireCheck(app.includes("diagnosticEventId"), "A recuperação não preserva o diagnóstico.");
requireCheck(app.includes("useSmartTvPlayerSettings"), "As preferências avançadas não estão ligadas ao aplicativo.");
requireCheck(app.includes("onStablePlayback={catalog.confirmPlaybackStable}"), "O aplicativo não confirma saúde da lista após reprodução estável.");
requireCheck(player.includes('recovery === "failed"'), "O player não possui estado final recuperável.");
requireCheck(player.includes("reportPlaybackDiagnostic"), "O player não envia diagnóstico detalhado.");
requireCheck(failurePolicy.includes("[2_000, 4_000, 8_000]"), "O backoff progressivo 2/4/8 s não está configurado.");
requireCheck(player.includes("retriesBySource.current"), "O orçamento de tentativas por origem não está configurado.");
requireCheck(player.includes("retryDelayMs(retries)"), "O player não aplica a política de backoff progressivo.");
requireCheck(player.includes("RECOVERY_SOURCE_SWITCH"), "O player não alterna origens antes do failover comercial.");
requireCheck(player.includes("RECOVERY_PLAYLIST_FAILOVER"), "O failover comercial não está identificado após esgotar origens.");
requireCheck(player.includes("recoveryLock.current"), "A recuperação não está serializada contra concorrência.");
requireCheck(player.includes("STABLE_PLAYBACK_WINDOW_MS"), "A recuperação não possui janela de estabilidade comprovada.");
requireCheck(!player.includes("localRetries.current < 2"), "O recovery legado de duas tentativas fixas ainda está presente.");
requireCheck(!player.includes("onTerminalPlaybackFailure?.(snapshot.error"), "O fluxo antigo de saída automática ainda está presente.");
requireCheck(catalog.includes("Promise<CatalogFailoverResult>"), "O failover não devolve o resultado padronizado da recuperação.");
requireCheck(catalog.includes("confirmPlaybackStable"), "O sucesso da lista não depende da reprodução estável.");
requireCheck(catalog.includes("reportPlaylistSuccess"), "O sucesso da lista não zera as falhas acumuladas.");
requireCheck(settings.includes("bufferSeconds"), "O buffer configurável está ausente.");
requireCheck(tizenPlayer.includes("setBufferingParam"), "O AVPlay não aplica buffer configurável.");
requireCheck(tizenPlayer.includes("demorou demais para preparar"), "O AVPlay não possui timeout de preparação.");
requireCheck(html5Player.includes('on("stalled"'), "O player LG não monitora travamento HTML5.");
requireCheck(config.includes("[functions.playback-diagnostics-report]"), "A função de diagnóstico não está configurada.");
requireCheck(diagnostics.includes("x-device-credential"), "A função de diagnóstico não exige credencial do aparelho.");
requireCheck(diagnostics.includes("panel_playback_diagnostics"), "A função de diagnóstico não grava na tabela correta.");
requireCheck(fs.existsSync(".github/workflows/build-samsung-tizen-installer.yml"), "O workflow Samsung não existe.");

console.log(`Paridade estrutural LG/Samsung validada na versão ${internalVersion}.`);
