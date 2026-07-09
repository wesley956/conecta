import type { Channel, Movie, Playlist, Series } from '@/types';

const DB_NAME = 'ronecaplaytv-content-cache';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'latest';

let dbPromise: Promise<IDBDatabase> | null = null;

export interface ContentCacheSnapshot {
  version: number;
  savedAt: string;
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  playlists: Playlist[];
}

function canUseIndexedDB() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openCacheDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDB()) {
    return Promise.reject(new Error('IndexedDB não disponível.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Falha ao abrir cache.'));
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onclose = () => {
        dbPromise = null;
      };

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };
  });

  return dbPromise;
}

function normalizeSnapshot(snapshot: Partial<ContentCacheSnapshot>): ContentCacheSnapshot {
  return {
    version: 1,
    savedAt: snapshot.savedAt || new Date().toISOString(),
    channels: Array.isArray(snapshot.channels) ? snapshot.channels : [],
    movies: Array.isArray(snapshot.movies) ? snapshot.movies : [],
    series: Array.isArray(snapshot.series) ? snapshot.series : [],
    playlists: Array.isArray(snapshot.playlists) ? snapshot.playlists : [],
  };
}

export async function saveContentCache(snapshot: Omit<ContentCacheSnapshot, 'version' | 'savedAt'>) {
  try {
    const db = await openCacheDb();
    const payload = normalizeSnapshot({
      ...snapshot,
      savedAt: new Date().toISOString(),
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.put(payload, SNAPSHOT_KEY);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar cache.'));
      tx.onabort = () => reject(tx.error ?? new Error('Cache abortado.'));
    });
  } catch {
    // Cache é melhoria de performance. Se falhar, o app continua funcionando.
  }
}

export async function loadContentCache(): Promise<ContentCacheSnapshot | null> {
  try {
    const db = await openCacheDb();

    return await new Promise<ContentCacheSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(SNAPSHOT_KEY);

      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }

        resolve(normalizeSnapshot(request.result));
      };

      request.onerror = () => reject(request.error ?? new Error('Falha ao ler cache.'));
    });
  } catch {
    return null;
  }
}

export async function clearContentCache() {
  try {
    const db = await openCacheDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      store.delete(SNAPSHOT_KEY);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao limpar cache.'));
      tx.onabort = () => reject(tx.error ?? new Error('Cache abortado.'));
    });
  } catch {
    // ignora
  }
}
