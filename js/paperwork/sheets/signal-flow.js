import { createSignalFlowDiagramElement } from "../element-factories.js";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { titleBlockFrame } from "../title-block-layout.js";

/**
 * @param {Record<string, unknown>} siteExports
 */
function signalFlowColorByCableType(siteExports) {
  const sf = /** @type {{ colorByCableType?: boolean } | null} */ (
    siteExports.signalFlow
  );
  return sf?.colorByCableType === true;
}

registerSheetType({
  id: "signal-flow",
  label: "Signal flow",
  expand() {
    return [
      { typeId: "signal-flow", sourceKey: "signal-flow", title: "Signal Flow" },
    ];
  },
  defaultElements(_seed, siteExports, page) {
    const margin = 0.5;
    const tb = titleBlockFrame(page);
    const contentBottom = tb.y - 0.25;
    const headingH = 0.65;
    const diagramY = 1.35;
    const diagramH = Math.max(5, contentBottom - diagramY);

    return [
      createElement({
        type: "text",
        x: margin,
        y: margin,
        w: page.widthIn - margin * 2,
        h: headingH,
        z: 1,
        content: { body: "SIGNAL FLOW", heading: true },
      }),
      createSignalFlowDiagramElement({
        x: margin,
        y: diagramY,
        w: page.widthIn - margin * 2,
        h: diagramH,
        z: 2,
        content: {
          colorByCableType: signalFlowColorByCableType(siteExports),
        },
      }),
    ];
  },
});
