import { getCalculatorExport } from "./calculator-instances.js";
import { gridDataLinePixelRects, gridPixelSize } from "./led-calculator.js?v=54";
import { screenPixelSize, screenProjectorPixelRects } from "./projector-calculator.js?v=6";
import { bindSidebarTabs } from "./shared/calc-shell.js";
import { deepClone } from "./shared/clone.js";
import {
  COLOR_PALETTE,
  DEFAULT_PALETTE_COLOR,
  bindColorSwatchButtons,
  closeColorPalettePopover,
  ensureColorPalettePopover,
  renderColorSwatchButton,
} from "./shared/color-palette.js";
import { escapeXml } from "./shared/dom.js";
import { uid } from "./shared/id.js";
import { createListNameEditor } from "./shared/inline-editor.js";
import { evaluateMathExpression } from "./shared/math-expression.js";
import { createSvgViewBoxPanZoom } from "./shared/pan-zoom.js";

/** @typedef {{ type: "led" | "projector", id: string }} ImportSource */
/** @typedef {{ id: string, name: string, x: number, y: number, width: number, height: number, color: string, source?: ImportSource | null }} MediaZone */
/** @typedef {{ id: string, name: string, width: number, height: number, zones: MediaZone[], source?: ImportSource | null, pattern?: object }} Surface */
/** Output group: imported LED walls become a group of "ports" (one zone per data line); projection screens a group with one zone per projector. */
/** @typedef {{ id: string, name: string, zones: MediaZone[], source?: ImportSource | null }} OutputGroup */
/** @typedef {{ id: string, name: string, width: number, height: number, groups: OutputGroup[], zones: MediaZone[], source?: ImportSource | null, pattern?: object }} Raster */

const DEFAULT_SURFACE_WIDTH = 3840;
const DEFAULT_SURFACE_HEIGHT = 2160;
const MAX_SURFACE_DIMENSION = 65536;


/** @param {unknown} value @param {number} fallback @param {number} [min] @param {number} [max] */
function toFiniteNumber(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Parse a user-typed field that may contain math (e.g. "4800+256", "3840/2").
 * An emptied field reads as 0; the fallback only covers incomplete or invalid
 * expressions (e.g. "3840+" mid-typing).
 * @param {string} text @param {number} fallback @param {number} [min] @param {number} [max]
 */
function parseFieldValue(text, fallback, min = -Infinity, max = Infinity) {
  if (!String(text ?? "").trim()) return 0;
  const n = evaluateMathExpression(text);
  if (n === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Mix a hex color toward white to get the inside-stroke color. */
export function lightenColor(hex, amount = 0.35) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Pick black or white text for readability on a hex background. */
function contrastText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const luminance =
    (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luminance > 0.6 ? "#0f172a" : "#fff";
}

/** @returns {MediaZone} */
function normalizeZone(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("zone"),
    name:
      typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Zone ${index + 1}`,
    x: toFiniteNumber(raw?.x, 0),
    y: toFiniteNumber(raw?.y, 0),
    width: toFiniteNumber(raw?.width, 1920, 1, MAX_SURFACE_DIMENSION),
    height: toFiniteNumber(raw?.height, 1080, 1, MAX_SURFACE_DIMENSION),
    color: /^#[0-9a-f]{6}$/i.test(String(raw?.color))
      ? String(raw.color).toLowerCase()
      : COLOR_PALETTE[index % COLOR_PALETTE.length],
    source: normalizeImportSource(raw?.source),
  };
}

/** @returns {Surface} */
function normalizeSurface(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("surface"),
    name:
      typeof raw?.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : `Surface ${index + 1}`,
    width: toFiniteNumber(raw?.width, DEFAULT_SURFACE_WIDTH, 1, MAX_SURFACE_DIMENSION),
    height: toFiniteNumber(raw?.height, DEFAULT_SURFACE_HEIGHT, 1, MAX_SURFACE_DIMENSION),
    zones: Array.isArray(raw?.zones) ? raw.zones.map((z, i) => normalizeZone(z, i)) : [],
    source: normalizeImportSource(raw?.source),
    ...(raw?.pattern ? { pattern: normalizePatternSettings(raw.pattern) } : {}),
  };
}

/** @returns {OutputGroup} */
function normalizeOutputGroup(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("ogroup"),
    name:
      typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Group ${index + 1}`,
    zones: Array.isArray(raw?.zones) ? raw.zones.map((z, i) => normalizeZone(z, i)) : [],
    source: normalizeImportSource(raw?.source),
  };
}

/** @returns {Raster} */
function normalizeRaster(raw, index) {
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : uid("raster"),
    name:
      typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Raster ${index + 1}`,
    width: toFiniteNumber(raw?.width, DEFAULT_SURFACE_WIDTH, 1, MAX_SURFACE_DIMENSION),
    height: toFiniteNumber(raw?.height, DEFAULT_SURFACE_HEIGHT, 1, MAX_SURFACE_DIMENSION),
    groups: Array.isArray(raw?.groups) ? raw.groups.map((g, i) => normalizeOutputGroup(g, i)) : [],
    zones: Array.isArray(raw?.zones) ? raw.zones.map((z, i) => normalizeZone(z, i)) : [],
    source: normalizeImportSource(raw?.source),
    ...(raw?.pattern ? { pattern: normalizePatternSettings(raw.pattern) } : {}),
  };
}

/** All zones on a raster, grouped ones first, flattened for preview/overlaps. */
function rasterAllZones(raster) {
  return [...raster.groups.flatMap((group) => group.zones), ...raster.zones];
}

/**
 * Pairwise intersections between zones, used to highlight overlapping regions
 * in the preview.
 * @param {MediaZone[]} zones
 * @returns {{ x: number, y: number, width: number, height: number }[]}
 */
function zoneOverlaps(zones) {
  const overlaps = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i];
      const b = zones[j];
      const x1 = Math.max(a.x, b.x);
      const y1 = Math.max(a.y, b.y);
      const x2 = Math.min(a.x + a.width, b.x + b.width);
      const y2 = Math.min(a.y + a.height, b.y + b.height);
      if (x2 > x1 && y2 > y1) {
        overlaps.push({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
      }
    }
  }
  return overlaps;
}

/**
 * Parts of each zone lying outside the world bounds (0,0 → w,h), decomposed
 * into non-overlapping strips: full-height left/right, then top/bottom
 * limited to the zone's horizontal span inside the world.
 * @param {number} w @param {number} h @param {MediaZone[]} zones
 * @returns {{ x: number, y: number, width: number, height: number }[]}
 */
function offWorldRegions(w, h, zones) {
  const regions = [];
  for (const zone of zones) {
    const left = zone.x;
    const top = zone.y;
    const right = zone.x + zone.width;
    const bottom = zone.y + zone.height;
    if (left < 0) {
      regions.push({ x: left, y: top, width: Math.min(zone.width, -left), height: zone.height });
    }
    if (right > w) {
      const x0 = Math.max(left, w);
      regions.push({ x: x0, y: top, width: right - x0, height: zone.height });
    }
    const midX0 = Math.max(left, 0);
    const midX1 = Math.min(right, w);
    if (midX1 > midX0) {
      if (top < 0) {
        regions.push({ x: midX0, y: top, width: midX1 - midX0, height: Math.min(zone.height, -top) });
      }
      if (bottom > h) {
        const y0 = Math.max(top, h);
        regions.push({ x: midX0, y: y0, width: midX1 - midX0, height: bottom - y0 });
      }
    }
  }
  return regions;
}

/**
 * SVG markup for a pixel world: the world rect, every zone with inside
 * strokes and labels, a hatched highlight over overlapping regions, and a
 * red/black hatch over zone parts that fall outside the world bounds.
 * Shared by the Media (surface) and Output (raster) previews.
 * @param {number} w @param {number} h
 * @param {MediaZone[]} zones
 * @param {{ name: boolean, resolution: boolean, anchor: boolean }} labels
 * @param {string} patternKey Unique per SVG element so hatch pattern ids don't collide.
 * @param {string|null} [selectedZoneId] Zone to draw a selection outline around.
 */
function buildWorldSvg(w, h, zones, labels, patternKey, selectedZoneId = null) {
  // Stroke thickness in world pixels, sized to stay visible at typical zoom.
  const stroke = Math.max(2, Math.round(Math.min(w, h) * 0.008));
  const parts = [];

  // World border is inset like the zone strokes so nothing is drawn outside
  // the world's stated pixel bounds and flush zones align with it exactly.
  const worldStroke = Math.max(1, stroke / 2);
  parts.push(`<rect class="cm-world-rect" x="0" y="0" width="${w}" height="${h}" fill="#0f172a" />`);
  parts.push(
    `<rect class="cm-world-border" x="${worldStroke / 2}" y="${worldStroke / 2}" width="${Math.max(0, w - worldStroke)}" height="${Math.max(0, h - worldStroke)}" fill="none" stroke="#334155" stroke-width="${worldStroke}" />`
  );

  // Semi-transparent fills keep zones underneath visible where they overlap.
  const overlaps = zoneOverlaps(zones);
  const zoneFillOpacity = overlaps.length ? 0.72 : 1;

  for (const zone of zones) {
    // Inset the rect by half the stroke so the stroke sits entirely inside
    // the zone's stated dimensions rather than straddling the edge.
    const sw = Math.min(stroke, zone.width / 2, zone.height / 2);
    const x = zone.x + sw / 2;
    const y = zone.y + sw / 2;
    const zw = Math.max(0, zone.width - sw);
    const zh = Math.max(0, zone.height - sw);
    parts.push(
      `<rect class="cm-zone-rect" data-zone-id="${zone.id}" x="${x}" y="${y}" width="${zw}" height="${zh}" fill="${escapeXml(zone.color)}" fill-opacity="${zoneFillOpacity}" stroke="${escapeXml(lightenColor(zone.color))}" stroke-width="${sw}" />`
    );

    const fontSize = Math.max(12, Math.min(zone.height * 0.22, Math.min(w, h) * 0.035));
    const textColor = contrastText(zone.color);

    /** @type {{ text: string, size: number, cls: string }[]} */
    const centeredLines = [];
    if (labels.name) {
      centeredLines.push({ text: zone.name, size: fontSize, cls: "cm-zone-label" });
    }
    if (labels.resolution) {
      centeredLines.push({
        text: `${zone.width} × ${zone.height}`,
        size: fontSize * 0.75,
        cls: "cm-zone-label cm-zone-label-size",
      });
    }

    if (centeredLines.length && zone.width > fontSize * 2 && zone.height > fontSize * 2.6) {
      const cx = zone.x + zone.width / 2;
      const cy = zone.y + zone.height / 2;
      const gap = fontSize * 0.3;
      const totalH =
        centeredLines.reduce((sum, line) => sum + line.size, 0) +
        gap * (centeredLines.length - 1);
      let baseline = cy - totalH / 2;
      for (const line of centeredLines) {
        baseline += line.size;
        parts.push(
          `<text class="${line.cls}" x="${cx}" y="${baseline - line.size * 0.18}" text-anchor="middle" font-size="${line.size}" fill="${textColor}">${escapeXml(line.text)}</text>`
        );
        baseline += gap;
      }
    }

    if (labels.anchor) {
      const anchorSize = fontSize * 0.7;
      if (zone.width > anchorSize * 4 && zone.height > anchorSize * 2.4) {
        const pad = sw + anchorSize * 0.5;
        parts.push(
          `<text class="cm-zone-label cm-zone-label-anchor" x="${zone.x + pad}" y="${zone.y + pad + anchorSize * 0.85}" text-anchor="start" font-size="${anchorSize}" fill="${textColor}">${zone.x}, ${zone.y}</text>`
        );
      }
    }
  }

  // Hatch each overlapping region on top of the zones and label its pixel size.
  if (overlaps.length) {
    const patternId = `cm-overlap-hatch-${patternKey}`;
    const hatch = Math.max(6, Math.round(Math.min(w, h) * 0.012));
    parts.unshift(
      `<defs><pattern id="${patternId}" width="${hatch}" height="${hatch}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${hatch}" height="${hatch}" fill="rgba(255,255,255,0.08)" /><rect width="${Math.max(2, Math.round(hatch / 3))}" height="${hatch}" fill="rgba(255,255,255,0.3)" /></pattern></defs>`
    );
    const dash = Math.max(4, stroke * 2);
    for (const region of overlaps) {
      parts.push(
        `<rect class="cm-overlap-region" x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="url(#${patternId})" stroke="#f8fafc" stroke-opacity="0.85" stroke-width="${Math.max(1, stroke / 2)}" stroke-dasharray="${dash} ${dash}" />`
      );
      const overlapFont = Math.max(
        11,
        Math.min(region.height * 0.4, region.width * 0.16, Math.min(w, h) * 0.028)
      );
      if (region.width > overlapFont * 3.5 && region.height > overlapFont * 1.6) {
        parts.push(
          `<text class="cm-zone-label cm-overlap-label" paint-order="stroke" font-weight="700" font-family="system-ui, sans-serif" x="${region.x + region.width / 2}" y="${region.y + region.height / 2 + overlapFont * 0.35}" text-anchor="middle" font-size="${overlapFont}" fill="#f8fafc" stroke="rgba(15, 23, 42, 0.7)" stroke-width="${overlapFont * 0.12}">${Math.round(region.width)} × ${Math.round(region.height)}</text>`
        );
      }
    }
  }

  // Red/black hatch over any zone parts hanging off the world.
  const offWorld = offWorldRegions(w, h, zones);
  if (offWorld.length) {
    const oobPatternId = `cm-oob-hatch-${patternKey}`;
    const hatch = Math.max(6, Math.round(Math.min(w, h) * 0.012));
    parts.unshift(
      `<defs><pattern id="${oobPatternId}" width="${hatch}" height="${hatch}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${hatch}" height="${hatch}" fill="rgba(239,68,68,0.75)" /><rect width="${Math.max(2, Math.round(hatch / 3))}" height="${hatch}" fill="rgba(0,0,0,0.8)" /></pattern></defs>`
    );
    for (const region of offWorld) {
      parts.push(
        `<rect class="cm-oob-region" x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" fill="url(#${oobPatternId})" stroke="#ef4444" stroke-width="${Math.max(1, stroke / 2)}" />`
      );
    }
  }

  // Selection outline drawn last so it stays visible above the overlays.
  // Inset inside the zone so it never clips at the world edge.
  const selected = selectedZoneId ? zones.find((zone) => zone.id === selectedZoneId) : null;
  if (selected) {
    const dash = Math.max(4, stroke * 2);
    const sw = Math.min(stroke, selected.width / 2, selected.height / 2);
    parts.push(
      `<rect class="cm-selection-outline" x="${selected.x + sw / 2}" y="${selected.y + sw / 2}" width="${Math.max(0, selected.width - sw)}" height="${Math.max(0, selected.height - sw)}" fill="none" stroke="#38bdf8" stroke-width="${sw}" stroke-dasharray="${dash} ${dash}" />`
    );
  }

  return parts.join("");
}

/** @param {unknown} raw @returns {ImportSource | null} */
function normalizeImportSource(raw) {
  const type = raw?.type;
  if ((type === "led" || type === "projector") && typeof raw.id === "string") {
    return { type, id: raw.id };
  }
  return null;
}

/** Per-surface/raster pattern configuration (everything but which source is selected). */
/** @typedef {{ scope: "source" | "zones", type: "grid" | "bars" | "gradient" | "alignment", gridSize: number, tileMode: "custom" | "led", tileWallId: string | null, tileW: number, tileH: number, tileColorA: string, tileColorB: string, showZones: boolean, showLabels: boolean, showCenter: boolean }} PatternSettings */

/** Which source the Test Patterns tab is looking at; settings live on the source itself. */
/** @typedef {{ sourceType: "surface" | "raster", sourceId: string | null }} TestPatternSelection */

/** @param {unknown} raw @returns {PatternSettings} */
function normalizePatternSettings(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  return {
    scope: r.scope === "zones" ? "zones" : "source",
    type: ["grid", "bars", "gradient", "alignment"].includes(r.type) ? r.type : "grid",
    gridSize: toFiniteNumber(r.gridSize, 100, 8, 4096),
    tileMode: r.tileMode === "led" ? "led" : "custom",
    tileWallId: typeof r.tileWallId === "string" ? r.tileWallId : null,
    tileW: toFiniteNumber(r.tileW, 168, 8, 4096),
    tileH: toFiniteNumber(r.tileH, 168, 8, 4096),
    tileColorA: typeof r.tileColorA === "string" ? r.tileColorA : "#ff0000",
    tileColorB: typeof r.tileColorB === "string" ? r.tileColorB : "#000000",
    showZones: r.showZones !== false,
    showLabels: r.showLabels !== false,
    showCenter: r.showCenter !== false,
  };
}

/** @param {unknown} raw @returns {TestPatternSelection} */
function normalizeTestPattern(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  return {
    sourceType: r.sourceType === "raster" ? "raster" : "surface",
    sourceId: typeof r.sourceId === "string" ? r.sourceId : null,
  };
}

/**
 * Pattern settings for a surface/raster, created on first access so every
 * creation path (new, imported, loaded) gets defaults without opting in.
 * @param {{ pattern?: PatternSettings }} source
 */
function ensurePattern(source) {
  if (!source.pattern) source.pattern = normalizePatternSettings(null);
  return source.pattern;
}

/** Shared gradient band defs, emitted once per pattern SVG and referenced by id. */
const TP_GRADIENT_BANDS = [
  { id: "cm-tp-grad-gray", to: "#ffffff" },
  { id: "cm-tp-grad-red", to: "#ff0000" },
  { id: "cm-tp-grad-green", to: "#00ff00" },
  { id: "cm-tp-grad-blue", to: "#0000ff" },
];

/**
 * Pattern body for a w×h region anchored at 0,0 — used for the whole
 * source or nested per zone. Gradient fills reference TP_GRADIENT_BANDS
 * defs emitted by buildTestPatternSvg.
 * @param {number} w @param {number} h
 * @param {PatternSettings} settings
 * @param {string} readout Text for the top-left dimension label (unescaped).
 * @returns {string[]}
 */
function buildTestPatternBody(w, h, settings, readout) {
  const parts = [];
  const minDim = Math.min(w, h);
  const thin = Math.max(1, Math.round(minDim * 0.0015));
  const thick = thin * 3;

  if (settings.type === "bars") {
    const colors = ["#ffffff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#0000ff", "#000000"];
    const barW = w / colors.length;
    colors.forEach((color, i) => {
      parts.push(`<rect x="${i * barW}" y="0" width="${barW}" height="${h}" fill="${color}" />`);
    });
  } else if (settings.type === "gradient") {
    const bandH = h / TP_GRADIENT_BANDS.length;
    TP_GRADIENT_BANDS.forEach((band, i) => {
      parts.push(`<rect x="0" y="${i * bandH}" width="${w}" height="${bandH}" fill="url(#${band.id})" />`);
    });
  } else if (settings.type === "alignment") {
    // Line grid on neutral gray with corner-to-corner diagonals.
    const step = Math.max(8, settings.gridSize);
    parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#3f4650" />`);
    for (let x = step; x < w; x += step) {
      const major = Math.round(x / step) % 4 === 0;
      parts.push(
        `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${major ? "#f8fafc" : "rgba(248,250,252,0.4)"}" stroke-width="${major ? thick / 2 : thin}" />`
      );
    }
    for (let y = step; y < h; y += step) {
      const major = Math.round(y / step) % 4 === 0;
      parts.push(
        `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${major ? "#f8fafc" : "rgba(248,250,252,0.4)"}" stroke-width="${major ? thick / 2 : thin}" />`
      );
    }
    parts.push(`<line x1="0" y1="0" x2="${w}" y2="${h}" stroke="rgba(248,250,252,0.5)" stroke-width="${thin}" />`);
    parts.push(`<line x1="0" y1="${h}" x2="${w}" y2="0" stroke="rgba(248,250,252,0.5)" stroke-width="${thin}" />`);
  } else {
    // LED tile checkerboard: two alternating colors at the emulated tile's
    // exact pixel size, so tile seams, swaps, and mismaps are obvious.
    const tileW = Math.max(1, Math.round(settings.tileW));
    const tileH = Math.max(1, Math.round(settings.tileH));
    const colors = [escapeXml(settings.tileColorA), escapeXml(settings.tileColorB)];
    const cols = Math.ceil(w / tileW);
    const rows = Math.ceil(h / tileH);
    const labelTiles = Math.min(tileW, tileH) >= 48;
    const tileFont = Math.max(10, Math.round(Math.min(tileW, tileH) * 0.18));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * tileW;
        const y = r * tileH;
        const tw = Math.min(tileW, w - x);
        const th = Math.min(tileH, h - y);
        if (tw <= 0 || th <= 0) continue;
        parts.push(
          `<rect x="${x}" y="${y}" width="${tw}" height="${th}" fill="${colors[(r + c) % 2]}" />`
        );
        if (labelTiles && tw > tileFont * 3 && th > tileFont * 1.8) {
          parts.push(
            `<text class="cm-zone-label cm-overlap-label" paint-order="stroke" font-weight="700" font-family="system-ui, sans-serif" x="${x + tileFont * 0.5}" y="${y + tileFont * 1.2}" text-anchor="start" font-size="${tileFont}" fill="#f8fafc" stroke="rgba(15,23,42,0.75)" stroke-width="${tileFont * 0.14}">${c + 1}-${r + 1}</text>`
          );
        }
      }
    }
  }

  // Center cross + circle.
  if (settings.showCenter && settings.type !== "bars" && settings.type !== "gradient") {
    parts.push(`<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="#22d3ee" stroke-width="${thin * 2}" />`);
    parts.push(`<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#22d3ee" stroke-width="${thin * 2}" />`);
    parts.push(
      `<circle cx="${w / 2}" cy="${h / 2}" r="${minDim / 4}" fill="none" stroke="#22d3ee" stroke-width="${thin * 2}" />`
    );
  }

  // Frame border: one pixel-perfect line just inside the edge.
  parts.push(
    `<rect x="${thick / 2}" y="${thick / 2}" width="${w - thick}" height="${h - thick}" fill="none" stroke="#f8fafc" stroke-width="${thick}" />`
  );

  // Dimension readout in the top-left.
  const dimFont = Math.max(14, Math.round(minDim * 0.04));
  parts.push(
    `<text class="cm-zone-label cm-overlap-label" paint-order="stroke" font-weight="700" font-family="system-ui, sans-serif" x="${dimFont * 0.8}" y="${dimFont * 1.6}" text-anchor="start" font-size="${dimFont}" fill="#f8fafc" stroke="rgba(15,23,42,0.75)" stroke-width="${dimFont * 0.12}">${escapeXml(readout)}</text>`
  );

  return parts;
}

/**
 * SVG body of a test pattern at native pixel size. Scope "source" paints one
 * pattern across the whole surface/raster; scope "zones" repeats the pattern
 * inside each zone (clipped to its bounds). Zone outlines/labels overlay both.
 * @param {number} w @param {number} h
 * @param {MediaZone[]} zones
 * @param {PatternSettings} settings
 */
function buildTestPatternSvg(w, h, zones, settings) {
  const parts = [];
  const minDim = Math.min(w, h);
  const thin = Math.max(1, Math.round(minDim * 0.0015));
  const thick = thin * 3;
  const perZone = settings.scope === "zones";

  parts.push(
    `<defs>${TP_GRADIENT_BANDS.map(
      (band) =>
        `<linearGradient id="${band.id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000000" /><stop offset="1" stop-color="${band.to}" /></linearGradient>`
    ).join("")}</defs>`
  );

  if (perZone) {
    // Dark backdrop so unused areas of the source read as "no signal".
    parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="#0b0e13" />`);
    zones.forEach((zone, index) => {
      if (zone.width <= 0 || zone.height <= 0) return;
      const clipId = `cm-tp-zone-clip-${index}`;
      parts.push(
        `<clipPath id="${clipId}"><rect x="0" y="0" width="${zone.width}" height="${zone.height}" /></clipPath>`
      );
      const readout = settings.showLabels
        ? `${zone.name} · ${zone.width} × ${zone.height}`
        : `${zone.width} × ${zone.height}`;
      const body = buildTestPatternBody(zone.width, zone.height, settings, readout);
      parts.push(
        `<g transform="translate(${zone.x}, ${zone.y})" clip-path="url(#${clipId})">${body.join("")}</g>`
      );
    });
    // Whole-source dimension readout so exports are still identifiable.
    const dimFont = Math.max(14, Math.round(minDim * 0.04));
    parts.push(
      `<text class="cm-zone-label cm-overlap-label" paint-order="stroke" font-weight="700" font-family="system-ui, sans-serif" x="${w - dimFont * 0.8}" y="${dimFont * 1.6}" text-anchor="end" font-size="${dimFont}" fill="#f8fafc" stroke="rgba(15,23,42,0.75)" stroke-width="${dimFont * 0.12}">${w} × ${h}</text>`
    );
  } else {
    parts.push(...buildTestPatternBody(w, h, settings, `${w} × ${h}`));
  }

  if (settings.showZones) {
    const dash = Math.max(6, thin * 5);
    for (const zone of zones) {
      const sw = Math.min(thick, zone.width / 2, zone.height / 2);
      parts.push(
        `<rect x="${zone.x + sw / 2}" y="${zone.y + sw / 2}" width="${Math.max(0, zone.width - sw)}" height="${Math.max(0, zone.height - sw)}" fill="none" stroke="${escapeXml(zone.color)}" stroke-width="${sw}" stroke-dasharray="${dash} ${dash}" />`
      );
      if (settings.showLabels && !perZone) {
        const fontSize = Math.max(12, Math.min(zone.height * 0.18, minDim * 0.03));
        if (zone.width > fontSize * 2.5 && zone.height > fontSize * 3) {
          parts.push(
            `<text class="cm-zone-label cm-overlap-label" paint-order="stroke" font-weight="700" font-family="system-ui, sans-serif" x="${zone.x + zone.width / 2}" y="${zone.y + zone.height / 2 - fontSize * 0.25}" text-anchor="middle" font-size="${fontSize}" fill="${escapeXml(zone.color)}" stroke="rgba(15,23,42,0.75)" stroke-width="${fontSize * 0.12}">${escapeXml(zone.name)}</text>`
          );
          parts.push(
            `<text class="cm-zone-label cm-overlap-label" paint-order="stroke" font-weight="700" font-family="system-ui, sans-serif" x="${zone.x + zone.width / 2}" y="${zone.y + zone.height / 2 + fontSize * 0.95}" text-anchor="middle" font-size="${fontSize * 0.75}" fill="${escapeXml(zone.color)}" stroke="rgba(15,23,42,0.75)" stroke-width="${fontSize * 0.09}">${zone.x}, ${zone.y} · ${zone.width} × ${zone.height}</text>`
          );
        }
      }
    }
  }

  return parts.join("");
}

/** @param {unknown} raw */
function normalizeZoneLabels(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  return {
    name: r.name !== false,
    resolution: r.resolution !== false,
    anchor: r.anchor === true,
  };
}

export function emptyContentMapsState() {
  return {
    surfaces: [],
    activeSurfaceId: null,
    zoneLabels: normalizeZoneLabels(null),
    rasters: [],
    activeRasterId: null,
    outputLabels: normalizeZoneLabels(null),
    testPattern: normalizeTestPattern(null),
  };
}

export function initContentMaps() {
  const root = document.getElementById("content-maps");
  if (!root) return null;

  const els = {
    surfaceNew: document.getElementById("cm-surface-new"),
    surfaceFromLed: document.getElementById("cm-surface-from-led"),
    ledMenu: document.getElementById("cm-led-menu"),
    surfaceMeasure: document.getElementById("cm-surface-measure"),
    measurePopover: document.getElementById("cm-measure-popover"),
    measureFeet: /** @type {HTMLInputElement} */ (document.getElementById("cm-measure-feet")),
    measureInches: /** @type {HTMLInputElement} */ (document.getElementById("cm-measure-inches")),
    measureSource: /** @type {HTMLSelectElement} */ (document.getElementById("cm-measure-source")),
    measurePpiWrap: document.getElementById("cm-measure-ppi-wrap"),
    measurePpi: /** @type {HTMLInputElement} */ (document.getElementById("cm-measure-ppi")),
    measureResult: document.getElementById("cm-measure-result"),
    measureDetail: document.getElementById("cm-measure-detail"),
    measureCopy: document.getElementById("cm-measure-copy"),
    surfaceRemove: document.getElementById("cm-surface-remove"),
    surfaceList: document.getElementById("cm-surface-list"),
    surfaceWidth: /** @type {HTMLInputElement} */ (document.getElementById("cm-surface-width")),
    surfaceHeight: /** @type {HTMLInputElement} */ (document.getElementById("cm-surface-height")),
    surfaceSizeFields: document.getElementById("cm-surface-size-fields"),
    zoneNew: document.getElementById("cm-zone-new"),
    zoneFromLed: document.getElementById("cm-zone-from-led"),
    zoneLedMenu: document.getElementById("cm-zone-led-menu"),
    zoneList: document.getElementById("cm-zone-list"),
    status: document.getElementById("cm-status"),
    labelToggles: document.getElementById("cm-label-toggles"),
    viewHint: document.getElementById("cm-view-hint"),
    resetView: document.getElementById("cm-reset-view"),
    viewport: document.getElementById("cm-viewport"),
    emptyState: document.getElementById("cm-empty-state"),
    svg: /** @type {SVGSVGElement|null} */ (document.getElementById("cm-svg")),
    rasterNew: document.getElementById("cm-raster-new"),
    rasterFromImport: document.getElementById("cm-raster-from-import"),
    rasterImportMenu: document.getElementById("cm-raster-import-menu"),
    rasterRemove: document.getElementById("cm-raster-remove"),
    rasterList: document.getElementById("cm-raster-list"),
    rasterWidth: /** @type {HTMLInputElement} */ (document.getElementById("cm-raster-width")),
    rasterHeight: /** @type {HTMLInputElement} */ (document.getElementById("cm-raster-height")),
    rasterSizeFields: document.getElementById("cm-raster-size-fields"),
    outZoneNew: document.getElementById("cm-out-zone-new"),
    outZoneFromImport: document.getElementById("cm-out-zone-from-import"),
    outZoneImportMenu: document.getElementById("cm-out-zone-import-menu"),
    outZoneList: document.getElementById("cm-out-zone-list"),
    outStatus: document.getElementById("cm-out-status"),
    outLabelToggles: document.getElementById("cm-out-label-toggles"),
    outViewHint: document.getElementById("cm-out-view-hint"),
    outResetView: document.getElementById("cm-out-reset-view"),
    outViewport: document.getElementById("cm-out-viewport"),
    outEmptyState: document.getElementById("cm-out-empty-state"),
    outSvg: /** @type {SVGSVGElement|null} */ (document.getElementById("cm-out-svg")),
    tpSourceList: document.getElementById("cm-tp-source-list"),
    tpType: /** @type {HTMLSelectElement} */ (document.getElementById("cm-tp-type")),
    tpScope: /** @type {HTMLSelectElement} */ (document.getElementById("cm-tp-scope")),
    tpGridSize: /** @type {HTMLInputElement} */ (document.getElementById("cm-tp-grid-size")),
    tpTileFields: document.getElementById("cm-tp-tile-fields"),
    tpTileSelect: /** @type {HTMLSelectElement} */ (document.getElementById("cm-tp-tile-select")),
    tpTileSizePair: document.getElementById("cm-tp-tile-size-pair"),
    tpTileW: /** @type {HTMLInputElement} */ (document.getElementById("cm-tp-tile-w")),
    tpTileH: /** @type {HTMLInputElement} */ (document.getElementById("cm-tp-tile-h")),
    tpColorSwatches: document.getElementById("cm-tp-color-swatches"),
    tpZonesToggle: document.getElementById("cm-tp-zones-toggle"),
    tpLabelsToggle: document.getElementById("cm-tp-labels-toggle"),
    tpCenterToggle: document.getElementById("cm-tp-center-toggle"),
    tpStatus: document.getElementById("cm-tp-status"),
    tpDownload: document.getElementById("cm-tp-download"),
    tpViewHint: document.getElementById("cm-tp-view-hint"),
    tpResetView: document.getElementById("cm-tp-reset-view"),
    tpViewport: document.getElementById("cm-tp-viewport"),
    tpEmptyState: document.getElementById("cm-tp-empty-state"),
    tpSvg: /** @type {SVGSVGElement|null} */ (document.getElementById("cm-tp-svg")),
  };

  /** @type {{ surfaces: Surface[], activeSurfaceId: string|null, zoneLabels: { name: boolean, resolution: boolean, anchor: boolean }, rasters: Raster[], activeRasterId: string|null, outputLabels: { name: boolean, resolution: boolean, anchor: boolean }, testPattern: TestPatternSelection }} */
  const state = emptyContentMapsState();

  /** Canvas selection (click-to-select; Delete removes). Not persisted. */
  let selectedZoneId = /** @type {string|null} */ (null);
  let selectedOutZoneId = /** @type {string|null} */ (null);

  const view = { panX: 0, panY: 0, zoom: 1, contentW: 0, contentH: 0 };
  /** Resets the view when the previewed surface (or its pixel size) changes. */
  let lastContentKey = "";

  const panZoom = createSvgViewBoxPanZoom({
    container: /** @type {HTMLElement} */ (els.viewport),
    getSvg: () => els.svg,
    getView: () => view,
    getEnabled: () => Boolean(getActiveSurface()),
    minZoom: 0.5,
    maxZoom: 16,
    zoomWheelFactor: 1.12,
    onChange: updateViewHint,
  });

  const outView = { panX: 0, panY: 0, zoom: 1, contentW: 0, contentH: 0 };
  let lastOutContentKey = "";

  const outPanZoom = createSvgViewBoxPanZoom({
    container: /** @type {HTMLElement} */ (els.outViewport),
    getSvg: () => els.outSvg,
    getView: () => outView,
    getEnabled: () => Boolean(getActiveRaster()),
    minZoom: 0.5,
    maxZoom: 16,
    zoomWheelFactor: 1.12,
    onChange: updateOutViewHint,
  });

  const tpView = { panX: 0, panY: 0, zoom: 1, contentW: 0, contentH: 0 };
  let lastTpContentKey = "";

  const tpPanZoom = createSvgViewBoxPanZoom({
    container: /** @type {HTMLElement} */ (els.tpViewport),
    getSvg: () => els.tpSvg,
    getView: () => tpView,
    getEnabled: () => Boolean(getTestPatternSource()),
    minZoom: 0.5,
    maxZoom: 16,
    zoomWheelFactor: 1.12,
    onChange: updateTpViewHint,
  });

  function updateTpViewHint() {
    if (!els.tpViewHint) return;
    const pct = Math.round(tpView.zoom * 100);
    els.tpViewHint.textContent = `${pct}% · scroll to zoom · right-drag to pan`;
  }

  function updateViewHint() {
    if (!els.viewHint) return;
    const pct = Math.round(view.zoom * 100);
    els.viewHint.textContent = `${pct}% · scroll to zoom · right-drag to pan`;
  }

  function updateOutViewHint() {
    if (!els.outViewHint) return;
    const pct = Math.round(outView.zoom * 100);
    els.outViewHint.textContent = `${pct}% · scroll to zoom · right-drag to pan`;
  }

  function getActiveSurface() {
    return state.surfaces.find((s) => s.id === state.activeSurfaceId) ?? null;
  }

  function getActiveRaster() {
    return state.rasters.find((r) => r.id === state.activeRasterId) ?? null;
  }

  function setStatus(message) {
    if (els.status) els.status.textContent = message;
  }

  function setOutStatus(message) {
    if (els.outStatus) els.outStatus.textContent = message;
  }

  const surfaceNameEditor =
    els.surfaceList &&
    createListNameEditor({
      listEl: els.surfaceList,
      itemSelector: "[data-surface-id]",
      getItemId: (item) => item.dataset.surfaceId,
      getName: (id) => state.surfaces.find((s) => s.id === id)?.name,
      setName: (id, name) => {
        const surface = state.surfaces.find((s) => s.id === id);
        if (surface) surface.name = name;
      },
      onCommit: (_id, previousName, newName) => {
        render();
        if (newName !== previousName) setStatus(`Renamed to ${newName}.`);
      },
      onCancel: () => render(),
    });

  const rasterNameEditor =
    els.rasterList &&
    createListNameEditor({
      listEl: els.rasterList,
      itemSelector: "[data-raster-id]",
      getItemId: (item) => item.dataset.rasterId,
      getName: (id) => state.rasters.find((r) => r.id === id)?.name,
      setName: (id, name) => {
        const raster = state.rasters.find((r) => r.id === id);
        if (raster) raster.name = name;
      },
      onCommit: (_id, previousName, newName) => {
        renderOutput();
        if (newName !== previousName) setOutStatus(`Renamed to ${newName}.`);
      },
      onCancel: () => renderOutput(),
    });

  function addSurface() {
    const surface = normalizeSurface(
      { name: `Surface ${state.surfaces.length + 1}` },
      state.surfaces.length
    );
    state.surfaces.push(surface);
    state.activeSurfaceId = surface.id;
    render();
    setStatus(`Created ${surface.name} (${surface.width}×${surface.height}).`);
  }

  /** LED walls available to import, with pixel sizes computed by the LED calculator. */
  function listLedWalls() {
    const led = /** @type {{ grids?: object[] } | null} */ (getCalculatorExport("led"));
    const grids = Array.isArray(led?.grids) ? led.grids : [];
    return grids.map((grid) => ({
      id: String(grid.id),
      name: String(grid.name ?? "LED Wall"),
      ...gridPixelSize(grid),
      grid,
    }));
  }

  /** Projection screens with projectors, with pixel sizes computed by the projector calculator. */
  function listProjectorScreens() {
    const proj = /** @type {{ screens?: object[] } | null} */ (getCalculatorExport("projector"));
    const screens = Array.isArray(proj?.screens) ? proj.screens : [];
    return screens.flatMap((screen) => {
      const size = screenPixelSize(screen);
      if (!size) return [];
      return [
        {
          id: String(screen.id),
          name: String(screen.name ?? "Projection Screen"),
          width: size.width,
          height: size.height,
          screen,
        },
      ];
    });
  }

  function importMenus() {
    return [
      els.ledMenu,
      els.zoneLedMenu,
      els.rasterImportMenu,
      els.outZoneImportMenu,
      els.measurePopover,
    ].filter(Boolean);
  }

  function importMenuAnchors() {
    return [
      els.surfaceFromLed,
      els.zoneFromLed,
      els.rasterFromImport,
      els.outZoneFromImport,
      els.surfaceMeasure,
    ];
  }

  function closeImportMenus() {
    for (const menu of importMenus()) menu.hidden = true;
  }

  function importMenuHtml() {
    const sections = [
      { label: "LED walls", type: "led", items: listLedWalls() },
      { label: "Projector screens", type: "projector", items: listProjectorScreens() },
    ].filter((section) => section.items.length);
    if (!sections.length) {
      return `<p class="resource-empty cm-led-menu-empty">Nothing to import yet — create an LED wall or projection screen first.</p>`;
    }
    return sections
      .map(
        (section) => `
        <p class="cm-led-menu-heading">${escapeXml(section.label)}</p>
        ${section.items
          .map(
            (item) => `
            <button type="button" class="cm-led-menu-item" data-import-type="${section.type}" data-import-id="${escapeXml(item.id)}">
              <span class="cm-led-menu-name">${escapeXml(item.name)}</span>
              <span class="cm-led-menu-size">${item.width}×${item.height} px</span>
            </button>`
          )
          .join("")}`
      )
      .join("");
  }

  /** @param {HTMLElement|null} menuEl */
  function toggleImportMenu(menuEl) {
    if (!menuEl) return;
    const wasOpen = !menuEl.hidden;
    closeImportMenus();
    if (wasOpen) return;
    menuEl.innerHTML = importMenuHtml();
    menuEl.hidden = false;
  }

  // ── Tape measure (feet + inches → pixels) ──────────────────────────────────

  /** Session-only converter state; not persisted. */
  const measure = { feet: 0, inches: 0, source: "custom", ppi: 10 };
  let lastMeasurePx = 0;

  /** px/in of a wall's tile: tile pixel width over its physical width in inches. */
  function wallPpi(wall) {
    const px = Number(wall?.grid?.tile?.pixelWidth);
    const mm = Number(wall?.grid?.tile?.metricWidth);
    if (!(px > 0) || !(mm > 0)) return null;
    return px / (mm / 25.4);
  }

  /** px/in of a projection screen: blend-canvas pixel width over physical width in inches. */
  function screenPpi(item) {
    const px = Number(item?.width);
    const physical = Number(item?.screen?.width);
    if (!(px > 0) || !(physical > 0)) return null;
    const inches = item.screen.unit === "m" ? physical * 39.3700787 : physical * 12;
    return px / inches;
  }

  function measurePpiValue() {
    if (measure.source.startsWith("led:")) {
      const wall = listLedWalls().find((w) => w.id === measure.source.slice(4));
      const ppi = wallPpi(wall);
      if (ppi) return ppi;
    } else if (measure.source.startsWith("screen:")) {
      const item = listProjectorScreens().find((s) => s.id === measure.source.slice(7));
      const ppi = screenPpi(item);
      if (ppi) return ppi;
    }
    return measure.ppi;
  }

  /** Non-rounding math-field parse: distances and px/in can be fractional. */
  function parseMeasureField(text, fallback) {
    if (!String(text ?? "").trim()) return 0;
    const n = evaluateMathExpression(text);
    return n !== null && Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  /** @param {number} n */
  function formatMeasureNumber(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  function updateMeasureResult() {
    const ppi = measurePpiValue();
    const totalInches = measure.feet * 12 + measure.inches;
    lastMeasurePx = Math.round(totalInches * ppi);
    if (els.measureResult) els.measureResult.textContent = `${lastMeasurePx} px`;
    if (els.measureDetail) {
      els.measureDetail.textContent = `${formatMeasureNumber(measure.feet)} ft ${formatMeasureNumber(measure.inches)} in at ${ppi.toFixed(3)} px/in`;
    }
  }

  function renderMeasurePopover() {
    const wallOptions = listLedWalls().flatMap((wall) => {
      const ppi = wallPpi(wall);
      return ppi ? [{ value: `led:${wall.id}`, label: `${wall.name} tile — ${ppi.toFixed(2)} px/in` }] : [];
    });
    const screenOptions = listProjectorScreens().flatMap((item) => {
      const ppi = screenPpi(item);
      return ppi ? [{ value: `screen:${item.id}`, label: `${item.name} — ${ppi.toFixed(2)} px/in` }] : [];
    });
    const options = [...wallOptions, ...screenOptions, { value: "custom", label: "Custom value" }];
    if (!options.some((opt) => opt.value === measure.source)) {
      measure.source = "custom";
    }
    if (els.measureSource) {
      els.measureSource.innerHTML = options
        .map((opt) => `<option value="${escapeXml(opt.value)}">${escapeXml(opt.label)}</option>`)
        .join("");
      els.measureSource.value = measure.source;
    }
    if (els.measurePpiWrap) els.measurePpiWrap.hidden = measure.source !== "custom";
    if (els.measureFeet && document.activeElement !== els.measureFeet) {
      els.measureFeet.value = formatMeasureNumber(measure.feet);
    }
    if (els.measureInches && document.activeElement !== els.measureInches) {
      els.measureInches.value = formatMeasureNumber(measure.inches);
    }
    if (els.measurePpi && document.activeElement !== els.measurePpi) {
      els.measurePpi.value = formatMeasureNumber(measure.ppi);
    }
    updateMeasureResult();
  }

  /** @param {"led" | "projector"} type @param {string} id */
  function findImportItem(type, id) {
    const items = type === "led" ? listLedWalls() : listProjectorScreens();
    return items.find((item) => item.id === id) ?? null;
  }

  /** @param {"led" | "projector"} type @param {string} id */
  function addSurfaceFromImport(type, id) {
    const item = findImportItem(type, id);
    if (!item) return;
    const surface = normalizeSurface(
      {
        name: item.name,
        width: item.width,
        height: item.height,
        source: { type, id },
      },
      state.surfaces.length
    );
    state.surfaces.push(surface);
    state.activeSurfaceId = surface.id;
    closeImportMenus();
    render();
    setStatus(
      `Created ${surface.name} from ${type === "led" ? "LED wall" : "projector screen"} (${surface.width}×${surface.height}).`
    );
  }

  /** @param {"led" | "projector"} type @param {string} id */
  function addZonesFromImport(type, id) {
    const surface = getActiveSurface();
    if (!surface) {
      setStatus("Add a surface first.");
      closeImportMenus();
      return;
    }
    const item = findImportItem(type, id);
    if (!item) return;

    // Projector screens expand into one zone per projector, placed with the
    // blend overlap math from the projector calculator. LED walls stay one zone.
    const specs =
      type === "projector"
        ? screenProjectorPixelRects(item.screen).map((rect) => ({
            name: rect.name,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            source: { type, id: rect.id },
          }))
        : [{ name: item.name, x: 0, y: 0, width: item.width, height: item.height, source: { type, id } }];

    const added = specs.map((spec, i) => {
      const zone = normalizeZone(spec, surface.zones.length + i);
      surface.zones.push(zone);
      return zone;
    });
    closeImportMenus();
    render();
    setStatus(
      added.length === 1
        ? `Added ${added[0].name} (${added[0].width}×${added[0].height}) to ${surface.name}.`
        : `Added ${added.length} projector zones from ${item.name} to ${surface.name}.`
    );
  }

  function removeActiveSurface() {
    const idx = state.surfaces.findIndex((s) => s.id === state.activeSurfaceId);
    if (idx < 0) {
      setStatus("No surface selected to remove.");
      return;
    }
    const name = state.surfaces[idx].name;
    state.surfaces.splice(idx, 1);
    state.activeSurfaceId = state.surfaces[Math.min(idx, state.surfaces.length - 1)]?.id ?? null;
    render();
    setStatus(`Removed ${name}.`);
  }

  function selectSurface(surfaceId) {
    if (state.activeSurfaceId === surfaceId) return;
    state.activeSurfaceId = surfaceId;
    render();
    const surface = getActiveSurface();
    if (surface) setStatus(`Viewing ${surface.name}.`);
  }

  function addZone() {
    const surface = getActiveSurface();
    if (!surface) {
      setStatus("Add a surface first.");
      return;
    }
    const zone = normalizeZone({ name: `Zone ${surface.zones.length + 1}` }, surface.zones.length);
    surface.zones.push(zone);
    render();
    setStatus(`Added ${zone.name} to ${surface.name}.`);
    const nameInput = els.zoneList?.querySelector(
      `[data-zone-id="${zone.id}"] [data-zone-field="name"]`
    );
    if (nameInput instanceof HTMLInputElement) {
      nameInput.focus({ preventScroll: true });
      nameInput.select();
    }
  }

  function removeZone(zoneId) {
    const surface = getActiveSurface();
    if (!surface) return;
    const idx = surface.zones.findIndex((z) => z.id === zoneId);
    if (idx < 0) return;
    const name = surface.zones[idx].name;
    surface.zones.splice(idx, 1);
    render();
    setStatus(`Removed ${name}.`);
  }

  function renderSurfaceList() {
    surfaceNameEditor?.close();
    if (!els.surfaceList) return;
    if (!state.surfaces.length) {
      els.surfaceList.innerHTML = `<p class="resource-empty">No surfaces yet — click + to add one.</p>`;
      return;
    }
    els.surfaceList.innerHTML = state.surfaces
      .map((surface) => {
        const selected = surface.id === state.activeSurfaceId;
        return `
          <button type="button" class="grid-item${selected ? " selected" : ""}" data-surface-id="${surface.id}" aria-pressed="${selected}">
            <span class="grid-item-name">${escapeXml(surface.name)}</span>
            <span class="grid-item-meta">${surface.width}×${surface.height} px · ${surface.zones.length} zone${surface.zones.length === 1 ? "" : "s"}</span>
          </button>`;
      })
      .join("");
  }

  function renderSurfaceSizeFields() {
    const surface = getActiveSurface();
    if (els.surfaceSizeFields) els.surfaceSizeFields.hidden = !surface;
    if (!surface) return;
    if (els.surfaceWidth) els.surfaceWidth.value = String(surface.width);
    if (els.surfaceHeight) els.surfaceHeight.value = String(surface.height);
  }

  function renderZoneList() {
    if (!els.zoneList) return;
    closeColorPalettePopover();
    const surface = getActiveSurface();
    if (!surface) {
      els.zoneList.innerHTML = `<p class="resource-empty">Select a surface to manage its zones.</p>`;
      return;
    }
    if (!surface.zones.length) {
      els.zoneList.innerHTML = `<p class="resource-empty">No media zones — click + Zone to add one.</p>`;
      return;
    }
    els.zoneList.innerHTML = surface.zones
      .map(
        (zone) => `
        <div class="cm-zone${zone.id === selectedZoneId ? " is-selected" : ""}" data-zone-id="${zone.id}">
          <div class="cm-zone-head">
            <input type="text" class="cm-zone-name" data-zone-field="name" value="${escapeXml(zone.name)}" maxlength="48" aria-label="Zone name" />
            ${renderColorSwatchButton({
              color: zone.color,
              className: "cm-zone-color-btn",
              dataset: { zoneId: zone.id },
              ariaLabel: `Color for ${zone.name}`,
              title: "Zone color",
            })}
            <button type="button" class="cm-zone-remove" data-zone-remove="${zone.id}" title="Remove zone" aria-label="Remove ${escapeXml(zone.name)}">×</button>
          </div>
          <div class="cm-zone-fields">
            <label>Anchor X <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="x" value="${zone.x}" /></label>
            <label>Anchor Y <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="y" value="${zone.y}" /></label>
            <label>Width <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="width" value="${zone.width}" /></label>
            <label>Height <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="height" value="${zone.height}" /></label>
          </div>
        </div>`
      )
      .join("");

    bindColorSwatchButtons(els.zoneList, ".cm-zone-color-btn", {
      getColor: (wrap) => {
        const s = getActiveSurface();
        return (
          s?.zones.find((z) => z.id === wrap.dataset.zoneId)?.color ?? DEFAULT_PALETTE_COLOR
        );
      },
      onColorChange: (wrap, color) => {
        const s = getActiveSurface();
        const zone = s?.zones.find((z) => z.id === wrap.dataset.zoneId);
        if (!zone) return;
        zone.color = color;
        // Only redraw the preview: rebuilding the list would destroy the
        // swatch anchoring the open picker mid-drag.
        renderPreview();
      },
    });
  }

  function renderPreview() {
    const surface = getActiveSurface();
    const hasSurface = Boolean(surface);
    if (els.emptyState) els.emptyState.hidden = hasSurface;
    if (els.svg) els.svg.style.display = hasSurface ? "block" : "none";
    if (!surface || !els.svg) return;

    view.contentW = surface.width;
    view.contentH = surface.height;
    const contentKey = `${surface.id}:${surface.width}x${surface.height}`;
    if (contentKey !== lastContentKey) {
      lastContentKey = contentKey;
      view.panX = 0;
      view.panY = 0;
      view.zoom = 1;
    }
    panZoom.applyView();
    els.svg.innerHTML = buildWorldSvg(
      surface.width,
      surface.height,
      surface.zones,
      state.zoneLabels,
      "media",
      selectedZoneId
    );
  }

  function renderLabelToggles() {
    els.labelToggles?.querySelectorAll("[data-cm-label]").forEach((btn) => {
      const key = btn.dataset.cmLabel;
      const on = Boolean(state.zoneLabels[key]);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
  }

  // ── Output (rasters, output zones, groups) ────────────────────────────────

  function addRaster() {
    const raster = normalizeRaster(
      { name: `Raster ${state.rasters.length + 1}` },
      state.rasters.length
    );
    state.rasters.push(raster);
    state.activeRasterId = raster.id;
    renderOutput();
    setOutStatus(`Created ${raster.name} (${raster.width}×${raster.height}).`);
  }

  function removeActiveRaster() {
    const idx = state.rasters.findIndex((r) => r.id === state.activeRasterId);
    if (idx < 0) {
      setOutStatus("No raster selected to remove.");
      return;
    }
    const name = state.rasters[idx].name;
    state.rasters.splice(idx, 1);
    state.activeRasterId = state.rasters[Math.min(idx, state.rasters.length - 1)]?.id ?? null;
    renderOutput();
    setOutStatus(`Removed ${name}.`);
  }

  function selectRaster(rasterId) {
    if (state.activeRasterId === rasterId) return;
    state.activeRasterId = rasterId;
    renderOutput();
    const raster = getActiveRaster();
    if (raster) setOutStatus(`Viewing ${raster.name}.`);
  }

  /** @param {"led" | "projector"} type @param {string} id */
  function addRasterFromImport(type, id) {
    const item = findImportItem(type, id);
    if (!item) return;
    const raster = normalizeRaster(
      {
        name: item.name,
        width: item.width,
        height: item.height,
        source: { type, id },
      },
      state.rasters.length
    );
    state.rasters.push(raster);
    state.activeRasterId = raster.id;
    closeImportMenus();
    renderOutput();
    setOutStatus(
      `Created ${raster.name} from ${type === "led" ? "LED wall" : "projector screen"} (${raster.width}×${raster.height}).`
    );
  }

  /**
   * Import an LED wall or projection screen as an output group: LED walls
   * become "ports" (one zone per data line, placed at each line's tile
   * bounding box), projection screens one zone per projector.
   * @param {"led" | "projector"} type @param {string} id
   */
  function addOutputGroupFromImport(type, id) {
    const raster = getActiveRaster();
    if (!raster) {
      setOutStatus("Add a raster first.");
      closeImportMenus();
      return;
    }
    const item = findImportItem(type, id);
    if (!item) return;

    let rects;
    if (type === "led") {
      rects = gridDataLinePixelRects(item.grid);
      // A wall with no data lines still imports as one full-wall zone.
      if (!rects.length) {
        rects = [{ id, name: item.name, x: 0, y: 0, width: item.width, height: item.height }];
      }
    } else {
      rects = screenProjectorPixelRects(item.screen);
    }

    const baseIndex = rasterAllZones(raster).length;
    const group = normalizeOutputGroup(
      {
        name: item.name,
        source: { type, id },
        zones: rects.map((rect, i) => ({
          name: rect.name,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color: COLOR_PALETTE[(baseIndex + i) % COLOR_PALETTE.length],
          source: { type, id: rect.id },
        })),
      },
      raster.groups.length
    );
    raster.groups.push(group);
    closeImportMenus();
    renderOutput();
    setOutStatus(
      `Added ${group.name} — ${group.zones.length} ${type === "led" ? "port" : "projector"}${group.zones.length === 1 ? "" : "s"} — to ${raster.name}.`
    );
  }

  function addOutputZone() {
    const raster = getActiveRaster();
    if (!raster) {
      setOutStatus("Add a raster first.");
      return;
    }
    const zone = normalizeZone(
      { name: `Zone ${raster.zones.length + 1}` },
      rasterAllZones(raster).length
    );
    raster.zones.push(zone);
    renderOutput();
    setOutStatus(`Added ${zone.name} to ${raster.name}.`);
    const nameInput = els.outZoneList?.querySelector(
      `[data-zone-id="${zone.id}"] [data-zone-field="name"]`
    );
    if (nameInput instanceof HTMLInputElement) {
      nameInput.focus({ preventScroll: true });
      nameInput.select();
    }
  }

  /** @param {Raster|null} raster @param {string} zoneId */
  function findOutputZone(raster, zoneId) {
    if (!raster) return null;
    for (const group of raster.groups) {
      const zone = group.zones.find((z) => z.id === zoneId);
      if (zone) return zone;
    }
    return raster.zones.find((z) => z.id === zoneId) ?? null;
  }

  function removeOutputZone(zoneId) {
    const raster = getActiveRaster();
    if (!raster) return;
    for (const group of raster.groups) {
      const idx = group.zones.findIndex((z) => z.id === zoneId);
      if (idx >= 0) {
        const name = group.zones[idx].name;
        group.zones.splice(idx, 1);
        renderOutput();
        setOutStatus(`Removed ${name} from ${group.name}.`);
        return;
      }
    }
    const idx = raster.zones.findIndex((z) => z.id === zoneId);
    if (idx < 0) return;
    const name = raster.zones[idx].name;
    raster.zones.splice(idx, 1);
    renderOutput();
    setOutStatus(`Removed ${name}.`);
  }

  function removeOutputGroup(groupId) {
    const raster = getActiveRaster();
    if (!raster) return;
    const idx = raster.groups.findIndex((g) => g.id === groupId);
    if (idx < 0) return;
    const group = raster.groups[idx];
    raster.groups.splice(idx, 1);
    renderOutput();
    setOutStatus(`Removed ${group.name} and its ${group.zones.length} zone${group.zones.length === 1 ? "" : "s"}.`);
  }

  function renderRasterList() {
    rasterNameEditor?.close();
    if (!els.rasterList) return;
    if (!state.rasters.length) {
      els.rasterList.innerHTML = `<p class="resource-empty">No rasters yet — click + to add one.</p>`;
      return;
    }
    els.rasterList.innerHTML = state.rasters
      .map((raster) => {
        const selected = raster.id === state.activeRasterId;
        const zoneCount = rasterAllZones(raster).length;
        return `
          <button type="button" class="grid-item${selected ? " selected" : ""}" data-raster-id="${raster.id}" aria-pressed="${selected}">
            <span class="grid-item-name">${escapeXml(raster.name)}</span>
            <span class="grid-item-meta">${raster.width}×${raster.height} px · ${zoneCount} zone${zoneCount === 1 ? "" : "s"}</span>
          </button>`;
      })
      .join("");
  }

  function renderRasterSizeFields() {
    const raster = getActiveRaster();
    if (els.rasterSizeFields) els.rasterSizeFields.hidden = !raster;
    if (!raster) return;
    if (els.rasterWidth) els.rasterWidth.value = String(raster.width);
    if (els.rasterHeight) els.rasterHeight.value = String(raster.height);
  }

  /** @param {MediaZone} zone */
  function outputZoneItemHtml(zone) {
    return `
      <div class="cm-zone${zone.id === selectedOutZoneId ? " is-selected" : ""}" data-zone-id="${zone.id}">
        <div class="cm-zone-head">
          <input type="text" class="cm-zone-name" data-zone-field="name" value="${escapeXml(zone.name)}" maxlength="48" aria-label="Zone name" />
          ${renderColorSwatchButton({
            color: zone.color,
            className: "cm-zone-color-btn",
            dataset: { zoneId: zone.id },
            ariaLabel: `Color for ${zone.name}`,
            title: "Zone color",
          })}
          <button type="button" class="cm-zone-remove" data-zone-remove="${zone.id}" title="Remove zone" aria-label="Remove ${escapeXml(zone.name)}">×</button>
        </div>
        <div class="cm-zone-fields">
          <label>Anchor X <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="x" value="${zone.x}" /></label>
          <label>Anchor Y <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="y" value="${zone.y}" /></label>
          <label>Width <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="width" value="${zone.width}" /></label>
          <label>Height <input type="text" inputmode="decimal" autocomplete="off" data-zone-field="height" value="${zone.height}" /></label>
        </div>
      </div>`;
  }

  function renderOutputZoneList() {
    if (!els.outZoneList) return;
    closeColorPalettePopover();
    const raster = getActiveRaster();
    if (!raster) {
      els.outZoneList.innerHTML = `<p class="resource-empty">Select a raster to manage its output zones.</p>`;
      return;
    }
    if (!raster.groups.length && !raster.zones.length) {
      els.outZoneList.innerHTML = `<p class="resource-empty">No output zones — click + or import an LED wall or projector screen.</p>`;
      return;
    }

    let html = "";
    for (const group of raster.groups) {
      html += `
        <div class="cm-out-group" data-group-id="${group.id}">
          <div class="cm-out-group-head">
            <span class="cm-out-group-name">${escapeXml(group.name)}</span>
            <span class="cm-out-group-count">${group.zones.length}</span>
            <button type="button" class="cm-zone-remove" data-group-remove="${group.id}" title="Remove group" aria-label="Remove ${escapeXml(group.name)}">×</button>
          </div>
          <div class="cm-out-group-zones">
            ${group.zones.map((zone) => outputZoneItemHtml(zone)).join("")}
          </div>
        </div>`;
    }
    html += raster.zones.map((zone) => outputZoneItemHtml(zone)).join("");
    els.outZoneList.innerHTML = html;

    bindColorSwatchButtons(els.outZoneList, ".cm-zone-color-btn", {
      getColor: (wrap) =>
        findOutputZone(getActiveRaster(), wrap.dataset.zoneId)?.color ?? DEFAULT_PALETTE_COLOR,
      onColorChange: (wrap, color) => {
        const zone = findOutputZone(getActiveRaster(), wrap.dataset.zoneId);
        if (!zone) return;
        zone.color = color;
        // Only redraw the preview: rebuilding the list would destroy the
        // swatch anchoring the open picker mid-drag.
        renderOutputPreview();
      },
    });
  }

  function renderOutputPreview() {
    const raster = getActiveRaster();
    const hasRaster = Boolean(raster);
    if (els.outEmptyState) els.outEmptyState.hidden = hasRaster;
    if (els.outSvg) els.outSvg.style.display = hasRaster ? "block" : "none";
    if (!raster || !els.outSvg) return;

    outView.contentW = raster.width;
    outView.contentH = raster.height;
    const contentKey = `${raster.id}:${raster.width}x${raster.height}`;
    if (contentKey !== lastOutContentKey) {
      lastOutContentKey = contentKey;
      outView.panX = 0;
      outView.panY = 0;
      outView.zoom = 1;
    }
    outPanZoom.applyView();
    els.outSvg.innerHTML = buildWorldSvg(
      raster.width,
      raster.height,
      rasterAllZones(raster),
      state.outputLabels,
      "output",
      selectedOutZoneId
    );
  }

  function renderOutputLabelToggles() {
    els.outLabelToggles?.querySelectorAll("[data-cm-label]").forEach((btn) => {
      const key = btn.dataset.cmLabel;
      const on = Boolean(state.outputLabels[key]);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
  }

  function renderOutput() {
    renderRasterList();
    renderRasterSizeFields();
    renderOutputZoneList();
    renderOutputLabelToggles();
    renderOutputPreview();
    renderTestPatterns();
    const raster = getActiveRaster();
    if (raster) {
      const zoneCount = rasterAllZones(raster).length;
      setOutStatus(
        `${raster.name} · ${raster.width}×${raster.height} px · ${zoneCount} zone${zoneCount === 1 ? "" : "s"}`
      );
    } else {
      setOutStatus("Add a raster to begin.");
    }
  }

  // ── Test patterns ──────────────────────────────────────────────────────────

  /**
   * The selected surface/raster, falling back to whatever is active so the
   * tab is immediately useful. `pattern` is that source's own settings.
   * @returns {{ kind: "surface" | "raster", id: string, name: string, width: number, height: number, zones: MediaZone[], pattern: PatternSettings } | null}
   */
  function getTestPatternSource() {
    const tp = state.testPattern;
    const fromSurface = (s) =>
      s
        ? { kind: "surface", id: s.id, name: s.name, width: s.width, height: s.height, zones: s.zones, pattern: ensurePattern(s) }
        : null;
    const fromRaster = (r) =>
      r
        ? { kind: "raster", id: r.id, name: r.name, width: r.width, height: r.height, zones: rasterAllZones(r), pattern: ensurePattern(r) }
        : null;
    if (tp.sourceId) {
      const picked =
        tp.sourceType === "raster"
          ? fromRaster(state.rasters.find((r) => r.id === tp.sourceId))
          : fromSurface(state.surfaces.find((s) => s.id === tp.sourceId));
      if (picked) return picked;
    }
    return (
      fromSurface(getActiveSurface()) ??
      fromRaster(getActiveRaster()) ??
      fromSurface(state.surfaces[0]) ??
      fromRaster(state.rasters[0])
    );
  }

  function setTpStatus(message) {
    if (els.tpStatus) els.tpStatus.textContent = message;
  }

  function renderTpSourceList() {
    if (!els.tpSourceList) return;
    const source = getTestPatternSource();
    const sections = [
      { label: "Surfaces", kind: "surface", items: state.surfaces },
      { label: "Rasters", kind: "raster", items: state.rasters },
    ].filter((section) => section.items.length);
    if (!sections.length) {
      els.tpSourceList.innerHTML = `<p class="resource-empty">No surfaces or rasters yet — create them in Media or Output.</p>`;
      return;
    }
    els.tpSourceList.innerHTML = sections
      .map(
        (section) => `
        <p class="cm-led-menu-heading">${section.label}</p>
        ${section.items
          .map((item) => {
            const selected = source?.kind === section.kind && source.id === item.id;
            const zoneCount = section.kind === "raster" ? rasterAllZones(item).length : item.zones.length;
            return `
              <button type="button" class="grid-item${selected ? " selected" : ""}" data-tp-kind="${section.kind}" data-tp-id="${item.id}" aria-pressed="${selected}">
                <span class="grid-item-name">${escapeXml(item.name)}</span>
                <span class="grid-item-meta">${item.width}×${item.height} px · ${zoneCount} zone${zoneCount === 1 ? "" : "s"}</span>
              </button>`;
          })
          .join("")}`
      )
      .join("");
  }

  /**
   * Tile pixel size for the LED tile grid: from the emulated wall's tile, or the custom fields.
   * @param {PatternSettings} tp
   */
  function resolvedTileSize(tp) {
    if (tp.tileMode === "led" && tp.tileWallId) {
      const wall = listLedWalls().find((w) => w.id === tp.tileWallId);
      const tileW = Number(wall?.grid?.tile?.pixelWidth);
      const tileH = Number(wall?.grid?.tile?.pixelHeight);
      if (tileW > 0 && tileH > 0) return { tileW, tileH };
    }
    return { tileW: tp.tileW, tileH: tp.tileH };
  }

  /** Pattern settings of the currently selected test-pattern source, if any. */
  function currentPattern() {
    return getTestPatternSource()?.pattern ?? null;
  }

  /** Tile emulation controls (wall picker, custom size, alternating colors). */
  function renderTpTileControls() {
    const tp = currentPattern();
    if (!tp) return;
    const walls = listLedWalls();
    const wallInUse = tp.tileMode === "led" && walls.some((w) => w.id === tp.tileWallId);
    if (els.tpTileSelect) {
      els.tpTileSelect.innerHTML = [
        ...walls.map((wall) => {
          const tileW = Number(wall.grid?.tile?.pixelWidth) || 0;
          const tileH = Number(wall.grid?.tile?.pixelHeight) || 0;
          return `<option value="led:${escapeXml(wall.id)}">${escapeXml(wall.name)} tile — ${tileW}×${tileH} px</option>`;
        }),
        `<option value="custom">Custom size…</option>`,
      ].join("");
      els.tpTileSelect.value = wallInUse ? `led:${tp.tileWallId}` : "custom";
    }
    if (els.tpTileSizePair) els.tpTileSizePair.hidden = wallInUse;
    if (els.tpTileW && document.activeElement !== els.tpTileW) els.tpTileW.value = String(tp.tileW);
    if (els.tpTileH && document.activeElement !== els.tpTileH) els.tpTileH.value = String(tp.tileH);
    if (els.tpColorSwatches) {
      els.tpColorSwatches.innerHTML =
        renderColorSwatchButton({
          color: tp.tileColorA,
          className: "cm-tp-color-swatch",
          dataset: { tpColor: "a" },
          ariaLabel: "Change first tile color",
          title: "First tile color",
        }) +
        renderColorSwatchButton({
          color: tp.tileColorB,
          className: "cm-tp-color-swatch",
          dataset: { tpColor: "b" },
          ariaLabel: "Change second tile color",
          title: "Second tile color",
        });
      bindColorSwatchButtons(els.tpColorSwatches, ".cm-tp-color-swatch", {
        getColor: (wrap) => {
          const p = currentPattern();
          return (wrap.dataset.tpColor === "b" ? p?.tileColorB : p?.tileColorA) ?? DEFAULT_PALETTE_COLOR;
        },
        onColorChange: (wrap, color) => {
          const p = currentPattern();
          if (!p) return;
          if (wrap.dataset.tpColor === "b") p.tileColorB = color;
          else p.tileColorA = color;
          // Only redraw the preview: rebuilding the controls would destroy
          // the swatch anchoring the open picker mid-drag.
          renderTpPreview();
        },
      });
    }
  }

  function renderTpControls() {
    const tp = currentPattern();
    if (!tp) return;
    if (els.tpType) els.tpType.value = tp.type;
    if (els.tpScope) els.tpScope.value = tp.scope;
    if (els.tpGridSize && document.activeElement !== els.tpGridSize) {
      els.tpGridSize.value = String(tp.gridSize);
    }
    const gridField = els.tpGridSize?.closest(".cm-tp-field");
    if (gridField) gridField.hidden = tp.type !== "alignment";
    if (els.tpTileFields) els.tpTileFields.hidden = tp.type !== "grid";
    if (tp.type === "grid") renderTpTileControls();
    const toggles = [
      [els.tpZonesToggle, tp.showZones],
      [els.tpLabelsToggle, tp.showLabels],
      [els.tpCenterToggle, tp.showCenter],
    ];
    for (const [btn, on] of toggles) {
      btn?.classList.toggle("active", on);
      btn?.setAttribute("aria-pressed", String(on));
    }
    // In per-zone mode labels render inside each zone's pattern, so the
    // toggle stays useful even with zone outlines off.
    if (els.tpLabelsToggle) els.tpLabelsToggle.disabled = !tp.showZones && tp.scope !== "zones";
    if (els.tpCenterToggle) {
      els.tpCenterToggle.disabled = tp.type === "bars" || tp.type === "gradient";
    }
  }

  function renderTpPreview() {
    const source = getTestPatternSource();
    const hasSource = Boolean(source);
    if (els.tpEmptyState) els.tpEmptyState.hidden = hasSource;
    if (els.tpSvg) els.tpSvg.style.display = hasSource ? "block" : "none";
    if (els.tpDownload) els.tpDownload.disabled = !hasSource;
    if (!source || !els.tpSvg) return;

    tpView.contentW = source.width;
    tpView.contentH = source.height;
    const contentKey = `${source.kind}:${source.id}:${source.width}x${source.height}`;
    if (contentKey !== lastTpContentKey) {
      lastTpContentKey = contentKey;
      tpView.panX = 0;
      tpView.panY = 0;
      tpView.zoom = 1;
    }
    tpPanZoom.applyView();
    els.tpSvg.innerHTML = buildTestPatternSvg(source.width, source.height, source.zones, {
      ...source.pattern,
      ...resolvedTileSize(source.pattern),
    });
  }

  function renderTestPatterns() {
    renderTpSourceList();
    renderTpControls();
    renderTpPreview();
    const source = getTestPatternSource();
    if (source) {
      const tp = source.pattern;
      const scopeText =
        tp.scope === "zones"
          ? source.zones.length
            ? `per zone (${source.zones.length})`
            : "per zone — no zones yet"
          : "whole source";
      setTpStatus(
        `${source.name} (${source.kind}) · ${source.width}×${source.height} px · ${tp.type} pattern · ${scopeText}`
      );
    } else {
      setTpStatus("Pick a surface or raster to build a test pattern.");
    }
  }

  /** Rasterize the current pattern at native pixel size and download as PNG. */
  function downloadTestPatternPng() {
    const source = getTestPatternSource();
    if (!source || !els.tpSvg) return;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${source.width}" height="${source.height}" viewBox="0 0 ${source.width} ${source.height}">${els.tpSvg.innerHTML}</svg>`;
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, source.width, source.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) {
          setTpStatus("PNG export failed — the pattern may be too large for this browser.");
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(png);
        const safeName = source.name.replace(/[^\w-]+/g, "_");
        const scopeTag = source.pattern.scope === "zones" ? "_per-zone" : "";
        link.download = `${safeName}_${source.pattern.type}${scopeTag}_${source.width}x${source.height}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
        setTpStatus(`Downloaded ${link.download}.`);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setTpStatus("PNG export failed — could not rasterize the pattern.");
    };
    img.src = url;
  }

  function render() {
    renderSurfaceList();
    renderSurfaceSizeFields();
    renderZoneList();
    renderLabelToggles();
    renderPreview();
    renderTestPatterns();
    const surface = getActiveSurface();
    if (surface) {
      setStatus(
        `${surface.name} · ${surface.width}×${surface.height} px · ${surface.zones.length} zone${surface.zones.length === 1 ? "" : "s"}`
      );
    } else {
      setStatus("Add a surface to begin.");
    }
  }

  ensureColorPalettePopover();

  bindSidebarTabs(root, {
    tabSelector: ".cm-subtab",
    panelSelector: ".cm-subtab-panel",
    panelIdForTab: (tabId) => `cm-${tabId}`,
  });

  els.labelToggles?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cm-label]");
    if (!btn) return;
    const key = btn.dataset.cmLabel;
    if (!(key in state.zoneLabels)) return;
    state.zoneLabels[key] = !state.zoneLabels[key];
    renderLabelToggles();
    renderPreview();
  });

  if (els.viewport) panZoom.bind();
  els.resetView?.addEventListener("click", () => {
    panZoom.resetView();
    setStatus("View reset.");
  });
  updateViewHint();

  els.surfaceNew?.addEventListener("click", () => {
    closeImportMenus();
    addSurface();
  });
  els.surfaceFromLed?.addEventListener("click", () => toggleImportMenu(els.ledMenu));
  els.surfaceMeasure?.addEventListener("click", () => {
    if (!els.measurePopover) return;
    const wasOpen = !els.measurePopover.hidden;
    closeImportMenus();
    if (wasOpen) return;
    renderMeasurePopover();
    els.measurePopover.hidden = false;
    els.measureFeet?.focus({ preventScroll: true });
    els.measureFeet?.select();
  });
  els.measureFeet?.addEventListener("input", () => {
    measure.feet = parseMeasureField(els.measureFeet.value, measure.feet);
    updateMeasureResult();
  });
  els.measureInches?.addEventListener("input", () => {
    measure.inches = parseMeasureField(els.measureInches.value, measure.inches);
    updateMeasureResult();
  });
  els.measurePpi?.addEventListener("input", () => {
    measure.ppi = parseMeasureField(els.measurePpi.value, measure.ppi);
    updateMeasureResult();
  });
  els.measureSource?.addEventListener("change", () => {
    measure.source = els.measureSource.value;
    renderMeasurePopover();
  });
  els.measureCopy?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(lastMeasurePx));
      if (els.measureCopy) {
        els.measureCopy.textContent = "Copied";
        setTimeout(() => {
          if (els.measureCopy) els.measureCopy.textContent = "Copy";
        }, 1200);
      }
    } catch {
      setStatus(`Measured ${lastMeasurePx} px — clipboard unavailable, copy manually.`);
    }
  });
  els.zoneFromLed?.addEventListener("click", () => toggleImportMenu(els.zoneLedMenu));
  els.ledMenu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-import-id]");
    if (item) addSurfaceFromImport(item.dataset.importType, item.dataset.importId);
  });
  els.zoneLedMenu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-import-id]");
    if (item) addZonesFromImport(item.dataset.importType, item.dataset.importId);
  });
  document.addEventListener("pointerdown", (e) => {
    if (importMenus().every((menu) => menu.hidden)) return;
    const target = /** @type {Node} */ (e.target);
    const insideAnchor = importMenuAnchors().some((anchor) => anchor?.contains(target));
    if (insideAnchor || importMenus().some((menu) => menu.contains(target))) return;
    closeImportMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeImportMenus();
  });
  els.surfaceRemove?.addEventListener("click", removeActiveSurface);
  els.surfaceList?.addEventListener("click", (e) => {
    if (e.target.closest(".grid-name-editor")) return;
    const item = e.target.closest("[data-surface-id]");
    if (item) selectSurface(item.dataset.surfaceId);
  });
  els.surfaceList?.addEventListener("dblclick", (e) => {
    const nameEl = e.target.closest(".grid-item-name");
    if (!nameEl) return;
    e.preventDefault();
    e.stopPropagation();
    surfaceNameEditor?.open(nameEl);
  });

  for (const [input, key] of [
    [els.surfaceWidth, "width"],
    [els.surfaceHeight, "height"],
  ]) {
    input?.addEventListener("input", () => {
      const surface = getActiveSurface();
      if (!surface) return;
      surface[key] = parseFieldValue(input.value, surface[key], 1, MAX_SURFACE_DIMENSION);
      renderSurfaceList();
      renderPreview();
      setStatus(`${surface.name} is now ${surface.width}×${surface.height} px.`);
    });
    // On commit, replace any typed expression with its computed value.
    input?.addEventListener("change", renderSurfaceSizeFields);
  }

  els.zoneNew?.addEventListener("click", addZone);
  els.zoneList?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-zone-remove]");
    if (removeBtn) removeZone(removeBtn.dataset.zoneRemove);
  });
  els.zoneList?.addEventListener("input", (e) => {
    const field = /** @type {HTMLInputElement|null} */ (e.target.closest("[data-zone-field]"));
    if (!field) return;
    const zoneEl = field.closest("[data-zone-id]");
    const surface = getActiveSurface();
    const zone = surface?.zones.find((z) => z.id === zoneEl?.dataset.zoneId);
    if (!zone) return;

    const key = field.dataset.zoneField;
    if (key === "name") {
      zone.name = field.value.trim() || zone.name;
    } else if (key === "x" || key === "y") {
      zone[key] = parseFieldValue(field.value, zone[key]);
    } else if (key === "width" || key === "height") {
      zone[key] = parseFieldValue(field.value, zone[key], 1, MAX_SURFACE_DIMENSION);
    }
    renderPreview();
  });
  // Sync labels/counts once the user finishes editing a field.
  els.zoneList?.addEventListener("change", render);

  // ── Output events ──────────────────────────────────────────────────────────

  if (els.outViewport) outPanZoom.bind();
  els.outResetView?.addEventListener("click", () => {
    outPanZoom.resetView();
    setOutStatus("View reset.");
  });
  updateOutViewHint();

  els.outLabelToggles?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cm-label]");
    if (!btn) return;
    const key = btn.dataset.cmLabel;
    if (!(key in state.outputLabels)) return;
    state.outputLabels[key] = !state.outputLabels[key];
    renderOutputLabelToggles();
    renderOutputPreview();
  });

  els.rasterNew?.addEventListener("click", () => {
    closeImportMenus();
    addRaster();
  });
  els.rasterFromImport?.addEventListener("click", () => toggleImportMenu(els.rasterImportMenu));
  els.outZoneFromImport?.addEventListener("click", () => toggleImportMenu(els.outZoneImportMenu));
  els.rasterImportMenu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-import-id]");
    if (item) addRasterFromImport(item.dataset.importType, item.dataset.importId);
  });
  els.outZoneImportMenu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-import-id]");
    if (item) addOutputGroupFromImport(item.dataset.importType, item.dataset.importId);
  });
  els.rasterRemove?.addEventListener("click", removeActiveRaster);
  els.rasterList?.addEventListener("click", (e) => {
    if (e.target.closest(".grid-name-editor")) return;
    const item = e.target.closest("[data-raster-id]");
    if (item) selectRaster(item.dataset.rasterId);
  });
  els.rasterList?.addEventListener("dblclick", (e) => {
    const nameEl = e.target.closest(".grid-item-name");
    if (!nameEl) return;
    e.preventDefault();
    e.stopPropagation();
    rasterNameEditor?.open(nameEl);
  });

  for (const [input, key] of [
    [els.rasterWidth, "width"],
    [els.rasterHeight, "height"],
  ]) {
    input?.addEventListener("input", () => {
      const raster = getActiveRaster();
      if (!raster) return;
      raster[key] = parseFieldValue(input.value, raster[key], 1, MAX_SURFACE_DIMENSION);
      renderRasterList();
      renderOutputPreview();
      setOutStatus(`${raster.name} is now ${raster.width}×${raster.height} px.`);
    });
    // On commit, replace any typed expression with its computed value.
    input?.addEventListener("change", renderRasterSizeFields);
  }

  els.outZoneNew?.addEventListener("click", addOutputZone);
  els.outZoneList?.addEventListener("click", (e) => {
    const groupRemoveBtn = e.target.closest("[data-group-remove]");
    if (groupRemoveBtn) {
      removeOutputGroup(groupRemoveBtn.dataset.groupRemove);
      return;
    }
    const removeBtn = e.target.closest("[data-zone-remove]");
    if (removeBtn) removeOutputZone(removeBtn.dataset.zoneRemove);
  });
  els.outZoneList?.addEventListener("input", (e) => {
    const field = /** @type {HTMLInputElement|null} */ (e.target.closest("[data-zone-field]"));
    if (!field) return;
    const zoneEl = field.closest("[data-zone-id]");
    const zone = findOutputZone(getActiveRaster(), zoneEl?.dataset.zoneId);
    if (!zone) return;

    const key = field.dataset.zoneField;
    if (key === "name") {
      zone.name = field.value.trim() || zone.name;
    } else if (key === "x" || key === "y") {
      zone[key] = parseFieldValue(field.value, zone[key]);
    } else if (key === "width" || key === "height") {
      zone[key] = parseFieldValue(field.value, zone[key], 1, MAX_SURFACE_DIMENSION);
    }
    renderOutputPreview();
  });
  // Sync labels/counts once the user finishes editing a field.
  els.outZoneList?.addEventListener("change", renderOutput);

  // ── Test pattern events ────────────────────────────────────────────────────

  if (els.tpViewport) tpPanZoom.bind();
  els.tpResetView?.addEventListener("click", () => {
    tpPanZoom.resetView();
    setTpStatus("View reset.");
  });
  updateTpViewHint();

  els.tpSourceList?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-tp-id]");
    if (!item) return;
    state.testPattern.sourceType = item.dataset.tpKind === "raster" ? "raster" : "surface";
    state.testPattern.sourceId = item.dataset.tpId;
    renderTestPatterns();
  });

  els.tpType?.addEventListener("change", () => {
    const tp = currentPattern();
    const value = els.tpType.value;
    if (tp && ["grid", "bars", "gradient", "alignment"].includes(value)) {
      tp.type = value;
    }
    renderTestPatterns();
  });

  els.tpScope?.addEventListener("change", () => {
    const tp = currentPattern();
    if (tp) tp.scope = els.tpScope.value === "zones" ? "zones" : "source";
    renderTestPatterns();
  });

  els.tpTileSelect?.addEventListener("change", () => {
    const tp = currentPattern();
    if (!tp) return;
    const value = els.tpTileSelect.value;
    if (value.startsWith("led:")) {
      tp.tileMode = "led";
      tp.tileWallId = value.slice(4);
    } else {
      tp.tileMode = "custom";
    }
    renderTpControls();
    renderTpPreview();
  });

  for (const [input, key] of [
    [els.tpTileW, "tileW"],
    [els.tpTileH, "tileH"],
  ]) {
    input?.addEventListener("input", () => {
      const tp = currentPattern();
      if (!tp) return;
      tp[key] = parseFieldValue(input.value, tp[key], 8, 4096);
      renderTpPreview();
    });
    input?.addEventListener("change", renderTpControls);
  }

  els.tpGridSize?.addEventListener("input", () => {
    const tp = currentPattern();
    if (!tp) return;
    tp.gridSize = parseFieldValue(els.tpGridSize.value, tp.gridSize, 8, 4096);
    renderTpPreview();
  });
  els.tpGridSize?.addEventListener("change", renderTpControls);

  for (const [btn, key] of [
    [els.tpZonesToggle, "showZones"],
    [els.tpLabelsToggle, "showLabels"],
    [els.tpCenterToggle, "showCenter"],
  ]) {
    btn?.addEventListener("click", () => {
      const tp = currentPattern();
      if (!tp) return;
      tp[key] = !tp[key];
      renderTpControls();
      renderTpPreview();
    });
  }

  els.tpDownload?.addEventListener("click", downloadTestPatternPng);

  // ── Canvas selection (click to select, Delete to remove — no dragging) ────

  els.svg?.addEventListener("click", (e) => {
    const surface = getActiveSurface();
    if (!surface) return;
    const target = /** @type {Element} */ (e.target);
    const id = target.closest?.("[data-zone-id]")?.getAttribute("data-zone-id") ?? null;
    const next = id && surface.zones.some((z) => z.id === id) ? id : null;
    if (next === selectedZoneId) return;
    selectedZoneId = next;
    renderPreview();
    renderZoneList();
    if (next) {
      els.zoneList
        ?.querySelector(`.cm-zone[data-zone-id="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
      const zone = surface.zones.find((z) => z.id === next);
      setStatus(`Selected ${zone?.name}. Press Delete to remove it.`);
    }
  });

  els.outSvg?.addEventListener("click", (e) => {
    const raster = getActiveRaster();
    if (!raster) return;
    const target = /** @type {Element} */ (e.target);
    const id = target.closest?.("[data-zone-id]")?.getAttribute("data-zone-id") ?? null;
    const next = id && findOutputZone(raster, id) ? id : null;
    if (next === selectedOutZoneId) return;
    selectedOutZoneId = next;
    renderOutputPreview();
    renderOutputZoneList();
    if (next) {
      els.outZoneList
        ?.querySelector(`.cm-zone[data-zone-id="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
      setOutStatus(`Selected ${findOutputZone(raster, next)?.name}. Press Delete to remove it.`);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      (target.closest("input, textarea, select") || target.isContentEditable)
    ) {
      return;
    }
    if (root.hidden) return;
    const mediaPanel = document.getElementById("cm-media");
    const outputPanel = document.getElementById("cm-output");
    if (mediaPanel && !mediaPanel.hidden && selectedZoneId) {
      e.preventDefault();
      const id = selectedZoneId;
      selectedZoneId = null;
      removeZone(id);
    } else if (outputPanel && !outputPanel.hidden && selectedOutZoneId) {
      e.preventDefault();
      const id = selectedOutZoneId;
      selectedOutZoneId = null;
      removeOutputZone(id);
    }
  });

  render();
  renderOutput();

  function exportState() {
    return deepClone(state);
  }

  /** @param {object} data */
  function importState(data) {
    // Older saves kept one global pattern config on testPattern; seed sources
    // that don't carry their own settings with it.
    const legacyPattern =
      data?.testPattern && typeof data.testPattern === "object" && "type" in data.testPattern
        ? data.testPattern
        : null;
    const withPatternFallback = (raw) =>
      raw && typeof raw === "object" && !raw.pattern && legacyPattern
        ? { ...raw, pattern: legacyPattern }
        : raw;
    const surfaces = Array.isArray(data?.surfaces) ? data.surfaces : [];
    state.surfaces = surfaces.map((s, i) => normalizeSurface(withPatternFallback(s), i));
    state.activeSurfaceId =
      typeof data?.activeSurfaceId === "string" &&
      state.surfaces.some((s) => s.id === data.activeSurfaceId)
        ? data.activeSurfaceId
        : state.surfaces[0]?.id ?? null;
    state.zoneLabels = normalizeZoneLabels(data?.zoneLabels);
    const rasters = Array.isArray(data?.rasters) ? data.rasters : [];
    state.rasters = rasters.map((r, i) => normalizeRaster(withPatternFallback(r), i));
    state.activeRasterId =
      typeof data?.activeRasterId === "string" &&
      state.rasters.some((r) => r.id === data.activeRasterId)
        ? data.activeRasterId
        : state.rasters[0]?.id ?? null;
    state.outputLabels = normalizeZoneLabels(data?.outputLabels);
    state.testPattern = normalizeTestPattern(data?.testPattern);
    render();
    renderOutput();
  }

  return { exportState, importState };
}

export const calculatorPlugin = {
  meta: {
    id: "content-maps",
    tabPanelId: "content-maps",
    stateKey: "contentMaps",
    label: "Content Maps",
    requiredForSave: false,
    emptyState: emptyContentMapsState,
  },
  init: initContentMaps,
};
