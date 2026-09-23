import { uid } from "../shared/id.js";
import { createElement, normalizeSheet } from "./state.js";
import { getSheetType, listSheetTypes } from "./sheet-registry.js";
import { resolvePaper } from "./paper-sizes.js";

/**
 * @typedef {{
 *   roomId: string,
 *   roomName: string,
 *   siteExports: Record<string, unknown>,
 * }} RoomExportBundle
 */

/** Sheet types generated once per show (not per room). */
const SHOW_SCOPED_SHEET_TYPES = ["cover", "gear-list"];

/**
 * @param {string} typeId
 */
function isShowScopedSheetType(typeId) {
  return SHOW_SCOPED_SHEET_TYPES.includes(typeId);
}

/**
 * Pull live calculator exports and rebuild sheet instances while preserving
 * overrides, notes, include flags, order, and custom element layouts for
 * seeds that still exist.
 *
 * Pass either a single siteExports object (legacy / one room) or an array of
 * per-room bundles so Generate can cover every room in a show.
 *
 * @param {import("./state.js").PaperworkState} state
 * @param {Record<string, unknown> | RoomExportBundle[]} siteExportsOrRooms
 * @param {{
 *   mode?: "merge" | "add-missing" | "replace",
 *   selectedKeys?: Iterable<string> | null,
 * }} [options]
 *   When `selectedKeys` is set, only those sync keys are created or rebuilt;
 *   other existing generated sheets are kept as-is and unlisted seeds are skipped.
 */
export function syncSheetsFromSources(state, siteExportsOrRooms, options = {}) {
  const mode = options.mode ?? "merge";
  const selectedKeys = options.selectedKeys
    ? new Set(
        [...options.selectedKeys].filter((key) => typeof key === "string" && key)
      )
    : null;
  const page = resolvePaper(state.paper.size, state.paper.orientation);
  const rooms = normalizeRoomBundles(siteExportsOrRooms);

  const manualSheets = state.sheets
    .filter((sheet) => sheet.manual === true || sheet.typeId === "custom-plate")
    .sort((a, b) => a.order - b.order);
  /** @type {Map<string, import("./state.js").SheetInstance>} */
  const existing = new Map(
    state.sheets
      .filter((sheet) => sheet.manual !== true && sheet.typeId !== "custom-plate")
      .map((s) => [sheetSyncKey(s), s])
  );

  /**
   * @param {string} key
   * @param {boolean} exists
   */
  function shouldTouch(key, exists) {
    if (selectedKeys) return selectedKeys.has(key);
    if (exists) return mode === "replace";
    return mode === "merge" || mode === "add-missing" || mode === "replace";
  }

  /** @type {import("./state.js").SheetInstance[]} */
  const next = [];
  let order = 0;

  // Show-scoped sheets once (cover, gear list, …) — not per room.
  for (const typeId of SHOW_SCOPED_SHEET_TYPES) {
    const sheetType = getSheetType(typeId);
    if (!sheetType) continue;
    for (const seed of sheetType.expand(rooms[0]?.siteExports ?? {})) {
      const key = showSheetKey(seed.typeId, seed.sourceKey);
      const prev = existing.get(key);
      if (prev) {
        if (shouldTouch(key, true)) {
          const elements = sheetType.defaultElements(
            seed,
            rooms[0]?.siteExports ?? {},
            page,
            state.identity
          );
          stampIdentityIntoElements(elements, state.identity);
          next.push({
            ...prev,
            roomId: null,
            title: prev.title || seed.title,
            order: order++,
            elements,
          });
        } else {
          next.push({
            ...prev,
            roomId: null,
            title: prev.title || seed.title,
            order: order++,
          });
        }
        existing.delete(key);
      } else if (shouldTouch(key, false)) {
        const elements = sheetType.defaultElements(
          seed,
          rooms[0]?.siteExports ?? {},
          page,
          state.identity
        );
        stampIdentityIntoElements(elements, state.identity);
        next.push(
          normalizeSheet(
            {
              id: uid("sheet"),
              typeId: seed.typeId,
              sourceKey: seed.sourceKey,
              roomId: null,
              title: seed.title,
              included: true,
              order: order++,
              notes: "",
              elements,
            },
            order
          )
        );
      }
    }
  }

  for (const room of rooms) {
    for (const type of listSheetTypes()) {
      if (isShowScopedSheetType(type.id)) continue;
      const seeds = type.expand(room.siteExports);
      for (const seed of seeds) {
        const key = roomSheetKey(room.roomId, seed.typeId, seed.sourceKey);
        const titled = `${room.roomName} — ${seed.title}`;
        const displaySeed = { ...seed, title: titled, typeId: seed.typeId };
        const prev = existing.get(key);
        if (prev) {
          migrateSourceElements(prev);
          if (shouldTouch(key, true)) {
            const elements = type.defaultElements(
              displaySeed,
              room.siteExports,
              page,
              state.identity
            );
            stampIdentityIntoElements(elements, state.identity);
            next.push({
              ...prev,
              roomId: room.roomId,
              title: prev.title || titled,
              order: order++,
              elements,
            });
          } else {
            next.push({
              ...prev,
              roomId: room.roomId,
              title: prev.title || titled,
              order: order++,
            });
          }
          existing.delete(key);
        } else if (shouldTouch(key, false)) {
          const elements = type.defaultElements(
            displaySeed,
            room.siteExports,
            page,
            state.identity
          );
          stampIdentityIntoElements(elements, state.identity);
          next.push(
            normalizeSheet(
              {
                id: uid("sheet"),
                typeId: seed.typeId,
                sourceKey: seed.sourceKey,
                roomId: room.roomId,
                title: titled,
                included: true,
                order: order++,
                notes: "",
                elements,
              },
              order
            )
          );
        }
      }
    }
  }

  // Keep orphan sheets (source removed) but mark title; leave included false.
  // Drop retired sheet types (scope now lives on the cover).
  for (const orphan of existing.values()) {
    if (orphan.typeId === "scope-of-work") continue;
    next.push({
      ...orphan,
      title: orphan.title.endsWith("(missing)")
        ? orphan.title
        : `${orphan.title} (missing)`,
      included: false,
      order: order++,
    });
  }

  for (const manual of manualSheets) {
    next.push({
      ...manual,
      manual: true,
      order: order++,
    });
  }

  // Keep the user's sheet list order (drag-reorder in the Sheets panel).
  // Brand-new sheets append after existing ones, in generation order.
  const prevOrderById = new Map(
    (state.sheets ?? []).map((sheet, index) => [
      sheet.id,
      typeof sheet.order === "number" && Number.isFinite(sheet.order)
        ? sheet.order
        : index,
    ])
  );
  const ranked = next.map((sheet, index) => ({ sheet, index }));
  ranked.sort((a, b) => {
    const aHad = prevOrderById.has(a.sheet.id);
    const bHad = prevOrderById.has(b.sheet.id);
    if (aHad && bHad) {
      return (
        /** @type {number} */ (prevOrderById.get(a.sheet.id)) -
        /** @type {number} */ (prevOrderById.get(b.sheet.id))
      );
    }
    if (aHad !== bHad) return aHad ? -1 : 1;
    return a.index - b.index;
  });
  state.sheets = ranked.map(({ sheet }, index) => {
    sheet.order = index;
    return sheet;
  });
  if (!state.sheets.some((s) => s.id === state.activeSheetId)) {
    state.activeSheetId = state.sheets[0]?.id ?? null;
  }
  state.selectedElementId = null;
  state.selectedDecorationId = null;
}

/**
 * Prospective generated sheets for the Generate dialog (cover + per-room seeds).
 * @param {import("./state.js").PaperworkState} state
 * @param {Record<string, unknown> | RoomExportBundle[]} siteExportsOrRooms
 * @returns {{
 *   key: string,
 *   title: string,
 *   typeId: string,
 *   roomId: string | null,
 *   roomName: string | null,
 *   exists: boolean,
 * }[]}
 */
export function listSheetGenerateCandidates(state, siteExportsOrRooms) {
  const rooms = normalizeRoomBundles(siteExportsOrRooms);
  /** @type {Set<string>} */
  const existingKeys = new Set(
    (state.sheets ?? [])
      .filter((sheet) => sheet.manual !== true && sheet.typeId !== "custom-plate")
      .map((sheet) => sheetSyncKey(sheet))
  );

  /** @type {{
   *   key: string,
   *   title: string,
   *   typeId: string,
   *   roomId: string | null,
   *   roomName: string | null,
   *   exists: boolean,
   * }[]} */
  const candidates = [];

  for (const typeId of SHOW_SCOPED_SHEET_TYPES) {
    const sheetType = getSheetType(typeId);
    if (!sheetType) continue;
    for (const seed of sheetType.expand(rooms[0]?.siteExports ?? {})) {
      const key = showSheetKey(seed.typeId, seed.sourceKey);
      candidates.push({
        key,
        title: seed.title,
        typeId: seed.typeId,
        roomId: null,
        roomName: null,
        exists: existingKeys.has(key),
      });
    }
  }

  for (const room of rooms) {
    for (const type of listSheetTypes()) {
      if (isShowScopedSheetType(type.id)) continue;
      for (const seed of type.expand(room.siteExports)) {
        const key = roomSheetKey(room.roomId, seed.typeId, seed.sourceKey);
        candidates.push({
          key,
          title: `${room.roomName} — ${seed.title}`,
          typeId: seed.typeId,
          roomId: room.roomId,
          roomName: room.roomName,
          exists: existingKeys.has(key),
        });
      }
    }
  }

  return candidates;
}

/**
 * @param {Record<string, unknown> | RoomExportBundle[]} input
 * @returns {RoomExportBundle[]}
 */
function normalizeRoomBundles(input) {
  if (Array.isArray(input)) {
    return input.filter(
      (room) =>
        room &&
        typeof room === "object" &&
        typeof room.roomId === "string" &&
        room.siteExports &&
        typeof room.siteExports === "object"
    );
  }
  if (input && typeof input === "object") {
    return [
      {
        roomId: "room",
        roomName: "Room",
        siteExports: input,
      },
    ];
  }
  return [];
}

/**
 * @param {string} roomId
 * @param {string} typeId
 * @param {string | null | undefined} sourceKey
 */
function roomSheetKey(roomId, typeId, sourceKey) {
  return `${roomId}::${typeId}::${sourceKey ?? ""}`;
}

/**
 * @param {string} typeId
 * @param {string | null | undefined} sourceKey
 */
function showSheetKey(typeId, sourceKey) {
  return `show::${typeId}::${sourceKey ?? ""}`;
}

/** @param {import("./state.js").SheetInstance} sheet */
function sheetSyncKey(sheet) {
  if (isShowScopedSheetType(sheet.typeId)) {
    return showSheetKey(sheet.typeId, sheet.sourceKey);
  }
  const roomId = typeof sheet.roomId === "string" && sheet.roomId ? sheet.roomId : "room";
  return roomSheetKey(roomId, sheet.typeId, sheet.sourceKey);
}

/** @param {import("./state.js").SheetInstance} sheet */
function migrateSourceElements(sheet) {
  if (sheet.typeId !== "led-wall-cable" && sheet.typeId !== "led-wall-power") return;
  for (const element of sheet.elements) {
    if (
      element.type === "detailTable" &&
      String(element.content?.title ?? "").toLowerCase().includes("led")
    ) {
      element.type = "ledSpecificationTable";
      element.content = { sourceKey: sheet.sourceKey };
    }
    if (
      (element.type === "ledSpecificationTable" ||
        element.type === "ledWiringDiagram") &&
      typeof element.content?.sourceKey !== "string"
    ) {
      element.content = { ...element.content, sourceKey: sheet.sourceKey };
    }
  }
}

/**
 * @param {import("./state.js").PageElement[]} elements
 * @param {import("./state.js").ProjectIdentity} identity
 */
function stampIdentityIntoElements(elements, identity) {
  for (const el of elements) {
    if (el.type !== "detailTable") continue;
    const fields = Array.isArray(el.content?.fields) ? el.content.fields : [];
    for (const field of fields) {
      if (field && typeof field === "object" && field.id in identity) {
        field.auto = String(identity[field.id] ?? "");
      }
    }
  }
}

/**
 * Rebuild elements for one sheet from its type defaults (keeps sheet meta).
 * @param {import("./state.js").SheetInstance} sheet
 * @param {import("./state.js").PaperworkState} state
 * @param {Record<string, unknown>} siteExports
 */
export function resetSheetLayout(sheet, state, siteExports) {
  const type = getSheetType(sheet.typeId);
  if (!type) return;
  const page = resolvePaper(state.paper.size, state.paper.orientation);
  const seed = { typeId: sheet.typeId, sourceKey: sheet.sourceKey, title: sheet.title };
  const elements = type.defaultElements(seed, siteExports, page, state.identity);
  stampIdentityIntoElements(elements, state.identity);
  sheet.elements = elements;
}

/**
 * Refresh bound auto values in detail tables without moving elements.
 * @param {import("./state.js").SheetInstance} sheet
 * @param {Record<string, unknown>} siteExports
 * @param {import("./state.js").ProjectIdentity} identity
 */
export function refreshSheetBindings(sheet, siteExports, identity) {
  const type = getSheetType(sheet.typeId);
  if (!type) return;
  if (sheet.typeId === "cover") {
    stampIdentityIntoElements(sheet.elements, identity);
  }
}

export { createElement };
