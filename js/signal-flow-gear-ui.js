import { escapeXml } from "./shared/dom.js";
import { uid } from "./shared/id.js";
import {
  CONNECTOR_TYPES,
  GEAR_CATEGORIES,
  connectorColor,
  gearPortsToSideLists,
  sideListsToGearPorts,
} from "./signal-flow-gear-schema.js";
import { createGearType } from "./signal-flow-data.js";

/**
 * @param {string} label
 * @param {string | null | undefined} type
 */
function renderPortCell(label, type) {
  const typeHtml =
    type && type !== "—"
      ? `<span class="sf-port-type">${escapeXml(type)}</span>`
      : "";
  return `<span class="sf-port-label">${escapeXml(label)}</span>${typeHtml}`;
}

/**
 * Shared renderer for the port-row `<tr>` list of a gear table. Used by the
 * canvas nodes, the palette preview, and the gear editor preview so cells,
 * colors, and dividers always look the same.
 * @param {import("./signal-flow-gear-schema.js").GearPortRow[]} ports
 * @param {{ colorize?: boolean, interactive?: boolean }} [options]
 */
export function renderGearPortRowsHtml(ports, { colorize = false, interactive = false } = {}) {
  /**
   * @param {import("./signal-flow-gear-schema.js").GearPortRow} port
   * @param {number} row
   * @param {"input" | "output"} col
   */
  const cell = (port, row, col) => {
    const label = col === "input" ? port.input : port.output;
    const type = col === "input" ? port.inputType : port.outputType;
    const divider = col === "input" ? port.inputDivider : port.outputDivider;
    const color = colorize ? connectorColor(type) : null;

    const classes = ["sf-port", col === "input" ? "sf-port-in" : "sf-port-out"];
    if (divider) classes.push("sf-port-divider");
    if (color) classes.push("sf-port-colored");

    const style = color ? ` style="--sf-port-color:${color}"` : "";
    const attrs = interactive
      ? ` data-port-row="${row}" data-port-col="${col}" data-port-type="${escapeXml(type || "")}" title="${col === "input" ? "Input" : "Output"} — drag to connect"`
      : "";
    return `<td class="${classes.join(" ")}"${style}${attrs}>${renderPortCell(label, type)}</td>`;
  };

  return (ports ?? [])
    .map(
      (port, row) => `
      <tr>
        ${cell(port, row, "input")}
        ${cell(port, row, "output")}
      </tr>`
    )
    .join("");
}

/**
 * Optional note row shown above the ports. Renders nothing when the gear has
 * no note.
 * @param {string | null | undefined} note
 */
export function renderGearNoteRowHtml(note) {
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return "";
  return `
    <tr class="sf-node-note-row">
      <th class="sf-node-note" colspan="2"><div class="sf-node-note-text">${escapeXml(text)}</div></th>
    </tr>`;
}

/**
 * @param {{ defaultName: string, category: string, note?: string, ports: import("./signal-flow-gear-schema.js").GearPortRow[] }} gear
 * @param {{ name?: string, showCategory?: boolean, colorize?: boolean }} [options]
 */
export function renderGearPreviewHtml(gear, options = {}) {
  const name = options.name ?? gear.defaultName;
  const showCategory = options.showCategory !== false;
  const portRows = renderGearPortRowsHtml(gear.ports, { colorize: options.colorize === true });

  const categoryLine = showCategory
    ? `<div class="sf-gear-preview-category">${escapeXml(gear.category)}</div>`
    : "";

  const emptyHint =
    gear.ports.length === 0
      ? `<p class="sf-gear-preview-empty">Add at least one input or output port.</p>`
      : "";

  return `
    <div class="sf-gear-preview-node">
      <table class="sf-node-table">
        <thead>
          <tr>
            <th class="sf-node-header" colspan="2">
              <div class="sf-gear-preview-name">${escapeXml(name)}</div>
              ${categoryLine}
            </th>
          </tr>
          ${renderGearNoteRowHtml(gear.note)}
          <tr class="sf-col-labels">
            <th>Inputs</th>
            <th>Outputs</th>
          </tr>
        </thead>
        <tbody>${portRows}</tbody>
      </table>
      ${emptyHint}
    </div>`;
}

/**
 * One editable entry of a side list in the gear builder.
 * @typedef {{ key: string, kind: "port", label: string, type: string | null } | { key: string, kind: "divider" }} DraftItem
 */

/** @param {string | null} type */
function swatchStyle(type) {
  const color = connectorColor(type);
  return color ? ` style="--sf-swatch-color:${color}"` : "";
}

/** @param {string | null} current */
function typeOptionsHtml(current) {
  const known = CONNECTOR_TYPES.map(
    (t) =>
      `<option value="${escapeXml(t)}"${t === current ? " selected" : ""}>${escapeXml(t)}</option>`
  ).join("");
  const custom =
    current && !CONNECTOR_TYPES.includes(current)
      ? `<option value="${escapeXml(current)}" selected>${escapeXml(current)}</option>`
      : "";
  return `<option value=""${!current ? " selected" : ""}>None</option>${known}${custom}`;
}

/** @param {DraftItem} item */
function renderDraftItem(item) {
  if (item.kind === "divider") {
    return `
      <div class="sf-port-item sf-port-item-divider" data-key="${item.key}">
        <button type="button" class="sf-port-item-grip" title="Drag to reorder" aria-label="Drag divider to reorder">≡</button>
        <span class="sf-port-item-divider-bar" title="Divider"></span>
        <button type="button" class="sf-port-item-btn sf-port-item-remove" data-action="remove" title="Remove divider" aria-label="Remove divider">×</button>
      </div>`;
  }
  return `
    <div class="sf-port-item" data-key="${item.key}">
      <button type="button" class="sf-port-item-grip" title="Drag to reorder" aria-label="Drag port to reorder">≡</button>
      <span class="sf-port-item-swatch"${swatchStyle(item.type)} aria-hidden="true"></span>
      <input
        type="text"
        class="sf-port-item-label"
        value="${escapeXml(item.label)}"
        placeholder="Label"
        maxlength="32"
        aria-label="Port label"
      />
      <select class="sf-port-item-type" aria-label="Port connector type">
        ${typeOptionsHtml(item.type)}
      </select>
      <button type="button" class="sf-port-item-btn sf-port-item-remove" data-action="remove" title="Remove port" aria-label="Remove port">×</button>
    </div>`;
}

/**
 * Fill in blank labels ("HDMI 3", "Port 2", …) and strip editor keys so a
 * side list can feed the schema zip function.
 * @param {DraftItem[]} items
 * @returns {import("./signal-flow-gear-schema.js").GearSideItem[]}
 */
function finalizeSideItems(items) {
  /** @type {Record<string, number>} */
  const counts = {};
  return items.map((item) => {
    if (item.kind === "divider") return { kind: "divider" };
    const type = item.type || null;
    const family = type ?? "Port";
    counts[family] = (counts[family] ?? 0) + 1;
    const label = item.label.trim() || `${family} ${counts[family]}`;
    return { kind: "port", label, type };
  });
}

/**
 * Open the gear builder modal. With `gear` set, the modal edits that gear
 * (same id, same folder); otherwise it creates a new gear type.
 * @param {{
 *   mount: HTMLElement,
 *   onSave: (gear: import("./signal-flow-gear-schema.js").GearType) => void,
 *   gear?: import("./signal-flow-gear-schema.js").GearType | null,
 * }} options
 */
export function openGearBuilderModal({ mount, onSave, gear = null }) {
  const existing = mount.querySelector("#sf-gear-modal");
  if (existing) existing.remove();

  const isEdit = Boolean(gear);
  const title = isEdit ? "Edit gear" : "Create new gear";
  const submitLabel = isEdit ? "Update gear" : "Save gear";

  /** @type {{ name: string, category: string, inputs: DraftItem[], outputs: DraftItem[] }} */
  const draft = {
    name: gear?.label ?? "",
    category: gear?.category && GEAR_CATEGORIES.includes(gear.category) ? gear.category : GEAR_CATEGORIES[0],
    inputs: [],
    outputs: [],
  };

  if (gear) {
    const lists = gearPortsToSideLists(gear.ports);
    draft.inputs = lists.inputs.map((item) => ({ ...item, key: uid("pi") }));
    draft.outputs = lists.outputs.map((item) => ({ ...item, key: uid("pi") }));
  } else {
    draft.inputs = [{ key: uid("pi"), kind: "port", label: "", type: "HDMI" }];
    draft.outputs = [{ key: uid("pi"), kind: "port", label: "", type: "HDMI" }];
  }

  const overlay = document.createElement("div");
  overlay.id = "sf-gear-modal";
  overlay.className = "sf-gear-modal";
  overlay.innerHTML = `
    <div class="sf-gear-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="sf-gear-modal-title">
      <div class="sf-gear-modal-header">
        <h3 id="sf-gear-modal-title">${escapeXml(title)}</h3>
        <button type="button" class="sf-gear-modal-close btn btn-icon" aria-label="Close">×</button>
      </div>
      <div class="sf-gear-modal-body">
        <form class="sf-gear-form" id="sf-gear-form">
          <div class="sf-gear-field-row">
            <label class="sf-gear-field">
              <span class="sf-gear-field-label">Name</span>
              <input type="text" name="name" maxlength="48" value="${escapeXml(draft.name)}" placeholder="e.g. Blu-ray Player" required />
            </label>
            <label class="sf-gear-field">
              <span class="sf-gear-field-label">Type</span>
              <select name="category">
                ${GEAR_CATEGORIES.map((c) => `<option value="${escapeXml(c)}"${c === draft.category ? " selected" : ""}>${escapeXml(c)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="sf-gear-field">
            <span class="sf-gear-field-label">Note (optional)</span>
            <textarea name="note" rows="2" maxlength="200" placeholder="Shown on the device above its ports">${escapeXml(gear?.note ?? "")}</textarea>
          </label>
          <div class="sf-gear-ports-columns">
            <fieldset class="sf-connector-fieldset sf-gear-ports-side">
              <legend>Inputs</legend>
              <div class="sf-port-list-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-port" data-side="inputs">+ Port</button>
                <select class="sf-port-add-type" data-side="inputs" aria-label="Connector type for new input ports">
                  ${typeOptionsHtml("HDMI")}
                </select>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-divider" data-side="inputs">+ Divider</button>
              </div>
              <div class="sf-port-list" data-side="inputs"></div>
            </fieldset>
            <fieldset class="sf-connector-fieldset sf-gear-ports-side">
              <legend>Outputs</legend>
              <div class="sf-port-list-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-port" data-side="outputs">+ Port</button>
                <select class="sf-port-add-type" data-side="outputs" aria-label="Connector type for new output ports">
                  ${typeOptionsHtml("HDMI")}
                </select>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-divider" data-side="outputs">+ Divider</button>
              </div>
              <div class="sf-port-list" data-side="outputs"></div>
            </fieldset>
          </div>
          <p class="sf-gear-form-hint">Ports keep the order shown here. Dividers draw a thicker line between two ports.</p>
          <p class="sf-gear-form-error" id="sf-gear-form-error" hidden></p>
        </form>
        <div class="sf-gear-preview-panel">
          <div class="sf-gear-preview-label">Preview</div>
          <div class="sf-gear-preview-viewport" aria-label="Gear preview">
            <div class="sf-gear-preview-mount" id="sf-gear-preview-mount"></div>
          </div>
        </div>
      </div>
      <div class="sf-gear-modal-footer">
        <button type="button" class="btn btn-secondary sf-gear-cancel">Cancel</button>
        <button type="submit" form="sf-gear-form" class="btn btn-primary sf-gear-submit">${escapeXml(submitLabel)}</button>
      </div>
    </div>`;

  mount.appendChild(overlay);

  const dialog = overlay.querySelector(".sf-gear-modal-dialog");
  const form = /** @type {HTMLFormElement} */ (overlay.querySelector("#sf-gear-form"));
  const previewMount = overlay.querySelector("#sf-gear-preview-mount");
  const formError = overlay.querySelector("#sf-gear-form-error");
  const nameInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("name"));
  const categorySelect = /** @type {HTMLSelectElement} */ (form.elements.namedItem("category"));
  const noteInput = /** @type {HTMLTextAreaElement} */ (form.elements.namedItem("note"));

  let backdropPointerDown = false;
  let backdropDragDistance = 0;
  let backdropLastPt = /** @type {{ x: number, y: number } | null} */ (null);

  /** @param {"inputs" | "outputs"} side */
  function sideItems(side) {
    return side === "inputs" ? draft.inputs : draft.outputs;
  }

  /** @param {Element} el @returns {{ side: "inputs" | "outputs", items: DraftItem[], index: number } | null} */
  function locateItem(el) {
    const itemEl = el.closest(".sf-port-item");
    const listEl = el.closest(".sf-port-list");
    const side = listEl?.dataset.side === "outputs" ? "outputs" : "inputs";
    if (!itemEl) return null;
    const items = sideItems(side);
    const index = items.findIndex((i) => i.key === itemEl.dataset.key);
    return index === -1 ? null : { side, items, index };
  }

  function buildDraftPorts() {
    return sideListsToGearPorts(finalizeSideItems(draft.inputs), finalizeSideItems(draft.outputs));
  }

  function updatePreview() {
    if (!previewMount) return;
    const name = nameInput.value.trim() || "Device";
    previewMount.innerHTML = renderGearPreviewHtml(
      {
        defaultName: name,
        category: categorySelect.value,
        note: noteInput.value,
        ports: buildDraftPorts(),
      },
      { name, colorize: true }
    );
    if (formError) formError.hidden = true;
  }

  function renderLists() {
    form.querySelectorAll(".sf-port-list").forEach((listEl) => {
      const side = /** @type {HTMLElement} */ (listEl).dataset.side === "outputs" ? "outputs" : "inputs";
      const items = sideItems(side);
      listEl.innerHTML = items.length
        ? items.map((item) => renderDraftItem(item)).join("")
        : `<p class="sf-port-list-empty">No ${side}</p>`;
    });
    updatePreview();
  }

  function close() {
    overlay.remove();
  }

  form.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("[data-action]");
    if (!btn) return;
    const action = /** @type {HTMLElement} */ (btn).dataset.action;

    if (action === "add-port" || action === "add-divider") {
      const side = /** @type {HTMLElement} */ (btn).dataset.side === "outputs" ? "outputs" : "inputs";
      const items = sideItems(side);
      if (action === "add-port") {
        const addTypeSelect = /** @type {HTMLSelectElement | null} */ (
          form.querySelector(`.sf-port-add-type[data-side="${side}"]`)
        );
        items.push({
          key: uid("pi"),
          kind: "port",
          label: "",
          type: addTypeSelect?.value || null,
        });
      } else {
        items.push({ key: uid("pi"), kind: "divider" });
      }
      renderLists();
      const lastLabel = form.querySelector(
        `.sf-port-list[data-side="${side}"] .sf-port-item:last-child .sf-port-item-label`
      );
      // preventScroll keeps the dialog from snapping down when the new row
      // is added below the visible area.
      /** @type {HTMLInputElement | null} */ (lastLabel)?.focus({ preventScroll: true });
      return;
    }

    const located = locateItem(btn);
    if (!located) return;
    const { items, index } = located;

    if (action === "remove") {
      items.splice(index, 1);
      renderLists();
    }
  });

  // --- Drag-to-reorder for port and divider rows ---------------------------

  const rowDrag = {
    active: false,
    /** @type {"inputs" | "outputs"} */ side: "inputs",
    /** @type {HTMLElement | null} */ el: null,
    /** @type {HTMLElement | null} */ listEl: null,
  };

  /** Reorder the draft side array to match the list's current DOM order. */
  function syncDraftOrderFromDom(side) {
    const listEl = form.querySelector(`.sf-port-list[data-side="${side}"]`);
    if (!listEl) return;
    const orderedKeys = [...listEl.querySelectorAll(".sf-port-item")].map(
      (el) => /** @type {HTMLElement} */ (el).dataset.key
    );
    sideItems(side).sort((a, b) => orderedKeys.indexOf(a.key) - orderedKeys.indexOf(b.key));
  }

  /** @param {PointerEvent} e */
  function onRowDragMove(e) {
    if (!rowDrag.active || !rowDrag.el || !rowDrag.listEl) return;
    // Move the dragged row in the DOM to follow the pointer, then mirror the
    // new order into the draft so the preview tracks the drag live.
    const siblings = [...rowDrag.listEl.querySelectorAll(".sf-port-item")].filter(
      (el) => el !== rowDrag.el
    );
    let placed = false;
    for (const el of siblings) {
      const rect = el.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        if (el.previousElementSibling !== rowDrag.el) {
          rowDrag.listEl.insertBefore(rowDrag.el, el);
        }
        placed = true;
        break;
      }
    }
    if (!placed && rowDrag.listEl.lastElementChild !== rowDrag.el) {
      rowDrag.listEl.appendChild(rowDrag.el);
    }
    syncDraftOrderFromDom(rowDrag.side);
    updatePreview();
  }

  function onRowDragEnd() {
    if (!rowDrag.active) return;
    rowDrag.el?.classList.remove("is-dragging");
    rowDrag.active = false;
    rowDrag.el = null;
    rowDrag.listEl = null;
    window.removeEventListener("pointermove", onRowDragMove);
    window.removeEventListener("pointerup", onRowDragEnd);
    window.removeEventListener("pointercancel", onRowDragEnd);
  }

  form.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const grip = /** @type {HTMLElement} */ (e.target).closest(".sf-port-item-grip");
    if (!grip) return;
    const itemEl = /** @type {HTMLElement | null} */ (grip.closest(".sf-port-item"));
    const listEl = /** @type {HTMLElement | null} */ (grip.closest(".sf-port-list"));
    if (!itemEl || !listEl) return;
    e.preventDefault();

    rowDrag.active = true;
    rowDrag.side = listEl.dataset.side === "outputs" ? "outputs" : "inputs";
    rowDrag.el = itemEl;
    rowDrag.listEl = listEl;
    itemEl.classList.add("is-dragging");
    window.addEventListener("pointermove", onRowDragMove);
    window.addEventListener("pointerup", onRowDragEnd);
    window.addEventListener("pointercancel", onRowDragEnd);
  });

  form.addEventListener("input", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList?.contains("sf-port-item-label")) {
      const located = locateItem(target);
      if (located) {
        const item = located.items[located.index];
        if (item.kind === "port") item.label = /** @type {HTMLInputElement} */ (target).value;
      }
    }
    updatePreview();
  });

  form.addEventListener("change", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList?.contains("sf-port-item-type")) {
      const located = locateItem(target);
      if (located) {
        const item = located.items[located.index];
        if (item.kind === "port") {
          item.type = /** @type {HTMLSelectElement} */ (target).value || null;
          const swatch = target.closest(".sf-port-item")?.querySelector(".sf-port-item-swatch");
          if (swatch) {
            const color = connectorColor(item.type);
            /** @type {HTMLElement} */ (swatch).style.setProperty("--sf-swatch-color", color ?? "transparent");
          }
        }
      }
    }
    updatePreview();
  });

  // Enter in a text field moves focus to the next text field (name → first
  // port label → next label…) instead of submitting the form.
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "text") return;
    e.preventDefault();
    const fields = /** @type {HTMLInputElement[]} */ ([
      ...form.querySelectorAll('input[type="text"]'),
    ]);
    const next = fields[fields.indexOf(target) + 1];
    if (next) {
      next.focus();
      next.select();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const ports = buildDraftPorts();
    const portCount =
      draft.inputs.filter((i) => i.kind === "port").length +
      draft.outputs.filter((i) => i.kind === "port").length;

    if (portCount === 0) {
      if (formError) {
        formError.textContent = "Add at least one input or output port.";
        formError.hidden = false;
      }
      return;
    }

    const saved = createGearType({
      name: nameInput.value.trim() || "Device",
      category: categorySelect.value,
      note: noteInput.value,
      ports,
      kind: "premade",
      id: gear?.id,
      folderId: gear?.folderId ?? null,
    });
    onSave(saved);
    close();
  });

  overlay.querySelector(".sf-gear-cancel")?.addEventListener("click", close);
  overlay.querySelector(".sf-gear-modal-close")?.addEventListener("click", close);

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target !== overlay) return;
    backdropPointerDown = true;
    backdropDragDistance = 0;
    backdropLastPt = { x: e.clientX, y: e.clientY };
    overlay.setPointerCapture?.(e.pointerId);
  });

  overlay.addEventListener("pointermove", (e) => {
    if (!backdropPointerDown || !backdropLastPt) return;
    backdropDragDistance += Math.hypot(e.clientX - backdropLastPt.x, e.clientY - backdropLastPt.y);
    backdropLastPt = { x: e.clientX, y: e.clientY };
  });

  overlay.addEventListener("pointerup", (e) => {
    if (!backdropPointerDown) return;
    backdropPointerDown = false;
    backdropLastPt = null;
    try {
      overlay.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (backdropDragDistance < 6) close();
  });

  dialog?.addEventListener("pointerdown", (e) => e.stopPropagation());

  renderLists();
  nameInput.focus();
  nameInput.select();
}
