import { createElement } from "./state.js";
import { listLedWalls } from "./led-spec-data.js";
import {
  createCableCardsElement,
  createGroundplanDiagramElement,
  createLedSpecificationElement,
  createLedWiringElement,
  createRasterElement,
  createSignalFlowDiagramElement,
  createSurfaceElement,
} from "./element-factories.js";

export {
  createCableCardsElement,
  createGroundplanDiagramElement,
  createLedSpecificationElement,
  createLedWiringElement,
  createRasterElement,
  createSignalFlowDiagramElement,
  createSurfaceElement,
} from "./element-factories.js";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   group: string,
 *   family?: string,
 *   calculator?: string,
 *   w?: number,
 *   h?: number,
 *   create: () => import("./state.js").PageElement,
 * }} AddableElement
 *
 * @typedef {{
 *   calculator: string,
 *   families: { family: string, items: AddableElement[] }[],
 * }} LibraryCalculatorGroup
 */

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, name: string }[]}
 */
function listRasters(siteExports) {
  const contentMaps = /** @type {{ rasters?: object[] } | null} */ (
    siteExports.contentMaps
  );
  const rasters = Array.isArray(contentMaps?.rasters) ? contentMaps.rasters : [];
  return rasters.map((raster, index) => ({
    id: String(raster?.id ?? `raster-${index}`),
    name: String(raster?.name ?? `Raster ${index + 1}`),
  }));
}

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, name: string }[]}
 */
function listSurfaces(siteExports) {
  const contentMaps = /** @type {{ surfaces?: object[] } | null} */ (
    siteExports.contentMaps
  );
  const surfaces = Array.isArray(contentMaps?.surfaces) ? contentMaps.surfaces : [];
  return surfaces.map((surface, index) => ({
    id: String(surface?.id ?? `surface-${index}`),
    name: String(surface?.name ?? `Surface ${index + 1}`),
  }));
}

/**
 * Linked calculator/media options for elements that bind via content.sourceKey.
 * @param {string} elementType
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, label: string }[]}
 */
export function listLinkedSourceOptions(elementType, siteExports) {
  if (elementType === "ledSpecificationTable" || elementType === "ledWiringDiagram") {
    return listLedWalls(siteExports).map((wall) => ({ id: wall.id, label: wall.name }));
  }
  if (elementType === "rasterDiagram") {
    return listRasters(siteExports).map((raster) => ({ id: raster.id, label: raster.name }));
  }
  if (elementType === "surfaceDiagram") {
    return listSurfaces(siteExports).map((surface) => ({
      id: surface.id,
      label: surface.name,
    }));
  }
  return [];
}

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {boolean}
 */
function hasGroundplan(siteExports) {
  const gp = /** @type {{ imageDataUrl?: string } | null} */ (siteExports.groundplan);
  return Boolean(gp?.imageDataUrl);
}

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {boolean}
 */
function hasSignalFlow(siteExports) {
  const sf = /** @type {{ nodes?: unknown[] } | null} */ (siteExports.signalFlow);
  return Array.isArray(sf?.nodes) && sf.nodes.length > 0;
}

/**
 * @param {Record<string, unknown>} siteExports
 * @param {{ widthIn: number, heightIn: number }} page
 * @returns {AddableElement[]}
 */
export function listAddableElements(siteExports, page) {
  /** @type {AddableElement[]} */
  const items = [
    {
      id: "standard:text",
      label: "Text",
      group: "Standard",
      calculator: "Standard",
      family: "Text",
      w: Math.min(7, page.widthIn - 1.5),
      h: 1,
      create: () =>
        createElement({
          type: "text",
          x: 0.75,
          y: 1.25,
          w: Math.min(7, page.widthIn - 1.5),
          h: 1,
          content: { body: "Text", fontSize: 11 },
        }),
    },
    {
      id: "standard:heading",
      label: "Heading",
      group: "Standard",
      calculator: "Standard",
      family: "Text",
      w: Math.min(12, page.widthIn - 1.5),
      h: 0.75,
      create: () =>
        createElement({
          type: "text",
          x: 0.75,
          y: 0.6,
          w: Math.min(12, page.widthIn - 1.5),
          h: 0.75,
          content: { body: "HEADING", heading: true, fontSize: 16 },
        }),
    },
    {
      id: "standard:notes",
      label: "Notes",
      group: "Standard",
      calculator: "Standard",
      family: "Notes",
      w: Math.min(7, page.widthIn - 1.5),
      h: 3,
      create: () =>
        createElement({
          type: "notes",
          x: 0.75,
          y: 1.5,
          w: Math.min(7, page.widthIn - 1.5),
          h: 3,
          content: { body: "", fontSize: 10 },
        }),
    },
    {
      id: "standard:scope",
      label: "Scope summary",
      group: "Standard",
      calculator: "Standard",
      family: "Notes",
      w: Math.min(8, page.widthIn - 1.5),
      h: 3,
      create: () =>
        createElement({
          type: "scopeSummary",
          x: 0.75,
          y: 1.5,
          w: Math.min(8, page.widthIn - 1.5),
          h: 3,
          content: { fontSize: 10 },
        }),
    },
    {
      id: "standard:details",
      label: "Detail table",
      group: "Standard",
      calculator: "Standard",
      family: "Tables",
      w: Math.min(6, page.widthIn - 1.5),
      h: 4,
      create: () =>
        createElement({
          type: "detailTable",
          x: 0.75,
          y: 1.5,
          w: Math.min(6, page.widthIn - 1.5),
          h: 4,
          content: {
            title: "Details",
            fontSize: 9,
            fields: [{ id: "field1", label: "Field", auto: "" }],
          },
        }),
    },
  ];

  for (const wall of listLedWalls(siteExports)) {
    items.push(
      {
        id: `led-spec:${wall.id}`,
        label: `${wall.name} — Specifications`,
        group: "LED",
        calculator: "LED",
        family: wall.name,
        w: Math.min(5.5, page.widthIn * 0.28),
        h: Math.max(5, page.heightIn - 2.25),
        create: () =>
          createLedSpecificationElement(wall.id, {
            w: Math.min(5.5, page.widthIn * 0.28),
            h: Math.max(5, page.heightIn - 2.25),
          }),
      },
      {
        id: `led-data:${wall.id}`,
        label: `${wall.name} — Cable wiring`,
        group: "LED",
        calculator: "LED",
        family: wall.name,
        w: Math.min(13, page.widthIn - 1.5),
        h: Math.min(10, page.heightIn - 2.25),
        create: () =>
          createLedWiringElement(wall.id, "data", {
            w: Math.min(13, page.widthIn - 1.5),
            h: Math.min(10, page.heightIn - 2.25),
          }),
      },
      {
        id: `led-power:${wall.id}`,
        label: `${wall.name} — Power wiring`,
        group: "LED",
        calculator: "LED",
        family: wall.name,
        w: Math.min(13, page.widthIn - 1.5),
        h: Math.min(10, page.heightIn - 2.25),
        create: () =>
          createLedWiringElement(wall.id, "power", {
            w: Math.min(13, page.widthIn - 1.5),
            h: Math.min(10, page.heightIn - 2.25),
          }),
      }
    );
  }

  for (const surface of listSurfaces(siteExports)) {
    items.push({
      id: `surface:${surface.id}`,
      label: surface.name,
      group: "Surfaces",
      calculator: "Content maps",
      family: "Surfaces",
      w: Math.min(12, page.widthIn - 1.5),
      h: Math.min(8, page.heightIn - 2.25),
      create: () =>
        createSurfaceElement(surface.id, {
          w: Math.min(12, page.widthIn - 1.5),
          h: Math.min(8, page.heightIn - 2.25),
        }),
    });
  }

  for (const raster of listRasters(siteExports)) {
    items.push({
      id: `raster:${raster.id}`,
      label: raster.name,
      group: "Rasters",
      calculator: "Content maps",
      family: "Rasters",
      w: Math.min(12, page.widthIn - 1.5),
      h: Math.min(8, page.heightIn - 2.25),
      create: () =>
        createRasterElement(raster.id, {
          w: Math.min(12, page.widthIn - 1.5),
          h: Math.min(8, page.heightIn - 2.25),
        }),
    });
  }

  if (hasGroundplan(siteExports)) {
    items.push(
      {
        id: "groundplan:diagram",
        label: "Groundplan with routes",
        group: "Cable runs",
        calculator: "Groundplan",
        family: "Floor plan",
        w: Math.min(16, page.widthIn - 1.5),
        h: Math.min(9, page.heightIn - 2.25),
        create: () =>
          createGroundplanDiagramElement({
            w: Math.min(16, page.widthIn - 1.5),
            h: Math.min(9, page.heightIn - 2.25),
          }),
      },
      {
        id: "cable:cards",
        label: "Cable cards",
        group: "Cable runs",
        calculator: "Cable",
        family: "Routes",
        w: Math.min(16, page.widthIn - 1.5),
        h: Math.min(6, page.heightIn - 2.25),
        create: () =>
          createCableCardsElement({
            w: Math.min(16, page.widthIn - 1.5),
            h: Math.min(6, page.heightIn - 2.25),
          }),
      }
    );
  }

  if (hasSignalFlow(siteExports)) {
    const sf = /** @type {{ colorByCableType?: boolean } | null} */ (
      siteExports.signalFlow
    );
    items.push({
      id: "signal-flow:diagram",
      label: "Signal flow diagram",
      group: "Signal flow",
      calculator: "Signal Flow",
      family: "Diagram",
      w: Math.min(16, page.widthIn - 1.5),
      h: Math.min(10, page.heightIn - 2.25),
      create: () =>
        createSignalFlowDiagramElement({
          w: Math.min(16, page.widthIn - 1.5),
          h: Math.min(10, page.heightIn - 2.25),
          content: { colorByCableType: sf?.colorByCableType === true },
        }),
    });
  }

  return items;
}

/**
 * Hierarchical library: calculator → family → items. Empty calculators omitted.
 * @param {Record<string, unknown>} siteExports
 * @param {{ widthIn: number, heightIn: number }} page
 * @returns {LibraryCalculatorGroup[]}
 */
export function listLibraryGroups(siteExports, page) {
  const items = listAddableElements(siteExports, page);
  /** @type {Map<string, Map<string, AddableElement[]>>} */
  const tree = new Map();
  for (const item of items) {
    const calculator = item.calculator || item.group || "Other";
    const family = item.family || "General";
    if (!tree.has(calculator)) tree.set(calculator, new Map());
    const families = tree.get(calculator);
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(item);
  }
  return [...tree.entries()].map(([calculator, families]) => ({
    calculator,
    families: [...families.entries()].map(([family, familyItems]) => ({
      family,
      items: familyItems,
    })),
  }));
}
