import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertLinearDistance,
  getRecalcFields,
  imageWidthFromDistanceAndRatio,
  interpolateThrowRatio,
  suggestLens,
  throwDistanceFromImageWidthAndRatio,
  throwInRangeFromSpecs,
} from "../js/projector-math.js";

describe("convertLinearDistance", () => {
  it("converts feet to meters", () => {
    assert.equal(convertLinearDistance(10, "ft", "m"), 3.05);
  });

  it("leaves values unchanged for matching units", () => {
    assert.equal(convertLinearDistance(12, "ft", "ft"), 12);
  });
});

describe("interpolateThrowRatio", () => {
  it("interpolates between lens limits", () => {
    assert.equal(interpolateThrowRatio(1.2, 2.0, 0.5), 1.6);
  });
});

describe("throw math", () => {
  it("derives image width from distance and ratio", () => {
    assert.equal(imageWidthFromDistanceAndRatio(30, 1.5), 20);
  });

  it("derives throw distance from image width and ratio", () => {
    assert.equal(throwDistanceFromImageWidthAndRatio(20, 1.5), 30);
  });

  it("validates throw range", () => {
    const inRange = throwInRangeFromSpecs({
      throwMin: 1.2,
      throwMax: 1.8,
      ratio: 1.5,
      dist: 30,
      imageWidth: 20,
    });
    assert.equal(inRange.ok, true);

    const outOfRange = throwInRangeFromSpecs({
      throwMin: 1.2,
      throwMax: 1.8,
      ratio: 2.5,
      dist: 30,
      imageWidth: 20,
    });
    assert.equal(outOfRange.ok, false);
  });
});

describe("suggestLens", () => {
  const lenses = [
    { id: "wide", name: "Wide", throwMin: 1.0, throwMax: 1.3 },
    { id: "std", name: "Standard", throwMin: 1.3, throwMax: 1.8 },
    { id: "long", name: "Long", throwMin: 1.8, throwMax: 2.4 },
  ];

  it("picks a matching lens", () => {
    assert.equal(suggestLens(lenses, 1.5).lens.id, "std");
    assert.equal(suggestLens(lenses, 1.5).status, "match");
  });

  it("flags ratios that are too wide", () => {
    assert.equal(suggestLens(lenses, 0.8).status, "too-wide");
  });
});

describe("getRecalcFields", () => {
  it("returns the single unlocked field when two are locked", () => {
    assert.deepEqual(getRecalcFields(["throw", "image"], "zoom"), ["zoom"]);
  });
});
