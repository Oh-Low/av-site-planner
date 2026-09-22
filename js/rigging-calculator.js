/**
 * Rigging Calculator — scaled symbols, mate-snap assemblies, load inspector.
 * Domain: js/domain/rigging.js · Symbols: js/rigging-symbols.js
 */

import { queryCalcShell } from "./shared/calc-shell.js";
import { createTransformPanZoom } from "./shared/pan-zoom.js";
import { isPanPointerDown } from "./shared/dom.js";
import { uid } from "./shared/id.js";
import { deepClone } from "./shared/clone.js";
import { recordBefore } from "./undo-runtime.js";
import {
  RIGGING_CATALOG,
  attachRolesCompatible,
  attachWorldPosition,
  catalogCategories,
  computeLoads,
  connectedPartIds,
  emptyRiggingState,
  freeAttachPoints,
  getCatalogEntry,
  normalizeRiggingState,
  poseForMate,
  resolveAttachPoints,
  resolvePartProps,
  resolvePartSize,
  riggingPluginMeta,
} from "./domain/rigging.js";
import { paletteThumbSvg, partGroupSvg } from "./rigging-symbols.js";

const MIME = "text/av-rigging-type";
/** Mate snap distance in screen pixels (converted to world inches via / zoom). */
const MATE_SNAP_SCREEN_PX = 28;
/** Attach marker radius in screen pixels. */
const ATTACH_MARKER_SCREEN_PX = 7;
const ATTACH_PREVIEW_SCREEN_PX = 10;

/**
 * @returns {{
 *   exportState: () => object,
 *   importState: (data: object) => void,
 * } | null}
 */
export function initRiggingCalculator() {
  const shell = queryCalcShell("rigging-calculator", {
    statusId: "rg-status",
    viewportId: "rg-viewport",
    worldId: "rg-world",
    paletteId: "rg-palette",
    resetViewId: "rg-reset-view",
  });
  if (!shell?.viewport || !shell.world || !shell.palette) {
    console.warn("Rigging Calculator shell missing from DOM.");
    return null;
  }

  const viewport = /** @type {HTMLElement} */ (shell.viewport);
  const worldEl = /** @type {HTMLElement} */ (shell.world);
  const svg = /** @type {SVGSVGElement | null} */ (document.getElementById("rg-svg"));
  const inspector = document.getElementById("rg-inspector");
  const snapEl = /** @type {HTMLInputElement | null} */ (document.getElementById("rg-grid-snap"));
  const gridSizeEl = /** @type {HTMLInputElement | null} */ (document.getElementById("rg-grid-size"));

  /** @type {import("./domain/rigging.js").RiggingState} */
  let state = emptyRiggingState();
  /** @type {string | null} */
  let selectedId = null;
  /** @type {{ partId: string, attachId: string } | null} */
  let matePreview = null;

  /** @type {number} */
  let lastAttachZoom = -1;

  const panZoom = createTransformPanZoom({
    viewport,
    world: worldEl,
    defaultPan: { x: 40, y: 40 },
    // Hardware is inch-scale; allow deep zoom so shackles are placeable.
    defaultZoom: 16,
    minZoom: 0.08,
    maxZoom: 120,
    zoomWheelFactor: 1.15,
    onChange: () => {
      const z = panZoom.view.zoom;
      if (z === lastAttachZoom) return;
      lastAttachZoom = z;
      if (selectedId || matePreview) renderAttachOverlayOnly();
    },
  });
  panZoom.bind();

  /** @returns {number} */
  function zoom() {
    return panZoom.view.zoom || 1;
  }

  /** World inches for a constant screen-pixel size. */
  function screenToWorld(px) {
    return px / zoom();
  }

  /** Mate snap threshold in world inches. */
  function mateSnapInches() {
    return MATE_SNAP_SCREEN_PX / zoom();
  }

  /** @param {number} v */
  function snapCoord(v) {
    if (!state.grid.snap) return v;
    const g = state.grid.sizeIn || 1;
    return Math.round(v / g) * g;
  }

  function syncGridChrome() {
    worldEl.classList.toggle("rg-grid-visible", true);
    const sizePx = Math.max(4, (state.grid.sizeIn || 1) * 20);
    worldEl.style.setProperty("--rg-grid-size", `${sizePx}px`);
    if (snapEl) snapEl.checked = state.grid.snap;
    if (gridSizeEl) gridSizeEl.value = String(state.grid.sizeIn);
  }

  function setStatus(msg) {
    shell.setStatus(msg);
  }

  function renderPalette() {
    const palette = /** @type {HTMLElement} */ (shell.palette);
    palette.replaceChildren();
    for (const cat of catalogCategories()) {
      const heading = document.createElement("div");
      heading.className = "rg-palette-cat";
      heading.textContent = cat;
      palette.appendChild(heading);
      for (const entry of RIGGING_CATALOG.filter((e) => e.category === cat)) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "rg-palette-item";
        item.draggable = true;
        item.dataset.typeId = entry.typeId;
        item.title = entry.label;
        item.innerHTML = `${paletteThumbSvg(entry.typeId)}<span class="rg-palette-label">${escapeHtml(entry.label)}</span>`;
        item.addEventListener("dragstart", (e) => {
          e.dataTransfer?.setData(MIME, entry.typeId);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
        });
        palette.appendChild(item);
      }
    }
  }

  /** @returns {string} */
  function attachOverlayMarkup() {
    if (!selectedId && !matePreview) return "";
    /** @type {string[]} */
    const chunks = [];
    const rFree = screenToWorld(ATTACH_MARKER_SCREEN_PX);
    const rPreview = screenToWorld(ATTACH_PREVIEW_SCREEN_PX);
    for (const part of state.parts) {
      const free = freeAttachPoints(state, part.id);
      for (const att of resolveAttachPoints(part)) {
        const world = attachWorldPosition(part, att.id);
        if (!world) continue;
        const isFree = free.some((f) => f.id === att.id);
        const isPreview =
          matePreview?.partId === part.id && matePreview.attachId === att.id;
        const r = isPreview ? rPreview : rFree;
        chunks.push(
          `<circle class="rg-attach${isFree ? " is-free" : " is-used"}${isPreview ? " is-preview" : ""}" cx="${world.x}" cy="${world.y}" r="${r}" />`,
        );
      }
    }
    return chunks.join("");
  }

  function renderAttachOverlayOnly() {
    if (!svg) return;
    // Replace only attach circles; leave part groups intact.
    svg.querySelectorAll(".rg-attach").forEach((el) => el.remove());
    if (!selectedId && !matePreview) return;
    svg.insertAdjacentHTML("beforeend", attachOverlayMarkup());
  }

  function renderWorld() {
    if (!svg) return;
    const { partLoads } = computeLoads(state);
    /** @type {string[]} */
    const chunks = [];

    for (const part of state.parts) {
      const props = resolvePartProps(part);
      const load = partLoads.get(part.id) ?? 0;
      const overloaded = props.wllLb != null && load > props.wllLb + 1e-6;
      chunks.push(
        partGroupSvg(part, {
          selected: part.id === selectedId,
          overloaded,
          previewMate: Boolean(matePreview && matePreview.partId === part.id),
        }),
      );
    }

    chunks.push(attachOverlayMarkup());
    svg.innerHTML = chunks.join("");
    renderInspector();
  }

  function renderInspector() {
    if (!inspector) return;
    const part = state.parts.find((p) => p.id === selectedId);
    if (!part) {
      inspector.innerHTML = `<p class="rg-inspector-empty">Select a part to see load and properties.</p>`;
      return;
    }
    const entry = getCatalogEntry(part.typeId);
    const props = resolvePartProps(part);
    const load = computeLoads(state).partLoads.get(part.id) ?? 0;
    const wll = props.wllLb;
    const overloaded = wll != null && load > wll + 1e-6;
    const size = resolvePartSize(part);
    const mateCount = state.mates.filter((m) => m.aPartId === part.id || m.bPartId === part.id).length;
    const hasLength = entry?.defaults.lengthIn != null;
    const hasWidth = entry?.defaults.widthIn != null;
    const hasHeight = entry?.defaults.heightIn != null;

    inspector.innerHTML = `
      <div class="rg-inspector-head">
        <strong>${escapeHtml(part.name)}</strong>
        <span class="rg-inspector-type">${escapeHtml(entry?.label ?? part.typeId)}</span>
      </div>
      <div class="rg-load ${overloaded ? "is-overloaded" : ""}">
        <span class="rg-load-label">Working load</span>
        <span class="rg-load-value">${formatLb(load)}</span>
        ${wll != null ? `<span class="rg-load-wll">WLL ${formatLb(wll)}${overloaded ? " — OVER" : ""}</span>` : ""}
      </div>
      <label class="rg-field">Name
        <input type="text" id="rg-prop-name" value="${escapeAttr(part.name)}" />
      </label>
      <label class="rg-field">Weight (lb)
        <input type="number" id="rg-prop-weight" min="0" step="1" value="${props.weightLb ?? 0}" />
      </label>
      ${hasLength ? `<label class="rg-field">Length (in)<input type="number" id="rg-prop-length" min="1" step="1" value="${props.lengthIn ?? 0}" /></label>` : ""}
      ${hasWidth ? `<label class="rg-field">Width (in)<input type="number" id="rg-prop-width" min="0.25" step="0.25" value="${props.widthIn ?? 0}" /></label>` : ""}
      ${hasHeight ? `<label class="rg-field">Height (in)<input type="number" id="rg-prop-height" min="0.25" step="0.25" value="${props.heightIn ?? 0}" /></label>` : ""}
      <label class="rg-field">WLL (lb)
        <input type="number" id="rg-prop-wll" min="0" step="1" value="${wll ?? ""}" placeholder="—" />
      </label>
      <p class="rg-inspector-meta">Size ${formatIn(size.width)} × ${formatIn(size.height)} · ${mateCount} mate${mateCount === 1 ? "" : "s"}</p>
      <div class="rg-inspector-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="rg-disconnect" ${mateCount ? "" : "disabled"}>Disconnect</button>
        <button type="button" class="btn btn-secondary btn-sm" id="rg-delete-part">Delete</button>
      </div>
    `;
    bindInspectorFields(part);
  }

  /** @param {import("./domain/rigging.js").RiggingPart} part */
  function bindInspectorFields(part) {
    const onNum = (id, key, min) => {
      const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
      el?.addEventListener("change", () => {
        recordBefore("rigging", key);
        part.props[key] = Math.max(min, Number(el.value) || min);
        renderWorld();
      });
    };
    document.getElementById("rg-prop-name")?.addEventListener("change", (e) => {
      recordBefore("rigging", "rename");
      const v = /** @type {HTMLInputElement} */ (e.target).value.trim();
      part.name = v || part.name;
      renderWorld();
    });
    onNum("rg-prop-weight", "weightLb", 0);
    onNum("rg-prop-length", "lengthIn", 1);
    onNum("rg-prop-width", "widthIn", 0.25);
    onNum("rg-prop-height", "heightIn", 0.25);
    document.getElementById("rg-prop-wll")?.addEventListener("change", (e) => {
      recordBefore("rigging", "wll");
      const raw = /** @type {HTMLInputElement} */ (e.target).value.trim();
      if (raw === "") delete part.props.wllLb;
      else part.props.wllLb = Math.max(0, Number(raw) || 0);
      renderWorld();
    });
    document.getElementById("rg-disconnect")?.addEventListener("click", () => {
      recordBefore("rigging", "disconnect");
      state.mates = state.mates.filter((m) => m.aPartId !== part.id && m.bPartId !== part.id);
      setStatus(`Disconnected “${part.name}”.`);
      renderWorld();
    });
    document.getElementById("rg-delete-part")?.addEventListener("click", () => deleteSelected());
  }

  /** @param {string} typeId @param {number} x @param {number} y */
  function createPart(typeId, x, y) {
    const entry = getCatalogEntry(typeId);
    if (!entry) return;
    recordBefore("rigging", "create");
    const part = {
      id: uid("rg"),
      typeId,
      name: entry.label,
      x: snapCoord(x),
      y: snapCoord(y),
      rotationDeg: 0,
      props: {},
    };
    state.parts.push(part);
    selectedId = part.id;
    setStatus(`Placed ${entry.label}.`);
    renderWorld();
  }

  function deleteSelected() {
    if (!selectedId) return;
    const part = state.parts.find((p) => p.id === selectedId);
    if (!part) return;
    recordBefore("rigging", "delete");
    state.mates = state.mates.filter((m) => m.aPartId !== part.id && m.bPartId !== part.id);
    state.parts = state.parts.filter((p) => p.id !== part.id);
    selectedId = null;
    setStatus(`Deleted “${part.name}”.`);
    renderWorld();
  }

  /**
   * @param {Set<string>} movingIds
   * @returns {{ dx: number, dy: number, mate: import("./domain/rigging.js").RiggingMate, preview: { partId: string, attachId: string } } | null}
   */
  function findMateSnap(movingIds) {
    /** @type {{ dist: number, dx: number, dy: number, mate: import("./domain/rigging.js").RiggingMate, preview: { partId: string, attachId: string } } | null} */
    let best = null;
    for (const partId of movingIds) {
      const part = state.parts.find((p) => p.id === partId);
      if (!part) continue;
      for (const attA of freeAttachPoints(state, partId)) {
        for (const other of state.parts) {
          if (movingIds.has(other.id)) continue;
          for (const attB of freeAttachPoints(state, other.id)) {
            if (!attachRolesCompatible(attA.role, attB.role)) continue;
            const worldA = attachWorldPosition(part, attA.id);
            const worldB = attachWorldPosition(other, attB.id);
            if (!worldA || !worldB) continue;
            const dist = Math.hypot(worldA.x - worldB.x, worldA.y - worldB.y);
            if (dist > mateSnapInches()) continue;
            const posed = poseForMate(part, attA.id, other, attB.id);
            const dx = posed.x - part.x;
            const dy = posed.y - part.y;
            if (!best || dist < best.dist) {
              best = {
                dist,
                dx,
                dy,
                mate: {
                  id: uid("mate"),
                  aPartId: part.id,
                  aAttachId: attA.id,
                  bPartId: other.id,
                  bAttachId: attB.id,
                },
                preview: { partId: other.id, attachId: attB.id },
              };
            }
          }
        }
      }
    }
    return best;
  }

  /** @type {{
   *   active: boolean,
   *   pointerId: number,
   *   startClientX: number,
   *   startClientY: number,
   *   origins: Map<string, { x: number, y: number }>,
   *   recorded: boolean,
   *   moved: boolean,
   * }} */
  const drag = {
    active: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    origins: new Map(),
    recorded: false,
    moved: false,
  };

  /**
   * @param {number} dx
   * @param {number} dy
   * @param {{ dx: number, dy: number } | null} snap
   */
  function applyDragPose(dx, dy, snap) {
    const extraX = snap?.dx ?? 0;
    const extraY = snap?.dy ?? 0;
    for (const [id, origin] of drag.origins) {
      const p = state.parts.find((x) => x.id === id);
      if (!p) continue;
      const x = origin.x + dx + extraX;
      const y = origin.y + dy + extraY;
      // Keep mate alignment exact — do not grid-round while snapped.
      p.x = snap ? x : snapCoord(x);
      p.y = snap ? y : snapCoord(y);
    }
  }

  /** @param {PointerEvent} e */
  function dragWorldDelta(e) {
    const zoom = panZoom.view.zoom || 1;
    return {
      dx: (e.clientX - drag.startClientX) / zoom,
      dy: (e.clientY - drag.startClientY) / zoom,
    };
  }

  viewport.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes(MIME)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  });

  viewport.addEventListener("drop", (e) => {
    e.preventDefault();
    const typeId = e.dataTransfer?.getData(MIME);
    if (!typeId) return;
    const world = panZoom.clientToWorld(e.clientX, e.clientY);
    createPart(typeId, world.x, world.y);
  });

  viewport.addEventListener("pointerdown", (e) => {
    if (isPanPointerDown(e) || e.button !== 0 || panZoom.isPanning) return;
    const target = /** @type {Element | null} */ (e.target);
    if (target?.closest?.(".rg-grid-ui")) return;
    const partEl = target?.closest?.("[data-part-id]");
    const partId = partEl instanceof Element ? partEl.getAttribute("data-part-id") : null;
    if (!partId || !state.parts.some((p) => p.id === partId)) {
      selectedId = null;
      matePreview = null;
      renderWorld();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    selectedId = partId;
    const group = connectedPartIds(state, partId);
    drag.active = true;
    drag.pointerId = e.pointerId;
    // Screen-space start — world delta = screen delta / zoom (same as Signal Flow).
    drag.startClientX = e.clientX;
    drag.startClientY = e.clientY;
    drag.origins = new Map();
    drag.recorded = false;
    drag.moved = false;
    for (const id of group) {
      const p = state.parts.find((x) => x.id === id);
      if (p) drag.origins.set(id, { x: p.x, y: p.y });
    }
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    renderWorld();
  });

  window.addEventListener("pointermove", (e) => {
    if (!drag.active || e.pointerId !== drag.pointerId || panZoom.isPanning) return;
    const { dx, dy } = dragWorldDelta(e);
    if (!drag.moved && Math.hypot(dx, dy) > 0.5) {
      drag.moved = true;
      if (!drag.recorded) {
        recordBefore("rigging", "move");
        drag.recorded = true;
      }
    }
    applyDragPose(dx, dy, null);
    const snap = findMateSnap(new Set(drag.origins.keys()));
    if (snap) {
      matePreview = snap.preview;
      applyDragPose(dx, dy, snap);
    } else {
      matePreview = null;
    }
    renderWorld();
  });

  /** @param {PointerEvent} e */
  function endDrag(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      const { dx, dy } = dragWorldDelta(e);
      applyDragPose(dx, dy, null);
      const snap = findMateSnap(new Set(drag.origins.keys()));
      if (snap) {
        applyDragPose(dx, dy, snap);
        const dup = state.mates.some(
          (m) =>
            (m.aPartId === snap.mate.aPartId &&
              m.aAttachId === snap.mate.aAttachId &&
              m.bPartId === snap.mate.bPartId &&
              m.bAttachId === snap.mate.bAttachId) ||
            (m.bPartId === snap.mate.aPartId &&
              m.bAttachId === snap.mate.aAttachId &&
              m.aPartId === snap.mate.bPartId &&
              m.aAttachId === snap.mate.bAttachId),
        );
        if (!dup) {
          state.mates.push(snap.mate);
          setStatus("Parts mated.");
        }
      }
    }
    drag.active = false;
    matePreview = null;
    renderWorld();
    try {
      viewport.releasePointerCapture(drag.pointerId);
    } catch {
      /* ignore */
    }
  }

  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  document.addEventListener("keydown", (e) => {
    const panel = document.getElementById("rigging-calculator");
    if (!panel || panel.hidden) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    }
    if (e.key === "Escape") {
      selectedId = null;
      renderWorld();
    }
  });

  snapEl?.addEventListener("change", () => {
    recordBefore("rigging", "grid-snap");
    state.grid.snap = Boolean(snapEl.checked);
  });
  gridSizeEl?.addEventListener("change", () => {
    recordBefore("rigging", "grid-size");
    state.grid.sizeIn = Math.max(0.25, Number(gridSizeEl.value) || 1);
    syncGridChrome();
  });

  document.getElementById("rg-reset-view")?.addEventListener("click", () => fitView());

  function fitView() {
    if (!state.parts.length) {
      panZoom.resetView({ x: 40, y: 40 }, 16);
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const part of state.parts) {
      const size = resolvePartSize(part);
      minX = Math.min(minX, part.x - size.width / 2);
      minY = Math.min(minY, part.y - size.height / 2);
      maxX = Math.max(maxX, part.x + size.width / 2);
      maxY = Math.max(maxY, part.y + size.height / 2);
    }
    const pad = 12;
    const bw = Math.max(maxX - minX + pad * 2, 4);
    const bh = Math.max(maxY - minY + pad * 2, 4);
    const rect = viewport.getBoundingClientRect();
    // Prefer staying zoomed in on small hardware; cap at maxZoom.
    const zoom = Math.min(rect.width / bw, rect.height / bh, 120);
    const z = Math.max(4, zoom);
    panZoom.resetView(
      {
        x: -(minX - pad) * z + (rect.width - bw * z) / 2,
        y: -(minY - pad) * z + (rect.height - bh * z) / 2,
      },
      z,
    );
  }

  renderPalette();
  syncGridChrome();
  renderWorld();
  setStatus("Drag parts from the catalog. Snap attach points to mate — no wires.");

  return {
    exportState() {
      return deepClone(state);
    },
    /** @param {object} data */
    importState(data) {
      state = normalizeRiggingState(data);
      selectedId = null;
      matePreview = null;
      syncGridChrome();
      renderWorld();
    },
  };
}

/** @param {number} lb */
function formatLb(lb) {
  return `${Math.round(lb * 10) / 10} lb`;
}

/** @param {number} inches */
function formatIn(inches) {
  if (inches >= 12) {
    const ft = Math.floor(inches / 12);
    const rem = Math.round((inches % 12) * 10) / 10;
    return rem ? `${ft}′ ${rem}″` : `${ft}′`;
  }
  return `${Math.round(inches * 10) / 10}″`;
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} s */
function escapeAttr(s) {
  return escapeHtml(s);
}

export const calculatorPlugin = {
  meta: riggingPluginMeta,
  init: initRiggingCalculator,
};
