import { createPowerAllocationTableElement } from "../element-factories.js";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { sheetHeadingText } from "../sheet-tree.js";
import { titleBlockFrame } from "../title-block-layout.js";
import { isPowerConnection } from "../../signal-flow-gear-schema.js";

/**
 * @param {Record<string, unknown>} siteExports
 */
function hasPowerFeeds(siteExports) {
  const sf = /** @type {{ connections?: unknown[] } | null} */ (siteExports.signalFlow);
  const connections = Array.isArray(sf?.connections) ? sf.connections : [];
  return connections.some((c) => c && isPowerConnection(/** @type {any} */ (c)));
}

registerSheetType({
  id: "power-allocation",
  label: "Power allocation",
  expand(siteExports) {
    if (!hasPowerFeeds(siteExports)) return [];
    return [
      {
        typeId: "power-allocation",
        sourceKey: "power-allocation",
        title: "Power Allocation",
      },
    ];
  },
  /**
   * Per-room load schedule from Signal Flow power feeds.
   * @param {import("../sheet-registry.js").SheetSeed} seed
   * @param {Record<string, unknown>} _siteExports
   * @param {{ widthIn: number, heightIn: number }} page
   */
  defaultElements(seed, _siteExports, page) {
    const margin = 0.4;
    const tb = titleBlockFrame(page);
    const contentBottom = tb.y - 0.2;
    const headingH = 0.7;
    const tableY = margin + headingH + 0.15;
    const tableH = Math.max(4, contentBottom - tableY);

    return [
      createElement({
        type: "text",
        x: margin,
        y: margin,
        w: page.widthIn - margin * 2,
        h: headingH,
        z: 1,
        content: {
          body: sheetHeadingText({ typeId: seed.typeId, title: seed.title }),
          heading: true,
          fontSize: 22,
        },
      }),
      createPowerAllocationTableElement({
        x: margin,
        y: tableY,
        w: page.widthIn - margin * 2,
        h: tableH,
        z: 2,
        content: { fontSize: 8 },
      }),
    ];
  },
});
