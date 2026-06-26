import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roneca-m3u-test-'));
const sourceTs = path.resolve('src/utils/m3u.ts');
const outJs = path.join(tmpDir, 'm3u.mjs');

execFileSync(
  'npx',
  [
    'esbuild',
    sourceTs,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--external:@/types',
    `--outfile=${outJs}`,
  ],
  { stdio: 'inherit' }
);

const { parseM3U, isLikelyM3U } = await import(`file://${outJs}`);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

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

const result = parseM3U(sample, 'test-list', 'http://servidor:80/get.php?username=user&password=pass&type=m3u_plus');

assert(result.channels.length === 2, `Esperava 2 canais, recebeu ${result.channels.length}.`);
assert(result.movies.length === 1, `Esperava 1 filme, recebeu ${result.movies.length}.`);
assert(result.series.length === 1, `Esperava 1 série, recebeu ${result.series.length}.`);

const [channel] = result.channels;
assert(channel.name === 'Canal Um', 'Canal deveria usar tvg-name com aspas simples.');
assert(channel.logo === 'https://cdn.exemplo/logo.png', 'Canal deveria ler tvg-logo sem aspas.');
assert(channel.groupTitle === 'Abertos', 'Canal deveria ler group-title com aspas simples.');
assert(channel.url.includes('/live/user/pass/1.ts'), 'Canal deveria preservar URL tocável após EXTVLCOPT.');

const adultChannel = result.channels.find(item => item.name === 'Adulto Teste');
assert(adultChannel, 'Conteúdo adulto vindo da M3U também deve ser listado.');
assert(adultChannel.groupTitle === 'Adultos 18+', 'Categoria adulta deve preservar o group-title original.');
assert(adultChannel.group === 'adultos-18', `Slug da categoria adulta inesperado: ${adultChannel.group}`);

const [movie] = result.movies;
assert(movie.name === 'Filme Teste', `Nome do filme limpo inesperado: ${movie.name}`);
assert(movie.year === 2024, `Ano do filme inesperado: ${movie.year}`);
assert(movie.duration === '2:00:00', `Duração do filme inesperada: ${movie.duration}`);

const [serie] = result.series;
assert(serie.name === 'Serie Legal', `Nome da série inesperado: ${serie.name}`);
assert(serie.seasons.length === 1, 'Série deveria ter uma temporada.');
assert(serie.seasons[0].number === 2, `Temporada inesperada: ${serie.seasons[0].number}`);
assert(serie.seasons[0].episodes[0].number === 3, `Episódio inesperado: ${serie.seasons[0].episodes[0].number}`);
assert(serie.seasons[0].episodes[0].duration === '30:00', `Duração do episódio inesperada: ${serie.seasons[0].episodes[0].duration}`);

console.log('✅ Parser M3U robusto validado.');
