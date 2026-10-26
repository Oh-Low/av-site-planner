/**
 * IndexedDB persistence for the multi-show document.
 * The database stays open so a refresh can queue the latest write immediately.
 */

const DB_NAME = "av-site-planner";
const DB_VERSION = 1;
const STORE = "documents";
const DOC_KEY = "current";

/** @type {IDBDatabase | null} */
let database = null;

/** @type {Promise<IDBDatabase> | null} */
let opening = null;

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
 * @returns {Promise<IDBDatabase>}
 */
function getDb() {
  if (database) return Promise.resolve(database);
  if (!opening) {
    opening = openDb()
      .then((opened) => {
        database = opened;
        opened.onversionchange = () => {
          opened.close();
          if (database === opened) database = null;
        };
        opening = null;
        return opened;
      })
      .catch((error) => {
        opening = null;
        throw error;
      });
  }
  return opening;
}

/**
 * @param {IDBDatabase} db
 * @param {unknown} document
 * @returns {Promise<void>}
 */
function putDocument(db, document) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted."));
    tx.objectStore(STORE).put(document, DOC_KEY);
  });
}

/**
 * Queue a document write. When the database is already open the transaction
 * starts before this function returns, so a refresh still keeps the save.
 * @param {unknown} document
 * @returns {Promise<void>}
 */
export function saveShowDocumentToIdb(document) {
  if (database) return putDocument(database, document);
  return getDb().then((db) => putDocument(db, document));
}

/**
 * @returns {Promise<unknown | null>}
 */
export async function loadShowDocumentFromIdb() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed."));
    const request = tx.objectStore(STORE).get(DOC_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB get failed."));
  });
}

/** @returns {Promise<void>} */
export async function clearShowDocumentIdb() {
  const db = await getDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB clear failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB clear aborted."));
    tx.objectStore(STORE).delete(DOC_KEY);
  });
}
