/**
 * Packet-level sheet elements that can appear on one or all sheets
 * (title blocks, notes, text, etc.) — same visibility model as decorations.
 */

/** Element types that may be shared across sheets. */
export const SHAREABLE_ELEMENT_TYPES = new Set([
  "titleBlock",
  "notes",
  "text",
  "detailTable",
  "scopeSummary",
]);

/** @param {string} type */
export function isShareableElementType(type) {
  return SHAREABLE_ELEMENT_TYPES.has(type);
}

/**
 * @param {import("./state.js").PageElement} element
 * @param {string | null} activeSheetId
 */
export function sharedElementVisibleOnSheet(element, activeSheetId) {
  if (!activeSheetId) return false;
  if (element.showOnAllSheets) {
    return !(element.hiddenOnSheets ?? []).includes(activeSheetId);
  }
  return element.sheetId === activeSheetId;
}

/**
 * @param {import("./state.js").PageElement[]} sharedElements
 * @param {string | null} activeSheetId
 * @param {import("./state.js").SheetInstance | null} [sheet]
 */
export function sharedElementsForSheet(sharedElements, activeSheetId, sheet = null) {
  return sharedElements
    .filter((el) => {
      if (sheet?.typeId === "cover" && el.type === "titleBlock") return false;
      return sharedElementVisibleOnSheet(el, activeSheetId);
    })
    .sort((a, b) => a.z - b.z);
}
