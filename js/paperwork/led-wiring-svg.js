/**
 * Static LED wall wiring diagrams for paperwork sheets (data/cable or power).
 * Geometry mirrors the LED calculator canvas, drawn for white print sheets.
 */

import { LINE_COLORS } from "../led-data.js?v=2";
import { escapeXml } from "../shared/dom.js";
import { fontSizePtToUserUnits, normalizeFontSizePt } from "./font-scale.js?v=4";

const PADDING = 28;
const TILE_GAP = 5;
const LEGEND_ROW = 18;
const LEGEND_GAP = 10;
const LEGEND_HEADER = 17;
const LEGEND_GROUP_GAP = 6;
const LEGEND_COLUMNS = 4;
const PROCESSOR_COLUMN_MIN_WIDTH = 108;

/**
 * @param {object} grid
 * @param {"data" | "power"} mode
 */
function resolveLines(grid, mode) {
  const lines = mode === "power" ? grid?.powerLines : grid?.dataLines;
  return Array.isArray(lines) ? lines : [];
}

/**
 * @param {object} grid
 * @param {object} line
 * @param {"data" | "power"} mode
 * @param {number} paletteIndex
 */
function lineColor(grid, line, mode, paletteIndex) {
  if (mode === "data" && line?.processorId && Array.isArray(grid?.processors)) {
    const proc = grid.processors.find((p) => p && p.id === line.processorId);
    if (proc?.color) return String(proc.color);
  }
  const palette = LINE_COLORS[mode] ?? LINE_COLORS.data;
  return palette[paletteIndex % palette.length];
}

/**
 * @param {object} tile
 */
function tileAspect(tile) {
  const w = Number(tile?.metricWidth) || Number(tile?.pixelWidth) || 1;
  const h = Number(tile?.metricHeight) || Number(tile?.pixelHeight) || 1;
  return w / Math.max(1, h);
}

/**
 * @param {object} grid
 * @param {object[]} lines
 * @param {"data" | "power"} mode
 */
function buildLegendGroups(grid, lines, mode) {
  const entries = lines.map((line, index) => ({ line, index }));
  if (mode === "power") return [{ label: "", entries }];

  const processors = Array.isArray(grid?.processors) ? grid.processors : [];
  const groups = processors
    .map((processor) => ({
      label: String(processor?.name ?? "Processor"),
      entries: entries.filter(({ line }) => line?.processorId === processor?.id),
    }))
    .filter((group) => group.entries.length);

  const processorIds = new Set(processors.map((processor) => processor?.id));
  const unassigned = entries.filter(
    ({ line }) => !line?.processorId || !processorIds.has(line.processorId)
  );
  if (unassigned.length) groups.push({ label: "Unassigned", entries: unassigned });

  return groups;
}

/** @param {{ label: string, entries: { line: object, index: number }[] }[]} groups */
function powerLegendHeight(groups) {
  if (!groups.length) return 0;
  const contentHeight = groups.reduce(
    (height, group) =>
      height +
      (group.label ? LEGEND_HEADER : 0) +
      Math.ceil(group.entries.length / LEGEND_COLUMNS) * LEGEND_ROW,
    0
  );
  return LEGEND_GAP + contentHeight + Math.max(0, groups.length - 1) * LEGEND_GROUP_GAP;
}

/**
 * One processor per column. A processor gets an adjacent B column only when
 * one or more of its lines has an enabled end label.
 * @param {object} grid
 * @param {object[]} lines
 */
function buildProcessorColumns(grid, lines) {
  const entries = lines.map((line, index) => ({ line, index }));
  const processors = Array.isArray(grid?.processors) ? grid.processors : [];
  const processorIds = new Set(processors.map((processor) => processor?.id));
  const groups = processors
    .map((processor) => ({
      label: String(processor?.name ?? "Processor"),
      entries: entries.filter(({ line }) => line?.processorId === processor?.id),
    }))
    .filter((group) => group.entries.length);

  const unassigned = entries.filter(
    ({ line }) => !line?.processorId || !processorIds.has(line.processorId)
  );
  if (unassigned.length) groups.push({ label: "Unassigned", entries: unassigned });

  return groups.flatMap((group) => {
    const primary = {
      label: group.label,
      isBackup: false,
      entries: group.entries.map(({ line, index }, localIndex) => ({
        line,
        index,
        portNumber: localIndex + 1,
        portLabel: String(line?.startLabel || localIndex + 1),
      })),
    };
    const backupEntries = group.entries
      .flatMap(({ line, index }, localIndex) =>
        line?.endLabel
          ? [
              {
                line,
                index,
                portNumber: localIndex + 1,
                portLabel: String(line.endLabel),
              },
            ]
          : []
      );
    return backupEntries.length
      ? [
          primary,
          {
            label: `${group.label} B`,
            isBackup: true,
            entries: backupEntries,
          },
        ]
      : [primary];
  });
}

/** @param {{ entries: object[] }[]} columns */
function processorLegendHeight(columns) {
  if (!columns.length) return 0;
  const rows = Math.max(...columns.map((column) => column.entries.length));
  return LEGEND_GAP + LEGEND_HEADER + rows * LEGEND_ROW;
}

/**
 * @param {object} grid
 * @param {"data" | "power"} mode
 * @param {{ fontSizePt?: number, frameWIn?: number, frameHIn?: number }} [options]
 * @returns {{ svg: string, width: number, height: number } | null}
 */
export function buildLedWiringSvg(grid, mode, options = {}) {
  const rows = Number(grid?.generated ? grid.generatedRows : grid?.rows) || 0;
  const cols = Number(grid?.generated ? grid.generatedCols : grid?.cols) || 0;
  if (!grid || rows < 1 || cols < 1) return null;

  const fontSizePt = normalizeFontSizePt(options.fontSizePt);
  const frameWIn = Number(options.frameWIn) || 0;
  const frameHIn = Number(options.frameHIn) || 0;

  const tile = grid.tile ?? {};
  const aspect = tileAspect(tile);
  const tileW = 36;
  const tileH = tileW / aspect;
  const lines = resolveLines(grid, mode);
  const processorColumns = mode === "data" ? buildProcessorColumns(grid, lines) : [];
  const legendGroups = mode === "power" ? buildLegendGroups(grid, lines, mode) : [];

  const gridW = cols * tileW + (cols - 1) * TILE_GAP;
  const gridH = rows * tileH + (rows - 1) * TILE_GAP;
  const baseSvgW = PADDING * 2 + gridW;
  const svgW =
    mode === "data" && processorColumns.length
      ? Math.max(baseSvgW, PADDING + processorColumns.length * PROCESSOR_COLUMN_MIN_WIDTH)
      : baseSvgW;
  const gridLeft = (svgW - gridW) / 2;
  const legendH =
    mode === "data"
      ? processorLegendHeight(processorColumns)
      : powerLegendHeight(legendGroups);
  const svgH = PADDING * 2 + gridH + legendH;
  const baseUser =
    frameWIn > 0 && frameHIn > 0
      ? fontSizePtToUserUnits(fontSizePt, {
          viewW: svgW,
          viewH: svgH,
          frameWIn,
          frameHIn,
        })
      : 9;
  const fontMul = baseUser / 9;
  /** @param {number} size */
  const fs = (size) => Math.round(size * fontMul * 100) / 100;

  /** @param {number} index */
  function tileCenter(index) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: gridLeft + col * (tileW + TILE_GAP) + tileW / 2,
      y: PADDING + row * (tileH + TILE_GAP) + tileH / 2,
    };
  }

  const assigned = new Map();
  lines.forEach((line, li) => {
    const color = lineColor(grid, line, mode, li);
    for (const idx of line.tiles ?? []) {
      if (!assigned.has(idx)) assigned.set(idx, color);
    }
  });

  const parts = [];

  lines.forEach((line, li) => {
    const tiles = Array.isArray(line.tiles) ? line.tiles : [];
    if (tiles.length < 2) return;
    const color = lineColor(grid, line, mode, li);
    const points = tiles
      .map((idx) => {
        const c = tileCenter(idx);
        return `${c.x},${c.y}`;
      })
      .join(" ");
    parts.push(
      `<polyline fill="none" stroke="${escapeXml(color)}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" points="${points}" />`
    );
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = gridLeft + c * (tileW + TILE_GAP);
      const y = PADDING + r * (tileH + TILE_GAP);
      const color = assigned.get(idx);
      const fill = color ? `${color}22` : "#ffffff";
      const stroke = color ? color : "#111111";
      parts.push(
        `<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" fill="${fill}" stroke="${stroke}" stroke-width="1.25" />`
      );
      parts.push(
        `<text x="${x + tileW / 2}" y="${y + fs(9)}" text-anchor="middle" font-size="${fs(7)}" fill="#334155" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${r + 1},${c + 1}</text>`
      );
    }
  }

  lines.forEach((line, li) => {
    const tiles = Array.isArray(line.tiles) ? line.tiles : [];
    if (!tiles.length) return;
    const color = lineColor(grid, line, mode, li);
    const start = tileCenter(tiles[0]);
    const end = tileCenter(tiles[tiles.length - 1]);
    const startLabel = String(line.startLabel ?? "");
    const endLabel = String(line.endLabel ?? "");

    if (startLabel) {
      parts.push(endpointMarkup(start.x, start.y, startLabel, color, fontMul));
    }
    if (tiles.length > 1 && endLabel) {
      parts.push(endpointMarkup(end.x, end.y, endLabel, color, fontMul));
    }
  });

  if (processorColumns.length) {
    const y = PADDING + gridH + LEGEND_GAP;
    const availableW = svgW - PADDING;
    const colW = availableW / processorColumns.length;

    processorColumns.forEach((column, columnIndex) => {
      const x = PADDING / 2 + columnIndex * colW;
      parts.push(
        `<rect x="${x}" y="${y - 4}" width="${colW - 5}" height="${LEGEND_HEADER + column.entries.length * LEGEND_ROW + 2}" fill="#fff" stroke="#94a3b8" stroke-width="0.75" />`,
        `<text x="${x + 6}" y="${y + fs(8)}" font-size="${fs(10)}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(column.label)}</text>`
      );

      column.entries.forEach(({ line, index, portNumber, portLabel }, entryIndex) => {
        const color = lineColor(grid, line, mode, index);
        const itemY = y + LEGEND_HEADER + entryIndex * LEGEND_ROW;
        const portW = Math.max(21, portLabel.length * 5.5 + 8);
        const name = `Port ${portNumber}`;
        parts.push(
          `<rect x="${x + 6}" y="${itemY}" width="${portW}" height="12" rx="2" fill="${escapeXml(color)}" stroke="#111" stroke-width="0.75"${column.isBackup ? ` stroke-dasharray="2 1"` : ""} />`,
          `<text x="${x + 6 + portW / 2}" y="${itemY + fs(9)}" text-anchor="middle" font-size="${fs(8)}" font-weight="700" fill="#fff" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(portLabel)}</text>`,
          `<text x="${x + 10 + portW}" y="${itemY + fs(9)}" font-size="${fs(8.5)}" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(name)}</text>`
        );
      });
    });
  } else if (legendGroups.length) {
    let y = PADDING + gridH + LEGEND_GAP;
    const colW = (svgW - PADDING) / LEGEND_COLUMNS;

    legendGroups.forEach((group, groupIndex) => {
      if (group.label) {
        parts.push(
          `<line x1="${PADDING / 2}" y1="${y + 4}" x2="${svgW - PADDING / 2}" y2="${y + 4}" stroke="#94a3b8" stroke-width="0.75" />`,
          `<rect x="${PADDING / 2}" y="${y - 3}" width="${Math.max(64, group.label.length * 6.5 + 14)}" height="14" fill="#fff" />`,
          `<text x="${PADDING / 2 + 5}" y="${y + fs(7)}" font-size="${fs(10)}" font-weight="700" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(group.label)}</text>`
        );
        y += LEGEND_HEADER;
      }

      group.entries.forEach(({ line, index }, entryIndex) => {
        const color = lineColor(grid, line, mode, index);
        const col = entryIndex % LEGEND_COLUMNS;
        const row = Math.floor(entryIndex / LEGEND_COLUMNS);
        const x = PADDING / 2 + col * colW;
        const itemY = y + row * LEGEND_ROW;
        const name = String(line.name ?? `Line ${index + 1}`);
        parts.push(
          `<rect x="${x}" y="${itemY}" width="10" height="10" fill="${escapeXml(color)}" stroke="#111" stroke-width="0.75" />`,
          `<text x="${x + 14}" y="${itemY + fs(9)}" font-size="${fs(9)}" fill="#111" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(name)}</text>`
        );
      });

      y += Math.ceil(group.entries.length / LEGEND_COLUMNS) * LEGEND_ROW;
      if (groupIndex < legendGroups.length - 1) y += LEGEND_GROUP_GAP;
    });
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
  return { svg, width: svgW, height: svgH };
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {string} label
 * @param {string} color
 * @param {number} [fontMul]
 */
function endpointMarkup(cx, cy, label, color, fontMul = 1) {
  const r = 11;
  const fs = Math.round(9 * fontMul * 100) / 100;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${escapeXml(color)}" stroke="#fff" stroke-width="1.5" />
    <text x="${cx}" y="${cy + fs * 0.39}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#fff" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">${escapeXml(label)}</text>`;
}
