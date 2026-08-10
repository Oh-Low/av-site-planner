import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSiteDocument } from "../js/domain/site-document.js";
import { parseSiteState } from "../js/site-state.js";

const minimal = {
  formatVersion: 2,
  app: "av-site-planner",
  exportedAt: "2026-07-25T00:00:00.000Z",
  activeTab: "led-calculator",
  places: [{ id: "foh", name: "FOH" }],
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

describe("createSiteDocument", () => {
  it("starts empty and loads a snapshot", () => {
    const doc = createSiteDocument();
    assert.equal(doc.hasDocument(), false);
    assert.equal(doc.getSnapshot(), null);

    doc.load(minimal);
    assert.equal(doc.hasDocument(), true);
    assert.equal(doc.peek("led")?.voltage, 120);
    assert.deepEqual(doc.getPlaces(), [{ id: "foh", name: "FOH" }]);
  });

  it("peek returns clones (mutating peek does not mutate store)", () => {
    const doc = createSiteDocument(minimal);
    const led = /** @type {{ voltage: number }} */ (doc.peek("led"));
    led.voltage = 208;
    assert.equal(/** @type {{ voltage: number }} */ (doc.peek("led")).voltage, 120);
  });

  it("setSection and setPlaces notify subscribers", () => {
    const doc = createSiteDocument(minimal);
    /** @type {string[]} */
    const events = [];
    const unsub = doc.subscribe((change) => {
      events.push(change.type === "section" ? `section:${change.key}` : change.type);
    });

    doc.setSection("labor", {
      startTime: "09:00",
      endTime: "17:00",
      hourlyRate: 40,
      events: { after10: true, after14: true, night: true },
    });
    doc.setPlaces([{ id: "stage", name: "Stage" }]);
    unsub();
    doc.setSection("cable", { routes: {}, places: {} });

    assert.deepEqual(events, ["section:labor", "places"]);
    assert.equal(doc.getPlaces()[0].id, "stage");
    assert.equal(doc.peek("labor")?.hourlyRate, 40);
  });

  it("loads from parseSiteState output", () => {
    const parsed = parseSiteState(JSON.stringify(minimal));
    const doc = createSiteDocument();
    doc.load(parsed);
    assert.equal("places" in /** @type {object} */ (doc.peek("signalFlow") ?? {}), false);
    assert.deepEqual(doc.getPlaces().map((p) => p.id), ["foh"]);
  });
});

describe("parseSiteDocument", () => {
  it("is exported from site-state", async () => {
    const { parseSiteDocument } = await import("../js/site-state.js");
    const doc = parseSiteDocument(JSON.stringify(minimal));
    assert.equal(doc.hasDocument(), true);
    assert.equal(doc.peek("app"), "av-site-planner");
  });
});
