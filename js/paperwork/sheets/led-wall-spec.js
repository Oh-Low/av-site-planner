import {
  createLedSpecificationElement,
  createLedWiringElement,
} from "../element-catalog.js";
import { listLedWalls } from "../led-spec-data.js";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { titleBlockFrame } from "../title-block-layout.js";

/**
 * @param {{
 *   seed: { typeId: string, sourceKey: string | null, title: string },
 *   page: { widthIn: number, heightIn: number },
 *   mode: "data" | "power",
 * }} opts
 */
function wiringSheetElements(opts) {
  const { seed, page, mode } = opts;
  const margin = 0.5;
  const leftW = Math.min(5.5, page.widthIn * 0.26);
  const tb = titleBlockFrame(page);
  const diagramX = margin + leftW + 0.35;
  const diagramW = page.widthIn - diagramX - margin;
  const diagramH = Math.max(4, tb.y - 1.7);
  const sourceKey = seed.sourceKey ?? "";

  return [
    createElement({
      type: "text",
      x: margin,
      y: margin,
      w: page.widthIn - margin * 2,
      h: 0.65,
      z: 1,
      content: { body: seed.title.toUpperCase(), heading: true },
    }),
    createLedSpecificationElement(sourceKey, {
      x: margin,
      y: 1.35,
      w: leftW,
      h: Math.max(3, tb.y - 1.75),
      z: 2,
    }),
    createLedWiringElement(sourceKey, mode, {
      x: diagramX,
      y: 1.35,
      w: diagramW,
      h: diagramH,
      z: 3,
    }),
  ];
}

registerSheetType({
  id: "led-wall-cable",
  label: "LED cable wiring",
  expand(siteExports) {
    return listLedWalls(siteExports).map((wall) => ({
      typeId: "led-wall-cable",
      sourceKey: wall.id,
      title: `LED Cable — ${wall.name}`,
    }));
  },
  defaultElements(seed, _siteExports, page) {
    return wiringSheetElements({ seed, page, mode: "data" });
  },
});

registerSheetType({
  id: "led-wall-power",
  label: "LED power wiring",
  expand(siteExports) {
    return listLedWalls(siteExports).map((wall) => ({
      typeId: "led-wall-power",
      sourceKey: wall.id,
      title: `LED Power — ${wall.name}`,
    }));
  },
  defaultElements(seed, _siteExports, page) {
    return wiringSheetElements({ seed, page, mode: "power" });
  },
});
