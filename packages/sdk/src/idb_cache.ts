/**
 * IndexedDB offline persistent model caching utility.
 */
const DB_NAME = 'firetable_stream_asr_cache';
const DB_VERSION = 1;
const STORE_NAME = 'models';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isValidModelBuffer(buf: ArrayBuffer | null): boolean {
  if (!buf || buf.byteLength < 1024 * 1024) return false;
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  return magic === 'STT1';
}

export async function getCachedModel(key: string): Promise<ArrayBuffer | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    const data: ArrayBuffer | null = await new Promise((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (data && !isValidModelBuffer(data)) {
      console.warn('[StreamASR] Corrupted cache detected in IDB. Evicting poisoned key:', key);
      await deleteCachedModel(key);
      return null;
    }
    return data;
  } catch {
    return null;
  } finally {
    if (db) db.close();
  }
}

export async function setCachedModel(key: string, data: ArrayBuffer): Promise<void> {
  if (!isValidModelBuffer(data)) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Non-fatal if IDB quota exceeded or private mode
  } finally {
    if (db) db.close();
  }
}

export async function deleteCachedModel(key: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
  finally {
    if (db) db.close();
  }
}
