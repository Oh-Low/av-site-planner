import {
  formatDistance,
  getMetersPerPixel,
  routeLengthMeters,
} from "../groundplan-units.js?v=3";
import { DEFAULT_PALETTE_COLOR, normalizeHexColor } from "../shared/color-palette.js";
import { escapeXml } from "../shared/dom.js";
import { fontSizePtToUserUnits, normalizeFontSizePt } from "./font-scale.js?v=4";

const DEFAULT_MARKER_W = 120;
const DEFAULT_MARKER_H = 36;

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} GroundplanCrop
 */

/**
 * @param {unknown} raw
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {GroundplanCrop | null}
 */
export function normalizeGroundplanCrop(raw, imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth) || 0);
  const height = Math.max(1, Number(imageHeight) || 0);
  if (!raw || typeof raw !== "object" || width < 1 || height < 1) return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const x = Number(r.x);
  const y = Number(r.y);
  const w = Number(r.w);
  const h = Number(r.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  const minSize = Math.max(8, Math.min(width, height) * 0.02);
  const cropW = Math.min(width, Math.max(minSize, w));
  const cropH = Math.min(height, Math.max(minSize, h));
  const cropX = Math.min(Math.max(0, x), width - cropW);
  const cropY = Math.min(Math.max(0, y), height - cropH);
  if (
    cropX <= 0.5 &&
    cropY <= 0.5 &&
    cropW >= width - 1 &&
    cropH >= height - 1
  ) {
    return null;
  }
  return { x: cropX, y: cropY, w: cropW, h: cropH };
}

/**
 * Fit crop around places and routes with padding.
 * @param {Record<string, unknown> | null | undefined} groundplan
 * @param {number} [paddingRatio]
 * @returns {GroundplanCrop | null}
 */
export function computeGroundplanFitCrop(groundplan, paddingRatio = 0.08) {
  const gp = groundplan ?? null;
  if (!gp) return null;
  const imageWidth = Math.max(1, Number(gp.imageWidth) || 0);
  const imageHeight = Math.max(1, Number(gp.imageHeight) || 0);
  if (imageWidth < 1 || imageHeight < 1) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  /** @param {number} x @param {number} y */
  const include = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const marker of Array.isArray(gp.placeMarkers) ? gp.placeMarkers : []) {
    const w = Math.max(48, Number(marker?.width) || DEFAULT_MARKER_W);
    const h = Math.max(24, Number(marker?.height) || DEFAULT_MARKER_H);
    const cx = Number(marker?.x) || 0;
    const cy = Number(marker?.y) || 0;
    include(cx - w / 2, cy - h / 2);
    include(cx + w / 2, cy + h / 2);
  }

  for (const route of Array.isArray(gp.cableRoutes) ? gp.cableRoutes : []) {
    for (const point of Array.isArray(route?.points) ? route.points : []) {
      include(Number(point?.x) || 0, Number(point?.y) || 0);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const padX = Math.max(24, (maxX - minX) * paddingRatio, imageWidth * 0.04);
  const padY = Math.max(24, (maxY - minY) * paddingRatio, imageHeight * 0.04);
  return normalizeGroundplanCrop(
    {
      x: minX - padX,
      y: minY - padY,
      w: maxX - minX + padX * 2,
      h: maxY - minY + padY * 2,
    },
    imageWidth,
    imageHeight
  );
}

/**
 * @param {GroundplanCrop | null | undefined} crop
 * @param {number} imageWidth
 * @param {number} imageHeight
 */
export function cropToPercents(crop, imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth) || 1);
  const height = Math.max(1, Number(imageHeight) || 1);
  if (!crop) {
    return { x: 0, y: 0, w: 100, h: 100 };
  }
  return {
    x: roundCropPercent((crop.x / width) * 100),
    y: roundCropPercent((crop.y / height) * 100),
    w: roundCropPercent((crop.w / width) * 100),
    h: roundCropPercent((crop.h / height) * 100),
  };
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} percents
 * @param {number} imageWidth
 * @param {number} imageHeight
 */
export function percentsToCrop(percents, imageWidth, imageHeight) {
  const width = Math.max(1, Number(imageWidth) || 0);
  const height = Math.max(1, Number(imageHeight) || 0);
  return normalizeGroundplanCrop(
    {
      x: (Number(percents.x) / 100) * width,
      y: (Number(percents.y) / 100) * height,
      w: (Number(percents.w) / 100) * width,
      h: (Number(percents.h) / 100) * height,
    },
    width,
    height
  );
}

/** @param {number} value */
function roundCropPercent(value) {
  return Math.round(value * 10) / 10;
}

/**
 * @param {GroundplanCrop} startCrop
 * @param {string} handle
 * @param {{ x: number, y: number }} startPt
 * @param {{ x: number, y: number }} currentPt
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {GroundplanCrop | null}
 */
export function resizeCropByHandle(
  startCrop,
  handle,
  startPt,
  currentPt,
  imageWidth,
  imageHeight
) {
  const dx = currentPt.x - startPt.x;
  const dy = currentPt.y - startPt.y;
  let { x, y, w, h } = startCrop;
  if (handle.includes("e")) w = startCrop.w + dx;
  if (handle.includes("s")) h = startCrop.h + dy;
  if (handle.includes("w")) {
    w = startCrop.w - dx;
    x = startCrop.x + dx;
  }
  if (handle.includes("n")) {
    h = startCrop.h - dy;
    y = startCrop.y + dy;
  }
  return normalizeGroundplanCrop({ x, y, w, h }, imageWidth, imageHeight);
}

/**
 * Full-image crop rect used when editing with no crop set yet.
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @returns {GroundplanCrop}
 */
export function fullImageCrop(imageWidth, imageHeight) {
  return {
    x: 0,
    y: 0,
    w: Math.max(1, Number(imageWidth) || 1),
    h: Math.max(1, Number(imageHeight) || 1),
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} groundplan
 * @param {{ id: string, name: string }[]} places
 * @param {{
 *   crop?: GroundplanCrop | null,
 *   showCropEditor?: boolean,
 *   fontSizePt?: number,
 *   frameWIn?: number,
 *   frameHIn?: number,
 * }} [options]
 * @returns {{ svg: string, routeCount: number, placeCount: number, cropped: boolean, imageWidth: number, imageHeight: number } | null}
 */
export function buildGroundplanSvg(groundplan, places = [], options = {}) {
  const gp = groundplan ?? null;
  if (!gp) return null;

  const imageDataUrl = typeof gp.imageDataUrl === "string" ? gp.imageDataUrl : "";
  const imageWidth = Math.max(1, Number(gp.imageWidth) || 0);
  const imageHeight = Math.max(1, Number(gp.imageHeight) || 0);
  if (!imageDataUrl || imageWidth < 1 || imageHeight < 1) return null;

  const storedCrop = normalizeGroundplanCrop(options.crop, imageWidth, imageHeight);
  const showCropEditor = options.showCropEditor === true;
  const editorCrop = showCropEditor
    ? storedCrop ?? fullImageCrop(imageWidth, imageHeight)
    : null;
  const viewCrop = showCropEditor ? null : storedCrop;
  const viewX = viewCrop?.x ?? 0;
  const viewY = viewCrop?.y ?? 0;
  const viewW = viewCrop?.w ?? imageWidth;
  const viewH = viewCrop?.h ?? imageHeight;

  const placeName = (id) => places.find((p) => p.id === id)?.name ?? "Place";
  const markers = Array.isArray(gp.placeMarkers) ? gp.placeMarkers : [];
  const routes = Array.isArray(gp.cableRoutes) ? gp.cableRoutes : [];
  const scale =
    gp.scale && typeof gp.scale === "object"
      ? /** @type {{ pointA: {x:number,y:number}|null, pointB: {x:number,y:number}|null, distanceMeters: number|null, unit?: string }} */ (
          gp.scale
        )
      : null;
  const unit = scale?.unit === "imperial" ? "imperial" : "metric";
  const mpp = scale ? getMetersPerPixel(scale) : null;

  const fontSizePt = normalizeFontSizePt(options.fontSizePt);
  const frameWIn = Number(options.frameWIn) || 0;
  const frameHIn = Number(options.frameHIn) || 0;
  const shortSide = Math.min(viewW, viewH);
  const stroke = Math.max(2.5, shortSide * 0.0035);
  const labelSize =
    frameWIn > 0 && frameHIn > 0
      ? fontSizePtToUserUnits(fontSizePt, { viewW, viewH, frameWIn, frameHIn })
      : Math.max(12, Math.min(28, shortSide * 0.018));

  /** @type {string[]} */
  const parts = [
    `<image href="${escapeXml(imageDataUrl)}" x="0" y="0" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="none" />`,
  ];

  for (const route of routes) {
    const points = Array.isArray(route?.points) ? route.points : [];
    if (points.length < 2) continue;
    const d = points
      .map((p, i) => {
        const x = Number(p?.x) || 0;
        const y = Number(p?.y) || 0;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    const color = normalizeHexColor(route?.color ?? DEFAULT_PALETTE_COLOR);
    parts.push(
      `<path d="${d}" fill="none" stroke="${escapeXml(color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" />`
    );

    const meters = routeLengthMeters(points, mpp);
    const lengthLabel =
      meters == null ? "Set scale" : formatDistance(meters, unit);
    const title = `${placeName(String(route.fromPlaceId ?? ""))} → ${placeName(
      String(route.toPlaceId ?? "")
    )}`;
    const mid =
      typeof route.labelX === "number" &&
      Number.isFinite(route.labelX) &&
      typeof route.labelY === "number" &&
      Number.isFinite(route.labelY)
        ? { x: route.labelX, y: route.labelY }
        : {
            x: Number(points[Math.floor(points.length / 2)]?.x) || 0,
            y: (Number(points[Math.floor(points.length / 2)]?.y) || 0) - labelSize,
          };
    parts.push(
      `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" font-size="${labelSize}" font-weight="700" fill="#0f172a" stroke="#fff" stroke-width="${Math.max(2, stroke * 0.6)}" paint-order="stroke" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(`${title}: ${lengthLabel}`)}</text>`
    );
  }

  for (const marker of markers) {
    const w = Math.max(48, Number(marker?.width) || DEFAULT_MARKER_W);
    const h = Math.max(24, Number(marker?.height) || DEFAULT_MARKER_H);
    const cx = Number(marker?.x) || 0;
    const cy = Number(marker?.y) || 0;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const color = normalizeHexColor(marker?.color ?? DEFAULT_PALETTE_COLOR);
    const shape = normalizePlaceShape(marker?.shape);
    const name = placeName(String(marker?.placeId ?? ""));
    const fontSize =
      frameWIn > 0 && frameHIn > 0
        ? labelSize
        : Math.max(10, Math.min(18, h * 0.42));

    parts.push(placeShapeMarkup(shape, x, y, w, h, color, stroke * 0.65));
    parts.push(
      `<text x="${cx}" y="${cy + fontSize * 0.35}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="#0f172a" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(name)}</text>`
    );
  }

  if (editorCrop) {
    parts.push(cropEditorMarkup(editorCrop, imageWidth, imageHeight));
  }

  // Clip to the viewBox rect. With preserveAspectRatio=meet, content outside the
  // viewBox can otherwise paint into letterbox gutters — which makes left/right
  // crops look ignored when the crop is taller than the container aspect.
  const clipId = "pw-gp-view-clip";
  const body = `<defs><clipPath id="${clipId}"><rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" /></clipPath></defs><g clip-path="url(#${clipId})">${parts.join("")}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" overflow="hidden" data-gp-image-width="${imageWidth}" data-gp-image-height="${imageHeight}" data-crop-width="${imageWidth}" data-crop-height="${imageHeight}">${body}</svg>`;
  return {
    svg,
    routeCount: routes.filter((r) => Array.isArray(r?.points) && r.points.length >= 2).length,
    placeCount: markers.length,
    cropped: Boolean(storedCrop),
    imageWidth,
    imageHeight,
  };
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} crop
 * @param {number} contentWidth
 * @param {number} contentHeight
 */
export function buildCropEditorMarkup(crop, contentWidth, contentHeight) {
  const handle = Math.max(22, Math.min(contentWidth, contentHeight) * 0.028);
  const half = handle / 2;
  const stroke = Math.max(2, handle * 0.18);
  const { x, y, w, h } = crop;
  const handles = [
    ["nw", x, y],
    ["n", x + w / 2, y],
    ["ne", x + w, y],
    ["e", x + w, y + h / 2],
    ["se", x + w, y + h],
    ["s", x + w / 2, y + h],
    ["sw", x, y + h],
    ["w", x, y + h / 2],
  ];
  const handleRects = handles
    .map(
      ([name, cx, cy]) =>
        `<rect class="pw-crop-handle" data-crop-handle="${name}" x="${cx - half}" y="${cy - half}" width="${handle}" height="${handle}" rx="${Math.max(2, half * 0.25)}" />`
    )
    .join("");

  return `<g class="pw-crop-editor">
    <path class="pw-crop-mask" pointer-events="none" fill-rule="evenodd" d="M0 0H${contentWidth}V${contentHeight}H0Z M${x} ${y}H${x + w}V${y + h}H${x}Z" />
    <rect class="pw-crop-frame" pointer-events="none" x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke-width="${stroke}" />
    ${handleRects}
  </g>`;
}

/**
 * @param {GroundplanCrop} crop
 * @param {number} imageWidth
 * @param {number} imageHeight
 * @deprecated Prefer buildCropEditorMarkup
 */
function cropEditorMarkup(crop, imageWidth, imageHeight) {
  return buildCropEditorMarkup(crop, imageWidth, imageHeight);
}

/** @param {unknown} value */
function normalizePlaceShape(value) {
  if (value === "slant" || value === "pill" || value === "triangle" || value === "rect") {
    return value;
  }
  if (value === "diamond") return "slant";
  if (value === "circle") return "pill";
  return "rect";
}

/**
 * @param {string} shape
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} color
 * @param {number} stroke
 */
function placeShapeMarkup(shape, x, y, w, h, color, stroke) {
  const fill = "rgba(255,255,255,0.82)";
  if (shape === "pill") {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" fill="${fill}" stroke="${escapeXml(color)}" stroke-width="${stroke}" />`;
  }
  if (shape === "triangle") {
    const points = `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${escapeXml(color)}" stroke-width="${stroke}" />`;
  }
  if (shape === "slant") {
    const inset = Math.min(w, h) * 0.1;
    const points = `${x + inset},${y} ${x + w},${y} ${x + w - inset},${y + h} ${x},${y + h}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${escapeXml(color)}" stroke-width="${stroke}" />`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ry="4" fill="${fill}" stroke="${escapeXml(color)}" stroke-width="${stroke}" />`;
}
