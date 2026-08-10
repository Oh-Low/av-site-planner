import { escapeXml } from "../../shared/dom.js";
import { resolveElementFontSizePt } from "../font-scale.js";
import { buildRasterSvg } from "../raster-svg.js";
import { registerElementRenderer } from "./registry.js";

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string | null | undefined} sourceKey
 */
function findRaster(siteExports, sourceKey) {
  const contentMaps = /** @type {{ rasters?: object[] } | null} */ (
    siteExports?.contentMaps
  );
  const rasters = Array.isArray(contentMaps?.rasters) ? contentMaps.rasters : [];
  return (
    rasters.find((raster) => String(raster?.id ?? "") === String(sourceKey ?? "")) ??
    null
  );
}

registerElementRenderer({
  type: "rasterDiagram",
  label: "Raster diagram",
  render(host, ctx) {
    const { element, sheet, siteExports } = ctx;
    const sourceKey =
      (typeof element.content?.sourceKey === "string" && element.content.sourceKey) ||
      sheet.sourceKey;
    const raster = findRaster(siteExports, sourceKey);

    host.classList.add("pw-el-raster");
    if (!raster) {
      host.innerHTML =
        '<div class="pw-el-raster-empty">Raster not found — sync from Content Maps.</div>';
      return;
    }

    const fontSizePt = resolveElementFontSizePt(element);
    const built = buildRasterSvg(raster, {
      fontSizePt,
      frameWIn: Number(element.w) || 12,
      frameHIn: Number(element.h) || 8,
    });
    if (!built) {
      host.innerHTML =
        '<div class="pw-el-raster-empty">Set raster dimensions in Content Maps.</div>';
      return;
    }

    host.innerHTML = `
      <div class="pw-el-raster-head">
        <span>${escapeXml(String(raster.name ?? "Raster"))}</span>
        <span class="pw-el-raster-meta">${Number(raster.width) || 0} × ${
          Number(raster.height) || 0
        } px · ${built.zoneCount} zone${built.zoneCount === 1 ? "" : "s"}</span>
      </div>
      <div class="pw-el-raster-canvas">${built.svg}</div>`;
  },
});
