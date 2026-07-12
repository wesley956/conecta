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
  'reset somente após playing estável',
  `      setReady(true);\n      setIsBuffering(false);\n      armStablePlaybackReset();\n    };`,
  `      setReady(true);\n      setIsBuffering(false);\n    };`,
);

replaceOnce(
  'armar reset no evento playing',
  `    const handlePlaying = () => {\n      handlePlaybackProgress();\n      markReady();\n      setIsPlaying(true);\n    };`,
  `    const handlePlaying = () => {\n      handlePlaybackProgress();\n      markReady();\n      armStablePlaybackReset();\n      setIsPlaying(true);\n    };`,
);

replaceOnce(
  'timeout exige dados futuros',
  `        if (video.readyState >= 2 || cancelled) return;`,
  `        if (\n          video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA ||\n          cancelled\n        ) return;`,
);

replaceOnce(
  'encerrar sessão no erro final',
  `      setError(message);\n    };\n\n    const attemptAutomaticRecovery`,
  `      clearStablePlaybackTimer();\n      clearWatchdogTimer();\n      setError(message);\n    };\n\n    const attemptAutomaticRecovery`,
);

replaceOnce(
  'recuperação de travamento específica por transporte',
  `        recoveryAttemptsRef.current = attempt;\n        recoverPlayback();\n      }, delay);`,
  `        recoveryAttemptsRef.current = attempt;\n\n        if (hls?.startLoad) {\n          hls.stopLoad?.();\n          hls.startLoad(-1);\n          video.play().catch(() => setShowControls(true));\n          return;\n        }\n\n        recoverPlayback();\n      }, delay);`,
);

replaceOnce(
  'recuperação HLS de rede com live edge',
  `              attemptAutomaticRecovery(\n                () => hls?.startLoad(),\n                'Não foi possível recuperar a conexão desta fonte HLS.',\n              );`,
  `              attemptAutomaticRecovery(\n                () => {\n                  hls?.stopLoad?.();\n                  hls?.startLoad?.(-1);\n                  video.play().catch(() => setShowControls(true));\n                },\n                'Não foi possível recuperar a conexão desta fonte HLS.',\n              );`,
);

const temporaryPath = `${playerPath}.polish.tmp`;
fs.writeFileSync(temporaryPath, source);
fs.renameSync(temporaryPath, playerPath);

console.log('Refinamentos finais do núcleo aplicados.');
