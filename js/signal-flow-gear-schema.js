/**
 * Canonical gear schema for the signal-flow library.
 *
 * This module is dependency-free on purpose: it is shared by the runtime
 * modules (signal-flow-data.js) and the catalog loader
 * (signal-flow-gear-presets.js) without creating import cycles, and it is
 * unit-testable in Node.
 *
 * Port rows are the row-based table drawn on gear nodes. A row pairs an
 * input cell with an output cell; `"—"` marks an empty cell. Divider flags
 * (`inputDivider` / `outputDivider`) draw a thicker separator line ABOVE that
 * row's cell on that side. Dividers are flags rather than rows so that wire
 * connections — which address ports by row index — stay stable when dividers
 * are added or removed.
 */

/**
 * @typedef {{
 *   input: string,
 *   output: string,
 *   inputType?: string | null,
 *   outputType?: string | null,
 *   inputDivider?: boolean,
 *   outputDivider?: boolean,
 * }} GearPortRow
 */

/** @typedef {"premade" | "blank"} GearKind */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   defaultName: string,
 *   category: string,
 *   kind?: GearKind,
 *   folderId?: string | null,
 *   note?: string,
 *   ports: GearPortRow[],
 * }} GearType
 */

/**
 * One entry of the ordered per-side port list used by the gear editor.
 * @typedef {{ kind: "port", label: string, type: string | null } | { kind: "divider" }} GearSideItem
 */

export const GEAR_CATEGORIES = ["Video", "Audio", "Control", "Network", "Other"];

/** Supported connector / cable types for gear ports. */
export const CONNECTOR_TYPES = ["HDMI", "DP", "SDI", "USB-C", "XLR", "ETH", "Fiber"];

/** @type {Record<string, string>} */
const CONNECTOR_ALIASES = {
  displayport: "DP",
  "display port": "DP",
  ethernet: "ETH",
  network: "ETH",
  rj45: "ETH",
  usbc: "USB-C",
  "usb c": "USB-C",
  "usb-c": "USB-C",
  "3g-sdi": "SDI",
  "12g-sdi": "SDI",
  "6g-sdi": "SDI",
  hdbaset: "ETH",
  fibre: "Fiber",
  optical: "Fiber",
  smf: "Fiber",
  mmf: "Fiber",
  "lc fiber": "Fiber",
  "lc fibre": "Fiber",
};

/** Colors for known connector types, used by the "color by cable type" view. */
/** @type {Record<string, string>} */
export const CONNECTOR_COLORS = {
  HDMI: "#f97316",
  DP: "#3b82f6",
  SDI: "#22c55e",
  "USB-C": "#a855f7",
  XLR: "#ec4899",
  ETH: "#06b6d4",
  Fiber: "#eab308",
};

/**
 * Resolve a display color for a connector/cable type. Known types use the
 * fixed palette; arbitrary types get a stable hue derived from their name.
 * @param {string | null | undefined} type
 * @returns {string | null}
 */
export function connectorColor(type) {
  if (!type || type === "—") return null;
  const key = String(type).trim();
  if (!key) return null;
  const known = Object.keys(CONNECTOR_COLORS).find(
    (t) => t.toLowerCase() === key.toLowerCase()
  );
  if (known) return CONNECTOR_COLORS[known];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 65%, 55%)`;
}

/**
 * Infer a connector type from a port label (e.g. "HDMI In 1" → "HDMI").
 * @param {string | null | undefined} label
 * @returns {string | null}
 */
export function inferConnectorTypeFromLabel(label) {
  if (!label || label === "—") return null;
  const normalized = String(label).trim().toLowerCase();
  if (!normalized) return null;

  for (const type of [...CONNECTOR_TYPES].sort((a, b) => b.length - a.length)) {
    const key = type.toLowerCase();
    if (normalized === key || normalized.startsWith(`${key} `) || normalized.includes(` ${key} `)) {
      return type;
    }
    if (normalized.includes(key)) return type;
  }

  for (const [alias, type] of Object.entries(CONNECTOR_ALIASES)) {
    if (normalized.includes(alias)) return type;
  }
  return null;
}

/**
 * @param {Partial<GearPortRow> | null | undefined} raw
 * @returns {GearPortRow}
 */
export function normalizePortRow(raw) {
  const input = typeof raw?.input === "string" && raw.input.trim() ? raw.input.trim() : "—";
  const output = typeof raw?.output === "string" && raw.output.trim() ? raw.output.trim() : "—";
  const inputType =
    typeof raw?.inputType === "string" && raw.inputType.trim()
      ? raw.inputType.trim()
      : inferConnectorTypeFromLabel(input);
  const outputType =
    typeof raw?.outputType === "string" && raw.outputType.trim()
      ? raw.outputType.trim()
      : inferConnectorTypeFromLabel(output);
  /** @type {GearPortRow} */
  const row = { input, output, inputType, outputType };
  if (raw?.inputDivider === true) row.inputDivider = true;
  if (raw?.outputDivider === true) row.outputDivider = true;
  return row;
}

/**
 * Build port rows from a catalog gear entry's port data: either a `ports`
 * row array (canonical, supports dividers) or parallel `inputs` / `outputs`
 * label arrays with optional `inputTypes` / `outputTypes`.
 * @param {string[] | undefined} inputs
 * @param {string[] | undefined} outputs
 * @param {(string | null)[] | undefined} inputTypes
 * @param {(string | null)[] | undefined} outputTypes
 * @param {GearPortRow[] | undefined} ports
 * @returns {GearPortRow[]}
 */
export function portsFromCatalogEntry(inputs, outputs, inputTypes, outputTypes, ports) {
  if (Array.isArray(ports) && ports.length > 0) {
    return ports.map((p) => normalizePortRow(p));
  }
  const ins = Array.isArray(inputs) ? inputs : [];
  const outs = Array.isArray(outputs) ? outputs : [];
  const inTypes = Array.isArray(inputTypes) ? inputTypes : [];
  const outTypes = Array.isArray(outputTypes) ? outputTypes : [];
  const rows = Math.max(ins.length, outs.length, 1);
  /** @type {GearPortRow[]} */
  const result = [];
  for (let i = 0; i < rows; i += 1) {
    result.push(
      normalizePortRow({
        input: i < ins.length ? ins[i] : "—",
        output: i < outs.length ? outs[i] : "—",
        inputType: i < inTypes.length ? inTypes[i] : undefined,
        outputType: i < outTypes.length ? outTypes[i] : undefined,
      })
    );
  }
  return result;
}

/**
 * Normalize a raw catalog gear entry (from a data/gear JSON file or an
 * imported library file) into a GearType. Returns null when the entry has
 * no usable id or label.
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {GearType | null}
 */
export function normalizeGearEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!id || !label) return null;

  const folderId =
    typeof raw.folderId === "string" && raw.folderId.trim()
      ? raw.folderId.trim()
      : null;

  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : "";

  return {
    id,
    label,
    defaultName:
      typeof raw.defaultName === "string" && raw.defaultName.trim()
        ? raw.defaultName.trim()
        : label,
    category:
      typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : "Other",
    kind: raw.kind === "blank" ? "blank" : "premade",
    folderId,
    ...(note ? { note } : {}),
    ports: portsFromCatalogEntry(
      /** @type {string[] | undefined} */ (raw.inputs),
      /** @type {string[] | undefined} */ (raw.outputs),
      /** @type {(string | null)[] | undefined} */ (raw.inputTypes),
      /** @type {(string | null)[] | undefined} */ (raw.outputTypes),
      /** @type {GearPortRow[] | undefined} */ (raw.ports)
    ),
  };
}

/**
 * Serialize a GearType into the catalog JSON entry shape (the format used by
 * data/gear/*.json and library export files). Always writes the canonical
 * `ports` row form so labels, types, and dividers round-trip.
 * @param {GearType} gear
 * @returns {Record<string, unknown>}
 */
export function serializeGearForCatalog(gear) {
  /** @type {Record<string, unknown>} */
  const entry = {
    id: gear.id,
    label: gear.label,
    category: gear.category || "Other",
  };
  if (gear.defaultName && gear.defaultName !== gear.label) {
    entry.defaultName = gear.defaultName;
  }
  if (typeof gear.note === "string" && gear.note.trim()) {
    entry.note = gear.note.trim();
  }
  entry.ports = (gear.ports ?? []).map((raw) => {
    const row = normalizePortRow(raw);
    /** @type {Record<string, unknown>} */
    const out = { input: row.input, output: row.output };
    if (row.inputType) out.inputType = row.inputType;
    if (row.outputType) out.outputType = row.outputType;
    if (row.inputDivider) out.inputDivider = true;
    if (row.outputDivider) out.outputDivider = true;
    return out;
  });
  return entry;
}

/**
 * Split port rows into the two ordered per-side lists the gear editor works
 * with. Dividers become standalone list items placed before the port they
 * precede on that side.
 * @param {GearPortRow[] | null | undefined} ports
 * @returns {{ inputs: GearSideItem[], outputs: GearSideItem[] }}
 */
export function gearPortsToSideLists(ports) {
  /** @type {GearSideItem[]} */
  const inputs = [];
  /** @type {GearSideItem[]} */
  const outputs = [];
  for (const raw of ports ?? []) {
    const row = normalizePortRow(raw);
    if (row.inputDivider) inputs.push({ kind: "divider" });
    if (row.input !== "—") {
      inputs.push({ kind: "port", label: row.input, type: row.inputType ?? null });
    }
    if (row.outputDivider) outputs.push({ kind: "divider" });
    if (row.output !== "—") {
      outputs.push({ kind: "port", label: row.output, type: row.outputType ?? null });
    }
  }
  return { inputs, outputs };
}

/**
 * @param {GearSideItem[]} items
 * @returns {{ label: string, type: string | null, divider: boolean }[]}
 */
function sideItemsToPorts(items) {
  /** @type {{ label: string, type: string | null, divider: boolean }[]} */
  const ports = [];
  let pendingDivider = false;
  for (const item of items ?? []) {
    if (item.kind === "divider") {
      pendingDivider = true;
      continue;
    }
    ports.push({
      label: typeof item.label === "string" ? item.label : "",
      type: item.type ?? null,
      divider: pendingDivider,
    });
    pendingDivider = false;
  }
  // A trailing divider has no port after it and is dropped.
  return ports;
}

/**
 * Zip the editor's two ordered side lists back into port rows. Row i pairs
 * input i with output i; the shorter side pads with `"—"`. Divider items
 * become divider flags on the next port's row for that side.
 * @param {GearSideItem[]} inputItems
 * @param {GearSideItem[]} outputItems
 * @returns {GearPortRow[]}
 */
export function sideListsToGearPorts(inputItems, outputItems) {
  const ins = sideItemsToPorts(inputItems);
  const outs = sideItemsToPorts(outputItems);
  const rows = Math.max(ins.length, outs.length);
  /** @type {GearPortRow[]} */
  const result = [];
  for (let i = 0; i < rows; i += 1) {
    const input = ins[i] ?? null;
    const output = outs[i] ?? null;
    /** @type {Partial<GearPortRow>} */
    const row = {
      input: input?.label ?? "—",
      output: output?.label ?? "—",
      inputType: input?.type ?? null,
      outputType: output?.type ?? null,
    };
    if (input?.divider) row.inputDivider = true;
    if (output?.divider) row.outputDivider = true;
    result.push(normalizePortRow(row));
  }
  return result;
}
