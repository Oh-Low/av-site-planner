import { escapeXml } from "./dom.js";

/** @type {readonly string[]} */
export const COLOR_PALETTE = Object.freeze([
  "#00e5ff",
  "#00e676",
  "#ffea00",
  "#ff1744",
  "#d500f9",
  "#ff6d00",
  "#f50057",
  "#2979ff",
  "#76ff03",
  "#e040fb",
  "#651fff",
  "#00b8d4",
]);

export const DEFAULT_PALETTE_COLOR = COLOR_PALETTE[0];

/** @param {unknown} value */
export function normalizeHexColor(value) {
  if (typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)) return value.toLowerCase();
  return DEFAULT_PALETTE_COLOR;
}

/** @param {unknown} value */
export function normalizePaletteColor(value) {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (COLOR_PALETTE.includes(lower)) return lower;
  }
  return normalizeHexColor(value);
}

/** @param {string} hex */
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** @param {number} r @param {number} g @param {number} b */
function rgbToHex(r, g, b) {
  const clamp = (v) => Math.round(Math.max(0, Math.min(255, v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** @param {number} r @param {number} g @param {number} b */
function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;
  }

  return { h, s, v };
}

/** @param {number} h @param {number} s @param {number} v */
function hsvToRgb(h, s, v) {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

/** @param {string} hex */
function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(normalizeHexColor(hex));
  return rgbToHsv(r, g, b);
}

/** @param {number} h @param {number} s @param {number} v */
function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

/** @type {HTMLElement | null} */
let popoverEl = null;

/** @type {((e: PointerEvent) => void) | null} */
let onDocumentPointerDown = null;

/** @type {{ anchorWrap: HTMLElement | null, onSelect: ((color: string) => void) | null }} */
let openState = {
  anchorWrap: null,
  onSelect: null,
};

/** @type {{ h: number, s: number, v: number, hex: string }} */
let pickerState = { h: 0, s: 100, v: 100, hex: DEFAULT_PALETTE_COLOR };

/** @type {HTMLElement | null} */
let svEl = null;
/** @type {HTMLElement | null} */
let svBgEl = null;
/** @type {HTMLElement | null} */
let svCursorEl = null;
/** @type {HTMLElement | null} */
let hueEl = null;
/** @type {HTMLElement | null} */
let hueCursorEl = null;
/** @type {HTMLInputElement | null} */
let hexInputEl = null;
/** @type {HTMLElement | null} */
let previewEl = null;

/** @param {string} currentColor */
function markSelectedPreset(currentColor) {
  if (!popoverEl) return;
  const normalized = normalizeHexColor(currentColor);
  popoverEl.querySelectorAll(".gp-color-picker-preset").forEach((chip) => {
    chip.classList.toggle(
      "is-selected",
      /** @type {HTMLElement} */ (chip).dataset.color === normalized
    );
  });
}

function updatePickerUi() {
  if (!svBgEl || !svCursorEl || !hueCursorEl || !hexInputEl || !previewEl || !svEl || !hueEl) return;

  const hueColor = hsvToHex(pickerState.h, 100, 100);
  svBgEl.style.backgroundColor = hueColor;

  const svRect = svEl.getBoundingClientRect();
  const hueRect = hueEl.getBoundingClientRect();
  const svX = (pickerState.s / 100) * svRect.width;
  const svY = (1 - pickerState.v / 100) * svRect.height;
  const hueY = (pickerState.h / 360) * hueRect.height;

  svCursorEl.style.left = `${svX}px`;
  svCursorEl.style.top = `${svY}px`;
  hueCursorEl.style.top = `${hueY}px`;
  hexInputEl.value = pickerState.hex;
  previewEl.style.backgroundColor = pickerState.hex;
  markSelectedPreset(pickerState.hex);
}

function emitPickerColor() {
  openState.onSelect?.(pickerState.hex);
}

/** @param {string} hex @param {{ emit?: boolean }} [options] */
function setPickerColor(hex, { emit = true } = {}) {
  const normalized = normalizeHexColor(hex);
  const hsv = hexToHsv(normalized);
  pickerState = { ...hsv, hex: normalized };
  updatePickerUi();
  if (emit) emitPickerColor();
}

/** @param {HTMLElement} anchorWrap */
function positionPopover(anchorWrap) {
  if (!popoverEl) return;
  const rect = anchorWrap.getBoundingClientRect();
  const margin = 6;
  popoverEl.hidden = false;
  const popRect = popoverEl.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + margin;

  if (left + popRect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popRect.width - margin);
  }
  if (top + popRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popRect.height - margin);
  }

  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
}

function detachOutsideClose() {
  if (onDocumentPointerDown) {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    onDocumentPointerDown = null;
  }
}

export function closeColorPalettePopover() {
  detachOutsideClose();
  if (popoverEl) popoverEl.hidden = true;
  openState = { anchorWrap: null, onSelect: null };
}

/**
 * @param {HTMLElement} anchorWrap
 * @param {string} currentColor
 * @param {(color: string) => void} onSelect
 * @param {{ toggle?: boolean }} [options]
 */
export function openColorPalettePopover(anchorWrap, currentColor, onSelect, { toggle = true } = {}) {
  const popover = ensureColorPalettePopover();
  if (toggle && openState.anchorWrap === anchorWrap && !popover.hidden) {
    closeColorPalettePopover();
    return false;
  }

  closeColorPalettePopover();
  openState = { anchorWrap, onSelect };
  setPickerColor(currentColor, { emit: false });
  positionPopover(anchorWrap);
  requestAnimationFrame(updatePickerUi);

  onDocumentPointerDown = (e) => {
    const target = /** @type {Node} */ (e.target);
    if (popover.contains(target) || anchorWrap.contains(target)) return;
    closeColorPalettePopover();
  };
  requestAnimationFrame(() => {
    if (onDocumentPointerDown) {
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
    }
  });

  return true;
}

/**
 * @param {HTMLElement} surface
 * @param {(clientX: number, clientY: number) => void} onPointer
 */
function bindDragSurface(surface, onPointer) {
  surface.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    surface.setPointerCapture(e.pointerId);
    onPointer(e.clientX, e.clientY);

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      onPointer(ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      surface.releasePointerCapture(e.pointerId);
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerup", onUp);
      surface.removeEventListener("pointercancel", onUp);
    };

    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerup", onUp);
    surface.addEventListener("pointercancel", onUp);
  });
}

export function ensureColorPalettePopover() {
  if (popoverEl) return popoverEl;

  popoverEl = document.createElement("div");
  popoverEl.id = "gp-color-picker-popover";
  popoverEl.className = "gp-color-picker-popover";
  popoverEl.hidden = true;
  popoverEl.innerHTML = `<div class="gp-color-picker-main">
    <div class="gp-color-picker-sv" aria-label="Saturation and brightness">
      <div class="gp-color-picker-sv-bg"></div>
      <div class="gp-color-picker-sv-cursor"></div>
    </div>
    <div class="gp-color-picker-hue" aria-label="Hue">
      <div class="gp-color-picker-hue-cursor"></div>
    </div>
  </div>
  <div class="gp-color-picker-fields">
    <span class="gp-color-picker-preview" aria-hidden="true"></span>
    <input type="text" class="gp-color-picker-hex" spellcheck="false" maxlength="7" aria-label="Hex color" />
  </div>
  <div class="gp-color-picker-presets" role="listbox" aria-label="Preset colors">${COLOR_PALETTE.map(
    (color) =>
      `<button type="button" class="gp-color-picker-preset" data-color="${color}" style="--swatch-color:${color}" role="option" aria-label="${color}"></button>`
  ).join("")}</div>`;

  svEl = popoverEl.querySelector(".gp-color-picker-sv");
  svBgEl = popoverEl.querySelector(".gp-color-picker-sv-bg");
  svCursorEl = popoverEl.querySelector(".gp-color-picker-sv-cursor");
  hueEl = popoverEl.querySelector(".gp-color-picker-hue");
  hueCursorEl = popoverEl.querySelector(".gp-color-picker-hue-cursor");
  hexInputEl = /** @type {HTMLInputElement | null} */ (popoverEl.querySelector(".gp-color-picker-hex"));
  previewEl = popoverEl.querySelector(".gp-color-picker-preview");

  if (svEl) {
    bindDragSurface(svEl, (clientX, clientY) => {
      const rect = svEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      pickerState.s = (x / rect.width) * 100;
      pickerState.v = (1 - y / rect.height) * 100;
      pickerState.hex = hsvToHex(pickerState.h, pickerState.s, pickerState.v);
      updatePickerUi();
      emitPickerColor();
    });
  }

  if (hueEl) {
    bindDragSurface(hueEl, (clientX, clientY) => {
      const rect = hueEl.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      pickerState.h = (y / rect.height) * 360;
      pickerState.hex = hsvToHex(pickerState.h, pickerState.s, pickerState.v);
      updatePickerUi();
      emitPickerColor();
    });
  }

  hexInputEl?.addEventListener("input", () => {
    if (!hexInputEl) return;
    let value = hexInputEl.value.trim();
    if (!value.startsWith("#")) value = `#${value}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setPickerColor(value);
    }
  });

  hexInputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") hexInputEl?.blur();
  });

  hexInputEl?.addEventListener("blur", () => {
    if (!hexInputEl) return;
    let value = hexInputEl.value.trim();
    if (!value.startsWith("#")) value = `#${value}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setPickerColor(value);
      return;
    }
    hexInputEl.value = pickerState.hex;
  });

  popoverEl.querySelectorAll(".gp-color-picker-preset").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const color = /** @type {HTMLElement} */ (chip).dataset.color;
      if (color) setPickerColor(color);
    });
  });

  popoverEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeColorPalettePopover();
  });

  window.addEventListener(
    "resize",
    () => {
      if (popoverEl?.hidden || !openState.anchorWrap) return;
      positionPopover(openState.anchorWrap);
      updatePickerUi();
    },
    { passive: true }
  );

  document.body.appendChild(popoverEl);
  return popoverEl;
}

/**
 * @param {HTMLElement} wrap
 * @param {string} color
 */
function syncSwatchColor(wrap, color) {
  const normalized = normalizeHexColor(color);
  const btn = wrap.querySelector(".gp-color-swatch-btn");
  if (btn instanceof HTMLElement) btn.style.setProperty("--swatch-color", normalized);
  if (openState.anchorWrap === wrap) setPickerColor(normalized, { emit: false });
}

/** @param {string} key */
function datasetKeyToAttr(key) {
  return key.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * @param {{
 *   color: string,
 *   className?: string,
 *   dataset?: Record<string, string>,
 *   ariaLabel?: string,
 *   title?: string,
 * }} options
 */
export function renderColorSwatchButton({
  color,
  className = "",
  dataset = {},
  ariaLabel = "Change color",
  title = "Change color",
}) {
  const dataAttrs = Object.entries(dataset)
    .map(([key, value]) => `data-${datasetKeyToAttr(key)}="${escapeXml(value)}"`)
    .join(" ");
  const normalized = normalizeHexColor(color);
  return `<span class="gp-color-swatch-wrap ${className}" ${dataAttrs}>
    <button type="button" class="gp-color-swatch-btn" style="--swatch-color:${escapeXml(normalized)}" aria-label="${escapeXml(ariaLabel)}" title="${escapeXml(title)}"></button>
  </span>`;
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @param {{
 *   getColor: (wrap: HTMLElement) => string,
 *   onColorChange: (wrap: HTMLElement, color: string) => void,
 * }} handlers
 */
export function bindColorSwatchButtons(root, selector, { getColor, onColorChange }) {
  root.querySelectorAll(selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    bindColorSwatchButton(node, {
      getColor: () => getColor(node),
      onColorChange: (color) => onColorChange(node, color),
    });
  });
}

/**
 * @param {HTMLElement} wrap
 * @param {{
 *   getColor: () => string,
 *   onColorChange: (color: string) => void,
 * }} handlers
 */
export function bindColorSwatchButton(wrap, { getColor, onColorChange }) {
  const btn = wrap.querySelector(".gp-color-swatch-btn");
  if (!(btn instanceof HTMLElement)) return;

  const applyColor = (color) => {
    const normalized = normalizeHexColor(color);
    syncSwatchColor(wrap, normalized);
    onColorChange(normalized);
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const current = normalizeHexColor(getColor());
    syncSwatchColor(wrap, current);
    openColorPalettePopover(wrap, current, applyColor);
  });
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
}
