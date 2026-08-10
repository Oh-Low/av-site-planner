import { buildLedSpecificationFields } from "../led-spec-data.js";
import { resolveElementFontSizePt } from "../font-scale.js";
import {
  detailTableHtml,
  registerElementRenderer,
  resolveFieldValue,
} from "./registry.js";

registerElementRenderer({
  type: "ledSpecificationTable",
  label: "LED specifications",
  render(host, ctx) {
    const { element, sheet, siteExports } = ctx;
    const sourceKey =
      (typeof element.content?.sourceKey === "string" && element.content.sourceKey) ||
      sheet.sourceKey;
    const fields = buildLedSpecificationFields(siteExports, sourceKey);
    const rows = fields.map((field) =>
      "section" in field
        ? { section: field.section }
        : {
            id: field.id,
            label: field.label,
            value: resolveFieldValue(element, field.id, field.auto),
          }
    );
    host.classList.add("pw-el-detail", "pw-el-led-spec");
    host.style.setProperty("--pw-font-size", `${resolveElementFontSizePt(element)}pt`);
    host.innerHTML = detailTableHtml(rows, { title: "LED Specifications" });
  },
});
