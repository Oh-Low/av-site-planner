import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyPlaces,
  liftPlacesFromSitePlan,
  normalizePlace,
  normalizePlaces,
  placesFromSiteExports,
  stripPlacesFromSignalFlow,
} from "../js/domain/places.js";

describe("normalizePlaces", () => {
  it("returns empty for null", () => {
    assert.deepEqual(normalizePlaces(null), emptyPlaces());
  });

  it("dedupes by id and sorts by name", () => {
    const places = normalizePlaces([
      { id: "b", name: "Stage" },
      { id: "a", name: "FOH" },
      { id: "b", name: "Stage Left" },
    ]);
    assert.deepEqual(
      places.map((p) => p.id),
      ["a", "b"]
    );
    assert.equal(places[0].name, "FOH");
    assert.equal(places[1].name, "Stage Left");
  });

  it("rejects non-arrays", () => {
    assert.throws(() => normalizePlaces({}), /invalid places/);
  });
});

describe("normalizePlace", () => {
  it("fills defaults", () => {
    assert.deepEqual(normalizePlace({}, 2), { id: "place-3", name: "Place 3" });
  });
});

describe("liftPlacesFromSitePlan", () => {
  it("prefers root places when the key exists", () => {
    const places = liftPlacesFromSitePlan({
      places: [{ id: "root", name: "Root" }],
      signalFlow: { places: [{ id: "nested", name: "Nested" }] },
    });
    assert.equal(places.length, 1);
    assert.equal(places[0].id, "root");
  });

  it("treats empty root places as intentional", () => {
    const places = liftPlacesFromSitePlan({
      places: [],
      signalFlow: { places: [{ id: "nested", name: "Nested" }] },
    });
    assert.deepEqual(places, []);
  });

  it("falls back to signalFlow.places when root is absent", () => {
    const places = liftPlacesFromSitePlan({
      signalFlow: { places: [{ id: "legacy", name: "Legacy" }] },
    });
    assert.equal(places[0].id, "legacy");
  });
});

describe("stripPlacesFromSignalFlow", () => {
  it("removes nested places", () => {
    assert.deepEqual(
      stripPlacesFromSignalFlow({ nodes: [], places: [{ id: "p1", name: "A" }], grid: { snap: true } }),
      { nodes: [], grid: { snap: true } }
    );
  });
});

describe("placesFromSiteExports", () => {
  it("reads root then signalFlow", () => {
    assert.equal(
      placesFromSiteExports({ places: [{ id: "r", name: "Root" }] })[0].id,
      "r"
    );
    assert.equal(
      placesFromSiteExports({ signalFlow: { places: [{ id: "s", name: "SF" }] } })[0].id,
      "s"
    );
  });
});
