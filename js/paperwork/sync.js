import { uid } from "../shared/id.js";
import { createElement, normalizeSheet } from "./state.js";
import { getSheetType, listSheetTypes } from "./sheet-registry.js";
import { resolvePaper } from "./paper-sizes.js";

/**
 * Pull live calculator exports and rebuild sheet instances while preserving
 * overrides, notes, include flags, order, and custom element layouts for
 * seeds that still exist.
 *
 * @param {import("./state.js").PaperworkState} state
 * @param {Record<string, unknown>} siteExports
 * @param {{ mode?: "merge" | "add-missing" | "replace" }} [options]
 */
export function syncSheetsFromSources(state, siteExports, options = {}) {
  const mode = options.mode ?? "merge";
  const page = resolvePaper(state.paper.size, state.paper.orientation);
  const manualSheets = state.sheets
    .filter((sheet) => sheet.manual === true || sheet.typeId === "custom-plate")
    .sort((a, b) => a.order - b.order);
  /** @type {Map<string, import("./state.js").SheetInstance>} */
  const existing = new Map(
    state.sheets
      .filter((sheet) => sheet.manual !== true && sheet.typeId !== "custom-plate")
      .map((s) => [`${s.typeId}::${s.sourceKey ?? ""}`, s])
  );

  /** @type {import("./state.js").SheetInstance[]} */
  const next = [];
  let order = 0;

  for (const type of listSheetTypes()) {
    const seeds = type.expand(siteExports);
    for (const seed of seeds) {
      const key = `${seed.typeId}::${seed.sourceKey ?? ""}`;
      const prev = existing.get(key);
      if (prev) {
        migrateSourceElements(prev);
        if (mode === "replace") {
          const elements = type.defaultElements(seed, siteExports, page, state.identity);
          stampIdentityIntoElements(elements, state.identity);
          next.push({
            ...prev,
            title: prev.title || seed.title,
            order: order++,
            elements,
          });
        } else {
          // merge + add-missing: keep existing layout
          next.push({
            ...prev,
            title: prev.title || seed.title,
            order: order++,
          });
        }
        existing.delete(key);
      } else if (mode === "merge" || mode === "add-missing" || mode === "replace") {
        const elements = type.defaultElements(seed, siteExports, page, state.identity);
        stampIdentityIntoElements(elements, state.identity);
        next.push(
          normalizeSheet(
            {
              id: uid("sheet"),
              typeId: seed.typeId,
              sourceKey: seed.sourceKey,
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

  state.sheets = next;
  if (!state.sheets.some((s) => s.id === state.activeSheetId)) {
    state.activeSheetId = state.sheets[0]?.id ?? null;
  }
  state.selectedElementId = null;
  state.selectedDecorationId = null;
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
