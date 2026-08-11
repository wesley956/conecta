import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "build", "webos");

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-03: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

const app = read("src/App.tsx");
const focus = read("src/focus.ts");
const movie = read("src/movie/MovieDetailScreen.tsx");
const series = read("src/series/SeriesDetailScreen.tsx");
const main = read("src/main.tsx");
const navigationCss = read("src/navigation.css");

const expectedMenu = ["Início", "Buscar", "Canais", "Filmes", "Séries", "Configurações"];
const menuStart = app.indexOf("const destinations = [");
const menuEnd = app.indexOf("];", menuStart);
if (menuStart < 0 || menuEnd < 0) throw new Error("LG-03: menu principal não encontrado em App.tsx.");
const menuBlock = app.slice(menuStart, menuEnd);
let previousIndex = -1;
for (const label of expectedMenu) {
  const index = menuBlock.indexOf(`label: \"${label}\"`);
  if (index < 0 || index <= previousIndex) throw new Error(`LG-03: destino obrigatório ausente ou fora de ordem: ${label}.`);
  previousIndex = index;
}
if (menuBlock.includes('label: "Minha lista"')) {
  throw new Error("LG-03: Minha lista voltou ao menu principal; ela deve permanecer como área de conteúdo, não destino principal.");
}

for (const token of [
  'data-focus-key={`nav:${item.label}`}',
  'data-focus-key="search:global"',
  'rememberFocus("playback-return")',
  'restoreFocus("app-return")',
  'restoreFocus("dialog-return")'
]) {
  if (!app.includes(token)) throw new Error(`LG-03: contrato de navegação ausente em App.tsx: ${token}`);
}

for (const token of ["focusMemory", "isVisible", "restoreFocus", "focusAutofocus", "lanePenalty", "scrollIntoView"]) {
  if (!focus.includes(token)) throw new Error(`LG-03: motor de foco incompleto: ${token}`);
}

if (!movie.includes('restoreFocus("playback-return"')) {
  throw new Error("LG-03: detalhe de filme não restaura foco após o player.");
}
if (!series.includes('restoreFocus("playback-return"')) {
  throw new Error("LG-03: detalhe de série não restaura foco após o player.");
}
if (!main.includes('import "./navigation.css"')) {
  throw new Error("LG-03: navigation.css não está carregado como camada final.");
}
for (const token of ["--roneca-focus-ring", ".nav-item:focus", ".media-card:focus", "var(--roneca-red-focus)"]) {
  if (!navigationCss.includes(token)) throw new Error(`LG-03: regra visual de foco ausente: ${token}`);
}

if (!fs.existsSync(output)) {
  throw new Error("LG-03: execute stage:webos/package:webos antes da validação do bundle.");
}
const assets = path.join(output, "assets");
const css = fs.readdirSync(assets).filter(name => name.endsWith(".css"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
const js = fs.readdirSync(assets).filter(name => name.endsWith(".js"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");

for (const token of ["--roneca-focus-ring", ".nav-item:focus", ".media-card:focus"]) {
  if (!css.includes(token)) throw new Error(`LG-03: regra ${token} não chegou ao CSS empacotado.`);
}
for (const label of expectedMenu) {
  if (!js.includes(label)) throw new Error(`LG-03: destino ${label} não chegou ao bundle final.`);
}
if (!js.includes("playback-return") || !js.includes("app-return")) {
  throw new Error("LG-03: memória de retorno de foco não chegou ao bundle final.");
}

console.log("LG-03: menu, D-pad, foco vermelho e restauração de foco validados no bundle webOS.");
