import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roneca-m3u-test-'));

function compileModule(source, output) {
  execFileSync(
    'npx',
    [
      'esbuild',
      path.resolve(source),
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--external:@/types',
      `--outfile=${output}`,
    ],
    { stdio: 'inherit' },
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const parserOutput = path.join(tmpDir, 'm3u.mjs');
  const normalizerOutput = path.join(tmpDir, 'normalize-m3u.mjs');

  compileModule('tooling/m3u/m3u.ts', parserOutput);
  compileModule('tooling/m3u/normalizeM3U.ts', normalizerOutput);

  const { parseM3U, isLikelyM3U } = await import(`file://${parserOutput}`);
  const { normalizeM3UInput } = await import(`file://${normalizerOutput}`);

  const sample = `#EXTM3U
#EXTINF:-1 tvg-id=canal1 tvg-name='Canal Um' tvg-logo=https://cdn.exemplo/logo.png group-title='Abertos',Canal Um
#EXTVLCOPT:http-user-agent=VLC
http://servidor/live/user/pass/1.ts

#EXTINF:7200 tvg-name="Filme Teste (2024)" tvg-logo="https://cdn.exemplo/filme.jpg" group-title="Filmes | Ação",Filme Teste (2024)
#EXTGRP:Filmes
http://servidor/movie/user/pass/99.mp4

#EXTINF:1800 tvg-name='Serie Legal S02E03' tvg-logo='https://cdn.exemplo/serie.jpg' group-title='Séries | Drama',Serie Legal S02E03
#KODIPROP:inputstream=inputstream.adaptive
http://servidor/series/user/pass/222.mp4

#EXTINF:-1 tvg-name='Adulto Teste' tvg-logo='https://cdn.exemplo/adulto.png' group-title='Adultos 18+',Adulto Teste
http://servidor/live/user/pass/18.ts
`;

  assert(isLikelyM3U(sample), 'isLikelyM3U deveria reconhecer a lista.');

  const result = parseM3U(
    sample,
    'test-list',
    'http://servidor:80/get.php?username=user&password=pass&type=m3u_plus',
  );

  assert(result.channels.length === 2, `Esperava 2 canais, recebeu ${result.channels.length}.`);
  assert(result.movies.length === 1, `Esperava 1 filme, recebeu ${result.movies.length}.`);
  assert(result.series.length === 1, `Esperava 1 série, recebeu ${result.series.length}.`);

  const [channel] = result.channels;
  assert(channel.name === 'Canal Um', 'Canal deveria usar tvg-name com aspas simples.');
  assert(channel.epgId === 'canal1', 'Canal deveria preservar tvg-id.');
  assert(channel.logo === 'https://cdn.exemplo/logo.png', 'Canal deveria ler tvg-logo sem aspas.');
  assert(channel.groupTitle === 'Abertos', 'Canal deveria ler group-title com aspas simples.');
  assert(channel.url.includes('/live/user/pass/1.ts'), 'Canal deveria preservar URL após EXTVLCOPT.');

  const [movie] = result.movies;
  assert(movie.name === 'Filme Teste', `Nome do filme limpo inesperado: ${movie.name}`);
  assert(movie.year === 2024, `Ano do filme inesperado: ${movie.year}`);
  assert(movie.duration === '2:00:00', `Duração do filme inesperada: ${movie.duration}`);

  const [serie] = result.series;
  assert(serie.name === 'Serie Legal', `Nome da série inesperado: ${serie.name}`);
  assert(serie.seasons[0].number === 2, `Temporada inesperada: ${serie.seasons[0].number}`);
  assert(serie.seasons[0].episodes[0].number === 3, `Episódio inesperado: ${serie.seasons[0].episodes[0].number}`);
  assert(serie.seasons[0].episodes[0].duration === '30:00', 'Duração do episódio deveria ser 30:00.');

  const dirtyInput = '\uFEFF#extm3u\r' +
    '#extinf : -1 tvg-id="lower-1" tvg-name="Canal Baixo" group-title="Teste",Canal Baixo\r' +
    '#EXTVLCOPT:http-referrer=https://referer.exemplo\r' +
    '\u0000http://servidor/live/user/pass/33.ts\r';
  const normalizedInput = normalizeM3UInput(dirtyInput);

  assert(!normalizedInput.startsWith('\uFEFF'), 'Normalização deveria remover BOM.');
  assert(!normalizedInput.includes('\r'), 'Normalização deveria converter CR para LF.');
  assert(!normalizedInput.includes('\u0000'), 'Normalização deveria remover NUL.');
  assert(normalizedInput.startsWith('#EXTM3U\n'), 'Cabeçalho em caixa baixa deveria ser normalizado.');
  assert(normalizedInput.includes('#EXTINF: -1'), 'EXTINF em caixa baixa deveria ser normalizado.');

  const normalizedResult = parseM3U(normalizedInput, 'normalized-list');
  assert(normalizedResult.channels.length === 1, 'Lista normalizada deveria produzir um canal.');
  assert(normalizedResult.channels[0].name === 'Canal Baixo', 'Nome da entrada normalizada incorreto.');
  assert(normalizedResult.channels[0].epgId === 'lower-1', 'tvg-id da entrada normalizada incorreto.');

  const largeCount = 10_000;
  const largeLines = ['#EXTM3U'];
  for (let index = 1; index <= largeCount; index += 1) {
    largeLines.push(
      `#EXTINF:-1 tvg-id="ch-${index}" tvg-name="Canal ${index}" group-title="Carga",Canal ${index}`,
      `http://servidor/live/user/pass/${index}.ts`,
    );
  }

  const largeResult = parseM3U(largeLines.join('\n'), 'large-list');
  assert(
    largeResult.channels.length === largeCount,
    `Lista grande deveria produzir ${largeCount} canais; recebeu ${largeResult.channels.length}.`,
  );
  assert(largeResult.movies.length === 0, 'Lista grande não deveria criar filmes.');
  assert(largeResult.series.length === 0, 'Lista grande não deveria criar séries.');

  console.log('✅ Parser M3U validado: base, normalização e 10 mil canais.');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
