import type { Catalog } from "./catalog";

const DATABASE = "roneca-smart-tv-cache-v2";
const DATABASE_VERSION = 1;
const SNAPSHOTS = "catalogSnapshots";
const KEYS = "cryptoKeys";
const KEY_ID = "catalog-aes-gcm-v1";
const SCHEMA_VERSION = 1;
const MAX_AGE_MILLIS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 250_000;
const MAX_JSON_BYTES = 80 * 1024 * 1024;

interface StoredSnapshot {
  id: string;
  schemaVersion: number;
  playlistId: string;
  cacheVersion: string | null;
  savedAt: number;
  itemCount: number;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

export interface RestoredCatalogSnapshot {
  catalog: Catalog;
  playlistId: string;
  cacheVersion: string | null;
  savedAt: number;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error || new Error("Falha no armazenamento local."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Operação local cancelada."));
    transaction.onerror = () => reject(transaction.error || new Error("Falha no armazenamento local."));
  });
}

async function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
    throw new Error("Snapshot seguro não suportado nesta TV.");
  }
  const open = indexedDB.open(DATABASE, DATABASE_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "id" });
    if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
  };
  return request(open);
}

async function encryptionKey(db: IDBDatabase): Promise<CryptoKey> {
  const readTx = db.transaction(KEYS, "readonly");
  const readDone = transactionDone(readTx);
  const existing = await request(readTx.objectStore(KEYS).get(KEY_ID)) as CryptoKey | undefined;
  await readDone;
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const writeTx = db.transaction(KEYS, "readwrite");
  writeTx.objectStore(KEYS).put(key, KEY_ID);
  await transactionDone(writeTx);
  return key;
}

async function snapshotId(deviceCode: string, playlistId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${deviceCode}\u0000${playlistId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
}

function validateCatalog(value: unknown): Catalog {
  if (!value || typeof value !== "object") throw new Error("Snapshot sem catálogo.");
  const catalog = value as Partial<Catalog>;
  if (!Array.isArray(catalog.channels) || !Array.isArray(catalog.movies) || !Array.isArray(catalog.series)) {
    throw new Error("Snapshot de catálogo inválido.");
  }
  const count = catalog.channels.length + catalog.movies.length + catalog.series.length;
  if (!count || count > MAX_ITEMS) throw new Error("Snapshot fora do limite seguro.");
  return catalog as Catalog;
}

export async function saveCatalogSnapshot(
  deviceCode: string | null,
  playlistId: string,
  cacheVersion: string | null,
  catalog: Catalog
): Promise<void> {
  if (!deviceCode || !playlistId) return;
  const itemCount = catalog.channels.length + catalog.movies.length + catalog.series.length;
  if (!itemCount || itemCount > MAX_ITEMS) return;
  const encoded = new TextEncoder().encode(JSON.stringify(catalog));
  if (encoded.byteLength > MAX_JSON_BYTES) return;

  const db = await database();
  try {
    const key = await encryptionKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const stored: StoredSnapshot = {
      id: await snapshotId(deviceCode, playlistId),
      schemaVersion: SCHEMA_VERSION,
      playlistId,
      cacheVersion,
      savedAt: Date.now(),
      itemCount,
      iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
      ciphertext
    };
    const tx = db.transaction(SNAPSHOTS, "readwrite");
    tx.objectStore(SNAPSHOTS).put(stored);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function restoreCatalogSnapshot(
  deviceCode: string | null,
  playlistIds: string[]
): Promise<RestoredCatalogSnapshot | null> {
  if (!deviceCode || !playlistIds.length) return null;
  const db = await database();
  try {
    const key = await encryptionKey(db);
    for (const playlistId of playlistIds) {
      const id = await snapshotId(deviceCode, playlistId);
      const tx = db.transaction(SNAPSHOTS, "readonly");
      const readDone = transactionDone(tx);
      const stored = await request(tx.objectStore(SNAPSHOTS).get(id)) as StoredSnapshot | undefined;
      await readDone;
      if (!stored) continue;
      if (stored.schemaVersion !== SCHEMA_VERSION || stored.playlistId !== playlistId ||
          stored.itemCount <= 0 || stored.itemCount > MAX_ITEMS || Date.now() - stored.savedAt > MAX_AGE_MILLIS) {
        continue;
      }
      try {
        const clear = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: new Uint8Array(stored.iv) },
          key,
          stored.ciphertext
        );
        const catalog = validateCatalog(JSON.parse(new TextDecoder().decode(clear)));
        return { catalog, playlistId, cacheVersion: stored.cacheVersion, savedAt: stored.savedAt };
      } catch {
        // Corrupção ou chave incompatível: tenta a próxima lista sem expor dados.
      }
    }
    return null;
  } finally {
    db.close();
  }
}

export async function clearCatalogSnapshots(): Promise<number> {
  if (!globalThis.indexedDB) return 0;
  return new Promise(resolve => {
    const deletion = indexedDB.deleteDatabase(DATABASE);
    deletion.onsuccess = () => resolve(1);
    deletion.onerror = () => resolve(0);
    deletion.onblocked = () => resolve(0);
  });
}
