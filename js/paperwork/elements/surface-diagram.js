import { escapeXml } from "../../shared/dom.js";
import { resolveElementFontSizePt } from "../font-scale.js";
import { buildSurfaceSvg } from "../raster-svg.js";
import {
  formatSurfaceLength,
  normalizeSurfaceDimensionUnit,
  resolveSurfacePpi,
} from "../surface-scale.js";
import { registerElementRenderer } from "./registry.js";

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string | null | undefined} sourceKey
 */
function findSurface(siteExports, sourceKey) {
  const contentMaps = /** @type {{ surfaces?: object[] } | null} */ (
    siteExports?.contentMaps
  );
  const surfaces = Array.isArray(contentMaps?.surfaces) ? contentMaps.surfaces : [];
  return (
    surfaces.find((surface) => String(surface?.id ?? "") === String(sourceKey ?? "")) ??
    null
  );
}

registerElementRenderer({
  type: "surfaceDiagram",
  label: "Surface diagram",
  render(host, ctx) {
    const { element, sheet, siteExports } = ctx;
    const sourceKey =
      (typeof element.content?.sourceKey === "string" && element.content.sourceKey) ||
      sheet.sourceKey;
    const surface = findSurface(siteExports, sourceKey);

    host.classList.add("pw-el-surface");
    if (!surface) {
      host.innerHTML =
        '<div class="pw-el-surface-empty">Surface not found — sync from Content Maps.</div>';
      return;
    }

    const ppi = resolveSurfacePpi(surface, siteExports);
    const dimensionUnit =
      normalizeSurfaceDimensionUnit(element.content?.dimensionUnit) === "ft-in" && ppi
        ? "ft-in"
        : "px";
    const showAnchors = element.content?.showAnchors === true;
    const fontSizePt = resolveElementFontSizePt(element);
    const built = buildSurfaceSvg(surface, {
      dimensionUnit,
      showAnchors,
      ppi,
      fontSizePt,
      frameWIn: Number(element.w) || 12,
      frameHIn: Number(element.h) || 8,
    });
    if (!built) {
      host.innerHTML =
        '<div class="pw-el-surface-empty">Set surface dimensions in Content Maps.</div>';
      return;
    }

    const sizeLabel = `${formatSurfaceLength(Number(surface.width) || 0, {
      unit: dimensionUnit,
      ppi,
    })} × ${formatSurfaceLength(Number(surface.height) || 0, {
      unit: dimensionUnit,
      ppi,
    })}`;

    host.innerHTML = `
      <div class="pw-el-surface-head">
        <span>${escapeXml(String(surface.name ?? "Surface"))}</span>
        <span class="pw-el-surface-meta">${escapeXml(sizeLabel)} · ${built.zoneCount} zone${
          built.zoneCount === 1 ? "" : "s"
        }</span>
      </div>
      <div class="pw-el-surface-canvas">${built.svg}</div>`;
  },
});
