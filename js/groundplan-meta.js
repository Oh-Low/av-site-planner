/** @returns {{ pointA: null, pointB: null, unit: "metric", distanceMeters: null }} */
export function emptyGroundplanScale() {
  return { pointA: null, pointB: null, unit: "metric", distanceMeters: null };
}

/** @returns {object} */
export function emptyGroundplanState() {
  return {
    imageDataUrl: null,
    imageWidth: 0,
    imageHeight: 0,
    scale: emptyGroundplanScale(),
    placeMarkers: [],
    cableRoutes: [],
    rulerLines: [],
    showScaleInViewport: true,
  };
}

/** @param {unknown} data */
export function validateGroundplanState(data) {
  if (data == null) {
    return emptyGroundplanState();
  }
  if (typeof data !== "object") {
    throw new Error("The file is missing valid groundplan data.");
  }
  return {
    imageDataUrl: typeof data.imageDataUrl === "string" ? data.imageDataUrl : null,
    imageWidth: Number(data.imageWidth) || 0,
    imageHeight: Number(data.imageHeight) || 0,
    scale:
      data.scale && typeof data.scale === "object"
        ? {
            pointA: data.scale.pointA ?? null,
            pointB: data.scale.pointB ?? null,
            unit: data.scale.unit === "imperial" ? "imperial" : "metric",
            distanceMeters:
              typeof data.scale.distanceMeters === "number" ? data.scale.distanceMeters : null,
          }
        : emptyGroundplanScale(),
    placeMarkers: Array.isArray(data.placeMarkers) ? data.placeMarkers : [],
    cableRoutes: Array.isArray(data.cableRoutes) ? data.cableRoutes : [],
    rulerLines: Array.isArray(data.rulerLines) ? data.rulerLines : [],
    showScaleInViewport: data.showScaleInViewport !== false,
  };
}

export const groundplanPluginMeta = {
  id: "groundplan",
  tabPanelId: "groundplan",
  stateKey: "groundplan",
  label: "Groundplan",
  requiredForSave: false,
  emptyState: emptyGroundplanState,
  validateState: validateGroundplanState,
};
