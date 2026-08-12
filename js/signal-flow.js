import { connectorColor, resolveGearType } from "./signal-flow-data.js";
import {
  normalizeGearEntry,
  serializeGearForCatalog,
} from "./signal-flow-gear-schema.js";
import { renderPremadeGearBrowser } from "./signal-flow-gear-browser.js";
import {
  mergeGearFolders,
  BUILTIN_FOLDERS,
  BUILTIN_GEAR_PLACEMENTS,
  builtinGearFolderId,
  collectFolderSubtreeIds,
  listGearInFolder,
  renameGearFolder,
  deleteGearFolder,
  isBuiltinGearId,
} from "./signal-flow-gear-library.js";
import {
  openGearBuilderModal,
  renderGearNoteRowHtml,
  renderGearPortRowsHtml,
} from "./signal-flow-gear-ui.js";
import { renderPlacesPanel } from "./signal-flow-places-ui.js";
import { queryCalcShell } from "./shared/calc-shell.js";
import { deepClone } from "./shared/clone.js";
import { escapeXml } from "./shared/dom.js";
import {
  applySegmentDrag,
  buildPath,
  enforceEndStubs,
  findNearestSegment,
  getSegmentHandlePositions,
  getWireSegments,
  repairRouteCorners,
  resolveConnectionRoute,
  roundedOrthoPath,
  roundedOrthoPolyline,
} from "./shared/ortho-path.js";
import { clampZoom, createTransformPanZoom } from "./shared/pan-zoom.js";
import { uid } from "./shared/id.js";
import { recordBefore } from "./undo-runtime.js";
import {
  SIGNAL_FLOW_GRID_DEFAULT_SIZE as GRID_DEFAULT_SIZE,
  SIGNAL_FLOW_GRID_MAX_SIZE as GRID_MAX_SIZE,
  SIGNAL_FLOW_GRID_MIN_SIZE as GRID_MIN_SIZE,
  emptySignalFlowState,
  normalizeSignalFlowGrid,
  normalizeSignalFlowState,
} from "./domain/signal-flow.js";

export {
  emptySignalFlowState,
  normalizeNodeLayout,
  normalizeSignalFlowGrid,
  normalizeSignalFlowState,
} from "./domain/signal-flow.js";

/**
 * @typedef {{
 *   w: number,
 *   h: number,
 *   inColW: number,
 *   outColW: number,
 *   portTop: number,
 *   portRowH: number,
 * }} FlowNodeLayout
 *
 * @typedef {{
 *   id: string,
 *   typeId: string,
 *   name: string,
 *   x: number,
 *   y: number,
 *   placeId?: string | null,
 *   gearOverride?: object,
 *   layout?: FlowNodeLayout,
 * }} FlowNode
 */

/** @typedef {{ id: string, name: string }} FlowPlace */

/** @typedef {{ id: string, label: string, defaultName: string, category: string, kind?: "premade" | "blank", folderId?: string | null, ports: { input: string, output: string }[] }} CustomGearType */

/** @typedef {{ id: string, name: string, parentId: string | null }} GearLibraryFolder */

/** @typedef {{ id: string, fromNodeId: string, fromRow: number, fromCol: "input" | "output", toNodeId: string, toRow: number, toCol: "input" | "output", route?: { x: number, y: number }[], routeX?: number, routeWorld?: boolean }} FlowConnection */

/** Minimum zoom before 25%/75% split handles appear. */
const SPLIT_HANDLE_MIN_ZOOM = 1.25;
/** Minimum on-screen segment length (px) before split handles appear. */
const SPLIT_HANDLE_MIN_SCREEN_PX = 72;
/** On-screen distance (px) within which a segment snaps to a parallel segment. */
const SEGMENT_SNAP_SCREEN_PX = 24;

/** Minimum pointer movement (px) before a node drag starts. */
const NODE_DRAG_THRESHOLD_PX = 4;

/**
 * Horizontal run (px) required where a wire leaves/enters a port: 10px of
 * fully straight line plus up to 10px consumed by the rounded corner.
 */
const PORT_STUB_PX = 20;
/** Max interval (ms) between taps to count as rename double-click. */
const NAME_RENAME_TAP_MS = 450;
/** Padding (world px) kept around gear when expanding the canvas. */
const WORLD_PAD = 1600;
/** Estimated node footprint for canvas bounds (world px). */
const WORLD_NODE_W = 320;
const WORLD_NODE_H = 240;
/** Default canvas size before any gear is placed. */
const WORLD_DEFAULT_W = 8000;
const WORLD_DEFAULT_H = 6000;

export function initSignalFlow() {
  const shell = queryCalcShell("signal-flow", {
    statusId: "sf-status",
    hintId: "sf-hint",
    resetViewId: "sf-reset-view",
    viewportId: "sf-viewport",
    worldId: "sf-world",
    paletteId: "sf-gear-palette",
  });

  if (!shell?.viewport || !shell.world || !shell.palette) {
    console.error("Signal Flow: required elements missing.");
    return null;
  }

  const els = {
    palette: shell.palette,
    viewport: shell.viewport,
    world: shell.world,
    svg: document.getElementById("sf-svg"),
    wireUi: document.getElementById("sf-wire-ui"),
    nodes: document.getElementById("sf-nodes"),
    marquee: document.getElementById("sf-marquee"),
    colorToggle: document.getElementById("sf-color-toggle"),
    gridUi: document.getElementById("sf-grid-ui"),
    gridBtn: document.getElementById("sf-grid-btn"),
    gridPopover: document.getElementById("sf-grid-popover"),
    gridSnapInput: /** @type {HTMLInputElement | null} */ (document.getElementById("sf-grid-snap")),
    gridSizeInput: /** @type {HTMLInputElement | null} */ (document.getElementById("sf-grid-size")),
    status: shell.status,
    hint: shell.hint,
    resetView: shell.resetView,
  };

  if (!els.svg || !els.nodes || !els.wireUi) {
    console.error("Signal Flow: canvas elements missing.");
    return null;
  }

  /** @type {{ nodes: FlowNode[], connections: FlowConnection[], customGearTypes: CustomGearType[], gearLibraryFolders: GearLibraryFolder[], places: FlowPlace[], colorByCableType: boolean, grid: { snap: boolean, size: number } }} */
  const state = {
    nodes: [],
    connections: [],
    customGearTypes: [],
    gearLibraryFolders: [],
    places: [],
    colorByCableType: false,
    grid: { snap: true, size: GRID_DEFAULT_SIZE },
  };

  /** @type {"premade" | "places"} */
  let gearPaletteMode = "premade";
  /** @type {Set<string>} */
  let expandedGearFolderIds = new Set(["fld-library", "fld-brands"]);
  /** @type {string | null} */
  let activeGearFolderId = null;
  /** @type {string | null} */
  let renamingGearFolderId = null;
  let gearSearchQuery = "";

  const panZoom = createTransformPanZoom({
    viewport: els.viewport,
    world: els.world,
    defaultPan: { x: 40, y: 40 },
    defaultZoom: 1,
    onChange: () => renderWires(),
  });

  const nodeDrag = {
    pending: false,
    active: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    moved: false,
    /** @type {Map<string, { x: number, y: number }>} */
    startPositions: new Map(),
  };
  const marqueeSelect = {
    pending: false,
    active: false,
    moved: false,
    addToSelection: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  };
  /** @type {{ minX: number, minY: number, w: number, h: number }} */
  let worldBounds = { minX: 0, minY: 0, w: WORLD_DEFAULT_W, h: WORLD_DEFAULT_H };
  const wireDrag = {
    active: false,
    fromNodeId: null,
    fromRow: 0,
    fromCol: /** @type {"input" | "output"} */ ("input"),
    startX: 0,
    startY: 0,
    previewPath: null,
  };
  const routeDrag = {
    active: false,
    connectionId: null,
    segmentIndex: null,
    segmentKind: /** @type {"horizontal" | "vertical" | null} */ (null),
    handleT: 0.5,
    startPoints: /** @type {{ x: number, y: number }[] | null} */ (null),
    moved: false,
  };

  /** @type {Set<string>} */
  const selectedNodeIds = new Set();
  let selectedConnectionId = null;
  let suppressWireClick = false;
  let suppressClearSelection = false;
  /** @type {string | null} */
  let editingNodeNameId = null;
  let editingNodeNameOriginal = "";
  const nameTap = { nodeId: /** @type {string | null} */ (null), time: 0 };

  function clearNodeSelection() {
    selectedNodeIds.clear();
  }

  /** @param {string[]} ids @param {{ add?: boolean }} [options] */
  function setNodeSelection(ids, { add = false } = {}) {
    if (!add) selectedNodeIds.clear();
    for (const id of ids) selectedNodeIds.add(id);
  }

  /** @param {string} id */
  function toggleNodeSelection(id) {
    if (selectedNodeIds.has(id)) selectedNodeIds.delete(id);
    else selectedNodeIds.add(id);
  }

  function showMarquee(x1, y1, x2, y2) {
    if (!els.marquee) return;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    els.marquee.hidden = false;
    els.marquee.style.left = `${left}px`;
    els.marquee.style.top = `${top}px`;
    els.marquee.style.width = `${Math.abs(x2 - x1)}px`;
    els.marquee.style.height = `${Math.abs(y2 - y1)}px`;
  }

  function hideMarquee() {
    if (!els.marquee) return;
    els.marquee.hidden = true;
  }

  /** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
  function nodeIdsInMarquee(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    /** @type {string[]} */
    const hits = [];

    for (const node of state.nodes) {
      const nodeEl = els.nodes.querySelector(`[data-node-id="${node.id}"]`);
      if (!nodeEl) continue;
      const nx = /** @type {HTMLElement} */ (nodeEl).offsetLeft;
      const ny = /** @type {HTMLElement} */ (nodeEl).offsetTop;
      const nw = /** @type {HTMLElement} */ (nodeEl).offsetWidth;
      const nh = /** @type {HTMLElement} */ (nodeEl).offsetHeight;
      if (nx + nw >= left && nx <= right && ny + nh >= top && ny <= bottom) {
        hits.push(node.id);
      }
    }

    return hits;
  }

  function captureNodeDragStarts() {
    nodeDrag.startPositions = new Map();
    for (const id of selectedNodeIds) {
      const node = state.nodes.find((n) => n.id === id);
      if (node) nodeDrag.startPositions.set(id, { x: node.x, y: node.y });
    }
  }

  function setStatus(msg) {
    shell.setStatus(msg);
  }

  /** @param {FlowConnection[]} connections @param {number} minX @param {number} minY */
  function migrateConnectionRoutesToWorld(connections, minX, minY) {
    for (const conn of connections) {
      if (conn.routeWorld) continue;
      if (Array.isArray(conn.route)) {
        conn.route = conn.route.map((p) => ({
          x: p.x + minX,
          y: p.y + minY,
        }));
      }
      if (conn.routeX != null) {
        conn.routeX += minX;
      }
      if (conn.route?.length || conn.routeX != null) {
        conn.routeWorld = true;
      }
    }
  }

  function computeWorldBounds() {
    let minX = 0;
    let minY = 0;
    let maxX = WORLD_DEFAULT_W;
    let maxY = WORLD_DEFAULT_H;

    for (const node of state.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + WORLD_NODE_W);
      maxY = Math.max(maxY, node.y + WORLD_NODE_H);
    }

    minX -= WORLD_PAD;
    minY -= WORLD_PAD;
    maxX += WORLD_PAD;
    maxY += WORLD_PAD;

    return {
      minX,
      minY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  function syncWorldBounds() {
    const prev = worldBounds;
    const next = computeWorldBounds();
    const deltaMinX = next.minX - prev.minX;
    const deltaMinY = next.minY - prev.minY;

    worldBounds = next;
    els.world.style.width = `${next.w}px`;
    els.world.style.height = `${next.h}px`;

    if (deltaMinX !== 0 || deltaMinY !== 0) {
      panZoom.view.panX += deltaMinX * panZoom.view.zoom;
      panZoom.view.panY += deltaMinY * panZoom.view.zoom;
      panZoom.applyView();
      updateAllNodeDisplayPositions();
    }
    syncGridBackground();
  }

  /** Snap a world-space coordinate to the grid (no-op when snapping is off). */
  function snapWorld(value) {
    if (!state.grid.snap) return value;
    return Math.round(value / state.grid.size) * state.grid.size;
  }

  /** Snap a display-space coordinate so it lands on the world-space grid. */
  function snapDisplayX(value) {
    return snapWorld(value + worldBounds.minX) - worldBounds.minX;
  }

  /** @see snapDisplayX */
  function snapDisplayY(value) {
    return snapWorld(value + worldBounds.minY) - worldBounds.minY;
  }

  /** Align the visible grid pattern with the world-space snap grid. */
  function syncGridBackground() {
    const size = state.grid.size;
    els.world.classList.toggle("sf-grid-visible", state.grid.snap);
    els.world.style.setProperty("--sf-grid-size", `${size}px`);
    const offX = (((-worldBounds.minX) % size) + size) % size;
    const offY = (((-worldBounds.minY) % size) + size) % size;
    els.world.style.backgroundPosition = `${offX}px ${offY}px`;
  }

  /** @param {FlowNode} node */
  function nodeDisplayPosition(node) {
    return {
      x: node.x - worldBounds.minX,
      y: node.y - worldBounds.minY,
    };
  }

  function updateAllNodeDisplayPositions() {
    for (const node of state.nodes) {
      const nodeEl = els.nodes.querySelector(`[data-node-id="${node.id}"]`);
      if (!nodeEl) continue;
      const display = nodeDisplayPosition(node);
      /** @type {HTMLElement} */ (nodeEl).style.left = `${display.x}px`;
      /** @type {HTMLElement} */ (nodeEl).style.top = `${display.y}px`;
    }
  }

  /** @param {FlowNode} node @param {number} row @param {"input" | "output"} col */
  function getPortElement(nodeId, row, col) {
    return els.nodes.querySelector(
      `.sf-node[data-node-id="${nodeId}"] [data-port-row="${row}"][data-port-col="${col}"]`
    );
  }

  /** @param {HTMLElement} portEl @param {"start" | "end"} end */
  function portAnchor(portEl, end) {
    const nodeEl = portEl.closest(".sf-node");
    if (!nodeEl) return { x: 0, y: 0 };
    const col = portEl.dataset.portCol;
    const nx = /** @type {HTMLElement} */ (nodeEl).offsetLeft;
    const ny = /** @type {HTMLElement} */ (nodeEl).offsetTop;
    const px = portEl.offsetLeft;
    const py = portEl.offsetTop;
    const pw = portEl.offsetWidth;
    const ph = portEl.offsetHeight;
    const y = ny + py + ph / 2;
    let x;
    if (end === "start") {
      x = nx + px + pw;
    } else if (col === "input") {
      x = nx + px;
    } else {
      x = nx + px;
    }
    return { x, y };
  }

  /** @param {FlowConnection} conn */
  function connectionEndpoints(conn) {
    const fromEl = getPortElement(conn.fromNodeId, conn.fromRow, conn.fromCol);
    const toEl = getPortElement(conn.toNodeId, conn.toRow, conn.toCol);
    if (!fromEl || !toEl) return null;
    return {
      from: portAnchor(fromEl, "start"),
      to: portAnchor(toEl, "end"),
    };
  }

  /** @param {FlowConnection} conn */
  function connectionRoutePoints(conn) {
    const pts = connectionEndpoints(conn);
    if (!pts) return null;
    const { from, to } = pts;
    const waypoints = connectionRouteWaypoints(conn, from, to);
    return enforceEndStubs(buildPath(from, to, waypoints), PORT_STUB_PX);
  }

  /** @param {FlowConnection} conn */
  function connectionPath(conn) {
    const points = connectionRoutePoints(conn);
    if (!points) return "";
    return roundedOrthoPolyline(points);
  }

  /** @param {FlowConnection} conn @param {{ x: number, y: number }[]} corners Display-space inner waypoints */
  function persistConnectionRoute(conn, corners) {
    if (corners.length === 0) {
      delete conn.route;
      delete conn.routeX;
      delete conn.routeWorld;
      return;
    }
    conn.route = corners.map((p) => ({
      x: p.x + worldBounds.minX,
      y: p.y + worldBounds.minY,
    }));
    conn.routeWorld = true;
    delete conn.routeX;
  }

  /** @param {FlowConnection} conn @returns {{ x: number, y: number }[]} */
  function connectionRouteWaypoints(conn, from, to) {
    if (Array.isArray(conn.route) && conn.route.length > 0) {
      const inner = conn.routeWorld
        ? conn.route.map((p) => ({
            x: p.x - worldBounds.minX,
            y: p.y - worldBounds.minY,
          }))
        : conn.route.map((p) => ({ ...p }));
      // Port anchors can move after a route is saved (nodes dragged, port
      // rows resized, world bounds recomputed). Repair the route against the
      // current endpoints so every leg stays orthogonal and the drawn wire
      // matches its drag handles.
      return repairRouteCorners(from, to, inner);
    }
    if (conn.routeX != null && Math.abs(to.y - from.y) >= 1) {
      const routeX = conn.routeWorld ? conn.routeX - worldBounds.minX : conn.routeX;
      return [
        { x: routeX, y: from.y },
        { x: routeX, y: to.y },
      ];
    }
    return resolveConnectionRoute(conn, from, to);
  }

  /**
   * Cable type of a connection, from the input-side port when available.
   * @param {FlowConnection} conn
   */
  function connectionCableType(conn) {
    /** @param {string} nodeId @param {number} row @param {"input" | "output"} col */
    const portType = (nodeId, row, col) => {
      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return null;
      const port = nodeGear(node).ports?.[row];
      if (!port) return null;
      const type = col === "input" ? port.inputType : port.outputType;
      return type && type !== "—" ? type : null;
    };
    return (
      (conn.toCol === "input" ? portType(conn.toNodeId, conn.toRow, "input") : null) ||
      (conn.fromCol === "input" ? portType(conn.fromNodeId, conn.fromRow, "input") : null) ||
      (conn.fromCol === "output" ? portType(conn.fromNodeId, conn.fromRow, "output") : null) ||
      (conn.toCol === "output" ? portType(conn.toNodeId, conn.toRow, "output") : null)
    );
  }

  function renderWires() {
    const { w, h } = worldBounds;
    const colorize = state.colorByCableType;

    /** Distinct wire colors in use, mapped to generated marker ids. @type {Map<string, string>} */
    const markerIds = new Map();
    /** @param {string | null} color */
    const markerFor = (color) => {
      if (!color) return "sf-arrow";
      let id = markerIds.get(color);
      if (!id) {
        id = `sf-arrow-c${markerIds.size}`;
        markerIds.set(color, id);
      }
      return id;
    };

    const wireParts = state.connections
      .map((conn) => {
        const d = connectionPath(conn);
        if (!d) return "";
        const selected = conn.id === selectedConnectionId;
        const color = colorize ? connectorColor(connectionCableType(conn)) : null;
        const strokeStyle = color && !selected ? ` style="stroke:${color}"` : "";
        return `
          <path class="sf-wire-hit" data-connection-id="${conn.id}" d="${d}" />
          <path class="sf-wire${selected ? " is-selected" : ""}" d="${d}"${strokeStyle} marker-end="url(#${markerFor(color)})" />`;
      })
      .join("");

    const preview = wireDrag.previewPath
      ? `<path class="sf-wire sf-wire-preview" d="${wireDrag.previewPath}" marker-end="url(#sf-arrow)" />`
      : "";

    const colorMarkers = [...markerIds.entries()]
      .map(
        ([color, id]) => `
        <marker id="${id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${color}" />
        </marker>`
      )
      .join("");

    els.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    els.svg.setAttribute("width", String(w));
    els.svg.setAttribute("height", String(h));
    els.svg.innerHTML = `
      <defs>
        <marker id="sf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
        </marker>
        ${colorMarkers}
      </defs>
      ${wireParts}
      ${preview}`;

    renderWireUi(w, h);
  }

  function renderWireUi(w, h) {
    if (!selectedConnectionId) {
      els.wireUi.innerHTML = "";
      els.wireUi.removeAttribute("viewBox");
      els.wireUi.removeAttribute("width");
      els.wireUi.removeAttribute("height");
      return;
    }

    els.wireUi.setAttribute("viewBox", `0 0 ${w} ${h}`);
    els.wireUi.setAttribute("width", String(w));
    els.wireUi.setAttribute("height", String(h));

    const conn = state.connections.find((c) => c.id === selectedConnectionId);
    const points = conn ? connectionRoutePoints(conn) : null;
    if (!conn || !points) {
      els.wireUi.innerHTML = "";
      return;
    }

    // Keep handle elements alive during an active drag so pointer capture is not lost.
    if (routeDrag.active && routeDrag.connectionId === conn.id) {
      return;
    }

    const segments = getWireSegments(points);
    const zoom = panZoom.view.zoom;
    const showSplitHandles = zoom >= SPLIT_HANDLE_MIN_ZOOM;

    const segHits = segments
      .map((seg) => {
        const x1 = seg.kind === "horizontal" ? seg.x1 : seg.midX;
        const y1 = seg.kind === "horizontal" ? seg.midY : seg.y1;
        const x2 = seg.kind === "horizontal" ? seg.x2 : seg.midX;
        const y2 = seg.kind === "horizontal" ? seg.midY : seg.y2;
        return `
        <line class="sf-seg-hit sf-seg-${seg.kind}" data-connection-id="${conn.id}"
          data-segment-index="${seg.index}" data-segment-kind="${seg.kind}" data-handle-t="0.5"
          x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
      })
      .join("");

    const handles = getSegmentHandlePositions(points)
      .filter((hnd) => {
        if (hnd.t === 0.5) return true;
        if (!showSplitHandles) return false;
        const seg = segments.find((s) => s.index === hnd.segmentIndex);
        if (!seg) return false;
        const worldLen = seg.kind === "horizontal" ? seg.x2 - seg.x1 : seg.y2 - seg.y1;
        return worldLen * zoom >= SPLIT_HANDLE_MIN_SCREEN_PX;
      })
      .map(
        (hnd) => `
        <circle class="sf-wire-handle sf-seg-${hnd.kind}" data-connection-id="${conn.id}"
          data-segment-index="${hnd.segmentIndex}" data-segment-kind="${hnd.kind}"
          data-handle-t="${hnd.t}" cx="${hnd.x}" cy="${hnd.y}" r="7" />`
      )
      .join("");

    els.wireUi.innerHTML = segHits + handles;
  }

  /** @param {FlowConnection} conn @param {{ x: number, y: number }[]} corners */
  function applyConnectionRoute(conn, corners) {
    persistConnectionRoute(conn, corners);
    renderWires();
  }

  /** @param {FlowConnection} conn */
  function selectConnection(conn) {
    selectedConnectionId = conn.id;
    clearNodeSelection();
    renderNodes();
    bindNodeEvents();
    renderWires();
    refreshPlacesPanelIfActive();
    setStatus("Wire selected — drag blue handles to move segments. Zoom in for split handles at 25% and 75%.");
  }

  /** @param {PointerEvent} e */
  function startSegmentDrag(e) {
    const target = /** @type {SVGElement} */ (e.target);
    const connId = target.dataset.connectionId;
    if (!connId) return;
    const conn = state.connections.find((c) => c.id === connId);
    if (!conn) return;

    const segmentIndex = Number(target.dataset.segmentIndex);
    const segmentKind = target.dataset.segmentKind === "vertical" ? "vertical" : "horizontal";
    const handleT = Number(target.dataset.handleT) || 0.5;
    if (Number.isNaN(segmentIndex)) return;

    const points = connectionRoutePoints(conn);
    if (!points) return;

    e.stopPropagation();
    e.preventDefault();

    selectedConnectionId = connId;
    clearNodeSelection();

    routeDrag.active = true;
    routeDrag.connectionId = connId;
    routeDrag.segmentIndex = segmentIndex;
    routeDrag.segmentKind = segmentKind;
    routeDrag.handleT = handleT;
    routeDrag.startPoints = points.map((p) => ({ ...p }));
    routeDrag.moved = false;

    els.wireUi.setPointerCapture(e.pointerId);
    setStatus("Drag to reroute this section of the wire.");
  }

  /** @param {PointerEvent} e */
  function selectWireAtPoint(e) {
    if (e.button !== 0 || e.target.closest?.(".sf-node")) return;

    const pt = panZoom.clientToWorld(e.clientX, e.clientY);
    const threshold = 16 / panZoom.view.zoom;
    let bestConn = null;
    let bestDist = threshold;

    for (const conn of state.connections) {
      const points = connectionRoutePoints(conn);
      if (!points) continue;
      const seg = findNearestSegment(points, pt.x, pt.y, threshold);
      if (!seg) continue;
      let dist;
      if (seg.kind === "horizontal") {
        dist =
          pt.x < seg.x1
            ? Math.hypot(pt.x - seg.x1, pt.y - seg.midY)
            : pt.x > seg.x2
              ? Math.hypot(pt.x - seg.x2, pt.y - seg.midY)
              : Math.abs(pt.y - seg.midY);
      } else {
        dist =
          pt.y < seg.y1
            ? Math.hypot(pt.x - seg.midX, pt.y - seg.y1)
            : pt.y > seg.y2
              ? Math.hypot(pt.x - seg.midX, pt.y - seg.y2)
              : Math.abs(pt.x - seg.midX);
      }
      if (dist <= bestDist) {
        bestDist = dist;
        bestConn = conn;
      }
    }

    if (!bestConn) return;

    e.stopPropagation();
    suppressClearSelection = true;
    selectConnection(bestConn);
  }

  /** @param {import("./signal-flow-data.js").GearType} gearType @param {number} x @param {number} y */
  function createNode(gearType, x, y) {
    recordBefore("signalFlow", "create-node");
    const node = {
      id: uid("sf"),
      typeId: gearType.id,
      name: gearType.defaultName,
      x: snapWorld(x),
      y: snapWorld(y),
    };
    state.nodes.push(node);
    // Full render: renderNodes() alone would leave the rebuilt node elements
    // without their pointer handlers until something else re-bound them.
    render();
    setStatus(`Added ${node.name}. Drag from a port cell to connect gear.`);
    return node;
  }

  function tryStartNameEditFromTap(nodeId, e) {
    const now = performance.now();
    if (nameTap.nodeId === nodeId && now - nameTap.time < NAME_RENAME_TAP_MS) {
      e.stopPropagation();
      e.preventDefault();
      nameTap.nodeId = null;
      nameTap.time = 0;
      nodeDrag.pending = false;
      nodeDrag.active = false;
      nodeDrag.nodeId = null;
      startNameEdit(nodeId);
      return true;
    }
    nameTap.nodeId = nodeId;
    nameTap.time = now;
    return false;
  }

  function updateNodeSelection() {
    els.nodes.querySelectorAll(".sf-node").forEach((el) => {
      el.classList.toggle("is-selected", selectedNodeIds.has(el.dataset.nodeId ?? ""));
    });
    refreshPlacesPanelIfActive();
  }

  function startNameEdit(nodeId) {
    nodeDrag.pending = false;
    nodeDrag.active = false;
    nodeDrag.nodeId = null;
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    editingNodeNameId = node.id;
    editingNodeNameOriginal = node.name;
    setNodeSelection([node.id]);
    selectedConnectionId = null;
    renderNodes();
    bindNodeEvents();
    requestAnimationFrame(() => {
      const input = /** @type {HTMLInputElement | null} */ (
        els.nodes.querySelector(`.sf-node[data-node-id="${node.id}"] .sf-node-name.is-editing`)
      );
      input?.focus();
      input?.select();
    });
  }

  function finishNameEdit(save = true) {
    if (!editingNodeNameId) return;
    const node = state.nodes.find((n) => n.id === editingNodeNameId);
    const input = /** @type {HTMLInputElement | null} */ (
      els.nodes.querySelector(`.sf-node[data-node-id="${editingNodeNameId}"] .sf-node-name.is-editing`)
    );
    if (save && node && input) {
      const next = input.value.trim() || editingNodeNameOriginal || node.name;
      if (next !== node.name) recordBefore("signalFlow", "rename-node");
      node.name = next;
    } else if (node) {
      node.name = editingNodeNameOriginal || node.name;
    }
    editingNodeNameId = null;
    editingNodeNameOriginal = "";
    renderNodes();
    bindNodeEvents();
  }

  /**
   * Capture live DOM chrome so Paperwork can rebuild the same port anchors
   * the interactive canvas used when routing wires. Skip zero-size nodes
   * (hidden tab) so a prior good layout is kept.
   */
  function measureNodeLayouts() {
    for (const node of state.nodes) {
      const nodeEl = /** @type {HTMLElement | null} */ (
        els.nodes.querySelector(`.sf-node[data-node-id="${node.id}"]`)
      );
      if (!nodeEl) continue;
      const w = nodeEl.offsetWidth;
      const h = nodeEl.offsetHeight;
      if (w < 1 || h < 1) continue;

      const inPort = /** @type {HTMLElement | null} */ (
        nodeEl.querySelector('[data-port-col="input"]')
      );
      const outPort = /** @type {HTMLElement | null} */ (
        nodeEl.querySelector('[data-port-col="output"]')
      );
      let inColW = inPort?.offsetWidth ?? 0;
      let outColW = outPort?.offsetWidth ?? 0;
      if (inColW < 1 && outColW < 1) {
        inColW = w / 2;
        outColW = w / 2;
      } else if (inColW < 1) {
        inColW = Math.max(1, w - outColW);
      } else if (outColW < 1) {
        outColW = Math.max(1, w - inColW);
      }

      const firstPort = /** @type {HTMLElement | null} */ (
        nodeEl.querySelector('[data-port-row="0"]') ??
          nodeEl.querySelector("[data-port-row]")
      );
      let portTop = 0;
      let portRowH = 22;
      if (firstPort) {
        // Match portAnchor(): offsets relative to the node chrome.
        if (firstPort.offsetParent && firstPort.offsetParent !== nodeEl) {
          const nodeRect = nodeEl.getBoundingClientRect();
          const portRect = firstPort.getBoundingClientRect();
          const zoom = panZoom.view.zoom || 1;
          portTop = Math.max(0, (portRect.top - nodeRect.top) / zoom);
          portRowH = Math.max(1, portRect.height / zoom);
        } else {
          portTop = Math.max(0, firstPort.offsetTop);
          portRowH = Math.max(1, firstPort.offsetHeight || 22);
        }
      }

      node.layout = {
        w: Math.round(w),
        h: Math.round(h),
        inColW: Math.round(inColW),
        outColW: Math.round(outColW),
        portTop: Math.round(portTop),
        portRowH: Math.round(portRowH),
      };
    }
  }

  function renderNodes() {
    els.nodes.innerHTML = state.nodes
      .map((node) => {
        const gear = nodeGear(node);
        const selected = selectedNodeIds.has(node.id);
        const editingName = node.id === editingNodeNameId;
        const portRows = renderGearPortRowsHtml(gear.ports, {
          colorize: state.colorByCableType,
          interactive: true,
        });

        const placeName = node.placeId ? getPlaceName(node.placeId) : null;
        const placeLine = placeName
          ? `<div class="sf-node-place" title="Assigned place">${escapeXml(placeName)}</div>`
          : "";

        const nameField = editingName
          ? `<input type="text" class="sf-node-name is-editing" value="${escapeXml(node.name)}" maxlength="48" aria-label="Device name" />`
          : `<span class="sf-node-name" title="Double-click to rename">${escapeXml(node.name)}</span>`;

        const display = nodeDisplayPosition(node);

        return `
      <div class="sf-node${selected ? " is-selected" : ""}" data-node-id="${node.id}" style="left:${display.x}px;top:${display.y}px">
        <table class="sf-node-table">
          <thead>
            <tr>
              <th class="sf-node-header" colspan="2">
                ${nameField}
                ${placeLine}
                <button type="button" class="sf-node-edit" title="Edit this device only" aria-label="Edit this device only">✎</button>
              </th>
            </tr>
            ${renderGearNoteRowHtml(gear.note)}
            <tr class="sf-col-labels">
              <th>Inputs</th>
              <th>Outputs</th>
            </tr>
          </thead>
          <tbody>${portRows}</tbody>
        </table>
      </div>`;
      })
      .join("");
    measureNodeLayouts();
  }

  function bindNodeEvents() {
    els.nodes.querySelectorAll(".sf-node-name.is-editing").forEach((inputEl) => {
      const input = /** @type {HTMLInputElement} */ (inputEl);
      const nodeEl = input.closest(".sf-node");
      const node = state.nodes.find((n) => n.id === nodeEl?.dataset.nodeId);
      if (!node) return;

      input.addEventListener("input", () => {
        node.name = input.value;
      });
      input.addEventListener("blur", () => finishNameEdit(true));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finishNameEdit(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finishNameEdit(false);
        }
      });
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
      input.addEventListener("mousedown", (e) => e.stopPropagation());
    });

    els.nodes.querySelectorAll(".sf-node-edit").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nodeEl = btn.closest(".sf-node");
        const nodeId = nodeEl instanceof HTMLElement ? nodeEl.dataset.nodeId : null;
        if (nodeId) openNodeGearEditModal(nodeId);
      });
    });

    els.nodes.querySelectorAll(".sf-node").forEach((nodeEl) => {
      nodeEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest(".sf-port") || target.closest(".sf-node-name.is-editing")) return;
        if (target.closest(".sf-node-edit")) return;

        const nodeId = nodeEl.dataset.nodeId;
        if (
          nodeId &&
          target.closest(".sf-node-header") &&
          tryStartNameEditFromTap(nodeId, e)
        ) {
          return;
        }

        beginNodePointer(nodeEl, e);
      });
    });

    els.nodes.querySelectorAll(".sf-port").forEach((portEl) => {
      portEl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const nodeEl = portEl.closest(".sf-node");
        if (!nodeEl) return;
        const nodeId = nodeEl.dataset.nodeId;
        const row = Number(portEl.dataset.portRow) || 0;
        const col = portEl.dataset.portCol === "output" ? "output" : "input";
        if (!nodeId) return;

        wireDrag.active = true;
        wireDrag.fromNodeId = nodeId;
        wireDrag.fromRow = row;
        wireDrag.fromCol = col;
        const anchor = portAnchor(portEl, "start");
        wireDrag.startX = anchor.x;
        wireDrag.startY = anchor.y;
        wireDrag.previewPath = null;
      });
    });
  }

  /** @param {Element} nodeEl @param {PointerEvent} e */
  function beginNodePointer(nodeEl, e) {
    if (editingNodeNameId) finishNameEdit(true);
    const node = state.nodes.find((n) => n.id === nodeEl.dataset.nodeId);
    if (!node) return;

    if (e.shiftKey) {
      toggleNodeSelection(node.id);
      updateNodeSelection();
      if (!selectedNodeIds.has(node.id)) return;
    } else if (!selectedNodeIds.has(node.id)) {
      setNodeSelection([node.id]);
    }

    selectedConnectionId = null;
    nodeDrag.pending = true;
    nodeDrag.active = false;
    nodeDrag.nodeId = node.id;
    nodeDrag.moved = false;
    nodeDrag.startX = e.clientX;
    nodeDrag.startY = e.clientY;
    captureNodeDragStarts();
    updateNodeSelection();
    nodeEl.setPointerCapture(e.pointerId);
  }

  function render() {
    syncWorldBounds();
    renderNodes();
    bindNodeEvents();
    renderWires();
  }

  function getGearType(typeId) {
    return resolveGearType(typeId, state.customGearTypes);
  }

  /**
   * Effective gear definition for a placed node: its instance-only override
   * when present, otherwise the shared gear type from the library.
   * @param {FlowNode} node
   */
  function nodeGear(node) {
    return node.gearOverride ?? getGearType(node.typeId);
  }

  function bindPaletteDragItems() {
    els.palette.querySelectorAll(".sf-palette-item").forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        const typeId = item.dataset.gearType;
        if (!typeId || !e.dataTransfer) return;
        e.dataTransfer.setData("text/av-gear-type", typeId);
        if (item.dataset.movable === "1") {
          e.dataTransfer.setData("text/av-gear-library-move", typeId);
          e.dataTransfer.setData("text/av-gear-from-folder", item.dataset.folderId ?? "");
          e.dataTransfer.effectAllowed = "copyMove";
        } else {
          e.dataTransfer.effectAllowed = "copy";
        }
      });
    });
  }

  function getPlaceName(placeId) {
    return state.places.find((p) => p.id === placeId)?.name ?? null;
  }

  function refreshPlacesPanelIfActive() {
    if (gearPaletteMode === "places") populatePalette();
  }

  function addPlace(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const duplicate = state.places.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) return false;
    recordBefore("signalFlow", "add-place");
    state.places.push({ id: uid("place"), name: trimmed });
    state.places.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    populatePalette();
    setStatus(`Added place “${trimmed}”.`);
    return true;
  }

  function renamePlace(placeId, name) {
    const trimmed = name.trim();
    const place = state.places.find((p) => p.id === placeId);
    if (!place || !trimmed) return false;
    const duplicate = state.places.some(
      (p) => p.id !== placeId && p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) return false;
    recordBefore("signalFlow", "rename-place");
    place.name = trimmed;
    state.places.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    renderNodes();
    bindNodeEvents();
    populatePalette();
    setStatus(`Renamed place to “${trimmed}”.`);
    return true;
  }

  function deletePlace(placeId) {
    const place = state.places.find((p) => p.id === placeId);
    if (!place) return;
    recordBefore("signalFlow", "delete-place");
    state.places = state.places.filter((p) => p.id !== placeId);
    for (const node of state.nodes) {
      if (node.placeId === placeId) node.placeId = null;
    }
    renderNodes();
    bindNodeEvents();
    populatePalette();
    setStatus(`Removed place “${place.name}”.`);
  }

  function assignSelectedNodePlace(placeId) {
    const ids = [...selectedNodeIds];
    if (ids.length === 0) {
      setStatus("Select one or more devices on the canvas first.");
      return;
    }

    recordBefore("signalFlow", "assign-place");
    for (const id of ids) {
      const node = state.nodes.find((n) => n.id === id);
      if (node) node.placeId = placeId;
    }

    renderNodes();
    bindNodeEvents();
    populatePalette();

    if (placeId) {
      const placeName = getPlaceName(placeId);
      setStatus(
        ids.length === 1
          ? `Assigned ${state.nodes.find((n) => n.id === ids[0])?.name ?? "device"} to ${placeName}.`
          : `Assigned ${ids.length} devices to ${placeName}.`
      );
    } else {
      setStatus(
        ids.length === 1
          ? `Cleared place assignment for ${state.nodes.find((n) => n.id === ids[0])?.name ?? "device"}.`
          : `Cleared place assignment for ${ids.length} devices.`
      );
    }
  }
  function expandFolderAncestors(folderId) {
    const allFolders = mergeGearFolders(BUILTIN_FOLDERS, state.gearLibraryFolders);
    let current = allFolders.find((f) => f.id === folderId);
    while (current?.parentId) {
      expandedGearFolderIds.add(current.parentId);
      current = allFolders.find((f) => f.id === current.parentId);
    }
  }

  function addCustomGearType(gear) {
    recordBefore("signalFlow", "add-gear");
    gear.folderId = activeGearFolderId;
    gear.kind = "premade";
    state.customGearTypes.push(gear);
    populatePalette();
    setStatus(`Added ${gear.label} to the premade palette.`);
  }

  /**
   * Save an edited gear type. Custom gear is updated in place; built-in
   * catalog gear gets a same-id override in the user layer that shadows it
   * (and keeps its catalog folder placement).
   * @param {string} gearId
   * @param {CustomGearType} updated
   */
  function applyGearEdit(gearId, updated) {
    recordBefore("signalFlow", "edit-gear");
    updated.id = gearId;
    updated.kind = "premade";
    const existing = state.customGearTypes.find((g) => g.id === gearId);
    if (existing) {
      updated.folderId = existing.folderId ?? null;
      Object.assign(existing, updated);
      // Object.assign cannot remove keys; a cleared note must be deleted.
      if (!updated.note) delete existing.note;
    } else {
      if (isBuiltinGearId(gearId)) updated.folderId = builtinGearFolderId(gearId);
      state.customGearTypes.push(updated);
    }

    const removed = pruneInvalidConnections();
    populatePalette();
    render();
    setStatus(
      removed > 0
        ? `Updated ${updated.label}. Removed ${removed} connection${removed === 1 ? "" : "s"} that lost a port.`
        : `Updated ${updated.label}.`
    );
  }

  /** @param {string} nodeId @param {number} row @param {"input" | "output"} col */
  function portExistsAt(nodeId, row, col) {
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    const port = nodeGear(node).ports?.[row];
    if (!port) return false;
    const label = col === "input" ? port.input : port.output;
    return Boolean(label && label !== "—");
  }

  /**
   * Drop connections whose endpoints no longer land on a real port (after a
   * gear edit changed port rows). Returns how many were removed.
   */
  function pruneInvalidConnections() {
    const before = state.connections.length;
    state.connections = state.connections.filter(
      (c) =>
        portExistsAt(c.fromNodeId, c.fromRow, c.fromCol) &&
        portExistsAt(c.toNodeId, c.toRow, c.toCol)
    );
    if (selectedConnectionId && !state.connections.some((c) => c.id === selectedConnectionId)) {
      selectedConnectionId = null;
    }
    return before - state.connections.length;
  }

  /** @param {string} filename @param {unknown} data */
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export the selected folder subtree (or, with no folder selected, all
   * custom gear) as a catalog JSON file in the data/gear format.
   */
  function exportGearLibrary() {
    const customPremade = state.customGearTypes.filter((g) => g.kind !== "blank");
    /** @type {CustomGearType[]} */
    let gearList;
    let baseName;

    if (activeGearFolderId) {
      const allFolders = mergeGearFolders(BUILTIN_FOLDERS, state.gearLibraryFolders);
      const folder = allFolders.find((f) => f.id === activeGearFolderId);
      const subtree = collectFolderSubtreeIds(allFolders, activeGearFolderId);
      gearList = [];
      for (const folderId of subtree) {
        gearList.push(
          ...listGearInFolder(allFolders, BUILTIN_GEAR_PLACEMENTS, customPremade, folderId)
        );
      }
      baseName = folder?.name ?? "gear";
    } else {
      gearList = customPremade;
      baseName = "custom-gear";
    }

    if (gearList.length === 0) {
      setStatus("Nothing to export — the selection has no gear.");
      return;
    }

    const slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `${slug || "gear"}.json`;
    downloadJson(filename, { gear: gearList.map((g) => serializeGearForCatalog(g)) });
    setStatus(`Exported ${gearList.length} gear item${gearList.length === 1 ? "" : "s"} to ${filename}.`);
  }

  /**
   * Import gear from a catalog JSON file. Same-id custom gear is replaced,
   * same-id built-in gear becomes an override, and new gear lands in the
   * selected folder.
   * @param {File} file
   */
  async function importGearCatalog(file) {
    try {
      const data = JSON.parse(await file.text());
      const entries = Array.isArray(data) ? data : Array.isArray(data?.gear) ? data.gear : null;
      if (!entries) throw new Error('expected a JSON file with a "gear" array');

      recordBefore("signalFlow", "import-gear");
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const raw of entries) {
        const gear = normalizeGearEntry(raw);
        if (!gear || gear.kind === "blank") {
          skipped += 1;
          continue;
        }
        const existing = state.customGearTypes.find((g) => g.id === gear.id);
        if (existing) {
          gear.folderId = existing.folderId ?? null;
          Object.assign(existing, gear);
          if (!gear.note) delete existing.note;
          updated += 1;
        } else if (isBuiltinGearId(gear.id)) {
          gear.folderId = builtinGearFolderId(gear.id);
          state.customGearTypes.push(gear);
          updated += 1;
        } else {
          gear.folderId = activeGearFolderId;
          state.customGearTypes.push(gear);
          added += 1;
        }
      }

      pruneInvalidConnections();
      populatePalette();
      render();
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (updated) parts.push(`${updated} updated`);
      if (skipped) parts.push(`${skipped} skipped`);
      setStatus(
        parts.length
          ? `Imported gear from ${file.name}: ${parts.join(", ")}.`
          : `No gear found in ${file.name}.`
      );
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : "invalid file"}.`);
    }
  }

  function addGearLibraryFolder(folder) {
    recordBefore("signalFlow", "add-folder");
    state.gearLibraryFolders.push(folder);
    if (folder.parentId) expandedGearFolderIds.add(folder.parentId);
    expandedGearFolderIds.add(folder.id);
    activeGearFolderId = folder.id;
    renamingGearFolderId = folder.id;
    populatePalette();
    setStatus(`Created folder “${folder.name}”.`);
  }

  /** @param {string} folderId */
  function beginRenameGearFolder(folderId) {
    renamingGearFolderId = folderId;
    activeGearFolderId = folderId;
    populatePalette();
  }

  function cancelRenameGearFolder() {
    renamingGearFolderId = null;
    populatePalette();
  }

  /** @param {string} folderId @param {string} name */
  function commitRenameGearFolder(folderId, name) {
    const allFolders = mergeGearFolders(BUILTIN_FOLDERS, state.gearLibraryFolders);
    recordBefore("signalFlow", "rename-folder");
    const ok = renameGearFolder(state.gearLibraryFolders, folderId, name, allFolders);
    if (!ok) return false;
    renamingGearFolderId = null;
    activeGearFolderId = folderId;
    populatePalette();
    setStatus(`Renamed folder to “${name.trim()}”.`);
    return true;
  }

  /** @param {string} folderId */
  function removeGearLibraryFolder(folderId) {
    recordBefore("signalFlow", "delete-folder");
    const result = deleteGearFolder(state.gearLibraryFolders, folderId);
    if (!result) {
      setStatus("Only custom folders can be deleted.");
      return;
    }

    const removedGearCount = state.customGearTypes.filter(
      (gear) => gear.folderId && result.deletedIds.has(gear.folderId)
    ).length;
    state.customGearTypes = state.customGearTypes.filter(
      (gear) => !(gear.folderId && result.deletedIds.has(gear.folderId))
    );
    for (const id of result.deletedIds) {
      expandedGearFolderIds.delete(id);
    }
    if (renamingGearFolderId && result.deletedIds.has(renamingGearFolderId)) {
      renamingGearFolderId = null;
    }
    activeGearFolderId = result.parentId;
    if (activeGearFolderId) expandedGearFolderIds.add(activeGearFolderId);
    populatePalette();
    setStatus(
      removedGearCount > 0
        ? `Deleted folder “${result.name}” and ${removedGearCount} gear item${removedGearCount === 1 ? "" : "s"}.`
        : `Deleted folder “${result.name}”.`
    );
  }

  /** @param {string} gearId @param {string | null} folderId */
  function moveGearToFolder(gearId, folderId) {
    if (isBuiltinGearId(gearId)) {
      setStatus("Built-in brand gear stays in its library folder.");
      return false;
    }
    const gear = state.customGearTypes.find((g) => g.id === gearId);
    if (!gear) return false;
    const nextFolderId = folderId || null;
    if ((gear.folderId ?? null) === nextFolderId) return false;
    if (nextFolderId) {
      const allFolders = mergeGearFolders(BUILTIN_FOLDERS, state.gearLibraryFolders);
      if (!allFolders.some((f) => f.id === nextFolderId)) return false;
      expandFolderAncestors(nextFolderId);
      expandedGearFolderIds.add(nextFolderId);
    }
    gear.folderId = nextFolderId;
    activeGearFolderId = nextFolderId;
    populatePalette();
    const dest =
      nextFolderId == null
        ? "root"
        : mergeGearFolders(BUILTIN_FOLDERS, state.gearLibraryFolders).find((f) => f.id === nextFolderId)
            ?.name ?? "folder";
    setStatus(`Moved ${gear.label} to ${dest}.`);
    return true;
  }

  function toggleGearFolder(folderId) {
    if (expandedGearFolderIds.has(folderId)) expandedGearFolderIds.delete(folderId);
    else expandedGearFolderIds.add(folderId);
    activeGearFolderId = folderId;
    expandFolderAncestors(folderId);
    populatePalette();
  }

  function selectGearFolder(folderId) {
    activeGearFolderId = folderId;
    if (folderId) {
      expandFolderAncestors(folderId);
      expandedGearFolderIds.add(folderId);
    }
    populatePalette();
  }

  function syncGearModeButtons() {
    const root = document.getElementById("signal-flow");
    root?.querySelectorAll(".sf-gear-mode").forEach((el) => {
      const active = el.dataset.mode === gearPaletteMode;
      el.classList.toggle("active", active);
      el.setAttribute("aria-selected", String(active));
    });
  }

  function openGearModal() {
    const root = document.getElementById("signal-flow");
    if (!root) return;
    openGearBuilderModal({
      mount: root,
      onSave: (gear) => {
        addCustomGearType(gear);
      },
    });
  }

  /** @param {string} gearId */
  function openGearEditModal(gearId) {
    const root = document.getElementById("signal-flow");
    if (!root) return;
    const gear = getGearType(gearId);
    if (!gear || gear.id !== gearId) return;
    openGearBuilderModal({
      mount: root,
      gear,
      onSave: (updated) => applyGearEdit(gearId, updated),
    });
  }

  /**
   * Edit one placed device without touching the gear library: the result is
   * stored on the node as an instance-only override.
   * @param {string} nodeId
   */
  function openNodeGearEditModal(nodeId) {
    const root = document.getElementById("signal-flow");
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!root || !node) return;
    openGearBuilderModal({
      mount: root,
      gear: nodeGear(node),
      onSave: (updated) => {
        node.gearOverride = updated;
        const removed = pruneInvalidConnections();
        render();
        setStatus(
          removed > 0
            ? `Updated ${node.name} (this device only). Removed ${removed} connection${removed === 1 ? "" : "s"} that lost a port.`
            : `Updated ${node.name} (this device only).`
        );
      },
    });
  }

  function populatePalette() {
    if (gearPaletteMode === "premade") {
      const customPremade = state.customGearTypes.filter((g) => g.kind !== "blank");

      renderPremadeGearBrowser({
        container: els.palette,
        userFolders: state.gearLibraryFolders,
        customPremade,
        expandedFolderIds: expandedGearFolderIds,
        activeFolderId: activeGearFolderId,
        renamingFolderId: renamingGearFolderId,
        onToggleFolder: toggleGearFolder,
        onSelectFolder: selectGearFolder,
        onCreateGear: () => openGearModal(),
        onCreateFolder: addGearLibraryFolder,
        onRenameFolder: commitRenameGearFolder,
        onDeleteFolder: removeGearLibraryFolder,
        onMoveGear: moveGearToFolder,
        onBeginRenameFolder: beginRenameGearFolder,
        onCancelRenameFolder: cancelRenameGearFolder,
        onEditGear: openGearEditModal,
        onExportFolder: exportGearLibrary,
        onImportCatalog: importGearCatalog,
        searchQuery: gearSearchQuery,
        onSearchChange: setGearSearchQuery,
      });
    } else {
      renderPlacesPanel({
        container: els.palette,
        places: state.places,
        nodes: state.nodes,
        selectedNodeIds: [...selectedNodeIds],
        onAddPlace: (name) => {
          if (!addPlace(name)) {
            window.alert("Enter a unique place name.");
          }
        },
        onRenamePlace: renamePlace,
        onDeletePlace: deletePlace,
        onAssignPlace: assignSelectedNodePlace,
      });
    }

    bindPaletteDragItems();
  }

  /** @param {string} query */
  function setGearSearchQuery(query) {
    gearSearchQuery = query;
    populatePalette();
    // Re-render replaces the input, so restore focus and caret position.
    const input = /** @type {HTMLInputElement | null} */ (
      els.palette.querySelector("#sf-gear-search")
    );
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }

  function bindGearModeToggle() {
    const root = document.getElementById("signal-flow");
    if (!root) return;

    root.querySelectorAll(".sf-gear-mode").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode === "places" ? "places" : "premade";
        gearPaletteMode = mode;

        root.querySelectorAll(".sf-gear-mode").forEach((el) => {
          const active = el === btn;
          el.classList.toggle("active", active);
          el.setAttribute("aria-selected", String(active));
        });

        populatePalette();
      });
    });
  }

  els.viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });

  els.viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    const typeId = e.dataTransfer?.getData("text/av-gear-type");
    if (!typeId) return;
    const gear = getGearType(typeId);
    const pt = panZoom.clientToWorld(e.clientX, e.clientY);
    createNode(gear, pt.x + worldBounds.minX - 80, pt.y + worldBounds.minY - 40);
  });

  window.addEventListener("pointermove", (e) => {
    if (panZoom.isPanning) return;

    if (routeDrag.active && routeDrag.connectionId && routeDrag.segmentIndex != null) {
      const conn = state.connections.find((c) => c.id === routeDrag.connectionId);
      const endpoints = conn ? connectionEndpoints(conn) : null;
      if (conn && endpoints && routeDrag.startPoints) {
        const pt = panZoom.clientToWorld(e.clientX, e.clientY);
        const snapThreshold = SEGMENT_SNAP_SCREEN_PX / panZoom.view.zoom;
        const waypoints = applySegmentDrag(
          endpoints.from,
          endpoints.to,
          routeDrag.startPoints,
          routeDrag.segmentIndex,
          routeDrag.handleT,
          snapDisplayX(pt.x),
          snapDisplayY(pt.y),
          snapThreshold
        );
        if (!routeDrag.moved) recordBefore("signalFlow", "route-drag");
        routeDrag.moved = true;
        persistConnectionRoute(conn, waypoints);
        renderWires();
      }
      return;
    }

    if (wireDrag.active) {
      const pt = panZoom.clientToWorld(e.clientX, e.clientY);
      wireDrag.previewPath = roundedOrthoPath(wireDrag.startX, wireDrag.startY, pt.x, pt.y);
      renderWires();
      return;
    }

    if (nodeDrag.pending && nodeDrag.nodeId && !nodeDrag.active) {
      const dx = e.clientX - nodeDrag.startX;
      const dy = e.clientY - nodeDrag.startY;
      if (Math.abs(dx) > NODE_DRAG_THRESHOLD_PX || Math.abs(dy) > NODE_DRAG_THRESHOLD_PX) {
        recordBefore("signalFlow", "move-nodes");
        nodeDrag.active = true;
        nodeDrag.pending = false;
        nodeDrag.moved = true;
        nameTap.nodeId = null;
        nameTap.time = 0;
      }
    }

    if (marqueeSelect.pending || marqueeSelect.active) {
      const pt = panZoom.clientToWorld(e.clientX, e.clientY);
      marqueeSelect.currentX = pt.x;
      marqueeSelect.currentY = pt.y;
      const mdx = marqueeSelect.currentX - marqueeSelect.startX;
      const mdy = marqueeSelect.currentY - marqueeSelect.startY;
      if (
        marqueeSelect.pending &&
        (Math.abs(mdx) > NODE_DRAG_THRESHOLD_PX || Math.abs(mdy) > NODE_DRAG_THRESHOLD_PX)
      ) {
        marqueeSelect.pending = false;
        marqueeSelect.active = true;
        marqueeSelect.moved = true;
        selectedConnectionId = null;
      }
      if (marqueeSelect.active) {
        showMarquee(
          marqueeSelect.startX,
          marqueeSelect.startY,
          marqueeSelect.currentX,
          marqueeSelect.currentY
        );
      }
      return;
    }

    if (nodeDrag.active && nodeDrag.startPositions.size > 0) {
      const dx = (e.clientX - nodeDrag.startX) / panZoom.view.zoom;
      const dy = (e.clientY - nodeDrag.startY) / panZoom.view.zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) nodeDrag.moved = true;

      for (const [id, start] of nodeDrag.startPositions) {
        const node = state.nodes.find((n) => n.id === id);
        if (!node) continue;
        node.x = snapWorld(start.x + dx);
        node.y = snapWorld(start.y + dy);
        const nodeEl = els.nodes.querySelector(`[data-node-id="${node.id}"]`);
        if (nodeEl) {
          const display = nodeDisplayPosition(node);
          /** @type {HTMLElement} */ (nodeEl).style.left = `${display.x}px`;
          /** @type {HTMLElement} */ (nodeEl).style.top = `${display.y}px`;
        }
      }

      syncWorldBounds();
      renderWires();
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (routeDrag.active) {
      const moved = routeDrag.moved;
      routeDrag.active = false;
      routeDrag.connectionId = null;
      routeDrag.segmentIndex = null;
      routeDrag.segmentKind = null;
      routeDrag.startPoints = null;
      routeDrag.handleT = 0.5;
      routeDrag.moved = false;
      try {
        els.wireUi.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may not be captured */
      }
      renderWires();
      if (moved) {
        suppressWireClick = true;
        setStatus("Connection route updated.");
      }
    }

    if (wireDrag.active) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const targetPort = target?.closest(".sf-port");
      const targetNode = targetPort?.closest(".sf-node");

      if (targetPort && targetNode && targetNode.dataset.nodeId !== wireDrag.fromNodeId) {
        recordBefore("signalFlow", "connect");
        state.connections.push({
          id: uid("wire"),
          fromNodeId: wireDrag.fromNodeId,
          fromRow: wireDrag.fromRow,
          fromCol: wireDrag.fromCol,
          toNodeId: targetNode.dataset.nodeId,
          toRow: Number(targetPort.dataset.portRow) || 0,
          toCol: targetPort.dataset.portCol === "output" ? "output" : "input",
        });
        setStatus("Connection added.");
      }

      wireDrag.active = false;
      wireDrag.previewPath = null;
      renderWires();
    }

    if (marqueeSelect.pending || marqueeSelect.active) {
      const wasActive = marqueeSelect.active;
      const wasMoved = marqueeSelect.moved;
      const add = marqueeSelect.addToSelection;

      if (wasActive && wasMoved) {
        const ids = nodeIdsInMarquee(
          marqueeSelect.startX,
          marqueeSelect.startY,
          marqueeSelect.currentX,
          marqueeSelect.currentY
        );
        setNodeSelection(ids, { add });
        updateNodeSelection();
        suppressClearSelection = true;
        setStatus(`Selected ${ids.length} device${ids.length === 1 ? "" : "s"}.`);
      } else if (marqueeSelect.pending) {
        selectWireAtPoint(e);
      }

      marqueeSelect.pending = false;
      marqueeSelect.active = false;
      marqueeSelect.moved = false;
      hideMarquee();
      try {
        els.viewport.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may not be captured */
      }
    }

    if (nodeDrag.pending || nodeDrag.active) {
      nodeDrag.pending = false;
      nodeDrag.active = false;
      nodeDrag.nodeId = null;
      nodeDrag.startPositions.clear();
    }
  });

  /**
   * Abandon every in-flight pointer gesture. Without this, a missed pointerup
   * (browser pointercancel, window losing focus mid-drag) left wireDrag or
   * marqueeSelect stuck "active", which swallowed the next clicks until
   * something happened to reset them.
   */
  function cancelPointerGestures() {
    routeDrag.active = false;
    routeDrag.connectionId = null;
    routeDrag.segmentIndex = null;
    routeDrag.segmentKind = null;
    routeDrag.startPoints = null;
    routeDrag.handleT = 0.5;
    routeDrag.moved = false;
    if (wireDrag.active) {
      wireDrag.active = false;
      wireDrag.previewPath = null;
      renderWires();
    }
    marqueeSelect.pending = false;
    marqueeSelect.active = false;
    marqueeSelect.moved = false;
    hideMarquee();
    nodeDrag.pending = false;
    nodeDrag.active = false;
    nodeDrag.nodeId = null;
    nodeDrag.startPositions.clear();
    suppressWireClick = false;
    suppressClearSelection = false;
  }

  window.addEventListener("pointercancel", cancelPointerGestures);
  window.addEventListener("blur", cancelPointerGestures);

  // Stale suppression flags (set on a pointerup whose click never arrived)
  // would otherwise eat the next click. Any new press starts with a clean
  // slate; handlers that set these flags do so on pointerup, after this runs.
  window.addEventListener("pointerdown", () => {
    suppressWireClick = false;
    suppressClearSelection = false;
  });

  els.wireUi.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = /** @type {SVGElement} */ (e.target);
    if (target.classList?.contains("sf-wire-handle") || target.classList?.contains("sf-seg-hit")) {
      startSegmentDrag(e);
    }
  });

  els.svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = /** @type {SVGElement} */ (e.target);
    if (!target.classList?.contains("sf-wire-hit")) return;
    const connId = target.dataset.connectionId;
    const conn = state.connections.find((c) => c.id === connId);
    if (!conn) return;
    e.stopPropagation();
    suppressClearSelection = true;
    selectConnection(conn);
  });

  els.viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || panZoom.isPanning) return;
    const target = /** @type {Element} */ (e.target);
    if (target.closest?.(".sf-node") || target.closest?.(".sf-wire-ui")) return;
    if (target.closest?.(".sf-grid-ui")) return;
    if (target.classList?.contains("sf-wire-hit")) return;

    finishNameEdit(true);
    const pt = panZoom.clientToWorld(e.clientX, e.clientY);
    marqueeSelect.pending = true;
    marqueeSelect.active = false;
    marqueeSelect.moved = false;
    marqueeSelect.addToSelection = e.shiftKey;
    marqueeSelect.startX = pt.x;
    marqueeSelect.startY = pt.y;
    marqueeSelect.currentX = pt.x;
    marqueeSelect.currentY = pt.y;

    try {
      els.viewport.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  els.viewport.addEventListener("click", (e) => {
    if (suppressWireClick) {
      suppressWireClick = false;
      return;
    }
    if (suppressClearSelection) {
      suppressClearSelection = false;
      return;
    }
    const target = /** @type {Element} */ (e.target);
    if (target.closest?.(".sf-node")) return;
    if (target.closest?.(".sf-wire-ui")) return;
    finishNameEdit(true);
    nameTap.nodeId = null;
    nameTap.time = 0;
    clearNodeSelection();
    selectedConnectionId = null;
    render();
    refreshPlacesPanelIfActive();
  });

  /** Pan/zoom so every placed device fits in the viewport. */
  function fitViewToGear() {
    if (state.nodes.length === 0) {
      panZoom.resetView({ x: 40, y: 40 }, 1);
      setStatus("Reset canvas view.");
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of state.nodes) {
      const nodeEl = /** @type {HTMLElement | null} */ (
        els.nodes.querySelector(`[data-node-id="${node.id}"]`)
      );
      const display = nodeDisplayPosition(node);
      const w = nodeEl?.offsetWidth || WORLD_NODE_W;
      const h = nodeEl?.offsetHeight || WORLD_NODE_H;
      minX = Math.min(minX, display.x);
      minY = Math.min(minY, display.y);
      maxX = Math.max(maxX, display.x + w);
      maxY = Math.max(maxY, display.y + h);
    }

    // Wires can be routed well outside the node boxes; include every route
    // point so no connection gets cut off.
    for (const conn of state.connections) {
      const points = connectionRoutePoints(conn);
      if (!points) continue;
      for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }

    const pad = 60;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const vw = els.viewport.clientWidth;
    const vh = els.viewport.clientHeight;
    if (!vw || !vh) return;

    // Zoom out as far as needed (down to the wheel-zoom minimum), but never
    // zoom in past 100% when there is only a little gear.
    const zoom = clampZoom(Math.min(vw / (maxX - minX), vh / (maxY - minY)), 0.35, 1);
    panZoom.view.zoom = zoom;
    panZoom.view.panX = (vw - (maxX - minX) * zoom) / 2 - minX * zoom;
    panZoom.view.panY = (vh - (maxY - minY) * zoom) / 2 - minY * zoom;
    panZoom.applyView();
    setStatus(`Fit ${state.nodes.length} device${state.nodes.length === 1 ? "" : "s"} in view.`);
  }

  els.resetView?.addEventListener("click", () => {
    fitViewToGear();
  });

  document.addEventListener("keydown", (e) => {
    const panel = document.getElementById("signal-flow");
    const tab = document.querySelector('.tab[data-tab="signal-flow"]');
    if (!panel || panel.hidden || !tab?.classList.contains("active")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && (selectedNodeIds.size > 0 || selectedConnectionId)) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      recordBefore("signalFlow", "delete");
      if (selectedConnectionId) {
        state.connections = state.connections.filter((c) => c.id !== selectedConnectionId);
        selectedConnectionId = null;
        render();
        setStatus("Removed connection.");
        return;
      }
      const ids = new Set(selectedNodeIds);
      state.connections = state.connections.filter(
        (c) => !ids.has(c.fromNodeId) && !ids.has(c.toNodeId)
      );
      state.nodes = state.nodes.filter((n) => !ids.has(n.id));
      clearNodeSelection();
      render();
      setStatus(`Removed ${ids.size} device${ids.size === 1 ? "" : "s"}.`);
    }
  });

  function exportState() {
    measureNodeLayouts();
    return deepClone(state);
  }

  /** @param {object} data */
  function importState(data) {
    if (!data || !Array.isArray(data.nodes)) {
      throw new Error("Invalid signal flow state.");
    }
    state.nodes = deepClone(data.nodes);
    state.connections = Array.isArray(data.connections) ? deepClone(data.connections) : [];
    state.customGearTypes = Array.isArray(data.customGearTypes)
      ? deepClone(data.customGearTypes).filter((g) => g.kind !== "blank")
      : [];
    state.gearLibraryFolders = Array.isArray(data.gearLibraryFolders)
      ? deepClone(data.gearLibraryFolders)
      : [];
    state.places = Array.isArray(data.places) ? deepClone(data.places) : [];
    state.colorByCableType = Boolean(data.colorByCableType);
    syncColorToggle();
    state.grid = normalizeSignalFlowGrid(data.grid);
    syncGridControls();
    expandedGearFolderIds = new Set(["fld-library", "fld-brands"]);
    activeGearFolderId = null;
    renamingGearFolderId = null;
    clearNodeSelection();
    selectedConnectionId = null;
    editingNodeNameId = null;
    editingNodeNameOriginal = "";
    populatePalette();
    const bounds = computeWorldBounds();
    migrateConnectionRoutesToWorld(state.connections, bounds.minX, bounds.minY);
    render();
    setStatus(`Loaded ${state.nodes.length} device${state.nodes.length === 1 ? "" : "s"}.`);
  }

  function syncColorToggle() {
    els.colorToggle?.setAttribute("aria-pressed", String(state.colorByCableType));
    els.colorToggle?.classList.toggle("active", state.colorByCableType);
  }

  function syncGridControls() {
    if (els.gridSnapInput) els.gridSnapInput.checked = state.grid.snap;
    if (els.gridSizeInput) els.gridSizeInput.value = String(state.grid.size);
    syncGridBackground();
  }

  function bindGridControls() {
    if (!els.gridBtn || !els.gridPopover) return;

    const setOpen = (open) => {
      els.gridPopover.hidden = !open;
      els.gridBtn.setAttribute("aria-expanded", String(open));
    };

    els.gridBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(els.gridPopover.hidden);
    });
    els.gridPopover.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => setOpen(false));

    els.gridSnapInput?.addEventListener("change", () => {
      recordBefore("signalFlow", "grid-snap");
      state.grid.snap = Boolean(els.gridSnapInput?.checked);
      syncGridBackground();
      setStatus(state.grid.snap ? `Snapping to ${state.grid.size}px grid.` : "Grid snapping off.");
    });

    els.gridSizeInput?.addEventListener("change", () => {
      recordBefore("signalFlow", "grid-size");
      state.grid = normalizeGrid({ snap: state.grid.snap, size: els.gridSizeInput?.value });
      syncGridControls();
      if (state.grid.snap) setStatus(`Snapping to ${state.grid.size}px grid.`);
    });
  }

  els.colorToggle?.addEventListener("click", () => {
    recordBefore("signalFlow", "color-toggle");
    state.colorByCableType = !state.colorByCableType;
    syncColorToggle();
    render();
    setStatus(
      state.colorByCableType
        ? "Coloring lines and ports by cable type."
        : "Cable type coloring off."
    );
  });

  // Wire endpoints are measured from port cell positions, which are wrong
  // while the panel is hidden. Re-render once each time the tab is shown.
  document.getElementById("signal-flow")?.addEventListener("tab-shown", () => {
    render();
  });

  panZoom.bind();
  bindGearModeToggle();
  bindGridControls();
  populatePalette();
  panZoom.applyView();
  syncColorToggle();
  syncGridControls();
  render();
  setStatus("Choose premade gear on the left, then drag devices onto the canvas.");

  return { exportState, importState, addPlace, renamePlace, deletePlace };
}

export const calculatorPlugin = {
  meta: {
    id: "signal-flow",
    tabPanelId: "signal-flow",
    stateKey: "signalFlow",
    label: "Signal Flow Chart",
    requiredForSave: false,
    emptyState: emptySignalFlowState,
    validateState: normalizeSignalFlowState,
  },
  init: initSignalFlow,
};
