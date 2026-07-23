/**
 * Print-safe Signal Flow diagram SVG for paperwork, with optional crop.
 * Gear chrome mirrors the interactive HTML tables. Connection routes are
 * laid out in the same world units as the Signal Flow page, then the whole
 * diagram is scaled uniformly for paperwork font size — so wires stay
 * aligned with ports the way they do on the interactive canvas.
 */

import { connectorColor, resolveGearType } from "../signal-flow-data.js?v=42";
import { escapeXml } from "../shared/dom.js";
import {
  buildPath,
  enforceEndStubs,
  repairRouteCorners,
  resolveConnectionRoute,
  roundedOrthoPolyline,
} from "../shared/ortho-path.js";
import {
  buildCropEditorMarkup,
  fullImageCrop,
  normalizeGroundplanCrop,
} from "./groundplan-svg.js?v=8";
import { normalizeFontSizePt } from "./font-scale.js?v=4";

/**
 * Chrome sizes in interactive canvas px (root ~16px, table font 0.8rem).
 * Must stay at unit scale while routing so saved world routes still fit.
 */
const DESIGN = {
  nodeMinW: 160,
  colMinW: 80,
  headerH: 28,
  placeH: 14,
  noteH: 24,
  colLabelH: 18,
  portRowH: 22,
  radius: 8,
  contentPad: 72,
  wireStrokePad: 12,
  /** Matches signal-flow.js PORT_STUB_PX (10px stub + ~10px corner). */
  portStub: 20,
  /** Matches roundedOrthoPolyline default on the SF page. */
  wireCorner: 10,
  wireStroke: 2,
};

const WORLD_NODE_W = 320;
const WORLD_NODE_H = 240;
const WORLD_PAD = 1600;
const FONT = "Segoe UI, system-ui, -apple-system, sans-serif";

/**
 * @param {number} unitScale
 */
function layoutMetrics(unitScale = 1) {
  const s = Math.max(0.5, unitScale);
  /** @param {number} n */
  const u = (n) => Math.round(n * s * 100) / 100;
  return {
    s,
    nodeMinW: u(DESIGN.nodeMinW),
    colMinW: u(DESIGN.colMinW),
    headerH: u(DESIGN.headerH),
    placeH: u(DESIGN.placeH),
    noteH: u(DESIGN.noteH),
    colLabelH: u(DESIGN.colLabelH),
    portRowH: u(DESIGN.portRowH),
    radius: u(DESIGN.radius),
    contentPad: u(DESIGN.contentPad),
    wireStrokePad: u(DESIGN.wireStrokePad),
    portStub: u(DESIGN.portStub),
    wireCorner: u(DESIGN.wireCorner),
    wireStroke: u(DESIGN.wireStroke),
    /** @param {number} size design size at scale 1 */
    fs: (size) => Math.round(size * s * 100) / 100,
  };
}

/**
 * Approximate glyph advance for Segoe/system UI (canvas-free).
 * @param {string} text
 * @param {number} fontSize
 */
function approxTextWidth(text, fontSize) {
  const s = String(text ?? "");
  if (!s) return 0;
  let units = 0;
  for (const ch of s) {
    if (ch === " " || ch === "." || ch === "," || ch === ":" || ch === ";" || ch === "|") {
      units += 0.33;
    } else if (ch === "W" || ch === "M" || ch === "m" || ch === "@") {
      units += 0.85;
    } else if (ch === "i" || ch === "l" || ch === "t" || ch === "f" || ch === "j" || ch === "I" || ch === "'") {
      units += 0.35;
    } else {
      units += 0.58;
    }
  }
  return units * fontSize;
}

/**
 * Estimate input/output column widths the way the HTML table grows from labels.
 * @param {string} name
 * @param {object} gear
 * @param {ReturnType<typeof layoutMetrics>} m
 */
function estimateNodeColumns(name, gear, m) {
  const cellPad = m.fs(16);
  const typeGap = m.fs(7);
  let inW = m.colMinW;
  let outW = m.colMinW;

  const ports = Array.isArray(gear?.ports) ? gear.ports : [];
  for (const port of ports) {
    const input = port?.input && port.input !== "—" ? String(port.input) : "";
    const output = port?.output && port.output !== "—" ? String(port.output) : "";
    const inputType =
      port?.inputType && port.inputType !== "—" ? String(port.inputType) : "";
    const outputType =
      port?.outputType && port.outputType !== "—" ? String(port.outputType) : "";

    const inLabel =
      approxTextWidth(input, m.fs(9)) +
      (inputType ? typeGap + approxTextWidth(inputType.toUpperCase(), m.fs(7)) : 0);
    const outLabel =
      approxTextWidth(output, m.fs(9)) +
      (outputType ? typeGap + approxTextWidth(outputType.toUpperCase(), m.fs(7)) : 0);

    inW = Math.max(inW, inLabel + cellPad);
    outW = Math.max(outW, outLabel + cellPad);
  }

  const headerNeed = approxTextWidth(String(name ?? ""), m.fs(11)) + m.fs(24);
  const total = Math.max(m.nodeMinW, headerNeed, inW + outW);
  if (inW + outW < total) {
    const extra = total - (inW + outW);
    inW += extra / 2;
    outW += extra / 2;
  }

  return {
    inColW: Math.round(inW * 100) / 100,
    outColW: Math.round(outW * 100) / 100,
    w: Math.round((inW + outW) * 100) / 100,
  };
}

/**
 * @param {object} node
 * @param {object[]} customTypes
 */
function resolveNodeGear(node, customTypes) {
  const base = resolveGearType(String(node?.typeId ?? ""), customTypes);
  const override =
    node?.gearOverride && typeof node.gearOverride === "object"
      ? /** @type {Record<string, unknown>} */ (node.gearOverride)
      : null;
  if (!override) return base;
  const ports = Array.isArray(override.ports) ? override.ports : base.ports;
  return {
    ...base,
    ...override,
    ports,
    note: typeof override.note === "string" ? override.note : base.note,
  };
}

/**
 * @param {object[]} nodes
 */
function interactiveWorldBounds(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, Number(node.x) || 0);
    minY = Math.min(minY, Number(node.y) || 0);
    maxX = Math.max(maxX, (Number(node.x) || 0) + WORLD_NODE_W);
    maxY = Math.max(maxY, (Number(node.y) || 0) + WORLD_NODE_H);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0 };
  }
  return { minX: minX - WORLD_PAD, minY: minY - WORLD_PAD };
}

/**
 * @param {object} gear
 * @param {string | null | undefined} placeId
 * @param {{ id: string, name: string }[]} places
 * @param {ReturnType<typeof layoutMetrics>} m
 */
function nodeLayoutHeight(gear, placeId, places, m) {
  const ports = Array.isArray(gear?.ports) ? gear.ports : [];
  const hasPlace = Boolean(placeId && places.some((p) => p.id === placeId));
  const hasNote = typeof gear?.note === "string" && gear.note.trim();
  return (
    m.headerH +
    (hasPlace ? m.placeH : 0) +
    (hasNote ? m.noteH : 0) +
    m.colLabelH +
    Math.max(1, ports.length) * m.portRowH
  );
}

/**
 * Port edge anchors — same convention as signal-flow.js:
 * start exits the right edge of the from-cell; end enters the left of the to-cell.
 * @param {object} layout
 * @param {"input" | "output"} col
 * @param {"start" | "end"} end
 * @param {number} row
 * @param {ReturnType<typeof layoutMetrics>} m
 */
function portAnchor(layout, col, end, row, m) {
  const y =
    layout.y + layout.portTop + Math.max(0, row) * m.portRowH + m.portRowH / 2;
  const splitX = layout.x + layout.inColW;
  if (col === "output") {
    return end === "start"
      ? { x: layout.x + layout.w, y }
      : { x: splitX, y };
  }
  return end === "start" ? { x: splitX, y } : { x: layout.x, y };
}

/**
 * @param {object} conn
 * @param {{ minX: number, minY: number }} interactiveBounds
 */
function routeCornersWorld(conn, interactiveBounds) {
  if (!Array.isArray(conn?.route) || !conn.route.length) return [];
  if (conn.routeWorld) {
    return conn.route.map((p) => ({
      x: Number(p?.x) || 0,
      y: Number(p?.y) || 0,
    }));
  }
  return conn.route.map((p) => ({
    x: (Number(p?.x) || 0) + interactiveBounds.minX,
    y: (Number(p?.y) || 0) + interactiveBounds.minY,
  }));
}

/**
 * Mirror signal-flow.js connectionRouteWaypoints / connectionRoutePoints.
 * @param {object} conn
 * @param {Map<string, object>} layouts
 * @param {{ minX: number, minY: number }} interactiveBounds
 * @param {ReturnType<typeof layoutMetrics>} m
 */
function connectionPathPoints(conn, layouts, interactiveBounds, m) {
  const fromLayout = layouts.get(String(conn.fromNodeId));
  const toLayout = layouts.get(String(conn.toNodeId));
  if (!fromLayout || !toLayout) return null;
  const fromCol = conn.fromCol === "input" ? "input" : "output";
  const toCol = conn.toCol === "input" ? "input" : "output";
  const from = portAnchor(fromLayout, fromCol, "start", Number(conn.fromRow) || 0, m);
  const to = portAnchor(toLayout, toCol, "end", Number(conn.toRow) || 0, m);

  let inner;
  if (Array.isArray(conn.route) && conn.route.length > 0) {
    inner = repairRouteCorners(from, to, routeCornersWorld(conn, interactiveBounds));
  } else if (conn.routeX != null && Math.abs(to.y - from.y) >= 1) {
    const routeX =
      conn.routeWorld === true
        ? Number(conn.routeX) || 0
        : (Number(conn.routeX) || 0) + interactiveBounds.minX;
    inner = [
      { x: routeX, y: from.y },
      { x: routeX, y: to.y },
    ];
  } else {
    inner = resolveConnectionRoute({}, from, to);
  }
  return enforceEndStubs(buildPath(from, to, inner), DESIGN.portStub);
}

/**
 * Layout in interactive world units (scale 1). Font size is applied later via
 * a uniform scale so routes stay locked to the ports they were edited against.
 * @param {Record<string, unknown> | null | undefined} signalFlow
 */
function layoutSignalFlow(signalFlow) {
  const sf = signalFlow ?? null;
  if (!sf) return null;
  const nodes = Array.isArray(sf.nodes) ? sf.nodes : [];
  if (!nodes.length) return null;

  const m = layoutMetrics(1);
  const customTypes = Array.isArray(sf.customGearTypes) ? sf.customGearTypes : [];
  const places = (Array.isArray(sf.places) ? sf.places : []).map((place, index) => ({
    id: String(place?.id ?? `place-${index}`),
    name: String(place?.name ?? `Place ${index + 1}`),
  }));
  const connections = Array.isArray(sf.connections) ? sf.connections : [];
  const interactiveBounds = interactiveWorldBounds(nodes);

  /** @type {Map<string, object>} */
  const layouts = new Map();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  /** @param {number} x @param {number} y */
  const include = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const node of nodes) {
    const gear = resolveNodeGear(node, customTypes);
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const name = String(node.name ?? gear.defaultName ?? "Device");
    const cols = estimateNodeColumns(name, gear, m);
    const h = nodeLayoutHeight(gear, node.placeId, places, m);
    const hasPlace = Boolean(
      node.placeId && places.some((p) => p.id === node.placeId)
    );
    const hasNote = typeof gear?.note === "string" && gear.note.trim();
    const portTop =
      m.headerH +
      (hasPlace ? m.placeH : 0) +
      (hasNote ? m.noteH : 0) +
      m.colLabelH;
    layouts.set(String(node.id), {
      id: String(node.id),
      name,
      gear,
      placeId: node.placeId ?? null,
      x,
      y,
      w: cols.w,
      inColW: cols.inColW,
      outColW: cols.outColW,
      h,
      portTop,
      hasPlace,
      hasNote,
    });
    include(x, y);
    include(x + cols.w, y + h);
  }

  /** @type {{ conn: object, points: { x: number, y: number }[] }[]} */
  const wirePaths = [];
  for (const conn of connections) {
    const points = connectionPathPoints(conn, layouts, interactiveBounds, m);
    if (!points?.length) continue;
    wirePaths.push({ conn, points });
    for (const point of points) include(point.x, point.y);
  }

  if (!Number.isFinite(minX)) return null;

  const pad = m.contentPad + m.wireStrokePad;
  const originX = minX - pad;
  const originY = minY - pad;
  const contentWidth = Math.max(120, maxX - minX + pad * 2);
  const contentHeight = Math.max(120, maxY - minY + pad * 2);

  for (const layout of layouts.values()) {
    layout.x -= originX;
    layout.y -= originY;
  }
  for (const wire of wirePaths) {
    wire.points = wire.points.map((p) => ({
      x: p.x - originX,
      y: p.y - originY,
    }));
  }

  return {
    layouts,
    wirePaths,
    contentWidth,
    contentHeight,
    originX,
    originY,
    places,
    customTypes,
    m,
  };
}

/**
 * Scale the whole diagram (nodes + wires) so font size changes do not
 * desync ports from saved routes.
 * @param {NonNullable<ReturnType<typeof layoutSignalFlow>>} laid
 * @param {number} scale
 */
function applyContentScale(laid, scale) {
  const s = Math.max(0.5, scale);
  if (Math.abs(s - 1) < 1e-6) return laid;

  /** @param {number} n */
  const mul = (n) => Math.round(n * s * 100) / 100;

  for (const layout of laid.layouts.values()) {
    layout.x = mul(layout.x);
    layout.y = mul(layout.y);
    layout.w = mul(layout.w);
    layout.inColW = mul(layout.inColW);
    layout.outColW = mul(layout.outColW);
    layout.h = mul(layout.h);
    layout.portTop = mul(layout.portTop);
  }
  for (const wire of laid.wirePaths) {
    wire.points = wire.points.map((p) => ({ x: mul(p.x), y: mul(p.y) }));
  }
  laid.contentWidth = mul(laid.contentWidth);
  laid.contentHeight = mul(laid.contentHeight);
  laid.m = layoutMetrics(s);
  return laid;
}

/**
 * @param {object} conn
 * @param {Map<string, object>} layouts
 * @param {object[]} customTypes
 */
function connectionCableType(conn, layouts, customTypes) {
  /** @param {string} nodeId @param {number} row @param {"input" | "output"} col */
  const portType = (nodeId, row, col) => {
    const layout = layouts.get(nodeId);
    const gear = layout?.gear ?? resolveGearType("", customTypes);
    const port = gear.ports?.[row];
    if (!port) return null;
    const type = col === "input" ? port.inputType : port.outputType;
    return type && type !== "—" ? String(type) : null;
  };
  return (
    (conn.toCol === "input"
      ? portType(String(conn.toNodeId), Number(conn.toRow) || 0, "input")
      : null) ||
    (conn.fromCol === "input"
      ? portType(String(conn.fromNodeId), Number(conn.fromRow) || 0, "input")
      : null) ||
    (conn.fromCol === "output"
      ? portType(String(conn.fromNodeId), Number(conn.fromRow) || 0, "output")
      : null) ||
    (conn.toCol === "output"
      ? portType(String(conn.toNodeId), Number(conn.toRow) || 0, "output")
      : null)
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} signalFlow
 * @param {number} [paddingRatio]
 * @param {number} [fontSizePt]
 */
export function computeSignalFlowFitCrop(signalFlow, paddingRatio = 0.06, fontSizePt) {
  const base = layoutSignalFlow(signalFlow);
  if (!base) return null;
  const laid = applyContentScale(base, normalizeFontSizePt(fontSizePt) / 10);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  /** @param {number} x @param {number} y */
  const include = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const layout of laid.layouts.values()) {
    include(layout.x, layout.y);
    include(layout.x + layout.w, layout.y + layout.h);
  }
  for (const wire of laid.wirePaths) {
    for (const point of wire.points) include(point.x, point.y);
  }
  if (!Number.isFinite(minX)) return null;
  const padX = Math.max(24, (maxX - minX) * paddingRatio, laid.contentWidth * 0.03);
  const padY = Math.max(24, (maxY - minY) * paddingRatio, laid.contentHeight * 0.03);
  return normalizeGroundplanCrop(
    {
      x: minX - padX,
      y: minY - padY,
      w: maxX - minX + padX * 2,
      h: maxY - minY + padY * 2,
    },
    laid.contentWidth,
    laid.contentHeight
  );
}

/**
 * @param {string} label
 * @param {string} type
 * @param {number} x
 * @param {number} y
 * @param {"start" | "end"} anchor
 * @param {ReturnType<typeof layoutMetrics>} m
 * @param {string | null} [typeColor]
 */
function portLabelSvg(label, type, x, y, anchor, m, typeColor = null) {
  if (!label) return "";
  const typeFill = typeColor || "#64748b";
  const typePart =
    type && type !== "—"
      ? `<tspan dx="${m.fs(4)}" font-size="${m.fs(7)}" font-weight="600" letter-spacing="0.04em" fill="${escapeXml(
          typeFill
        )}">${escapeXml(type.toUpperCase())}</tspan>`
      : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${m.fs(9)}" fill="#0f172a" font-family="${FONT}">${escapeXml(
    label
  )}${typePart}</text>`;
}

/**
 * @param {object} layout
 * @param {{ id: string, name: string }[]} places
 * @param {ReturnType<typeof layoutMetrics>} m
 * @param {boolean} colorByCableType
 */
function buildNodeSvg(layout, places, m, colorByCableType) {
  const placeName = layout.hasPlace
    ? places.find((p) => p.id === layout.placeId)?.name ?? ""
    : "";
  const note =
    layout.hasNote && typeof layout.gear.note === "string"
      ? layout.gear.note.trim()
      : "";
  const ports = Array.isArray(layout.gear.ports) ? layout.gear.ports : [];
  const nodeW = layout.w;
  const midX = layout.inColW;
  const headerBottom = m.headerH + (layout.hasPlace ? m.placeH : 0);
  const noteTop = headerBottom;
  const colLabelTop = noteTop + (layout.hasNote ? m.noteH : 0);

  /** @type {string[]} */
  const parts = [
    `<rect x="0" y="0" width="${nodeW}" height="${layout.h}" rx="${m.radius}" ry="${m.radius}" fill="#ffffff" stroke="#111111" stroke-width="1.25" />`,
    `<rect x="0" y="0" width="${nodeW}" height="${headerBottom}" rx="${m.radius}" ry="${m.radius}" fill="#f8fafc" stroke="none" />`,
    `<rect x="0" y="${m.radius}" width="${nodeW}" height="${Math.max(
      0,
      headerBottom - m.radius
    )}" fill="#f8fafc" stroke="none" />`,
    `<line x1="0" y1="${headerBottom}" x2="${nodeW}" y2="${headerBottom}" stroke="#cbd5e1" stroke-width="1" />`,
    `<text x="${nodeW / 2}" y="${m.fs(18)}" text-anchor="middle" font-size="${m.fs(11)}" font-weight="600" fill="#0f172a" font-family="${FONT}">${escapeXml(
      layout.name
    )}</text>`,
  ];

  if (placeName) {
    parts.push(
      `<text x="${nodeW / 2}" y="${m.headerH + m.fs(10)}" text-anchor="middle" font-size="${m.fs(8)}" font-weight="600" letter-spacing="0.04em" fill="#64748b" font-family="${FONT}">${escapeXml(
        placeName.toUpperCase()
      )}</text>`
    );
  }

  if (note) {
    const clipped = note.length > 42 ? `${note.slice(0, 40)}…` : note;
    parts.push(
      `<text x="${nodeW / 2}" y="${noteTop + m.fs(12)}" text-anchor="middle" font-size="${m.fs(8)}" font-style="italic" fill="#64748b" font-family="${FONT}">${escapeXml(
        clipped
      )}</text>`,
      `<line x1="0" y1="${colLabelTop}" x2="${nodeW}" y2="${colLabelTop}" stroke="#cbd5e1" stroke-width="1" />`
    );
  }

  parts.push(
    `<text x="${midX * 0.5}" y="${colLabelTop + m.fs(12)}" text-anchor="middle" font-size="${m.fs(7.5)}" font-weight="600" letter-spacing="0.03em" fill="#64748b" font-family="${FONT}">INPUTS</text>`,
    `<text x="${midX + layout.outColW * 0.5}" y="${colLabelTop + m.fs(12)}" text-anchor="middle" font-size="${m.fs(7.5)}" font-weight="600" letter-spacing="0.03em" fill="#64748b" font-family="${FONT}">OUTPUTS</text>`,
    `<line x1="0" y1="${layout.portTop}" x2="${nodeW}" y2="${layout.portTop}" stroke="#cbd5e1" stroke-width="1" />`,
    `<line x1="${midX}" y1="${colLabelTop}" x2="${midX}" y2="${layout.h}" stroke="#cbd5e1" stroke-width="1" />`
  );

  const rowCount = Math.max(1, ports.length);
  for (let index = 0; index < rowCount; index += 1) {
    const port = ports[index] ?? {};
    const rowY = layout.portTop + index * m.portRowH;
    const cy = rowY + m.portRowH * 0.68;
    const input = port?.input && port.input !== "—" ? String(port.input) : "";
    const output = port?.output && port.output !== "—" ? String(port.output) : "";
    const inputType =
      port?.inputType && port.inputType !== "—" ? String(port.inputType) : "";
    const outputType =
      port?.outputType && port.outputType !== "—" ? String(port.outputType) : "";
    const inColor =
      colorByCableType && inputType ? connectorColor(inputType) : null;
    const outColor =
      colorByCableType && outputType ? connectorColor(outputType) : null;

    if (inColor) {
      parts.push(
        `<rect x="0" y="${rowY}" width="${midX}" height="${m.portRowH}" fill="${escapeXml(
          inColor
        )}" opacity="0.14" />`
      );
    }
    if (outColor) {
      parts.push(
        `<rect x="${midX}" y="${rowY}" width="${layout.outColW}" height="${m.portRowH}" fill="${escapeXml(
          outColor
        )}" opacity="0.14" />`
      );
    }

    if (index > 0) {
      parts.push(
        `<line x1="0" y1="${rowY}" x2="${midX}" y2="${rowY}" stroke="#e2e8f0" stroke-width="1" />`,
        `<line x1="${midX}" y1="${rowY}" x2="${nodeW}" y2="${rowY}" stroke="#e2e8f0" stroke-width="1" />`
      );
    }

    if (port?.inputDivider === true) {
      parts.push(
        `<line x1="0" y1="${rowY}" x2="${midX}" y2="${rowY}" stroke="#64748b" stroke-width="3" />`
      );
    }
    if (port?.outputDivider === true) {
      parts.push(
        `<line x1="${midX}" y1="${rowY}" x2="${nodeW}" y2="${rowY}" stroke="#64748b" stroke-width="3" />`
      );
    }

    parts.push(
      portLabelSvg(input, inputType, m.fs(8), cy, "start", m, inColor),
      portLabelSvg(output, outputType, nodeW - m.fs(8), cy, "end", m, outColor)
    );
  }

  return `<g class="pw-sf-node" transform="translate(${layout.x} ${layout.y})">${parts.join(
    ""
  )}</g>`;
}

/**
 * @param {Record<string, unknown> | null | undefined} signalFlow
 * @param {{
 *   crop?: { x: number, y: number, w: number, h: number } | null,
 *   showCropEditor?: boolean,
 *   colorByCableType?: boolean,
 *   fontSizePt?: number,
 *   frameWIn?: number,
 *   frameHIn?: number,
 * }} [options]
 */
export function buildSignalFlowSvg(signalFlow, options = {}) {
  const fontSizePt = normalizeFontSizePt(options.fontSizePt);
  // Route in interactive units first, then scale the whole diagram.
  const contentScale = fontSizePt / 10;
  const base = layoutSignalFlow(signalFlow);
  if (!base) return null;
  const laid = applyContentScale(base, contentScale);

  const {
    layouts,
    wirePaths,
    contentWidth,
    contentHeight,
    places,
    customTypes,
    m,
  } = laid;

  const colorByCableType =
    typeof options.colorByCableType === "boolean"
      ? options.colorByCableType
      : signalFlow?.colorByCableType === true;

  const storedCrop = normalizeGroundplanCrop(options.crop, contentWidth, contentHeight);
  const showCropEditor = options.showCropEditor === true;
  const editorCrop = showCropEditor
    ? storedCrop ?? fullImageCrop(contentWidth, contentHeight)
    : null;
  const viewCrop = showCropEditor ? null : storedCrop;
  const viewX = viewCrop?.x ?? 0;
  const viewY = viewCrop?.y ?? 0;
  const viewW = viewCrop?.w ?? contentWidth;
  const viewH = viewCrop?.h ?? contentHeight;

  const uid = `n${Math.abs(
    (wirePaths.length * 997 + layouts.size * 131 + Math.round(contentWidth)) % 1e9
  )}`;

  /** @type {string[]} */
  const wireParts = [];
  /** @type {Map<string, string>} */
  const markerIds = new Map();
  /** @param {string | null} color */
  const markerFor = (color) => {
    if (!color) return `pw-sf-arrow-${uid}`;
    let id = markerIds.get(color);
    if (!id) {
      id = `pw-sf-arrow-${uid}-c${markerIds.size}`;
      markerIds.set(color, id);
    }
    return id;
  };

  let connectionCount = 0;
  const wireWidth = Math.max(1.25, m.wireStroke);
  const cornerR = Math.max(4, m.wireCorner);
  for (const wire of wirePaths) {
    const d = roundedOrthoPolyline(wire.points, cornerR);
    if (!d) continue;
    connectionCount += 1;
    const cableType = connectionCableType(wire.conn, layouts, customTypes);
    const color = colorByCableType ? connectorColor(cableType) : null;
    // Match SF page stroke; slightly darker when not colorized for print contrast.
    const stroke = color || "#64748b";
    const marker = markerFor(color);
    wireParts.push(
      `<path d="${d}" fill="none" stroke="${escapeXml(
        stroke
      )}" stroke-width="${wireWidth}" stroke-linejoin="round" marker-end="url(#${marker})" />`
    );
  }

  const nodeParts = [...layouts.values()].map((layout) =>
    buildNodeSvg(layout, places, m, colorByCableType)
  );

  // Markers match signal-flow.js (8×8, ref 7/4, path M0,0 L8,4 L0,8 Z).
  const markerDefs = [
    `<marker id="pw-sf-arrow-${uid}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748b" /></marker>`,
    ...[...markerIds.entries()].map(
      ([color, id]) =>
        `<marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${escapeXml(
          color
        )}" /></marker>`
    ),
  ];

  const clipId = `pw-sf-view-clip-${uid}`;
  /** @type {string[]} */
  const parts = [
    `<rect x="0" y="0" width="${contentWidth}" height="${contentHeight}" fill="#ffffff" />`,
    ...wireParts,
    ...nodeParts,
  ];
  if (editorCrop) {
    parts.push(buildCropEditorMarkup(editorCrop, contentWidth, contentHeight));
  }

  const body = `<defs>${markerDefs.join(
    ""
  )}<clipPath id="${clipId}"><rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" /></clipPath></defs><g clip-path="url(#${clipId})">${parts.join(
    ""
  )}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" overflow="hidden" data-crop-width="${contentWidth}" data-crop-height="${contentHeight}" data-gp-image-width="${contentWidth}" data-gp-image-height="${contentHeight}">${body}</svg>`;

  return {
    svg,
    nodeCount: layouts.size,
    connectionCount,
    cropped: Boolean(storedCrop),
    contentWidth,
    contentHeight,
  };
}

export {
  normalizeGroundplanCrop as normalizeSignalFlowCrop,
  fullImageCrop as fullSignalFlowCrop,
};
