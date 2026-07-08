#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path.cwd()

def p(path: str) -> Path:
    return ROOT / path

def read(path: str) -> str:
    return p(path).read_text(encoding="utf-8")

def write(path: str, text: str):
    p(path).write_text(text, encoding="utf-8")
    print(f"OK: {path}")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        print(f"AVISO: trecho não encontrado, pulando: {label}")
        return text
    print(f"OK: {label}")
    return text.replace(old, new, 1)

# ============================================================
# 1) App.tsx — parar revalidação do painel a cada troca de tela
#    e remover keydown global duplicado que atrapalha o Player.
# ============================================================
app_path = "src/App.tsx"
app = read(app_path)

app = replace_once(
    app,
    "import { useEffect, useCallback, useRef } from 'react';",
    "import { useEffect, useRef } from 'react';",
    "remover useCallback do App",
)

if "lastPanelSyncAtRef" not in app:
    app = replace_once(
        app,
        "function DevicePanelSync() {\n  const syncingRef = useRef(false);",
        "function DevicePanelSync() {\n  const syncingRef = useRef(false);\n  const lastPanelSyncAtRef = useRef(0);",
        "adicionar controle de cooldown do painel",
    )

if "RONECA_PANEL_SYNC_COOLDOWN_MS" not in app:
    app = app.replace(
        "// ===== DEVICE PANEL AUTO SYNC =====\n",
        "const RONECA_PANEL_SYNC_COOLDOWN_MS = 5 * 60 * 1000;\n\n// ===== DEVICE PANEL AUTO SYNC =====\n",
        1,
    )
    print("OK: constante de cooldown do painel")

cooldown_old = """    if (!isDevicePanelEnabled()) return;
    if (currentScreen === 'player') return;
    if (syncingRef.current) return;

    let cancelled = false;
"""
cooldown_new = """    if (!isDevicePanelEnabled()) return;
    if (currentScreen === 'player') return;
    if (syncingRef.current) return;

    const gateScreens: AppState[] = ['splash', 'activation', 'blocked', 'expired', 'nointernet'];
    const shouldBypassCooldown = gateScreens.includes(currentScreen);
    const now = Date.now();

    if (!shouldBypassCooldown && now - lastPanelSyncAtRef.current < RONECA_PANEL_SYNC_COOLDOWN_MS) {
      return;
    }

    lastPanelSyncAtRef.current = now;

    let cancelled = false;
"""
app = replace_once(app, cooldown_old, cooldown_new, "aplicar cooldown no sync do painel")

app = re.sub(
    r"\n\s*// Keyboard navigation for TV remote control\n\s*const handleKeyDown = useCallback\([\s\S]*?\n\s*}, \[handleKeyDown\]\);\n\n\s*// Detect UI mode changes",
    "\n  // Detect UI mode changes",
    app,
    count=1,
)
print("OK: remover keydown global duplicado do App, se existia")

write(app_path, app)

# ============================================================
# 2) useTvRemoteNavigation.ts — não interferir no Player.
# ============================================================
nav_path = "src/hooks/useTvRemoteNavigation.ts"
nav = read(nav_path)

if "if (currentScreen === 'player') return;" not in nav:
    nav = replace_once(
        nav,
        "      if (isTypingElement(active)) return;\n",
        "      if (isTypingElement(active)) return;\n\n      if (currentScreen === 'player') return;\n",
        "ignorar navegação global dentro do player",
    )
else:
    print("OK: navegação global já ignora player")

write(nav_path, nav)

# ============================================================
# 3) PlayerScreen.tsx — sem tela cheia automática, controle por controle remoto,
#    menos buffer pesado e preferência por HLS antes de MPEG-TS.
# ============================================================
player_path = "src/screens/PlayerScreen.tsx"
player = read(player_path)

player = replace_once(
    player,
    """function buildPlaybackUrlVariants(rawUrl: string) {
  const url = rawUrl.trim();

  if (!url) return [];

  const variants = [url];

  if (/\\.(ts|m2ts|mpegts)(\\?|#|$)/i.test(url)) {
    variants.push(replaceKnownMediaExtension(url, 'm3u8'));
  }

  if (/\\.m3u8(\\?|#|$)/i.test(url)) {
    variants.push(replaceKnownMediaExtension(url, 'ts'));
  }

  return [...new Set(variants)];
}
""",
    """function buildPlaybackUrlVariants(rawUrl: string) {
  const url = rawUrl.trim();

  if (!url) return [];

  const variants: string[] = [];

  // Em muitas listas Xtream, a mesma fonte existe em .ts e .m3u8.
  // TV Box costuma travar menos em HLS, então tentamos .m3u8 primeiro.
  if (/\\.(ts|m2ts|mpegts)(\\?|#|$)/i.test(url)) {
    variants.push(replaceKnownMediaExtension(url, 'm3u8'), url);
  } else if (/\\.m3u8(\\?|#|$)/i.test(url)) {
    variants.push(url, replaceKnownMediaExtension(url, 'ts'));
  } else {
    variants.push(url);
  }

  return [...new Set(variants)];
}
""",
    "priorizar HLS antes de MPEG-TS",
)

player = replace_once(
    player,
    "                enableStashBuffer: true,\n                lazyLoad: false,\n                liveBufferLatencyMaxLatency: isLive ? 8 : 5,\n                stashInitialSize: isLive ? 1024 * 1024 : 512 * 1024,\n                autoCleanupSourceBuffer: true,\n                autoCleanupMaxBackwardDuration: 12,\n                autoCleanupMinBackwardDuration: 6,",
    "                enableStashBuffer: !isLive,\n                lazyLoad: false,\n                liveBufferLatencyMaxLatency: isLive ? 5 : 5,\n                stashInitialSize: isLive ? 384 * 1024 : 512 * 1024,\n                autoCleanupSourceBuffer: true,\n                autoCleanupMaxBackwardDuration: 8,\n                autoCleanupMinBackwardDuration: 4,",
    "reduzir buffer MPEG-TS para TV Box",
)

player = replace_once(
    player,
    "            backBufferLength: isLive ? 15 : 30,\n            maxBufferLength: isLive ? 35 : 45,\n            maxMaxBufferLength: isLive ? 70 : 90,\n            maxBufferSize: 60 * 1000 * 1000,\n            maxBufferHole: 0.5,",
    "            backBufferLength: isLive ? 6 : 18,\n            maxBufferLength: isLive ? 14 : 28,\n            maxMaxBufferLength: isLive ? 28 : 56,\n            maxBufferSize: 30 * 1000 * 1000,\n            maxBufferHole: 0.4,",
    "reduzir buffer HLS para aparelhos fracos",
)

player = re.sub(
    r"\n\s*useEffect\(\(\) => \{\n\s*if \(!content\?\.id\) return;\n\n\s*const autoFullscreenTimer = window\.setTimeout\(\(\) => \{\n\s*const container = playerShellRef\.current \|\| videoRef\.current\?\.parentElement;\n\n\s*if \(!container \|\| document\.fullscreenElement\) return;\n\n\s*container\.requestFullscreen\?\.\(\)\.catch\(\(\) => undefined\);\n\s*\}, 180\);\n\n\s*return \(\) => window\.clearTimeout\(autoFullscreenTimer\);\n\s*\}, \[content\?\.id\]\);\n",
    "\n",
    player,
    count=1,
)
print("OK: remover tela cheia automática do player, se existia")

player = replace_once(
    player,
    "  const goBack = () => setScreen(isLive ? 'channels' : currentSeries ? 'series' : 'movies');",
    """  const goBack = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }

    setShowControls(true);
    setShowSettings(false);
    setShowList(false);
    setScreen(isLive ? 'channels' : currentSeries ? 'series' : 'movies');
  }, [currentSeries, isLive, setScreen]);""",
    "goBack robusto no player",
)

player = replace_once(
    player,
    "                      window.location.reload();",
    "                      recoverPlayback();",
    "evitar reload total ao tentar novamente no player",
)

if "controle remoto exclusivo do player" not in player:
    key_effect = """
  useEffect(() => {
    const handlePlayerKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const stop = () => {
        event.preventDefault();
        event.stopPropagation();
        (event as any).stopImmediatePropagation?.();
      };

      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack') {
        stop();
        goBack();
        return;
      }

      if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === ' ') {
        stop();

        if (!showControls) {
          setShowControls(true);
          return;
        }

        togglePlayPause();
        return;
      }

      if (event.key === 'ArrowLeft') {
        stop();
        setShowControls(true);

        if (!isLive) {
          seekBy(-10);
        }

        return;
      }

      if (event.key === 'ArrowRight') {
        stop();
        setShowControls(true);

        if (!isLive) {
          seekBy(10);
        }

        return;
      }

      if (event.key === 'ArrowUp') {
        stop();
        setShowControls(true);
        return;
      }

      if (event.key === 'ArrowDown') {
        stop();
        setShowSettings(false);
        setShowControls(current => !current);
      }
    };

    // controle remoto exclusivo do player
    window.addEventListener('keydown', handlePlayerKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handlePlayerKeyDown, true);
    };
  }, [goBack, isLive, showControls, duration]);
"""
    player = replace_once(
        player,
        "  const handlePlayerSurfaceClick = () => {\n    setShowSettings(false);\n    setShowControls(true);\n  };\n",
        "  const handlePlayerSurfaceClick = () => {\n    setShowSettings(false);\n    setShowControls(true);\n  };\n" + key_effect,
        "adicionar controle remoto exclusivo do player",
    )
else:
    print("OK: controle remoto exclusivo do player já existe")

write(player_path, player)

# ============================================================
# 4) MoviesScreen.tsx — detalhe estilo streaming/backdrop.
# ============================================================
movies_path = "src/screens/MoviesScreen.tsx"
movies = read(movies_path)

movies = replace_once(
    movies,
    '          <div className="fixed inset-0 z-[120] bg-black/72 backdrop-blur-md" onClick={() => setSelectedMovie(null)}>',
    """          <div
            className="roneca-detail-backdrop fixed inset-0 z-[120] overflow-hidden bg-black"
            style={{ '--roneca-detail-bg': selectedMovie.cover ? `url(${selectedMovie.cover})` : 'none' } as any}
            onClick={() => setSelectedMovie(null)}
          >""",
    "melhorar backdrop de detalhe de filme",
)

movies = replace_once(
    movies,
    '              className="absolute inset-x-4 bottom-4 top-4 overflow-hidden rounded-3xl border border-white/10 bg-[#06111f]/95 shadow-2xl md:inset-x-10"',
    '              className="roneca-detail-panel absolute inset-0 overflow-hidden"',
    "painel cinematográfico de filme",
)

movies = replace_once(
    movies,
    '                <div className="relative h-52 shrink-0 bg-black/30 md:h-full md:w-[34%]">',
    '                <div className="roneca-detail-poster relative h-52 shrink-0 bg-black/30 md:h-full md:w-[34%]">',
    "poster de filme estilo streaming",
)

movies = replace_once(
    movies,
    '                <div className="flex min-h-0 flex-1 flex-col p-5 md:p-7">',
    '                <div className="roneca-detail-content flex min-h-0 flex-1 flex-col p-5 md:p-7">',
    "conteúdo de detalhe de filme",
)

write(movies_path, movies)

# ============================================================
# 5) SeriesScreen.tsx — detalhe estilo streaming/backdrop.
# ============================================================
series_path = "src/screens/SeriesScreen.tsx"
series = read(series_path)

series = replace_once(
    series,
    """          <div
            className="fixed inset-0 z-[120] bg-black/72 backdrop-blur-md"
            onClick={closeSeriesDetail}
          >""",
    """          <div
            className="roneca-detail-backdrop fixed inset-0 z-[120] overflow-hidden bg-black"
            style={{ '--roneca-detail-bg': seriesDetail.item.cover ? `url(${seriesDetail.item.cover})` : 'none' } as any}
            onClick={closeSeriesDetail}
          >""",
    "melhorar backdrop de detalhe de série",
)

series = replace_once(
    series,
    '              className="absolute inset-x-4 bottom-4 top-4 overflow-hidden rounded-3xl border border-white/10 bg-[#06111f]/95 shadow-2xl md:inset-x-10"',
    '              className="roneca-detail-panel absolute inset-0 overflow-hidden"',
    "painel cinematográfico de série",
)

series = replace_once(
    series,
    '                <div className="relative h-48 shrink-0 bg-black/30 md:h-full md:w-[32%]">',
    '                <div className="roneca-detail-poster relative h-48 shrink-0 bg-black/30 md:h-full md:w-[32%]">',
    "poster de série estilo streaming",
)

series = replace_once(
    series,
    '                <div className="flex min-h-0 flex-1 flex-col p-5 md:p-7">',
    '                <div className="roneca-detail-content flex min-h-0 flex-1 flex-col p-5 md:p-7">',
    "conteúdo de detalhe de série",
)

write(series_path, series)

# ============================================================
# 6) CSS — sidebar recolhida, detalhes e player mais TV-friendly.
# ============================================================
css_path = "src/index.css"
css = read(css_path)

css_patch = r"""
/* ===== Roneca TV UX fixes: menu recolhido, detalhe e player ===== */

.roneca-side-menu {
  width: 96px !important;
  overflow: hidden !important;
  transition: width 180ms ease, box-shadow 180ms ease;
}

.roneca-side-logo {
  justify-content: center !important;
  padding: 0 !important;
}

.roneca-side-logo-text {
  display: none !important;
}

.roneca-side-button {
  justify-content: center !important;
  gap: 0 !important;
  padding: 0.75rem 0 !important;
}

.roneca-side-label {
  display: none !important;
}

.roneca-side-icon {
  height: 44px !important;
  width: 44px !important;
  flex-basis: 44px !important;
  background: transparent !important;
}

.roneca-page,
.clean-tv-page {
  padding-left: 118px !important;
}

.clean-tv-categories {
  max-width: 300px;
}

.tv-focusable:focus-visible {
  outline: none !important;
  border-color: rgba(255, 255, 255, 0.92) !important;
  box-shadow:
    0 0 0 3px rgba(56, 189, 248, 0.42),
    0 0 34px rgba(56, 189, 248, 0.34) !important;
  transform: scale(1.018);
}

.roneca-detail-backdrop::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--roneca-detail-bg);
  background-position: center;
  background-size: cover;
  opacity: 0.36;
  filter: blur(2px) saturate(1.05);
  transform: scale(1.03);
}

.roneca-detail-backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(2, 6, 23, 0.98) 0%, rgba(2, 6, 23, 0.78) 44%, rgba(2, 6, 23, 0.42) 100%),
    linear-gradient(0deg, rgba(2, 6, 23, 0.98) 0%, rgba(2, 6, 23, 0.42) 42%, rgba(2, 6, 23, 0.86) 100%);
}

.roneca-detail-panel {
  z-index: 1;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.roneca-detail-panel > .flex {
  height: 100%;
  padding: clamp(1.4rem, 4vw, 4rem) clamp(1.2rem, 5vw, 5.2rem);
  gap: clamp(1.5rem, 4vw, 4.5rem);
  align-items: center;
}

.roneca-detail-poster {
  width: min(31vw, 340px) !important;
  height: min(78vh, 560px) !important;
  border-radius: 1.35rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.56);
}

.roneca-detail-poster img {
  object-fit: cover !important;
}

.roneca-detail-content {
  max-width: min(58vw, 900px);
  justify-content: center;
}

.roneca-detail-content h2 {
  font-size: clamp(2.8rem, 5.8vw, 5.8rem) !important;
  line-height: 0.95 !important;
  font-weight: 300 !important;
  letter-spacing: -0.045em;
  text-shadow: 0 14px 60px rgba(0, 0, 0, 0.72);
}

.roneca-detail-content p {
  text-shadow: 0 10px 42px rgba(0, 0, 0, 0.58);
}

.roneca-detail-content button {
  min-height: 48px;
}

.roneca-detail-content .rounded-full.bg-sky-400,
.roneca-detail-content button.bg-sky-400 {
  background: rgba(255, 255, 255, 0.94) !important;
  color: #111827 !important;
}

.roneca-detail-content .grid button,
.roneca-detail-content button.rounded-xl {
  border-radius: 0.42rem !important;
}

.roneca-exoplayer-shell {
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
}

.roneca-exoplayer-video {
  background: #000 !important;
}

.roneca-exoplayer-top {
  z-index: 60 !important;
}

.roneca-exoplayer-back {
  min-width: 72px;
  min-height: 72px;
}

.player-bottom-panel {
  background: linear-gradient(180deg, rgba(6, 10, 18, 0.46), rgba(6, 10, 18, 0.82)) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.player-progress {
  background:
    linear-gradient(90deg, rgba(35,150,242,0.95), rgba(84,196,255,0.95)) 0 / var(--player-progress-value, var(--progress-fill, 50%)) 100% no-repeat,
    rgba(255,255,255,0.18) !important;
}

@media (max-width: 900px), (hover: none) and (pointer: coarse) {
  .roneca-side-menu {
    width: 82px !important;
  }

  .roneca-page,
  .clean-tv-page {
    padding-left: 96px !important;
  }

  .roneca-detail-panel > .flex {
    padding: 1rem 1.25rem;
    gap: 1rem;
  }

  .roneca-detail-poster {
    width: min(34vw, 250px) !important;
    height: min(72vh, 420px) !important;
  }

  .roneca-detail-content {
    max-width: none;
  }

  .roneca-detail-content h2 {
    font-size: clamp(2.1rem, 6vw, 4.2rem) !important;
  }
}
"""

if "Roneca TV UX fixes" not in css:
    css = css.rstrip() + "\n\n" + css_patch + "\n"
    print("OK: adicionar CSS de UX TV")
else:
    print("OK: CSS de UX TV já existe")

write(css_path, css)

print("\nCorreções aplicadas.")
print("Agora rode:")
print("npm run typecheck")
print("npm run verify")
