import { CALCULATOR_PLUGINS } from "./calculator-registry.js";
import { deepClone } from "./shared/clone.js";

export const SITE_STATE_VERSION = 2;

/** @type {readonly number[]} */
export const SUPPORTED_IMPORT_VERSIONS = [1, 2];

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

  return state;
}

/** @param {object} state */
export function downloadSiteState(state) {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `av-site-planner-${stamp}.AVP`;
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/vnd.av-site-planner+avp",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.type = "application/vnd.av-site-planner+avp";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
  return filename;
}

/** @param {string} text */
export function parseSiteState(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
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

  const normalized = version === 1 ? migrateSiteStateToV2(parsed) : { ...parsed, formatVersion: SITE_STATE_VERSION };
  if (normalized.formatVersion !== SITE_STATE_VERSION) {
    throw new Error(`Unsupported file version (expected ${SITE_STATE_VERSION}).`);
  }

  validateSiteState(normalized);
  return deepClone(normalized);
}
