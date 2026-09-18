/**
 * Multi-show document domain — Shows → Rooms + global Room Templates (AVP v3).
 * Plan payloads are opaque here; section normalize lives in site-state.js.
 */

import { deepClone } from "../shared/clone.js";
import { uid } from "../shared/id.js";

export const SHOW_DOCUMENT_VERSION = 3;

/**
 * @typedef {Record<string, unknown>} RoomPlan
 *
 * @typedef {{ id: string, name: string, plan: RoomPlan }} Room
 * @typedef {{
 *   id: string,
 *   name: string,
 *   rooms: Room[],
 *   paperwork?: Record<string, unknown> | null,
 * }} Show
 * @typedef {{ id: string, name: string, plan: RoomPlan }} RoomTemplate
 *
 * @typedef {{
 *   formatVersion: number,
 *   app: string,
 *   exportedAt: string,
 *   activeShowId: string | null,
 *   activeRoomId: string | null,
 *   activeTab: string,
 *   shows: Show[],
 *   templates: RoomTemplate[],
 * }} ShowDocument
 */

/** @param {string} name */
function cleanName(name, fallback) {
  const trimmed = String(name ?? "").trim();
  return trimmed || fallback;
}

/**
 * @param {unknown} raw
 * @param {RoomPlan} fallbackPlan
 * @param {string} [fallbackName]
 * @returns {Room}
 */
export function normalizeRoom(raw, fallbackPlan, fallbackName = "Room") {
  const data = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    id: typeof data.id === "string" && data.id ? data.id : uid("room"),
    name: cleanName(data.name, fallbackName),
    plan: data.plan && typeof data.plan === "object"
      ? /** @type {RoomPlan} */ (deepClone(data.plan))
      : deepClone(fallbackPlan),
  };
}

/**
 * @param {unknown} raw
 * @param {RoomPlan} fallbackPlan
 * @param {string} [fallbackName]
 * @returns {RoomTemplate}
 */
export function normalizeTemplate(raw, fallbackPlan, fallbackName = "Template") {
  const data = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    id: typeof data.id === "string" && data.id ? data.id : uid("tpl"),
    name: cleanName(data.name, fallbackName),
    plan: data.plan && typeof data.plan === "object"
      ? /** @type {RoomPlan} */ (deepClone(data.plan))
      : deepClone(fallbackPlan),
  };
}

/**
 * @param {unknown} raw
 * @param {RoomPlan} fallbackPlan
 * @param {string} [fallbackName]
 * @returns {Show}
 */
export function normalizeShow(raw, fallbackPlan, fallbackName = "Show") {
  const data = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const roomsRaw = Array.isArray(data.rooms) ? data.rooms : [];
  const rooms =
    roomsRaw.length > 0
      ? roomsRaw.map((room, index) =>
          normalizeRoom(room, fallbackPlan, `Room ${index + 1}`)
        )
      : [normalizeRoom({}, fallbackPlan, "Room 1")];
  /** @type {Show} */
  const show = {
    id: typeof data.id === "string" && data.id ? data.id : uid("show"),
    name: cleanName(data.name, fallbackName),
    rooms,
  };
  if (data.paperwork && typeof data.paperwork === "object") {
    show.paperwork = /** @type {Record<string, unknown>} */ (deepClone(data.paperwork));
  } else {
    // Hoist legacy per-room paperwork onto the show once.
    for (const room of rooms) {
      const plan = room.plan;
      const pw = plan && typeof plan === "object" ? plan.paperwork : null;
      if (pw && typeof pw === "object") {
        show.paperwork = /** @type {Record<string, unknown>} */ (deepClone(pw));
        break;
      }
    }
  }
  // Paperwork lives on the show; drop nested copies from room plans.
  for (const room of show.rooms) {
    if (room.plan && typeof room.plan === "object" && "paperwork" in room.plan) {
      const { paperwork: _removed, ...rest } = /** @type {Record<string, unknown>} */ (
        room.plan
      );
      room.plan = /** @type {RoomPlan} */ (rest);
    }
  }
  return show;
}

/**
 * @param {RoomPlan} emptyPlan
 * @returns {ShowDocument}
 */
export function emptyShowDocument(emptyPlan) {
  const room = normalizeRoom({}, emptyPlan, "Room 1");
  const show = {
    id: uid("show"),
    name: "Show 1",
    rooms: [room],
  };
  return {
    formatVersion: SHOW_DOCUMENT_VERSION,
    app: "av-site-planner",
    exportedAt: new Date().toISOString(),
    activeShowId: show.id,
    activeRoomId: room.id,
    activeTab: "shows",
    shows: [show],
    templates: [],
  };
}

/**
 * @param {ShowDocument} doc
 * @returns {Show | null}
 */
export function findActiveShow(doc) {
  if (!doc.shows.length) return null;
  return doc.shows.find((s) => s.id === doc.activeShowId) ?? doc.shows[0] ?? null;
}

/**
 * @param {ShowDocument} doc
 * @returns {Room | null}
 */
export function findActiveRoom(doc) {
  const show = findActiveShow(doc);
  if (!show?.rooms.length) return null;
  return show.rooms.find((r) => r.id === doc.activeRoomId) ?? show.rooms[0] ?? null;
}

/**
 * @param {ShowDocument} doc
 * @param {Record<string, unknown> | null | undefined} paperwork
 */
export function writeActiveShowPaperwork(doc, paperwork) {
  const show = doc.shows.find((s) => s.id === doc.activeShowId);
  if (!show) return false;
  show.paperwork = paperwork && typeof paperwork === "object" ? deepClone(paperwork) : null;
  return true;
}

/**
 * @param {ShowDocument} doc
 * @returns {Record<string, unknown> | null}
 */
export function readActiveShowPaperwork(doc) {
  const show = findActiveShow(doc);
  if (!show) return null;
  if (show.paperwork && typeof show.paperwork === "object") {
    return /** @type {Record<string, unknown>} */ (deepClone(show.paperwork));
  }
  // Legacy fallback: first room plan that still carries paperwork.
  for (const room of show.rooms) {
    const pw = room.plan?.paperwork;
    if (pw && typeof pw === "object") {
      return /** @type {Record<string, unknown>} */ (deepClone(pw));
    }
  }
  return null;
}

/**
 * Ensure activeShowId / activeRoomId point at existing entities.
 * @param {ShowDocument} doc
 */
export function reconcileActiveIds(doc) {
  const show = findActiveShow(doc);
  doc.activeShowId = show?.id ?? null;
  if (!show) {
    doc.activeRoomId = null;
    return doc;
  }
  const room = show.rooms.find((r) => r.id === doc.activeRoomId) ?? show.rooms[0] ?? null;
  doc.activeRoomId = room?.id ?? null;
  return doc;
}

/**
 * @param {ShowDocument} doc
 * @param {string} showId
 * @param {string} roomId
 */
export function setActiveRoom(doc, showId, roomId) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show) return false;
  const room = show.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  doc.activeShowId = showId;
  doc.activeRoomId = roomId;
  return true;
}

/**
 * Write a plan into the room identified by activeShowId + activeRoomId.
 * Requires an exact room match (no rooms[0] fallback) so a mismatched
 * activeRoomId cannot overwrite another show's first room.
 * @param {ShowDocument} doc
 * @param {RoomPlan} plan
 */
export function writeActiveRoomPlan(doc, plan) {
  const show = doc.shows.find((s) => s.id === doc.activeShowId);
  if (!show) return false;
  const room = show.rooms.find((r) => r.id === doc.activeRoomId);
  if (!room) return false;
  room.plan = deepClone(plan);
  return true;
}

/** @param {ShowDocument} doc @param {string} [name] */
export function addShow(doc, name) {
  const plan = findActiveRoom(doc)?.plan ?? {};
  const room = normalizeRoom({}, /** @type {RoomPlan} */ (deepClone(plan)), "Room 1");
  // New show gets an empty-ish room: copy structure from empty plan if available via caller.
  // Caller should pass preferred empty plan by replacing room.plan after add when needed.
  const show = {
    id: uid("show"),
    name: cleanName(name, `Show ${doc.shows.length + 1}`),
    rooms: [room],
  };
  doc.shows.push(show);
  doc.activeShowId = show.id;
  doc.activeRoomId = room.id;
  return show;
}

/**
 * Add a show with an explicit empty plan for its first room.
 * @param {ShowDocument} doc
 * @param {RoomPlan} emptyPlan
 * @param {string} [name]
 */
export function addShowWithEmptyRoom(doc, emptyPlan, name) {
  const room = normalizeRoom({}, emptyPlan, "Room 1");
  const show = {
    id: uid("show"),
    name: cleanName(name, `Show ${doc.shows.length + 1}`),
    rooms: [room],
  };
  doc.shows.push(show);
  doc.activeShowId = show.id;
  doc.activeRoomId = room.id;
  return show;
}

/** @param {ShowDocument} doc @param {string} showId */
export function removeShow(doc, showId) {
  if (doc.shows.length <= 1) return false;
  const index = doc.shows.findIndex((s) => s.id === showId);
  if (index < 0) return false;
  doc.shows.splice(index, 1);
  reconcileActiveIds(doc);
  return true;
}

/** @param {ShowDocument} doc @param {string} showId */
export function duplicateShow(doc, showId) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show) return null;
  const copy = {
    id: uid("show"),
    name: `${show.name} copy`,
    rooms: show.rooms.map((room) => ({
      id: uid("room"),
      name: room.name,
      plan: deepClone(room.plan),
    })),
    paperwork: show.paperwork ? deepClone(show.paperwork) : null,
  };
  doc.shows.push(copy);
  doc.activeShowId = copy.id;
  doc.activeRoomId = copy.rooms[0]?.id ?? null;
  return copy;
}

/** @param {ShowDocument} doc @param {string} showId @param {string} name */
export function renameShow(doc, showId, name) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show) return false;
  show.name = cleanName(name, show.name);
  return true;
}

/**
 * @param {ShowDocument} doc
 * @param {string} showId
 * @param {RoomPlan} emptyPlan
 * @param {string} [name]
 */
export function addRoom(doc, showId, emptyPlan, name) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show) return null;
  const room = normalizeRoom(
    {},
    emptyPlan,
    cleanName(name, `Room ${show.rooms.length + 1}`)
  );
  show.rooms.push(room);
  doc.activeShowId = showId;
  doc.activeRoomId = room.id;
  return room;
}

/** @param {ShowDocument} doc @param {string} showId @param {string} roomId */
export function removeRoom(doc, showId, roomId) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show || show.rooms.length <= 1) return false;
  const index = show.rooms.findIndex((r) => r.id === roomId);
  if (index < 0) return false;
  show.rooms.splice(index, 1);
  if (doc.activeRoomId === roomId) {
    doc.activeRoomId = show.rooms[0]?.id ?? null;
  }
  return true;
}

/** @param {ShowDocument} doc @param {string} showId @param {string} roomId */
export function duplicateRoom(doc, showId, roomId) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show) return null;
  const room = show.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const copy = {
    id: uid("room"),
    name: `${room.name} copy`,
    plan: deepClone(room.plan),
  };
  show.rooms.push(copy);
  doc.activeShowId = showId;
  doc.activeRoomId = copy.id;
  return copy;
}

/** @param {ShowDocument} doc @param {string} showId @param {string} roomId @param {string} name */
export function renameRoom(doc, showId, roomId, name) {
  const show = doc.shows.find((s) => s.id === showId);
  const room = show?.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  room.name = cleanName(name, room.name);
  return true;
}

/**
 * @template {{ id: string }} T
 * @param {T[]} list
 * @param {string} fromId
 * @param {string} toId
 * @param {"before" | "after"} place
 * @returns {boolean}
 */
function reorderListItem(list, fromId, toId, place) {
  if (fromId === toId) return false;
  const fromIndex = list.findIndex((item) => item.id === fromId);
  if (fromIndex < 0) return false;
  const [item] = list.splice(fromIndex, 1);
  const toIndex = list.findIndex((entry) => entry.id === toId);
  if (toIndex < 0) {
    list.push(item);
    return true;
  }
  const insertAt = place === "before" ? toIndex : toIndex + 1;
  list.splice(insertAt, 0, item);
  return true;
}

/**
 * @param {unknown} index
 * @param {number} length
 * @returns {number}
 */
function clampInsertIndex(index, length) {
  if (typeof index !== "number" || !Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.floor(index)));
}

/**
 * Reorder a room within its show.
 * @param {ShowDocument} doc
 * @param {string} showId
 * @param {string} roomId
 * @param {string} targetRoomId
 * @param {"before" | "after"} place
 */
export function reorderRoom(doc, showId, roomId, targetRoomId, place) {
  const show = doc.shows.find((s) => s.id === showId);
  if (!show) return false;
  return reorderListItem(show.rooms, roomId, targetRoomId, place);
}

/**
 * Reorder a global room template.
 * @param {ShowDocument} doc
 * @param {string} templateId
 * @param {string} targetTemplateId
 * @param {"before" | "after"} place
 */
export function reorderTemplate(doc, templateId, targetTemplateId, place) {
  return reorderListItem(doc.templates, templateId, targetTemplateId, place);
}

/**
 * Copy a room's plan into the global templates list.
 * @param {ShowDocument} doc
 * @param {string} showId
 * @param {string} roomId
 * @param {string} [name]
 * @param {number} [insertIndex]
 */
export function saveRoomAsTemplate(doc, showId, roomId, name, insertIndex) {
  const show = doc.shows.find((s) => s.id === showId);
  const room = show?.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const template = {
    id: uid("tpl"),
    name: cleanName(name, room.name),
    plan: deepClone(room.plan),
  };
  doc.templates.splice(clampInsertIndex(insertIndex, doc.templates.length), 0, template);
  return template;
}

/**
 * Copy a template into a new room under a show (independent clone).
 * @param {ShowDocument} doc
 * @param {string} showId
 * @param {string} templateId
 * @param {string} [name]
 * @param {number} [insertIndex]
 */
export function addTemplateToShow(doc, showId, templateId, name, insertIndex) {
  const show = doc.shows.find((s) => s.id === showId);
  const template = doc.templates.find((t) => t.id === templateId);
  if (!show || !template) return null;
  const room = {
    id: uid("room"),
    name: cleanName(name, template.name),
    plan: deepClone(template.plan),
  };
  show.rooms.splice(clampInsertIndex(insertIndex, show.rooms.length), 0, room);
  doc.activeShowId = showId;
  doc.activeRoomId = room.id;
  return room;
}

/** @param {ShowDocument} doc @param {string} templateId */
export function removeTemplate(doc, templateId) {
  const index = doc.templates.findIndex((t) => t.id === templateId);
  if (index < 0) return false;
  doc.templates.splice(index, 1);
  return true;
}

/** @param {ShowDocument} doc @param {string} templateId */
export function duplicateTemplate(doc, templateId) {
  const template = doc.templates.find((t) => t.id === templateId);
  if (!template) return null;
  const copy = {
    id: uid("tpl"),
    name: `${template.name} copy`,
    plan: deepClone(template.plan),
  };
  doc.templates.push(copy);
  return copy;
}

/** @param {ShowDocument} doc @param {string} templateId @param {string} name */
export function renameTemplate(doc, templateId, name) {
  const template = doc.templates.find((t) => t.id === templateId);
  if (!template) return false;
  template.name = cleanName(name, template.name);
  return true;
}

/**
 * Structural normalize. `normalizePlan` validates each room/template plan.
 * @param {unknown} raw
 * @param {(plan: unknown) => RoomPlan} normalizePlan
 * @param {() => RoomPlan} emptyPlan
 * @returns {ShowDocument}
 */
export function normalizeShowDocument(raw, normalizePlan, emptyPlan) {
  const fallbackPlan = emptyPlan();
  if (!raw || typeof raw !== "object") {
    return emptyShowDocument(fallbackPlan);
  }
  const data = /** @type {Record<string, unknown>} */ (raw);

  const showsRaw = Array.isArray(data.shows) ? data.shows : [];
  const shows =
    showsRaw.length > 0
      ? showsRaw.map((show, index) => {
          const normalized = normalizeShow(show, fallbackPlan, `Show ${index + 1}`);
          normalized.rooms = normalized.rooms.map((room) => ({
            ...room,
            plan: normalizePlan(room.plan),
          }));
          return normalized;
        })
      : emptyShowDocument(fallbackPlan).shows;

  const templates = (Array.isArray(data.templates) ? data.templates : []).map(
    (template, index) => {
      const normalized = normalizeTemplate(template, fallbackPlan, `Template ${index + 1}`);
      normalized.plan = normalizePlan(normalized.plan);
      return normalized;
    }
  );

  /** @type {ShowDocument} */
  const doc = {
    formatVersion: SHOW_DOCUMENT_VERSION,
    app: "av-site-planner",
    exportedAt:
      typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    activeShowId: typeof data.activeShowId === "string" ? data.activeShowId : null,
    activeRoomId: typeof data.activeRoomId === "string" ? data.activeRoomId : null,
    activeTab: typeof data.activeTab === "string" ? data.activeTab : "shows",
    shows,
    templates,
  };
  return reconcileActiveIds(doc);
}

/**
 * Build a v3 document containing only one show (no room templates).
 * @param {ShowDocument} doc
 * @param {string} [showId] Defaults to the active show
 * @returns {ShowDocument}
 */
export function documentForSingleShowExport(doc, showId) {
  const show =
    (showId ? doc.shows.find((s) => s.id === showId) : null) ?? findActiveShow(doc);
  if (!show) {
    throw new Error("No show to export.");
  }
  const clonedShow = /** @type {Show} */ (deepClone(show));
  const preferRoomId =
    doc.activeShowId === show.id && typeof doc.activeRoomId === "string"
      ? doc.activeRoomId
      : null;
  const activeRoom =
    (preferRoomId
      ? clonedShow.rooms.find((r) => r.id === preferRoomId)
      : null) ?? clonedShow.rooms[0] ?? null;
  return {
    formatVersion: SHOW_DOCUMENT_VERSION,
    app: "av-site-planner",
    exportedAt: new Date().toISOString(),
    activeShowId: clonedShow.id,
    activeRoomId: activeRoom?.id ?? null,
    activeTab: typeof doc.activeTab === "string" ? doc.activeTab : "shows",
    shows: [clonedShow],
    templates: [],
  };
}

/**
 * Wrap a validated v2 site plan into a v3 show document.
 * @param {Record<string, unknown>} v2Plan Full validated v2 site state
 * @param {() => RoomPlan} emptyPlan
 * @returns {ShowDocument}
 */
export function wrapV2PlanAsShowDocument(v2Plan, emptyPlan) {
  const {
    formatVersion: _fv,
    app: _app,
    exportedAt,
    activeTab,
    ...rest
  } = v2Plan;
  const plan = /** @type {RoomPlan} */ (deepClone(rest));
  const room = normalizeRoom({ name: "Room 1", plan }, emptyPlan(), "Room 1");
  room.plan = plan;
  const show = {
    id: uid("show"),
    name: "Imported",
    rooms: [room],
  };
  return {
    formatVersion: SHOW_DOCUMENT_VERSION,
    app: "av-site-planner",
    exportedAt: typeof exportedAt === "string" ? exportedAt : new Date().toISOString(),
    activeShowId: show.id,
    activeRoomId: room.id,
    activeTab: typeof activeTab === "string" ? activeTab : "shows",
    shows: [show],
    templates: [],
  };
}
