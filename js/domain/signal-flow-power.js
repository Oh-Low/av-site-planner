/**
 * Signal Flow power mode — dual display tables and power-wire helpers (pure).
 *
 * Each device keeps one stored port layout. Display remaps that layout into
 * two same-height tables whose row count is max(power side, signal side):
 *   - Signal/Gear: signal ports packed from the top; remaining cells → "—"
 *   - Power: power ports packed from the top (+ synthetic Edison Power In when
 *     needed); remaining cells → "—"
 */

import {
  isPowerConnection,
  isPowerConnectorType,
  normalizePortRow,
} from "../signal-flow-gear-schema.js";

/** @typedef {import("../signal-flow-gear-schema.js").GearType} GearType */
/** @typedef {import("../signal-flow-gear-schema.js").GearPortRow} GearPortRow */

/**
 * Row indexes of power-typed input cells on a gear.
 * @param {GearPortRow[] | null | undefined} ports
 * @returns {number[]}
 */
export function listPowerInputRows(ports) {
  /** @type {number[]} */
  const rows = [];
  (ports ?? []).forEach((port, index) => {
    if (!port || port.input === "—" || !isPowerConnectorType(port.inputType)) return;
    rows.push(index);
  });
  return rows;
}

/**
 * True when the gear has at least one non-power (signal) port cell.
 * @param {GearPortRow[] | null | undefined} ports
 */
export function gearHasSignalPorts(ports) {
  return (ports ?? []).some((port) => {
    if (!port) return false;
    const inSignal =
      port.input &&
      port.input !== "—" &&
      !isPowerConnectorType(port.inputType);
    const outSignal =
      port.output &&
      port.output !== "—" &&
      !isPowerConnectorType(port.outputType);
    return Boolean(inSignal || outSignal);
  });
}

/**
 * Whether this gear should get a display-time synthetic Edison Power In.
 * Pure power sources (outlets / breakouts with only power outs) do not.
 * @param {Pick<GearType, "ports" | "domain"> | null | undefined} gear
 */
export function needsSyntheticPowerIn(gear) {
  if (!gear) return false;
  if (listPowerInputRows(gear.ports).length > 0) return false;
  // Power-domain sources with no signal side: no synthetic inlet.
  if (gear.domain === "power" && !gearHasSignalPorts(gear.ports)) return false;
  // Signal gear (or empty) always gets a Power In so every device can be fed.
  return true;
}

/**
 * Collect labeled cells from one column that match (or exclude) power types.
 * @param {GearPortRow[]} ports
 * @param {"input" | "output"} col
 * @param {boolean} keepPower
 * @returns {{ label: string, type: string | null }[]}
 */
function collectColumnCells(ports, col, keepPower) {
  /** @type {{ label: string, type: string | null }[]} */
  const cells = [];
  for (const port of ports) {
    const label = col === "input" ? port.input : port.output;
    const type = col === "input" ? port.inputType : port.outputType;
    if (!label || label === "—") continue;
    const isPower = isPowerConnectorType(type);
    if (keepPower ? !isPower : isPower) continue;
    cells.push({ label, type: type ?? null });
  }
  return cells;
}

/**
 * Shared display height for both mode tables: whichever domain needs more rows.
 * @param {GearType} gear
 * @param {number} powerInputCount  already includes synthetic Power In when needed
 */
function sharedDisplayRowCount(gear, powerInputCount) {
  const basePorts = gear.ports ?? [];
  const powerOut = collectColumnCells(basePorts, "output", true).length;
  const signalIn = collectColumnCells(basePorts, "input", false).length;
  const signalOut = collectColumnCells(basePorts, "output", false).length;
  return Math.max(powerInputCount, powerOut, signalIn, signalOut, 1);
}

/**
 * Rebuild ports with one domain packed from the top and the other cleared.
 * @param {GearType} gear
 * @param {boolean} keepPower
 * @param {{ label: string, type: string }[] | null} [extraInputs]
 * @returns {GearType}
 */
function remapPortsForDomain(gear, keepPower, extraInputs = null) {
  const basePorts = gear.ports ?? [];
  const powerInputs = [
    ...(extraInputs ?? []),
    ...collectColumnCells(basePorts, "input", true),
  ];
  const powerOutputs = collectColumnCells(basePorts, "output", true);
  const signalInputs = collectColumnCells(basePorts, "input", false);
  const signalOutputs = collectColumnCells(basePorts, "output", false);

  const inputs = keepPower ? powerInputs : signalInputs;
  const outputs = keepPower ? powerOutputs : signalOutputs;

  // Pure power sources in signal mode: leave the table alone (shown muted).
  if (!keepPower && signalInputs.length === 0 && signalOutputs.length === 0) {
    return gear;
  }

  const rowCount = sharedDisplayRowCount(gear, powerInputs.length);
  /** @type {GearPortRow[]} */
  const ports = [];
  for (let i = 0; i < rowCount; i += 1) {
    const inn = inputs[i];
    const out = outputs[i];
    ports.push(
      normalizePortRow({
        input: inn ? inn.label : "—",
        output: out ? out.label : "—",
        inputType: inn ? inn.type : null,
        outputType: out ? out.type : null,
      })
    );
  }
  return { ...gear, ports };
}

/**
 * Power-mode table: signal labels cleared, power packed from the top.
 * Adds a single top-left Power In when the gear has none (except pure sources).
 * @param {GearType} gear
 * @returns {GearType}
 */
export function gearForPowerMode(gear) {
  const extra =
    listPowerInputRows(gear.ports).length === 0 && needsSyntheticPowerIn(gear)
      ? [{ label: "Power In", type: "Edison" }]
      : null;
  return remapPortsForDomain(gear, true, extra);
}

/**
 * Signal/Gear-mode table: power labels cleared, signal packed from the top.
 * Row count matches Power mode (includes synthetic Power In in the shared budget).
 * @param {GearType} gear
 * @returns {GearType}
 */
export function gearForSignalMode(gear) {
  const extra =
    listPowerInputRows(gear.ports).length === 0 && needsSyntheticPowerIn(gear)
      ? [{ label: "Power In", type: "Edison" }]
      : null;
  return remapPortsForDomain(gear, false, extra);
}

/**
 * True when every power-typed input on the node has ≥1 inbound power wire.
 * Nodes with no power inputs are never considered powered.
 * @param {GearPortRow[] | null | undefined} ports
 * @param {{ toNodeId?: string, toRow?: number, toCol?: string, power?: boolean, fromCol?: string }[]} connections
 * @param {string} nodeId
 */
export function allPowerInputsConnected(ports, connections, nodeId) {
  const rows = listPowerInputRows(ports);
  if (rows.length === 0) return false;
  return rows.every((row) =>
    connections.some(
      (c) =>
        c.toNodeId === nodeId &&
        c.toCol === "input" &&
        Number(c.toRow) === row &&
        isPowerConnection(c)
    )
  );
}

/**
 * Retarget legacy `toCol: "power"` edges onto the first power input row.
 * @param {{ id: string }[]} nodes
 * @param {object[]} connections
 * @param {(node: { id: string }) => GearType} getGear
 * @returns {object[]}
 */
export function migrateLegacyPowerInletConnections(nodes, connections, getGear) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return (connections ?? []).map((raw) => {
    const conn = /** @type {Record<string, unknown>} */ ({ ...raw });
    if (conn.toCol !== "power") return raw;
    const node = nodeById.get(String(conn.toNodeId ?? ""));
    if (!node) {
      return { ...conn, toCol: "input", toRow: 0, power: true };
    }
    const gear = gearForPowerMode(getGear(node));
    const rows = listPowerInputRows(gear.ports);
    return {
      ...conn,
      toCol: "input",
      toRow: rows[0] ?? 0,
      power: true,
    };
  });
}

/**
 * True when a gear type is Power-palette-only (hidden on the signal canvas).
 * @param {{ domain?: string, id?: string } | null | undefined} gear
 */
export function isPowerDomainGear(gear) {
  if (!gear) return false;
  if (gear.domain === "power") return true;
  // Belt-and-suspenders: power catalog ids are always `power-*`.
  return typeof gear.id === "string" && gear.id.startsWith("power-");
}

/**
 * True when a placed node is power-only gear (hidden in Gear / Places / paperwork).
 * @param {{ typeId?: string, gearOverride?: { domain?: string, id?: string } | null }} node
 * @param {{ domain?: string, id?: string } | null | undefined} [gear]
 */
export function isPowerDomainNode(node, gear) {
  if (typeof node?.typeId === "string" && node.typeId.startsWith("power-")) return true;
  if (gear) return isPowerDomainGear(gear);
  if (node?.gearOverride) return isPowerDomainGear(node.gearOverride);
  return false;
}

/**
 * World position for the active canvas mode.
 * Power falls back to signal x/y until a power layout is stored.
 * @param {{ x?: number, y?: number, powerX?: number, powerY?: number }} node
 * @param {"signal" | "power"} mode
 * @returns {{ x: number, y: number }}
 */
export function nodeWorldPosition(node, mode) {
  if (mode === "power") {
    const px = Number(node.powerX);
    const py = Number(node.powerY);
    if (Number.isFinite(px) && Number.isFinite(py)) return { x: px, y: py };
  }
  return { x: Number(node.x) || 0, y: Number(node.y) || 0 };
}

/**
 * Write world position for one canvas mode.
 * @param {{ x?: number, y?: number, powerX?: number, powerY?: number }} node
 * @param {number} x
 * @param {number} y
 * @param {"signal" | "power"} mode
 */
export function setNodeWorldPosition(node, x, y, mode) {
  if (mode === "power") {
    node.powerX = x;
    node.powerY = y;
  } else {
    node.x = x;
    node.y = y;
  }
}

/**
 * Copy signal x/y into powerX/powerY when power layout is missing.
 * Used when placing new signal gear so Power mode starts at the same spot.
 * @param {{ x?: number, y?: number, powerX?: number, powerY?: number }} node
 */
export function seedPowerPositionFromSignal(node) {
  const px = Number(node.powerX);
  const py = Number(node.powerY);
  if (Number.isFinite(px) && Number.isFinite(py)) return;
  node.powerX = Number(node.x) || 0;
  node.powerY = Number(node.y) || 0;
}
