/** Matches decoration font-size range (print pt). */
const DEFAULT_FONT_SIZE_PT = 10;
const MIN_FONT_SIZE_PT = 6;
const MAX_FONT_SIZE_PT = 96;

/** Element types that expose a Font size (pt) inspector control. */
export const FONT_SIZE_ELEMENT_TYPES = new Set([
  "surfaceDiagram",
  "rasterDiagram",
  "groundplanDiagram",
  "ledWiringDiagram",
  "signalFlowDiagram",
  "text",
  "notes",
  "scopeSummary",
  "detailTable",
  "ledSpecificationTable",
]);

/**
 * Default pt by element type (used when content has no fontSize).
 * @param {string} [type]
 * @returns {number}
 */
export function defaultFontSizePt(type) {
  switch (type) {
    case "text":
      return 11;
    case "detailTable":
    case "ledSpecificationTable":
      return 9;
    case "notes":
    case "scopeSummary":
      return 10;
    default:
      return DEFAULT_FONT_SIZE_PT;
  }
}

/**
 * @param {unknown} raw
 * @param {{ type?: string, legacyScale?: unknown }} [opts]
 * @returns {number}
 */
export function normalizeFontSizePt(raw, opts = {}) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(MAX_FONT_SIZE_PT, Math.max(MIN_FONT_SIZE_PT, Math.round(n)));
  }
  const legacy = Number(opts.legacyScale);
  const base = defaultFontSizePt(opts.type);
  if (Number.isFinite(legacy) && legacy > 0) {
    return Math.min(
      MAX_FONT_SIZE_PT,
      Math.max(MIN_FONT_SIZE_PT, Math.round(base * legacy))
    );
  }
  return base;
}

/**
 * Resolve font size from element content (supports legacy fontScale).
 * @param {{ type?: string, content?: Record<string, unknown> | null }} element
 * @returns {number}
 */
export function resolveElementFontSizePt(element) {
  return normalizeFontSizePt(element?.content?.fontSize, {
    type: element?.type,
    legacyScale: element?.content?.fontScale,
  });
}

/**
 * Convert print pt → SVG user units for a viewBox fitted with meet into a frame (inches).
 * @param {number} fontSizePt
 * @param {{ viewW: number, viewH: number, frameWIn: number, frameHIn: number }} geometry
 * @returns {number}
 */
export function fontSizePtToUserUnits(fontSizePt, geometry) {
  const viewW = Math.max(1, Number(geometry.viewW) || 1);
  const viewH = Math.max(1, Number(geometry.viewH) || 1);
  const frameW = Math.max(0.25, Number(geometry.frameWIn) || 1);
  const frameH = Math.max(0.25, Number(geometry.frameHIn) || 1);
  const userPerIn = Math.max(viewW / frameW, viewH / frameH);
  return Math.max(1, (normalizeFontSizePt(fontSizePt) / 72) * userPerIn);
}

export {
  DEFAULT_FONT_SIZE_PT,
  MIN_FONT_SIZE_PT,
  MAX_FONT_SIZE_PT,
};
