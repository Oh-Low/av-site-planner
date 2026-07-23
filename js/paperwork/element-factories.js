import { createElement } from "./state.js";

/**
 * @param {string} sourceKey
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createLedSpecificationElement(sourceKey, frame = {}) {
  return createElement({
    type: "ledSpecificationTable",
    x: 0.75,
    y: 1.25,
    w: 5.5,
    h: 12,
    content: { sourceKey, fontSize: 9 },
    ...frame,
  });
}

/**
 * @param {string} sourceKey
 * @param {"data" | "power"} mode
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createLedWiringElement(sourceKey, mode, frame = {}) {
  return createElement({
    type: "ledWiringDiagram",
    x: 6.6,
    y: 1.25,
    w: 12,
    h: 9,
    content: { sourceKey, mode, fontSize: 10 },
    ...frame,
  });
}

/**
 * @param {string} sourceKey
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createRasterElement(sourceKey, frame = {}) {
  return createElement({
    type: "rasterDiagram",
    x: 0.75,
    y: 1.25,
    w: 12,
    h: 8,
    content: { sourceKey, fontSize: 10 },
    ...frame,
  });
}

/**
 * @param {string} sourceKey
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createSurfaceElement(sourceKey, frame = {}) {
  return createElement({
    type: "surfaceDiagram",
    x: 0.75,
    y: 1.25,
    w: 12,
    h: 8,
    content: {
      sourceKey,
      dimensionUnit: "px",
      showAnchors: false,
      fontSize: 10,
    },
    ...frame,
  });
}

/**
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createGroundplanDiagramElement(frame = {}) {
  return createElement({
    type: "groundplanDiagram",
    x: 0.75,
    y: 1.25,
    w: 16,
    h: 9,
    content: { fontSize: 10 },
    ...frame,
  });
}

/**
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createSignalFlowDiagramElement(frame = {}) {
  const { content: frameContent, ...rest } = frame;
  return createElement({
    type: "signalFlowDiagram",
    x: 0.75,
    y: 1.25,
    w: 16,
    h: 9,
    ...rest,
    content: {
      colorByCableType: false,
      fontSize: 10,
      ...(frameContent && typeof frameContent === "object" ? frameContent : {}),
    },
  });
}

/**
 * @param {Partial<import("./state.js").PageElement>} [frame]
 */
export function createCableCardsElement(frame = {}) {
  return createElement({
    type: "cableCards",
    x: 0.75,
    y: 10.5,
    w: 16,
    h: 5,
    content: { cardScale: 1 },
    ...frame,
  });
}
