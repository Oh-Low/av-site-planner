import { isPanPointerDown } from "./dom.js";

/** @param {number} n @param {number} min @param {number} max */
export function clampZoom(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * CSS transform pan/zoom for a world element inside a viewport.
 * @param {{
 *   viewport: HTMLElement,
 *   world: HTMLElement,
 *   getEnabled?: () => boolean,
 *   defaultPan?: { x: number, y: number },
 *   defaultZoom?: number,
 *   minZoom?: number,
 *   maxZoom?: number,
 *   zoomWheelFactor?: number,
 *   onChange?: () => void,
 * }} options
 */
export function createTransformPanZoom(options) {
  const {
    viewport,
    world,
    getEnabled = () => true,
    defaultPan = { x: 0, y: 0 },
    defaultZoom = 1,
    minZoom = 0.35,
    maxZoom = 2.5,
    zoomWheelFactor = 1.1,
    onChange,
  } = options;

  const view = {
    panX: defaultPan.x,
    panY: defaultPan.y,
    zoom: defaultZoom,
  };

  const panDrag = { active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 };

  function applyView() {
    world.style.transform = `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
    world.style.transformOrigin = "0 0";
    onChange?.();
  }

  function clientToWorld(clientX, clientY) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.panX) / view.zoom,
      y: (clientY - rect.top - view.panY) / view.zoom,
    };
  }

  /** @param {{ x: number, y: number }} [pan] @param {number} [zoom] */
  function resetView(pan = defaultPan, zoom = defaultZoom) {
    view.panX = pan.x;
    view.panY = pan.y;
    view.zoom = zoom;
    applyView();
  }

  function onWheel(e) {
    if (!getEnabled()) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? zoomWheelFactor : 1 / zoomWheelFactor;
    const before = clientToWorld(e.clientX, e.clientY);
    view.zoom = clampZoom(view.zoom * factor, minZoom, maxZoom);
    const after = clientToWorld(e.clientX, e.clientY);
    view.panX += (after.x - before.x) * view.zoom;
    view.panY += (after.y - before.y) * view.zoom;
    applyView();
  }

  function endPan() {
    if (!panDrag.active) return;
    panDrag.active = false;
    viewport.classList.remove("is-panning");
  }

  function bind() {
    viewport.addEventListener("pointerdown", (e) => {
      if (!isPanPointerDown(e) || !getEnabled()) return;
      e.preventDefault();
      panDrag.active = true;
      panDrag.startX = e.clientX;
      panDrag.startY = e.clientY;
      panDrag.startPanX = view.panX;
      panDrag.startPanY = view.panY;
      viewport.classList.add("is-panning");
    });

    window.addEventListener("pointermove", (e) => {
      if (!panDrag.active) return;
      view.panX = panDrag.startPanX + (e.clientX - panDrag.startX);
      view.panY = panDrag.startPanY + (e.clientY - panDrag.startY);
      applyView();
    });

    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  return {
    view,
    applyView,
    clientToWorld,
    resetView,
    bind,
    get isPanning() {
      return panDrag.active;
    },
  };
}

/**
 * SVG viewBox pan/zoom for calculators that render into a fixed coordinate space.
 * @param {{
 *   container: HTMLElement,
 *   getSvg: () => SVGSVGElement | null,
 *   getView: () => { panX: number, panY: number, zoom: number, contentW: number, contentH: number },
 *   getEnabled?: () => boolean,
 *   minZoom?: number,
 *   maxZoom?: number,
 *   zoomWheelFactor?: number,
 *   onChange?: () => void,
 * }} options
 */
export function createSvgViewBoxPanZoom(options) {
  const {
    container,
    getSvg,
    getView,
    getEnabled = () => true,
    minZoom = 0.25,
    maxZoom = 4,
    zoomWheelFactor = 1.12,
    onChange,
  } = options;

  const panDrag = { active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 };

  function applyView() {
    const view = getView();
    const svg = getSvg();
    if (!view.contentW || !view.contentH || !svg) return;

    const viewW = view.contentW / view.zoom;
    const viewH = view.contentH / view.zoom;
    const maxPanX = Math.max(0, view.contentW - viewW);
    const maxPanY = Math.max(0, view.contentH - viewH);

    view.panX = Math.min(maxPanX, Math.max(0, view.panX));
    view.panY = Math.min(maxPanY, Math.max(0, view.panY));

    svg.setAttribute("viewBox", `${view.panX} ${view.panY} ${viewW} ${viewH}`);
    onChange?.();
  }

  function zoomAt(clientX, clientY, factor) {
    const view = getView();
    const svg = getSvg();
    if (!view.contentW || !view.contentH || !svg) return;

    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM()?.inverse();
    if (!ctm) return;

    const anchor = pt.matrixTransform(ctm);
    const oldZoom = view.zoom;
    const newZoom = clampZoom(view.zoom * factor, minZoom, maxZoom);
    if (newZoom === oldZoom) return;

    const oldViewW = view.contentW / oldZoom;
    const oldViewH = view.contentH / oldZoom;
    const newViewW = view.contentW / newZoom;
    const newViewH = view.contentH / newZoom;
    const relX = (anchor.x - view.panX) / oldViewW;
    const relY = (anchor.y - view.panY) / oldViewH;

    view.zoom = newZoom;
    view.panX = anchor.x - relX * newViewW;
    view.panY = anchor.y - relY * newViewH;
    applyView();
  }

  function endPan() {
    if (!panDrag.active) return;
    panDrag.active = false;
    container.classList.remove("is-panning");
  }

  function bind() {
    container.addEventListener(
      "wheel",
      (e) => {
        if (!getEnabled()) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? zoomWheelFactor : 1 / zoomWheelFactor;
        zoomAt(e.clientX, e.clientY, factor);
      },
      { passive: false }
    );

    container.addEventListener(
      "pointerdown",
      (e) => {
        if (!isPanPointerDown(e) || !getEnabled()) return;
        e.preventDefault();
        const view = getView();
        panDrag.active = true;
        panDrag.startX = e.clientX;
        panDrag.startY = e.clientY;
        panDrag.startPanX = view.panX;
        panDrag.startPanY = view.panY;
        container.classList.add("is-panning");
      },
      true
    );

    window.addEventListener("pointermove", (e) => {
      if (!panDrag.active) return;
      const svg = getSvg();
      const view = getView();
      if (!svg?.clientWidth || !view.contentW) return;

      const viewW = view.contentW / view.zoom;
      const viewH = view.contentH / view.zoom;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = ((e.clientX - panDrag.startX) / rect.width) * viewW;
      const dy = ((e.clientY - panDrag.startY) / rect.height) * viewH;
      view.panX = panDrag.startPanX - dx;
      view.panY = panDrag.startPanY - dy;
      applyView();
    });

    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    container.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  return {
    applyView,
    zoomAt,
    resetView() {
      const view = getView();
      view.panX = 0;
      view.panY = 0;
      view.zoom = 1;
      applyView();
    },
    bind,
    get isPanning() {
      return panDrag.active;
    },
  };
}
