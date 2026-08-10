import { escapeXml } from "../shared/dom.js";
import {
  createSheetFolder,
  isBuiltinSheetFolderId,
  listChildSheetFolders,
  listSheetsInFolder,
  mergeSheetFolders,
  nextUniqueSheetFolderName,
  sheetTreeRowTitle,
} from "./sheet-library.js";
import { getSheetType } from "./sheet-registry.js";

/**
 * @param {import("./state.js").SheetInstance} sheet
 * @param {number} depth
 * @param {string | null} folderId
 * @param {string | null} activeSheetId
 */
function renderSheetLeaf(sheet, depth, folderId, activeSheetId) {
  const type = getSheetType(sheet.typeId);
  const active = sheet.id === activeSheetId;
  return `
    <div class="pw-lib-tree-leaf" style="--pw-tree-depth: ${depth}">
      <div
        class="pw-sheet-row pw-sheet-row-tree${active ? " is-active" : ""}${
          sheet.included ? "" : " is-excluded"
        }"
        data-sheet-id="${sheet.id}"
        data-folder-id="${folderId ?? ""}"
      >
        <span
          class="pw-sheet-grip"
          draggable="true"
          data-sheet-drag
          title="Drag to reorder, or onto a folder to organize"
          aria-hidden="true"
        >⋮⋮</span>
        <label class="pw-sheet-include">
          <input type="checkbox" data-sheet-include ${sheet.included ? "checked" : ""} />
        </label>
        <button type="button" class="pw-sheet-select" data-sheet-select>
          <span class="pw-sheet-title" title="Double-click to rename">${escapeXml(
            sheetTreeRowTitle(sheet)
          )}</span>
          <span class="pw-sheet-meta">${escapeXml(type?.label ?? sheet.typeId)}</span>
        </button>
      </div>
    </div>`;
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 * @param {string} query
 */
function sheetMatchesQuery(sheet, query) {
  const title = sheetTreeRowTitle(sheet).toLowerCase();
  const full = String(sheet.title ?? "").toLowerCase();
  return title.includes(query) || full.includes(query);
}

/**
 * @param {{
 *   folder: import("./sheet-library.js").SheetFolder,
 *   depth: number,
 *   allFolders: import("./sheet-library.js").SheetFolder[],
 *   sheets: import("./state.js").SheetInstance[],
 *   autoPlacements: Record<string, string | null>,
 *   expandedFolderIds: Set<string>,
 *   activeFolderId: string | null,
 *   activeSheetId: string | null,
 *   renamingFolderId: string | null,
 *   searchQuery: string,
 * }} ctx
 */
function renderFolderNode(ctx) {
  const {
    folder,
    depth,
    allFolders,
    sheets,
    autoPlacements,
    expandedFolderIds,
    activeFolderId,
    activeSheetId,
    renamingFolderId,
    searchQuery,
  } = ctx;
  const isSearching = searchQuery.length > 0;
  const childFolders = listChildSheetFolders(allFolders, folder.id);
  let folderSheets = listSheetsInFolder(sheets, autoPlacements, folder.id);
  if (isSearching) {
    folderSheets = folderSheets.filter((sheet) => sheetMatchesQuery(sheet, searchQuery));
  }
  const isExpanded = isSearching || expandedFolderIds.has(folder.id);
  const isActive = activeFolderId === folder.id;
  const isRenaming = renamingFolderId === folder.id;
  const canRename = !isBuiltinSheetFolderId(folder.id);
  const hasContent = childFolders.length > 0 || folderSheets.length > 0;
  const childDepth = depth + 1;

  const childHtml = childFolders
    .map((child) => renderFolderNode({ ...ctx, folder: child, depth: childDepth }))
    .join("");

  if (isSearching && !folderSheets.length && !childHtml.trim()) return "";

  const childrenHtml = isExpanded
    ? `<div class="pw-lib-tree-children">
        ${childHtml}
        ${folderSheets
          .map((sheet) => renderSheetLeaf(sheet, childDepth, folder.id, activeSheetId))
          .join("")}
        ${
          !isSearching && !childFolders.length && !folderSheets.length
            ? `<p class="pw-lib-tree-empty">Empty folder</p>`
            : ""
        }
      </div>`
    : "";

  const labelHtml = isRenaming
    ? `<input
        type="text"
        class="pw-lib-tree-folder-rename"
        data-folder-id="${folder.id}"
        value="${escapeXml(folder.name)}"
        maxlength="48"
        aria-label="Rename folder"
      />`
    : `<button
        type="button"
        class="pw-lib-tree-folder-btn"
        data-folder-id="${folder.id}"
        ${canRename ? 'title="Double-click to rename"' : ""}
      >
        <span class="pw-lib-folder-icon" aria-hidden="true"></span>
        <span class="pw-lib-tree-folder-label">${escapeXml(folder.name)}</span>
      </button>`;

  return `
    <div class="pw-lib-tree-node">
      <div class="pw-lib-tree-row${isActive ? " is-active" : ""}${
        isExpanded ? " is-expanded" : ""
      }${isRenaming ? " is-renaming" : ""}" style="--pw-tree-depth: ${depth}">
        <button
          type="button"
          class="pw-lib-tree-toggle"
          data-folder-id="${folder.id}"
          aria-expanded="${isExpanded}"
          aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeXml(folder.name)}"
          ${hasContent ? "" : "disabled"}
        >
          <span class="pw-lib-tree-chevron" aria-hidden="true"></span>
        </button>
        ${labelHtml}
      </div>
      ${childrenHtml}
    </div>`;
}

/**
 * @param {{
 *   container: HTMLElement,
 *   autoFolders: import("./sheet-library.js").SheetFolder[],
 *   userFolders: import("./sheet-library.js").SheetFolder[],
 *   autoPlacements: Record<string, string | null>,
 *   sheets: import("./state.js").SheetInstance[],
 *   expandedFolderIds: Set<string>,
 *   activeFolderId: string | null,
 *   activeSheetId: string | null,
 *   renamingFolderId?: string | null,
 *   searchQuery?: string,
 *   onToggleFolder: (folderId: string) => void,
 *   onSelectFolder: (folderId: string | null) => void,
 *   onCreateFolder: (folder: import("./sheet-library.js").SheetFolder) => void,
 *   onRenameFolder: (folderId: string, name: string) => boolean,
 *   onDeleteFolder: (folderId: string) => void,
 *   onMoveSheet: (sheetId: string, folderId: string | null) => boolean,
 *   onBeginRenameFolder?: (folderId: string) => void,
 *   onCancelRenameFolder?: () => void,
 *   onSearchChange?: (query: string) => void,
 * }} options
 */
export function renderSheetLibraryBrowser({
  container,
  autoFolders,
  userFolders,
  autoPlacements,
  sheets,
  expandedFolderIds,
  activeFolderId,
  activeSheetId,
  renamingFolderId = null,
  searchQuery = "",
  onToggleFolder,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSheet,
  onBeginRenameFolder,
  onCancelRenameFolder,
  onSearchChange,
}) {
  const allFolders = mergeSheetFolders(autoFolders, userFolders);
  const rootFolders = listChildSheetFolders(allFolders, null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  let rootSheets = listSheetsInFolder(sheets, autoPlacements, null);
  if (isSearching) {
    rootSheets = rootSheets.filter((sheet) => sheetMatchesQuery(sheet, normalizedQuery));
  }

  const folderHtml = rootFolders
    .map((folder) =>
      renderFolderNode({
        folder,
        depth: 0,
        allFolders,
        sheets,
        autoPlacements,
        expandedFolderIds,
        activeFolderId,
        activeSheetId,
        renamingFolderId,
        searchQuery: normalizedQuery,
      })
    )
    .join("");

  const noResults = isSearching && !folderHtml.trim() && !rootSheets.length;

  const treeHtml = `
    <div class="pw-lib-tree" role="tree" aria-label="Sheet library">
      ${
        isSearching
          ? ""
          : `<div
        class="pw-lib-tree-root-drop"
        data-folder-id=""
        title="Drop sheets here to move out of folders"
      >
        <span class="pw-lib-tree-root-label">Root</span>
      </div>`
      }
      ${folderHtml}
      ${rootSheets
        .map((sheet) => renderSheetLeaf(sheet, 0, null, activeSheetId))
        .join("")}
      ${
        noResults
          ? `<p class="pw-lib-tree-empty">No sheets match "${escapeXml(searchQuery.trim())}"</p>`
          : ""
      }
    </div>`;

  const canDeleteFolder = Boolean(activeFolderId && !isBuiltinSheetFolderId(activeFolderId));

  container.innerHTML = `
    <div class="pw-lib-browser">
      <div class="pw-lib-browser-toolbar" role="toolbar" aria-label="Sheet folder actions">
        <button
          type="button"
          class="pw-lib-glyph-btn"
          data-pw-sheet-new-folder
          title="New folder in selected location"
          aria-label="New folder"
        >
          <span class="pw-lib-glyph pw-lib-glyph-folder" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="pw-lib-glyph-btn pw-lib-glyph-btn-danger"
          data-pw-sheet-delete-folder
          title="${canDeleteFolder ? "Delete selected folder" : "Select a custom folder to delete"}"
          aria-label="Delete folder"
          ${canDeleteFolder ? "" : "disabled"}
        >
          <span class="pw-lib-glyph pw-lib-glyph-delete" aria-hidden="true"></span>
        </button>
      </div>
      <input
        type="search"
        class="pw-lib-search"
        data-pw-sheet-search
        placeholder="Search sheets…"
        value="${escapeXml(searchQuery)}"
        aria-label="Search sheets across all folders"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="pw-lib-browser-list">
        ${treeHtml}
      </div>
    </div>`;

  const searchInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector("[data-pw-sheet-search]")
  );
  searchInput?.addEventListener("input", () => {
    onSearchChange?.(searchInput.value);
  });
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && searchInput.value) {
      e.preventDefault();
      e.stopPropagation();
      onSearchChange?.("");
    }
  });

  container.querySelectorAll(".pw-lib-tree-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLButtonElement} */ (btn).dataset.folderId;
      if (id) onToggleFolder(id);
    });
  });

  container.querySelectorAll(".pw-lib-tree-folder-btn").forEach((btn) => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.addEventListener("click", () => {
      onSelectFolder(button.dataset.folderId ?? null);
    });
    button.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = button.dataset.folderId;
      if (!id || isBuiltinSheetFolderId(id)) return;
      onBeginRenameFolder?.(id);
    });
  });

  const renameInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector(".pw-lib-tree-folder-rename")
  );
  if (renameInput) {
    const folderId = renameInput.dataset.folderId;
    const commit = () => {
      if (!folderId) return;
      const ok = onRenameFolder(folderId, renameInput.value);
      if (!ok) {
        renameInput.setCustomValidity("Enter a unique folder name.");
        renameInput.reportValidity();
        renameInput.focus();
        renameInput.select();
        return;
      }
      renameInput.setCustomValidity("");
    };
    const cancel = () => onCancelRenameFolder?.();

    requestAnimationFrame(() => {
      renameInput.focus();
      renameInput.select();
    });
    renameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });
    renameInput.addEventListener("blur", () => {
      queueMicrotask(() => {
        if (!container.contains(renameInput)) return;
        commit();
      });
    });
  }

  container.querySelector("[data-pw-sheet-delete-folder]")?.addEventListener("click", () => {
    if (!activeFolderId || isBuiltinSheetFolderId(activeFolderId)) return;
    onDeleteFolder(activeFolderId);
  });

  container.querySelector("[data-pw-sheet-new-folder]")?.addEventListener("click", () => {
    const name = nextUniqueSheetFolderName(activeFolderId, allFolders);
    const folder = createSheetFolder(name, activeFolderId, allFolders);
    if (!folder) return;
    onCreateFolder(folder);
  });

  /** @param {DragEvent} e */
  function moveSheetId(e) {
    return e.dataTransfer?.getData("text/x-pw-sheet-folder-move") || "";
  }

  /** @param {string | null | undefined} folderId */
  function normalizeFolderId(folderId) {
    return folderId || null;
  }

  /** @param {HTMLElement} target @param {boolean} on */
  function setDropHighlight(target, on) {
    target.classList.toggle("is-drop-target", on);
  }

  /**
   * @param {HTMLElement} el
   * @param {() => string | null} getFolderId
   */
  function bindSheetFolderDrop(el, getFolderId) {
    el.addEventListener("dragenter", (e) => {
      if (![...((e.dataTransfer?.types) ?? [])].includes("text/x-pw-sheet-folder-move")) return;
      e.preventDefault();
      setDropHighlight(el, true);
    });
    el.addEventListener("dragover", (e) => {
      if (![...((e.dataTransfer?.types) ?? [])].includes("text/x-pw-sheet-folder-move")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      setDropHighlight(el, true);
    });
    el.addEventListener("dragleave", (e) => {
      const related = /** @type {Node | null} */ (e.relatedTarget);
      if (related && el.contains(related)) return;
      setDropHighlight(el, false);
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDropHighlight(el, false);
      const sheetId = moveSheetId(e);
      if (!sheetId) return;
      const fromRaw = e.dataTransfer?.getData("text/x-pw-sheet-from-folder") ?? "";
      const fromFolderId = normalizeFolderId(fromRaw);
      const toFolderId = getFolderId();
      if (fromFolderId === toFolderId) return;
      onMoveSheet(sheetId, toFolderId);
    });
  }

  container.querySelectorAll(".pw-lib-tree-row").forEach((row) => {
    const folderId =
      /** @type {HTMLElement} */ (row).querySelector("[data-folder-id]")?.getAttribute(
        "data-folder-id"
      ) ?? null;
    if (!folderId) return;
    bindSheetFolderDrop(/** @type {HTMLElement} */ (row), () => folderId);
  });

  const rootDrop = /** @type {HTMLElement | null} */ (
    container.querySelector(".pw-lib-tree-root-drop")
  );
  if (rootDrop) {
    bindSheetFolderDrop(rootDrop, () => null);
  }
}
