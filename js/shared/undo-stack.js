/**
 * Pure undo/redo stack of section snapshots.
 * Entries are opaque; callers own capture/restore.
 */

/**
 * @typedef {{ stateKey: string, before: unknown, label?: string }} UndoEntry
 */

/**
 * @param {{ maxDepth?: number }} [options]
 */
export function createUndoStack(options = {}) {
  const maxDepth = Math.max(1, options.maxDepth ?? 50);
  /** @type {UndoEntry[]} */
  const undo = [];
  /** @type {UndoEntry[]} */
  const redo = [];
  let suppressed = false;
  /** @type {{ stateKey: string, label: string, timer: ReturnType<typeof setTimeout> } | null} */
  let coalesce = null;

  function clearCoalesce() {
    if (coalesce) {
      clearTimeout(coalesce.timer);
      coalesce = null;
    }
  }

  /**
   * @param {UndoEntry} entry
   * @param {{ coalesceMs?: number }} [opts]
   */
  function recordBefore(entry, opts = {}) {
    if (suppressed || !entry?.stateKey || entry.before === undefined) return false;
    const label = entry.label ?? "";
    const coalesceMs = opts.coalesceMs ?? 0;

    if (
      coalesceMs > 0 &&
      coalesce &&
      coalesce.stateKey === entry.stateKey &&
      coalesce.label === label &&
      undo.length > 0 &&
      undo[undo.length - 1].stateKey === entry.stateKey &&
      (undo[undo.length - 1].label ?? "") === label
    ) {
      clearTimeout(coalesce.timer);
      coalesce.timer = setTimeout(() => {
        coalesce = null;
      }, coalesceMs);
      return true;
    }

    undo.push({
      stateKey: entry.stateKey,
      before: entry.before,
      label: label || undefined,
    });
    if (undo.length > maxDepth) {
      undo.splice(0, undo.length - maxDepth);
    }
    redo.length = 0;

    clearCoalesce();
    if (coalesceMs > 0) {
      coalesce = {
        stateKey: entry.stateKey,
        label,
        timer: setTimeout(() => {
          coalesce = null;
        }, coalesceMs),
      };
    }
    return true;
  }

  function canUndo() {
    return undo.length > 0;
  }

  function canRedo() {
    return redo.length > 0;
  }

  /**
   * @param {(entry: UndoEntry) => unknown} captureCurrent
   * @returns {UndoEntry | null}
   */
  function undoOnce(captureCurrent) {
    clearCoalesce();
    const entry = undo.pop();
    if (!entry) return null;
    const current = captureCurrent(entry);
    redo.push({
      stateKey: entry.stateKey,
      before: current,
      label: entry.label,
    });
    return entry;
  }

  /**
   * @param {(entry: UndoEntry) => unknown} captureCurrent
   * @returns {UndoEntry | null}
   */
  function redoOnce(captureCurrent) {
    clearCoalesce();
    const entry = redo.pop();
    if (!entry) return null;
    const current = captureCurrent(entry);
    undo.push({
      stateKey: entry.stateKey,
      before: current,
      label: entry.label,
    });
    return entry;
  }

  function clear() {
    clearCoalesce();
    undo.length = 0;
    redo.length = 0;
  }

  /**
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  function withSuppressed(fn) {
    const prev = suppressed;
    suppressed = true;
    try {
      return fn();
    } finally {
      suppressed = prev;
    }
  }

  return {
    recordBefore,
    undoOnce,
    redoOnce,
    canUndo,
    canRedo,
    clear,
    withSuppressed,
    /** @returns {number} */
    get undoDepth() {
      return undo.length;
    },
    /** @returns {number} */
    get redoDepth() {
      return redo.length;
    },
  };
}
