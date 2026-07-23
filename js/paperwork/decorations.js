import { uid } from "../shared/id.js";
import { roundTo } from "./numbers.js?v=1";

/**
 * Packet-level page decoration (drawing).
 * @typedef {{
 *   id: string,
 *   type: "drawText" | "drawHeading" | "drawLine" | "drawArrow" | "drawRect" | "drawEllipse" | "drawPolyline",
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 *   z: number,
 *   showOnAllSheets: boolean,
 *   sheetId: string | null,
 *   hiddenOnSheets: string[],
 *   style: {
 *     fill: string,
 *     stroke: string,
 *     strokeWidth: number,
 *     fontSize: number,
 *   },
 *   content: Record<string, unknown>,
 * }} PageDecoration
 */

/** @returns {import("./state.js").PaperworkState["drawStyle"]} */
export function defaultDrawStyle() {
  return {
    fill: "#ffffff",
    stroke: "#111111",
    strokeWidth: 2,
    fontSize: 14,
  };
}

/**
 * @param {unknown} raw
 * @returns {PageDecoration["style"]}
 */
export function normalizeDrawStyle(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const base = defaultDrawStyle();
  return {
    fill: typeof r.fill === "string" && r.fill ? r.fill : base.fill,
    stroke: typeof r.stroke === "string" && r.stroke ? r.stroke : base.stroke,
    strokeWidth: Math.max(0.5, Math.min(24, roundTo(Number(r.strokeWidth) || base.strokeWidth))),
    fontSize: Math.max(6, Math.min(96, roundTo(Number(r.fontSize) || base.fontSize, 0))),
  };
}

const DECORATION_TYPES = new Set([
  "drawText",
  "drawHeading",
  "drawLine",
  "drawArrow",
  "drawRect",
  "drawEllipse",
  "drawPolyline",
]);

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {PageDecoration}
 */
export function normalizeDecoration(raw, index = 0) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const type =
    typeof r.type === "string" && DECORATION_TYPES.has(r.type) ? r.type : "drawRect";
  const hiddenOnSheets = Array.isArray(r.hiddenOnSheets)
    ? r.hiddenOnSheets.filter((id) => typeof id === "string")
    : [];
  const content =
    r.content && typeof r.content === "object" && !Array.isArray(r.content)
      ? /** @type {Record<string, unknown>} */ ({ ...r.content })
      : {};
  const showOnAllSheets = r.showOnAllSheets === true;
  return {
    id: typeof r.id === "string" && r.id ? r.id : uid("dec"),
    type,
    x: Number.isFinite(Number(r.x)) ? roundTo(r.x) : 0.5,
    y: Number.isFinite(Number(r.y)) ? roundTo(r.y) : 0.5 + index * 0.2,
    // Allow very small frames for thin lines/polylines (hit area ≈ stroke).
    w: Math.max(0.02, roundTo(Number(r.w) || 1.5)),
    h: Math.max(0.02, roundTo(Number(r.h) || 1)),
    z: Number.isFinite(Number(r.z)) ? Number(r.z) : 1000 + index,
    showOnAllSheets,
    sheetId: typeof r.sheetId === "string" ? r.sheetId : null,
    hiddenOnSheets,
    style: normalizeDrawStyle(r.style),
    content,
  };
}

/**
 * @param {Partial<PageDecoration> & { type: PageDecoration["type"] }} spec
 * @returns {PageDecoration}
 */
export function createDecoration(spec) {
  return normalizeDecoration({
    id: uid("dec"),
    z: 1000,
    x: 1,
    y: 1,
    w: 1.5,
    h: 1,
    showOnAllSheets: false,
    sheetId: null,
    hiddenOnSheets: [],
    style: defaultDrawStyle(),
    content: {},
    ...spec,
  });
}

/**
 * @param {PageDecoration} decoration
 * @param {string | null} activeSheetId
 */
export function decorationVisibleOnSheet(decoration, activeSheetId) {
  if (!activeSheetId) return false;
  if (decoration.showOnAllSheets) {
    return !decoration.hiddenOnSheets.includes(activeSheetId);
  }
  return decoration.sheetId === activeSheetId;
}

/**
 * @param {PageDecoration[]} decorations
 * @param {string | null} activeSheetId
 */
export function decorationsForSheet(decorations, activeSheetId) {
  return decorations
    .filter((d) => decorationVisibleOnSheet(d, activeSheetId))
    .sort((a, b) => a.z - b.z);
}

/**
 * Clamp a frame onto the page (inches).
 * @param {{ x: number, y: number, w: number, h: number }} frame
 * @param {{ widthIn: number, heightIn: number }} page
 */
export function clampFrameToPage(frame, page) {
  const w = Math.min(Math.max(0.15, frame.w), page.widthIn);
  const h = Math.min(Math.max(0.15, frame.h), page.heightIn);
  const x = Math.min(Math.max(0, frame.x), Math.max(0, page.widthIn - w));
  const y = Math.min(Math.max(0, frame.y), Math.max(0, page.heightIn - h));
  return { x: roundTo(x), y: roundTo(y), w: roundTo(w), h: roundTo(h) };
}
