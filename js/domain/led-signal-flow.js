/**
 * LED wall → Signal Flow gear helpers (pure).
 */

import {
  isPowerConnectorType,
  normalizeConnectorType,
  normalizePortRow,
} from "../signal-flow-gear-schema.js";

/** @typedef {import("./led.js").LedWallGrid} LedWallGrid */
/** @typedef {import("../signal-flow-gear-schema.js").GearType} GearType */
/** @typedef {import("../signal-flow-gear-schema.js").GearPortRow} GearPortRow */

/** Virtual Gear-library folder for live LED walls. */
export const LED_WALLS_FOLDER_ID = "fld-led-walls";

/** @type {{ id: string, name: string, parentId: null }} */
export const LED_WALLS_FOLDER = {
  id: LED_WALLS_FOLDER_ID,
  name: "LED Walls",
  parentId: null,
};

/**
 * Resolve a power connector type from an LED wall's powerConnector field.
 * @param {unknown} raw
 * @returns {"Edison" | "Soca" | "Powercon" | "True1"}
 */
export function resolveLedPowerConnectorType(raw) {
  const normalized = normalizeConnectorType(typeof raw === "string" ? raw : "");
  if (normalized && isPowerConnectorType(normalized)) {
    return /** @type {"Edison" | "Soca" | "Powercon" | "True1"} */ (normalized);
  }
  return "Edison";
}

/**
 * Build Signal Flow gear for one LED wall from drawn data/power lines.
 * @param {LedWallGrid | null | undefined} grid
 * @returns {GearType | null}
 */
export function buildLedWallGear(grid) {
  if (!grid || typeof grid !== "object") return null;
  const wallId = typeof grid.id === "string" && grid.id.trim() ? grid.id.trim() : "";
  if (!wallId) return null;

  const name =
    typeof grid.name === "string" && grid.name.trim() ? grid.name.trim() : `LED Wall`;
  const powerType = resolveLedPowerConnectorType(
    /** @type {{ powerConnector?: unknown }} */ (grid).powerConnector
  );
  const powerCount = Array.isArray(grid.powerLines) ? grid.powerLines.length : 0;
  const ethCount = Array.isArray(grid.dataLines) ? grid.dataLines.length : 0;

  /** @type {GearPortRow[]} */
  const ports = [];
  for (let i = 0; i < powerCount; i += 1) {
    ports.push(
      normalizePortRow({
        input: `Power ${i + 1}`,
        output: "—",
        inputType: powerType,
        outputType: null,
      })
    );
  }
  for (let i = 0; i < ethCount; i += 1) {
    ports.push(
      normalizePortRow({
        input: `ETH ${i + 1}`,
        output: "—",
        inputType: "ETH",
        outputType: null,
      })
    );
  }

  return {
    id: `led-wall:${wallId}`,
    label: name,
    defaultName: name,
    category: "Video",
    domain: "signal",
    kind: "premade",
    folderId: null,
    ports,
  };
}

/**
 * Live LED walls as Gear-library entries (folder: LED Walls).
 * @param {{ grids?: LedWallGrid[] } | null | undefined} led
 * @returns {GearType[]}
 */
export function listLedWallLibraryGear(led) {
  const grids = Array.isArray(led?.grids) ? led.grids : [];
  /** @type {GearType[]} */
  const list = [];
  for (const grid of grids) {
    const gear = buildLedWallGear(grid);
    if (!gear) continue;
    list.push({ ...gear, folderId: LED_WALLS_FOLDER_ID });
  }
  return list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * @param {string | null | undefined} typeId
 * @returns {string | null}
 */
export function ledWallIdFromTypeId(typeId) {
  if (typeof typeId !== "string" || !typeId.startsWith("led-wall:")) return null;
  const id = typeId.slice("led-wall:".length).trim();
  return id || null;
}
