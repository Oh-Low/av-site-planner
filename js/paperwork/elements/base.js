import { escapeXml } from "../../shared/dom.js";
import { resolveElementFontSizePt } from "../font-scale.js?v=4";
import {
  detailTableHtml,
  registerElementRenderer,
  resolveFieldValue,
} from "./registry.js?v=3";

/**
 * @param {HTMLElement} host
 * @param {{ type?: string, content?: Record<string, unknown> | null }} element
 */
function applyFontSize(host, element) {
  host.style.setProperty("--pw-font-size", `${resolveElementFontSizePt(element)}pt`);
}

/**
 * Shrink/grow text until it fits the cell (single line).
 * @param {HTMLElement} textEl
 * @param {HTMLElement} cellEl
 * @param {{ minPx?: number, maxPx?: number, padX?: number, padY?: number }} [opts]
 */
function fitTextInBox(textEl, cellEl, opts = {}) {
  const minPx = opts.minPx ?? 9;
  const maxPx = opts.maxPx ?? 48;
  const padX = opts.padX ?? 10;
  const padY = opts.padY ?? 14;
  const maxW = Math.max(0, cellEl.clientWidth - padX);
  const maxH = Math.max(0, cellEl.clientHeight - padY);
  if (maxW < 4 || maxH < 4) return;

  textEl.style.whiteSpace = "nowrap";
  textEl.style.lineHeight = "1.05";
  textEl.style.overflow = "hidden";

  let lo = minPx;
  let hi = Math.min(maxPx, maxH);
  if (hi < lo) hi = lo;

  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    textEl.style.fontSize = `${mid}px`;
    const fits = textEl.scrollWidth <= maxW + 0.5 && textEl.scrollHeight <= maxH + 0.5;
    if (fits) lo = mid;
    else hi = mid;
  }
  textEl.style.fontSize = `${Math.max(minPx, lo)}px`;
}

/**
 * @param {HTMLElement} host
 */
function scheduleTitleBlockFits(host) {
  requestAnimationFrame(() => {
    if (!host.isConnected) return;
    const projectCell = host.querySelector(".pw-tb-project");
    const projectValue = projectCell?.querySelector(".pw-tb-value");
    if (projectCell instanceof HTMLElement && projectValue instanceof HTMLElement) {
      fitTextInBox(projectValue, projectCell, { minPx: 10, maxPx: 52, padX: 14, padY: 16 });
    }
  });
}

registerElementRenderer({
  type: "titleBlock",
  label: "Title block",
  render(host, ctx) {
    const {
      element,
      sheet,
      identity,
      sheetNumber,
      sheetCount,
      paperSizeCode,
      titleBlockLogo,
    } = ctx;
    const v = (id, auto) => resolveFieldValue(element, id, auto ?? "");
    const company = v("company", identity.company);
    const project = v("show", identity.show);
    const title = String(sheet?.title ?? "").trim() || "—";
    const approved = v("approved", identity.approved);
    const checked = v("checked", identity.checked);
    const drawn = v("drawnBy", identity.drawnBy);
    const sizeAuto =
      (typeof element.content?.size === "string" && element.content.size) ||
      paperSizeCode ||
      "C";
    const size = v("size", sizeAuto);
    const rev = v("revision", identity.revision);
    const dwgNo =
      sheetNumber > 0 && sheetCount > 0 ? `${sheetNumber} of ${sheetCount}` : "—";
    const logo =
      typeof titleBlockLogo === "string" && titleBlockLogo.startsWith("data:image/")
        ? titleBlockLogo
        : "";
    const mark = (company || "C").trim().charAt(0).toUpperCase() || "C";

    host.classList.add("pw-el-titleblock");
    host.innerHTML = `
      <div class="pw-tb">
        <div class="pw-tb-logo">
          ${
            logo
              ? `<img class="pw-tb-logo-img" src="${escapeXml(logo)}" alt="" />`
              : `<div class="pw-tb-logo-mark" aria-hidden="true">${escapeXml(mark)}</div>`
          }
          <div class="pw-tb-logo-name pw-editable" data-field-id="company">${escapeXml(
            company || "COMPANY"
          )}</div>
        </div>
        <div class="pw-tb-project pw-editable" data-field-id="show">
          <span class="pw-tb-label">PROJECT</span>
          <span class="pw-tb-value pw-tb-value-project">${escapeXml(project || "—")}</span>
        </div>
        <div class="pw-tb-title">
          <span class="pw-tb-label">TITLE</span>
          <span class="pw-tb-value pw-tb-value-xl">${escapeXml(title)}</span>
        </div>
        <div class="pw-tb-personnel">
          <div class="pw-tb-row pw-editable" data-field-id="approved">
            <span class="pw-tb-row-label">APPROVED</span>
            <span class="pw-tb-row-value">${escapeXml(approved)}</span>
          </div>
          <div class="pw-tb-row pw-editable" data-field-id="checked">
            <span class="pw-tb-row-label">CHECKED</span>
            <span class="pw-tb-row-value">${escapeXml(checked)}</span>
          </div>
          <div class="pw-tb-row pw-editable" data-field-id="drawnBy">
            <span class="pw-tb-row-label">DRAWN</span>
            <span class="pw-tb-row-value">${escapeXml(drawn)}</span>
          </div>
        </div>
        <div class="pw-tb-meta">
          <div class="pw-tb-cell pw-editable" data-field-id="size">
            <span class="pw-tb-label">SIZE</span>
            <span class="pw-tb-value">${escapeXml(size)}</span>
          </div>
          <div class="pw-tb-cell pw-tb-dwg">
            <span class="pw-tb-label">DWG NO</span>
            <span class="pw-tb-value pw-tb-value-lg">${escapeXml(dwgNo)}</span>
          </div>
          <div class="pw-tb-cell pw-tb-rev pw-editable" data-field-id="revision">
            <span class="pw-tb-label">REV</span>
            <span class="pw-tb-value pw-tb-value-lg">${escapeXml(rev)}</span>
          </div>
        </div>
      </div>`;
    scheduleTitleBlockFits(host);
  },
});

registerElementRenderer({
  type: "detailTable",
  label: "Detail table",
  render(host, ctx) {
    const { element } = ctx;
    const fields = Array.isArray(element.content?.fields)
      ? /** @type {({ id: string, label: string, auto: string } | { section: string })[]} */ (
          element.content.fields
        )
      : [];
    const title =
      typeof element.content?.title === "string" ? element.content.title : "Details";
    const rows = fields.map((f) =>
      "section" in f
        ? { section: f.section }
        : {
            id: f.id,
            label: f.label,
            value: resolveFieldValue(element, f.id, f.auto ?? ""),
          }
    );
    host.classList.add("pw-el-detail");
    applyFontSize(host, element);
    host.innerHTML = detailTableHtml(rows, { title });
  },
});

registerElementRenderer({
  type: "notes",
  label: "Notes",
  render(host, ctx) {
    const { element, sheet } = ctx;
    const text = resolveFieldValue(
      element,
      "body",
      typeof element.content?.body === "string" ? element.content.body : sheet.notes
    );
    host.classList.add("pw-el-notes");
    applyFontSize(host, element);
    host.innerHTML = `
      <div class="pw-el-notes-title">Notes</div>
      <div class="pw-el-notes-body pw-editable" data-field-id="body">${escapeXml(text || "")}</div>`;
  },
});

registerElementRenderer({
  type: "text",
  label: "Text",
  render(host, ctx) {
    const { element } = ctx;
    const text = resolveFieldValue(
      element,
      "body",
      typeof element.content?.body === "string" ? element.content.body : ""
    );
    const heading = element.content?.heading === true;
    host.classList.add("pw-el-text");
    if (heading) host.classList.add("is-heading");
    applyFontSize(host, element);
    host.innerHTML = `<div class="pw-el-text-body pw-editable" data-field-id="body">${escapeXml(text || "")}</div>`;
  },
});

registerElementRenderer({
  type: "scopeSummary",
  label: "Scope summary",
  render(host, ctx) {
    const { element, siteExports } = ctx;
    const auto =
      typeof element.content?.body === "string"
        ? element.content.body
        : buildLightScopeSummary(siteExports);
    const text = resolveFieldValue(element, "body", auto);
    host.classList.add("pw-el-notes");
    applyFontSize(host, element);
    host.innerHTML = `
      <div class="pw-el-notes-title">Scope of work</div>
      <div class="pw-el-notes-body pw-editable" data-field-id="body">${escapeXml(text || "")}</div>`;
  },
});

/** @param {Record<string, unknown>} siteExports */
function buildLightScopeSummary(siteExports) {
  const led = /** @type {{ grids?: unknown[] } | null} */ (siteExports.led);
  const proj = /** @type {{ screens?: unknown[] } | null} */ (siteExports.projector);
  const sf = /** @type {{ nodes?: unknown[] } | null} */ (siteExports.signalFlow);
  const cm = /** @type {{ surfaces?: unknown[], rasters?: unknown[] } | null} */ (
    siteExports.contentMaps
  );
  const parts = [];
  const walls = Array.isArray(led?.grids) ? led.grids.length : 0;
  const screens = Array.isArray(proj?.screens) ? proj.screens.length : 0;
  const devices = Array.isArray(sf?.nodes) ? sf.nodes.length : 0;
  const surfaces = Array.isArray(cm?.surfaces) ? cm.surfaces.length : 0;
  const rasters = Array.isArray(cm?.rasters) ? cm.rasters.length : 0;
  if (walls) parts.push(`${walls} LED wall${walls === 1 ? "" : "s"}`);
  if (screens) parts.push(`${screens} projection screen${screens === 1 ? "" : "s"}`);
  if (devices) parts.push(`${devices} signal-flow device${devices === 1 ? "" : "s"}`);
  if (surfaces) parts.push(`${surfaces} media surface${surfaces === 1 ? "" : "s"}`);
  if (rasters) parts.push(`${rasters} output raster${rasters === 1 ? "" : "s"}`);
  if (!parts.length) return "Add scope notes for this show.";
  return `This packet covers: ${parts.join(", ")}.`;
}
