/** @typedef {"metric" | "imperial"} DistanceUnit */

const METERS_PER_FOOT = 0.3048;
const METERS_PER_INCH = 0.0254;

/** @param {number} feet @param {number} inches */
export function imperialToMeters(feet, inches) {
  return feet * METERS_PER_FOOT + inches * METERS_PER_INCH;
}

/** @param {number} meters */
export function metersToImperial(meters) {
  const totalInches = meters / METERS_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return { feet, inches };
}

/** @param {number} meters @param {DistanceUnit} unit */
export function formatDistance(meters, unit) {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (unit === "imperial") {
    const { feet, inches } = metersToImperial(meters);
    if (feet === 0) return `${inches.toFixed(1)}"`;
    return `${feet}' ${inches.toFixed(1)}"`;
  }
  if (meters >= 100) return `${meters.toFixed(1)} m`;
  return `${meters.toFixed(2)} m`;
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
export function pixelDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * @param {{ x: number, y: number, heightMeters?: number | null }[]} points
 * @param {number | null} metersPerPixel
 */
export function routeLengthMeters(points, metersPerPixel) {
  const plan = polylineLengthMeters(points, metersPerPixel);
  if (plan == null) return null;
  let vertical = 0;
  for (const p of points) {
    if (typeof p.heightMeters === "number" && Number.isFinite(p.heightMeters)) {
      vertical += Math.abs(p.heightMeters);
    }
  }
  return plan + vertical;
}

/** @param {number} heightMeters @param {DistanceUnit} unit */
export function formatHeightOffset(heightMeters, unit) {
  if (!Number.isFinite(heightMeters) || heightMeters === 0) return null;
  const sign = heightMeters > 0 ? "+" : "-";
  const abs = Math.abs(heightMeters);
  if (unit === "imperial") {
    const feet = abs / METERS_PER_FOOT;
    const label = feet >= 10 ? feet.toFixed(0) : feet.toFixed(1).replace(/\.0$/, "");
    return `${sign}${label}`;
  }
  const label = abs >= 10 ? abs.toFixed(1) : abs.toFixed(2).replace(/\.?0+$/, "");
  return `${sign}${label}`;
}

/** @param {number | null | undefined} heightMeters @param {DistanceUnit} unit */
export function heightMetersToInputValue(heightMeters, unit) {
  if (!Number.isFinite(heightMeters) || heightMeters === 0) return "";
  const n = unit === "imperial" ? heightMeters / METERS_PER_FOOT : heightMeters;
  const rounded = Math.round(n * 100) / 100;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

/** @param {string} raw @param {DistanceUnit} unit */
export function parseHeightInput(raw, unit) {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return unit === "imperial" ? n * METERS_PER_FOOT : n;
}

/**
 * @param {{ x: number, y: number }[]} points
 * @param {number | null} metersPerPixel
 */
export function polylineLengthMeters(points, metersPerPixel) {
  if (!metersPerPixel || points.length < 2) return null;
  let px = 0;
  for (let i = 1; i < points.length; i += 1) {
    px += pixelDistance(points[i - 1], points[i]);
  }
  return px * metersPerPixel;
}

/**
 * @param {{ pointA: { x: number, y: number } | null, pointB: { x: number, y: number } | null, distanceMeters: number | null }} scale
 */
export function getMetersPerPixel(scale) {
  if (!scale.pointA || !scale.pointB || !scale.distanceMeters || scale.distanceMeters <= 0) {
    return null;
  }
  const px = pixelDistance(scale.pointA, scale.pointB);
  if (px < 1) return null;
  return scale.distanceMeters / px;
}
