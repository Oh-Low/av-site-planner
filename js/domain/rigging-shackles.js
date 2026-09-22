/**
 * Industry-standard shackle size tables (ASME B30.26 / Crosby G-209 & G-210 class).
 * Dimensions are typical published values in inches; WLL in US tons (×2000 → lb).
 * Original symbols — not McMaster artwork.
 */

/**
 * @typedef {{
 *   sizeKey: string,
 *   label: string,
 *   wllTons: number,
 *   weightLb: number,
 *   pinDia: number,
 *   bodyDia: number,
 *   insideLength: number,
 *   jawWidth: number,
 *   bowWidth: number,
 *   overallHeight: number,
 * }} ShackleSizeRow
 *
 * @typedef {"screw-pin-anchor" | "screw-pin-chain" | "bolt-anchor" | "bolt-chain"} ShackleStyleId
 */

/** Crosby G-209–class screw-pin / bolt-type anchor (bow) shackles */
/** @type {ShackleSizeRow[]} */
export const ANCHOR_SHACKLE_SIZES = [
  { sizeKey: "3_16", label: "3/16″", wllTons: 1 / 3, weightLb: 0.06, pinDia: 0.25, bodyDia: 0.19, insideLength: 0.88, jawWidth: 0.38, bowWidth: 0.6, overallHeight: 1.47 },
  { sizeKey: "1_4", label: "1/4″", wllTons: 0.5, weightLb: 0.1, pinDia: 0.31, bodyDia: 0.25, insideLength: 1.13, jawWidth: 0.47, bowWidth: 0.78, overallHeight: 1.84 },
  { sizeKey: "5_16", label: "5/16″", wllTons: 0.75, weightLb: 0.18, pinDia: 0.38, bodyDia: 0.31, insideLength: 1.22, jawWidth: 0.53, bowWidth: 0.84, overallHeight: 2.09 },
  { sizeKey: "3_8", label: "3/8″", wllTons: 1, weightLb: 0.31, pinDia: 0.44, bodyDia: 0.38, insideLength: 1.44, jawWidth: 0.66, bowWidth: 1.03, overallHeight: 2.49 },
  { sizeKey: "7_16", label: "7/16″", wllTons: 1.5, weightLb: 0.38, pinDia: 0.5, bodyDia: 0.44, insideLength: 1.69, jawWidth: 0.75, bowWidth: 1.16, overallHeight: 2.91 },
  { sizeKey: "1_2", label: "1/2″", wllTons: 2, weightLb: 0.72, pinDia: 0.63, bodyDia: 0.5, insideLength: 1.88, jawWidth: 0.81, bowWidth: 1.31, overallHeight: 3.28 },
  { sizeKey: "5_8", label: "5/8″", wllTons: 3.25, weightLb: 1.37, pinDia: 0.75, bodyDia: 0.63, insideLength: 2.38, jawWidth: 1.06, bowWidth: 1.69, overallHeight: 4.19 },
  { sizeKey: "3_4", label: "3/4″", wllTons: 4.75, weightLb: 2.35, pinDia: 0.88, bodyDia: 0.75, insideLength: 2.81, jawWidth: 1.25, bowWidth: 2.0, overallHeight: 4.97 },
  { sizeKey: "7_8", label: "7/8″", wllTons: 6.5, weightLb: 3.62, pinDia: 1.0, bodyDia: 0.88, insideLength: 3.31, jawWidth: 1.44, bowWidth: 2.28, overallHeight: 5.83 },
  { sizeKey: "1", label: "1″", wllTons: 8.5, weightLb: 5.03, pinDia: 1.13, bodyDia: 1.0, insideLength: 3.75, jawWidth: 1.69, bowWidth: 2.69, overallHeight: 6.56 },
  { sizeKey: "1_1_8", label: "1-1/8″", wllTons: 9.5, weightLb: 7.41, pinDia: 1.25, bodyDia: 1.13, insideLength: 4.25, jawWidth: 1.81, bowWidth: 2.91, overallHeight: 7.47 },
  { sizeKey: "1_1_4", label: "1-1/4″", wllTons: 12, weightLb: 9.5, pinDia: 1.38, bodyDia: 1.25, insideLength: 4.69, jawWidth: 2.03, bowWidth: 3.25, overallHeight: 8.26 },
  { sizeKey: "1_3_8", label: "1-3/8″", wllTons: 13.5, weightLb: 13.53, pinDia: 1.5, bodyDia: 1.38, insideLength: 5.25, jawWidth: 2.25, bowWidth: 3.63, overallHeight: 9.16 },
  { sizeKey: "1_1_2", label: "1-1/2″", wllTons: 17, weightLb: 17.2, pinDia: 1.63, bodyDia: 1.5, insideLength: 5.75, jawWidth: 2.38, bowWidth: 3.88, overallHeight: 10.0 },
  { sizeKey: "1_3_4", label: "1-3/4″", wllTons: 25, weightLb: 27.78, pinDia: 2.0, bodyDia: 1.75, insideLength: 7.0, jawWidth: 2.88, bowWidth: 5.0, overallHeight: 12.34 },
  { sizeKey: "2", label: "2″", wllTons: 35, weightLb: 45, pinDia: 2.25, bodyDia: 2.0, insideLength: 7.75, jawWidth: 3.25, bowWidth: 5.75, overallHeight: 13.68 },
  { sizeKey: "2_1_2", label: "2-1/2″", wllTons: 55, weightLb: 85.75, pinDia: 2.75, bodyDia: 2.5, insideLength: 10.5, jawWidth: 4.13, bowWidth: 7.25, overallHeight: 17.84 },
];

/** Crosby G-210–class screw-pin / bolt-type chain (D) shackles */
/** @type {ShackleSizeRow[]} */
export const CHAIN_SHACKLE_SIZES = [
  { sizeKey: "1_4", label: "1/4″", wllTons: 0.5, weightLb: 0.11, pinDia: 0.31, bodyDia: 0.25, insideLength: 0.97, jawWidth: 0.47, bowWidth: 0.97, overallHeight: 1.59 },
  { sizeKey: "5_16", label: "5/16″", wllTons: 0.75, weightLb: 0.17, pinDia: 0.38, bodyDia: 0.31, insideLength: 1.15, jawWidth: 0.53, bowWidth: 1.07, overallHeight: 1.91 },
  { sizeKey: "3_8", label: "3/8″", wllTons: 1, weightLb: 0.28, pinDia: 0.44, bodyDia: 0.38, insideLength: 1.42, jawWidth: 0.66, bowWidth: 1.28, overallHeight: 2.31 },
  { sizeKey: "7_16", label: "7/16″", wllTons: 1.5, weightLb: 0.43, pinDia: 0.5, bodyDia: 0.44, insideLength: 1.63, jawWidth: 0.75, bowWidth: 1.48, overallHeight: 2.67 },
  { sizeKey: "1_2", label: "1/2″", wllTons: 2, weightLb: 0.59, pinDia: 0.63, bodyDia: 0.5, insideLength: 1.81, jawWidth: 0.81, bowWidth: 1.66, overallHeight: 3.03 },
  { sizeKey: "5_8", label: "5/8″", wllTons: 3.25, weightLb: 1.25, pinDia: 0.75, bodyDia: 0.63, insideLength: 2.32, jawWidth: 1.06, bowWidth: 2.04, overallHeight: 3.76 },
  { sizeKey: "3_4", label: "3/4″", wllTons: 4.75, weightLb: 2.25, pinDia: 0.88, bodyDia: 0.75, insideLength: 2.75, jawWidth: 1.25, bowWidth: 2.38, overallHeight: 4.53 },
  { sizeKey: "7_8", label: "7/8″", wllTons: 6.5, weightLb: 3.5, pinDia: 1.0, bodyDia: 0.88, insideLength: 3.19, jawWidth: 1.44, bowWidth: 2.81, overallHeight: 5.33 },
  { sizeKey: "1", label: "1″", wllTons: 8.5, weightLb: 5.0, pinDia: 1.13, bodyDia: 1.0, insideLength: 3.75, jawWidth: 1.69, bowWidth: 3.25, overallHeight: 6.0 },
  { sizeKey: "1_1_8", label: "1-1/8″", wllTons: 9.5, weightLb: 7.0, pinDia: 1.25, bodyDia: 1.13, insideLength: 4.13, jawWidth: 1.81, bowWidth: 3.63, overallHeight: 6.75 },
  { sizeKey: "1_1_4", label: "1-1/4″", wllTons: 12, weightLb: 9.0, pinDia: 1.38, bodyDia: 1.25, insideLength: 4.5, jawWidth: 2.03, bowWidth: 4.0, overallHeight: 7.5 },
  { sizeKey: "1_3_8", label: "1-3/8″", wllTons: 13.5, weightLb: 11.63, pinDia: 1.5, bodyDia: 1.38, insideLength: 5.0, jawWidth: 2.25, bowWidth: 4.43, overallHeight: 8.28 },
  { sizeKey: "1_1_2", label: "1-1/2″", wllTons: 17, weightLb: 15.95, pinDia: 1.63, bodyDia: 1.5, insideLength: 5.38, jawWidth: 2.38, bowWidth: 4.87, overallHeight: 9.05 },
  { sizeKey: "1_3_4", label: "1-3/4″", wllTons: 25, weightLb: 26.75, pinDia: 2.0, bodyDia: 1.75, insideLength: 6.38, jawWidth: 2.88, bowWidth: 5.78, overallHeight: 10.97 },
  { sizeKey: "2", label: "2″", wllTons: 35, weightLb: 42.31, pinDia: 2.25, bodyDia: 2.0, insideLength: 7.25, jawWidth: 3.25, bowWidth: 6.77, overallHeight: 12.74 },
  { sizeKey: "2_1_2", label: "2-1/2″", wllTons: 55, weightLb: 71.75, pinDia: 2.75, bodyDia: 2.5, insideLength: 9.38, jawWidth: 4.12, bowWidth: 8.07, overallHeight: 15.85 },
];

/**
 * @typedef {{
 *   styleId: ShackleStyleId,
 *   label: string,
 *   pinKind: "screw" | "bolt",
 *   bowKind: "anchor" | "chain",
 *   sizes: ShackleSizeRow[],
 * }} ShackleStyleDef
 */

/** @type {ShackleStyleDef[]} */
export const SHACKLE_STYLES = [
  {
    styleId: "bolt-anchor",
    label: "Bolt-type anchor",
    pinKind: "bolt",
    bowKind: "anchor",
    // Bolt-type pin stack is slightly taller than screw-pin body tables.
    sizes: ANCHOR_SHACKLE_SIZES.map((row) => ({
      ...row,
      overallHeight: Math.round((row.overallHeight + row.pinDia * 0.55) * 100) / 100,
      weightLb: Math.round(row.weightLb * 1.08 * 100) / 100,
    })),
  },
  {
    styleId: "bolt-chain",
    label: "Bolt-type chain",
    pinKind: "bolt",
    bowKind: "chain",
    sizes: CHAIN_SHACKLE_SIZES.map((row) => ({
      ...row,
      overallHeight: Math.round((row.overallHeight + row.pinDia * 0.55) * 100) / 100,
      weightLb: Math.round(row.weightLb * 1.08 * 100) / 100,
    })),
  },
];

/** @param {string} styleId @param {string} sizeKey */
export function shackleTypeId(styleId, sizeKey) {
  return `shackle-${styleId}-${sizeKey}`;
}

/**
 * @param {string} typeId
 * @returns {{ style: ShackleStyleDef, size: ShackleSizeRow } | null}
 */
export function parseShackleTypeId(typeId) {
  if (!typeId.startsWith("shackle-")) return null;
  for (const style of SHACKLE_STYLES) {
    const prefix = `shackle-${style.styleId}-`;
    if (!typeId.startsWith(prefix)) continue;
    const sizeKey = typeId.slice(prefix.length);
    const size = style.sizes.find((s) => s.sizeKey === sizeKey);
    if (size) return { style, size };
  }
  return null;
}

/** @param {ShackleSizeRow} size @param {"screw" | "bolt"} pinKind */
export function shackleEnvelope(size, pinKind) {
  const pinExtra = pinKind === "bolt" ? size.pinDia * 0.35 : size.pinDia * 0.15;
  const width = Math.max(size.bowWidth, size.jawWidth + size.bodyDia) + pinExtra;
  const height = size.overallHeight;
  return { width, height };
}
