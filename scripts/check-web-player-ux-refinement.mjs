import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];

const requiredFiles = [
  'web-player/src/ExperienceApp.tsx',
  'web-player/src/experience.ts',
  'web-player/src/experience.css',
  'web-player/src/experience-a11y.css',
  'web-player/src/experienceAccessibility.tsx',
  'web-player/e2e/discovery.spec.ts',
  'scripts/check-web-player-budget.mjs',
  'web-player/UX_HOMOLOGATION.md',
  'web-player/public/brand/roneca_launch_video.mp4',
  'native-android/app/src/main/res/raw/roneca_launch_video.mp4',
];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`arquivo obrigatório ausente: ${file}`);
}

if (!failures.length) {
  const app = read('web-player/src/ExperienceApp.tsx');
  const discovery = read('web-player/src/experience.ts');
  const accessibility = read('web-player/src/experienceAccessibility.tsx');
  const css = `${read('web-player/src/experience.css')}\n${read('web-player/src/experience-a11y.css')}`;
  const e2e = read('web-player/e2e/discovery.spec.ts');
  const playerWrapper = read('web-player/src/player/WebPlayer.tsx');
  const vite = read('web-player/vite.config.ts');

  const contracts = [
    [app.includes('Array.from({ length: 26 }'), 'partículas ambientais não estão limitadas/determinísticas'],
    [app.includes('function LaunchSplash'), 'splash pós-login ausente'],
    [app.includes('currentTime >= 6.5'), 'crossfade do splash não inicia no marco aprovado'],
    [app.includes('const onDoneRef = useRef(onDone);') && app.includes('onDoneRef.current = onDone;') && app.includes('onDoneRef.current();'), 'fallback do splash voltou a depender de callback instável entre rerenders'],
    [app.includes('10_500') && app.includes('finish(260)'), 'fallback temporal do splash não garante saída em falha de ended/autoplay'],
    [app.includes('selectHeroItems(catalog.movies, catalog.series, sessionId, 6)'), 'hero não usa até seis itens estáveis por sessão'],
    [app.includes('}, 600);'), 'delay intencional de hover (~600 ms) ausente'],
    [app.includes('Você também pode gostar'), 'recomendações de filme ausentes'],
    [app.includes('Séries semelhantes'), 'recomendações de série ausentes'],
    [app.includes('role="tablist"') && app.includes('role="tabpanel"'), 'temporadas não usam semântica de tabs/panel'],
    [discovery.includes('stableHash') && discovery.includes('recommendMovies') && discovery.includes('recommendSeries'), 'seleção determinística de descoberta ausente'],
    [accessibility.includes("event.key === 'Escape'"), 'Escape não fecha overlays'],
    [accessibility.includes("event.key === 'ArrowRight'") && accessibility.includes("event.key === 'ArrowLeft'"), 'setas não controlam temporadas'],
    [accessibility.includes('target?.isConnected') && accessibility.includes('target.focus()'), 'retorno de foco não está protegido'],
    [css.includes('@media (hover: none), (pointer: coarse)'), 'touch/coarse pointer não possui política explícita'],
    [css.includes('@media (max-width: 1024px)') && css.includes('@media (max-width: 480px)'), 'breakpoints de responsividade refinada ausentes'],
    [css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion ausente na experiência'],
    [e2e.includes('login → splash → Home') && e2e.includes('temporadas suportam setas') && e2e.includes('mobile 390 px'), 'E2E dos novos fluxos está incompleto'],
    [e2e.includes('if (reducedMotion)') && e2e.includes("toBeHidden({ timeout: 3_000 })"), 'E2E reduced-motion voltou a depender de capturar o splash transitório'],
    [playerWrapper.includes("lazy(async () =>") && playerWrapper.includes("import('./WebPlayerCore')"), 'engine do player deixou de ser lazy'],
    [vite.includes("return 'media-engine'"), 'HLS não está isolado em chunk de mídia'],
  ];
  for (const [ok, message] of contracts) if (!ok) failures.push(message);

  const androidVideo = fs.readFileSync(path.join(root, 'native-android/app/src/main/res/raw/roneca_launch_video.mp4'));
  const webVideo = fs.readFileSync(path.join(root, 'web-player/public/brand/roneca_launch_video.mp4'));
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  if (digest(androidVideo) !== digest(webVideo)) failures.push('vídeo Web divergiu do blob oficial usado pelo APK');
}

if (failures.length) {
  console.error('Web Player UX refinement gate FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('✅ WEB-17–WEB-27: contratos de UX, acessibilidade, performance, E2E e identidade do splash validados.');
