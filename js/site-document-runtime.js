/**
 * App-level SiteDocument singleton — synced on import/export.
 * Calculators remain live editors; this store is the peek/subscribe seam.
 */

import { createSiteDocument } from "./domain/site-document.js";
import { buildSiteState } from "./site-state.js";

/** @type {ReturnType<typeof createSiteDocument>} */
const siteDocument = createSiteDocument();

/** @returns {ReturnType<typeof createSiteDocument>} */
export function getSiteDocument() {
  return siteDocument;
}

/**
 * Replace the store from a parsed/validated plan (after import or default load).
 * @param {Record<string, unknown>} plan
 */
export function syncSiteDocumentFromPlan(plan) {
  siteDocument.load(plan);
}

/**
 * Rebuild the store from live calculator instances (after export / explicit sync).
 * @param {Record<string, { exportState?: () => object, flushFormToState?: () => void } | null>} instances
 * @param {string} [activeTab]
 * @returns {Record<string, unknown>}
 */
export function syncSiteDocumentFromCalculators(instances, activeTab) {
  const plan = buildSiteState(instances, activeTab);
  siteDocument.load(plan);
  return plan;
}
