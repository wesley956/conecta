import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "build", "webos");

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-06: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireToken(source, token, message) {
  if (!source.includes(token)) throw new Error(`LG-06: ${message}: ${token}`);
}

const player = read("src/player/PlayerScreen.tsx");
const html5 = read("src/player/html5Player.ts");
const settings = read("src/playerSettings.ts");
const aspect = read("src/player/PlayerAspectControl.tsx");
const playerCss = read("src/player-v2.css");
const main = read("src/main.tsx");

for (const token of [
  "fetchChannelEpg",
  "↶ 10s",
  "10s ↷",
  "Áudio e legendas",
  "setChannelPanel(true)",
  "setEpisodePanel(true)",
  "setNextEpisodeCountdown(8)",
  "player.destroy()",
  "onProgress?.(finalSnapshot.currentTime, finalSnapshot.duration)"
]) requireToken(player, token, "capacidade essencial do player ausente");

for (const token of [
  "AUTO_RESUME_WINDOW_MS = 60_000",
  "video.autoplay = false",
  "this.suspendForLifecycle()",
  "restoreAfterLifecycle",
  "video.removeAttribute(\"src\")",
  "this.suspendedPosition",
  "elapsed <= AUTO_RESUME_WINDOW_MS"
]) requireToken(html5, token, "lifecycle webOS não segue LG-P04");

for (const token of [
  'SmartTvAspectMode = "Original" | "Preencher" | "Estender"',
  'aspectMode: "Original"',
  "readAspectModePreference",
  "setAspectModePreference"
]) requireToken(settings, token, "persistência de aspecto incompleta");

for (const token of [
  'const modes: SmartTvAspectMode[] = ["Original", "Preencher", "Estender"]',
  'data-tv-focusable="true"',
  "MutationObserver",
  "player-overlay.visible",
  "setAspectModePreference(next)"
]) requireToken(aspect, token, "controle de aspecto incompleto");

for (const token of [
  'body[data-player-aspect="Original"] .native-video { object-fit: contain; }',
  'body[data-player-aspect="Preencher"] .native-video { object-fit: cover; }',
  'body[data-player-aspect="Estender"] .native-video { object-fit: fill; }',
  ".player-aspect-control",
  ".player-overlay header",
  ".player-overlay footer",
  ".next-episode-card"
]) requireToken(playerCss, token, "camada visual Player 2.0 incompleta");

for (const token of [
  'import { PlayerAspectControl } from "./player/PlayerAspectControl";',
  'import "./player-v2.css";',
  "<PlayerAspectControl />"
]) requireToken(main, token, "Player 2.0 não montado na aplicação");

const playerCssImport = main.indexOf('import "./player-v2.css"');
const navigationImport = main.indexOf('import "./navigation.css"');
if (playerCssImport < 0 || navigationImport < 0 || playerCssImport > navigationImport) {
  throw new Error("LG-06: player-v2.css deve carregar antes de navigation.css para preservar o foco vermelho LG-03.");
}

if (!fs.existsSync(output)) {
  throw new Error("LG-06: execute stage:webos/package:webos antes da validação do bundle.");
}
const assets = path.join(output, "assets");
const css = fs.readdirSync(assets).filter(name => name.endsWith(".css"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
const js = fs.readdirSync(assets).filter(name => name.endsWith(".js"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");

for (const token of ["data-player-aspect", ".player-aspect-control", "object-fit:cover", "object-fit:fill"]) {
  requireToken(css, token, "regra Player 2.0 não chegou ao CSS empacotado");
}
for (const token of ["Original", "Preencher", "Estender", "Áudio e legendas", "PRÓXIMO EPISÓDIO"]) {
  requireToken(js, token, "experiência Player 2.0 não chegou ao bundle final");
}

console.log("LG-06: Player 2.0, aspecto, controles, tracks, drawers e lifecycle validados no bundle webOS.");
