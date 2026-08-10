/**
 * Cable list domain — manual cable state + derived route/place cards.
 * UI rendering stays in js/cable-calculator.js.
 */

import { inferConnectorTypeFromLabel, resolveGearType } from "../signal-flow-data.js";
import { DEFAULT_PALETTE_COLOR, normalizeHexColor } from "../shared/color-palette.js";
import { formatDistance, getMetersPerPixel, routeLengthMeters } from "../groundplan-units.js";
import { uid } from "../shared/id.js";

/**
 * @typedef {{ id: string, name: string }} CablePlace
 * @typedef {{ id: string, typeId: string, name: string, placeId?: string | null }} CableNode
 * @typedef {{
 *   id: string,
 *   fromNodeId: string,
 *   fromRow: number,
 *   fromCol: "input" | "output",
 *   toNodeId: string,
 *   toRow: number,
 *   toCol: "input" | "output",
 * }} CableConnection
 * @typedef {{ id: string, fromPlaceId: string, toPlaceId: string, points: { x: number, y: number, heightMeters?: number | null }[], color?: string }} CableRoute
 * @typedef {{ connectionId: string, cableLabel: string, fromDevice: string, toDevice: string, amount?: number, fromNodeId?: string, toNodeId?: string }} CableRow
 * @typedef {{ id: string, cableLabel: string, fromDevice: string, toDevice: string, amount: number }} ManualCable
 * @typedef {{ type: string, count: number, rows: CableRow[] }} CableTypeGroup
 * @typedef {{ id: string, title: string, lengthLabel: string, rows: CableRow[], emptyMessage: string, color?: string }} CableCard
 * @typedef {{ routes: Record<string, ManualCable[]>, places: Record<string, ManualCable[]> }} CableState
 */

/** Preferred display order for known connector types; unknown types follow alphabetically. */
const CABLE_TYPE_ORDER = ["HDMI", "DP", "SDI", "USB-C", "XLR", "ETH", "Fiber", "Cable"];

/**
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeCableAmount(value, fallback = 1) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(999, Math.floor(n)));
}

/** @returns {CableState} */
export function emptyCableState() {
  return { routes: {}, places: {} };
}

/**
 * @param {unknown} raw
 * @returns {ManualCable | null}
 */
function normalizeManualCable(raw) {
  if (!raw || typeof raw !== "object") return null;
  const c = /** @type {Record<string, unknown>} */ (raw);
  const cableLabel =
    typeof c.cableLabel === "string" && c.cableLabel.trim() ? c.cableLabel.trim() : "";
  if (!cableLabel) return null;
  const fromDevice = typeof c.fromDevice === "string" ? c.fromDevice.trim() : "";
  const toDevice = typeof c.toDevice === "string" ? c.toDevice.trim() : "";
  return {
    id: typeof c.id === "string" && c.id.trim() ? c.id.trim() : uid("mcable"),
    cableLabel,
    fromDevice,
    toDevice,
    amount: normalizeCableAmount(c.amount, 1),
  };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, ManualCable[]>}
 */
function normalizeManualMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  /** @type {Record<string, ManualCable[]>} */
  const out = {};
  for (const [cardId, list] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (!cardId || !Array.isArray(list)) continue;
    const cables = list.map(normalizeManualCable).filter(/** @type {(c: ManualCable | null) => c is ManualCable} */ ((c) => Boolean(c)));
    if (cables.length) out[cardId] = cables;
  }
  return out;
}

/**
 * @param {unknown} data
 * @returns {CableState}
 */
export function normalizeCableState(data) {
  if (data == null) return emptyCableState();
  if (typeof data !== "object") {
    throw new Error("The file has invalid cable calculator data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  return {
    routes: normalizeManualMap(raw.routes),
    places: normalizeManualMap(raw.places),
  };
}

/**
 * Drop manual cables for cards that no longer exist.
 * @param {CableState} state
 * @param {string[]} routeIds
 * @param {string[]} placeIds
 * @returns {CableState}
 */
export function pruneManualCables(state, routeIds, placeIds) {
  const routeSet = new Set(routeIds);
  const placeSet = new Set(placeIds);
  /** @type {Record<string, ManualCable[]>} */
  const routes = {};
  /** @type {Record<string, ManualCable[]>} */
  const places = {};
  for (const [id, list] of Object.entries(state.routes ?? {})) {
    if (routeSet.has(id) && list.length) routes[id] = list;
  }
  for (const [id, list] of Object.entries(state.places ?? {})) {
    if (placeSet.has(id) && list.length) places[id] = list;
  }
  return { routes, places };
}

/**
 * Collapse key for path lines. Auto cables with node ids merge by gear pair;
 * manual/other rows stay distinct via connection id.
 * @param {CableRow} row
 */
function rowPathKey(row) {
  if (row.fromNodeId && row.toNodeId) {
    return `n:${row.fromNodeId}\0${row.toNodeId}`;
  }
  if (row.connectionId) return `id:${row.connectionId}`;
  return `d:${row.fromDevice ?? ""}\0${row.toDevice ?? ""}`;
}

/**
 * Merge cables that share the same from→to gear into one row with a summed amount.
 * @param {CableRow[]} rows
 * @returns {CableRow[]}
 */
export function collapseRowsByDevicePair(rows) {
  /** @type {Map<string, CableRow>} */
  const byPath = new Map();
  for (const row of rows) {
    const key = rowPathKey(row);
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, {
        ...row,
        amount: normalizeCableAmount(row.amount, 1),
      });
      continue;
    }
    existing.amount =
      normalizeCableAmount(existing.amount, 1) + normalizeCableAmount(row.amount, 1);
  }
  return [...byPath.values()];
}

/**
 * Group cable rows by type, collapsing identical gear pairs under each type.
 * @param {CableRow[]} rows
 * @returns {CableTypeGroup[]}
 */
export function groupRowsByCableType(rows) {
  /** @type {Map<string, CableRow[]>} */
  const byType = new Map();
  for (const row of rows) {
    const type = row.cableLabel || "Cable";
    const list = byType.get(type);
    if (list) list.push(row);
    else byType.set(type, [row]);
  }

  const types = [...byType.keys()].sort((a, b) => {
    const ia = CABLE_TYPE_ORDER.indexOf(a);
    const ib = CABLE_TYPE_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });

  return types.map((type) => {
    const collapsed = collapseRowsByDevicePair(byType.get(type) ?? []);
    const count = collapsed.reduce((n, row) => n + normalizeCableAmount(row.amount, 1), 0);
    return { type, count, rows: collapsed };
  });
}

/**
 * Path label for a cable row. Blank from+to uses the route/place title.
 * @param {{ fromDevice?: string, toDevice?: string }} row
 * @param {string} cardTitle
 */
export function formatCablePath(row, cardTitle) {
  const from = typeof row.fromDevice === "string" ? row.fromDevice.trim() : "";
  const to = typeof row.toDevice === "string" ? row.toDevice.trim() : "";
  if (!from && !to) return cardTitle;
  if (from && to) return `${from} → ${to}`;
  return `${from || "—"} → ${to || "—"}`;
}

/**
 * @param {ManualCable[]} manuals
 * @returns {CableRow[]}
 */
export function manualCablesToRows(manuals) {
  return (manuals ?? []).map((c) => ({
    connectionId: c.id,
    cableLabel: c.cableLabel,
    fromDevice: c.fromDevice,
    toDevice: c.toDevice,
    amount: normalizeCableAmount(c.amount, 1),
  }));
}

/**
 * Resolve the destination input endpoint for a connection when possible.
 * @param {CableConnection} conn
 * @returns {{ nodeId: string, row: number, col: "input" | "output" }}
 */
function destinationEndpoint(conn) {
  if (conn.toCol === "input") {
    return { nodeId: conn.toNodeId, row: conn.toRow, col: "input" };
  }
  if (conn.fromCol === "input") {
    return { nodeId: conn.fromNodeId, row: conn.fromRow, col: "input" };
  }
  return { nodeId: conn.toNodeId, row: conn.toRow, col: conn.toCol };
}

/**
 * Cable type from the destination input port's connector type.
 * @param {CableConnection} conn
 * @param {CableNode[]} nodes
 * @param {import("../signal-flow-data.js").GearType[]} customGearTypes
 * @returns {string}
 */
export function inferCableType(conn, nodes, customGearTypes) {
  const endpoint = destinationEndpoint(conn);
  const node = nodes.find((n) => n.id === endpoint.nodeId);
  if (!node) return "Cable";
  const gear = resolveGearType(node.typeId, customGearTypes);
  const port = gear.ports?.[endpoint.row];
  if (!port) return "Cable";

  const typed =
    endpoint.col === "output"
      ? port.outputType || inferConnectorTypeFromLabel(port.output)
      : port.inputType || inferConnectorTypeFromLabel(port.input);
  if (typed) return typed;

  const label = endpoint.col === "output" ? port.output : port.input;
  if (!label || label === "—") return "Cable";
  return "Cable";
}

/** @deprecated Prefer inferCableType — kept for callers that still use port labels. */
export function inferInputPortLabel(conn, nodes, customGearTypes) {
  return inferCableType(conn, nodes, customGearTypes);
}

/**
 * @param {CableConnection} conn
 * @param {CableNode[]} nodes
 * @param {import("../signal-flow-data.js").GearType[]} customGearTypes
 * @returns {CableRow | null}
 */
function connectionToRow(conn, nodes, customGearTypes) {
  const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
  const toNode = nodes.find((n) => n.id === conn.toNodeId);
  if (!fromNode || !toNode) return null;
  return {
    connectionId: conn.id,
    cableLabel: inferCableType(conn, nodes, customGearTypes),
    fromDevice: fromNode.name || fromNode.id,
    toDevice: toNode.name || toNode.id,
    fromNodeId: fromNode.id,
    toNodeId: toNode.id,
    amount: 1,
  };
}

/**
 * @param {string} placeA
 * @param {string} placeB
 * @param {string | null | undefined} fromPlaceId
 * @param {string | null | undefined} toPlaceId
 */
function placesMatchPair(placeA, placeB, fromPlaceId, toPlaceId) {
  if (!fromPlaceId || !toPlaceId) return false;
  return (
    (fromPlaceId === placeA && toPlaceId === placeB) ||
    (fromPlaceId === placeB && toPlaceId === placeA)
  );
}

/**
 * @param {CableRoute} route
 * @param {CableConnection[]} connections
 * @param {CableNode[]} nodes
 */
export function matchRouteConnections(route, connections, nodes) {
  return connections.filter((conn) => {
    const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
    const toNode = nodes.find((n) => n.id === conn.toNodeId);
    if (!fromNode || !toNode) return false;
    return placesMatchPair(route.fromPlaceId, route.toPlaceId, fromNode.placeId, toNode.placeId);
  });
}

/**
 * @param {{
 *   places: CablePlace[],
 *   nodes: CableNode[],
 *   connections: CableConnection[],
 *   customGearTypes?: import("../signal-flow-data.js").GearType[],
 *   routes: CableRoute[],
 *   scale: { pointA: { x: number, y: number } | null, pointB: { x: number, y: number } | null, distanceMeters: number | null, unit?: "metric" | "imperial" } | null,
 * }} data
 * @returns {CableCard[]}
 */
export function buildRouteCards(data) {
  const customGearTypes = data.customGearTypes ?? [];
  const unit = data.scale?.unit === "imperial" ? "imperial" : "metric";
  const mpp = data.scale ? getMetersPerPixel(data.scale) : null;
  const placeName = (id) => data.places.find((p) => p.id === id)?.name ?? id;

  return (data.routes ?? []).map((route) => {
    const matched = matchRouteConnections(route, data.connections ?? [], data.nodes ?? []);
    const rows = matched
      .map((conn) => connectionToRow(conn, data.nodes, customGearTypes))
      .filter(/** @type {(r: CableRow | null) => r is CableRow} */ ((r) => Boolean(r)));

    const meters = routeLengthMeters(route.points ?? [], mpp);
    const lengthLabel =
      meters == null ? "Length unknown — set groundplan scale" : formatDistance(meters, unit);

    return {
      id: route.id,
      title: `${placeName(route.fromPlaceId)} → ${placeName(route.toPlaceId)}`,
      lengthLabel,
      rows,
      emptyMessage: "No signal-flow cables for this route",
      color: normalizeHexColor(route.color ?? DEFAULT_PALETTE_COLOR),
    };
  });
}

/**
 * @param {{
 *   places: CablePlace[],
 *   nodes: CableNode[],
 *   connections: CableConnection[],
 *   customGearTypes?: import("../signal-flow-data.js").GearType[],
 * }} data
 * @returns {CableCard[]}
 */
export function buildPlaceCards(data) {
  const customGearTypes = data.customGearTypes ?? [];
  const nodes = data.nodes ?? [];
  const connections = data.connections ?? [];

  return (data.places ?? []).map((place) => {
    const local = connections.filter((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
      const toNode = nodes.find((n) => n.id === conn.toNodeId);
      if (!fromNode || !toNode) return false;
      return fromNode.placeId === place.id && toNode.placeId === place.id;
    });
    const rows = local
      .map((conn) => connectionToRow(conn, nodes, customGearTypes))
      .filter(/** @type {(r: CableRow | null) => r is CableRow} */ ((r) => Boolean(r)));

    return {
      id: place.id,
      title: place.name,
      lengthLabel: "Local",
      rows,
      emptyMessage: "No local signal-flow cables at this place",
    };
  });
}
