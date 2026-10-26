/**
 * Power allocation rows for paperwork — loads fed by Signal Flow power wires.
 * Calculator state (overrides, hide, search) lives in the same module.
 */

import { uid } from "../shared/id.js";
import { isPowerConnection } from "../signal-flow-gear-schema.js";
import {
  gearForPowerMode,
  isPowerDomainGear,
  isPowerDomainNode,
} from "./signal-flow-power.js";

/**
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   typeId?: string,
 *   gearOverride?: object | null,
 *   ledWallId?: string | null,
 * }} PowerAllocationNode
 *
 * @typedef {{
 *   fromNodeId?: string,
 *   fromRow?: number,
 *   fromCol?: string,
 *   toNodeId?: string,
 *   toRow?: number,
 *   toCol?: string,
 *   power?: boolean,
 * }} PowerAllocationConnection
 *
 * @typedef {{
 *   device: string,
 *   distro: string,
 *   phase: "" | "X" | "Y" | "Z" | "XY" | "XZ" | "ZY",
 *   voltage: number | null,
 *   wattage: number | null,
 *   amperage: number | null,
 *   nodeId?: string,
 *   kind?: "header" | "item",
 *   level?: "section" | "subsection" | null,
 *   keyPart?: string,
 * }} PowerAllocationRow
 *
 * @typedef {{
 *   nodes?: PowerAllocationNode[],
 *   connections?: PowerAllocationConnection[],
 *   customGearTypes?: object[],
 * }} PowerAllocationSignalFlow
 */

const PHASES = /** @type {const} */ (["X", "Y", "Z"]);
const PAIR_PHASES = /** @type {const} */ (["XY", "XZ", "ZY"]);

/** @typedef {"" | "X" | "Y" | "Z" | "XY" | "XZ" | "ZY"} PowerAllocationPhase */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 208V is line-to-line, so the load sits on two legs.
 * @param {number | null | undefined} voltage
 */
export function isTwoLegVoltage(voltage) {
  return Number(voltage) === 208;
}

/**
 * Phase choices for a row. 208V uses leg pairs; other voltages use one leg.
 * @param {number | null | undefined} voltage
 * @returns {Array<"X" | "Y" | "Z" | "XY" | "XZ" | "ZY">}
 */
export function phasesForVoltage(voltage) {
  return isTwoLegVoltage(voltage) ? [...PAIR_PHASES] : [...PHASES];
}

/**
 * Hover shortcut: 1, 2, and 3 pick the first, second, and third phase choice.
 * 120V is X, Y, Z. 208V is XY, XZ, ZY.
 * @param {number | null | undefined} voltage
 * @param {string} key
 * @returns {PowerAllocationPhase | null}
 */
export function phaseForNumberKey(voltage, key) {
  if (key !== "1" && key !== "2" && key !== "3") return null;
  return phasesForVoltage(voltage)[Number(key) - 1] ?? null;
}

/**
 * Legs that carry this phase assignment. A pair counts on both legs.
 * @param {PowerAllocationPhase | string | null | undefined} phase
 * @returns {Array<"X" | "Y" | "Z">}
 */
export function phaseLegs(phase) {
  const text = normalizePhase(phase);
  if (text === "XY") return ["X", "Y"];
  if (text === "XZ") return ["X", "Z"];
  if (text === "ZY") return ["Z", "Y"];
  if (text === "X" || text === "Y" || text === "Z") return [text];
  return [];
}

/**
 * @param {string | null | undefined} label
 * @returns {PowerAllocationPhase}
 */
export function phaseFromPortLabel(label) {
  const text = String(label ?? "");
  const xyzPair = text.match(/\b([XYZ])\s*[-/&]?\s*([XYZ])\b/i);
  if (xyzPair) {
    const pair = normalizePhase(`${xyzPair[1]}${xyzPair[2]}`);
    if (pair.length === 2) return pair;
  }
  const lPair = text.match(/\bL([123])\s*[-/&]?\s*L([123])\b/i);
  if (lPair) {
    const pair = normalizePhase(
      `${PHASES[Number(lPair[1]) - 1] ?? ""}${PHASES[Number(lPair[2]) - 1] ?? ""}`
    );
    if (pair.length === 2) return pair;
  }
  const xyz = text.match(/\b([XYZ])\b/i);
  if (xyz) return /** @type {"X" | "Y" | "Z"} */ (xyz[1].toUpperCase());
  const lPhase = text.match(/\bL([123])\b/i);
  if (lPhase) {
    const idx = Number(lPhase[1]) - 1;
    return PHASES[idx] ?? "";
  }
  return "";
}

/**
 * @param {string | null | undefined} label
 * @param {string | null | undefined} connectorType
 * @returns {number | null}
 */
export function voltageFromPortLabel(label, connectorType) {
  const text = `${label ?? ""} ${connectorType ?? ""}`;
  const match = text.match(/\b(277|240|208|120)\s*v?\b/i);
  if (match) return Number(match[1]);
  const type = String(connectorType ?? "").toLowerCase();
  if (type.includes("edison") || type.includes("true1") || type.includes("powercon")) {
    return 120;
  }
  if (type.includes("camlock")) return 208;
  return null;
}

/**
 * @param {string | null | undefined} note
 * @returns {number | null}
 */
export function wattageFromNote(note) {
  if (typeof note !== "string" || !note.trim()) return null;
  const match = note.match(/(\d+(?:\.\d+)?)\s*w(?:att(?:s)?)?\b/i);
  return match ? positiveNumber(match[1]) : null;
}

/**
 * @param {number | null | undefined} wattage
 * @param {number | null | undefined} voltage
 * @returns {number | null}
 */
export function amperageFromWattage(wattage, voltage) {
  const w = positiveNumber(wattage);
  const v = positiveNumber(voltage);
  if (w == null || v == null) return null;
  return w / v;
}

/**
 * @param {number | null | undefined} amperage
 * @param {number | null | undefined} voltage
 * @returns {number | null}
 */
export function wattageFromAmperage(amperage, voltage) {
  const a = positiveNumber(amperage);
  const v = positiveNumber(voltage);
  if (a == null || v == null) return null;
  return a * v;
}

/** Voltages offered when a load is entered by hand. */
export const POWER_ALLOCATION_VOLTAGES = /** @type {const} */ ([120, 208]);

/**
 * 120 and 208, plus the row's current voltage when it is something else.
 * @param {number | null | undefined} voltage
 * @returns {number[]}
 */
export function voltageChoices(voltage) {
  const choices = [...POWER_ALLOCATION_VOLTAGES];
  const current = positiveNumber(voltage);
  if (current != null && !choices.includes(current)) choices.push(current);
  return choices;
}

/**
 * Soca breakouts / adapters are pass-throughs — not loads and not the distro.
 * @param {PowerAllocationNode | null | undefined} node
 * @param {{ id?: string, label?: string } | null | undefined} gear
 */
export function isSocaAdapter(node, gear) {
  const ids = [node?.typeId, gear?.id]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .toLowerCase();
  if (/soca/.test(ids) && /(breakout|adapter)/.test(ids)) return true;
  const label = typeof gear?.label === "string" ? gear.label.toLowerCase() : "";
  return /soca/.test(label) && /(breakout|adapter)/.test(label);
}

/**
 * @param {PowerAllocationNode} node
 * @param {(node: PowerAllocationNode) => { id?: string, label?: string, domain?: string, note?: string, wattage?: number, voltage?: number, ports?: object[] } | null} resolveGear
 */
function isLoadDevice(node, resolveGear) {
  const gear = resolveGear(node);
  if (isSocaAdapter(node, gear)) return false;
  if (isPowerDomainNode(node, gear)) return false;
  if (gear && isPowerDomainGear(gear)) return false;
  return true;
}

/**
 * LED wall total wattage from live LED calculator state.
 * @param {PowerAllocationNode} node
 * @param {{ grids?: object[], voltage?: number } | null | undefined} led
 * @returns {{ wattage: number | null, voltage: number | null }}
 */
/**
 * @param {PowerAllocationNode} node
 * @returns {string}
 */
function ledWallId(node) {
  if (typeof node.ledWallId === "string" && node.ledWallId.trim()) return node.ledWallId.trim();
  if (typeof node.typeId === "string" && node.typeId.startsWith("led-wall:")) {
    return node.typeId.slice("led-wall:".length);
  }
  return "";
}

/**
 * @param {PowerAllocationNode} node
 * @param {{ grids?: object[], voltage?: number } | null | undefined} led
 */
function ledGridForNode(node, led) {
  const wallId = ledWallId(node);
  if (!wallId || !led) return null;
  const grids = Array.isArray(led.grids) ? led.grids : [];
  return grids.find((grid) => grid && String(grid.id) === wallId) ?? null;
}

function ledWallPower(node, led) {
  const wallId = ledWallId(node);
  if (!wallId || !led) return { wattage: null, voltage: null };
  const grid = ledGridForNode(node, led);
  if (!grid) return { wattage: null, voltage: null };
  const tile = /** @type {Record<string, unknown>} */ (grid.tile ?? {});
  const tileW = positiveNumber(tile.wattage) ?? 0;
  const rows = Number(grid.generated ? grid.generatedRows : grid.rows) || 0;
  const cols = Number(grid.generated ? grid.generatedCols : grid.cols) || 0;
  const tiles = Math.max(0, rows * cols);
  const voltage = positiveNumber(led.voltage) ?? 120;
  return {
    wattage: tileW > 0 && tiles > 0 ? tileW * tiles : null,
    voltage,
  };
}

/**
 * @param {object | null | undefined} gear
 * @param {number} rowIndex
 * @returns {{ label: string, type: string | null }}
 */
function powerOutputCell(gear, rowIndex) {
  if (!gear) return { label: "", type: null };
  const powered = gearForPowerMode(/** @type {any} */ (gear));
  const port = powered.ports?.[rowIndex];
  if (!port) return { label: "", type: null };
  const label = typeof port.output === "string" ? port.output : "";
  const type =
    typeof port.outputType === "string" && port.outputType !== "—"
      ? port.outputType
      : null;
  return { label: label === "—" ? "" : label, type };
}

/**
 * Build paperwork rows for devices that receive a Signal Flow power feed.
 * Power-domain gear (outlets / distros / breakouts) are sources, not loads.
 *
 * @param {{
 *   signalFlow?: PowerAllocationSignalFlow | null,
 *   led?: { grids?: object[], voltage?: number } | null,
 *   resolveGear?: (node: PowerAllocationNode) => object | null,
 * }} [data]
 * @returns {PowerAllocationRow[]}
 */
export function buildPowerAllocationRows(data = {}) {
  const sf = data.signalFlow ?? {};
  const nodes = Array.isArray(sf.nodes) ? sf.nodes : [];
  const connections = Array.isArray(sf.connections) ? sf.connections : [];
  const resolveGear =
    typeof data.resolveGear === "function"
      ? data.resolveGear
      : () => /** @type {null} */ (null);

  const nodeById = new Map(
    nodes.filter((n) => n && typeof n.id === "string").map((n) => [n.id, n])
  );

  /** @type {PowerAllocationRow[]} */
  const plain = [];
  /** @type {PowerAllocationRow[]} */
  const ledBlocks = [];

  /**
   * Power feeds into a node. Prefer an output-side source (typical power wiring).
   * @param {string} nodeId
   */
  function incomingFeed(nodeId) {
    const feeds = connections.filter(
      (c) =>
        c &&
        c.toNodeId === nodeId &&
        isPowerConnection(c) &&
        typeof c.fromNodeId === "string" &&
        c.fromNodeId
    );
    return feeds.find((c) => c.fromCol === "output" || !c.fromCol) ?? feeds[0] ?? null;
  }

  /**
   * Walk through Soca adapters to the upstream distro / outlet.
   * @param {string} loadId
   * @returns {{ source: PowerAllocationNode | null, sourceGear: object | null, feed: PowerAllocationConnection | null }}
   */
  function allocationSource(loadId) {
    /** @type {Set<string>} */
    const seen = new Set();
    let feed = incomingFeed(loadId);
    while (feed) {
      const sourceId = String(feed.fromNodeId);
      if (seen.has(sourceId)) break;
      seen.add(sourceId);
      const source = nodeById.get(sourceId) ?? null;
      const sourceGear = source ? resolveGear(source) : null;
      if (source && isSocaAdapter(source, sourceGear)) {
        feed = incomingFeed(sourceId);
        continue;
      }
      return { source, sourceGear, feed };
    }
    return { source: null, sourceGear: null, feed: null };
  }

  for (const node of nodes) {
    if (!node?.id || !isLoadDevice(node, resolveGear)) continue;
    if (!incomingFeed(node.id)) continue;

    const { source, sourceGear, feed } = allocationSource(node.id);
    const outCell = powerOutputCell(sourceGear, Number(feed?.fromRow) || 0);

    let phase = phaseFromPortLabel(outCell.label);
    let voltage = voltageFromPortLabel(outCell.label, outCell.type);
    const gear = resolveGear(node);
    const ledPower = ledWallPower(node, data.led);
    if (voltage == null) {
      voltage =
        positiveNumber(/** @type {{ voltage?: unknown }} */ (gear)?.voltage) ??
        ledPower.voltage;
    }

    if (isTwoLegVoltage(voltage)) {
      // A single leg is not a valid 208V assignment. Keep an explicit pair from the label.
      if (phaseLegs(phase).length !== 2) phase = "";
    } else if (!phase && sourceGear) {
      // Cycle X/Y/Z across numbered power outs when labels lack an explicit phase.
      const powered = gearForPowerMode(/** @type {any} */ (sourceGear));
      const powerOutIndexes = (powered.ports ?? [])
        .map((port, index) => (port?.output && port.output !== "—" ? index : -1))
        .filter((index) => index >= 0);
      const slot = powerOutIndexes.indexOf(Number(feed?.fromRow) || 0);
      if (slot >= 0 && powerOutIndexes.length > 1) {
        phase = PHASES[slot % 3];
      }
    }

    let wattage =
      positiveNumber(/** @type {{ wattage?: unknown }} */ (gear)?.wattage) ??
      wattageFromNote(/** @type {{ note?: string }} */ (gear)?.note) ??
      ledPower.wattage;

    const amperage = amperageFromWattage(wattage, voltage);
    const deviceName =
      (typeof node.name === "string" && node.name.trim()) ||
      (typeof gear?.label === "string" && gear.label.trim()) ||
      (typeof node.typeId === "string" && node.typeId.trim()) ||
      "Device";
    const distroName =
      (typeof source?.name === "string" && source.name.trim()) ||
      (typeof sourceGear?.label === "string" && sourceGear.label.trim()) ||
      "—";

    /** @type {PowerAllocationRow} */
    const base = {
      device: deviceName,
      distro: distroName,
      phase,
      voltage,
      wattage,
      amperage,
      nodeId: node.id,
      kind: "item",
    };
    const ledBlock = ledWallCircuitBlock(node, data.led, base);
    if (ledBlock) ledBlocks.push(...ledBlock);
    else plain.push(base);
  }

  const collator = { sensitivity: /** @type {const} */ ("base") };
  plain.sort((a, b) => {
    const distro = a.distro.localeCompare(b.distro, undefined, collator);
    if (distro !== 0) return distro;
    const phaseOrder = a.phase.localeCompare(b.phase, undefined, collator);
    if (phaseOrder !== 0) return phaseOrder;
    return a.device.localeCompare(b.device, undefined, collator);
  });
  return [...ledBlocks, ...plain];
}

/**
 * LED walls with drawn power lines become a section of one row per circuit
 * so each circuit can be assigned a leg, or a 208V pair (XY, XZ, ZY).
 * Walls without circuits stay one row.
 * @param {PowerAllocationNode} node
 * @param {{ grids?: object[], voltage?: number } | null | undefined} led
 * @param {PowerAllocationRow} base
 * @returns {PowerAllocationRow[] | null}
 */
function ledWallCircuitBlock(node, led, base) {
  const grid = ledGridForNode(node, led);
  if (!grid) return null;
  const lines = Array.isArray(grid.powerLines) ? grid.powerLines : [];
  if (!lines.length) return null;

  const tile = /** @type {Record<string, unknown>} */ (grid.tile ?? {});
  const tileW = positiveNumber(tile.wattage) ?? 0;
  const useGenerated = Boolean(grid.generated);
  const rows = Math.max(0, Math.floor(Number(useGenerated ? grid.generatedRows : grid.rows) || 0));
  const cols = Math.max(0, Math.floor(Number(useGenerated ? grid.generatedCols : grid.cols) || 0));
  const tileCount = rows * cols;
  const voltage = base.voltage;
  const wallName =
    (typeof grid.name === "string" && grid.name.trim()) || base.device || "LED Wall";

  /** @type {Set<number>} */
  const assigned = new Set();
  /** @type {PowerAllocationRow[]} */
  const circuits = [];

  lines.forEach((line, index) => {
    if (!line || typeof line !== "object") return;
    const rawTiles = Array.isArray(line.tiles) ? line.tiles : [];
    let count = 0;
    for (const tileIndex of rawTiles) {
      const n = Math.floor(Number(tileIndex));
      if (!Number.isFinite(n) || n < 0) continue;
      if (tileCount > 0 && n >= tileCount) continue;
      if (assigned.has(n)) continue;
      assigned.add(n);
      count += 1;
    }
    const lineId =
      typeof line.id === "string" && line.id.trim() ? line.id.trim() : `i${index}`;
    const lineName =
      typeof line.name === "string" && line.name.trim() ? line.name.trim() : `Power ${index + 1}`;
    const wattage = tileW > 0 && count > 0 ? tileW * count : null;
    circuits.push({
      device: lineName,
      distro: base.distro,
      phase: "",
      voltage,
      wattage,
      amperage: amperageFromWattage(wattage, voltage),
      nodeId: node.id,
      kind: "item",
      keyPart: `line:${lineId}`,
    });
  });

  if (tileCount > assigned.size && tileW > 0) {
    const leftover = tileCount - assigned.size;
    const wattage = tileW * leftover;
    circuits.push({
      device: "Unassigned",
      distro: base.distro,
      phase: "",
      voltage,
      wattage,
      amperage: amperageFromWattage(wattage, voltage),
      nodeId: node.id,
      kind: "item",
      keyPart: "line:unassigned",
    });
  }

  if (!circuits.length) return null;

  return [
    {
      device: wallName,
      distro: "",
      phase: "",
      voltage: null,
      wattage: null,
      amperage: null,
      nodeId: node.id,
      kind: "header",
      level: "section",
      keyPart: "led",
    },
    ...circuits,
  ];
}

/**
 * @param {number | null | undefined} value
 * @param {number} [digits]
 */
export function formatPowerAllocationNumber(value, digits = 2) {
  const n = positiveNumber(value);
  if (n == null) return "";
  return n
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

/**
 * @typedef {{
 *   id: string,
 *   kind: "header" | "item",
 *   level: "section" | "subsection" | null,
 *   source: "auto" | "manual",
 *   sourceKey: string | null,
 *   roomId: string,
 *   room: string,
 *   nodeId: string | null,
 *   included: boolean,
 *   device: string,
 *   distro: string,
 *   phase: PowerAllocationPhase,
 *   voltage: number | null,
 *   wattage: number | null,
 *   amperage: number | null,
 *   overrides: {
 *     device?: boolean,
 *     distro?: boolean,
 *     phase?: boolean,
 *     voltage?: boolean,
 *     wattage?: boolean,
 *     amperage?: boolean,
 *   },
 * }} PowerAllocationLine
 *
 * @typedef {{
 *   searchQuery: string,
 *   roomFilter: string,
 * }} PowerAllocationSettings
 *
 * @typedef {{
 *   rows: PowerAllocationLine[],
 *   settings: PowerAllocationSettings,
 * }} PowerAllocationState
 */

const OVERRIDE_FIELDS = /** @type {const} */ ([
  "device",
  "distro",
  "phase",
  "voltage",
  "wattage",
  "amperage",
]);

/**
 * @param {string} roomId
 * @param {string} nodeId
 * @param {string} [part] Stable suffix such as `led` or `line:<id>`.
 */
export function powerAllocationSourceKey(roomId, nodeId, part = "") {
  const base = `pa:${roomId}:${nodeId}`;
  const suffix = typeof part === "string" ? part.trim() : "";
  return suffix ? `${base}:${suffix}` : base;
}

/** @returns {PowerAllocationSettings} */
export function emptyPowerAllocationSettings() {
  return { searchQuery: "", roomFilter: "" };
}

/** @returns {PowerAllocationState} */
export function emptyPowerAllocationState() {
  return { settings: emptyPowerAllocationSettings(), rows: [] };
}

/**
 * @param {unknown} raw
 * @returns {PowerAllocationPhase}
 */
function normalizePhase(raw) {
  const text = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^XYZ]/g, "");
  if (text === "X" || text === "Y" || text === "Z") return text;
  if (text === "XY" || text === "YX") return "XY";
  if (text === "XZ" || text === "ZX") return "XZ";
  if (text === "ZY" || text === "YZ") return "ZY";
  return "";
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function normalizeOptionalNumber(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} raw
 * @returns {PowerAllocationLine["overrides"]}
 */
function normalizeOverrides(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  /** @type {PowerAllocationLine["overrides"]} */
  const out = {};
  for (const field of OVERRIDE_FIELDS) {
    if (src[field] === true) out[field] = true;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {PowerAllocationLine | null}
 */
function normalizeLine(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const source = r.source === "manual" ? "manual" : "auto";
  const sourceKey =
    typeof r.sourceKey === "string" && r.sourceKey.trim() ? r.sourceKey.trim() : null;
  const kind = r.kind === "header" ? "header" : "item";
  const level =
    kind === "header" ? (r.level === "subsection" ? "subsection" : "section") : null;
  return {
    id: typeof r.id === "string" && r.id.trim() ? r.id.trim() : uid("pa"),
    kind,
    level,
    source,
    sourceKey: source === "auto" ? sourceKey : null,
    roomId: typeof r.roomId === "string" ? r.roomId : "",
    room: typeof r.room === "string" ? r.room : "",
    nodeId: typeof r.nodeId === "string" && r.nodeId.trim() ? r.nodeId.trim() : null,
    included: r.included !== false,
    device:
      typeof r.device === "string" && r.device.trim()
        ? r.device.trim()
        : kind === "header"
          ? level === "subsection"
            ? "Subsection"
            : "Section"
          : "Device",
    distro: typeof r.distro === "string" ? r.distro : "",
    phase: normalizePhase(r.phase),
    voltage: normalizeOptionalNumber(r.voltage),
    wattage: normalizeOptionalNumber(r.wattage),
    amperage: normalizeOptionalNumber(r.amperage),
    overrides: normalizeOverrides(r.overrides),
  };
}

/**
 * @param {unknown} raw
 * @returns {PowerAllocationSettings}
 */
export function normalizePowerAllocationSettings(raw) {
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    searchQuery: typeof r.searchQuery === "string" ? r.searchQuery : "",
    roomFilter: typeof r.roomFilter === "string" ? r.roomFilter.trim() : "",
  };
}

/**
 * @param {unknown} data
 * @returns {PowerAllocationState}
 */
export function normalizePowerAllocationState(data) {
  if (!data || typeof data !== "object") return emptyPowerAllocationState();
  const raw = /** @type {Record<string, unknown>} */ (data);
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map(normalizeLine).filter((row) => row != null)
    : [];
  return {
    settings: normalizePowerAllocationSettings(raw.settings),
    rows: /** @type {PowerAllocationLine[]} */ (rows),
  };
}

/**
 * @param {PowerAllocationLine | null | undefined} prev
 * @param {PowerAllocationRow & { roomId: string, room: string }} live
 * @param {string} sourceKey
 * @returns {PowerAllocationLine}
 */
function mergeAutoLine(prev, live, sourceKey) {
  const overrides = prev?.overrides ?? {};
  const kind = live.kind === "header" ? "header" : "item";
  /** @type {PowerAllocationLine} */
  const next = {
    id: prev?.id || uid("pa"),
    kind,
    level: kind === "header" ? (live.level === "subsection" ? "subsection" : "section") : null,
    source: "auto",
    sourceKey,
    roomId: live.roomId,
    room: live.room,
    nodeId: live.nodeId || prev?.nodeId || null,
    included: prev ? prev.included !== false : true,
    device: live.device,
    distro: kind === "header" ? "" : live.distro,
    phase: kind === "header" ? "" : live.phase,
    voltage: kind === "header" ? null : live.voltage,
    wattage: kind === "header" ? null : live.wattage,
    amperage: kind === "header" ? null : live.amperage,
    overrides: { ...overrides },
  };
  if (kind === "header") {
    if (overrides.device && prev) next.device = prev.device;
    return next;
  }
  if (overrides.device && prev) next.device = prev.device;
  if (overrides.distro && prev) next.distro = prev.distro;
  if (overrides.phase && prev) next.phase = prev.phase;
  if (overrides.voltage && prev) next.voltage = prev.voltage;
  if (overrides.wattage && prev) next.wattage = prev.wattage;
  if (overrides.amperage && prev) {
    next.amperage = prev.amperage;
  } else if (overrides.wattage || overrides.voltage) {
    next.amperage = amperageFromWattage(next.wattage, next.voltage);
  }
  return next;
}

/**
 * @param {PowerAllocationRow & { roomId?: string, room?: string, sourceKey?: string }} row
 */
function liveSourceKey(row) {
  if (typeof row.sourceKey === "string" && row.sourceKey.trim()) return row.sourceKey.trim();
  if (row.nodeId && row.roomId) {
    return powerAllocationSourceKey(row.roomId, row.nodeId, row.keyPart || "");
  }
  return "";
}

/**
 * Replace auto lines from live Signal Flow rows. Overrides, ids, and hide
 * flags stick to sourceKey. Manual lines stay at the end.
 * @param {PowerAllocationState} state
 * @param {Array<PowerAllocationRow & { roomId: string, room: string }>} liveRows
 * @returns {PowerAllocationState}
 */
export function syncPowerAllocationRows(state, liveRows) {
  const current = normalizePowerAllocationState(state);
  /** @type {Map<string, PowerAllocationLine>} */
  const prevByKey = new Map();
  for (const row of current.rows) {
    if (row.source === "auto" && row.sourceKey) prevByKey.set(row.sourceKey, row);
  }

  /** @type {Map<string, PowerAllocationLine>} */
  const liveByKey = new Map();
  /** @type {string[]} */
  const liveOrder = [];
  for (const row of liveRows ?? []) {
    if (!row?.nodeId || !row.roomId) continue;
    const key = liveSourceKey(row);
    if (!key || liveByKey.has(key)) continue;
    liveByKey.set(key, mergeAutoLine(prevByKey.get(key), row, key));
    liveOrder.push(key);
  }

  /** @type {Set<string>} */
  const used = new Set();
  /** @type {PowerAllocationLine[]} */
  const next = [];
  for (const row of current.rows) {
    if (row.source !== "auto" || !row.sourceKey) {
      next.push(row);
      continue;
    }
    const live = liveByKey.get(row.sourceKey);
    if (!live) continue;
    next.push(live);
    used.add(row.sourceKey);
  }

  for (const key of liveOrder) {
    if (used.has(key)) continue;
    const row = liveByKey.get(key);
    if (!row) continue;
    const orderIndex = liveOrder.indexOf(key);
    let insertAt = next.findIndex((entry) => entry.source === "manual");
    if (insertAt < 0) insertAt = next.length;
    for (let i = orderIndex - 1; i >= 0; i -= 1) {
      const prevAt = next.findIndex((entry) => entry.sourceKey === liveOrder[i]);
      if (prevAt >= 0) {
        insertAt = prevAt + 1;
        break;
      }
    }
    next.splice(insertAt, 0, row);
    used.add(key);
  }

  return { settings: current.settings, rows: next };
}

/**
 * @param {PowerAllocationState} state
 * @param {Partial<PowerAllocationSettings>} patch
 * @returns {PowerAllocationState}
 */
export function updatePowerAllocationSettings(state, patch) {
  const current = normalizePowerAllocationState(state);
  return {
    rows: current.rows,
    settings: normalizePowerAllocationSettings({ ...current.settings, ...patch }),
  };
}

/**
 * @param {PowerAllocationLine} row
 * @param {string} query
 */
function lineMatchesSearch(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.device,
    row.distro,
    row.phase,
    row.room,
    row.voltage ?? "",
    row.wattage ?? "",
    row.amperage ?? "",
    row.source,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * @param {PowerAllocationState | null | undefined} state
 * @returns {PowerAllocationLine[]}
 */
export function powerAllocationRowsForDisplay(state) {
  const current = normalizePowerAllocationState(state);
  const room = current.settings.roomFilter;
  const query = current.settings.searchQuery;
  const rows = current.rows;
  const queryText = query.trim();
  /**
   * @param {number} index
   */
  function ancestorMatchesSearch(index) {
    if (!queryText) return false;
    /** @type {PowerAllocationLine | null} */
    let section = null;
    /** @type {PowerAllocationLine | null} */
    let subsection = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = rows[i];
      if (candidate.kind !== "header") continue;
      if (candidate.level === "subsection") {
        if (!subsection) subsection = candidate;
        continue;
      }
      section = candidate;
      break;
    }
    return [section, subsection].some((header) => {
      if (!header) return false;
      if (room && header.room && header.room !== room) return false;
      return lineMatchesSearch(header, query);
    });
  }
  /** @type {boolean[]} */
  const itemHit = rows.map((row, index) => {
    if (row.kind === "header") return false;
    if (room && row.room !== room) return false;
    return lineMatchesSearch(row, query) || ancestorMatchesSearch(index);
  });
  return rows.filter((row, index) => {
    if (row.kind !== "header") return itemHit[index];
    const children = powerAllocationHeaderItems(rows, index);
    if (children.some((child) => itemHit[rows.indexOf(child)])) return true;
    if (room && row.room && row.room !== room) return false;
    if (children.length && room && !query.trim()) return false;
    return lineMatchesSearch(row, query);
  });
}

/**
 * Included lines for a paperwork sheet. Room-scoped sheets pass roomId.
 * @param {PowerAllocationState | null | undefined} state
 * @param {string | null | undefined} [roomId]
 * @returns {PowerAllocationLine[]}
 */
export function powerAllocationRowsForPaperwork(state, roomId) {
  const current = normalizePowerAllocationState(state);
  /** @type {PowerAllocationLine[]} */
  const kept = [];
  let hideUntilSection = false;
  let hideUntilHeader = false;
  for (const row of current.rows) {
    if (row.kind === "header" && row.level !== "subsection") {
      hideUntilHeader = false;
      hideUntilSection = row.included === false;
      if (hideUntilSection) continue;
      kept.push(row);
      continue;
    }
    if (hideUntilSection) continue;
    if (row.kind === "header") {
      hideUntilHeader = row.included === false;
      if (hideUntilHeader) continue;
      kept.push(row);
      continue;
    }
    if (hideUntilHeader || row.included === false) continue;
    if (roomId && row.roomId !== roomId) continue;
    kept.push(row);
  }
  return kept.filter((row, index) => {
    if (row.kind !== "header") return true;
    return powerAllocationHeaderItems(kept, index).length > 0;
  });
}

/**
 * Item rows that belong to a header: a section includes nested subsection
 * items; a subsection stops at the next heading.
 * @param {PowerAllocationLine[]} rows
 * @param {number} index
 * @returns {PowerAllocationLine[]}
 */
export function powerAllocationHeaderItems(rows, index) {
  const header = rows[index];
  if (!header || header.kind !== "header") return [];
  const subsection = header.level === "subsection";
  /** @type {PowerAllocationLine[]} */
  const items = [];
  for (let i = index + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.kind === "header") {
      if (subsection || row.level !== "subsection") break;
      continue;
    }
    items.push(row);
  }
  return items;
}

/**
 * Wattage, amperage, and per-leg amps for the devices under a heading.
 * @param {PowerAllocationLine[]} items
 */
export function sumPowerAllocationItems(items) {
  let wattage = 0;
  let amperage = 0;
  let hasWattage = false;
  let hasAmperage = false;
  /** @type {Record<"X" | "Y" | "Z", number>} */
  const phaseAmps = { X: 0, Y: 0, Z: 0 };
  for (const item of items) {
    if (item.included === false) continue;
    if (item.wattage != null) {
      wattage += item.wattage;
      hasWattage = true;
    }
    if (item.amperage != null) {
      amperage += item.amperage;
      hasAmperage = true;
      for (const leg of phaseLegs(item.phase)) {
        phaseAmps[leg] += item.amperage;
      }
    }
  }
  return {
    wattage: hasWattage ? wattage : null,
    amperage: hasAmperage ? amperage : null,
    phaseAmps,
  };
}

/**
 * @param {Record<"X" | "Y" | "Z", number>} phaseAmps
 */
export function formatPhaseAmpSummary(phaseAmps) {
  return PHASES.filter((phase) => phaseAmps[phase] > 0)
    .map((phase) => `${phase} ${formatPowerAllocationNumber(phaseAmps[phase], 2)}`)
    .join(" · ");
}

/**
 * @param {PowerAllocationState} state
 * @returns {string[]}
 */
export function powerAllocationRoomNames(state) {
  const names = new Set();
  for (const row of normalizePowerAllocationState(state).rows) {
    if (row.room.trim()) names.add(row.room.trim());
  }
  return [...names];
}

/**
 * @param {PowerAllocationState} state
 * @param {string} rowId
 * @param {Partial<Pick<PowerAllocationLine, "device" | "distro" | "phase" | "voltage" | "wattage" | "amperage" | "included" | "room" | "roomId">>} patch
 * @returns {PowerAllocationState}
 */
export function updatePowerAllocationRow(state, rowId, patch) {
  const current = normalizePowerAllocationState(state);
  return {
    settings: current.settings,
    rows: current.rows.map((row) => {
      if (row.id !== rowId) return row;
      const overrides = { ...row.overrides };
      /** @type {PowerAllocationLine} */
      const next = { ...row, overrides };
      if (typeof patch.included === "boolean") next.included = patch.included;
      if (typeof patch.room === "string") next.room = patch.room;
      if (typeof patch.roomId === "string") next.roomId = patch.roomId;
      if (typeof patch.device === "string") {
        next.device = patch.device.trim() || row.device;
        overrides.device = true;
      }
      if (typeof patch.distro === "string") {
        next.distro = patch.distro;
        overrides.distro = true;
      }
      if (patch.phase !== undefined) {
        next.phase = normalizePhase(patch.phase);
        overrides.phase = true;
      }
      if (patch.voltage !== undefined) {
        next.voltage = normalizeOptionalNumber(patch.voltage);
        overrides.voltage = true;
      }
      if (patch.wattage !== undefined) {
        next.wattage = normalizeOptionalNumber(patch.wattage);
        overrides.wattage = true;
      }
      if (patch.amperage !== undefined) {
        next.amperage = normalizeOptionalNumber(patch.amperage);
        overrides.amperage = true;
      }
      if (row.source === "manual") {
        const setWatts = patch.wattage !== undefined;
        const setAmps = patch.amperage !== undefined;
        const setVolts = patch.voltage !== undefined;
        if (setWatts && !setAmps) {
          delete overrides.amperage;
          next.amperage = amperageFromWattage(next.wattage, next.voltage);
        } else if (setAmps && !setWatts) {
          delete overrides.wattage;
          next.wattage = wattageFromAmperage(next.amperage, next.voltage);
        } else if (setVolts && !setWatts && !setAmps) {
          if (overrides.amperage && !overrides.wattage) {
            next.wattage = wattageFromAmperage(next.amperage, next.voltage);
          } else {
            delete overrides.amperage;
            next.amperage = amperageFromWattage(next.wattage, next.voltage);
          }
        }
      } else if (patch.amperage === undefined && (overrides.wattage || overrides.voltage)) {
        if (!overrides.amperage) {
          next.amperage = amperageFromWattage(next.wattage, next.voltage);
        }
      }
      // A chosen phase stays put. Only an automatic phase is cleared when the
      // voltage change makes it invalid (one leg at 208V, or a pair at 120V).
      if (patch.voltage !== undefined && !overrides.phase) {
        const legs = phaseLegs(next.phase);
        const twoLeg = isTwoLegVoltage(next.voltage);
        if ((twoLeg && legs.length === 1) || (!twoLeg && legs.length === 2)) {
          next.phase = "";
        }
      }
      return next;
    }),
  };
}

/**
 * @param {PowerAllocationState} state
 * @param {Partial<PowerAllocationLine>} [fields]
 * @returns {PowerAllocationState}
 */
export function addManualPowerAllocationRow(state, fields = {}) {
  const current = normalizePowerAllocationState(state);
  /** @type {PowerAllocationLine} */
  const row = {
    id: uid("pa"),
    kind: "item",
    level: null,
    source: "manual",
    sourceKey: null,
    roomId: typeof fields.roomId === "string" ? fields.roomId : "",
    room: typeof fields.room === "string" ? fields.room : "",
    nodeId: null,
    included: true,
    device: typeof fields.device === "string" && fields.device.trim() ? fields.device.trim() : "Device",
    distro: typeof fields.distro === "string" ? fields.distro : "",
    phase: normalizePhase(fields.phase),
    voltage: normalizeOptionalNumber(fields.voltage),
    wattage: normalizeOptionalNumber(fields.wattage),
    amperage: normalizeOptionalNumber(fields.amperage),
    overrides: {},
  };
  if (row.amperage == null) {
    row.amperage = amperageFromWattage(row.wattage, row.voltage);
  } else if (row.wattage == null) {
    row.wattage = wattageFromAmperage(row.amperage, row.voltage);
  }
  return { settings: current.settings, rows: [...current.rows, row] };
}

/**
 * @param {PowerAllocationState} state
 * @param {string} rowId
 * @returns {PowerAllocationState}
 */
/**
 * @param {PowerAllocationState} state
 * @param {"section" | "subsection"} level
 * @param {{ device?: string, room?: string, roomId?: string }} [fields]
 * @returns {PowerAllocationState}
 */
export function addPowerAllocationHeader(state, level, fields = {}) {
  const current = normalizePowerAllocationState(state);
  const subsection = level === "subsection";
  /** @type {PowerAllocationLine} */
  const row = {
    id: uid("pa"),
    kind: "header",
    level: subsection ? "subsection" : "section",
    source: "manual",
    sourceKey: null,
    roomId: typeof fields.roomId === "string" ? fields.roomId : "",
    room: typeof fields.room === "string" ? fields.room : "",
    nodeId: null,
    included: true,
    device:
      typeof fields.device === "string" && fields.device.trim()
        ? fields.device.trim()
        : subsection
          ? "Subsection"
          : "Section",
    distro: "",
    phase: "",
    voltage: null,
    wattage: null,
    amperage: null,
    overrides: {},
  };
  return { settings: current.settings, rows: [...current.rows, row] };
}

/**
 * @param {PowerAllocationState} state
 * @param {string} draggedId
 * @param {string} targetId
 * @param {"before" | "after"} place
 * @returns {PowerAllocationState}
 */
export function reorderPowerAllocationRow(state, draggedId, targetId, place) {
  if (draggedId === targetId) return state;
  const current = normalizePowerAllocationState(state);
  const rows = [...current.rows];
  const from = rows.findIndex((row) => row.id === draggedId);
  if (from < 0) return current;
  const [moved] = rows.splice(from, 1);
  let insertAt = rows.findIndex((row) => row.id === targetId);
  if (insertAt < 0 || !moved) return current;
  if (place === "after") insertAt += 1;
  rows.splice(insertAt, 0, moved);
  return { settings: current.settings, rows };
}

export function removePowerAllocationRow(state, rowId) {
  const current = normalizePowerAllocationState(state);
  return {
    settings: current.settings,
    rows: current.rows.filter((row) => row.id !== rowId || row.source === "auto"),
  };
}
