import { getCalculatorInstance } from "./calculator-instances.js";
import { deepClone } from "./shared/clone.js";
import { createUndoStack } from "./shared/undo-stack.js";

const stack = createUndoStack({ maxDepth: 50 });

/** @type {((dirty: boolean) => void) | null} */
let markDirty = null;

/** @param {(dirty: boolean) => void} fn */
export function setUndoDirtyMarker(fn) {
  markDirty = fn;
}

/**
 * @param {string} stateKey
 * @returns {unknown | null}
 */
export function captureSection(stateKey) {
  const inst = getCalculatorInstance(stateKey);
  if (!inst?.exportState) return null;
  try {
    inst.flushFormToState?.();
  } catch {
    // Best-effort flush; still capture whatever exportState returns.
  }
  return deepClone(inst.exportState());
}

/**
 * @param {string} stateKey
 * @param {unknown} snapshot
 */
export function restoreSection(stateKey, snapshot) {
  const inst = getCalculatorInstance(stateKey);
  if (!inst?.importState || snapshot == null) return;
  stack.withSuppressed(() => {
    inst.importState(deepClone(snapshot));
    if (stateKey === "led") {
      inst.refreshUi?.();
    }
    if (stateKey === "signalFlow" || stateKey === "groundplan") {
      getCalculatorInstance("cable")?.refresh?.();
    }
  });
  markDirty?.(true);
}

/**
 * Snapshot the section before a mutation.
 * @param {string} stateKey
 * @param {string} [label]
 * @param {{ coalesceMs?: number }} [opts]
 * @returns {boolean}
 */
export function recordBefore(stateKey, label, opts) {
  const before = captureSection(stateKey);
  if (before == null) return false;
  return stack.recordBefore({ stateKey, before, label }, opts);
}

/**
 * Push a snapshot already captured before a mutation (e.g. paste that may no-op).
 * @param {string} stateKey
 * @param {unknown} before
 * @param {string} [label]
 * @param {{ coalesceMs?: number }} [opts]
 */
export function recordCaptured(stateKey, before, label, opts) {
  if (before == null) return false;
  const ok = stack.recordBefore({ stateKey, before, label }, opts);
  if (ok) markDirty?.(true);
  return ok;
}

/**
 * @template T
 * @param {string} stateKey
 * @param {() => T} fn
 * @param {string} [label]
 * @returns {T}
 */
export function withUndo(stateKey, fn, label) {
  recordBefore(stateKey, label);
  return fn();
}

export function undo() {
  const entry = stack.undoOnce((e) => captureSection(e.stateKey));
  if (!entry || entry.before == null) return false;
  restoreSection(entry.stateKey, entry.before);
  return true;
}

export function redo() {
  const entry = stack.redoOnce((e) => captureSection(e.stateKey));
  if (!entry || entry.before == null) return false;
  restoreSection(entry.stateKey, entry.before);
  return true;
}

export function clearUndoHistory() {
  stack.clear();
}

export function canUndo() {
  return stack.canUndo();
}

export function canRedo() {
  return stack.canRedo();
}

/** @param {EventTarget | null} target */
export function isTextEditingTarget(target) {
  if (!(target instanceof Element)) return false;
  const el = /** @type {HTMLElement} */ (target);
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable='true']"));
}

export function initUndoKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (isTextEditingTarget(event.target)) return;

    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = (key === "z" && event.shiftKey) || key === "y";

    if (isUndo) {
      if (!canUndo()) return;
      event.preventDefault();
      undo();
      return;
    }
    if (isRedo) {
      if (!canRedo()) return;
      event.preventDefault();
      redo();
    }
  });
}
