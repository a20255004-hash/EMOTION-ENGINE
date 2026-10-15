/** Envoltorio mínimo sobre IndexedDB con promesas. */
const DB_NAME = 'emotion-engine';
const DB_VERSION = 1;

export const STORES = { projects: 'projects', versions: 'versions', blobs: 'blobs' } as const;
type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.projects)) db.createObjectStore(STORES.projects, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.versions)) {
        const v = db.createObjectStore(STORES.versions, { keyPath: 'id' });
        v.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains(STORES.blobs)) db.createObjectStore(STORES.blobs, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('No se pudo abrir el almacenamiento local.'));
    };
    req.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña.'));
  });
  return dbPromise;
}

/** Solo para pruebas. */
export function resetDbConnection() {
  dbPromise = null;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('Error de transacción'));
    t.onabort = () => reject(t.error ?? new Error('Transacción abortada (¿almacenamiento lleno?)'));
  });
  const result = await fn(t);
  await done;
  return result;
}

export const idb = {
  get: <T>(t: IDBTransaction, store: StoreName, key: IDBValidKey) => wrap<T | undefined>(t.objectStore(store).get(key) as IDBRequest<T | undefined>),
  getAll: <T>(t: IDBTransaction, store: StoreName) => wrap<T[]>(t.objectStore(store).getAll() as IDBRequest<T[]>),
  getAllByIndex: <T>(t: IDBTransaction, store: StoreName, index: string, key: IDBValidKey) =>
    wrap<T[]>(t.objectStore(store).index(index).getAll(key) as IDBRequest<T[]>),
  put: (t: IDBTransaction, store: StoreName, value: unknown) => wrap(t.objectStore(store).put(value)),
  delete: (t: IDBTransaction, store: StoreName, key: IDBValidKey) => wrap(t.objectStore(store).delete(key)),
};
