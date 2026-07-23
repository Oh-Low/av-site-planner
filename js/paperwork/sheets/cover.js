import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { titleBlockFrame } from "../title-block-layout.js";

registerSheetType({
  id: "cover",
  label: "Cover sheet",
  expand() {
    return [{ typeId: "cover", sourceKey: "cover", title: "Cover" }];
  },
  defaultElements(_seed, _siteExports, page) {
    const margin = 0.5;
    const leftW = Math.min(6.5, page.widthIn * 0.32);
    const tb = titleBlockFrame(page);
    return [
      createElement({
        type: "text",
        x: margin,
        y: margin,
        w: page.widthIn - margin * 2,
        h: 1.2,
        z: 1,
        content: { body: "SITE PACKET", heading: true },
      }),
      createElement({
        type: "detailTable",
        x: margin,
        y: 2,
        w: leftW,
        h: Math.max(3, tb.y - 2.4),
        z: 2,
        content: {
          title: "Project",
          fields: [
            { id: "show", label: "Show", auto: "" },
            { id: "venue", label: "Venue", auto: "" },
            { id: "client", label: "Client", auto: "" },
            { id: "date", label: "Date", auto: "" },
            { id: "revision", label: "Revision", auto: "" },
            { id: "company", label: "Company", auto: "" },
          ],
        },
      }),
      createElement({
        type: "scopeSummary",
        x: margin + leftW + 0.4,
        y: 2,
        w: page.widthIn - margin * 2 - leftW - 0.4,
        h: 4,
        z: 3,
        content: { body: "" },
      }),
    ];
  },
});
