import { createGearListTablesElement } from "../element-factories.js";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { sheetHeadingText } from "../sheet-tree.js";
import { titleBlockFrame } from "../title-block-layout.js";

registerSheetType({
  id: "gear-list",
  label: "Gear list",
  expand() {
    return [{ typeId: "gear-list", sourceKey: "gear-list", title: "Gear List" }];
  },
  /**
   * Show-scoped packing list: LED / Signal Flow / Cables (and others) as
   * compact tables across one sheet.
   * @param {import("../sheet-registry.js").SheetSeed} seed
   * @param {Record<string, unknown>} _siteExports
   * @param {{ widthIn: number, heightIn: number }} page
   */
  defaultElements(seed, _siteExports, page) {
    const margin = 0.4;
    const tb = titleBlockFrame(page);
    const contentBottom = tb.y - 0.2;
    const headingH = 0.7;
    const tablesY = margin + headingH + 0.15;
    const tablesH = Math.max(4, contentBottom - tablesY);

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
      createGearListTablesElement({
        x: margin,
        y: tablesY,
        w: page.widthIn - margin * 2,
        h: tablesH,
        z: 2,
        content: { fontSize: 7 },
      }),
    ];
  },
});
