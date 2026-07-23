function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** @typedef {{ id: string, name: string, throwMin: number, throwMax: number }} LensPreset */

/** @typedef {{ id: string, name: string, manufacturer: string, resolutionW: number, resolutionH: number, lumens: number, lenses: LensPreset[] }} ProjectorPreset */

export const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9", w: 16, h: 9 },
  { id: "16:10", label: "16:10", w: 16, h: 10 },
  { id: "4:3", label: "4:3", w: 4, h: 3 },
  { id: "2.35:1", label: "2.35:1", w: 2.35, h: 1 },
  { id: "custom", label: "Custom", w: 0, h: 0 },
];

/** Distinct colors for projector coverage zones on the canvas */
export const PROJECTOR_COLORS = [
  "#3b82f6",
  "#22d3ee",
  "#a78bfa",
  "#f59e0b",
  "#22c55e",
  "#f472b6",
  "#fb7185",
  "#94a3b8",
];

/**
 * Starter projector inventory — replace or extend when real inventory data is available.
 * Throw ratios are width × ratio = throw distance (same convention as major manufacturers).
 * @type {ProjectorPreset[]}
 */
export const PREBUILT_PROJECTORS = [
  {
    id: slugify("Barco UDX-4K22"),
    name: "Barco UDX-4K22",
    manufacturer: "Barco",
    resolutionW: 3840,
    resolutionH: 2400,
    lumens: 22000,
    lenses: [
      { id: "0.67-0.85", name: "0.67–0.85:1 zoom", throwMin: 0.67, throwMax: 0.85 },
      { id: "1.0-1.5", name: "1.0–1.5:1 zoom", throwMin: 1.0, throwMax: 1.5 },
      { id: "1.6-2.0", name: "1.6–2.0:1 zoom", throwMin: 1.6, throwMax: 2.0 },
    ],
  },
  {
    id: slugify("Christie DHD1050-GS"),
    name: "Christie DHD1050-GS",
    manufacturer: "Christie",
    resolutionW: 1920,
    resolutionH: 1080,
    lumens: 10400,
    lenses: [
      { id: "0.84-1.02", name: "0.84–1.02:1 zoom", throwMin: 0.84, throwMax: 1.02 },
      { id: "1.2-1.6", name: "1.2–1.6:1 zoom", throwMin: 1.2, throwMax: 1.6 },
      { id: "1.8-2.6", name: "1.8–2.6:1 zoom", throwMin: 1.8, throwMax: 2.6 },
    ],
  },
  {
    id: slugify("Panasonic PT-RZ21K"),
    name: "Panasonic PT-RZ21K",
    manufacturer: "Panasonic",
    resolutionW: 1920,
    resolutionH: 1200,
    lumens: 20000,
    lenses: [
      { id: "0.96-1.2", name: "0.96–1.2:1 zoom", throwMin: 0.96, throwMax: 1.2 },
      { id: "1.4-2.1", name: "1.4–2.1:1 zoom", throwMin: 1.4, throwMax: 2.1 },
      { id: "2.4-4.1", name: "2.4–4.1:1 zoom", throwMin: 2.4, throwMax: 4.1 },
    ],
  },
  {
    id: slugify("Epson PowerLite L735U"),
    name: "Epson PowerLite L735U",
    manufacturer: "Epson",
    resolutionW: 1920,
    resolutionH: 1200,
    lumens: 7000,
    lenses: [
      { id: "1.35-2.2", name: "1.35–2.2:1 zoom", throwMin: 1.35, throwMax: 2.2 },
    ],
  },
  {
    id: slugify("Sony VPL-FHZ131L"),
    name: "Sony VPL-FHZ131L",
    manufacturer: "Sony",
    resolutionW: 1920,
    resolutionH: 1200,
    lumens: 13000,
    lenses: [
      { id: "1.3-2.0", name: "1.3–2.0:1 zoom", throwMin: 1.3, throwMax: 2.0 },
      { id: "2.0-3.0", name: "2.0–3.0:1 zoom", throwMin: 2.0, throwMax: 3.0 },
    ],
  },
  {
    id: slugify("Digital Projection Titan 4K Flex"),
    name: "Digital Projection Titan 4K Flex",
    manufacturer: "Digital Projection",
    resolutionW: 4096,
    resolutionH: 2160,
    lumens: 15000,
    lenses: [
      { id: "0.8-1.0", name: "0.8–1.0:1 zoom", throwMin: 0.8, throwMax: 1.0 },
      { id: "1.2-1.6", name: "1.2–1.6:1 zoom", throwMin: 1.2, throwMax: 1.6 },
      { id: "2.0-3.0", name: "2.0–3.0:1 zoom", throwMin: 2.0, throwMax: 3.0 },
    ],
  },
  {
    id: slugify("BenQ LU9915"),
    name: "BenQ LU9915",
    manufacturer: "BenQ",
    resolutionW: 1920,
    resolutionH: 1200,
    lumens: 10000,
    lenses: [
      { id: "1.1-1.7", name: "1.1–1.7:1 zoom", throwMin: 1.1, throwMax: 1.7 },
    ],
  },
];

export const PROJECTOR_ASPECT_RATIOS = [
  { id: "16:9", label: "16:9", w: 16, h: 9 },
  { id: "16:10", label: "16:10", w: 16, h: 10 },
];

/** @param {number} resW @param {number} resH @returns {"16:9" | "16:10"} */
export function inferProjectorAspectId(resW, resH) {
  const w = resW > 0 ? resW : 1920;
  const h = resH > 0 ? resH : 1080;
  const ratio = h / w;
  return Math.abs(ratio - 10 / 16) < Math.abs(ratio - 9 / 16) ? "16:10" : "16:9";
}

export const DEFAULT_PROJECTOR_ASPECT_ID = "16:9";

/** Resolution tiers offered for prebuilt projectors. Heights follow the selected aspect. */
export const PROJECTOR_RESOLUTION_TIERS = [
  { id: "hd", w: 1920 },
  { id: "uhd", w: 3840 },
];

export const DEFAULT_PROJECTOR_RESOLUTION_ID = "hd";

/** @typedef {{ id: string, label: string, w: number, h: number }} ProjectorResolutionOption */

/**
 * Resolution options for an aspect: 1920×1080 / 3840×2160 for 16:9,
 * 1920×1200 / 3840×2400 for 16:10.
 * @param {string} aspectId
 * @returns {ProjectorResolutionOption[]}
 */
export function projectorResolutionOptions(aspectId) {
  const aspect =
    PROJECTOR_ASPECT_RATIOS.find((a) => a.id === aspectId) ?? PROJECTOR_ASPECT_RATIOS[0];
  return PROJECTOR_RESOLUTION_TIERS.map((tier) => {
    const h = Math.round((tier.w * aspect.h) / aspect.w);
    return { id: tier.id, label: `${tier.w} × ${h}`, w: tier.w, h };
  });
}

/** @param {ProjectorPreset} _preset @returns {"16:9" | "16:10"} */
export function defaultProjectorAspectForPreset(_preset) {
  return DEFAULT_PROJECTOR_ASPECT_ID;
}

export const PROJECTOR_ROLES = [
  { id: "single", label: "Single" },
  { id: "blend", label: "Blend" },
  { id: "tile", label: "Tile" },
  { id: "stack", label: "Stack" },
];

/** @returns {string[]} */
export function getProjectorManufacturers() {
  return [...new Set(PREBUILT_PROJECTORS.map((p) => p.manufacturer))].sort();
}

/** @param {string} manufacturer @returns {ProjectorPreset[]} */
export function getProjectorModelsForManufacturer(manufacturer) {
  return PREBUILT_PROJECTORS.filter((p) => p.manufacturer === manufacturer);
}
