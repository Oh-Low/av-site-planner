import {
  createCableCardsElement,
  createGroundplanDiagramElement,
} from "../element-catalog.js?v=3";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { titleBlockFrame } from "../title-block-layout.js";

registerSheetType({
  id: "cable-runs",
  label: "Cable runs",
  expand() {
    return [{ typeId: "cable-runs", sourceKey: "cable-runs", title: "Cable Runs" }];
  },
  defaultElements(_seed, _siteExports, page) {
    const margin = 0.5;
    const tb = titleBlockFrame(page);
    const contentBottom = tb.y - 0.25;
    const headingH = 0.65;
    const gap = 0.3;
    const diagramH = Math.max(4.5, (contentBottom - 1.35) * 0.58);
    const cardsY = 1.35 + diagramH + gap;
    const cardsH = Math.max(2.5, contentBottom - cardsY);

    return [
      createElement({
        type: "text",
        x: margin,
        y: margin,
        w: page.widthIn - margin * 2,
        h: headingH,
        z: 1,
        content: { body: "CABLE RUNS", heading: true },
      }),
      createGroundplanDiagramElement({
        x: margin,
        y: 1.35,
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
