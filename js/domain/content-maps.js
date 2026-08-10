/**
 * Content-maps domain — surfaces/rasters/test-pattern normalize for .AVP.
 */

import { COLOR_PALETTE } from "../shared/color-palette.js";
import { uid } from "../shared/id.js";

/** @typedef {{ type: "led" | "projector", id: string }} ImportSource */
/** @typedef {{ id: string, name: string, x: number, y: number, width: number, height: number, color: string, source?: ImportSource | null }} MediaZone */
/** @typedef {{ id: string, name: string, width: number, height: number, zones: MediaZone[], source?: ImportSource | null, pattern?: object }} Surface */
/** @typedef {{ id: string, name: string, zones: MediaZone[], source?: ImportSource | null }} OutputGroup */
/** @typedef {{ id: string, name: string, width: number, height: number, groups: OutputGroup[], zones: MediaZone[], source?: ImportSource | null, pattern?: object }} Raster */

const DEFAULT_SURFACE_WIDTH = 3840;
const DEFAULT_SURFACE_HEIGHT = 2160;
const MAX_SURFACE_DIMENSION = 65536;

/** @typedef {{ scope: "source" | "zones", type: "grid" | "bars" | "gradient" | "alignment", gridSize: number, tileMode: "custom" | "led", tileWallId: string | null, tileW: number, tileH: number, tileColorA: string, tileColorB: string, showZones: boolean, showLabels: boolean, showCenter: boolean }} PatternSettings */
/** @typedef {{ sourceType: "surface" | "raster", sourceId: string | null }} TestPatternSelection */

export function toFiniteNumber(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function normalizeZone(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("zone"),
    name:
      typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Zone ${index + 1}`,
    x: toFiniteNumber(raw?.x, 0),
    y: toFiniteNumber(raw?.y, 0),
    width: toFiniteNumber(raw?.width, 1920, 1, MAX_SURFACE_DIMENSION),
    height: toFiniteNumber(raw?.height, 1080, 1, MAX_SURFACE_DIMENSION),
    color: /^#[0-9a-f]{6}$/i.test(String(raw?.color))
      ? String(raw.color).toLowerCase()
      : COLOR_PALETTE[index % COLOR_PALETTE.length],
    source: normalizeImportSource(raw?.source),
  };
}

export function normalizeSurface(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("surface"),
    name:
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : `Surface ${index + 1}`,
    width: toFiniteNumber(raw?.width, DEFAULT_SURFACE_WIDTH, 1, MAX_SURFACE_DIMENSION),
    height: toFiniteNumber(raw?.height, DEFAULT_SURFACE_HEIGHT, 1, MAX_SURFACE_DIMENSION),
    zones: Array.isArray(raw?.zones) ? raw.zones.map((z, i) => normalizeZone(z, i)) : [],
    source: normalizeImportSource(raw?.source),
    ...(raw?.pattern ? { pattern: normalizePatternSettings(raw.pattern) } : {}),
  };
}

export function normalizeOutputGroup(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("ogroup"),
    name:
      typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Group ${index + 1}`,
    zones: Array.isArray(raw?.zones) ? raw.zones.map((z, i) => normalizeZone(z, i)) : [],
    source: normalizeImportSource(raw?.source),
  };
}

export function normalizeRaster(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("raster"),
    name:
      typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Raster ${index + 1}`,
    width: toFiniteNumber(raw?.width, DEFAULT_SURFACE_WIDTH, 1, MAX_SURFACE_DIMENSION),
    height: toFiniteNumber(raw?.height, DEFAULT_SURFACE_HEIGHT, 1, MAX_SURFACE_DIMENSION),
    groups: Array.isArray(raw?.groups) ? raw.groups.map((g, i) => normalizeOutputGroup(g, i)) : [],
    zones: Array.isArray(raw?.zones) ? raw.zones.map((z, i) => normalizeZone(z, i)) : [],
    source: normalizeImportSource(raw?.source),
    ...(raw?.pattern ? { pattern: normalizePatternSettings(raw.pattern) } : {}),
  };
}

export function normalizeImportSource(raw) {
  const type = raw?.type;
  if ((type === "led" || type === "projector") && typeof raw.id === "string") {
    return { type, id: raw.id };
  }
  return null;
}

export function normalizePatternSettings(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  return {
    scope: r.scope === "zones" ? "zones" : "source",
    type: ["grid", "bars", "gradient", "alignment"].includes(r.type) ? r.type : "grid",
    gridSize: toFiniteNumber(r.gridSize, 100, 8, 4096),
    tileMode: r.tileMode === "led" ? "led" : "custom",
    tileWallId: typeof r.tileWallId === "string" ? r.tileWallId : null,
    tileW: toFiniteNumber(r.tileW, 168, 8, 4096),
    tileH: toFiniteNumber(r.tileH, 168, 8, 4096),
    tileColorA: typeof r.tileColorA === "string" ? r.tileColorA : "#ff0000",
    tileColorB: typeof r.tileColorB === "string" ? r.tileColorB : "#000000",
    showZones: r.showZones !== false,
    showLabels: r.showLabels !== false,
    showCenter: r.showCenter !== false,
  };
}

export function normalizeTestPattern(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  return {
    sourceType: r.sourceType === "raster" ? "raster" : "surface",
    sourceId: typeof r.sourceId === "string" ? r.sourceId : null,
  };
}

export function normalizeZoneLabels(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  return {
    name: r.name !== false,
    resolution: r.resolution !== false,
    anchor: r.anchor === true,
  };
}

export function emptyContentMapsState() {
  return {
    surfaces: [],
    activeSurfaceId: null,
    zoneLabels: normalizeZoneLabels(null),
    rasters: [],
    activeRasterId: null,
    outputLabels: normalizeZoneLabels(null),
    testPattern: normalizeTestPattern(null),
  };
}

export function normalizeContentMapsState(data) {
  if (data == null) return emptyContentMapsState();
  if (typeof data !== "object") {
    throw new Error("The file is missing valid content maps data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);

  // Older saves kept one global pattern config on testPattern; seed sources
  // that don't carry their own settings with it.
  const legacyPattern =
    raw.testPattern && typeof raw.testPattern === "object" && "type" in /** @type {object} */ (raw.testPattern)
      ? raw.testPattern
      : null;
  const withPatternFallback = (item) =>
    item && typeof item === "object" && !/** @type {Record<string, unknown>} */ (item).pattern && legacyPattern
      ? { .../** @type {object} */ (item), pattern: legacyPattern }
      : item;

  const surfaces = Array.isArray(raw.surfaces)
    ? raw.surfaces.map((s, i) => normalizeSurface(withPatternFallback(s), i))
    : [];
  const rasters = Array.isArray(raw.rasters)
    ? raw.rasters.map((r, i) => normalizeRaster(withPatternFallback(r), i))
    : [];
  const activeSurfaceId =
    typeof raw.activeSurfaceId === "string" && surfaces.some((s) => s.id === raw.activeSurfaceId)
      ? raw.activeSurfaceId
      : surfaces[0]?.id ?? null;
  const activeRasterId =
    typeof raw.activeRasterId === "string" && rasters.some((r) => r.id === raw.activeRasterId)
      ? raw.activeRasterId
      : rasters[0]?.id ?? null;

  return {
    surfaces,
    activeSurfaceId,
    zoneLabels: normalizeZoneLabels(raw.zoneLabels),
    rasters,
    activeRasterId,
    outputLabels: normalizeZoneLabels(raw.outputLabels),
    testPattern: normalizeTestPattern(raw.testPattern),
  };
}
