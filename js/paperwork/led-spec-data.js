import { BITRATE_PIXEL_FACTOR, MAX_AMPS } from "../led-data.js?v=2";

/**
 * @param {Record<string, unknown>} siteExports
 * @returns {{ id: string, name: string, grid: object }[]}
 */
export function listLedWalls(siteExports) {
  const led = /** @type {{ grids?: object[] } | null} */ (siteExports.led);
  const grids = Array.isArray(led?.grids) ? led.grids : [];
  return grids.map((grid, index) => ({
    id: String(grid?.id ?? `wall-${index}`),
    name: String(grid?.name ?? `LED Wall ${index + 1}`),
    grid,
  }));
}

/** @param {Record<string, unknown>} siteExports */
function ledVoltage(siteExports) {
  const led = /** @type {{ voltage?: number } | null} */ (siteExports.led);
  const voltage = Number(led?.voltage);
  return voltage > 0 ? voltage : 120;
}

/** @param {Record<string, unknown>} siteExports */
function ledBitrate(siteExports) {
  const led = /** @type {{ bitrate?: number } | null} */ (siteExports.led);
  const bitrate = Number(led?.bitrate);
  return bitrate === 10 || bitrate === 12 ? bitrate : 8;
}

/** @param {number} value @param {number} [digits] */
function formatNumber(value, digits = 2) {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

/** @param {number} millimeters */
function formatMetricDimension(millimeters) {
  return `${formatNumber(millimeters / 1000)} m`;
}

/** @param {number} millimeters */
function formatSaeDimension(millimeters) {
  const totalInches = millimeters / 25.4;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round((totalInches - feet * 12) * 10) / 10;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return `${feet} ft ${formatNumber(inches, 1)} in`;
}

/**
 * @typedef {{ id: string, label: string, auto: string } | { section: string }} LedSpecField
 */

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string | null | undefined} sourceKey
 * @returns {LedSpecField[]}
 */
export function buildLedSpecificationFields(siteExports, sourceKey) {
  const wall = listLedWalls(siteExports).find((item) => item.id === sourceKey);
  if (!wall) return [];

  const grid = wall.grid;
  const tile = /** @type {Record<string, unknown>} */ (grid?.tile ?? {});
  const rows = Number(grid?.generated ? grid.generatedRows : grid?.rows) || 0;
  const cols = Number(grid?.generated ? grid.generatedCols : grid?.cols) || 0;
  const tileCount = rows * cols;
  const wallCount = Math.max(1, Number(grid?.wallCount) || 1);
  const dataLines = Array.isArray(grid?.dataLines) ? grid.dataLines : [];
  const backupProcessing = dataLines.some((line) => Boolean(line?.endLabel));
  const pixelWidth = Number(tile.pixelWidth) || 0;
  const pixelHeight = Number(tile.pixelHeight) || 0;
  const tilePixels = Number(tile.totalPixels) || pixelWidth * pixelHeight;
  const bitrate = ledBitrate(siteExports);
  const bitrateFactor = BITRATE_PIXEL_FACTOR[bitrate] ?? 1;
  const effectiveMaxPixels = (Number(tile.maxPerPort) || 0) / bitrateFactor;
  const maxTilesPerPort = Math.max(
    1,
    Math.floor(effectiveMaxPixels / Math.max(1, tilePixels))
  );
  const basePorts = dataLines.length || Math.ceil(tileCount / maxTilesPerPort);
  const portsWithBackup = basePorts * (backupProcessing ? 2 : 1);
  const metricWidth = cols * (Number(tile.metricWidth) || 0);
  const metricHeight = rows * (Number(tile.metricHeight) || 0);
  const totalWeight = tileCount * wallCount * (Number(tile.weight) || 0);
  const totalWatts = tileCount * wallCount * (Number(tile.wattage) || 0);
  const voltage = ledVoltage(siteExports);
  const screenAmps = voltage > 0 ? totalWatts / voltage : 0;
  const maxTilesPerCircuit =
    Number(tile.wattage) > 0
      ? Math.max(1, Math.floor((MAX_AMPS * voltage) / Number(tile.wattage)))
      : 0;
  const totalThreePhaseAmps = screenAmps / 2;

  return [
    { id: "wallName", label: "Screen name", auto: String(grid?.name ?? "") },
    {
      id: "tileType",
      label: "Tile type",
      auto: String(tile.name || tile.id || "Custom"),
    },
    { id: "tilesWide", label: "Tiles wide", auto: String(cols) },
    { id: "tilesHigh", label: "Tiles high", auto: String(rows) },
    { id: "wallCount", label: "Wall count", auto: String(wallCount) },
    { id: "riggingType", label: "Rigging type", auto: String(grid?.riggingType ?? "") },
    { section: "Dimensions" },
    {
      id: "metricDimensions",
      label: "Metric dimensions",
      auto: `${formatMetricDimension(metricWidth)} × ${formatMetricDimension(metricHeight)}`,
    },
    {
      id: "saeDimensions",
      label: "SAE dimensions",
      auto: `${formatSaeDimension(metricWidth)} × ${formatSaeDimension(metricHeight)}`,
    },
    { section: "Weight" },
    {
      id: "totalWeight",
      label: "Weight (no rigging)",
      auto: `${formatNumber(totalWeight, 1)} lb`,
    },
    { section: "Data" },
    {
      id: "processorType",
      label: "Processor",
      auto: String(tile.processorType || ""),
    },
    {
      id: "wiringType",
      label: "Wiring type",
      auto: String(tile.wiringType || ""),
    },
    {
      id: "distanceToProcessor",
      label: "Distance to processor",
      auto: String(grid?.distanceToProcessor ?? ""),
    },
    {
      id: "backupProcessing",
      label: "Backup processing",
      auto: backupProcessing ? "Yes" : "No",
    },
    {
      id: "pixelDimensions",
      label: "Pixel dimensions",
      auto: `${cols * pixelWidth} × ${rows * pixelHeight}`,
    },
    {
      id: "maxTilesPerPort",
      label: "Max tiles per port",
      auto: String(maxTilesPerPort),
    },
    {
      id: "portsRequiredBackup",
      label: "Ports required (w/ backup)",
      auto: String(portsWithBackup),
    },
    {
      id: "pixelsPerTile",
      label: "Pixels per tile",
      auto: `${pixelWidth} × ${pixelHeight}`,
    },
    { section: "Power" },
    { id: "voltage", label: "Voltage", auto: `${voltage} V` },
    {
      id: "powerConnector",
      label: "Soca or Edison",
      auto: String(grid?.powerConnector ?? ""),
    },
    {
      id: "distanceFromPd",
      label: "Distance from PD",
      auto: String(grid?.distanceFromPd ?? ""),
    },
    {
      id: "totalWattage",
      label: "Wattage",
      auto: `${formatNumber(totalWatts, 0)} W`,
    },
    {
      id: "screenAmperage",
      label: "Screen amperage",
      auto: `${formatNumber(screenAmps, 3)} A`,
    },
    {
      id: "maxTilesPerCircuit",
      label: "Max tiles per circuit",
      auto: String(maxTilesPerCircuit),
    },
    {
      id: "totalThreePhaseAmperage",
      label: "Total 3-phase amperage",
      auto: `${formatNumber(totalThreePhaseAmps, 3)} A`,
    },
  ];
}

/**
 * @param {Record<string, unknown>} siteExports
 * @param {string | null | undefined} sourceKey
 * @param {string} fieldId
 */
export function ledSpecificationFieldValue(siteExports, sourceKey, fieldId) {
  const field = buildLedSpecificationFields(siteExports, sourceKey).find(
    (item) => "id" in item && item.id === fieldId
  );
  return field && "auto" in field ? field.auto : null;
}
