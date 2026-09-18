/**
 * Sheet list helpers for the paperwork sidebar.
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
 * @param {string} typeId
 * @returns {string | null}
 */
export function sheetRoleLabel(typeId) {
  switch (typeId) {
    case "led-wall-cable":
      return "Cable Diagram";
    case "led-wall-power":
      return "Power Diagram";
    case "cable-runs":
      return "Cable Runs";
    case "signal-flow":
      return "Signal Flow";
    case "surface-map":
      return "Surface";
    case "raster-map":
      return "Raster";
    case "cover":
      return "Cover";
    default:
      return null;
  }
}

/**
 * @param {string} wallName
 */
function formatLedWallName(wallName) {
  const name = String(wallName ?? "").trim() || "Wall";
  if (/^led\b/i.test(name)) return name;
  return `LED ${name}`;
}

/**
 * Two-line list presentation: room on top, subject | role below.
 * @param {import("./state.js").SheetInstance} sheet
 * @returns {{ room: string | null, detail: string }}
 */
export function sheetListPresentation(sheet) {
  const title = String(sheet.title ?? "").trim() || "Untitled";
  const role = sheetRoleLabel(sheet.typeId);
  const parts = title.split(/\s*—\s*/).map((part) => part.trim()).filter(Boolean);

  if (isLedWallSheet(sheet)) {
    let room = null;
    let wall = title;
    if (parts.length >= 3) {
      room = parts[0];
      wall = parts[parts.length - 1];
    } else if (parts.length === 2) {
      wall = parts[1];
    }
    const detail = role
      ? `${formatLedWallName(wall)} | ${role}`
      : formatLedWallName(wall);
    return { room, detail };
  }

  if (isSurfaceSheet(sheet) || isRasterSheet(sheet)) {
    if (parts.length >= 3) {
      return {
        room: parts[0],
        detail: role ? `${parts[parts.length - 1]} | ${role}` : parts[parts.length - 1],
      };
    }
    if (parts.length === 2) {
      // "Surface — Lobby" (no room prefix)
      return {
        room: null,
        detail: role ? `${parts[1]} | ${role}` : parts[1],
      };
    }
  }

  if (parts.length >= 2) {
    return {
      room: parts[0],
      detail: parts.slice(1).join(" — "),
    };
  }

  return { room: null, detail: title };
}

/**
 * Flat search / fallback title.
 * @param {import("./state.js").SheetInstance} sheet
 */
export function sheetListTitle(sheet) {
  const { room, detail } = sheetListPresentation(sheet);
  return room ? `${room} — ${detail}` : detail;
}

/**
 * Top-left sheet heading body (room on first line, detail on second).
 * @param {{ typeId?: string, title?: string, roomId?: string | null }} sheet
 */
export function sheetHeadingText(sheet) {
  const { room, detail } = sheetListPresentation(sheet);
  return room ? `${room}\n${detail}` : detail;
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 */
export function wallFolderLabel(sheet) {
  const title = String(sheet.title ?? "");
  const match = /LED (?:Cable|Power)\s*[—-]\s*(.+)$/i.exec(title);
  if (match?.[1]?.trim()) return match[1].trim();
  const sep = title.lastIndexOf("—");
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
 * Flat sheet list (no auto-grouping).
 * @param {import("./state.js").SheetInstance[]} sheets sorted by order
 * @returns {SheetTreeNode[]}
 */
export function buildSheetTree(sheets) {
  return sheets.map((sheet) => ({ kind: "sheet", sheet }));
}

/**
 * @param {import("./state.js").SheetInstance | null} _sheet
 * @returns {string[]}
 */
export function folderKeysForSheet(_sheet) {
  return [];
}
