import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeNodeLayout,
  normalizeSignalFlowState,
} from "../js/domain/signal-flow.js";
import { layoutSignalFlow } from "../js/paperwork/signal-flow-svg.js";

describe("normalizeNodeLayout", () => {
  it("accepts valid chrome measurements", () => {
    assert.deepEqual(
      normalizeNodeLayout({
        w: 200,
        h: 120,
        inColW: 100,
        outColW: 100,
        portTop: 48,
        portRowH: 22,
      }),
      {
        w: 200,
        h: 120,
        inColW: 100,
        outColW: 100,
        portTop: 48,
        portRowH: 22,
      }
    );
  });

  it("rejects garbage", () => {
    assert.equal(normalizeNodeLayout(null), null);
    assert.equal(normalizeNodeLayout({ w: 0, h: 10, inColW: 1, outColW: 1, portTop: 0, portRowH: 10 }), null);
    assert.equal(normalizeNodeLayout({ w: 10, h: 10, inColW: 1, outColW: 1, portTop: 0, portRowH: "x" }), null);
  });

  it("strips invalid layout on normalizeSignalFlowState", () => {
    const normalized = normalizeSignalFlowState({
      nodes: [{ id: "n1", typeId: "blank", name: "A", x: 0, y: 0, layout: { w: -1 } }],
      connections: [],
    });
    assert.equal(normalized.nodes[0].layout, undefined);
  });

  it("keeps valid layout on normalizeSignalFlowState", () => {
    const layout = {
      w: 180,
      h: 100,
      inColW: 90,
      outColW: 90,
      portTop: 40,
      portRowH: 20,
    };
    const normalized = normalizeSignalFlowState({
      nodes: [{ id: "n1", typeId: "blank", name: "A", x: 10, y: 20, layout }],
      connections: [],
    });
    assert.deepEqual(normalized.nodes[0].layout, layout);
  });
});

describe("layoutSignalFlow measured chrome", () => {
  it("uses node.layout for port anchors instead of estimates", () => {
    const laid = layoutSignalFlow({
      nodes: [
        {
          id: "a",
          typeId: "unknown-type",
          name: "Short",
          x: 100,
          y: 200,
          layout: {
            w: 240,
            h: 160,
            inColW: 110,
            outColW: 130,
            portTop: 55,
            portRowH: 24,
          },
        },
        {
          id: "b",
          typeId: "unknown-type",
          name: "Other",
          x: 500,
          y: 200,
          layout: {
            w: 200,
            h: 140,
            inColW: 100,
            outColW: 100,
            portTop: 50,
            portRowH: 22,
          },
        },
      ],
      connections: [
        {
          id: "c1",
          fromNodeId: "a",
          fromRow: 1,
          fromCol: "output",
          toNodeId: "b",
          toRow: 0,
          toCol: "input",
          route: [],
        },
      ],
      customGearTypes: [],
      places: [],
    });

    assert.ok(laid);
    const a = laid.layouts.get("a");
    const b = laid.layouts.get("b");
    assert.equal(a.w, 240);
    assert.equal(a.inColW, 110);
    assert.equal(a.portTop, 55);
    assert.equal(a.portRowH, 24);
    assert.equal(b.w, 200);

    // After origin shift, port centers still follow measured chrome.
    const fromY = a.y + a.portTop + 1 * a.portRowH + a.portRowH / 2;
    const toY = b.y + b.portTop + 0 * b.portRowH + b.portRowH / 2;
    const fromX = a.x + a.w;
    const toX = b.x;

    assert.equal(laid.wirePaths.length, 1);
    const points = laid.wirePaths[0].points;
    assert.equal(points[0].x, fromX);
    assert.equal(points[0].y, fromY);
    assert.equal(points[points.length - 1].x, toX);
    assert.equal(points[points.length - 1].y, toY);
  });

  it("falls back to estimates when layout is missing", () => {
    const laid = layoutSignalFlow({
      nodes: [
        {
          id: "a",
          typeId: "unknown-type",
          name: "Device",
          x: 0,
          y: 0,
        },
      ],
      connections: [],
      customGearTypes: [],
      places: [],
    });
    assert.ok(laid);
    const a = laid.layouts.get("a");
    assert.ok(a.w >= 160);
    assert.ok(a.portRowH > 0);
    assert.ok(a.portTop > 0);
  });
});
