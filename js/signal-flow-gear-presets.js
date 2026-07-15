/**
 * Built-in gear catalogs loaded from data/gear/*.json.
 * List files in data/gear/index.json and register them in CATALOG_MODULES below.
 * Company overlays can define new folders and gear; they merge on top of presets.
 */

import { normalizeGearEntry } from "./signal-flow-gear-schema.js?v=1";

import index from "../data/gear/index.json" with { type: "json" };
import presetsCatalog from "../data/gear/presets.json" with { type: "json" };
import exampleCompanyCatalog from "../data/gear/example-company.json" with { type: "json" };
import inventoryCatalog from "../data/gear/inventory.json" with { type: "json" };

/** @typedef {{ id: string, name: string, parentId: string | null }} GearFolder */
/** @typedef {{ gearId: string, folderId: string }} GearPlacement */
/** @typedef {import("./signal-flow-gear-schema.js").GearType} GearType */

/** @typedef {{ folders?: unknown[], gear?: unknown[] }} GearCatalogFile */

/**
 * Static registry of catalog modules. Add a new company JSON here, then list it in index.json.
 * @type {Record<string, GearCatalogFile>}
 */
const CATALOG_MODULES = {
  "presets.json": presetsCatalog,
  "example-company.json": exampleCompanyCatalog,
  "inventory.json": inventoryCatalog,
};

/**
 * @param {unknown} raw
 * @returns {GearFolder | null}
 */
function normalizeFolder(raw) {
  if (!raw || typeof raw !== "object") return null;
  const f = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof f.id === "string" ? f.id.trim() : "";
  const name = typeof f.name === "string" ? f.name.trim() : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    parentId: typeof f.parentId === "string" && f.parentId.trim() ? f.parentId.trim() : null,
  };
}

/**
 * @param {GearCatalogFile[]} catalogs
 * @returns {{ folders: GearFolder[], gear: GearType[] }}
 */
export function mergeGearCatalogs(catalogs) {
  /** @type {Map<string, GearFolder>} */
  const foldersById = new Map();
  /** @type {Map<string, GearType>} */
  const gearById = new Map();

  for (const catalog of catalogs) {
    if (!catalog || typeof catalog !== "object") continue;
    for (const raw of Array.isArray(catalog.folders) ? catalog.folders : []) {
      const folder = normalizeFolder(raw);
      if (folder) foldersById.set(folder.id, folder);
    }
    for (const raw of Array.isArray(catalog.gear) ? catalog.gear : []) {
      const gear = normalizeGearEntry(/** @type {Record<string, unknown>} */ (raw));
      if (gear) gearById.set(gear.id, gear);
    }
  }

  return {
    folders: [...foldersById.values()],
    gear: [...gearById.values()],
  };
}

/**
 * Basename of a catalog filename without the `.json` extension.
 * @param {string} filename
 */
export function catalogFileBasename(filename) {
  return String(filename ?? "")
    .trim()
    .replace(/^.*[/\\]/, "")
    .replace(/\.json$/i, "");
}

/**
 * Overlay / inventory catalogs get a Library folder named after the JSON file.
 * `presets.json` keeps its own folder tree.
 * @param {string} filename
 * @param {GearCatalogFile | null | undefined} catalog
 * @returns {GearCatalogFile}
 */
export function prepareCatalogFromFile(filename, catalog) {
  const folders = Array.isArray(catalog?.folders) ? [...catalog.folders] : [];
  const gear = Array.isArray(catalog?.gear) ? [...catalog.gear] : [];
  const base = catalogFileBasename(filename);
  if (!base || base.toLowerCase() === "presets") {
    return { folders, gear };
  }

  const folderId = `fld-file-${base}`;
  return {
    folders: [{ id: folderId, name: base, parentId: "fld-library" }],
    gear: gear.map((item) => {
      if (!item || typeof item !== "object") return item;
      return { .../** @type {Record<string, unknown>} */ (item), folderId };
    }),
  };
}

/** @returns {GearCatalogFile[]} */
function loadCatalogsFromIndex() {
  const names = Array.isArray(index?.catalogs) ? index.catalogs : ["presets.json"];
  /** @type {GearCatalogFile[]} */
  const loaded = [];
  for (const name of names) {
    if (typeof name !== "string" || !name.trim()) continue;
    const key = name.trim();
    const mod = CATALOG_MODULES[key];
    if (!mod) {
      console.warn(`signal-flow gear catalog "${key}" is listed in index.json but not registered in CATALOG_MODULES.`);
      continue;
    }
    loaded.push(prepareCatalogFromFile(key, mod));
  }
  return loaded;
}

const merged = mergeGearCatalogs(loadCatalogsFromIndex());

/** @type {GearFolder[]} */
export const BRAND_FOLDERS = merged.folders;

const folderIds = new Set(BRAND_FOLDERS.map((f) => f.id));

/** @type {GearType[]} */
const ALL_GEAR = merged.gear;

/** Gear templates without a library folder (legacy/generic). */
/** @type {GearType[]} */
export const GENERIC_GEAR_TYPES = ALL_GEAR.filter((g) => !g.folderId).map((g) => {
  const { folderId: _folderId, ...rest } = g;
  return rest;
});

/** Library gear (has a folder placement). */
/** @type {GearType[]} */
export const BRAND_GEAR_TYPES = ALL_GEAR.filter((g) => Boolean(g.folderId)).map((g) => {
  const copy = { ...g };
  if (copy.folderId && !folderIds.has(copy.folderId)) {
    console.warn(`signal-flow gear "${copy.id}" references unknown folder "${copy.folderId}".`);
  }
  return copy;
});

/** @type {GearPlacement[]} */
export const BRAND_GEAR_PLACEMENTS = BRAND_GEAR_TYPES.filter(
  (g) => g.folderId && folderIds.has(g.folderId)
).map((g) => ({
  gearId: g.id,
  folderId: /** @type {string} */ (g.folderId),
}));
