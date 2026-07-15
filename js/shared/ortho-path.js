/** @typedef {{ x: number, y: number }} Point */

/** @typedef {{ index: number, kind: "horizontal" | "vertical", x1: number, x2: number, y1: number, y2: number, midX: number, midY: number }} WireSegment */

/** @typedef {{ segmentIndex: number, kind: "horizontal" | "vertical", x: number, y: number, t: number }} SegmentHandle */

const EPS = 1;

/**
 * @param {Point} a @param {Point} b
 */
function samePoint(a, b) {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

/**
 * @param {Point} a @param {Point} b
 */
function isHorizontal(a, b) {
  return Math.abs(a.y - b.y) < EPS;
}

/**
 * @param {Point} a @param {Point} b
 */
function isVertical(a, b) {
  return Math.abs(a.x - b.x) < EPS;
}

/**
 * @param {Point} a @param {Point} b
 */
function isOrthoLeg(a, b) {
  return isHorizontal(a, b) || isVertical(a, b);
}

/**
 * Default inner waypoints for a new connection (H–V–H).
 * @param {Point} start @param {Point} end
 * @returns {Point[]}
 */
export function defaultRouteCorners(start, end) {
  if (Math.abs(end.y - start.y) < EPS) return [];
  const midX = start.x + (end.x - start.x) / 2;
  return [
    { x: midX, y: start.y },
    { x: midX, y: end.y },
  ];
}

/** Legacy signature */
export function orthoDefaultMidX(x1, x2) {
  return x1 + (x2 - x1) / 2;
}

/**
 * @param {Point} start @param {Point} end @param {Point[]} waypoints
 * @returns {Point[]}
 */
export function buildPath(start, end, waypoints) {
  return [{ ...start }, ...waypoints.map((p) => ({ ...p })), { ...end }];
}

/** Legacy */
export function routePoints(x1, y1, x2, y2, corners) {
  return buildPath({ x: x1, y: y1 }, { x: x2, y: y2 }, corners);
}

/**
 * @param {{ route?: Point[], routeX?: number }} conn
 * @param {Point} start @param {Point} end
 * @returns {Point[]}
 */
export function resolveConnectionRoute(conn, start, end) {
  if (Array.isArray(conn.route) && conn.route.length > 0) {
    return conn.route.map((p) => ({ x: p.x, y: p.y }));
  }
  if (conn.routeX != null && Math.abs(end.y - start.y) >= EPS) {
    return [
      { x: conn.routeX, y: start.y },
      { x: conn.routeX, y: end.y },
    ];
  }
  return defaultRouteCorners(start, end);
}

/**
 * Remove duplicate and collinear inner points; ensure ortho legs to ports.
 * @param {Point} start @param {Point} end @param {Point[]} points Full path
 * @returns {Point[]}
 */
export function extractWaypoints(start, end, points) {
  let pts = simplifyCollinear(points);

  if (pts.length <= 2) return [];

  let inner = pts.slice(1, -1).map((p) => ({ ...p }));

  if (inner.length > 0 && !isOrthoLeg(start, inner[0])) {
    inner.unshift({ x: start.x, y: inner[0].y });
  }

  const last = inner.length > 0 ? inner[inner.length - 1] : start;
  if (!isOrthoLeg(last, end)) {
    inner.push({ x: end.x, y: last.y });
  }

  return simplifyCollinear(buildPath(start, end, inner)).slice(1, -1);
}

/** @param {Point[]} points @returns {Point[]} */
export function simplifyCollinear(points) {
  if (points.length <= 2) return points.map((p) => ({ ...p }));

  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const colH = isHorizontal(prev, curr) && isHorizontal(curr, next);
    const colV = isVertical(prev, curr) && isVertical(curr, next);
    if (!colH && !colV) out.push({ ...curr });
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Legacy alias */
export function simplifyOrthoPoints(points) {
  return simplifyCollinear(points);
}

export function cornersFromRoutePoints(points) {
  if (points.length <= 2) return [];
  return simplifyCollinear(points).slice(1, -1);
}

export function repairRouteCorners(start, end, inner) {
  return extractWaypoints(start, end, buildPath(start, end, inner));
}

/**
 * Ensure the path leaves the start port and enters the end port with a
 * horizontal run of at least `stub` px before any turn. Start stubs extend
 * right (away from an output cell); end stubs approach from the left (into
 * an input cell).
 * @param {Point[]} points Full path including both endpoints
 * @param {number} [stub]
 * @returns {Point[]}
 */
export function enforceEndStubs(points, stub = 10) {
  const pts = simplifyCollinear(points);
  if (pts.length < 2) return pts;

  const start = pts[0];
  const end = pts[pts.length - 1];
  const a = { x: start.x + stub, y: start.y };
  const b = { x: end.x - stub, y: end.y };

  const inner = pts.slice(1, -1).map((p) => ({ ...p }));

  // Corners that sit inside a stub zone on the port's own row would create a
  // tiny backwards jog once the stub is inserted; push them out to the stub.
  if (inner.length > 0) {
    const first = inner[0];
    if (Math.abs(first.y - start.y) < EPS && first.x > start.x && first.x < a.x) first.x = a.x;
    const last = inner[inner.length - 1];
    if (Math.abs(last.y - end.y) < EPS && last.x < end.x && last.x > b.x) last.x = b.x;
  }

  let fixed = repairRouteCorners(a, b, inner);
  if (fixed.length === 0 && !isOrthoLeg(a, b)) {
    fixed = defaultRouteCorners(a, b);
  }

  return simplifyCollinear([{ ...start }, a, ...fixed, b, { ...end }]);
}

/**
 * @param {Point[]} points
 * @returns {WireSegment[]}
 */
export function getWireSegments(points) {
  /** @type {WireSegment[]} */
  const segments = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!isOrthoLeg(a, b)) continue;

    const horizontal = isHorizontal(a, b);
    segments.push({
      index: i,
      kind: horizontal ? "horizontal" : "vertical",
      x1: Math.min(a.x, b.x),
      x2: Math.max(a.x, b.x),
      y1: Math.min(a.y, b.y),
      y2: Math.max(a.y, b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    });
  }
  return segments;
}

/**
 * @param {Point[]} points
 * @returns {SegmentHandle[]}
 */
export function getSegmentHandlePositions(points) {
  /** @type {SegmentHandle[]} */
  const handles = [];
  for (const seg of getWireSegments(points)) {
    const a = points[seg.index];
    const b = points[seg.index + 1];
    for (const t of [0.25, 0.5, 0.75]) {
      handles.push({
        segmentIndex: seg.index,
        kind: seg.kind,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        t,
      });
    }
  }
  return handles;
}

/**
 * @param {Point[]} points
 * @returns {WireSegment | null}
 */
export function findNearestSegment(points, px, py, threshold = 14) {
  let best = /** @type {WireSegment | null} */ (null);
  let bestDist = threshold;

  for (const seg of getWireSegments(points)) {
    let dist;
    if (seg.kind === "horizontal") {
      if (seg.x2 - seg.x1 < EPS) continue;
      if (px < seg.x1) dist = Math.hypot(px - seg.x1, py - seg.midY);
      else if (px > seg.x2) dist = Math.hypot(px - seg.x2, py - seg.midY);
      else dist = Math.abs(py - seg.midY);
    } else {
      if (seg.y2 - seg.y1 < EPS) continue;
      if (py < seg.y1) dist = Math.hypot(px - seg.midX, py - seg.y1);
      else if (py > seg.y2) dist = Math.hypot(px - seg.midX, py - seg.y2);
      else dist = Math.abs(px - seg.midX);
    }
    if (dist <= bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

/**
 * Insert a fixed anchor on a segment at ratio t.
 * @param {Point[]} points
 * @param {number} segmentIndex
 * @param {number} t
 */
function splitAtRatio(points, segmentIndex, t) {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  if (span < EPS * 4 || t <= 0.02 || t >= 0.98) {
    return { points: points.map((p) => ({ ...p })), anchorIndex: -1 };
  }

  const anchor = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };

  const next = [
    ...points.slice(0, segmentIndex + 1),
    anchor,
    ...points.slice(segmentIndex + 1),
  ];
  return { points: next, anchorIndex: segmentIndex + 1 };
}

/**
 * Insert vertical/horizontal legs so a horizontal run at newY connects
 * between leftIdx and rightIdx while respecting fixed indices.
 * @param {Point[]} points
 * @param {number} leftIdx
 * @param {number} rightIdx
 * @param {number} newY
 * @param {Set<number>} fixed
 */
function setHorizontalRunY(points, leftIdx, rightIdx, newY, fixed) {
  const next = points.map((p) => ({ ...p }));
  const n = next.length;

  const left = next[leftIdx];
  const right = next[rightIdx];

  /** @type {Point[]} */
  const prefix = next.slice(0, leftIdx);
  /** @type {Point[]} */
  const suffix = next.slice(rightIdx + 1);

  /** @type {Point[]} */
  const middle = [];

  if (leftIdx === 0) {
    middle.push({ ...left });
    if (Math.abs(left.y - newY) > EPS) {
      middle.push({ x: left.x, y: newY });
    }
  } else if (!fixed.has(leftIdx)) {
    middle.push({ x: left.x, y: newY });
  } else {
    middle.push({ ...left });
    if (Math.abs(left.y - newY) > EPS) {
      middle.push({ x: left.x, y: newY });
    }
  }

  const anchorRight = fixed.has(rightIdx);
  const rightX = right.x;

  if (Math.abs(rightX - middle[middle.length - 1].x) > EPS) {
    middle.push({ x: rightX, y: newY });
  }

  if (anchorRight) {
    if (!samePoint(middle[middle.length - 1], right) && Math.abs(right.y - newY) > EPS) {
      middle.push({ ...right });
    } else if (!samePoint(middle[middle.length - 1], right)) {
      middle[middle.length - 1] = { ...right };
    }
  } else if (rightIdx === n - 1) {
    if (Math.abs(right.y - newY) > EPS) {
      middle.push({ x: right.x, y: newY });
    }
    middle.push({ ...right });
  } else if (!fixed.has(rightIdx)) {
    if (middle.length === 0 || !samePoint(middle[middle.length - 1], { x: right.x, y: newY })) {
      middle.push({ x: right.x, y: newY });
    }
  }

  return [...prefix, ...middle, ...suffix];
}

/**
 * @param {Point[]} points
 * @param {number} leftIdx
 * @param {number} rightIdx
 * @param {number} newX
 * @param {Set<number>} fixed
 */
function setVerticalRunX(points, leftIdx, rightIdx, newX, fixed) {
  const next = points.map((p) => ({ ...p }));
  const n = next.length;
  const left = next[leftIdx];
  const right = next[rightIdx];

  const prefix = next.slice(0, leftIdx);
  const suffix = next.slice(rightIdx + 1);
  /** @type {Point[]} */
  const middle = [];

  if (leftIdx === 0) {
    middle.push({ ...left });
    if (Math.abs(left.x - newX) > EPS) {
      middle.push({ x: newX, y: left.y });
    }
  } else if (!fixed.has(leftIdx)) {
    middle.push({ x: newX, y: left.y });
  } else {
    middle.push({ ...left });
    if (Math.abs(left.x - newX) > EPS) {
      middle.push({ x: newX, y: left.y });
    }
  }

  const anchorRight = fixed.has(rightIdx);
  const rightY = right.y;

  if (Math.abs(rightY - middle[middle.length - 1].y) > EPS) {
    middle.push({ x: newX, y: rightY });
  }

  if (anchorRight) {
    if (!samePoint(middle[middle.length - 1], right) && Math.abs(right.x - newX) > EPS) {
      middle.push({ ...right });
    } else if (!samePoint(middle[middle.length - 1], right)) {
      middle[middle.length - 1] = { ...right };
    }
  } else if (rightIdx === n - 1) {
    if (Math.abs(right.x - newX) > EPS) {
      middle.push({ x: newX, y: right.y });
    }
    middle.push({ ...right });
  } else if (!fixed.has(rightIdx)) {
    if (middle.length === 0 || !samePoint(middle[middle.length - 1], { x: newX, y: right.y })) {
      middle.push({ x: newX, y: right.y });
    }
  }

  return [...prefix, ...middle, ...suffix];
}

/**
 * Snap a value to the nearest target within threshold.
 * @param {number} value
 * @param {number[]} targets
 * @param {number} threshold
 */
export function snapToNearest(value, targets, threshold) {
  if (threshold <= 0 || targets.length === 0) return value;
  let best = value;
  let bestDist = threshold + 1;
  for (const target of targets) {
    const dist = Math.abs(value - target);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  return best;
}

/**
 * Collect Y (horizontal) or X (vertical) coordinates from other parallel segments.
 * @param {Point[]} points
 * @param {number} dragLeft
 * @param {"horizontal" | "vertical"} kind
 */
export function collectParallelSnapTargets(points, dragLeft, kind) {
  /** @type {Set<number>} */
  const targets = new Set();

  if (kind === "horizontal") {
    targets.add(points[0].y);
    targets.add(points[points.length - 1].y);
    for (const seg of getWireSegments(points)) {
      if (seg.kind !== "horizontal" || seg.index === dragLeft) continue;
      targets.add(seg.midY);
    }
  } else {
    targets.add(points[0].x);
    targets.add(points[points.length - 1].x);
    for (const seg of getWireSegments(points)) {
      if (seg.kind !== "vertical" || seg.index === dragLeft) continue;
      targets.add(seg.midX);
    }
  }

  return [...targets];
}

/**
 * Lucidchart-style segment drag. Returns inner waypoints.
 * @param {Point} start
 * @param {Point} end
 * @param {Point[]} startPoints Full path snapshot at drag start
 * @param {number} segmentIndex
 * @param {number} handleT 0.25 | 0.5 | 0.75
 * @param {number} mx @param {number} my
 * @param {number} [snapThreshold] World-space snap distance; 0 disables snap.
 * @returns {Point[]}
 */
export function applySegmentDrag(start, end, startPoints, segmentIndex, handleT, mx, my, snapThreshold = 0) {
  let pts = startPoints.map((p) => ({ ...p }));
  const fixed = new Set([0, pts.length - 1]);
  let dragLeft = segmentIndex;
  let dragRight = segmentIndex + 1;

  if (handleT < 0.45) {
    const split = splitAtRatio(pts, segmentIndex, handleT);
    pts = split.points;
    if (split.anchorIndex >= 0) {
      fixed.add(split.anchorIndex);
      dragLeft = segmentIndex;
      dragRight = segmentIndex + 1;
    }
  } else if (handleT > 0.55) {
    const split = splitAtRatio(pts, segmentIndex, handleT);
    pts = split.points;
    if (split.anchorIndex >= 0) {
      fixed.add(split.anchorIndex);
      dragLeft = segmentIndex + 1;
      dragRight = segmentIndex + 2;
    }
  }

  const a = pts[dragLeft];
  const b = pts[dragRight];
  if (!a || !b) return extractWaypoints(start, end, pts);

  let dragMx = mx;
  let dragMy = my;

  if (snapThreshold > 0) {
    if (isHorizontal(a, b)) {
      const targets = collectParallelSnapTargets(pts, dragLeft, "horizontal");
      dragMy = snapToNearest(my, targets, snapThreshold);
    } else if (isVertical(a, b)) {
      const targets = collectParallelSnapTargets(pts, dragLeft, "vertical");
      dragMx = snapToNearest(mx, targets, snapThreshold);
    }
  }

  let next;
  if (isHorizontal(a, b)) {
    next = setHorizontalRunY(pts, dragLeft, dragRight, dragMy, fixed);
  } else if (isVertical(a, b)) {
    next = setVerticalRunX(pts, dragLeft, dragRight, dragMx, fixed);
  } else {
    next = pts;
  }

  return extractWaypoints(start, end, simplifyCollinear(next));
}

/** @returns {string} */
export function roundedOrthoPolyline(points, radius = 10) {
  const pts = simplifyCollinear(points);
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    const [a, b] = pts;
    if (samePoint(a, b)) return `M ${a.x} ${a.y}`;
    if (isHorizontal(a, b)) return `M ${a.x} ${a.y} H ${b.x}`;
    if (isVertical(a, b)) return `M ${a.x} ${a.y} V ${b.y}`;
  }

  /** @type {string[]} */
  const parts = [`M ${pts[0].x} ${pts[0].y}`];
  let cursor = { ...pts[0] };

  for (let i = 1; i < pts.length; i += 1) {
    const target = pts[i];
    const isLast = i === pts.length - 1;

    if (isLast) {
      if (isHorizontal(cursor, target)) parts.push(`H ${target.x}`);
      else if (isVertical(cursor, target)) parts.push(`V ${target.y}`);
      else {
        parts.push(`H ${target.x}`);
        parts.push(`V ${target.y}`);
      }
      break;
    }

    const after = pts[i + 1];
    const inHoriz = isHorizontal(cursor, target);
    const outHoriz = isHorizontal(target, after);
    const legIn = inHoriz ? Math.abs(target.x - cursor.x) : Math.abs(target.y - cursor.y);
    const legOut = outHoriz ? Math.abs(after.x - target.x) : Math.abs(after.y - target.y);
    const r = Math.min(radius, legIn / 2, legOut / 2);

    if (r < 2) {
      if (inHoriz) parts.push(`H ${target.x}`);
      else parts.push(`V ${target.y}`);
      cursor = { ...target };
      continue;
    }

    if (inHoriz && !outHoriz) {
      const dirX = target.x >= cursor.x ? 1 : -1;
      const dirY = after.y >= target.y ? 1 : -1;
      parts.push(`H ${target.x - r * dirX}`);
      parts.push(`Q ${target.x} ${target.y} ${target.x} ${target.y + r * dirY}`);
      cursor = { x: target.x, y: target.y + r * dirY };
    } else if (!inHoriz && outHoriz) {
      const dirY = target.y >= cursor.y ? 1 : -1;
      const dirX = after.x >= target.x ? 1 : -1;
      parts.push(`V ${target.y - r * dirY}`);
      parts.push(`Q ${target.x} ${target.y} ${target.x + r * dirX} ${target.y}`);
      cursor = { x: target.x + r * dirX, y: target.y };
    } else {
      if (inHoriz) parts.push(`H ${target.x}`);
      else parts.push(`V ${target.y}`);
      cursor = { ...target };
    }
  }

  return parts.join(" ");
}

/** @returns {string} */
export function roundedOrthoPath(x1, y1, x2, y2, radius = 10, midX) {
  const start = { x: x1, y: y1 };
  const end = { x: x2, y: y2 };
  if (samePoint(start, end)) return `M ${x1} ${y1}`;
  if (Math.abs(y2 - y1) < EPS) return `M ${x1} ${y1} H ${x2}`;
  const corners =
    midX != null
      ? [
          { x: midX, y: y1 },
          { x: midX, y: y2 },
        ]
      : defaultRouteCorners(start, end);
  return roundedOrthoPolyline(buildPath(start, end, corners), radius);
}

// Legacy helpers for tests / migration
export function splitSegmentAtRatio(points, segmentIndex, t) {
  return splitAtRatio(points, segmentIndex, t);
}

export function splitSegmentAtClick(points, segmentIndex, px, py) {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const t = span < EPS ? 0.5 : Math.hypot(px - a.x, py - a.y) / span;
  return { ...splitAtRatio(points, segmentIndex, Math.max(0.05, Math.min(0.95, t))), segmentIndex };
}

export function insertBendOnSegment(start, end, points, segmentIndex, px, py) {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const t = span < EPS ? 0.5 : Math.hypot(px - a.x, py - a.y) / span;
  const split = splitAtRatio(points, segmentIndex, Math.max(0.05, Math.min(0.95, t)));
  return extractWaypoints(start, end, split.points);
}

export function removeRouteCorner(start, end, points, cornerIndex) {
  const inner = cornersFromRoutePoints(points);
  if (cornerIndex < 0 || cornerIndex >= inner.length) return inner;
  inner.splice(cornerIndex, 1);
  return repairRouteCorners(start, end, inner);
}

export function dragRouteSegment(points, segmentIndex, segmentKind, wx, wy) {
  const start = points[0];
  const end = points[points.length - 1];
  return applySegmentDrag(start, end, points, segmentIndex, 0.5, wx, wy);
}

export function prepareSegmentDrag(points, segmentIndex, segmentKind, px, py) {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const t = span < EPS ? 0.5 : Math.hypot(px - a.x, py - a.y) / span;
  const split = splitAtRatio(points, segmentIndex, Math.max(0.05, Math.min(0.95, t)));
  const dragIndex = t <= 0.5 ? segmentIndex : segmentIndex + 1;
  const seg = getWireSegments(split.points).find((s) => s.index === dragIndex);
  return {
    points: split.points,
    segmentIndex: dragIndex,
    segmentKind: seg?.kind ?? segmentKind,
    anchorIndex: split.anchorIndex,
  };
}

export function getRouteCornerHandles(points) {
  return cornersFromRoutePoints(points).map((corner, index) => ({
    index,
    x: corner.x,
    y: corner.y,
  }));
}
