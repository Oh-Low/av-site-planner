import { bindColorSwatchButtons, DEFAULT_PALETTE_COLOR, renderColorSwatchButton } from "./shared/color-palette.js";
import { escapeXml } from "./shared/dom.js";

/**
 * @param {HTMLElement} container
 * @param {{
 *   places: { id: string, name: string }[],
 *   placedPlaceIds: Set<string>,
 *   getMarkerStyle?: (placeId: string) => { color: string, shape: string, shapeGlyph: string } | null,
 *   onColorChange?: (placeId: string, color: string) => void,
 *   onShapeChange?: (placeId: string) => void,
 * }} options
 */
export function renderPlacesPalette(container, {
  places,
  placedPlaceIds,
  getMarkerStyle,
  onColorChange,
  onShapeChange,
}) {
  if (places.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = places
    .map((place) => {
      const onPlan = placedPlaceIds.has(place.id);
      const style = onPlan && getMarkerStyle ? getMarkerStyle(place.id) : null;
      const controls = style
        ? `<span class="gp-place-chip-meta">
            <span class="gp-place-chip-badge">On plan</span>
            ${renderColorSwatchButton({
              color: style.color,
              className: "gp-place-color-btn",
              dataset: { placeId: place.id },
              ariaLabel: `Color for ${place.name}`,
            })}
            <button type="button" class="gp-place-shape-btn" data-place-id="${escapeXml(place.id)}" title="Change shape (${escapeXml(style.shape)})" aria-label="Change shape for ${escapeXml(place.name)}">${escapeXml(style.shapeGlyph)}</button>
          </span>`
        : "";
      return `<button type="button" class="gp-place-chip${onPlan ? " is-placed" : ""}" draggable="true" data-place-id="${escapeXml(place.id)}" title="Drag onto the groundplan">
        <span class="gp-place-chip-name">${escapeXml(place.name)}</span>
        ${controls}
      </button>`;
    })
    .join("");

  container.querySelectorAll(".gp-place-chip").forEach((chip) => {
    chip.addEventListener("dragstart", (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest(".gp-place-chip-meta")) {
        e.preventDefault();
        return;
      }
      const placeId = /** @type {HTMLElement} */ (chip).dataset.placeId;
      if (placeId && e.dataTransfer) {
        e.dataTransfer.setData("text/av-place-id", placeId);
        e.dataTransfer.effectAllowed = "copy";
      }
    });
  });

  bindColorSwatchButtons(container, ".gp-place-color-btn", {
    getColor: (wrap) => {
      const placeId = wrap.dataset.placeId;
      if (placeId && getMarkerStyle) {
        return getMarkerStyle(placeId)?.color ?? DEFAULT_PALETTE_COLOR;
      }
      const btn = wrap.querySelector(".gp-color-swatch-btn");
      return btn instanceof HTMLElement
        ? btn.style.getPropertyValue("--swatch-color").trim() || DEFAULT_PALETTE_COLOR
        : DEFAULT_PALETTE_COLOR;
    },
    onColorChange: (wrap, color) => {
      const placeId = wrap.dataset.placeId;
      if (placeId) onColorChange?.(placeId, color);
    },
  });

  container.querySelectorAll(".gp-place-shape-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const placeId = /** @type {HTMLElement} */ (btn).dataset.placeId;
      if (placeId) onShapeChange?.(placeId);
    });
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  });
}

/**
 * @param {{
 *   addBtn: HTMLElement | null,
 *   form: HTMLFormElement | null,
 *   cancelBtn: HTMLElement | null,
 *   onAddPlace: (name: string) => boolean,
 * }} options
 */
export function bindPlacesAddForm({ addBtn, form, cancelBtn, onAddPlace }) {
  addBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    form?.removeAttribute("hidden");
    /** @type {HTMLInputElement | null} */ (form?.querySelector("input[name=placeName]"))?.focus();
  });

  cancelBtn?.addEventListener("click", () => {
    form?.setAttribute("hidden", "");
    const input = /** @type {HTMLInputElement | null} */ (form?.querySelector("input[name=placeName]"));
    if (input) input.value = "";
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = /** @type {HTMLInputElement} */ (form.elements.namedItem("placeName"));
    const name = input.value.trim();
    if (!name) {
      input.setCustomValidity("Enter a place name.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    if (!onAddPlace(name)) {
      input.setCustomValidity("A place with that name already exists.");
      input.reportValidity();
      return;
    }
    form.setAttribute("hidden", "");
    input.value = "";
  });
}
