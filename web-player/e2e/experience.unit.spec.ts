import { expect, test } from '@playwright/test';
import { recommendMovies, recommendSeries, selectHeroItems } from '../src/experience';
import type { WebMovie, WebSeries } from '../src/types';

const movies: WebMovie[] = [
  { contentId: 'm-a', contentKey: 'movie:a', type: 'movie', title: 'A', category: 'Ação' },
  { contentId: 'm-b', contentKey: 'movie:b', type: 'movie', title: 'B', category: 'Ação' },
  { contentId: 'm-c', contentKey: 'movie:c', type: 'movie', title: 'C', category: 'Drama' },
  { contentId: 'm-d', contentKey: 'movie:d', type: 'movie', title: 'D', category: 'Comédia' },
];
const series: WebSeries[] = [
  { contentId: 's-a', contentKey: 'series:a', type: 'series', title: 'SA', category: 'Drama' },
  { contentId: 's-b', contentKey: 'series:b', type: 'series', title: 'SB', category: 'Drama' },
  { contentId: 's-c', contentKey: 'series:c', type: 'series', title: 'SC', category: 'Comédia' },
];

test('hero é determinístico para a mesma sessão e limita a seis itens', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Unidade pura é executada uma vez no runner Chromium.');
  const first = selectHeroItems(movies, series, 'sessao-estavel', 6).map(item => item.contentId);
  const second = selectHeroItems([...movies].reverse(), [...series].reverse(), 'sessao-estavel', 6).map(item => item.contentId);
  expect(second).toEqual(first);
  expect(first).toHaveLength(6);
  expect(new Set(first).size).toBe(first.length);
  expect(first.some(id => id.startsWith('m-'))).toBeTruthy();
  expect(first.some(id => id.startsWith('s-'))).toBeTruthy();
});

test('recomendação de filme exclui atual, remove duplicados e prioriza categoria', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Unidade pura é executada uma vez no runner Chromium.');
  const current = movies[0];
  const duplicateByKey: WebMovie = { ...movies[1], contentId: 'm-b-duplicado' };
  const result = recommendMovies(current, [current, movies[2], duplicateByKey, movies[1], movies[3]], 12);
  expect(result.map(item => item.contentId)).not.toContain(current.contentId);
  expect(result.filter(item => item.contentKey === movies[1].contentKey)).toHaveLength(1);
  expect(result[0]?.category).toBe('Ação');
  expect(recommendMovies(current, [current, movies[2], movies[1], movies[3]], 12).map(item => item.contentKey))
    .toEqual(recommendMovies(current, [movies[3], movies[1], movies[2], current], 12).map(item => item.contentKey));
});

test('recomendação de série permanece no tipo série e prioriza mesma categoria', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Unidade pura é executada uma vez no runner Chromium.');
  const result = recommendSeries(series[0], series, 12);
  expect(result.every(item => item.type === 'series')).toBeTruthy();
  expect(result.map(item => item.contentId)).not.toContain(series[0].contentId);
  expect(result[0]?.category).toBe('Drama');
});
