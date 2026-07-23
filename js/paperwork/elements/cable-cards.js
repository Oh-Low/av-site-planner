import {
  buildRouteCards,
  formatCablePath,
  groupRowsByCableType,
  manualCablesToRows,
  normalizeCableAmount,
} from "../../cable-calculator.js?v=16";
import { escapeXml } from "../../shared/dom.js";
import { registerElementRenderer } from "./registry.js?v=3";

const DEFAULT_CARD_SCALE = 1;
const MIN_CARD_SCALE = 0.75;
const MAX_CARD_SCALE = 4;

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeCableCardScale(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CARD_SCALE;
  return Math.min(MAX_CARD_SCALE, Math.max(MIN_CARD_SCALE, Math.round(n * 100) / 100));
}

/**
 * Print-safe cable cards for paperwork — route cards from the Cable Calculator,
 * without add/remove controls.
 */
registerElementRenderer({
  type: "cableCards",
  label: "Cable cards",
  render(host, ctx) {
    const { element, siteExports } = ctx;
    const sf = /** @type {{
      places?: object[],
      nodes?: object[],
      connections?: object[],
      customGearTypes?: object[],
    } | null} */ (siteExports?.signalFlow ?? null);
    const gp = /** @type {{
      cableRoutes?: object[],
      scale?: object | null,
    } | null} */ (siteExports?.groundplan ?? null);
    const cable = /** @type {{
      routes?: Record<string, object[]>,
    } | null} */ (siteExports?.cable ?? null);

    const places = Array.isArray(sf?.places) ? sf.places : [];
    const nodes = Array.isArray(sf?.nodes) ? sf.nodes : [];
    const connections = Array.isArray(sf?.connections) ? sf.connections : [];
    const customGearTypes = Array.isArray(sf?.customGearTypes) ? sf.customGearTypes : [];
    const routes = Array.isArray(gp?.cableRoutes) ? gp.cableRoutes : [];
    const manualRoutes = cable?.routes && typeof cable.routes === "object" ? cable.routes : {};
    const cardScale = normalizeCableCardScale(element.content?.cardScale);

    const routeCards = buildRouteCards({
      places,
      nodes,
      connections,
      customGearTypes,
      routes,
      scale: gp?.scale ?? null,
    });

    host.classList.add("pw-el-cable-cards");
    host.style.setProperty("--pw-cable-scale", String(cardScale));
    if (!routeCards.length) {
      host.innerHTML =
        '<div class="pw-el-cable-cards-empty">No cable routes yet — add them in Groundplan.</div>';
      return;
    }

    host.innerHTML = `
      <div class="pw-el-cable-cards-body">
        <section class="pw-cable-section">
          <h3 class="pw-cable-section-title">Cable routes</h3>
          <div class="pw-cable-card-grid">
            ${routeCards.map((card) => cardHtml(card, manualRoutes[card.id] ?? [])).join("")}
          </div>
        </section>
      </div>`;
  },
});

/**
 * @param {import("../../cable-calculator.js").CableCard} card
 * @param {object[]} manuals
 */
function cardHtml(card, manuals) {
  const autoHtml =
    card.rows.length === 0
      ? `<p class="pw-cable-card-empty">${escapeXml(card.emptyMessage)}</p>`
      : typeGroupsHtml(card.rows, card.title);
  const manualRows = manualCablesToRows(/** @type {import("../../cable-calculator.js").ManualCable[]} */ (manuals));
  const manualHtml =
    manualRows.length > 0
      ? `<div class="pw-cable-card-manual">
          <p class="pw-cable-card-manual-label">Manual</p>
          ${typeGroupsHtml(manualRows, card.title)}
        </div>`
      : "";

  return `
    <article class="pw-cable-card">
      ${
        card.color
          ? `<span class="pw-cable-card-swatch" style="background:${escapeXml(card.color)}" title="Route color" aria-hidden="true"></span>`
          : ""
      }
      <header class="pw-cable-card-header">
        <h4 class="pw-cable-card-title">${escapeXml(card.title)}</h4>
        <p class="pw-cable-card-meta">${escapeXml(card.lengthLabel)}</p>
      </header>
      <div class="pw-cable-card-auto">${autoHtml}</div>
      ${manualHtml}
    </article>`;
}

/**
 * @param {import("../../cable-calculator.js").CableRow[]} rows
 * @param {string} cardTitle
 */
function typeGroupsHtml(rows, cardTitle) {
  const groups = groupRowsByCableType(rows);
  if (!groups.length) return "";
  return `<ul class="pw-cable-card-groups">
    ${groups
      .map(
        (group) => `
      <li class="pw-cable-type-group">
        <div class="pw-cable-type-header">
          <span class="pw-cable-type-name">${escapeXml(group.type)}</span>
          <span class="pw-cable-type-count">${group.count}</span>
        </div>
        <ul class="pw-cable-type-paths">
          ${group.rows
            .map((row) => {
              const path = formatCablePath(row, cardTitle);
              const amount = normalizeCableAmount(row.amount, 1);
              const amountHtml =
                amount > 1 ? `<span class="pw-cable-card-amount">×${amount}</span>` : "";
              return `<li class="pw-cable-card-path">${escapeXml(path)}${amountHtml}</li>`;
            })
            .join("")}
        </ul>
      </li>`
      )
      .join("")}
  </ul>`;
}
