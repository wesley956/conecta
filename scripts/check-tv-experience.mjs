import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const readIfExists = path => fs.existsSync(path) ? read(path) : '';
const app = read('smart-tv/src/App.tsx');
const contentShell = readIfExists('smart-tv/src/content/MainShell.tsx');
const contentCss = readIfExists('smart-tv/src/content.css');
const tvExperience = `${app}\n${contentShell}`;
const styles = `${read('smart-tv/src/experience.css')}\n${contentCss}`;
const player = read('smart-tv/src/player/PlayerScreen.tsx');
const androidHome = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/home/HomeScreen.kt');
const androidCatalog = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/catalog/CatalogListScreen.kt');
const androidSettings = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/settings/SettingsScreen.kt');
const androidActivation = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/activation/ActivationScreen.kt');
const androidPlayer = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/NativePlayerScreen.kt');
const androidSeriesPlayer = read('native-android/app/src/main/java/com/ronecaplaytv/nativeapp/ui/player/SeriesNativePlayerScreen.kt');

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

const homeContracts = [
  ['function HomeMediaSection', 'function HomeRow'],
  ['const discoveryCards = [', 'const discoveryCards = useMemo'],
  ['title="Para explorar agora"'],
  ['recentCards.length === 0 && favoriteCards.length === 0'],
  ['<small>{item.meta}</small>'],
  ['RONECA PLAYER TV'],
  ['Roneca Player TV'],
];

for (const alternatives of homeContracts) {
  requireCheck(alternatives.some(snippet => tvExperience.includes(snippet)), `Experiência da home Smart TV incompleta: ${alternatives.join(' | ')}`);
}

for (const snippet of [
  '--tv-safe-x: 32px',
  '--tv-safe-x: 48px',
  '--tv-safe-y: 18px',
  '--tv-safe-y: 24px',
  '.home-media-card small',
  '.media-card > strong',
  '-webkit-line-clamp: 2',
  'grid-auto-rows: 246px',
  '.player-overlay footer { right: var(--tv-safe-x)',
]) {
  requireCheck(styles.includes(snippet), `Proteção visual de TV ausente: ${snippet}`);
}

requireCheck((styles.match(/-webkit-line-clamp: 2/g) || []).length >= 4, 'Títulos longos precisam preservar duas linhas nos principais cards.');
requireCheck(styles.includes('@media (max-height: 800px)'), 'O hero precisa de ajuste tipográfico específico para 720p.');
requireCheck(styles.includes('font-size: 10px; letter-spacing: 1px'), 'O rótulo do destaque continua pequeno demais para TV.');
requireCheck(styles.includes('font-size: 9px;\n  font-weight: 900'), 'O selo de mídia continua pequeno demais para TV.');

for (const snippet of [
  'import com.ronecaplaytv.nativeapp.ui.components.FocusableActionCard',
  'text = "Acesso direto ao seu catálogo"',
  'destinations.forEach { destination ->',
  'modifier = Modifier.weight(1f).fillMaxHeight()',
  'text = "RONECA PLAYER TV"',
]) {
  requireCheck(androidHome.includes(snippet), `Paridade da home Android TV incompleta: ${snippet}`);
}

const visibleBrandSources = [app, contentShell, player, androidHome, androidCatalog, androidSettings, androidActivation, androidPlayer, androidSeriesPlayer];
for (const source of visibleBrandSources) {
  requireCheck(!source.includes('"RONECAPLAYTV'), 'Nome antigo RONECAPLAYTV ainda aparece em texto visível.');
  requireCheck(!source.includes('"RonecaPlayTV'), 'Nome antigo RonecaPlayTV ainda aparece em texto visível.');
}

console.log('✅ Experiência de TV validada: descoberta, safe area, duas linhas, tipografia, foco Android e marca.');