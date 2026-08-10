/**
 * Thin site-plan document store.
 *
 * Holds a normalized .AVP snapshot for peeks/subscribers without touching calculator
 * DOM or flushFormToState. Calculators remain the live editors; the store is the
 * rebuild seam for a future single source of truth.
 */

import { deepClone } from "../shared/clone.js";
import { emptyPlaces, normalizePlaces } from "./places.js";

/**
 * @typedef {Record<string, unknown>} SitePlan
 * @typedef {{ type: "load" } | { type: "section"; key: string } | { type: "places" }} SiteDocumentChange
 * @typedef {(change: SiteDocumentChange) => void} SiteDocumentListener
 */

/**
 * @param {SitePlan | null} [initial]
 */
export function createSiteDocument(initial = null) {
  /** @type {SitePlan | null} */
  let state = initial ? deepClone(initial) : null;
  /** @type {Set<SiteDocumentListener>} */
  const listeners = new Set();

  /** @param {SiteDocumentChange} change */
  function notify(change) {
    for (const listener of listeners) {
      listener(change);
    }
  }

  return {
    /** @returns {boolean} */
    hasDocument() {
      return state != null;
    },

    /** Full document clone, or null if empty. */
    getSnapshot() {
      return state ? deepClone(state) : null;
    },

    /**
     * Peek one top-level key without UI flush.
     * @param {string} key
     * @returns {unknown}
     */
    peek(key) {
      if (!state || state[key] === undefined) return null;
      return deepClone(state[key]);
    },

    /** @returns {import("./places.js").Place[]} */
    getPlaces() {
      try {
        return normalizePlaces(state?.places ?? emptyPlaces());
      } catch {
        return emptyPlaces();
      }
    },

    /**
     * Replace the whole document (e.g. after parseSiteState).
     * @param {SitePlan} next
     */
    load(next) {
      if (!next || typeof next !== "object") {
        throw new Error("Site document load requires a plan object.");
      }
      state = deepClone(next);
      notify({ type: "load" });
    },

    /**
     * Patch one section (led, cable, places, …).
     * @param {string} key
     * @param {unknown} value
     */
    setSection(key, value) {
      if (!key || typeof key !== "string") {
        throw new Error("Section key is required.");
      }
      if (!state) {
        state = {
          formatVersion: 2,
          app: "av-site-planner",
          exportedAt: new Date().toISOString(),
          activeTab: "led-calculator",
          places: emptyPlaces(),
        };
      }
      state = {
        ...state,
        [key]: deepClone(value),
        exportedAt: new Date().toISOString(),
      };
      notify(key === "places" ? { type: "places" } : { type: "section", key });
    },

    /**
     * @param {unknown} places
     */
    setPlaces(places) {
      this.setSection("places", normalizePlaces(places));
    },

    /** Clear the document. */
    clear() {
      state = null;
      notify({ type: "load" });
    },

    /**
     * @param {SiteDocumentListener} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * @typedef {ReturnType<typeof createSiteDocument>} SiteDocument
 */
