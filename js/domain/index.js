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
  compareCableTypes,
  emptyCableState,
  formatCablePath,
  groupRowsByCableType,
  inferCableType,
  inferInputPortLabel,
  manualCablesToRows,
  matchRouteConnections,
  normalizeCableAmount,
  normalizeCableLength,
  normalizeCableState,
  pruneManualCables,
  STANDARD_CABLE_LENGTHS,
} from "./cable.js";

export {
  addGearListHeader,
  addManualGearListItem,
  autoCablePlanFromCableCards,
  autoCablesFromCableCards,
  autoGearFromSignalFlow,
  autoLedWallSectionsFromLed,
  classifyLedLineJumpers,
  condenseGearListItems,
  emptyGearListState,
  filterGearListRowsByLocation,
  flattenManualCables,
  GEAR_LIST_FILTER_UNASSIGNED,
  gearListFilterOptions,
  gearListRowsForDisplay,
  gearListSourceKeyLinksToSignalFlow,
  ledTileTypeLabel,
  ledWallNeighborJumperCount,
  ledWallTileGridSize,
  nodeIdsForGearListSourceKey,
  summarizeLedMapJumpers,
  updateGearListSettings,
  moveGearListRow,
  normalizeGearListState,
  removeGearListRow,
  reorderGearListRow,
  syncGearListRows,
  updateGearListRow,
} from "./gear-list.js";

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
  buildLedWallGear,
  LED_WALLS_FOLDER,
  LED_WALLS_FOLDER_ID,
  ledWallIdFromTypeId,
  listLedWallLibraryGear,
  resolveLedPowerConnectorType,
} from "./led-signal-flow.js";

export {
  allPowerInputsConnected,
  gearForPowerMode,
  gearForSignalMode,
  gearHasSignalPorts,
  isPowerDomainGear,
  isPowerDomainNode,
  listPowerInputRows,
  migrateLegacyPowerInletConnections,
  needsSyntheticPowerIn,
  nodeWorldPosition,
  seedPowerPositionFromSignal,
  setNodeWorldPosition,
} from "./signal-flow-power.js";

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

export {
  RIGGING_CATALOG,
  attachRolesCompatible,
  attachWorldPosition,
  catalogCategories,
  computeLoads,
  connectedPartIds,
  emptyRiggingState,
  freeAttachPoints,
  getCatalogEntry,
  mergePartProps,
  normalizeRiggingState,
  parseShackleTypeId,
  poseForMate,
  resolveAttachPoints,
  resolvePartProps,
  resolvePartSize,
  riggingPluginMeta,
  SHACKLE_STYLES,
} from "./rigging.js";


export { createSiteDocument } from "./site-document.js";

export {
  SHOW_DOCUMENT_VERSION,
  emptyShowDocument,
  normalizeShowDocument,
  wrapV2PlanAsShowDocument,
  documentForSingleShowExport,
  findActiveShow,
  findActiveRoom,
  reconcileActiveIds,
  setActiveRoom,
  writeActiveRoomPlan,
  writeActiveShowPaperwork,
  readActiveShowPaperwork,
  addShowWithEmptyRoom,
  removeShow,
  duplicateShow,
  renameShow,
  addRoom,
  removeRoom,
  duplicateRoom,
  renameRoom,
  reorderRoom,
  reorderTemplate,
  saveRoomAsTemplate,
  addTemplateToShow,
  removeTemplate,
  duplicateTemplate,
  renameTemplate,
} from "./show-document.js";
