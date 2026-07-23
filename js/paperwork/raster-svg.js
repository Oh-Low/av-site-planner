import { escapeXml } from "../shared/dom.js";
import { fontSizePtToUserUnits, normalizeFontSizePt } from "./font-scale.js?v=4";
import {
  formatSurfaceLength,
  formatSurfacePoint,
  normalizeSurfaceDimensionUnit,
} from "./surface-scale.js?v=1";

/**
 * @param {object} raster
 * @returns {object[]}
 */
export function allRasterZones(raster) {
  const groups = Array.isArray(raster?.groups) ? raster.groups : [];
  const grouped = groups.flatMap((group) =>
    Array.isArray(group?.zones) ? group.zones : []
  );
  const loose = Array.isArray(raster?.zones) ? raster.zones : [];
  return [...grouped, ...loose];
}

/**
 * @param {object} surface
 * @returns {object[]}
 */
export function allSurfaceZones(surface) {
  return Array.isArray(surface?.zones) ? surface.zones : [];
}

/** @param {string} color */
function safeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : "#38bdf8";
}

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   kind: "overlap" | "gap",
 *   axis: "x" | "y",
 * }} DimRegion
 */

/**
 * Pairwise zone intersections (overlap / blend regions).
 * @param {object[]} zones
 * @returns {DimRegion[]}
 */
function zoneOverlaps(zones) {
  /** @type {DimRegion[]} */
  const overlaps = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      const ax = Number(a?.x) || 0;
      const ay = Number(a?.y) || 0;
      const aw = Math.max(1, Number(a?.width) || 1);
      const ah = Math.max(1, Number(a?.height) || 1);
      const bx = Number(b?.x) || 0;
      const by = Number(b?.y) || 0;
      const bw = Math.max(1, Number(b?.width) || 1);
      const bh = Math.max(1, Number(b?.height) || 1);
      const x1 = Math.max(ax, bx);
      const y1 = Math.max(ay, by);
      const x2 = Math.min(ax + aw, bx + bw);
      const y2 = Math.min(ay + ah, by + bh);
      if (x2 > x1 && y2 > y1) {
        const width = x2 - x1;
        const height = y2 - y1;
        // Thin vertical strip = side blend (measure width); thin horizontal = stack blend.
        overlaps.push({
          x: x1,
          y: y1,
          width,
          height,
          kind: "overlap",
          axis: height >= width ? "x" : "y",
        });
      }
    }
  }
  return overlaps;
}

/**
 * True when another zone's center sits inside the candidate gap (non-adjacent pair).
 * @param {{ x: number, y: number, width: number, height: number }} gap
 * @param {object[]} zones
 * @param {number} skipI
 * @param {number} skipJ
 */
function gapBlockedByZone(gap, zones, skipI, skipJ) {
  for (let k = 0; k < zones.length; k++) {
    if (k === skipI || k === skipJ) continue;
    const z = zones[k];
    const zx = (Number(z?.x) || 0) + Math.max(1, Number(z?.width) || 1) / 2;
    const zy = (Number(z?.y) || 0) + Math.max(1, Number(z?.height) || 1) / 2;
    if (
      zx > gap.x &&
      zx < gap.x + gap.width &&
      zy > gap.y &&
      zy < gap.y + gap.height
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Empty strips between adjacent zones.
 * Side-by-side → axis "x" (width below); stacked → axis "y" (height on right).
 * @param {object[]} zones
 * @returns {DimRegion[]}
 */
function zoneGaps(zones) {
  /** @type {DimRegion[]} */
  const gaps = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      const ax = Number(a?.x) || 0;
      const ay = Number(a?.y) || 0;
      const aw = Math.max(1, Number(a?.width) || 1);
      const ah = Math.max(1, Number(a?.height) || 1);
      const bx = Number(b?.x) || 0;
      const by = Number(b?.y) || 0;
      const bw = Math.max(1, Number(b?.width) || 1);
      const bh = Math.max(1, Number(b?.height) || 1);
      const aRight = ax + aw;
      const aBottom = ay + ah;
      const bRight = bx + bw;
      const bBottom = by + bh;

      const yOverlap = Math.min(aBottom, bBottom) - Math.max(ay, by);
      if (yOverlap > 0) {
        /** @type {DimRegion | null} */
        let gap = null;
        if (aRight < bx) {
          gap = {
            x: aRight,
            y: Math.max(ay, by),
            width: bx - aRight,
            height: yOverlap,
            kind: "gap",
            axis: "x",
          };
        } else if (bRight < ax) {
          gap = {
            x: bRight,
            y: Math.max(ay, by),
            width: ax - bRight,
            height: yOverlap,
            kind: "gap",
            axis: "x",
          };
        }
        if (gap && gap.width >= 1 && !gapBlockedByZone(gap, zones, i, j)) {
          gaps.push(gap);
        }
      }

      const xOverlap = Math.min(aRight, bRight) - Math.max(ax, bx);
      if (xOverlap > 0) {
        /** @type {DimRegion | null} */
        let gap = null;
        if (aBottom < by) {
          gap = {
            x: Math.max(ax, bx),
            y: aBottom,
            width: xOverlap,
            height: by - aBottom,
            kind: "gap",
            axis: "y",
          };
        } else if (bBottom < ay) {
          gap = {
            x: Math.max(ax, bx),
            y: bBottom,
            width: xOverlap,
            height: ay - bBottom,
            kind: "gap",
            axis: "y",
          };
        }
        if (gap && gap.height >= 1 && !gapBlockedByZone(gap, zones, i, j)) {
          gaps.push(gap);
        }
      }
    }
  }
  return gaps;
}

/**
 * @param {string} label
 * @param {number} dimensionSize
 */
function dimensionLabelPad(label, dimensionSize) {
  return Math.max(dimensionSize * 2.4, dimensionSize * 0.32 * Math.max(4, label.length));
}

/**
 * Outside dimension lines for overlap/gap strips (same style as overall size).
 * @param {DimRegion[]} regions
 * @param {{
 *   mapWidth: number,
 *   mapHeight: number,
 *   dimensionGap: number,
 *   extensionGap: number,
 *   stroke: number,
 *   dimensionSize: number,
 *   arrowId: string,
 *   formatLength: (px: number) => string,
 * }} style
 * @returns {string[]}
 */
function buildRegionDimensionParts(regions, style) {
  const {
    mapWidth,
    mapHeight,
    dimensionGap,
    extensionGap,
    stroke,
    dimensionSize,
    arrowId,
    formatLength,
  } = style;
  /** @type {string[]} */
  const parts = [];
  let bottomLane = 0;
  let rightLane = 0;

  // axis "x" = measure width below; axis "y" = measure height on the right.
  const bottom = regions
    .filter((region) => region.axis === "x")
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const right = regions
    .filter((region) => region.axis === "y")
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (const region of bottom) {
    const rw = Math.round(region.width);
    if (rw < 1) continue;
    const lane = bottomLane++;
    const dimY = mapHeight + dimensionGap + lane * (dimensionSize * 2.2);
    const x1 = region.x;
    const x2 = region.x + region.width;
    const midX = (x1 + x2) / 2;
    const label = formatLength(region.width);
    const labelPad = dimensionLabelPad(label, dimensionSize);
    parts.push(
      `<line x1="${x1}" y1="${mapHeight + extensionGap}" x2="${x1}" y2="${dimY + extensionGap}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
      `<line x1="${x2}" y1="${mapHeight + extensionGap}" x2="${x2}" y2="${dimY + extensionGap}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
      `<line x1="${x1}" y1="${dimY}" x2="${x2}" y2="${dimY}" stroke="#111" stroke-width="${stroke}" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})" />`,
      `<rect x="${midX - labelPad}" y="${dimY - dimensionSize * 0.7}" width="${labelPad * 2}" height="${dimensionSize * 1.4}" fill="#fff" />`,
      `<text x="${midX}" y="${dimY + dimensionSize * 0.34}" text-anchor="middle" font-size="${dimensionSize}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(label)}</text>`
    );
  }

  for (const region of right) {
    const rh = Math.round(region.height);
    if (rh < 1) continue;
    const lane = rightLane++;
    const dimX = mapWidth + dimensionGap + lane * (dimensionSize * 2.2);
    const y1 = region.y;
    const y2 = region.y + region.height;
    const midY = (y1 + y2) / 2;
    const label = formatLength(region.height);
    const labelPad = dimensionLabelPad(label, dimensionSize);
    parts.push(
      `<line x1="${mapWidth + extensionGap}" y1="${y1}" x2="${dimX + extensionGap}" y2="${y1}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
      `<line x1="${mapWidth + extensionGap}" y1="${y2}" x2="${dimX + extensionGap}" y2="${y2}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
      `<line x1="${dimX}" y1="${y1}" x2="${dimX}" y2="${y2}" stroke="#111" stroke-width="${stroke}" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})" />`,
      `<g transform="translate(${dimX}, ${midY}) rotate(-90)">
        <rect x="${-labelPad}" y="${-dimensionSize * 0.7}" width="${labelPad * 2}" height="${dimensionSize * 1.4}" fill="#fff" />
        <text x="0" y="${dimensionSize * 0.34}" text-anchor="middle" font-size="${dimensionSize}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(label)}</text>
      </g>`
    );
  }

  return parts;
}

/**
 * Print-safe media world (surface or raster) with outer dimensions.
 * @param {{ width?: unknown, height?: unknown }} map
 * @param {object[]} zones
 * @param {{
 *   idPrefix?: string,
 *   showOverlapDimensions?: boolean,
 *   showGapDimensions?: boolean,
 *   showAnchors?: boolean,
 *   dimensionUnit?: "px" | "ft-in",
 *   ppi?: number | null,
 *   fontSizePt?: number,
 *   frameWIn?: number,
 *   frameHIn?: number,
 * }} [options]
 * @returns {{ svg: string, zoneCount: number } | null}
 */
export function buildMediaMapSvg(map, zones, options = {}) {
  const width = Math.max(1, Number(map?.width) || 0);
  const height = Math.max(1, Number(map?.height) || 0);
  if (!map || width < 1 || height < 1) return null;

  const zoneList = Array.isArray(zones) ? zones : [];
  const overlaps = options.showOverlapDimensions ? zoneOverlaps(zoneList) : [];
  const gaps = options.showGapDimensions ? zoneGaps(zoneList) : [];
  const dimRegions = [...overlaps, ...gaps];
  const showAnchors = options.showAnchors === true;
  const ppi = Number(options.ppi) || 0;
  const dimensionUnit =
    normalizeSurfaceDimensionUnit(options.dimensionUnit) === "ft-in" && ppi > 0
      ? "ft-in"
      : "px";
  /** @param {number} px */
  const formatLength = (px) => formatSurfaceLength(px, { unit: dimensionUnit, ppi });
  /** @param {number} x @param {number} y */
  const formatPoint = (x, y) => formatSurfacePoint(x, y, { unit: dimensionUnit, ppi });

  const idPrefix = String(options.idPrefix || "pw-media");
  const shortSide = Math.min(width, height);
  const margin = Math.max(80, shortSide * 0.16);
  const dimensionGap = margin * 0.58;
  const extensionGap = margin * 0.12;
  const stroke = Math.max(2, shortSide * 0.0025);
  const markerSize = Math.max(8, stroke * 3);
  const fontSizePt = normalizeFontSizePt(options.fontSizePt);
  const frameWIn = Number(options.frameWIn) || 0;
  const frameHIn = Number(options.frameHIn) || 0;
  const labelSize =
    frameWIn > 0 && frameHIn > 0
      ? fontSizePtToUserUnits(fontSizePt, {
          viewW: width + margin * 2,
          viewH: height + margin * 2,
          frameWIn,
          frameHIn,
        })
      : Math.max(14, Math.min(54, shortSide * 0.027));
  const dimensionSize = labelSize * 1.15;

  let bottomDimLanes = 0;
  let rightDimLanes = 0;
  for (const region of dimRegions) {
    if (region.axis === "x") bottomDimLanes += 1;
    else rightDimLanes += 1;
  }
  const marginLeft = margin;
  const marginTop = margin;
  const marginRight =
    margin +
    (rightDimLanes
      ? dimensionGap + (rightDimLanes - 1) * dimensionSize * 2.2 + dimensionSize * 1.2
      : 0);
  const marginBottom =
    margin +
    (bottomDimLanes
      ? dimensionGap + (bottomDimLanes - 1) * dimensionSize * 2.2 + dimensionSize * 1.2
      : 0);
  const viewX = -marginLeft;
  const viewY = -marginTop;
  const viewW = width + marginLeft + marginRight;
  const viewH = height + marginTop + marginBottom;
  const arrowId = `${idPrefix}-arrow`;
  const clipId = `${idPrefix}-clip`;
  const hatchId = `${idPrefix}-overlap-hatch`;
  const gapHatchId = `${idPrefix}-gap-hatch`;

  const parts = [
    `<defs>
      <marker id="${arrowId}" markerWidth="${markerSize}" markerHeight="${markerSize}" refX="${markerSize / 2}" refY="${markerSize / 2}" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M ${markerSize} 0 L 0 ${markerSize / 2} L ${markerSize} ${markerSize}" fill="none" stroke="#111" stroke-width="${Math.max(1.5, stroke * 0.75)}" />
      </marker>
      <clipPath id="${clipId}"><rect x="0" y="0" width="${width}" height="${height}" /></clipPath>
      <pattern id="${hatchId}" width="${stroke * 6}" height="${stroke * 6}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="${stroke * 6}" stroke="#111" stroke-width="${Math.max(1, stroke * 0.55)}" stroke-opacity="0.45" />
      </pattern>
      <pattern id="${gapHatchId}" width="${stroke * 6}" height="${stroke * 6}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="${stroke * 6}" stroke="#64748b" stroke-width="${Math.max(1, stroke * 0.45)}" stroke-opacity="0.4" />
      </pattern>
    </defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc" stroke="#111" stroke-width="${stroke * 1.5}" />`,
  ];

  for (const zone of zoneList) {
    const x = Number(zone?.x) || 0;
    const y = Number(zone?.y) || 0;
    const zoneW = Math.max(1, Number(zone?.width) || 1);
    const zoneH = Math.max(1, Number(zone?.height) || 1);
    const color = safeColor(zone?.color);
    const name = String(zone?.name ?? "Zone");
    const centerX = x + zoneW / 2;
    const centerY = y + zoneH / 2;
    const zoneLabelSize = Math.min(labelSize, Math.max(10, zoneH * 0.16));
    const outside = x < 0 || y < 0 || x + zoneW > width || y + zoneH > height;
    const sizeLabel = `${formatLength(zoneW)} × ${formatLength(zoneH)}`;
    const anchorSize = zoneLabelSize * 0.7;
    const showZoneAnchor =
      showAnchors && zoneW > anchorSize * 4 && zoneH > anchorSize * 2.4;
    const anchorPad = stroke + anchorSize * 0.5;

    parts.push(
      `<g clip-path="url(#${clipId})">
        <rect x="${x}" y="${y}" width="${zoneW}" height="${zoneH}" fill="${escapeXml(color)}" fill-opacity="0.2" stroke="${escapeXml(color)}" stroke-width="${stroke}"${outside ? ` stroke-dasharray="${stroke * 3} ${stroke * 2}"` : ""} />
        <text x="${centerX}" y="${centerY - zoneLabelSize * 0.15}" text-anchor="middle" font-size="${zoneLabelSize}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(name)}</text>
        <text x="${centerX}" y="${centerY + zoneLabelSize * 1.05}" text-anchor="middle" font-size="${zoneLabelSize * 0.78}" fill="#334155" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(sizeLabel)}</text>
        ${
          showZoneAnchor
            ? `<text x="${x + anchorPad}" y="${y + anchorPad + anchorSize * 0.85}" text-anchor="start" font-size="${anchorSize}" fill="#334155" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(formatPoint(x, y))}</text>`
            : ""
        }
      </g>`
    );
  }

  if (gaps.length) {
    const dash = Math.max(4, stroke * 2);
    for (const region of gaps) {
      parts.push(
        `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="url(#${gapHatchId})" stroke="#64748b" stroke-opacity="0.65" stroke-width="${Math.max(1, stroke * 0.55)}" stroke-dasharray="${dash} ${dash}" />`
      );
    }
  }

  if (overlaps.length) {
    const dash = Math.max(4, stroke * 2);
    for (const region of overlaps) {
      parts.push(
        `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="url(#${hatchId})" stroke="#111" stroke-opacity="0.55" stroke-width="${Math.max(1, stroke * 0.55)}" stroke-dasharray="${dash} ${dash}" />`
      );
    }
  }

  const widthLabel = formatLength(width);
  const widthPad = dimensionLabelPad(widthLabel, dimensionSize);
  const topY = -dimensionGap;
  parts.push(
    `<line x1="0" y1="${-extensionGap}" x2="0" y2="${topY - extensionGap}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
    `<line x1="${width}" y1="${-extensionGap}" x2="${width}" y2="${topY - extensionGap}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
    `<line x1="0" y1="${topY}" x2="${width}" y2="${topY}" stroke="#111" stroke-width="${stroke}" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})" />`,
    `<rect x="${width / 2 - widthPad}" y="${topY - dimensionSize * 0.7}" width="${widthPad * 2}" height="${dimensionSize * 1.4}" fill="#fff" />`,
    `<text x="${width / 2}" y="${topY + dimensionSize * 0.34}" text-anchor="middle" font-size="${dimensionSize}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(widthLabel)}</text>`
  );

  const heightLabel = formatLength(height);
  const heightPad = dimensionLabelPad(heightLabel, dimensionSize);
  const leftX = -dimensionGap;
  parts.push(
    `<line x1="${-extensionGap}" y1="0" x2="${leftX - extensionGap}" y2="0" stroke="#111" stroke-width="${stroke * 0.75}" />`,
    `<line x1="${-extensionGap}" y1="${height}" x2="${leftX - extensionGap}" y2="${height}" stroke="#111" stroke-width="${stroke * 0.75}" />`,
    `<line x1="${leftX}" y1="0" x2="${leftX}" y2="${height}" stroke="#111" stroke-width="${stroke}" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})" />`,
    `<g transform="translate(${leftX}, ${height / 2}) rotate(-90)">
      <rect x="${-heightPad}" y="${-dimensionSize * 0.7}" width="${heightPad * 2}" height="${dimensionSize * 1.4}" fill="#fff" />
      <text x="0" y="${dimensionSize * 0.34}" text-anchor="middle" font-size="${dimensionSize}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(heightLabel)}</text>
    </g>`
  );

  if (dimRegions.length) {
    parts.push(
      ...buildRegionDimensionParts(dimRegions, {
        mapWidth: width,
        mapHeight: height,
        dimensionGap,
        extensionGap,
        stroke,
        dimensionSize,
        arrowId,
        formatLength,
      })
    );
  }

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`,
    zoneCount: zoneList.length,
  };
}

/**
 * Static raster drawing with total pixel dimensions outside the raster.
 * @param {object} raster
 * @param {{ fontSizePt?: number, frameWIn?: number, frameHIn?: number }} [options]
 * @returns {{ svg: string, zoneCount: number } | null}
 */
export function buildRasterSvg(raster, options = {}) {
  return buildMediaMapSvg(raster, allRasterZones(raster), {
    idPrefix: `pw-raster-${String(raster?.id ?? "map").replace(/[^a-zA-Z0-9_-]/g, "")}`,
    fontSizePt: options.fontSizePt,
    frameWIn: options.frameWIn,
    frameHIn: options.frameHIn,
  });
}

/**
 * Static surface drawing with media zones.
 * @param {object} surface
 * @param {{
 *   showAnchors?: boolean,
 *   dimensionUnit?: "px" | "ft-in",
 *   ppi?: number | null,
 *   fontSizePt?: number,
 *   frameWIn?: number,
 *   frameHIn?: number,
 * }} [options]
 * @returns {{ svg: string, zoneCount: number } | null}
 */
export function buildSurfaceSvg(surface, options = {}) {
  return buildMediaMapSvg(surface, allSurfaceZones(surface), {
    idPrefix: `pw-surface-${String(surface?.id ?? "map").replace(/[^a-zA-Z0-9_-]/g, "")}`,
    showOverlapDimensions: true,
    showGapDimensions: true,
    showAnchors: options.showAnchors === true,
    dimensionUnit: options.dimensionUnit,
    ppi: options.ppi,
    fontSizePt: options.fontSizePt,
    frameWIn: options.frameWIn,
    frameHIn: options.frameHIn,
  });
}
