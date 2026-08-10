/**
 * Projector domain — .AVP section normalize / empty shape.
 */

import { uid } from "../shared/id.js";

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   unit: "ft" | "m",
 *   aspectId: string,
 *   width: number,
 *   height: number,
 *   projectors: object[],
 *   projectorGroups: object[],
 *   activeProjectorId: string | null,
 *   activeGroupId: string | null,
 *   view: object | null,
 * }} ProjectionScreen
 *
 * @typedef {{
 *   screens: ProjectionScreen[],
 *   activeScreenId: string | null,
 *   activeSidebarTab: "screen" | "projectors",
 * }} ProjectorState
 */

/**
 * @param {number} [index]
 * @returns {ProjectionScreen}
 */
export function createBlankProjectionScreen(index = 0) {
  return {
    id: uid("screen"),
    name: index === 0 ? "Projection Screen" : `Projection Screen ${index + 1}`,
    unit: "ft",
    aspectId: "16:9",
    width: 16,
    height: 9,
    projectors: [],
    projectorGroups: [],
    activeProjectorId: null,
    activeGroupId: null,
    view: null,
  };
}

/** @returns {ProjectorState} */
export function emptyProjectorState() {
  const screen = createBlankProjectionScreen(0);
  return {
    screens: [screen],
    activeScreenId: screen.id,
    activeSidebarTab: "screen",
  };
}

/**
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {ProjectionScreen}
 */
export function normalizeProjectionScreen(raw, index = 0) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const blank = createBlankProjectionScreen(index);
  return {
    id: typeof r.id === "string" && r.id ? r.id : blank.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : blank.name,
    unit: r.unit === "m" ? "m" : "ft",
    aspectId: typeof r.aspectId === "string" && r.aspectId ? r.aspectId : blank.aspectId,
    width: Number.isFinite(Number(r.width)) ? Number(r.width) : blank.width,
    height: Number.isFinite(Number(r.height)) ? Number(r.height) : blank.height,
    projectors: Array.isArray(r.projectors) ? r.projectors : [],
    projectorGroups: Array.isArray(r.projectorGroups) ? r.projectorGroups : [],
    activeProjectorId: typeof r.activeProjectorId === "string" ? r.activeProjectorId : null,
    activeGroupId: typeof r.activeGroupId === "string" ? r.activeGroupId : null,
    view: r.view && typeof r.view === "object" ? /** @type {object} */ (r.view) : null,
  };
}

/**
 * @param {unknown} data
 * @returns {ProjectorState}
 */
export function normalizeProjectorState(data) {
  if (!data || typeof data !== "object") {
    throw new Error("The file is missing projection screen data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  if (!Array.isArray(raw.screens) || !raw.screens.length) {
    throw new Error("The file is missing projection screen data.");
  }
  const screens = raw.screens.map((screen, index) => normalizeProjectionScreen(screen, index));
  const activeScreenId =
    typeof raw.activeScreenId === "string" && screens.some((s) => s.id === raw.activeScreenId)
      ? raw.activeScreenId
      : screens[0].id;
  /** @type {"screen" | "projectors"} */
  const activeSidebarTab = raw.activeSidebarTab === "projectors" ? "projectors" : "screen";
  return { screens, activeScreenId, activeSidebarTab };
}
