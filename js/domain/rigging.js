/**
 * Rigging domain — sized part catalog, state normalize, equal-share load solver.
 * World units are inches. UI lives in js/rigging-calculator.js.
 */

import {
  SHACKLE_STYLES,
  parseShackleTypeId,
  shackleEnvelope,
  shackleTypeId,
} from "./rigging-shackles.js";

/**
 * @typedef {"support" | "load" | "either"} AttachRole
 *
 * @typedef {{
 *   id: string,
 *   role: AttachRole,
 *   x: number,
 *   y: number,
 * }} AttachPointDef
 *
 * @typedef {{
 *   weightLb?: number,
 *   lengthIn?: number,
 *   widthIn?: number,
 *   heightIn?: number,
 *   wllLb?: number,
 *   notes?: string,
 * }} RiggingPartProps
 *
 * @typedef {{
 *   typeId: string,
 *   label: string,
 *   category: string,
 *   isAnchor?: boolean,
 *   symbol?: string,
 *   defaults: RiggingPartProps,
 *   attachPoints: (props: RiggingPartProps) => AttachPointDef[],
 *   size: (props: RiggingPartProps) => { width: number, height: number },
 * }} RiggingCatalogEntry
 *
 * @typedef {{
 *   id: string,
 *   typeId: string,
 *   name: string,
 *   x: number,
 *   y: number,
 *   rotationDeg: number,
 *   props: RiggingPartProps,
 * }} RiggingPart
 *
 * @typedef {{
 *   id: string,
 *   aPartId: string,
 *   aAttachId: string,
 *   bPartId: string,
 *   bAttachId: string,
 * }} RiggingMate
 *
 * @typedef {{
 *   parts: RiggingPart[],
 *   mates: RiggingMate[],
 *   grid: { snap: boolean, sizeIn: number },
 * }} RiggingState
 */

/** @param {number} n @param {number} [fallback] */
function num(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** @param {RiggingPartProps} props @param {RiggingPartProps} defaults */
export function mergePartProps(props, defaults) {
  return {
    weightLb: props.weightLb != null ? num(props.weightLb) : defaults.weightLb,
    lengthIn: props.lengthIn != null ? num(props.lengthIn) : defaults.lengthIn,
    widthIn: props.widthIn != null ? num(props.widthIn) : defaults.widthIn,
    heightIn: props.heightIn != null ? num(props.heightIn) : defaults.heightIn,
    wllLb: props.wllLb != null ? num(props.wllLb) : defaults.wllLb,
    notes: typeof props.notes === "string" ? props.notes : defaults.notes ?? "",
  };
}

/**
 * Build one catalog entry per shackle style × size.
 * @returns {RiggingCatalogEntry[]}
 */
function buildShackleCatalogEntries() {
  /** @type {RiggingCatalogEntry[]} */
  const entries = [];
  for (const style of SHACKLE_STYLES) {
    for (const size of style.sizes) {
      const typeId = shackleTypeId(style.styleId, size.sizeKey);
      const env = shackleEnvelope(size, style.pinKind);
      const wllLb = Math.round(size.wllTons * 2000);
      entries.push({
        typeId,
        label: `${style.label} ${size.label}`,
        category: `Shackles · ${style.label}`,
        symbol: style.bowKind === "anchor" ? "shackle-anchor" : "shackle-chain",
        defaults: {
          widthIn: env.width,
          heightIn: env.height,
          wllLb,
          weightLb: size.weightLb,
          notes: `${style.label} · ${size.label} · ${size.wllTons} t WLL`,
        },
        attachPoints: (p) => {
          const h = num(p.heightIn, env.height);
          return [
            { id: "bottom", role: "support", x: 0, y: h / 2 },
            { id: "top", role: "load", x: 0, y: -h / 2 },
          ];
        },
        size: (p) => ({
          width: num(p.widthIn, env.width),
          height: num(p.heightIn, env.height),
        }),
      });
    }
  }
  return entries;
}

/** @type {RiggingCatalogEntry[]} */
export const RIGGING_CATALOG = [
  {
    typeId: "load-led",
    label: "Load / LED wall",
    category: "Loads",
    defaults: { weightLb: 1000, widthIn: 120, heightIn: 72, wllLb: undefined },
    attachPoints: (p) => [{ id: "top", role: "load", x: 0, y: -num(p.heightIn, 72) / 2 }],
    size: (p) => ({ width: num(p.widthIn, 120), height: num(p.heightIn, 72) }),
  },
  {
    typeId: "led-hanging-bar",
    label: "LED hanging bar",
    category: "Bars",
    defaults: { widthIn: 120, heightIn: 3, wllLb: 2000, weightLb: 25 },
    attachPoints: (p) => {
      const w = num(p.widthIn, 120);
      const h = num(p.heightIn, 3);
      const yTop = -h / 2;
      const yBot = h / 2;
      const inset = Math.min(12, w / 4);
      return [
        { id: "bottom", role: "support", x: 0, y: yBot },
        { id: "top-left", role: "load", x: -w / 2 + inset, y: yTop },
        { id: "top-right", role: "load", x: w / 2 - inset, y: yTop },
      ];
    },
    size: (p) => ({ width: num(p.widthIn, 120), height: num(p.heightIn, 3) }),
  },
  ...buildShackleCatalogEntries(),
  {
    typeId: "turnbuckle",
    label: "Turnbuckle",
    category: "Hardware",
    defaults: { widthIn: 2, lengthIn: 12, wllLb: 1500, weightLb: 2 },
    attachPoints: (p) => {
      const h = num(p.lengthIn, 12);
      return [
        { id: "bottom", role: "support", x: 0, y: h / 2 },
        { id: "top", role: "load", x: 0, y: -h / 2 },
      ];
    },
    size: (p) => ({ width: num(p.widthIn, 2), height: num(p.lengthIn, 12) }),
  },
  {
    typeId: "aircraft-cable",
    label: "Aircraft cable",
    category: "Soft goods",
    defaults: { widthIn: 0.5, lengthIn: 48, wllLb: 2000, weightLb: 1 },
    attachPoints: (p) => {
      const h = num(p.lengthIn, 48);
      return [
        { id: "bottom", role: "support", x: 0, y: h / 2 },
        { id: "top", role: "load", x: 0, y: -h / 2 },
      ];
    },
    size: (p) => ({ width: Math.max(num(p.widthIn, 0.5), 0.5), height: num(p.lengthIn, 48) }),
  },
  {
    typeId: "spanset",
    label: "Spanset",
    category: "Soft goods",
    defaults: { widthIn: 2, lengthIn: 36, wllLb: 5000, weightLb: 2 },
    attachPoints: (p) => {
      const h = num(p.lengthIn, 36);
      return [
        { id: "bottom", role: "support", x: 0, y: h / 2 },
        { id: "top", role: "load", x: 0, y: -h / 2 },
      ];
    },
    size: (p) => ({ width: num(p.widthIn, 2), height: num(p.lengthIn, 36) }),
  },
  {
    typeId: "truss",
    label: "Truss section",
    category: "Truss",
    defaults: { widthIn: 144, heightIn: 12, wllLb: 4000, weightLb: 80 },
    attachPoints: (p) => {
      const w = num(p.widthIn, 144);
      const h = num(p.heightIn, 12);
      const yBot = h / 2;
      const yTop = -h / 2;
      const inset = Math.min(18, w / 4);
      return [
        { id: "bottom-left", role: "support", x: -w / 2 + inset, y: yBot },
        { id: "bottom-right", role: "support", x: w / 2 - inset, y: yBot },
        { id: "top-left", role: "load", x: -w / 2 + inset, y: yTop },
        { id: "top-right", role: "load", x: w / 2 - inset, y: yTop },
        { id: "top-center", role: "load", x: 0, y: yTop },
      ];
    },
    size: (p) => ({ width: num(p.widthIn, 144), height: num(p.heightIn, 12) }),
  },
  {
    typeId: "chain-motor",
    label: "Chain motor",
    category: "Motors",
    defaults: { widthIn: 10, heightIn: 18, wllLb: 1000, weightLb: 60 },
    attachPoints: (p) => {
      const h = num(p.heightIn, 18);
      return [
        { id: "bottom", role: "support", x: 0, y: h / 2 },
        { id: "top", role: "load", x: 0, y: -h / 2 },
      ];
    },
    size: (p) => ({ width: num(p.widthIn, 10), height: num(p.heightIn, 18) }),
  },
  {
    typeId: "deadhang",
    label: "Building / dead-hang",
    category: "Anchors",
    isAnchor: true,
    defaults: { widthIn: 8, heightIn: 6, wllLb: 5000, weightLb: 0 },
    attachPoints: (p) => {
      const h = num(p.heightIn, 6);
      return [{ id: "bottom", role: "support", x: 0, y: h / 2 }];
    },
    size: (p) => ({ width: num(p.widthIn, 8), height: num(p.heightIn, 6) }),
  },
];

export { parseShackleTypeId, SHACKLE_STYLES } from "./rigging-shackles.js";

/** @type {Map<string, RiggingCatalogEntry>} */
const catalogById = new Map(RIGGING_CATALOG.map((e) => [e.typeId, e]));

/** @param {string} typeId */
export function getCatalogEntry(typeId) {
  return catalogById.get(typeId) ?? null;
}

/** @returns {string[]} */
export function catalogCategories() {
  const seen = new Set();
  const out = [];
  for (const e of RIGGING_CATALOG) {
    if (!seen.has(e.category)) {
      seen.add(e.category);
      out.push(e.category);
    }
  }
  return out;
}

/** @returns {RiggingState} */
export function emptyRiggingState() {
  return {
    parts: [],
    mates: [],
    grid: { snap: true, sizeIn: 1 },
  };
}

/**
 * @param {unknown} raw
 * @returns {RiggingPartProps}
 */
function normalizeProps(raw) {
  if (!raw || typeof raw !== "object") return {};
  const p = /** @type {Record<string, unknown>} */ (raw);
  /** @type {RiggingPartProps} */
  const out = {};
  if (p.weightLb != null) out.weightLb = num(p.weightLb);
  if (p.lengthIn != null) out.lengthIn = num(p.lengthIn);
  if (p.widthIn != null) out.widthIn = num(p.widthIn);
  if (p.heightIn != null) out.heightIn = num(p.heightIn);
  if (p.wllLb != null) out.wllLb = num(p.wllLb);
  if (typeof p.notes === "string") out.notes = p.notes;
  return out;
}

/**
 * @param {unknown} raw
 * @returns {RiggingPart | null}
 */
function normalizePart(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = /** @type {Record<string, unknown>} */ (raw);
  const typeIdRaw = typeof p.typeId === "string" ? p.typeId : "";
  let typeId = typeIdRaw;
  if (typeId === "shackle") typeId = "shackle-bolt-anchor-1_2";
  else if (typeId.startsWith("shackle-screw-pin-anchor-")) {
    typeId = typeId.replace("shackle-screw-pin-anchor-", "shackle-bolt-anchor-");
  } else if (typeId.startsWith("shackle-screw-pin-chain-")) {
    typeId = typeId.replace("shackle-screw-pin-chain-", "shackle-bolt-chain-");
  }
  if (!typeId || !catalogById.has(typeId)) return null;
  const id = typeof p.id === "string" && p.id ? p.id : `part-${Math.random().toString(36).slice(2, 9)}`;
  const entry = catalogById.get(typeId);
  const name =
    typeof p.name === "string" && p.name.trim()
      ? p.name.trim()
      : entry?.label ?? typeId;
  return {
    id,
    typeId,
    name,
    x: num(p.x),
    y: num(p.y),
    rotationDeg: num(p.rotationDeg),
    props: normalizeProps(p.props),
  };
}

/**
 * @param {unknown} raw
 * @returns {RiggingMate | null}
 */
function normalizeMate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const m = /** @type {Record<string, unknown>} */ (raw);
  const aPartId = typeof m.aPartId === "string" ? m.aPartId : "";
  const bPartId = typeof m.bPartId === "string" ? m.bPartId : "";
  const aAttachId = typeof m.aAttachId === "string" ? m.aAttachId : "";
  const bAttachId = typeof m.bAttachId === "string" ? m.bAttachId : "";
  if (!aPartId || !bPartId || !aAttachId || !bAttachId) return null;
  if (aPartId === bPartId) return null;
  const id = typeof m.id === "string" && m.id ? m.id : `mate-${Math.random().toString(36).slice(2, 9)}`;
  return { id, aPartId, aAttachId, bPartId, bAttachId };
}

/**
 * @param {unknown} data
 * @returns {RiggingState}
 */
export function normalizeRiggingState(data) {
  if (data == null || typeof data !== "object") return emptyRiggingState();
  const d = /** @type {Record<string, unknown>} */ (data);
  const parts = Array.isArray(d.parts)
    ? d.parts.map(normalizePart).filter(Boolean)
    : [];
  const partIds = new Set(parts.map((p) => p.id));
  const mates = Array.isArray(d.mates)
    ? d.mates
        .map(normalizeMate)
        .filter((m) => m && partIds.has(m.aPartId) && partIds.has(m.bPartId))
    : [];
  const gridRaw = d.grid && typeof d.grid === "object" ? /** @type {Record<string, unknown>} */ (d.grid) : {};
  return {
    parts: /** @type {RiggingPart[]} */ (parts),
    mates: /** @type {RiggingMate[]} */ (mates),
    grid: {
      snap: gridRaw.snap !== false,
      sizeIn: Math.max(0.25, num(gridRaw.sizeIn, 1)),
    },
  };
}

/**
 * Resolved attach points for a part (local space).
 * @param {RiggingPart} part
 * @returns {AttachPointDef[]}
 */
export function resolveAttachPoints(part) {
  const entry = catalogById.get(part.typeId);
  if (!entry) return [];
  const props = mergePartProps(part.props, entry.defaults);
  return entry.attachPoints(props);
}

/**
 * @param {RiggingPart} part
 * @returns {{ width: number, height: number }}
 */
export function resolvePartSize(part) {
  const entry = catalogById.get(part.typeId);
  if (!entry) return { width: 10, height: 10 };
  return entry.size(mergePartProps(part.props, entry.defaults));
}

/**
 * @param {RiggingPart} part
 * @returns {RiggingPartProps}
 */
export function resolvePartProps(part) {
  const entry = catalogById.get(part.typeId);
  if (!entry) return { ...part.props };
  return mergePartProps(part.props, entry.defaults);
}

/**
 * World position of an attach point.
 * @param {RiggingPart} part
 * @param {string} attachId
 * @returns {{ x: number, y: number } | null}
 */
export function attachWorldPosition(part, attachId) {
  const pts = resolveAttachPoints(part);
  const pt = pts.find((p) => p.id === attachId);
  if (!pt) return null;
  const rad = (part.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: part.x + pt.x * cos - pt.y * sin,
    y: part.y + pt.x * sin + pt.y * cos,
  };
}

/**
 * @param {AttachRole} a
 * @param {AttachRole} b
 */
export function attachRolesCompatible(a, b) {
  if (a === "either" || b === "either") return true;
  return (a === "support" && b === "load") || (a === "load" && b === "support");
}

/**
 * Which end is the load (hanging) side of a mate.
 * Returns the part id that hangs from the other, or null if ambiguous.
 * @param {RiggingMate} mate
 * @param {Map<string, RiggingPart>} partMap
 * @returns {{ loadPartId: string, supportPartId: string } | null}
 */
export function mateLoadDirection(mate, partMap) {
  const aPart = partMap.get(mate.aPartId);
  const bPart = partMap.get(mate.bPartId);
  if (!aPart || !bPart) return null;
  const aPts = resolveAttachPoints(aPart);
  const bPts = resolveAttachPoints(bPart);
  const aAtt = aPts.find((p) => p.id === mate.aAttachId);
  const bAtt = bPts.find((p) => p.id === mate.bAttachId);
  if (!aAtt || !bAtt) return null;

  let aRole = aAtt.role;
  let bRole = bAtt.role;
  if (aRole === "either" && bRole !== "either") aRole = bRole === "support" ? "load" : "support";
  if (bRole === "either" && aRole !== "either") bRole = aRole === "support" ? "load" : "support";

  if (aRole === "load" && bRole === "support") {
    return { loadPartId: mate.aPartId, supportPartId: mate.bPartId };
  }
  if (bRole === "load" && aRole === "support") {
    return { loadPartId: mate.bPartId, supportPartId: mate.aPartId };
  }
  // Fallback: lower Y (screen-down) is the load side
  const aPos = attachWorldPosition(aPart, mate.aAttachId);
  const bPos = attachWorldPosition(bPart, mate.bAttachId);
  if (aPos && bPos) {
    if (aPart.y > bPart.y) return { loadPartId: mate.aPartId, supportPartId: mate.bPartId };
    if (bPart.y > aPart.y) return { loadPartId: mate.bPartId, supportPartId: mate.aPartId };
  }
  return null;
}

/**
 * Equal-share load through each part (and optionally each mate).
 * @param {RiggingState} state
 * @returns {{ partLoads: Map<string, number>, mateLoads: Map<string, number> }}
 */
export function computeLoads(state) {
  /** @type {Map<string, number>} */
  const partLoads = new Map();
  /** @type {Map<string, number>} */
  const mateLoads = new Map();

  for (const part of state.parts) {
    partLoads.set(part.id, 0);
  }
  for (const mate of state.mates) {
    mateLoads.set(mate.id, 0);
  }

  /** @type {Map<string, RiggingPart>} */
  const partMap = new Map(state.parts.map((p) => [p.id, p]));

  /** @type {Map<string, { neighborId: string, mateId: string }[]>} */
  const up = new Map();
  for (const part of state.parts) up.set(part.id, []);

  for (const mate of state.mates) {
    const dir = mateLoadDirection(mate, partMap);
    if (!dir) continue;
    up.get(dir.loadPartId)?.push({ neighborId: dir.supportPartId, mateId: mate.id });
  }

  /**
   * @param {string} partId
   * @param {number} amount
   * @param {Set<string>} visiting
   */
  function distribute(partId, amount, visiting) {
    if (!(amount > 0) || !partLoads.has(partId)) return;
    if (visiting.has(partId)) return;
    partLoads.set(partId, (partLoads.get(partId) ?? 0) + amount);

    const ups = up.get(partId) ?? [];
    if (!ups.length) return;

    visiting.add(partId);
    const share = amount / ups.length;
    for (const edge of ups) {
      mateLoads.set(edge.mateId, (mateLoads.get(edge.mateId) ?? 0) + share);
      distribute(edge.neighborId, share, visiting);
    }
    visiting.delete(partId);
  }

  for (const part of state.parts) {
    const props = resolvePartProps(part);
    const w = num(props.weightLb);
    if (w > 0) {
      distribute(part.id, w, new Set());
    }
  }

  return { partLoads, mateLoads };
}

/**
 * Pose the moving part so its attach coincides with the target attach.
 * @param {RiggingPart} moving
 * @param {string} movingAttachId
 * @param {RiggingPart} target
 * @param {string} targetAttachId
 * @returns {{ x: number, y: number }}
 */
export function poseForMate(moving, movingAttachId, target, targetAttachId) {
  const targetWorld = attachWorldPosition(target, targetAttachId);
  const local = resolveAttachPoints(moving).find((p) => p.id === movingAttachId);
  if (!targetWorld || !local) {
    return { x: moving.x, y: moving.y };
  }
  const rad = (moving.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = local.x * cos - local.y * sin;
  const oy = local.x * sin + local.y * cos;
  return {
    x: targetWorld.x - ox,
    y: targetWorld.y - oy,
  };
}

/**
 * Connected component of parts via mates (for rigid translate).
 * @param {RiggingState} state
 * @param {string} startId
 * @returns {Set<string>}
 */
export function connectedPartIds(state, startId) {
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const p of state.parts) adj.set(p.id, []);
  for (const m of state.mates) {
    adj.get(m.aPartId)?.push(m.bPartId);
    adj.get(m.bPartId)?.push(m.aPartId);
  }
  const seen = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const n of adj.get(id) ?? []) {
      if (!seen.has(n)) stack.push(n);
    }
  }
  return seen;
}

/**
 * Attach points not yet used in a mate.
 * @param {RiggingState} state
 * @param {string} partId
 * @returns {AttachPointDef[]}
 */
export function freeAttachPoints(state, partId) {
  const part = state.parts.find((p) => p.id === partId);
  if (!part) return [];
  const used = new Set();
  for (const m of state.mates) {
    if (m.aPartId === partId) used.add(m.aAttachId);
    if (m.bPartId === partId) used.add(m.bAttachId);
  }
  return resolveAttachPoints(part).filter((a) => !used.has(a.id));
}

export const riggingPluginMeta = {
  id: "rigging-calculator",
  tabPanelId: "rigging-calculator",
  stateKey: "rigging",
  label: "Rigging Calculator",
  requiredForSave: false,
  emptyState: emptyRiggingState,
  /** @param {unknown} data */
  validateState(data) {
    return normalizeRiggingState(data);
  },
};
