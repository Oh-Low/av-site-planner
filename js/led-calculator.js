import {
  PREBUILT_TILES,
  LINE_COLORS,
  PROCESSOR_COLORS,
  MAX_AMPS,
  BITRATE_PIXEL_FACTOR,
} from "./led-data.js";
import { normalizeLedGrid, normalizeLedState } from "./domain/led.js";
import { queryCalcShell, bindSidebarTabs } from "./shared/calc-shell.js";
import { deepClone } from "./shared/clone.js";
import { escapeXml } from "./shared/dom.js";
import { createListNameEditor } from "./shared/inline-editor.js";
import { createSvgViewBoxPanZoom } from "./shared/pan-zoom.js";
import { uid } from "./shared/id.js";
import { recordBefore } from "./undo-runtime.js";

export { emptyLedState, normalizeLedGrid, normalizeLedState } from "./domain/led.js";

/** @typedef {{ processorType: string, wiringType: string, pixelWidth: number, pixelHeight: number, totalPixels: number, maxPerPort: number, metricWidth: number, metricHeight: number, weight: number, wattage: number, id?: string }} TileConfig */

/** @typedef {{ id: string, name: string, tiles: number[], startLabel: string, endLabel: string, startLabelDraft: string, endLabelDraft: string, processorId?: string|null }} LineSet */

/** Folder-like group for data lines; its color overrides the palette for lines inside. */
/** @typedef {{ id: string, name: string, color: string }} Processor */

/** @typedef {{ id: string, name: string, tile: TileConfig, rows: number, cols: number, generated: boolean, generatedRows: number, generatedCols: number, dataLines: LineSet[], powerLines: LineSet[], processors: Processor[], activeProcessorId: string|null, activeLineType: 'data'|'power', activeLineId: string|null, view: { panX: number, panY: number, zoom: number, contentW: number, contentH: number, lastContentKey: string } | null }} WallGrid */

function defaultGridName(existingCount) {
  return existingCount === 0 ? "LED Wall" : `LED Wall ${existingCount + 1}`;
}

/**
 * Pixel dimensions of a wall: columns × tile pixel width, rows × tile pixel
 * height. Uses the generated size when the wall has been built, otherwise the
 * draft rows/cols. Consumed by other calculators (e.g. Content Maps surfaces).
 * @param {Pick<WallGrid, "tile" | "rows" | "cols" | "generated" | "generatedRows" | "generatedCols">} grid
 */
export function gridPixelSize(grid) {
  const cols = Math.max(1, Number(grid?.generated ? grid.generatedCols : grid?.cols) || 1);
  const rows = Math.max(1, Number(grid?.generated ? grid.generatedRows : grid?.rows) || 1);
  const pixelWidth = Math.max(1, Number(grid?.tile?.pixelWidth) || 1);
  const pixelHeight = Math.max(1, Number(grid?.tile?.pixelHeight) || 1);
  return { width: cols * pixelWidth, height: rows * pixelHeight };
}

/**
 * Pixel rect ("port") for each data line on a wall: the bounding box of the
 * tiles the line drives, in wall pixels with the origin at the wall's
 * top-left. Consumed by Content Maps output mapping.
 * @param {Pick<WallGrid, "tile" | "rows" | "cols" | "generated" | "generatedRows" | "generatedCols" | "dataLines">} grid
 * @returns {{ id: string, name: string, x: number, y: number, width: number, height: number }[]}
 */
export function gridDataLinePixelRects(grid) {
  const cols = Math.max(1, Number(grid?.generated ? grid.generatedCols : grid?.cols) || 1);
  const pixelWidth = Math.max(1, Number(grid?.tile?.pixelWidth) || 1);
  const pixelHeight = Math.max(1, Number(grid?.tile?.pixelHeight) || 1);
  const rects = [];
  for (const line of grid?.dataLines ?? []) {
    const tiles = Array.isArray(line?.tiles) ? line.tiles : [];
    if (!tiles.length) continue;
    let minRow = Infinity;
    let minCol = Infinity;
    let maxRow = -Infinity;
    let maxCol = -Infinity;
    for (const index of tiles) {
      const row = Math.floor(index / cols);
      const col = index % cols;
      minRow = Math.min(minRow, row);
      minCol = Math.min(minCol, col);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
    rects.push({
      id: String(line.id),
      name: String(line.name ?? "Line"),
      x: minCol * pixelWidth,
      y: minRow * pixelHeight,
      width: (maxCol - minCol + 1) * pixelWidth,
      height: (maxRow - minRow + 1) * pixelHeight,
    });
  }
  return rects;
}

function emptyTile() {
  return {
    processorType: "",
    wiringType: "Horizontal",
    pixelWidth: 168,
    pixelHeight: 168,
    totalPixels: 28224,
    maxPerPort: 650000,
    metricWidth: 500,
    metricHeight: 500,
    weight: 14,
    wattage: 165,
  };
}

export function initLedCalculator() {
  const shell = queryCalcShell("led-calculator", {
    statusId: "canvas-status",
    viewportId: "wall-canvas-container",
  });

  const els = {
    prebuiltTile: document.getElementById("prebuilt-tile"),
    selectPrebuiltTile: document.getElementById("select-prebuilt-tile"),
    selectCustomTile: document.getElementById("select-custom-tile"),
    tileParams: document.getElementById("tile-params"),
    prebuiltPresetWrap: document.getElementById("prebuilt-preset-wrap"),
    tileProcessor: document.getElementById("tile-processor"),
    tileWiring: document.getElementById("tile-wiring"),
    tilePixelW: document.getElementById("tile-pixel-w"),
    tilePixelH: document.getElementById("tile-pixel-h"),
    tileTotalPixels: document.getElementById("tile-total-pixels"),
    tileMaxPort: document.getElementById("tile-max-port"),
    tileMetricW: document.getElementById("tile-metric-w"),
    tileMetricH: document.getElementById("tile-metric-h"),
    tileWeight: document.getElementById("tile-weight"),
    tileWattage: document.getElementById("tile-wattage"),
    wallCols: document.getElementById("wall-cols"),
    wallRows: document.getElementById("wall-rows"),
    wallSummary: document.getElementById("wall-summary"),
    selectData: document.getElementById("select-data"),
    selectPower: document.getElementById("select-power"),
    lineNew: document.getElementById("line-new"),
    lineEdit: document.getElementById("line-edit"),
    lineRemove: document.getElementById("line-remove"),
    placeStartLabel: document.getElementById("place-start-label"),
    placeEndLabel: document.getElementById("place-end-label"),
    drawHint: document.getElementById("draw-hint"),
    resourceBars: document.getElementById("resource-bars"),
    canvasStatus: document.getElementById("canvas-status"),
    clearActiveLine: document.getElementById("clear-active-line"),
    generateGrid: document.getElementById("generate-grid"),
    gridNew: document.getElementById("grid-new"),
    gridRemove: document.getElementById("grid-remove"),
    gridList: document.getElementById("grid-list"),
    wallEmptyState: document.getElementById("wall-empty-state"),
    wallCanvasContainer: document.getElementById("wall-canvas-container"),
    gridStaleHint: document.getElementById("grid-stale-hint"),
    viewHint: document.getElementById("view-hint"),
    resetWallView: document.getElementById("reset-wall-view"),
    ledSidebar: shell?.sidebar ?? document.getElementById("led-sidebar"),
    expandAllSections: document.getElementById("expand-all-sections"),
    collapseAllSections: document.getElementById("collapse-all-sections"),
    wallSvg: document.getElementById("wall-svg"),
  };

  /** Blocks form → grid sync while programmatically loading a grid (import / grid switch). */
  let suspendFormSync = false;

  /** @type {{ grids: WallGrid[], activeGridId: string|null, voltage: number, bitrate: number }} */
  const state = {
    grids: [],
    activeGridId: null,
    voltage: 120,
    bitrate: 8,
  };

  const TILE_GAP = 6;
  const PADDING = 24;

  /** @type {{ tileW: number, tileH: number, rows: number, cols: number } | null} */
  let wallLayout = null;

  /** @type {{ active: boolean, moved: boolean, startTile: number | null, lastTile: number | null }} */
  const pointerDrag = {
    active: false,
    moved: false,
    startTile: null,
    lastTile: null,
  };

  /** @type {{ panX: number, panY: number, zoom: number, contentW: number, contentH: number }} */
  const wallView = {
    panX: 0,
    panY: 0,
    zoom: 1,
    contentW: 0,
    contentH: 0,
  };

  const MIN_WALL_ZOOM = 0.25;
  const MAX_WALL_ZOOM = 12;
  const REFERENCE_GRID = { cols: 4, rows: 3 };
  const REFERENCE_VIEWPORT = { maxW: 720, maxH: 480 };
  let lastWallContentKey = "";

  const panZoom = createSvgViewBoxPanZoom({
    container: /** @type {HTMLElement} */ (els.wallCanvasContainer),
    getSvg: () => els.wallSvg,
    getView: () => wallView,
    getEnabled: () => Boolean(getActiveGrid()?.generated),
    minZoom: MIN_WALL_ZOOM,
    maxZoom: MAX_WALL_ZOOM,
    zoomWheelFactor: 1.12,
    onChange: () => updateViewHint(),
  });

  const processorNameEditor =
    els.resourceBars &&
    createListNameEditor({
      listEl: els.resourceBars,
      nameSelector: ".processor-name",
      itemSelector: "[data-processor-id]",
      getItemId: (item) => item.dataset.processorId,
      getName: (id) => findProcessor(getActiveGrid(), id)?.name,
      setName: (id, name) => {
        const proc = findProcessor(getActiveGrid(), id);
        if (!proc || proc.name === name) return;
        recordBefore("led", "rename-processor");
        proc.name = name;
      },
      onCommit: (_id, previousName, newName) => {
        renderResourceBars();
        if (newName !== previousName) setStatus(`Renamed processor to ${newName}.`);
      },
      onCancel: () => {
        renderResourceBars();
      },
    });

  const gridNameEditor =
    els.gridList &&
    createListNameEditor({
      listEl: els.gridList,
      itemSelector: "[data-grid-id]",
      getItemId: (item) => item.dataset.gridId,
      getName: (id) => state.grids.find((g) => g.id === id)?.name,
      setName: (id, name) => {
        const grid = state.grids.find((g) => g.id === id);
        if (!grid || grid.name === name) return;
        recordBefore("led", "rename-grid");
        grid.name = name;
      },
      onCommit: (_id, previousName, newName) => {
        renderGridList();
        render();
        if (newName !== previousName) setStatus(`Renamed to ${newName}.`);
      },
      onCancel: () => {
        renderGridList();
      },
    });

  /** Fills fields added after older saves (processors, line.processorId). */
  function ensureGridShape(grid) {
    const normalized = normalizeLedGrid(grid);
    if (normalized !== grid) Object.assign(grid, normalized);
    return grid;
  }

  function findProcessor(grid, processorId) {
    if (!processorId) return null;
    return grid?.processors?.find((p) => p.id === processorId) ?? null;
  }

  /**
   * Color for a line: its processor's color when grouped, otherwise the
   * type palette cycled by the line's index.
   */
  function lineColor(grid, line, type, paletteIndex) {
    if (type === "data") {
      const proc = findProcessor(grid, line.processorId);
      if (proc) return proc.color;
    }
    const palette = LINE_COLORS[type];
    return palette[paletteIndex % palette.length];
  }

  function defaultLabelsForLine(lineNumber, type) {
    const n = String(lineNumber);
    if (type === "data") {
      return { startLabel: n, endLabel: `${n}B` };
    }
    return { startLabel: n, endLabel: "" };
  }

  function isCustomSource() {
    return els.selectCustomTile?.classList.contains("active") ?? false;
  }

  function refreshLedUiFromState() {
    const grid = getActiveGrid();
    loadGridToForm(grid);
    restoreWallViewFromGrid(grid);
    render();
  }

  function getActiveGrid() {
    return state.grids.find((g) => g.id === state.activeGridId) ?? null;
  }

  function tileDisplayName(tile) {
    const preset = tile.id ? PREBUILT_TILES.find((p) => p.id === tile.id) : null;
    if (preset) return preset.name;
    return tile.processorType || "Custom";
  }

  function getTileFromForm() {
    if (!isCustomSource()) {
      const preset =
        PREBUILT_TILES.find((p) => p.id === els.prebuiltTile.value) ?? PREBUILT_TILES[0];
      return { ...preset };
    }
    return {
      processorType: els.tileProcessor.value,
      wiringType: els.tileWiring.value,
      pixelWidth: Number(els.tilePixelW.value) || 1,
      pixelHeight: Number(els.tilePixelH.value) || 1,
      totalPixels: Number(els.tileTotalPixels.value) || 1,
      maxPerPort: Number(els.tileMaxPort.value) || 1,
      metricWidth: Number(els.tileMetricW.value) || 1,
      metricHeight: Number(els.tileMetricH.value) || 1,
      weight: Number(els.tileWeight.value) || 0,
      wattage: Number(els.tileWattage.value) || 1,
    };
  }

  function getTileForCalc() {
    return getActiveGrid()?.tile ?? getTileFromForm();
  }

  function persistFormToActiveGrid() {
    const grid = getActiveGrid();
    if (!grid) return;
    grid.tile = getTileFromForm();
    grid.rows = Math.max(1, Math.min(40, Number(els.wallRows.value) || 1));
    grid.cols = Math.max(1, Math.min(40, Number(els.wallCols.value) || 1));
  }

  function loadGridToForm(grid) {
    if (!grid) {
      els.wallRows.value = "3";
      els.wallCols.value = "4";
      applyTileSourceUi("prebuilt");
      els.prebuiltTile.value = PREBUILT_TILES[0].id;
      writeTileToForm(PREBUILT_TILES[0]);
      els.selectData.classList.add("active");
      els.selectPower.classList.remove("active");
      updateWallSummary();
      return;
    }
    suspendFormSync = true;
    try {
      els.wallRows.value = String(grid.rows);
      els.wallCols.value = String(grid.cols);
      const savedTile = { ...grid.tile };
      if (savedTile.id && PREBUILT_TILES.some((p) => p.id === savedTile.id)) {
        applyTileSourceUi("prebuilt");
        els.prebuiltTile.value = savedTile.id;
      } else {
        applyTileSourceUi("custom");
      }
      writeTileToForm(savedTile);
      grid.tile = savedTile;
      els.selectData.classList.toggle("active", grid.activeLineType === "data");
      els.selectPower.classList.toggle("active", grid.activeLineType === "power");
      updateWallSummary();
    } finally {
      suspendFormSync = false;
    }
  }

  function saveWallViewToGrid() {
    const grid = getActiveGrid();
    if (!grid) return;
    grid.view = {
      panX: wallView.panX,
      panY: wallView.panY,
      zoom: wallView.zoom,
      contentW: wallView.contentW,
      contentH: wallView.contentH,
      lastContentKey: lastWallContentKey,
    };
  }

  function restoreWallViewFromGrid(grid) {
    if (!grid?.view) {
      wallView.panX = 0;
      wallView.panY = 0;
      wallView.zoom = 1;
      wallView.contentW = 0;
      wallView.contentH = 0;
      lastWallContentKey = "";
      return;
    }
    wallView.panX = grid.view.panX;
    wallView.panY = grid.view.panY;
    wallView.zoom = grid.view.zoom;
    wallView.contentW = grid.view.contentW;
    wallView.contentH = grid.view.contentH;
    lastWallContentKey = grid.view.lastContentKey ?? "";
  }

  function buildGridFromForm(name) {
    const rows = Math.max(1, Math.min(40, Number(els.wallRows.value) || 1));
    const cols = Math.max(1, Math.min(40, Number(els.wallCols.value) || 1));
    return {
      id: uid("grid"),
      name,
      tile: getTileFromForm(),
      rows,
      cols,
      generated: false,
      generatedRows: 0,
      generatedCols: 0,
      dataLines: [],
      powerLines: [],
      processors: [],
      activeProcessorId: null,
      activeLineType: "data",
      activeLineId: null,
      view: null,
    };
  }

  function selectGrid(gridId, { silent = false } = {}) {
    if (state.activeGridId === gridId) return;
    persistFormToActiveGrid();
    saveWallViewToGrid();
    state.activeGridId = gridId;
    const grid = getActiveGrid();
    loadGridToForm(grid);
    restoreWallViewFromGrid(grid);
    closeLabelEditor();
    render();
    if (!silent && grid) {
      setStatus(`Viewing ${grid.name}.`);
    }
  }

  function addGrid() {
    recordBefore("led", "add-grid");
    persistFormToActiveGrid();
    saveWallViewToGrid();
    const grid = buildGridFromForm(defaultGridName(state.grids.length));
    grid.generated = true;
    grid.generatedRows = grid.rows;
    grid.generatedCols = grid.cols;
    state.grids.push(grid);
    state.activeGridId = grid.id;
    loadGridToForm(grid);
    restoreWallViewFromGrid(grid);
    render();
    setStatus(`Created ${grid.name} (${grid.cols}×${grid.rows}).`);
  }

  function removeActiveGrid() {
    const idx = state.grids.findIndex((g) => g.id === state.activeGridId);
    if (idx < 0) {
      setStatus("No grid selected to remove.", true);
      return;
    }
    recordBefore("led", "remove-grid");
    const name = state.grids[idx].name;
    state.grids.splice(idx, 1);
    state.activeGridId = state.grids[0]?.id ?? null;
    loadGridToForm(getActiveGrid());
    restoreWallViewFromGrid(getActiveGrid());
    closeLabelEditor();
    render();
    setStatus(`Removed ${name}.`);
  }

  function closeGridNameEditor() {
    gridNameEditor?.close();
  }

  /** @param {HTMLElement} nameEl */
  function openGridNameEditor(nameEl) {
    gridNameEditor?.open(nameEl);
  }

  function renderGridList() {
    closeGridNameEditor();
    if (!els.gridList) return;
    if (!state.grids.length) {
      els.gridList.innerHTML = `<p class="resource-empty">No LED walls yet — set wall size and click Update LED Wall.</p>`;
      return;
    }
    els.gridList.innerHTML = state.grids
      .map((grid) => {
        const selected = grid.id === state.activeGridId;
        const size = grid.generated
          ? `${grid.generatedCols}×${grid.generatedRows}`
          : `${grid.cols}×${grid.rows} (draft)`;
        return `
          <button type="button" class="grid-item${selected ? " selected" : ""}" data-grid-id="${grid.id}" aria-pressed="${selected}">
            <span class="grid-item-name">${escapeXml(grid.name)}</span>
            <span class="grid-item-meta">${size} · ${escapeXml(tileDisplayName(grid.tile))}</span>
          </button>`;
      })
      .join("");
  }

  function applyTileSourceUi(source) {
    const custom = source === "custom";
    els.selectPrebuiltTile.classList.toggle("active", !custom);
    els.selectCustomTile.classList.toggle("active", custom);
    els.selectPrebuiltTile.setAttribute("aria-pressed", String(!custom));
    els.selectCustomTile.setAttribute("aria-pressed", String(custom));
    els.prebuiltPresetWrap.style.display = custom ? "none" : "block";
    els.tileParams.open = custom;
    setTileFieldsDisabled(!custom);
  }

  function setTileSource(source) {
    applyTileSourceUi(source);
    onSourceChange();
  }

  function tileInputs() {
    return [
      els.tileProcessor,
      els.tileWiring,
      els.tilePixelW,
      els.tilePixelH,
      els.tileTotalPixels,
      els.tileMaxPort,
      els.tileMetricW,
      els.tileMetricH,
      els.tileWeight,
      els.tileWattage,
    ];
  }

  function setTileFieldsDisabled(disabled) {
    tileInputs().forEach((input) => {
      if (input) input.disabled = disabled;
    });
  }

  function readTileFromForm() {
    if (suspendFormSync) return;
    const grid = getActiveGrid();
    if (grid) grid.tile = getTileFromForm();
  }

  function writeTileToForm(tile) {
    els.tileProcessor.value = tile.processorType;
    els.tileWiring.value = tile.wiringType;
    els.tilePixelW.value = String(tile.pixelWidth);
    els.tilePixelH.value = String(tile.pixelHeight);
    els.tileTotalPixels.value = String(tile.totalPixels);
    els.tileMaxPort.value = String(tile.maxPerPort);
    els.tileMetricW.value = String(tile.metricWidth);
    els.tileMetricH.value = String(tile.metricHeight);
    els.tileWeight.value = String(tile.weight);
    els.tileWattage.value = String(tile.wattage);
  }

  function populatePrebuiltSelect() {
    els.prebuiltTile.innerHTML = PREBUILT_TILES.map(
      (p) => `<option value="${p.id}">${p.name}</option>`
    ).join("");
  }

  function getLines(type) {
    const grid = getActiveGrid();
    if (!grid) return [];
    const lineType = type ?? grid.activeLineType;
    return lineType === "data" ? grid.dataLines : grid.powerLines;
  }

  function getActiveLine() {
    const grid = getActiveGrid();
    if (!grid) return null;
    const lines = grid.activeLineType === "data" ? grid.dataLines : grid.powerLines;
    return lines.find((l) => l.id === grid.activeLineId) ?? null;
  }

  function tileIndex(row, col) {
    const cols = getActiveGrid()?.cols ?? (Number(els.wallCols.value) || 1);
    return row * cols + col;
  }

  function tileCoords(index) {
    const cols = getActiveGrid()?.cols ?? (Number(els.wallCols.value) || 1);
    return { row: Math.floor(index / cols), col: index % cols };
  }

  function lineUsesTile(lineType, tileIdx, excludeLineId = null) {
    const grid = getActiveGrid();
    if (!grid) return false;
    const lines = lineType === "data" ? grid.dataLines : grid.powerLines;
    return lines.some((l) => l.id !== excludeLineId && l.tiles.includes(tileIdx));
  }

  function bitratePixelFactor() {
    return BITRATE_PIXEL_FACTOR[state.bitrate] ?? 1;
  }

  function effectiveMaxPerPort() {
    return Math.floor(getTileForCalc().maxPerPort / bitratePixelFactor());
  }

  function dataTileLimit() {
    const tile = getTileForCalc();
    return Math.max(1, Math.floor(effectiveMaxPerPort() / Math.max(1, tile.totalPixels)));
  }

  function powerAmps(tileCount) {
    return (getTileForCalc().wattage * tileCount) / state.voltage;
  }

  function powerTileLimit() {
    const wattage = getTileForCalc().wattage;
    if (wattage <= 0) return 1;
    return Math.max(1, Math.floor((MAX_AMPS * state.voltage) / wattage));
  }

  function lineUsage(line, type) {
    const count = line.tiles.length;
    if (type === "data") {
      return { used: count, max: dataTileLimit(), unit: "tiles" };
    }
    const amps = powerAmps(count);
    return { used: amps, max: MAX_AMPS, unit: "A", tileCount: count, tileMax: powerTileLimit() };
  }

  function canAddTileToLine(line, type, tileIdx) {
    if (lineUsesTile(type, tileIdx, line.id)) return { ok: false, reason: "Tile already on another line of this type." };
    if (line.tiles.includes(tileIdx)) return { ok: true };

    const nextCount = line.tiles.length + 1;
    if (type === "data" && nextCount > dataTileLimit()) {
      return {
        ok: false,
        reason: `Data line max ${dataTileLimit()} tiles at ${state.bitrate}-bit (${effectiveMaxPerPort().toLocaleString()} px/port).`,
      };
    }
    if (type === "power" && powerAmps(nextCount) > MAX_AMPS) {
      return { ok: false, reason: `Power line would exceed ${MAX_AMPS}A at ${state.voltage}V.` };
    }
    return { ok: true };
  }

  function updateWallSummary() {
    const tile = getTileForCalc();
    const rows = Number(els.wallRows.value) || 1;
    const cols = Number(els.wallCols.value) || 1;
    const total = rows * cols;
    const w = (cols * tile.metricWidth) / 1000;
    const h = (rows * tile.metricHeight) / 1000;
    const lbs = total * tile.weight;
    const watts = total * tile.wattage;
    els.wallSummary.textContent = `${cols}×${rows} = ${total} tiles · ${w.toFixed(2)}m × ${h.toFixed(2)}m · ${lbs.toFixed(1)} lbs · ${watts} W total`;
    updateStaleHint();
  }

  function updateStaleHint() {
    const grid = getActiveGrid();
    const stale =
      grid?.generated && (grid.rows !== grid.generatedRows || grid.cols !== grid.generatedCols);
    els.gridStaleHint.hidden = !stale;
    if (stale) {
      els.canvasStatus.textContent = `Grid is ${grid.generatedCols}×${grid.generatedRows} — rebuild to apply ${grid.cols}×${grid.rows}.`;
    }
  }

  function pruneLinesForGrid() {
    const grid = getActiveGrid();
    if (!grid) return;
    const maxTiles = grid.rows * grid.cols;
    let changed = false;
    for (const [lines, type] of [
      [grid.dataLines, "data"],
      [grid.powerLines, "power"],
    ]) {
      let typeChanged = false;
      for (let i = lines.length - 1; i >= 0; i--) {
        const before = lines[i].tiles.length;
        lines[i].tiles = lines[i].tiles.filter((idx) => idx >= 0 && idx < maxTiles);
        if (lines[i].tiles.length !== before) changed = true;
        if (!lines[i].tiles.length) {
          lines.splice(i, 1);
          typeChanged = true;
          changed = true;
        }
      }
      if (typeChanged) {
        renumberLines(lines, type);
      }
    }
    if (changed) {
      grid.activeLineId = getLines()[0]?.id ?? null;
      refreshActiveLine();
      renderResourceBars();
    }
  }

  function readWallDimensions() {
    const rows = Math.max(1, Math.min(40, Number(els.wallRows.value) || 1));
    const cols = Math.max(1, Math.min(40, Number(els.wallCols.value) || 1));
    const grid = getActiveGrid();
    if (grid) {
      grid.rows = rows;
      grid.cols = cols;
    }
    els.wallRows.value = String(rows);
    els.wallCols.value = String(cols);
  }

  function generateGrid() {
    recordBefore("led", "generate-grid");
    let grid = getActiveGrid();
    if (!grid) {
      grid = buildGridFromForm(defaultGridName(state.grids.length));
      state.grids.push(grid);
      state.activeGridId = grid.id;
    } else {
      persistFormToActiveGrid();
    }

    const sizeChanged =
      grid.generated && (grid.rows !== grid.generatedRows || grid.cols !== grid.generatedCols);

    if (sizeChanged) {
      pruneLinesForGrid();
    }

    grid.generated = true;
    grid.generatedRows = grid.rows;
    grid.generatedCols = grid.cols;
    els.gridStaleHint.hidden = true;
    lastWallContentKey = "";

    render();
    setStatus(`Generated ${grid.name}: ${grid.cols}×${grid.rows} (${grid.cols * grid.rows} tiles).`);
  }

  function render() {
    const grid = getActiveGrid();
    renderGridList();
    if (!grid?.generated) {
      els.wallCanvasContainer.classList.remove("has-grid");
      els.wallSvg.hidden = true;
      els.wallSvg.innerHTML = "";
      els.canvasStatus.textContent = grid
        ? `${grid.name} not generated — click Generate Grid.`
        : "Set columns and rows, then click Generate Grid.";
      return;
    }
    els.wallCanvasContainer.classList.add("has-grid");
    els.wallSvg.hidden = false;
    syncLineNumbersIfNeeded(grid);
    renderWall();
    renderResourceBars();
    refreshActiveLine();
    updateStaleHint();
  }

  function refreshActiveLine() {
    const grid = getActiveGrid();
    const lines = getLines();
    if (!grid) return;
    if (!lines.some((l) => l.id === grid.activeLineId)) {
      grid.activeLineId = lines[0]?.id ?? null;
    }
    updateLabelButtons();
  }

  function renderSectionCollapseButton(type, open) {
    return `<button type="button" class="btn-collapse-section" data-collapse-section="${type}" aria-expanded="${open}" aria-label="Toggle ${type} lines"><span class="collapse-chevron" aria-hidden="true"></span></button>`;
  }

  function renderDataSectionHeader(open) {
    const options = [8, 10, 12];
    const buttons = options
      .map(
        (bitrate) =>
          `<button type="button" class="btn-bitrate${state.bitrate === bitrate ? " active" : ""}" data-bitrate="${bitrate}" aria-pressed="${state.bitrate === bitrate}">${bitrate}b</button>`
      )
      .join("");
    return `
      <div class="resource-section-header">
        ${renderSectionCollapseButton("data", open)}
        <h3>Data Lines</h3>
        <button type="button" class="btn-add-processor" data-add-processor="1" title="New processor group" aria-label="New processor group">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <line x1="12" y1="10" x2="12" y2="16" /><line x1="9" y1="13" x2="15" y2="13" />
          </svg>
        </button>
        <div class="bitrate-toggle" role="group" aria-label="Color depth bitrate">
          ${buttons}
        </div>
      </div>`;
  }

  function renderPowerSectionHeader(open) {
    return `
      <div class="resource-section-header">
        ${renderSectionCollapseButton("power", open)}
        <h3>Power Lines</h3>
        <div class="voltage-toggle" role="group" aria-label="Circuit voltage">
          <button type="button" class="btn-voltage${state.voltage === 120 ? " active" : ""}" data-voltage="120" aria-pressed="${state.voltage === 120}">120V</button>
          <button type="button" class="btn-voltage${state.voltage === 208 ? " active" : ""}" data-voltage="208" aria-pressed="${state.voltage === 208}">208V</button>
        </div>
      </div>`;
  }

  function updateLabelButtons() {
    const line = getActiveLine();
    const startPlaced = Boolean(line?.startLabel);
    const endPlaced = Boolean(line?.endLabel);

    els.placeStartLabel.classList.toggle("btn-icon-active", startPlaced);
    els.placeStartLabel.classList.toggle("btn-icon-danger", startPlaced);
    els.placeStartLabel.title = startPlaced ? "Remove start label" : "Place start label";
    els.placeStartLabel.setAttribute("aria-label", els.placeStartLabel.title);

    els.placeEndLabel.classList.toggle("btn-icon-active", endPlaced);
    els.placeEndLabel.classList.toggle("btn-icon-danger", endPlaced);
    els.placeEndLabel.title = endPlaced ? "Remove end label" : "Place end label";
    els.placeEndLabel.setAttribute("aria-label", els.placeEndLabel.title);
  }

  function findLineById(lineId) {
    const grid = getActiveGrid();
    if (!grid) return null;
    return [...grid.dataLines, ...grid.powerLines].find((l) => l.id === lineId) ?? null;
  }

  function lineTypeForLine(line) {
    const grid = getActiveGrid();
    if (!grid) return "data";
    return grid.dataLines.includes(line) ? "data" : "power";
  }

  let activeLabelEditor = null;

  function closeLabelEditor() {
    if (activeLabelEditor) {
      activeLabelEditor.remove();
      activeLabelEditor = null;
    }
  }

  function applyLabelToLine(line, role, rawValue) {
    const key = role === "start" ? "startLabel" : "endLabel";
    const draftKey = role === "start" ? "startLabelDraft" : "endLabelDraft";
    line[draftKey] = rawValue;
    line[key] = rawValue.trim();
    updateLabelButtons();
  }

  function openLabelEditorAtEndpoint(line, role) {
    if (!wallLayout || !line.tiles.length) return;
    const { tileW, tileH } = wallLayout;
    const tileIdx = role === "start" ? line.tiles[0] : line.tiles[line.tiles.length - 1];
    const c = tileCenter(tileIdx, tileW, tileH);
    const svg = els.wallSvg;
    const pt = svg.createSVGPoint();
    pt.x = c.x;
    pt.y = c.y;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const screen = pt.matrixTransform(ctm);
    openLabelEditor(line, role, screen.x, screen.y);
  }

  function openLabelEditor(line, role, clientX, clientY) {
    closeLabelEditor();
    const container = els.wallCanvasContainer;
    const rect = container.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "endpoint-label-editor";
    input.maxLength = 12;
    const key = role === "start" ? "startLabel" : "endLabel";
    const draftKey = role === "start" ? "startLabelDraft" : "endLabelDraft";
    input.value = line[draftKey] ?? line[key] ?? "";
    input.style.left = `${clientX - rect.left}px`;
    input.style.top = `${clientY - rect.top}px`;

    let dismissed = false;
    const commit = () => {
      if (dismissed) return;
      const text = input.value.trim();
      if ((line[key] ?? "") !== text || (line[draftKey] ?? "") !== input.value) {
        recordBefore("led", "label");
      }
      applyLabelToLine(line, role, input.value);
      closeLabelEditor();
      render();
      setStatus(
        text
          ? `Updated ${role} label on ${line.name}.`
          : `Removed ${role} label from ${line.name}.`
      );
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        dismissed = true;
        closeLabelEditor();
      }
    });
    input.addEventListener("blur", commit);

    container.appendChild(input);
    activeLabelEditor = input;
    input.focus();
    input.select();
  }

  function onEndpointClick(e) {
    const group = e.target.closest(".endpoint-editable");
    if (!group) return;

    e.stopPropagation();
    const line = findLineById(group.dataset.lineId);
    if (!line) return;

    const role = group.dataset.labelRole;
    const lineType = lineTypeForLine(line);
    const grid = getActiveGrid();
    if (!grid) return;
    if (lineType !== grid.activeLineType || grid.activeLineId !== line.id) {
      selectLine(lineType, line.id, { silent: true });
    }
    openLabelEditor(line, role, e.clientX, e.clientY);
  }

  function removeLineLabel(which) {
    const line = getActiveLine();
    if (!line) {
      setStatus("Select or create a line first.", true);
      return;
    }
    recordBefore("led", "clear-label");

    if (which === "start") {
      line.startLabel = "";
      setStatus(`Removed start label from ${line.name}.`);
    } else {
      line.endLabel = "";
      setStatus(`Removed end label from ${line.name}.`);
    }
    updateLabelButtons();
    render();
  }

  function handleLabelButton(which) {
    const line = getActiveLine();
    const placed = which === "start" ? line?.startLabel : line?.endLabel;
    if (placed) {
      removeLineLabel(which);
    } else {
      placeLineLabel(which);
    }
  }

  function placeLineLabel(which) {
    const line = getActiveLine();
    if (!line) {
      setStatus("Select or create a line first.", true);
      return;
    }
    if (!line.tiles.length) {
      setStatus("Add tiles to the line before placing labels.", true);
      return;
    }

    const draftKey = which === "start" ? "startLabelDraft" : "endLabelDraft";
    const key = which === "start" ? "startLabel" : "endLabel";
    const text = (line[draftKey] ?? line[key] ?? "").trim();
    if (!text) {
      openLabelEditorAtEndpoint(line, which);
      return;
    }

    recordBefore("led", "label");
    if (which === "start") {
      line.startLabel = text;
      line.startLabelDraft = text;
      setStatus(`Start label "${text}" placed on ${line.name}.`);
    } else {
      line.endLabel = text;
      line.endLabelDraft = text;
      setStatus(`End label "${text}" placed on ${line.name}.`);
    }
    updateLabelButtons();
    render();
  }

  function selectLine(type, lineId, { silent = false } = {}) {
    const grid = getActiveGrid();
    if (!grid) return;
    grid.activeLineType = type;
    grid.activeLineId = lineId;
    if (type === "data") {
      const line = grid.dataLines.find((l) => l.id === lineId);
      grid.activeProcessorId = findProcessor(grid, line?.processorId)?.id ?? null;
    }
    els.selectData.classList.toggle("active", type === "data");
    els.selectPower.classList.toggle("active", type === "power");
    updateLabelButtons();
    refreshActiveLine();
    render();
    if (!silent) {
      const lines = type === "data" ? grid.dataLines : grid.powerLines;
      const line = lines.find((l) => l.id === lineId);
      setStatus(`Selected ${line?.name ?? "line"}.`);
    }
  }

  function getResourceSectionOpen(type) {
    const el = els.resourceBars.querySelector(`.resource-section-flat.${type}`);
    return el?.classList.contains("is-open") ?? true;
  }

  /** @param {WallGrid|null} grid @param {LineSet} line @param {'data'|'power'} type @param {number} paletteIdx */
  function renderLineBar(grid, line, type, paletteIdx) {
    const usage = lineUsage(line, type);
    const pct = Math.min(100, (usage.used / usage.max) * 100);
    const cls = pct >= 100 ? "over" : pct >= 85 ? "warn" : "ok";
    const isSelected = line.id === grid?.activeLineId && type === grid?.activeLineType;
    const color = lineColor(grid, line, type, paletteIdx);
    const draggable = type === "data" ? ` draggable="true" title="Drag onto a processor to group"` : "";
    return `
      <button type="button" class="resource-bar${isSelected ? " selected" : ""}" data-line-id="${line.id}" data-line-type="${type}"${draggable} aria-pressed="${isSelected}">
        <div class="resource-bar-label"><span>${escapeXml(line.name)}</span><span>${type === "data" ? `${usage.used}/${usage.max}` : `${usage.used.toFixed(1)}A`}</span></div>
        <div class="resource-bar-track">
          <div class="resource-bar-fill ${cls}" style="width:${pct}%;background:${color}"></div>
        </div>
      </button>`;
  }

  /** Data section body: processor folders first, ungrouped lines below. */
  function renderDataSectionBody(grid) {
    const lines = grid?.dataLines ?? [];
    const processors = grid?.processors ?? [];
    const barFor = (line) => renderLineBar(grid, line, "data", lines.indexOf(line));

    const ungrouped = lines.filter((l) => !findProcessor(grid, l.processorId));
    const parts = [];

    if (!lines.length && !processors.length) {
      parts.push(`<p class="resource-empty">No lines defined</p>`);
    }

    for (const proc of processors) {
      const procLines = lines.filter((l) => l.processorId === proc.id);
      const isActive = proc.id === grid?.activeProcessorId;
      parts.push(`
        <div class="processor-group processor-drop${isActive ? " selected" : ""}" data-processor-id="${proc.id}" data-processor-drop="${proc.id}">
          <div class="processor-row" draggable="true" data-processor-row="${proc.id}" title="Drag to reorder">
            <span class="processor-grip" aria-hidden="true">⋮⋮</span>
            <button type="button" class="processor-select" data-processor-select="${proc.id}" aria-pressed="${isActive}" title="New data lines are created in the selected processor">
              <svg class="processor-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span class="processor-name">${escapeXml(proc.name)}</span>
              <span class="processor-count">${procLines.length}</span>
            </button>
            <input type="color" class="processor-color" data-processor-color="${proc.id}" value="${escapeXml(proc.color)}" title="Line color for this processor" aria-label="Color for ${escapeXml(proc.name)}" />
            <button type="button" class="processor-remove" data-processor-remove="${proc.id}" title="Remove processor (keeps its lines)" aria-label="Remove ${escapeXml(proc.name)}">×</button>
          </div>
          <div class="processor-lines">
            ${procLines.map(barFor).join("") || `<p class="resource-empty processor-empty-hint">No lines — drag lines here or create one</p>`}
          </div>
        </div>`);
    }

    if (ungrouped.length || processors.length) {
      parts.push(`
        <div class="processor-drop processor-ungrouped" data-processor-drop="">
          ${ungrouped.map(barFor).join("") || (processors.length ? `<p class="resource-empty processor-ungrouped-hint">Drop lines here to ungroup</p>` : "")}
        </div>`);
    }

    return parts.join("");
  }

  function renderResourceBars() {
    processorNameEditor?.close();
    const grid = getActiveGrid();
    if (grid) {
      ensureGridShape(grid);
      syncLineNumbersIfNeeded(grid);
    }
    const dataOpen = getResourceSectionOpen("data");
    const powerOpen = getResourceSectionOpen("power");

    const powerLines = grid?.powerLines ?? [];
    const powerBody = !powerLines.length
      ? `<p class="resource-empty">No lines defined</p>`
      : powerLines.map((line, i) => renderLineBar(grid, line, "power", i)).join("");

    els.resourceBars.innerHTML = `
      <div class="resource-section resource-section-flat data${dataOpen ? " is-open" : ""}">
        ${renderDataSectionHeader(dataOpen)}
        <div class="resource-section-body">${renderDataSectionBody(grid)}</div>
      </div>
      <div class="resource-section resource-section-flat power${powerOpen ? " is-open" : ""}">
        ${renderPowerSectionHeader(powerOpen)}
        <div class="resource-section-body">${powerBody}</div>
      </div>`;
  }

  function getFixedTileDimensions(tile) {
    const aspect = tile.metricWidth / tile.metricHeight;
    let tileW = 80;
    let tileH = tileW / aspect;
    const gridW = REFERENCE_GRID.cols * tileW + (REFERENCE_GRID.cols - 1) * TILE_GAP;
    const gridH = REFERENCE_GRID.rows * tileH + (REFERENCE_GRID.rows - 1) * TILE_GAP;
    const scale = Math.min(
      1,
      REFERENCE_VIEWPORT.maxW / gridW,
      REFERENCE_VIEWPORT.maxH / gridH
    );
    return { tileW: tileW * scale, tileH: tileH * scale };
  }

  function tileCenter(index, tileW, tileH) {
    const { row, col } = tileCoords(index);
    return {
      x: PADDING + col * (tileW + TILE_GAP) + tileW / 2,
      y: PADDING + row * (tileH + TILE_GAP) + tileH / 2,
    };
  }

  function renderWall() {
    closeLabelEditor();
    const grid = getActiveGrid();
    if (!grid?.generated) return;
    const { rows, cols, tile } = grid;
    if (rows < 1 || cols < 1) return;

    const viewType = grid.activeLineType;
    const visibleLines = viewType === "data" ? grid.dataLines : grid.powerLines;

    const { tileW, tileH } = getFixedTileDimensions(tile);

    const svgW = PADDING * 2 + cols * tileW + (cols - 1) * TILE_GAP;
    const svgH = PADDING * 2 + rows * tileH + (rows - 1) * TILE_GAP;

    const contentKey = `${rows}x${cols}`;
    const contentSizeChanged = contentKey !== lastWallContentKey;
    if (contentSizeChanged) {
      lastWallContentKey = contentKey;
    }

    wallView.contentW = svgW;
    wallView.contentH = svgH;
    wallLayout = { tileW, tileH, rows, cols };

    if (contentSizeChanged) {
      fitWallViewToContent();
    } else {
      applyWallView();
    }

    const activeLine = getActiveLine();
    const parts = [];

    // Lines for active type only (behind tiles)
    visibleLines.forEach((line, li) => {
      if (line.tiles.length < 2) return;
      const color = lineColor(grid, line, viewType, li);
      const points = line.tiles
        .map((idx) => {
          const c = tileCenter(idx, tileW, tileH);
          return `${c.x},${c.y}`;
        })
        .join(" ");
      parts.push(
        `<polyline class="line-path ${viewType}" points="${points}" stroke="${color}" data-line-id="${line.id}" />`
      );
    });

    // Tiles — highlight only the active line type
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = tileIndex(r, c);
        const x = PADDING + c * (tileW + TILE_GAP);
        const y = PADDING + r * (tileH + TILE_GAP);
        const onLine = visibleLines.find((l) => l.tiles.includes(idx));
        const onActive = activeLine?.tiles.includes(idx);

        const accent = viewType === "data" ? "#22d3ee" : "#f59e0b";
        const fillIdle = viewType === "data" ? "rgba(34,211,238,0.12)" : "rgba(245,158,11,0.12)";
        const fillActive = viewType === "data" ? "rgba(34,211,238,0.25)" : "rgba(245,158,11,0.25)";

        let fill = "#1e293b";
        if (onActive) fill = fillActive;
        else if (onLine) fill = fillIdle;

        const stroke = onActive ? accent : onLine ? accent : "#475569";

        parts.push(`
          <g class="tile-group" data-tile="${idx}">
            <rect class="tile-rect" x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="3"
              fill="${fill}" stroke="${stroke}" stroke-width="${onActive ? 2.5 : 1.5}" />
          </g>`);
      }
    }

    // Endpoint labels (active type only)
    visibleLines.forEach((line, li) => {
      if (!line.tiles.length) return;
      const color = lineColor(grid, line, viewType, li);
      const isActiveLine = line.id === grid.activeLineId;
      const startIdx = line.tiles[0];
      const endIdx = line.tiles[line.tiles.length - 1];
      const singleTile = line.tiles.length === 1;

      if (line.startLabel) {
        parts.push(drawEndpoint(startIdx, line.startLabel, color, tileW, tileH, isActiveLine, line.id, "start", false));
      }
      if (!singleTile && line.endLabel) {
        parts.push(drawEndpoint(endIdx, line.endLabel, color, tileW, tileH, isActiveLine, line.id, "end", false));
      }
    });

    // Tile coordinates on top of lines and labels
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = PADDING + c * (tileW + TILE_GAP);
        const y = PADDING + r * (tileH + TILE_GAP);
        parts.push(
          `<text class="tile-label" x="${x + tileW / 2}" y="${y + 10}" text-anchor="middle" dominant-baseline="hanging">${r + 1},${c + 1}</text>`
        );
      }
    }

    els.wallSvg.innerHTML = parts.join("");

    const assigned = visibleLines.reduce((n, l) => n + l.tiles.length, 0);
    const total = rows * cols;
    const modeLabel = viewType === "data" ? "Data" : "Power";
    els.canvasStatus.textContent = `${grid.name} · ${cols}×${rows} · ${modeLabel} · ${assigned}/${total} tiles assigned · ${state.voltage}V`;
    saveWallViewToGrid();
  }

  function drawEndpoint(tileIdx, label, color, tileW, tileH, isActiveLine, lineId, role, sameTile = false) {
    const c = tileCenter(tileIdx, tileW, tileH);
    const r = isActiveLine ? 16 : 13;
    const hitR = r + 8;
    const cx = c.x;
    let cy = c.y;
    if (sameTile) {
      cy = role === "start" ? c.y - r * 1.1 : c.y + r * 0.35;
    }
    const strokeW = isActiveLine ? 2.5 : 1.5;
    const fontSize = isActiveLine ? 12 : 10;
    const displayText = label;
    const textClass = "endpoint-label";
    return `
      <g class="endpoint-group endpoint-editable${isActiveLine ? " endpoint-active" : ""}" data-line-id="${lineId}" data-label-role="${role}">
        <circle class="endpoint-hit" cx="${cx}" cy="${cy}" r="${hitR}" fill="transparent" />
        <circle class="endpoint-circle" cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${strokeW}" />
        <text class="${textClass}" x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="${fontSize}">${escapeXml(displayText)}</text>
      </g>`;
  }

  function setStatus(msg, isError = false) {
    const el = els.canvasStatus ?? els.drawHint;
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "var(--danger)" : "";
  }

  function tileIndexFromPointer(clientX, clientY) {
    if (!wallLayout) return null;
    const svg = els.wallSvg;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return null;
    const { x, y } = pt.matrixTransform(ctm);
    const { tileW, tileH, rows, cols } = wallLayout;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = PADDING + c * (tileW + TILE_GAP);
        const ty = PADDING + r * (tileH + TILE_GAP);
        if (x >= tx && x <= tx + tileW && y >= ty && y <= ty + tileH) {
          return tileIndex(r, c);
        }
      }
    }
    return null;
  }

  function ensureLineForDrawing() {
    let line = getActiveLine();
    const lineNotStarted = !line || line.tiles.length === 0;
    if (lineNotStarted && !line) {
      createLine({ silent: true });
      line = getActiveLine();
    }
    return line;
  }

  function modifyLineWithTile(line, type, tileIdx, mode) {
    if (lineUsesTile(type, tileIdx, line.id)) {
      return { ok: false, reason: "Tile already assigned to another line of this type." };
    }

    const pos = line.tiles.indexOf(tileIdx);
    if (pos >= 0) {
      line.tiles = mode === "click" ? line.tiles.slice(0, pos) : line.tiles.slice(0, pos + 1);
      return { ok: true, changed: true, trimmed: true };
    }

    const check = canAddTileToLine(line, type, tileIdx);
    if (!check.ok) return check;

    line.tiles.push(tileIdx);
    return { ok: true, changed: true, trimmed: false };
  }

  function applyTileToLine(tileIdx, mode) {
    const grid = getActiveGrid();
    if (!grid?.generated) {
      setStatus("Generate the grid before drawing lines.", true);
      return false;
    }

    const type = grid.activeLineType;
    let line = getActiveLine();
    const tileOnOtherLine = lineUsesTile(type, tileIdx, line?.id ?? null);

    if (tileOnOtherLine) {
      setStatus("Tile already assigned to another line of this type.", true);
      return false;
    }

    const tileIsEmpty = !lineUsesTile(type, tileIdx, null);
    const lineNotStarted = !line || line.tiles.length === 0;

    if (tileIsEmpty && lineNotStarted) {
      line = ensureLineForDrawing();
    }

    if (!line) {
      setStatus("Could not create a line for this tile.", true);
      return false;
    }

    const wasEmpty = line.tiles.length === 0;
    const result = modifyLineWithTile(line, type, tileIdx, mode);
    if (!result.ok) {
      setStatus(result.reason, true);
      return false;
    }

    if (mode === "click") {
      if (result.trimmed) {
        setStatus(`Removed tile and subsequent tiles from ${line.name}.`);
      } else if (wasEmpty) {
        setStatus(`Started ${line.name} on this tile.`);
      } else {
        setStatus(`Added tile to ${line.name} (${line.tiles.length} tiles).`);
      }
    }

    return true;
  }

  function fitWallViewToContent() {
    wallView.panX = 0;
    wallView.panY = 0;
    wallView.zoom = 1;
    applyWallView();
  }

  function resetWallView() {
    fitWallViewToContent();
  }

  function applyWallView() {
    panZoom.applyView();
  }

  function updateViewHint() {
    if (!els.viewHint) return;
    const pct = Math.round(wallView.zoom * 100);
    els.viewHint.hidden = false;
    els.viewHint.textContent = `${pct}%`;
  }

  function onWallPointerDown(e) {
    if (!getActiveGrid()?.generated) return;
    if (e.button !== 0) return;

    if (e.target.closest(".endpoint-editable")) return;

    const tileIdx = tileIndexFromPointer(e.clientX, e.clientY);
    if (tileIdx == null) return;

    const type = getActiveGrid()?.activeLineType ?? "data";
    const line = getActiveLine();
    if (lineUsesTile(type, tileIdx, line?.id ?? null)) {
      setStatus("Tile already assigned to another line of this type.", true);
      return;
    }

    e.preventDefault();
    els.wallCanvasContainer.setPointerCapture(e.pointerId);

    pointerDrag.active = true;
    pointerDrag.moved = false;
    pointerDrag.startTile = tileIdx;
    pointerDrag.lastTile = null;
  }

  function onWallPointerMove(e) {
    if (panZoom.isPanning) return;

    if (!pointerDrag.active) return;

    const tileIdx = tileIndexFromPointer(e.clientX, e.clientY);
    if (tileIdx == null || tileIdx === pointerDrag.lastTile) return;
    if (tileIdx === pointerDrag.startTile && !pointerDrag.moved) return;

    if (!pointerDrag.moved) {
      pointerDrag.moved = true;
      recordBefore("led", "paint-line");
      if (pointerDrag.startTile != null) {
        applyTileToLine(pointerDrag.startTile, "drag");
        pointerDrag.lastTile = pointerDrag.startTile;
      }
    }

    if (tileIdx === pointerDrag.lastTile) return;

    if (applyTileToLine(tileIdx, "drag")) {
      pointerDrag.lastTile = tileIdx;
      render();
    }
  }

  function onWallPointerEnd(e) {
    if (panZoom.isPanning) return;

    if (!pointerDrag.active) return;

    if (els.wallCanvasContainer.hasPointerCapture(e.pointerId)) {
      els.wallCanvasContainer.releasePointerCapture(e.pointerId);
    }

    if (!pointerDrag.moved && pointerDrag.startTile != null) {
      recordBefore("led", "paint-line");
      applyTileToLine(pointerDrag.startTile, "click");
      render();
    } else if (pointerDrag.moved) {
      const line = getActiveLine();
      if (line?.tiles.length) {
        setStatus(`Drew ${line.name} (${line.tiles.length} tiles).`);
      }
    }

    pointerDrag.active = false;
    pointerDrag.moved = false;
    pointerDrag.startTile = null;
    pointerDrag.lastTile = null;
  }

  function lineNumbersNeedRenumber(lines, type) {
    if (lines.length === 0) return false;
    const prefix = type === "data" ? "Data" : "Power";
    const pattern = new RegExp(`^${prefix} (\\d+)$`);
    const numbers = [];

    for (const line of lines) {
      const match = line.name.match(pattern);
      if (!match) return false;
      numbers.push(Number(match[1]));
    }

    numbers.sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) return true;
    }
    return false;
  }

  function syncLineNumbersIfNeeded(grid) {
    if (lineNumbersNeedRenumber(grid.dataLines, "data")) {
      renumberLines(grid.dataLines, "data");
    }
    if (lineNumbersNeedRenumber(grid.powerLines, "power")) {
      renumberLines(grid.powerLines, "power");
    }
  }

  function renumberLines(lines, type) {
    const prefix = type === "data" ? "Data" : "Power";
    for (let i = 0; i < lines.length; i++) {
      const n = i + 1;
      const labels = defaultLabelsForLine(n, type);
      const line = lines[i];
      line.name = `${prefix} ${n}`;
      line.startLabel = labels.startLabel;
      line.endLabel = labels.endLabel;
      line.startLabelDraft = labels.startLabel;
      line.endLabelDraft = labels.endLabel;
    }
  }

  function createLine({ silent = false } = {}) {
    const grid = getActiveGrid();
    if (!grid) return null;
    if (!silent) recordBefore("led", "create-line");
    syncLineNumbersIfNeeded(grid);
    const lines = getLines();
    const n = lines.length + 1;
    const type = grid.activeLineType;
    const labels = defaultLabelsForLine(n, type);
    const line = {
      id: uid("line"),
      name: `${type === "data" ? "Data" : "Power"} ${n}`,
      tiles: [],
      startLabel: labels.startLabel,
      endLabel: labels.endLabel,
      startLabelDraft: labels.startLabel,
      endLabelDraft: labels.endLabel,
      processorId: type === "data" ? (grid.activeProcessorId ?? null) : null,
    };
    lines.push(line);
    grid.activeLineId = line.id;
    updateLabelButtons();
    refreshActiveLine();
    renderResourceBars();
    render();
    if (!silent) {
      setStatus(`Created ${line.name}. Click or drag across tiles to draw.`);
    }
    return line;
  }

  function createProcessor() {
    const grid = getActiveGrid();
    if (!grid) {
      setStatus("Create an LED wall first.", true);
      return;
    }
    recordBefore("led", "create-processor");
    ensureGridShape(grid);
    const n = grid.processors.length + 1;
    const proc = {
      id: uid("proc"),
      name: `Processor ${n}`,
      color: PROCESSOR_COLORS[(n - 1) % PROCESSOR_COLORS.length],
    };
    grid.processors.push(proc);
    grid.activeProcessorId = proc.id;
    render();
    setStatus(`Created ${proc.name}. New data lines go into the selected processor.`);
  }

  function selectProcessor(processorId) {
    const grid = getActiveGrid();
    if (!grid) return;
    grid.activeProcessorId = grid.activeProcessorId === processorId ? null : processorId;
    renderResourceBars();
    const proc = findProcessor(grid, grid.activeProcessorId);
    setStatus(
      proc
        ? `Selected ${proc.name} — new data lines will be created in it.`
        : "No processor selected — new data lines will be ungrouped."
    );
  }

  function removeProcessor(processorId) {
    const grid = getActiveGrid();
    if (!grid) return;
    const idx = grid.processors.findIndex((p) => p.id === processorId);
    if (idx < 0) return;
    recordBefore("led", "remove-processor");
    const name = grid.processors[idx].name;
    grid.processors.splice(idx, 1);
    for (const line of grid.dataLines) {
      if (line.processorId === processorId) line.processorId = null;
    }
    if (grid.activeProcessorId === processorId) grid.activeProcessorId = null;
    render();
    setStatus(`Removed ${name}. Its lines are now ungrouped.`);
  }

  function setProcessorColor(processorId, color) {
    const proc = findProcessor(getActiveGrid(), processorId);
    if (!proc) return;
    if (proc.color !== color) recordBefore("led", "processor-color");
    proc.color = color;
    render();
    setStatus(`Updated ${proc.name} color.`);
  }

  /** @param {string} processorId @param {string} targetId @param {boolean} before */
  function reorderProcessor(processorId, targetId, before) {
    const grid = getActiveGrid();
    if (!grid || processorId === targetId) return;
    const list = grid.processors;
    const from = list.findIndex((p) => p.id === processorId);
    if (from < 0 || !list.some((p) => p.id === targetId)) return;
    recordBefore("led", "reorder-processor");
    const [proc] = list.splice(from, 1);
    const insert = list.findIndex((p) => p.id === targetId) + (before ? 0 : 1);
    list.splice(insert, 0, proc);
    renderResourceBars();
    setStatus(`Moved ${proc.name} to position ${insert + 1}.`);
  }

  /** @param {string} lineId @param {string|null} processorId */
  function assignLineToProcessor(lineId, processorId) {
    const grid = getActiveGrid();
    const line = grid?.dataLines.find((l) => l.id === lineId);
    if (!grid || !line) return;
    const target = findProcessor(grid, processorId);
    if ((line.processorId ?? null) === (target?.id ?? null)) return;
    recordBefore("led", "assign-line");
    line.processorId = target?.id ?? null;
    if (grid.activeLineId === line.id) grid.activeProcessorId = target?.id ?? null;
    render();
    setStatus(target ? `Moved ${line.name} into ${target.name}.` : `Moved ${line.name} out of its processor.`);
  }

  function removeActiveLine() {
    const grid = getActiveGrid();
    if (!grid) return;

    const selectedBar = els.resourceBars.querySelector(".resource-bar.selected");
    let type = grid.activeLineType;
    let lineId = grid.activeLineId;

    if (selectedBar) {
      type = selectedBar.dataset.lineType === "power" ? "power" : "data";
      lineId = selectedBar.dataset.lineId;
    }

    if (!lineId) {
      setStatus("Select a line to remove.", true);
      return;
    }

    grid.activeLineType = type;
    const lines = type === "data" ? grid.dataLines : grid.powerLines;
    const idx = lines.findIndex((l) => l.id === lineId);
    if (idx < 0) {
      setStatus("No line selected to remove.", true);
      return;
    }

    recordBefore("led", "remove-line");
    const removedName = lines[idx].name;
    lines.splice(idx, 1);
    renumberLines(lines, type);

    grid.activeLineId = lines[Math.min(idx, lines.length - 1)]?.id ?? null;
    els.selectData.classList.toggle("active", type === "data");
    els.selectPower.classList.toggle("active", type === "power");
    closeLabelEditor();
    updateLabelButtons();
    refreshActiveLine();
    renderResourceBars();
    render();
    setStatus(`Removed ${removedName}.`);
  }

  function clearActiveLineTiles() {
    const line = getActiveLine();
    if (!line || !line.tiles.length) return;
    recordBefore("led", "clear-line");
    line.tiles = [];
    render();
    refreshActiveLine();
    renderResourceBars();
    setStatus(`Cleared tiles from ${line.name}.`);
  }

  function setActiveLineType(type) {
    const grid = getActiveGrid();
    if (!grid) return;
    grid.activeLineType = type;
    grid.activeLineId = (type === "data" ? grid.dataLines : grid.powerLines)[0]?.id ?? null;
    els.selectData.classList.toggle("active", type === "data");
    els.selectPower.classList.toggle("active", type === "power");
    refreshActiveLine();
    render();
    setStatus(`Drawing ${type} lines. Click or drag tiles to draw.`);
  }

  function syncFromForm() {
    recordBefore("led", "form", { coalesceMs: 400 });
    readWallDimensions();
    readTileFromForm();
    updateWallSummary();
    if (getActiveGrid()?.generated) {
      renderResourceBars();
      refreshActiveLine();
      render();
    } else {
      renderGridList();
    }
  }

  function onWallSizeInput() {
    recordBefore("led", "form", { coalesceMs: 400 });
    readWallDimensions();
    updateWallSummary();
  }

  function onSourceChange() {
    if (suspendFormSync) return;
    recordBefore("led", "tile-source");
    const custom = isCustomSource();
    applyTileSourceUi(custom ? "custom" : "prebuilt");
    if (!custom) {
      const preset =
        PREBUILT_TILES.find((p) => p.id === els.prebuiltTile.value) ?? PREBUILT_TILES[0];
      writeTileToForm(preset);
    }
    syncFromForm();
  }

  function initSidebarTabs() {
    if (!els.ledSidebar) return;
    bindSidebarTabs(els.ledSidebar, {
      panelIdForTab: (tabId) => `sidebar-${tabId}`,
    });
  }

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  function onDocumentKeyDown(e) {
    if (e.key.toLowerCase() !== "n") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditableTarget(e.target)) return;
    const ledPanel = document.getElementById("led-calculator");
    if (!ledPanel?.classList.contains("active")) return;

    e.preventDefault();
    createLine();
  }

  // Wire events
  populatePrebuiltSelect();
  applyTileSourceUi("prebuilt");
  setTileFieldsDisabled(true);

  initSidebarTabs();
  if (els.wallCanvasContainer) {
    panZoom.bind();
  }

  els.selectPrebuiltTile.addEventListener("click", () => setTileSource("prebuilt"));
  els.selectCustomTile.addEventListener("click", () => setTileSource("custom"));
  els.prebuiltTile.addEventListener("change", onSourceChange);
  tileInputs().forEach((el) => el?.addEventListener("input", syncFromForm));
  els.wallRows.addEventListener("input", onWallSizeInput);
  els.wallCols.addEventListener("input", onWallSizeInput);
  els.generateGrid.addEventListener("click", generateGrid);
  els.gridNew.addEventListener("click", addGrid);
  els.gridRemove.addEventListener("click", removeActiveGrid);
  els.gridList.addEventListener("click", (e) => {
    if (e.target.closest(".grid-name-editor")) return;
    const item = e.target.closest("[data-grid-id]");
    if (!item) return;
    selectGrid(item.dataset.gridId);
  });
  els.gridList.addEventListener("dblclick", (e) => {
    const nameEl = e.target.closest(".grid-item-name");
    if (!nameEl) return;
    e.preventDefault();
    e.stopPropagation();
    openGridNameEditor(nameEl);
  });

  els.selectData.addEventListener("click", () => setActiveLineType("data"));
  els.selectPower.addEventListener("click", () => setActiveLineType("power"));

  els.lineNew.addEventListener("click", createLine);
  els.lineEdit.addEventListener("click", () => {
    const line = getActiveLine();
    if (!line) {
      setStatus("Select a line from the resource list below.", true);
      return;
    }
    setStatus("Editing selected line. Click tiles to extend or trim from a tile.");
    render();
  });
  els.lineRemove.addEventListener("click", removeActiveLine);
  els.placeStartLabel.addEventListener("click", () => handleLabelButton("start"));
  els.placeEndLabel.addEventListener("click", () => handleLabelButton("end"));
  els.resourceBars.addEventListener("click", (e) => {
    if (e.target.closest(".processor-color") || e.target.closest(".grid-name-editor")) return;
    const addProcessorBtn = e.target.closest("[data-add-processor]");
    if (addProcessorBtn) {
      createProcessor();
      return;
    }
    const removeProcessorBtn = e.target.closest("[data-processor-remove]");
    if (removeProcessorBtn) {
      removeProcessor(removeProcessorBtn.dataset.processorRemove);
      return;
    }
    const processorSelectBtn = e.target.closest("[data-processor-select]");
    if (processorSelectBtn) {
      selectProcessor(processorSelectBtn.dataset.processorSelect);
      return;
    }
    const collapseBtn = e.target.closest("[data-collapse-section]");
    if (collapseBtn) {
      const type = collapseBtn.dataset.collapseSection;
      const section = els.resourceBars.querySelector(`.resource-section-flat.${type}`);
      if (section) {
        section.classList.toggle("is-open");
        const open = section.classList.contains("is-open");
        collapseBtn.setAttribute("aria-expanded", String(open));
        section.querySelectorAll(`[data-collapse-section="${type}"]`).forEach((btn) => {
          btn.setAttribute("aria-expanded", String(open));
        });
      }
      return;
    }
    const bitrateBtn = e.target.closest("[data-bitrate]");
    if (bitrateBtn) {
      const bitrate = Number(bitrateBtn.dataset.bitrate);
      if (bitrate === 8 || bitrate === 10 || bitrate === 12) {
        if (state.bitrate !== bitrate) recordBefore("led", "bitrate");
        state.bitrate = bitrate;
        render();
        setStatus(
          `Data lines at ${bitrate}-bit (${effectiveMaxPerPort().toLocaleString()} px/port, ~${dataTileLimit()} tiles/line).`
        );
      }
      return;
    }
    const voltageBtn = e.target.closest("[data-voltage]");
    if (voltageBtn) {
      const voltage = Number(voltageBtn.dataset.voltage);
      if (voltage === 120 || voltage === 208) {
        if (state.voltage !== voltage) recordBefore("led", "voltage");
        state.voltage = voltage;
        render();
        setStatus(`Power lines calculated at ${voltage}V (max 20A per line).`);
      }
      return;
    }
    const bar = e.target.closest(".resource-bar");
    if (!bar) return;
    selectLine(bar.dataset.lineType, bar.dataset.lineId);
  });
  els.clearActiveLine.addEventListener("click", clearActiveLineTiles);

  // Live wall preview while picking; skip re-rendering the bars so the native
  // color input isn't destroyed mid-interaction.
  els.resourceBars.addEventListener("input", (e) => {
    const colorInput = /** @type {HTMLInputElement|null} */ (e.target.closest(".processor-color"));
    if (!colorInput) return;
    const proc = findProcessor(getActiveGrid(), colorInput.dataset.processorColor);
    if (!proc) return;
    recordBefore("led", "processor-color", { coalesceMs: 400 });
    proc.color = colorInput.value;
    renderWall();
  });
  els.resourceBars.addEventListener("change", (e) => {
    const colorInput = /** @type {HTMLInputElement|null} */ (e.target.closest(".processor-color"));
    if (!colorInput) return;
    setProcessorColor(colorInput.dataset.processorColor, colorInput.value);
  });
  els.resourceBars.addEventListener("dblclick", (e) => {
    const nameEl = e.target.closest(".processor-name");
    if (!nameEl) return;
    e.preventDefault();
    e.stopPropagation();
    processorNameEditor?.open(nameEl);
  });

  const LINE_MOVE_MIME = "text/led-line-move";
  const PROC_MOVE_MIME = "text/led-processor-move";
  function hasDragType(e, mime) {
    return [...(e.dataTransfer?.types ?? [])].includes(mime);
  }
  function clearProcessorDropHighlights() {
    els.resourceBars
      .querySelectorAll(".is-drop-target, .drop-before, .drop-after")
      .forEach((el) => {
        el.classList.remove("is-drop-target", "drop-before", "drop-after");
      });
  }
  els.resourceBars.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return;
    const procRow = e.target.closest('.processor-row[draggable="true"]');
    if (procRow) {
      e.dataTransfer.setData(PROC_MOVE_MIME, procRow.dataset.processorRow ?? "");
      e.dataTransfer.effectAllowed = "move";
      const group = procRow.closest(".processor-group");
      if (group) e.dataTransfer.setDragImage(group, 12, 12);
      return;
    }
    const bar = e.target.closest('.resource-bar[data-line-type="data"]');
    if (!bar) return;
    e.dataTransfer.setData(LINE_MOVE_MIME, bar.dataset.lineId ?? "");
    e.dataTransfer.effectAllowed = "move";
  });
  els.resourceBars.addEventListener("dragover", (e) => {
    if (hasDragType(e, PROC_MOVE_MIME)) {
      const group = e.target.closest(".processor-group");
      clearProcessorDropHighlights();
      if (!group) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const rect = group.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      group.classList.add(before ? "drop-before" : "drop-after");
      return;
    }
    if (!hasDragType(e, LINE_MOVE_MIME)) return;
    const zone = e.target.closest("[data-processor-drop]");
    if (!zone) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    clearProcessorDropHighlights();
    zone.classList.add("is-drop-target");
  });
  els.resourceBars.addEventListener("dragleave", (e) => {
    const zone = e.target.closest(".processor-drop, .processor-group");
    const related = /** @type {Node|null} */ (e.relatedTarget);
    if (zone && related && zone.contains(related)) return;
    zone?.classList.remove("is-drop-target", "drop-before", "drop-after");
  });
  els.resourceBars.addEventListener("drop", (e) => {
    if (hasDragType(e, PROC_MOVE_MIME)) {
      const group = e.target.closest(".processor-group");
      clearProcessorDropHighlights();
      if (!group) return;
      e.preventDefault();
      const procId = e.dataTransfer?.getData(PROC_MOVE_MIME);
      const rect = group.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (procId) reorderProcessor(procId, group.dataset.processorId ?? "", before);
      return;
    }
    if (!hasDragType(e, LINE_MOVE_MIME)) return;
    const zone = e.target.closest("[data-processor-drop]");
    if (!zone) return;
    e.preventDefault();
    clearProcessorDropHighlights();
    const lineId = e.dataTransfer?.getData(LINE_MOVE_MIME);
    if (lineId) assignLineToProcessor(lineId, zone.dataset.processorDrop || null);
  });
  els.resourceBars.addEventListener("dragend", clearProcessorDropHighlights);

  els.wallSvg.addEventListener("click", onEndpointClick);
  els.wallCanvasContainer.addEventListener("pointerdown", onWallPointerDown);
  els.wallCanvasContainer.addEventListener("pointermove", onWallPointerMove);
  els.wallCanvasContainer.addEventListener("pointerup", onWallPointerEnd);
  els.wallCanvasContainer.addEventListener("pointercancel", onWallPointerEnd);
  els.resetWallView?.addEventListener("click", resetWallView);
  els.expandAllSections?.addEventListener("click", () => {
    els.ledSidebar?.querySelectorAll("details.panel-section").forEach((section) => {
      section.open = true;
    });
  });
  els.collapseAllSections?.addEventListener("click", () => {
    els.ledSidebar?.querySelectorAll("details.panel-section").forEach((section) => {
      section.open = false;
    });
  });
  els.wallSvg?.addEventListener("lostpointercapture", onWallPointerEnd);
  document.addEventListener("keydown", onDocumentKeyDown);

  render();
  setStatus("Ready.");

  function exportState() {
    // Read-only snapshot. Do not persist form fields here — paperwork and other
    // calculators call exportState while loading a site plan, when the form may
    // still hold HTML defaults and would clobber freshly imported grids.
    saveWallViewToGrid();
    return {
      grids: deepClone(state.grids),
      activeGridId: state.activeGridId,
      voltage: state.voltage,
      bitrate: state.bitrate,
    };
  }

  /** Flush sidebar form values onto the active grid before a user-initiated save. */
  function flushFormToState() {
    persistFormToActiveGrid();
    saveWallViewToGrid();
  }

  /** @param {object} data */
  function importState(data) {
    const normalized = normalizeLedState(data);
    closeGridNameEditor();
    closeLabelEditor();
    state.grids = deepClone(normalized.grids);
    state.activeGridId = normalized.activeGridId;
    state.voltage = normalized.voltage;
    state.bitrate = normalized.bitrate;
  }

  return {
    exportState,
    importState,
    flushFormToState,
    refreshUi: refreshLedUiFromState,
  };
}

export const calculatorPlugin = {
  meta: {
    id: "led-calculator",
    tabPanelId: "led-calculator",
    stateKey: "led",
    label: "LED Calculator",
    requiredForSave: true,
    validateState: normalizeLedState,
  },
  init: initLedCalculator,
};
