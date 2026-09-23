import {
  gearListRowsForPaperwork,
  normalizeGearListState,
  partitionGearListSections,
} from "../../domain/gear-list.js";
import { escapeXml } from "../../shared/dom.js";
import { normalizeFontSizePt, resolveElementFontSizePt } from "../font-scale.js";
import { registerElementRenderer } from "./registry.js";

/**
 * Compact multi-column gear list for paperwork — one pane per top-level
 * section (LED / Signal Flow / Cables / …) laid out across the page.
 *
 * Rows use CSS grid (not &lt;table&gt;) so column widths resolve against each
 * pane. Columns match Gear List (minus Auto/source). Eyeball-excluded rows
 * from the Gear List tool are omitted. Room/place filters and search in the
 * calculator do not affect this sheet.
 */
registerElementRenderer({
  type: "gearListTables",
  label: "Gear list tables",
  render(host, ctx) {
    const { element, siteExports } = ctx;
    const fontSize = resolveElementFontSizePt(element);
    const gearState = normalizeGearListState(siteExports?.gearList ?? {});
    const displayRows = gearListRowsForPaperwork(gearState);
    const sections = partitionGearListSections(displayRows);
    const colCount = Math.max(1, sections.length);
    const scaledFont =
      colCount >= 4 ? Math.max(5.5, fontSize - 1.5) : colCount >= 3 ? Math.max(6, fontSize - 0.5) : fontSize;

    host.classList.add("pw-el-gear-list");
    host.style.setProperty("--pw-font-size", `${normalizeFontSizePt(scaledFont)}pt`);
    host.style.setProperty("--pw-gear-cols", String(colCount));

    if (!sections.length) {
      host.innerHTML =
        '<div class="pw-el-gear-list-empty">No gear list yet — sync the Gear List tool, then regenerate this sheet.</div>';
      return;
    }

    host.innerHTML = `
      <div class="pw-el-gear-list-cols">
        ${sections.map((section) => sectionHtml(section)).join("")}
      </div>`;
  },
});

/**
 * @param {unknown} value
 */
function cell(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

/**
 * @param {{ id: string, title: string, rows: import("../../domain/gear-list.js").GearListRow[] }} section
 */
function sectionHtml(section) {
  const rows = [
    `<div class="pw-gl-row pw-gl-row--head" role="row">
      <span class="pw-gl-qty" role="columnheader">#</span>
      <span class="pw-gl-name" role="columnheader">Item</span>
      <span class="pw-gl-room" role="columnheader">Room</span>
      <span class="pw-gl-place" role="columnheader">Place</span>
      <span class="pw-gl-len" role="columnheader">Len</span>
      <span class="pw-gl-detail" role="columnheader">Detail</span>
      <span class="pw-gl-notes" role="columnheader">Notes</span>
    </div>`,
    ...section.rows.map((row) => {
      if (row.kind === "header") {
        return `<div class="pw-gl-row pw-gl-row--sub" role="row">
          <span class="pw-gl-subhead">${escapeXml(row.label)}</span>
        </div>`;
      }
      const length =
        row.category === "cable" && row.length != null ? String(row.length) : "";
      return `<div class="pw-gl-row" role="row">
        <span class="pw-gl-qty">${escapeXml(String(row.qty))}</span>
        <span class="pw-gl-name">${escapeXml(cell(row.label))}</span>
        <span class="pw-gl-room">${escapeXml(cell(row.room))}</span>
        <span class="pw-gl-place">${escapeXml(cell(row.place))}</span>
        <span class="pw-gl-len">${escapeXml(length)}</span>
        <span class="pw-gl-detail">${escapeXml(cell(row.detail))}</span>
        <span class="pw-gl-notes">${escapeXml(cell(row.notes))}</span>
      </div>`;
    }),
  ].join("");

  return `
    <section class="pw-el-gear-list-col" data-section="${escapeXml(section.id)}">
      <div class="pw-el-gear-list-col-title">${escapeXml(section.title)}</div>
      <div class="pw-el-gear-list-body" role="table" aria-label="${escapeXml(section.title)}">
        ${rows}
      </div>
    </section>`;
}
