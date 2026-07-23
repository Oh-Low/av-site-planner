/**
 * Manual double-click detection for UIs where native `dblclick` is unreliable
 * (HTML5 drag, pointer capture, DOM rebuild on first click, etc.).
 *
 * @param {{
 *   windowMs?: number,
 *   maxDistancePx?: number,
 * }} [options]
 */
export function createDoubleClickTracker(options = {}) {
  const windowMs = Math.max(50, Number(options.windowMs) || 450);
  const maxDistancePx = Math.max(1, Number(options.maxDistancePx) || 8);

  /** @type {{ key: string, time: number, x: number, y: number } | null} */
  let last = null;

  function reset() {
    last = null;
  }

  /**
   * Record a tap and return whether it completes a double-click on `key`.
   * @param {string} key Stable id for the clicked target
   * @param {{ clientX: number, clientY: number, timeStamp?: number }} point
   * @returns {boolean}
   */
  function tap(key, point) {
    const id = String(key ?? "");
    if (!id) {
      reset();
      return false;
    }
    const now =
      typeof point.timeStamp === "number" && point.timeStamp > 0
        ? point.timeStamp
        : performance.now();
    const x = Number(point.clientX) || 0;
    const y = Number(point.clientY) || 0;
    const isDouble =
      Boolean(last) &&
      last.key === id &&
      now - last.time <= windowMs &&
      Math.hypot(x - last.x, y - last.y) <= maxDistancePx;
    if (isDouble) {
      reset();
      return true;
    }
    last = { key: id, time: now, x, y };
    return false;
  }

  return { tap, reset };
}
