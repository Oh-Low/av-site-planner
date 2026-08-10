import { escapeXml } from "./shared/dom.js";
import {
  BUILTIN_FOLDERS,
  BUILTIN_GEAR_PLACEMENTS,
  createGearFolder,
  isBuiltinFolderId,
  isBuiltinGearId,
  listChildFolders,
  listGearInFolder,
  mergeGearFolders,
  nextUniqueFolderName,
} from "./signal-flow-gear-library.js";

/**
 * @param {import("./signal-flow-data.js").GearType} item
 * @param {number} depth
 * @param {string | null} folderId
 */
function renderGearLeaf(item, depth, folderId) {
  const movable = !isBuiltinGearId(item.id);
  return `
    <div class="sf-gear-tree-leaf" style="--sf-tree-depth: ${depth}">
      <div
        class="sf-palette-item sf-palette-item-tree"
        draggable="true"
        data-gear-type="${item.id}"
        data-folder-id="${folderId ?? ""}"
        data-movable="${movable ? "1" : "0"}"
        title="${movable ? "Drag onto the canvas, or onto a folder to move" : "Drag onto the canvas"}"
      >
        <span class="sf-palette-label">${escapeXml(item.label)}</span>
        <button
          type="button"
          class="sf-gear-leaf-edit"
          draggable="false"
          data-gear-id="${item.id}"
          title="Edit gear"
          aria-label="Edit ${escapeXml(item.label)}"
        >✎</button>
      </div>
    </div>`;
}

/**
 * @param {import("./signal-flow-data.js").GearType} item
 * @param {string} query normalized lowercase search query
 */
function gearMatchesQuery(item, query) {
  return item.label.toLowerCase().includes(query);
}

/**
 * @param {{
 *   folder: import("./signal-flow-gear-library.js").GearFolder,
 *   depth: number,
 *   allFolders: import("./signal-flow-gear-library.js").GearFolder[],
 *   customPremade: import("./signal-flow-data.js").GearType[],
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
    customPremade,
    expandedFolderIds,
    activeFolderId,
    renamingFolderId,
    searchQuery,
  } = ctx;
  const isSearching = searchQuery.length > 0;
  const childFolders = listChildFolders(allFolders, folder.id);
  let gear = listGearInFolder(allFolders, BUILTIN_GEAR_PLACEMENTS, customPremade, folder.id);
  if (isSearching) {
    gear = gear.filter((item) => gearMatchesQuery(item, searchQuery));
  }
  const isExpanded = isSearching || expandedFolderIds.has(folder.id);
  const isActive = activeFolderId === folder.id;
  const isRenaming = renamingFolderId === folder.id;
  const isLibraryRoot = folder.id === "fld-library";
  const childDepth = isLibraryRoot ? depth : depth + 1;
  const canRename = !isBuiltinFolderId(folder.id);
  const hasContent = childFolders.length > 0 || gear.length > 0;

  const childHtml = childFolders
    .map((child) => renderFolderNode({ ...ctx, folder: child, depth: childDepth }))
    .join("");

  // While searching, hide folders with no matching gear anywhere inside.
  if (isSearching && !gear.length && !childHtml.trim()) return "";

  const childrenHtml = isExpanded
    ? `<div class="sf-gear-tree-children${isLibraryRoot ? " sf-gear-tree-children--flush" : ""}">
        ${childHtml}
        ${gear.map((item) => renderGearLeaf(item, childDepth, folder.id)).join("")}
        ${
          !isSearching && !childFolders.length && !gear.length
            ? `<p class="sf-gear-tree-empty">Empty folder</p>`
            : ""
        }
      </div>`
    : "";

  const labelHtml = isRenaming
    ? `<input
        type="text"
        class="sf-gear-tree-folder-rename"
        data-folder-id="${folder.id}"
        value="${escapeXml(folder.name)}"
        maxlength="48"
        aria-label="Rename folder"
      />`
    : `<button
        type="button"
        class="sf-gear-tree-folder-btn"
        data-folder-id="${folder.id}"
        ${canRename ? 'title="Double-click to rename"' : ""}
      >
        ${isLibraryRoot ? "" : `<span class="sf-gear-folder-icon" aria-hidden="true"></span>`}
        <span class="sf-gear-tree-folder-label">${escapeXml(folder.name)}</span>
      </button>`;

  return `
    <div class="sf-gear-tree-node${isLibraryRoot ? " sf-gear-tree-node--library" : ""}">
      <div class="sf-gear-tree-row${isActive ? " is-active" : ""}${isExpanded ? " is-expanded" : ""}${isRenaming ? " is-renaming" : ""}" style="--sf-tree-depth: ${depth}">
        <button
          type="button"
          class="sf-gear-tree-toggle"
          data-folder-id="${folder.id}"
          aria-expanded="${isExpanded}"
          aria-label="${isExpanded ? "Collapse" : "Expand"} ${escapeXml(folder.name)}"
          ${hasContent ? "" : "disabled"}
        >
          <span class="sf-gear-tree-chevron" aria-hidden="true"></span>
        </button>
        ${labelHtml}
      </div>
      ${childrenHtml}
    </div>`;
}

/**
 * @param {{
 *   container: HTMLElement,
 *   userFolders: import("./signal-flow-gear-library.js").GearFolder[],
 *   customPremade: import("./signal-flow-data.js").GearType[],
 *   expandedFolderIds: Set<string>,
 *   activeFolderId: string | null,
 *   renamingFolderId?: string | null,
 *   onToggleFolder: (folderId: string) => void,
 *   onSelectFolder: (folderId: string | null) => void,
 *   onCreateGear: () => void,
 *   onCreateFolder: (folder: import("./signal-flow-gear-library.js").GearFolder) => void,
 *   onRenameFolder: (folderId: string, name: string) => boolean,
 *   onDeleteFolder: (folderId: string) => void,
 *   onMoveGear: (gearId: string, folderId: string | null) => boolean,
 *   onBeginRenameFolder?: (folderId: string) => void,
 *   onCancelRenameFolder?: () => void,
 *   onEditGear?: (gearId: string) => void,
 *   onExportFolder?: () => void,
 *   onImportCatalog?: (file: File) => void,
 *   searchQuery?: string,
 *   onSearchChange?: (query: string) => void,
 * }} options
 */
export function renderPremadeGearBrowser({
  container,
  userFolders,
  customPremade,
  expandedFolderIds,
  activeFolderId,
  renamingFolderId = null,
  onToggleFolder,
  onSelectFolder,
  onCreateGear,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveGear,
  onBeginRenameFolder,
  onCancelRenameFolder,
  onEditGear,
  onExportFolder,
  onImportCatalog,
  searchQuery = "",
  onSearchChange,
}) {
  const allFolders = mergeGearFolders(BUILTIN_FOLDERS, userFolders);
  const rootFolders = listChildFolders(allFolders, null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  let rootGear = listGearInFolder(allFolders, BUILTIN_GEAR_PLACEMENTS, customPremade, null);
  if (isSearching) {
    rootGear = rootGear.filter((item) => gearMatchesQuery(item, normalizedQuery));
  }

  const folderHtml = rootFolders
    .map((folder) =>
      renderFolderNode({
        folder,
        depth: 0,
        allFolders,
        customPremade,
        expandedFolderIds,
        activeFolderId,
        renamingFolderId,
        searchQuery: normalizedQuery,
      })
    )
    .join("");

  const noResults = isSearching && !folderHtml.trim() && !rootGear.length;

  const treeHtml = `
    <div class="sf-gear-tree" role="tree" aria-label="Premade gear library">
      ${
        isSearching
          ? ""
          : `<div
        class="sf-gear-tree-root-drop"
        data-folder-id=""
        title="Drop gear here to move out of folders"
      >
        <span class="sf-gear-tree-root-label">Root</span>
      </div>`
      }
      ${folderHtml}
      ${rootGear.map((item) => renderGearLeaf(item, 0, null)).join("")}
      ${noResults ? `<p class="sf-gear-tree-empty">No gear matches "${escapeXml(searchQuery.trim())}"</p>` : ""}
    </div>`;

  const canDeleteFolder = Boolean(activeFolderId && !isBuiltinFolderId(activeFolderId));

  container.innerHTML = `
    <div class="sf-gear-browser">
      <div class="sf-gear-browser-toolbar" role="toolbar" aria-label="Library actions">
        <button
          type="button"
          class="sf-gear-glyph-btn"
          id="sf-new-folder"
          title="New folder in selected location"
          aria-label="New folder"
        >
          <span class="sf-gear-glyph sf-gear-glyph-folder" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="sf-gear-glyph-btn"
          id="sf-create-gear"
          title="Create new gear in selected location"
          aria-label="Create new gear"
        >
          <span class="sf-gear-glyph sf-gear-glyph-gear" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="sf-gear-glyph-btn"
          id="sf-import-gear"
          title="Import gear from a library JSON file into the selected folder"
          aria-label="Import gear library"
        >
          <span class="sf-gear-glyph sf-gear-glyph-import" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="sf-gear-glyph-btn"
          id="sf-export-gear"
          title="${activeFolderId ? "Export selected folder as a library JSON file" : "Export all custom gear as a library JSON file"}"
          aria-label="Export gear library"
        >
          <span class="sf-gear-glyph sf-gear-glyph-export" aria-hidden="true"></span>
        </button>
        <button
          type="button"
          class="sf-gear-glyph-btn sf-gear-glyph-btn-danger"
          id="sf-delete-folder"
          title="${canDeleteFolder ? "Delete selected folder" : "Select a custom folder to delete"}"
          aria-label="Delete folder"
          ${canDeleteFolder ? "" : "disabled"}
        >
          <span class="sf-gear-glyph sf-gear-glyph-delete" aria-hidden="true"></span>
        </button>
        <input type="file" id="sf-import-gear-file" accept=".json,application/json" hidden />
      </div>
      <input
        type="search"
        class="sf-gear-search"
        id="sf-gear-search"
        placeholder="Search gear…"
        value="${escapeXml(searchQuery)}"
        aria-label="Search gear across all folders"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="sf-gear-browser-list">
        ${treeHtml}
      </div>
    </div>`;

  const searchInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector("#sf-gear-search")
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

  container.querySelectorAll(".sf-gear-tree-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = /** @type {HTMLButtonElement} */ (btn).dataset.folderId;
      if (id) onToggleFolder(id);
    });
  });

  container.querySelectorAll(".sf-gear-tree-folder-btn").forEach((btn) => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.addEventListener("click", () => {
      onSelectFolder(button.dataset.folderId ?? null);
    });
    button.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = button.dataset.folderId;
      if (!id || isBuiltinFolderId(id)) return;
      onBeginRenameFolder?.(id);
    });
  });

  const renameInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector(".sf-gear-tree-folder-rename")
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
      // Defer so Esc cancel can clear rename state first.
      queueMicrotask(() => {
        if (!container.contains(renameInput)) return;
        commit();
      });
    });
  }

  container.querySelector("#sf-create-gear")?.addEventListener("click", onCreateGear);

  container.querySelectorAll(".sf-gear-leaf-edit").forEach((btn) => {
    const button = /** @type {HTMLButtonElement} */ (btn);
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const gearId = button.dataset.gearId;
      if (gearId) onEditGear?.(gearId);
    });
    // Keep the leaf's HTML5 drag from starting on the button.
    button.addEventListener("pointerdown", (e) => e.stopPropagation());
    button.addEventListener("dragstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  container.querySelector("#sf-export-gear")?.addEventListener("click", () => {
    onExportFolder?.();
  });

  const importInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector("#sf-import-gear-file")
  );
  container.querySelector("#sf-import-gear")?.addEventListener("click", () => {
    importInput?.click();
  });
  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) onImportCatalog?.(file);
    importInput.value = "";
  });

  container.querySelector("#sf-delete-folder")?.addEventListener("click", () => {
    if (!activeFolderId || isBuiltinFolderId(activeFolderId)) return;
    onDeleteFolder(activeFolderId);
  });

  container.querySelector("#sf-new-folder")?.addEventListener("click", () => {
    const name = nextUniqueFolderName(activeFolderId, allFolders);
    const folder = createGearFolder(name, activeFolderId, allFolders);
    if (!folder) return;
    onCreateFolder(folder);
  });

  /** @param {DragEvent} e */
  function libraryMoveGearId(e) {
    return e.dataTransfer?.getData("text/av-gear-library-move") || "";
  }

  /** @param {string | null} folderId */
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
  function bindGearDropTarget(el, getFolderId) {
    el.addEventListener("dragenter", (e) => {
      if (![...((e.dataTransfer?.types) ?? [])].includes("text/av-gear-library-move")) return;
      e.preventDefault();
      setDropHighlight(el, true);
    });
    el.addEventListener("dragover", (e) => {
      if (![...((e.dataTransfer?.types) ?? [])].includes("text/av-gear-library-move")) return;
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
      const gearId = libraryMoveGearId(e);
      if (!gearId) return;
      const fromRaw = e.dataTransfer?.getData("text/av-gear-from-folder") ?? "";
      const fromFolderId = normalizeFolderId(fromRaw);
      const toFolderId = getFolderId();
      if (fromFolderId === toFolderId) return;
      onMoveGear(gearId, toFolderId);
    });
  }

  container.querySelectorAll(".sf-gear-tree-row").forEach((row) => {
    const folderId =
      /** @type {HTMLElement} */ (row).querySelector("[data-folder-id]")?.getAttribute("data-folder-id") ??
      null;
    if (!folderId) return;
    bindGearDropTarget(/** @type {HTMLElement} */ (row), () => folderId);
  });

  const rootDrop = /** @type {HTMLElement | null} */ (container.querySelector(".sf-gear-tree-root-drop"));
  if (rootDrop) {
    bindGearDropTarget(rootDrop, () => null);
  }
}
