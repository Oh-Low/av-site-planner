import { deepClone } from "../shared/clone.js";
import { uid } from "../shared/id.js";
import {
  defaultDrawStyle,
  normalizeDecoration,
  normalizeDrawStyle,
} from "./decorations.js?v=3";
import { roundTo } from "./numbers.js?v=1";
import { DEFAULT_ORIENTATION, DEFAULT_PAPER_SIZE_ID, PAPER_SIZES } from "./paper-sizes.js";
import {
  normalizeLibraryFolders,
  normalizeLibraryPlacements,
} from "./element-library.js?v=1";

/**
 * @typedef {{
 *   show: string,
 *   venue: string,
 *   client: string,
 *   date: string,
 *   company: string,
 *   approved: string,
 *   checked: string,
 *   drawnBy: string,
 *   code: string,
 *   dwgNo: string,
 *   revision: string,
 *   scale: string,
 *   weight: string,
 * }} ProjectIdentity
 *
 * @typedef {{
 *   id: string,
 *   type: string,
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 *   z: number,
 *   locked?: boolean,
 *   content?: Record<string, unknown>,
 *   overrides?: Record<string, string>,
 *   showOnAllSheets?: boolean,
 *   sheetId?: string | null,
 *   hiddenOnSheets?: string[],
 * }} PageElement
 *
 * @typedef {{
 *   id: string,
 *   typeId: string,
 *   sourceKey: string | null,
 *   title: string,
 *   included: boolean,
 *   order: number,
 *   notes: string,
 *   elements: PageElement[],
 *   manual?: boolean,
 *   folderId?: string | null,
 * }} SheetInstance
 *
 * @typedef {{
 *   identity: ProjectIdentity,
 *   paper: { size: string, orientation: "landscape" | "portrait" },
 *   titleBlockDefault: boolean,
 *   titleBlockLogo?: string | null,
 *   sheets: SheetInstance[],
 *   sharedElements: PageElement[],
 *   decorations: import("./decorations.js").PageDecoration[],
 *   drawStyle: import("./decorations.js").PageDecoration["style"],
 *   activeSheetId: string | null,
 *   selectedElementId: string | null,
 *   selectedDecorationId: string | null,
 *   rightPanelCollapsed?: boolean,
 *   collapsedFolders?: Record<string, boolean>,
 *   libraryFolders?: import("./element-library.js").LibraryFolder[],
 *   libraryPlacements?: Record<string, string | null>,
 *   sheetFolders?: import("./element-library.js").LibraryFolder[],
 *   grid?: { snap: boolean, visible: boolean, sizeIn: number },
 * }} PaperworkState
 */

/** Default paperwork page grid (inches). */
export const DEFAULT_GRID_SIZE_IN = 0.25;

/**
 * @param {unknown} raw
 * @returns {{ snap: boolean, visible: boolean, sizeIn: number }}
 */
export function normalizeGrid(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const sizeIn = Number(r.sizeIn);
  return {
    snap: r.snap !== false,
    visible: r.visible !== false,
    sizeIn:
      Number.isFinite(sizeIn) && sizeIn > 0
        ? Math.min(2, Math.max(0.05, roundTo(sizeIn)))
        : DEFAULT_GRID_SIZE_IN,
  };
}

/** @returns {ProjectIdentity} */
export function emptyIdentity() {
  return {
    show: "",
    venue: "",
    client: "",
    date: new Date().toISOString().slice(0, 10),
    company: "",
    approved: "",
    checked: "",
    drawnBy: "",
    code: "",
    dwgNo: "",
    revision: "A",
    scale: "N/A",
    weight: "",
  };
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeTitleBlockLogo(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("data:image/")) return null;
  if (value.length > 2_500_000) return null;
  return value;
}

/** @param {string} fieldId */
export function isIdentityField(fieldId) {
  return Object.prototype.hasOwnProperty.call(emptyIdentity(), fieldId);
}

/** @returns {PaperworkState} */
export function emptyPaperworkState() {
  return {
    identity: emptyIdentity(),
    paper: { size: DEFAULT_PAPER_SIZE_ID, orientation: DEFAULT_ORIENTATION },
    titleBlockDefault: true,
    titleBlockLogo: null,
    sheets: [],
    sharedElements: [],
    decorations: [],
    drawStyle: defaultDrawStyle(),
    activeSheetId: null,
    selectedElementId: null,
    selectedDecorationId: null,
    rightPanelCollapsed: false,
    collapsedFolders: {},
    libraryFolders: [],
    libraryPlacements: {},
    sheetFolders: [],
    grid: normalizeGrid(null),
  };
}

/** @param {unknown} raw @returns {ProjectIdentity} */
export function normalizeIdentity(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const base = emptyIdentity();
  return {
    show: typeof r.show === "string" ? r.show : base.show,
    venue: typeof r.venue === "string" ? r.venue : base.venue,
    client: typeof r.client === "string" ? r.client : base.client,
    date: typeof r.date === "string" ? r.date : base.date,
    company: typeof r.company === "string" ? r.company : base.company,
    approved: typeof r.approved === "string" ? r.approved : base.approved,
    checked: typeof r.checked === "string" ? r.checked : base.checked,
    drawnBy: typeof r.drawnBy === "string" ? r.drawnBy : base.drawnBy,
    code: typeof r.code === "string" ? r.code : base.code,
    dwgNo: typeof r.dwgNo === "string" ? r.dwgNo : base.dwgNo,
    revision: typeof r.revision === "string" ? r.revision : base.revision,
    scale: typeof r.scale === "string" ? r.scale : base.scale,
    weight: typeof r.weight === "string" ? r.weight : base.weight,
  };
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {PageElement}
 */
export function normalizeElement(raw, index = 0) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const overrides =
    r.overrides && typeof r.overrides === "object" && !Array.isArray(r.overrides)
      ? Object.fromEntries(
          Object.entries(/** @type {Record<string, unknown>} */ (r.overrides)).filter(
            ([, v]) => typeof v === "string"
          )
        )
      : {};
  const content =
    r.content && typeof r.content === "object" && !Array.isArray(r.content)
      ? /** @type {Record<string, unknown>} */ ({ ...r.content })
      : {};
  const hiddenOnSheets = Array.isArray(r.hiddenOnSheets)
    ? r.hiddenOnSheets.filter((id) => typeof id === "string")
    : [];
  return {
    id: typeof r.id === "string" && r.id ? r.id : uid("el"),
    type: typeof r.type === "string" && r.type ? r.type : "text",
    x: Number.isFinite(Number(r.x)) ? roundTo(r.x) : 0.5,
    y: Number.isFinite(Number(r.y)) ? roundTo(r.y) : 0.5 + index * 0.25,
    w: Math.max(0.25, roundTo(Number(r.w) || 4)),
    h: Math.max(0.25, roundTo(Number(r.h) || 1)),
    z: Number.isFinite(Number(r.z)) ? Number(r.z) : index,
    locked: r.locked === true,
    content,
    overrides: /** @type {Record<string, string>} */ (overrides),
    showOnAllSheets: r.showOnAllSheets === true,
    sheetId: typeof r.sheetId === "string" ? r.sheetId : null,
    hiddenOnSheets,
  };
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {SheetInstance}
 */
export function normalizeSheet(raw, index = 0) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const elements = Array.isArray(r.elements)
    ? r.elements.map((el, i) => normalizeElement(el, i))
    : [];
  const sheet = {
    id: typeof r.id === "string" && r.id ? r.id : uid("sheet"),
    typeId: typeof r.typeId === "string" && r.typeId ? r.typeId : "cover",
    sourceKey: typeof r.sourceKey === "string" ? r.sourceKey : null,
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : `Sheet ${index + 1}`,
    included: r.included !== false,
    order: Number.isFinite(Number(r.order)) ? Number(r.order) : index,
    notes: typeof r.notes === "string" ? r.notes : "",
    elements,
    manual: r.manual === true || r.typeId === "custom-plate",
  };
  if (r.folderId === null) sheet.folderId = null;
  else if (typeof r.folderId === "string") sheet.folderId = r.folderId;
  return sheet;
}

/** @param {unknown} raw @returns {PaperworkState} */
export function normalizePaperworkState(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const paperRaw = /** @type {Record<string, unknown>} */ (r.paper ?? {});
  const size =
    typeof paperRaw.size === "string" && PAPER_SIZES.some((s) => s.id === paperRaw.size)
      ? paperRaw.size
      : DEFAULT_PAPER_SIZE_ID;
  const orientation = paperRaw.orientation === "portrait" ? "portrait" : "landscape";
  const sheets = Array.isArray(r.sheets)
    ? r.sheets.map((s, i) => normalizeSheet(s, i)).sort((a, b) => a.order - b.order)
    : [];
  const activeSheetId =
    typeof r.activeSheetId === "string" && sheets.some((s) => s.id === r.activeSheetId)
      ? r.activeSheetId
      : sheets[0]?.id ?? null;
  const collapsedFolders = {};
  const rawCollapsed = r.collapsedFolders;
  if (rawCollapsed && typeof rawCollapsed === "object" && !Array.isArray(rawCollapsed)) {
    for (const [key, value] of Object.entries(
      /** @type {Record<string, unknown>} */ (rawCollapsed)
    )) {
      if (typeof key === "string" && typeof value === "boolean") {
        collapsedFolders[key] = value;
      }
    }
  }

  const decorations = Array.isArray(r.decorations)
    ? r.decorations.map((d, i) => normalizeDecoration(d, i))
    : [];
  const sharedElements = Array.isArray(r.sharedElements)
    ? r.sharedElements.map((el, i) => normalizeElement(el, i))
    : [];

  return {
    identity: normalizeIdentity(r.identity),
    paper: { size, orientation },
    titleBlockDefault: r.titleBlockDefault !== false,
    titleBlockLogo: normalizeTitleBlockLogo(r.titleBlockLogo),
    sheets,
    sharedElements,
    decorations,
    drawStyle: normalizeDrawStyle(r.drawStyle),
    activeSheetId,
    selectedElementId: typeof r.selectedElementId === "string" ? r.selectedElementId : null,
    selectedDecorationId:
      typeof r.selectedDecorationId === "string" ? r.selectedDecorationId : null,
    rightPanelCollapsed: r.rightPanelCollapsed === true,
    collapsedFolders,
    libraryFolders: normalizeLibraryFolders(r.libraryFolders),
    libraryPlacements: normalizeLibraryPlacements(r.libraryPlacements),
    sheetFolders: normalizeLibraryFolders(r.sheetFolders),
    grid: normalizeGrid(r.grid),
  };
}

/**
 * @param {Partial<PageElement> & { type: string }} spec
 * @returns {PageElement}
 */
export function createElement(spec) {
  return normalizeElement({
    id: uid("el"),
    z: 0,
    x: 0.5,
    y: 0.5,
    w: 4,
    h: 1,
    content: {},
    overrides: {},
    ...spec,
  });
}

/**
 * @param {number} index
 * @param {string} [title]
 * @returns {SheetInstance}
 */
export function createManualSheet(index, title = "Blank Plate") {
  const id = uid("sheet");
  return normalizeSheet(
    {
      id,
      typeId: "custom-plate",
      sourceKey: id,
      title,
      included: true,
      order: index,
      notes: "",
      elements: [],
      manual: true,
    },
    index
  );
}

/** @param {string} title */
function nextCopyTitle(title) {
  const base = String(title ?? "Sheet").trim() || "Sheet";
  const match = base.match(/^(.*) \(copy(?: (\d+))?\)$/i);
  if (match) {
    const n = match[2] ? Number(match[2]) + 1 : 2;
    return `${match[1]} (copy ${n})`;
  }
  return `${base} (copy)`;
}

/**
 * Deep-copy a sheet with new ids. Marked manual so Generate/sync won't
 * collapse it into the original calculator seed.
 * @param {SheetInstance} sheet
 * @param {number} order
 * @returns {SheetInstance}
 */
export function duplicateSheet(sheet, order) {
  const id = uid("sheet");
  const cloned = deepClone(sheet);
  const keepSource = sheet.manual !== true && sheet.typeId !== "custom-plate";
  return normalizeSheet(
    {
      ...cloned,
      id,
      title: nextCopyTitle(sheet.title),
      order,
      manual: true,
      sourceKey: keepSource ? sheet.sourceKey : id,
      elements: (Array.isArray(cloned.elements) ? cloned.elements : []).map((el, i) =>
        normalizeElement({ ...el, id: uid("el") }, i)
      ),
    },
    order
  );
}
