import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../dist/', import.meta.url);
const limits = {
  '.js': 350 * 1024,
  '.css': 80 * 1024,
};

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const target = new URL(entry.name, directory.pathname.endsWith('/') ? directory : new URL(`${directory.pathname}/`, directory));
    return entry.isDirectory() ? files(target) : [target];
  }));
  return nested.flat();
}

const assets = await files(root);
const totals = new Map(Object.keys(limits).map(extension => [extension, 0]));
for (const asset of assets) {
  const extension = path.extname(asset.pathname);
  if (!totals.has(extension)) continue;
  totals.set(extension, totals.get(extension) + (await stat(asset)).size);
}

for (const [extension, maximum] of Object.entries(limits)) {
  const size = totals.get(extension) || 0;
  if (size > maximum) {
    throw new Error(`Bundle ${extension} excedeu o limite: ${size} > ${maximum} bytes.`);
  }
  console.log(`${extension}: ${size}/${maximum} bytes`);
}

console.log('✅ Bundle Smart TV dentro do orçamento.');
