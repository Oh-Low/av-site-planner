import { escapeXml } from "../../shared/dom.js";

/**
 * Element renderers paint into an HTMLElement sized to the element's
 * page bounds. Coordinates and sizes are already applied by the scene.
 *
 * @typedef {{
 *   element: import("./state.js").PageElement,
 *   sheet: import("./state.js").SheetInstance,
 *   identity: import("./state.js").ProjectIdentity,
 *   sheetNumber: number,
 *   sheetCount: number,
 *   siteExports: Record<string, unknown>,
 *   paperSizeCode?: string,
 *   editable?: boolean,
 *   selected?: boolean,
 * }} ElementRenderContext
 *
 * @typedef {{
 *   type: string,
 *   label: string,
 *   render: (host: HTMLElement, ctx: ElementRenderContext) => void,
 * }} ElementRenderer
 */

/** @type {Map<string, ElementRenderer>} */
const RENDERERS = new Map();

/** @param {ElementRenderer} renderer */
export function registerElementRenderer(renderer) {
  RENDERERS.set(renderer.type, renderer);
}

/** @param {string} type */
export function getElementRenderer(type) {
  return RENDERERS.get(type) ?? null;
}

export function listElementRenderers() {
  return [...RENDERERS.values()];
}

/**
 * Resolve a detail-table cell: override wins, else auto value.
 * @param {import("./state.js").PageElement} element
 * @param {string} fieldId
 * @param {string} autoValue
 */
export function resolveFieldValue(element, fieldId, autoValue) {
  const over = element.overrides?.[fieldId];
  if (typeof over === "string") return over;
  return autoValue ?? "";
}

/**
 * Shared drafting-style table markup.
 * @param {({ id: string, label: string, value: string } | { section: string })[]} rows
 * @param {{ title?: string }} [opts]
 */
export function detailTableHtml(rows, opts = {}) {
  const title = opts.title ? `<div class="pw-el-table-title">${escapeXml(opts.title)}</div>` : "";
  const body = rows
    .map(
      (row) =>
        "section" in row
          ? `
      <tr class="pw-el-table-section">
        <th colspan="2">${escapeXml(row.section)}</th>
      </tr>`
          : `
      <tr>
        <th scope="row">${escapeXml(row.label)}</th>
        <td class="pw-editable" data-field-id="${escapeXml(row.id)}">${escapeXml(row.value)}</td>
      </tr>`
    )
    .join("");
  return `${title}<table class="pw-el-table"><tbody>${body}</tbody></table>`;
}
