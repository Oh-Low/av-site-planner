import { uid } from "./shared/id.js";
import {
  CONNECTOR_TYPES,
  normalizePortRow,
} from "./signal-flow-gear-schema.js?v=3";
import {
  BRAND_GEAR_TYPES,
  GENERIC_GEAR_TYPES,
} from "./signal-flow-gear-presets.js?v=43";

/** @typedef {import("./signal-flow-gear-schema.js").GearPortRow} GearPortRow */
/** @typedef {import("./signal-flow-gear-schema.js").GearKind} GearKind */
/** @typedef {import("./signal-flow-gear-schema.js").GearType} GearType */

export {
  CONNECTOR_COLORS,
  CONNECTOR_TYPES,
  GEAR_CATEGORIES,
  connectorColor,
  inferConnectorTypeFromLabel,
  normalizePortRow,
} from "./signal-flow-gear-schema.js?v=3";

/** Generic templates plus brand product presets. */
export const GEAR_TYPES = [...GENERIC_GEAR_TYPES, ...BRAND_GEAR_TYPES];

export { GENERIC_GEAR_TYPES };

/** @typedef {Record<string, number>} ConnectorCounts */

/** @returns {ConnectorCounts} */
export function emptyConnectorCounts() {
  return Object.fromEntries(CONNECTOR_TYPES.map((t) => [t, 0]));
}

/**
 * @param {ConnectorCounts} counts
 * @returns {{ label: string, type: string }[]}
 */
export function expandConnectors(counts) {
  /** @type {{ label: string, type: string }[]} */
  const list = [];
  for (const type of CONNECTOR_TYPES) {
    const n = Math.max(0, Math.min(32, Math.floor(counts[type] ?? 0)));
    for (let i = 1; i <= n; i += 1) {
      list.push({ label: `${type} ${i}`, type });
    }
  }
  return list;
}

/**
 * @param {ConnectorCounts} counts
 * @returns {string[]}
 */
export function expandConnectorLabels(counts) {
  return expandConnectors(counts).map((c) => c.label);
}

/** @param {ConnectorCounts} counts */
export function totalConnectorCount(counts) {
  return CONNECTOR_TYPES.reduce((sum, type) => sum + Math.max(0, counts[type] ?? 0), 0);
}

/**
 * @param {ConnectorCounts} inputCounts
 * @param {ConnectorCounts} outputCounts
 * @returns {GearPortRow[]}
 */
export function buildGearPortsFromConnectors(inputCounts, outputCounts) {
  const inputs = expandConnectors(inputCounts);
  const outputs = expandConnectors(outputCounts);
  const rows = Math.max(inputs.length, outputs.length);

  /** @type {GearPortRow[]} */
  const ports = [];
  for (let i = 0; i < rows; i += 1) {
    const input = inputs[i] ?? null;
    const output = outputs[i] ?? null;
    ports.push({
      input: input?.label ?? "—",
      output: output?.label ?? "—",
      inputType: input?.type ?? null,
      outputType: output?.type ?? null,
    });
  }
  return ports;
}

/**
 * @param {number} inputCount
 * @param {number} outputCount
 * @returns {GearPortRow[]}
 */
export function buildGearPorts(inputCount, outputCount) {
  const inputs = Math.max(0, Math.min(32, Math.floor(inputCount)));
  const outputs = Math.max(0, Math.min(32, Math.floor(outputCount)));
  const rows = Math.max(inputs, outputs, 1);

  /** @type {GearPortRow[]} */
  const ports = [];
  for (let i = 0; i < rows; i += 1) {
    const input = i < inputs ? `In ${i + 1}` : "—";
    const output = i < outputs ? `Out ${i + 1}` : "—";
    ports.push(normalizePortRow({ input, output }));
  }
  return ports;
}

/**
 * @param {{
 *   name: string,
 *   category: string,
 *   inputCounts?: ConnectorCounts,
 *   outputCounts?: ConnectorCounts,
 *   inputCount?: number,
 *   outputCount?: number,
 *   ports?: GearPortRow[],
 *   kind?: GearKind,
 *   id?: string,
 *   folderId?: string | null,
 *   note?: string,
 * }} spec
 * @returns {GearType}
 */
export function createGearType(spec) {
  const name = spec.name.trim() || "Device";
  const note = typeof spec.note === "string" ? spec.note.trim() : "";
  let ports = spec.ports;
  if (!ports) {
    if (spec.inputCounts || spec.outputCounts) {
      ports = buildGearPortsFromConnectors(
        spec.inputCounts ?? emptyConnectorCounts(),
        spec.outputCounts ?? emptyConnectorCounts()
      );
    } else {
      ports = buildGearPorts(spec.inputCount ?? 0, spec.outputCount ?? 0);
    }
  } else {
    ports = ports.map((p) => normalizePortRow(p));
  }
  return {
    id: spec.id ?? uid("gear"),
    label: name,
    defaultName: name,
    category: spec.category || "Other",
    kind: spec.kind ?? "premade",
    folderId: spec.folderId ?? null,
    ...(note ? { note } : {}),
    ports,
  };
}

/** @param {string} typeId @returns {GearType} */
export function getBuiltinGearType(typeId) {
  return GEAR_TYPES.find((g) => g.id === typeId) ?? GEAR_TYPES[GEAR_TYPES.length - 1];
}

/**
 * @param {string} typeId
 * @param {GearType[]} [customTypes]
 * @returns {GearType}
 */
export function resolveGearType(typeId, customTypes = []) {
  const custom = customTypes.find((g) => g.id === typeId);
  if (custom) {
    return {
      ...custom,
      ports: (custom.ports ?? []).map((p) => normalizePortRow(p)),
    };
  }
  return getBuiltinGearType(typeId);
}

/** @deprecated Use resolveGearType */
export function getGearType(typeId) {
  return getBuiltinGearType(typeId);
}
