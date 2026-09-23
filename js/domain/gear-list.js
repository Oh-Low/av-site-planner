/**
 * Gear list domain — ordered document of headers + gear/cable lines,
 * synced from Signal Flow nodes and Cable Calculator rows.
 */

import { uid } from "../shared/id.js";
import {
  compareCableTypes,
  groupRowsByCableType,
  manualCablesToRows,
  normalizeCableAmount,
  normalizeCableLength,
} from "./cable.js";

/**
 * @typedef {{
 *   id: string,
 *   kind: "header",
 *   label: string,
 *   level: "section" | "subsection",
 *   source: "auto" | "manual",
 *   sourceKey: string | null,
 *   included: boolean,
 * }} GearListHeader
 *
 * @typedef {{
 *   id: string,
 *   kind: "item",
 *   category: "gear" | "cable",
 *   label: string,
 *   detail: string,
 *   qty: number,
 *   length: number | null,
 *   room: string,
 *   place: string,
 *   notes: string,
 *   source: "auto" | "manual",
 *   sourceKey: string | null,
 *   included: boolean,
 * }} GearListItem
 *
 * @typedef {GearListHeader | GearListItem} GearListRow
 *
 * @typedef {{
 *   totalOnly: boolean,
 *   roomFilter: string,
 *   placeFilter: string,
 *   searchQuery: string,
 * }} GearListSettings
 *
 * @typedef {{
 *   rows: GearListRow[],
 *   settings: GearListSettings,
 * }} GearListState
 *
 * @typedef {{
 *   header: GearListHeader,
 *   items: GearListItem[],
 * }} GearListCableSection
 *
 * @typedef {{
 *   sections: GearListCableSection[],
 *   looseItems: GearListItem[],
 * }} GearListCablePlan
 *
 * @typedef {{
 *   id: string,
 *   typeId?: string,
 *   name?: string,
 *   placeId?: string | null,
 *   gearOverride?: object | null,
 *   ledWallId?: string | null,
 * }} GearListSfNode
 *
 * @typedef {{
 *   id: string,
 *   fromNodeId: string,
 *   fromRow: number,
 *   fromCol: "input" | "output",
 *   toNodeId: string,
 *   toRow: number,
 *   toCol: "input" | "output",
 * }} GearListSfConnection
 *
 * @typedef {{
 *   id: string,
 *   cableLabel: string,
 *   fromDevice: string,
 *   toDevice: string,
 *   amount: number,
 *   length?: number | null,
 * }} GearListManualCable
 *
 * @typedef {{ id: string, name: string }} GearListPlace
 *
 * @typedef {{
 *   places?: GearListPlace[],
 *   roomName?: string,
 *   roomId?: string,
 * }} GearListLocationContext
 */

/** Sentinel filter value for items with no room / place. */
export const GEAR_LIST_FILTER_UNASSIGNED = "__unassigned__";

/**
 * Whether a row is included in paperwork (missing/undefined counts as included).
 * @param {{ included?: boolean } | null | undefined} row
 */
export function isGearListRowIncluded(row) {
  return row?.included !== false;
}

/** @returns {GearListSettings} */
export function emptyGearListSettings() {
  return { totalOnly: false, roomFilter: "", placeFilter: "", searchQuery: "" };
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeFilterValue(raw) {
  if (raw == null) return "";
  return String(raw).trim();
}

/**
 * @param {unknown} raw
 * @returns {GearListSettings}
 */
export function normalizeGearListSettings(raw) {
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    totalOnly: Boolean(r.totalOnly),
    roomFilter: normalizeFilterValue(r.roomFilter),
    placeFilter: normalizeFilterValue(r.placeFilter),
    searchQuery: typeof r.searchQuery === "string" ? r.searchQuery : "",
  };
}

/** @returns {GearListState} */
export function emptyGearListState() {
  return {
    settings: emptyGearListSettings(),
    rows: [
      {
        id: uid("glh"),
        kind: "header",
        label: "LED",
        level: "section",
        source: "manual",
        sourceKey: null,
        included: true,
      },
      {
        id: uid("glh"),
        kind: "header",
        label: "Signal Flow gear",
        level: "section",
        source: "manual",
        sourceKey: null,
        included: true,
      },
      {
        id: uid("glh"),
        kind: "header",
        label: "Cables",
        level: "section",
        source: "manual",
        sourceKey: null,
        included: true,
      },
    ],
  };
}

/**
 * @param {unknown} raw
 * @returns {GearListHeader | GearListItem | null}
 */
function normalizeRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : uid("gl");
  if (r.kind === "header") {
    const label = typeof r.label === "string" && r.label.trim() ? r.label.trim() : "Section";
    const level = r.level === "subsection" ? "subsection" : "section";
    const source = r.source === "auto" ? "auto" : "manual";
    const sourceKey =
      typeof r.sourceKey === "string" && r.sourceKey.trim() ? r.sourceKey.trim() : null;
    return {
      id,
      kind: "header",
      label,
      level,
      source,
      sourceKey: source === "auto" ? sourceKey : sourceKey,
      included: r.included !== false,
    };
  }
  if (r.kind !== "item") return null;
  const category = r.category === "cable" ? "cable" : "gear";
  const label = typeof r.label === "string" && r.label.trim() ? r.label.trim() : "Item";
  const detail = typeof r.detail === "string" ? r.detail : "";
  const notes = typeof r.notes === "string" ? r.notes : "";
  const source = r.source === "auto" ? "auto" : "manual";
  const sourceKey =
    typeof r.sourceKey === "string" && r.sourceKey.trim() ? r.sourceKey.trim() : null;
  const qty = Math.max(1, Math.min(9999, Math.floor(Number(r.qty)) || 1));
  const length =
    category === "cable" ? normalizeCableLength(r.length, null) : null;
  const room = typeof r.room === "string" ? r.room : "";
  const place = typeof r.place === "string" ? r.place : "";
  return {
    id,
    kind: "item",
    category,
    label,
    detail,
    qty,
    length,
    room,
    place,
    notes,
    source,
    sourceKey,
    included: r.included !== false,
  };
}

/**
 * @param {unknown} data
 * @returns {GearListState}
 */
export function normalizeGearListState(data) {
  if (data == null) return emptyGearListState();
  if (typeof data !== "object") {
    throw new Error("The file has invalid gear list data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map(normalizeRow).filter(Boolean)
    : [];
  const settings = normalizeGearListSettings(raw.settings);
  if (!rows.length) {
    return { ...emptyGearListState(), settings };
  }
  return { rows: /** @type {GearListRow[]} */ (rows), settings };
}

/**
 * @param {GearListState} state
 * @param {GearListRow[]} rows
 * @returns {GearListState}
 */
function withRows(state, rows) {
  return {
    rows,
    settings: normalizeGearListSettings(state?.settings),
  };
}

/**
 * Condense items that share name/type/length/detail — ignores room, place, notes.
 * @param {GearListItem[]} items
 * @returns {GearListItem[]}
 */
export function condenseGearListItems(items) {
  /** @type {Map<string, GearListItem>} */
  const byKey = new Map();
  for (const item of items) {
    if (!item || item.kind !== "item") continue;
    const key = `${item.category}\0${item.label}\0${item.length ?? ""}\0${item.detail ?? ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...item,
        room: "",
        place: "",
        notes: "",
      });
      continue;
    }
    existing.qty += item.qty;
  }
  return [...byKey.values()];
}

/**
 * @param {GearListItem} item
 * @param {string} roomFilter
 * @param {string} placeFilter
 */
function itemMatchesLocationFilters(item, roomFilter, placeFilter) {
  if (roomFilter) {
    const room = (item.room ?? "").trim();
    if (roomFilter === GEAR_LIST_FILTER_UNASSIGNED) {
      if (room) return false;
    } else if (room !== roomFilter) {
      return false;
    }
  }
  if (placeFilter) {
    const place = (item.place ?? "").trim();
    if (placeFilter === GEAR_LIST_FILTER_UNASSIGNED) {
      if (place) return false;
    } else if (place !== placeFilter) {
      return false;
    }
  }
  return true;
}

/**
 * Keep headers; drop items that fail room/place filters. Empty subsections are removed.
 * @param {GearListRow[]} rows
 * @param {string} roomFilter
 * @param {string} placeFilter
 * @returns {GearListRow[]}
 */
export function filterGearListRowsByLocation(rows, roomFilter, placeFilter) {
  const room = normalizeFilterValue(roomFilter);
  const place = normalizeFilterValue(placeFilter);
  if (!room && !place) return rows;

  /** @type {GearListRow[]} */
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "header" && row.level === "section") {
      out.push(row);
      i += 1;
      while (i < rows.length) {
        const next = rows[i];
        if (next.kind === "header" && next.level === "section") break;
        if (next.kind === "header" && next.level === "subsection") {
          const sub = next;
          i += 1;
          /** @type {GearListItem[]} */
          const items = [];
          while (i < rows.length && rows[i].kind === "item") {
            const item = /** @type {GearListItem} */ (rows[i]);
            if (itemMatchesLocationFilters(item, room, place)) items.push(item);
            i += 1;
          }
          if (items.length) {
            out.push(sub);
            out.push(...items);
          }
          continue;
        }
        if (next.kind === "item") {
          if (itemMatchesLocationFilters(next, room, place)) out.push(next);
          i += 1;
          continue;
        }
        i += 1;
      }
      continue;
    }
    if (row.kind === "item") {
      if (itemMatchesLocationFilters(row, room, place)) out.push(row);
    } else if (row.kind === "header") {
      // Orphan subsection before any section — keep only if it gains items next.
      if (row.level === "subsection") {
        const sub = row;
        i += 1;
        /** @type {GearListItem[]} */
        const items = [];
        while (i < rows.length && rows[i].kind === "item") {
          const item = /** @type {GearListItem} */ (rows[i]);
          if (itemMatchesLocationFilters(item, room, place)) items.push(item);
          i += 1;
        }
        if (items.length) {
          out.push(sub);
          out.push(...items);
        }
        continue;
      }
      out.push(row);
    }
    i += 1;
  }
  return out;
}

/**
 * Case-insensitive fuzzy match: each whitespace token must appear as a
 * substring, or as an in-order character subsequence (typo-tolerant).
 * @param {string | null | undefined} haystack
 * @param {string | null | undefined} query
 */
export function fuzzyTextMatch(haystack, query) {
  const text = String(haystack ?? "").toLowerCase();
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    if (text.includes(token)) return true;
    let from = 0;
    for (const ch of token) {
      const at = text.indexOf(ch, from);
      if (at === -1) return false;
      from = at + 1;
    }
    return true;
  });
}

/**
 * Flatten visible row fields into one searchable string (tests / debugging).
 * @param {GearListRow} row
 */
export function gearListRowSearchText(row) {
  return gearListRowSearchFields(row).join(" ");
}

/**
 * @param {GearListRow} row
 * @returns {string[]}
 */
function gearListRowSearchFields(row) {
  if (row.kind === "header") return [String(row.label ?? "")];
  /** @type {string[]} */
  const parts = [
    row.label,
    row.detail,
    row.notes,
    row.room,
    row.place,
    row.category,
    row.source === "auto" ? "auto" : "manual",
    String(row.qty ?? ""),
  ];
  if (row.length != null) parts.push(String(row.length));
  return parts.filter((p) => typeof p === "string" && p.trim());
}

/**
 * Fuzzy match against any individual row field (not the joined blob),
 * so scattered characters across columns cannot false-positive.
 * @param {GearListRow} row
 * @param {string | null | undefined} query
 */
export function gearListRowMatchesSearch(row, query) {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return true;
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const fields = gearListRowSearchFields(row);
  return tokens.every((token) => fields.some((field) => fuzzyTextMatch(field, token)));
}

/**
 * Keep headers that match or still have matching children; drop empty groups.
 * A matching header includes all of its child items.
 * @param {GearListRow[]} rows
 * @param {string | null | undefined} query
 * @returns {GearListRow[]}
 */
export function filterGearListRowsBySearch(rows, query) {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return rows;

  /**
   * @param {GearListRow} row
   */
  const matches = (row) => gearListRowMatchesSearch(row, q);

  /** @type {GearListRow[]} */
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.kind === "header" && row.level === "section") {
      const sectionMatches = matches(row);
      i += 1;
      /** @type {GearListRow[]} */
      const body = [];
      while (i < rows.length) {
        const next = rows[i];
        if (next.kind === "header" && next.level === "section") break;
        if (next.kind === "header" && next.level === "subsection") {
          const subMatches = sectionMatches || matches(next);
          i += 1;
          /** @type {GearListItem[]} */
          const items = [];
          while (i < rows.length && rows[i].kind === "item") {
            const item = /** @type {GearListItem} */ (rows[i]);
            if (subMatches || matches(item)) items.push(item);
            i += 1;
          }
          if (items.length) {
            body.push(next);
            body.push(...items);
          }
          continue;
        }
        if (next.kind === "item") {
          if (sectionMatches || matches(next)) body.push(next);
          i += 1;
          continue;
        }
        i += 1;
      }
      if (body.length) {
        out.push(row);
        out.push(...body);
      } else if (sectionMatches) {
        out.push(row);
      }
      continue;
    }
    if (row.kind === "item") {
      if (matches(row)) out.push(row);
      i += 1;
      continue;
    }
    if (row.kind === "header" && row.level === "subsection") {
      const subMatches = matches(row);
      i += 1;
      /** @type {GearListItem[]} */
      const items = [];
      while (i < rows.length && rows[i].kind === "item") {
        const item = /** @type {GearListItem} */ (rows[i]);
        if (subMatches || matches(item)) items.push(item);
        i += 1;
      }
      if (items.length) {
        out.push(row);
        out.push(...items);
      }
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Apply Total only: drop subsections and merge like items within each section.
 * @param {GearListRow[]} rows
 * @returns {GearListRow[]}
 */
function applyTotalOnlyView(rows) {
  /** @type {GearListRow[]} */
  const out = [];
  /** @type {GearListItem[]} */
  let bucket = [];

  const flush = () => {
    if (!bucket.length) return;
    out.push(...condenseGearListItems(bucket));
    bucket = [];
  };

  for (const row of rows) {
    if (row.kind === "header") {
      if (row.level === "subsection") continue;
      flush();
      out.push(row);
      continue;
    }
    bucket.push(row);
  }
  flush();
  return out;
}

/**
 * Unique room/place names available for filter dropdowns.
 * @param {GearListState | null | undefined} state
 * @param {{ rooms?: string[], places?: (string | { name?: string })[] }} [extra]
 * @returns {{
 *   rooms: string[],
 *   places: string[],
 *   hasUnassignedRoom: boolean,
 *   hasUnassignedPlace: boolean,
 * }}
 */
export function gearListFilterOptions(state, extra = {}) {
  /** @type {Set<string>} */
  const roomSet = new Set();
  /** @type {Set<string>} */
  const placeSet = new Set();
  for (const name of extra.rooms ?? []) {
    const trimmed = String(name ?? "").trim();
    if (trimmed) roomSet.add(trimmed);
  }
  for (const entry of extra.places ?? []) {
    const name = typeof entry === "string" ? entry : entry?.name;
    const trimmed = String(name ?? "").trim();
    if (trimmed) placeSet.add(trimmed);
  }
  let hasUnassignedRoom = false;
  let hasUnassignedPlace = false;
  for (const row of state?.rows ?? []) {
    if (row.kind !== "item") continue;
    const room = (row.room ?? "").trim();
    const place = (row.place ?? "").trim();
    if (room) roomSet.add(room);
    else hasUnassignedRoom = true;
    if (place) placeSet.add(place);
    else hasUnassignedPlace = true;
  }
  const collator = { sensitivity: /** @type {const} */ ("base") };
  return {
    rooms: [...roomSet].sort((a, b) => a.localeCompare(b, undefined, collator)),
    places: [...placeSet].sort((a, b) => a.localeCompare(b, undefined, collator)),
    hasUnassignedRoom,
    hasUnassignedPlace,
  };
}

/**
 * Rows for UI: room/place filters, then search, then optional Total only.
 * @param {GearListState | null | undefined} state
 * @returns {GearListRow[]}
 */
export function gearListRowsForDisplay(state) {
  const rows = Array.isArray(state?.rows) ? state.rows : [];
  const settings = normalizeGearListSettings(state?.settings);
  const byLocation = filterGearListRowsByLocation(
    rows,
    settings.roomFilter,
    settings.placeFilter
  );
  const filtered = filterGearListRowsBySearch(byLocation, settings.searchQuery);
  if (!settings.totalOnly) return filtered;
  return applyTotalOnlyView(filtered);
}

/**
 * Drop rows excluded from paperwork. Hiding a top-level section header
 * removes that whole section (header + following rows until the next section).
 * @param {GearListRow[]} rows
 * @returns {GearListRow[]}
 */
export function filterGearListRowsForPaperwork(rows) {
  /** @type {GearListRow[]} */
  const out = [];
  let i = 0;
  while (i < (rows?.length ?? 0)) {
    const row = rows[i];
    if (row.kind === "header" && row.level === "section" && !isGearListRowIncluded(row)) {
      i += 1;
      while (i < rows.length) {
        const next = rows[i];
        if (next.kind === "header" && next.level === "section") break;
        i += 1;
      }
      continue;
    }
    if (!isGearListRowIncluded(row)) {
      i += 1;
      continue;
    }
    out.push(row);
    i += 1;
  }
  return out;
}

/**
 * Rows for paperwork sheets: full gear list minus eyeball-excluded rows /
 * sections. Calculator filters (room, place, search) and Total only do not apply.
 * @param {GearListState | null | undefined} state
 * @returns {GearListRow[]}
 */
export function gearListRowsForPaperwork(state) {
  const rows = Array.isArray(state?.rows) ? state.rows : [];
  return filterGearListRowsForPaperwork(rows);
}

/**
 * Split display rows into top-level section columns (LED / Signal Flow / Cables / …).
 * Empty sections are omitted. Unknown section labels keep their heading text.
 * @param {GearListRow[]} rows
 * @returns {{ id: string, title: string, rows: GearListRow[] }[]}
 */
export function partitionGearListSections(rows) {
  /** @type {{ id: string, title: string, rows: GearListRow[] }[]} */
  const sections = [];
  /** @type {{ id: string, title: string, rows: GearListRow[] } | null} */
  let current = null;

  for (const row of rows ?? []) {
    if (row.kind === "header" && row.level === "section") {
      const title = compactGearListSectionTitle(row.label);
      current = {
        id: slugGearListSectionId(title),
        title,
        rows: [],
      };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: "other", title: "Other", rows: [] };
      sections.push(current);
    }
    current.rows.push(row);
  }

  return sections.filter((section) =>
    section.rows.some(
      (row) =>
        row.kind === "item" ||
        (row.kind === "header" && row.level === "subsection")
    )
  );
}

/**
 * @param {string | null | undefined} label
 */
function compactGearListSectionTitle(label) {
  const raw = typeof label === "string" ? label.trim() : "";
  if (!raw) return "Other";
  if (/^led$/i.test(raw)) return "LED";
  if (/signal\s*flow/i.test(raw)) return "Signal Flow";
  if (/^cables?$/i.test(raw)) return "Cables";
  return raw;
}

/**
 * @param {string} title
 */
function slugGearListSectionId(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "other";
}

/**
 * @param {GearListState} state
 * @param {Partial<GearListSettings>} patch
 * @returns {GearListState}
 */
export function updateGearListSettings(state, patch) {
  const current = normalizeGearListSettings(state.settings);
  /** @type {GearListSettings} */
  const next = { ...current };
  if (patch && typeof patch === "object") {
    if ("totalOnly" in patch) next.totalOnly = Boolean(patch.totalOnly);
    if ("roomFilter" in patch) next.roomFilter = normalizeFilterValue(patch.roomFilter);
    if ("placeFilter" in patch) next.placeFilter = normalizeFilterValue(patch.placeFilter);
    if ("searchQuery" in patch) {
      next.searchQuery = typeof patch.searchQuery === "string" ? patch.searchQuery : "";
    }
  }
  return {
    rows: state.rows ?? [],
    settings: next,
  };
}

/**
 * Resolve a place display name from an id list.
 * @param {GearListPlace[] | null | undefined} places
 * @param {string | null | undefined} placeId
 */
function placeNameFromId(places, placeId) {
  const id = typeof placeId === "string" ? placeId.trim() : "";
  if (!id) return "";
  const hit = (places ?? []).find((p) => p.id === id);
  return hit?.name?.trim() || "";
}

/**
 * Normalize optional location context for auto imports.
 * @param {GearListLocationContext | null | undefined} ctx
 * @returns {{ places: GearListPlace[], roomName: string, roomId: string }}
 */
function locationContext(ctx) {
  return {
    places: Array.isArray(ctx?.places) ? ctx.places : [],
    roomName: typeof ctx?.roomName === "string" ? ctx.roomName.trim() : "",
    roomId: typeof ctx?.roomId === "string" ? ctx.roomId.trim() : "",
  };
}

/**
 * Prefix an auto sourceKey with the room id so multi-room sync stays unique.
 * @param {string} roomId
 * @param {string} key
 */
export function scopedGearListSourceKey(roomId, key) {
  const id = typeof roomId === "string" ? roomId.trim() : "";
  const bare = typeof key === "string" ? key : "";
  if (!id || !bare) return bare;
  if (bare.startsWith(`room:${id}|`)) return bare;
  return `room:${id}|${bare}`;
}

/**
 * Room id embedded in a scoped auto sourceKey (empty when unscoped / legacy).
 * @param {string | null | undefined} sourceKey
 */
export function roomIdFromGearListSourceKey(sourceKey) {
  const key = typeof sourceKey === "string" ? sourceKey : "";
  const match = /^room:([^|]+)\|/.exec(key);
  return match?.[1] ?? "";
}

/**
 * Strip room scope prefix for matching within a room's Signal Flow graph.
 * @param {string | null | undefined} sourceKey
 */
export function unscopedGearListSourceKey(sourceKey) {
  const key = typeof sourceKey === "string" ? sourceKey : "";
  return key.replace(/^room:[^|]+\|/, "");
}

/**
 * @param {string} roomId
 * @param {GearListItem[]} items
 * @returns {GearListItem[]}
 */
export function scopeGearListItems(roomId, items) {
  return (items ?? []).map((item) => ({
    ...item,
    sourceKey: item.sourceKey
      ? scopedGearListSourceKey(roomId, item.sourceKey)
      : item.sourceKey,
  }));
}

/**
 * @param {string} roomId
 * @param {GearListCableSection[]} sections
 * @returns {GearListCableSection[]}
 */
export function scopeGearListCableSections(roomId, sections) {
  return (sections ?? []).map((section) => ({
    header: {
      ...section.header,
      sourceKey: section.header.sourceKey
        ? scopedGearListSourceKey(roomId, section.header.sourceKey)
        : section.header.sourceKey,
    },
    items: scopeGearListItems(roomId, section.items),
  }));
}

/**
 * @param {string} roomId
 * @param {GearListCablePlan} plan
 * @returns {GearListCablePlan}
 */
export function scopeGearListCablePlan(roomId, plan) {
  return {
    sections: scopeGearListCableSections(roomId, plan?.sections ?? []),
    looseItems: scopeGearListItems(roomId, plan?.looseItems ?? []),
  };
}

/**
 * Auto gear lines from Signal Flow nodes.
 * Instances that share the same type, name, and place collapse into one line
 * with a summed quantity. Renamed instances / different places stay separate.
 * LED wall nodes are skipped — they use {@link autoLedWallSectionsFromLed}.
 * Lines keep caller room order (Shows tab), then place within each room (no extra sections).
 * @param {GearListSfNode[]} nodes
 * @param {GearListLocationContext} [ctx]
 * @returns {GearListItem[]}
 */
export function autoGearFromSignalFlow(nodes, ctx) {
  const { places, roomName } = locationContext(ctx);
  /** @type {Map<string, { label: string, qty: number, placeId: string, place: string }>} */
  const groups = new Map();

  for (const node of nodes ?? []) {
    if (!node?.id) continue;
    if (isLedWallGearListNode(node)) continue;
    const typeId = typeof node.typeId === "string" ? node.typeId.trim() : "";
    const name = typeof node.name === "string" ? node.name.trim() : "";
    const label = name || typeId || "Device";
    const placeId =
      typeof node.placeId === "string" && node.placeId.trim() ? node.placeId.trim() : "";
    // Group by type + display name + place so room/place columns stay accurate.
    const groupKey = `${typeId}\0${label}\0${placeId}`;
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        label,
        qty: 1,
        placeId,
        place: placeNameFromId(places, placeId),
      });
      continue;
    }
    existing.qty += 1;
  }

  /** @type {GearListItem[]} */
  const out = [];
  for (const [groupKey, group] of groups) {
    out.push({
      id: uid("gli"),
      kind: "item",
      category: "gear",
      label: group.label,
      detail: "",
      qty: group.qty,
      length: null,
      room: roomName,
      place: group.place,
      notes: "",
      source: "auto",
      sourceKey: `sf-gear:${groupKey}`,
    });
  }
  return sortGearListItemsByRoomPlace(out);
}

/**
 * Sort gear items by place (then label) within each room.
 * Room groups keep first-seen order so callers can pass items already
 * concatenated in Shows-tab room order.
 * @param {GearListItem[]} items
 * @returns {GearListItem[]}
 */
export function sortGearListItemsByRoomPlace(items) {
  const collator = { sensitivity: /** @type {const} */ ("base") };
  /**
   * @param {string | null | undefined} value
   */
  function placeKey(value) {
    const t = typeof value === "string" ? value.trim() : "";
    return t || "\uffff";
  }

  /** @type {Map<string, GearListItem[]>} */
  const byRoom = new Map();
  for (const item of items ?? []) {
    const room = typeof item.room === "string" ? item.room.trim() : "";
    const group = byRoom.get(room);
    if (group) group.push(item);
    else byRoom.set(room, [item]);
  }

  /** @type {GearListItem[]} */
  const out = [];
  for (const group of byRoom.values()) {
    group.sort((a, b) => {
      const placeCmp = placeKey(a.place).localeCompare(placeKey(b.place), undefined, collator);
      if (placeCmp !== 0) return placeCmp;
      return (a.label ?? "").localeCompare(b.label ?? "", undefined, collator);
    });
    out.push(...group);
  }
  return out;
}

/**
 * @param {GearListSfNode} node
 */
function isLedWallGearListNode(node) {
  if (typeof node.ledWallId === "string" && node.ledWallId.trim()) return true;
  return typeof node.typeId === "string" && node.typeId.startsWith("led-wall:");
}

/**
 * Whether an auto sourceKey can jump to matching Signal Flow nodes.
 * @param {string | null | undefined} sourceKey
 */
export function gearListSourceKeyLinksToSignalFlow(sourceKey) {
  const key = unscopedGearListSourceKey(sourceKey);
  return key.startsWith("sf-gear:") || key.startsWith("led-wall:");
}

/**
 * Signal Flow node ids that correspond to a gear-list auto sourceKey.
 * @param {GearListSfNode[]} nodes
 * @param {string | null | undefined} sourceKey
 * @returns {string[]}
 */
export function nodeIdsForGearListSourceKey(nodes, sourceKey) {
  const key = unscopedGearListSourceKey(sourceKey);
  if (key.startsWith("sf-gear:")) {
    const rest = key.slice("sf-gear:".length);
    const parts = rest.split("\0");
    const typeId = parts[0] ?? "";
    const label = parts[1] ?? "";
    const placeId = parts[2] ?? "";
    return (nodes ?? [])
      .filter((node) => {
        if (!node?.id) return false;
        if (isLedWallGearListNode(node)) return false;
        const nType = typeof node.typeId === "string" ? node.typeId.trim() : "";
        const name = typeof node.name === "string" ? node.name.trim() : "";
        const nLabel = name || nType || "Device";
        const nPlace =
          typeof node.placeId === "string" && node.placeId.trim()
            ? node.placeId.trim()
            : "";
        return nType === typeId && nLabel === label && nPlace === placeId;
      })
      .map((node) => /** @type {string} */ (node.id));
  }
  if (key.startsWith("led-wall:")) {
    const wallId = key.slice("led-wall:".length).split(":")[0] ?? "";
    if (!wallId) return [];
    return (nodes ?? [])
      .filter((node) => {
        if (!node?.id) return false;
        if (typeof node.ledWallId === "string" && node.ledWallId.trim() === wallId) {
          return true;
        }
        return typeof node.typeId === "string" && node.typeId === `led-wall:${wallId}`;
      })
      .map((node) => /** @type {string} */ (node.id));
  }
  return [];
}

/**
 * Active tile grid size for a wall (generated dims when the wall has been built).
 * @param {{
 *   rows?: number,
 *   cols?: number,
 *   generated?: boolean,
 *   generatedRows?: number,
 *   generatedCols?: number,
 * } | null | undefined} grid
 * @returns {{ rows: number, cols: number, tiles: number }}
 */
export function ledWallTileGridSize(grid) {
  const useGenerated = Boolean(grid?.generated);
  const rows = Math.max(
    0,
    Math.floor(Number(useGenerated ? grid?.generatedRows : grid?.rows) || 0)
  );
  const cols = Math.max(
    0,
    Math.floor(Number(useGenerated ? grid?.generatedCols : grid?.cols) || 0)
  );
  return { rows, cols, tiles: rows * cols };
}

/**
 * Classify consecutive tile pairs on one drawn LED line.
 * Neighbors (share an edge) are horizontal or vertical; everything else is long.
 * @param {unknown[]} tileIndices
 * @param {number} cols
 * @returns {{ horizontal: number, vertical: number, long: number }}
 */
export function classifyLedLineJumpers(tileIndices, cols) {
  const c = Math.max(1, Math.floor(Number(cols) || 1));
  let horizontal = 0;
  let vertical = 0;
  let long = 0;
  const tiles = Array.isArray(tileIndices) ? tileIndices : [];
  for (let i = 0; i < tiles.length - 1; i += 1) {
    const a = Math.floor(Number(tiles[i]));
    const b = Math.floor(Number(tiles[i + 1]));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) continue;
    const ar = Math.floor(a / c);
    const ac = a % c;
    const br = Math.floor(b / c);
    const bc = b % c;
    const dr = Math.abs(ar - br);
    const dc = Math.abs(ac - bc);
    if (dr === 0 && dc === 1) horizontal += 1;
    else if (dc === 0 && dr === 1) vertical += 1;
    else long += 1;
  }
  return { horizontal, vertical, long };
}

/**
 * Sum jumper classes across all drawn lines on a map (data or power).
 * @param {{ tiles?: unknown[] }[] | null | undefined} lines
 * @param {number} cols
 * @returns {{ horizontal: number, vertical: number, long: number }}
 */
export function summarizeLedMapJumpers(lines, cols) {
  const totals = { horizontal: 0, vertical: 0, long: 0 };
  for (const line of lines ?? []) {
    const part = classifyLedLineJumpers(line?.tiles ?? [], cols);
    totals.horizontal += part.horizontal;
    totals.vertical += part.vertical;
    totals.long += part.long;
  }
  return totals;
}

/**
 * @deprecated Prefer {@link summarizeLedMapJumpers} from drawn lines.
 * Short jumpers between every neighboring pair in a full rectangular wall.
 * @param {number} rows
 * @param {number} cols
 */
export function ledWallNeighborJumperCount(rows, cols) {
  const r = Math.max(0, Math.floor(Number(rows) || 0));
  const c = Math.max(0, Math.floor(Number(cols) || 0));
  if (r < 1 || c < 1) return 0;
  return r * Math.max(0, c - 1) + c * Math.max(0, r - 1);
}

/**
 * @param {"ethercon" | "powercon"} kind
 * @param {{ horizontal: number, vertical: number, long: number }} totals
 * @param {string} keyBase
 * @param {{ room?: string, place?: string }} [location]
 * @returns {GearListItem[]}
 */
function jumperItemsForMap(kind, totals, keyBase, location = {}) {
  const shortLabel = kind === "ethercon" ? "Short Ethercon" : "Short Powercon";
  const longLabel = kind === "ethercon" ? "Long Ethercon" : "Long Powercon";
  const prefix = `${keyBase}:${kind}`;
  const room = location.room ?? "";
  const place = location.place ?? "";
  /** @type {GearListItem[]} */
  const items = [];
  /** @type {{ detail: string, qty: number, label: string, key: string }[]} */
  const rows = [
    { detail: "Horizontal", qty: totals.horizontal, label: shortLabel, key: "horizontal" },
    { detail: "Vertical", qty: totals.vertical, label: shortLabel, key: "vertical" },
    { detail: "Long", qty: totals.long, label: longLabel, key: "long" },
  ];
  for (const row of rows) {
    if (row.qty < 1) continue;
    items.push({
      id: uid("gli"),
      kind: "item",
      category: "cable",
      label: row.label,
      detail: row.detail,
      qty: row.qty,
      length: null,
      room,
      place,
      notes: "",
      source: "auto",
      sourceKey: `${prefix}:${row.key}`,
    });
  }
  return items;
}

/**
 * Display name for the wall's tile type (preset name, else processor type).
 * @param {{ name?: unknown, processorType?: unknown } | null | undefined} tile
 */
export function ledTileTypeLabel(tile) {
  if (typeof tile?.name === "string" && tile.name.trim()) return tile.name.trim();
  if (typeof tile?.processorType === "string" && tile.processorType.trim()) {
    return tile.processorType.trim();
  }
  return "LED tile";
}

/**
 * Unique LED wall import: one subsection per wall with tile qty plus
 * Ethercon (from data lines) and Powercon (from power lines) jumpers,
 * grouped as Horizontal / Vertical / Long from the drawn maps.
 * @param {{ grids?: object[] } | null | undefined} led
 * @param {GearListLocationContext & { nodes?: GearListSfNode[] }} [ctx]
 * @returns {GearListCableSection[]}
 */
export function autoLedWallSectionsFromLed(led, ctx) {
  const { places, roomName } = locationContext(ctx);
  const nodes = Array.isArray(ctx?.nodes) ? ctx.nodes : [];
  const grids = Array.isArray(led?.grids) ? led.grids : [];
  /** @type {GearListCableSection[]} */
  const sections = [];

  for (const grid of grids) {
    if (!grid || typeof grid !== "object") continue;
    const wallId =
      typeof /** @type {{ id?: unknown }} */ (grid).id === "string" &&
      /** @type {{ id: string }} */ (grid).id.trim()
        ? /** @type {{ id: string }} */ (grid).id.trim()
        : "";
    if (!wallId) continue;

    const name =
      typeof /** @type {{ name?: unknown }} */ (grid).name === "string" &&
      /** @type {{ name: string }} */ (grid).name.trim()
        ? /** @type {{ name: string }} */ (grid).name.trim()
        : "LED Wall";
    const { rows, cols, tiles } = ledWallTileGridSize(
      /** @type {{ rows?: number, cols?: number, generated?: boolean, generatedRows?: number, generatedCols?: number }} */ (
        grid
      )
    );
    const keyBase = `led-wall:${wallId}`;
    const dataJumpers = summarizeLedMapJumpers(
      /** @type {{ tiles?: unknown[] }[]} */ (
        /** @type {{ dataLines?: unknown }} */ (grid).dataLines
      ),
      cols
    );
    const powerJumpers = summarizeLedMapJumpers(
      /** @type {{ tiles?: unknown[] }[]} */ (
        /** @type {{ powerLines?: unknown }} */ (grid).powerLines
      ),
      cols
    );
    const tileLabel = ledTileTypeLabel(
      /** @type {{ tile?: { name?: unknown, processorType?: unknown } }} */ (grid).tile
    );
    const wallNode = nodes.find((node) => {
      if (typeof node.ledWallId === "string" && node.ledWallId.trim() === wallId) {
        return true;
      }
      return typeof node.typeId === "string" && node.typeId === `led-wall:${wallId}`;
    });
    const place = placeNameFromId(places, wallNode?.placeId);
    const location = { room: roomName, place };

    /** @type {GearListItem[]} */
    const items = [];
    if (tiles > 0) {
      items.push({
        id: uid("gli"),
        kind: "item",
        category: "gear",
        label: tileLabel,
        detail: `${cols}×${rows}`,
        qty: tiles,
        length: null,
        room: roomName,
        place,
        notes: "",
        source: "auto",
        sourceKey: `${keyBase}:tiles`,
      });
    }
    items.push(...jumperItemsForMap("ethercon", dataJumpers, keyBase, location));
    items.push(...jumperItemsForMap("powercon", powerJumpers, keyBase, location));

    if (!items.length) continue;

    sections.push({
      header: {
        id: uid("glh"),
        kind: "header",
        label: `LED - ${name}`,
        level: "subsection",
        source: "auto",
        sourceKey: `${keyBase}:header`,
      },
      items,
    });
  }

  return sections.sort((a, b) =>
    a.header.label.localeCompare(b.header.label, undefined, { sensitivity: "base" })
  );
}

/**
 * Auto cable plan from Cable Calculator cards.
 * Each route becomes a subsection labeled "[route] + [cable length]".
 * Place-local cables land in a trailing "Other" subsection.
 * @param {{
 *   routeCards?: { id: string, title: string, lengthLabel?: string, rows: import("./cable.js").CableRow[] }[],
 *   placeCards?: { id: string, title: string, lengthLabel?: string, rows: import("./cable.js").CableRow[] }[],
 *   manualsByRoute?: Record<string, GearListManualCable[]>,
 *   manualsByPlace?: Record<string, GearListManualCable[]>,
 *   placeLengths?: Record<string, number>,
 *   roomName?: string,
 * }} data
 * @returns {GearListCablePlan}
 */
export function autoCablePlanFromCableCards(data) {
  /** @type {GearListCableSection[]} */
  const sections = [];
  const roomName = typeof data.roomName === "string" ? data.roomName.trim() : "";

  for (const card of data.routeCards ?? []) {
    if (!card?.id) continue;
    const manuals = data.manualsByRoute?.[card.id] ?? [];
    const items = cableItemsForCard(card, manuals, `route:${card.id}`, null, {
      room: roomName,
      place: "",
    });
    if (!items.length) continue;
    const length = (card.lengthLabel ?? "").trim() || "Length unknown";
    const title = (card.title ?? "").trim() || "Route";
    sections.push({
      header: {
        id: uid("glh"),
        kind: "header",
        label: `${title} + ${length}`,
        level: "subsection",
        source: "auto",
        sourceKey: `cable-route:${card.id}`,
      },
      items,
    });
  }

  /** @type {GearListItem[]} */
  const otherItems = [];
  for (const card of data.placeCards ?? []) {
    if (!card?.id) continue;
    const manuals = data.manualsByPlace?.[card.id] ?? [];
    const placeLength = normalizeCableLength(data.placeLengths?.[card.id], null);
    const placeName = (card.title ?? "").trim();
    otherItems.push(
      ...cableItemsForCard(card, manuals, `other:${card.id}`, placeLength, {
        room: roomName,
        place: placeName,
      })
    );
  }
  if (otherItems.length) {
    sections.push({
      header: {
        id: uid("glh"),
        kind: "header",
        label: roomName ? `Other — ${roomName}` : "Other",
        level: "subsection",
        source: "auto",
        sourceKey: "cable-other",
      },
      items: otherItems,
    });
  }

  return { sections, looseItems: [] };
}

/**
 * True when a cable subsection is the place-local "Other" bucket.
 * @param {GearListCableSection | null | undefined} section
 */
export function isGearListCableOtherSection(section) {
  const key = typeof section?.header?.sourceKey === "string" ? section.header.sourceKey : "";
  if (key === "cable-other" || /(^|\|)cable-other$/.test(key)) return true;
  const label = typeof section?.header?.label === "string" ? section.header.label.trim() : "";
  return /^other\b/i.test(label);
}

/**
 * Keep route subsections ahead of trailing "Other" buckets (multi-room sync).
 * @param {GearListCablePlan} plan
 * @returns {GearListCablePlan}
 */
export function orderGearListCablePlan(plan) {
  const sections = Array.isArray(plan?.sections) ? plan.sections : [];
  const routes = sections.filter((section) => !isGearListCableOtherSection(section));
  const others = sections.filter((section) => isGearListCableOtherSection(section));
  return {
    sections: [...routes, ...others],
    looseItems: Array.isArray(plan?.looseItems) ? plan.looseItems : [],
  };
}

/**
 * @deprecated Prefer autoCablePlanFromCableCards — kept for flat item lists in tests/helpers.
 * @param {{
 *   routeCards?: { id: string, title: string, lengthLabel?: string, rows: import("./cable.js").CableRow[] }[],
 *   placeCards?: { id: string, title: string, lengthLabel?: string, rows: import("./cable.js").CableRow[] }[],
 *   manualCables?: GearListManualCable[],
 * }} data
 * @returns {GearListItem[]}
 */
export function autoCablesFromCableCards(data) {
  const plan = autoCablePlanFromCableCards({
    routeCards: data.routeCards,
    placeCards: data.placeCards,
    manualsByRoute: {},
    manualsByPlace: {},
  });
  const fromCards = [
    ...plan.sections.flatMap((s) => s.items),
    ...plan.looseItems,
  ];
  if (!data.manualCables?.length) return fromCards;
  // Legacy flat manuals (no card id) — append as loose grouped items.
  return [
    ...fromCards,
    ...cableItemsFromRows(manualCablesToRows(data.manualCables), "manual", null),
  ];
}

/**
 * @param {{ id: string, title: string, rows?: import("./cable.js").CableRow[] }} card
 * @param {GearListManualCable[]} manuals
 * @param {string} scopeKey
 * @param {number | null} defaultLength
 * @param {{ room?: string, place?: string }} [location]
 * @returns {GearListItem[]}
 */
function cableItemsForCard(card, manuals, scopeKey, defaultLength, location = {}) {
  /** @type {import("./cable.js").CableRow[]} */
  const rows = [...(card.rows ?? []), ...manualCablesToRows(manuals)];
  return cableItemsFromRows(rows, scopeKey, defaultLength, location);
}

/**
 * Condense cables by type (+ stock length) within a scope — detail/path is ignored.
 * @param {import("./cable.js").CableRow[]} rows
 * @param {string} scopeKey
 * @param {number | null} defaultLength
 * @param {{ room?: string, place?: string }} [location]
 * @returns {GearListItem[]}
 */
function cableItemsFromRows(rows, scopeKey, defaultLength = null, location = {}) {
  /** @type {Map<string, { type: string, qty: number, length: number | null }>} */
  const byTypeLength = new Map();
  const room = location.room ?? "";
  const place = location.place ?? "";

  for (const group of groupRowsByCableType(rows)) {
    for (const row of group.rows) {
      const qty = normalizeCableAmount(row.amount, 1);
      const length = normalizeCableLength(row.length, defaultLength);
      const key = `${group.type}\0${length ?? ""}`;
      const existing = byTypeLength.get(key);
      if (existing) {
        existing.qty += qty;
        continue;
      }
      byTypeLength.set(key, { type: group.type, qty, length });
    }
  }

  /** @type {GearListItem[]} */
  const out = [...byTypeLength.values()]
    .sort((a, b) => {
      const typeCmp = compareCableTypes(a.type, b.type);
      if (typeCmp !== 0) return typeCmp;
      if (a.length == null && b.length == null) return 0;
      if (a.length == null) return 1;
      if (b.length == null) return -1;
      return a.length - b.length;
    })
    .map((entry) => ({
      id: uid("gli"),
      kind: /** @type {const} */ ("item"),
      category: /** @type {const} */ ("cable"),
      label: entry.type,
      detail: "",
      qty: entry.qty,
      length: entry.length,
      room,
      place,
      notes: "",
      source: /** @type {const} */ ("auto"),
      sourceKey: `cable:${scopeKey}:${entry.type}|${entry.length ?? ""}`,
    }));
  return out;
}

/**
 * Flatten manual cables from cable calculator state maps.
 * @param {{ routes?: Record<string, GearListManualCable[]>, places?: Record<string, GearListManualCable[]> } | null | undefined} cableState
 * @returns {GearListManualCable[]}
 */
export function flattenManualCables(cableState) {
  /** @type {GearListManualCable[]} */
  const out = [];
  if (!cableState || typeof cableState !== "object") return out;
  for (const list of Object.values(cableState.routes ?? {})) {
    if (Array.isArray(list)) out.push(...list);
  }
  for (const list of Object.values(cableState.places ?? {})) {
    if (Array.isArray(list)) out.push(...list);
  }
  return out;
}

/**
 * Merge live auto gear/cable/LED into the persisted row order.
 * Strips prior auto rows and re-inserts fresh from tools (notes preserved by sourceKey).
 * Manual rows/headers keep their relative order.
 * @param {GearListState} state
 * @param {GearListItem[]} autoGear
 * @param {GearListCablePlan | GearListItem[]} autoCablesOrPlan
 * @param {GearListCableSection[]} [ledSections]
 * @returns {GearListState}
 */
export function syncGearListRows(state, autoGear, autoCablesOrPlan, ledSections = []) {
  /** @type {GearListCablePlan} */
  const plan = orderGearListCablePlan(
    Array.isArray(autoCablesOrPlan)
      ? { sections: [], looseItems: autoCablesOrPlan }
      : autoCablesOrPlan ?? { sections: [], looseItems: [] }
  );

  /** @type {Map<string, string>} */
  const notesByKey = new Map();
  /** @type {Map<string, boolean>} */
  const includedByKey = new Map();
  /** @type {Map<string, string>} */
  const idByKey = new Map();
  for (const row of state.rows ?? []) {
    if (row.kind === "item" && row.source === "auto" && row.sourceKey) {
      notesByKey.set(row.sourceKey, row.notes ?? "");
      includedByKey.set(row.sourceKey, isGearListRowIncluded(row));
      idByKey.set(row.sourceKey, row.id);
    } else if (row.kind === "header" && row.source === "auto" && row.sourceKey) {
      includedByKey.set(row.sourceKey, isGearListRowIncluded(row));
      idByKey.set(row.sourceKey, row.id);
    }
  }

  /**
   * @param {GearListHeader | GearListItem} live
   * @returns {GearListHeader | GearListItem}
   */
  function adopt(live) {
    const id = (live.sourceKey && idByKey.get(live.sourceKey)) || live.id;
    const included =
      live.sourceKey && includedByKey.has(live.sourceKey)
        ? Boolean(includedByKey.get(live.sourceKey))
        : isGearListRowIncluded(live);
    if (live.kind === "header") {
      return { ...live, id, included };
    }
    return {
      ...live,
      id,
      notes:
        live.sourceKey && notesByKey.has(live.sourceKey)
          ? /** @type {string} */ (notesByKey.get(live.sourceKey))
          : "",
      included,
    };
  }

  // Keep only manual content; auto rows are rebuilt from upstream.
  /** @type {GearListRow[]} */
  const next = [];
  for (const row of state.rows ?? []) {
    if (row.kind === "header") {
      if (row.source === "auto") continue;
      next.push({
        ...row,
        source: row.source ?? "manual",
        sourceKey: row.sourceKey ?? null,
        included: isGearListRowIncluded(row),
      });
      continue;
    }
    if (row.source === "auto") continue;
    next.push({
      ...row,
      included: isGearListRowIncluded(row),
    });
  }

  ensureDefaultSections(next);

  for (const section of ledSections ?? []) {
    const block = [
      /** @type {GearListHeader} */ (adopt(section.header)),
      ...section.items.map((item) => /** @type {GearListItem} */ (adopt(item))),
    ];
    insertMissing(next, block, ["led"]);
  }

  insertMissing(
    next,
    sortGearListItemsByRoomPlace(
      autoGear.map((g) => /** @type {GearListItem} */ (adopt(g)))
    ),
    ["signal flow", "gear"]
  );

  /** @type {GearListRow[]} */
  const cableBlock = [];
  for (const section of plan.sections) {
    cableBlock.push(/** @type {GearListHeader} */ (adopt(section.header)));
    for (const item of section.items) {
      cableBlock.push(/** @type {GearListItem} */ (adopt(item)));
    }
  }
  insertMissing(next, cableBlock, ["cable"]);

  insertMissing(
    next,
    plan.looseItems.map((item) => /** @type {GearListItem} */ (adopt(item))),
    ["cable"]
  );

  return withRows(state, next);
}

/**
 * @param {GearListRow} row
 */
function isLedSectionHeader(row) {
  return (
    row.kind === "header" &&
    row.level === "section" &&
    /^led$/i.test(row.label.trim())
  );
}

/**
 * @param {GearListRow} row
 */
function isSignalFlowGearSectionHeader(row) {
  return (
    row.kind === "header" &&
    row.level === "section" &&
    /signal flow/i.test(row.label)
  );
}

/**
 * @param {GearListRow} row
 */
function isCableSectionHeader(row) {
  return (
    row.kind === "header" &&
    row.level === "section" &&
    /cable/i.test(row.label)
  );
}

/**
 * Index of the first top-level section header at or after `from`.
 * @param {GearListRow[]} rows
 * @param {number} from
 */
function nextSectionIndex(rows, from) {
  for (let i = from; i < rows.length; i += 1) {
    if (rows[i].kind === "header" && rows[i].level === "section") return i;
  }
  return rows.length;
}

/**
 * @param {GearListRow[]} rows
 */
function ensureDefaultSections(rows) {
  const defaults = emptyGearListState().rows;
  const ledDef = defaults[0];
  const gearDef = defaults[1];
  const cableDef = defaults[2];

  if (!rows.some(isLedSectionHeader)) {
    const gearIdx = rows.findIndex(isSignalFlowGearSectionHeader);
    if (gearIdx >= 0) rows.splice(gearIdx, 0, { ...ledDef, id: uid("glh") });
    else rows.unshift({ ...ledDef, id: uid("glh") });
  }
  if (!rows.some(isSignalFlowGearSectionHeader)) {
    const ledIdx = rows.findIndex(isLedSectionHeader);
    const cableIdx = rows.findIndex(isCableSectionHeader);
    const header = { ...gearDef, id: uid("glh") };
    if (cableIdx >= 0) rows.splice(cableIdx, 0, header);
    else if (ledIdx >= 0) rows.splice(nextSectionIndex(rows, ledIdx + 1), 0, header);
    else rows.unshift(header);
  }
  if (!rows.some(isCableSectionHeader)) {
    const gearIdx = rows.findIndex(isSignalFlowGearSectionHeader);
    const header = { ...cableDef, id: uid("glh") };
    if (gearIdx >= 0) rows.splice(nextSectionIndex(rows, gearIdx + 1), 0, header);
    else rows.push(header);
  }

  // LED section must sit above Signal Flow gear.
  const ledIdx = rows.findIndex(isLedSectionHeader);
  const gearIdx = rows.findIndex(isSignalFlowGearSectionHeader);
  if (ledIdx >= 0 && gearIdx >= 0 && ledIdx > gearIdx) {
    const ledEnd = nextSectionIndex(rows, ledIdx + 1);
    const block = rows.splice(ledIdx, ledEnd - ledIdx);
    rows.splice(gearIdx, 0, ...block);
  }
}

/**
 * @param {GearListRow[]} rows
 * @param {GearListRow[]} missing
 * @param {string[]} headerNeedles
 */
function insertMissing(rows, missing, headerNeedles) {
  if (!missing.length) return;
  let insertAt = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.kind !== "header") continue;
    // Prefer top-level sections for auto placement; skip subsections.
    if (row.level === "subsection") continue;
    const label = row.label.toLowerCase().trim();
    const matched = headerNeedles.some((n) => {
      // Exact "LED" section only — do not match "LED - Wall" if it were a section.
      if (n === "led") return label === "led";
      return label.includes(n);
    });
    if (matched) {
      insertAt = i + 1;
      while (insertAt < rows.length && rows[insertAt].kind !== "header") insertAt += 1;
      // Stay inside this section: skip past auto route subsections that already live here.
      while (
        insertAt < rows.length &&
        rows[insertAt].kind === "header" &&
        rows[insertAt].level === "subsection" &&
        rows[insertAt].source === "auto"
      ) {
        insertAt += 1;
        while (insertAt < rows.length && rows[insertAt].kind === "item") insertAt += 1;
      }
    }
  }
  if (insertAt < 0) {
    rows.push(...missing);
    return;
  }
  rows.splice(insertAt, 0, ...missing);
}

/**
 * @param {GearListState} state
 * @param {string} label
 * @param {number} [index]
 * @param {"section" | "subsection"} [level]
 * @returns {GearListState}
 */
export function addGearListHeader(state, label, index, level = "section") {
  const header = {
    id: uid("glh"),
    kind: /** @type {const} */ ("header"),
    label: label.trim() || (level === "subsection" ? "Subsection" : "Section"),
    level: level === "subsection" ? /** @type {const} */ ("subsection") : /** @type {const} */ ("section"),
    source: /** @type {const} */ ("manual"),
    sourceKey: null,
    included: true,
  };
  const rows = [...state.rows];
  const at = typeof index === "number" ? Math.max(0, Math.min(rows.length, index)) : rows.length;
  rows.splice(at, 0, header);
  return withRows(state, rows);
}

/**
 * @param {GearListState} state
 * @param {{ label?: string, category?: "gear" | "cable", qty?: number, length?: number | null, detail?: string, notes?: string, room?: string, place?: string }} fields
 * @param {number} [index]
 * @returns {GearListState}
 */
export function addManualGearListItem(state, fields, index) {
  const category = fields.category === "cable" ? /** @type {const} */ ("cable") : /** @type {const} */ ("gear");
  const item = {
    id: uid("gli"),
    kind: /** @type {const} */ ("item"),
    category,
    label: (fields.label ?? "").trim() || "Item",
    detail: fields.detail ?? "",
    qty: Math.max(1, Math.min(9999, Math.floor(Number(fields.qty)) || 1)),
    length: category === "cable" ? normalizeCableLength(fields.length, null) : null,
    room: typeof fields.room === "string" ? fields.room : "",
    place: typeof fields.place === "string" ? fields.place : "",
    notes: fields.notes ?? "",
    source: /** @type {const} */ ("manual"),
    sourceKey: null,
    included: true,
  };
  const rows = [...state.rows];
  const at = typeof index === "number" ? Math.max(0, Math.min(rows.length, index)) : rows.length;
  rows.splice(at, 0, item);
  return withRows(state, rows);
}

/**
 * @param {GearListState} state
 * @param {string} rowId
 * @returns {GearListState}
 */
export function removeGearListRow(state, rowId) {
  return withRows(
    state,
    state.rows.filter((r) => r.id !== rowId)
  );
}

/**
 * @param {GearListState} state
 * @param {string} rowId
 * @param {number} direction -1 up, +1 down
 * @returns {GearListState}
 */
export function moveGearListRow(state, rowId, direction) {
  const rows = [...state.rows];
  const i = rows.findIndex((r) => r.id === rowId);
  if (i < 0) return state;
  const j = i + direction;
  if (j < 0 || j >= rows.length) return state;
  const tmp = rows[i];
  rows[i] = rows[j];
  rows[j] = tmp;
  return withRows(state, rows);
}

/**
 * Move a row before or after another row (insert, never swap).
 * @param {GearListState} state
 * @param {string} draggedId
 * @param {string} targetId
 * @param {"before" | "after"} place
 * @returns {GearListState}
 */
export function reorderGearListRow(state, draggedId, targetId, place) {
  if (draggedId === targetId) return state;
  const rows = [...state.rows];
  const from = rows.findIndex((r) => r.id === draggedId);
  if (from < 0) return state;
  const [moved] = rows.splice(from, 1);
  let insertAt = rows.findIndex((r) => r.id === targetId);
  if (insertAt < 0) {
    rows.splice(from, 0, moved); // restore
    return state;
  }
  if (place === "after") insertAt += 1;
  rows.splice(insertAt, 0, moved);
  return withRows(state, rows);
}

/**
 * @param {GearListState} state
 * @param {string} rowId
 * @param {Partial<GearListItem & GearListHeader>} patch
 * @returns {GearListState}
 */
export function updateGearListRow(state, rowId, patch) {
  return withRows(
    state,
    state.rows.map((row) => {
      if (row.id !== rowId) return row;
      if (row.kind === "header") {
        return {
          ...row,
          label:
            typeof patch.label === "string" && patch.label.trim()
              ? patch.label.trim()
              : row.label,
          level:
            patch.level === "subsection" || patch.level === "section"
              ? patch.level
              : row.level,
          included:
            typeof patch.included === "boolean" ? patch.included : isGearListRowIncluded(row),
        };
      }
      return {
        ...row,
        label:
          typeof patch.label === "string" && patch.label.trim()
            ? patch.label.trim()
            : row.label,
        detail: typeof patch.detail === "string" ? patch.detail : row.detail,
        notes: typeof patch.notes === "string" ? patch.notes : row.notes,
        room: typeof patch.room === "string" ? patch.room : row.room,
        place: typeof patch.place === "string" ? patch.place : row.place,
        qty:
          patch.qty != null
            ? Math.max(1, Math.min(9999, Math.floor(Number(patch.qty)) || 1))
            : row.qty,
        length:
          patch.length !== undefined
            ? normalizeCableLength(patch.length, null)
            : row.length,
        category:
          patch.category === "cable" || patch.category === "gear"
            ? patch.category
            : row.category,
        included:
          typeof patch.included === "boolean" ? patch.included : isGearListRowIncluded(row),
      };
    })
  );
}
