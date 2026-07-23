/**
 * Paper sizes for the paperwork composer. Dimensions are in inches.
 * Arch C (18×24) is the default for all sheets.
 */

/** @typedef {{ id: string, label: string, widthIn: number, heightIn: number }} PaperSizeDef */

/** @type {PaperSizeDef[]} */
export const PAPER_SIZES = [
  { id: "arch-c", label: "Arch C (18×24 in)", widthIn: 18, heightIn: 24 },
  { id: "arch-d", label: "Arch D (24×36 in)", widthIn: 24, heightIn: 36 },
  { id: "tabloid", label: "Tabloid (11×17 in)", widthIn: 11, heightIn: 17 },
  { id: "letter", label: "Letter (8.5×11 in)", widthIn: 8.5, heightIn: 11 },
  { id: "a3", label: "A3 (297×420 mm)", widthIn: 11.693, heightIn: 16.535 },
  { id: "a4", label: "A4 (210×297 mm)", widthIn: 8.268, heightIn: 11.693 },
];

export const DEFAULT_PAPER_SIZE_ID = "arch-c";
export const DEFAULT_ORIENTATION = /** @type {"landscape" | "portrait"} */ ("landscape");

/** Preview / export rasterization density. */
export const PAPERWORK_DPI = 96;

/**
 * @param {string} sizeId
 * @param {"landscape" | "portrait"} orientation
 * @returns {{ widthIn: number, heightIn: number, widthPx: number, heightPx: number, label: string }}
 */
export function resolvePaper(sizeId, orientation) {
  const def = PAPER_SIZES.find((s) => s.id === sizeId) ?? PAPER_SIZES[0];
  const landscape = orientation !== "portrait";
  const widthIn = landscape ? Math.max(def.widthIn, def.heightIn) : Math.min(def.widthIn, def.heightIn);
  const heightIn = landscape ? Math.min(def.widthIn, def.heightIn) : Math.max(def.widthIn, def.heightIn);
  return {
    widthIn,
    heightIn,
    widthPx: Math.round(widthIn * PAPERWORK_DPI),
    heightPx: Math.round(heightIn * PAPERWORK_DPI),
    label: def.label,
  };
}
