import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeThemeId, THEMES } from "../js/theme.js";

describe("theme", () => {
  it("lists four palettes", () => {
    assert.equal(THEMES.length, 4);
    assert.deepEqual(
      THEMES.map((t) => t.id),
      ["graphite", "ember", "sea", "chalk"]
    );
  });

  it("normalizes known ids and falls back to graphite", () => {
    assert.equal(normalizeThemeId("ember"), "ember");
    assert.equal(normalizeThemeId("chalk"), "chalk");
    assert.equal(normalizeThemeId("nope"), "graphite");
    assert.equal(normalizeThemeId(null), "graphite");
  });
});
