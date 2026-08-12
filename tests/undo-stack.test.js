import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUndoStack } from "../js/shared/undo-stack.js";

describe("undo-stack", () => {
  it("records, undoes, and redoes", () => {
    const stack = createUndoStack();
    const live = { value: 1 };

    stack.recordBefore({ stateKey: "led", before: { value: 1 }, label: "a" });
    live.value = 2;
    stack.recordBefore({ stateKey: "led", before: { value: 2 }, label: "b" });
    live.value = 3;

    const u1 = stack.undoOnce(() => ({ value: live.value }));
    assert.equal(u1?.label, "b");
    assert.deepEqual(u1?.before, { value: 2 });
    live.value = /** @type {{ value: number }} */ (u1.before).value;

    const u2 = stack.undoOnce(() => ({ value: live.value }));
    assert.equal(u2?.label, "a");
    live.value = /** @type {{ value: number }} */ (u2.before).value;
    assert.equal(live.value, 1);

    const r1 = stack.redoOnce(() => ({ value: live.value }));
    assert.equal(r1?.label, "a");
    live.value = /** @type {{ value: number }} */ (r1.before).value;
    assert.equal(live.value, 2);
  });

  it("clears redo on new record", () => {
    const stack = createUndoStack();
    stack.recordBefore({ stateKey: "cable", before: { n: 0 } });
    stack.undoOnce(() => ({ n: 1 }));
    assert.equal(stack.canRedo(), true);
    stack.recordBefore({ stateKey: "cable", before: { n: 2 } });
    assert.equal(stack.canRedo(), false);
  });

  it("respects maxDepth", () => {
    const stack = createUndoStack({ maxDepth: 2 });
    stack.recordBefore({ stateKey: "a", before: 1 });
    stack.recordBefore({ stateKey: "a", before: 2 });
    stack.recordBefore({ stateKey: "a", before: 3 });
    assert.equal(stack.undoDepth, 2);
    const first = stack.undoOnce(() => 9);
    assert.equal(first?.before, 3);
  });

  it("suppresses recording inside withSuppressed", () => {
    const stack = createUndoStack();
    stack.withSuppressed(() => {
      stack.recordBefore({ stateKey: "led", before: { x: 1 } });
    });
    assert.equal(stack.canUndo(), false);
  });

  it("coalesces same label within window", async () => {
    const stack = createUndoStack();
    stack.recordBefore({ stateKey: "labor", before: { rate: 1 }, label: "rate" }, { coalesceMs: 50 });
    stack.recordBefore({ stateKey: "labor", before: { rate: 2 }, label: "rate" }, { coalesceMs: 50 });
    stack.recordBefore({ stateKey: "labor", before: { rate: 3 }, label: "rate" }, { coalesceMs: 50 });
    assert.equal(stack.undoDepth, 1);
    assert.deepEqual(stack.undoOnce(() => ({ rate: 9 }))?.before, { rate: 1 });

    stack.recordBefore({ stateKey: "labor", before: { rate: 1 }, label: "rate" }, { coalesceMs: 20 });
    await new Promise((r) => setTimeout(r, 30));
    stack.recordBefore({ stateKey: "labor", before: { rate: 2 }, label: "rate" }, { coalesceMs: 20 });
    assert.equal(stack.undoDepth, 2);
  });

  it("clear empties both stacks", () => {
    const stack = createUndoStack();
    stack.recordBefore({ stateKey: "x", before: 1 });
    stack.undoOnce(() => 2);
    stack.clear();
    assert.equal(stack.canUndo(), false);
    assert.equal(stack.canRedo(), false);
  });
});
