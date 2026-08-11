import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "build", "webos");

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`LG-05: arquivo obrigatório ausente: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireToken(source, token, message) {
  if (!source.includes(token)) throw new Error(`LG-05: ${message}: ${token}`);
}

const app = read("src/App.tsx");
const movie = read("src/movie/MovieDetailScreen.tsx");
const series = read("src/series/SeriesDetailScreen.tsx");
const library = read("src/mediaLibrary.ts");
const recommendations = read("src/content/recommendations.ts");
const detailCss = read("src/detail.css");
const main = read("src/main.tsx");

for (const token of [
  "recommendedMovies(selectedMovie, catalog.data.movies)",
  "recommendedSeries(selectedSeries, catalog.data.series)",
  "seriesSeasonMemory",
  "resumableProgress(saved)",
  "history={library.history}",
  "selectedSeasonNumber={seriesSeasonMemory[contentKey]}"
]) requireToken(app, token, "integração VOD ausente no App");

for (const token of [
  "MIN_PROGRESS_SECONDS = 8",
  "COMPLETION_THRESHOLD_SECONDS = 45",
  "safeDuration - safePosition <= COMPLETION_THRESHOLD_SECONDS",
  "resumableProgress"
]) requireToken(library, token, "semântica de progresso divergente do Android");

for (const token of [
  "sameCategory(candidate.category, current.category) ? 140 : 0",
  "intersectionSize(currentCategory, candidateCategory) * 28",
  "intersectionSize(currentName, candidateName) * 36",
  "Math.min(intersectionSize(currentSynopsis, candidateSynopsis) * 3, 36)",
  "yearDistance <= 2 ? 10 : yearDistance <= 5 ? 6 : 0",
  "limit = 14"
]) requireToken(recommendations, token, "algoritmo de recomendação Android não reproduzido");

for (const token of [
  "progress?: LibraryItem",
  "Continuar assistindo",
  "canResume ? \"▶ Continuar\" : \"▶ Assistir agora\"",
  "Este título está sem uma origem de reprodução válida",
  "Títulos do mesmo estilo"
]) requireToken(movie, token, "detalhe de filme incompleto");

for (const token of [
  "history: LibraryItem[]",
  "selectedSeasonNumber?: number",
  "onSelectedSeasonChange",
  "if (embedded.length || !series.xtreamSeriesId) return",
  "Esta entrada M3U não contém temporadas ou episódios navegáveis.",
  "Continuar • ${percent}%",
  "seriesQueue: episodeQueue",
  "Séries do mesmo estilo"
]) requireToken(series, token, "detalhe de série incompleto");

for (const token of [
  ".movie-detail {",
  "overflow-y: auto",
  ".detail-progress",
  ".episode-progress",
  ".series-library",
  ".related-row"
]) requireToken(detailCss, token, "camada visual VOD incompleta");

const detailImport = main.indexOf('import "./detail.css"');
const navigationImport = main.indexOf('import "./navigation.css"');
if (detailImport < 0 || navigationImport < 0 || detailImport > navigationImport) {
  throw new Error("LG-05: detail.css deve carregar antes de navigation.css para preservar o foco LG-03.");
}

if (!fs.existsSync(output)) {
  throw new Error("LG-05: execute stage:webos/package:webos antes da validação do bundle.");
}
const assets = path.join(output, "assets");
const css = fs.readdirSync(assets).filter(name => name.endsWith(".css"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
const js = fs.readdirSync(assets).filter(name => name.endsWith(".js"))
  .map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");

for (const token of [".detail-progress", ".episode-progress", ".related-row"]) {
  requireToken(css, token, "regra VOD não chegou ao CSS empacotado");
}
for (const token of ["Continuar assistindo", "Você também pode gostar", "Nenhuma temporada disponível"]) {
  requireToken(js, token, "experiência VOD não chegou ao bundle final");
}

console.log("LG-05: filmes, séries, progresso, temporadas, episódios e recomendações validados no bundle webOS.");
