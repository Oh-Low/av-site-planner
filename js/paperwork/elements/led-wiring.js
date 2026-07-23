import { escapeXml } from "../../shared/dom.js";
import { resolveElementFontSizePt } from "../font-scale.js?v=4";
import { buildLedWiringSvg } from "../led-wiring-svg.js?v=7";
import { registerElementRenderer } from "./registry.js?v=3";

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string | null | undefined} sourceKey
 */
function findWallGrid(siteExports, sourceKey) {
  const led = /** @type {{ grids?: object[] } | null} */ (siteExports?.led);
  const grids = Array.isArray(led?.grids) ? led.grids : [];
  return grids.find((g) => String(g?.id ?? "") === String(sourceKey ?? "")) ?? null;
}

registerElementRenderer({
  type: "ledWiringDiagram",
  label: "LED wiring diagram",
  render(host, ctx) {
    const { element, sheet, siteExports } = ctx;
    const mode =
      element.content?.mode === "power" || element.content?.mode === "data"
        ? element.content.mode
        : "data";
    const sourceKey =
      (typeof element.content?.sourceKey === "string" && element.content.sourceKey) ||
      sheet.sourceKey;
    const grid = findWallGrid(siteExports, sourceKey);
    const title = mode === "power" ? "Power wiring" : "Cable / data wiring";

    host.classList.add("pw-el-led-wiring");
    host.classList.toggle("is-power", mode === "power");
    host.classList.toggle("is-data", mode === "data");

    if (!grid) {
      host.innerHTML = `
        <div class="pw-el-led-wiring-head">${escapeXml(title)}</div>
        <div class="pw-el-led-wiring-empty">Wall not found — sync from LED calculator.</div>`;
      return;
    }

    const built = buildLedWiringSvg(grid, mode, {
      fontSizePt: resolveElementFontSizePt(element),
      frameWIn: Number(element.w) || 12,
      frameHIn: Number(element.h) || 9,
    });
    if (!built) {
      host.innerHTML = `
        <div class="pw-el-led-wiring-head">${escapeXml(title)}</div>
        <div class="pw-el-led-wiring-empty">Generate this wall in the LED calculator to show wiring.</div>`;
      return;
    }

    const lines = mode === "power" ? grid.powerLines : grid.dataLines;
    const lineCount = Array.isArray(lines) ? lines.length : 0;
    const rows = Number(grid.generated ? grid.generatedRows : grid.rows) || 0;
    const cols = Number(grid.generated ? grid.generatedCols : grid.cols) || 0;
    const assigned = Array.isArray(lines)
      ? lines.reduce((n, l) => n + (Array.isArray(l.tiles) ? l.tiles.length : 0), 0)
      : 0;

    host.innerHTML = `
      <div class="pw-el-led-wiring-head">
        <span>${escapeXml(title)}</span>
        <span class="pw-el-led-wiring-meta">${escapeXml(
          `${cols}×${rows} · ${lineCount} line${lineCount === 1 ? "" : "s"} · ${assigned}/${rows * cols} tiles`
        )}</span>
      </div>
      <div class="pw-el-led-wiring-canvas">${built.svg}</div>`;
  },
});
