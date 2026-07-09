const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();

function patchPlayer() {
  const file = path.join(root, 'src/screens/PlayerScreen.tsx');
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  const directCleanupOld = `    return () => {
      clearRecoveryTimer();
      video.removeEventListener('waiting', scheduleStallRecovery);
      video.removeEventListener('stalled', scheduleStallRecovery);
      video.removeEventListener('playing', clearRecoveryTimer);
      video.removeEventListener('canplay', clearRecoveryTimer);
      hls?.destroy();
      tsPlayer?.destroy?.();
      video.onloadedmetadata = null;
      video.onerror = null;
    };`;

  const directCleanupNew = `    return () => {
      clearRecoveryTimer();
      clearInitialLoadTimer();
      video.removeEventListener('waiting', scheduleStallRecovery);
      video.removeEventListener('stalled', scheduleStallRecovery);
      video.removeEventListener('playing', clearRecoveryTimer);
      video.removeEventListener('canplay', clearRecoveryTimer);
      video.removeEventListener('loadedmetadata', clearInitialLoadTimer);
      video.removeEventListener('canplay', clearInitialLoadTimer);
      video.removeEventListener('playing', clearInitialLoadTimer);
      hls?.destroy();
      tsPlayer?.destroy?.();
      video.onloadedmetadata = null;
      video.onerror = null;
    };`;

  if (src.includes(directCleanupNew)) {
    console.log('OK: PlayerScreen cleanup direto já corrigido.');
  } else if (src.includes(directCleanupOld)) {
    src = src.replace(directCleanupOld, directCleanupNew);
    changed = true;
    console.log('Aplicado: PlayerScreen cleanup direto com clearInitialLoadTimer.');
  } else {
    console.log('Aviso: bloco de cleanup direto do PlayerScreen não encontrado. Nada alterado no player.');
  }

  if (changed) fs.writeFileSync(file, src);
}

function patchM3uParser() {
  const file = path.join(root, 'src/utils/m3u.ts');
  let src = fs.readFileSync(file, 'utf8');
  let changed = false;

  if (src.includes('const attrPatternCache = new Map<string, AttrPatterns>();')) {
    console.log('OK: cache de RegExp do M3U já aplicado.');
    return;
  }

  const oldBlock = `function readAttr(line: string, attr: string): string {
  const escapedAttr = attr.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(\`${'${escapedAttr}'}\\s*=\\s*"([^"]*)"\`, 'i'),
    new RegExp(\`${'${escapedAttr}'}\\s*=\\s*'([^']*)'\`, 'i'),
    new RegExp(\`${'${escapedAttr}'}\\s*=\\s*([^\\s,]+)\`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    const value = match?.[1]?.trim();

    if (value) return value;
  }

  return '';
}`;

  const newBlock = `type AttrPatterns = [RegExp, RegExp, RegExp];
const attrPatternCache = new Map<string, AttrPatterns>();

function getAttrPatterns(attr: string): AttrPatterns {
  const cached = attrPatternCache.get(attr);

  if (cached) return cached;

  const escapedAttr = attr.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  const patterns: AttrPatterns = [
    new RegExp(\`${'${escapedAttr}'}\\s*=\\s*"([^"]*)"\`, 'i'),
    new RegExp(\`${'${escapedAttr}'}\\s*=\\s*'([^']*)'\`, 'i'),
    new RegExp(\`${'${escapedAttr}'}\\s*=\\s*([^\\s,]+)\`, 'i'),
  ];

  attrPatternCache.set(attr, patterns);
  return patterns;
}

function readAttr(line: string, attr: string): string {
  const patterns = getAttrPatterns(attr);

  for (const pattern of patterns) {
    const match = line.match(pattern);
    const value = match?.[1]?.trim();

    if (value) return value;
  }

  return '';
}`;

  if (!src.includes(oldBlock)) {
    console.log('Aviso: bloco readAttr original não encontrado. Nada alterado no m3u.ts.');
    return;
  }

  src = src.replace(oldBlock, newBlock);
  changed = true;
  console.log('Aplicado: cache de RegExp no parser M3U.');

  if (changed) fs.writeFileSync(file, src);
}

patchPlayer();
patchM3uParser();
