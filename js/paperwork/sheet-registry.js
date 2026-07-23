/**
 * Sheet type plugins: expand live calculator data into sheet instances and
 * seed default element scenes. Adding a sheet = register here + implement
 * expand / defaultElements.
 *
 * @typedef {{
 *   typeId: string,
 *   sourceKey: string | null,
 *   title: string,
 * }} SheetSeed
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   expand: (siteExports: Record<string, unknown>) => SheetSeed[],
 *   defaultElements: (
 *     seed: SheetSeed,
 *     siteExports: Record<string, unknown>,
 *     page: { widthIn: number, heightIn: number },
 *     identity: import("./state.js").ProjectIdentity
 *   ) => import("./state.js").PageElement[],
 * }} SheetTypePlugin
 */

/** @type {Map<string, SheetTypePlugin>} */
const SHEETS = new Map();

/** @param {SheetTypePlugin} plugin */
export function registerSheetType(plugin) {
  SHEETS.set(plugin.id, plugin);
}

/** @param {string} id */
export function getSheetType(id) {
  return SHEETS.get(id) ?? null;
}

export function listSheetTypes() {
  return [...SHEETS.values()];
}
