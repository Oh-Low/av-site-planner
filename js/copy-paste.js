/**
 * Central Ctrl/Cmd+C / Ctrl/Cmd+V for selectable document elements.
 * Calculators opt in by exposing copySelection() / pasteSelection(payload).
 * Cable and Labor intentionally have no handlers.
 */

import { getCalculatorInstance } from "./calculator-instances.js";
import {
  captureSection,
  isTextEditingTarget,
  recordCaptured,
} from "./undo-runtime.js";

/** @type {{ stateKey: string, kind: string, [key: string]: unknown } | null} */
let clipboard = null;

/** Tab panel `data-tab` → calculator stateKey (avoids importing the plugin registry). */
const TAB_TO_STATE_KEY = {
  "led-calculator": "led",
  "projector-calculator": "projector",
  "signal-flow": "signalFlow",
  groundplan: "groundplan",
  "content-maps": "contentMaps",
  "paperwork-composer": "paperwork",
};

/**
 * @param {string} name
 * @returns {string}
 */
export function nextCopyName(name) {
  const base = String(name ?? "").trim() || "Item";
  const match = /^(.*?)(?: copy(?: (\d+))?)$/i.exec(base);
  if (!match) return `${base} copy`;
  const stem = match[1].trim() || base;
  const n = match[2] ? Number(match[2]) + 1 : 2;
  return `${stem} copy ${n}`;
}

/**
 * @param {{ x?: number, y?: number } | null | undefined} point
 * @param {number} dx
 * @param {number} dy
 */
export function offsetPoint(point, dx, dy) {
  if (!point || typeof point !== "object") return point;
  return {
    ...point,
    x: Number(point.x) + dx,
    y: Number(point.y) + dy,
  };
}

/**
 * @template T
 * @param {T[]} points
 * @param {number} dx
 * @param {number} dy
 * @returns {T[]}
 */
export function offsetPoints(points, dx, dy) {
  if (!Array.isArray(points)) return [];
  return points.map((p) => /** @type {T} */ (offsetPoint(/** @type {any} */ (p), dx, dy)));
}

function activeStateKey() {
  const tabId = document.querySelector(".tab.active")?.dataset.tab;
  if (!tabId) return null;
  return TAB_TO_STATE_KEY[tabId] ?? null;
}

function activeInstance() {
  const stateKey = activeStateKey();
  if (!stateKey) return null;
  const inst = getCalculatorInstance(stateKey);
  if (!inst?.copySelection || !inst?.pasteSelection) return null;
  return { stateKey, inst };
}

export function copyActiveSelection() {
  const active = activeInstance();
  if (!active) return false;
  const payload = active.inst.copySelection();
  if (!payload || typeof payload !== "object" || !payload.kind) return false;
  clipboard = { stateKey: active.stateKey, ...deepClonePlain(payload) };
  return true;
}

export function pasteActiveClipboard() {
  const active = activeInstance();
  if (!active || !clipboard) return false;
  if (clipboard.stateKey !== active.stateKey) return false;
  const payload = deepClonePlain(clipboard);
  const before = captureSection(active.stateKey);
  if (before == null) return false;
  const ok = active.inst.pasteSelection(payload);
  if (!ok) return false;
  recordCaptured(active.stateKey, before, "paste");
  return true;
}

/** @param {unknown} value */
function deepClonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clearCopyPasteClipboard() {
  clipboard = null;
}

export function initCopyPaste() {
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (isTextEditingTarget(event.target)) return;

    const key = event.key.toLowerCase();
    if (key === "c") {
      if (!copyActiveSelection()) return;
      event.preventDefault();
      return;
    }
    if (key === "v") {
      if (!pasteActiveClipboard()) return;
      event.preventDefault();
    }
  });
}
