import {
  buildGroundplanSvg,
  normalizeGroundplanCrop,
} from "../groundplan-svg.js?v=8";
import { resolveElementFontSizePt } from "../font-scale.js?v=4";
import { registerElementRenderer } from "./registry.js?v=3";

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, name: string }[]}
 */
function listPlaces(siteExports) {
  const sf = /** @type {{ places?: { id?: string, name?: string }[] } | null} */ (
    siteExports?.signalFlow
  );
  const places = Array.isArray(sf?.places) ? sf.places : [];
  return places.map((place, index) => ({
    id: String(place?.id ?? `place-${index}`),
    name: String(place?.name ?? `Place ${index + 1}`),
  }));
}

registerElementRenderer({
  type: "groundplanDiagram",
  label: "Groundplan diagram",
  render(host, ctx) {
    const { element, siteExports, editable, selected } = ctx;
    const groundplan = /** @type {Record<string, unknown> | null} */ (
      siteExports?.groundplan ?? null
    );
    const places = listPlaces(siteExports);

    host.classList.add("pw-el-groundplan");
    if (!groundplan?.imageDataUrl) {
      host.innerHTML =
        '<div class="pw-el-groundplan-empty">Upload a floor plan in Groundplan to show cable runs.</div>';
      return;
    }

    const crop = normalizeGroundplanCrop(
      element.content?.crop,
      Number(groundplan.imageWidth) || 0,
      Number(groundplan.imageHeight) || 0
    );
    const showCropEditor = Boolean(editable && selected);
    const fontSizePt = resolveElementFontSizePt(element);
    const built = buildGroundplanSvg(groundplan, places, {
      crop,
      showCropEditor,
      fontSizePt,
      frameWIn: Number(element.w) || 16,
      frameHIn: Number(element.h) || 9,
    });
    if (!built) {
      host.innerHTML =
        '<div class="pw-el-groundplan-empty">Groundplan image is missing dimensions — re-import the floor plan.</div>';
      return;
    }

    host.classList.toggle("is-cropping", showCropEditor);
    host.innerHTML = `
      <div class="pw-el-groundplan-head">
        <span>Groundplan${built.cropped ? " · Cropped" : ""}${
          showCropEditor ? " · Drag handles to crop" : ""
        }</span>
        <span class="pw-el-groundplan-meta">${built.placeCount} place${
          built.placeCount === 1 ? "" : "s"
        } · ${built.routeCount} route${built.routeCount === 1 ? "" : "s"}</span>
      </div>
      <div class="pw-el-groundplan-canvas">${built.svg}</div>`;
  },
});
