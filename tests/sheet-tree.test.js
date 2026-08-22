import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sheetListTitle } from "../js/paperwork/sheet-tree.js";

describe("sheetListTitle", () => {
  it("keeps generated role labels for default LED titles", () => {
    assert.equal(
      sheetListTitle({ typeId: "led-wall-cable", title: "LED Cable — Wall A" }),
      "Cable wiring"
    );
    assert.equal(
      sheetListTitle({ typeId: "led-wall-power", title: "LED Power — Wall A" }),
      "Power wiring"
    );
  });

  it("shows a custom sheet title after rename", () => {
    assert.equal(
      sheetListTitle({ typeId: "led-wall-cable", title: "Main cable plate" }),
      "Main cable plate"
    );
    assert.equal(
      sheetListTitle({ typeId: "signal-flow", title: "SF overview" }),
      "SF overview"
    );
    assert.equal(
      sheetListTitle({ typeId: "cable-runs", title: "Site cables" }),
      "Site cables"
    );
    assert.equal(
      sheetListTitle({ typeId: "surface-map", title: "Lobby surface" }),
      "Lobby surface"
    );
  });

  it("shortens generated surface/raster titles to the source name", () => {
    assert.equal(
      sheetListTitle({ typeId: "surface-map", title: "Surface — Lobby" }),
      "Lobby"
    );
  });
});
