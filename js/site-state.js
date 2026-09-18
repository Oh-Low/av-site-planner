import { CALCULATOR_PLUGINS } from "./calculator-registry.js";
import {
  emptyPlaces,
  liftPlacesFromSitePlan,
  normalizePlaces,
  stripPlacesFromSignalFlow,
} from "./domain/places.js";
import { emptyLedState } from "./domain/led.js";
import { emptyProjectorState } from "./domain/projector.js";
import {
  SHOW_DOCUMENT_VERSION,
  emptyShowDocument,
  normalizeShowDocument,
  wrapV2PlanAsShowDocument,
} from "./domain/show-document.js";
import { createSiteDocument } from "./domain/site-document.js";
import { deepClone } from "./shared/clone.js";

export { createSiteDocument } from "./domain/site-document.js";
export {
  SHOW_DOCUMENT_VERSION,
  emptyShowDocument,
  normalizeShowDocument,
  wrapV2PlanAsShowDocument,
  findActiveShow,
  findActiveRoom,
  reconcileActiveIds,
  setActiveRoom,
  writeActiveRoomPlan,
  writeActiveShowPaperwork,
  readActiveShowPaperwork,
  addShowWithEmptyRoom,
  removeShow,
  duplicateShow,
  renameShow,
  addRoom,
  removeRoom,
  duplicateRoom,
  renameRoom,
  reorderRoom,
  reorderTemplate,
  saveRoomAsTemplate,
  addTemplateToShow,
  removeTemplate,
  duplicateTemplate,
  renameTemplate,
} from "./domain/show-document.js";

/** Current on-disk / export format for multi-show documents. */
export const SITE_STATE_VERSION = SHOW_DOCUMENT_VERSION;

/** Room-plan section format (legacy single-plan / nested plan payload). */
export const ROOM_PLAN_VERSION = 2;

/** @type {readonly number[]} */
export const SUPPORTED_IMPORT_VERSIONS = [1, 2, 3];

/**
 * Ensure root `places` exists and is removed from nested signalFlow.
 * @param {Record<string, unknown>} state
 * @param {unknown} [sourcePlan] Original parsed object (for lift); defaults to state.
 */
function applyPlacesOwnership(state, sourcePlan = state) {
  state.places = liftPlacesFromSitePlan(sourcePlan);
  if (state.signalFlow !== undefined) {
    state.signalFlow = stripPlacesFromSignalFlow(state.signalFlow);
  }
}

/**
 * @param {unknown} parsed
 * @returns {Record<string, unknown>}
 */
export function migrateSiteStateToV2(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The file does not contain a valid site plan.");
  }

  /** @type {Record<string, unknown>} */
  const state = {
    formatVersion: ROOM_PLAN_VERSION,
    app: typeof parsed.app === "string" ? parsed.app : "av-site-planner",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    activeTab: typeof parsed.activeTab === "string" ? parsed.activeTab : "led-calculator",
  };

  for (const plugin of CALCULATOR_PLUGINS) {
    const key = plugin.meta.stateKey;
    const raw = /** @type {Record<string, unknown>} */ (parsed)[key];
    if (raw !== undefined) {
      state[key] = raw;
    } else if (plugin.meta.emptyState) {
      state[key] = plugin.meta.emptyState();
    }
  }

  applyPlacesOwnership(state, parsed);
  return state;
}

/**
 * @param {Record<string, unknown>} state
 * @returns {Record<string, unknown>}
 */
export function validateSiteState(state) {
  if (state.app !== "av-site-planner") {
    throw new Error("The file is not an AV Site Planner site plan.");
  }

  applyPlacesOwnership(state, state);
  state.places = normalizePlaces(state.places ?? emptyPlaces());

  for (const plugin of CALCULATOR_PLUGINS) {
    const key = plugin.meta.stateKey;
    const raw = state[key];

    if (plugin.meta.validateState) {
      state[key] = plugin.meta.validateState(raw);
      continue;
    }

    if (raw === undefined) {
      if (plugin.meta.requiredForSave) {
        throw new Error(`The file is missing ${plugin.meta.label} data.`);
      }
      if (plugin.meta.emptyState) {
        state[key] = plugin.meta.emptyState();
      }
    }
  }

  if (state.signalFlow !== undefined) {
    state.signalFlow = stripPlacesFromSignalFlow(state.signalFlow);
  }

  return state;
}

/** Section keys stored inside a room plan (resolved lazily to avoid import cycles).
 * Paperwork is show-scoped (see writeActiveShowPaperwork), not per-room.
 */
function roomPlanKeys() {
  return [
    "places",
    ...CALCULATOR_PLUGINS.map((plugin) => plugin.meta.stateKey).filter(
      (key) => key !== "paperwork"
    ),
  ];
}

/**
 * @returns {Record<string, unknown>}
 */
export function emptyRoomPlan() {
  const state = validateSiteState(
    migrateSiteStateToV2({
      formatVersion: 2,
      app: "av-site-planner",
      led: emptyLedState(),
      projector: emptyProjectorState(),
    })
  );
  /** @type {Record<string, unknown>} */
  const plan = {};
  for (const key of roomPlanKeys()) {
    if (state[key] !== undefined) plan[key] = deepClone(state[key]);
  }
  return plan;
}

/**
 * Normalize a room calculator snapshot (v2 section payload).
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeRoomPlan(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const defaults = emptyRoomPlan();
  const wrapped = migrateSiteStateToV2({
    formatVersion: 2,
    app: "av-site-planner",
    ...defaults,
    ...source,
  });
  const state = validateSiteState(wrapped);
  /** @type {Record<string, unknown>} */
  const plan = {};
  for (const key of roomPlanKeys()) {
    if (state[key] !== undefined) plan[key] = deepClone(state[key]);
  }
  return plan;
}

/**
 * @param {Record<string, { exportState?: () => object, flushFormToState?: () => void } | null>} instances
 * @returns {Record<string, unknown>}
 */
export function buildRoomPlanFromCalculators(instances) {
  /** @type {Record<string, unknown>} */
  const state = {
    formatVersion: ROOM_PLAN_VERSION,
    app: "av-site-planner",
    exportedAt: new Date().toISOString(),
    activeTab: "led-calculator",
  };

  for (const plugin of CALCULATOR_PLUGINS) {
    const key = plugin.meta.stateKey;
    const instance = instances[key];
    if (instance?.flushFormToState) {
      instance.flushFormToState();
    }
    if (instance?.exportState) {
      state[key] = instance.exportState();
    } else if (plugin.meta.emptyState) {
      state[key] = plugin.meta.emptyState();
    }
  }

  const sfExport = /** @type {{ places?: unknown } | null} */ (state.signalFlow ?? null);
  state.places = normalizePlaces(sfExport?.places ?? emptyPlaces());
  if (state.signalFlow !== undefined) {
    state.signalFlow = stripPlacesFromSignalFlow(state.signalFlow);
  }

  return normalizeRoomPlan(state);
}

/**
 * @param {Record<string, { exportState?: () => object } | null>} instances
 * @param {string} [activeTab]
 */
export function buildSiteState(instances, activeTab) {
  const plan = buildRoomPlanFromCalculators(instances);
  return {
    formatVersion: ROOM_PLAN_VERSION,
    app: "av-site-planner",
    exportedAt: new Date().toISOString(),
    activeTab: activeTab ?? "led-calculator",
    ...plan,
  };
}

/**
 * @param {string} name
 * @returns {string}
 */
export function ensureAvpFilename(name) {
  const trimmed = String(name ?? "").trim() || "site-plan";
  if (/\.(avp|json)$/i.test(trimmed)) return trimmed;
  if (/\.txt$/i.test(trimmed)) return `${trimmed.slice(0, -4)}.avp`;
  return `${trimmed}.avp`;
}

/**
 * @param {string} filename
 * @param {string} contents
 */
function downloadSiteStateLegacy(filename, contents) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
  return filename;
}

/**
 * @param {object} state
 * @param {{ suggestedName?: string }} [options]
 * @returns {Promise<string>}
 */
export async function downloadSiteState(state, options = {}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const suggestedName = ensureAvpFilename(
    options.suggestedName?.trim() || `av-site-planner-${stamp}`
  );
  const contents = JSON.stringify(state, null, 2);

  if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "AV Site Plan",
            accept: {
              "application/json": [".avp", ".json"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return ensureAvpFilename(handle.name);
    } catch (error) {
      if (error && /** @type {{ name?: string }} */ (error).name === "AbortError") {
        throw new Error("Export cancelled.");
      }
    }
  }

  return downloadSiteStateLegacy(suggestedName, contents);
}

/**
 * Parse / migrate / validate a multi-show (v3) or legacy single-room (v1/v2) file.
 * @param {string} text
 * @returns {import("./domain/show-document.js").ShowDocument}
 */
export function parseShowDocument(text) {
  const cleaned = String(text ?? "").replace(/^\uFEFF/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("The file is not a valid AVP site plan.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The file does not contain a valid site plan.");
  }

  const version = /** @type {{ formatVersion?: unknown }} */ (parsed).formatVersion;
  if (!SUPPORTED_IMPORT_VERSIONS.includes(/** @type {number} */ (version))) {
    throw new Error(
      `Unsupported file version (expected ${SUPPORTED_IMPORT_VERSIONS.join(" or ")}).`
    );
  }

  if (version === 3 || Array.isArray(/** @type {{ shows?: unknown }} */ (parsed).shows)) {
    return deepClone(normalizeShowDocument(parsed, normalizeRoomPlan, emptyRoomPlan));
  }

  const v2 = validateSiteState(migrateSiteStateToV2(parsed));
  v2.formatVersion = ROOM_PLAN_VERSION;
  return deepClone(wrapV2PlanAsShowDocument(v2, emptyRoomPlan));
}

/**
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseSiteState(text) {
  const doc = parseShowDocument(text);
  const show = doc.shows.find((s) => s.id === doc.activeShowId) ?? doc.shows[0];
  const room = show?.rooms.find((r) => r.id === doc.activeRoomId) ?? show?.rooms[0];
  if (!room) {
    throw new Error("The file does not contain a valid site plan.");
  }
  return deepClone({
    formatVersion: ROOM_PLAN_VERSION,
    app: "av-site-planner",
    exportedAt: doc.exportedAt,
    activeTab: doc.activeTab === "shows" ? "led-calculator" : doc.activeTab,
    ...room.plan,
  });
}

/**
 * @param {string} text
 * @returns {ReturnType<typeof createSiteDocument>}
 */
export function parseSiteDocument(text) {
  const store = createSiteDocument();
  store.load(parseSiteState(text));
  return store;
}

/**
 * @param {import("./domain/show-document.js").ShowDocument} doc
 */
export function stampShowDocument(doc) {
  doc.exportedAt = new Date().toISOString();
  doc.formatVersion = SHOW_DOCUMENT_VERSION;
  doc.app = "av-site-planner";
  return doc;
}
