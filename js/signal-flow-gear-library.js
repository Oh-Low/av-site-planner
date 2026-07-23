import { uid } from "./shared/id.js";
import { GEAR_TYPES, getBuiltinGearType } from "./signal-flow-data.js?v=42";
import { BRAND_FOLDERS, BRAND_GEAR_PLACEMENTS } from "./signal-flow-gear-presets.js?v=43";

/** @typedef {{ id: string, name: string, parentId: string | null }} GearFolder */

/** @typedef {{ gearId: string, folderId: string }} GearPlacement */

/** @type {GearFolder[]} */
export const BUILTIN_FOLDERS = [...BRAND_FOLDERS];

/** @type {GearPlacement[]} */
export const BUILTIN_GEAR_PLACEMENTS = [...BRAND_GEAR_PLACEMENTS];

/**
 * @param {GearFolder[]} folders
 * @param {string | null} parentId
 * @returns {GearFolder[]}
 */
export function listChildFolders(folders, parentId) {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * @param {GearFolder[]} folders
 * @param {string | null} folderId
 * @returns {{ id: string | null, name: string }[]}
 */
export function getFolderBreadcrumb(folders, folderId) {
  /** @type {{ id: string | null, name: string }[]} */
  const crumbs = [{ id: null, name: "Root" }];
  if (!folderId) return crumbs;

  /** @type {GearFolder[]} */
  const chain = [];
  let current = folders.find((f) => f.id === folderId);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? folders.find((f) => f.id === current.parentId) : undefined;
  }
  return crumbs.concat(chain.map((f) => ({ id: f.id, name: f.name })));
}

/**
 * List gear placed in a folder. Built-in gear resolves through the user
 * layer first, so an edited (overridden) catalog item shows its edited
 * version in its original catalog folder.
 * @param {GearFolder[]} folders
 * @param {GearPlacement[]} placements
 * @param {import("./signal-flow-data.js").GearType[]} customPremade
 * @param {string | null} folderId
 */
export function listGearInFolder(folders, placements, customPremade, folderId) {
  const builtinIds = placements
    .filter((p) => p.folderId === folderId)
    .map((p) => p.gearId);

  /** @type {import("./signal-flow-data.js").GearType[]} */
  const gear = [];
  const seen = new Set();

  for (const gearId of builtinIds) {
    if (seen.has(gearId)) continue;
    seen.add(gearId);
    const override = customPremade.find((g) => g.id === gearId);
    gear.push(override ?? getBuiltinGearType(gearId));
  }

  for (const item of customPremade) {
    const itemFolder = item.folderId ?? null;
    if (itemFolder !== folderId || seen.has(item.id)) continue;
    seen.add(item.id);
    gear.push(item);
  }

  return gear.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * @param {GearFolder[]} builtinFolders
 * @param {GearFolder[]} userFolders
 * @returns {GearFolder[]}
 */
export function mergeGearFolders(builtinFolders, userFolders) {
  return [...builtinFolders, ...userFolders];
}

/**
 * @param {string} name
 * @param {string | null} parentId
 * @param {GearFolder[]} folders
 * @param {string} [excludeFolderId]
 */
function folderNameTaken(name, parentId, folders, excludeFolderId) {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return true;
  return listChildFolders(folders, parentId).some(
    (f) => f.id !== excludeFolderId && f.name.toLowerCase() === trimmed
  );
}

/**
 * @param {string | null} parentId
 * @param {GearFolder[]} folders
 * @param {string} [base]
 */
export function nextUniqueFolderName(parentId, folders, base = "New folder") {
  if (!folderNameTaken(base, parentId, folders)) return base;
  let n = 2;
  while (folderNameTaken(`${base} ${n}`, parentId, folders)) n += 1;
  return `${base} ${n}`;
}

/**
 * @param {string} name
 * @param {string | null} parentId
 * @param {GearFolder[]} folders
 * @returns {GearFolder | null}
 */
export function createGearFolder(name, parentId, folders) {
  const trimmed = name.trim();
  if (!trimmed || folderNameTaken(trimmed, parentId, folders)) return null;

  return {
    id: uid("folder"),
    name: trimmed,
    parentId,
  };
}

/**
 * @param {GearFolder[]} userFolders
 * @param {string} folderId
 * @param {string} name
 * @param {GearFolder[]} allFolders
 * @returns {boolean}
 */
export function renameGearFolder(userFolders, folderId, name, allFolders) {
  const folder = userFolders.find((f) => f.id === folderId);
  if (!folder) return false;
  const trimmed = name.trim();
  if (!trimmed || folderNameTaken(trimmed, folder.parentId, allFolders, folderId)) return false;
  folder.name = trimmed;
  return true;
}

/** @param {string} folderId */
export function isBuiltinFolderId(folderId) {
  return BUILTIN_FOLDERS.some((f) => f.id === folderId);
}

/**
 * Collect a folder and all descendant folder ids from the given folder list.
 * @param {GearFolder[]} folders
 * @param {string} folderId
 * @returns {Set<string>}
 */
export function collectFolderSubtreeIds(folders, folderId) {
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
 * Delete a user folder and its descendant user folders.
 * @param {GearFolder[]} userFolders
 * @param {string} folderId
 * @returns {{ deletedIds: Set<string>, parentId: string | null, name: string } | null}
 */
export function deleteGearFolder(userFolders, folderId) {
  if (isBuiltinFolderId(folderId)) return null;
  const folder = userFolders.find((f) => f.id === folderId);
  if (!folder) return null;

  const deletedIds = collectFolderSubtreeIds(userFolders, folderId);
  for (let i = userFolders.length - 1; i >= 0; i -= 1) {
    if (deletedIds.has(userFolders[i].id)) userFolders.splice(i, 1);
  }

  return {
    deletedIds,
    parentId: folder.parentId,
    name: folder.name,
  };
}

/** @param {GearFolder[]} folders @param {string} folderId */
export function folderExists(folders, folderId) {
  return folders.some((f) => f.id === folderId);
}

/** @param {string} gearId */
export function isBuiltinGearId(gearId) {
  return GEAR_TYPES.some((g) => g.id === gearId);
}

/**
 * Catalog folder a built-in gear id is placed in, or null.
 * @param {string} gearId
 * @returns {string | null}
 */
export function builtinGearFolderId(gearId) {
  return BUILTIN_GEAR_PLACEMENTS.find((p) => p.gearId === gearId)?.folderId ?? null;
}
