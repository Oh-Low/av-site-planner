/**
 * Labor cost domain — pure state + pay-tier math (UI in labor-calculator.js).
 *
 * Crew labor cost with stacking pay tiers.
 *
 * Each applicable event bumps the tier once: 1× → 1.5× → 2× (cap).
 * Events (per worked moment within one continuous call):
 *   - after 10 hours worked
 *   - after 14 hours worked
 *   - clock time in [00:00, 06:00)
 *
 * Once an event has applied during the call, it stays earned for the rest of
 * the call (tiers never step back down). Later events can still stack on top.
 *
 * Calls use start/end clock times only. If end ≤ start, the call crosses midnight.
 */

/**
 * @typedef {{
 *   startMs: number,
 *   endMs: number,
 *   hours: number,
 *   multiplier: 1 | 1.5 | 2,
 *   reasons: string[],
 * }} LaborSegment
 *
 * @typedef {{
 *   totalHours: number,
 *   hoursAt1x: number,
 *   hoursAt15x: number,
 *   hoursAt2x: number,
 *   costAt1x: number,
 *   costAt15x: number,
 *   costAt2x: number,
 *   totalCost: number,
 *   segments: LaborSegment[],
 * }} LaborResult
 *
 * @typedef {{
 *   after10: boolean,
 *   after14: boolean,
 *   night: boolean,
 * }} LaborEvents
 *
 * @typedef {{
 *   startTime: string,
 *   endTime: string,
 *   hourlyRate: number,
 *   events: LaborEvents,
 * }} LaborState
 *
 * @typedef {{ hours: number, minutes: number, seconds: number, msOfDay: number }} ParsedTime
 */

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const OT_AFTER_10_MS = 10 * MS_PER_HOUR;
const OT_AFTER_14_MS = 14 * MS_PER_HOUR;

/** Fixed anchor day — only wall-clock hour/minute matter for pay rules. */
const ANCHOR = { y: 2000, m: 1, d: 1 };

/** @returns {LaborEvents} */
export function defaultLaborEvents() {
  return { after10: true, after14: true, night: true };
}

/** @returns {LaborState} */
export function emptyLaborState() {
  return { startTime: "", endTime: "", hourlyRate: 0, events: defaultLaborEvents() };
}

/**
 * @param {unknown} raw
 * @returns {LaborEvents}
 */
export function normalizeLaborEvents(raw) {
  const defaults = defaultLaborEvents();
  if (!raw || typeof raw !== "object") return defaults;
  const e = /** @type {Record<string, unknown>} */ (raw);
  return {
    after10: typeof e.after10 === "boolean" ? e.after10 : defaults.after10,
    after14: typeof e.after14 === "boolean" ? e.after14 : defaults.after14,
    night: typeof e.night === "boolean" ? e.night : defaults.night,
  };
}

/**
 * @param {unknown} data
 * @returns {LaborState}
 */
export function normalizeLaborState(data) {
  if (data == null) return emptyLaborState();
  if (typeof data !== "object") {
    throw new Error("The file has invalid labor calculator data.");
  }
  const raw = /** @type {Record<string, unknown>} */ (data);
  const hourlyRate = typeof raw.hourlyRate === "number" && Number.isFinite(raw.hourlyRate) ? raw.hourlyRate : 0;

  /** Prefer time-only fields; fall back to legacy datetime-local values. */
  let startTime = typeof raw.startTime === "string" ? raw.startTime : "";
  let endTime = typeof raw.endTime === "string" ? raw.endTime : "";
  if (!startTime && typeof raw.startLocal === "string" && raw.startLocal.includes("T")) {
    startTime = raw.startLocal.split("T")[1] ?? "";
  }
  if (!endTime && typeof raw.endLocal === "string" && raw.endLocal.includes("T")) {
    endTime = raw.endLocal.split("T")[1] ?? "";
  }

  return {
    startTime,
    endTime,
    hourlyRate: Math.max(0, hourlyRate),
    events: normalizeLaborEvents(raw.events),
  };
}

/**
 * Parse a time input value (HH:MM or HH:MM:SS).
 * @param {string} value
 * @returns {ParsedTime | null}
 */
export function parseTimeOfDay(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] != null ? Number(match[3]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return {
    hours,
    minutes,
    seconds,
    msOfDay: ((hours * 60 + minutes) * 60 + seconds) * 1000,
  };
}

/**
 * @param {number} hours24
 * @param {number} minutes
 * @returns {string}
 */
export function formatTimeValue(hours24, minutes) {
  const h = ((Math.floor(hours24) % 24) + 24) % 24;
  const m = ((Math.floor(minutes) % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Snap minutes to nearest 5-minute increment (0–55).
 * @param {number} minutes
 * @returns {number}
 */
export function snapMinutes(minutes) {
  if (!Number.isFinite(minutes)) return 0;
  const snapped = Math.round(minutes / 5) * 5;
  return snapped === 60 ? 0 : snapped;
}

/**
 * @param {string} timeStr
 * @returns {string}
 */
export function formatTimeDisplay(timeStr) {
  const parsed = parseTimeOfDay(timeStr);
  if (!parsed) return "Select time";
  const hour12 = ((parsed.hours + 11) % 12) + 1;
  const ampm = parsed.hours < 12 ? "AM" : "PM";
  return `${hour12}:${String(parsed.minutes).padStart(2, "0")} ${ampm}`;
}

/**
 * Map start/end clock times onto an absolute range (< 24h).
 * Overnight when end ≤ start.
 * @param {string} startTime
 * @param {string} endTime
 * @returns {{ startMs: number, endMs: number } | null}
 */
export function resolveCallRange(startTime, endTime) {
  const start = parseTimeOfDay(startTime);
  const end = parseTimeOfDay(endTime);
  if (!start || !end) return null;

  const startMs = new Date(ANCHOR.y, ANCHOR.m - 1, ANCHOR.d, start.hours, start.minutes, start.seconds, 0).getTime();
  let endMs = new Date(ANCHOR.y, ANCHOR.m - 1, ANCHOR.d, end.hours, end.minutes, end.seconds, 0).getTime();
  if (endMs <= startMs) endMs += MS_PER_DAY;
  return { startMs, endMs };
}

/**
 * @param {number} ms
 * @returns {boolean}
 */
export function isNightWindow(ms) {
  const hour = new Date(ms).getHours();
  return hour >= 0 && hour < 6;
}

/**
 * @param {LaborEvents} earned
 * @returns {{ multiplier: 1 | 1.5 | 2, reasons: string[] }}
 */
export function multiplierFromEarned(earned) {
  /** @type {string[]} */
  const reasons = [];
  if (earned.after10) reasons.push("After 10th hour");
  if (earned.after14) reasons.push("After 14th hour");
  if (earned.night) reasons.push("Midnight–6am");

  /** @type {1 | 1.5 | 2} */
  const multiplier = reasons.length === 0 ? 1 : reasons.length === 1 ? 1.5 : 2;
  return { multiplier, reasons };
}

/**
 * Instantaneous events at a moment (does not include previously earned sticky events).
 * @param {number} elapsedMs elapsed work from call start at segment start
 * @param {number} wallMs wall-clock time at segment start
 * @param {LaborEvents} [events]
 * @returns {{ multiplier: 1 | 1.5 | 2, reasons: string[], active: LaborEvents }}
 */
export function payTierAt(elapsedMs, wallMs, events = defaultLaborEvents()) {
  /** @type {LaborEvents} */
  const active = {
    after10: Boolean(events.after10 && elapsedMs >= OT_AFTER_10_MS),
    after14: Boolean(events.after14 && elapsedMs >= OT_AFTER_14_MS),
    night: Boolean(events.night && isNightWindow(wallMs)),
  };
  const { multiplier, reasons } = multiplierFromEarned(active);
  return { multiplier, reasons, active };
}

/**
 * Next local calendar occurrence of hour:00:00 after startMs (strictly greater).
 * @param {number} afterMs
 * @param {number} hour 0–23
 * @returns {number}
 */
function nextLocalHourBoundary(afterMs, hour) {
  const d = new Date(afterMs);
  const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0);
  if (candidate.getTime() <= afterMs) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

/**
 * @param {number} startMs
 * @param {number} endMs
 * @param {LaborEvents} [events]
 * @returns {number[]}
 */
export function collectBoundaries(startMs, endMs, events = defaultLaborEvents()) {
  /** @type {Set<number>} */
  const set = new Set([startMs, endMs]);

  if (events.after10) {
    const t = startMs + OT_AFTER_10_MS;
    if (t > startMs && t < endMs) set.add(t);
  }
  if (events.after14) {
    const t = startMs + OT_AFTER_14_MS;
    if (t > startMs && t < endMs) set.add(t);
  }

  if (events.night) {
    for (const hour of [0, 6]) {
      let t = nextLocalHourBoundary(startMs, hour);
      while (t < endMs) {
        set.add(t);
        t = nextLocalHourBoundary(t, hour);
      }
    }
  }

  return [...set].sort((a, b) => a - b);
}

/** @returns {LaborResult} */
function emptyResult() {
  return {
    totalHours: 0,
    hoursAt1x: 0,
    hoursAt15x: 0,
    hoursAt2x: 0,
    costAt1x: 0,
    costAt15x: 0,
    costAt2x: 0,
    totalCost: 0,
    segments: [],
  };
}

/**
 * @param {number} startMs
 * @param {number} endMs
 * @param {number} hourlyRate
 * @param {LaborEvents} [events]
 * @returns {LaborResult}
 */
export function computeLaborCost(startMs, endMs, hourlyRate, events = defaultLaborEvents()) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return emptyResult();
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0;
  const rules = normalizeLaborEvents(events);

  const bounds = collectBoundaries(startMs, endMs, rules);
  /** @type {LaborSegment[]} */
  const segments = [];

  /** Events stay earned for the rest of the call once they have applied. */
  /** @type {LaborEvents} */
  const earned = { after10: false, after14: false, night: false };

  for (let i = 0; i < bounds.length - 1; i++) {
    const segStart = bounds[i];
    const segEnd = bounds[i + 1];
    if (segEnd <= segStart) continue;
    const elapsedMs = segStart - startMs;
    const { active } = payTierAt(elapsedMs, segStart, rules);

    if (active.after10) earned.after10 = true;
    if (active.after14) earned.after14 = true;
    if (active.night) earned.night = true;

    const { multiplier, reasons } = multiplierFromEarned(earned);
    const hours = (segEnd - segStart) / MS_PER_HOUR;
    segments.push({
      startMs: segStart,
      endMs: segEnd,
      hours,
      multiplier,
      reasons,
    });
  }

  let hoursAt1x = 0;
  let hoursAt15x = 0;
  let hoursAt2x = 0;
  for (const seg of segments) {
    if (seg.multiplier === 1) hoursAt1x += seg.hours;
    else if (seg.multiplier === 1.5) hoursAt15x += seg.hours;
    else hoursAt2x += seg.hours;
  }

  const costAt1x = hoursAt1x * rate;
  const costAt15x = hoursAt15x * rate * 1.5;
  const costAt2x = hoursAt2x * rate * 2;
  const totalHours = hoursAt1x + hoursAt15x + hoursAt2x;

  return {
    totalHours,
    hoursAt1x,
    hoursAt15x,
    hoursAt2x,
    costAt1x,
    costAt15x,
    costAt2x,
    totalCost: costAt1x + costAt15x + costAt2x,
    segments,
  };
}

/**
 * @param {string} startTime
 * @param {string} endTime
 * @param {number} hourlyRate
 * @param {LaborEvents} [events]
 * @returns {LaborResult}
 */
export function computeLaborCostFromTimes(startTime, endTime, hourlyRate, events = defaultLaborEvents()) {
  const range = resolveCallRange(startTime, endTime);
  if (!range) return emptyResult();
  return computeLaborCost(range.startMs, range.endMs, hourlyRate, events);
}

/** @param {number} hours */
export function formatHours(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "0.00 h";
  return `${hours.toFixed(2)} h`;
}

/** @param {number} amount */
export function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "$0.00";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
