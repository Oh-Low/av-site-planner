import { getCalculatorExport, getCalculatorInstance } from "./calculator-instances.js";
import { renderPlacesPalette, bindPlacesAddForm } from "./groundplan-places-ui.js";
import { emptyGroundplanScale, groundplanPluginMeta } from "./groundplan-meta.js";
import {
  formatDistance,
  formatHeightOffset,
  getMetersPerPixel,
  heightMetersToInputValue,
  imperialToMeters,
  metersToImperial,
  parseHeightInput,
  pixelDistance,
  polylineLengthMeters,
  routeLengthMeters,
} from "./groundplan-units.js";
import { queryCalcShell } from "./shared/calc-shell.js";
import {
  bindColorSwatchButtons,
  DEFAULT_PALETTE_COLOR,
  ensureColorPalettePopover,
  normalizeHexColor,
  renderColorSwatchButton,
} from "./shared/color-palette.js";
import { deepClone } from "./shared/clone.js";
import { escapeXml, isPanPointerDown } from "./shared/dom.js";
import { uid } from "./shared/id.js";
import { createTransformPanZoom } from "./shared/pan-zoom.js";

/** @typedef {"metric" | "imperial"} DistanceUnit */

/** @typedef {{ x: number, y: number }} Point */

/** @typedef {{ placeId: string, x: number, y: number, width?: number, height?: number, color?: string, shape?: PlaceShape }} PlaceMarker */

/** @typedef {"rect" | "slant" | "pill" | "triangle"} PlaceShape */

/** @typedef {{ x: number, y: number, heightMeters?: number | null }} RoutePoint */

/** @typedef {{ id: string, fromPlaceId: string, toPlaceId: string, points: RoutePoint[], color?: string, labelX?: number | null, labelY?: number | null }} CableRoute */

const DEFAULT_ROUTE_COLOR = DEFAULT_PALETTE_COLOR;
const DEFAULT_PLACE_COLOR = DEFAULT_PALETTE_COLOR;
const DEFAULT_PLACE_SHAPE = /** @type {PlaceShape} */ ("rect");
/** @type {PlaceShape[]} */
const PLACE_SHAPES = ["rect", "slant", "pill", "triangle"];
/** @type {Record<PlaceShape, string>} */
const PLACE_SHAPE_GLYPHS = {
  rect: "▭",
  slant: "▱",
  pill: "⬭",
  triangle: "△",
};
/** @type {Record<string, PlaceShape>} */
const LEGACY_PLACE_SHAPES = {
  rounded: "rect",
  diamond: "slant",
  circle: "pill",
};

/** @typedef {{ id: string, points: Point[] }} RulerLine */

/** @typedef {{
 *   pointA: Point | null,
 *   pointB: Point | null,
 *   unit: DistanceUnit,
 *   distanceMeters: number | null,
 * }} GroundplanScale */

const WORLD_PAD = 80;
const DEFAULT_MARKER_W = 120;
const DEFAULT_MARKER_H = 36;
const MIN_MARKER_W = 48;
const MIN_MARKER_H = 24;
/** height / width for equilateral triangle (horizontal base) */
const TRIANGLE_HEIGHT_RATIO = Math.sqrt(3) / 2;

export function initGroundplan(signalFlowApi = {}) {
  /** Resolve places lazily so registry init order does not matter. */
  const api = {
    getPlaces:
      signalFlowApi.getPlaces ??
      (() => getCalculatorInstance("signalFlow")?.exportState?.()?.places ?? []),
    addPlace:
      signalFlowApi.addPlace ??
      ((name) => getCalculatorInstance("signalFlow")?.addPlace?.(name) ?? false),
  };

  const shell = queryCalcShell("groundplan", {
    statusId: "gp-status",
    hintId: "gp-hint",
    resetViewId: "gp-reset-view",
    viewportId: "gp-viewport",
    worldId: "gp-world",
  });

  if (!shell?.viewport || !shell.world) {
    console.error("Groundplan: required elements missing.");
    return null;
  }

  ensureColorPalettePopover();

  const els = {
    sidebar: document.getElementById("gp-sidebar"),
    floorPlanSection: document.getElementById("gp-floor-plan-section"),
    viewport: shell.viewport,
    world: shell.world,
    emptyState: document.getElementById("gp-empty-state"),
    image: document.getElementById("gp-image"),
    svg: document.getElementById("gp-svg"),
    routeHandles: document.getElementById("gp-route-handles"),
    routeHeightBadges: document.getElementById("gp-route-height-badges"),
    routeLabels: document.getElementById("gp-route-labels"),
    heightEditorLayer: document.getElementById("gp-route-height-editor-layer"),
    placesLayer: document.getElementById("gp-places"),
    imageInput: document.getElementById("gp-image-input"),
    placesPalette: document.getElementById("gp-places-palette"),
    placesAddBtn: document.getElementById("gp-places-add-btn"),
    newPlaceForm: document.getElementById("gp-new-place-form"),
    newPlaceCancelBtn: document.getElementById("gp-new-place-cancel"),
    scalePanel: document.getElementById("gp-scale-panel"),
    scaleMeters: document.getElementById("gp-scale-meters"),
    scaleFeet: document.getElementById("gp-scale-feet"),
    scaleInches: document.getElementById("gp-scale-inches"),
    scaleMetric: document.getElementById("gp-scale-metric"),
    scaleImperial: document.getElementById("gp-scale-imperial"),
    cancelRouteBtn: document.getElementById("gp-cancel-route"),
    routesList: document.getElementById("gp-routes-list"),
    status: shell.status,
    hint: shell.hint,
    resetView: shell.resetView,
    toggleScaleBtn: document.getElementById("gp-toggle-scale"),
    unitButtons: document.querySelectorAll("[data-gp-unit]"),
  };

  if (!els.image || !els.svg || !els.placesLayer || !els.imageInput) {
    console.error("Groundplan: canvas elements missing.");
    return null;
  }

  /** @type {{
   *   imageDataUrl: string | null,
   *   imageWidth: number,
   *   imageHeight: number,
   *   scale: GroundplanScale,
   *   placeMarkers: PlaceMarker[],
   *   cableRoutes: CableRoute[],
   *   rulerLines: RulerLine[],
   * }} */
  const state = {
    imageDataUrl: null,
    imageWidth: 0,
    imageHeight: 0,
    scale: emptyGroundplanScale(),
    placeMarkers: [],
    cableRoutes: [],
    rulerLines: [],
    showScaleInViewport: true,
  };

  /** @type {number} */
  let scalePickStep = 0;
  /** @type {{ fromPlaceId: string, points: Point[] } | null} */
  let routeDraft = null;
  /** @type {Point | null} */
  let routePreview = null;
  /** @type {string | null} */
  let draggingPlaceId = null;
  /** @type {string | null} */
  let selectedRouteId = null;
  /** @type {number | null} */
  let selectedRoutePointIndex = null;
  const placeDrag = { startX: 0, startY: 0, origX: 0, origY: 0 };
  const placeResize = {
    active: false,
    placeId: null,
    edge: null,
    origX: 0,
    origY: 0,
    origW: DEFAULT_MARKER_W,
    origH: DEFAULT_MARKER_H,
  };
  const routeJointDrag = {
    armed: false,
    active: false,
    gripEl: null,
    routeId: null,
    pointIndex: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  };
  const routeLabelDrag = {
    active: false,
    routeId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    el: null,
  };
  /** @type {HTMLElement | null} */
  let heightEditorEl = null;
  /** @type {{ routeId: string, pointIndex: number } | null} */
  let heightEditorTarget = null;

  const panZoom = createTransformPanZoom({
    viewport: els.viewport,
    world: els.world,
    defaultPan: { x: 40, y: 40 },
    defaultZoom: 1,
    getEnabled: () =>
      !draggingPlaceId &&
      !routeJointDrag.active &&
      !routeLabelDrag.active &&
      !placeResize.active,
    onChange: () => renderOverlay(),
  });

  function setStatus(message) {
    if (els.status) els.status.textContent = message;
  }

  function setHint(message) {
    if (els.hint) els.hint.textContent = message;
  }

  function isScaleComplete() {
    return getMetersPerPixel(state.scale) != null;
  }

  /** @param {boolean} open */
  function setFloorPlanSectionOpen(open) {
    const section = els.floorPlanSection;
    if (!section) return;
    section.open = open;
  }

  function collapseFloorPlanAfterImport() {
    if (state.imageDataUrl && isScaleComplete()) {
      setFloorPlanSectionOpen(false);
    }
  }

  function getSignalFlowPlaces() {
    const fromApi = api.getPlaces?.();
    if (Array.isArray(fromApi)) return /** @type {{ id: string, name: string }[]} */ (fromApi);
    const sf = getCalculatorExport("signalFlow");
    return Array.isArray(sf?.places) ? /** @type {{ id: string, name: string }[]} */ (sf.places) : [];
  }

  /** @param {string} name */
  function addSignalFlowPlace(name) {
    if (api.addPlace) return Boolean(api.addPlace(name));
    return false;
  }

  /** @param {string} placeId */
  function getPlaceName(placeId) {
    return getSignalFlowPlaces().find((p) => p.id === placeId)?.name ?? "Place";
  }

  /** @param {string} placeId */
  function getPlaceMarker(placeId) {
    return state.placeMarkers.find((m) => m.placeId === placeId) ?? null;
  }

  /** @param {PlaceMarker} marker */
  function getMarkerWidth(marker) {
    const w = Number(marker.width);
    return Number.isFinite(w) && w >= MIN_MARKER_W ? w : DEFAULT_MARKER_W;
  }

  /** @param {PlaceMarker} marker */
  function getMarkerHeight(marker) {
    const h = Number(marker.height);
    return Number.isFinite(h) && h >= MIN_MARKER_H ? h : DEFAULT_MARKER_H;
  }

  /** @param {PlaceMarker} marker */
  function getPlaceRoutePoint(marker) {
    const w = getMarkerWidth(marker);
    return { x: marker.x + w / 2, y: marker.y };
  }

  /** @param {string} placeId */
  function syncRoutesForPlace(placeId) {
    const marker = getPlaceMarker(placeId);
    if (!marker) return;
    const routePoint = getPlaceRoutePoint(marker);

    for (const route of state.cableRoutes) {
      if (route.points.length === 0) continue;
      if (route.fromPlaceId === placeId) {
        route.points[0] = { ...route.points[0], ...routePoint };
      }
      if (route.toPlaceId === placeId) {
        const last = route.points.length - 1;
        route.points[last] = { ...route.points[last], ...routePoint };
      }
    }

    if (routeDraft?.fromPlaceId === placeId && routeDraft.points.length > 0) {
      routeDraft.points[0] = { ...routePoint };
    }
  }

  function cancelRoute() {
    if (!routeDraft) return;
    routeDraft = null;
    routePreview = null;
    setStatus("Cable route cancelled.");
    updateRouteDraftUi();
    renderPlaceMarkers();
    renderOverlay();
    updateStatusHint();
  }

  /** @param {CableRoute} route */
  function getRouteColor(route) {
    return normalizeRouteColor(route.color);
  }

  /** @param {unknown} value */
  function normalizeRouteColor(value) {
    return normalizeHexColor(value);
  }

  /** @param {unknown} value */
  function normalizePlaceColor(value) {
    return normalizeHexColor(value);
  }

  /** @param {unknown} value */
  function normalizePlaceShape(value) {
    if (typeof value === "string") {
      const legacy = LEGACY_PLACE_SHAPES[value];
      if (legacy) return legacy;
      if (PLACE_SHAPES.includes(/** @type {PlaceShape} */ (value))) {
        return /** @type {PlaceShape} */ (value);
      }
    }
    return DEFAULT_PLACE_SHAPE;
  }

  /** @param {PlaceMarker} marker */
  function getPlaceMarkerColor(marker) {
    return normalizePlaceColor(marker.color);
  }

  /** @param {PlaceMarker} marker */
  function getPlaceMarkerShape(marker) {
    return normalizePlaceShape(marker.shape);
  }

  /** @param {unknown} marker */
  function normalizePlaceMarker(marker) {
    if (!marker || typeof marker !== "object") {
      return { placeId: "", x: 0, y: 0 };
    }
    const m = /** @type {PlaceMarker} */ (marker);
    /** @type {PlaceMarker} */
    const normalized = {
      ...m,
      color: normalizePlaceColor(m.color),
      shape: normalizePlaceShape(m.shape),
    };
    return normalized;
  }

  /** @param {unknown} point */
  function normalizeRoutePoint(point) {
    if (!point || typeof point !== "object") return { x: 0, y: 0 };
    const p = /** @type {{ x?: unknown, y?: unknown, heightMeters?: unknown }} */ (point);
    /** @type {RoutePoint} */
    const normalized = {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
    };
    if (typeof p.heightMeters === "number" && Number.isFinite(p.heightMeters) && p.heightMeters !== 0) {
      normalized.heightMeters = p.heightMeters;
    }
    return normalized;
  }

  /** @param {CableRoute} route */
  function formatRouteLength(route) {
    const mpp = getMetersPerPixel(state.scale);
    const meters = routeLengthMeters(route.points, mpp);
    if (meters != null) return formatDistance(meters, state.scale.unit);
    if (route.points.length < 2) return "—";
    let px = 0;
    for (let i = 1; i < route.points.length; i += 1) {
      px += pixelDistance(route.points[i - 1], route.points[i]);
    }
    return `${Math.round(px)} px`;
  }

  /** @param {CableRoute} route */
  function formatRouteLabel(route) {
    return `${getPlaceName(route.fromPlaceId)} -> ${getPlaceName(route.toPlaceId)}`;
  }

  /** @param {CableRoute} route */
  function formatRouteViewportLabel(route) {
    const mpp = getMetersPerPixel(state.scale);
    const len = routeLengthMeters(route.points, mpp);
    const lenLabel = len != null ? formatDistance(len, state.scale.unit) : "Set scale";
    const fromName = getPlaceName(route.fromPlaceId);
    const toName = getPlaceName(route.toPlaceId);
    return `${fromName} → ${toName}: ${lenLabel}`;
  }

  /** @param {CableRoute} route */
  function defaultRouteLabelPosition(route) {
    const mid = route.points[Math.floor(route.points.length / 2)] ?? route.points[0];
    return { x: mid.x, y: mid.y - 10 };
  }

  /** @param {CableRoute} route */
  function getRouteLabelPosition(route) {
    if (
      typeof route.labelX === "number" &&
      Number.isFinite(route.labelX) &&
      typeof route.labelY === "number" &&
      Number.isFinite(route.labelY)
    ) {
      return { x: route.labelX, y: route.labelY };
    }
    return defaultRouteLabelPosition(route);
  }

  /** @param {unknown} route */
  function normalizeCableRoute(route) {
    if (!route || typeof route !== "object") {
      return {
        id: uid("route"),
        fromPlaceId: "",
        toPlaceId: "",
        points: [],
        color: DEFAULT_ROUTE_COLOR,
      };
    }
    const r = /** @type {CableRoute} */ (route);
    /** @type {CableRoute} */
    const normalized = {
      ...r,
      color: normalizeRouteColor(r.color),
      points: Array.isArray(r.points) ? r.points.map(normalizeRoutePoint) : [],
    };
    if (typeof r.labelX === "number" && Number.isFinite(r.labelX)) {
      normalized.labelX = r.labelX;
    }
    if (typeof r.labelY === "number" && Number.isFinite(r.labelY)) {
      normalized.labelY = r.labelY;
    }
    return normalized;
  }

  function renderRouteLabels() {
    if (!els.routeLabels) return;
    els.routeLabels.innerHTML = "";

    for (const route of state.cableRoutes) {
      if (route.points.length < 2) continue;
      const pos = getRouteLabelPosition(route);
      const world = imageToWorld(pos);
      const color = getRouteColor(route);
      const selected = route.id === selectedRouteId;

      const tag = document.createElement("button");
      tag.type = "button";
      tag.className = `gp-route-label-tag${selected ? " is-selected" : ""}`;
      tag.dataset.routeId = route.id;
      tag.style.left = `${world.x}px`;
      tag.style.top = `${world.y}px`;
      tag.style.color = color;
      tag.textContent = formatRouteViewportLabel(route);
      tag.title = "Drag to reposition label";

      tag.addEventListener("pointerdown", (e) => {
        if (isPanPointerDown(e)) return;
        e.stopPropagation();
        const labelPos = getRouteLabelPosition(route);
        if (selectedRouteId !== route.id) {
          selectedRouteId = route.id;
          selectedRoutePointIndex = null;
          renderRoutesList();
          renderRouteHandles();
          renderRouteHeightBadges();
          renderOverlay();
          updateStatusHint();
          els.routeLabels.querySelectorAll(".gp-route-label-tag.is-selected").forEach((el) => {
            el.classList.remove("is-selected");
          });
          tag.classList.add("is-selected");
        }
        routeLabelDrag.active = true;
        routeLabelDrag.routeId = route.id;
        routeLabelDrag.startX = e.clientX;
        routeLabelDrag.startY = e.clientY;
        routeLabelDrag.origX = labelPos.x;
        routeLabelDrag.origY = labelPos.y;
        routeLabelDrag.el = tag;
        try {
          tag.setPointerCapture(e.pointerId);
        } catch {
          /* pointer capture may fail */
        }
      });

      els.routeLabels.appendChild(tag);
    }
  }

  /** @param {string | null} routeId */
  function setSelectedRoute(routeId) {
    if (routeId !== selectedRouteId && heightEditorTarget) closeHeightEditor(true);
    selectedRouteId = routeId;
    selectedRoutePointIndex = null;
    renderRoutesList();
    renderRouteHandles();
    renderRouteHeightBadges();
    renderRouteLabels();
    renderOverlay();
    updateStatusHint();
  }

  /** @param {string} routeId @param {number} pointIndex */
  function setSelectedRoutePoint(routeId, pointIndex) {
    selectedRouteId = routeId;
    selectedRoutePointIndex = pointIndex;
    renderRoutesList();
    renderRouteHandles();
    renderRouteHeightBadges();
    renderRouteLabels();
    renderOverlay();
  }

  /** @param {string} routeId */
  function getRouteById(routeId) {
    return state.cableRoutes.find((r) => r.id === routeId) ?? null;
  }

  /** @param {string} routeId @param {number} pointIndex @param {Point} p */
  function moveRoutePoint(routeId, pointIndex, p) {
    const route = getRouteById(routeId);
    if (!route || pointIndex < 0 || pointIndex >= route.points.length) return;
    const prev = route.points[pointIndex];
    /** @type {RoutePoint} */
    const next = { x: p.x, y: p.y };
    if (typeof prev.heightMeters === "number" && prev.heightMeters !== 0) {
      next.heightMeters = prev.heightMeters;
    }
    route.points[pointIndex] = next;
    if (pointIndex === 0) {
      const marker = getPlaceMarker(route.fromPlaceId);
      if (marker) {
        marker.x = p.x;
        marker.y = p.y;
        updatePlaceMarkerElement(route.fromPlaceId);
      }
    } else if (pointIndex === route.points.length - 1) {
      const marker = getPlaceMarker(route.toPlaceId);
      if (marker) {
        marker.x = p.x;
        marker.y = p.y;
        updatePlaceMarkerElement(route.toPlaceId);
      }
    }
  }

  /** @param {string} routeId @param {number} pointIndex */
  function deleteRoutePoint(routeId, pointIndex) {
    const route = getRouteById(routeId);
    if (!route || route.points.length <= 2) return;
    if (pointIndex <= 0 || pointIndex >= route.points.length - 1) return;
    route.points.splice(pointIndex, 1);
    if (
      heightEditorTarget?.routeId === routeId &&
      heightEditorTarget.pointIndex === pointIndex
    ) {
      closeHeightEditor(false);
    }
    selectedRoutePointIndex = null;
    setStatus(`Removed waypoint from ${formatRouteLabel(route)}.`);
    renderRoutesList();
    renderRouteHandles();
    renderRouteHeightBadges();
    renderOverlay();
  }

  /** @param {RoutePoint} point */
  function routePointHasHeight(point) {
    return (
      typeof point.heightMeters === "number" &&
      Number.isFinite(point.heightMeters) &&
      point.heightMeters !== 0
    );
  }

  /** @type {{ routeId: string | null, pointIndex: number | null, at: number }} */
  const routePointTap = { routeId: null, pointIndex: null, at: 0 };
  /** @type {{ routeId: string | null, at: number }} */
  const routeLineTap = { routeId: null, at: 0 };
  const ROUTE_POINT_DBL_MS = 350;

  /** @param {string} routeId @param {number} pointIndex */
  function noteRoutePointDoubleTap(routeId, pointIndex) {
    const now = Date.now();
    if (
      routePointTap.routeId === routeId &&
      routePointTap.pointIndex === pointIndex &&
      now - routePointTap.at <= ROUTE_POINT_DBL_MS
    ) {
      routePointTap.routeId = null;
      routePointTap.pointIndex = null;
      routePointTap.at = 0;
      openHeightEditor(routeId, pointIndex);
      return true;
    }
    routePointTap.routeId = routeId;
    routePointTap.pointIndex = pointIndex;
    routePointTap.at = now;
    return false;
  }

  function clearRoutePointTap() {
    routePointTap.routeId = null;
    routePointTap.pointIndex = null;
    routePointTap.at = 0;
  }

  function clearRouteLineTap() {
    routeLineTap.routeId = null;
    routeLineTap.at = 0;
  }

  /** @param {Point} p @param {Point} a @param {Point} b */
  function projectPointOnSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return { point: { x: a.x, y: a.y }, dist: Math.hypot(p.x - a.x, p.y - a.y) };
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    return { point, dist: Math.hypot(p.x - point.x, p.y - point.y) };
  }

  /** @param {CableRoute} route @param {Point} p @param {number} tolerance */
  function findRouteSegmentHit(route, p, tolerance) {
    /** @type {{ segmentIndex: number, point: Point, dist: number } | null} */
    let best = null;
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const { point, dist } = projectPointOnSegment(p, route.points[i], route.points[i + 1]);
      if (dist <= tolerance && (!best || dist < best.dist)) {
        best = { segmentIndex: i, point, dist };
      }
    }
    return best;
  }

  /** @param {string} routeId */
  function noteRouteLineDoubleTap(routeId) {
    const now = Date.now();
    if (routeLineTap.routeId === routeId && now - routeLineTap.at <= ROUTE_POINT_DBL_MS) {
      clearRouteLineTap();
      return true;
    }
    routeLineTap.routeId = routeId;
    routeLineTap.at = now;
    return false;
  }

  /** @param {string} routeId @param {number} segmentIndex @param {Point} point */
  function insertRouteWaypoint(routeId, segmentIndex, point) {
    const route = getRouteById(routeId);
    if (!route) return;
    if (segmentIndex < 0 || segmentIndex >= route.points.length - 1) return;
    route.points.splice(segmentIndex + 1, 0, { x: point.x, y: point.y });
    setSelectedRoutePoint(routeId, segmentIndex + 1);
    setStatus(`Added waypoint to ${formatRouteLabel(route)}.`);
  }

  /** @param {HTMLElement} el @param {string} routeId @param {number} pointIndex @param {PointerEvent} e */
  function beginRoutePointDrag(el, routeId, pointIndex, e) {
    const selectionChanged =
      selectedRouteId !== routeId || selectedRoutePointIndex !== pointIndex;
    selectedRouteId = routeId;
    selectedRoutePointIndex = pointIndex;
    if (selectionChanged) {
      renderRoutesList();
      renderRouteHandles();
      renderRouteHeightBadges();
    }
    routeJointDrag.armed = true;
    routeJointDrag.active = false;
    routeJointDrag.gripEl = el;
    routeJointDrag.routeId = routeId;
    routeJointDrag.pointIndex = pointIndex;
    routeJointDrag.startX = e.clientX;
    routeJointDrag.startY = e.clientY;
    const route = getRouteById(routeId);
    const pt = route?.points[pointIndex];
    if (!pt) return;
    routeJointDrag.origX = pt.x;
    routeJointDrag.origY = pt.y;
  }

  /** @param {Point} p */
  function updateRoutePointDragPosition(p) {
    const routeId = routeJointDrag.routeId;
    const pointIndex = routeJointDrag.pointIndex;
    if (routeId == null || pointIndex == null) return;
    const world = imageToWorld(p);
    const marker = els.routeHeightBadges?.querySelector(
      `.gp-route-height-marker[data-route-id="${routeId}"][data-point-index="${pointIndex}"]`
    );
    if (marker instanceof HTMLElement) {
      marker.style.left = `${world.x}px`;
      marker.style.top = `${world.y}px`;
      return;
    }
    const joint = els.routeHandles?.querySelector(
      `.gp-route-joint[data-route-id="${routeId}"][data-point-index="${pointIndex}"]`
    );
    if (joint instanceof HTMLElement) {
      joint.style.left = `${world.x}px`;
      joint.style.top = `${world.y}px`;
    }
  }

  function renderRouteHandles() {
    if (!els.routeHandles) return;
    els.routeHandles.innerHTML = "";
    if (!selectedRouteId) return;

    const route = getRouteById(selectedRouteId);
    if (!route) return;

    els.routeHandles.innerHTML = route.points
      .map((p, i) => {
        if (routePointHasHeight(p)) return "";
        if (
          heightEditorTarget?.routeId === route.id &&
          heightEditorTarget.pointIndex === i
        ) {
          return "";
        }
        const world = imageToWorld(p);
        const isEndpoint = i === 0 || i === route.points.length - 1;
        const selected = i === selectedRoutePointIndex;
        const classes = [
          "gp-route-joint",
          isEndpoint ? "gp-route-joint--endpoint" : "gp-route-joint--waypoint",
          selected ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="${classes}" data-route-id="${escapeXml(route.id)}" data-point-index="${i}" style="left:${world.x}px;top:${world.y}px">
          <span class="gp-route-joint-grip" data-route-id="${escapeXml(route.id)}" data-point-index="${i}"></span>
        </div>`;
      })
      .join("");

    els.routeHandles.querySelectorAll(".gp-route-joint-grip").forEach((grip) => {
      grip.addEventListener("pointerdown", (e) => {
        if (isPanPointerDown(e)) return;
        e.stopPropagation();
        const el = /** @type {HTMLElement} */ (grip);
        const routeId = el.dataset.routeId;
        const pointIndex = Number(el.dataset.pointIndex);
        if (!routeId || !Number.isFinite(pointIndex)) return;
        beginRoutePointDrag(el, routeId, pointIndex, e);
      });
    });
  }

  /** @param {RoutePoint} point */
  function routePointWorldPosition(point) {
    return imageToWorld(point);
  }

  function closeHeightEditor(commit) {
    if (!heightEditorEl || !heightEditorTarget) {
      heightEditorTarget = null;
      if (heightEditorEl) heightEditorEl.hidden = true;
      return;
    }
    const { routeId, pointIndex } = heightEditorTarget;
    heightEditorTarget = null;
    heightEditorEl.hidden = true;

    if (commit) {
      const route = getRouteById(routeId);
      const input = /** @type {HTMLInputElement | null} */ (
        heightEditorEl.querySelector(".gp-route-height-input")
      );
      if (route && input) {
        const meters = parseHeightInput(input.value, state.scale.unit);
        const point = route.points[pointIndex];
        if (point) {
          if (meters == null) {
            delete point.heightMeters;
          } else {
            point.heightMeters = meters;
          }
        }
        renderRoutesList();
        renderRouteHandles();
        renderRouteHeightBadges();
        renderOverlay();
      }
    } else {
      renderRouteHandles();
      renderRouteHeightBadges();
    }
  }

  /** @param {string} routeId @param {number} pointIndex */
  function openHeightEditor(routeId, pointIndex) {
    const route = getRouteById(routeId);
    const point = route?.points[pointIndex];
    if (!route || !point || !els.heightEditorLayer) return;

    if (!heightEditorEl) {
      heightEditorEl = document.createElement("div");
      heightEditorEl.className = "gp-route-height-editor";
      heightEditorEl.innerHTML =
        '<input type="text" class="gp-route-height-input field-input" inputmode="decimal" aria-label="Height difference at this point" />';
      els.heightEditorLayer.appendChild(heightEditorEl);
      const input = /** @type {HTMLInputElement} */ (
        heightEditorEl.querySelector(".gp-route-height-input")
      );
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          closeHeightEditor(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeHeightEditor(false);
        }
      });
      input.addEventListener("blur", () => {
        if (heightEditorTarget) closeHeightEditor(true);
      });
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
    }

    closeHeightEditor(false);
    if (selectedRouteId !== routeId) setSelectedRoute(routeId);
    setSelectedRoutePoint(routeId, pointIndex);

    const input = /** @type {HTMLInputElement} */ (
      heightEditorEl.querySelector(".gp-route-height-input")
    );
    input.value = heightMetersToInputValue(point.heightMeters, state.scale.unit);
    input.placeholder = state.scale.unit === "imperial" ? "±ft" : "±m";

    const pos = routePointWorldPosition(point);
    heightEditorEl.style.left = `${pos.x}px`;
    heightEditorEl.style.top = `${pos.y}px`;
    heightEditorEl.hidden = false;
    heightEditorTarget = { routeId, pointIndex };
    renderRouteHandles();
    renderRouteHeightBadges();
    input.focus();
    input.select();
  }

  function renderRouteHeightBadges() {
    if (!els.routeHeightBadges) return;
    els.routeHeightBadges.innerHTML = "";

    for (const route of state.cableRoutes) {
      route.points.forEach((point, pointIndex) => {
        if (!routePointHasHeight(point)) return;
        if (
          heightEditorTarget?.routeId === route.id &&
          heightEditorTarget.pointIndex === pointIndex
        ) {
          return;
        }
        const label = formatHeightOffset(point.heightMeters, state.scale.unit);
        if (!label) return;
        const pos = routePointWorldPosition(point);
        const isSelectedRoute = route.id === selectedRouteId;
        const isSelectedPoint = pointIndex === selectedRoutePointIndex;

        const marker = document.createElement("div");
        marker.className = "gp-route-height-marker";
        if (isSelectedRoute) marker.classList.add("is-route-selected");
        if (isSelectedPoint) marker.classList.add("is-point-selected");
        marker.dataset.routeId = route.id;
        marker.dataset.pointIndex = String(pointIndex);
        marker.style.left = `${pos.x}px`;
        marker.style.top = `${pos.y}px`;

        const badge = document.createElement("button");
        badge.type = "button";
        badge.className = "gp-route-height-badge";
        if (isSelectedRoute) badge.classList.add("is-drag-handle");
        badge.title = isSelectedRoute
          ? "Drag to move · double-click to edit height"
          : "Height offset";
        badge.textContent = label;

        if (isSelectedRoute) {
          badge.addEventListener("pointerdown", (e) => {
            if (isPanPointerDown(e)) return;
            e.stopPropagation();
            beginRoutePointDrag(badge, route.id, pointIndex, e);
          });
        } else {
          badge.addEventListener("pointerdown", (e) => {
            if (isPanPointerDown(e)) return;
            e.stopPropagation();
            setSelectedRoute(route.id);
            beginRoutePointDrag(badge, route.id, pointIndex, e);
          });
        }

        marker.appendChild(badge);

        els.routeHeightBadges.appendChild(marker);
      });
    }
  }

  /** @param {string} routeId */
  function deleteRoute(routeId) {
    const route = state.cableRoutes.find((r) => r.id === routeId);
    if (!route) return;
    state.cableRoutes = state.cableRoutes.filter((r) => r.id !== routeId);
    if (selectedRouteId === routeId) {
      selectedRouteId = null;
      selectedRoutePointIndex = null;
    }
    if (heightEditorTarget?.routeId === routeId) closeHeightEditor(false);
    setStatus(`Deleted cable route: ${formatRouteLabel(route)}.`);
    updateRouteDraftUi();
    renderRoutesList();
    renderRouteHandles();
    renderRouteLabels();
    renderOverlay();
  }

  function renderRoutesList() {
    if (!els.routesList) return;
    if (state.cableRoutes.length === 0) {
      els.routesList.innerHTML = "";
      return;
    }
    els.routesList.innerHTML = state.cableRoutes
      .map((route) => {
        const label = formatRouteLabel(route);
        const length = formatRouteLength(route);
        const selected = route.id === selectedRouteId;
        const color = getRouteColor(route);
        return `<div class="gp-route-item${selected ? " is-selected" : ""}" role="listitem" data-route-id="${escapeXml(route.id)}">
          ${renderColorSwatchButton({
            color,
            className: "gp-route-color-btn",
            dataset: { routeId: route.id },
            ariaLabel: `Color for ${label}`,
          })}
          <button type="button" class="gp-route-item-select" data-route-id="${escapeXml(route.id)}">
            <span class="gp-route-item-name">${escapeXml(label)}</span>
            <span class="gp-route-item-length">${escapeXml(length)}</span>
          </button>
          <button type="button" class="gp-route-item-delete" data-route-id="${escapeXml(route.id)}" title="Delete route" aria-label="Delete ${escapeXml(label)}">×</button>
        </div>`;
      })
      .join("");

    bindColorSwatchButtons(els.routesList, ".gp-route-color-btn", {
      getColor: (wrap) => {
        const routeId = wrap.dataset.routeId;
        const route = routeId ? getRouteById(routeId) : null;
        return route ? getRouteColor(route) : DEFAULT_ROUTE_COLOR;
      },
      onColorChange: (wrap, color) => {
        const routeId = wrap.dataset.routeId;
        const route = routeId ? getRouteById(routeId) : null;
        if (!route) return;
        route.color = normalizeRouteColor(color);
        renderRouteLabels();
        renderOverlay();
      },
    });

    els.routesList.querySelectorAll(".gp-route-item-select").forEach((btn) => {
      btn.addEventListener("click", () => {
        const routeId = /** @type {HTMLElement} */ (btn).dataset.routeId;
        if (routeId) setSelectedRoute(routeId);
      });
    });

    els.routesList.querySelectorAll(".gp-route-item-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const routeId = /** @type {HTMLElement} */ (btn).dataset.routeId;
        if (routeId) deleteRoute(routeId);
      });
    });
  }

  function updateRouteDraftUi() {
    if (els.cancelRouteBtn) els.cancelRouteBtn.hidden = !routeDraft;
  }

  function syncWorldSize() {
    const w = state.imageWidth + WORLD_PAD * 2;
    const h = state.imageHeight + WORLD_PAD * 2;
    els.world.style.width = `${w}px`;
    els.world.style.height = `${h}px`;
    els.image.style.left = `${WORLD_PAD}px`;
    els.image.style.top = `${WORLD_PAD}px`;
    els.image.style.width = `${state.imageWidth}px`;
    els.image.style.height = `${state.imageHeight}px`;
    els.svg.setAttribute("width", String(w));
    els.svg.setAttribute("height", String(h));
    els.placesLayer.style.width = `${w}px`;
    els.placesLayer.style.height = `${h}px`;
  }

  /** @param {number} clientX @param {number} clientY */
  function clientToImage(clientX, clientY) {
    const world = panZoom.clientToWorld(clientX, clientY);
    return { x: world.x - WORLD_PAD, y: world.y - WORLD_PAD };
  }

  /** @param {Point} p */
  function imageToWorld(p) {
    return { x: p.x + WORLD_PAD, y: p.y + WORLD_PAD };
  }

  /** @param {Point} p */
  function isOnImage(p) {
    return p.x >= 0 && p.y >= 0 && p.x <= state.imageWidth && p.y <= state.imageHeight;
  }

  function updateScaleFromInputs() {
    if (state.scale.unit === "metric") {
      const meters = Number(els.scaleMeters?.value);
      state.scale.distanceMeters = Number.isFinite(meters) && meters > 0 ? meters : null;
    } else {
      const feet = Number(els.scaleFeet?.value) || 0;
      const inches = Number(els.scaleInches?.value) || 0;
      const total = imperialToMeters(feet, inches);
      state.scale.distanceMeters = total > 0 ? total : null;
    }
    renderRoutesList();
    renderRouteHeightBadges();
    renderRouteLabels();
    renderOverlay();
    if (isScaleComplete()) {
      setStatus("Scale set. Drag places or click a wiring node to route cables.");
      updateStatusHint();
    }
  }

  function populateScaleInputs() {
    if (state.scale.unit === "metric") {
      if (els.scaleMeters) {
        els.scaleMeters.value =
          state.scale.distanceMeters != null ? String(state.scale.distanceMeters) : "";
      }
    } else {
      const imp = state.scale.distanceMeters != null ? metersToImperial(state.scale.distanceMeters) : null;
      if (els.scaleFeet) els.scaleFeet.value = imp ? String(imp.feet) : "";
      if (els.scaleInches) els.scaleInches.value = imp ? String(imp.inches) : "";
    }
    if (els.scaleMetric) els.scaleMetric.hidden = state.scale.unit !== "metric";
    if (els.scaleImperial) els.scaleImperial.hidden = state.scale.unit !== "imperial";
    els.unitButtons.forEach((btn) => {
      const active = btn.dataset.gpUnit === state.scale.unit;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshPlacesPalette() {
    const places = getSignalFlowPlaces();
    const placedPlaceIds = new Set(state.placeMarkers.map((m) => m.placeId));
    if (els.placesPalette) {
      renderPlacesPalette(els.placesPalette, {
        places,
        placedPlaceIds,
        getMarkerStyle: (placeId) => {
          const marker = getPlaceMarker(placeId);
          if (!marker) return null;
          const shape = getPlaceMarkerShape(marker);
          return {
            color: getPlaceMarkerColor(marker),
            shape,
            shapeGlyph: PLACE_SHAPE_GLYPHS[shape],
          };
        },
        onColorChange: (placeId, color) => {
          const marker = getPlaceMarker(placeId);
          if (!marker) return;
          marker.color = normalizePlaceColor(color);
          renderPlaceMarkers();
        },
        onShapeChange: (placeId) => {
          const marker = getPlaceMarker(placeId);
          if (!marker) return;
          const shapes = PLACE_SHAPES;
          const current = getPlaceMarkerShape(marker);
          const idx = shapes.indexOf(current);
          marker.shape = shapes[(idx + 1) % shapes.length];
          syncTriangleMarkerDimensions(marker);
          renderPlaceMarkers();
          refreshPlacesPalette();
        },
      });
    }
  }

  bindPlacesAddForm({
    addBtn: els.placesAddBtn,
    form: els.newPlaceForm instanceof HTMLFormElement ? els.newPlaceForm : null,
    cancelBtn: els.newPlaceCancelBtn,
    onAddPlace: (name) => {
      const ok = addSignalFlowPlace(name);
      if (ok) {
        setStatus(`Added place “${name.trim()}”.`);
        refreshPlacesPalette();
      }
      return ok;
    },
  });

  /** @param {PlaceMarker} marker */
  function syncTriangleMarkerDimensions(marker) {
    if (getPlaceMarkerShape(marker) !== "triangle") return;
    const w = Math.max(MIN_MARKER_W, getMarkerWidth(marker));
    marker.width = w;
    marker.height = Math.max(MIN_MARKER_H, w * TRIANGLE_HEIGHT_RATIO);
  }

  /** @param {PlaceMarker} marker @param {"left" | "right" | "top" | "bottom"} edge @param {Point} p */
  function resizeTriangleMarker(marker, edge, p) {
    const w = getMarkerWidth(marker);
    const h = getMarkerHeight(marker);
    const left = marker.x - w / 2;
    const right = marker.x + w / 2;
    const top = marker.y - h / 2;
    const bottom = marker.y + h / 2;

    let newW = w;
    if (edge === "right") newW = Math.max(MIN_MARKER_W, p.x - left);
    else if (edge === "left") newW = Math.max(MIN_MARKER_W, right - p.x);
    else if (edge === "bottom") {
      const desiredH = Math.max(MIN_MARKER_H, p.y - top);
      newW = Math.max(MIN_MARKER_W, desiredH / TRIANGLE_HEIGHT_RATIO);
    } else if (edge === "top") {
      const desiredH = Math.max(MIN_MARKER_H, bottom - p.y);
      newW = Math.max(MIN_MARKER_W, desiredH / TRIANGLE_HEIGHT_RATIO);
    }

    const newH = Math.max(MIN_MARKER_H, newW * TRIANGLE_HEIGHT_RATIO);
    newW = newH / TRIANGLE_HEIGHT_RATIO;

    marker.width = newW;
    marker.height = newH;

    if (edge === "right") {
      marker.x = left + newW / 2;
      marker.y = bottom - newH / 2;
    } else if (edge === "left") {
      marker.x = right - newW / 2;
      marker.y = bottom - newH / 2;
    } else if (edge === "bottom") {
      marker.y = top + newH / 2;
    } else if (edge === "top") {
      marker.y = bottom - newH / 2;
    }
  }

  /** @param {HTMLElement} el @param {PlaceMarker} marker */
  function applyPlaceMarkerStyles(el, marker) {
    const world = imageToWorld(marker);
    const w = getMarkerWidth(marker);
    const h = getMarkerHeight(marker);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${world.x - w / 2}px`;
    el.style.top = `${world.y - h / 2}px`;
    el.style.setProperty("--place-color", getPlaceMarkerColor(marker));
  }

  /** @param {string} placeId */
  function updatePlaceMarkerElement(placeId) {
    const marker = getPlaceMarker(placeId);
    if (!marker) return;
    const el = els.placesLayer.querySelector(`[data-place-id="${placeId}"]`);
    if (!(el instanceof HTMLElement)) return;
    applyPlaceMarkerStyles(el, marker);
  }

  /** @param {string} placeId @param {"left" | "right" | "top" | "bottom"} edge @param {Point} p */
  function resizePlaceMarker(placeId, edge, p) {
    const marker = getPlaceMarker(placeId);
    if (!marker) return;

    if (getPlaceMarkerShape(marker) === "triangle") {
      resizeTriangleMarker(marker, edge, p);
      return;
    }

    const w = getMarkerWidth(marker);
    const h = getMarkerHeight(marker);
    const left = marker.x - w / 2;
    const right = marker.x + w / 2;
    const top = marker.y - h / 2;
    const bottom = marker.y + h / 2;

    if (edge === "right") {
      const newW = Math.max(MIN_MARKER_W, p.x - left);
      marker.width = newW;
      marker.x = left + newW / 2;
    } else if (edge === "left") {
      const newW = Math.max(MIN_MARKER_W, right - p.x);
      marker.width = newW;
      marker.x = right - newW / 2;
    } else if (edge === "bottom") {
      const newH = Math.max(MIN_MARKER_H, p.y - top);
      marker.height = newH;
      marker.y = top + newH / 2;
    } else if (edge === "top") {
      const newH = Math.max(MIN_MARKER_H, bottom - p.y);
      marker.height = newH;
      marker.y = bottom - newH / 2;
    }
  }

  /** @param {PlaceShape} shape */
  function renderPlaceMarkerShapeInner(shape) {
    if (shape === "slant") {
      return `<span class="gp-place-marker-shape" aria-hidden="true"><svg class="gp-place-marker-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon class="gp-place-marker-shape-polygon" points="10,3 97,3 90,97 3,97" /></svg></span>`;
    }
    if (shape === "triangle") {
      return `<span class="gp-place-marker-shape" aria-hidden="true"><svg class="gp-place-marker-shape-svg" viewBox="0 0 100 86.603" preserveAspectRatio="none" aria-hidden="true"><polygon class="gp-place-marker-shape-polygon" points="50,0 100,86.603 0,86.603" /></svg></span>`;
    }
    return `<span class="gp-place-marker-shape" aria-hidden="true"></span>`;
  }

  function renderPlaceMarkers() {
    els.placesLayer.innerHTML = state.placeMarkers
      .map((marker) => {
        syncTriangleMarkerDimensions(marker);
        const world = imageToWorld(marker);
        const w = getMarkerWidth(marker);
        const h = getMarkerHeight(marker);
        const name = getPlaceName(marker.placeId);
        const color = getPlaceMarkerColor(marker);
        const shape = getPlaceMarkerShape(marker);
        const isRouteSource = routeDraft?.fromPlaceId === marker.placeId;
        const isRouteTarget = routeDraft && !isRouteSource;
        const classes = [
          "gp-place-marker",
          `gp-place-marker--shape-${shape}`,
          isRouteSource ? "gp-place-marker--route-source" : "",
          isRouteTarget ? "gp-place-marker--route-target" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="${classes}" data-place-id="${escapeXml(marker.placeId)}" style="left:${world.x - w / 2}px;top:${world.y - h / 2}px;width:${w}px;height:${h}px;--place-color:${escapeXml(color)}">
          <span class="gp-place-resize-handle gp-place-resize-handle--left" data-resize-edge="left" aria-hidden="true"></span>
          <span class="gp-place-resize-handle gp-place-resize-handle--right" data-resize-edge="right" aria-hidden="true"></span>
          <span class="gp-place-resize-handle gp-place-resize-handle--top" data-resize-edge="top" aria-hidden="true"></span>
          <span class="gp-place-resize-handle gp-place-resize-handle--bottom" data-resize-edge="bottom" aria-hidden="true"></span>
          ${renderPlaceMarkerShapeInner(shape)}
          <span class="gp-place-marker-name">${escapeXml(name)}</span>
          <button type="button" class="gp-route-port" data-place-id="${escapeXml(marker.placeId)}" title="Start or finish cable route" aria-label="Cable route node for ${escapeXml(name)}"></button>
        </div>`;
      })
      .join("");

    els.placesLayer.querySelectorAll(".gp-place-marker").forEach((el) => {
      const placeId = /** @type {HTMLElement} */ (el).dataset.placeId;
      if (!placeId) return;

      el.addEventListener("pointerdown", (e) => {
        if (isPanPointerDown(e)) return;
        if (/** @type {HTMLElement} */ (e.target).closest(".gp-route-port")) return;
        if (/** @type {HTMLElement} */ (e.target).closest(".gp-place-resize-handle")) return;

        e.preventDefault();
        e.stopPropagation();
        const marker = getPlaceMarker(placeId);
        if (!marker) return;
        draggingPlaceId = placeId;
        placeDrag.startX = e.clientX;
        placeDrag.startY = e.clientY;
        placeDrag.origX = marker.x;
        placeDrag.origY = marker.y;
        /** @type {HTMLElement} */ (el).setPointerCapture(e.pointerId);
      });
    });

    els.placesLayer.querySelectorAll(".gp-place-resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        if (isPanPointerDown(e)) return;
        e.preventDefault();
        e.stopPropagation();
        const markerEl = handle.closest(".gp-place-marker");
        const placeId = markerEl instanceof HTMLElement ? markerEl.dataset.placeId : null;
        const edge = /** @type {HTMLElement} */ (handle).dataset.resizeEdge;
        const marker = placeId ? getPlaceMarker(placeId) : null;
        if (!placeId || !marker || !edge) return;
        placeResize.active = true;
        placeResize.placeId = placeId;
        placeResize.edge = edge;
        placeResize.origX = marker.x;
        placeResize.origY = marker.y;
        placeResize.origW = getMarkerWidth(marker);
        placeResize.origH = getMarkerHeight(marker);
        /** @type {HTMLElement} */ (handle).setPointerCapture(e.pointerId);
      });
    });

    els.placesLayer.querySelectorAll(".gp-route-port").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const placeId = /** @type {HTMLElement} */ (btn).dataset.placeId;
        if (placeId) handleRoutePlaceClick(placeId);
      });
    });
  }

  function hasScaleOverlay() {
    return Boolean(state.scale.pointA || state.scale.pointB);
  }

  function scaleOverlayVisible() {
    return state.showScaleInViewport || scalePickStep > 0;
  }

  function updateScaleToggleUi() {
    if (!els.toggleScaleBtn) return;
    const available = Boolean(state.imageDataUrl && hasScaleOverlay());
    els.toggleScaleBtn.hidden = !available;
    if (!available) return;
    els.toggleScaleBtn.disabled = scalePickStep > 0;
    const visible = scaleOverlayVisible();
    const label = visible ? "Hide scale overlay" : "Show scale overlay";
    els.toggleScaleBtn.setAttribute("aria-label", label);
    els.toggleScaleBtn.title = label;
    els.toggleScaleBtn.setAttribute("aria-pressed", String(visible));
  }

  function renderOverlay() {
    if (!state.imageDataUrl) return;

    const mpp = getMetersPerPixel(state.scale);
    const parts = [];

    if (scaleOverlayVisible()) {
      if (state.scale.pointA) {
        const a = imageToWorld(state.scale.pointA);
        parts.push(`<circle class="gp-scale-point" cx="${a.x}" cy="${a.y}" r="6" />`);
      }
      if (state.scale.pointB) {
        const b = imageToWorld(state.scale.pointB);
        parts.push(`<circle class="gp-scale-point" cx="${b.x}" cy="${b.y}" r="6" />`);
      }
      if (state.scale.pointA && state.scale.pointB) {
        const a = imageToWorld(state.scale.pointA);
        const b = imageToWorld(state.scale.pointB);
        parts.push(`<line class="gp-scale-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
        if (mpp) {
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const dist = formatDistance(pixelDistance(state.scale.pointA, state.scale.pointB) * mpp, state.scale.unit);
          parts.push(`<text class="gp-label" x="${midX}" y="${midY - 8}" text-anchor="middle">${escapeXml(dist)}</text>`);
        }
      }
    }

    /** @param {Point[]} points @param {boolean} isDraft */
    const drawRuler = (points, isDraft) => {
      if (points.length === 0) return;
      const d = points
        .map((p, i) => {
          const w = imageToWorld(p);
          return `${i === 0 ? "M" : "L"} ${w.x} ${w.y}`;
        })
        .join(" ");
      parts.push(`<path class="gp-ruler-line${isDraft ? " gp-ruler-line--draft" : ""}" d="${d}" />`);

      for (const p of points) {
        const w = imageToWorld(p);
        parts.push(`<circle class="gp-ruler-point" cx="${w.x}" cy="${w.y}" r="4" />`);
      }

      for (let i = 1; i < points.length; i += 1) {
        const a = imageToWorld(points[i - 1]);
        const b = imageToWorld(points[i]);
        const segPx = pixelDistance(points[i - 1], points[i]);
        const segLabel = mpp
          ? formatDistance(segPx * mpp, state.scale.unit)
          : `${Math.round(segPx)} px`;
        parts.push(`<text class="gp-label gp-ruler-label" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 6}" text-anchor="middle">${escapeXml(segLabel)}</text>`);
      }

      if (points.length >= 3) {
        const totalPx = rulerPixels(points);
        const last = imageToWorld(points[points.length - 1]);
        const totalLabel = mpp
          ? `Σ ${formatDistance(totalPx * mpp, state.scale.unit)}`
          : `Σ ${Math.round(totalPx)} px`;
        parts.push(`<text class="gp-label gp-ruler-total" x="${last.x}" y="${last.y - 16}" text-anchor="middle">${escapeXml(totalLabel)}</text>`);
      }
    };

    for (const line of state.rulerLines) {
      drawRuler(rulerLinePoints(line), false);
    }

    for (const route of state.cableRoutes) {
      if (route.points.length < 2) continue;
      const d = route.points
        .map((p, i) => {
          const w = imageToWorld(p);
          return `${i === 0 ? "M" : "L"} ${w.x} ${w.y}`;
        })
        .join(" ");
      const selected = route.id === selectedRouteId;
      const color = getRouteColor(route);
      parts.push(
        `<path class="gp-cable-route${selected ? " gp-cable-route--selected" : ""}" data-route-id="${escapeXml(route.id)}" style="stroke:${escapeXml(color)}" d="${d}" />`
      );
    }

    if (routeDraft && routeDraft.points.length) {
      const pts = routePreview ? [...routeDraft.points, routePreview] : [...routeDraft.points];
      const d = pts
        .map((p, i) => {
          const w = imageToWorld(p);
          return `${i === 0 ? "M" : "L"} ${w.x} ${w.y}`;
        })
        .join(" ");
      parts.push(`<path class="gp-cable-route gp-cable-route--draft" d="${d}" />`);
      for (const p of routeDraft.points) {
        const w = imageToWorld(p);
        parts.push(`<circle class="gp-route-point" cx="${w.x}" cy="${w.y}" r="5" />`);
      }
      if (pts.length >= 2) {
        const px = rulerPixels(pts);
        const lenLabel = mpp
          ? formatDistance(px * mpp, state.scale.unit)
          : `${Math.round(px)} px`;
        const last = imageToWorld(pts[pts.length - 1]);
        parts.push(`<text class="gp-label gp-route-label" x="${last.x}" y="${last.y - 12}" text-anchor="middle">${escapeXml(lenLabel)}</text>`);
      }
    }

    els.svg.innerHTML = parts.join("");
  }

  function render() {
    const hasImage = Boolean(state.imageDataUrl);
    if (els.emptyState) els.emptyState.hidden = hasImage;
    els.world.hidden = !hasImage;

    if (hasImage && els.image) {
      els.image.src = state.imageDataUrl;
      syncWorldSize();
    }

    if (els.scalePanel) els.scalePanel.hidden = !hasImage;

    populateScaleInputs();
    updateRouteDraftUi();
    renderRoutesList();
    refreshPlacesPalette();
    renderPlaceMarkers();
    renderRouteHandles();
    renderRouteHeightBadges();
    renderRouteLabels();
    renderOverlay();
    updateScaleToggleUi();
    updateStatusHint();
  }

  function updateStatusHint() {
    if (routeDraft) {
      setHint("Add waypoints on the plan · click destination wiring node · Esc to cancel");
      return;
    }
    if (state.imageDataUrl && !isScaleComplete()) {
      setHint("Click two known points on the plan to set scale · right-drag to pan");
      return;
    }
    if (selectedRouteId) {
      setHint("Drag joints to edit route · double-click the line to add a waypoint · double-click a point for height · Backspace to remove waypoint · right-drag to pan");
      return;
    }
    setHint("Drag places to move · drag edges to resize · click wiring node to route · right-drag to pan");
  }

  /** @param {Point} p */
  function handleScaleClick(p) {
    if (!isOnImage(p)) return;
    if (scalePickStep === 0) {
      state.scale.pointA = p;
      state.scale.pointB = null;
      scalePickStep = 1;
    } else {
      state.scale.pointB = p;
      scalePickStep = 0;
    }
    renderOverlay();
    updateScaleToggleUi();
  }

  /** @param {Point[]} points */
  function rulerPixels(points) {
    let px = 0;
    for (let i = 1; i < points.length; i += 1) {
      px += pixelDistance(points[i - 1], points[i]);
    }
    return px;
  }

  /** @param {RulerLine} line — supports legacy {a,b} lines */
  function rulerLinePoints(line) {
    if (Array.isArray(line.points)) return line.points;
    const legacy = /** @type {{ a?: Point, b?: Point }} */ (line);
    return legacy.a && legacy.b ? [legacy.a, legacy.b] : [];
  }

  /** @param {string} placeId */
  function handleRoutePlaceClick(placeId) {
    const marker = getPlaceMarker(placeId);
    if (!marker) return;

    const routePoint = getPlaceRoutePoint(marker);

    if (!routeDraft) {
      setSelectedRoute(null);
      clearRouteLineTap();
      routeDraft = { fromPlaceId: placeId, points: [routePoint] };
      setStatus(`Routing from ${getPlaceName(placeId)} — click waypoints on the plan, then a destination wiring node.`);
      updateRouteDraftUi();
      renderPlaceMarkers();
      renderOverlay();
      updateStatusHint();
      return;
    }

    if (routeDraft.fromPlaceId === placeId) {
      setStatus("Choose a different place to finish the cable route.");
      return;
    }

    routeDraft.points.push(routePoint);
    const fromPlaceId = routeDraft.fromPlaceId;
    state.cableRoutes.push({
      id: uid("route"),
      fromPlaceId,
      toPlaceId: placeId,
      points: [...routeDraft.points],
      color: DEFAULT_ROUTE_COLOR,
    });
    routeDraft = null;
    routePreview = null;
    const toName = getPlaceName(placeId);
    setStatus(`Cable route added: ${getPlaceName(fromPlaceId)} → ${toName}.`);
    setSelectedRoute(state.cableRoutes.at(-1)?.id ?? null);
    updateRouteDraftUi();
    render();
  }

  /** @param {Point} p */
  function handleRouteWaypoint(p) {
    if (!routeDraft || !isOnImage(p)) return;
    routeDraft.points.push(p);
    routePreview = null;
    updateRouteDraftUi();
    renderOverlay();
  }

  /** @param {string} placeId @param {Point} p */
  function placeMarkerAt(placeId, p) {
    const existing = getPlaceMarker(placeId);
    if (existing) {
      existing.x = p.x;
      existing.y = p.y;
    } else {
      state.placeMarkers.push({
        placeId,
        x: p.x,
        y: p.y,
        width: DEFAULT_MARKER_W,
        height: DEFAULT_MARKER_H,
        color: DEFAULT_PLACE_COLOR,
        shape: DEFAULT_PLACE_SHAPE,
      });
    }
    syncRoutesForPlace(placeId);
    refreshPlacesPalette();
    renderPlaceMarkers();
    renderOverlay();
  }

  /** @param {File} file */
  function isPngFile(file) {
    if (file.type.includes("png")) return true;
    return /\.png$/i.test(file.name);
  }

  /** @param {File} file */
  async function loadImageFile(file) {
    if (!isPngFile(file)) {
      window.alert("Please upload a PNG image.");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.readAsDataURL(file);
    });

    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Invalid PNG image."));
      img.src = dataUrl;
    });

    state.imageDataUrl = dataUrl;
    state.imageWidth = dims.w;
    state.imageHeight = dims.h;
    state.scale = emptyGroundplanScale();
    scalePickStep = 0;
    routeDraft = null;
    routePreview = null;
    selectedRouteId = null;
    selectedRoutePointIndex = null;
    panZoom.resetView({ x: 40, y: 40 }, 1);
    setFloorPlanSectionOpen(true);
    setStatus("Groundplan loaded — click two known points on the plan to set scale.");
    render();
  }

  els.unitButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const unit = /** @type {DistanceUnit | undefined} */ (btn.dataset.gpUnit);
      if (!unit) return;
      state.scale.unit = unit;
      populateScaleInputs();
      updateScaleFromInputs();
    });
  });

  els.scaleMeters?.addEventListener("input", updateScaleFromInputs);
  els.scaleFeet?.addEventListener("input", updateScaleFromInputs);
  els.scaleInches?.addEventListener("input", updateScaleFromInputs);

  els.cancelRouteBtn?.addEventListener("click", () => {
    cancelRoute();
  });

  els.svg.addEventListener("pointerdown", (e) => {
    const path = /** @type {SVGElement | null} */ (e.target).closest("[data-route-id]");
    if (!(path instanceof SVGPathElement) || !path.classList.contains("gp-cable-route")) return;
    if (path.classList.contains("gp-cable-route--draft")) return;
    e.preventDefault();
    e.stopPropagation();
    const routeId = path.dataset.routeId;
    if (routeId) setSelectedRoute(routeId);
  });

  els.svg.addEventListener("pointerup", (e) => {
    const path = /** @type {SVGElement | null} */ (e.target).closest("[data-route-id]");
    if (!(path instanceof SVGPathElement) || !path.classList.contains("gp-cable-route")) return;
    if (path.classList.contains("gp-cable-route--draft")) return;
    if (routeDraft) return;
    const routeId = path.dataset.routeId;
    if (!routeId || !noteRouteLineDoubleTap(routeId)) return;

    e.preventDefault();
    e.stopPropagation();
    clearRoutePointTap();

    const route = getRouteById(routeId);
    if (!route || route.points.length < 2) return;

    const p = clientToImage(e.clientX, e.clientY);
    const tolerance = 14 / panZoom.view.zoom;
    const hit = findRouteSegmentHit(route, p, tolerance);
    if (!hit) return;

    insertRouteWaypoint(routeId, hit.segmentIndex, hit.point);
  });

  els.imageInput.addEventListener("change", async () => {
    const file = els.imageInput.files?.[0];
    els.imageInput.value = "";
    if (!file) return;
    try {
      await loadImageFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      window.alert(message);
    }
  });

  document.querySelector('label[for="gp-image-input"]')?.addEventListener("click", () => {
    setFloorPlanSectionOpen(true);
  });

  els.resetView?.addEventListener("click", () => {
    panZoom.resetView({ x: 40, y: 40 }, 1);
  });

  els.toggleScaleBtn?.addEventListener("click", () => {
    if (scalePickStep > 0) return;
    state.showScaleInViewport = !state.showScaleInViewport;
    updateScaleToggleUi();
    renderOverlay();
  });

  els.viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });

  els.viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    const placeId = e.dataTransfer?.getData("text/av-place-id");
    if (!placeId || !state.imageDataUrl) return;
    const p = clientToImage(e.clientX, e.clientY);
    if (!isOnImage(p)) return;
    placeMarkerAt(placeId, p);
    setStatus(`Placed ${getPlaceName(placeId)} on the groundplan.`);
  });

  els.viewport.addEventListener("pointerdown", (e) => {
    if (isPanPointerDown(e) || !state.imageDataUrl) return;
    if (draggingPlaceId) return;

    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest(".gp-place-marker") || target.closest(".gp-route-port") || target.closest(".gp-route-handles") || target.closest(".gp-route-height-badges") || target.closest(".gp-route-height-editor-layer") || target.closest(".gp-route-labels")) return;

    const p = clientToImage(e.clientX, e.clientY);

    if (routeDraft) {
      e.preventDefault();
      handleRouteWaypoint(p);
      return;
    }

    if (!isScaleComplete()) {
      e.preventDefault();
      handleScaleClick(p);
      return;
    }

    setSelectedRoute(null);
  });

  els.viewport.addEventListener("pointermove", (e) => {
    if (routeDraft) {
      routePreview = clientToImage(e.clientX, e.clientY);
      updateRouteDraftUi();
      renderOverlay();
    }
  });

  window.addEventListener("pointermove", (e) => {
    if (
      routeJointDrag.armed &&
      !routeJointDrag.active &&
      routeJointDrag.routeId != null &&
      routeJointDrag.pointIndex != null
    ) {
      const screenDx = e.clientX - routeJointDrag.startX;
      const screenDy = e.clientY - routeJointDrag.startY;
      if (Math.hypot(screenDx, screenDy) >= 4) {
        clearRoutePointTap();
        routeJointDrag.active = true;
        routeJointDrag.armed = false;
        try {
          routeJointDrag.gripEl?.setPointerCapture(e.pointerId);
        } catch {
          /* grip may be gone after re-render */
        }
      }
    }
    if (routeJointDrag.active && routeJointDrag.routeId != null && routeJointDrag.pointIndex != null) {
      const dx = (e.clientX - routeJointDrag.startX) / panZoom.view.zoom;
      const dy = (e.clientY - routeJointDrag.startY) / panZoom.view.zoom;
      const p = { x: routeJointDrag.origX + dx, y: routeJointDrag.origY + dy };
      moveRoutePoint(routeJointDrag.routeId, routeJointDrag.pointIndex, p);
      updateRoutePointDragPosition(p);
      if (
        heightEditorTarget?.routeId === routeJointDrag.routeId &&
        heightEditorTarget.pointIndex === routeJointDrag.pointIndex &&
        heightEditorEl
      ) {
        const pos = routePointWorldPosition(p);
        heightEditorEl.style.left = `${pos.x}px`;
        heightEditorEl.style.top = `${pos.y}px`;
      }
      renderOverlay();
      return;
    }
    if (routeLabelDrag.active && routeLabelDrag.routeId) {
      const dx = (e.clientX - routeLabelDrag.startX) / panZoom.view.zoom;
      const dy = (e.clientY - routeLabelDrag.startY) / panZoom.view.zoom;
      const p = { x: routeLabelDrag.origX + dx, y: routeLabelDrag.origY + dy };
      const route = getRouteById(routeLabelDrag.routeId);
      if (route) {
        route.labelX = p.x;
        route.labelY = p.y;
        if (routeLabelDrag.el instanceof HTMLElement) {
          const world = imageToWorld(p);
          routeLabelDrag.el.style.left = `${world.x}px`;
          routeLabelDrag.el.style.top = `${world.y}px`;
        }
      }
      return;
    }
    if (placeResize.active && placeResize.placeId && placeResize.edge) {
      const p = clientToImage(e.clientX, e.clientY);
      resizePlaceMarker(placeResize.placeId, placeResize.edge, p);
      updatePlaceMarkerElement(placeResize.placeId);
      syncRoutesForPlace(placeResize.placeId);
      renderOverlay();
      if (selectedRouteId) renderRouteHandles();
      renderRouteHeightBadges();
      return;
    }
    if (!draggingPlaceId) return;
    const marker = getPlaceMarker(draggingPlaceId);
    if (!marker) return;
    const dx = (e.clientX - placeDrag.startX) / panZoom.view.zoom;
    const dy = (e.clientY - placeDrag.startY) / panZoom.view.zoom;
    marker.x = placeDrag.origX + dx;
    marker.y = placeDrag.origY + dy;
    updatePlaceMarkerElement(draggingPlaceId);
    syncRoutesForPlace(draggingPlaceId);
    renderOverlay();
    if (selectedRouteId) renderRouteHandles();
    renderRouteHeightBadges();
  });

  window.addEventListener("pointerup", (e) => {
    if (routeLabelDrag.active) {
      routeLabelDrag.active = false;
      routeLabelDrag.routeId = null;
      routeLabelDrag.el = null;
      try {
        e.target?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* pointer may not be captured */
      }
      return;
    }
    if (routeJointDrag.active || routeJointDrag.armed) {
      const wasDrag = routeJointDrag.active;
      const routeId = routeJointDrag.routeId;
      const pointIndex = routeJointDrag.pointIndex;
      routeJointDrag.active = false;
      routeJointDrag.armed = false;
      routeJointDrag.gripEl = null;
      routeJointDrag.routeId = null;
      routeJointDrag.pointIndex = null;
      try {
        e.target?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* pointer may not be captured */
      }
      if (wasDrag) {
        clearRoutePointTap();
        clearRouteLineTap();
        renderRoutesList();
        renderRouteHandles();
        renderRouteHeightBadges();
        renderRouteLabels();
        renderOverlay();
      } else if (routeId != null && pointIndex != null) {
        if (!noteRoutePointDoubleTap(routeId, pointIndex)) {
          renderRouteHeightBadges();
        }
      }
      return;
    }
    if (placeResize.active) {
      const placeId = placeResize.placeId;
      placeResize.active = false;
      placeResize.placeId = null;
      placeResize.edge = null;
      try {
        e.target?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* pointer may not be captured */
      }
      if (placeId) {
        renderPlaceMarkers();
        renderRoutesList();
        renderOverlay();
      }
      return;
    }
    if (!draggingPlaceId) return;
    const placeId = draggingPlaceId;
    draggingPlaceId = null;
    try {
      const el = els.placesLayer.querySelector(`[data-place-id="${placeId}"]`);
      if (el instanceof HTMLElement) el.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may not be captured */
    }
    renderPlaceMarkers();
    renderRoutesList();
    renderOverlay();
  });

  window.addEventListener("keydown", (e) => {
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;

    if (e.key === "Backspace" && !typing) {
      if (selectedRouteId && selectedRoutePointIndex != null && !routeDraft) {
        const route = getRouteById(selectedRouteId);
        if (
          route &&
          selectedRoutePointIndex > 0 &&
          selectedRoutePointIndex < route.points.length - 1
        ) {
          e.preventDefault();
          deleteRoutePoint(selectedRouteId, selectedRoutePointIndex);
          return;
        }
      }
    }
    if (e.key === "Delete" && !typing) {
      if (selectedRouteId && selectedRoutePointIndex == null && !routeDraft) {
        e.preventDefault();
        deleteRoute(selectedRouteId);
        return;
      }
    }
    if (e.key !== "Escape") return;
    if (heightEditorTarget) {
      closeHeightEditor(false);
      return;
    }
    if (routeDraft) {
      cancelRoute();
    }
  });

  document.querySelector('.tab[data-tab="groundplan"]')?.addEventListener("click", () => {
    refreshPlacesPalette();
    renderPlaceMarkers();
  });

  panZoom.bind();

  render();

  function exportState() {
    return deepClone(state);
  }

  /** @param {object} data */
  function importState(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid groundplan state.");
    }
    state.imageDataUrl = typeof data.imageDataUrl === "string" ? data.imageDataUrl : null;
    state.imageWidth = Number(data.imageWidth) || 0;
    state.imageHeight = Number(data.imageHeight) || 0;
    state.scale =
      data.scale && typeof data.scale === "object"
        ? {
            pointA: data.scale.pointA ?? null,
            pointB: data.scale.pointB ?? null,
            unit: data.scale.unit === "imperial" ? "imperial" : "metric",
            distanceMeters:
              typeof data.scale.distanceMeters === "number" ? data.scale.distanceMeters : null,
          }
        : emptyGroundplanScale();
    state.placeMarkers = Array.isArray(data.placeMarkers)
      ? deepClone(data.placeMarkers).map((marker) => normalizePlaceMarker(marker))
      : [];
    state.cableRoutes = Array.isArray(data.cableRoutes)
      ? deepClone(data.cableRoutes).map((route) => normalizeCableRoute(route))
      : [];
    state.rulerLines = Array.isArray(data.rulerLines) ? deepClone(data.rulerLines) : [];
    state.showScaleInViewport = data.showScaleInViewport !== false;
    scalePickStep = 0;
    routeDraft = null;
    routePreview = null;
    selectedRouteId = null;
    selectedRoutePointIndex = null;
    closeHeightEditor(false);
    panZoom.resetView({ x: 40, y: 40 }, 1);
    if (state.imageDataUrl) {
      setStatus(
        isScaleComplete()
          ? "Groundplan loaded from site plan."
          : "Groundplan loaded — click two known points on the plan to set scale."
      );
    } else {
      setStatus("Upload a groundplan PNG to begin.");
    }
    if (state.imageDataUrl && isScaleComplete()) {
      collapseFloorPlanAfterImport();
    } else {
      setFloorPlanSectionOpen(true);
    }
    render();
  }

  return { exportState, importState };
}

export const calculatorPlugin = {
  meta: groundplanPluginMeta,
  init: initGroundplan,
};
