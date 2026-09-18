/**
 * IndexedDB persistence for the multi-show document.
 */

const DB_NAME = "av-site-planner";
const DB_VERSION = 1;
const STORE = "documents";
const DOC_KEY = "current";

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * @param {unknown} document
 * @returns {Promise<void>}
 */
export async function saveShowDocumentToIdb(document) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed."));
      tx.objectStore(STORE).put(document, DOC_KEY);
    });
  } finally {
    db.close();
  }
}

/**
 * @returns {Promise<unknown | null>}
 */
export async function loadShowDocumentFromIdb() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed."));
      const request = tx.objectStore(STORE).get(DOC_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB get failed."));
    });
  } finally {
    db.close();
  }
}

/** @returns {Promise<void>} */
export async function clearShowDocumentIdb() {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB clear failed."));
      tx.objectStore(STORE).delete(DOC_KEY);
    });
  } finally {
    db.close();
  }
}
