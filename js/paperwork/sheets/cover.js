import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";

registerSheetType({
  id: "cover",
  label: "Cover sheet",
  expand() {
    return [{ typeId: "cover", sourceKey: null, title: "Cover" }];
  },
  /**
   * Centered event name, job #, and company logo (from title-block identity / logo).
   * @param {import("../sheet-registry.js").SheetSeed} _seed
   * @param {Record<string, unknown>} _siteExports
   * @param {{ widthIn: number, heightIn: number }} page
   * @param {import("../state.js").ProjectIdentity} [_identity]
   */
  defaultElements(_seed, _siteExports, page) {
    const textW = Math.min(page.widthIn - 1.5, 14);
    const titleH = 1.85;
    const jobH = 0.75;
    const logoW = Math.min(4.5, page.widthIn * 0.28);
    const logoH = Math.min(3.2, page.heightIn * 0.28);
    const gapTitleJob = 0.2;
    const gapJobLogo = 0.55;
    const stackH = titleH + gapTitleJob + jobH + gapJobLogo + logoH;
    const stackTop = Math.max(0.75, (page.heightIn - stackH) / 2);
    const textX = (page.widthIn - textW) / 2;
    const logoX = (page.widthIn - logoW) / 2;
    const jobY = stackTop + titleH + gapTitleJob;
    const logoY = jobY + jobH + gapJobLogo;

    return [
      createElement({
        type: "text",
        x: textX,
        y: stackTop,
        w: textW,
        h: titleH,
        z: 1,
        content: {
          body: "",
          bindIdentity: "show",
          placeholder: "Event name",
          heading: true,
          align: "center",
          fontSize: 80,
        },
      }),
      createElement({
        type: "text",
        x: textX,
        y: jobY,
        w: textW,
        h: jobH,
        z: 2,
        content: {
          body: "",
          bindIdentity: "jobNo",
          placeholder: "Job #",
          align: "center",
          fontSize: 36,
          color: "#444444",
        },
      }),
      createElement({
        type: "companyLogo",
        x: logoX,
        y: logoY,
        w: logoW,
        h: logoH,
        z: 3,
        content: {},
      }),
    ];
  },
});
