/**
 * Sidebar folder grouping for the paperwork sheet list.
 * LED sheets nest under LED → wall; rasters under Rasters;
 * surfaces under Surfaces; cable-runs under Cable Runs.
 */

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function isLedWallSheet(sheet) {
  return sheet.typeId === "led-wall-cable" || sheet.typeId === "led-wall-power";
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function isRasterSheet(sheet) {
  return sheet.typeId === "raster-map";
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function isSurfaceSheet(sheet) {
  return sheet.typeId === "surface-map";
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function isCableRunsSheet(sheet) {
  return sheet.typeId === "cable-runs";
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function sheetListTitle(sheet) {
  if (sheet.typeId === "led-wall-cable") return "Cable wiring";
  if (sheet.typeId === "led-wall-power") return "Power wiring";
  if (isRasterSheet(sheet) || isSurfaceSheet(sheet)) {
    return sourceNameFromTitle(sheet.title) || (isSurfaceSheet(sheet) ? "Surface" : "Raster");
  }
  if (isCableRunsSheet(sheet)) return "Overview";
  if (sheet.typeId === "signal-flow") return "Signal Flow";
  return sheet.title;
}

/** @param {string} title */
function sourceNameFromTitle(title) {
  const value = String(title ?? "");
  const sep = value.indexOf("—");
  return sep >= 0 ? value.slice(sep + 1).trim() : value;
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function wallFolderLabel(sheet) {
  const title = String(sheet.title ?? "");
  const sep = title.indexOf("—");
  if (sep >= 0) {
    const name = title.slice(sep + 1).trim();
    if (name) return name;
  }
  return sheet.sourceKey || "LED wall";
}

/**
 * @typedef {{
 *   kind: "sheet",
 *   sheet: import("./state.js").SheetInstance,
 * } | {
 *   kind: "folder",
 *   key: string,
 *   label: string,
 *   children: SheetTreeNode[],
 * }} SheetTreeNode
 */

/**
 * @param {import("./state.js").SheetInstance[]} sheets sorted by order
 * @returns {SheetTreeNode[]}
 */
export function buildSheetTree(sheets) {
  /** @type {SheetTreeNode[]} */
  const root = [];
  /** @type {Map<string, { key: string, label: string, sheets: import("./state.js").SheetInstance[] }>} */
  const walls = new Map();
  /** @type {import("./state.js").SheetInstance[]} */
  const rasters = [];
  /** @type {import("./state.js").SheetInstance[]} */
  const surfaces = [];
  /** @type {import("./state.js").SheetInstance[]} */
  const cableRuns = [];

  for (const sheet of sheets) {
    if (isRasterSheet(sheet)) {
      rasters.push(sheet);
      continue;
    }
    if (isSurfaceSheet(sheet)) {
      surfaces.push(sheet);
      continue;
    }
    if (isCableRunsSheet(sheet)) {
      cableRuns.push(sheet);
      continue;
    }
    if (!isLedWallSheet(sheet)) {
      root.push({ kind: "sheet", sheet });
      continue;
    }
    const wallId = sheet.sourceKey || sheet.id;
    let wall = walls.get(wallId);
    if (!wall) {
      wall = { key: `LED/${wallId}`, label: wallFolderLabel(sheet), sheets: [] };
      walls.set(wallId, wall);
    }
    wall.sheets.push(sheet);
  }

  if (walls.size) {
    root.push({
      kind: "folder",
      key: "LED",
      label: "LED",
      children: [...walls.values()].map((wall) => ({
        kind: "folder",
        key: wall.key,
        label: wall.label,
        children: wall.sheets.map((sheet) => ({ kind: "sheet", sheet })),
      })),
    });
  }

  if (cableRuns.length) {
    root.push({
      kind: "folder",
      key: "Cable Runs",
      label: "Cable Runs",
      children: cableRuns.map((sheet) => ({ kind: "sheet", sheet })),
    });
  }

  if (surfaces.length) {
    root.push({
      kind: "folder",
      key: "Surfaces",
      label: "Surfaces",
      children: surfaces.map((sheet) => ({ kind: "sheet", sheet })),
    });
  }

  if (rasters.length) {
    root.push({
      kind: "folder",
      key: "Rasters",
      label: "Rasters",
      children: rasters.map((sheet) => ({ kind: "sheet", sheet })),
    });
  }

  return root;
}

/**
 * Folder keys that should stay open so the active sheet is visible.
 * @param {import("./state.js").SheetInstance | null} sheet
 * @returns {string[]}
 */
export function folderKeysForSheet(sheet) {
  if (!sheet) return [];
  if (isRasterSheet(sheet)) return ["Rasters"];
  if (isSurfaceSheet(sheet)) return ["Surfaces"];
  if (isCableRunsSheet(sheet)) return ["Cable Runs"];
  if (!isLedWallSheet(sheet)) return [];
  const wallId = sheet.sourceKey || sheet.id;
  return ["LED", `LED/${wallId}`];
}
