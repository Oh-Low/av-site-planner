import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SITE_STATE_VERSION,
  migrateSiteStateToV2,
  parseSiteState,
  validateSiteState,
} from "../js/site-state.js";

const sampleV1 = {
  formatVersion: 1,
  app: "av-site-planner",
  exportedAt: "2026-06-30T12:00:00.000Z",
  activeTab: "led-calculator",
  led: { grids: [], activeGridId: null, voltage: 120, bitrate: 8 },
  projector: {
    screens: [
      {
        id: "screen-1",
        name: "Projection Screen",
        unit: "ft",
        aspectId: "16:9",
        width: 16,
        height: 9,
        projectors: [],
        projectorGroups: [],
        activeProjectorId: null,
        activeGroupId: null,
        view: null,
      },
    ],
    activeScreenId: "screen-1",
    activeSidebarTab: "screen",
  },
};

describe("migrateSiteStateToV2", () => {
  it("bumps format version and fills optional sections", () => {
    const migrated = migrateSiteStateToV2(sampleV1);
    assert.equal(migrated.formatVersion, SITE_STATE_VERSION);
    assert.deepEqual(migrated.led, sampleV1.led);
    assert.deepEqual(migrated.projector, sampleV1.projector);
    assert.deepEqual(migrated.signalFlow, { nodes: [], connections: [] });
  });
});

describe("validateSiteState", () => {
  it("accepts a complete v2 envelope", () => {
    const state = migrateSiteStateToV2(sampleV1);
    assert.doesNotThrow(() => validateSiteState(state));
  });

  it("rejects missing required calculator data", () => {
    const state = migrateSiteStateToV2(sampleV1);
    delete state.led;
    assert.throws(() => validateSiteState(state), /LED calculator data/);
  });
});

describe("parseSiteState", () => {
  it("imports version 1 files by migrating them", () => {
    const parsed = parseSiteState(JSON.stringify(sampleV1));
    assert.equal(parsed.formatVersion, SITE_STATE_VERSION);
    assert.ok(Array.isArray(parsed.signalFlow.nodes));
  });

  it("imports version 2 files directly", () => {
    const v2 = {
      ...migrateSiteStateToV2(sampleV1),
      signalFlow: { nodes: [{ id: "n1" }], connections: [] },
    };
    const parsed = parseSiteState(JSON.stringify(v2));
    assert.equal(parsed.signalFlow.nodes.length, 1);
  });

  it("rejects invalid JSON", () => {
    assert.throws(() => parseSiteState("{"), /not a valid AVP site plan/);
  });

  it("rejects unsupported format versions", () => {
    assert.throws(
      () => parseSiteState(JSON.stringify({ ...sampleV1, formatVersion: 99 })),
      /Unsupported file version/
    );
  });
});
