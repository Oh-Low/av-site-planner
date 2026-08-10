/**
 * LED wall domain — .AVP section normalize / empty shape.
 */

/**
 * @typedef {{
 *   processorType?: string,
 *   wiringType?: string,
 *   pixelWidth?: number,
 *   pixelHeight?: number,
 *   totalPixels?: number,
 *   maxPerPort?: number,
 *   metricWidth?: number,
 *   metricHeight?: number,
 *   weight?: number,
 *   wattage?: number,
 *   id?: string,
 * }} LedTile
 *
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   tiles?: number[],
 *   startLabel?: string,
 *   endLabel?: string,
 *   startLabelDraft?: string,
 *   endLabelDraft?: string,
 *   processorId?: string | null,
 * }} LedLineSet
 *
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   tile?: LedTile,
 *   rows?: number,
 *   cols?: number,
 *   generated?: boolean,
 *   generatedRows?: number,
 *   generatedCols?: number,
 *   dataLines?: LedLineSet[],
 *   powerLines?: LedLineSet[],
 *   processors?: { id?: string, name?: string, color?: string }[],
 *   activeProcessorId?: string | null,
 *   activeLineType?: string,
 *   activeLineId?: string | null,
 *   view?: object | null,
 * }} LedWallGrid
 *
 * @typedef {{
 *   grids: LedWallGrid[],
 *   activeGridId: string | null,
 *   voltage: 120 | 208,
 *   bitrate: 8 | 10 | 12,
 * }} LedState
 */

/** @returns {LedState} */
export function emptyLedState() {
  return { grids: [], activeGridId: null, voltage: 120, bitrate: 8 };
}

/**
 * Backfill fields added after older saves (processors, line.processorId).
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {LedWallGrid}
 */
export function normalizeLedGrid(raw, index = 0) {
  const grid = /** @type {LedWallGrid} */ (
    raw && typeof raw === "object" ? { .../** @type {object} */ (raw) } : {}
  );
  if (typeof grid.id !== "string" || !grid.id) {
    grid.id = `grid-${index + 1}`;
  }
  if (typeof grid.name !== "string" || !grid.name.trim()) {
    grid.name = `Wall ${index + 1}`;
  }
  if (!grid.tile || typeof grid.tile !== "object") {
    grid.tile = {};
  }
  if (!Array.isArray(grid.dataLines)) grid.dataLines = [];
  if (!Array.isArray(grid.powerLines)) grid.powerLines = [];
  if (!Array.isArray(grid.processors)) grid.processors = [];
  if (grid.activeProcessorId === undefined) grid.activeProcessorId = null;
  for (const line of grid.dataLines) {
    if (line && typeof line === "object" && line.processorId === undefined) {
      line.processorId = null;
    }
  }
  if (!Array.isArray(grid.powerLines)) grid.powerLines = [];
  return grid;
}

/**
 * @param {unknown} data
 * @returns {LedState}
 */
export function normalizeLedState(data) {
  if (!data || typeof data !== "object" || !Array.isArray(/** @type {Record<string, unknown>} */ (data).grids)) {
    throw new Error("The file is missing LED calculator data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const grids = raw.grids.map((grid, index) => normalizeLedGrid(grid, index));
  const activeGridId =
    typeof raw.activeGridId === "string" && grids.some((g) => g.id === raw.activeGridId)
      ? raw.activeGridId
      : grids[0]?.id ?? null;
  /** @type {120 | 208} */
  const voltage = raw.voltage === 208 ? 208 : 120;
  /** @type {8 | 10 | 12} */
  const bitrate = raw.bitrate === 10 || raw.bitrate === 12 ? raw.bitrate : 8;
  return { grids, activeGridId, voltage, bitrate };
}
