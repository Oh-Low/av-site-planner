import { escapeXml } from "../shared/dom.js";
import { PAPERWORK_DPI } from "./paper-sizes.js";

/**
 * Draw-style stroke weight is in points.
 * @param {number} strokeWidthPt
 */
export function strokeWidthInches(strokeWidthPt) {
  const pt = Number(strokeWidthPt);
  if (!Number.isFinite(pt) || pt <= 0) return 2 / 72;
  return Math.max(0.5 / 72, pt / 72);
}

/** @param {number} strokeWidthPt */
function strokeWidthPx(strokeWidthPt) {
  return Math.max(1, strokeWidthInches(strokeWidthPt) * PAPERWORK_DPI);
}

/**
 * Render into the decoration's inner body host (not the positioned frame).
 * @param {HTMLElement} host
 * @param {import("./decorations.js").PageDecoration} decoration
 */
export function renderDecoration(host, decoration) {
  host.className = `pw-decoration-body pw-decoration-${decoration.type}`;
  const { stroke, fill, strokeWidth, fontSize } = decoration.style;
  const sw = strokeWidthPx(strokeWidth);

  if (decoration.type === "drawText" || decoration.type === "drawHeading") {
    const body =
      typeof decoration.content?.body === "string" ? decoration.content.body : "Text";
    const size =
      decoration.type === "drawHeading" ? Math.max(fontSize, fontSize * 1.4) : fontSize;
    host.innerHTML = `<div class="pw-decoration-text pw-editable" data-field-id="body" style="color:${escapeXml(
      stroke
    )};font-size:${size}pt;font-weight:${decoration.type === "drawHeading" ? 700 : 500}">${escapeXml(
      body
    )}</div>`;
    return;
  }

  // Pixel viewBox matching the frame's inch size at paperwork DPI.
  // Points in content are inches relative to the frame origin.
  const vbW = Math.max(1, decoration.w * PAPERWORK_DPI);
  const vbH = Math.max(1, decoration.h * PAPERWORK_DPI);
  /** @param {number} inches */
  const px = (inches) => inches * PAPERWORK_DPI;

  if (decoration.type === "drawLine" || decoration.type === "drawArrow") {
    const points = Array.isArray(decoration.content?.points)
      ? decoration.content.points
      : [
          { x: 0, y: decoration.h / 2 },
          { x: decoration.w, y: decoration.h / 2 },
        ];
    const [a, b] = points;
    const x1 = px(Number(a?.x) || 0);
    const y1 = px(Number(a?.y) || 0);
    const x2 = px(Number(b?.x) || decoration.w);
    const y2 = px(Number(b?.y) || decoration.h);
    const marker =
      decoration.type === "drawArrow"
        ? `<defs><marker id="pw-arr-${escapeXml(decoration.id)}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="${escapeXml(stroke)}" /></marker></defs>`
        : "";
    const markerAttr =
      decoration.type === "drawArrow"
        ? ` marker-end="url(#pw-arr-${escapeXml(decoration.id)})"`
        : "";
    host.innerHTML = `<svg class="pw-decoration-svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="none">${marker}<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(
      stroke
    )}" stroke-width="${sw}" stroke-linecap="round"${markerAttr} /></svg>`;
    return;
  }

  if (decoration.type === "drawPolyline") {
    const points = Array.isArray(decoration.content?.points)
      ? decoration.content.points
      : [];
    const d = points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${px(Number(p?.x) || 0)} ${px(Number(p?.y) || 0)}`
      )
      .join(" ");
    host.innerHTML = `<svg class="pw-decoration-svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="none"><path d="${escapeXml(
      d || `M0 0`
    )}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" /></svg>`;
    return;
  }

  if (decoration.type === "drawEllipse") {
    host.innerHTML = `<svg class="pw-decoration-svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="none"><ellipse cx="${
      vbW / 2
    }" cy="${vbH / 2}" rx="${Math.max(0, vbW / 2 - sw / 2)}" ry="${Math.max(
      0,
      vbH / 2 - sw / 2
    )}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${sw}" /></svg>`;
    return;
  }

  const inset = sw / 2;
  host.innerHTML = `<svg class="pw-decoration-svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" preserveAspectRatio="none"><rect x="${inset}" y="${inset}" width="${Math.max(
    0,
    vbW - sw
  )}" height="${Math.max(0, vbH - sw)}" fill="${escapeXml(fill)}" stroke="${escapeXml(
    stroke
  )}" stroke-width="${sw}" /></svg>`;
}
