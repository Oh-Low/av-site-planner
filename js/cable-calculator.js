/**
 * Cable calculator UI — domain state/cards live in js/domain/cable.js.
 */

import { getCalculatorExport } from "./calculator-instances.js";
import { placesFromSiteExports } from "./domain/places.js";
import {
  buildPlaceCards,
  buildRouteCards,
  emptyCableState,
  formatCablePath,
  groupRowsByCableType,
  manualCablesToRows,
  normalizeCableAmount,
  normalizeCableState,
  pruneManualCables,
} from "./domain/cable.js";
import { escapeXml } from "./shared/dom.js";
import { uid } from "./shared/id.js";

export {
  buildPlaceCards,
  buildRouteCards,
  collapseRowsByDevicePair,
  emptyCableState,
  formatCablePath,
  groupRowsByCableType,
  inferCableType,
  inferInputPortLabel,
  manualCablesToRows,
  matchRouteConnections,
  normalizeCableAmount,
  normalizeCableState,
  pruneManualCables,
} from "./domain/cable.js";

/**
 * @param {CableRow[]} rows
 * @param {{ removable?: boolean, cardTitle?: string }} [options]
 */
function renderTypeGroups(rows, options = {}) {
  const groups = groupRowsByCableType(rows);
  if (!groups.length) return "";
  const removable = options.removable === true;
  const cardTitle = options.cardTitle ?? "";

  return `<ul class="cable-card-groups">
    ${groups
      .map(
        (group) => `
      <li class="cable-type-group">
        <div class="cable-type-header">
          <span class="cable-type-name">${escapeXml(group.type)}</span>
          <span class="cable-type-count">${group.count}</span>
        </div>
        <ul class="cable-type-paths">
          ${group.rows
            .map((row) => {
              const path = formatCablePath(row, cardTitle);
              const amount = normalizeCableAmount(row.amount, 1);
              const amountHtml =
                amount > 1 ? `<span class="cable-card-amount">×${amount}</span>` : "";
              const removeBtn = removable
                ? `<button type="button" class="cable-manual-remove" data-manual-id="${escapeXml(row.connectionId)}" title="Remove cable" aria-label="Remove cable">×</button>`
                : "";
              return `
            <li class="cable-card-path${removable ? " is-manual" : ""}">
              <span class="cable-card-path-text">${escapeXml(path)}${amountHtml}</span>
              ${removeBtn}
            </li>`;
            })
            .join("")}
        </ul>
      </li>`
      )
      .join("")}
  </ul>`;
}

function renderTypeAndAmountFields() {
  return `
    <div class="cable-manual-type-row">
      <input type="text" name="cableType" class="field-input cable-manual-type" maxlength="32" placeholder="Cable type (e.g. HDMI)" aria-label="Cable type" required />
      <input type="number" name="amount" class="field-input cable-manual-amount" min="1" max="999" value="1" aria-label="Amount" required />
    </div>`;
}

/**
 * @param {CableCard} card
 * @param {"route" | "place"} kind
 * @param {ManualCable[]} manualCables
 */
function renderCard(card, kind, manualCables) {
  const autoHtml =
    card.rows.length === 0
      ? `<p class="cable-card-empty">${escapeXml(card.emptyMessage)}</p>`
      : renderTypeGroups(card.rows);

  const manualRows = manualCablesToRows(manualCables);
  const manualGroupsHtml = renderTypeGroups(manualRows, {
    removable: true,
    cardTitle: card.title,
  });
  const manualEmpty =
    manualRows.length === 0
      ? `<p class="cable-card-empty cable-card-empty--manual">No manual cables yet</p>`
      : "";

  return `
    <article class="cable-card" data-card-id="${escapeXml(card.id)}" data-card-kind="${kind}">
      <header class="cable-card-header">
        <h4 class="cable-card-title">${escapeXml(card.title)}</h4>
        <p class="cable-card-meta">${escapeXml(card.lengthLabel)}</p>
      </header>
      <div class="cable-card-auto">${autoHtml}</div>
      <div class="cable-card-divider" role="separator" aria-hidden="true"></div>
      <div class="cable-card-manual">
        ${manualGroupsHtml}
        ${manualEmpty}
        <button type="button" class="btn btn-secondary btn-sm cable-add-btn">Add cable</button>
        <form class="cable-manual-form" hidden>
          ${renderTypeAndAmountFields()}
          <input type="text" name="fromDevice" class="field-input cable-manual-from" maxlength="48" placeholder="From device (optional)" aria-label="From device" />
          <input type="text" name="toDevice" class="field-input cable-manual-to" maxlength="48" placeholder="To device (optional)" aria-label="To device" />
          <div class="cable-manual-actions">
            <button type="submit" class="btn btn-primary btn-sm">Add</button>
            <button type="button" class="btn btn-secondary btn-sm cable-manual-cancel">Cancel</button>
          </div>
        </form>
      </div>
    </article>`;
}

/**
 * @param {CableCard[]} cards
 * @param {"route" | "place"} kind
 * @param {Record<string, ManualCable[]>} manualByCard
 * @param {string} emptyText
 */
function renderCardGrid(cards, kind, manualByCard, emptyText) {
  if (!cards.length) {
    return `<p class="cable-section-empty">${escapeXml(emptyText)}</p>`;
  }
  return cards.map((card) => renderCard(card, kind, manualByCard[card.id] ?? [])).join("");
}

export function initCableCalculator() {
  const routeCardsEl = document.getElementById("cable-route-cards");
  const placeCardsEl = document.getElementById("cable-place-cards");
  const statusEl = document.getElementById("cable-status");

  /** @type {CableState} */
  let localState = emptyCableState();

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  /** @param {"route" | "place"} kind @param {string} cardId */
  function getManualList(kind, cardId) {
    const map = kind === "route" ? localState.routes : localState.places;
    return map[cardId] ?? [];
  }

  /** @param {"route" | "place"} kind @param {string} cardId @param {ManualCable[]} list */
  function setManualList(kind, cardId, list) {
    const next = { ...localState, routes: { ...localState.routes }, places: { ...localState.places } };
    const map = kind === "route" ? next.routes : next.places;
    if (list.length) map[cardId] = list;
    else delete map[cardId];
    localState = next;
  }

  function refresh() {
    if (!routeCardsEl || !placeCardsEl) return;

    const sf = /** @type {{
      places?: CablePlace[],
      nodes?: CableNode[],
      connections?: CableConnection[],
      customGearTypes?: import("./signal-flow-data.js").GearType[],
    } | null} */ (getCalculatorExport("signalFlow"));
    const gp = /** @type {{
      cableRoutes?: CableRoute[],
      scale?: {
        pointA: { x: number, y: number } | null,
        pointB: { x: number, y: number } | null,
        distanceMeters: number | null,
        unit?: "metric" | "imperial",
      } | null,
    } | null} */ (getCalculatorExport("groundplan"));

    const places = placesFromSiteExports({ signalFlow: sf ?? undefined });
    const nodes = Array.isArray(sf?.nodes) ? sf.nodes : [];
    const connections = Array.isArray(sf?.connections) ? sf.connections : [];
    const customGearTypes = Array.isArray(sf?.customGearTypes) ? sf.customGearTypes : [];
    const routes = Array.isArray(gp?.cableRoutes) ? gp.cableRoutes : [];

    localState = pruneManualCables(
      localState,
      routes.map((r) => r.id),
      places.map((p) => p.id)
    );

    const routeCards = buildRouteCards({
      places,
      nodes,
      connections,
      customGearTypes,
      routes,
      scale: gp?.scale ?? null,
    });
    const placeCards = buildPlaceCards({
      places,
      nodes,
      connections,
      customGearTypes,
    });

    routeCardsEl.innerHTML = renderCardGrid(
      routeCards,
      "route",
      localState.routes,
      "No cable routes on the groundplan yet."
    );
    placeCardsEl.innerHTML = renderCardGrid(
      placeCards,
      "place",
      localState.places,
      "No places in signal flow yet."
    );

    const autoCount =
      routeCards.reduce((n, c) => n + c.rows.length, 0) +
      placeCards.reduce((n, c) => n + c.rows.length, 0);
    const manualCount =
      Object.values(localState.routes).reduce(
        (n, list) => n + list.reduce((sum, c) => sum + normalizeCableAmount(c.amount, 1), 0),
        0
      ) +
      Object.values(localState.places).reduce(
        (n, list) => n + list.reduce((sum, c) => sum + normalizeCableAmount(c.amount, 1), 0),
        0
      );
    const total = autoCount + manualCount;
    setStatus(
      `${routeCards.length} route${routeCards.length === 1 ? "" : "s"} · ${placeCards.length} place${
        placeCards.length === 1 ? "" : "s"
      } · ${total} cable${total === 1 ? "" : "s"}`
    );
  }

  /**
   * @param {HTMLElement} cardEl
   * @returns {{ kind: "route" | "place", cardId: string } | null}
   */
  function cardContext(cardEl) {
    const cardId = cardEl.getAttribute("data-card-id");
    const kind = cardEl.getAttribute("data-card-kind");
    if (!cardId || (kind !== "route" && kind !== "place")) return null;
    return { kind, cardId };
  }

  /** @param {HTMLElement} root */
  function bindCardGrid(root) {
    root.addEventListener("click", (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const cardEl = target.closest(".cable-card");
      if (!(cardEl instanceof HTMLElement)) return;
      const ctx = cardContext(cardEl);
      if (!ctx) return;

      if (target.closest(".cable-add-btn")) {
        const form = cardEl.querySelector(".cable-manual-form");
        const addBtn = cardEl.querySelector(".cable-add-btn");
        if (form instanceof HTMLFormElement) {
          form.hidden = false;
          addBtn?.setAttribute("hidden", "");
          const type = form.querySelector('[name="cableType"]');
          if (type instanceof HTMLInputElement) type.focus();
        }
        return;
      }

      if (target.closest(".cable-manual-cancel")) {
        const form = cardEl.querySelector(".cable-manual-form");
        const addBtn = cardEl.querySelector(".cable-add-btn");
        if (form instanceof HTMLFormElement) {
          form.hidden = true;
          form.reset();
        }
        addBtn?.removeAttribute("hidden");
        return;
      }

      const removeBtn = target.closest(".cable-manual-remove");
      if (removeBtn instanceof HTMLElement) {
        const manualId = removeBtn.getAttribute("data-manual-id");
        if (!manualId) return;
        const next = getManualList(ctx.kind, ctx.cardId).filter((c) => c.id !== manualId);
        setManualList(ctx.kind, ctx.cardId, next);
        refresh();
      }
    });

    root.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.classList.contains("cable-manual-form")) return;
      event.preventDefault();
      const cardEl = form.closest(".cable-card");
      if (!(cardEl instanceof HTMLElement)) return;
      const ctx = cardContext(cardEl);
      if (!ctx) return;

      const typeEl = form.elements.namedItem("cableType");
      const amountEl = form.elements.namedItem("amount");
      const fromEl = form.elements.namedItem("fromDevice");
      const toEl = form.elements.namedItem("toDevice");
      const cableLabel =
        typeEl instanceof HTMLInputElement && typeEl.value.trim() ? typeEl.value.trim() : "";
      const fromDevice = fromEl instanceof HTMLInputElement ? fromEl.value.trim() : "";
      const toDevice = toEl instanceof HTMLInputElement ? toEl.value.trim() : "";
      const amount =
        amountEl instanceof HTMLInputElement
          ? normalizeCableAmount(amountEl.value, 1)
          : 1;
      if (!cableLabel) return;

      const cable = /** @type {ManualCable} */ ({
        id: uid("mcable"),
        cableLabel,
        fromDevice,
        toDevice,
        amount,
      });
      setManualList(ctx.kind, ctx.cardId, [...getManualList(ctx.kind, ctx.cardId), cable]);
      refresh();
    });
  }

  if (routeCardsEl) bindCardGrid(routeCardsEl);
  if (placeCardsEl) bindCardGrid(placeCardsEl);

  document.querySelector('.tab[data-tab="cable-calculator"]')?.addEventListener("click", () => {
    refresh();
  });

  refresh();

  function exportState() {
    return {
      routes: { ...localState.routes },
      places: { ...localState.places },
    };
  }

  /** @param {object} data */
  function importState(data) {
    localState = normalizeCableState(data);
    refresh();
  }

  return { exportState, importState, refresh };
}

export const calculatorPlugin = {
  meta: {
    id: "cable-calculator",
    tabPanelId: "cable-calculator",
    stateKey: "cable",
    label: "Cable Calculator",
    requiredForSave: false,
    emptyState: emptyCableState,
    /** @param {unknown} data */
    validateState(data) {
      return normalizeCableState(data);
    },
  },
  init: initCableCalculator,
};
