/**
 * Gear list UI — ordered gear/cable document synced from Signal Flow,
 * LED Calculator walls, and Cable Calculator.
 * Row reorder uses HTML5 drag (ghost follows cursor), same pattern as the Signal Flow gear library.
 */

import { getCalculatorExport, getCalculatorInstance } from "./calculator-instances.js";
import {
  buildPlaceCards,
  buildRouteCards,
  normalizeCableLength,
  normalizeCableState,
  STANDARD_CABLE_LENGTHS,
} from "./domain/cable.js";
import {
  addGearListHeader,
  addManualGearListItem,
  autoCablePlanFromCableCards,
  autoGearFromSignalFlow,
  autoLedWallSectionsFromLed,
  emptyGearListState,
  GEAR_LIST_FILTER_UNASSIGNED,
  gearListFilterOptions,
  gearListRowsForDisplay,
  gearListSourceKeyLinksToSignalFlow,
  normalizeGearListState,
  removeGearListRow,
  reorderGearListRow,
  syncGearListRows,
  updateGearListRow,
  updateGearListSettings,
} from "./domain/gear-list.js";
import { placesFromSiteExports } from "./domain/places.js";
import { escapeXml } from "./shared/dom.js";
import { getActiveRoom, getActiveShow } from "./show-document-runtime.js";
import { recordBefore } from "./undo-runtime.js";

export {
  addGearListHeader,
  addManualGearListItem,
  autoCablePlanFromCableCards,
  autoCablesFromCableCards,
  autoGearFromSignalFlow,
  autoLedWallSectionsFromLed,
  classifyLedLineJumpers,
  emptyGearListState,
  flattenManualCables,
  GEAR_LIST_FILTER_UNASSIGNED,
  gearListFilterOptions,
  gearListRowsForDisplay,
  gearListSourceKeyLinksToSignalFlow,
  ledTileTypeLabel,
  ledWallNeighborJumperCount,
  ledWallTileGridSize,
  nodeIdsForGearListSourceKey,
  summarizeLedMapJumpers,
  moveGearListRow,
  normalizeGearListState,
  removeGearListRow,
  reorderGearListRow,
  syncGearListRows,
  updateGearListRow,
  updateGearListSettings,
} from "./domain/gear-list.js";

const ROW_MIME = "text/x-gear-list-row";

/**
 * @param {import("./domain/gear-list.js").GearListRow} row
 * @param {{ totalOnly?: boolean }} [opts]
 */
function renderRow(row, opts = {}) {
  const totalOnly = Boolean(opts.totalOnly);
  if (row.kind === "header") {
    const level = row.level === "subsection" ? "subsection" : "section";
    const levelClass =
      level === "subsection" ? "gear-list-row--subsection" : "gear-list-row--section";
    const auto = row.source === "auto";
    return `
      <li
        class="gear-list-row gear-list-row--header ${levelClass}"
        draggable="${totalOnly ? "false" : "true"}"
        data-row-id="${escapeXml(row.id)}"
        data-kind="header"
        data-level="${level}"
        data-source="${escapeXml(row.source ?? "manual")}"
        title="${totalOnly ? "" : "Drag to reorder"}"
      >
        <div class="gear-list-row-main">
          <input
            type="text"
            class="field-input gear-list-header-input"
            draggable="false"
            data-field="label"
            value="${escapeXml(row.label)}"
            aria-label="${level === "subsection" ? "Subsection" : "Section"} heading"
            ${auto || totalOnly ? "readonly" : ""}
          />
        </div>
        <div class="gear-list-row-actions">
          ${
            auto || totalOnly
              ? ""
              : `<button type="button" class="btn btn-secondary gear-list-remove" draggable="false" title="Remove heading" aria-label="Remove heading">×</button>`
          }
        </div>
      </li>`;
  }

  const auto = row.source === "auto";
  const labelReadonly = auto || totalOnly ? "readonly" : "";
  const sourceBadge = auto
    ? gearListSourceKeyLinksToSignalFlow(row.sourceKey)
      ? `<button type="button" class="gear-list-source gear-list-source-btn" draggable="false" data-action="goto-sf" title="Show on Signal Flow" aria-label="Show on Signal Flow">Auto</button>`
      : `<span class="gear-list-source" title="Synced from Cable Calculator">Auto</span>`
    : `<span class="gear-list-source gear-list-source--manual">Manual</span>`;

  const lengthOptions =
    row.category === "cable"
      ? [
          `<option value=""${row.length == null ? " selected" : ""}>—</option>`,
          ...STANDARD_CABLE_LENGTHS.map(
            (n) =>
              `<option value="${n}"${row.length === n ? " selected" : ""}>${n}</option>`
          ),
        ].join("")
      : "";
  const lengthField =
    row.category === "cable"
      ? `<select class="field-input gear-list-length" draggable="false" data-field="length" aria-label="Cable length" ${totalOnly || auto ? "disabled" : ""}>${lengthOptions}</select>`
      : `<span class="gear-list-length-spacer" aria-hidden="true"></span>`;

  return `
    <li
      class="gear-list-row gear-list-row--item"
      draggable="${totalOnly ? "false" : "true"}"
      data-row-id="${escapeXml(row.id)}"
      data-kind="item"
      data-source="${escapeXml(row.source)}"
      title="${totalOnly ? "" : "Drag to reorder"}"
    >
      <div class="gear-list-row-main">
        <input
          type="number"
          class="field-input gear-list-qty"
          draggable="false"
          data-field="qty"
          min="1"
          max="9999"
          value="${row.qty}"
          aria-label="Quantity"
          ${auto || totalOnly ? "readonly" : ""}
        />
        <input
          type="text"
          class="field-input gear-list-label"
          draggable="false"
          data-field="label"
          value="${escapeXml(row.label)}"
          aria-label="Item name"
          ${labelReadonly}
        />
        <input
          type="text"
          class="field-input gear-list-room"
          draggable="false"
          data-field="room"
          value="${escapeXml(row.room ?? "")}"
          placeholder="Room"
          aria-label="Room"
          ${auto || totalOnly ? "readonly" : ""}
        />
        <input
          type="text"
          class="field-input gear-list-place"
          draggable="false"
          data-field="place"
          value="${escapeXml(row.place ?? "")}"
          placeholder="Place"
          aria-label="Place"
          ${auto || totalOnly ? "readonly" : ""}
        />
        ${lengthField}
        <input
          type="text"
          class="field-input gear-list-detail"
          draggable="false"
          data-field="detail"
          value="${escapeXml(row.detail)}"
          placeholder="Detail"
          aria-label="Detail"
          ${auto || totalOnly ? "readonly" : ""}
        />
        <input
          type="text"
          class="field-input gear-list-notes"
          draggable="false"
          data-field="notes"
          value="${escapeXml(row.notes)}"
          placeholder="Notes"
          aria-label="Notes"
          ${totalOnly ? "readonly" : ""}
        />
        ${sourceBadge}
      </div>
      <div class="gear-list-row-actions">
        ${
          auto || totalOnly
            ? ""
            : `<button type="button" class="btn btn-secondary gear-list-remove" draggable="false" title="Remove item" aria-label="Remove item">×</button>`
        }
      </div>
    </li>`;
}

/**
 * Pick an insert gap from cursor Y: before the first row whose midpoint is
 * below the pointer, otherwise after the last row. Skips the dragged row so
 * drops insert between neighbors instead of landing on self.
 * @param {HTMLElement} listEl
 * @param {DragEvent} e
 * @param {string | null} draggingId
 * @returns {{ targetId: string | null, place: "before" | "after" }}
 */
function dropPlacement(listEl, e, draggingId) {
  const rows = [...listEl.querySelectorAll(".gear-list-row")].filter(
    (el) => el instanceof HTMLElement && el.getAttribute("data-row-id") !== draggingId
  );
  if (!rows.length) return { targetId: null, place: "after" };

  for (const row of rows) {
    const id = row.getAttribute("data-row-id");
    if (!id) continue;
    const rect = row.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      return { targetId: id, place: "before" };
    }
  }
  const last = rows[rows.length - 1];
  const lastId = last.getAttribute("data-row-id");
  return { targetId: lastId, place: "after" };
}

/** @param {EventTarget | null} target */
function isInteractiveDragBlocker(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, button, a, label"));
}

export function initGearListCalculator() {
  const listEl = document.getElementById("gear-list-rows");
  const statusEl = document.getElementById("gear-list-status");
  const addGearBtn = document.getElementById("gear-list-add-gear");
  const addHeaderBtn = document.getElementById("gear-list-add-header");
  const addSubsectionBtn = document.getElementById("gear-list-add-subsection");
  const syncBtn = document.getElementById("gear-list-sync");
  const rootEl = document.querySelector(".gear-list-calculator");
  const settingsBtn = document.getElementById("gear-list-settings");
  const settingsModal = document.getElementById("gear-list-settings-modal");
  const settingsClose = document.getElementById("gear-list-settings-close");
  const settingsDone = document.getElementById("gear-list-settings-done");
  const totalOnlyInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("gear-list-setting-total-only")
  );
  const roomFilterSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("gear-list-setting-room-filter")
  );
  const placeFilterSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("gear-list-setting-place-filter")
  );

  /** @type {import("./domain/gear-list.js").GearListState} */
  let localState = emptyGearListState();
  /** @type {string | null} */
  let dragRowId = null;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function clearDropIndicators() {
    listEl?.classList.remove("is-drop-target");
    listEl
      ?.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after, .is-drop-target")
      .forEach((el) =>
        el.classList.remove("is-dragging", "is-drop-before", "is-drop-after", "is-drop-target")
      );
  }

  function countSummary(state) {
    let gear = 0;
    let cable = 0;
    let headers = 0;
    for (const row of state.rows) {
      if (row.kind === "header") {
        headers += 1;
        continue;
      }
      if (row.category === "cable") cable += row.qty;
      else gear += row.qty;
    }
    return { gear, cable, headers };
  }

  function pullUpstream() {
    // Ensure cable cards have current derived data before we peek manuals/lengths.
    getCalculatorInstance("cable")?.refresh?.();

    const sf = /** @type {{
      places?: { id: string, name: string }[],
      nodes?: import("./domain/gear-list.js").GearListSfNode[],
      connections?: import("./domain/gear-list.js").GearListSfConnection[],
      customGearTypes?: object[],
    } | null} */ (getCalculatorExport("signalFlow"));
    const gp = /** @type {{
      cableRoutes?: object[],
      scale?: object | null,
    } | null} */ (getCalculatorExport("groundplan"));
    const cableRaw = getCalculatorExport("cable");
    const cableState = normalizeCableState(cableRaw ?? {});

    const places = placesFromSiteExports({ signalFlow: sf ?? undefined });
    const nodes = Array.isArray(sf?.nodes) ? sf.nodes : [];
    const connections = Array.isArray(sf?.connections) ? sf.connections : [];
    const customGearTypes = Array.isArray(sf?.customGearTypes) ? sf.customGearTypes : [];
    const routes = Array.isArray(gp?.cableRoutes) ? gp.cableRoutes : [];
    const roomName = getActiveRoom()?.name?.trim() || "";

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

    const locationCtx = { places, roomName, nodes };
    const autoGear = autoGearFromSignalFlow(nodes, locationCtx);
    const led = getCalculatorExport("led");
    const ledSections = autoLedWallSectionsFromLed(
      /** @type {{ grids?: object[] } | null} */ (led),
      locationCtx
    );
    const cablePlan = autoCablePlanFromCableCards({
      routeCards,
      placeCards,
      manualsByRoute: cableState.routes ?? {},
      manualsByPlace: cableState.places ?? {},
      placeLengths: cableState.placeLengths ?? {},
      roomName,
    });
    return { autoGear, cablePlan, ledSections };
  }

  function syncFromUpstream() {
    const { autoGear, cablePlan, ledSections } = pullUpstream();
    localState = syncGearListRows(localState, autoGear, cablePlan, ledSections);
  }

  function populateFilterSelects() {
    const sf = /** @type {{ places?: { id: string, name: string }[] } | null} */ (
      getCalculatorExport("signalFlow")
    );
    const places = placesFromSiteExports({ signalFlow: sf ?? undefined });
    const show = getActiveShow();
    const roomNames = (show?.rooms ?? []).map((r) => r.name);
    const opts = gearListFilterOptions(localState, {
      rooms: roomNames,
      places,
    });

    const fill = (
      /** @type {HTMLSelectElement | null} */ select,
      /** @type {string[]} */ values,
      hasUnassigned,
      allLabel,
      unassignedLabel,
      current
    ) => {
      if (!select) return;
      const selected = current || "";
      /** @type {string[]} */
      const options = [`<option value="">${escapeXml(allLabel)}</option>`];
      for (const value of values) {
        options.push(
          `<option value="${escapeXml(value)}"${value === selected ? " selected" : ""}>${escapeXml(value)}</option>`
        );
      }
      if (hasUnassigned || selected === GEAR_LIST_FILTER_UNASSIGNED) {
        options.push(
          `<option value="${GEAR_LIST_FILTER_UNASSIGNED}"${
            selected === GEAR_LIST_FILTER_UNASSIGNED ? " selected" : ""
          }>${escapeXml(unassignedLabel)}</option>`
        );
      }
      select.innerHTML = options.join("");
      // Keep a stale filter value visible if it no longer appears in options.
      if (selected && ![...select.options].some((o) => o.value === selected)) {
        select.insertAdjacentHTML(
          "beforeend",
          `<option value="${escapeXml(selected)}" selected>${escapeXml(selected)}</option>`
        );
      }
      select.value = selected;
    };

    fill(
      roomFilterSelect,
      opts.rooms,
      opts.hasUnassignedRoom,
      "All rooms",
      "Unassigned",
      localState.settings?.roomFilter ?? ""
    );
    fill(
      placeFilterSelect,
      opts.places,
      opts.hasUnassignedPlace,
      "All places",
      "Unassigned",
      localState.settings?.placeFilter ?? ""
    );
  }

  function render() {
    if (!listEl) return;
    const settings = localState.settings ?? { totalOnly: false, roomFilter: "", placeFilter: "" };
    const totalOnly = Boolean(settings.totalOnly);
    rootEl?.classList.toggle("is-total-only", totalOnly);
    if (totalOnlyInput) totalOnlyInput.checked = totalOnly;
    populateFilterSelects();
    const displayRows = gearListRowsForDisplay(localState);
    if (!displayRows.length) {
      listEl.innerHTML = `<li class="gear-list-empty">No gear yet. Add gear from Signal Flow, or add a manual line.</li>`;
    } else {
      listEl.innerHTML = displayRows.map((row) => renderRow(row, { totalOnly })).join("");
    }
    const { gear, cable, headers } = countSummary({
      rows: displayRows,
      settings: localState.settings,
    });
    /** @type {string[]} */
    const tags = [];
    if (totalOnly) tags.push("Total only");
    if (settings.roomFilter) {
      tags.push(
        settings.roomFilter === GEAR_LIST_FILTER_UNASSIGNED
          ? "Room: Unassigned"
          : `Room: ${settings.roomFilter}`
      );
    }
    if (settings.placeFilter) {
      tags.push(
        settings.placeFilter === GEAR_LIST_FILTER_UNASSIGNED
          ? "Place: Unassigned"
          : `Place: ${settings.placeFilter}`
      );
    }
    const mode = tags.length ? ` · ${tags.join(" · ")}` : "";
    setStatus(
      `${gear} gear · ${cable} cable${cable === 1 ? "" : "s"} · ${headers} heading${headers === 1 ? "" : "s"}${mode}`
    );
  }

  function openSettings() {
    populateFilterSelects();
    if (totalOnlyInput) totalOnlyInput.checked = Boolean(localState.settings?.totalOnly);
    settingsModal?.removeAttribute("hidden");
    totalOnlyInput?.focus();
  }

  function closeSettings() {
    settingsModal?.setAttribute("hidden", "");
    settingsBtn?.focus();
  }

  function refresh() {
    syncFromUpstream();
    render();
  }

  /** @param {string} rowId */
  function rowEl(rowId) {
    return listEl?.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`) ?? null;
  }

  /**
   * @param {"section" | "subsection"} level
   * @param {string} defaultLabel
   */
  function addHeading(level, defaultLabel) {
    recordBefore("gearList", level === "subsection" ? "add-subsection" : "add-section");
    localState = addGearListHeader(localState, defaultLabel, undefined, level);
    render();
    const last = localState.rows[localState.rows.length - 1];
    const input = last ? rowEl(last.id)?.querySelector('[data-field="label"]') : null;
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  listEl?.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const row = target.closest(".gear-list-row");
    if (!(row instanceof HTMLElement)) return;
    const rowId = row.getAttribute("data-row-id");
    if (!rowId) return;

    if (target.closest('[data-action="goto-sf"]')) {
      event.preventDefault();
      event.stopPropagation();
      const item = localState.rows.find((r) => r.id === rowId);
      const sourceKey =
        item && item.kind === "item" && item.source === "auto" ? item.sourceKey : null;
      if (!gearListSourceKeyLinksToSignalFlow(sourceKey)) return;
      const tab = document.querySelector('.tab[data-tab="signal-flow"]');
      if (tab instanceof HTMLElement) tab.click();
      requestAnimationFrame(() => {
        getCalculatorInstance("signalFlow")?.selectByGearListSourceKey?.(sourceKey);
      });
      return;
    }

    if (target.closest(".gear-list-remove")) {
      recordBefore("gearList", "remove-row");
      localState = removeGearListRow(localState, rowId);
      render();
    }
  });

  listEl?.addEventListener("change", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const field = target.getAttribute("data-field");
    if (!field) return;
    const row = target.closest(".gear-list-row");
    if (!(row instanceof HTMLElement)) return;
    const rowId = row.getAttribute("data-row-id");
    if (!rowId) return;

    recordBefore("gearList", "edit-row");
    if (field === "qty") {
      localState = updateGearListRow(localState, rowId, { qty: Number(target.value) });
    } else if (field === "length") {
      localState = updateGearListRow(localState, rowId, {
        length: normalizeCableLength(target.value, null),
      });
    } else if (field === "label" || field === "detail" || field === "notes" || field === "room" || field === "place") {
      localState = updateGearListRow(localState, rowId, { [field]: target.value });
    }
    render();
    const focus = rowEl(rowId)?.querySelector(`[data-field="${field}"]`);
    if (focus instanceof HTMLElement) focus.focus();
  });

  // Match Signal Flow library: interactive controls must not start a drag.
  listEl?.addEventListener(
    "pointerdown",
    (event) => {
      if (isInteractiveDragBlocker(event.target)) {
        event.stopPropagation();
      }
    },
    true
  );

  listEl?.addEventListener("dragstart", (event) => {
    if (localState.settings?.totalOnly) {
      event.preventDefault();
      return;
    }
    if (isInteractiveDragBlocker(event.target)) {
      event.preventDefault();
      return;
    }
    const row = event.target instanceof Element ? event.target.closest(".gear-list-row") : null;
    if (!(row instanceof HTMLElement)) {
      event.preventDefault();
      return;
    }
    const rowId = row.getAttribute("data-row-id");
    if (!rowId) {
      event.preventDefault();
      return;
    }
    dragRowId = rowId;
    event.dataTransfer?.setData(ROW_MIME, rowId);
    event.dataTransfer?.setData("text/plain", rowId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      // Ghost follows the cursor (same feel as dragging a library chip).
      const rect = row.getBoundingClientRect();
      event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
    }
    row.classList.add("is-dragging");
  });

  listEl?.addEventListener("dragend", () => {
    dragRowId = null;
    clearDropIndicators();
  });

  listEl?.addEventListener("dragover", (event) => {
    if (!dragRowId && ![...(event.dataTransfer?.types ?? [])].includes(ROW_MIME)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    listEl.classList.add("is-drop-target");
    const { targetId, place } = dropPlacement(listEl, event, dragRowId);
    listEl
      .querySelectorAll(".is-drop-before, .is-drop-after")
      .forEach((el) => el.classList.remove("is-drop-before", "is-drop-after"));
    if (targetId && targetId !== dragRowId) {
      const row = rowEl(targetId);
      row?.classList.add(place === "before" ? "is-drop-before" : "is-drop-after");
    }
  });

  listEl?.addEventListener("dragleave", (event) => {
    if (!(event.target instanceof Node) || !listEl.contains(/** @type {Node | null} */ (event.relatedTarget))) {
      clearDropIndicators();
      if (dragRowId) rowEl(dragRowId)?.classList.add("is-dragging");
    }
  });

  listEl?.addEventListener("drop", (event) => {
    const draggedId =
      dragRowId || event.dataTransfer?.getData(ROW_MIME) || event.dataTransfer?.getData("text/plain");
    if (!draggedId) return;
    event.preventDefault();
    const { targetId, place } = dropPlacement(listEl, event, draggedId);
    clearDropIndicators();
    dragRowId = null;
    if (!targetId || targetId === draggedId) return;
    recordBefore("gearList", "reorder-row");
    localState = reorderGearListRow(localState, draggedId, targetId, place);
    render();
  });

  addGearBtn?.addEventListener("click", () => {
    recordBefore("gearList", "add-gear");
    localState = addManualGearListItem(localState, {
      label: "New gear",
      category: "gear",
      qty: 1,
      room: getActiveRoom()?.name?.trim() || "",
    });
    render();
    const last = localState.rows[localState.rows.length - 1];
    const input = last ? rowEl(last.id)?.querySelector('[data-field="label"]') : null;
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  });

  addHeaderBtn?.addEventListener("click", () => addHeading("section", "Section"));
  addSubsectionBtn?.addEventListener("click", () => addHeading("subsection", "Subsection"));

  syncBtn?.addEventListener("click", () => {
    recordBefore("gearList", "sync");
    refresh();
    const counts = statusEl?.textContent ?? "";
    setStatus(`Synced · ${counts}`);
  });

  settingsBtn?.addEventListener("click", () => openSettings());
  settingsClose?.addEventListener("click", () => closeSettings());
  settingsDone?.addEventListener("click", () => closeSettings());
  settingsModal?.addEventListener("click", (event) => {
    if (event.target === settingsModal) closeSettings();
  });
  totalOnlyInput?.addEventListener("change", () => {
    recordBefore("gearList", "settings");
    localState = updateGearListSettings(localState, {
      totalOnly: Boolean(totalOnlyInput.checked),
    });
    render();
  });
  roomFilterSelect?.addEventListener("change", () => {
    recordBefore("gearList", "settings");
    localState = updateGearListSettings(localState, {
      roomFilter: roomFilterSelect.value,
    });
    render();
  });
  placeFilterSelect?.addEventListener("change", () => {
    recordBefore("gearList", "settings");
    localState = updateGearListSettings(localState, {
      placeFilter: placeFilterSelect.value,
    });
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!settingsModal || settingsModal.hasAttribute("hidden")) return;
    closeSettings();
  });

  document.querySelector('.tab[data-tab="gear-list"]')?.addEventListener("click", () => {
    refresh();
  });

  refresh();

  function exportState() {
    return {
      settings: { ...localState.settings },
      rows: localState.rows.map((row) => ({ ...row })),
    };
  }

  /** @param {object} data */
  function importState(data) {
    localState = normalizeGearListState(data);
    refresh();
  }

  return { exportState, importState, refresh };
}

export const calculatorPlugin = {
  meta: {
    id: "gear-list",
    tabPanelId: "gear-list",
    stateKey: "gearList",
    label: "Gear List",
    requiredForSave: false,
    emptyState: emptyGearListState,
    /** @param {unknown} data */
    validateState(data) {
      return normalizeGearListState(data);
    },
  },
  init: initGearListCalculator,
};
