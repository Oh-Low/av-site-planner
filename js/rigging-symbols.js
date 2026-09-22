/**
 * SVG symbol builders for rigging parts (world units = inches).
 * Shackle drawings are original scaled geometry from published dimensions —
 * not third-party catalog artwork.
 */

import {
  getCatalogEntry,
  mergePartProps,
  parseShackleTypeId,
  resolvePartProps,
  resolvePartSize,
} from "./domain/rigging.js";

/**
 * @param {import("./domain/rigging.js").RiggingPart} part
 * @returns {string} inner SVG markup (no outer <g>)
 */
export function symbolInnerSvg(part) {
  const entry = getCatalogEntry(part.typeId);
  const props = resolvePartProps(part);
  const size = resolvePartSize(part);
  const w = size.width;
  const h = size.height;
  const hw = w / 2;
  const hh = h / 2;

  const shackle = parseShackleTypeId(part.typeId);
  if (shackle) {
    return shackleSymbolSvg(shackle.style, shackle.size, hh);
  }

  switch (part.typeId) {
    case "load-led":
      return `
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="1" class="rg-sym-fill rg-sym-led" />
        <rect x="${-hw + 2}" y="${-hh + 2}" width="${Math.max(w - 4, 1)}" height="${Math.max(h - 4, 1)}" class="rg-sym-inset" />
        <line x1="${-hw}" y1="${-hh}" x2="${hw}" y2="${-hh}" class="rg-sym-stroke" stroke-width="1.2" />
      `;
    case "led-hanging-bar":
      return `
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="0.4" class="rg-sym-fill rg-sym-bar" />
        <line x1="${-hw + 2}" y1="0" x2="${hw - 2}" y2="0" class="rg-sym-stroke" stroke-width="0.6" />
      `;
    case "turnbuckle":
      return `
        <rect x="${-hw}" y="${-hh * 0.35}" width="${w}" height="${h * 0.7}" rx="0.3" class="rg-sym-fill rg-sym-turnbuckle" />
        <line x1="0" y1="${-hh}" x2="0" y2="${-hh * 0.35}" class="rg-sym-stroke" stroke-width="0.7" />
        <line x1="0" y1="${hh * 0.35}" x2="0" y2="${hh}" class="rg-sym-stroke" stroke-width="0.7" />
        <circle cx="0" cy="${-hh}" r="0.6" class="rg-sym-fill rg-sym-turnbuckle" />
        <circle cx="0" cy="${hh}" r="0.6" class="rg-sym-fill rg-sym-turnbuckle" />
      `;
    case "aircraft-cable":
      return `
        <line x1="0" y1="${-hh}" x2="0" y2="${hh}" class="rg-sym-stroke rg-sym-cable" stroke-width="${Math.max(w, 0.4)}" />
        <circle cx="0" cy="${-hh}" r="0.7" class="rg-sym-fill rg-sym-cable-end" />
        <circle cx="0" cy="${hh}" r="0.7" class="rg-sym-fill rg-sym-cable-end" />
      `;
    case "spanset": {
      const loop = Math.min(4, h * 0.15);
      return `
        <path d="M ${-hw} ${-hh + loop}
                 Q ${-hw} ${-hh} 0 ${-hh}
                 Q ${hw} ${-hh} ${hw} ${-hh + loop}
                 L ${hw} ${hh - loop}
                 Q ${hw} ${hh} 0 ${hh}
                 Q ${-hw} ${hh} ${-hw} ${hh - loop}
                 Z" class="rg-sym-fill rg-sym-spanset" />
      `;
    }
    case "truss": {
      const chord = Math.max(h * 0.15, 1);
      return `
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" class="rg-sym-fill rg-sym-truss" />
        <line x1="${-hw}" y1="${-hh + chord}" x2="${hw}" y2="${-hh + chord}" class="rg-sym-stroke" stroke-width="0.8" />
        <line x1="${-hw}" y1="${hh - chord}" x2="${hw}" y2="${hh - chord}" class="rg-sym-stroke" stroke-width="0.8" />
        <line x1="${-hw}" y1="${-hh}" x2="${-hw + h}" y2="${hh}" class="rg-sym-stroke" stroke-width="0.5" />
        <line x1="${-hw + h}" y1="${-hh}" x2="${-hw}" y2="${hh}" class="rg-sym-stroke" stroke-width="0.5" />
        <line x1="${hw - h}" y1="${-hh}" x2="${hw}" y2="${hh}" class="rg-sym-stroke" stroke-width="0.5" />
        <line x1="${hw}" y1="${-hh}" x2="${hw - h}" y2="${hh}" class="rg-sym-stroke" stroke-width="0.5" />
      `;
    }
    case "chain-motor":
      return `
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h * 0.55}" rx="0.8" class="rg-sym-fill rg-sym-motor" />
        <rect x="${-hw * 0.5}" y="${-hh + h * 0.55}" width="${w * 0.5}" height="${h * 0.45}" class="rg-sym-fill rg-sym-motor-body" />
        <line x1="0" y1="${hh}" x2="0" y2="${hh + 2}" class="rg-sym-stroke" stroke-width="0.8" />
        <circle cx="0" cy="${-hh}" r="1" class="rg-sym-fill rg-sym-motor" />
      `;
    case "deadhang":
      return `
        <rect x="${-hw}" y="${-hh}" width="${w}" height="${h * 0.45}" class="rg-sym-fill rg-sym-anchor" />
        <path d="M ${-hw * 0.4} ${-hh + h * 0.45} L 0 ${hh} L ${hw * 0.4} ${-hh + h * 0.45} Z" class="rg-sym-fill rg-sym-anchor" />
      `;
    default: {
      void entry;
      void props;
      return `<rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" class="rg-sym-fill" />`;
    }
  }
}

/**
 * Elevation of a shackle: bow up, pin across the bottom eyes.
 * @param {import("./domain/rigging-shackles.js").ShackleStyleDef} style
 * @param {import("./domain/rigging-shackles.js").ShackleSizeRow} size
 * @param {number} hh half overall height (for centering)
 */
function shackleSymbolSvg(style, size, hh) {
  const body = size.bodyDia;
  const pin = size.pinDia;
  const jaw = size.jawWidth;
  const bowW = size.bowWidth;
  const inside = size.insideLength;

  // Local coords: origin at part center; top = -hh, bottom = +hh
  const pinY = hh - pin / 2;
  const eyeY = pinY;
  const eyeX = jaw / 2;
  const crownY = pinY - inside - body / 2;
  const halfBow = bowW / 2;
  const stroke = Math.max(body * 0.92, 0.12);

  let bowPath;
  if (style.bowKind === "chain") {
    // D-shackle: nearly flat crown, parallel sides
    const topY = crownY;
    bowPath = `
      M ${-eyeX} ${eyeY}
      L ${-eyeX} ${topY + body * 0.2}
      Q ${-eyeX} ${topY} ${-halfBow * 0.35} ${topY}
      L ${halfBow * 0.35} ${topY}
      Q ${eyeX} ${topY} ${eyeX} ${topY + body * 0.2}
      L ${eyeX} ${eyeY}
    `;
  } else {
    // Anchor/bow shackle: rounded crown wider than the jaw
    bowPath = `
      M ${-eyeX} ${eyeY}
      L ${-eyeX} ${eyeY - inside * 0.35}
      Q ${-halfBow} ${crownY + inside * 0.15} 0 ${crownY}
      Q ${halfBow} ${crownY + inside * 0.15} ${eyeX} ${eyeY - inside * 0.35}
      L ${eyeX} ${eyeY}
    `;
  }

  const eyeR = Math.max(body * 0.55, pin * 0.55);
  let pinMarkup;
  if (style.pinKind === "bolt") {
    const nutW = pin * 1.35;
    const nutH = pin * 0.55;
    pinMarkup = `
      <rect x="${-eyeX - pin * 0.15}" y="${pinY - pin / 2}" width="${jaw + pin * 0.3}" height="${pin}" rx="${pin * 0.15}" class="rg-sym-fill rg-sym-shackle-pin" />
      <rect x="${eyeX + pin * 0.05}" y="${pinY - nutH / 2}" width="${nutW}" height="${nutH}" rx="0.05" class="rg-sym-fill rg-sym-shackle-nut" />
      <circle cx="${-eyeX}" cy="${pinY}" r="${pin * 0.22}" class="rg-sym-fill rg-sym-shackle-pin" />
    `;
  } else {
    // Screw pin with head on one side
    const headR = pin * 0.55;
    pinMarkup = `
      <rect x="${-eyeX - pin * 0.1}" y="${pinY - pin / 2}" width="${jaw + pin * 0.2}" height="${pin}" rx="${pin * 0.2}" class="rg-sym-fill rg-sym-shackle-pin" />
      <circle cx="${-eyeX - headR * 0.2}" cy="${pinY}" r="${headR}" class="rg-sym-fill rg-sym-shackle-pin" />
    `;
  }

  return `
    <path d="${bowPath}" class="rg-sym-stroke rg-sym-shackle-bow" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${-eyeX}" cy="${eyeY}" r="${eyeR}" class="rg-sym-stroke rg-sym-shackle-eye" fill="none" stroke-width="${Math.max(body * 0.35, 0.08)}" />
    <circle cx="${eyeX}" cy="${eyeY}" r="${eyeR}" class="rg-sym-stroke rg-sym-shackle-eye" fill="none" stroke-width="${Math.max(body * 0.35, 0.08)}" />
    ${pinMarkup}
  `;
}

/**
 * Full SVG for a part at its pose (for embedding in the world svg).
 * @param {import("./domain/rigging.js").RiggingPart} part
 * @param {{ selected?: boolean, overloaded?: boolean, previewMate?: boolean }} [opts]
 */
export function partGroupSvg(part, opts = {}) {
  const classes = ["rg-part"];
  if (opts.selected) classes.push("is-selected");
  if (opts.overloaded) classes.push("is-overloaded");
  if (opts.previewMate) classes.push("is-mate-preview");
  const rot = part.rotationDeg || 0;
  return `<g class="${classes.join(" ")}" data-part-id="${escapeAttr(part.id)}" transform="translate(${part.x} ${part.y}) rotate(${rot})">${symbolInnerSvg(part)}</g>`;
}

/**
 * Compact thumbnail for the palette (viewBox sized to part defaults).
 * @param {string} typeId
 */
export function paletteThumbSvg(typeId) {
  const entry = getCatalogEntry(typeId);
  if (!entry) return "";
  const props = mergePartProps({}, entry.defaults);
  const size = entry.size(props);
  const pad = Math.max(size.width, size.height) * 0.15 + 2;
  const part = {
    id: "thumb",
    typeId,
    name: entry.label,
    x: 0,
    y: 0,
    rotationDeg: 0,
    props: {},
  };
  const vbW = size.width + pad * 2;
  const vbH = size.height + pad * 2;
  return `<svg class="rg-palette-thumb" viewBox="${-vbW / 2} ${-vbH / 2} ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${symbolInnerSvg(part)}</svg>`;
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
