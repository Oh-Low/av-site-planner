import { createSurfaceElement } from "../element-factories.js";
import { createElement } from "../state.js";
import { registerSheetType } from "../sheet-registry.js";
import { titleBlockFrame } from "../title-block-layout.js";

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, name: string }[]}
 */
function listSurfaces(siteExports) {
  const contentMaps = /** @type {{ surfaces?: object[] } | null} */ (
    siteExports.contentMaps
  );
  const surfaces = Array.isArray(contentMaps?.surfaces) ? contentMaps.surfaces : [];
  return surfaces.map((surface, index) => ({
    id: String(surface?.id ?? `surface-${index}`),
    name: String(surface?.name ?? `Surface ${index + 1}`),
  }));
}

registerSheetType({
  id: "surface-map",
  label: "Surface map",
  expand(siteExports) {
    return listSurfaces(siteExports).map((item) => ({
      typeId: "surface-map",
      sourceKey: item.id,
      title: `Surface — ${item.name}`,
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
      createSurfaceElement(seed.sourceKey ?? "", {
        x: margin,
        y: 1.35,
        w: page.widthIn - margin * 2,
        h: Math.max(4, tb.y - 1.7),
        z: 2,
      }),
    ];
  },
});
