import { CALCULATOR_PLUGINS } from "./calculator-registry.js";
import {
  emptyPlaces,
  liftPlacesFromSitePlan,
  normalizePlaces,
  stripPlacesFromSignalFlow,
} from "./domain/places.js";
import { createSiteDocument } from "./domain/site-document.js";
import { deepClone } from "./shared/clone.js";

export { createSiteDocument } from "./domain/site-document.js";

export const SITE_STATE_VERSION = 2;

/** @type {readonly number[]} */
export const SUPPORTED_IMPORT_VERSIONS = [1, 2];

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
    formatVersion: SITE_STATE_VERSION,
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

  // Prefer lifting before plugin validate so signalFlow no longer carries places.
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

  // Re-strip in case a plugin validate reintroduced nested places.
  if (state.signalFlow !== undefined) {
    state.signalFlow = stripPlacesFromSignalFlow(state.signalFlow);
  }

  return state;
}

/**
 * @param {Record<string, { exportState?: () => object } | null>} instances
 * @param {string} [activeTab]
 */
export function buildSiteState(instances, activeTab) {
  /** @type {Record<string, unknown>} */
  const state = {
    formatVersion: SITE_STATE_VERSION,
    app: "av-site-planner",
    exportedAt: new Date().toISOString(),
    activeTab: activeTab ?? "led-calculator",
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

  // Places live in Signal Flow UI memory; persist at document root.
  const sfExport = /** @type {{ places?: unknown } | null} */ (state.signalFlow ?? null);
  state.places = normalizePlaces(sfExport?.places ?? emptyPlaces());
  if (state.signalFlow !== undefined) {
    state.signalFlow = stripPlacesFromSignalFlow(state.signalFlow);
  }

  return state;
}

/**
 * @param {string} name
 * @returns {string}
 */
export function ensureAvpFilename(name) {
  const trimmed = String(name ?? "").trim() || "site-plan";
  if (/\.(avp|json)$/i.test(trimmed)) return trimmed;
  // Browsers sometimes append .txt when renaming a custom MIME download.
  if (/\.txt$/i.test(trimmed)) return `${trimmed.slice(0, -4)}.avp`;
  return `${trimmed}.avp`;
}

/**
 * @param {string} filename
 * @param {string} contents
 */
function downloadSiteStateLegacy(filename, contents) {
  // Use application/json so Save As / rename keeps a usable extension instead of
  // turning custom AVP MIME types into .txt (which the import picker then hides).
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

/** @param {object} state @returns {Promise<string>} */
export async function downloadSiteState(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  const suggestedName = `av-site-planner-${stamp}.avp`;
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
      // Fall through when the picker is unavailable or blocked.
    }
  }

  return downloadSiteStateLegacy(suggestedName, contents);
}

/** @param {string} text */
export function parseSiteState(text) {
  // Strip a UTF-8 BOM some editors add when a renamed download is re-saved as text.
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

  const version = parsed.formatVersion;
  if (!SUPPORTED_IMPORT_VERSIONS.includes(version)) {
    throw new Error(
      `Unsupported file version (expected ${SUPPORTED_IMPORT_VERSIONS.join(" or ")}).`
    );
  }

  const normalized = migrateSiteStateToV2(parsed);
  normalized.formatVersion = SITE_STATE_VERSION;

  validateSiteState(normalized);
  return deepClone(normalized);
}

/**
 * Parse an .AVP string into a SiteDocument store (peek/subscribe without UI flush).
 * @param {string} text
 * @returns {ReturnType<typeof createSiteDocument>}
 */
export function parseSiteDocument(text) {
  const doc = createSiteDocument();
  doc.load(parseSiteState(text));
  return doc;
}
