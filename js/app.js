import { bindTabBar, escapeXml } from "./shared/dom.js";
import { initLocalNavs, syncLocalNavs } from "./shared/local-nav.js";
import { getCalculatorInstance, setCalculatorInstances } from "./calculator-instances.js";
import {
  CALCULATOR_PLUGINS,
  ensureCalculatorsReady,
  initCalculatorInstances,
} from "./calculator-registry.js";
import {
  downloadSiteState,
  parseShowDocument,
  stampShowDocument,
} from "./site-state.js";
import { documentForSingleShowExport, findActiveShow } from "./domain/show-document.js";
import { initThemeControls } from "./theme.js";
import {
  initUndoKeyboard,
  setUndoDirtyMarker,
} from "./undo-runtime.js";
import { clearCopyPasteClipboard, initCopyPaste } from "./copy-paste.js";
import { initShowsManager } from "./shows.js";
import {
  bindShowDocumentLifecycle,
  bootShowDocument,
  flushActiveRoomFromCalculators,
  getShowDocument,
  persistNow,
  replaceShowDocument,
  schedulePersist,
  setShowDocumentChangeHandler,
  setShowDocumentDirtyHandler,
  switchActiveRoom,
} from "./show-document-runtime.js";
import { bindShowDocumentAccess } from "./show-document-access.js";

bindShowDocumentAccess({
  getShowDocument,
  flushActiveRoomFromCalculators,
});

/** @type {Record<string, { exportState?: () => object, importState?: (data: object) => void } | null>} */
let calculators = {};

/** @type {{ render?: () => void } | null} */
let showsManager = null;

/** @type {boolean} */
let siteDirty = false;

/** @type {boolean} */
let suppressDirty = false;

function getActiveTabId() {
  return document.querySelector(".tab.active")?.dataset.tab ?? "shows";
}

/** @param {string} tabId */
function setActiveTab(tabId) {
  const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if (tab instanceof HTMLElement) {
    tab.click();
  }
}

/** Track pending autosave for beforeunload only — Export is a backup, not the save affordance. */
/** @param {boolean} dirty */
function setSiteDirty(dirty) {
  if (suppressDirty && dirty) return;
  siteDirty = dirty;
}

/** @param {string} message @param {boolean} [isError] */
function showSaveStatus(message, isError = false) {
  for (const id of ["shows-status", "canvas-status", "proj-canvas-status"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = message;
    el.classList.toggle("status-error", isError);
  }
}

function initDirtyTracking() {
  const markDirty = () => {
    if (suppressDirty) return;
    setSiteDirty(true);
    schedulePersist(calculators);
  };
  document.addEventListener("input", markDirty, true);
  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLElement && event.target.id === "active-room-select") {
      return;
    }
    markDirty();
  }, true);
  window.addEventListener("beforeunload", (event) => {
    void persistNow(calculators);
    if (!siteDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

/** Rebuild the chrome room dropdown from the live show document. */
function refreshActiveRoomSelect() {
  const select = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("active-room-select")
  );
  if (!select) return;
  const doc = getShowDocument();
  const show = findActiveShow(doc);
  const options = [];
  if (show) {
    for (const room of show.rooms) {
      const roomName = room.name?.trim() || "Room";
      const value = `${show.id}::${room.id}`;
      options.push(
        `<option value="${escapeXml(value)}">${escapeXml(roomName)}</option>`
      );
    }
  }
  select.innerHTML = options.length
    ? options.join("")
    : `<option value="">No rooms</option>`;
  const current =
    show && doc.activeRoomId ? `${show.id}::${doc.activeRoomId}` : "";
  if (current && [...select.options].some((opt) => opt.value === current)) {
    select.value = current;
  }
  select.disabled = options.length === 0;
}

function initActiveRoomSelect() {
  const select = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("active-room-select")
  );
  if (!select) return;

  select.addEventListener("change", () => {
    const value = select.value;
    const sep = value.indexOf("::");
    if (sep < 0) return;
    const showId = value.slice(0, sep);
    const roomId = value.slice(sep + 2);
    if (!showId || !roomId) return;
    ensureCalculatorsReady(calculators);
    const ok = switchActiveRoom(calculators, showId, roomId);
    if (!ok) {
      refreshActiveRoomSelect();
      showSaveStatus("Could not switch room.", true);
      return;
    }
    showsManager?.render?.();
    refreshActiveRoomSelect();
    const room = getShowDocument()
      .shows.find((s) => s.id === showId)
      ?.rooms.find((r) => r.id === roomId);
    showSaveStatus(room ? `Loaded room “${room.name}”.` : "Room loaded.");
  });

  refreshActiveRoomSelect();
}

function initSaveControls() {
  const exportBtn = document.getElementById("export-btn");
  const importInput = document.getElementById("import-file-input");
  const exportModal = document.getElementById("export-scope-modal");
  const exportClose = document.getElementById("export-scope-close");
  const exportCancel = document.getElementById("export-scope-cancel");
  const exportProfile = document.getElementById("export-scope-profile");
  const exportShow = document.getElementById("export-scope-show");
  const exportShowName = document.getElementById("export-scope-show-name");

  if (!exportBtn || !importInput) return;

  /** @returns {void} */
  const closeExportModal = () => {
    if (exportModal) exportModal.hidden = true;
  };

  /** @returns {void} */
  const openExportModal = () => {
    if (!exportModal) return;
    const show = findActiveShow(getShowDocument());
    if (exportShowName) {
      exportShowName.textContent = show?.name?.trim() || "Active show";
    }
    if (exportShow instanceof HTMLButtonElement) {
      exportShow.disabled = !show;
    }
    exportModal.hidden = false;
    exportProfile?.focus();
  };

  /**
   * @param {"profile" | "show"} scope
   * @returns {Promise<void>}
   */
  const runExport = async (scope) => {
    closeExportModal();
    try {
      ensureCalculatorsReady(calculators);
      flushActiveRoomFromCalculators(calculators);
      const live = stampShowDocument(getShowDocument());
      live.activeTab = getActiveTabId();
      const stamp = new Date().toISOString().slice(0, 10);
      /** @type {object} */
      let payload;
      /** @type {string} */
      let suggestedName;
      if (scope === "show") {
        payload = stampShowDocument(documentForSingleShowExport(live));
        payload.activeTab = live.activeTab;
        const showName = findActiveShow(live)?.name?.trim() || "show";
        suggestedName = `${slugForFilename(showName)}-${stamp}`;
      } else {
        payload = live;
        suggestedName = `av-site-planner-profile-${stamp}`;
      }
      const filename = await downloadSiteState(payload, { suggestedName });
      setSiteDirty(false);
      await persistNow(calculators);
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
  };

  exportBtn.addEventListener("click", () => {
    openExportModal();
  });
  exportClose?.addEventListener("click", closeExportModal);
  exportCancel?.addEventListener("click", closeExportModal);
  exportModal?.addEventListener("click", (event) => {
    if (event.target === exportModal) closeExportModal();
  });
  exportProfile?.addEventListener("click", () => {
    void runExport("profile");
  });
  exportShow?.addEventListener("click", () => {
    void runExport("show");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && exportModal && !exportModal.hidden) {
      closeExportModal();
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;

    try {
      ensureCalculatorsReady(calculators);
      const doc = parseShowDocument(await file.text());
      suppressDirty = true;
      try {
        replaceShowDocument(doc, calculators);
        clearCopyPasteClipboard();
        if (typeof doc.activeTab === "string") {
          setActiveTab(doc.activeTab);
        } else {
          setActiveTab("shows");
        }
        showsManager?.render?.();
      } finally {
        suppressDirty = false;
      }
      await persistNow(calculators);
      setSiteDirty(false);
      refreshActiveRoomSelect();
      showSaveStatus(`Loaded ${file.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      showSaveStatus(message, true);
      console.error(error);
      window.alert(message);
    }
  });
}

/** @param {string} name */
function slugForFilename(name) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "show";
}

async function initApp() {
  initThemeControls();
  initLocalNavs();
  bindTabBar();
  calculators = initCalculatorInstances();
  setCalculatorInstances(calculators);

  setShowDocumentDirtyHandler(setSiteDirty);
  setShowDocumentChangeHandler(() => {
    showsManager?.render?.();
    refreshActiveRoomSelect();
  });
  setUndoDirtyMarker((dirty) => {
    if (dirty) {
      setSiteDirty(true);
      schedulePersist(calculators);
    }
  });

  showsManager = initShowsManager({
    getCalculators: () => calculators,
    setStatus: showSaveStatus,
  });

  initUndoKeyboard();
  initCopyPaste();
  initDirtyTracking();
  initActiveRoomSelect();
  initSaveControls();
  bindShowDocumentLifecycle(() => calculators);

  const boot = await bootShowDocument(calculators);
  const doc = getShowDocument();
  setActiveTab(typeof doc.activeTab === "string" ? doc.activeTab : "shows");
  showsManager?.render?.();
  refreshActiveRoomSelect();
  setSiteDirty(false);

  if (boot === "idb") {
    showSaveStatus("Restored saved shows.");
  } else if (boot === "seed") {
    showSaveStatus("Started from default site plan.");
  } else {
    showSaveStatus("Ready.");
  }

  requestAnimationFrame(() => syncLocalNavs(document, false));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  void initApp();
}

// Keep plugin list referenced so tree-shaking / lint stay quiet in unused-calc setups.
void CALCULATOR_PLUGINS;
