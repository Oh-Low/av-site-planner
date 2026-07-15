import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deepClone } from "../js/shared/clone.js";
import { escapeXml, isPanPointerDown } from "../js/shared/dom.js";
import { uid } from "../js/shared/id.js";

describe("uid", () => {
  it("includes the prefix", () => {
    assert.match(uid("line"), /^line-/);
  });

  it("generates distinct values", () => {
    assert.notEqual(uid("a"), uid("a"));
  });
});

describe("escapeXml", () => {
  it("escapes markup and quotes", () => {
    assert.equal(escapeXml(`a & b <c> "d"`), "a &amp; b &lt;c&gt; &quot;d&quot;");
  });

  it("coerces non-strings", () => {
    assert.equal(escapeXml(42), "42");
  });
});

describe("isPanPointerDown", () => {
  it("detects the secondary mouse button", () => {
    assert.equal(isPanPointerDown({ button: 2 }), true);
    assert.equal(isPanPointerDown({ button: 0 }), false);
  });
});

describe("deepClone", () => {
  it("returns a deep copy", () => {
    const source = { grids: [{ id: "g1", rows: 2 }] };
    const copy = deepClone(source);
    assert.notEqual(copy, source);
    assert.notEqual(copy.grids, source.grids);
    assert.deepEqual(copy, source);
    copy.grids[0].rows = 99;
    assert.equal(source.grids[0].rows, 2);
  });
});
