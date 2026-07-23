import {
  createLibraryFolder,
  deleteLibraryFolder,
  isBuiltinLibraryFolderId,
  listChildLibraryFolders,
  mergeLibraryFolders,
  nextUniqueLibraryFolderName,
  renameLibraryFolder,
  normalizeLibraryFolders,
} from "./element-library.js?v=1";
import {
  isCableRunsSheet,
  isLedWallSheet,
  isRasterSheet,
  isSurfaceSheet,
  sheetListTitle,
  wallFolderLabel,
} from "./sheet-tree.js";

/**
 * @typedef {import("./element-library.js").LibraryFolder} SheetFolder
 */

/** @param {string} calculator */
function autoSheetCalculatorFolderId(name) {
  return `fld-sheet:${name}`;
}

/**
 * @param {string} parentName
 * @param {string} childName
 */
function autoSheetChildFolderId(parentName, childName) {
  return `fld-sheet:${parentName}/${childName}`;
}

/** @param {string} folderId */
export function isBuiltinSheetFolderId(folderId) {
  return folderId.startsWith("fld-sheet:");
}

/**
 * Default auto folder for a sheet (LED / surfaces / rasters / cable runs).
 * @param {import("./state.js").SheetInstance} sheet
 * @returns {{ folders: SheetFolder[], folderId: string | null }}
 */
export function autoFolderForSheet(sheet) {
  /** @type {SheetFolder[]} */
  const folders = [];

  /** @param {string} id @param {string} name @param {string | null} parentId */
  const ensure = (id, name, parentId) => {
    if (!folders.some((f) => f.id === id)) {
      folders.push({ id, name, parentId });
    }
  };

  if (isRasterSheet(sheet)) {
    const id = autoSheetCalculatorFolderId("Rasters");
    ensure(id, "Rasters", null);
    return { folders, folderId: id };
  }
  if (isSurfaceSheet(sheet)) {
    const id = autoSheetCalculatorFolderId("Surfaces");
    ensure(id, "Surfaces", null);
    return { folders, folderId: id };
  }
  if (isCableRunsSheet(sheet)) {
    const id = autoSheetCalculatorFolderId("Cable Runs");
    ensure(id, "Cable Runs", null);
    return { folders, folderId: id };
  }
  if (isLedWallSheet(sheet)) {
    const ledId = autoSheetCalculatorFolderId("LED");
    const wallKey = sheet.sourceKey || sheet.id;
    const wallId = autoSheetChildFolderId("LED", wallKey);
    ensure(ledId, "LED", null);
    ensure(wallId, wallFolderLabel(sheet), ledId);
    return { folders, folderId: wallId };
  }
  return { folders, folderId: null };
}

/**
 * Build auto folders + default placements from the current sheet list.
 * @param {import("./state.js").SheetInstance[]} sheets
 * @returns {{ folders: SheetFolder[], placements: Record<string, string | null> }}
 */
export function buildAutoSheetLibrary(sheets) {
  /** @type {Map<string, SheetFolder>} */
  const folderMap = new Map();
  /** @type {Record<string, string | null>} */
  const placements = {};

  for (const sheet of sheets) {
    const { folders, folderId } = autoFolderForSheet(sheet);
    for (const folder of folders) {
      if (!folderMap.has(folder.id)) folderMap.set(folder.id, folder);
    }
    placements[sheet.id] = folderId;
  }

  return {
    folders: [...folderMap.values()],
    placements,
  };
}

/**
 * Effective folder for a sheet: explicit folderId wins; otherwise auto default.
 * @param {import("./state.js").SheetInstance} sheet
 * @param {Record<string, string | null>} autoPlacements
 */
export function effectiveSheetFolderId(sheet, autoPlacements) {
  if ("folderId" in sheet && sheet.folderId !== undefined) {
    return sheet.folderId;
  }
  return autoPlacements[sheet.id] ?? null;
}

/**
 * @param {import("./state.js").SheetInstance[]} sheets
 * @param {Record<string, string | null>} autoPlacements
 * @param {string | null} folderId
 */
export function listSheetsInFolder(sheets, autoPlacements, folderId) {
  return sheets
    .filter((sheet) => effectiveSheetFolderId(sheet, autoPlacements) === folderId)
    .sort((a, b) => a.order - b.order);
}

/**
 * @param {import("./state.js").SheetInstance} sheet
 * @param {string | null} folderId
 * @param {Record<string, string | null>} autoPlacements
 */
export function moveSheetToFolder(sheet, folderId, autoPlacements) {
  const auto = autoPlacements[sheet.id] ?? null;
  if (folderId === auto) {
    delete sheet.folderId;
  } else {
    sheet.folderId = folderId;
  }
}

export {
  createLibraryFolder as createSheetFolder,
  deleteLibraryFolder as deleteSheetFolder,
  listChildLibraryFolders as listChildSheetFolders,
  mergeLibraryFolders as mergeSheetFolders,
  nextUniqueLibraryFolderName as nextUniqueSheetFolderName,
  renameLibraryFolder as renameSheetFolder,
  normalizeLibraryFolders as normalizeSheetFolders,
};

/** @param {string} folderId */
export function isUserSheetFolderId(folderId) {
  return !isBuiltinSheetFolderId(folderId) && !isBuiltinLibraryFolderId(folderId);
}

/**
 * Display title for a sheet row in the sidebar tree.
 * @param {import("./state.js").SheetInstance} sheet
 */
export function sheetTreeRowTitle(sheet) {
  return sheetListTitle(sheet);
}
