import test from "node:test";
import assert from "node:assert/strict";
import {
  canExitPlayer,
  decideProgressPersistence,
  filterMovies,
  initialSeasonNumber,
  matchesSearch,
  moveSeason,
  nativeVisualContract,
} from "../dist/index.js";

const series = {
  id: "series-1",
  name: "Série",
  coverUrl: null,
  category: "Drama",
  synopsis: null,
  xtreamSeriesId: null,
  seasons: [
    { number: 2, episodes: [] },
    { number: 1, episodes: [] },
    { number: 3, episodes: [] },
  ],
};

test("o contrato visual preserva a referência, as cores e medidas do Android", () => {
  assert.equal(nativeVisualContract.sourceVersionName, "2.2.1");
  assert.equal(nativeVisualContract.sourceVersionCode, 23);
  assert.equal(nativeVisualContract.colors.background, "#050505");
  assert.equal(nativeVisualContract.colors.primary, "#E8C768");
  assert.equal(nativeVisualContract.television.navigationRailWidth, 82);
  assert.equal(nativeVisualContract.television.moviesAndSeriesColumns, 6);
  assert.equal(nativeVisualContract.television.posterAspectRatio, 2 / 3);
});

test("a pesquisa compartilhada ignora caixa e acentos", () => {
  assert.equal(matchesSearch("Ação e Emoção", "acao"), true);
  assert.equal(matchesSearch("Notícias", "NOTI"), true);
  assert.equal(matchesSearch("Séries", "filme"), false);
});

test("o filtro de filmes respeita categoria, favoritos e pesquisa", () => {
  const movies = [
    {
      id: "1",
      name: "Filme de Ação",
      year: 2026,
      duration: null,
      synopsis: null,
      coverUrl: null,
      category: "Ação",
      primaryUrl: "https://example.test/1",
      playbackUrls: [],
    },
    {
      id: "2",
      name: "Drama",
      year: 2026,
      duration: null,
      synopsis: null,
      coverUrl: null,
      category: "Drama",
      primaryUrl: "https://example.test/2",
      playbackUrls: [],
    },
  ];

  const result = filterMovies(movies, {
    query: "acao",
    category: "Todos",
    allCategoryLabel: "Todos",
    favoritesCategoryLabel: "Minha Lista",
    continueCategoryLabel: "Continuar",
    favoriteIds: new Set(),
    startedIds: new Set(),
  });

  assert.deepEqual(result.map((movie) => movie.id), ["1"]);
});

test("temporadas são ordenadas e limitadas sem saltos", () => {
  assert.equal(initialSeasonNumber(series), 1);
  assert.equal(moveSeason(series, 1, 1)?.number, 2);
  assert.equal(moveSeason(series, 1, -1)?.number, 1);
  assert.equal(moveSeason(series, 3, 1)?.number, 3);
});

test("progresso concluído é removido e progresso parcial é salvo", () => {
  assert.equal(
    decideProgressPersistence("movie:1", 960_000, 1_000_000, 1).action,
    "remove",
  );
  assert.equal(
    decideProgressPersistence("movie:1", 400_000, 1_000_000, 1).action,
    "save",
  );
});

test("o player só sai por Voltar ou ativação no cabeçalho", () => {
  assert.equal(canExitPlayer("center", "playerControls"), false);
  assert.equal(canExitPlayer("pause", "playerHeader"), false);
  assert.equal(canExitPlayer("center", "playerHeader"), true);
  assert.equal(canExitPlayer("back", "playerProgress"), true);
});
