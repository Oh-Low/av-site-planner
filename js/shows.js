/**
 * Shows tab — manage Shows, Rooms (per show), and global Room Templates.
 */

import { createListNameEditor } from "./shared/inline-editor.js";
import { escapeXml } from "./shared/dom.js";
import {
  addRoom,
  addShowWithEmptyRoom,
  addTemplateToShow,
  duplicateRoom,
  duplicateShow,
  duplicateTemplate,
  emptyRoomPlan,
  removeRoom,
  removeShow,
  removeTemplate,
  renameRoom,
  renameShow,
  renameTemplate,
  reorderRoom,
  reorderTemplate,
  saveRoomAsTemplate,
} from "./site-state.js";
import {
  flushActiveRoomFromCalculators,
  getShowDocument,
  markShowDocumentMutated,
  schedulePersist,
  switchActiveRoom,
} from "./show-document-runtime.js";

const DRAG_ROOM = "application/x-av-show-room";
const DRAG_TEMPLATE = "application/x-av-show-template";

/**
 * @param {{
 *   getCalculators: () => Record<string, object | null>,
 *   setStatus?: (message: string, isError?: boolean) => void,
 *   setDirty?: (dirty: boolean) => void,
 * }} options
 */
export function initShowsManager(options) {
  const root = document.getElementById("shows");
  if (!root) return null;

  const els = {
    showList: document.getElementById("shows-show-list"),
    roomList: document.getElementById("shows-room-list"),
    templateList: document.getElementById("shows-template-list"),
    showAdd: document.getElementById("shows-show-add"),
    showDuplicate: document.getElementById("shows-show-duplicate"),
    roomAdd: document.getElementById("shows-room-add"),
    roomDuplicate: document.getElementById("shows-room-duplicate"),
    roomSaveTemplate: document.getElementById("shows-room-save-template"),
    templateAddToShow: document.getElementById("shows-template-add-to-show"),
    templateDuplicate: document.getElementById("shows-template-duplicate"),
    status: document.getElementById("shows-status"),
    deleteModal: document.getElementById("shows-delete-modal"),
    deleteMessage: document.getElementById("shows-delete-message"),
    deleteClose: document.getElementById("shows-delete-close"),
    deleteCancel: document.getElementById("shows-delete-cancel"),
    deleteConfirm: document.getElementById("shows-delete-confirm"),
  };

  /** @type {string | null} */
  let selectedTemplateId = null;
  /** @type {{ kind: "room" | "template", id: string } | null} */
  let activeDrag = null;
  let suppressNextClick = false;
  /** @type {{ kind: "show" | "room" | "template", id: string } | null} */
  let pendingDelete = null;
  /** @type {((confirmed: boolean) => void) | null} */
  let deleteResolver = null;

  function status(message, isError = false) {
    if (els.status) {
      els.status.textContent = message;
      els.status.classList.toggle("status-error", isError);
    }
    options.setStatus?.(message, isError);
  }

  function doc() {
    return getShowDocument();
  }

  function calculators() {
    return options.getCalculators();
  }

  function afterMutate() {
    render();
    markShowDocumentMutated(calculators());
  }

  function selectedShowId() {
    return doc().activeShowId;
  }

  function selectedRoomId() {
    return doc().activeRoomId;
  }

  /**
   * @param {"show" | "room" | "template"} kind
   * @param {string} id
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  function confirmDelete(kind, id, name) {
    if (deleteResolver) {
      deleteResolver(false);
      deleteResolver = null;
    }
    pendingDelete = { kind, id };
    if (els.deleteMessage) {
      els.deleteMessage.textContent = `Are you sure you want to DELETE ${name}?`;
    }
    if (els.deleteModal) els.deleteModal.hidden = false;
    els.deleteConfirm?.focus();
    return new Promise((resolve) => {
      deleteResolver = resolve;
    });
  }

  function closeDeleteModal(confirmed = false) {
    if (els.deleteModal) els.deleteModal.hidden = true;
    pendingDelete = null;
    const resolve = deleteResolver;
    deleteResolver = null;
    resolve?.(confirmed);
  }

  /**
   * @param {HTMLElement | null} listEl
   * @param {{ id: string, name: string }[]} items
   * @param {string | null} selectedId
   * @param {string} dataAttr
   * @param {{ draggable?: boolean, withDelete?: boolean, deleteDisabled?: boolean, deleteKind?: "show" | "room" | "template" }} [opts]
   */
  function renderList(listEl, items, selectedId, dataAttr, opts = {}) {
    if (!listEl) return;
    const { draggable = false, withDelete = false, deleteDisabled = false, deleteKind = "room" } =
      opts;
    if (!items.length) {
      listEl.innerHTML = `<p class="resource-empty">Nothing here yet.</p>`;
      return;
    }
    listEl.innerHTML = items
      .map((item) => {
        const selected = item.id === selectedId ? " selected" : "";
        const dragAttr = draggable ? ` draggable="true" title="Drag to reorder or copy"` : "";
        const rowClass = withDelete ? " grid-item shows-list-item" : " grid-item";
        const deleteBtn = withDelete
          ? `<button type="button" class="btn btn-icon btn-icon-danger shows-item-delete" data-delete-kind="${deleteKind}" data-delete-id="${escapeXml(
              item.id
            )}" aria-label="Delete ${escapeXml(item.name)}" title="Delete" ${
              deleteDisabled ? "disabled" : ""
            }>×</button>`
          : "";
        if (withDelete) {
          return `<div class="${rowClass.trim()}${selected}" ${dataAttr}="${escapeXml(
            item.id
          )}"${dragAttr}><span class="grid-item-name">${escapeXml(
            item.name
          )}</span>${deleteBtn}</div>`;
        }
        return `<button type="button" class="grid-item${selected}" ${dataAttr}="${escapeXml(
          item.id
        )}"${dragAttr}><span class="grid-item-name">${escapeXml(item.name)}</span></button>`;
      })
      .join("");
  }

  function clearDropIndicators() {
    for (const list of [els.roomList, els.templateList]) {
      list?.classList.remove("is-drop-target");
      list
        ?.querySelectorAll(".is-dragging, .is-drop-before, .is-drop-after")
        .forEach((el) => {
          el.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
        });
    }
  }

  /**
   * @param {HTMLElement} listEl
   * @param {string} itemAttr
   * @param {DragEvent} e
   * @returns {{ targetId: string | null, place: "before" | "after", insertIndex: number }}
   */
  function dropPlacement(listEl, itemAttr, e) {
    const items = [...listEl.querySelectorAll(`.grid-item[${itemAttr}]`)];
    const row = e.target instanceof Element ? e.target.closest(`.grid-item[${itemAttr}]`) : null;
    if (row instanceof HTMLElement) {
      const targetId = row.getAttribute(itemAttr);
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const index = items.indexOf(row);
      return {
        targetId,
        place: before ? "before" : "after",
        insertIndex: before ? index : index + 1,
      };
    }
    return { targetId: null, place: "after", insertIndex: items.length };
  }

  function render() {
    const d = doc();
    const show = d.shows.find((s) => s.id === d.activeShowId) ?? d.shows[0] ?? null;
    renderList(els.showList, d.shows, show?.id ?? null, "data-show-id", {
      withDelete: true,
      deleteDisabled: d.shows.length <= 1,
      deleteKind: "show",
    });
    renderList(els.roomList, show?.rooms ?? [], d.activeRoomId, "data-room-id", {
      draggable: true,
      withDelete: true,
      deleteDisabled: (show?.rooms.length ?? 0) <= 1,
      deleteKind: "room",
    });
    if (
      selectedTemplateId &&
      !d.templates.some((t) => t.id === selectedTemplateId)
    ) {
      selectedTemplateId = d.templates[0]?.id ?? null;
    }
    renderList(els.templateList, d.templates, selectedTemplateId, "data-template-id", {
      draggable: true,
      withDelete: true,
      deleteKind: "template",
    });

    const hasShow = Boolean(show);
    if (els.roomSaveTemplate) els.roomSaveTemplate.disabled = !d.activeRoomId;
    if (els.templateAddToShow) {
      els.templateAddToShow.disabled = !hasShow || !selectedTemplateId;
    }
    if (els.templateDuplicate) els.templateDuplicate.disabled = !selectedTemplateId;
  }

  const showNameEditor = createListNameEditor({
    listEl: /** @type {HTMLElement} */ (els.showList),
    itemSelector: ".grid-item",
    getItemId: (el) => /** @type {HTMLElement} */ (el).dataset.showId,
    getName: (id) => doc().shows.find((s) => s.id === id)?.name,
    setName: (id, name) => renameShow(doc(), id, name),
    onCommit: () => afterMutate(),
  });

  const roomNameEditor = createListNameEditor({
    listEl: /** @type {HTMLElement} */ (els.roomList),
    itemSelector: ".grid-item",
    getItemId: (el) => /** @type {HTMLElement} */ (el).dataset.roomId,
    getName: (id) => {
      const show = doc().shows.find((s) => s.id === doc().activeShowId);
      return show?.rooms.find((r) => r.id === id)?.name;
    },
    setName: (id, name) => {
      const showId = doc().activeShowId;
      if (!showId) return;
      renameRoom(doc(), showId, id, name);
    },
    onCommit: () => afterMutate(),
  });

  const templateNameEditor = createListNameEditor({
    listEl: /** @type {HTMLElement} */ (els.templateList),
    itemSelector: ".grid-item",
    getItemId: (el) => /** @type {HTMLElement} */ (el).dataset.templateId,
    getName: (id) => doc().templates.find((t) => t.id === id)?.name,
    setName: (id, name) => renameTemplate(doc(), id, name),
    onCommit: () => afterMutate(),
  });

  /**
   * @param {HTMLElement | null} listEl
   * @param {"room" | "template"} kind
   * @param {string} idAttr
   * @param {string} mime
   */
  function bindListDragSource(listEl, kind, idAttr, mime) {
    listEl?.addEventListener("dragstart", (e) => {
      if (e.target instanceof Element && e.target.closest(".shows-item-delete")) {
        e.preventDefault();
        return;
      }
      const item = e.target instanceof Element ? e.target.closest(`.grid-item[${idAttr}]`) : null;
      if (!(item instanceof HTMLElement)) {
        e.preventDefault();
        return;
      }
      const id = item.getAttribute(idAttr);
      if (!id) {
        e.preventDefault();
        return;
      }
      activeDrag = { kind, id };
      suppressNextClick = false;
      item.classList.add("is-dragging");
      e.dataTransfer?.setData(mime, id);
      e.dataTransfer?.setData("text/plain", id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
    });

    listEl?.addEventListener("dragend", () => {
      if (activeDrag) suppressNextClick = true;
      activeDrag = null;
      clearDropIndicators();
    });
  }

  /**
   * @param {HTMLElement | null} listEl
   * @param {"room" | "template"} listKind
   * @param {string} idAttr
   * @param {(payload: {
   *   drag: { kind: "room" | "template", id: string },
   *   targetId: string | null,
   *   place: "before" | "after",
   *   insertIndex: number,
   * }) => void} onDrop
   */
  function bindListDropTarget(listEl, listKind, idAttr, onDrop) {
    listEl?.addEventListener("dragover", (e) => {
      if (!activeDrag) return;
      const sameList = activeDrag.kind === listKind;
      const crossCopy =
        (activeDrag.kind === "room" && listKind === "template") ||
        (activeDrag.kind === "template" && listKind === "room");
      if (!sameList && !crossCopy) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = sameList ? "move" : "copy";
      listEl.classList.add("is-drop-target");
      const { targetId, place } = dropPlacement(listEl, idAttr, e);
      listEl
        .querySelectorAll(".is-drop-before, .is-drop-after")
        .forEach((el) => el.classList.remove("is-drop-before", "is-drop-after"));
      if (targetId) {
        const row = listEl.querySelector(`.grid-item[${idAttr}="${CSS.escape(targetId)}"]`);
        row?.classList.add(place === "before" ? "is-drop-before" : "is-drop-after");
      }
    });

    listEl?.addEventListener("dragleave", (e) => {
      if (!(e.target instanceof Node) || !listEl.contains(e.relatedTarget)) {
        listEl.classList.remove("is-drop-target");
        listEl
          .querySelectorAll(".is-drop-before, .is-drop-after")
          .forEach((el) => el.classList.remove("is-drop-before", "is-drop-after"));
      }
    });

    listEl?.addEventListener("drop", (e) => {
      if (!activeDrag) return;
      const drag = activeDrag;
      const sameList = drag.kind === listKind;
      const crossCopy =
        (drag.kind === "room" && listKind === "template") ||
        (drag.kind === "template" && listKind === "room");
      if (!sameList && !crossCopy) return;
      e.preventDefault();
      const placement = dropPlacement(listEl, idAttr, e);
      clearDropIndicators();
      onDrop({ drag, ...placement });
      activeDrag = null;
      suppressNextClick = true;
    });
  }

  bindListDragSource(els.roomList, "room", "data-room-id", DRAG_ROOM);
  bindListDragSource(els.templateList, "template", "data-template-id", DRAG_TEMPLATE);

  bindListDropTarget(els.roomList, "room", "data-room-id", ({ drag, targetId, place, insertIndex }) => {
    const showId = selectedShowId();
    if (!showId) return;

    if (drag.kind === "room") {
      if (!targetId || drag.id === targetId) return;
      if (!reorderRoom(doc(), showId, drag.id, targetId, place)) return;
      afterMutate();
      status("Room order updated.");
      return;
    }

    flushActiveRoomFromCalculators(calculators());
    const room = addTemplateToShow(doc(), showId, drag.id, undefined, insertIndex);
    if (!room) return;
    selectedTemplateId = drag.id;
    switchActiveRoom(calculators(), showId, room.id);
    afterMutate();
    status(`Added “${room.name}” from template.`);
  });

  bindListDropTarget(
    els.templateList,
    "template",
    "data-template-id",
    ({ drag, targetId, place, insertIndex }) => {
      if (drag.kind === "template") {
        if (!targetId || drag.id === targetId) return;
        if (!reorderTemplate(doc(), drag.id, targetId, place)) return;
        selectedTemplateId = drag.id;
        afterMutate();
        status("Template order updated.");
        return;
      }

      const showId = selectedShowId();
      if (!showId) return;
      flushActiveRoomFromCalculators(calculators());
      const template = saveRoomAsTemplate(doc(), showId, drag.id, undefined, insertIndex);
      if (!template) return;
      selectedTemplateId = template.id;
      afterMutate();
      status(`Saved template “${template.name}”.`);
    }
  );

  els.showList?.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const deleteBtn = target.closest(".shows-item-delete");
    if (deleteBtn instanceof HTMLButtonElement) {
      e.preventDefault();
      e.stopPropagation();
      if (deleteBtn.disabled) return;
      const showId = deleteBtn.dataset.deleteId;
      if (!showId) return;
      const show = doc().shows.find((s) => s.id === showId);
      if (!show) return;
      void (async () => {
        const ok = await confirmDelete("show", showId, show.name);
        if (!ok) return;
        flushActiveRoomFromCalculators(calculators());
        if (!removeShow(doc(), showId)) {
          status("Keep at least one show.", true);
          return;
        }
        const next = doc().shows.find((s) => s.id === doc().activeShowId);
        const roomId = doc().activeRoomId;
        if (next && roomId) switchActiveRoom(calculators(), next.id, roomId);
        afterMutate();
        status("Show removed.");
      })();
      return;
    }
    if (target.closest(".grid-item-name") && e.detail === 2) {
      showNameEditor.open(/** @type {HTMLElement} */ (target.closest(".grid-item-name")));
      return;
    }
    const item = target.closest(".grid-item");
    const showId = item instanceof HTMLElement ? item.dataset.showId : null;
    if (!showId) return;
    const d = doc();
    const show = d.shows.find((s) => s.id === showId);
    if (!show) return;
    d.activeShowId = showId;
    const roomId = show.rooms.some((r) => r.id === d.activeRoomId)
      ? d.activeRoomId
      : show.rooms[0]?.id;
    if (roomId) {
      switchActiveRoom(calculators(), showId, roomId);
    }
    render();
    status(`Show “${show.name}”.`);
  });

  els.roomList?.addEventListener("click", (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.preventDefault();
      return;
    }
    const target = /** @type {HTMLElement} */ (e.target);
    const deleteBtn = target.closest(".shows-item-delete");
    if (deleteBtn instanceof HTMLButtonElement) {
      e.preventDefault();
      e.stopPropagation();
      if (deleteBtn.disabled) return;
      const roomId = deleteBtn.dataset.deleteId;
      const showId = selectedShowId();
      if (!showId || !roomId) return;
      const room = doc().shows.find((s) => s.id === showId)?.rooms.find((r) => r.id === roomId);
      if (!room) return;
      void (async () => {
        const ok = await confirmDelete("room", roomId, room.name);
        if (!ok) return;
        flushActiveRoomFromCalculators(calculators());
        if (!removeRoom(doc(), showId, roomId)) {
          status("Keep at least one room in the show.", true);
          return;
        }
        const nextId = doc().activeRoomId;
        if (nextId) switchActiveRoom(calculators(), showId, nextId);
        afterMutate();
        status("Room removed.");
      })();
      return;
    }
    if (target.closest(".grid-item-name") && e.detail === 2) {
      roomNameEditor.open(/** @type {HTMLElement} */ (target.closest(".grid-item-name")));
      return;
    }
    const item = target.closest(".grid-item");
    const roomId = item instanceof HTMLElement ? item.dataset.roomId : null;
    const showId = selectedShowId();
    if (!showId || !roomId) return;
    switchActiveRoom(calculators(), showId, roomId);
    render();
    const room = doc().shows.find((s) => s.id === showId)?.rooms.find((r) => r.id === roomId);
    status(room ? `Loaded room “${room.name}”.` : "Room loaded.");
  });

  els.templateList?.addEventListener("click", (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      e.preventDefault();
      return;
    }
    const target = /** @type {HTMLElement} */ (e.target);
    const deleteBtn = target.closest(".shows-item-delete");
    if (deleteBtn instanceof HTMLButtonElement) {
      e.preventDefault();
      e.stopPropagation();
      if (deleteBtn.disabled) return;
      const templateId = deleteBtn.dataset.deleteId;
      if (!templateId) return;
      const template = doc().templates.find((t) => t.id === templateId);
      if (!template) return;
      void (async () => {
        const ok = await confirmDelete("template", templateId, template.name);
        if (!ok) return;
        if (!removeTemplate(doc(), templateId)) return;
        selectedTemplateId = doc().templates[0]?.id ?? null;
        afterMutate();
        status("Template removed.");
      })();
      return;
    }
    if (target.closest(".grid-item-name") && e.detail === 2) {
      templateNameEditor.open(/** @type {HTMLElement} */ (target.closest(".grid-item-name")));
      return;
    }
    const item = target.closest(".grid-item");
    const templateId = item instanceof HTMLElement ? item.dataset.templateId : null;
    if (!templateId) return;
    selectedTemplateId = templateId;
    render();
  });

  els.showAdd?.addEventListener("click", () => {
    flushActiveRoomFromCalculators(calculators());
    const show = addShowWithEmptyRoom(doc(), emptyRoomPlan());
    switchActiveRoom(calculators(), show.id, show.rooms[0].id);
    afterMutate();
    status(`Added show “${show.name}”.`);
  });

  els.showDuplicate?.addEventListener("click", () => {
    const showId = selectedShowId();
    if (!showId) return;
    flushActiveRoomFromCalculators(calculators());
    const copy = duplicateShow(doc(), showId);
    if (!copy) return;
    switchActiveRoom(calculators(), copy.id, copy.rooms[0].id);
    afterMutate();
    status(`Duplicated show “${copy.name}”.`);
  });

  els.roomAdd?.addEventListener("click", () => {
    const showId = selectedShowId();
    if (!showId) return;
    flushActiveRoomFromCalculators(calculators());
    const room = addRoom(doc(), showId, emptyRoomPlan());
    if (!room) return;
    switchActiveRoom(calculators(), showId, room.id);
    afterMutate();
    status(`Added room “${room.name}”.`);
  });

  els.roomDuplicate?.addEventListener("click", () => {
    const showId = selectedShowId();
    const roomId = selectedRoomId();
    if (!showId || !roomId) return;
    flushActiveRoomFromCalculators(calculators());
    const copy = duplicateRoom(doc(), showId, roomId);
    if (!copy) return;
    switchActiveRoom(calculators(), showId, copy.id);
    afterMutate();
    status(`Duplicated room “${copy.name}”.`);
  });

  els.roomSaveTemplate?.addEventListener("click", () => {
    const showId = selectedShowId();
    const roomId = selectedRoomId();
    if (!showId || !roomId) return;
    flushActiveRoomFromCalculators(calculators());
    const template = saveRoomAsTemplate(doc(), showId, roomId);
    if (!template) return;
    selectedTemplateId = template.id;
    afterMutate();
    status(`Saved template “${template.name}”.`);
  });

  els.templateAddToShow?.addEventListener("click", () => {
    const showId = selectedShowId();
    if (!showId || !selectedTemplateId) return;
    flushActiveRoomFromCalculators(calculators());
    const room = addTemplateToShow(doc(), showId, selectedTemplateId);
    if (!room) return;
    switchActiveRoom(calculators(), showId, room.id);
    afterMutate();
    status(`Added “${room.name}” from template.`);
  });

  els.templateDuplicate?.addEventListener("click", () => {
    if (!selectedTemplateId) return;
    const copy = duplicateTemplate(doc(), selectedTemplateId);
    if (!copy) return;
    selectedTemplateId = copy.id;
    afterMutate();
    status(`Duplicated template “${copy.name}”.`);
  });

  els.deleteClose?.addEventListener("click", () => closeDeleteModal(false));
  els.deleteCancel?.addEventListener("click", () => closeDeleteModal(false));
  els.deleteConfirm?.addEventListener("click", () => closeDeleteModal(true));
  els.deleteModal?.addEventListener("click", (event) => {
    if (event.target === els.deleteModal) closeDeleteModal(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.deleteModal && !els.deleteModal.hidden) {
      closeDeleteModal(false);
    }
  });

  render();
  schedulePersist(calculators());

  return {
    render,
    refresh: render,
  };
}
