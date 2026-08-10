import { uid } from "../shared/id.js";
import { listAddableElements } from "./element-catalog.js";

/**
 * @typedef {{ id: string, name: string, parentId: string | null }} LibraryFolder
 * @typedef {{ itemId: string, folderId: string }} LibraryPlacement
 */

/** @param {string} calculator */
export function autoCalculatorFolderId(calculator) {
  return `fld-auto:${calculator}`;
}

/**
 * @param {string} calculator
 * @param {string} family
 */
export function autoFamilyFolderId(calculator, family) {
  return `fld-auto:${calculator}/${family}`;
}

/** @param {string} folderId */
export function isBuiltinLibraryFolderId(folderId) {
  return folderId.startsWith("fld-auto:");
}

/**
 * Build auto folders + default placements from live catalog items.
 * @param {import("./element-catalog.js").AddableElement[]} items
 * @returns {{ folders: LibraryFolder[], placements: LibraryPlacement[] }}
 */
export function buildAutoLibraryStructure(items) {
  /** @type {LibraryFolder[]} */
  const folders = [];
  /** @type {LibraryPlacement[]} */
  const placements = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string} id
   * @param {string} name
   * @param {string | null} parentId
   */
  const ensure = (id, name, parentId) => {
    if (seen.has(id)) return;
    seen.add(id);
    folders.push({ id, name, parentId });
  };

  for (const item of items) {
    const calculator = item.calculator || item.group || "Other";
    const family = item.family || "General";
    const calcId = autoCalculatorFolderId(calculator);
    const famId = autoFamilyFolderId(calculator, family);
    ensure(calcId, calculator, null);
    ensure(famId, family, calcId);
    placements.push({ itemId: item.id, folderId: famId });
  }

  return { folders, placements };
}

/**
 * @param {Record<string, unknown>} siteExports
 * @param {{ widthIn: number, heightIn: number }} page
 */
export function resolveLibraryCatalog(siteExports, page) {
  const items = listAddableElements(siteExports, page);
  const auto = buildAutoLibraryStructure(items);
  return { items, autoFolders: auto.folders, autoPlacements: auto.placements };
}

/**
 * @param {LibraryFolder[]} autoFolders
 * @param {LibraryFolder[]} userFolders
 */
export function mergeLibraryFolders(autoFolders, userFolders) {
  return [...autoFolders, ...userFolders];
}

/**
 * @param {LibraryFolder[]} folders
 * @param {string | null} parentId
 */
export function listChildLibraryFolders(folders, parentId) {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * @param {string} itemId
 * @param {LibraryPlacement[]} autoPlacements
 * @param {Record<string, string | null>} userPlacements
 * @returns {string | null}
 */
export function effectiveItemFolderId(itemId, autoPlacements, userPlacements) {
  if (Object.prototype.hasOwnProperty.call(userPlacements, itemId)) {
    return userPlacements[itemId];
  }
  return autoPlacements.find((p) => p.itemId === itemId)?.folderId ?? null;
}

/**
 * @param {import("./element-catalog.js").AddableElement[]} items
 * @param {LibraryPlacement[]} autoPlacements
 * @param {Record<string, string | null>} userPlacements
 * @param {string | null} folderId
 */
export function listItemsInLibraryFolder(items, autoPlacements, userPlacements, folderId) {
  return items
    .filter((item) => effectiveItemFolderId(item.id, autoPlacements, userPlacements) === folderId)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * @param {string} name
 * @param {string | null} parentId
 * @param {LibraryFolder[]} folders
 * @param {string} [excludeFolderId]
 */
function folderNameTaken(name, parentId, folders, excludeFolderId) {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return true;
  return listChildLibraryFolders(folders, parentId).some(
    (f) => f.id !== excludeFolderId && f.name.toLowerCase() === trimmed
  );
}

/**
 * @param {string | null} parentId
 * @param {LibraryFolder[]} folders
 * @param {string} [base]
 */
export function nextUniqueLibraryFolderName(parentId, folders, base = "New folder") {
  if (!folderNameTaken(base, parentId, folders)) return base;
  let n = 2;
  while (folderNameTaken(`${base} ${n}`, parentId, folders)) n += 1;
  return `${base} ${n}`;
}

/**
 * @param {string} name
 * @param {string | null} parentId
 * @param {LibraryFolder[]} folders
 * @returns {LibraryFolder | null}
 */
export function createLibraryFolder(name, parentId, folders) {
  const trimmed = name.trim();
  if (!trimmed || folderNameTaken(trimmed, parentId, folders)) return null;
  return {
    id: uid("pw-folder"),
    name: trimmed,
    parentId,
  };
}

/**
 * @param {LibraryFolder[]} userFolders
 * @param {string} folderId
 * @param {string} name
 * @param {LibraryFolder[]} allFolders
 */
export function renameLibraryFolder(userFolders, folderId, name, allFolders) {
  if (isBuiltinLibraryFolderId(folderId)) return false;
  const folder = userFolders.find((f) => f.id === folderId);
  if (!folder) return false;
  const trimmed = name.trim();
  if (!trimmed || folderNameTaken(trimmed, folder.parentId, allFolders, folderId)) return false;
  folder.name = trimmed;
  return true;
}

/**
 * @param {LibraryFolder[]} folders
 * @param {string} folderId
 */
export function collectLibraryFolderSubtreeIds(folders, folderId) {
  /** @type {Set<string>} */
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * @param {LibraryFolder[]} userFolders
 * @param {string} folderId
 * @returns {{ deletedIds: Set<string>, parentId: string | null, name: string } | null}
 */
export function deleteLibraryFolder(userFolders, folderId) {
  if (isBuiltinLibraryFolderId(folderId)) return null;
  const folder = userFolders.find((f) => f.id === folderId);
  if (!folder) return null;
  const deletedIds = collectLibraryFolderSubtreeIds(userFolders, folderId);
  for (let i = userFolders.length - 1; i >= 0; i -= 1) {
    if (deletedIds.has(userFolders[i].id)) userFolders.splice(i, 1);
  }
  return { deletedIds, parentId: folder.parentId, name: folder.name };
}

/**
 * @param {string} itemId
 * @param {string | null} folderId
 * @param {LibraryPlacement[]} autoPlacements
 * @param {Record<string, string | null>} userPlacements
 */
export function moveLibraryItemToFolder(itemId, folderId, autoPlacements, userPlacements) {
  const auto = autoPlacements.find((p) => p.itemId === itemId)?.folderId ?? null;
  if (folderId === auto) {
    delete userPlacements[itemId];
  } else {
    userPlacements[itemId] = folderId;
  }
}

/**
 * Drop placement overrides that point at deleted folders.
 * @param {Record<string, string | null>} userPlacements
 * @param {Set<string>} deletedFolderIds
 */
export function clearPlacementsForFolders(userPlacements, deletedFolderIds) {
  for (const [itemId, folderId] of Object.entries(userPlacements)) {
    if (folderId != null && deletedFolderIds.has(folderId)) {
      delete userPlacements[itemId];
    }
  }
}

/**
 * @param {unknown} raw
 * @returns {LibraryFolder[]}
 */
export function normalizeLibraryFolders(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {LibraryFolder[]} */
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (entry);
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!id || !name || isBuiltinLibraryFolderId(id)) continue;
    out.push({
      id,
      name,
      parentId: typeof r.parentId === "string" && r.parentId ? r.parentId : null,
    });
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string | null>}
 */
export function normalizeLibraryPlacements(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  /** @type {Record<string, string | null>} */
  const out = {};
  for (const [itemId, folderId] of Object.entries(
    /** @type {Record<string, unknown>} */ (raw)
  )) {
    if (typeof itemId !== "string" || !itemId) continue;
    if (folderId === null) out[itemId] = null;
    else if (typeof folderId === "string") out[itemId] = folderId;
  }
  return out;
}
