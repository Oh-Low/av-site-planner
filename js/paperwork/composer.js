import { getCalculatorExport } from "../calculator-instances.js";
import { deepClone } from "../shared/clone.js";
import { escapeXml } from "../shared/dom.js";
import { createDoubleClickTracker } from "../shared/double-click.js";
import { createListNameEditor } from "../shared/inline-editor.js";
import { listLinkedSourceOptions } from "./element-catalog.js";
import { renderElementLibraryBrowser } from "./element-library-browser.js";
import {
  clearPlacementsForFolders,
  deleteLibraryFolder,
  isBuiltinLibraryFolderId,
  mergeLibraryFolders,
  moveLibraryItemToFolder,
  renameLibraryFolder,
  resolveLibraryCatalog,
} from "./element-library.js";
import { renderSheetLibraryBrowser } from "./sheet-library-browser.js";
import {
  buildAutoSheetLibrary,
  deleteSheetFolder,
  effectiveSheetFolderId,
  isBuiltinSheetFolderId,
  mergeSheetFolders,
  moveSheetToFolder,
  renameSheetFolder,
} from "./sheet-library.js";
import {
  clampFrameToPage,
  createDecoration,
  decorationsForSheet,
  normalizeDrawStyle,
} from "./decorations.js";
import { renderDecoration } from "./decoration-render.js";
import { getDrawTool, listDrawTools } from "./draw-tools.js";
import "./elements/base.js";
import {
  normalizeCableCardScale,
} from "./elements/cable-cards.js";
import "./elements/groundplan-diagram.js";
import "./elements/led-spec-table.js";
import "./elements/led-wiring.js";
import "./elements/raster-diagram.js";
import "./elements/signal-flow-diagram.js";
import "./elements/surface-diagram.js";
import { getElementRenderer } from "./elements/registry.js";
import {
  FONT_SIZE_ELEMENT_TYPES,
  MAX_FONT_SIZE_PT,
  MIN_FONT_SIZE_PT,
  normalizeFontSizePt,
  resolveElementFontSizePt,
} from "./font-scale.js";
import {
  buildLedSpecificationFields,
  ledSpecificationFieldValue,
} from "./led-spec-data.js";
import {
  computeGroundplanFitCrop,
  normalizeGroundplanCrop,
} from "./groundplan-svg.js";
import { computeSignalFlowFitCrop } from "./signal-flow-svg.js";
import { formatNumberInput, roundTo } from "./numbers.js";
import { PAPER_SIZES, resolvePaper } from "./paper-sizes.js";
import { createSceneEditor } from "./scene-editor.js";
import "./sheets/cable-runs.js";
import "./sheets/cover.js";
import "./sheets/custom-plate.js";
import "./sheets/led-wall-spec.js";
import "./sheets/raster.js";
import "./sheets/signal-flow.js";
import "./sheets/surface.js";
import {
  normalizeSurfaceDimensionUnit,
  resolveSurfacePpi,
} from "./surface-scale.js";
import {
  isShareableElementType,
  sharedElementsForSheet,
} from "./shared-elements.js";
import {
  createElement,
  createManualSheet,
  duplicateSheet,
  emptyPaperworkState,
  isIdentityField,
  normalizeGrid,
  normalizePaperworkState,
  normalizeTitleBlockLogo,
} from "./state.js";
import { titleBlockFrame } from "./title-block-layout.js";
import { refreshSheetBindings, resetSheetLayout, syncSheetsFromSources } from "./sync.js";

export { emptyPaperworkState };

function collectSiteExports() {
  const signalFlow = getCalculatorExport("signalFlow");
  const places = Array.isArray(signalFlow?.places) ? signalFlow.places : [];
  return {
    places,
    led: getCalculatorExport("led"),
    projector: getCalculatorExport("projector"),
    signalFlow,
    groundplan: getCalculatorExport("groundplan"),
    contentMaps: getCalculatorExport("contentMaps"),
    cable: getCalculatorExport("cable"),
    labor: getCalculatorExport("labor"),
  };
}

export function initPaperworkComposer() {
  const root = document.getElementById("paperwork-composer");
  if (!root) return null;

  /** @type {import("./state.js").PaperworkState} */
  const state = emptyPaperworkState();

  const layoutEl = root.querySelector(".pw-layout");

  const els = {
    paperSize: /** @type {HTMLSelectElement|null} */ (document.getElementById("pw-paper-size")),
    paperOrientation: /** @type {HTMLSelectElement|null} */ (
      document.getElementById("pw-paper-orientation")
    ),
    tbInclude: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-include")),
    tbLogo: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-logo")),
    tbLogoClear: /** @type {HTMLButtonElement|null} */ (document.getElementById("pw-tb-logo-clear")),
    tbProject: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-project")),
    tbCompany: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-company")),
    tbApproved: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-approved")),
    tbChecked: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-checked")),
    tbDrawn: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-drawn")),
    tbRevision: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-tb-revision")),
    generatePacketBtn: document.getElementById("pw-generate-packet"),
    updateLinkedBtn: document.getElementById("pw-update-linked"),
    resetLayoutBtn: document.getElementById("pw-reset-layout"),
    resetViewBtn: document.getElementById("pw-reset-view"),
    status: document.getElementById("pw-status"),
    sheetList: document.getElementById("pw-sheet-list"),
    viewport: document.getElementById("pw-viewport"),
    artboard: document.getElementById("pw-artboard"),
    drawTools: document.getElementById("pw-draw-tools"),
    styleFill: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-style-fill")),
    styleStroke: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-style-stroke")),
    styleWeight: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-style-weight")),
    styleFont: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-style-font")),
    bringForwardBtn: document.getElementById("pw-bring-forward"),
    sendBackwardBtn: document.getElementById("pw-send-backward"),
    gridUi: document.getElementById("pw-grid-ui"),
    gridBtn: /** @type {HTMLButtonElement|null} */ (document.getElementById("pw-grid-btn")),
    gridPopover: document.getElementById("pw-grid-popover"),
    gridVisible: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-grid-visible")),
    gridSnap: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-grid-snap")),
    gridSize: /** @type {HTMLInputElement|null} */ (document.getElementById("pw-grid-size")),
    gridArrange: document.getElementById("pw-grid-arrange"),
    rightCollapse: /** @type {HTMLButtonElement|null} */ (
      document.getElementById("pw-right-collapse")
    ),
    rightBody: document.getElementById("pw-right-body"),
    elementLibrary: document.getElementById("pw-element-library"),
    inspector: document.getElementById("pw-inspector"),
    inspectorEmpty: document.getElementById("pw-inspector-empty"),
    inspectorFields: document.getElementById("pw-inspector-fields"),
    newSheetBtn: document.getElementById("pw-new-sheet"),
    duplicateSheetBtn: /** @type {HTMLButtonElement|null} */ (
      document.getElementById("pw-duplicate-sheet")
    ),
    deleteSheetBtn: /** @type {HTMLButtonElement|null} */ (
      document.getElementById("pw-delete-sheet")
    ),
    deleteElementBtn: document.getElementById("pw-delete-element"),
    exportPaperworkBtn: /** @type {HTMLButtonElement|null} */ (
      document.getElementById("pw-export-paperwork")
    ),
  };

  /** @type {import("./element-catalog.js").AddableElement[]} */
  let addableElements = [];

  /** @type {Set<string>} */
  let expandedLibraryFolderIds = new Set(["fld-auto:Standard"]);
  /** @type {string | null} */
  let activeLibraryFolderId = null;
  /** @type {string | null} */
  let renamingLibraryFolderId = null;
  let librarySearchQuery = "";

  /** @type {Set<string>} */
  let expandedSheetFolderIds = new Set();
  /** @type {string | null} */
  let activeSheetFolderId = null;
  /** @type {string | null} */
  let renamingSheetFolderId = null;
  let sheetSearchQuery = "";

  let activeTool = "select";
  /** Remember Field overrides expand state across inspector re-renders. */
  let fieldOverridesExpanded = false;
  /** @type {{ open: (nameEl: HTMLElement) => void, close: () => void } | null} */
  let sheetNameEditor = null;

  if (els.paperSize) {
    els.paperSize.innerHTML = PAPER_SIZES.map(
      (s) => `<option value="${s.id}">${escapeXml(s.label)}</option>`
    ).join("");
  }

  function getActiveSheet() {
    return state.sheets.find((s) => s.id === state.activeSheetId) ?? null;
  }

  /** @param {string} id */
  function findElementById(id) {
    const sheet = getActiveSheet();
    return (
      sheet?.elements.find((el) => el.id === id) ??
      state.sharedElements.find((el) => el.id === id) ??
      null
    );
  }

  /** @param {string} id */
  function deleteElementById(id) {
    const sheet = getActiveSheet();
    const removed =
      sheet?.elements.find((el) => el.id === id) ??
      state.sharedElements.find((el) => el.id === id) ??
      null;
    if (sheet?.elements.some((el) => el.id === id)) {
      sheet.elements = sheet.elements.filter((el) => el.id !== id);
    } else {
      state.sharedElements = state.sharedElements.filter((el) => el.id !== id);
    }
    if (state.selectedElementId === id) state.selectedElementId = null;
    if (removed?.type === "titleBlock") {
      const stillHasTb =
        state.sharedElements.some((el) => el.type === "titleBlock") ||
        state.sheets.some((s) => s.elements.some((el) => el.type === "titleBlock"));
      if (!stillHasTb) state.titleBlockDefault = false;
    }
  }

  /**
   * Promote a sheet-local element to packet-level shared (optionally all sheets).
   * @param {import("./state.js").PageElement} el
   * @param {boolean} showOnAll
   */
  function setElementShowOnAllSheets(el, showOnAll) {
    const sheet = getActiveSheet();
    if (!sheet || !isShareableElementType(el.type)) return;

    const inShared = state.sharedElements.some((item) => item.id === el.id);
    if (showOnAll) {
      if (!inShared) {
        sheet.elements = sheet.elements.filter((item) => item.id !== el.id);
        state.sharedElements.push(el);
      }
      // Avoid duplicate title blocks when one becomes packet-wide.
      if (el.type === "titleBlock") {
        for (const s of state.sheets) {
          s.elements = s.elements.filter((item) => item.type !== "titleBlock");
        }
        state.titleBlockDefault = true;
      }
      el.showOnAllSheets = true;
      el.sheetId = null;
      el.hiddenOnSheets = [];
    } else {
      el.showOnAllSheets = false;
      el.sheetId = sheet.id;
      el.hiddenOnSheets = [];
      if (el.type === "titleBlock") state.titleBlockDefault = false;
      if (inShared) {
        state.sharedElements = state.sharedElements.filter((item) => item.id !== el.id);
        if (!sheet.elements.some((item) => item.id === el.id)) {
          sheet.elements.push(el);
        }
      }
    }
  }

  /**
   * Keep a single shared title block when include is on; remove all when off.
   * @param {{ reframe?: boolean }} [opts]
   */
  function syncSharedTitleBlock(opts = {}) {
    const reframe = Boolean(opts.reframe);
    for (const sheet of state.sheets) {
      sheet.elements = sheet.elements.filter((el) => el.type !== "titleBlock");
    }

    const sharedBlocks = state.sharedElements.filter((el) => el.type === "titleBlock");
    if (!state.titleBlockDefault) {
      state.sharedElements = state.sharedElements.filter((el) => el.type !== "titleBlock");
      if (
        state.selectedElementId &&
        sharedBlocks.some((el) => el.id === state.selectedElementId)
      ) {
        state.selectedElementId = null;
      }
      return;
    }

    const page = resolvePaper(state.paper.size, state.paper.orientation);
    const keep = sharedBlocks[0] ?? null;
    state.sharedElements = state.sharedElements.filter((el) => el.type !== "titleBlock");
    if (keep) {
      if (reframe) {
        const frame = titleBlockFrame(page);
        keep.x = frame.x;
        keep.y = frame.y;
        keep.w = frame.w;
        keep.h = frame.h;
      }
      keep.showOnAllSheets = true;
      keep.sheetId = null;
      if (!Array.isArray(keep.hiddenOnSheets)) keep.hiddenOnSheets = [];
      state.sharedElements.push(keep);
      return;
    }

    state.sharedElements.push(
      createElement({
        type: "titleBlock",
        ...titleBlockFrame(page),
        z: 50,
        showOnAllSheets: true,
        sheetId: null,
        content: {},
      })
    );
  }

  function includedSheets() {
    return state.sheets.filter((s) => s.included).sort((a, b) => a.order - b.order);
  }

  function sheetNumbering(sheet) {
    const list = includedSheets();
    const idx = list.findIndex((s) => s.id === sheet.id);
    return {
      number: idx >= 0 ? idx + 1 : 0,
      count: list.length,
    };
  }

  function setStatus(message) {
    if (els.status) els.status.textContent = message;
  }

  function siteExports() {
    return collectSiteExports();
  }

  /**
   * Shared project identity — edit once on the sheet, apply everywhere.
   * @param {string} fieldId
   * @param {string} value
   */
  function applyIdentityField(fieldId, value) {
    if (!isIdentityField(fieldId)) return false;
    state.identity[/** @type {keyof import("./state.js").ProjectIdentity} */ (fieldId)] = value;
    for (const sheet of state.sheets) {
      for (const el of sheet.elements) {
        if (el.overrides && fieldId in el.overrides) delete el.overrides[fieldId];
      }
      refreshSheetBindings(sheet, siteExports(), state.identity);
    }
    for (const el of state.sharedElements) {
      if (el.overrides && fieldId in el.overrides) delete el.overrides[fieldId];
    }
    return true;
  }

  function snapInches(value) {
    if (!state.grid?.snap) return roundTo(value);
    const size = Math.max(0.05, Number(state.grid.sizeIn) || 0.25);
    return roundTo(Math.round(value / size) * size);
  }

  function clientToInches(clientX, clientY) {
    const rect = els.artboard?.getBoundingClientRect();
    const paper = resolvePaper(state.paper.size, state.paper.orientation);
    if (!rect?.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: snapInches(((clientX - rect.left) / rect.width) * paper.widthIn),
      y: snapInches(((clientY - rect.top) / rect.height) * paper.heightIn),
    };
  }

  function maxZOnSheet(sheet) {
    return Math.max(
      0,
      ...state.decorations.map((d) => d.z),
      ...state.sharedElements.map((e) => e.z),
      ...(sheet?.elements.map((e) => e.z) ?? [])
    );
  }

  const DECORATION_LABELS = {
    drawText: "Text",
    drawHeading: "Heading",
    drawLine: "Line",
    drawArrow: "Arrow",
    drawRect: "Rectangle",
    drawEllipse: "Ellipse",
    drawPolyline: "Polyline",
  };

  const scene = createSceneEditor({
    viewport: /** @type {HTMLElement} */ (els.viewport),
    artboard: /** @type {HTMLElement} */ (els.artboard),
    getSheet: getActiveSheet,
    getPaper: () => resolvePaper(state.paper.size, state.paper.orientation),
    getSelectedId: () => state.selectedElementId,
    setSelectedId: (id) => {
      state.selectedElementId = id;
      if (id) state.selectedDecorationId = null;
    },
    getVisibleDecorations: () => decorationsForSheet(state.decorations, state.activeSheetId),
    getDecorationById: (id) => state.decorations.find((d) => d.id === id) ?? null,
    getSelectedDecorationId: () => state.selectedDecorationId,
    setSelectedDecorationId: (id) => {
      state.selectedDecorationId = id;
      if (id) state.selectedElementId = null;
    },
    getVisibleElements: () => {
      const sheet = getActiveSheet();
      if (!sheet) return [];
      return [
        ...sheet.elements,
        ...sharedElementsForSheet(state.sharedElements, sheet.id),
      ];
    },
    getElementById: (id) => findElementById(id),
    onDeleteElement: (id) => {
      deleteElementById(id);
    },
    renderDecoration,
    commitDecorationField: (dec, fieldId, value) => {
      if (fieldId === "body") {
        dec.content = { ...dec.content, body: value };
        return true;
      }
      return false;
    },
    onDeleteDecoration: (id) => {
      state.decorations = state.decorations.filter((d) => d.id !== id);
      if (state.selectedDecorationId === id) state.selectedDecorationId = null;
    },
    getActiveTool: () => activeTool,
    getDrawStyle: () => state.drawStyle,
    getGrid: () => state.grid,
    onCreateDecoration: (partial) => {
      const sheet = getActiveSheet();
      const page = resolvePaper(state.paper.size, state.paper.orientation);
      const maxZ = maxZOnSheet(sheet);
      const frame = clampFrameToPage(
        { x: partial.x, y: partial.y, w: partial.w, h: partial.h },
        page
      );
      const dec = createDecoration({
        ...partial,
        ...frame,
        style: { ...state.drawStyle, ...(partial.style || {}) },
        sheetId: sheet?.id ?? null,
        showOnAllSheets: partial.showOnAllSheets === true,
        z: maxZ + 1,
      });
      state.decorations.push(dec);
      state.selectedDecorationId = dec.id;
      state.selectedElementId = null;
      const tool = getDrawTool(activeTool);
      if (tool?.oneShot !== false && activeTool !== "select") {
        activeTool = "select";
        renderDrawToolbar();
      }
      renderPage();
      renderInspector();
    },
    onChange: () => {
      renderInspector();
      renderSheetList();
    },
    onViewChange: () => updateViewHint(),
    resolveFieldValue: (element, fieldId) => {
      if (isIdentityField(fieldId)) return state.identity[fieldId] ?? "";
      if (element.type === "ledSpecificationTable") {
        return ledSpecificationFieldValue(
          siteExports(),
          typeof element.content?.sourceKey === "string"
            ? element.content.sourceKey
            : getActiveSheet()?.sourceKey,
          fieldId
        );
      }
      return null;
    },
    commitField: (_element, fieldId, value) => applyIdentityField(fieldId, value),
    renderElement: (host, element) => {
      const sheet = getActiveSheet();
      if (!sheet) return;
      renderElementOnto(host, element, sheet, {
        editable: true,
        selected: element.id === state.selectedElementId,
      });
    },
  });

  /**
   * @param {HTMLElement} host
   * @param {import("./state.js").PageElement} element
   * @param {import("./state.js").SheetInstance} sheet
   * @param {{ editable?: boolean, selected?: boolean }} [opts]
   */
  function renderElementOnto(host, element, sheet, opts = {}) {
    const renderer = getElementRenderer(element.type);
    if (!renderer) {
      host.textContent = `[${element.type}]`;
      return;
    }
    const { number, count } = sheetNumbering(sheet);
    const paper = resolvePaper(state.paper.size, state.paper.orientation);
    const sizeCode =
      Math.max(paper.widthIn, paper.heightIn) >= 35
        ? "D"
        : Math.max(paper.widthIn, paper.heightIn) >= 23
          ? "C"
          : Math.max(paper.widthIn, paper.heightIn) >= 16
            ? "B"
            : "A";
    renderer.render(host, {
      element,
      sheet,
      identity: state.identity,
      sheetNumber: number || 1,
      sheetCount: Math.max(1, count),
      siteExports: siteExports(),
      paperSizeCode: sizeCode,
      titleBlockLogo: state.titleBlockLogo,
      editable: opts.editable !== false,
      selected: opts.selected === true,
    });
  }

  /**
   * Build print pages for included sheets and open the system print dialog
   * (Save as PDF from there).
   */
  function exportPaperwork() {
    const sheets = includedSheets();
    if (!sheets.length) {
      setStatus("No included sheets to export — check sheets in the list first.");
      return;
    }

    const paper = resolvePaper(state.paper.size, state.paper.orientation);
    let root = document.getElementById("pw-print-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "pw-print-root";
      root.setAttribute("aria-hidden", "true");
      document.body.appendChild(root);
    }
    root.innerHTML = "";

    let pageStyle = document.getElementById("pw-print-page-style");
    if (!pageStyle) {
      pageStyle = document.createElement("style");
      pageStyle.id = "pw-print-page-style";
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = `@page { size: ${paper.widthIn}in ${paper.heightIn}in; margin: 0; }`;

    for (const sheet of sheets) {
      const page = document.createElement("div");
      page.className = "pw-print-page";
      page.style.width = `${paper.widthIn}in`;
      page.style.height = `${paper.heightIn}in`;

      const elements = [
        ...sheet.elements,
        ...sharedElementsForSheet(state.sharedElements, sheet.id),
      ].sort((a, b) => a.z - b.z);

      for (const el of elements) {
        const node = document.createElement("div");
        node.className = "pw-element pw-print-item";
        node.style.left = `${el.x}in`;
        node.style.top = `${el.y}in`;
        node.style.width = `${el.w}in`;
        node.style.height = `${el.h}in`;
        node.style.zIndex = String(el.z);
        const body = document.createElement("div");
        body.className = "pw-element-body";
        renderElementOnto(body, el, sheet, { editable: false });
        node.appendChild(body);
        page.appendChild(node);
      }

      const decorations = decorationsForSheet(state.decorations, sheet.id);
      for (const dec of decorations) {
        const node = document.createElement("div");
        node.className = "pw-decoration pw-print-item";
        node.style.left = `${dec.x}in`;
        node.style.top = `${dec.y}in`;
        node.style.width = `${dec.w}in`;
        node.style.height = `${dec.h}in`;
        node.style.zIndex = String(dec.z);
        const body = document.createElement("div");
        body.className = "pw-decoration-body";
        renderDecoration(body, dec);
        node.appendChild(body);
        page.appendChild(node);
      }

      root.appendChild(page);
    }

    const cleanup = () => {
      if (!document.documentElement.classList.contains("pw-exporting")) return;
      document.documentElement.classList.remove("pw-exporting");
      root.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
    };

    document.documentElement.classList.add("pw-exporting");
    setStatus(
      `Exporting ${sheets.length} sheet${sheets.length === 1 ? "" : "s"} — use Save as PDF in the print dialog.`
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.addEventListener("afterprint", cleanup);
        window.print();
        window.setTimeout(cleanup, 60_000);
      });
    });
  }

  function renderPaperControls() {
    if (els.paperSize) els.paperSize.value = state.paper.size;
    if (els.paperOrientation) els.paperOrientation.value = state.paper.orientation;
  }

  function renderTitleBlockControls() {
    const id = state.identity;
    const setIfIdle = (input, value) => {
      if (!input || document.activeElement === input) return;
      input.value = value ?? "";
    };
    if (els.tbInclude) els.tbInclude.checked = state.titleBlockDefault !== false;
    if (els.tbLogoClear) els.tbLogoClear.hidden = !state.titleBlockLogo;
    setIfIdle(els.tbProject, id.show);
    setIfIdle(els.tbCompany, id.company);
    setIfIdle(els.tbApproved, id.approved);
    setIfIdle(els.tbChecked, id.checked);
    setIfIdle(els.tbDrawn, id.drawnBy);
    setIfIdle(els.tbRevision, id.revision);
  }

  function renderDrawToolbar() {
    if (!els.drawTools) return;
    els.drawTools.innerHTML = listDrawTools()
      .map(
        (tool) =>
          `<button type="button" class="btn btn-secondary pw-tool-btn${
            activeTool === tool.id ? " is-active" : ""
          }" data-draw-tool="${escapeXml(tool.id)}" title="${escapeXml(
            tool.title ?? tool.label
          )}">${escapeXml(tool.label)}</button>`
      )
      .join("");

    const style = state.drawStyle;
    if (els.styleFill && document.activeElement !== els.styleFill) {
      els.styleFill.value = style.fill;
    }
    if (els.styleStroke && document.activeElement !== els.styleStroke) {
      els.styleStroke.value = style.stroke;
    }
    if (els.styleWeight && document.activeElement !== els.styleWeight) {
      els.styleWeight.value = formatNumberInput(style.strokeWidth);
    }
    if (els.styleFont && document.activeElement !== els.styleFont) {
      els.styleFont.value = formatNumberInput(style.fontSize, 0);
    }
    renderGridControls();
  }

  function renderGridControls() {
    const grid = state.grid;
    if (els.gridVisible) els.gridVisible.checked = grid.visible;
    if (els.gridSnap) els.gridSnap.checked = grid.snap;
    if (els.gridSize && document.activeElement !== els.gridSize) {
      els.gridSize.value = formatNumberInput(grid.sizeIn);
    }
    els.gridBtn?.classList.toggle("is-active", grid.snap || grid.visible);
    scene.updateGridOverlay?.();
  }

  /**
   * Tile unlocked sheet elements (except title blocks) into a page grid.
   * @param {import("./state.js").SheetInstance} sheet
   */
  function arrangeElementsInGrid(sheet) {
    const page = resolvePaper(state.paper.size, state.paper.orientation);
    const step = Math.max(0.05, Number(state.grid.sizeIn) || 0.25);
    const margin = Math.max(step, 0.5);
    const gap = step;
    const titleBlock =
      sheet.elements.find((element) => element.type === "titleBlock") ??
      sharedElementsForSheet(state.sharedElements, sheet.id).find(
        (element) => element.type === "titleBlock"
      );
    const items = sheet.elements.filter(
      (element) => !element.locked && element.type !== "titleBlock"
    );
    if (!items.length) return 0;

    const bottom = titleBlock ? Math.max(margin + 1, titleBlock.y - gap) : page.heightIn - margin;
    const columns = items.length === 1 ? 1 : items.length <= 4 ? 2 : 3;
    const rows = Math.ceil(items.length / columns);
    const width = (page.widthIn - margin * 2 - gap * (columns - 1)) / columns;
    const height = Math.max(step * 2, (bottom - margin - gap * (rows - 1)) / rows);

    items.forEach((element, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      let x = margin + column * (width + gap);
      let y = margin + row * (height + gap);
      if (state.grid.snap) {
        x = snapInches(x);
        y = snapInches(y);
      }
      element.x = x;
      element.y = y;
      element.w = roundTo(width);
      element.h = roundTo(height);
    });
    return items.length;
  }

  /**
   * Expand a folder and its ancestors so selection stays visible.
   * @param {string | null} folderId
   * @param {import("./element-library.js").LibraryFolder[]} allFolders
   */
  function expandLibraryFolderAncestors(folderId, allFolders) {
    let current = folderId;
    while (current) {
      expandedLibraryFolderIds.add(current);
      current = allFolders.find((f) => f.id === current)?.parentId ?? null;
    }
  }

  function renderLibrary() {
    if (!els.elementLibrary) return;
    if (!state.libraryFolders) state.libraryFolders = [];
    if (!state.libraryPlacements) state.libraryPlacements = {};

    const page = resolvePaper(state.paper.size, state.paper.orientation);
    const catalog = resolveLibraryCatalog(siteExports(), page);
    addableElements = catalog.items;
    const allFolders = mergeLibraryFolders(catalog.autoFolders, state.libraryFolders);

    renderElementLibraryBrowser({
      container: els.elementLibrary,
      autoFolders: catalog.autoFolders,
      userFolders: state.libraryFolders,
      autoPlacements: catalog.autoPlacements,
      userPlacements: state.libraryPlacements,
      items: catalog.items,
      expandedFolderIds: expandedLibraryFolderIds,
      activeFolderId: activeLibraryFolderId,
      renamingFolderId: renamingLibraryFolderId,
      searchQuery: librarySearchQuery,
      onToggleFolder: (folderId) => {
        if (expandedLibraryFolderIds.has(folderId)) {
          expandedLibraryFolderIds.delete(folderId);
        } else {
          expandedLibraryFolderIds.add(folderId);
        }
        activeLibraryFolderId = folderId;
        renderLibrary();
      },
      onSelectFolder: (folderId) => {
        activeLibraryFolderId = folderId;
        if (folderId) expandLibraryFolderAncestors(folderId, allFolders);
        renderLibrary();
      },
      onCreateFolder: (folder) => {
        state.libraryFolders.push(folder);
        activeLibraryFolderId = folder.id;
        expandLibraryFolderAncestors(folder.id, mergeLibraryFolders(catalog.autoFolders, state.libraryFolders));
        renamingLibraryFolderId = folder.id;
        renderLibrary();
        setStatus(`Created folder “${folder.name}”.`);
      },
      onRenameFolder: (folderId, name) => {
        const ok = renameLibraryFolder(
          state.libraryFolders,
          folderId,
          name,
          mergeLibraryFolders(catalog.autoFolders, state.libraryFolders)
        );
        if (ok) {
          renamingLibraryFolderId = null;
          renderLibrary();
        }
        return ok;
      },
      onDeleteFolder: (folderId) => {
        const result = deleteLibraryFolder(state.libraryFolders, folderId);
        if (!result) return;
        clearPlacementsForFolders(state.libraryPlacements, result.deletedIds);
        for (const id of result.deletedIds) expandedLibraryFolderIds.delete(id);
        activeLibraryFolderId = result.parentId;
        renamingLibraryFolderId = null;
        renderLibrary();
        setStatus(`Deleted folder “${result.name}”.`);
      },
      onMoveItem: (itemId, folderId) => {
        if (!addableElements.some((item) => item.id === itemId)) return false;
        if (folderId && !allFolders.some((f) => f.id === folderId)) return false;
        moveLibraryItemToFolder(
          itemId,
          folderId,
          catalog.autoPlacements,
          state.libraryPlacements
        );
        activeLibraryFolderId = folderId;
        if (folderId) expandLibraryFolderAncestors(folderId, allFolders);
        renderLibrary();
        setStatus("Moved element in library.");
        return true;
      },
      onBeginRenameFolder: (folderId) => {
        if (isBuiltinLibraryFolderId(folderId)) return;
        renamingLibraryFolderId = folderId;
        activeLibraryFolderId = folderId;
        renderLibrary();
      },
      onCancelRenameFolder: () => {
        renamingLibraryFolderId = null;
        renderLibrary();
      },
      onSearchChange: (query) => {
        librarySearchQuery = query;
        renderLibrary();
      },
    });
  }

  function applyDrawStyleField(field, value) {
    const next = { ...state.drawStyle };
    if (field === "fill" || field === "stroke") {
      next[field] = value;
    } else if (field === "strokeWidth") {
      next.strokeWidth = Math.max(0.5, Math.min(24, roundTo(Number(value) || next.strokeWidth)));
    } else if (field === "fontSize") {
      next.fontSize = Math.max(6, Math.min(96, roundTo(Number(value) || next.fontSize, 0)));
    }
    state.drawStyle = normalizeDrawStyle(next);

    const dec =
      state.selectedDecorationId != null
        ? state.decorations.find((d) => d.id === state.selectedDecorationId) ?? null
        : null;
    if (dec) {
      dec.style = { ...dec.style, ...state.drawStyle };
      renderPage();
      renderInspector();
    }
  }

  function bumpZ(delta) {
    const el = state.selectedElementId ? findElementById(state.selectedElementId) : null;
    if (el) {
      el.z += delta;
    } else if (state.selectedDecorationId) {
      const dec = state.decorations.find((d) => d.id === state.selectedDecorationId);
      if (dec) dec.z += delta;
    } else {
      return;
    }
    renderPage();
  }

  function applyRightPanelCollapsed() {
    layoutEl?.classList.toggle("is-right-collapsed", state.rightPanelCollapsed === true);
    if (els.rightCollapse) {
      els.rightCollapse.textContent = state.rightPanelCollapsed ? "‹" : "›";
      els.rightCollapse.setAttribute(
        "aria-expanded",
        state.rightPanelCollapsed ? "false" : "true"
      );
    }
  }

  /**
   * Expand sheet folders so the active sheet stays visible.
   * @param {import("./sheet-library.js").SheetFolder[]} allFolders
   * @param {Record<string, string | null>} autoPlacements
   */
  function ensureActiveSheetFoldersOpen(allFolders, autoPlacements) {
    const sheet = getActiveSheet();
    if (!sheet) return;
    let current = effectiveSheetFolderId(sheet, autoPlacements);
    while (current) {
      expandedSheetFolderIds.add(current);
      current = allFolders.find((f) => f.id === current)?.parentId ?? null;
    }
  }

  /**
   * @param {string | null} folderId
   * @param {import("./sheet-library.js").SheetFolder[]} allFolders
   */
  function expandSheetFolderAncestors(folderId, allFolders) {
    let current = folderId;
    while (current) {
      expandedSheetFolderIds.add(current);
      current = allFolders.find((f) => f.id === current)?.parentId ?? null;
    }
  }

  function ensureActiveFoldersOpen() {
    const sorted = [...state.sheets].sort((a, b) => a.order - b.order);
    const auto = buildAutoSheetLibrary(sorted);
    const allFolders = mergeSheetFolders(auto.folders, state.sheetFolders ?? []);
    ensureActiveSheetFoldersOpen(allFolders, auto.placements);
  }

  function renderSheetList() {
    if (!els.sheetList) return;
    sheetNameEditor?.close();
    if (!state.sheetFolders) state.sheetFolders = [];
    if (!state.sheets.length) {
      els.sheetList.innerHTML = `<p class="resource-empty">No sheets yet — click Generate packet to create Cover, Cable Runs, and LED sheets.</p>`;
      return;
    }

    const sorted = [...state.sheets].sort((a, b) => a.order - b.order);
    const auto = buildAutoSheetLibrary(sorted);
    const allFolders = mergeSheetFolders(auto.folders, state.sheetFolders);
    ensureActiveSheetFoldersOpen(allFolders, auto.placements);

    renderSheetLibraryBrowser({
      container: els.sheetList,
      autoFolders: auto.folders,
      userFolders: state.sheetFolders,
      autoPlacements: auto.placements,
      sheets: sorted,
      expandedFolderIds: expandedSheetFolderIds,
      activeFolderId: activeSheetFolderId,
      activeSheetId: state.activeSheetId,
      renamingFolderId: renamingSheetFolderId,
      searchQuery: sheetSearchQuery,
      onToggleFolder: (folderId) => {
        if (expandedSheetFolderIds.has(folderId)) {
          expandedSheetFolderIds.delete(folderId);
        } else {
          expandedSheetFolderIds.add(folderId);
        }
        activeSheetFolderId = folderId;
        renderSheetList();
      },
      onSelectFolder: (folderId) => {
        activeSheetFolderId = folderId;
        if (folderId) expandSheetFolderAncestors(folderId, allFolders);
        renderSheetList();
      },
      onCreateFolder: (folder) => {
        state.sheetFolders.push(folder);
        activeSheetFolderId = folder.id;
        expandSheetFolderAncestors(
          folder.id,
          mergeSheetFolders(auto.folders, state.sheetFolders)
        );
        renamingSheetFolderId = folder.id;
        renderSheetList();
        setStatus(`Created folder “${folder.name}”.`);
      },
      onRenameFolder: (folderId, name) => {
        const ok = renameSheetFolder(
          state.sheetFolders,
          folderId,
          name,
          mergeSheetFolders(auto.folders, state.sheetFolders)
        );
        if (ok) {
          renamingSheetFolderId = null;
          renderSheetList();
        }
        return ok;
      },
      onDeleteFolder: (folderId) => {
        const result = deleteSheetFolder(state.sheetFolders, folderId);
        if (!result) return;
        for (const sheet of state.sheets) {
          if (sheet.folderId != null && result.deletedIds.has(sheet.folderId)) {
            delete sheet.folderId;
          }
        }
        for (const id of result.deletedIds) expandedSheetFolderIds.delete(id);
        activeSheetFolderId = result.parentId;
        renamingSheetFolderId = null;
        renderSheetList();
        setStatus(`Deleted folder “${result.name}”.`);
      },
      onMoveSheet: (sheetId, folderId) => {
        const sheet = state.sheets.find((s) => s.id === sheetId);
        if (!sheet) return false;
        if (folderId && !allFolders.some((f) => f.id === folderId)) return false;
        moveSheetToFolder(sheet, folderId, auto.placements);
        activeSheetFolderId = folderId;
        if (folderId) expandSheetFolderAncestors(folderId, allFolders);
        renderSheetList();
        renderPage();
        setStatus("Moved sheet in library.");
        return true;
      },
      onBeginRenameFolder: (folderId) => {
        if (isBuiltinSheetFolderId(folderId)) return;
        renamingSheetFolderId = folderId;
        activeSheetFolderId = folderId;
        renderSheetList();
      },
      onCancelRenameFolder: () => {
        renamingSheetFolderId = null;
        renderSheetList();
      },
      onSearchChange: (query) => {
        sheetSearchQuery = query;
        renderSheetList();
      },
    });
  }

  function renderInspector() {
    const sheet = getActiveSheet();
    const el = state.selectedElementId ? findElementById(state.selectedElementId) : null;
    const dec =
      state.selectedDecorationId != null
        ? state.decorations.find((d) => d.id === state.selectedDecorationId) ?? null
        : null;

    if (!els.inspectorFields || !els.inspectorEmpty) return;

    if (!el && !dec) {
      els.inspectorEmpty.hidden = false;
      els.inspectorFields.hidden = true;
      if (els.deleteElementBtn) els.deleteElementBtn.hidden = true;
      return;
    }

    if (dec) {
      els.inspectorEmpty.hidden = true;
      els.inspectorFields.hidden = false;
      if (els.deleteElementBtn) {
        els.deleteElementBtn.hidden = false;
        els.deleteElementBtn.textContent = "Delete drawing";
      }
      const activeSheetId = sheet?.id ?? null;
      const hiddenOnThis =
        activeSheetId != null && dec.hiddenOnSheets.includes(activeSheetId);
      const body =
        typeof dec.content?.body === "string" ? dec.content.body : "";
      const isText =
        dec.type === "drawText" || dec.type === "drawHeading";
      els.inspectorFields.innerHTML = `
        <p class="pw-inspector-type">${escapeXml(DECORATION_LABELS[dec.type] ?? dec.type)}</p>
        <div class="pw-field-row">
          <label class="pw-field">X
            <input type="number" step="0.05" data-dec-geom="x" value="${formatNumberInput(dec.x)}" />
          </label>
          <label class="pw-field">Y
            <input type="number" step="0.05" data-dec-geom="y" value="${formatNumberInput(dec.y)}" />
          </label>
        </div>
        <div class="pw-field-row">
          <label class="pw-field">W
            <input type="number" step="0.05" min="0.15" data-dec-geom="w" value="${formatNumberInput(dec.w)}" />
          </label>
          <label class="pw-field">H
            <input type="number" step="0.05" min="0.15" data-dec-geom="h" value="${formatNumberInput(dec.h)}" />
          </label>
        </div>
        <div class="pw-field-row">
          <label class="pw-field">Fill
            <input type="color" data-dec-style="fill" value="${escapeXml(dec.style.fill)}" />
          </label>
          <label class="pw-field">Stroke
            <input type="color" data-dec-style="stroke" value="${escapeXml(dec.style.stroke)}" />
          </label>
        </div>
        <div class="pw-field-row">
          <label class="pw-field">Weight
            <input type="number" min="0.5" max="24" step="0.5" data-dec-style="strokeWidth" value="${formatNumberInput(dec.style.strokeWidth)}" />
          </label>
          <label class="pw-field">Font
            <input type="number" min="6" max="96" step="1" data-dec-style="fontSize" value="${formatNumberInput(dec.style.fontSize, 0)}" />
          </label>
        </div>
        ${
          isText
            ? `<label class="pw-field">Text
                <textarea rows="2" data-dec-body>${escapeXml(body)}</textarea>
              </label>`
            : ""
        }
        <label class="pw-field pw-check-field">
          All sheets
          <input type="checkbox" data-dec-show-all ${dec.showOnAllSheets ? "checked" : ""} />
        </label>
        ${
          dec.showOnAllSheets && activeSheetId
            ? `<label class="pw-field pw-check-field">
                Hide here
                <input type="checkbox" data-dec-hide-sheet ${hiddenOnThis ? "checked" : ""} />
              </label>`
            : ""
        }`;
      return;
    }

    els.inspectorEmpty.hidden = true;
    els.inspectorFields.hidden = false;
    if (els.deleteElementBtn) {
      els.deleteElementBtn.hidden = Boolean(el.locked);
      els.deleteElementBtn.textContent = "Delete element";
    }

    const renderer = getElementRenderer(el.type);
    const fieldIds = collectEditableFields(el);
    const cropHtml = diagramCropInspectorHtml(el);
    const signalFlowHtml = signalFlowInspectorHtml(el);
    const surfaceHtml = surfaceDiagramInspectorHtml(el, sheet);
    const sourceHtml = linkedSourceInspectorHtml(el, sheet);
    const cableScaleHtml = cableCardsScaleInspectorHtml(el);
    const fontScaleHtml = fontScaleInspectorHtml(el);
    const shareable = isShareableElementType(el.type);
    const isShared = state.sharedElements.some((item) => item.id === el.id);
    const showOnAll = isShared && el.showOnAllSheets === true;
    const activeSheetId = sheet?.id ?? null;
    const hiddenOnThis =
      showOnAll && activeSheetId != null && (el.hiddenOnSheets ?? []).includes(activeSheetId);
    els.inspectorFields.innerHTML = `
      <p class="pw-inspector-type">${escapeXml(renderer?.label ?? el.type)}</p>
      <div class="pw-field-row">
        <label class="pw-field">X
          <input type="number" step="0.05" data-geom="x" value="${formatNumberInput(el.x)}" />
        </label>
        <label class="pw-field">Y
          <input type="number" step="0.05" data-geom="y" value="${formatNumberInput(el.y)}" />
        </label>
      </div>
      <div class="pw-field-row">
        <label class="pw-field">W
          <input type="number" step="0.05" min="0.25" data-geom="w" value="${formatNumberInput(el.w)}" />
        </label>
        <label class="pw-field">H
          <input type="number" step="0.05" min="0.25" data-geom="h" value="${formatNumberInput(el.h)}" />
        </label>
      </div>
      ${fontScaleHtml}
      ${cropHtml}
      ${signalFlowHtml}
      ${surfaceHtml}
      ${sourceHtml}
      ${cableScaleHtml}
      ${
        el.type === "titleBlock" && showOnAll && activeSheetId
          ? `<label class="pw-field pw-check-field">
              Hide here
              <input type="checkbox" data-el-hide-sheet ${hiddenOnThis ? "checked" : ""} />
            </label>`
          : shareable
            ? `<label class="pw-field pw-check-field">
              All sheets
              <input type="checkbox" data-el-show-all ${showOnAll ? "checked" : ""} />
            </label>
            ${
              showOnAll && activeSheetId
                ? `<label class="pw-field pw-check-field">
                    Hide here
                    <input type="checkbox" data-el-hide-sheet ${hiddenOnThis ? "checked" : ""} />
                  </label>`
                : ""
            }`
            : ""
      }
      ${
        fieldIds.length
          ? `<details class="pw-inspector-details" data-inspector-details="overrides"${
              fieldOverridesExpanded ? " open" : ""
            }>
              <summary class="pw-inspector-summary">Overrides</summary>
              <div class="pw-inspector-details-body">
        ${fieldIds
          .map(([id, label, auto]) => {
            const shared = isIdentityField(id) ? state.identity[id] ?? "" : "";
            const value = el.overrides?.[id] ?? shared;
            const placeholder = shared || auto || "auto";
            return `
              <label class="pw-field">${escapeXml(label)}
                <input type="text" data-override="${escapeXml(id)}" value="${escapeXml(
              value
            )}" placeholder="${escapeXml(placeholder)}" />
              </label>`;
          })
          .join("")}
              </div>
            </details>`
          : ""
      }`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   * @param {import("./state.js").SheetInstance | null} sheet
   */
  function linkedSourceInspectorHtml(el, sheet) {
    const options = listLinkedSourceOptions(el.type, siteExports());
    if (!options.length) return "";
    const current =
      (typeof el.content?.sourceKey === "string" && el.content.sourceKey) ||
      sheet?.sourceKey ||
      "";
    const label =
      el.type === "ledSpecificationTable" || el.type === "ledWiringDiagram"
        ? "LED wall"
        : el.type === "rasterDiagram"
          ? "Raster"
          : el.type === "surfaceDiagram"
            ? "Surface"
            : "Source";
    const known = options.some((option) => option.id === current);
    return `
      <label class="pw-field">${escapeXml(label)}
        <select data-el-source>
          ${
            !known && current
              ? `<option value="${escapeXml(current)}" selected>${escapeXml(
                  current
                )} (missing)</option>`
              : ""
          }
          ${options
            .map(
              (option) =>
                `<option value="${escapeXml(option.id)}"${
                  option.id === current ? " selected" : ""
                }>${escapeXml(option.label)}</option>`
            )
            .join("")}
        </select>
      </label>`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   */
  function signalFlowInspectorHtml(el) {
    if (el.type !== "signalFlowDiagram") return "";
    const sf = /** @type {{ colorByCableType?: boolean } | null} */ (
      siteExports().signalFlow ?? null
    );
    const colorByCableType =
      typeof el.content?.colorByCableType === "boolean"
        ? el.content.colorByCableType
        : sf?.colorByCableType === true;
    return `
      <label class="pw-field pw-check-field">
        Color cables
        <input type="checkbox" data-sf-color-cables ${colorByCableType ? "checked" : ""} />
      </label>`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   * @param {import("./state.js").SheetInstance | null} sheet
   */
  function surfaceDiagramInspectorHtml(el, sheet) {
    if (el.type !== "surfaceDiagram") return "";
    const sourceKey =
      (typeof el.content?.sourceKey === "string" && el.content.sourceKey) ||
      sheet?.sourceKey ||
      null;
    const contentMaps = /** @type {{ surfaces?: object[] } | null} */ (
      siteExports().contentMaps
    );
    const surfaces = Array.isArray(contentMaps?.surfaces) ? contentMaps.surfaces : [];
    const surface =
      surfaces.find((item) => String(item?.id ?? "") === String(sourceKey ?? "")) ?? null;
    const ppi = resolveSurfacePpi(surface, siteExports());
    const hasScale = Boolean(ppi);
    const dimensionUnit = normalizeSurfaceDimensionUnit(el.content?.dimensionUnit);
    const showAnchors = el.content?.showAnchors === true;
    return `
      <label class="pw-field">Dimensions
        <select data-surface-unit ${hasScale ? "" : "disabled"}>
          <option value="px"${dimensionUnit === "px" ? " selected" : ""}>Pixels</option>
          <option value="ft-in"${dimensionUnit === "ft-in" ? " selected" : ""}${
            hasScale ? "" : " disabled"
          }>Feet &amp; inches</option>
        </select>
      </label>
      <label class="pw-field pw-check-field">
        Show anchors
        <input type="checkbox" data-surface-anchors ${showAnchors ? "checked" : ""} />
      </label>`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   */
  function diagramCropInspectorHtml(el) {
    if (el.type !== "groundplanDiagram" && el.type !== "signalFlowDiagram") {
      return "";
    }
    if (el.type === "groundplanDiagram") {
      const gp = /** @type {Record<string, unknown> | null} */ (
        siteExports().groundplan ?? null
      );
      const imageWidth = Number(gp?.imageWidth) || 0;
      const imageHeight = Number(gp?.imageHeight) || 0;
      if (!gp?.imageDataUrl || imageWidth < 1 || imageHeight < 1) {
        return "";
      }
      const crop = normalizeGroundplanCrop(el.content?.crop, imageWidth, imageHeight);
      return `
      <div class="pw-crop-bar">
        <p class="pw-crop-status">${crop ? "Custom crop" : "Full floor plan"}</p>
        <div class="pw-crop-actions">
          <button type="button" class="btn btn-secondary" data-crop-action="fit">Fit</button>
          <button type="button" class="btn btn-secondary" data-crop-action="reset">Reset</button>
        </div>
      </div>`;
    }

    const sf = /** @type {Record<string, unknown> | null} */ (
      siteExports().signalFlow ?? null
    );
    const nodes = Array.isArray(sf?.nodes) ? sf.nodes : [];
    if (!nodes.length) {
      return "";
    }
    const crop = el.content?.crop && typeof el.content.crop === "object";
    return `
      <div class="pw-crop-bar">
        <p class="pw-crop-status">${crop ? "Custom crop" : "Full diagram"}</p>
        <div class="pw-crop-actions">
          <button type="button" class="btn btn-secondary" data-crop-action="fit">Fit</button>
          <button type="button" class="btn btn-secondary" data-crop-action="reset">Reset</button>
        </div>
      </div>`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   */
  function cableCardsScaleInspectorHtml(el) {
    if (el.type !== "cableCards") return "";
    const scale = normalizeCableCardScale(el.content?.cardScale);
    return `
      <label class="pw-field">Card size
        <input type="number" min="0.75" max="4" step="0.05" data-cable-scale value="${formatNumberInput(scale)}" />
      </label>`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   */
  function fontScaleInspectorHtml(el) {
    if (!FONT_SIZE_ELEMENT_TYPES.has(el.type)) return "";
    const size = resolveElementFontSizePt(el);
    return `
      <label class="pw-field">Font (pt)
        <input type="number" min="${MIN_FONT_SIZE_PT}" max="${MAX_FONT_SIZE_PT}" step="1" data-font-size value="${formatNumberInput(size, 0)}" />
      </label>`;
  }

  /**
   * @param {import("./state.js").PageElement} el
   * @returns {[string, string, string][]}
   */
  function collectEditableFields(el) {
    /** @type {[string, string, string][]} */
    const out = [];
    if (el.type === "detailTable" && Array.isArray(el.content?.fields)) {
      for (const f of el.content.fields) {
        if (f && typeof f === "object" && typeof f.id === "string") {
          out.push([f.id, String(f.label ?? f.id), String(f.auto ?? "")]);
        }
      }
    }
    if (el.type === "ledSpecificationTable") {
      const sourceKey =
        typeof el.content?.sourceKey === "string"
          ? el.content.sourceKey
          : getActiveSheet()?.sourceKey;
      for (const field of buildLedSpecificationFields(siteExports(), sourceKey)) {
        if ("id" in field) out.push([field.id, field.label, field.auto]);
      }
    }
    if (el.type === "titleBlock") {
      for (const [id, label] of [
        ["company", "Company"],
        ["show", "Project"],
        ["approved", "Approved"],
        ["checked", "Checked"],
        ["drawnBy", "Drawn"],
        ["size", "Size"],
        ["revision", "Rev"],
      ]) {
        out.push([id, label, ""]);
      }
    }
    if (el.type === "notes" || el.type === "text" || el.type === "scopeSummary") {
      const auto =
        typeof el.content?.body === "string" ? el.content.body : "";
      out.push(["body", "Text", auto]);
    }
    return out;
  }

  function updateViewHint() {
    /* Zoom hint lived in the removed top toolbar; keep Fit on the draw bar. */
  }

  function renderPage() {
    scene.paint();
    updateViewHint();
  }

  function render() {
    renderPaperControls();
    renderTitleBlockControls();
    renderSheetList();
    renderLibrary();
    renderDrawToolbar();
    applyRightPanelCollapsed();
    renderInspector();
    renderPage();
    const sheet = getActiveSheet();
    if (els.deleteSheetBtn) els.deleteSheetBtn.disabled = !sheet;
    if (els.duplicateSheetBtn) els.duplicateSheetBtn.disabled = !sheet;
    const paper = resolvePaper(state.paper.size, state.paper.orientation);
    if (sheet) {
      setStatus(
        `${sheet.title} · ${paper.label} ${state.paper.orientation} · ${
          includedSheets().length
        } included · select an element or drawing to edit`
      );
    } else {
      setStatus("Generate packet to create sheets, then select one to edit.");
    }
  }

  function generatedSheetsExist() {
    return state.sheets.some((s) => !s.manual && s.typeId !== "custom-plate");
  }

  function generatePacket() {
    if (!generatedSheetsExist()) {
      syncSheetsFromSources(state, siteExports(), { mode: "merge" });
      for (const sheet of state.sheets) {
        refreshSheetBindings(sheet, siteExports(), state.identity);
      }
      syncSharedTitleBlock();
      scene.fitArtboard();
      render();
      setStatus(
        `Generated ${state.sheets.length} sheet${state.sheets.length === 1 ? "" : "s"} from calculators.`
      );
      return;
    }
    const choice = window.prompt(
      "Generated sheets already exist.\n\nType:\n  skip — keep existing layouts, add missing sheets\n  replace — rebuild generated sheet layouts (blank plates untouched)\n  cancel — do nothing",
      "skip"
    );
    if (!choice || choice.toLowerCase() === "cancel") {
      setStatus("Generate cancelled.");
      return;
    }
    const mode = choice.toLowerCase().startsWith("replace") ? "replace" : "add-missing";
    syncSheetsFromSources(state, siteExports(), { mode });
    for (const sheet of state.sheets) {
      refreshSheetBindings(sheet, siteExports(), state.identity);
    }
    syncSharedTitleBlock();
    scene.fitArtboard();
    render();
    setStatus(
      `Generated packet updated (${mode}) — ${state.sheets.length} sheet${
        state.sheets.length === 1 ? "" : "s"
      }.`
    );
  }

  function updateLinkedElements() {
    for (const sheet of state.sheets) {
      refreshSheetBindings(sheet, siteExports(), state.identity);
    }
    render();
    setStatus("Updated linked elements from calculators (layouts and parameters preserved).");
  }

  // ── Events ──────────────────────────────────────────────────────────────

  scene.bind();

  els.paperSize?.addEventListener("change", () => {
    state.paper.size = els.paperSize.value;
    syncSharedTitleBlock({ reframe: true });
    scene.fitArtboard();
    render();
  });
  els.paperOrientation?.addEventListener("change", () => {
    state.paper.orientation =
      els.paperOrientation.value === "portrait" ? "portrait" : "landscape";
    syncSharedTitleBlock({ reframe: true });
    scene.fitArtboard();
    render();
  });

  els.tbInclude?.addEventListener("change", () => {
    state.titleBlockDefault = Boolean(els.tbInclude?.checked);
    syncSharedTitleBlock();
    render();
    setStatus(
      state.titleBlockDefault ? "Title block included on sheets." : "Title block hidden."
    );
  });

  /**
   * @param {HTMLInputElement | null} input
   * @param {keyof import("./state.js").ProjectIdentity} field
   */
  const bindTbIdentity = (input, field) => {
    input?.addEventListener("input", () => {
      applyIdentityField(field, input.value);
      renderTitleBlockControls();
      renderPage();
      renderInspector();
    });
  };
  bindTbIdentity(els.tbProject, "show");
  bindTbIdentity(els.tbCompany, "company");
  bindTbIdentity(els.tbApproved, "approved");
  bindTbIdentity(els.tbChecked, "checked");
  bindTbIdentity(els.tbDrawn, "drawnBy");
  bindTbIdentity(els.tbRevision, "revision");

  els.tbLogo?.addEventListener("change", () => {
    const file = els.tbLogo?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Logo must be an image file.");
      els.tbLogo.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.titleBlockLogo = normalizeTitleBlockLogo(reader.result);
      if (els.tbLogo) els.tbLogo.value = "";
      renderTitleBlockControls();
      renderPage();
      setStatus(state.titleBlockLogo ? "Title block logo updated." : "Could not load logo.");
    };
    reader.readAsDataURL(file);
  });
  els.tbLogoClear?.addEventListener("click", () => {
    state.titleBlockLogo = null;
    if (els.tbLogo) els.tbLogo.value = "";
    renderTitleBlockControls();
    renderPage();
    setStatus("Title block logo cleared.");
  });

  els.generatePacketBtn?.addEventListener("click", generatePacket);
  els.updateLinkedBtn?.addEventListener("click", updateLinkedElements);
  els.drawTools?.addEventListener("click", (e) => {
    const button = /** @type {HTMLElement} */ (e.target).closest?.("[data-draw-tool]");
    if (!button) return;
    activeTool = button.dataset.drawTool ?? "select";
    renderDrawToolbar();
  });

  els.styleFill?.addEventListener("input", () => {
    applyDrawStyleField("fill", els.styleFill.value);
    renderDrawToolbar();
  });
  els.styleStroke?.addEventListener("input", () => {
    applyDrawStyleField("stroke", els.styleStroke.value);
    renderDrawToolbar();
  });
  els.styleWeight?.addEventListener("change", () => {
    applyDrawStyleField("strokeWidth", els.styleWeight.value);
    renderDrawToolbar();
  });
  els.styleFont?.addEventListener("change", () => {
    applyDrawStyleField("fontSize", els.styleFont.value);
    renderDrawToolbar();
  });

  els.bringForwardBtn?.addEventListener("click", () => bumpZ(1));
  els.sendBackwardBtn?.addEventListener("click", () => bumpZ(-1));

  function setGridPopoverOpen(open) {
    if (!els.gridPopover || !els.gridBtn) return;
    els.gridPopover.hidden = !open;
    els.gridBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  els.gridBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = els.gridPopover?.hidden !== false;
    setGridPopoverOpen(open);
  });
  els.gridVisible?.addEventListener("change", () => {
    state.grid = normalizeGrid({
      ...state.grid,
      visible: Boolean(els.gridVisible?.checked),
    });
    renderGridControls();
    setStatus(state.grid.visible ? "Grid visible." : "Grid hidden.");
  });
  els.gridSnap?.addEventListener("change", () => {
    state.grid = normalizeGrid({
      ...state.grid,
      snap: Boolean(els.gridSnap?.checked),
    });
    renderGridControls();
    setStatus(
      state.grid.snap
        ? `Snapping to ${formatNumberInput(state.grid.sizeIn)} in grid.`
        : "Grid snapping off."
    );
  });
  els.gridSize?.addEventListener("change", () => {
    state.grid = normalizeGrid({
      ...state.grid,
      sizeIn: els.gridSize?.value,
    });
    renderGridControls();
    if (state.grid.snap || state.grid.visible) {
      setStatus(`Grid size ${formatNumberInput(state.grid.sizeIn)} in.`);
    }
  });
  els.gridArrange?.addEventListener("click", () => {
    const sheet = getActiveSheet();
    if (!sheet) {
      setStatus("Select a sheet first.");
      return;
    }
    const count = arrangeElementsInGrid(sheet);
    setGridPopoverOpen(false);
    renderPage();
    renderInspector();
    setStatus(
      count
        ? `Arranged ${count} element${count === 1 ? "" : "s"} on a grid.`
        : "No unlocked elements to arrange (title blocks stay put)."
    );
  });
  document.addEventListener("click", (e) => {
    if (!els.gridUi || els.gridPopover?.hidden) return;
    if (els.gridUi.contains(/** @type {Node} */ (e.target))) return;
    setGridPopoverOpen(false);
  });

  els.rightCollapse?.addEventListener("click", () => {
    state.rightPanelCollapsed = !state.rightPanelCollapsed;
    applyRightPanelCollapsed();
  });

  els.elementLibrary?.addEventListener("dragstart", (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest?.(".pw-lib-item");
    if (!item?.dataset.libId) return;
    e.dataTransfer?.setData("application/x-pw-element", item.dataset.libId);
    e.dataTransfer?.setData("text/x-pw-library-move", item.dataset.libId);
    e.dataTransfer?.setData(
      "text/x-pw-library-from-folder",
      item.dataset.folderId ?? ""
    );
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
  });

  function clearDropTarget() {
    els.artboard?.classList.remove("is-drop-target");
  }

  function handleLibraryDragOver(e) {
    if (!e.dataTransfer?.types.includes("application/x-pw-element")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    els.artboard?.classList.add("is-drop-target");
  }

  function handleLibraryDrop(e) {
    const libId = e.dataTransfer?.getData("application/x-pw-element");
    clearDropTarget();
    if (!libId) return;
    e.preventDefault();
    e.stopPropagation();
    const item = addableElements.find((choice) => choice.id === libId);
    const sheet = getActiveSheet();
    if (!item || !sheet) return;
    const page = resolvePaper(state.paper.size, state.paper.orientation);
    const element = item.create();
    const pt = clientToInches(e.clientX, e.clientY);
    const w = item.w ?? element.w;
    const h = item.h ?? element.h;
    const frame = clampFrameToPage(
      {
        x: snapInches(pt.x - w / 2),
        y: snapInches(pt.y - h / 2),
        w,
        h,
      },
      page
    );
    element.x = frame.x;
    element.y = frame.y;
    element.w = frame.w;
    element.h = frame.h;
    element.z = maxZOnSheet(sheet) + 1;
    sheet.elements.push(element);
    state.selectedElementId = element.id;
    state.selectedDecorationId = null;
    render();
    setStatus(`Placed ${getElementRenderer(element.type)?.label ?? element.type}.`);
  }

  // Listen on viewport only — artboard is inside it, so a second drop listener
  // would place two copies when the event bubbles.
  els.viewport?.addEventListener("dragover", handleLibraryDragOver);
  els.viewport?.addEventListener("dragleave", (e) => {
    if (!els.viewport?.contains(/** @type {Node} */ (e.relatedTarget))) clearDropTarget();
  });
  els.viewport?.addEventListener("drop", handleLibraryDrop);

  els.resetLayoutBtn?.addEventListener("click", () => {
    const sheet = getActiveSheet();
    if (!sheet) return;
    if (sheet.manual) {
      setStatus("Blank plates have no generated layout to reset.");
      return;
    }
    resetSheetLayout(sheet, state, siteExports());
    state.selectedElementId = null;
    render();
    setStatus(`Reset layout for ${sheet.title}.`);
  });
  els.resetViewBtn?.addEventListener("click", () => {
    scene.fitArtboard();
    updateViewHint();
    setStatus("View reset.");
  });
  els.exportPaperworkBtn?.addEventListener("click", () => {
    exportPaperwork();
  });

  els.newSheetBtn?.addEventListener("click", () => {
    const number =
      state.sheets.filter((sheet) => sheet.manual || sheet.typeId === "custom-plate")
        .length + 1;
    const sheet = createManualSheet(state.sheets.length, `Blank Plate ${number}`);
    if (activeSheetFolderId) {
      sheet.folderId = activeSheetFolderId;
      expandSheetFolderAncestors(
        activeSheetFolderId,
        mergeSheetFolders(
          buildAutoSheetLibrary([...state.sheets, sheet]).folders,
          state.sheetFolders ?? []
        )
      );
    }
    state.sheets.push(sheet);
    state.activeSheetId = sheet.id;
    state.selectedElementId = null;
    state.selectedDecorationId = null;
    scene.fitArtboard();
    render();
    setStatus(`Created ${sheet.title}. Drag elements from the library onto the page.`);
  });
  els.duplicateSheetBtn?.addEventListener("click", () => {
    const sheet = getActiveSheet();
    if (!sheet) return;
    const sorted = [...state.sheets].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((item) => item.id === sheet.id);
    const insertAt = index >= 0 ? index + 1 : sorted.length;
    const dup = duplicateSheet(sheet, insertAt);
    sorted.splice(insertAt, 0, dup);
    sorted.forEach((item, order) => {
      item.order = order;
    });
    state.sheets = sorted;

    const sheetDecorations = state.decorations.filter(
      (decoration) => decoration.sheetId === sheet.id && !decoration.showOnAllSheets
    );
    for (const decoration of sheetDecorations) {
      const clone = deepClone(decoration);
      delete clone.id;
      state.decorations.push(
        createDecoration({
          ...clone,
          sheetId: dup.id,
        })
      );
    }

    state.activeSheetId = dup.id;
    state.selectedElementId = null;
    state.selectedDecorationId = null;
    ensureActiveFoldersOpen();
    scene.fitArtboard();
    render();
    setStatus(`Duplicated ${sheet.title} → ${dup.title}.`);
  });
  els.deleteSheetBtn?.addEventListener("click", () => {
    const sheet = getActiveSheet();
    if (!sheet) return;
    const sorted = [...state.sheets].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((item) => item.id === sheet.id);
    state.sheets = state.sheets.filter((item) => item.id !== sheet.id);
    state.sheets
      .sort((a, b) => a.order - b.order)
      .forEach((item, order) => {
        item.order = order;
      });
    const remaining = [...state.sheets].sort((a, b) => a.order - b.order);
    state.activeSheetId =
      remaining[Math.min(Math.max(0, index), remaining.length - 1)]?.id ?? null;
    state.selectedElementId = null;
    state.selectedDecorationId = null;
    render();
    setStatus(`Deleted ${sheet.title}.`);
  });

  els.deleteElementBtn?.addEventListener("click", () => {
    if (state.selectedDecorationId) {
      state.decorations = state.decorations.filter((d) => d.id !== state.selectedDecorationId);
      state.selectedDecorationId = null;
      render();
      return;
    }
    const sheet = getActiveSheet();
    if (!sheet || !state.selectedElementId) return;
    deleteElementById(state.selectedElementId);
    render();
  });

  els.inspectorFields?.addEventListener("toggle", (e) => {
    const details = e.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (details.dataset.inspectorDetails !== "overrides") return;
    fieldOverridesExpanded = details.open;
  });

  els.inspectorFields?.addEventListener("input", (e) => {
    const dec =
      state.selectedDecorationId != null
        ? state.decorations.find((d) => d.id === state.selectedDecorationId) ?? null
        : null;
    if (dec) {
      const target = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (e.target);
      if (target.dataset.decGeom) {
        const key = target.dataset.decGeom;
        const n = Number(target.value);
        if (Number.isFinite(n)) dec[key] = roundTo(n);
        renderPage();
        return;
      }
      if (target.dataset.decStyle) {
        const key = target.dataset.decStyle;
        if (key === "fill" || key === "stroke") {
          dec.style[key] = target.value;
        } else if (key === "fontSize") {
          const n = Number(target.value);
          if (Number.isFinite(n)) dec.style[key] = roundTo(n, 0);
        } else {
          const n = Number(target.value);
          if (Number.isFinite(n)) dec.style[key] = roundTo(n);
        }
        state.drawStyle = { ...state.drawStyle, ...dec.style };
        renderDrawToolbar();
        renderPage();
        return;
      }
      if (target.dataset.decBody !== undefined) {
        dec.content = { ...dec.content, body: target.value };
        renderPage();
        return;
      }
      if (target.dataset.decShowAll !== undefined) {
        dec.showOnAllSheets = target.checked;
        if (!dec.showOnAllSheets) {
          dec.sheetId = getActiveSheet()?.id ?? dec.sheetId;
        }
        renderInspector();
        renderPage();
        return;
      }
      if (target.dataset.decHideSheet !== undefined) {
        const sheetId = getActiveSheet()?.id;
        if (!sheetId) return;
        if (target.checked) {
          if (!dec.hiddenOnSheets.includes(sheetId)) dec.hiddenOnSheets.push(sheetId);
        } else {
          dec.hiddenOnSheets = dec.hiddenOnSheets.filter((id) => id !== sheetId);
        }
        renderPage();
      }
      return;
    }

    const sheet = getActiveSheet();
    const el = state.selectedElementId ? findElementById(state.selectedElementId) : null;
    if (!el) return;
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.dataset.elShowAll !== undefined) {
      setElementShowOnAllSheets(el, target.checked);
      renderInspector();
      renderPage();
      return;
    }
    if (target.dataset.elHideSheet !== undefined) {
      const sheetId = sheet?.id;
      if (!sheetId) return;
      if (!Array.isArray(el.hiddenOnSheets)) el.hiddenOnSheets = [];
      if (target.checked) {
        if (!el.hiddenOnSheets.includes(sheetId)) el.hiddenOnSheets.push(sheetId);
      } else {
        el.hiddenOnSheets = el.hiddenOnSheets.filter((id) => id !== sheetId);
      }
      renderPage();
      return;
    }
    if (target.dataset.sfColorCables !== undefined) {
      if (el.type === "signalFlowDiagram") {
        el.content = {
          ...el.content,
          colorByCableType: target.checked,
        };
        renderPage();
      }
      return;
    }
    if (target.dataset.surfaceUnit !== undefined) {
      if (el.type === "surfaceDiagram") {
        el.content = {
          ...el.content,
          dimensionUnit: normalizeSurfaceDimensionUnit(target.value),
        };
        renderPage();
      }
      return;
    }
    if (target.dataset.surfaceAnchors !== undefined) {
      if (el.type === "surfaceDiagram") {
        el.content = {
          ...el.content,
          showAnchors: target.checked,
        };
        renderPage();
      }
      return;
    }
    if (target.dataset.geom) {
      const key = target.dataset.geom;
      const n = Number(target.value);
      if (Number.isFinite(n)) el[key] = roundTo(n);
      renderPage();
      return;
    }
    if (target.dataset.cableScale !== undefined) {
      if (el.type === "cableCards") {
        el.content = {
          ...el.content,
          cardScale: normalizeCableCardScale(target.value),
        };
        renderPage();
      }
      return;
    }
    if (target.dataset.fontSize !== undefined) {
      if (FONT_SIZE_ELEMENT_TYPES.has(el.type)) {
        const { fontScale: _legacy, ...rest } = el.content ?? {};
        el.content = {
          ...rest,
          fontSize: normalizeFontSizePt(target.value, { type: el.type }),
        };
        renderPage();
      }
      return;
    }
    if (target.dataset.override) {
      const id = target.dataset.override;
      if (applyIdentityField(id, target.value)) {
        renderPage();
        return;
      }
      if (!el.overrides) el.overrides = {};
      if (target.value === "") delete el.overrides[id];
      else el.overrides[id] = target.value;
      renderPage();
    }
  });

  els.inspectorFields?.addEventListener("change", (e) => {
    const el = state.selectedElementId ? findElementById(state.selectedElementId) : null;
    if (!el) return;
    const target = /** @type {HTMLSelectElement | HTMLInputElement} */ (e.target);
    if (target.dataset.elSource !== undefined) {
      const options = listLinkedSourceOptions(el.type, siteExports());
      const next = String(target.value ?? "");
      if (!options.some((option) => option.id === next) && next === "") return;
      el.content = {
        ...el.content,
        sourceKey: next,
      };
      renderInspector();
      renderPage();
      const label = options.find((option) => option.id === next)?.label ?? next;
      setStatus(`Linked to ${label}.`);
      return;
    }
    if (el.type !== "surfaceDiagram") return;
    if (target.dataset.surfaceUnit !== undefined) {
      el.content = {
        ...el.content,
        dimensionUnit: normalizeSurfaceDimensionUnit(target.value),
      };
      renderPage();
    }
  });

  els.inspectorFields?.addEventListener("click", (e) => {
    const button = /** @type {HTMLElement} */ (e.target).closest?.("[data-crop-action]");
    if (!button) return;
    const el = state.selectedElementId ? findElementById(state.selectedElementId) : null;
    if (
      !el ||
      (el.type !== "groundplanDiagram" && el.type !== "signalFlowDiagram")
    ) {
      return;
    }
    const action = button.dataset.cropAction;
    if (action === "reset") {
      if (el.content) delete el.content.crop;
      else el.content = {};
      renderInspector();
      renderPage();
      setStatus(
        el.type === "signalFlowDiagram"
          ? "Signal flow crop reset."
          : "Groundplan crop reset."
      );
      return;
    }
    if (action === "fit") {
      if (el.type === "signalFlowDiagram") {
        const sf = /** @type {Record<string, unknown> | null} */ (
          siteExports().signalFlow ?? null
        );
        const fitted = computeSignalFlowFitCrop(
          sf,
          0.06,
          resolveElementFontSizePt(el)
        );
        if (!fitted) {
          setStatus("Nothing to fit — add devices in Signal Flow first.");
          return;
        }
        el.content = { ...el.content, crop: fitted };
        renderInspector();
        renderPage();
        setStatus("Cropped signal flow to devices.");
        return;
      }
      const gp = /** @type {Record<string, unknown> | null} */ (
        siteExports().groundplan ?? null
      );
      const fitted = computeGroundplanFitCrop(gp);
      if (!fitted) {
        setStatus("Nothing to fit — place markers or routes first.");
        return;
      }
      el.content = { ...el.content, crop: fitted };
      renderInspector();
      renderPage();
      setStatus("Cropped groundplan to places and routes.");
    }
  });

  // Sheet list: select, include, drag reorder (grip only — title stays clickable)
  /** @type {{ sheetId: string | null }} */
  const sheetDrag = { sheetId: null };
  const sheetTitleClicks = createDoubleClickTracker();

  /**
   * @param {string} sheetId
   */
  function beginSheetRename(sheetId) {
    state.activeSheetId = sheetId;
    state.selectedElementId = null;
    state.selectedDecorationId = null;
    ensureActiveFoldersOpen();
    renderSheetList();
    renderPage();
    renderInspector();
    const fresh = els.sheetList?.querySelector(
      `[data-sheet-id="${CSS.escape(sheetId)}"] .pw-sheet-title`
    );
    if (fresh instanceof HTMLElement) sheetNameEditor?.open(fresh);
  }

  sheetNameEditor = els.sheetList
    ? createListNameEditor({
        listEl: els.sheetList,
        nameSelector: ".pw-sheet-title",
        itemSelector: "[data-sheet-id]",
        maxLength: 80,
        getItemId: (item) =>
          item instanceof HTMLElement ? item.dataset.sheetId : undefined,
        getName: (id) => state.sheets.find((sheet) => sheet.id === id)?.title,
        setName: (id, name) => {
          const sheet = state.sheets.find((item) => item.id === id);
          if (sheet) sheet.title = name;
        },
        onCommit: (_id, previousName, newName) => {
          renderSheetList();
          renderPage();
          if (newName !== previousName) setStatus(`Renamed to ${newName}.`);
        },
        onCancel: () => renderSheetList(),
      })
    : null;

  els.sheetList?.addEventListener("click", (e) => {
    const include = e.target.closest("[data-sheet-include]");
    if (include) {
      sheetTitleClicks.reset();
      const row = include.closest("[data-sheet-id]");
      const sheet = state.sheets.find((s) => s.id === row?.dataset.sheetId);
      if (!sheet) return;
      sheet.included = include.checked;
      render();
      return;
    }
    const select = e.target.closest("[data-sheet-select]");
    if (!select) {
      sheetTitleClicks.reset();
      return;
    }
    const row = select.closest("[data-sheet-id]");
    const sheetId = row?.dataset.sheetId;
    if (!sheetId) return;

    const onTitle = e.target.closest(".pw-sheet-title");
    if (onTitle && sheetTitleClicks.tap(sheetId, e)) {
      e.preventDefault();
      beginSheetRename(sheetId);
      return;
    }
    if (!onTitle) sheetTitleClicks.reset();

    state.activeSheetId = sheetId;
    state.selectedElementId = null;
    state.selectedDecorationId = null;
    ensureActiveFoldersOpen();
    render();
  });

  els.sheetList?.addEventListener("dragstart", (e) => {
    const grip = e.target.closest("[data-sheet-drag]");
    const row = grip?.closest("[data-sheet-id]");
    if (!grip || !row) {
      e.preventDefault();
      return;
    }
    sheetTitleClicks.reset();
    sheetDrag.sheetId = row.dataset.sheetId;
    row.classList.add("is-dragging");
    e.dataTransfer?.setData("text/pw-sheet", sheetDrag.sheetId ?? "");
    e.dataTransfer?.setData("text/x-pw-sheet-folder-move", sheetDrag.sheetId ?? "");
    e.dataTransfer?.setData("text/x-pw-sheet-from-folder", row.dataset.folderId ?? "");
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  els.sheetList?.addEventListener("dragend", (e) => {
    e.target.closest("[data-sheet-id]")?.classList.remove("is-dragging");
    sheetDrag.sheetId = null;
    els.sheetList?.querySelectorAll(".drop-before, .drop-after").forEach((n) => {
      n.classList.remove("drop-before", "drop-after");
    });
  });
  els.sheetList?.addEventListener("dragover", (e) => {
    e.preventDefault();
    const row = e.target.closest("[data-sheet-id]");
    if (!row || row.dataset.sheetId === sheetDrag.sheetId) return;
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    els.sheetList?.querySelectorAll(".drop-before, .drop-after").forEach((n) => {
      n.classList.remove("drop-before", "drop-after");
    });
    row.classList.add(before ? "drop-before" : "drop-after");
  });
  els.sheetList?.addEventListener("drop", (e) => {
    e.preventDefault();
    const row = e.target.closest("[data-sheet-id]");
    const fromId = sheetDrag.sheetId;
    const toId = row?.dataset.sheetId;
    if (!fromId || !toId || fromId === toId) return;
    const sorted = [...state.sheets].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((s) => s.id === fromId);
    const toIdx = sorted.findIndex((s) => s.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = sorted.splice(fromIdx, 1);
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    let insertAt = sorted.findIndex((s) => s.id === toId);
    if (!before) insertAt += 1;
    sorted.splice(insertAt, 0, moved);
    sorted.forEach((s, i) => {
      s.order = i;
    });
    state.sheets = sorted;
    renderSheetList();
    renderPage();
  });

  window.addEventListener("resize", () => {
    updateViewHint();
  });

  // Artboard is measured while the tab is often hidden; re-fit when shown.
  document.querySelector('.tab[data-tab="paperwork-composer"]')?.addEventListener("click", () => {
    requestAnimationFrame(() => {
      scene.fitArtboard();
      scene.paint();
      updateViewHint();
    });
  });

  // Start blank — sheets are created only via Generate packet or Blank plate.
  syncSharedTitleBlock();
  scene.fitArtboard();
  render();
  if (!state.sheets.length) {
    setStatus("Packet is blank — Generate packet from calculators, or add a Blank plate.");
  }

  function exportState() {
    return deepClone({
      identity: state.identity,
      paper: state.paper,
      titleBlockDefault: state.titleBlockDefault,
      titleBlockLogo: state.titleBlockLogo,
      sheets: state.sheets,
      sharedElements: state.sharedElements,
      decorations: state.decorations,
      drawStyle: state.drawStyle,
      activeSheetId: state.activeSheetId,
      selectedElementId: state.selectedElementId,
      selectedDecorationId: state.selectedDecorationId,
      rightPanelCollapsed: state.rightPanelCollapsed ?? false,
      collapsedFolders: state.collapsedFolders ?? {},
      libraryFolders: state.libraryFolders ?? [],
      libraryPlacements: state.libraryPlacements ?? {},
      sheetFolders: state.sheetFolders ?? [],
      grid: state.grid,
    });
  }

  /** @param {object} data */
  function importState(data) {
    const next = normalizePaperworkState(data);
    Object.assign(state, next);
    // Only auto-merge calculator sheets if this packet was already generated.
    // Blank / custom-only packets stay empty until the user clicks Generate.
    if (generatedSheetsExist()) {
      syncSheetsFromSources(state, siteExports(), { mode: "add-missing" });
    }
    for (const sheet of state.sheets) {
      refreshSheetBindings(sheet, siteExports(), state.identity);
    }
    syncSharedTitleBlock();
    render();
  }

  return { exportState, importState };
}

export const calculatorPlugin = {
  meta: {
    id: "paperwork-composer",
    tabPanelId: "paperwork-composer",
    stateKey: "paperwork",
    label: "Paperwork Composer",
    requiredForSave: false,
    emptyState: emptyPaperworkState,
    validateState: normalizePaperworkState,
  },
  init: initPaperworkComposer,
};
