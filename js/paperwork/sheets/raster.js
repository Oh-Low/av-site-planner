import { createRasterElement } from "../element-catalog.js?v=3";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { titleBlockFrame } from "../title-block-layout.js";

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, name: string, raster: object }[]}
 */
function listRasters(siteExports) {
  const contentMaps = /** @type {{ rasters?: object[] } | null} */ (
    siteExports.contentMaps
  );
  const rasters = Array.isArray(contentMaps?.rasters) ? contentMaps.rasters : [];
  return rasters.map((raster, index) => ({
    id: String(raster?.id ?? `raster-${index}`),
    name: String(raster?.name ?? `Raster ${index + 1}`),
    raster,
  }));
}

registerSheetType({
  id: "raster-map",
  label: "Raster map",
  expand(siteExports) {
    return listRasters(siteExports).map((item) => ({
      typeId: "raster-map",
      sourceKey: item.id,
      title: `Raster — ${item.name}`,
    }));
  },
  defaultElements(seed, _siteExports, page) {
    const margin = 0.5;
    const tb = titleBlockFrame(page);
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
      createRasterElement(seed.sourceKey ?? "", {
        x: margin,
        y: 1.35,
        w: page.widthIn - margin * 2,
        h: Math.max(4, tb.y - 1.7),
        z: 2,
      }),
    ];
  },
});
