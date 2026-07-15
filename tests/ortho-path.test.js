import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySegmentDrag,
  buildPath,
  defaultRouteCorners,
  enforceEndStubs,
  extractWaypoints,
  getSegmentHandlePositions,
  getWireSegments,
  resolveConnectionRoute,
  roundedOrthoPath,
  roundedOrthoPolyline,
  simplifyCollinear,
  snapToNearest,
} from "../js/shared/ortho-path.js";
import { clampZoom } from "../js/shared/pan-zoom.js";

const start = { x: 0, y: 200 };
const end = { x: 400, y: 250 };

describe("roundedOrthoPath", () => {
  it("returns a horizontal segment for flat lines", () => {
    assert.equal(roundedOrthoPath(0, 50, 100, 50, 10), "M 0 50 H 100");
  });
});

describe("enforceEndStubs", () => {
  it("keeps a flat line unchanged apart from stub points", () => {
    const pts = enforceEndStubs([{ x: 0, y: 50 }, { x: 100, y: 50 }], 10);
    assert.deepEqual(pts, [{ x: 0, y: 50 }, { x: 100, y: 50 }]);
  });

  it("adds 10px horizontal stubs at both ends of an elbow", () => {
    const path = buildPath(start, end, [
      { x: 3, y: 200 },
      { x: 3, y: 250 },
    ]);
    const pts = enforceEndStubs(path, 10);
    // First leg leaves the start horizontally for at least 10px.
    assert.equal(pts[1].y, start.y);
    assert.ok(pts[1].x - pts[0].x >= 10);
    // Last leg enters the end horizontally for at least 10px.
    const last = pts[pts.length - 1];
    const beforeLast = pts[pts.length - 2];
    assert.equal(beforeLast.y, last.y);
    assert.ok(last.x - beforeLast.x >= 10);
    // All legs remain orthogonal.
    assert.equal(getWireSegments(pts).length, pts.length - 1);
  });

  it("adds stubs even when the route doubles back past the start", () => {
    const path = buildPath(start, end, [
      { x: -40, y: 200 },
      { x: -40, y: 250 },
    ]);
    const pts = enforceEndStubs(path, 10);
    assert.deepEqual(pts[1], { x: start.x + 10, y: start.y });
    assert.equal(getWireSegments(pts).length, pts.length - 1);
  });
});

describe("wire route model", () => {
  it("creates default H–V–H corners", () => {
    const corners = defaultRouteCorners(start, end);
    assert.equal(corners.length, 2);
    assert.equal(corners[0].x, 200);
  });

  it("builds a complex multi-segment path like a flowchart elbow line", () => {
    const waypoints = [
      { x: 40, y: 200 },
      { x: 40, y: 80 },
      { x: 180, y: 80 },
      { x: 180, y: 120 },
      { x: 120, y: 120 },
      { x: 120, y: 160 },
      { x: 320, y: 160 },
      { x: 320, y: 250 },
    ];
    const path = buildPath(start, end, waypoints);
    assert.equal(getWireSegments(path).length, 9);
    const d = roundedOrthoPolyline(path);
    assert.match(d, /^M 0 200/);
    assert.doesNotMatch(d, /\bL /);
  });

  it("exposes three handles per segment", () => {
    const path = buildPath(start, end, defaultRouteCorners(start, end));
    const handles = getSegmentHandlePositions(path);
    assert.equal(handles.length, 9);
    assert.equal(handles.filter((h) => h.t === 0.25).length, 3);
  });

  it("drags the center of a vertical segment horizontally", () => {
    const path = buildPath(start, end, defaultRouteCorners(start, end));
    const next = applySegmentDrag(start, end, path, 1, 0.5, 140, 0);
    assert.deepEqual(next, [
      { x: 140, y: 200 },
      { x: 140, y: 250 },
    ]);
  });

  it("drags the center of a horizontal segment vertically", () => {
    const path = buildPath({ x: 0, y: 50 }, { x: 200, y: 50 }, []);
    const next = applySegmentDrag({ x: 0, y: 50 }, { x: 200, y: 50 }, path, 0, 0.5, 0, 120);
    assert.deepEqual(next, [
      { x: 0, y: 120 },
      { x: 200, y: 120 },
    ]);
  });

  it("splits at 25% and drags the left section, adding corners", () => {
    const path = buildPath(start, end, defaultRouteCorners(start, end));
    const next = applySegmentDrag(start, end, path, 2, 0.25, 0, 140);
    assert.ok(next.length >= 3);
    const rebuilt = buildPath(start, end, next);
    assert.doesNotMatch(roundedOrthoPolyline(rebuilt), /\bL /);
  });

  it("splits at 75% and drags the right section toward the port", () => {
    const path = buildPath(start, end, defaultRouteCorners(start, end));
    const next = applySegmentDrag(start, end, path, 2, 0.75, 0, 180);
    assert.ok(next.length >= 3);
    const rebuilt = buildPath(start, end, next);
    assert.doesNotMatch(roundedOrthoPolyline(rebuilt), /\bL /);
  });

  it("migrates legacy routeX", () => {
    const corners = resolveConnectionRoute({ routeX: 80 }, start, end);
    assert.equal(corners[0].x, 80);
  });

  it("removes collinear redundant points", () => {
    const simplified = simplifyCollinear([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    assert.equal(simplified.length, 3);
  });

  it("extracts inner waypoints from a full path", () => {
    const full = buildPath(start, end, defaultRouteCorners(start, end));
    const inner = extractWaypoints(start, end, full);
    assert.equal(inner.length, 2);
  });

  it("snaps a horizontal segment to a nearby parallel segment", () => {
    const path = buildPath(start, end, defaultRouteCorners(start, end));
    const next = applySegmentDrag(start, end, path, 2, 0.5, 0, 205, 10);
    const rebuilt = buildPath(start, end, next);
    const snapped = getWireSegments(rebuilt).some(
      (s) => s.kind === "horizontal" && s.midY === 200 && s.x2 > 300
    );
    assert.equal(snapped, true);
  });

  it("snaps a vertical segment to a nearby parallel segment", () => {
    const s = { x: 0, y: 0 };
    const e = { x: 200, y: 100 };
    const waypoints = [
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 100 },
    ];
    const path = buildPath(s, e, waypoints);
    const next = applySegmentDrag(s, e, path, 1, 0.5, 146, 0, 10);
    const rebuilt = buildPath(s, e, next);
    const moved = getWireSegments(rebuilt).find((seg) => seg.kind === "vertical" && seg.index === 1);
    assert.equal(moved?.midX, 150);
  });

  it("does not snap when outside the threshold", () => {
    assert.equal(snapToNearest(220, [200, 250], 5), 220);
    const path = buildPath(start, end, defaultRouteCorners(start, end));
    const unsnapped = applySegmentDrag(start, end, path, 2, 0.5, 0, 220, 5);
    const rebuilt = buildPath(start, end, unsnapped);
    const moved = getWireSegments(rebuilt).some((s) => s.kind === "horizontal" && s.midY === 220);
    assert.equal(moved, true);
  });
});

describe("clampZoom", () => {
  it("clamps zoom within bounds", () => {
    assert.equal(clampZoom(0.1, 0.35, 2.5), 0.35);
    assert.equal(clampZoom(1, 0.35, 2.5), 1);
  });
});
