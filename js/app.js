import { bindTabBar } from "./shared/dom.js";
import { setCalculatorInstances } from "./calculator-instances.js";
import {
  CALCULATOR_PLUGINS,
  ensureCalculatorsReady,
  initCalculatorInstances,
} from "./calculator-registry.js?v=120";
import { buildSiteState, downloadSiteState, parseSiteState } from "./site-state.js?v=2";

/** Auto-loaded on startup. Keep fixtures/default.avp as a blank/minimal site plan. */
const DEFAULT_AVP_PATH = "fixtures/default.avp";

/** @type {Record<string, { exportState?: () => object, importState?: (data: object) => void } | null>} */
let calculators = {};

function getActiveTabId() {
  return document.querySelector(".tab.active")?.dataset.tab ?? "led-calculator";
}

/** @param {string} tabId */
function setActiveTab(tabId) {
  const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if (tab instanceof HTMLElement) {
    tab.click();
  }
}

/** @param {string} message @param {boolean} [isError] */
function showSaveStatus(message, isError = false) {
  const headerStatus = document.getElementById("app-save-status");
  if (headerStatus) {
    headerStatus.textContent = message;
    headerStatus.classList.toggle("is-error", isError);
  }
  for (const id of ["canvas-status", "proj-canvas-status"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = message;
    el.classList.toggle("status-error", isError);
  }
}

/** @param {Record<string, unknown>} state */
function applySiteState(state) {
  ensureCalculatorsReady(calculators);

  for (const plugin of CALCULATOR_PLUGINS) {
    const key = plugin.meta.stateKey;
    const fallback = plugin.meta.emptyState?.() ?? {};
    try {
      calculators[key]?.importState?.(state[key] ?? fallback);
    } catch (error) {
      console.error(`Failed to import ${plugin.meta.label} state:`, error);
    }
    // Refresh LED as soon as its state lands so later calculators that peek
    // via exportState (e.g. paperwork) never see a stale empty form.
    if (key === "led") {
      calculators.led?.refreshUi?.();
    }
  }

  if (typeof state.activeTab === "string") {
    setActiveTab(state.activeTab);
  }

  calculators.led?.refreshUi?.();
}

async function loadDefaultSiteState() {
  try {
    const response = await fetch(`${DEFAULT_AVP_PATH}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      console.warn(`Default site plan not found (${DEFAULT_AVP_PATH}): ${response.status}`);
      return;
    }

    const state = parseSiteState(await response.text());
    applySiteState(state);
    showSaveStatus("Loaded default site plan.");
  } catch (error) {
    console.warn("Default site plan not loaded:", error);
  }
}

function initSaveControls() {
  const exportBtn = document.getElementById("export-btn");
  const importInput = document.getElementById("import-file-input");
  const printBtn = document.getElementById("print-btn");

  if (!exportBtn || !importInput) return;

  printBtn?.addEventListener("click", () => {
    window.print();
  });

  exportBtn.addEventListener("click", () => {
    try {
      ensureCalculatorsReady(calculators);
      const state = buildSiteState(calculators, getActiveTabId());
      const filename = downloadSiteState(state);
      showSaveStatus(`Exported ${filename}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      showSaveStatus(message, true);
      console.error(error);
      window.alert(message);
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;

    try {
      const state = parseSiteState(await file.text());
      applySiteState(state);
      showSaveStatus(`Loaded ${file.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      showSaveStatus(message, true);
      console.error(error);
      window.alert(message);
    }
  });
}

async function initGroundplanCalculator(instances) {
  try {
    const { initGroundplan } = await import("./groundplan.js?v=46");
    const signalFlow = instances.signalFlow;
    instances.groundplan = initGroundplan({
      getPlaces: () => signalFlow?.exportState?.()?.places ?? [],
      addPlace: (name) => signalFlow?.addPlace?.(name) ?? false,
    });
    if (!instances.groundplan) {
      console.error("Groundplan init returned null — check DOM elements.");
    }
  } catch (error) {
    console.error("Groundplan failed to initialize:", error);
    instances.groundplan = null;
  }
}

async function initApp() {
  bindTabBar();
  calculators = initCalculatorInstances();
  await initGroundplanCalculator(calculators);
  setCalculatorInstances(calculators);
  initSaveControls();
  await loadDefaultSiteState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
