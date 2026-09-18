import {
  createLibraryFolder,
  deleteLibraryFolder,
  isBuiltinLibraryFolderId,
  listChildLibraryFolders,
  mergeLibraryFolders,
  nextUniqueLibraryFolderName,
  renameLibraryFolder,
  normalizeLibraryFolders,
} from "./element-library.js";
import { sheetListTitle } from "./sheet-tree.js";

/**
 * @typedef {import("./element-library.js").LibraryFolder} SheetFolder
 */

/** @param {string} folderId */
export function isBuiltinSheetFolderId(folderId) {
  // Legacy auto folders (no longer created); treat as non-user so they can't be renamed.
  return folderId.startsWith("fld-sheet:");
}

/**
 * Sheets default to root — no automatic calculator/room folders.
 * @param {import("./state.js").SheetInstance} _sheet
 * @returns {{ folders: SheetFolder[], folderId: string | null }}
 */
export function autoFolderForSheet(_sheet) {
  return { folders: [], folderId: null };
}

/**
 * No auto folders; every sheet defaults to root until the user moves it.
 * @param {import("./state.js").SheetInstance[]} sheets
 * @returns {{ folders: SheetFolder[], placements: Record<string, string | null> }}
 */
export function buildAutoSheetLibrary(sheets) {
  /** @type {Record<string, string | null>} */
  const placements = {};
  for (const sheet of sheets) {
    placements[sheet.id] = null;
  }
  return { folders: [], placements };
}

/**
 * Effective folder for a sheet: explicit folderId only (null = root).
 * @param {import("./state.js").SheetInstance} sheet
 * @param {Record<string, string | null>} [_autoPlacements]
 */
export function effectiveSheetFolderId(sheet, _autoPlacements) {
  if ("folderId" in sheet && sheet.folderId !== undefined) {
    return sheet.folderId;
  }
  return null;
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
 * @param {Record<string, string | null>} [_autoPlacements]
 */
export function moveSheetToFolder(sheet, folderId, _autoPlacements) {
  if (folderId == null) {
    sheet.folderId = null;
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
