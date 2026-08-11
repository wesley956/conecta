import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "build", "webos");

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-09: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireToken(source, token, message) {
  if (!source.includes(token)) throw new Error(`LG-09: ${message}: ${token}`);
}

const vite = read("vite.config.ts");
const main = read("src/main.tsx");
const app = read("src/App.tsx");
const shell = read("src/content/MainShell.tsx");
const compat = read("src/legacyCompat.ts");
const profile = read("src/performanceProfile.ts");
const series = read("src/series/SeriesDetailScreen.tsx");
const focus = read("src/focus.ts");
const html5 = read("src/player/html5Player.ts");
const stage = read("scripts/stage-platform.mjs");
const runbook = read("docs/LG-09-PERFORMANCE.md");

requireToken(vite, '"chrome53"', "baseline Chromium 53 não está congelado no build");
if (!main.trimStart().startsWith('import "./legacyCompat";')) {
  throw new Error("LG-09: legacyCompat deve ser o primeiro import da entrada Smart TV.");
}

for (const token of [
  "__RONECA_LEGACY_COMPAT__",
  '"flatMap"',
  '"flat"',
  '"padStart"',
  '"replaceAll"',
  "Object.entries",
  "Object.values",
  "Promise.prototype.finally",
  "CompatAbortController",
  "originalFetch"
]) requireToken(compat, token, "polyfill/runtime legacy incompleto");

for (const token of [
  'tier: "legacy"',
  "catalogPageSize: 30",
  "episodePageSize: 18",
  "searchLimitPerKind: 10",
  'tier: "standard"',
  "catalogPageSize: 42",
  "episodePageSize: 24",
  'tier: "modern"',
  "catalogPageSize: 60",
  "episodePageSize: 36",
  "searchLimitPerKind: 20"
]) requireToken(profile, token, "perfil adaptativo incompleto");

requireToken(app, "SMART_TV_PERFORMANCE_PROFILE.catalogPageSize", "App não aplica o page size do tier");
for (const token of [
  "SMART_TV_PERFORMANCE_PROFILE.searchLimitPerKind",
  "pageCount",
  "pageStart",
  "Página anterior",
  "Carregar mais",
  "filteredCards.slice(pageStart, pageStart + pageSize)",
  'selected !== "Início"'
]) requireToken(shell, token, "catálogo/Home ainda não estão limitados pelo perfil");

for (const token of [
  "SMART_TV_PERFORMANCE_PROFILE.episodePageSize",
  "episodePage",
  "visibleEpisodes",
  "buildEpisodeQueue",
  "Próximos episódios"
]) requireToken(series, token, "séries grandes ainda não estão limitadas");

requireToken(focus, "bestScore", "D-pad ainda não usa seleção linear");
requireToken(focus, "lanePenalty", "score LG-03 precisa preservar penalidade de faixa");
if (focus.includes(".sort((a, b) => a.score - b.score)")) {
  throw new Error("LG-09: D-pad voltou a ordenar todos os candidatos a cada tecla.");
}

for (const token of [
  "this.cleanups.forEach",
  "this.cleanups = []",
  "this.video?.remove()",
  "this.video = null"
]) requireToken(html5, token, "liberação do player HTML5 incompleta");

for (const token of [
  "classicizeWebOsEntry",
  "validateClassicWebOsBundle",
  "ES Modules, incompatível com Chromium 53"
]) requireToken(stage, token, "entrada webOS clássica não está protegida");

for (const token of [
  "webOS 4.x",
  "Chromium 53",
  "Resource Monitor",
  "ares-device",
  "30 minutos",
  "LG-10"
]) requireToken(runbook, token, "runbook físico incompleto");

const forbiddenWithoutPolyfill = [
  ["Object.fromEntries(", "Object.fromEntries"],
  ["Promise.allSettled(", "Promise.allSettled"],
  ["Promise.any(", "Promise.any"],
  [".matchAll(", "String.matchAll"],
  ["structuredClone(", "structuredClone"],
  ["queueMicrotask(", "queueMicrotask"]
];

function walk(directory) {
  const files = [];
  for (const name of fs.readdirSync(directory)) {
    const target = path.join(directory, name);
    const stat = fs.statSync(target);
    if (stat.isDirectory()) files.push(...walk(target));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(name)) files.push(target);
  }
  return files;
}

const sources = walk(path.join(root, "src"));
for (const file of sources) {
  const source = fs.readFileSync(file, "utf8");
  for (const [needle, api] of forbiddenWithoutPolyfill) {
    if (source.includes(needle)) {
      throw new Error(`LG-09: ${path.relative(root, file)} usa ${api}, não garantido no Chromium 53.`);
    }
  }
}

if (!fs.existsSync(output)) throw new Error("LG-09: execute stage:webos/package:webos antes do gate.");
const packagedHtml = fs.readFileSync(path.join(output, "index.html"), "utf8");
if (/\btype=["']module["']/i.test(packagedHtml) || /\brel=["']modulepreload["']/i.test(packagedHtml)) {
  throw new Error("LG-09: index.html empacotado ainda exige ESM/modulepreload.");
}

const assetRoot = path.join(output, "assets");
const javascript = fs.readdirSync(assetRoot)
  .filter(name => name.endsWith(".js"))
  .map(name => fs.readFileSync(path.join(assetRoot, name), "utf8"))
  .join("\n");
requireToken(javascript, "webos4-chrome53", "compatibilidade legacy não chegou ao bundle final");
if (/\bimport\.meta\b/.test(javascript) || /\bimport\s*\(/.test(javascript)) {
  throw new Error("LG-09: bundle final ainda contém dependência ESM dinâmica.");
}

console.log("LG-09: Chromium 53, entrada clássica, perfis de hardware, catálogo/episódios limitados, D-pad linear e cleanup do player validados no bundle webOS.");