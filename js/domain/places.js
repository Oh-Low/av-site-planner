/**
 * Shared venue / place identity for Signal Flow, Groundplan, Cable, and Paperwork.
 * Canonical persistence: root `.AVP` key `places` (not nested under signalFlow).
 */

/**
 * @typedef {{ id: string, name: string }} Place
 */

/** @returns {Place[]} */
export function emptyPlaces() {
  return [];
}

/**
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {Place}
 */
export function normalizePlace(raw, index = 0) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `place-${index + 1}`;
  const name =
    typeof r.name === "string" && r.name.trim() ? r.name.trim() : `Place ${index + 1}`;
  return { id, name };
}

/**
 * @param {unknown} raw
 * @returns {Place[]}
 */
export function normalizePlaces(raw) {
  if (raw == null) return emptyPlaces();
  if (!Array.isArray(raw)) {
    throw new Error("The file has invalid places data.");
  }
  /** @type {Map<string, Place>} */
  const byId = new Map();
  raw.forEach((item, index) => {
    const place = normalizePlace(item, index);
    byId.set(place.id, place);
  });
  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/**
 * Lift places from a parsed site plan: prefer root `places`, else legacy `signalFlow.places`.
 * @param {unknown} parsed
 * @returns {Place[]}
 */
export function liftPlacesFromSitePlan(parsed) {
  if (!parsed || typeof parsed !== "object") return emptyPlaces();
  const plan = /** @type {Record<string, unknown>} */ (parsed);
  if (Object.prototype.hasOwnProperty.call(plan, "places")) {
    return normalizePlaces(plan.places);
  }
  const sf = plan.signalFlow;
  if (sf && typeof sf === "object") {
    const nested = /** @type {Record<string, unknown>} */ (sf).places;
    if (Array.isArray(nested)) return normalizePlaces(nested);
  }
  return emptyPlaces();
}

/**
 * Remove deprecated nested places from a signalFlow section object.
 * @param {unknown} signalFlow
 * @returns {unknown}
 */
export function stripPlacesFromSignalFlow(signalFlow) {
  if (!signalFlow || typeof signalFlow !== "object") return signalFlow;
  const { places: _removed, ...rest } = /** @type {Record<string, unknown>} */ (signalFlow);
  return rest;
}

/**
 * Resolve places from a live siteExports bag (root first, then signalFlow for peeks).
 * @param {Record<string, unknown> | null | undefined} siteExports
 * @returns {Place[]}
 */
export function placesFromSiteExports(siteExports) {
  if (!siteExports || typeof siteExports !== "object") return emptyPlaces();
  if (Object.prototype.hasOwnProperty.call(siteExports, "places")) {
    try {
      return normalizePlaces(siteExports.places);
    } catch {
      return emptyPlaces();
    }
  }
  const sf = siteExports.signalFlow;
  if (sf && typeof sf === "object") {
    const nested = /** @type {Record<string, unknown>} */ (sf).places;
    if (Array.isArray(nested)) {
      try {
        return normalizePlaces(nested);
      } catch {
        return emptyPlaces();
      }
    }
  }
  return emptyPlaces();
}
