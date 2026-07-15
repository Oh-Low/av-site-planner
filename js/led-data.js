/** Metric column values from inventory sheets are in centimeters; app uses millimeters. */
function metricFromSheet(cm, physicalInches = 0) {
  if (cm > 0) return cm * 10;
  if (physicalInches > 0) return Math.round(physicalInches * 25.4);
  return 0;
}

function processorTypeFromSheet(value) {
  if (!value || value === "EMPTY") return "NovaStar";
  return value.toLowerCase() === "novastar" ? "NovaStar" : value;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** @param {number} maxTilesPerPort @param {number} totalPixels */
function maxPerPortFromTiles(maxTilesPerPort, totalPixels) {
  return maxTilesPerPort * totalPixels;
}

/** LED panel presets from site inventory */
export const PREBUILT_TILES = [
  {
    id: slugify("Infiled DB 2.6"),
    name: "Infiled DB 2.6",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 192,
    pixelHeight: 192,
    totalPixels: 36864,
    maxPerPort: maxPerPortFromTiles(17, 36864),
    metricWidth: metricFromSheet(50, 19.685),
    metricHeight: metricFromSheet(50, 19.685),
    weight: 19.4,
    wattage: 150,
  },
  {
    id: slugify("ROE BP 2"),
    name: "ROE BP 2",
    processorType: processorTypeFromSheet("Brompton"),
    wiringType: "Horizontal",
    pixelWidth: 176,
    pixelHeight: 176,
    totalPixels: 30976,
    maxPerPort: maxPerPortFromTiles(16, 30976),
    metricWidth: metricFromSheet(50, 19.685),
    metricHeight: metricFromSheet(50, 19.685),
    weight: 20.61,
    wattage: 160,
  },
  {
    id: slugify("Infiled AR 3.9"),
    name: "Infiled AR 3.9",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 128,
    pixelHeight: 256,
    totalPixels: 32768,
    maxPerPort: maxPerPortFromTiles(19, 32768),
    metricWidth: metricFromSheet(50, 19.685),
    metricHeight: metricFromSheet(100, 39.37),
    weight: 27.5,
    wattage: 300,
  },
  {
    id: slugify("Roe Vanish 8"),
    name: "Roe Vanish 8",
    processorType: processorTypeFromSheet("Brompton"),
    wiringType: "Horizontal",
    pixelWidth: 112,
    pixelHeight: 112,
    totalPixels: 12544,
    maxPerPort: maxPerPortFromTiles(41, 12544),
    metricWidth: metricFromSheet(100, 39.37),
    metricHeight: metricFromSheet(100, 39.37),
    weight: 20.46,
    wattage: 440,
  },
  {
    id: slugify("Infiled X2.9"),
    name: "Infiled X2.9",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 168,
    pixelHeight: 168,
    totalPixels: 28224,
    maxPerPort: maxPerPortFromTiles(23, 28224),
    metricWidth: metricFromSheet(50, 19.685),
    metricHeight: metricFromSheet(50, 19.685),
    weight: 19.62,
    wattage: 180,
  },
  {
    id: slugify("Infiled AR5.9"),
    name: "Infiled AR5.9",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 84,
    pixelHeight: 168,
    totalPixels: 14112,
    maxPerPort: maxPerPortFromTiles(46, 14112),
    metricWidth: 500,
    metricHeight: 1000,
    weight: 27.5,
    wattage: 180,
  },
  {
    id: slugify("PRGs Absen AX 1.5"),
    name: "PRGs Absen AX 1.5",
    processorType: processorTypeFromSheet("Brompton"),
    wiringType: "Horizontal",
    pixelWidth: 384,
    pixelHeight: 216,
    totalPixels: 82944,
    maxPerPort: maxPerPortFromTiles(6, 82944),
    metricWidth: metricFromSheet(61, 24),
    metricHeight: metricFromSheet(34, 13.5),
    weight: 17.19,
    wattage: 180,
  },
  {
    id: slugify("Amflex 1.6"),
    name: "Amflex 1.6",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 240,
    pixelHeight: 180,
    totalPixels: 43200,
    maxPerPort: maxPerPortFromTiles(15, 43200),
    metricWidth: metricFromSheet(40, 15.748),
    metricHeight: metricFromSheet(30, 11.811),
    weight: 3.3,
    wattage: 78,
  },
  {
    id: slugify("Absen 1.2"),
    name: "Absen 1.2",
    processorType: processorTypeFromSheet("Brompton"),
    wiringType: "Horizontal",
    pixelWidth: 480,
    pixelHeight: 270,
    totalPixels: 129600,
    maxPerPort: maxPerPortFromTiles(4, 129600),
    metricWidth: metricFromSheet(61, 24),
    metricHeight: metricFromSheet(34, 13.5),
    weight: 17.19,
    wattage: 135,
  },
  {
    id: slugify("ROE CB5"),
    name: "ROE CB5",
    processorType: processorTypeFromSheet("Brompton"),
    wiringType: "Horizontal",
    pixelWidth: 104,
    pixelHeight: 208,
    totalPixels: 21632,
    maxPerPort: maxPerPortFromTiles(24, 21632),
    metricWidth: metricFromSheet(60, 23.6),
    metricHeight: metricFromSheet(120, 47.2),
    weight: 13.9,
    wattage: 500,
  },
  {
    id: slugify("Infiled X2.5"),
    name: "Infiled X2.5",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 200,
    pixelHeight: 200,
    totalPixels: 40000,
    maxPerPort: maxPerPortFromTiles(16, 40000),
    metricWidth: metricFromSheet(50, 19.685),
    metricHeight: metricFromSheet(50, 19.685),
    weight: 21,
    wattage: 180,
  },
  {
    id: slugify("ROE CB8"),
    name: "ROE CB8",
    processorType: processorTypeFromSheet("Brompton"),
    wiringType: "Horizontal",
    pixelWidth: 72,
    pixelHeight: 144,
    totalPixels: 10368,
    maxPerPort: maxPerPortFromTiles(50, 10368),
    metricWidth: metricFromSheet(60, 23.6),
    metricHeight: metricFromSheet(120, 47.2),
    weight: 27.96,
    wattage: 430,
  },
  {
    id: slugify("Infiled X1.9"),
    name: "Infiled X1.9",
    processorType: processorTypeFromSheet("Novastar"),
    wiringType: "Horizontal",
    pixelWidth: 256,
    pixelHeight: 256,
    totalPixels: 65536,
    maxPerPort: maxPerPortFromTiles(9, 65536),
    metricWidth: metricFromSheet(50, 19.685),
    metricHeight: metricFromSheet(50, 19.685),
    weight: 21,
    wattage: 120,
  },
];

export const LINE_COLORS = {
  data: ["#22d3ee", "#06b6d4", "#0891b2", "#0e7490", "#155e75", "#164e63"],
  power: ["#f59e0b", "#d97706", "#b45309", "#92400e", "#78350f", "#451a03"],
};

export const BITRATE_PIXEL_FACTOR = {
  8: 1,
  10: 1.25,
  12: 1.5,
};

export const MAX_AMPS = 20;
