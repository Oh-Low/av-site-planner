/**
 * Signal-flow domain — persisted graph shape (places are root-level).
 */

/** Default snap grid size (world px). */
export const SIGNAL_FLOW_GRID_DEFAULT_SIZE = 20;
export const SIGNAL_FLOW_GRID_MIN_SIZE = 4;
export const SIGNAL_FLOW_GRID_MAX_SIZE = 400;

/**
 * Measured device chrome from the interactive canvas (optional on nodes).
 * @typedef {{
 *   w: number,
 *   h: number,
 *   inColW: number,
 *   outColW: number,
 *   portTop: number,
 *   portRowH: number,
 * }} NodeLayout
 */

/** @returns {{ snap: boolean, size: number }} */
export function normalizeSignalFlowGrid(raw) {
  const data = /** @type {{ snap?: unknown, size?: unknown } | null | undefined} */ (raw);
  const parsed = Math.round(Number(data?.size));
  const size = Number.isFinite(parsed)
    ? Math.max(SIGNAL_FLOW_GRID_MIN_SIZE, Math.min(SIGNAL_FLOW_GRID_MAX_SIZE, parsed))
    : SIGNAL_FLOW_GRID_DEFAULT_SIZE;
  return { snap: data?.snap !== false, size: size || SIGNAL_FLOW_GRID_DEFAULT_SIZE };
}

/**
 * @param {unknown} raw
 * @returns {NodeLayout | null}
 */
export function normalizeNodeLayout(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  const w = Number(data.w);
  const h = Number(data.h);
  const inColW = Number(data.inColW);
  const outColW = Number(data.outColW);
  const portTop = Number(data.portTop);
  const portRowH = Number(data.portRowH);
  if (
    ![w, h, inColW, outColW, portTop, portRowH].every(
      (n) => Number.isFinite(n) && n >= 0
    )
  ) {
    return null;
  }
  if (w < 1 || h < 1 || portRowH < 1) return null;
  return {
    w,
    h,
    inColW,
    outColW,
    portTop,
    portRowH,
  };
}

/**
 * @param {unknown} raw
 * @returns {object}
 */
function normalizeSignalFlowNode(raw) {
  if (!raw || typeof raw !== "object") return raw;
  const node = /** @type {Record<string, unknown>} */ (raw);
  const layout = normalizeNodeLayout(node.layout);
  if (layout) return { ...node, layout };
  if (node.layout !== undefined) {
    const { layout: _drop, ...rest } = node;
    return rest;
  }
  return node;
}

/** @returns {object} */
export function emptySignalFlowState() {
  return {
    nodes: [],
    connections: [],
    customGearTypes: [],
    gearLibraryFolders: [],
    colorByCableType: false,
    grid: { snap: true, size: SIGNAL_FLOW_GRID_DEFAULT_SIZE },
  };
}

/**
 * @param {unknown} data
 * @returns {object}
 */
export function normalizeSignalFlowState(data) {
  if (data == null) return emptySignalFlowState();
  if (typeof data !== "object" || !Array.isArray(/** @type {Record<string, unknown>} */ (data).nodes)) {
    throw new Error("The file is missing valid signal flow data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  return {
    nodes: raw.nodes.map((node) => normalizeSignalFlowNode(node)),
    connections: Array.isArray(raw.connections) ? raw.connections : [],
    customGearTypes: Array.isArray(raw.customGearTypes)
      ? raw.customGearTypes.filter((g) => g?.kind !== "blank")
      : [],
    gearLibraryFolders: Array.isArray(raw.gearLibraryFolders) ? raw.gearLibraryFolders : [],
    colorByCableType: Boolean(raw.colorByCableType),
    grid: normalizeSignalFlowGrid(raw.grid),
  };
}
