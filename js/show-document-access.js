/**
 * Late-bound accessors for the show document — keeps paperwork/composer off the
 * calculator-registry ↔ site-state import cycle.
 */

/** @type {(() => import("./domain/show-document.js").ShowDocument) | null} */
let getDoc = null;

/** @type {((instances: Record<string, object | null>) => unknown) | null} */
let flushFn = null;

/**
 * @param {{
 *   getShowDocument: () => import("./domain/show-document.js").ShowDocument,
 *   flushActiveRoomFromCalculators: (instances: Record<string, object | null>) => unknown,
 * }} api
 */
export function bindShowDocumentAccess(api) {
  getDoc = api.getShowDocument;
  flushFn = api.flushActiveRoomFromCalculators;
}

/** @returns {import("./domain/show-document.js").ShowDocument} */
export function getShowDocument() {
  if (!getDoc) {
    throw new Error("Show document is not ready yet.");
  }
  return getDoc();
}

/**
 * @param {Record<string, object | null>} instances
 */
export function flushActiveRoomFromCalculators(instances) {
  if (!flushFn) {
    throw new Error("Show document is not ready yet.");
  }
  return flushFn(instances);
}
