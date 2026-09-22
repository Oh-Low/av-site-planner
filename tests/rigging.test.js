import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachWorldPosition,
  computeLoads,
  emptyRiggingState,
  normalizeRiggingState,
  parseShackleTypeId,
  poseForMate,
  RIGGING_CATALOG,
} from "../js/domain/rigging.js";

describe("rigging domain", () => {
  it("normalizeRiggingState drops unknown types", () => {
    const state = normalizeRiggingState({
      parts: [
        { id: "a", typeId: "shackle-bolt-anchor-1_2", x: 0, y: 0, props: {} },
        { id: "b", typeId: "not-real", x: 1, y: 1, props: {} },
      ],
      mates: [{ id: "m1", aPartId: "a", aAttachId: "top", bPartId: "b", bAttachId: "bottom" }],
    });
    assert.equal(state.parts.length, 1);
    assert.equal(state.mates.length, 0);
  });

  it("shackle catalog covers bolt-type styles with size rows", () => {
    const shackles = RIGGING_CATALOG.filter((e) => e.typeId.startsWith("shackle-"));
    assert.ok(shackles.length >= 30);
    assert.ok(shackles.every((e) => e.typeId.includes("bolt-")));
    assert.equal(
      shackles.some((e) => e.typeId.includes("screw-pin")),
      false,
    );
    const half = parseShackleTypeId("shackle-bolt-anchor-1_2");
    assert.ok(half);
    assert.equal(half.size.label, "1/2″");
    assert.equal(half.size.wllTons, 2);
  });

  it("equal-share: 1000 lb LED on two hang points → 500 per cable, 1000 on truss", () => {
    /** @type {import("../js/domain/rigging.js").RiggingState} */
    const state = {
      ...emptyRiggingState(),
      parts: [
        // Zero self-weight on hardware so the split is exactly 1000 → 500 / 500.
        { id: "led", typeId: "load-led", name: "LED", x: 0, y: 200, rotationDeg: 0, props: { weightLb: 1000 } },
        { id: "bar", typeId: "led-hanging-bar", name: "Bar", x: 0, y: 160, rotationDeg: 0, props: { weightLb: 0 } },
        { id: "sh1", typeId: "shackle-bolt-anchor-1_2", name: "Sh1", x: -48, y: 140, rotationDeg: 0, props: { weightLb: 0 } },
        { id: "ac1", typeId: "aircraft-cable", name: "AC1", x: -48, y: 100, rotationDeg: 0, props: { lengthIn: 48, weightLb: 0 } },
        { id: "tb1", typeId: "turnbuckle", name: "TB1", x: -48, y: 60, rotationDeg: 0, props: { weightLb: 0 } },
        { id: "ss1", typeId: "spanset", name: "SS1", x: -48, y: 30, rotationDeg: 0, props: { lengthIn: 24, weightLb: 0 } },
        { id: "sh2", typeId: "shackle-bolt-anchor-1_2", name: "Sh2", x: 48, y: 140, rotationDeg: 0, props: { weightLb: 0 } },
        { id: "ac2", typeId: "aircraft-cable", name: "AC2", x: 48, y: 100, rotationDeg: 0, props: { lengthIn: 48, weightLb: 0 } },
        { id: "tb2", typeId: "turnbuckle", name: "TB2", x: 48, y: 60, rotationDeg: 0, props: { weightLb: 0 } },
        { id: "ss2", typeId: "spanset", name: "SS2", x: 48, y: 30, rotationDeg: 0, props: { lengthIn: 24, weightLb: 0 } },
        { id: "truss", typeId: "truss", name: "Truss", x: 0, y: 0, rotationDeg: 0, props: { weightLb: 0 } },
      ],
      mates: [
        { id: "m0", aPartId: "led", aAttachId: "top", bPartId: "bar", bAttachId: "bottom" },
        { id: "m1", aPartId: "bar", aAttachId: "top-left", bPartId: "sh1", bAttachId: "bottom" },
        { id: "m2", aPartId: "sh1", aAttachId: "top", bPartId: "ac1", bAttachId: "bottom" },
        { id: "m3", aPartId: "ac1", aAttachId: "top", bPartId: "tb1", bAttachId: "bottom" },
        { id: "m4", aPartId: "tb1", aAttachId: "top", bPartId: "ss1", bAttachId: "bottom" },
        { id: "m5", aPartId: "ss1", aAttachId: "top", bPartId: "truss", bAttachId: "bottom-left" },
        { id: "m6", aPartId: "bar", aAttachId: "top-right", bPartId: "sh2", bAttachId: "bottom" },
        { id: "m7", aPartId: "sh2", aAttachId: "top", bPartId: "ac2", bAttachId: "bottom" },
        { id: "m8", aPartId: "ac2", aAttachId: "top", bPartId: "tb2", bAttachId: "bottom" },
        { id: "m9", aPartId: "tb2", aAttachId: "top", bPartId: "ss2", bAttachId: "bottom" },
        { id: "m10", aPartId: "ss2", aAttachId: "top", bPartId: "truss", bAttachId: "bottom-right" },
      ],
    };

    const { partLoads } = computeLoads(state);
    assert.equal(partLoads.get("led"), 1000);
    assert.equal(partLoads.get("bar"), 1000);
    assert.equal(partLoads.get("ac1"), 500);
    assert.equal(partLoads.get("ac2"), 500);
    assert.equal(partLoads.get("sh1"), 500);
    assert.equal(partLoads.get("ss2"), 500);
    assert.equal(partLoads.get("truss"), 1000);
  });

  it("poseForMate aligns attach points in world space", () => {
    const target = {
      id: "t",
      typeId: "truss",
      name: "T",
      x: 100,
      y: 50,
      rotationDeg: 0,
      props: {},
    };
    const moving = {
      id: "c",
      typeId: "aircraft-cable",
      name: "C",
      x: 0,
      y: 0,
      rotationDeg: 0,
      props: { lengthIn: 48 },
    };
    const pose = poseForMate(moving, "top", target, "bottom-left");
    const moved = { ...moving, ...pose };
    const a = attachWorldPosition(moved, "top");
    const b = attachWorldPosition(target, "bottom-left");
    assert.ok(a && b);
    assert.ok(Math.abs(a.x - b.x) < 1e-6);
    assert.ok(Math.abs(a.y - b.y) < 1e-6);
  });
});
