/**
 * Power allocation calculator — editable load table synced from Signal Flow
 * power wires. Show-scoped, same hide / search / Auto-jump pattern as Gear List.
 */

import { getCalculatorExport, getCalculatorInstance, getCalculatorInstances } from "./calculator-instances.js";
import {
  addManualPowerAllocationRow,
  addPowerAllocationHeader,
  buildPowerAllocationRows,
  emptyPowerAllocationState,
  formatPhaseAmpSummary,
  formatPowerAllocationNumber,
  normalizePowerAllocationState,
  phaseForNumberKey,
  phasesForVoltage,
  powerAllocationHeaderItems,
  powerAllocationRoomNames,
  powerAllocationRowsForDisplay,
  powerAllocationSourceKey,
  removePowerAllocationRow,
  reorderPowerAllocationRow,
  sumPowerAllocationItems,
  syncPowerAllocationRows,
  updatePowerAllocationRow,
  updatePowerAllocationSettings,
  voltageChoices,
} from "./domain/power-allocation.js";
import { resolveGearType } from "./signal-flow-data.js";
import { escapeXml } from "./shared/dom.js";
import {
  getActiveRoom,
  getActiveShow,
  schedulePersist,
  switchActiveRoom,
} from "./show-document-runtime.js";
import { recordBefore } from "./undo-runtime.js";

const EYE_OPEN =
  '<svg class="gear-list-eye-icon gear-list-eye-icon--open" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" /><circle cx="8" cy="8" r="1.75" fill="none" stroke="currentColor" stroke-width="1.25" /></svg>';
const EYE_CLOSED =
  '<svg class="gear-list-eye-icon gear-list-eye-icon--closed" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" /><circle cx="8" cy="8" r="1.75" fill="none" stroke="currentColor" stroke-width="1.25" /><path d="M2.5 13.5 13.5 2.5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" /></svg>';

/**
 * @param {import("./domain/power-allocation.js").PowerAllocationLine} row
 */
function visibilityToggleHtml(row) {
  const included = row.included !== false;
  return `<button
    type="button"
    class="btn btn-secondary gear-list-visibility"
    data-action="toggle-included"
    aria-pressed="${included ? "true" : "false"}"
    aria-label="${included ? "Hide from paperwork" : "Include in paperwork"}"
    title="${included ? "Included in paperwork" : "Hidden from paperwork"}"
  >${EYE_OPEN}${EYE_CLOSED}</button>`;
}

/**
 * @param {number | null} value
 */
function numValue(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const rounded = Math.round(Number(value) * 100) / 100;
  return String(rounded);
}

/**
 * @param {import("./domain/power-allocation.js").PowerAllocationLine} row
 * @param {{ wattage: number | null, amperage: number | null, phaseAmps: Record<"X" | "Y" | "Z", number> } | null} [totals]
 */
function renderRow(row, totals = null) {
  const included = row.included !== false;
  const auto = row.source === "auto";
  if (row.kind === "header") {
    const level = row.level === "subsection" ? "subsection" : "section";
    const levelClass =
      level === "subsection" ? "gear-list-row--subsection" : "gear-list-row--section";
    const phaseSummary = totals ? formatPhaseAmpSummary(totals.phaseAmps) : "";
    const watts = totals ? formatPowerAllocationNumber(totals.wattage, 0) : "";
    const amps = totals ? formatPowerAllocationNumber(totals.amperage, 2) : "";
    return `
    <li
      class="gear-list-row gear-list-row--header ${levelClass}${included ? "" : " is-excluded"}"
      draggable="true"
      data-row-id="${escapeXml(row.id)}"
      data-kind="header"
      data-level="${level}"
      data-source="${row.source}"
      title="Drag to reorder"
    >
      <div class="gear-list-row-main">
        <input type="text" class="field-input power-alloc-room" data-field="room" value="${escapeXml(row.room)}" aria-label="Room" ${auto ? "readonly" : ""} />
        <input type="text" class="field-input gear-list-header-input power-alloc-device" data-field="device" value="${escapeXml(row.device)}" aria-label="${level === "subsection" ? "Subsection" : "Section"}" ${auto ? "readonly" : ""} />
        <span class="power-alloc-total" aria-hidden="true"></span>
        <span class="power-alloc-leg-totals" title="Amps per phase">${escapeXml(phaseSummary)}</span>
        <span class="power-alloc-total" aria-hidden="true"></span>
        <span class="power-alloc-total">${escapeXml(watts)}</span>
        <span class="power-alloc-total">${escapeXml(amps)}</span>
        <span class="gear-list-source">${auto ? "Auto" : ""}</span>
      </div>
      <div class="gear-list-row-actions">
        ${visibilityToggleHtml(row)}
        ${
          auto
            ? ""
            : `<button type="button" class="btn btn-secondary gear-list-remove" draggable="false" title="Remove heading" aria-label="Remove heading">×</button>`
        }
      </div>
    </li>`;
  }
  const ov = row.overrides ?? {};
  const phase = row.phase || "";
  const phaseChoices = ["", ...phasesForVoltage(row.voltage)];
  if (phase && !phaseChoices.includes(phase)) phaseChoices.push(phase);
  const phaseHotkey = phasesForVoltage(row.voltage)
    .map((value, index) => `${index + 1} ${value}`)
    .join(", ");
  const phaseOptions = phaseChoices
    .map(
      (value) =>
        `<option value="${value}"${value === phase ? " selected" : ""}>${value || "—"}</option>`
    )
    .join("");
  const voltageOptions = [
    ...(row.voltage == null ? [`<option value="" selected>—</option>`] : []),
    ...voltageChoices(row.voltage).map(
      (value) =>
        `<option value="${value}"${row.voltage === value ? " selected" : ""}>${value}</option>`
    ),
  ].join("");
  const sourceBadge = auto
    ? `<button type="button" class="gear-list-source gear-list-source-btn" draggable="false" data-action="goto-sf" title="Show on Signal Flow" aria-label="Show on Signal Flow">Auto</button>`
    : `<span class="gear-list-source gear-list-source--manual">Manual</span>`;
  const mark = (field) => (ov[field] ? " is-override" : "");

  return `
    <li
      class="gear-list-row gear-list-row--item${included ? "" : " is-excluded"}"
      draggable="true"
      data-row-id="${escapeXml(row.id)}"
      data-kind="item"
      data-source="${row.source}"
      title="Drag to reorder"
    >
      <div class="gear-list-row-main">
        <input type="text" class="field-input power-alloc-room" data-field="room" value="${escapeXml(row.room)}" aria-label="Room" ${auto ? "readonly" : ""} />
        <input type="text" class="field-input power-alloc-device${mark("device")}" data-field="device" value="${escapeXml(row.device)}" aria-label="Device" />
        <input type="text" class="field-input power-alloc-distro${mark("distro")}" data-field="distro" value="${escapeXml(row.distro)}" aria-label="Distro" />
        <select class="field-input power-alloc-phase${mark("phase")}" data-field="phase" aria-label="Phase" title="Hover and press ${escapeXml(phaseHotkey)}">${phaseOptions}</select>
        <select class="field-input power-alloc-voltage${mark("voltage")}" data-field="voltage" aria-label="Voltage">${voltageOptions}</select>
        <input type="number" class="field-input power-alloc-num${mark("wattage")}" data-field="wattage" value="${numValue(row.wattage)}" aria-label="Wattage" step="any" />
        <input type="number" class="field-input power-alloc-num${mark("amperage")}" data-field="amperage" value="${numValue(row.amperage)}" aria-label="Amperage" step="any" />
        ${sourceBadge}
      </div>
      <div class="gear-list-row-actions">
        ${visibilityToggleHtml(row)}
        ${
          auto
            ? ""
            : `<button type="button" class="btn btn-secondary gear-list-remove" title="Remove row" aria-label="Remove row">×</button>`
        }
      </div>
    </li>`;
}

/**
 * @param {HTMLElement} listEl
 * @param {DragEvent} event
 * @param {string | null} draggingId
 * @returns {{ targetId: string | null, place: "before" | "after" }}
 */
function dropPlacement(listEl, event, draggingId) {
  const rows = [...listEl.querySelectorAll(".gear-list-row")].filter(
    (el) => el instanceof HTMLElement && el.getAttribute("data-row-id") !== draggingId
  );
  if (!rows.length) return { targetId: null, place: "after" };
  for (const row of rows) {
    const id = row.getAttribute("data-row-id");
    if (!id) continue;
    const rect = row.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) return { targetId: id, place: "before" };
  }
  const last = rows[rows.length - 1];
  return { targetId: last?.getAttribute("data-row-id") ?? null, place: "after" };
}

/** @param {EventTarget | null} target */
function isInteractiveDragBlocker(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, button, a, label"));
}

export function initPowerAllocationCalculator() {
  const listEl = document.getElementById("power-alloc-rows");
  const statusEl = document.getElementById("power-alloc-status");
  const searchInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("power-alloc-search")
  );
  const roomFilterSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("power-alloc-room-filter")
  );
  const addBtn = document.getElementById("power-alloc-add");
  const addSectionBtn = document.getElementById("power-alloc-add-section");
  const addSubsectionBtn = document.getElementById("power-alloc-add-subsection");
  const syncBtn = document.getElementById("power-alloc-sync");
  /** @type {string | null} */
  let dragRowId = null;

  /** @type {import("./domain/power-allocation.js").PowerAllocationState} */
  let localState = emptyPowerAllocationState();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let liveSyncTimer = null;
  const LIVE_SYNC_MS = 350;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  /**
   * @param {{ nodes?: object[], connections?: object[], customGearTypes?: object[] } | null | undefined} sf
   * @param {{ grids?: object[], voltage?: number } | null | undefined} led
   * @param {string} roomId
   * @param {string} roomName
   */
  function rowsFromSnapshot(sf, led, roomId, roomName) {
    const customTypes = Array.isArray(sf?.customGearTypes) ? sf.customGearTypes : [];
    const built = buildPowerAllocationRows({
      signalFlow: sf ?? {},
      led: led ?? null,
      resolveGear(node) {
        if (node?.gearOverride && typeof node.gearOverride === "object") {
          return /** @type {object} */ (node.gearOverride);
        }
        const typeId = typeof node?.typeId === "string" ? node.typeId : "";
        return resolveGearType(typeId, customTypes);
      },
    });
    return built.map((row) => ({
      ...row,
      roomId,
      room: roomName,
      sourceKey:
        row.nodeId != null
          ? powerAllocationSourceKey(roomId, row.nodeId, row.keyPart || "")
          : null,
    }));
  }

  function pullUpstream() {
    const show = getActiveShow();
    const activeRoom = getActiveRoom();
    const rooms = show?.rooms ?? (activeRoom ? [activeRoom] : []);
    /** @type {Array<import("./domain/power-allocation.js").PowerAllocationRow & { roomId: string, room: string }>} */
    const live = [];
    for (const room of rooms) {
      if (!room?.id) continue;
      const roomName = typeof room.name === "string" ? room.name.trim() : "";
      if (activeRoom && room.id === activeRoom.id) {
        const sf = /** @type {{ nodes?: object[], connections?: object[], customGearTypes?: object[] } | null} */ (
          getCalculatorExport("signalFlow")
        );
        const led = /** @type {{ grids?: object[], voltage?: number } | null} */ (
          getCalculatorExport("led")
        );
        live.push(...rowsFromSnapshot(sf, led, room.id, roomName));
      } else {
        const plan = room.plan ?? {};
        const sf = /** @type {{ nodes?: object[], connections?: object[], customGearTypes?: object[] } | null} */ (
          plan.signalFlow ?? null
        );
        const led = /** @type {{ grids?: object[], voltage?: number } | null} */ (
          plan.led ?? null
        );
        live.push(...rowsFromSnapshot(sf, led, room.id, roomName));
      }
    }
    return live;
  }

  function flushPendingEdits() {
    if (!listEl) return;
    for (const rowEl of listEl.querySelectorAll(".gear-list-row[data-row-id]")) {
      if (!(rowEl instanceof HTMLElement)) continue;
      const rowId = rowEl.getAttribute("data-row-id");
      if (!rowId) continue;
      const existing = localState.rows.find((row) => row.id === rowId);
      if (!existing) continue;
      /** @type {Record<string, unknown>} */
      const patch = {};
      const active = document.activeElement;
      for (const fieldEl of rowEl.querySelectorAll("[data-field]")) {
        if (!(fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLSelectElement)) continue;
        if (fieldEl !== active) continue;
        if (fieldEl.readOnly || fieldEl.disabled) continue;
        // Selects commit on change. Flushing them stamps a drifted menu
        // value (often blank) back as a phase or voltage override.
        if (fieldEl instanceof HTMLSelectElement) continue;
        const field = fieldEl.getAttribute("data-field");
        if (!field) continue;
        if (field === "voltage" || field === "wattage" || field === "amperage") {
          if (fieldEl.value !== numValue(existing[field])) {
            patch[field] = fieldEl.value === "" ? null : fieldEl.value;
          }
        } else if (field === "device" || field === "distro" || field === "phase" || field === "room") {
          if (existing[field] !== fieldEl.value) patch[field] = fieldEl.value;
        }
      }
      if (Object.keys(patch).length) {
        localState = updatePowerAllocationRow(localState, rowId, patch);
      }
    }
  }

  function syncFromUpstream() {
    flushPendingEdits();
    localState = syncPowerAllocationRows(localState, pullUpstream());
  }

  function isVisible() {
    const panel = document.getElementById("power-allocation");
    return Boolean(panel && !panel.hidden);
  }

  function isEditing() {
    const active = document.activeElement;
    return Boolean(active instanceof Element && active.closest("#power-allocation"));
  }

  /**
   * @param {{ renderUi?: boolean }} [opts]
   */
  function refresh(opts = {}) {
    syncFromUpstream();
    if (opts.renderUi !== false) paint();
  }

  function scheduleLiveSync() {
    if (isEditing()) return;
    if (liveSyncTimer) clearTimeout(liveSyncTimer);
    liveSyncTimer = setTimeout(() => {
      liveSyncTimer = null;
      if (isEditing()) return;
      syncFromUpstream();
      if (isVisible()) paint();
    }, LIVE_SYNC_MS);
  }

  function populateRoomFilter() {
    if (!roomFilterSelect) return;
    const selected = localState.settings?.roomFilter ?? "";
    const names = powerAllocationRoomNames(localState);
    if (selected && !names.includes(selected)) names.unshift(selected);
    roomFilterSelect.innerHTML = [
      `<option value="">Room</option>`,
      ...names.map(
        (name) =>
          `<option value="${escapeXml(name)}"${name === selected ? " selected" : ""}>${escapeXml(name)}</option>`
      ),
    ].join("");
    roomFilterSelect.classList.toggle("is-filtered", Boolean(selected));
  }

  function paint() {
    if (!listEl) return;
    const settings = localState.settings ?? { searchQuery: "", roomFilter: "" };
    if (searchInput && searchInput.value !== (settings.searchQuery ?? "")) {
      searchInput.value = settings.searchQuery ?? "";
    }
    populateRoomFilter();
    const displayRows = powerAllocationRowsForDisplay(localState);
    if (!displayRows.length) {
      const searching = Boolean((settings.searchQuery ?? "").trim() || settings.roomFilter);
      listEl.innerHTML = searching
        ? `<li class="gear-list-empty">No rows match your search.</li>`
        : `<li class="gear-list-empty">No powered devices yet. Connect gear in Signal Flow Power mode, or add a manual line.</li>`;
    } else {
      listEl.innerHTML = displayRows
        .map((row) => {
          if (row.kind !== "header") return renderRow(row);
          const index = localState.rows.findIndex((entry) => entry.id === row.id);
          const totals = sumPowerAllocationItems(powerAllocationHeaderItems(localState.rows, index));
          return renderRow(row, totals);
        })
        .join("");
    }
    const deviceCount = displayRows.filter((row) => row.kind !== "header").length;
    const hidden = localState.rows.filter((row) => row.included === false).length;
    const overrides = localState.rows.filter((row) =>
      Object.values(row.overrides ?? {}).some(Boolean)
    ).length;
    const tags = [];
    if ((settings.searchQuery ?? "").trim()) tags.push("Search");
    if (settings.roomFilter) tags.push(settings.roomFilter);
    if (hidden) tags.push(`${hidden} hidden`);
    if (overrides) tags.push(`${overrides} override${overrides === 1 ? "" : "s"}`);
    const mode = tags.length ? ` · ${tags.join(" · ")}` : "";
    setStatus(
      `${deviceCount} device${deviceCount === 1 ? "" : "s"}${mode}`
    );
  }

  function persistTable() {
    const instances = getCalculatorInstances();
    if (instances) schedulePersist(instances);
  }

  function render() {
    flushPendingEdits();
    paint();
    persistTable();
  }

  /**
   * @param {HTMLInputElement | HTMLSelectElement} target
   * @param {boolean} repaint
   */
  function commitFieldEdit(target, repaint) {
    const field = target.getAttribute("data-field");
    if (!field) return;
    const row = target.closest(".gear-list-row");
    if (!(row instanceof HTMLElement)) return;
    const rowId = row.getAttribute("data-row-id");
    if (!rowId) return;
    recordBefore("powerAllocation", "edit-row", { coalesceMs: 400 });
    /** @type {Record<string, unknown>} */
    const patch = {};
    if (field === "voltage" || field === "wattage" || field === "amperage") {
      patch[field] = target.value === "" ? null : target.value;
    } else {
      patch[field] = target.value;
    }
    flushPendingEdits();
    localState = updatePowerAllocationRow(localState, rowId, patch);
    if (repaint) {
      paint();
      const focus = rowEl(rowId)?.querySelector(`[data-field="${field}"]`);
      if (focus instanceof HTMLElement) focus.focus();
    }
    persistTable();
  }

  /** @param {string} rowId */
  function rowEl(rowId) {
    return listEl?.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`) ?? null;
  }

  listEl?.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const row = target.closest(".gear-list-row");
    if (!(row instanceof HTMLElement)) return;
    const rowId = row.getAttribute("data-row-id");
    if (!rowId) return;

    if (target.closest('[data-action="goto-sf"]')) {
      event.preventDefault();
      const item = localState.rows.find((entry) => entry.id === rowId);
      if (!item?.nodeId) return;
      const show = getActiveShow();
      const activeRoom = getActiveRoom();
      if (
        item.roomId &&
        show?.id &&
        activeRoom?.id !== item.roomId &&
        show.rooms.some((entry) => entry.id === item.roomId)
      ) {
        switchActiveRoom(getCalculatorInstances() ?? {}, show.id, item.roomId);
      }
      const tab = document.querySelector('.tab[data-tab="signal-flow"]');
      if (tab instanceof HTMLElement) tab.click();
      const nodeId = item.nodeId;
      requestAnimationFrame(() => {
        getCalculatorInstance("signalFlow")?.selectPowerAllocationNode?.(nodeId);
      });
      return;
    }

    if (target.closest('[data-action="toggle-included"]')) {
      event.preventDefault();
      const item = localState.rows.find((entry) => entry.id === rowId);
      if (!item) return;
      recordBefore("powerAllocation", "toggle-paperwork");
      localState = updatePowerAllocationRow(localState, rowId, {
        included: item.included === false,
      });
      render();
      return;
    }

    if (target.closest(".gear-list-remove")) {
      recordBefore("powerAllocation", "remove-row");
      localState = removePowerAllocationRow(localState, rowId);
      render();
    }
  });

  let pointerX = -1;
  let pointerY = -1;
  document.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  });

  /**
   * Phase select under the pointer, otherwise the one that has focus.
   * @returns {HTMLSelectElement | null}
   */
  function phaseSelectForHotkey() {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    ) {
      return null;
    }
    if (active instanceof HTMLSelectElement && active.classList.contains("power-alloc-phase")) {
      return active;
    }
    if (active instanceof HTMLSelectElement) return null;
    const hit = document.elementFromPoint(pointerX, pointerY);
    const hovered = hit instanceof Element ? hit.closest(".power-alloc-phase") : null;
    return hovered instanceof HTMLSelectElement ? hovered : null;
  }

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "1" && event.key !== "2" && event.key !== "3") return;
    if (!isVisible()) return;
    const select = phaseSelectForHotkey();
    if (!select) return;
    const rowId = select.closest(".gear-list-row")?.getAttribute("data-row-id");
    if (!rowId) return;
    event.preventDefault();
    const wasFocused = document.activeElement === select;
    recordBefore("powerAllocation", "edit-row", { coalesceMs: 400 });
    flushPendingEdits();
    const item = localState.rows.find((entry) => entry.id === rowId);
    const phase = item ? phaseForNumberKey(item.voltage, event.key) : null;
    if (item && phase && item.phase !== phase) {
      localState = updatePowerAllocationRow(localState, rowId, { phase });
      persistTable();
    }
    paint();
    if (wasFocused) {
      const restored = rowEl(rowId)?.querySelector(".power-alloc-phase");
      if (restored instanceof HTMLSelectElement) restored.focus();
    }
  });

  listEl?.addEventListener("input", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!(target instanceof HTMLInputElement)) return;
    commitFieldEdit(target, false);
  });

  listEl?.addEventListener("change", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    commitFieldEdit(target, true);
  });

  listEl?.addEventListener(
    "pointerdown",
    (event) => {
      if (isInteractiveDragBlocker(event.target)) event.stopPropagation();
    },
    true
  );

  function clearDropIndicators() {
    listEl?.classList.remove("is-drop-target");
    listEl
      ?.querySelectorAll(".is-drop-before, .is-drop-after, .is-dragging")
      .forEach((el) => el.classList.remove("is-drop-before", "is-drop-after", "is-dragging"));
  }

  listEl?.addEventListener("dragstart", (event) => {
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
    event.dataTransfer?.setData("text/plain", rowId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
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
    if (!dragRowId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    listEl?.classList.add("is-drop-target");
    const { targetId, place } = dropPlacement(/** @type {HTMLElement} */ (listEl), event, dragRowId);
    listEl
      ?.querySelectorAll(".is-drop-before, .is-drop-after")
      .forEach((el) => el.classList.remove("is-drop-before", "is-drop-after"));
    if (targetId && targetId !== dragRowId) {
      rowEl(targetId)?.classList.add(place === "before" ? "is-drop-before" : "is-drop-after");
    }
  });

  listEl?.addEventListener("drop", (event) => {
    const draggedId = dragRowId || event.dataTransfer?.getData("text/plain");
    if (!draggedId || !listEl) return;
    event.preventDefault();
    const { targetId, place } = dropPlacement(listEl, event, draggedId);
    clearDropIndicators();
    dragRowId = null;
    if (!targetId || targetId === draggedId) return;
    recordBefore("powerAllocation", "reorder-row");
    localState = reorderPowerAllocationRow(localState, draggedId, targetId, place);
    render();
  });

  /**
   * @param {"section" | "subsection"} level
   * @param {string} label
   */
  function addHeading(level, label) {
    recordBefore("powerAllocation", level === "subsection" ? "add-subsection" : "add-section");
    const room = getActiveRoom();
    localState = addPowerAllocationHeader(localState, level, {
      device: label,
      room: room?.name?.trim() || "",
      roomId: room?.id || "",
    });
    render();
    const last = localState.rows[localState.rows.length - 1];
    const input = last ? rowEl(last.id)?.querySelector('[data-field="device"]') : null;
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  addBtn?.addEventListener("click", () => {
    recordBefore("powerAllocation", "add-row");
    const room = getActiveRoom();
    localState = addManualPowerAllocationRow(localState, {
      device: "Device",
      room: room?.name?.trim() || "",
      roomId: room?.id || "",
      voltage: 120,
    });
    render();
    const last = localState.rows[localState.rows.length - 1];
    const input = last ? rowEl(last.id)?.querySelector('[data-field="device"]') : null;
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  });

  addSectionBtn?.addEventListener("click", () => addHeading("section", "Section"));
  addSubsectionBtn?.addEventListener("click", () => addHeading("subsection", "Subsection"));

  syncBtn?.addEventListener("click", () => {
    recordBefore("powerAllocation", "sync");
    refresh();
    persistTable();
    setStatus(`Synced · ${statusEl?.textContent ?? ""}`);
  });

  searchInput?.addEventListener("input", () => {
    localState = updatePowerAllocationSettings(localState, {
      searchQuery: searchInput.value,
    });
    render();
  });

  roomFilterSelect?.addEventListener("change", () => {
    localState = updatePowerAllocationSettings(localState, {
      roomFilter: roomFilterSelect.value,
    });
    render();
  });

  document.querySelector('.tab[data-tab="power-allocation"]')?.addEventListener("click", () => {
    refresh();
  });

  refresh();

  function exportState() {
    return {
      settings: { ...localState.settings },
      rows: localState.rows.map((row) => ({
        ...row,
        overrides: { ...row.overrides },
      })),
    };
  }

  /** @param {object} data */
  function importState(data) {
    localState = normalizePowerAllocationState(data);
    refresh();
  }

  function syncNow() {
    syncFromUpstream();
  }

  return { exportState, importState, refresh, syncNow, scheduleLiveSync };
}

export const calculatorPlugin = {
  meta: {
    id: "power-allocation",
    tabPanelId: "power-allocation",
    stateKey: "powerAllocation",
    label: "Power Allocation",
    requiredForSave: false,
    emptyState: emptyPowerAllocationState,
    /** @param {unknown} data */
    validateState(data) {
      return normalizePowerAllocationState(data);
    },
  },
  init: initPowerAllocationCalculator,
};
