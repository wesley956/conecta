const LOCAL_PREFIXES = [
  "roneca.smart-tv.cache.",
  "roneca.smart-tv.ui.",
  "roneca.smart-tv.diagnostics.",
  "roneca.smart-tv.update."
];

function removeMatching(storage: Storage | undefined) {
  if (!storage) return 0;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && LOCAL_PREFIXES.some(prefix => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
  } catch {
    return 0;
  }
  return keys.length;
}

export async function clearReconstructibleCache(): Promise<number> {
  let removed = 0;
  removed += removeMatching(globalThis.localStorage);
  removed += removeMatching(globalThis.sessionStorage);
  try {
    if ("caches" in globalThis && globalThis.caches) {
      const names = await globalThis.caches.keys();
      for (const name of names) {
        if (!/roneca|smart[-_ ]?tv/i.test(name)) continue;
        if (await globalThis.caches.delete(name)) removed += 1;
      }
    }
  } catch {
    // CacheStorage pode não estar disponível em gerações webOS antigas.
  }
  return removed;
}
