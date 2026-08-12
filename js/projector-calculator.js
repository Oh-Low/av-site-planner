import {
  ASPECT_RATIOS,
  DEFAULT_PROJECTOR_RESOLUTION_ID,
  PREBUILT_PROJECTORS,
  PROJECTOR_COLORS,
  PROJECTOR_ROLES,
  defaultProjectorAspectForPreset,
  getProjectorManufacturers,
  getProjectorModelsForManufacturer,
  inferProjectorAspectId,
  projectorResolutionOptions,
} from "./projector-data.js";
import {
  clamp,
  convertLinearDistance,
  getRecalcFields,
  imageWidthFromDistanceAndRatio,
  interpolateThrowRatio,
  isThrowFieldComputed,
  suggestLens,
  throwDistanceFromImageWidthAndRatio,
  throwInRangeFromSpecs,
} from "./projector-math.js";
import {
  createBlankProjectionScreen,
  normalizeProjectorState,
} from "./domain/projector.js";
import { queryCalcShell, bindSidebarTabs } from "./shared/calc-shell.js";
import { deepClone } from "./shared/clone.js";
import { escapeXml } from "./shared/dom.js";
import { createListNameEditor } from "./shared/inline-editor.js";
import { createSvgViewBoxPanZoom } from "./shared/pan-zoom.js";
import { uid } from "./shared/id.js";
import { recordBefore } from "./undo-runtime.js";

export {
  createBlankProjectionScreen,
  emptyProjectorState,
  normalizeProjectionScreen,
  normalizeProjectorState,
} from "./domain/projector.js";

/** @typedef {{ id: string, name: string, throwMin: number, throwMax: number }} ThrowRange */

/** @typedef {{ id: string, name: string, role: string, blendOverlap: number, tileCols: number, tileRows: number, layoutMode: "fit" | "overlap", overlapPxH: number, overlapPxV: number }} ProjectorGroup */

/** @typedef {"throw" | "image" | "zoom"} ThrowLockField */
/** @typedef {{ id: string, name: string, source: "prebuilt" | "custom", presetId: string, lensId: string, projectorAspectId: "16:9" | "16:10", resolutionId: "hd" | "uhd", customThrowMin: number, customThrowMax: number, customLumens: number, customResW: number, customResH: number, role: string, groupId: string | null, offsetX: number, offsetY: number, blendOverlap: number, layoutMode: "fit" | "overlap", overlapPxH: number, overlapPxV: number, orientation: "landscape" | "portrait", tileCol: number, tileRow: number, tileCols: number, tileRows: number, throwDistance: number, throwRatio: number, lensZoom: number, throwLocks: ThrowLockField[] }} ScreenProjector */

/** @typedef {{ id: string, name: string, unit: "ft" | "m", aspectId: string, width: number, height: number, projectors: ScreenProjector[], projectorGroups: ProjectorGroup[], activeProjectorId: string | null, activeGroupId: string | null, view: { panX: number, panY: number, zoom: number, contentW: number, contentH: number } | null }} ProjectionScreen */

const CUSTOM_MAKE = "Custom";
const DEFAULT_THROW_DISTANCE = 30;
const DEFAULT_IMAGE_WIDTH = 16;

function defaultLayoutSettings() {
  return { layoutMode: /** @type {"fit"} */ ("fit"), overlapPxH: 0, overlapPxV: 0 };
}

function defaultScreenName(count) {
  return count === 0 ? "Projection Screen" : `Projection Screen ${count + 1}`;
}

function defaultProjectorName(count) {
  return count === 0 ? "Projector" : `Projector ${count + 1}`;
}

function defaultGroupName(screen) {
  return `Group ${screen.projectorGroups.length + 1}`;
}

/** @param {ProjectionScreen} screen @param {string} groupId */
function getProjectorGroup(screen, groupId) {
  return screen.projectorGroups.find((g) => g.id === groupId) ?? null;
}

/** @param {ProjectionScreen} screen @param {string} groupId */
function getGroupMembers(screen, groupId) {
  return screen.projectors.filter((p) => p.groupId === groupId);
}

/** @param {ProjectionScreen} screen */
function getUngroupedProjectors(screen) {
  return screen.projectors.filter((p) => !p.groupId);
}

/** @param {ProjectionScreen} screen @param {ScreenProjector} projector */
function getRoleGroup(screen, projector) {
  if (projector.groupId) {
    const members = getGroupMembers(screen, projector.groupId);
    if (projector.role === "blend" || projector.role === "tile") {
      return members.length > 0 ? members : [projector];
    }
    return [projector];
  }
  if (projector.role === "blend") {
    return screen.projectors.filter((p) => p.role === "blend" && !p.groupId);
  }
  return [projector];
}

/** @param {ProjectorGroup} group @param {ScreenProjector} projector @param {number} [memberIndex] */
function applyGroupSettingsToProjector(group, projector, memberIndex = 0) {
  projector.groupId = group.id;
  projector.role = group.role;
  projector.blendOverlap = group.blendOverlap;
  projector.tileCols = group.tileCols;
  projector.tileRows = group.tileRows;
  projector.layoutMode = group.layoutMode ?? "fit";
  projector.overlapPxH = group.overlapPxH ?? 0;
  projector.overlapPxV = group.overlapPxV ?? 0;
  if (group.role === "tile" || group.role === "blend") {
    const cols = Math.max(1, group.tileCols);
    projector.tileCol = memberIndex % cols;
    projector.tileRow = Math.floor(memberIndex / cols);
  }
}

/** @param {ScreenProjector} source @param {ScreenProjector} target */
function copySharedProjectorSettings(source, target) {
  target.source = source.source;
  target.presetId = source.presetId;
  target.lensId = source.lensId;
  target.customThrowMin = source.customThrowMin;
  target.customThrowMax = source.customThrowMax;
  target.customLumens = source.customLumens;
  target.customResW = source.customResW;
  target.customResH = source.customResH;
  target.projectorAspectId = source.projectorAspectId ?? inferProjectorAspectId(source.customResW, source.customResH);
  target.resolutionId = source.resolutionId ?? DEFAULT_PROJECTOR_RESOLUTION_ID;
  target.role = source.role;
  target.blendOverlap = source.blendOverlap;
  target.layoutMode = source.layoutMode ?? "fit";
  target.overlapPxH = source.overlapPxH ?? 0;
  target.overlapPxV = source.overlapPxV ?? 0;
  target.orientation = source.orientation ?? "landscape";
  target.tileCols = source.tileCols;
  target.tileRows = source.tileRows;
  target.throwDistance = source.throwDistance;
  target.throwRatio = source.throwRatio;
  target.lensZoom = source.lensZoom;
  target.throwLocks = source.throwLocks?.length ? [...source.throwLocks] : ["throw"];
}

/** @param {ProjectionScreen} screen */
function getRenderedProjectorOrder(screen) {
  const ids = [];
  for (const projector of getUngroupedProjectors(screen)) {
    ids.push(projector.id);
  }
  for (const group of screen.projectorGroups) {
    for (const projector of getGroupMembers(screen, group.id)) {
      ids.push(projector.id);
    }
  }
  return ids;
}

/** @param {ProjectionScreen} screen */
function normalizeProjectorOrder(screen) {
  const ordered = [];
  for (const projector of getUngroupedProjectors(screen)) {
    ordered.push(projector);
  }
  for (const group of screen.projectorGroups) {
    for (const projector of getGroupMembers(screen, group.id)) {
      ordered.push(projector);
    }
  }
  const seen = new Set(ordered.map((projector) => projector.id));
  for (const projector of screen.projectors) {
    if (!seen.has(projector.id)) ordered.push(projector);
  }
  screen.projectors = ordered;
}

/** @param {ProjectionScreen} screen @param {string} groupId */
function reindexGroupGridMembers(screen, groupId) {
  const group = getProjectorGroup(screen, groupId);
  if (!group || (group.role !== "tile" && group.role !== "blend")) return;
  getGroupMembers(screen, groupId).forEach((projector, index) => {
    applyGroupSettingsToProjector(group, projector, index);
  });
}

/** @param {ProjectionScreen} screen @param {ProjectorGroup} group */
function syncGroupGridMembers(screen, group) {
  if (group.role !== "blend" && group.role !== "tile") return;
  const needed = Math.max(1, group.tileCols) * Math.max(1, group.tileRows);
  let members = getGroupMembers(screen, group.id);

  while (members.length < needed) {
    const index = screen.projectors.length;
    const projector = members[0] ? projectorFromTemplate(members[0], index) : newProjector(index);
    applyGroupSettingsToProjector(group, projector, members.length);
    screen.projectors.push(projector);
    members = getGroupMembers(screen, group.id);
  }
  while (members.length > needed) {
    const last = members[members.length - 1];
    screen.projectors = screen.projectors.filter((p) => p.id !== last.id);
    members = getGroupMembers(screen, group.id);
  }
  reindexGroupGridMembers(screen, group.id);
  normalizeProjectorOrder(screen);
}

/** @param {ProjectionScreen} screen @param {ScreenProjector} projector */
function ensureGridGroup(screen, projector) {
  if (!projector || (projector.role !== "blend" && projector.role !== "tile")) return;

  let group = projector.groupId ? getProjectorGroup(screen, projector.groupId) : null;
  if (!group) {
    group = newProjectorGroup(screen);
    screen.projectorGroups.push(group);
    screen.activeGroupId = group.id;
  }

  group.role = projector.role;
  group.tileCols = Math.max(1, Number(projector.tileCols) || 1);
  group.tileRows = Math.max(1, Number(projector.tileRows) || 1);
  group.layoutMode = projector.layoutMode ?? "fit";
  group.overlapPxH = projector.overlapPxH ?? 0;
  group.overlapPxV = projector.overlapPxV ?? 0;

  if (!projector.groupId) {
    projector.groupId = group.id;
  }

  syncGroupGridMembers(screen, group);
}

/**
 * @param {ProjectionScreen} screen
 * @param {ScreenProjector} projector
 * @param {string} groupId
 * @param {number} memberIndex
 */
function assignProjectorToGroup(screen, projector, groupId, memberIndex) {
  const group = getProjectorGroup(screen, groupId);
  if (!group) return;
  const existing = getGroupMembers(screen, groupId).filter((member) => member.id !== projector.id);
  if (existing[0]) copySharedProjectorSettings(existing[0], projector);
  applyGroupSettingsToProjector(group, projector, memberIndex);
}

/**
 * @param {ProjectionScreen} screen
 * @param {string} draggedProjectorId
 * @param {string | null} beforeProjectorId
 * @param {string | null | undefined} targetGroupId
 */
function moveProjectorRelative(screen, draggedProjectorId, beforeProjectorId, targetGroupId) {
  const projector = screen.projectors.find((entry) => entry.id === draggedProjectorId);
  if (!projector) return;

  const oldGroupId = projector.groupId;

  if (targetGroupId === null) {
    projector.groupId = null;
  } else if (typeof targetGroupId === "string") {
    const members = getGroupMembers(screen, targetGroupId).filter((member) => member.id !== draggedProjectorId);
    let memberIndex = members.length;
    if (beforeProjectorId) {
      const index = members.findIndex((member) => member.id === beforeProjectorId);
      if (index >= 0) memberIndex = index;
    }
    assignProjectorToGroup(screen, projector, targetGroupId, memberIndex);
  }

  const list = screen.projectors.filter((entry) => entry.id !== draggedProjectorId);
  let insertIdx = list.length;

  if (beforeProjectorId) {
    const index = list.findIndex((entry) => entry.id === beforeProjectorId);
    insertIdx = index >= 0 ? index : list.length;
  } else if (typeof targetGroupId === "string") {
    const members = getGroupMembers(screen, targetGroupId).filter((member) => member.id !== draggedProjectorId);
    if (members.length) {
      const lastMember = members[members.length - 1];
      const index = list.findIndex((entry) => entry.id === lastMember.id);
      insertIdx = index >= 0 ? index + 1 : list.length;
    } else {
      const groupIndex = screen.projectorGroups.findIndex((group) => group.id === targetGroupId);
      for (let i = groupIndex + 1; i < screen.projectorGroups.length; i += 1) {
        const nextGroupMembers = getGroupMembers(screen, screen.projectorGroups[i].id);
        if (nextGroupMembers[0]) {
          insertIdx = list.findIndex((entry) => entry.id === nextGroupMembers[0].id);
          break;
        }
      }
    }
  } else if (targetGroupId === null) {
    const ungrouped = list.filter((entry) => !entry.groupId);
    if (ungrouped.length) {
      const lastUngrouped = ungrouped[ungrouped.length - 1];
      insertIdx = list.findIndex((entry) => entry.id === lastUngrouped.id) + 1;
    } else {
      insertIdx = 0;
    }
  }

  list.splice(insertIdx, 0, projector);
  screen.projectors = list;
  normalizeProjectorOrder(screen);

  if (oldGroupId && oldGroupId !== projector.groupId) {
    reindexGroupGridMembers(screen, oldGroupId);
  }
  if (projector.groupId) {
    reindexGroupGridMembers(screen, projector.groupId);
  }
}

/** @param {ProjectionScreen} screen @param {string} draggedGroupId @param {string | null} beforeGroupId */
function moveGroupRelative(screen, draggedGroupId, beforeGroupId) {
  const fromIndex = screen.projectorGroups.findIndex((group) => group.id === draggedGroupId);
  if (fromIndex < 0) return;
  const [group] = screen.projectorGroups.splice(fromIndex, 1);
  let toIndex = screen.projectorGroups.length;
  if (beforeGroupId) {
    const index = screen.projectorGroups.findIndex((entry) => entry.id === beforeGroupId);
    if (index >= 0) toIndex = index;
  }
  screen.projectorGroups.splice(toIndex, 0, group);
  normalizeProjectorOrder(screen);
}

function newProjectorGroup(screen) {
  const layout = defaultLayoutSettings();
  return {
    id: uid("pgroup"),
    name: defaultGroupName(screen),
    role: "blend",
    blendOverlap: 20,
    tileCols: 2,
    tileRows: 1,
    layoutMode: layout.layoutMode,
    overlapPxH: layout.overlapPxH,
    overlapPxV: layout.overlapPxV,
  };
}

function isCustomAspect(screen) {
  return screen.aspectId === "custom";
}

function getAspect(screen) {
  if (isCustomAspect(screen)) {
    const w = screen.width > 0 ? screen.width : 16;
    const h = screen.height > 0 ? screen.height : 9;
    return { w, h };
  }
  const preset = ASPECT_RATIOS.find((a) => a.id === screen.aspectId) ?? ASPECT_RATIOS[0];
  return { w: preset.w, h: preset.h };
}

function linkFromWidth(screen) {
  if (isCustomAspect(screen)) return;
  const { w, h } = getAspect(screen);
  screen.height = screen.width * (h / w);
}

function linkFromHeight(screen) {
  if (isCustomAspect(screen)) return;
  const { w, h } = getAspect(screen);
  screen.width = screen.height * (w / h);
}

function formatDim(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "";
}

function readDimInput(el) {
  if (!el) return null;
  const raw = el.value.trim();
  if (raw === "" || raw === "-" || raw === ".") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function unitLabel(unit) {
  return unit === "m" ? "m" : "ft";
}

/** @param {ProjectionScreen} screen @param {"ft" | "m"} toUnit */
function convertScreenToUnit(screen, toUnit) {
  const fromUnit = screen.unit;
  if (fromUnit === toUnit) return;
  screen.width = convertLinearDistance(screen.width, fromUnit, toUnit);
  screen.height = convertLinearDistance(screen.height, fromUnit, toUnit);
  for (const projector of screen.projectors) {
    projector.throwDistance = convertLinearDistance(projector.throwDistance, fromUnit, toUnit);
    projector.offsetX = convertLinearDistance(projector.offsetX, fromUnit, toUnit);
    projector.offsetY = convertLinearDistance(projector.offsetY, fromUnit, toUnit);
  }
  screen.unit = toUnit;
}

function newProjector(index = 0) {
  const preset = PREBUILT_PROJECTORS[0];
  const lens = preset.lenses[0];
  const layout = defaultLayoutSettings();
  return {
    id: uid("proj"),
    name: defaultProjectorName(index),
    source: "prebuilt",
    presetId: preset.id,
    lensId: lens.id,
    projectorAspectId: defaultProjectorAspectForPreset(preset),
    resolutionId: DEFAULT_PROJECTOR_RESOLUTION_ID,
    customThrowMin: 1.2,
    customThrowMax: 1.8,
    customLumens: 10000,
    customResW: 1920,
    customResH: 1080,
    role: "single",
    groupId: null,
    offsetX: 0,
    offsetY: 0,
    blendOverlap: 20,
    layoutMode: layout.layoutMode,
    overlapPxH: layout.overlapPxH,
    overlapPxV: layout.overlapPxV,
    orientation: "landscape",
    tileCol: 0,
    tileRow: 0,
    tileCols: 2,
    tileRows: 1,
    throwDistance: DEFAULT_THROW_DISTANCE,
    throwRatio: DEFAULT_THROW_DISTANCE / DEFAULT_IMAGE_WIDTH,
    lensZoom: 0.5,
    throwLocks: ["throw"],
  };
}

/** @param {ScreenProjector} template */
function projectorFromTemplate(template, index) {
  return {
    id: uid("proj"),
    name: defaultProjectorName(index),
    source: template.source,
    presetId: template.presetId,
    lensId: template.lensId,
    projectorAspectId:
      template.projectorAspectId ??
      (template.source === "custom"
        ? inferProjectorAspectId(template.customResW, template.customResH)
        : defaultProjectorAspectForPreset(getPreset(template))),
    resolutionId: template.resolutionId ?? DEFAULT_PROJECTOR_RESOLUTION_ID,
    customThrowMin: template.customThrowMin,
    customThrowMax: template.customThrowMax,
    customLumens: template.customLumens,
    customResW: template.customResW,
    customResH: template.customResH,
    role: template.role,
    groupId: template.groupId,
    offsetX: template.offsetX,
    offsetY: template.offsetY,
    blendOverlap: template.blendOverlap,
    layoutMode: template.layoutMode ?? "fit",
    overlapPxH: template.overlapPxH ?? 0,
    overlapPxV: template.overlapPxV ?? 0,
    orientation: template.orientation ?? "landscape",
    tileCol: template.tileCol,
    tileRow: template.tileRow,
    tileCols: template.tileCols,
    tileRows: template.tileRows,
    throwDistance: template.throwDistance,
    throwRatio: template.throwRatio > 0 ? template.throwRatio : legacyThrowRatio(template),
    lensZoom: template.lensZoom,
    throwLocks: template.throwLocks?.length ? [...template.throwLocks] : ["throw"],
  };
}

function newScreen(index = 0) {
  const screen = createBlankProjectionScreen(index);
  linkFromWidth(screen);
  return screen;
}

function getPreset(projector) {
  return PREBUILT_PROJECTORS.find((p) => p.id === projector.presetId) ?? PREBUILT_PROJECTORS[0];
}

/** @typedef {'match' | 'gap' | 'too-wide' | 'too-long'} LensSuggestionStatus */
/** @typedef {{ lens: import('./projector-data.js').LensPreset, status: LensSuggestionStatus }} LensSuggestion */

/**
 * Pick the best lens for a required throw ratio from a projector preset.
 * @param {import('./projector-data.js').ProjectorPreset} preset
 * @param {number} requiredRatio
 */
function suggestLensForPreset(preset, requiredRatio) {
  return suggestLens(preset.lenses, requiredRatio);
}

function getLens(projector) {
  const preset = getPreset(projector);
  return preset.lenses.find((l) => l.id === projector.lensId) ?? preset.lenses[0];
}

/**
 * @param {ScreenProjector} projector
 * @param {number} [imageWidthOverride]
 * @returns {LensSuggestion | null}
 */
function syncSuggestedLens(projector, imageWidthOverride) {
  if (projector.source === "custom") return null;
  const preset = getPreset(projector);
  const dist = Number(projector.throwDistance) || 0;
  const imageW =
    imageWidthOverride ??
    (dist > 0 && imageWidthFromThrow(projector) > 0 ? imageWidthFromThrow(projector) : 0);
  const requiredRatio = dist > 0 && imageW > 0 ? dist / imageW : getThrowRatio(projector);
  const suggestion = suggestLensForPreset(preset, requiredRatio);
  projector.lensId = suggestion.lens.id;
  return suggestion;
}

/** @returns {ThrowRange & { lumens: number, resolutionW: number, resolutionH: number, displayName: string }} */
function getProjectorSpecs(projector) {
  if (projector.source === "custom") {
    const min = Number(projector.customThrowMin) || 1;
    const max = Number(projector.customThrowMax) || min;
    return {
      throwMin: Math.min(min, max),
      throwMax: Math.max(min, max),
      lumens: Number(projector.customLumens) || 0,
      resolutionW: Number(projector.customResW) || 1920,
      resolutionH: Number(projector.customResH) || 1080,
      displayName: "Custom",
    };
  }
  const preset = getPreset(projector);
  const lens = getLens(projector);
  return {
    throwMin: lens.throwMin,
    throwMax: lens.throwMax,
    lumens: preset.lumens,
    resolutionW: preset.resolutionW,
    resolutionH: preset.resolutionH,
    displayName: `${preset.name} · ${lens.name}`,
  };
}

/** @param {ScreenProjector} projector */
function legacyThrowRatio(projector) {
  if (projector.source === "custom") {
    const min = Number(projector.customThrowMin) || 1;
    const max = Number(projector.customThrowMax) || min;
    return interpolateThrowRatio(min, max, projector.lensZoom);
  }
  const preset = getPreset(projector);
  const lens = preset.lenses.find((l) => l.id === projector.lensId) ?? preset.lenses[0];
  return interpolateThrowRatio(lens.throwMin, lens.throwMax, projector.lensZoom);
}

/** @param {ScreenProjector} projector */
function getThrowRatio(projector) {
  const explicit = Number(projector.throwRatio);
  if (explicit > 0) return explicit;
  return legacyThrowRatio(projector);
}

/** @param {ScreenProjector} projector @param {number} ratio */
function setThrowRatio(projector, ratio) {
  if (Number.isFinite(ratio) && ratio > 0) {
    projector.throwRatio = ratio;
  }
}

function effectiveThrowRatio(projector) {
  return getThrowRatio(projector);
}

/** @param {ScreenProjector} projector @param {ThrowLockField} field */
function isProjectorThrowFieldComputed(projector, field) {
  if (!projector) return false;
  return isThrowFieldComputed(projector.throwLocks ?? ["throw"], field);
}

/** @param {ScreenProjector} projector */
function getProjectorAspectId(projector) {
  if (projector.projectorAspectId === "16:9" || projector.projectorAspectId === "16:10") {
    return projector.projectorAspectId;
  }
  if (projector.source === "custom") {
    return inferProjectorAspectId(projector.customResW, projector.customResH);
  }
  return defaultProjectorAspectForPreset(getPreset(projector));
}

/** @param {ScreenProjector} projector @returns {"hd" | "uhd"} */
function getProjectorResolutionId(projector) {
  return projector.resolutionId === "uhd" ? "uhd" : "hd";
}

/** @param {ScreenProjector} projector */
function getProjectorNativeResolution(projector) {
  if (projector.source === "custom") {
    return {
      w: Number(projector.customResW) || 1920,
      h: Number(projector.customResH) || 1080,
    };
  }
  const options = projectorResolutionOptions(getProjectorAspectId(projector));
  const option = options.find((o) => o.id === getProjectorResolutionId(projector)) ?? options[0];
  return { w: option.w, h: option.h };
}

function projectorPixelAspect(projector) {
  const { w, h } = getProjectorNativeResolution(projector);
  return w > 0 ? h / w : 9 / 16;
}

function imageWidthFromThrow(projector) {
  return imageWidthFromDistanceAndRatio(
    Number(projector.throwDistance) || 0,
    effectiveThrowRatio(projector)
  );
}

/** @param {ScreenProjector} projector */
function nativeImageHeightFromThrow(projector) {
  return imageWidthFromThrow(projector) * projectorPixelAspect(projector);
}

function nativeImageSizeFromThrow(projector) {
  const imageW = imageWidthFromThrow(projector);
  return { imageW, imageH: imageW * projectorPixelAspect(projector) };
}

function imageSizeFromThrow(projector) {
  const { imageW, imageH } = nativeImageSizeFromThrow(projector);
  if (projector.orientation === "portrait") {
    return { imageW: imageH, imageH: imageW };
  }
  return { imageW, imageH };
}

/** @param {ScreenProjector} projector */
function nativeImageWidthForThrowCheck(projector) {
  return imageWidthFromThrow(projector);
}

/** @param {ScreenProjector} projector */
function getMakeForProjector(projector) {
  if (projector.source === "custom") return CUSTOM_MAKE;
  return getPreset(projector).manufacturer;
}

/** @param {ScreenProjector} projector @param {number} overlapPxH @param {number} overlapPxV */
function pixelOverlapToScreen(projector, overlapPxH, overlapPxV) {
  const { imageW, imageH } = imageSizeFromThrow(projector);
  const { w: nativeW, h: nativeH } = getProjectorNativeResolution(projector);
  const resW = projector.orientation === "portrait" ? nativeH : nativeW;
  const resH = projector.orientation === "portrait" ? nativeW : nativeH;
  return {
    overlapH: resW > 0 ? (overlapPxH / resW) * imageW : 0,
    overlapV: resH > 0 ? (overlapPxV / resH) * imageH : 0,
  };
}

/** @param {ScreenProjector} projector */
function getGridIndices(projector) {
  const cols = Math.max(1, Number(projector.tileCols) || 1);
  const rows = Math.max(1, Number(projector.tileRows) || 1);
  return {
    col: clamp(Number(projector.tileCol) || 0, 0, cols - 1),
    row: clamp(Number(projector.tileRow) || 0, 0, rows - 1),
    cols,
    rows,
  };
}

/** @param {ScreenProjector} projector @param {ProjectionScreen} screen */
function computeGridCoverage(projector, screen) {
  const { imageW, imageH } = imageSizeFromThrow(projector);
  const sw = screen.width;
  const sh = screen.height;
  const { col, row, cols, rows } = getGridIndices(projector);
  const layoutMode = projector.layoutMode ?? "fit";
  const ox = Number(projector.offsetX) || 0;
  const oy = Number(projector.offsetY) || 0;

  let overlapH = 0;
  let overlapV = 0;
  let stepH = imageW;
  let stepV = imageH;

  if (layoutMode === "overlap") {
    const conv = pixelOverlapToScreen(projector, projector.overlapPxH ?? 0, projector.overlapPxV ?? 0);
    overlapH = conv.overlapH;
    overlapV = conv.overlapV;
    stepH = imageW - overlapH;
    stepV = imageH - overlapV;
  } else {
    if (cols > 1) {
      overlapH = Math.max(0, (cols * imageW - sw) / (cols - 1));
      stepH = imageW - overlapH;
    }
    if (rows > 1) {
      overlapV = Math.max(0, (rows * imageH - sh) / (rows - 1));
      stepV = imageH - overlapV;
    }
  }

  const totalW = imageW + (cols - 1) * stepH;
  const totalH = imageH + (rows - 1) * stepV;
  const left = -totalW / 2 + col * stepH + ox;
  const top = -totalH / 2 + row * stepV + oy;

  return {
    left,
    top,
    width: imageW,
    height: imageH,
    imageW,
    imageH,
    throwOk: throwInRange(projector, nativeImageWidthForThrowCheck(projector)),
    overlapH: imageW > 0 ? overlapH / imageW : 0,
    overlapV: imageH > 0 ? overlapV / imageH : 0,
    overlap: imageW > 0 ? overlapH / imageW : 0,
  };
}

/** Native pixel resolution of a projector, swapped when mounted in portrait. */
export function projectorPixelResolution(projector) {
  const { w, h } = getProjectorNativeResolution(projector);
  return projector.orientation === "portrait" ? { w: h, h: w } : { w, h };
}

/**
 * Pixel overlap between adjacent projectors in a blend/tile grid.
 * In "overlap" layout the pixel values are user-specified; in "fit" layout the
 * overlap is derived from image size vs. screen size and converted to pixels.
 * @param {ScreenProjector} lead @param {ProjectionScreen} screen
 */
export function gridPixelOverlap(lead, screen) {
  if ((lead.layoutMode ?? "fit") === "overlap") {
    return {
      overlapPxH: Math.max(0, Math.round(Number(lead.overlapPxH) || 0)),
      overlapPxV: Math.max(0, Math.round(Number(lead.overlapPxV) || 0)),
    };
  }
  const { w: resW, h: resH } = projectorPixelResolution(lead);
  const cov = computeGridCoverage(lead, screen);
  return {
    overlapPxH: Math.max(0, Math.round(cov.overlapH * resW)),
    overlapPxV: Math.max(0, Math.round(cov.overlapV * resH)),
  };
}

/**
 * Total pixel canvas covered by a blend/tile group:
 * cols × resW minus the blended overlap between neighbors (same vertically).
 * @param {ProjectionScreen} screen @param {string} groupId
 * @returns {{ width: number, height: number, cols: number, rows: number, overlapPxH: number, overlapPxV: number } | null}
 */
export function groupPixelSize(screen, groupId) {
  const group = getProjectorGroup(screen, groupId);
  const lead = getGroupMembers(screen, groupId)[0];
  if (!group || !lead) return null;
  const cols = Math.max(1, Number(group.tileCols) || 1);
  const rows = Math.max(1, Number(group.tileRows) || 1);
  const { w: resW, h: resH } = projectorPixelResolution(lead);
  const { overlapPxH, overlapPxV } = gridPixelOverlap(lead, screen);
  return {
    width: Math.max(1, Math.round(cols * resW - (cols - 1) * overlapPxH)),
    height: Math.max(1, Math.round(rows * resH - (rows - 1) * overlapPxV)),
    cols,
    rows,
    overlapPxH,
    overlapPxV,
  };
}

/**
 * Pixel rect of every projector on a screen, in the screen's pixel canvas
 * (origin at the canvas top-left). Grid members are placed by column/row with
 * the blend overlap subtracted between neighbors; standalone projectors sit at
 * the origin at their native resolution.
 * @param {ProjectionScreen} screen
 * @returns {{ id: string, name: string, x: number, y: number, width: number, height: number }[]}
 */
export function screenProjectorPixelRects(screen) {
  const rects = [];
  for (const group of screen.projectorGroups ?? []) {
    const members = getGroupMembers(screen, group.id);
    const lead = members[0];
    if (!lead) continue;
    const { w: resW, h: resH } = projectorPixelResolution(lead);
    const { overlapPxH, overlapPxV } = gridPixelOverlap(lead, screen);
    const stepX = resW - overlapPxH;
    const stepY = resH - overlapPxV;
    for (const projector of members) {
      const { col, row } = getGridIndices(projector);
      rects.push({
        id: projector.id,
        name: projector.name,
        x: col * stepX,
        y: row * stepY,
        width: resW,
        height: resH,
      });
    }
  }
  for (const projector of getUngroupedProjectors(screen)) {
    const { w, h } = projectorPixelResolution(projector);
    rects.push({ id: projector.id, name: projector.name, x: 0, y: 0, width: w, height: h });
  }
  return rects;
}

/**
 * Overall pixel size of the projector screen: the largest pixel canvas among
 * blend/tile groups and individual (single/stack) projectors.
 * @param {ProjectionScreen} screen
 * @returns {{ width: number, height: number } | null}
 */
export function screenPixelSize(screen) {
  let best = null;
  for (const group of screen.projectorGroups ?? []) {
    const size = groupPixelSize(screen, group.id);
    if (size && (!best || size.width * size.height > best.width * best.height)) {
      best = { width: size.width, height: size.height };
    }
  }
  for (const projector of getUngroupedProjectors(screen)) {
    const { w, h } = projectorPixelResolution(projector);
    if (!best || w * h > best.width * best.height) {
      best = { width: w, height: h };
    }
  }
  return best;
}

function throwDistanceFromImageWidth(projector, imageWidth) {
  return throwDistanceFromImageWidthAndRatio(imageWidth, effectiveThrowRatio(projector));
}

function throwInRange(projector, imageWidth) {
  const specs = getProjectorSpecs(projector);
  return throwInRangeFromSpecs({
    throwMin: specs.throwMin,
    throwMax: specs.throwMax,
    ratio: getThrowRatio(projector),
    dist: Number(projector.throwDistance) || 0,
    imageWidth,
  });
}

/**
 * Coverage on screen in screen coordinates (center 0,0), width/height of zone.
 * @param {ScreenProjector} projector
 * @param {ProjectionScreen} screen
 * @param {number} index
 * @param {ScreenProjector[]} roleGroup
 */
function computeCoverage(projector, screen, index, roleGroup) {
  const { imageW, imageH } = imageSizeFromThrow(projector);

  if (projector.role === "blend" || projector.role === "tile") {
    return computeGridCoverage(projector, screen);
  }

  if (projector.role === "stack") {
    const ox = Number(projector.offsetX) || 0;
    const oy = Number(projector.offsetY) || 0;
    return {
      left: ox - imageW / 2,
      top: oy - imageH / 2,
      width: imageW,
      height: imageH,
      imageW,
      imageH,
      throwOk: throwInRange(projector, nativeImageWidthForThrowCheck(projector)),
    };
  }

  const ox = Number(projector.offsetX) || 0;
  const oy = Number(projector.offsetY) || 0;
  return {
    left: ox - imageW / 2,
    top: oy - imageH / 2,
    width: imageW,
    height: imageH,
    imageW,
    imageH,
    throwOk: throwInRange(projector, nativeImageWidthForThrowCheck(projector)),
  };
}

export function initProjectorCalculator() {
  const shell = queryCalcShell("projector-calculator", {
    statusId: "proj-canvas-status",
    viewportId: "proj-canvas-container",
  });

  const els = {
    root: shell?.root ?? document.getElementById("projector-calculator"),
    projSidebar: shell?.sidebar ?? document.getElementById("proj-sidebar"),
    expandAllSections: document.getElementById("proj-expand-all"),
    collapseAllSections: document.getElementById("proj-collapse-all"),
    selectScreenFt: document.getElementById("select-screen-ft"),
    selectScreenM: document.getElementById("select-screen-m"),
    screenAspect: document.getElementById("screen-aspect"),
    screenWidth: document.getElementById("screen-width"),
    screenHeight: document.getElementById("screen-height"),
    dimLinkIcon: document.getElementById("dim-link-icon"),
    screenSummary: document.getElementById("screen-summary"),
    screenNew: document.getElementById("screen-new"),
    screenRemove: document.getElementById("screen-remove"),
    screenList: document.getElementById("screen-list"),
    projectorMake: document.getElementById("projector-make"),
    projectorModel: document.getElementById("projector-model"),
    projectorAspect: document.getElementById("projector-aspect"),
    projectorAspectWrap: document.getElementById("projector-aspect-wrap"),
    projectorResolution: document.getElementById("projector-resolution"),
    projectorResolutionWrap: document.getElementById("projector-resolution-wrap"),
    projectorPixelSummary: document.getElementById("projector-pixel-summary"),
    customLensFields: document.getElementById("custom-lens-fields"),
    projectorRole: document.getElementById("projector-role"),
    orientationLandscape: document.getElementById("orientation-landscape"),
    orientationPortrait: document.getElementById("orientation-portrait"),
    projectorThrow: document.getElementById("projector-throw"),
    projectorThrowUnit: document.getElementById("projector-throw-unit"),
    projectorLensRatio: document.getElementById("projector-lens-ratio"),
    projectorImageWidth: document.getElementById("projector-image-width"),
    projectorImageHeight: document.getElementById("projector-image-height"),
    projectorOffsetX: document.getElementById("projector-offset-x"),
    projectorOffsetY: document.getElementById("projector-offset-y"),
    gridFieldsWrap: document.getElementById("grid-fields-wrap"),
    projectorGridCols: document.getElementById("projector-grid-cols"),
    projectorGridRows: document.getElementById("projector-grid-rows"),
    layoutModeFit: document.getElementById("layout-mode-fit"),
    layoutModeOverlap: document.getElementById("layout-mode-overlap"),
    overlapFieldsWrap: document.getElementById("overlap-fields-wrap"),
    projectorOverlapH: document.getElementById("projector-overlap-h"),
    projectorOverlapV: document.getElementById("projector-overlap-v"),
    placementFieldsWrap: document.getElementById("placement-fields-wrap"),
    stackFieldsWrap: document.getElementById("stack-fields-wrap"),
    customThrowMin: document.getElementById("custom-throw-min"),
    customThrowMax: document.getElementById("custom-throw-max"),
    customLumens: document.getElementById("custom-lumens"),
    customResW: document.getElementById("custom-res-w"),
    customResH: document.getElementById("custom-res-h"),
    customProjectorFields: document.getElementById("custom-projector-fields"),
    throwRangeHint: document.getElementById("throw-range-hint"),
    throwLockThrow: document.getElementById("throw-lock-throw"),
    throwLockImage: document.getElementById("throw-lock-image"),
    throwLockZoom: document.getElementById("throw-lock-zoom"),
    suggestedLensWrap: document.getElementById("suggested-lens-wrap"),
    suggestedLensValue: document.getElementById("suggested-lens-value"),
    lensSuggestionWarning: document.getElementById("lens-suggestion-warning"),
    projectorNew: document.getElementById("projector-new"),
    projectorNewGroup: document.getElementById("projector-new-group"),
    projectorRemove: document.getElementById("projector-remove"),
    projectorList: document.getElementById("projector-list"),
    canvasStatus: document.getElementById("proj-canvas-status"),
    resetProjView: document.getElementById("reset-proj-view"),
    projEmptyState: document.getElementById("proj-empty-state"),
    projCanvasContainer: document.getElementById("proj-canvas-container"),
    projSvg: document.getElementById("proj-svg"),
    projLegendCoverage: document.getElementById("proj-legend-coverage"),
    projLegendOverlap: document.getElementById("proj-legend-overlap"),
    projLegendHint: document.getElementById("proj-legend-hint"),
  };

  if (!els.root || !els.projSidebar) {
    console.error("Projector Calculator: #projector-calculator or #proj-sidebar not found.");
    return {
      exportState: () => ({ screens: [], activeScreenId: null, activeSidebarTab: "screen" }),
      importState: () => {},
    };
  }

  function on(el, type, handler) {
    if (!el) {
      console.warn(`Projector Calculator: missing element for ${type} listener`);
      return;
    }
    el.addEventListener(type, handler);
  }

  /** @type {{ screens: ProjectionScreen[], activeScreenId: string | null }} */
  const state = { screens: [], activeScreenId: null };

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 10;
  const DIAGRAM_SCALE = 10;

  const projView = { panX: 0, panY: 0, zoom: 1, contentW: 0, contentH: 0 };
  let screenListSelectDelay = null;
  let syncingForm = false;
  let activeSidebarTab = "screen";

  const listDrag = {
    payload: /** @type {{ type: "projector" | "group", id: string } | null} */ (null),
    suppressClick: false,
  };

  const panZoom = createSvgViewBoxPanZoom({
    container: /** @type {HTMLElement} */ (els.projCanvasContainer),
    getSvg: () => els.projSvg,
    getView: () => projView,
    getEnabled: () => Boolean(getActiveScreen()),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomWheelFactor: 1.12,
  });

  const screenNameEditor =
    els.screenList &&
    createListNameEditor({
      listEl: els.screenList,
      itemSelector: "[data-screen-id]",
      getItemId: (item) => item.dataset.screenId,
      getName: (id) => state.screens.find((s) => s.id === id)?.name,
      setName: (id, name) => {
        const screen = state.screens.find((s) => s.id === id);
        if (screen && screen.name !== name) recordBefore("projector", "rename-screen");
        if (screen) screen.name = name;
      },
      onCommit: (_id, previousName, newName) => {
        renderScreenList();
        render();
        if (newName !== previousName) setStatus(`Renamed to ${newName}.`);
      },
      onCancel: () => {
        renderScreenList();
      },
    });

  /** @type {{ setActive: (tabId: string) => void } | null} */
  let sidebarTabs = null;

  function clearListDropIndicators() {
    els.projectorList?.querySelectorAll(".is-drop-before, .is-drop-after, .is-drop-target").forEach((el) => {
      el.classList.remove("is-drop-before", "is-drop-after", "is-drop-target");
    });
  }

  /** @param {DragEvent} e */
  function getListDropTarget(e) {
    const row = e.target.closest(".projector-list-row");
    if (row?.dataset.projectorId) {
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const groupBlock = row.closest(".projector-group-block");
      return {
        kind: "projector",
        projectorId: row.dataset.projectorId,
        before,
        groupId: groupBlock?.dataset.groupBlock ?? null,
      };
    }

    const headerRow = e.target.closest(".projector-group-header-row");
    if (headerRow?.dataset.groupId) {
      const rect = headerRow.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const membersContainer = headerRow.parentElement?.querySelector(".projector-group-members");
      const firstMember = membersContainer?.querySelector(".projector-list-row");
      return {
        kind: "group-header",
        groupId: headerRow.dataset.groupId,
        before,
        beforeProjectorId: firstMember?.dataset.projectorId ?? null,
      };
    }

    const members = e.target.closest(".projector-group-members");
    if (members?.dataset.groupMembers) {
      const rows = members.querySelectorAll(".projector-list-row");
      if (!rows.length) {
        return {
          kind: "group-header",
          groupId: members.dataset.groupMembers,
          before: true,
          beforeProjectorId: null,
        };
      }
    }

    if (e.target.closest(".projector-list-ungrouped")) {
      return { kind: "ungrouped" };
    }

    return null;
  }

  /** @param {ProjectionScreen} screen @param {{ type: string, id: string }} payload @param {ReturnType<typeof getListDropTarget>} target */
  function applyProjectorDrop(screen, payload, target) {
    if (!target) return;

    if (target.kind === "projector") {
      let beforeProjectorId = null;
      let targetGroupId = target.groupId || null;

      if (target.before) {
        beforeProjectorId = target.projectorId;
      } else {
        const order = getRenderedProjectorOrder(screen);
        const index = order.indexOf(target.projectorId);
        beforeProjectorId = index >= 0 && index < order.length - 1 ? order[index + 1] : null;
      }

      moveProjectorRelative(screen, payload.id, beforeProjectorId, targetGroupId);
      return;
    }

    if (target.kind === "group-header") {
      if (target.before) {
        moveProjectorRelative(screen, payload.id, target.beforeProjectorId, target.groupId);
      } else {
        moveProjectorRelative(screen, payload.id, null, target.groupId);
      }
      return;
    }

    if (target.kind === "ungrouped") {
      moveProjectorRelative(screen, payload.id, null, null);
    }
  }

  /** @param {ProjectionScreen} screen @param {{ type: string, id: string }} payload @param {ReturnType<typeof getListDropTarget>} target */
  function applyGroupDrop(screen, payload, target) {
    if (!target || target.kind !== "group-header" || target.groupId === payload.id) return;
    let beforeGroupId = null;
    if (target.before) {
      beforeGroupId = target.groupId;
    } else {
      const index = screen.projectorGroups.findIndex((group) => group.id === target.groupId);
      beforeGroupId =
        index >= 0 && index < screen.projectorGroups.length - 1
          ? screen.projectorGroups[index + 1].id
          : null;
    }
    moveGroupRelative(screen, payload.id, beforeGroupId);
  }

  function setupProjectorListDragDrop() {
    if (!els.projectorList) return;

    els.projectorList.addEventListener("dragstart", (e) => {
      const row = e.target.closest(".projector-list-row");
      if (row?.dataset.projectorId) {
        listDrag.payload = { type: "projector", id: row.dataset.projectorId };
        listDrag.suppressClick = true;
        row.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/json", JSON.stringify(listDrag.payload));
        return;
      }
      const headerRow = e.target.closest(".projector-group-header-row");
      if (headerRow?.dataset.groupId) {
        listDrag.payload = { type: "group", id: headerRow.dataset.groupId };
        listDrag.suppressClick = true;
        headerRow.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/json", JSON.stringify(listDrag.payload));
      }
    });

    els.projectorList.addEventListener("dragover", (e) => {
      if (!listDrag.payload) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearListDropIndicators();
      const target = getListDropTarget(e);
      if (!target) return;

      if (target.kind === "projector") {
        const row = e.target.closest(".projector-list-row");
        row?.classList.add(target.before ? "is-drop-before" : "is-drop-after");
      } else if (target.kind === "group-header") {
        const headerRow = e.target.closest(".projector-group-header-row");
        if (headerRow) {
          headerRow.classList.add(target.before ? "is-drop-before" : "is-drop-after");
        } else {
          e.target.closest(".projector-group-members")?.classList.add("is-drop-target");
        }
      } else if (target.kind === "ungrouped") {
        e.target.closest(".projector-list-ungrouped")?.classList.add("is-drop-target");
      }
    });

    els.projectorList.addEventListener("drop", (e) => {
      e.preventDefault();
      const screen = getActiveScreen();
      const payload = listDrag.payload;
      const target = getListDropTarget(e);
      clearListDropIndicators();
      if (!screen || !payload || !target) return;

      recordBefore("projector", "list-drop");
      if (payload.type === "projector") {
        applyProjectorDrop(screen, payload, target);
      } else if (payload.type === "group") {
        applyGroupDrop(screen, payload, target);
      }

      listDrag.payload = null;
      renderProjectorList();
      renderCanvas();
      setStatus("Updated projector layout.");
    });

    els.projectorList.addEventListener("dragend", () => {
      clearListDropIndicators();
      els.projectorList?.querySelectorAll(".is-dragging").forEach((el) => {
        el.classList.remove("is-dragging");
      });
      setTimeout(() => {
        listDrag.suppressClick = false;
        listDrag.payload = null;
      }, 0);
    });
  }

  function setStatus(msg, isError = false) {
    if (!els.canvasStatus) return;
    els.canvasStatus.textContent = msg;
    els.canvasStatus.classList.toggle("status-error", isError);
  }

  function getActiveScreen() {
    return state.screens.find((s) => s.id === state.activeScreenId) ?? null;
  }

  function getActiveProjector() {
    const screen = getActiveScreen();
    if (!screen) return null;
    if (screen.activeProjectorId) {
      return screen.projectors.find((p) => p.id === screen.activeProjectorId) ?? null;
    }
    if (screen.activeGroupId) {
      const members = getGroupMembers(screen, screen.activeGroupId);
      return members[0] ?? null;
    }
    return screen.projectors[0] ?? null;
  }

  function isGroupSelection() {
    const screen = getActiveScreen();
    return Boolean(screen?.activeGroupId && !screen.activeProjectorId);
  }

  function updateRemoveButtonUI() {
    if (!els.projectorRemove) return;
    const groupSelected = isGroupSelection();
    els.projectorRemove.title = groupSelected ? "Remove group" : "Remove projector";
    els.projectorRemove.setAttribute(
      "aria-label",
      groupSelected ? "Remove projector group" : "Remove projector"
    );
  }

  function getScreenUnit() {
    return els.selectScreenM?.classList.contains("active") ? "m" : "ft";
  }

  function setScreenUnitToggle(unit) {
    const isMetric = unit === "m";
    els.selectScreenFt?.classList.toggle("active", !isMetric);
    els.selectScreenM?.classList.toggle("active", isMetric);
    els.selectScreenFt?.setAttribute("aria-pressed", String(!isMetric));
    els.selectScreenM?.setAttribute("aria-pressed", String(isMetric));
    updateThrowUnitSuffix(unit);
  }

  /** @param {ProjectionScreen | "ft" | "m" | null | undefined} screenOrUnit */
  function updateThrowUnitSuffix(screenOrUnit) {
    if (!els.projectorThrowUnit) return;
    let unit = "ft";
    if (screenOrUnit === "ft" || screenOrUnit === "m") {
      unit = screenOrUnit;
    } else if (screenOrUnit?.unit) {
      unit = screenOrUnit.unit;
    } else {
      unit = getActiveScreen()?.unit ?? getScreenUnit();
    }
    els.projectorThrowUnit.textContent = unitLabel(unit);
  }

  function populatePresets() {
    if (els.projectorMake) {
      const manufacturers = [CUSTOM_MAKE, ...getProjectorManufacturers()];
      els.projectorMake.innerHTML = manufacturers
        .map((m) => `<option value="${escapeXml(m)}">${escapeXml(m)}</option>`)
        .join("");
    }
    if (els.screenAspect) {
      els.screenAspect.innerHTML = ASPECT_RATIOS.map(
        (a) => `<option value="${a.id}">${escapeXml(a.label)}</option>`
      ).join("");
    }
    if (els.projectorRole) {
      els.projectorRole.innerHTML = PROJECTOR_ROLES.map(
        (r) => `<option value="${r.id}">${escapeXml(r.label)}</option>`
      ).join("");
    }
  }

  /**
   * Rebuild the resolution dropdown for an aspect (heights differ between
   * 16:9 and 16:10) while keeping the current tier selected.
   * @param {string} aspectId @param {"hd" | "uhd"} [selectedId]
   */
  function updateResolutionOptions(aspectId, selectedId) {
    if (!els.projectorResolution) return;
    const options = projectorResolutionOptions(aspectId);
    els.projectorResolution.innerHTML = options
      .map((o) => `<option value="${o.id}">${escapeXml(o.label)}</option>`)
      .join("");
    const id = options.some((o) => o.id === selectedId) ? selectedId : options[0]?.id;
    if (id) els.projectorResolution.value = id;
  }

  /** @param {string} make @param {string} [selectedPresetId] @param {"16:9" | "16:10"} [selectedAspectId] */
  function updateModelOptions(make, selectedPresetId, selectedAspectId) {
    if (!els.projectorModel) return;
    const isCustom = make === CUSTOM_MAKE;
    if (els.customProjectorFields) els.customProjectorFields.hidden = !isCustom;
    if (els.customLensFields) els.customLensFields.hidden = !isCustom;
    if (els.projectorAspectWrap) els.projectorAspectWrap.hidden = isCustom;
    if (els.projectorResolutionWrap) els.projectorResolutionWrap.hidden = isCustom;
    if (isCustom) {
      els.projectorModel.innerHTML = '<option value="custom">Custom</option>';
      els.projectorModel.value = "custom";
      return;
    }
    const models = getProjectorModelsForManufacturer(make);
    els.projectorModel.innerHTML = models
      .map((p) => `<option value="${p.id}">${escapeXml(p.name)}</option>`)
      .join("");
    let presetId = selectedPresetId;
    if (presetId && models.some((m) => m.id === presetId)) {
      els.projectorModel.value = presetId;
    } else if (models[0]) {
      els.projectorModel.value = models[0].id;
      presetId = models[0].id;
    }
    const preset = models.find((m) => m.id === presetId) ?? models[0];
    if (els.projectorAspect && preset) {
      const aspectId = selectedAspectId ?? defaultProjectorAspectForPreset(preset);
      els.projectorAspect.value = aspectId;
    }
  }

  /** @param {"fit" | "overlap"} layoutMode */
  function updateLayoutModeUI(layoutMode) {
    const isOverlap = layoutMode === "overlap";
    els.layoutModeFit?.classList.toggle("active", !isOverlap);
    els.layoutModeOverlap?.classList.toggle("active", isOverlap);
    els.layoutModeFit?.setAttribute("aria-pressed", String(!isOverlap));
    els.layoutModeOverlap?.setAttribute("aria-pressed", String(isOverlap));
    if (els.overlapFieldsWrap) els.overlapFieldsWrap.hidden = !isOverlap;
  }

  function layoutModeFromForm() {
    return els.layoutModeOverlap?.classList.contains("active") ? "overlap" : "fit";
  }

  /** @returns {"landscape" | "portrait"} */
  function orientationFromForm() {
    return els.orientationPortrait?.classList.contains("active") ? "portrait" : "landscape";
  }

  /** @param {"landscape" | "portrait"} orientation */
  function updateOrientationUI(orientation) {
    const isPortrait = orientation === "portrait";
    els.orientationLandscape?.classList.toggle("active", !isPortrait);
    els.orientationPortrait?.classList.toggle("active", isPortrait);
    els.orientationLandscape?.setAttribute("aria-pressed", String(!isPortrait));
    els.orientationPortrait?.setAttribute("aria-pressed", String(isPortrait));
  }

  function updateThrowLockUI(projector) {
    const locks = new Set(projector?.throwLocks ?? ["throw"]);
    const buttons = [
      { el: els.throwLockThrow, field: "throw" },
      { el: els.throwLockImage, field: "image" },
      { el: els.throwLockZoom, field: "zoom" },
    ];
    for (const { el, field } of buttons) {
      if (!el) continue;
      const isLocked = locks.has(field);
      el.classList.toggle("is-locked", isLocked);
      el.setAttribute("aria-pressed", String(isLocked));
      el.title = isLocked
        ? `${field === "zoom" ? "Lens zoom" : field === "throw" ? "Throw distance" : "Image size"} is locked (won't auto-update)`
        : `Lock ${field === "zoom" ? "lens zoom" : field === "throw" ? "throw distance" : "image size"}`;
    }

    const computed = (field) => isProjectorThrowFieldComputed(projector, field);
    if (els.projectorThrow) {
      els.projectorThrow.readOnly = computed("throw");
      els.projectorThrow.classList.toggle("is-computed", computed("throw"));
    }
    if (els.projectorImageWidth) {
      els.projectorImageWidth.readOnly = computed("image");
      els.projectorImageWidth.classList.toggle("is-computed", computed("image"));
    }
    if (els.projectorImageHeight) {
      els.projectorImageHeight.readOnly = computed("image");
      els.projectorImageHeight.classList.toggle("is-computed", computed("image"));
    }
    if (els.projectorLensRatio) {
      els.projectorLensRatio.readOnly = computed("zoom");
      els.projectorLensRatio.classList.toggle("is-computed", computed("zoom"));
    }
  }

  function updateLensRatioBounds(projector) {
    if (!els.projectorLensRatio || !projector) return;
    els.projectorLensRatio.min = "0.1";
    els.projectorLensRatio.max = "20";
    els.projectorLensRatio.step = "0.01";
    if (projector.source === "custom") {
      const min = Number(projector.customThrowMin) || 1;
      const max = Number(projector.customThrowMax) || min;
      els.projectorLensRatio.title = `Custom lens range: ${Math.min(min, max).toFixed(2)}–${Math.max(min, max).toFixed(2)}:1`;
    } else {
      const { throwMin, throwMax } = getProjectorSpecs(projector);
      els.projectorLensRatio.title = `Suggested lens range: ${throwMin.toFixed(2)}–${throwMax.toFixed(2)}:1`;
    }
  }

  function syncThrowImageFieldsToForm(projector) {
    if (!projector) return;
    const imageW = imageWidthFromThrow(projector);
    const imageH = nativeImageHeightFromThrow(projector);
    if (els.projectorImageWidth) els.projectorImageWidth.value = imageW.toFixed(2);
    if (els.projectorImageHeight) els.projectorImageHeight.value = imageH.toFixed(2);
  }

  function linkThrowImageFields(projector, editedSource) {
    if (!projector) return;
    const aspect = projectorPixelAspect(projector);
    if (aspect <= 0) return;
    if (editedSource === "imageHeight") {
      const imageH = Number(els.projectorImageHeight?.value) || 0;
      if (els.projectorImageWidth) {
        els.projectorImageWidth.value = imageH > 0 ? (imageH / aspect).toFixed(2) : "";
      }
      return;
    }
    const imageW = Number(els.projectorImageWidth?.value) || 0;
    if (els.projectorImageHeight) {
      els.projectorImageHeight.value = imageW > 0 ? (imageW * aspect).toFixed(2) : "";
    }
  }

  function syncThrowFieldsToForm(projector) {
    if (!projector) return;
    syncingForm = true;
    if (els.projectorThrow) els.projectorThrow.value = Number(projector.throwDistance).toFixed(2);
    syncThrowImageFieldsToForm(projector);
    if (els.projectorLensRatio) {
      els.projectorLensRatio.value = getThrowRatio(projector).toFixed(2);
    }
    updateLensRatioBounds(projector);
    syncingForm = false;
  }

  function applyThrowRecalc(projector, editedField) {
    const locks = projector.throwLocks ?? ["throw"];
    const recalcFields = getRecalcFields(locks, editedField);

    const throwDist = Number(projector.throwDistance) || 0;
    const imageW = Number(els.projectorImageWidth?.value) || 0;
    const ratioInput = Number(els.projectorLensRatio?.value);

    if (editedField === "zoom" && Number.isFinite(ratioInput) && ratioInput > 0) {
      setThrowRatio(projector, ratioInput);
    }

    syncSuggestedLens(projector, imageW > 0 ? imageW : undefined);

    for (const recalc of recalcFields) {
      if (recalc === "zoom") {
        if (throwDist > 0 && imageW > 0) {
          setThrowRatio(projector, throwDist / imageW);
        }
      } else if (recalc === "image") {
        const ratio = Number.isFinite(ratioInput) ? ratioInput : getThrowRatio(projector);
        if (throwDist > 0 && ratio > 0) {
          const newImageW = throwDist / ratio;
          if (els.projectorImageWidth) els.projectorImageWidth.value = newImageW.toFixed(2);
          linkThrowImageFields(projector, "imageWidth");
        }
      } else if (recalc === "throw") {
        const ratio = Number.isFinite(ratioInput) ? ratioInput : getThrowRatio(projector);
        setThrowRatio(projector, ratio);
        if (imageW > 0 && ratio > 0) {
          projector.throwDistance = imageW * ratio;
        }
      }
    }

    syncSuggestedLens(
      projector,
      Number(els.projectorImageWidth?.value) > 0 ? Number(els.projectorImageWidth.value) : undefined
    );
  }

  function lensSuggestionMessage(suggestion, requiredRatio) {
    const ratio = requiredRatio.toFixed(2);
    switch (suggestion.status) {
      case "gap":
        return `Required throw ratio (${ratio}:1) falls between available lenses. Showing the longest lens below that ratio.`;
      case "too-wide":
        return `Required throw ratio (${ratio}:1) is wider than any lens for this projector. Showing the widest available lens.`;
      case "too-long":
        return `Required throw ratio (${ratio}:1) exceeds all lenses for this projector. Showing the longest available lens.`;
      default:
        return "";
    }
  }

  function updateRoleFieldVisibility(projector) {
    const role = els.projectorRole?.value ?? projector?.role ?? "single";
    const isGrid = role === "blend" || role === "tile";
    if (els.gridFieldsWrap) els.gridFieldsWrap.hidden = !isGrid;
    if (els.stackFieldsWrap) els.stackFieldsWrap.hidden = role !== "stack";
    if (els.placementFieldsWrap) els.placementFieldsWrap.hidden = isGrid;
    if (isGrid) {
      updateLayoutModeUI(projector?.layoutMode ?? layoutModeFromForm());
    }
  }

  function updateDimLinkUI(screen) {
    if (!els.dimLinkIcon) return;
    const unlinked = isCustomAspect(screen ?? getActiveScreen() ?? { aspectId: "16:9" });
    els.dimLinkIcon.classList.toggle("is-unlinked", unlinked);
    els.dimLinkIcon.title = unlinked
      ? "Custom aspect — width and height are independent"
      : "Width and height stay linked to the selected aspect ratio";
    els.dimLinkIcon.setAttribute(
      "aria-label",
      unlinked ? "Width and height unlinked" : "Width and height linked"
    );
  }

  function aspectSummaryLabel(screen) {
    if (isCustomAspect(screen)) return "custom";
    const preset = ASPECT_RATIOS.find((a) => a.id === screen.aspectId);
    return preset?.label ?? screen.aspectId;
  }

  function updateThrowHints(projector, screen) {
    if (!projector || !screen) return;

    const isCustom = projector.source === "custom";
    if (els.suggestedLensWrap) els.suggestedLensWrap.hidden = isCustom;

    const imageW =
      Number(els.projectorImageWidth?.value) > 0
        ? Number(els.projectorImageWidth.value)
        : imageWidthFromThrow(projector);
    const suggestion = syncSuggestedLens(projector, imageW > 0 ? imageW : undefined);
    const ratio = effectiveThrowRatio(projector);
    const specs = getProjectorSpecs(projector);
    const u = unitLabel(screen.unit);

    updateLensRatioBounds(projector);

    if (isCustom) {
      if (els.throwRangeHint) {
        const range = throwInRange(projector, imageW);
        els.throwRangeHint.textContent = range.ok
          ? `Throw ${Number(projector.throwDistance).toFixed(1)} ${u} is within lens range (${range.minDist.toFixed(1)}–${range.maxDist.toFixed(1)} ${u}) for ${imageW.toFixed(1)} ${u} image width.`
          : `Throw ${Number(projector.throwDistance).toFixed(1)} ${u} is outside lens range (${range.minDist.toFixed(1)}–${range.maxDist.toFixed(1)} ${u}) at ratio ${ratio.toFixed(2)}:1.`;
        els.throwRangeHint.classList.toggle("hint-warning", !range.ok);
      }
      if (els.lensSuggestionWarning) els.lensSuggestionWarning.hidden = true;
      return;
    }

    const dist = Number(projector.throwDistance) || 0;
    const requiredRatio = dist > 0 && imageW > 0 ? dist / imageW : ratio;

    if (els.suggestedLensValue && suggestion) {
      els.suggestedLensValue.textContent = suggestion.lens.name;
    }

    if (els.lensSuggestionWarning && suggestion) {
      const warning = lensSuggestionMessage(suggestion, requiredRatio);
      els.lensSuggestionWarning.textContent = warning;
      els.lensSuggestionWarning.hidden = suggestion.status === "match" || !warning;
    }

    if (els.throwRangeHint && suggestion) {
      const range = throwInRange(projector, imageW);
      if (suggestion.status === "match" && range.ok) {
        els.throwRangeHint.textContent = `Throw ${dist.toFixed(1)} ${u} fits ${suggestion.lens.name} (${range.minDist.toFixed(1)}–${range.maxDist.toFixed(1)} ${u} for ${imageW.toFixed(1)} ${u} image).`;
        els.throwRangeHint.classList.remove("hint-warning");
      } else if (suggestion.status === "match") {
        els.throwRangeHint.textContent = `Lens covers ${requiredRatio.toFixed(2)}:1, but throw ${dist.toFixed(1)} ${u} is outside zoom range for ${imageW.toFixed(1)} ${u} image.`;
        els.throwRangeHint.classList.add("hint-warning");
      } else {
        els.throwRangeHint.textContent = `${specs.displayName} — required ${requiredRatio.toFixed(2)}:1 at ${dist.toFixed(1)} ${u} throw and ${imageW.toFixed(1)} ${u} image width.`;
        els.throwRangeHint.classList.add("hint-warning");
      }
    }
  }

  function updateScreenSummary(screen) {
    if (!els.screenSummary) return;
    if (!screen) {
      els.screenSummary.textContent = "";
      return;
    }
    const u = unitLabel(screen.unit);
    const aspectLabel = aspectSummaryLabel(screen);
    const px = screenPixelSize(screen);
    const pxLabel = px ? ` · ${px.width} × ${px.height} px` : "";
    els.screenSummary.textContent = `${screen.width.toFixed(2)} × ${screen.height.toFixed(2)} ${u} (${aspectLabel}) · ${screen.projectors.length} projector${screen.projectors.length === 1 ? "" : "s"}${pxLabel}`;
  }

  function loadScreenToForm(screen) {
    syncingForm = true;
    if (!screen) {
      syncingForm = false;
      return;
    }
    setScreenUnitToggle(screen.unit);
    if (els.screenAspect) els.screenAspect.value = screen.aspectId;
    if (els.screenWidth) els.screenWidth.value = formatDim(screen.width);
    if (els.screenHeight) els.screenHeight.value = formatDim(screen.height);
    updateDimLinkUI(screen);
    updateThrowUnitSuffix(screen);
    loadProjectorToForm(getActiveProjector());
    updateScreenSummary(screen);
    syncingForm = false;
  }

  function loadProjectorToForm(projector) {
    syncingForm = true;
    const placeholder = !projector;
    const p = projector ?? newProjector(0);
    const isCustom = p.source === "custom";
    const make = getMakeForProjector(p);
    if (els.projectorMake) els.projectorMake.value = make;
    updateModelOptions(make, p.presetId, getProjectorAspectId(p));
    if (els.projectorAspect && p.source !== "custom") {
      els.projectorAspect.value = getProjectorAspectId(p);
    }
    updateResolutionOptions(getProjectorAspectId(p), getProjectorResolutionId(p));
    if (els.suggestedLensWrap) els.suggestedLensWrap.hidden = isCustom;
    if (!placeholder) syncSuggestedLens(p);
    if (els.customThrowMin) els.customThrowMin.value = String(p.customThrowMin);
    if (els.customThrowMax) els.customThrowMax.value = String(p.customThrowMax);
    if (els.customLumens) els.customLumens.value = String(p.customLumens);
    if (els.customResW) els.customResW.value = String(p.customResW);
    if (els.customResH) els.customResH.value = String(p.customResH);
    if (els.projectorRole) els.projectorRole.value = p.role;
    updateOrientationUI(p.orientation ?? "landscape");
    if (els.projectorGridCols) els.projectorGridCols.value = String(p.tileCols);
    if (els.projectorGridRows) els.projectorGridRows.value = String(p.tileRows);
    updateLayoutModeUI(p.layoutMode ?? "fit");
    if (els.projectorOverlapH) els.projectorOverlapH.value = String(p.overlapPxH ?? 0);
    if (els.projectorOverlapV) els.projectorOverlapV.value = String(p.overlapPxV ?? 0);
    updateThrowLockUI(placeholder ? null : p);
    if (!placeholder) updateLensRatioBounds(p);
    if (els.projectorThrow) els.projectorThrow.value = String(p.throwDistance);
    if (els.projectorLensRatio) {
      els.projectorLensRatio.value = getThrowRatio(p).toFixed(2);
    }
    if (els.projectorImageWidth) els.projectorImageWidth.value = imageWidthFromThrow(p).toFixed(2);
    if (els.projectorImageHeight) {
      els.projectorImageHeight.value = nativeImageHeightFromThrow(p).toFixed(2);
    }
    if (els.projectorOffsetX) els.projectorOffsetX.value = String(p.offsetX);
    if (els.projectorOffsetY) els.projectorOffsetY.value = String(p.offsetY);
    updateRoleFieldVisibility(p);
    if (placeholder) {
      if (els.suggestedLensValue) els.suggestedLensValue.textContent = "—";
      if (els.lensSuggestionWarning) {
        els.lensSuggestionWarning.textContent = "";
        els.lensSuggestionWarning.hidden = true;
      }
      if (els.throwRangeHint) {
        els.throwRangeHint.textContent = "Add a projector to configure throw and lens settings.";
        els.throwRangeHint.classList.remove("hint-warning");
      }
    } else {
      updateThrowHints(p, getActiveScreen());
    }
    syncingForm = false;
  }

  function persistScreenFromForm() {
    const screen = getActiveScreen();
    if (!screen || syncingForm) return;
    screen.unit = getScreenUnit();
    screen.aspectId = els.screenAspect?.value ?? screen.aspectId;
    screen.width = Number(els.screenWidth?.value) || 0;
    screen.height = Number(els.screenHeight?.value) || 0;
  }

  function readFormIntoProjector(projector) {
    const make = els.projectorMake?.value ?? CUSTOM_MAKE;
    if (make === CUSTOM_MAKE) {
      projector.source = "custom";
    } else {
      projector.source = "prebuilt";
      projector.presetId = els.projectorModel?.value ?? projector.presetId;
      const aspect = els.projectorAspect?.value;
      if (aspect === "16:9" || aspect === "16:10") {
        projector.projectorAspectId = aspect;
      }
      const resolution = els.projectorResolution?.value;
      if (resolution === "hd" || resolution === "uhd") {
        projector.resolutionId = resolution;
      }
    }
    projector.customThrowMin = Number(els.customThrowMin.value) || 1;
    projector.customThrowMax = Number(els.customThrowMax.value) || 1;
    projector.customLumens = Number(els.customLumens.value) || 0;
    projector.customResW = Number(els.customResW.value) || 1920;
    projector.customResH = Number(els.customResH.value) || 1080;
    projector.role = els.projectorRole.value;
    projector.orientation = orientationFromForm();
    projector.throwDistance = Number(els.projectorThrow.value) || 0;
    const ratio = Number(els.projectorLensRatio?.value);
    if (Number.isFinite(ratio) && ratio > 0) {
      projector.throwRatio = ratio;
    }
    projector.offsetX = Number(els.projectorOffsetX.value) || 0;
    projector.offsetY = Number(els.projectorOffsetY.value) || 0;
    projector.tileCols = Math.max(1, Number(els.projectorGridCols?.value) || 1);
    projector.tileRows = Math.max(1, Number(els.projectorGridRows?.value) || 1);
    projector.layoutMode = layoutModeFromForm();
    projector.overlapPxH = Math.max(0, Number(els.projectorOverlapH?.value) || 0);
    projector.overlapPxV = Math.max(0, Number(els.projectorOverlapV?.value) || 0);
  }

  function applyGridSettingsToGroup(group) {
    group.tileCols = Math.max(1, Number(els.projectorGridCols?.value) || 1);
    group.tileRows = Math.max(1, Number(els.projectorGridRows?.value) || 1);
    group.layoutMode = layoutModeFromForm();
    group.overlapPxH = Math.max(0, Number(els.projectorOverlapH?.value) || 0);
    group.overlapPxV = Math.max(0, Number(els.projectorOverlapV?.value) || 0);
  }

  function applyGridSettingsToMembers(screen, group) {
    for (const member of getGroupMembers(screen, group.id)) {
      member.role = group.role;
      member.tileCols = group.tileCols;
      member.tileRows = group.tileRows;
      member.layoutMode = group.layoutMode;
      member.overlapPxH = group.overlapPxH;
      member.overlapPxV = group.overlapPxV;
    }
  }

  function applyOrientationToGroupMembers(screen, groupId, orientation) {
    for (const member of getGroupMembers(screen, groupId)) {
      member.orientation = orientation;
    }
  }

  function syncGroupFromProjector(screen, projector) {
    if (!projector?.groupId) return;
    const group = getProjectorGroup(screen, projector.groupId);
    if (!group) return;
    group.role = projector.role;
    group.tileCols = projector.tileCols;
    group.tileRows = projector.tileRows;
    group.layoutMode = projector.layoutMode ?? "fit";
    group.overlapPxH = projector.overlapPxH ?? 0;
    group.overlapPxV = projector.overlapPxV ?? 0;
    for (const member of getGroupMembers(screen, group.id)) {
      if (member.id === projector.id) continue;
      copySharedProjectorSettings(projector, member);
    }
    if (group.role === "blend" || group.role === "tile") {
      syncGroupGridMembers(screen, group);
    }
  }

  function syncLensSettingsToGroupMembers(screen, groupId, source) {
    if (!screen || !groupId || !source) return;
    for (const member of getGroupMembers(screen, groupId)) {
      if (member.id === source.id) continue;
      copySharedProjectorSettings(source, member);
    }
  }

  function applySharedLensFromForm(screen) {
    if (!screen) return null;
    if (isGroupSelection()) {
      const group = getProjectorGroup(screen, screen.activeGroupId);
      if (!group) return null;
      const lead = getGroupMembers(screen, group.id)[0];
      if (!lead) return null;
      readFormIntoProjector(lead);
      syncLensSettingsToGroupMembers(screen, group.id, lead);
      return lead;
    }
    const projector = getActiveProjector();
    if (!projector) return null;
    readFormIntoProjector(projector);
    return projector;
  }

  function persistProjectorFromForm() {
    const screen = getActiveScreen();
    if (!screen || syncingForm) return;

    if (isGroupSelection()) {
      const group = getProjectorGroup(screen, screen.activeGroupId);
      if (!group) return;
      group.role = els.projectorRole?.value ?? group.role;
      applyGridSettingsToGroup(group);
      applyGridSettingsToMembers(screen, group);
      applyOrientationToGroupMembers(screen, group.id, orientationFromForm());
      applySharedLensFromForm(screen);
      if (group.role === "blend" || group.role === "tile") {
        syncGroupGridMembers(screen, group);
      }
      return;
    }

    const projector = getActiveProjector();
    if (!projector) return;
    readFormIntoProjector(projector);
    if (projector.role === "blend" || projector.role === "tile") {
      ensureGridGroup(screen, projector);
    } else {
      syncGroupFromProjector(screen, projector);
    }
  }

  function closeScreenNameEditor() {
    screenNameEditor?.close();
  }

  /** @param {HTMLElement} nameEl */
  function openScreenNameEditor(nameEl) {
    screenNameEditor?.open(nameEl);
  }

  function renderScreenList() {
    closeScreenNameEditor();
    if (!els.screenList) return;
    if (!state.screens.length) {
      els.screenList.innerHTML = `<p class="resource-empty">No projection screens yet — click + to add one.</p>`;
      return;
    }
    els.screenList.innerHTML = state.screens
      .map((screen) => {
        const selected = screen.id === state.activeScreenId;
        const u = unitLabel(screen.unit);
        const px = screenPixelSize(screen);
        const meta = `${screen.width.toFixed(1)}×${screen.height.toFixed(1)} ${u} · ${screen.projectors.length} proj.${px ? ` · ${px.width}×${px.height} px` : ""}`;
        return `
          <div class="grid-item${selected ? " selected" : ""}" data-screen-id="${screen.id}" role="button" tabindex="0" aria-pressed="${selected}">
            <span class="grid-item-name" title="Double-click to rename">${escapeXml(screen.name)}</span>
            <span class="grid-item-meta">${meta}</span>
          </div>`;
      })
      .join("");
  }

  function renderProjectorListItem(projector, screen, index) {
    syncSuggestedLens(projector);
    const selected = projector.id === screen.activeProjectorId;
    const specs = getProjectorSpecs(projector);
    const imageW = imageWidthFromThrow(projector);
    const range = throwInRange(projector, imageW);
    const role = PROJECTOR_ROLES.find((r) => r.id === projector.role)?.label ?? projector.role;
    const color = PROJECTOR_COLORS[index % PROJECTOR_COLORS.length];
    const cov = computeCoverage(projector, screen, index, getRoleGroup(screen, projector));
    const u = unitLabel(screen.unit);
    return `
      <div class="projector-list-row" draggable="true" data-projector-id="${projector.id}">
        <button type="button" class="projector-list-item${selected ? " selected" : ""}${range.ok ? "" : " throw-warn"}" data-projector-id="${projector.id}" aria-pressed="${selected}">
          <span class="projector-swatch" style="background:${color}"></span>
          <span class="projector-list-body">
            <span class="projector-list-name">${escapeXml(projector.name)}</span>
            <span class="projector-list-meta">${escapeXml(role)} · ${cov.imageW.toFixed(1)} ${u} wide · ${specs.lumens.toLocaleString()} lm</span>
          </span>
        </button>
      </div>`;
  }

  function renderProjectorList() {
    const screen = getActiveScreen();
    if (!els.projectorList) return;
    if (!screen?.projectors.length && !screen?.projectorGroups.length) {
      els.projectorList.innerHTML = `<p class="resource-empty">Add a projector to this screen.</p>`;
      updateRemoveButtonUI();
      return;
    }

    let html = "";
    let colorIndex = 0;

    const ungrouped = getUngroupedProjectors(screen);
    if (ungrouped.length) {
      html += `<div class="projector-list-ungrouped" data-drop-ungrouped="true">`;
      for (const projector of ungrouped) {
        html += renderProjectorListItem(projector, screen, colorIndex++);
      }
      html += `</div>`;
    }

    for (const group of screen.projectorGroups) {
      const members = getGroupMembers(screen, group.id);
      const groupSelected = screen.activeGroupId === group.id && !screen.activeProjectorId;
      const roleLabel = PROJECTOR_ROLES.find((r) => r.id === group.role)?.label ?? group.role;
      html += `<div class="projector-group-block" data-group-block="${group.id}">`;
      html += `
        <div class="projector-group-header-row" draggable="true" data-group-id="${group.id}">
          <button type="button" class="projector-group-header${groupSelected ? " selected" : ""}" data-group-id="${group.id}" aria-pressed="${groupSelected}">
            <span class="projector-group-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span class="projector-group-body">
              <span class="projector-group-name">${escapeXml(group.name)}</span>
              <span class="projector-group-meta">${escapeXml(roleLabel)} · ${members.length} projector${members.length === 1 ? "" : "s"}</span>
            </span>
          </button>
        </div>`;
      html += `<div class="projector-group-members" data-group-members="${group.id}">`;
      for (const projector of members) {
        html += renderProjectorListItem(projector, screen, colorIndex++);
      }
      html += `</div></div>`;
    }

    els.projectorList.innerHTML = html;
    updateRemoveButtonUI();
  }

  function selectScreen(screenId) {
    persistScreenFromForm();
    persistProjectorFromForm();
    const prev = getActiveScreen();
    if (prev?.view) {
      prev.view = { ...projView };
    }
    state.activeScreenId = screenId;
    const screen = getActiveScreen();
    if (screen?.view) {
      Object.assign(projView, screen.view);
    } else {
      projView.panX = 0;
      projView.panY = 0;
      projView.zoom = 1;
    }
    loadScreenToForm(screen);
    renderScreenList();
    render();
  }

  function addScreen() {
    recordBefore("projector", "add-screen");
    persistScreenFromForm();
    persistProjectorFromForm();
    const screen = newScreen(state.screens.length);
    state.screens.push(screen);
    selectScreen(screen.id);
    setStatus(`Added ${screen.name}.`);
  }

  function removeActiveScreen() {
    const screen = getActiveScreen();
    if (!screen) return;
    if (state.screens.length <= 1) {
      setStatus("At least one projection screen is required.", true);
      return;
    }
    recordBefore("projector", "remove-screen");
    const name = screen.name;
    state.screens = state.screens.filter((s) => s.id !== screen.id);
    selectScreen(state.screens[0].id);
    setStatus(`Removed ${name}.`);
  }

  function loadGroupToForm(group) {
    if (!group) return;
    syncingForm = true;
    if (els.projectorRole) els.projectorRole.value = group.role;
    if (els.projectorGridCols) els.projectorGridCols.value = String(group.tileCols);
    if (els.projectorGridRows) els.projectorGridRows.value = String(group.tileRows);
    updateLayoutModeUI(group.layoutMode ?? "fit");
    if (els.projectorOverlapH) els.projectorOverlapH.value = String(group.overlapPxH ?? 0);
    if (els.projectorOverlapV) els.projectorOverlapV.value = String(group.overlapPxV ?? 0);
    updateRoleFieldVisibility({ role: group.role, layoutMode: group.layoutMode });
    syncingForm = false;
  }

  function loadGroupSelectionToForm(group) {
    if (!group) return;
    const screen = getActiveScreen();
    const members = screen ? getGroupMembers(screen, group.id) : [];
    loadGroupToForm(group);
    const template = members[0];
    if (!template) return;
    syncingForm = true;
    const make = getMakeForProjector(template);
    if (els.projectorMake) els.projectorMake.value = make;
    updateModelOptions(make, template.presetId, getProjectorAspectId(template));
    updateResolutionOptions(getProjectorAspectId(template), getProjectorResolutionId(template));
    updateOrientationUI(template.orientation ?? "landscape");
    if (els.projectorThrow) els.projectorThrow.value = String(template.throwDistance);
    if (els.projectorLensRatio) {
      els.projectorLensRatio.value = getThrowRatio(template).toFixed(2);
    }
    if (els.projectorImageWidth) {
      els.projectorImageWidth.value = imageWidthFromThrow(template).toFixed(2);
    }
    if (els.projectorImageHeight) {
      els.projectorImageHeight.value = nativeImageHeightFromThrow(template).toFixed(2);
    }
    updateThrowLockUI(template);
    updateLensRatioBounds(template);
    updateThrowHints(template, screen);
    syncingForm = false;
  }

  function selectGroup(groupId) {
    persistProjectorFromForm();
    const screen = getActiveScreen();
    if (!screen) return;
    const group = getProjectorGroup(screen, groupId);
    if (!group) return;
    screen.activeGroupId = groupId;
    screen.activeProjectorId = null;
    loadGroupSelectionToForm(group);
    renderProjectorList();
    render();
  }

  function selectProjector(projectorId) {
    persistProjectorFromForm();
    const screen = getActiveScreen();
    if (!screen) return;
    const projector = screen.projectors.find((p) => p.id === projectorId);
    screen.activeProjectorId = projectorId;
    screen.activeGroupId = projector?.groupId ?? null;
    loadProjectorToForm(getActiveProjector());
    renderProjectorList();
    render();
  }

  function addGroup() {
    const screen = getActiveScreen();
    if (!screen) return;
    recordBefore("projector", "add-group");
    persistProjectorFromForm();
    const group = newProjectorGroup(screen);
    screen.projectorGroups.push(group);
    selectGroup(group.id);
    setStatus(`Added ${group.name}. Use + to add projectors to this group.`);
  }

  function addProjector() {
    const screen = getActiveScreen();
    if (!screen) return;
    recordBefore("projector", "add-projector");
    if (getActiveProjector()) persistProjectorFromForm();

    const template = getActiveProjector();
    const index = screen.projectors.length;
    const projector = template ? projectorFromTemplate(template, index) : newProjector(index);
    readFormIntoProjector(projector);
    projector.name = defaultProjectorName(index);

    const role = projector.role;
    if (role === "blend" || role === "tile") {
      screen.projectors.push(projector);
      ensureGridGroup(screen, projector);
      const groupId = projector.groupId;
      const count = groupId ? getGroupMembers(screen, groupId).length : 1;
      if (groupId) selectGroup(groupId);
      setStatus(`Added ${count} projector${count === 1 ? "" : "s"}.`);
      return;
    }

    projector.groupId = null;

    const targetGroupId =
      screen.activeGroupId ??
      (screen.activeProjectorId
        ? screen.projectors.find((p) => p.id === screen.activeProjectorId)?.groupId
        : null);

    if (targetGroupId) {
      const group = getProjectorGroup(screen, targetGroupId);
      if (group) {
        const memberIndex = getGroupMembers(screen, targetGroupId).length;
        applyGroupSettingsToProjector(group, projector, memberIndex);
        if (template) copySharedProjectorSettings(template, projector);
        readFormIntoProjector(projector);
        applyGroupSettingsToProjector(group, projector, memberIndex);
      }
    }

    screen.projectors.push(projector);
    normalizeProjectorOrder(screen);
    selectProjector(projector.id);
    setStatus(`Added ${projector.name}${targetGroupId ? " to group" : ""}.`);
  }

  function removeActiveSelection() {
    const screen = getActiveScreen();
    if (!screen) return;

    recordBefore("projector", "remove-selection");
    if (isGroupSelection()) {
      const group = getProjectorGroup(screen, screen.activeGroupId);
      if (!group) return;
      const members = getGroupMembers(screen, group.id);
      const name = group.name;
      screen.projectors = screen.projectors.filter((p) => p.groupId !== group.id);
      screen.projectorGroups = screen.projectorGroups.filter((g) => g.id !== group.id);
      screen.activeGroupId = null;
      screen.activeProjectorId = screen.projectors[0]?.id ?? null;
      loadProjectorToForm(getActiveProjector());
      renderProjectorList();
      render();
      setStatus(`Removed ${name} and ${members.length} projector${members.length === 1 ? "" : "s"}.`);
      return;
    }

    const projector = getActiveProjector();
    if (!projector) return;
    const name = projector.name;
    const groupId = projector.groupId;
    screen.projectors = screen.projectors.filter((p) => p.id !== projector.id);
    if (groupId) {
      const membersLeft = getGroupMembers(screen, groupId);
      if (membersLeft.length === 0) {
        screen.projectorGroups = screen.projectorGroups.filter((g) => g.id !== groupId);
        screen.activeGroupId = null;
      }
    }
    screen.activeProjectorId = screen.projectors[0]?.id ?? null;
    loadProjectorToForm(getActiveProjector());
    renderProjectorList();
    render();
    setStatus(`Removed ${name}.`);
  }


  function fitProjView(contentW, contentH) {
    projView.contentW = contentW;
    projView.contentH = contentH;
    projView.panX = 0;
    projView.panY = 0;
    projView.zoom = 1;
    panZoom.applyView();
  }

  function applyProjView() {
    panZoom.applyView();
  }

  /** Show the computed pixel canvas for the active blend/tile group. */
  function updatePixelSummary() {
    if (!els.projectorPixelSummary) return;
    const screen = getActiveScreen();
    const projector = getActiveProjector();
    const groupId = screen?.activeGroupId ?? projector?.groupId ?? null;
    const isGrid = projector?.role === "blend" || projector?.role === "tile";
    const size = screen && groupId && isGrid ? groupPixelSize(screen, groupId) : null;
    if (!size) {
      els.projectorPixelSummary.hidden = true;
      return;
    }
    const overlapBits = [];
    if (size.cols > 1) overlapBits.push(`${size.overlapPxH} px H overlap`);
    if (size.rows > 1) overlapBits.push(`${size.overlapPxV} px V overlap`);
    els.projectorPixelSummary.textContent = `Blend canvas: ${size.width} × ${size.height} px${overlapBits.length ? ` (${overlapBits.join(", ")})` : ""}`;
    els.projectorPixelSummary.hidden = false;
  }

  function updateCanvasLegend() {
    const showCoverage = activeSidebarTab === "projectors";
    if (els.projLegendCoverage) els.projLegendCoverage.hidden = !showCoverage;
    if (els.projLegendOverlap) els.projLegendOverlap.hidden = !showCoverage;
    if (els.projLegendHint) {
      els.projLegendHint.hidden = !showCoverage;
      els.projLegendHint.textContent = showCoverage
        ? "Red = outside lens throw range"
        : "";
    }
  }

  function renderCanvas() {
    const screen = getActiveScreen();
    if (!screen) {
      els.projCanvasContainer?.classList.remove("has-proj");
      els.projEmptyState.hidden = false;
      els.projSvg.hidden = true;
      return;
    }

    const sw = screen.width;
    const sh = screen.height;
    if (sw <= 0 || sh <= 0) {
      els.projCanvasContainer?.classList.remove("has-proj");
      els.projEmptyState.hidden = false;
      els.projSvg.hidden = true;
      return;
    }

    els.projCanvasContainer?.classList.add("has-proj");
    els.projEmptyState.hidden = true;
    els.projSvg.hidden = false;

    const s = DIAGRAM_SCALE;
    const swDraw = sw * s;
    const shDraw = sh * s;
    const padX = 80;
    const padTop = 40;
    const padBottom = 40;
    const contentW = swDraw + padX;
    const contentH = shDraw + padTop + padBottom;
    const originX = contentW / 2;
    const originY = padTop + shDraw / 2;

    if (projView.contentW !== contentW || projView.contentH !== contentH) {
      fitProjView(contentW, contentH);
    }

    const u = unitLabel(screen.unit);

    let svg = "";

    svg += `<rect x="0" y="0" width="${contentW}" height="${contentH}" fill="transparent" />`;

    svg += `<rect x="${originX - swDraw / 2}" y="${originY - shDraw / 2}" width="${swDraw}" height="${shDraw}" class="proj-screen" rx="2" />`;
    svg += `<text x="${originX}" y="${originY - shDraw / 2 - 8}" class="proj-label proj-label-title" text-anchor="middle">${escapeXml(screen.name)}</text>`;
    const screenPx = screenPixelSize(screen);
    svg += `<text x="${originX}" y="${originY + shDraw / 2 + 16}" class="proj-label" text-anchor="middle">${sw.toFixed(1)} × ${sh.toFixed(1)} ${u}${screenPx ? ` · ${screenPx.width} × ${screenPx.height} px` : ""}</text>`;

    if (activeSidebarTab === "projectors") {
      screen.projectors.forEach((projector, index) => {
        const color = PROJECTOR_COLORS[index % PROJECTOR_COLORS.length];
        const roleGroup = getRoleGroup(screen, projector);
        const cov = computeCoverage(projector, screen, index, roleGroup);
        const absLeft = originX + cov.left * s;
        const absTop = originY + cov.top * s;
        const covW = cov.width * s;
        const covH = cov.height * s;
        const isActive = projector.id === screen.activeProjectorId;

        svg += `<rect x="${absLeft}" y="${absTop}" width="${covW}" height="${covH}" class="proj-coverage${isActive ? " is-active" : ""}${cov.throwOk.ok ? "" : " throw-out"}" fill="${color}" fill-opacity="0.18" stroke="${color}" />`;

        if ((projector.role === "blend" || projector.role === "tile") && cov.overlapH > 0) {
          const { col, cols } = getGridIndices(projector);
          if (col < cols - 1) {
            const overlapW = covW * cov.overlapH;
            svg += `<rect x="${absLeft + covW - overlapW}" y="${absTop}" width="${overlapW}" height="${covH}" class="proj-overlap" />`;
          }
        }
        if ((projector.role === "blend" || projector.role === "tile") && cov.overlapV > 0) {
          const { row, rows } = getGridIndices(projector);
          if (row < rows - 1) {
            const overlapH = covH * cov.overlapV;
            svg += `<rect x="${absLeft}" y="${absTop + covH - overlapH}" width="${covW}" height="${overlapH}" class="proj-overlap" />`;
          }
        }
      });
    }

    els.projSvg.setAttribute("width", String(contentW));
    els.projSvg.setAttribute("height", String(contentH));
    els.projSvg.setAttribute("viewBox", `0 0 ${contentW} ${contentH}`);
    els.projSvg.innerHTML = svg;
    applyProjView();

    const screenName = screen.name;
    const proj = getActiveProjector();
    const outOfRange =
      activeSidebarTab === "projectors" &&
      screen.projectors.some((p) => !throwInRange(p, imageWidthFromThrow(p)).ok);
    setStatus(
      outOfRange
        ? `${screenName} — ${screen.projectors.length} projector(s); check throw distances highlighted in red.`
        : `${screenName} — ${screen.projectors.length} projector(s) on ${sw.toFixed(1)}×${sh.toFixed(1)} ${u} screen.`
    );
    if (proj) updateThrowHints(proj, screen);
    updatePixelSummary();
    updateScreenSummary(screen);
    updateCanvasLegend();
  }

  function render() {
    renderScreenList();
    renderProjectorList();
    renderCanvas();
    updateScreenSummary(getActiveScreen());
  }

  function syncLinkedDimInput(field, screen) {
    syncingForm = true;
    if (field === "width" && !isCustomAspect(screen) && els.screenHeight) {
      els.screenHeight.value = formatDim(screen.height);
    } else if (field === "height" && !isCustomAspect(screen) && els.screenWidth) {
      els.screenWidth.value = formatDim(screen.width);
    } else if (field === "aspect" && !isCustomAspect(screen) && els.screenHeight) {
      els.screenHeight.value = formatDim(screen.height);
    }
    syncingForm = false;
  }

  function onScreenDimInput(field) {
    recordBefore("projector", "screen-dim", { coalesceMs: 400 });
    if (syncingForm) return;
    const screen = getActiveScreen();
    if (!screen) return;
    screen.unit = getScreenUnit();
    screen.aspectId = els.screenAspect?.value ?? screen.aspectId;

    if (field === "width") {
      const value = readDimInput(els.screenWidth);
      if (value === null) return;
      screen.width = value;
      linkFromWidth(screen);
    } else if (field === "height") {
      const value = readDimInput(els.screenHeight);
      if (value === null) return;
      screen.height = value;
      linkFromHeight(screen);
    } else if (field === "aspect") {
      updateDimLinkUI(screen);
      if (!isCustomAspect(screen)) {
        screen.width = readDimInput(els.screenWidth) ?? screen.width;
        linkFromWidth(screen);
      }
    }

    syncLinkedDimInput(field, screen);
    updateScreenSummary(screen);
    renderCanvas();
  }

  function onScreenDimBlur(field) {
    const screen = getActiveScreen();
    if (!screen) return;

    if (field === "width" && els.screenWidth) {
      const value = readDimInput(els.screenWidth);
      if (value === null) {
        els.screenWidth.value = formatDim(screen.width);
        return;
      }
      screen.width = value;
      linkFromWidth(screen);
      els.screenWidth.value = formatDim(screen.width);
      if (!isCustomAspect(screen) && els.screenHeight) {
        els.screenHeight.value = formatDim(screen.height);
      }
    } else if (field === "height" && els.screenHeight) {
      const value = readDimInput(els.screenHeight);
      if (value === null) {
        els.screenHeight.value = formatDim(screen.height);
        return;
      }
      screen.height = value;
      linkFromHeight(screen);
      els.screenHeight.value = formatDim(screen.height);
      if (!isCustomAspect(screen) && els.screenWidth) {
        els.screenWidth.value = formatDim(screen.width);
      }
    }

    updateScreenSummary(screen);
    renderCanvas();
  }

  function commitThrowField(source) {
    if (syncingForm) return;
    recordBefore("projector", "throw-field");
    const editedField =
      source === "imageWidth" || source === "imageHeight"
        ? "image"
        : source === "zoom"
          ? "zoom"
          : "throw";
    const screen = getActiveScreen();
    const projector = getActiveProjector();
    if (!projector || isProjectorThrowFieldComputed(projector, editedField)) return;

    if (source === "imageWidth" || source === "imageHeight") {
      linkThrowImageFields(projector, source);
    }

    readFormIntoProjector(projector);

    applyThrowRecalc(projector, editedField);
    if (isGroupSelection() && screen?.activeGroupId) {
      syncLensSettingsToGroupMembers(screen, screen.activeGroupId, projector);
    } else {
      syncGroupFromProjector(screen, projector);
    }
    syncThrowFieldsToForm(projector);

    updateThrowHints(projector, screen);
    renderProjectorList();
    renderScreenList();
    renderCanvas();
  }

  function bindThrowField(el, source) {
    if (!el) return;
    on(el, "blur", () => commitThrowField(source));
    on(el, "change", () => commitThrowField(source));
    on(el, "keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitThrowField(source);
        el.blur();
      }
    });
  }

  function onThrowLockClick(field) {
    const screen = getActiveScreen();
    const projector = getActiveProjector();
    if (!projector) return;
    recordBefore("projector", "throw-lock");
    const locks = new Set(projector.throwLocks ?? ["throw"]);
    if (locks.has(field)) {
      locks.delete(field);
    } else {
      locks.add(field);
    }
    const nextLocks = /** @type {ThrowLockField[]} */ ([...locks]);
    projector.throwLocks = nextLocks;
    if (isGroupSelection() && screen?.activeGroupId) {
      for (const member of getGroupMembers(screen, screen.activeGroupId)) {
        member.throwLocks = [...nextLocks];
      }
    } else if (projector.groupId && screen) {
      for (const member of getGroupMembers(screen, projector.groupId)) {
        member.throwLocks = [...nextLocks];
      }
    }
    updateThrowLockUI(projector);
    applyThrowRecalc(projector, field);
    if (isGroupSelection() && screen?.activeGroupId) {
      syncLensSettingsToGroupMembers(screen, screen.activeGroupId, projector);
    } else {
      syncGroupFromProjector(screen, projector);
    }
    syncThrowFieldsToForm(projector);
    updateThrowHints(projector, screen);
    renderProjectorList();
    renderScreenList();
    renderCanvas();
  }

  /** @param {string} target */
  function setSidebarTab(target) {
    const tabId = target === "projectors" ? "projectors" : "screen";
    sidebarTabs?.setActive(tabId);
  }

  populatePresets();
  if (els.projSidebar) {
    sidebarTabs = bindSidebarTabs(els.projSidebar, {
      panelIdForTab: (tabId) => `proj-sidebar-${tabId}`,
      onChange: (tabId) => {
        activeSidebarTab = tabId;
        renderCanvas();
      },
    });
  }
  if (els.projCanvasContainer) {
    panZoom.bind();
  }
  setupProjectorListDragDrop();

  function setScreenUnit(unit) {
    const screen = getActiveScreen();
    if (!screen || screen.unit === unit) return;
    persistScreenFromForm();
    persistProjectorFromForm();
    convertScreenToUnit(screen, unit);
    setScreenUnitToggle(unit);
    loadScreenToForm(screen);
    render();
    setStatus(`Switched to ${unit === "m" ? "meters" : "feet"}.`);
  }

  on(els.selectScreenFt, "click", () => setScreenUnit("ft"));
  on(els.selectScreenM, "click", () => setScreenUnit("m"));
  on(els.screenAspect, "change", () => onScreenDimInput("aspect"));
  on(els.screenWidth, "input", () => onScreenDimInput("width"));
  on(els.screenWidth, "blur", () => onScreenDimBlur("width"));
  on(els.screenHeight, "input", () => onScreenDimInput("height"));
  on(els.screenHeight, "blur", () => onScreenDimBlur("height"));

  function onProjectorFormChange(recalcThrow = false) {
    recordBefore("projector", "form", { coalesceMs: 400 });
    persistProjectorFromForm();
    const p = getActiveProjector();
    if (p && recalcThrow) {
      applyThrowRecalc(p, p.throwLocks?.[0] ?? "throw");
      syncThrowFieldsToForm(p);
      syncSuggestedLens(p);
    }
    updateRoleFieldVisibility(p);
    render();
  }

  on(els.projectorMake, "change", () => {
    if (!els.projectorMake) return;
    updateModelOptions(els.projectorMake.value);
    onProjectorFormChange(true);
  });
  on(els.projectorModel, "change", () => {
    const make = els.projectorMake?.value ?? CUSTOM_MAKE;
    if (make !== CUSTOM_MAKE) {
      const models = getProjectorModelsForManufacturer(make);
      const preset = models.find((m) => m.id === els.projectorModel?.value);
      if (preset && els.projectorAspect) {
        els.projectorAspect.value = defaultProjectorAspectForPreset(preset);
      }
    }
    onProjectorFormChange(true);
  });
  on(els.projectorAspect, "change", () => {
    // Same tier, new aspect: 1920×1080 becomes 1920×1200, etc.
    const currentTier = els.projectorResolution?.value === "uhd" ? "uhd" : "hd";
    updateResolutionOptions(els.projectorAspect?.value ?? "16:9", currentTier);
    onProjectorFormChange(true);
  });
  on(els.projectorResolution, "change", () => onProjectorFormChange());
  on(els.layoutModeFit, "click", () => {
    updateLayoutModeUI("fit");
    onProjectorFormChange();
  });
  on(els.layoutModeOverlap, "click", () => {
    updateLayoutModeUI("overlap");
    onProjectorFormChange();
  });
  on(els.orientationLandscape, "click", () => {
    updateOrientationUI("landscape");
    onProjectorFormChange();
  });
  on(els.orientationPortrait, "click", () => {
    updateOrientationUI("portrait");
    onProjectorFormChange();
  });

  [
    els.projectorRole,
    els.customThrowMin,
    els.customThrowMax,
    els.customLumens,
    els.customResW,
    els.customResH,
    els.projectorOffsetX,
    els.projectorOffsetY,
    els.projectorGridCols,
    els.projectorGridRows,
    els.projectorOverlapH,
    els.projectorOverlapV,
  ].forEach((el) => {
    on(el, "change", () => {
      onProjectorFormChange(
        el === els.customThrowMin || el === els.customThrowMax
      );
    });
    on(el, "input", () => {
      if (el === els.projectorRole) updateRoleFieldVisibility(getActiveProjector());
      persistProjectorFromForm();
      render();
    });
  });

  bindThrowField(els.projectorThrow, "throw");
  bindThrowField(els.projectorImageWidth, "imageWidth");
  bindThrowField(els.projectorImageHeight, "imageHeight");
  bindThrowField(els.projectorLensRatio, "zoom");

  [els.throwLockThrow, els.throwLockImage, els.throwLockZoom].forEach((btn) => {
    on(btn, "click", () => {
      const field = btn?.dataset.throwLock;
      if (field === "throw" || field === "image" || field === "zoom") {
        onThrowLockClick(field);
      }
    });
  });

  on(els.screenNew, "click", addScreen);
  on(els.screenRemove, "click", removeActiveScreen);
  on(els.screenList, "click", (e) => {
    if (e.target.closest(".grid-name-editor")) return;
    const item = e.target.closest("[data-screen-id]");
    if (!item) return;
    const screenId = item.dataset.screenId;
    if (!screenId) return;
    window.clearTimeout(screenListSelectDelay);
    screenListSelectDelay = window.setTimeout(() => {
      screenListSelectDelay = null;
      selectScreen(screenId);
    }, 220);
  });
  on(els.screenList, "dblclick", (e) => {
    const nameEl = e.target.closest(".grid-item-name");
    if (!nameEl) return;
    window.clearTimeout(screenListSelectDelay);
    screenListSelectDelay = null;
    e.preventDefault();
    e.stopPropagation();
    openScreenNameEditor(nameEl);
  });
  on(els.screenList, "keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest("[data-screen-id]");
    if (!item || !els.screenList?.contains(item)) return;
    e.preventDefault();
    const screenId = item.dataset.screenId;
    if (screenId) selectScreen(screenId);
  });

  on(els.projectorNew, "click", addProjector);
  on(els.projectorNewGroup, "click", addGroup);
  on(els.projectorRemove, "click", removeActiveSelection);
  on(els.projectorList, "click", (e) => {
    if (listDrag.suppressClick) return;
    const projectorItem = e.target.closest(".projector-list-item[data-projector-id]");
    if (projectorItem) {
      selectProjector(projectorItem.dataset.projectorId);
      return;
    }
    const groupHeader = e.target.closest(".projector-group-header[data-group-id]");
    if (groupHeader) {
      selectGroup(groupHeader.dataset.groupId);
    }
  });

  on(els.expandAllSections, "click", () => {
    els.projSidebar.querySelectorAll("details.panel-section").forEach((d) => {
      d.open = true;
    });
  });
  on(els.collapseAllSections, "click", () => {
    els.projSidebar.querySelectorAll("details.panel-section").forEach((d) => {
      d.open = false;
    });
  });

  on(els.resetProjView, "click", () => {
    const screen = getActiveScreen();
    if (!screen) return;
    fitProjView(projView.contentW || 400, projView.contentH || 300);
    setStatus("Reset canvas view.");
  });

  try {
    const firstScreen = newScreen(0);
    state.screens.push(firstScreen);
    state.activeScreenId = firstScreen.id;
    loadScreenToForm(firstScreen);
    render();
  } catch (error) {
    console.error("Projector Calculator startup failed:", error);
    setStatus("Projector Calculator failed to start — see browser console.", true);
  }

  function exportState() {
    // Read-only snapshot — see led-calculator exportState note. Cross-calculator
    // peeks must not write stale sidebar form values over imported screens.
    const active = getActiveScreen();
    if (active) {
      active.view = { ...projView };
    }
    return {
      screens: deepClone(state.screens),
      activeScreenId: state.activeScreenId,
      activeSidebarTab,
    };
  }

  /** Flush sidebar form values onto the active screen before a user-initiated save. */
  function flushFormToState() {
    persistScreenFromForm();
    persistProjectorFromForm();
    const active = getActiveScreen();
    if (active) {
      active.view = { ...projView };
    }
  }

  /** @param {object} data */
  function importState(data) {
    const normalized = normalizeProjectorState(data);
    closeScreenNameEditor();
    state.screens = deepClone(normalized.screens);
    state.activeScreenId = normalized.activeScreenId;
    setSidebarTab(normalized.activeSidebarTab);
    const screen = getActiveScreen();
    if (screen?.view) {
      Object.assign(projView, screen.view);
    } else {
      projView.panX = 0;
      projView.panY = 0;
      projView.zoom = 1;
      projView.contentW = 0;
      projView.contentH = 0;
    }
    loadScreenToForm(screen);
    render();
  }

  return { exportState, importState, flushFormToState };
}

export const calculatorPlugin = {
  meta: {
    id: "projector-calculator",
    tabPanelId: "projector-calculator",
    stateKey: "projector",
    label: "Projector Calculator",
    requiredForSave: true,
    validateState: normalizeProjectorState,
  },
  init: initProjectorCalculator,
};
