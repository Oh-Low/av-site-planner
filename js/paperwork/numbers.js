/**
 * Round numeric paperwork values for inspector fields and geometry.
 * Default is 2 decimal places (inches / scale), not significant figures.
 *
 * @param {unknown} value
 * @param {number} [digits=2]
 * @returns {number}
 */
export function roundTo(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const places = Math.max(0, Math.min(8, Math.floor(digits)));
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

/**
 * Format a number for an <input type="number"> value attribute.
 * @param {unknown} value
 * @param {number} [digits=2]
 */
export function formatNumberInput(value, digits = 2) {
  return String(roundTo(value, digits));
}
