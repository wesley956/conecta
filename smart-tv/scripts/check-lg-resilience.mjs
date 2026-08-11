import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "build", "webos");

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-07: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireToken(source, token, message) {
  if (!source.includes(token)) throw new Error(`LG-07: ${message}: ${token}`);
}

const player = read("src/player/PlayerScreen.tsx");
const policy = read("src/player/failurePolicy.ts");
const catalog = read("src/catalog.ts");

for (const token of [
  "const RETRY_BACKOFF_MS = [2_000, 4_000, 8_000]",
  "STABLE_PLAYBACK_WINDOW_MS = 8_000",
  "STABLE_PROGRESS_SECONDS = 2",
  "HTTP_401",
  "HTTP_403",
  "HTTP_404",
  "MEDIA_UNSUPPORTED_FORMAT",
  "MEDIA_UNSUPPORTED_CODEC",
  "PLAYER_STALL"
]) requireToken(policy, token, "política de falha incompleta");

for (const token of [
  "recoveryLock.current",
  "retriesBySource.current",
  "retryDelayMs(retries)",
  "RECOVERY_SOURCE_SWITCH",
  "RECOVERY_PLAYLIST_FAILOVER",
  "sourceStartIndex",
  "item.urls.slice(sourceOffset)",
  "current.currentTime - stableStartPosition.current >= STABLE_PROGRESS_SECONDS",
  "elapsed < STABLE_PLAYBACK_WINDOW_MS",
  "smart-tv:${platform}:${random}"
]) requireToken(player, token, "orquestração de recovery incompleta");

if (player.includes("item.contentKey}:${Date.now()")) {
  throw new Error("LG-07: clientEventId ainda incorpora contentKey.");
}

const failoverStart = catalog.indexOf("const failover = useCallback");
const failoverEnd = catalog.indexOf("return { ...state", failoverStart);
if (failoverStart < 0 || failoverEnd < 0) throw new Error("LG-07: bloco de failover do catálogo não localizado.");
const failoverBody = catalog.slice(failoverStart, failoverEnd);
if (failoverBody.includes("reportPlaylistSuccess(candidate.id)")) {
  throw new Error("LG-07: lista reserva ainda é marcada como sucesso antes de playback estável.");
}
requireToken(catalog, "confirmPlaybackStable", "confirmação de saúde após playback estável ausente");
requireToken(catalog, "Validando reprodução", "estado intermediário de failover ausente");

if (!fs.existsSync(output)) throw new Error("LG-07: execute stage:webos/package:webos antes da validação do bundle.");
const assets = path.join(output, "assets");
const js = fs.readdirSync(assets).filter(name => name.endsWith(".js"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
for (const token of ["Alternando origem", "Ativando a lista reserva", "RECOVERY_SOURCE_SWITCH", "RECOVERY_PLAYLIST_FAILOVER"]) {
  requireToken(js, token, "experiência de recovery não chegou ao bundle final");
}

console.log("LG-07: classificação, backoff, source switch, failover serializado e janela estável validados no bundle webOS.");
