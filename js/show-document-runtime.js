/**
 * App-level multi-show document singleton — flush/load rooms, IndexedDB autosave.
 */

import { CALCULATOR_PLUGINS } from "./calculator-registry.js";
import { deepClone } from "./shared/clone.js";
import {
  clearUndoHistory,
} from "./undo-runtime.js";
import {
  buildRoomPlanFromCalculators,
  emptyRoomPlan,
  emptyShowDocument,
  findActiveRoom,
  findActiveShow,
  normalizeShowDocument,
  normalizeRoomPlan,
  readActiveShowPaperwork,
  setActiveRoom,
  stampShowDocument,
  writeActiveRoomPlan,
  writeActiveShowPaperwork,
} from "./site-state.js";
import {
  loadShowDocumentFromIdb,
  saveShowDocumentToIdb,
} from "./show-document-idb.js";
import { syncSiteDocumentFromPlan } from "./site-document-runtime.js";

/** @typedef {import("./domain/show-document.js").ShowDocument} ShowDocument */

/** @type {ShowDocument | null} */
let showDoc = null;

/** @returns {ShowDocument} */
function ensureShowDoc() {
  if (!showDoc) showDoc = emptyShowDocument(emptyRoomPlan());
  return showDoc;
}

/** @type {ReturnType<typeof setTimeout> | null} */
let persistTimer = null;

/** @type {((dirty: boolean) => void) | null} */
let onDirtyChange = null;

/** @type {(() => void) | null} */
let onDocumentChange = null;

/** @type {boolean} */
let suppressAutosave = false;

const AUTOSAVE_DEBOUNCE_MS = 400;

/** @returns {ShowDocument} */
export function getShowDocument() {
  return ensureShowDoc();
}

/** @param {ShowDocument} doc */
export function setShowDocument(doc) {
  showDoc = normalizeShowDocument(doc, normalizeRoomPlan, emptyRoomPlan);
  notifyDocumentChange();
}

/**
 * @param {(dirty: boolean) => void} fn
 */
export function setShowDocumentDirtyHandler(fn) {
  onDirtyChange = fn;
}

/**
 * @param {() => void} fn
 */
export function setShowDocumentChangeHandler(fn) {
  onDocumentChange = fn;
}

function notifyDocumentChange() {
  onDocumentChange?.();
}

/**
 * @param {Record<string, { exportState?: () => object, importState?: (data: object) => void, flushFormToState?: () => void, refreshUi?: () => void, refresh?: () => void } | null>} instances
 * @param {Record<string, unknown>} plan
 */
export function applyRoomPlanToCalculators(instances, plan) {
  const normalized = normalizeRoomPlan(plan);
  syncSiteDocumentFromPlan({
    formatVersion: 2,
    app: "av-site-planner",
    ...normalized,
  });

  for (const plugin of CALCULATOR_PLUGINS) {
    const key = plugin.meta.stateKey;
    // Paperwork is show-scoped — loaded separately via readActiveShowPaperwork.
    if (key === "paperwork") continue;
    const fallback = plugin.meta.emptyState?.() ?? {};
    try {
      let section = normalized[key] ?? fallback;
      if (key === "signalFlow" && section && typeof section === "object") {
        section = {
          .../** @type {object} */ (section),
          places: Array.isArray(normalized.places) ? normalized.places : [],
        };
      }
      instances[key]?.importState?.(section);
    } catch (error) {
      console.error(`Failed to import ${plugin.meta.label} state:`, error);
    }
    if (key === "led") {
      instances.led?.refreshUi?.();
    }
  }
  instances.led?.refreshUi?.();
  instances.cable?.refresh?.();
}

/**
 * Write live calculator state into the active room plan.
 * @param {Record<string, { exportState?: () => object, flushFormToState?: () => void } | null>} instances
 */
export function flushActiveRoomFromCalculators(instances) {
  // Persist show-scoped paperwork from the live composer before rebuilding the
  // room plan (room plans no longer carry a paperwork section).
  try {
    const livePaperwork = instances.paperwork?.exportState?.();
    if (livePaperwork && typeof livePaperwork === "object") {
      writeActiveShowPaperwork(ensureShowDoc(), livePaperwork);
    }
  } catch (error) {
    console.error("Failed to export show paperwork:", error);
  }
  const plan = buildRoomPlanFromCalculators(instances);
  writeActiveRoomPlan(ensureShowDoc(), plan);
  stampShowDocument(ensureShowDoc());
  return plan;
}

/**
 * @param {Record<string, { exportState?: () => object, importState?: (data: object) => void, flushFormToState?: () => void, refreshUi?: () => void, refresh?: () => void } | null>} instances
 */
export function loadActiveRoomIntoCalculators(instances) {
  const room = findActiveRoom(ensureShowDoc());
  if (!room) return;
  applyRoomPlanToCalculators(instances, room.plan);
  const paperwork = readActiveShowPaperwork(ensureShowDoc()) ?? { sheets: [] };
  try {
    instances.paperwork?.importState?.(paperwork);
  } catch (error) {
    console.error("Failed to import show paperwork:", error);
  }
}

/**
 * Switch active room: flush current, select, load, clear undo.
 * @param {Record<string, { exportState?: () => object, importState?: (data: object) => void, flushFormToState?: () => void, refreshUi?: () => void, refresh?: () => void } | null>} instances
 * @param {string} showId
 * @param {string} roomId
 */
export function switchActiveRoom(instances, showId, roomId) {
  const current = findActiveRoom(ensureShowDoc());
  if (current && (ensureShowDoc().activeShowId !== showId || ensureShowDoc().activeRoomId !== roomId)) {
    flushActiveRoomFromCalculators(instances);
  }
  if (!setActiveRoom(ensureShowDoc(), showId, roomId)) return false;
  clearUndoHistory();
  loadActiveRoomIntoCalculators(instances);
  notifyDocumentChange();
  schedulePersist(instances);
  return true;
}

/**
 * @param {Record<string, { exportState?: () => object, flushFormToState?: () => void } | null>} [instances]
 */
export function schedulePersist(instances) {
  if (suppressAutosave) return;
  onDirtyChange?.(true);
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow(instances);
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * @param {Record<string, { exportState?: () => object, flushFormToState?: () => void } | null>} [instances]
 */
export async function persistNow(instances) {
  if (suppressAutosave) return;
  try {
    if (instances) {
      flushActiveRoomFromCalculators(instances);
    }
    stampShowDocument(ensureShowDoc());
    await saveShowDocumentToIdb(deepClone(ensureShowDoc()));
    onDirtyChange?.(false);
  } catch (error) {
    console.warn("Show document autosave failed:", error);
  }
}

/**
 * Replace in-memory document and load active room (no IDB write until dirty).
 * @param {ShowDocument} doc
 * @param {Record<string, { exportState?: () => object, importState?: (data: object) => void, flushFormToState?: () => void, refreshUi?: () => void, refresh?: () => void } | null>} instances
 */
export function replaceShowDocument(doc, instances) {
  suppressAutosave = true;
  try {
    showDoc = normalizeShowDocument(doc, normalizeRoomPlan, emptyRoomPlan);
    clearUndoHistory();
    loadActiveRoomIntoCalculators(instances);
    notifyDocumentChange();
  } finally {
    suppressAutosave = false;
  }
}

/**
 * @param {Record<string, { exportState?: () => object, importState?: (data: object) => void, flushFormToState?: () => void, refreshUi?: () => void, refresh?: () => void } | null>} instances
 * @returns {Promise<"idb" | "seed" | "empty">}
 */
export async function bootShowDocument(instances) {
  suppressAutosave = true;
  try {
    try {
      const stored = await loadShowDocumentFromIdb();
      if (stored && typeof stored === "object") {
        showDoc = normalizeShowDocument(stored, normalizeRoomPlan, emptyRoomPlan);
        loadActiveRoomIntoCalculators(instances);
        notifyDocumentChange();
        return "idb";
      }
    } catch (error) {
      console.warn("Could not load show document from IndexedDB:", error);
    }

    try {
      const response = await fetch("fixtures/default.avp", { cache: "no-store" });
      if (response.ok) {
        const { parseShowDocument } = await import("./site-state.js");
        showDoc = parseShowDocument(await response.text());
        ensureShowDoc().activeTab = "shows";
        loadActiveRoomIntoCalculators(instances);
        notifyDocumentChange();
        await saveShowDocumentToIdb(deepClone(ensureShowDoc()));
        return "seed";
      }
    } catch (error) {
      console.warn("Default site plan seed failed:", error);
    }

    showDoc = emptyShowDocument(emptyRoomPlan());
    loadActiveRoomIntoCalculators(instances);
    notifyDocumentChange();
    await saveShowDocumentToIdb(deepClone(ensureShowDoc()));
    return "empty";
  } finally {
    suppressAutosave = false;
  }
}

/** Flush + persist immediately (visibility / beforeunload). */
export function bindShowDocumentLifecycle(getInstances) {
  const flush = () => {
    const instances = getInstances();
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    void persistNow(instances);
  };

  globalThis.document.addEventListener("visibilitychange", () => {
    if (globalThis.document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

export function markShowDocumentMutated(instances) {
  notifyDocumentChange();
  schedulePersist(instances);
}

export function getActiveShow() {
  return findActiveShow(ensureShowDoc());
}

export function getActiveRoom() {
  return findActiveRoom(ensureShowDoc());
}
