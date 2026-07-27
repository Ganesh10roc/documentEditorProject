/**
 * Minimal promise-based IndexedDB key-value store.
 *
 * Used to durably persist the sync engine's *outbox* (local updates awaiting
 * acknowledgement) and *cursor* (last server seq merged), separately from the
 * Yjs document itself (which y-indexeddb persists). Both must survive a reload
 * so offline work is never lost. Deliberately dependency-free and tiny.
 */
const DB_NAME = "palimpsest-sync";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Don't cache the rejection — a transient failure (e.g. private-mode
      // quota) must not permanently disable persistence for the whole session.
      dbPromise = null;
      reject(req.error);
    };
    // Another tab holding an older version open blocks the upgrade; surface it
    // as a failure so callers can retry rather than hang forever.
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB open blocked by another tab"));
    };
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const db = await getDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return tx<T | undefined>("readonly", (s) => s.get(key));
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await tx("readwrite", (s) => s.put(value, key));
}

export async function idbDel(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}
