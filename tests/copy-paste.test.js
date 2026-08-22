import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextCopyName, offsetPoint, offsetPoints } from "../js/copy-paste.js";

describe("copy-paste helpers", () => {
  it("builds incremental copy names", () => {
    assert.equal(nextCopyName("Wall 1"), "Wall 1 copy");
    assert.equal(nextCopyName("Wall 1 copy"), "Wall 1 copy 2");
    assert.equal(nextCopyName("Wall 1 copy 2"), "Wall 1 copy 3");
  });

  it("offsets points", () => {
    assert.deepEqual(offsetPoint({ x: 10, y: 20 }, 5, -2), { x: 15, y: 18 });
    assert.deepEqual(offsetPoints([{ x: 0, y: 0 }, { x: 1, y: 2 }], 3, 4), [
      { x: 3, y: 4 },
      { x: 4, y: 6 },
    ]);
  });
});
