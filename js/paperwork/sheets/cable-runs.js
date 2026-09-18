import {
  createCableCardsElement,
  createGroundplanDiagramElement,
} from "../element-catalog.js";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { sheetHeadingText } from "../sheet-tree.js";
import { titleBlockFrame } from "../title-block-layout.js";

registerSheetType({
  id: "cable-runs",
  label: "Cable runs",
  expand(siteExports) {
    const gp = /** @type {{ imageDataUrl?: string | null } | null} */ (
      siteExports.groundplan
    );
    if (typeof gp?.imageDataUrl !== "string" || !gp.imageDataUrl.trim()) {
      return [];
    }
    return [{ typeId: "cable-runs", sourceKey: "cable-runs", title: "Cable Runs" }];
  },
  defaultElements(seed, _siteExports, page) {
    const margin = 0.5;
    const tb = titleBlockFrame(page);
    const contentBottom = tb.y - 0.25;
    const headingH = 1.25;
    const gap = 0.3;
    const diagramY = 1.85;
    const diagramH = Math.max(4.5, (contentBottom - diagramY) * 0.58);
    const cardsY = diagramY + diagramH + gap;
    const cardsH = Math.max(2.5, contentBottom - cardsY);

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
        },
      }),
      createGroundplanDiagramElement({
        x: margin,
        y: diagramY,
        w: page.widthIn - margin * 2,
        h: diagramH,
        z: 2,
      }),
      createCableCardsElement({
        x: margin,
        y: cardsY,
        w: page.widthIn - margin * 2,
        h: cardsH,
        z: 3,
      }),
    ];
  },
});
