import { escapeXml } from "./shared/dom.js";

/**
 * @param {{
 *   container: HTMLElement,
 *   places: { id: string, name: string }[],
 *   nodes: { id: string, name: string, placeId?: string | null }[],
 *   selectedNodeIds: string[],
 *   onAddPlace: (name: string) => void,
 *   onRenamePlace: (placeId: string, name: string) => void,
 *   onDeletePlace: (placeId: string) => void,
 *   onAssignPlace: (placeId: string | null) => void,
 * }} options
 */
export function renderPlacesPanel({
  container,
  places,
  nodes,
  selectedNodeIds,
  onAddPlace,
  onRenamePlace,
  onDeletePlace,
  onAssignPlace,
}) {
  const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));
  const sharedPlaceId =
    selectedNodes.length > 0 &&
    selectedNodes.every((n) => n.placeId && n.placeId === selectedNodes[0].placeId)
      ? selectedNodes[0].placeId
      : null;

  const placeRows =
    places.length === 0
      ? `<p class="sf-places-empty">No places yet — add locations like FOH, Stage, or AV closet.</p>`
      : places
          .map((place) => {
            const count = nodes.filter((n) => n.placeId === place.id).length;
            const isAssigned = sharedPlaceId === place.id;
            return `
        <div class="sf-place-row${isAssigned ? " is-assigned" : ""}" data-place-id="${place.id}">
          <button type="button" class="sf-place-assign" data-place-id="${place.id}" title="Assign selected devices to this place">
            <span class="sf-place-name">${escapeXml(place.name)}</span>
            <span class="sf-place-meta">${count} device${count === 1 ? "" : "s"}</span>
          </button>
          <div class="sf-place-actions">
            <button type="button" class="btn btn-icon sf-place-rename" data-place-id="${place.id}" aria-label="Rename ${escapeXml(place.name)}" title="Rename">✎</button>
            <button type="button" class="btn btn-icon sf-place-delete" data-place-id="${place.id}" aria-label="Delete ${escapeXml(place.name)}" title="Delete">×</button>
          </div>
        </div>`;
          })
          .join("");

  let assignHint = "";
  if (selectedNodes.length === 1) {
    assignHint = `<strong>${escapeXml(selectedNodes[0].name)}</strong>`;
  } else if (selectedNodes.length > 1) {
    assignHint = `<strong>${selectedNodes.length} selected</strong>`;
  }

  container.innerHTML = `
    <div class="sf-places-panel">
      ${assignHint ? `<p class="sf-places-assign-hint">${assignHint}</p>` : ""}
      ${
        sharedPlaceId
          ? `<button type="button" class="btn btn-secondary btn-sm sf-place-clear" id="sf-place-clear">Clear assignment</button>`
          : ""
      }
      <div class="sf-places-list" role="list">${placeRows}</div>
      <button type="button" class="sf-palette-action sf-palette-action-primary" id="sf-add-place">
        <span class="sf-palette-action-label">Add place</span>
      </button>
      <form class="sf-places-new-form" id="sf-new-place-form" hidden>
        <input type="text" name="placeName" maxlength="48" placeholder="e.g. FOH, Stage, AV rack" aria-label="Place name" required />
        <button type="submit" class="btn btn-primary btn-sm">Add</button>
        <button type="button" class="btn btn-secondary btn-sm" id="sf-new-place-cancel">Cancel</button>
      </form>
    </div>`;

  container.querySelector("#sf-add-place")?.addEventListener("click", () => {
    container.querySelector("#sf-new-place-form")?.removeAttribute("hidden");
    /** @type {HTMLInputElement | null} */ (
      container.querySelector("#sf-new-place-form input[name=placeName]")
    )?.focus();
  });

  container.querySelector("#sf-new-place-cancel")?.addEventListener("click", () => {
    const form = container.querySelector("#sf-new-place-form");
    form?.setAttribute("hidden", "");
    const input = /** @type {HTMLInputElement | null} */ (
      form?.querySelector("input[name=placeName]")
    );
    if (input) input.value = "";
  });

  container.querySelector("#sf-new-place-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.currentTarget);
    const input = /** @type {HTMLInputElement} */ (form.elements.namedItem("placeName"));
    const name = input.value.trim();
    if (!name) {
      input.setCustomValidity("Enter a place name.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    onAddPlace(name);
    form.setAttribute("hidden", "");
    input.value = "";
  });

  container.querySelector("#sf-place-clear")?.addEventListener("click", () => {
    onAssignPlace(null);
  });

  container.querySelectorAll(".sf-place-assign").forEach((btn) => {
    btn.addEventListener("click", () => {
      const placeId = /** @type {HTMLButtonElement} */ (btn).dataset.placeId;
      if (placeId) onAssignPlace(placeId);
    });
  });

  container.querySelectorAll(".sf-place-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const placeId = /** @type {HTMLButtonElement} */ (btn).dataset.placeId;
      if (placeId) onDeletePlace(placeId);
    });
  });

  container.querySelectorAll(".sf-place-rename").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const placeId = /** @type {HTMLButtonElement} */ (btn).dataset.placeId;
      const place = places.find((p) => p.id === placeId);
      if (!placeId || !place) return;
      const next = window.prompt("Rename place", place.name);
      if (next == null) return;
      onRenamePlace(placeId, next);
    });
  });
}
