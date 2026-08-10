/**
 * Domain kernels for the Phase 1 strangler rebuild.
 * Pure modules — no DOM.
 */

export {
  emptyPlaces,
  liftPlacesFromSitePlan,
  normalizePlace,
  normalizePlaces,
  placesFromSiteExports,
  stripPlacesFromSignalFlow,
} from "./places.js";

export {
  collectBoundaries,
  computeLaborCost,
  computeLaborCostFromTimes,
  defaultLaborEvents,
  emptyLaborState,
  formatClock,
  formatHours,
  formatMoney,
  formatTimeDisplay,
  formatTimeValue,
  isNightWindow,
  multiplierFromEarned,
  normalizeLaborEvents,
  normalizeLaborState,
  parseTimeOfDay,
  payTierAt,
  resolveCallRange,
  snapMinutes,
} from "./labor.js";

export {
  buildPlaceCards,
  buildRouteCards,
  collapseRowsByDevicePair,
  emptyCableState,
  formatCablePath,
  groupRowsByCableType,
  inferCableType,
  inferInputPortLabel,
  manualCablesToRows,
  matchRouteConnections,
  normalizeCableAmount,
  normalizeCableState,
  pruneManualCables,
} from "./cable.js";

export {
  emptyGroundplanScale,
  emptyGroundplanState,
  groundplanPluginMeta,
  validateGroundplanState,
} from "./groundplan.js";

export {
  SIGNAL_FLOW_GRID_DEFAULT_SIZE,
  SIGNAL_FLOW_GRID_MAX_SIZE,
  SIGNAL_FLOW_GRID_MIN_SIZE,
  emptySignalFlowState,
  normalizeNodeLayout,
  normalizeSignalFlowGrid,
  normalizeSignalFlowState,
} from "./signal-flow.js";

export {
  emptyContentMapsState,
  normalizeContentMapsState,
} from "./content-maps.js";

export {
  emptyLedState,
  normalizeLedGrid,
  normalizeLedState,
} from "./led.js";

export {
  createBlankProjectionScreen,
  emptyProjectorState,
  normalizeProjectionScreen,
  normalizeProjectorState,
} from "./projector.js";

export {
  emptyPaperworkState,
  normalizePaperworkState,
} from "./paperwork.js";

export { createSiteDocument } from "./site-document.js";
