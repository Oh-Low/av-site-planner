import { bindTabBar } from "./shared/dom.js";
import { setCalculatorInstances } from "./calculator-instances.js";
import {
  CALCULATOR_PLUGINS,
  ensureCalculatorsReady,
  initCalculatorInstances,
} from "./calculator-registry.js";
import {
  syncSiteDocumentFromCalculators,
  syncSiteDocumentFromPlan,
} from "./site-document-runtime.js";
import { downloadSiteState, parseSiteState } from "./site-state.js";

/** Auto-loaded on startup. Served from fixtures/ via the Vite fixtures plugin. */
const DEFAULT_AVP_PATH = "fixtures/default.avp";

/** @type {Record<string, { exportState?: () => object, importState?: (data: object) => void } | null>} */
let calculators = {};

/** @type {boolean} */
let siteDirty = false;

/** @type {boolean} */
let suppressDirty = false;

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

/** @param {boolean} dirty */
function setSiteDirty(dirty) {
  if (suppressDirty && dirty) return;
  siteDirty = dirty;
  document.body.classList.toggle("is-site-dirty", dirty);
  const exportBtn = document.getElementById("export-btn");
  if (exportBtn) {
    exportBtn.classList.toggle("is-dirty", dirty);
    exportBtn.title = dirty ? "Unsaved changes — export to save" : "Export site plan (.AVP)";
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
  syncSiteDocumentFromPlan(state);

  suppressDirty = true;
  try {
    for (const plugin of CALCULATOR_PLUGINS) {
      const key = plugin.meta.stateKey;
      const fallback = plugin.meta.emptyState?.() ?? {};
      try {
        let section = state[key] ?? fallback;
        // Places persist at document root; inject into Signal Flow for UI runtime.
        if (key === "signalFlow" && section && typeof section === "object") {
          section = {
            .../** @type {object} */ (section),
            places: Array.isArray(state.places) ? state.places : [],
          };
        }
        calculators[key]?.importState?.(section);
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
  } finally {
    suppressDirty = false;
    setSiteDirty(false);
  }
}

async function loadDefaultSiteState() {
  try {
    const response = await fetch(DEFAULT_AVP_PATH, { cache: "no-store" });
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

function initDirtyTracking() {
  const markDirty = () => setSiteDirty(true);
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", markDirty, true);
  window.addEventListener("beforeunload", (event) => {
    if (!siteDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function initSaveControls() {
  const exportBtn = document.getElementById("export-btn");
  const importInput = document.getElementById("import-file-input");
  const printBtn = document.getElementById("print-btn");

  if (!exportBtn || !importInput) return;

  printBtn?.addEventListener("click", () => {
    window.print();
  });

  exportBtn.addEventListener("click", async () => {
    try {
      ensureCalculatorsReady(calculators);
      const state = syncSiteDocumentFromCalculators(calculators, getActiveTabId());
      const filename = await downloadSiteState(state);
      setSiteDirty(false);
      showSaveStatus(`Exported ${filename}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      if (message === "Export cancelled.") {
        showSaveStatus("Export cancelled.");
        return;
      }
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

function initApp() {
  bindTabBar();
  calculators = initCalculatorInstances();
  setCalculatorInstances(calculators);
  initDirtyTracking();
  initSaveControls();
  void loadDefaultSiteState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
