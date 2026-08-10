import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyLedState, normalizeLedGrid, normalizeLedState } from "../js/domain/led.js";
import {
  createBlankProjectionScreen,
  emptyProjectorState,
  normalizeProjectionScreen,
  normalizeProjectorState,
} from "../js/domain/projector.js";
import { parseSiteState } from "../js/site-state.js";

describe("normalizeLedState", () => {
  it("rejects missing grids", () => {
    assert.throws(() => normalizeLedState({}), /LED calculator data/);
    assert.throws(() => normalizeLedState(null), /LED calculator data/);
  });

  it("normalizes voltage, bitrate, active grid, and processor backfill", () => {
    const normalized = normalizeLedState({
      grids: [
        {
          id: "w1",
          name: "Main",
          dataLines: [{ id: "d1", name: "D1", tiles: [0] }],
        },
      ],
      activeGridId: "missing",
      voltage: 999,
      bitrate: 10,
    });
    assert.equal(normalized.voltage, 120);
    assert.equal(normalized.bitrate, 10);
    assert.equal(normalized.activeGridId, "w1");
    assert.deepEqual(normalized.grids[0].processors, []);
    assert.equal(normalized.grids[0].dataLines[0].processorId, null);
  });

  it("emptyLedState round-trips through normalize", () => {
    assert.deepEqual(normalizeLedState(emptyLedState()), emptyLedState());
  });

  it("normalizeLedGrid fills defaults", () => {
    const grid = normalizeLedGrid({});
    assert.ok(grid.id);
    assert.ok(grid.name);
    assert.deepEqual(grid.processors, []);
  });
});

describe("normalizeProjectorState", () => {
  it("rejects empty screens", () => {
    assert.throws(() => normalizeProjectorState({ screens: [] }), /projection screen data/);
    assert.throws(() => normalizeProjectorState(null), /projection screen data/);
  });

  it("normalizes screen fields and active ids", () => {
    const normalized = normalizeProjectorState({
      screens: [{ id: "s1", name: "Main", unit: "m", width: 10, height: 5 }],
      activeScreenId: "nope",
      activeSidebarTab: "projectors",
    });
    assert.equal(normalized.screens.length, 1);
    assert.equal(normalized.screens[0].unit, "m");
    assert.equal(normalized.screens[0].width, 10);
    assert.deepEqual(normalized.screens[0].projectors, []);
    assert.equal(normalized.activeScreenId, "s1");
    assert.equal(normalized.activeSidebarTab, "projectors");
  });

  it("emptyProjectorState has one screen and validates", () => {
    const empty = emptyProjectorState();
    const again = normalizeProjectorState(empty);
    assert.equal(again.screens.length, 1);
    assert.equal(again.activeScreenId, again.screens[0].id);
  });

  it("createBlankProjectionScreen / normalizeProjectionScreen", () => {
    const blank = createBlankProjectionScreen(1);
    assert.match(blank.name, /Projection Screen/);
    const normalized = normalizeProjectionScreen({ id: "x", name: "  Hall  " });
    assert.equal(normalized.id, "x");
    assert.equal(normalized.name, "Hall");
  });
});

describe("led + projector parseSiteState", () => {
  it("deep-normalizes on import", () => {
    const parsed = parseSiteState(
      JSON.stringify({
        formatVersion: 2,
        app: "av-site-planner",
        led: {
          grids: [{ id: "g1", name: "Wall", dataLines: [{ id: "d1", tiles: [] }] }],
          voltage: 208,
          bitrate: 12,
        },
        projector: {
          screens: [{ id: "s1", name: "Scr", projectors: [] }],
          activeSidebarTab: "screen",
        },
      })
    );
    assert.equal(parsed.led.voltage, 208);
    assert.equal(parsed.led.bitrate, 12);
    assert.equal(parsed.led.grids[0].activeProcessorId, null);
    assert.equal(parsed.projector.screens[0].unit, "ft");
    assert.equal(parsed.projector.activeScreenId, "s1");
  });
});
