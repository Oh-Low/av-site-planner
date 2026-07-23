import { escapeXml } from "../shared/dom.js";
import {
  createLibraryFolder,
  isBuiltinLibraryFolderId,
  listChildLibraryFolders,
  listItemsInLibraryFolder,
  mergeLibraryFolders,
  nextUniqueLibraryFolderName,
} from "./element-library.js?v=1";

/**
 * @param {import("./element-catalog.js").AddableElement} item
 * @param {number} depth
 * @param {string | null} folderId
 */
function renderItemLeaf(item, depth, folderId) {
  return `
    <div class="pw-lib-tree-leaf" style="--pw-tree-depth: ${depth}">
      <button
        type="button"
        class="pw-lib-item pw-lib-item-tree"
        draggable="true"
        data-lib-id="${escapeXml(item.id)}"
        data-folder-id="${folderId ?? ""}"
        data-movable="1"
        title="Drag onto the page, or onto a folder to organize"
      >
        <span class="pw-lib-item-label">${escapeXml(item.label)}</span>
      </button>
    </div>`;
}

/**
 * @param {import("./element-catalog.js").AddableElement} item
 * @param {string} query
 */
function itemMatchesQuery(item, query) {
  return item.label.toLowerCase().includes(query);
}

/**
 * @param {{
 *   folder: import("./element-library.js").LibraryFolder,
 *   depth: number,
 *   allFolders: import("./element-library.js").LibraryFolder[],
 *   items: import("./element-catalog.js").AddableElement[],
 *   autoPlacements: import("./element-library.js").LibraryPlacement[],
 *   userPlacements: Record<string, string | null>,
 *   expandedFolderIds: Set<string>,
 *   activeFolderId: string | null,
 *   renamingFolderId: string | null,
 *   searchQuery: string,
 * }} ctx
 */
function renderFolderNode(ctx) {
  const {
    folder,
    depth,
    allFolders,
    items,
    autoPlacements,
    userPlacements,
    expandedFolderIds,
    activeFolderId,
    renamingFolderId,
    searchQuery,
  } = ctx;
  const isSearching = searchQuery.length > 0;
  const childFolders = listChildLibraryFolders(allFolders, folder.id);
  let folderItems = listItemsInLibraryFolder(
    items,
    autoPlacements,
    userPlacements,
    folder.id
  );
  if (isSearching) {
    folderItems = folderItems.filter((item) => itemMatchesQuery(item, searchQuery));
  }
  const isExpanded = isSearching || expandedFolderIds.has(folder.id);
  const isActive = activeFolderId === folder.id;
  const isRenaming = renamingFolderId === folder.id;
  const canRename = !isBuiltinLibraryFolderId(folder.id);
  const hasContent = childFolders.length > 0 || folderItems.length > 0;
  const childDepth = depth + 1;

  const childHtml = childFolders
    .map((child) => renderFolderNode({ ...ctx, folder: child, depth: childDepth }))
    .join("");

  if (isSearching && !folderItems.length && !childHtml.trim()) return "";

  const childrenHtml = isExpanded
    ? `<div class="pw-lib-tree-children">
        ${childHtml}
        ${folderItems.map((item) => renderItemLeaf(item, childDepth, folder.id)).join("")}
        ${
          !isSearching && !childFolders.length && !folderItems.length
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
 *   autoFolders: import("./element-library.js").LibraryFolder[],
 *   userFolders: import("./element-library.js").LibraryFolder[],
 *   autoPlacements: import("./element-library.js").LibraryPlacement[],
 *   userPlacements: Record<string, string | null>,
 *   items: import("./element-catalog.js").AddableElement[],
 *   expandedFolderIds: Set<string>,
 *   activeFolderId: string | null,
 *   renamingFolderId?: string | null,
 *   searchQuery?: string,
 *   onToggleFolder: (folderId: string) => void,
 *   onSelectFolder: (folderId: string | null) => void,
 *   onCreateFolder: (folder: import("./element-library.js").LibraryFolder) => void,
 *   onRenameFolder: (folderId: string, name: string) => boolean,
 *   onDeleteFolder: (folderId: string) => void,
 *   onMoveItem: (itemId: string, folderId: string | null) => boolean,
 *   onBeginRenameFolder?: (folderId: string) => void,
 *   onCancelRenameFolder?: () => void,
 *   onSearchChange?: (query: string) => void,
 * }} options
 */
export function renderElementLibraryBrowser({
  container,
  autoFolders,
  userFolders,
  autoPlacements,
  userPlacements,
  items,
  expandedFolderIds,
  activeFolderId,
  renamingFolderId = null,
  searchQuery = "",
  onToggleFolder,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveItem,
  onBeginRenameFolder,
  onCancelRenameFolder,
  onSearchChange,
}) {
  const allFolders = mergeLibraryFolders(autoFolders, userFolders);
  const rootFolders = listChildLibraryFolders(allFolders, null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  let rootItems = listItemsInLibraryFolder(items, autoPlacements, userPlacements, null);
  if (isSearching) {
    rootItems = rootItems.filter((item) => itemMatchesQuery(item, normalizedQuery));
  }

  const folderHtml = rootFolders
    .map((folder) =>
      renderFolderNode({
        folder,
        depth: 0,
        allFolders,
        items,
        autoPlacements,
        userPlacements,
        expandedFolderIds,
        activeFolderId,
        renamingFolderId,
        searchQuery: normalizedQuery,
      })
    )
    .join("");

  const noResults = isSearching && !folderHtml.trim() && !rootItems.length;

  const treeHtml = `
    <div class="pw-lib-tree" role="tree" aria-label="Element library">
      ${
        isSearching
          ? ""
          : `<div
        class="pw-lib-tree-root-drop"
        data-folder-id=""
        title="Drop elements here to move out of folders"
      >
        <span class="pw-lib-tree-root-label">Root</span>
      </div>`
      }
      ${folderHtml}
      ${rootItems.map((item) => renderItemLeaf(item, 0, null)).join("")}
      ${
        noResults
          ? `<p class="pw-lib-tree-empty">No elements match "${escapeXml(searchQuery.trim())}"</p>`
          : ""
      }
      ${
        !isSearching && !items.length
          ? `<p class="pw-lib-tree-empty">No elements available yet — add calculator data first.</p>`
          : ""
      }
    </div>`;

  const canDeleteFolder = Boolean(activeFolderId && !isBuiltinLibraryFolderId(activeFolderId));

  container.innerHTML = `
    <div class="pw-lib-browser">
      <div class="pw-lib-browser-toolbar" role="toolbar" aria-label="Library actions">
        <button
          type="button"
          class="pw-lib-glyph-btn"
          data-pw-lib-new-folder
          title="New folder in selected location"
          aria-label="New folder"
        >
          <span class="pw-lib-glyph pw-lib-glyph-folder" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="pw-lib-glyph-btn pw-lib-glyph-btn-danger"
          data-pw-lib-delete-folder
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
        data-pw-lib-search
        placeholder="Search elements…"
        value="${escapeXml(searchQuery)}"
        aria-label="Search elements across all folders"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="pw-lib-browser-list">
        ${treeHtml}
      </div>
    </div>`;

  const searchInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector("[data-pw-lib-search]")
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
      if (!id || isBuiltinLibraryFolderId(id)) return;
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

  container.querySelector("[data-pw-lib-delete-folder]")?.addEventListener("click", () => {
    if (!activeFolderId || isBuiltinLibraryFolderId(activeFolderId)) return;
    onDeleteFolder(activeFolderId);
  });

  container.querySelector("[data-pw-lib-new-folder]")?.addEventListener("click", () => {
    const name = nextUniqueLibraryFolderName(activeFolderId, allFolders);
    const folder = createLibraryFolder(name, activeFolderId, allFolders);
    if (!folder) return;
    onCreateFolder(folder);
  });

  /** @param {DragEvent} e */
  function libraryMoveItemId(e) {
    return e.dataTransfer?.getData("text/x-pw-library-move") || "";
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
  function bindItemDropTarget(el, getFolderId) {
    el.addEventListener("dragenter", (e) => {
      if (![...((e.dataTransfer?.types) ?? [])].includes("text/x-pw-library-move")) return;
      e.preventDefault();
      setDropHighlight(el, true);
    });
    el.addEventListener("dragover", (e) => {
      if (![...((e.dataTransfer?.types) ?? [])].includes("text/x-pw-library-move")) return;
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
      const itemId = libraryMoveItemId(e);
      if (!itemId) return;
      const fromRaw = e.dataTransfer?.getData("text/x-pw-library-from-folder") ?? "";
      const fromFolderId = normalizeFolderId(fromRaw);
      const toFolderId = getFolderId();
      if (fromFolderId === toFolderId) return;
      onMoveItem(itemId, toFolderId);
    });
  }

  container.querySelectorAll(".pw-lib-tree-row").forEach((row) => {
    const folderId =
      /** @type {HTMLElement} */ (row).querySelector("[data-folder-id]")?.getAttribute(
        "data-folder-id"
      ) ?? null;
    if (!folderId) return;
    bindItemDropTarget(/** @type {HTMLElement} */ (row), () => folderId);
  });

  const rootDrop = /** @type {HTMLElement | null} */ (
    container.querySelector(".pw-lib-tree-root-drop")
  );
  if (rootDrop) {
    bindItemDropTarget(rootDrop, () => null);
  }
}
