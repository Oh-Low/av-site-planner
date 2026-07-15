/** @param {number} n @param {number} min @param {number} max */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** @param {number} value @param {"ft" | "m"} fromUnit @param {"ft" | "m"} toUnit */
export function convertLinearDistance(value, fromUnit, toUnit) {
  const n = Number(value);
  if (!Number.isFinite(n) || fromUnit === toUnit) return n;
  const mPerFt = 0.3048;
  const converted = fromUnit === "ft" ? n * mPerFt : n / mPerFt;
  return Math.round(converted * 100) / 100;
}

/** @typedef {'match' | 'gap' | 'too-wide' | 'too-long'} LensSuggestionStatus */
/** @typedef {{ lens: { id: string, name: string, throwMin: number, throwMax: number }, status: LensSuggestionStatus }} LensSuggestion */

/**
 * Pick the best lens for a required throw ratio from a projector's inventory.
 * @param {Array<{ id: string, name: string, throwMin: number, throwMax: number }>} lenses
 * @param {number} requiredRatio
 * @returns {LensSuggestion}
 */
export function suggestLens(lenses, requiredRatio) {
  const sorted = [...lenses].sort((a, b) => a.throwMin - b.throwMin);
  if (!sorted.length) {
    return { lens: { id: "", name: "—", throwMin: 1, throwMax: 1 }, status: "too-wide" };
  }
  if (requiredRatio <= 0) {
    return { lens: sorted[0], status: "match" };
  }

  const matching = sorted.filter(
    (l) => requiredRatio >= l.throwMin - 1e-6 && requiredRatio <= l.throwMax + 1e-6
  );
  if (matching.length) {
    matching.sort((a, b) => a.throwMax - a.throwMin - (b.throwMax - b.throwMin));
    return { lens: matching[0], status: "match" };
  }

  const minThrowMin = sorted[0].throwMin;
  const maxThrowMax = sorted[sorted.length - 1].throwMax;

  if (requiredRatio < minThrowMin) {
    return { lens: sorted[0], status: "too-wide" };
  }

  if (requiredRatio > maxThrowMax) {
    return { lens: sorted[sorted.length - 1], status: "too-long" };
  }

  const below = sorted.filter((l) => l.throwMax < requiredRatio);
  return { lens: below[below.length - 1], status: "gap" };
}

/** @param {number} throwMin @param {number} throwMax @param {number} lensZoom */
export function interpolateThrowRatio(throwMin, throwMax, lensZoom) {
  const min = Math.min(throwMin, throwMax);
  const max = Math.max(throwMin, throwMax);
  const t = clamp(Number(lensZoom) || 0.5, 0, 1);
  return min + (max - min) * t;
}

/** @param {number} dist @param {number} ratio */
export function imageWidthFromDistanceAndRatio(dist, ratio) {
  if (ratio <= 0) return 0;
  return dist / ratio;
}

/** @param {number} imageWidth @param {number} ratio */
export function throwDistanceFromImageWidthAndRatio(imageWidth, ratio) {
  return imageWidth * ratio;
}

/**
 * @param {{
 *   throwMin: number,
 *   throwMax: number,
 *   ratio: number,
 *   dist: number,
 *   imageWidth: number,
 * }} params
 */
export function throwInRangeFromSpecs({ throwMin, throwMax, ratio, dist, imageWidth }) {
  if (imageWidth <= 0 || dist <= 0) {
    return { ok: false, minDist: 0, maxDist: 0 };
  }
  const ratioOk = ratio >= throwMin - 1e-6 && ratio <= throwMax + 1e-6;
  const minDist = imageWidth * throwMin;
  const maxDist = imageWidth * throwMax;
  const distOk = dist >= minDist - 0.01 && dist <= maxDist + 0.01;
  return { ok: ratioOk && distOk, minDist, maxDist };
}

/** @typedef {"throw" | "image" | "zoom"} ThrowLockField */

/** @param {ThrowLockField[]} locks @param {ThrowLockField} edited */
export function getRecalcFields(locks, edited) {
  const locked = new Set(locks);
  const fields = /** @type {ThrowLockField[]} */ (["throw", "image", "zoom"]);
  const unlocked = fields.filter((f) => !locked.has(f));

  if (unlocked.length === 0) return [];
  if (unlocked.length === 1) return unlocked;
  if (unlocked.length === 2) return unlocked.filter((f) => f !== edited);
  return edited === "zoom" ? ["image"] : ["zoom"];
}

/** @param {ThrowLockField[]} locks @param {ThrowLockField} field */
export function isThrowFieldComputed(locks, field) {
  const lockSet = new Set(locks);
  const unlocked = /** @type {ThrowLockField[]} */ (["throw", "image", "zoom"]).filter((f) => !lockSet.has(f));
  if (unlocked.length === 0) return true;
  if (lockSet.size < 2) return false;
  return unlocked.length === 1 && unlocked[0] === field;
}
