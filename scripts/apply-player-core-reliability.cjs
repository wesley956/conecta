const fs = require('fs');
const path = require('path');

const playerPath = path.join(
  process.cwd(),
  'src',
  'screens',
  'PlayerV2Screen.tsx',
);

let source = fs.readFileSync(playerPath, 'utf8');

function replaceOnce(label, before, after) {
  const occurrences = source.split(before).length - 1;

  if (occurrences === 0) {
    if (source.includes(after)) {
      console.log(`✓ ${label}: já aplicado`);
      return;
    }

    throw new Error(`${label}: trecho esperado não encontrado.`);
  }

  if (occurrences !== 1) {
    throw new Error(`${label}: encontrado ${occurrences} vezes; migração interrompida.`);
  }

  source = source.replace(before, after);
  console.log(`✓ ${label}`);
}

replaceOnce(
  'constantes de estabilidade longa',
  `const MAX_RECOVERY_ATTEMPTS = 6;\nconst PLAYER_MEDIA_PREFS_KEY = 'ronecaplaytv-player-media-v1';`,
  `const MAX_RECOVERY_ATTEMPTS = 6;\nconst STABLE_PLAYBACK_RESET_MS = 20_000;\nconst LIVE_WATCHDOG_INTERVAL_MS = 4_000;\nconst LIVE_STALL_THRESHOLD_MS = 16_000;\nconst PLAYER_MEDIA_PREFS_KEY = 'ronecaplaytv-player-media-v1';`,
);

replaceOnce(
  'fallback Xtream conservador com subpastas',
  `function buildXtreamLivePlaybackVariants(rawUrl: string) {\n  try {\n    const parsed = new URL(rawUrl.trim());\n    const parts = parsed.pathname\n      .split('/')\n      .filter(Boolean)\n      .map(part => decodeURIComponent(part));\n\n    const route = parts[0]?.toLowerCase();\n\n    if (route === 'movie' || route === 'series') {\n      return [];\n    }\n\n    const offset = route === 'live' ? 1 : 0;\n\n    if (parts.length - offset < 3) return [];\n\n    const username = parts[offset];\n    const password = parts[offset + 1];\n    const streamFile = parts[offset + 2];\n    const streamMatch = streamFile.match(/^([^/.]+)(?:\\.[a-z0-9]+)?$/i);\n\n    if (!username || !password || !streamMatch?.[1]) return [];\n\n    const streamId = streamMatch[1];\n    const user = encodeURIComponent(username);\n    const pass = encodeURIComponent(password);\n    const suffix = \\`${parsed.search}${parsed.hash}\\`;\n\n    return [\n      \\`${parsed.origin}/live/${user}/${pass}/${streamId}.m3u8${suffix}\\`,\n      \\`${parsed.origin}/${user}/${pass}/${streamId}.m3u8${suffix}\\`,\n      \\`${parsed.origin}/live/${user}/${pass}/${streamId}.ts${suffix}\\`,\n      \\`${parsed.origin}/${user}/${pass}/${streamId}.ts${suffix}\\`,\n    ];\n  } catch {\n    return [];\n  }\n}\n\nfunction buildPlaybackUrlVariants(\n  rawUrl: string,\n  isLiveContent: boolean,\n) {\n  const url = rawUrl.trim();\n  if (!url) return [];\n\n  const xtreamLiveVariants = isLiveContent\n    ? buildXtreamLivePlaybackVariants(url)\n    : [];\n\n  if (xtreamLiveVariants.length > 0) {\n    return [...new Set([url, ...xtreamLiveVariants])];\n  }\n\n  const variants: string[] = [];\n\n  if (/\\.(ts|m2ts|mpegts)(\\?|#|$)/i.test(url)) {\n    variants.push(url, replaceKnownMediaExtension(url, 'm3u8'));\n  } else if (/\\.m3u8(\\?|#|$)/i.test(url)) {\n    variants.push(url, replaceKnownMediaExtension(url, 'ts'));\n  } else {\n    variants.push(url);\n  }\n\n  return [...new Set(variants)];\n}`,
  `function buildXtreamLivePlaybackVariants(rawUrl: string) {\n  try {\n    const parsed = new URL(rawUrl.trim());\n    const parts = parsed.pathname\n      .split('/')\n      .filter(Boolean)\n      .map(part => decodeURIComponent(part));\n\n    const blockedRouteIndex = parts.findIndex(part => {\n      const route = part.toLowerCase();\n      return route === 'movie' || route === 'series';\n    });\n\n    if (blockedRouteIndex >= 0 || parts.length < 3) return [];\n\n    const liveRouteIndex = parts.findIndex(\n      part => part.toLowerCase() === 'live',\n    );\n    const credentialStart = liveRouteIndex >= 0\n      ? liveRouteIndex + 1\n      : parts.length - 3;\n\n    if (parts.length - credentialStart !== 3) return [];\n\n    const username = parts[credentialStart];\n    const password = parts[credentialStart + 1];\n    const streamFile = parts[credentialStart + 2];\n    const streamMatch = streamFile.match(/^([0-9]+)(?:\\.[a-z0-9]+)?$/i);\n\n    if (!username || !password || !streamMatch?.[1]) return [];\n\n    const prefixParts = parts.slice(\n      0,\n      liveRouteIndex >= 0 ? liveRouteIndex : credentialStart,\n    );\n    const prefix = prefixParts.length > 0\n      ? \\`/${prefixParts.map(encodeURIComponent).join('/')}\\`\n      : '';\n    const base = \\`${parsed.origin}${prefix}\\`;\n    const streamId = streamMatch[1];\n    const user = encodeURIComponent(username);\n    const pass = encodeURIComponent(password);\n    const suffix = \\`${parsed.search}${parsed.hash}\\`;\n\n    return [\n      \\`${base}/live/${user}/${pass}/${streamId}.m3u8${suffix}\\`,\n      \\`${base}/${user}/${pass}/${streamId}.m3u8${suffix}\\`,\n      \\`${base}/live/${user}/${pass}/${streamId}.ts${suffix}\\`,\n      \\`${base}/${user}/${pass}/${streamId}.ts${suffix}\\`,\n    ];\n  } catch {\n    return [];\n  }\n}\n\nfunction buildPlaybackUrlVariants(\n  rawUrl: string,\n  isLiveContent: boolean,\n) {\n  const url = rawUrl.trim();\n  if (!url) return [];\n\n  const xtreamLiveVariants = isLiveContent\n    ? buildXtreamLivePlaybackVariants(url)\n    : [];\n\n  // Só inventamos extensões alternativas quando a URL foi reconhecida com\n  // segurança como Xtream. URLs de CDN, tokens e rotas personalizadas devem\n  // ser reproduzidas exatamente como foram entregues pela lista.\n  if (xtreamLiveVariants.length > 0) {\n    return [...new Set([url, ...xtreamLiveVariants])];\n  }\n\n  return [url];\n}`,
);

replaceOnce(
  'reinicialização sem desmontar MediaSource por fora',
  `  const recoverPlayback = useCallback(() => {\n    const video = videoRef.current;\n    if (!video || !streamUrl) return;\n\n    setError(null);\n    setReady(false);\n    setIsBuffering(true);\n\n    try {\n      video.pause();\n      video.removeAttribute('src');\n      video.load();\n    } catch {\n      // Falhas de limpeza não devem impedir uma nova tentativa.\n    }\n\n    setReloadNonce(value => value + 1);\n    setShowControls(true);\n  }, [streamUrl]);`,
  `  const recoverPlayback = useCallback(() => {\n    const video = videoRef.current;\n    if (!video || !streamUrl) return;\n\n    setError(null);\n    setReady(false);\n    setIsBuffering(true);\n\n    // A alteração de nonce desmonta primeiro a sessão atual pelo cleanup do\n    // efeito. Só depois uma nova sessão é criada. Isso evita chamar load()\n    // diretamente enquanto o mpegts.js ainda controla o MediaSource.\n    setReloadNonce(value => value + 1);\n    setShowControls(true);\n  }, [streamUrl]);`,
);

replaceOnce(
  'temporizadores e watchdog da sessão',
  `    let recoveryTimer: number | null = null;\n    let initialLoadTimer: number | null = null;\n    let markMpegReady: (() => void) | null = null;\n    let markMpegError: (() => void) | null = null;`,
  `    let recoveryTimer: number | null = null;\n    let initialLoadTimer: number | null = null;\n    let stablePlaybackTimer: number | null = null;\n    let watchdogTimer: number | null = null;\n    let lastProgressTime = Number.isFinite(video.currentTime)\n      ? video.currentTime\n      : 0;\n    let lastProgressAt = performance.now();\n    let markMpegReady: (() => void) | null = null;\n    let markMpegError: (() => void) | null = null;`,
);

replaceOnce(
  'limpeza de temporizadores adicionais',
  `    const clearInitialLoadTimer = () => {\n      if (initialLoadTimer !== null) {\n        window.clearTimeout(initialLoadTimer);\n        initialLoadTimer = null;\n      }\n    };\n\n    const markReady = () => {\n      if (cancelled) return;\n      clearRecoveryTimer();\n      clearInitialLoadTimer();\n      setReady(true);\n      setIsBuffering(false);\n    };`,
  `    const clearInitialLoadTimer = () => {\n      if (initialLoadTimer !== null) {\n        window.clearTimeout(initialLoadTimer);\n        initialLoadTimer = null;\n      }\n    };\n\n    const clearStablePlaybackTimer = () => {\n      if (stablePlaybackTimer !== null) {\n        window.clearTimeout(stablePlaybackTimer);\n        stablePlaybackTimer = null;\n      }\n    };\n\n    const clearWatchdogTimer = () => {\n      if (watchdogTimer !== null) {\n        window.clearInterval(watchdogTimer);\n        watchdogTimer = null;\n      }\n    };\n\n    const armStablePlaybackReset = () => {\n      clearStablePlaybackTimer();\n      stablePlaybackTimer = window.setTimeout(() => {\n        recoveryAttemptsRef.current = 0;\n        stablePlaybackTimer = null;\n      }, STABLE_PLAYBACK_RESET_MS);\n    };\n\n    const markReady = () => {\n      if (cancelled) return;\n      clearRecoveryTimer();\n      clearInitialLoadTimer();\n      setReady(true);\n      setIsBuffering(false);\n      armStablePlaybackReset();\n    };`,
);

replaceOnce(
  'backoff de recuperação automática',
  `      recoveryAttemptsRef.current += 1;\n      setIsBuffering(true);\n      recoveryTimer = window.setTimeout(() => {\n        recoveryTimer = null;\n        if (!cancelled) action();\n      }, delayMs);`,
  `      const attempt = recoveryAttemptsRef.current + 1;\n      recoveryAttemptsRef.current = attempt;\n      clearStablePlaybackTimer();\n      setIsBuffering(true);\n      recoveryTimer = window.setTimeout(() => {\n        recoveryTimer = null;\n        if (!cancelled) action();\n      }, Math.round(delayMs * (1 + (attempt - 1) * 0.35)));`,
);

replaceOnce(
  'recuperação sustentada de travamento',
  `    const scheduleStallRecovery = () => {\n      setIsBuffering(true);\n      if (!isLive || !autoReconnect) return;\n\n      clearRecoveryTimer();\n      recoveryTimer = window.setTimeout(() => {\n        recoveryTimer = null;\n\n        if (recoveryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {\n          setIsBuffering(false);\n          setError('A transmissão travou várias vezes. Tente trocar de canal ou reproduzir novamente.');\n          return;\n        }\n\n        recoveryAttemptsRef.current += 1;\n        recoverPlayback();\n      }, bufferProfile.stallRecoveryDelayMs);\n    };`,
  `    const scheduleStallRecovery = () => {\n      setIsBuffering(true);\n      if (!isLive || !autoReconnect || recoveryTimer !== null) return;\n\n      clearStablePlaybackTimer();\n\n      if (recoveryAttemptsRef.current >= MAX_RECOVERY_ATTEMPTS) {\n        tryNextPlaybackUrl(\n          'A transmissão permaneceu sem avanço após várias tentativas de recuperação.',\n        );\n        return;\n      }\n\n      const attempt = recoveryAttemptsRef.current + 1;\n      const delay = Math.round(\n        bufferProfile.stallRecoveryDelayMs *\n        (1 + (attempt - 1) * 0.3),\n      );\n\n      recoveryTimer = window.setTimeout(() => {\n        recoveryTimer = null;\n\n        if (cancelled) return;\n\n        if (\n          video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&\n          !video.paused &&\n          performance.now() - lastProgressAt < LIVE_STALL_THRESHOLD_MS\n        ) {\n          setIsBuffering(false);\n          return;\n        }\n\n        recoveryAttemptsRef.current = attempt;\n        recoverPlayback();\n      }, delay);\n    };`,
);

replaceOnce(
  'progresso real e watchdog ao vivo',
  `    const handlePlaying = () => {\n      markReady();\n      setIsPlaying(true);\n    };\n    const handleCanPlay = () => markReady();\n    const handlePause = () => setIsPlaying(false);\n\n    video.addEventListener('waiting', scheduleStallRecovery);\n    video.addEventListener('stalled', scheduleStallRecovery);\n    video.addEventListener('playing', handlePlaying);\n    video.addEventListener('canplay', handleCanPlay);\n    video.addEventListener('pause', handlePause);\n    video.addEventListener('loadedmetadata', clearInitialLoadTimer);\n    scheduleInitialLoadTimeout();`,
  `    const handlePlaybackProgress = () => {\n      const nextTime = Number.isFinite(video.currentTime)\n        ? video.currentTime\n        : lastProgressTime;\n\n      if (Math.abs(nextTime - lastProgressTime) < 0.25) return;\n\n      lastProgressTime = nextTime;\n      lastProgressAt = performance.now();\n    };\n\n    const handlePlaying = () => {\n      handlePlaybackProgress();\n      markReady();\n      setIsPlaying(true);\n    };\n    const handleCanPlay = () => {\n      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {\n        markReady();\n      }\n    };\n    const handlePause = () => {\n      clearStablePlaybackTimer();\n      setIsPlaying(false);\n    };\n\n    video.addEventListener('waiting', scheduleStallRecovery);\n    video.addEventListener('stalled', scheduleStallRecovery);\n    video.addEventListener('playing', handlePlaying);\n    video.addEventListener('canplay', handleCanPlay);\n    video.addEventListener('pause', handlePause);\n    video.addEventListener('timeupdate', handlePlaybackProgress);\n    scheduleInitialLoadTimeout();\n\n    if (isLive && autoReconnect) {\n      watchdogTimer = window.setInterval(() => {\n        if (\n          cancelled ||\n          document.hidden ||\n          video.paused ||\n          video.ended\n        ) {\n          return;\n        }\n\n        handlePlaybackProgress();\n\n        if (performance.now() - lastProgressAt >= LIVE_STALL_THRESHOLD_MS) {\n          scheduleStallRecovery();\n        }\n      }, LIVE_WATCHDOG_INTERVAL_MS);\n    }`,
);

replaceOnce(
  'erro nativo específico por tipo',
  `      video.src = playbackUrl;\n      video.onloadedmetadata = () => {\n        markReady();\n        video.play().catch(() => setShowControls(true));\n      };\n      video.onerror = () => tryNextPlaybackUrl(getVideoErrorMessage(video, 'Não foi possível reproduzir esta fonte.'));`,
  `      video.src = playbackUrl;\n      video.onloadedmetadata = () => {\n        video.play().catch(() => setShowControls(true));\n      };\n      video.onerror = () => {\n        const message = getVideoErrorMessage(\n          video,\n          'Não foi possível reproduzir esta fonte.',\n        );\n\n        if (video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {\n          tryNextPlaybackUrl(message);\n          return;\n        }\n\n        attemptAutomaticRecovery(recoverPlayback, message, 900);\n      };`,
);

replaceOnce(
  'recuperação MPEG-TS pela recriação controlada',
  `          markMpegReady = () => markReady();\n          markMpegError = () => tryNextPlaybackUrl('Não foi possível reproduzir esta fonte MPEG-TS.');\n\n          video.addEventListener('loadedmetadata', markMpegReady);\n          video.addEventListener('canplay', markMpegReady);`,
  `          markMpegReady = () => markReady();\n          markMpegError = () => attemptAutomaticRecovery(\n            recoverPlayback,\n            'Não foi possível recuperar esta fonte MPEG-TS.',\n            850,\n          );\n\n          video.addEventListener('canplay', markMpegReady);`,
);

replaceOnce(
  'HLS pronto somente após mídia reproduzível',
  `          hls.on(Hls.Events.MANIFEST_PARSED, () => {\n            if (cancelled) return;\n            markReady();\n            video.play().catch(() => setShowControls(true));\n          });`,
  `          hls.on(Hls.Events.MANIFEST_PARSED, () => {\n            if (cancelled) return;\n            // Manifesto válido ainda não significa primeiro quadro disponível.\n            // O estado pronto será confirmado pelos eventos canplay/playing.\n            video.play().catch(() => setShowControls(true));\n          });`,
);

replaceOnce(
  'cleanup completo da sessão',
  `      clearRecoveryTimer();\n      clearInitialLoadTimer();\n      video.removeEventListener('waiting', scheduleStallRecovery);\n      video.removeEventListener('stalled', scheduleStallRecovery);\n      video.removeEventListener('playing', handlePlaying);\n      video.removeEventListener('canplay', handleCanPlay);\n      video.removeEventListener('pause', handlePause);\n      video.removeEventListener('loadedmetadata', clearInitialLoadTimer);\n\n      if (markMpegReady) {\n        video.removeEventListener('loadedmetadata', markMpegReady);\n        video.removeEventListener('canplay', markMpegReady);`,
  `      clearRecoveryTimer();\n      clearInitialLoadTimer();\n      clearStablePlaybackTimer();\n      clearWatchdogTimer();\n      video.removeEventListener('waiting', scheduleStallRecovery);\n      video.removeEventListener('stalled', scheduleStallRecovery);\n      video.removeEventListener('playing', handlePlaying);\n      video.removeEventListener('canplay', handleCanPlay);\n      video.removeEventListener('pause', handlePause);\n      video.removeEventListener('timeupdate', handlePlaybackProgress);\n\n      if (markMpegReady) {\n        video.removeEventListener('canplay', markMpegReady);`,
);

const temporaryPath = `${playerPath}.reliability.tmp`;
fs.writeFileSync(temporaryPath, source);
fs.renameSync(temporaryPath, playerPath);

console.log('PlayerV2Screen atualizado com segurança.');
