/**
 * Interactive scene editor for a paperwork page: pan/zoom, select, drag,
 * edge/corner resize, delete, click-to-edit field overrides, and drawing tools.
 * Page coordinates are inches; the artboard is the pan/zoom world.
 */

import {
  fullImageCrop,
  normalizeGroundplanCrop,
  resizeCropByHandle,
} from "./groundplan-svg.js";
import { strokeWidthInches } from "./decoration-render.js";
import { roundTo } from "./numbers.js";
import { PAPERWORK_DPI } from "./paper-sizes.js";
import { isPanPointerDown } from "../shared/dom.js";
import { createDoubleClickTracker } from "../shared/double-click.js";
import { clampZoom, createTransformPanZoom } from "../shared/pan-zoom.js";

const MIN_SIZE_IN = 0.35;
const EDGE_HIT_PX = 10;
const DRAG_THRESHOLD_PX = 4;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const POLYLINE_PAD_IN = 0.05;
const DEFAULT_TEXT_W_IN = 2.5;
const DEFAULT_TEXT_H_IN = 0.75;
const DEFAULT_SHAPE_W_IN = 1.5;
const DEFAULT_SHAPE_H_IN = 1;

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 *   z: number,
 *   style: { fill: string, stroke: string, strokeWidth: number, fontSize: number },
 *   content: Record<string, unknown>,
 * }} PageDecoration
 */

/**
 * @param {{
 *   viewport: HTMLElement,
 *   artboard: HTMLElement,
 *   getSheet: () => import("./state.js").SheetInstance | null,
 *   getPaper: () => { widthIn: number, heightIn: number, widthPx: number, heightPx: number },
 *   getSelectedId: () => string | null,
 *   setSelectedId: (id: string | null) => void,
 *   onChange: () => void,
 *   onViewChange?: () => void,
 *   renderElement: (host: HTMLElement, element: import("./state.js").PageElement) => void,
 *   resolveFieldValue?: (element: import("./state.js").PageElement, fieldId: string) => string | null,
 *   commitField?: (element: import("./state.js").PageElement, fieldId: string, value: string) => boolean,
 *   getVisibleDecorations?: () => PageDecoration[],
 *   getDecorationById?: (id: string) => PageDecoration | null,
 *   getSelectedDecorationId?: () => string | null,
 *   setSelectedDecorationId?: (id: string | null) => void,
 *   renderDecoration?: (host: HTMLElement, decoration: PageDecoration) => void,
 *   commitDecorationField?: (decoration: PageDecoration, fieldId: string, value: string) => boolean,
 *   onDeleteDecoration?: (id: string) => void,
 *   getVisibleElements?: () => import("./state.js").PageElement[],
 *   getElementById?: (id: string) => import("./state.js").PageElement | null,
 *   onDeleteElement?: (id: string) => void,
 *   getActiveTool?: () => string,
 *   getDrawStyle?: () => { fill: string, stroke: string, strokeWidth: number, fontSize: number },
 *   onCreateDecoration?: (partial: Partial<PageDecoration> & { type: string }) => void,
 *   getGrid?: () => { snap: boolean, visible: boolean, sizeIn: number },
 * }} options
 */
export function createSceneEditor(options) {
  const {
    viewport,
    artboard,
    getSheet,
    getPaper,
    getSelectedId,
    setSelectedId,
    onChange,
    onViewChange,
    renderElement,
    resolveFieldValue,
    commitField,
    getVisibleDecorations,
    getDecorationById,
    getSelectedDecorationId,
    setSelectedDecorationId,
    renderDecoration,
    commitDecorationField,
    onDeleteDecoration,
    getVisibleElements,
    getElementById,
    onDeleteElement,
    getActiveTool,
    getDrawStyle,
    onCreateDecoration,
    getGrid,
  } = options;

  /** @type {{ mode: "none" | "pending" | "move" | "resize" | "crop", targetKind: "element" | "decoration" | null, targetId: string | null, handle: string | null, fieldId: string | null, pointerId: number | null, startX: number, startY: number, orig: { x: number, y: number, w: number, h: number } | null, startCrop: { x: number, y: number, w: number, h: number } | null, startImagePt: { x: number, y: number } | null, imageWidth: number, imageHeight: number }} */
  const drag = {
    mode: "none",
    targetKind: null,
    targetId: null,
    handle: null,
    fieldId: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    orig: null,
    startCrop: null,
    startImagePt: null,
    imageWidth: 0,
    imageHeight: 0,
  };

  /** @type {{ mode: "none" | "pending" | "drag" | "polyline", tool: string | null, startX: number, startY: number, startIn: { x: number, y: number } | null, currentIn: { x: number, y: number } | null, points: { x: number, y: number }[], previewNode: HTMLElement | null }} */
  const draw = {
    mode: "none",
    tool: null,
    startX: 0,
    startY: 0,
    startIn: null,
    currentIn: null,
    points: [],
    previewNode: null,
  };

  /** @type {{ kind: "element" | "decoration", id: string, fieldId: string } | null} */
  let inlineEdit = null;

  /** Manual double-click tracking — pointer capture + paint() break native dblclick. */
  const textDecorationClicks = createDoubleClickTracker();

  const panZoom = createTransformPanZoom({
    viewport,
    world: artboard,
    minZoom: 0.08,
    maxZoom: 4,
    zoomWheelFactor: 1.12,
    getEnabled: () => drag.mode === "none" && draw.mode === "none" && !inlineEdit,
    onChange: () => onViewChange?.(),
  });

  function inchesToPx(inches) {
    const paper = getPaper();
    return (inches / paper.widthIn) * paper.widthPx;
  }

  /** @param {number} value */
  function snapInches(value) {
    const grid = getGrid?.();
    if (!grid?.snap) return roundTo(value);
    const size = Math.max(0.05, Number(grid.sizeIn) || 0.25);
    return roundTo(Math.round(value / size) * size);
  }

  /**
   * @param {{ x: number, y: number, w: number, h: number }} frame
   * @param {"move" | "resize"} mode
   * @param {string | null} handle
   */
  function snapFrame(frame, mode, handle) {
    let { x, y, w, h } = frame;
    if (mode === "move") {
      return { x: snapInches(x), y: snapInches(y), w: roundTo(w), h: roundTo(h) };
    }
    const right = x + w;
    const bottom = y + h;
    if (handle?.includes("e")) {
      w = Math.max(MIN_SIZE_IN, snapInches(right) - x);
    }
    if (handle?.includes("s")) {
      h = Math.max(MIN_SIZE_IN, snapInches(bottom) - y);
    }
    if (handle?.includes("w")) {
      const nextX = snapInches(x);
      w = Math.max(MIN_SIZE_IN, right - nextX);
      x = right - w;
    }
    if (handle?.includes("n")) {
      const nextY = snapInches(y);
      h = Math.max(MIN_SIZE_IN, bottom - nextY);
      y = bottom - h;
    }
    return {
      x: roundTo(Math.max(0, x)),
      y: roundTo(Math.max(0, y)),
      w: roundTo(w),
      h: roundTo(h),
    };
  }

  function updateGridOverlay() {
    const grid = getGrid?.();
    const show = Boolean(grid?.visible || grid?.snap);
    artboard.classList.toggle("pw-grid-visible", show);
    if (!show) return;
    const sizeIn = Math.max(0.05, Number(grid?.sizeIn) || 0.25);
    const sizePx = inchesToPx(sizeIn);
    artboard.style.setProperty("--pw-grid-size", `${sizePx}px`);
  }

  function clientToInches(clientX, clientY) {
    const rect = artboard.getBoundingClientRect();
    const paper = getPaper();
    const x = ((clientX - rect.left) / rect.width) * paper.widthIn;
    const y = ((clientY - rect.top) / rect.height) * paper.heightIn;
    return { x: snapInches(x), y: snapInches(y) };
  }

  function activeTool() {
    return getActiveTool?.() ?? "select";
  }

  function isDrawToolActive() {
    return activeTool() !== "select";
  }

  function findElement(id) {
    return (
      getElementById?.(id) ??
      getSheet()?.elements.find((el) => el.id === id) ??
      null
    );
  }

  function findDecoration(id) {
    return getDecorationById?.(id) ?? null;
  }

  /** @param {"element" | "decoration"} kind @param {string} id */
  function getFrame(kind, id) {
    if (kind === "element") {
      const el = findElement(id);
      return el ? { x: el.x, y: el.y, w: el.w, h: el.h } : null;
    }
    const dec = findDecoration(id);
    return dec ? { x: dec.x, y: dec.y, w: dec.w, h: dec.h } : null;
  }

  /** @param {"element" | "decoration"} kind @param {string} id @param {{ x: number, y: number, w: number, h: number }} frame */
  function setFrame(kind, id, frame) {
    if (kind === "element") {
      const el = findElement(id);
      if (!el) return;
      el.x = roundTo(frame.x);
      el.y = roundTo(frame.y);
      el.w = roundTo(frame.w);
      el.h = roundTo(frame.h);
      return;
    }
    const dec = findDecoration(id);
    if (!dec) return;
    dec.x = roundTo(frame.x);
    dec.y = roundTo(frame.y);
    dec.w = roundTo(frame.w);
    dec.h = roundTo(frame.h);
  }

  function clearSelection() {
    setSelectedId(null);
    setSelectedDecorationId?.(null);
  }

  function toolToDecorationType(tool) {
    switch (tool) {
      case "text":
        return "drawText";
      case "heading":
        return "drawHeading";
      case "line":
        return "drawLine";
      case "arrow":
        return "drawArrow";
      case "rect":
        return "drawRect";
      case "ellipse":
        return "drawEllipse";
      case "polyline":
        return "drawPolyline";
      default:
        return null;
    }
  }

  function removeDrawPreview() {
    if (draw.previewNode?.parentNode) draw.previewNode.remove();
    draw.previewNode = null;
  }

  function cancelDraw() {
    removeDrawPreview();
    draw.mode = "none";
    draw.tool = null;
    draw.startIn = null;
    draw.currentIn = null;
    draw.points = [];
  }

  function updateDrawPreview() {
    removeDrawPreview();
    const tool = draw.tool;
    if (!tool || draw.mode === "none") return;

    const style = getDrawStyle?.() ?? {
      fill: "#ffffff",
      stroke: "#111111",
      strokeWidth: 2,
      fontSize: 14,
    };
    const paper = getPaper();
    /** @param {{ x: number, y: number }} pt */
    const toPx = (pt) => ({
      x: (pt.x / paper.widthIn) * paper.widthPx,
      y: (pt.y / paper.heightIn) * paper.heightPx,
    });
    // Stroke in artboard pixels (viewBox is pixel-sized) so it matches the cursor 1:1.
    const sw = Math.max(1, (Number(style.strokeWidth) || 2) * (PAPERWORK_DPI / 72));

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "pw-draw-preview");
    svg.setAttribute("viewBox", `0 0 ${paper.widthPx} ${paper.heightPx}`);
    svg.setAttribute("width", String(paper.widthPx));
    svg.setAttribute("height", String(paper.heightPx));
    Object.assign(svg.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: `${paper.widthPx}px`,
      height: `${paper.heightPx}px`,
      pointerEvents: "none",
      zIndex: "9999",
      overflow: "visible",
    });

    if (draw.mode === "drag" && draw.startIn && draw.currentIn) {
      const a = toPx(draw.startIn);
      const b = toPx(draw.currentIn);
      if (tool === "line" || tool === "arrow") {
        const markerId = "pw-draw-preview-arrow";
        const marker =
          tool === "arrow"
            ? `<defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${style.stroke}" /></marker></defs>`
            : "";
        const markerAttr = tool === "arrow" ? ` marker-end="url(#${markerId})"` : "";
        svg.innerHTML = `${marker}<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${style.stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${sw * 2} ${sw * 1.5}"${markerAttr} />`;
      } else if (tool === "ellipse") {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.max(1, Math.abs(b.x - a.x));
        const h = Math.max(1, Math.abs(b.y - a.y));
        svg.innerHTML = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${Math.max(0, w / 2 - sw / 2)}" ry="${Math.max(0, h / 2 - sw / 2)}" fill="${style.fill}" fill-opacity="0.15" stroke="${style.stroke}" stroke-width="${sw}" stroke-dasharray="${sw * 2} ${sw * 1.5}" />`;
      } else {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.max(1, Math.abs(b.x - a.x));
        const h = Math.max(1, Math.abs(b.y - a.y));
        svg.innerHTML = `<rect x="${x + sw / 2}" y="${y + sw / 2}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" fill="${style.fill}" fill-opacity="0.15" stroke="${style.stroke}" stroke-width="${sw}" stroke-dasharray="${sw * 2} ${sw * 1.5}" />`;
      }
      artboard.appendChild(svg);
      draw.previewNode = svg;
      return;
    }

    if (draw.mode === "polyline" && draw.points.length) {
      const pts = draw.points;
      const cur = draw.currentIn;
      const all = cur ? [...pts, cur] : pts;
      const d = all
        .map((p, i) => {
          const px = toPx(p);
          return `${i === 0 ? "M" : "L"} ${px.x} ${px.y}`;
        })
        .join(" ");
      svg.innerHTML = `<path d="${d}" fill="none" stroke="${style.stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${sw * 2} ${sw * 1.5}" />`;
      artboard.appendChild(svg);
      draw.previewNode = svg;
    }
  }

  /** @param {Partial<PageDecoration> & { type: string }} partial */
  function createDecorationFromDraw(partial, options = {}) {
    onCreateDecoration?.(partial);
    cancelDraw();
    paint();
    onChange();
    if (options.editText) {
      const id = getSelectedDecorationId?.();
      if (id) queueDecorationTextEdit(id);
    }
  }

  /**
   * Start inline text edit after the next paint frame (DOM must exist).
   * @param {string} decorationId
   */
  function queueDecorationTextEdit(decorationId) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = artboard.querySelector(
          `[data-decoration-id="${CSS.escape(decorationId)}"]`
        );
        if (!(node instanceof HTMLElement)) return;
        const host =
          node.querySelector(".pw-decoration-text") ||
          resolveEditHost(node, "body", null);
        if (host instanceof HTMLElement) {
          beginDecorationInlineEdit(decorationId, "body", host);
        }
      });
    });
  }

  function finishPolyline() {
    if (draw.mode !== "polyline" || draw.points.length < 2) {
      cancelDraw();
      paint();
      return;
    }
    const type = toolToDecorationType("polyline");
    if (!type) {
      cancelDraw();
      return;
    }
    const style = getDrawStyle?.() ?? {
      fill: "#ffffff",
      stroke: "#111111",
      strokeWidth: 2,
      fontSize: 14,
    };
    const pts = draw.points;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = strokeWidthInches(style.strokeWidth) / 2 + POLYLINE_PAD_IN;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    const w = Math.max(0.02, maxX - minX);
    const h = Math.max(0.02, maxY - minY);
    createDecorationFromDraw({
      type,
      x: minX,
      y: minY,
      w,
      h,
      style,
      content: {
        points: pts.map((p) => ({ x: p.x - minX, y: p.y - minY })),
      },
      showOnAllSheets: false,
    });
  }

  function finishDragDraw() {
    const tool = draw.tool;
    const type = tool ? toolToDecorationType(tool) : null;
    if (!tool || !type || !draw.startIn) {
      cancelDraw();
      return;
    }

    const style = getDrawStyle?.() ?? {
      fill: "#ffffff",
      stroke: "#111111",
      strokeWidth: 2,
      fontSize: 14,
    };

    if (tool === "line" || tool === "arrow") {
      const end = draw.currentIn ?? draw.startIn;
      const x1 = draw.startIn.x;
      const y1 = draw.startIn.y;
      const x2 = end.x;
      const y2 = end.y;
      // Tight frame around the real segment (+ stroke pad). Do not inflate with
      // MIN_SIZE — that made the selection box larger than the path and the
      // line looked scaled-down / axis-aligned inside the box.
      const pad = strokeWidthInches(style.strokeWidth) / 2 + 0.01;
      const x = Math.min(x1, x2) - pad;
      const y = Math.min(y1, y2) - pad;
      const w = Math.max(0.02, Math.abs(x2 - x1) + pad * 2);
      const h = Math.max(0.02, Math.abs(y2 - y1) + pad * 2);
      createDecorationFromDraw({
        type,
        x,
        y,
        w,
        h,
        style,
        content: {
          points: [
            { x: x1 - x, y: y1 - y },
            { x: x2 - x, y: y2 - y },
          ],
        },
        showOnAllSheets: false,
      });
      return;
    }

    if (tool === "rect" || tool === "ellipse") {
      const end = draw.currentIn ?? draw.startIn;
      const dist = Math.hypot(end.x - draw.startIn.x, end.y - draw.startIn.y);
      let x;
      let y;
      let w;
      let h;
      if (dist * inchesToPx(1) < DRAG_THRESHOLD_PX) {
        x = draw.startIn.x;
        y = draw.startIn.y;
        w = DEFAULT_SHAPE_W_IN;
        h = DEFAULT_SHAPE_H_IN;
      } else {
        const x1 = draw.startIn.x;
        const y1 = draw.startIn.y;
        const x2 = end.x;
        const y2 = end.y;
        x = Math.min(x1, x2);
        y = Math.min(y1, y2);
        w = Math.max(0.05, Math.abs(x2 - x1));
        h = Math.max(0.05, Math.abs(y2 - y1));
      }
      createDecorationFromDraw({
        type,
        x,
        y,
        w,
        h,
        style,
        content: {},
        showOnAllSheets: false,
      });
    }
  }

  function finishTextDraw(pt, toolId = draw.tool) {
    const tool = toolId;
    const type = tool ? toolToDecorationType(tool) : null;
    if (!tool || !type) {
      cancelDraw();
      return;
    }
    createDecorationFromDraw({
      type,
      x: pt.x,
      y: pt.y,
      w: DEFAULT_TEXT_W_IN,
      h: DEFAULT_TEXT_H_IN,
      style: getDrawStyle?.() ?? { fill: "#ffffff", stroke: "#111111", strokeWidth: 2, fontSize: 14 },
      content: { body: tool === "heading" ? "HEADING" : "Text" },
      showOnAllSheets: false,
    }, { editText: true });
  }

  function autoValueForField(el, fieldId) {
    if (el.type === "detailTable" && Array.isArray(el.content?.fields)) {
      const field = el.content.fields.find((f) => f && f.id === fieldId);
      return field ? String(field.auto ?? "") : "";
    }
    if (fieldId === "body") {
      if (typeof el.content?.body === "string") return el.content.body;
    }
    return "";
  }

  /**
   * @param {import("./state.js").PageElement} el
   * @param {string} fieldId
   */
  function currentFieldValue(el, fieldId) {
    if (typeof el.overrides?.[fieldId] === "string") return el.overrides[fieldId];
    const shared = resolveFieldValue?.(el, fieldId);
    if (typeof shared === "string") return shared;
    return autoValueForField(el, fieldId);
  }

  /** @param {PageDecoration} dec @param {string} fieldId */
  function currentDecorationFieldValue(dec, fieldId) {
    if (fieldId === "body" && typeof dec.content?.body === "string") return dec.content.body;
    return "";
  }

  /** @param {HTMLElement} node */
  function appendResizeHandles(node) {
    for (const handle of HANDLES) {
      const h = document.createElement("span");
      h.className = `pw-resize-handle pw-resize-${handle}`;
      h.dataset.handle = handle;
      node.appendChild(h);
    }
  }

  function paint() {
    if (inlineEdit) return;
    const sheet = getSheet();
    const paper = getPaper();
    artboard.style.width = `${paper.widthPx}px`;
    artboard.style.height = `${paper.heightPx}px`;
    updateGridOverlay();
    artboard.innerHTML = "";
    if (!sheet) {
      artboard.classList.add("is-empty");
      return;
    }
    artboard.classList.remove("is-empty");

    const selectedId = getSelectedId();
    const selectedDecorationId = getSelectedDecorationId?.() ?? null;
    const elements = (
      getVisibleElements?.() ?? [...(sheet.elements ?? [])]
    ).sort((a, b) => a.z - b.z);

    for (const el of elements) {
      const node = document.createElement("div");
      node.className = `pw-element${el.id === selectedId ? " is-selected" : ""}${
        el.locked ? " is-locked" : ""
      }`;
      node.dataset.elementId = el.id;
      node.style.left = `${inchesToPx(el.x)}px`;
      node.style.top = `${inchesToPx(el.y)}px`;
      node.style.width = `${inchesToPx(el.w)}px`;
      node.style.height = `${inchesToPx(el.h)}px`;
      node.style.zIndex = String(el.z);

      const body = document.createElement("div");
      body.className = "pw-element-body";
      renderElement(body, el);
      node.appendChild(body);

      if (el.id === selectedId && !el.locked) {
        appendResizeHandles(node);
      }

      artboard.appendChild(node);
    }

    const decorations = getVisibleDecorations?.() ?? [];
    for (const dec of decorations) {
      const node = document.createElement("div");
      node.className = `pw-decoration${dec.id === selectedDecorationId ? " is-selected" : ""}`;
      node.dataset.decorationId = dec.id;
      node.style.left = `${inchesToPx(dec.x)}px`;
      node.style.top = `${inchesToPx(dec.y)}px`;
      node.style.width = `${inchesToPx(dec.w)}px`;
      node.style.height = `${inchesToPx(dec.h)}px`;
      node.style.zIndex = String(dec.z);

      const body = document.createElement("div");
      body.className = "pw-decoration-body";
      renderDecoration?.(body, dec);
      node.appendChild(body);

      if (dec.id === selectedDecorationId) {
        appendResizeHandles(node);
      }

      artboard.appendChild(node);
    }

    updateDrawPreview();
  }

  /**
   * @param {HTMLElement} node
   * @param {PointerEvent} e
   */
  function edgeHandleAt(node, e) {
    const rect = node.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nearL = x <= EDGE_HIT_PX;
    const nearR = x >= rect.width - EDGE_HIT_PX;
    const nearT = y <= EDGE_HIT_PX;
    const nearB = y >= rect.height - EDGE_HIT_PX;
    if (nearT && nearL) return "nw";
    if (nearT && nearR) return "ne";
    if (nearB && nearL) return "sw";
    if (nearB && nearR) return "se";
    if (nearT) return "n";
    if (nearB) return "s";
    if (nearL) return "w";
    if (nearR) return "e";
    return null;
  }

  /** @param {Element | null} target */
  function fieldIdFromTarget(target) {
    if (!(target instanceof Element)) return null;
    const host =
      target.closest("[data-field-id]") ||
      target.closest(".pw-el-notes-body") ||
      target.closest(".pw-el-text-body") ||
      target.closest(".pw-decoration-text");
    if (!host) return null;
    return (
      host.getAttribute("data-field-id") ||
      (host.classList.contains("pw-el-notes-body") ||
      host.classList.contains("pw-el-text-body") ||
      host.classList.contains("pw-decoration-text")
        ? "body"
        : null)
    );
  }

  /**
   * Prefer the value text node, not the whole labeled cell / table row.
   * @param {HTMLElement | null} node
   * @param {string} fieldId
   * @param {Element | null} [fromEl]
   * @returns {HTMLElement | null}
   */
  function resolveEditHost(node, fieldId, fromEl) {
    if (!node) return null;
    const esc = CSS.escape(fieldId);

    /** @type {Element | null} */
    let fieldRoot =
      (fromEl instanceof Element && fromEl.closest(`[data-field-id="${esc}"]`)) ||
      node.querySelector(`td[data-field-id="${esc}"]`) ||
      node.querySelector(`[data-field-id="${esc}"]:not(tr)`) ||
      (fieldId === "body"
        ? node.querySelector(".pw-el-notes-body, .pw-el-text-body, .pw-decoration-text")
        : null);

    if (fieldRoot?.tagName === "TR") {
      fieldRoot =
        fieldRoot.querySelector(`td[data-field-id="${esc}"]`) ||
        fieldRoot.querySelector("td.pw-editable") ||
        fieldRoot;
    }
    if (!(fieldRoot instanceof HTMLElement)) return null;

    const value =
      fieldRoot.querySelector(":scope > .pw-tb-value") ||
      fieldRoot.querySelector(":scope > .pw-tb-row-value") ||
      fieldRoot.querySelector(":scope > .pw-tb-logo-name") ||
      fieldRoot.querySelector(".pw-tb-value, .pw-tb-row-value, .pw-tb-logo-name");

    if (value instanceof HTMLElement) return value;
    if (
      fieldRoot.matches("td, .pw-el-notes-body, .pw-el-text-body, .pw-decoration-text")
    ) {
      return fieldRoot;
    }
    return fieldRoot;
  }

  /**
   * @param {"element" | "decoration"} kind
   * @param {string} id
   * @param {string} handle
   * @param {PointerEvent} e
   */
  function beginResize(kind, id, handle, e) {
    const frame = getFrame(kind, id);
    if (!frame) return;
    drag.mode = "resize";
    drag.targetKind = kind;
    drag.targetId = id;
    drag.handle = handle;
    drag.fieldId = null;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.orig = { ...frame };
    artboard.setPointerCapture?.(e.pointerId);
  }

  /**
   * @param {string} elementId
   * @param {string} fieldId
   * @param {HTMLElement} anchor
   */
  function beginInlineEdit(elementId, fieldId, anchor) {
    const el = findElement(elementId);
    if (!el || el.locked) return;
    endInlineEdit(false);

    const current = currentFieldValue(el, fieldId);

    const node = artboard.querySelector(`[data-element-id="${CSS.escape(elementId)}"]`);
    const host =
      resolveEditHost(node instanceof HTMLElement ? node : null, fieldId, anchor) || anchor;

    const multiline = el.type === "notes" || el.type === "scopeSummary" || el.type === "text";
    const input = multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    input.className = multiline ? "pw-inline-edit pw-inline-edit-block" : "pw-inline-edit";
    if (input instanceof HTMLInputElement) {
      input.type = "text";
    } else {
      input.rows = 4;
    }
    input.value = current === "—" ? "" : current;
    input.dataset.elementId = elementId;
    input.dataset.fieldId = fieldId;

    const cs = getComputedStyle(host);
    input.style.fontSize = cs.fontSize;
    input.style.fontFamily = cs.fontFamily;
    input.style.fontWeight = cs.fontWeight;
    input.style.letterSpacing = cs.letterSpacing;
    input.style.lineHeight = cs.lineHeight;
    input.style.textAlign = cs.textAlign;
    input.style.textTransform = cs.textTransform;

    host.classList.add("is-editing");
    host.appendChild(input);
    inlineEdit = { kind: "element", id: elementId, fieldId };

    const syncInputWidth = () => {
      if (!(input instanceof HTMLInputElement)) return;
      const base = Math.max(host.clientWidth, 24);
      input.style.width = "0px";
      const needed = Math.ceil(input.scrollWidth) + 10;
      input.style.width = `${Math.max(base, needed)}px`;
    };

    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      if (input instanceof HTMLInputElement) input.select();
      syncInputWidth();
    });

    const commit = () => endInlineEdit(true);
    const cancel = () => endInlineEdit(false);
    input.addEventListener("input", syncInputWidth);
    input.addEventListener("blur", commit);
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      } else if (ev.key === "Enter" && !multiline) {
        ev.preventDefault();
        commit();
      } else if (ev.key === "Enter" && multiline && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        commit();
      }
    });
  }

  /**
   * @param {string} decorationId
   * @param {string} fieldId
   * @param {HTMLElement} anchor
   */
  function beginDecorationInlineEdit(decorationId, fieldId, anchor) {
    const dec = findDecoration(decorationId);
    if (!dec) return;
    endInlineEdit(false);

    const current = currentDecorationFieldValue(dec, fieldId);
    const node = artboard.querySelector(
      `[data-decoration-id="${CSS.escape(decorationId)}"]`
    );
    const host =
      (anchor instanceof HTMLElement && anchor.classList.contains("pw-decoration-text")
        ? anchor
        : null) ||
      (node instanceof HTMLElement
        ? node.querySelector(".pw-decoration-text")
        : null) ||
      resolveEditHost(node instanceof HTMLElement ? node : null, fieldId, anchor) ||
      anchor;

    if (!(host instanceof HTMLElement)) return;

    const input = document.createElement("textarea");
    input.className = "pw-inline-edit pw-inline-edit-block";
    input.rows = 2;
    input.value = current;
    input.dataset.decorationId = decorationId;
    input.dataset.fieldId = fieldId;

    const cs = getComputedStyle(host);
    input.style.fontSize = cs.fontSize;
    input.style.fontFamily = cs.fontFamily;
    input.style.fontWeight = cs.fontWeight;
    input.style.letterSpacing = cs.letterSpacing;
    input.style.lineHeight = cs.lineHeight;
    input.style.textAlign = cs.textAlign;
    input.style.textTransform = cs.textTransform;
    input.style.width = "100%";
    input.style.height = "100%";
    input.style.boxSizing = "border-box";
    input.style.resize = "none";

    host.classList.add("is-editing");
    host.appendChild(input);
    inlineEdit = { kind: "decoration", id: decorationId, fieldId };

    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.select();
    });

    const commit = () => endInlineEdit(true);
    const cancel = () => endInlineEdit(false);
    input.addEventListener("blur", commit);
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        commit();
      }
    });
  }

  /** @param {boolean} save */
  function endInlineEdit(save) {
    if (!inlineEdit) return;
    const { kind, id, fieldId } = inlineEdit;
    inlineEdit = null;
    const input = artboard.querySelector(".pw-inline-edit");

    if (kind === "element") {
      const el = findElement(id);
      if (save && el && input instanceof HTMLElement && "value" in input) {
        const value = String(/** @type {HTMLInputElement} */ (input).value);
        if (!commitField?.(el, fieldId, value)) {
          if (!el.overrides) el.overrides = {};
          const auto = autoValueForField(el, fieldId);
          if (value === auto) delete el.overrides[fieldId];
          else el.overrides[fieldId] = value;
        }
      }
    } else {
      const dec = findDecoration(id);
      if (save && dec && input instanceof HTMLElement && "value" in input) {
        const value = String(/** @type {HTMLTextAreaElement} */ (input).value);
        if (!commitDecorationField?.(dec, fieldId, value)) {
          if (!dec.content || typeof dec.content !== "object") dec.content = {};
          dec.content[fieldId] = value;
        }
      }
    }

    paint();
    onChange();
  }

  /**
   * @param {SVGSVGElement} svg
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ x: number, y: number } | null}
   */
  function clientToSvgPoint(svg, clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const mapped = pt.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  /**
   * @param {string} elementId
   * @param {string} handle
   * @param {PointerEvent} e
   * @param {import("./state.js").PageElement} el
   * @param {SVGSVGElement} svg
   */
  function beginCropResize(elementId, handle, e, el, svg) {
    const width = Math.max(
      1,
      Number(svg.dataset.cropWidth) || Number(svg.dataset.gpImageWidth) || 0
    );
    const height = Math.max(
      1,
      Number(svg.dataset.cropHeight) || Number(svg.dataset.gpImageHeight) || 0
    );
    const startPt = clientToSvgPoint(svg, e.clientX, e.clientY);
    if (!startPt || width < 1 || height < 1) return;
    const stored = normalizeGroundplanCrop(el.content?.crop, width, height);
    drag.mode = "crop";
    drag.targetKind = "element";
    drag.targetId = elementId;
    drag.handle = handle;
    drag.fieldId = null;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    drag.startCrop = stored ?? fullImageCrop(width, height);
    drag.startImagePt = startPt;
    drag.imageWidth = width;
    drag.imageHeight = height;
    artboard.setPointerCapture?.(e.pointerId);
  }

  function onDrawPointerDown(e) {
    const tool = activeTool();
    if (tool === "select") return false;

    e.preventDefault();
    e.stopPropagation();

    const pt = clientToInches(e.clientX, e.clientY);

    if (tool === "polyline") {
      if (draw.mode !== "polyline") {
        draw.mode = "polyline";
        draw.tool = tool;
        draw.points = [pt];
      } else {
        draw.points.push(pt);
      }
      draw.currentIn = pt;
      updateDrawPreview();
      artboard.setPointerCapture?.(e.pointerId);
      return true;
    }

    if (tool === "text" || tool === "heading") {
      draw.mode = "pending";
      draw.tool = tool;
      draw.startX = e.clientX;
      draw.startY = e.clientY;
      draw.startIn = pt;
      artboard.setPointerCapture?.(e.pointerId);
      return true;
    }

    draw.mode = "drag";
    draw.tool = tool;
    draw.startX = e.clientX;
    draw.startY = e.clientY;
    draw.startIn = pt;
    draw.currentIn = pt;
    updateDrawPreview();
    artboard.setPointerCapture?.(e.pointerId);
    return true;
  }

  function onPointerDown(e) {
    if (isPanPointerDown(e) || panZoom.isPanning) return;
    if (e.button !== 0) return;

    if (inlineEdit) {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest?.(".pw-inline-edit")) return;
      endInlineEdit(true);
      return;
    }

    const target = /** @type {HTMLElement} */ (e.target);

    // Drawing tools own the click anywhere on the artboard (including over
    // existing elements), except interactive resize/crop chrome.
    if (isDrawToolActive()) {
      if (target.closest?.(".pw-resize-handle, [data-crop-handle]")) return;
      if (onDrawPointerDown(e)) return;
      return;
    }

    const cropHandleEl = target.closest?.("[data-crop-handle]");
    const handleEl = target.closest?.(".pw-resize-handle");
    const decNode = target.closest?.(".pw-decoration");
    const node = target.closest?.(".pw-element");

    if (cropHandleEl && node) {
      const id = node.dataset.elementId;
      const el = findElement(id);
      const svg = node.querySelector?.(
        "svg[data-crop-width], svg[data-gp-image-width]"
      );
      if (
        !el ||
        el.locked ||
        (el.type !== "groundplanDiagram" && el.type !== "signalFlowDiagram")
      ) {
        return;
      }
      if (!(svg instanceof SVGSVGElement)) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedId(id);
      setSelectedDecorationId?.(null);
      beginCropResize(id, cropHandleEl.getAttribute("data-crop-handle") ?? "se", e, el, svg);
      paint();
      onChange();
      return;
    }

    if (handleEl && decNode) {
      const id = decNode.dataset.decorationId;
      const dec = findDecoration(id);
      if (!dec) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedDecorationId?.(id);
      setSelectedId(null);
      beginResize("decoration", id, handleEl.dataset.handle ?? "se", e);
      paint();
      onChange();
      return;
    }

    if (handleEl && node) {
      const id = node.dataset.elementId;
      const el = findElement(id);
      if (!el || el.locked) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedId(id);
      setSelectedDecorationId?.(null);
      beginResize("element", id, handleEl.dataset.handle ?? "se", e);
      paint();
      onChange();
      return;
    }

    if (decNode) {
      const id = decNode.dataset.decorationId;
      const dec = findDecoration(id);
      if (!dec) return;
      e.stopPropagation();

      const isTextDec = dec.type === "drawText" || dec.type === "drawHeading";
      if (isTextDec) {
        if (textDecorationClicks.tap(id, e)) {
          e.preventDefault();
          drag.mode = "none";
          drag.targetId = null;
          drag.fieldId = null;
          setSelectedDecorationId?.(id);
          setSelectedId(null);
          paint();
          queueDecorationTextEdit(id);
          onChange();
          return;
        }
      } else {
        textDecorationClicks.reset();
      }

      const alreadySelected = getSelectedDecorationId?.() === id;
      const selectionChanged = !alreadySelected;
      setSelectedDecorationId?.(id);
      setSelectedId(null);
      // Text decorations edit on double-click only (not single-click).
      const fieldId = isTextDec ? null : fieldIdFromTarget(target);

      const edge =
        alreadySelected && !isTextDec ? edgeHandleAt(decNode, e) : null;
      if (edge) {
        e.preventDefault();
        beginResize("decoration", id, edge, e);
      } else {
        // Do not setPointerCapture here — it suppresses native dblclick and
        // can swallow the second click. Capture only after move begins.
        drag.mode = "pending";
        drag.targetKind = "decoration";
        drag.targetId = id;
        drag.handle = null;
        drag.fieldId = fieldId;
        drag.startX = e.clientX;
        drag.startY = e.clientY;
        drag.orig = { x: dec.x, y: dec.y, w: dec.w, h: dec.h };
        drag.pointerId = e.pointerId;
      }

      if (selectionChanged || drag.mode === "resize") {
        paint();
        onChange();
      }
      return;
    }

    if (node) {
      textDecorationClicks.reset();
      const id = node.dataset.elementId;
      const el = findElement(id);
      if (!el) return;
      e.stopPropagation();
      const alreadySelected = getSelectedId() === id;
      const selectionChanged = !alreadySelected;
      setSelectedId(id);
      setSelectedDecorationId?.(null);
      const fieldId = el.locked ? null : fieldIdFromTarget(target);

      if (!el.locked) {
        const edge = alreadySelected ? edgeHandleAt(node, e) : null;
        if (edge) {
          e.preventDefault();
          beginResize("element", id, edge, e);
        } else {
          drag.mode = "pending";
          drag.targetKind = "element";
          drag.targetId = id;
          drag.handle = null;
          drag.fieldId = fieldId;
          drag.startX = e.clientX;
          drag.startY = e.clientY;
          drag.orig = { x: el.x, y: el.y, w: el.w, h: el.h };
          artboard.setPointerCapture?.(e.pointerId);
        }
      }

      if (selectionChanged || drag.mode === "resize") {
        paint();
        onChange();
      }
      return;
    }

    clearSelection();
    textDecorationClicks.reset();
    paint();
    onChange();
  }

  function onPointerMove(e) {
    if (draw.mode === "drag") {
      draw.currentIn = clientToInches(e.clientX, e.clientY);
      updateDrawPreview();
      return;
    }

    if (draw.mode === "polyline") {
      draw.currentIn = clientToInches(e.clientX, e.clientY);
      updateDrawPreview();
      return;
    }

    if (drag.mode === "none" || !drag.targetId) return;
    if (drag.mode !== "crop" && !drag.orig) return;

    if (drag.mode === "pending") {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (dist < DRAG_THRESHOLD_PX) return;
      drag.mode = "move";
      drag.fieldId = null;
      textDecorationClicks.reset();
      if (drag.pointerId != null) {
        try {
          artboard.setPointerCapture?.(drag.pointerId);
        } catch {
          /* ignore */
        }
      }
      e.preventDefault();
    }

    if (drag.mode === "crop") {
      if (drag.targetKind !== "element") return;
      const el = findElement(drag.targetId);
      if (!el) return;
      if (!drag.startCrop || !drag.startImagePt || !drag.handle) return;
      const node = artboard.querySelector(
        `[data-element-id="${CSS.escape(drag.targetId)}"]`
      );
      const svg = node?.querySelector?.(
        "svg[data-crop-width], svg[data-gp-image-width]"
      );
      if (!(svg instanceof SVGSVGElement)) return;
      const currentPt = clientToSvgPoint(svg, e.clientX, e.clientY);
      if (!currentPt) return;
      const next = resizeCropByHandle(
        drag.startCrop,
        drag.handle,
        drag.startImagePt,
        currentPt,
        drag.imageWidth,
        drag.imageHeight
      );
      if (next) el.content = { ...el.content, crop: next };
      else if (el.content) delete el.content.crop;
      e.preventDefault();
      paint();
      return;
    }

    if (!drag.orig || !drag.targetKind || !drag.targetId) return;

    const paper = getPaper();
    const zoom = panZoom.view.zoom || 1;
    const dxPx = (e.clientX - drag.startX) / zoom;
    const dyPx = (e.clientY - drag.startY) / zoom;
    const dx = (dxPx / paper.widthPx) * paper.widthIn;
    const dy = (dyPx / paper.heightPx) * paper.heightIn;

    let { x, y, w, h } = drag.orig;
    const handle = drag.handle;

    if (drag.mode === "move") {
      x = Math.max(0, drag.orig.x + dx);
      y = Math.max(0, drag.orig.y + dy);
      ({ x, y, w, h } = snapFrame({ x, y, w, h }, "move", null));
    } else if (drag.mode === "resize") {
      if (handle?.includes("e")) w = Math.max(MIN_SIZE_IN, drag.orig.w + dx);
      if (handle?.includes("s")) h = Math.max(MIN_SIZE_IN, drag.orig.h + dy);
      if (handle?.includes("w")) {
        w = Math.max(MIN_SIZE_IN, drag.orig.w - dx);
        x = drag.orig.x + (drag.orig.w - w);
      }
      if (handle?.includes("n")) {
        h = Math.max(MIN_SIZE_IN, drag.orig.h - dy);
        y = drag.orig.y + (drag.orig.h - h);
      }
      x = Math.max(0, x);
      y = Math.max(0, y);
      ({ x, y, w, h } = snapFrame({ x, y, w, h }, "resize", handle));
    }

    setFrame(drag.targetKind, drag.targetId, { x, y, w, h });
    paint();
  }

  function onPointerUp(e) {
    if (draw.mode === "pending" && (draw.tool === "text" || draw.tool === "heading")) {
      const dist = Math.hypot(e.clientX - draw.startX, e.clientY - draw.startY);
      const pt = draw.startIn ?? clientToInches(e.clientX, e.clientY);
      const tool = draw.tool;
      try {
        artboard.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      if (dist < DRAG_THRESHOLD_PX) finishTextDraw(pt, tool);
      else cancelDraw();
      return;
    }

    if (draw.mode === "drag") {
      draw.currentIn = clientToInches(e.clientX, e.clientY);
      try {
        artboard.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      removeDrawPreview();
      finishDragDraw();
      return;
    }

    if (drag.mode === "none") return;

    const wasPending = drag.mode === "pending";
    const targetKind = drag.targetKind;
    const targetId = drag.targetId;
    const fieldId = drag.fieldId;

    drag.mode = "none";
    drag.targetKind = null;
    drag.targetId = null;
    drag.handle = null;
    drag.fieldId = null;
    drag.pointerId = null;
    drag.orig = null;
    drag.startCrop = null;
    drag.startImagePt = null;
    drag.imageWidth = 0;
    drag.imageHeight = 0;
    try {
      artboard.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }

    if (wasPending && targetId && fieldId) {
      if (targetKind === "element") {
        if (getSelectedId() !== targetId) setSelectedId(targetId);
        paint();
        const node = artboard.querySelector(`[data-element-id="${CSS.escape(targetId)}"]`);
        const host = resolveEditHost(
          node instanceof HTMLElement ? node : null,
          fieldId,
          e.target instanceof Element ? e.target : null
        );
        if (host instanceof HTMLElement) {
          beginInlineEdit(targetId, fieldId, host);
          onChange();
          return;
        }
      } else if (targetKind === "decoration") {
        if (getSelectedDecorationId?.() !== targetId) setSelectedDecorationId?.(targetId);
        paint();
        const node = artboard.querySelector(
          `[data-decoration-id="${CSS.escape(targetId)}"]`
        );
        const host = resolveEditHost(
          node instanceof HTMLElement ? node : null,
          fieldId,
          e.target instanceof Element ? e.target : null
        );
        if (host instanceof HTMLElement) {
          beginDecorationInlineEdit(targetId, fieldId, host);
          onChange();
          return;
        }
      }
    }

    // Double-click is handled on pointerdown via createDoubleClickTracker
    // (pointer capture + paint() both break native dblclick).

    onChange();
  }

  function onDoubleClick(e) {
    if (draw.mode === "polyline" && activeTool() === "polyline") {
      e.preventDefault();
      if (draw.points.length > 1) draw.points.pop();
      finishPolyline();
      return;
    }

    if (isDrawToolActive()) return;

    const target = /** @type {HTMLElement} */ (e.target);
    const decNode = target.closest?.(".pw-decoration");
    if (decNode) {
      const id = decNode.dataset.decorationId;
      const dec = findDecoration(id);
      if (!dec || (dec.type !== "drawText" && dec.type !== "drawHeading")) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedDecorationId?.(id);
      setSelectedId(null);
      queueDecorationTextEdit(id);
      onChange();
      return;
    }

    const elNode = target.closest?.(".pw-element");
    if (!elNode) return;
    const elId = elNode.dataset.elementId;
    const el = findElement(elId);
    if (!el || el.locked || el.type !== "text") return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(elId);
    setSelectedDecorationId?.(null);
    paint();
    const node = artboard.querySelector(`[data-element-id="${CSS.escape(elId)}"]`);
    const host = resolveEditHost(
      node instanceof HTMLElement ? node : null,
      "body",
      target
    );
    if (host instanceof HTMLElement) {
      beginInlineEdit(elId, "body", host);
      onChange();
    }
  }

  function onKeyDown(e) {
    if (draw.mode === "polyline") {
      if (e.key === "Enter") {
        e.preventDefault();
        finishPolyline();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelDraw();
        paint();
        onChange();
        return;
      }
    }

    if (inlineEdit) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }

      const decId = getSelectedDecorationId?.();
      if (decId) {
        e.preventDefault();
        onDeleteDecoration?.(decId);
        setSelectedDecorationId?.(null);
        paint();
        onChange();
        return;
      }

      const sheet = getSheet();
      const id = getSelectedId();
      if (!id) return;
      const el = findElement(id);
      if (!el || el.locked) return;
      e.preventDefault();
      if (onDeleteElement) {
        onDeleteElement(id);
      } else if (sheet) {
        sheet.elements = sheet.elements.filter((item) => item.id !== id);
      }
      setSelectedId(null);
      paint();
      onChange();
      return;
    }
  }

  function fitArtboard() {
    const paper = getPaper();
    const pad = 32;
    const availW = Math.max(120, viewport.clientWidth - pad * 2);
    const availH = Math.max(120, viewport.clientHeight - pad * 2);
    const zoom = clampZoom(
      Math.min(availW / paper.widthPx, availH / paper.heightPx),
      0.08,
      4
    );
    const panX = (viewport.clientWidth - paper.widthPx * zoom) / 2;
    const panY = Math.max(pad / 2, (viewport.clientHeight - paper.heightPx * zoom) / 2);
    panZoom.resetView({ x: panX, y: panY }, zoom);
  }

  function bind() {
    panZoom.bind();
    artboard.addEventListener("pointerdown", onPointerDown);
    artboard.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("keydown", onKeyDown);
  }

  return {
    paint,
    bind,
    fitArtboard,
    resetView: fitArtboard,
    updateGridOverlay,
    get zoomPercent() {
      return Math.round(panZoom.view.zoom * 100);
    },
  };
}
