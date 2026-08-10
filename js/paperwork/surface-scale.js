import { screenPixelSize } from "../projector-calculator.js";

/**
 * @param {unknown} raw
 * @returns {"px" | "ft-in"}
 */
export function normalizeSurfaceDimensionUnit(raw) {
  return raw === "ft-in" ? "ft-in" : "px";
}

/**
 * Format a length in inches as feet & inches (matches LED spec style).
 * @param {number} totalInches
 */
export function formatFeetInches(totalInches) {
  const abs = Math.abs(Number(totalInches) || 0);
  let feet = Math.floor(abs / 12);
  let inches = Math.round((abs - feet * 12) * 10) / 10;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  const inchText = Number.isInteger(inches) ? String(inches) : inches.toFixed(1);
  if (feet <= 0) return `${inchText} in`;
  if (inches === 0) return `${feet} ft`;
  return `${feet} ft ${inchText} in`;
}

/**
 * @param {number} pixels
 * @param {{ unit?: "px" | "ft-in", ppi?: number | null }} [options]
 */
export function formatSurfaceLength(pixels, options = {}) {
  const px = Number(pixels) || 0;
  const unit = normalizeSurfaceDimensionUnit(options.unit);
  const ppi = Number(options.ppi) || 0;
  if (unit === "ft-in" && ppi > 0) {
    return formatFeetInches(px / ppi);
  }
  return `${Math.round(px)} px`;
}

/**
 * @param {number} xPx
 * @param {number} yPx
 * @param {{ unit?: "px" | "ft-in", ppi?: number | null }} [options]
 */
export function formatSurfacePoint(xPx, yPx, options = {}) {
  const unit = normalizeSurfaceDimensionUnit(options.unit);
  const ppi = Number(options.ppi) || 0;
  if (unit === "ft-in" && ppi > 0) {
    return `${formatFeetInches(xPx / ppi)}, ${formatFeetInches(yPx / ppi)}`;
  }
  return `${Math.round(Number(xPx) || 0)}, ${Math.round(Number(yPx) || 0)}`;
}

/**
 * @param {object | null | undefined} screen
 * @returns {number | null}
 */
function screenPpi(screen) {
  const size = screen ? screenPixelSize(screen) : null;
  const px = Number(size?.width) || 0;
  const physical = Number(screen?.width) || 0;
  if (!(px > 0) || !(physical > 0)) return null;
  const inches = screen.unit === "m" ? physical * 39.3700787 : physical * 12;
  if (!(inches > 0)) return null;
  return px / inches;
}

/**
 * @param {object | null | undefined} grid
 * @returns {number | null}
 */
function wallPpi(grid) {
  const px = Number(grid?.tile?.pixelWidth);
  const mm = Number(grid?.tile?.metricWidth);
  if (!(px > 0) || !(mm > 0)) return null;
  return px / (mm / 25.4);
}

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string} screenId
 */
function findProjectorScreen(siteExports, screenId) {
  const screens = /** @type {object[]} */ (
    /** @type {{ screens?: object[] } | null} */ (siteExports?.projector)?.screens ?? []
  );
  return screens.find((screen) => String(screen?.id ?? "") === String(screenId)) ?? null;
}

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string} projectorId
 */
function findScreenForProjector(siteExports, projectorId) {
  const screens = /** @type {object[]} */ (
    /** @type {{ screens?: object[] } | null} */ (siteExports?.projector)?.screens ?? []
  );
  return (
    screens.find((screen) =>
      (Array.isArray(screen?.projectors) ? screen.projectors : []).some(
        (projector) => String(projector?.id ?? "") === String(projectorId)
      )
    ) ?? null
  );
}

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string} wallId
 */
function findLedGrid(siteExports, wallId) {
  const grids = /** @type {object[]} */ (
    /** @type {{ grids?: object[] } | null} */ (siteExports?.led)?.grids ?? []
  );
  return grids.find((grid) => String(grid?.id ?? "") === String(wallId)) ?? null;
}

/**
 * @param {{ type?: string, id?: string } | null | undefined} source
 * @param {Record<string, unknown>} siteExports
 * @returns {number | null}
 */
function ppiFromSource(source, siteExports) {
  if (!source?.id) return null;
  if (source.type === "projector") {
    const byScreen = findProjectorScreen(siteExports, source.id);
    if (byScreen) return screenPpi(byScreen);
    const byProjector = findScreenForProjector(siteExports, source.id);
    return screenPpi(byProjector);
  }
  if (source.type === "led") {
    return wallPpi(findLedGrid(siteExports, source.id));
  }
  return null;
}

/**
 * Resolve px/in for a Content Maps surface from its projector/LED link.
 * @param {object | null | undefined} surface
 * @param {Record<string, unknown>} siteExports
 * @returns {number | null}
 */
export function resolveSurfacePpi(surface, siteExports) {
  if (!surface) return null;
  const fromSurface = ppiFromSource(
    /** @type {{ type?: string, id?: string } | null} */ (surface.source),
    siteExports
  );
  if (fromSurface) return fromSurface;

  const zones = Array.isArray(surface.zones) ? surface.zones : [];
  for (const zone of zones) {
    const fromZone = ppiFromSource(
      /** @type {{ type?: string, id?: string } | null} */ (zone?.source),
      siteExports
    );
    if (fromZone) return fromZone;
  }
  return null;
}

/**
 * True when the surface is linked to a projection screen (or projector zones).
 * @param {object | null | undefined} surface
 */
export function surfaceHasProjectorScale(surface) {
  if (!surface) return false;
  if (surface.source?.type === "projector") return true;
  const zones = Array.isArray(surface.zones) ? surface.zones : [];
  return zones.some((zone) => zone?.source?.type === "projector");
}
