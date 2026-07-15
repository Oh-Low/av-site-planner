/**
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

/**
 * @param {HTMLElement} dial
 * @param {Array<{ value: number, label: string, slot: number }>} marks
 * @param {number | null} selected
 * @param {(value: number) => void} onPick
 */
function renderDialMarks(dial, marks, selected, onPick) {
  dial.replaceChildren();
  const radius = 42;
  for (const mark of marks) {
    const angle = (mark.slot / 12) * 360 - 90;
    const rad = (angle * Math.PI) / 180;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "labor-clock-mark";
    btn.textContent = mark.label;
    btn.dataset.value = String(mark.value);
    btn.setAttribute("aria-label", mark.label);
    if (selected === mark.value) btn.classList.add("is-selected");
    btn.style.left = `${50 + Math.cos(rad) * radius}%`;
    btn.style.top = `${50 + Math.sin(rad) * radius}%`;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      onPick(mark.value);
    });
    dial.appendChild(btn);
  }
}

/**
 * @param {{
 *   popover: HTMLElement,
 *   onCommit: (timeValue: string) => void,
 * }} options
 */
function createClockController(options) {
  const { popover, onCommit } = options;
  const dial = /** @type {HTMLElement} */ (popover.querySelector(".labor-clock-dial"));
  const hand = /** @type {HTMLElement} */ (popover.querySelector(".labor-clock-hand"));
  const hourBtn = /** @type {HTMLButtonElement} */ (popover.querySelector('[data-part="hour"]'));
  const minuteBtn = /** @type {HTMLButtonElement} */ (popover.querySelector('[data-part="minute"]'));
  const amBtn = /** @type {HTMLButtonElement} */ (popover.querySelector('[data-ampm="AM"]'));
  const pmBtn = /** @type {HTMLButtonElement} */ (popover.querySelector('[data-ampm="PM"]'));
  const modeHint = /** @type {HTMLElement | null} */ (popover.querySelector(".labor-clock-mode-hint"));

  /** @type {"hour" | "minute"} */
  let mode = "hour";
  let hour12 = 12;
  let minute = 0;
  let isPm = false;
  let dirty = false;
  /** @type {HTMLElement | null} */
  let anchor = null;

  function hours24() {
    if (isPm) return hour12 === 12 ? 12 : hour12 + 12;
    return hour12 === 12 ? 0 : hour12;
  }

  function currentValue() {
    return formatTimeValue(hours24(), minute);
  }

  function setHand(value, of) {
    const angle = (value / of) * 360;
    hand.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
  }

  function syncHeader() {
    hourBtn.textContent = String(hour12);
    minuteBtn.textContent = String(minute).padStart(2, "0");
    hourBtn.classList.toggle("is-active", mode === "hour");
    minuteBtn.classList.toggle("is-active", mode === "minute");
    amBtn.classList.toggle("is-active", !isPm);
    pmBtn.classList.toggle("is-active", isPm);
    amBtn.setAttribute("aria-pressed", String(!isPm));
    pmBtn.setAttribute("aria-pressed", String(isPm));
    if (modeHint) modeHint.textContent = mode === "hour" ? "Choose hour" : "Choose minutes";
  }

  function renderMode() {
    syncHeader();
    if (mode === "hour") {
      const marks = Array.from({ length: 12 }, (_, i) => {
        const value = i === 0 ? 12 : i;
        return { value, label: String(value), slot: i };
      });
      renderDialMarks(dial, marks, hour12, (value) => {
        hour12 = value;
        dirty = true;
        setHand(hour12 % 12, 12);
        mode = "minute";
        renderMode();
      });
      setHand(hour12 % 12, 12);
    } else {
      const marks = Array.from({ length: 12 }, (_, i) => {
        const value = i * 5;
        return { value, label: String(value).padStart(2, "0"), slot: i };
      });
      renderDialMarks(dial, marks, minute, (value) => {
        minute = snapMinutes(value);
        dirty = true;
        setHand(minute, 60);
        syncHeader();
        onCommit(currentValue());
        dirty = false;
        close();
      });
      setHand(minute, 60);
    }
  }

  /**
   * @param {string} timeValue
   * @param {HTMLElement} trigger
   */
  function open(timeValue, trigger) {
    const parsed = parseTimeOfDay(timeValue);
    if (parsed) {
      const h = parsed.hours;
      isPm = h >= 12;
      hour12 = ((h + 11) % 12) + 1;
      minute = snapMinutes(parsed.minutes);
    } else {
      isPm = false;
      hour12 = 12;
      minute = 0;
    }
    dirty = false;
    mode = "hour";
    anchor = trigger;
    popover.hidden = false;
    position();
    renderMode();
    hourBtn.focus();
  }

  /** @param {{ force?: boolean }} [opts] */
  function close(opts = {}) {
    if (opts.force || dirty) {
      onCommit(currentValue());
      dirty = false;
    }
    popover.hidden = true;
    anchor = null;
  }

  function position() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const pad = 8;
    const width = popover.offsetWidth || 280;
    const height = popover.offsetHeight || 320;
    let left = rect.left;
    let top = rect.bottom + pad;
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - width - pad);
    if (top + height > window.innerHeight - pad) top = Math.max(pad, rect.top - height - pad);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  hourBtn.addEventListener("click", () => {
    mode = "hour";
    renderMode();
  });
  minuteBtn.addEventListener("click", () => {
    mode = "minute";
    renderMode();
  });
  amBtn.addEventListener("click", () => {
    if (isPm) dirty = true;
    isPm = false;
    syncHeader();
  });
  pmBtn.addEventListener("click", () => {
    if (!isPm) dirty = true;
    isPm = true;
    syncHeader();
  });

  document.addEventListener("pointerdown", (event) => {
    if (popover.hidden) return;
    const target = /** @type {Node | null} */ (event.target);
    if (popover.contains(target) || anchor?.contains(target)) return;
    close();
  });
  document.addEventListener("keydown", (event) => {
    if (popover.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  window.addEventListener("resize", () => {
    if (!popover.hidden) position();
  });

  return {
    open,
    /** Dismiss and keep any AM/PM (or other) edits. */
    close: () => close(),
    isOpen: () => !popover.hidden,
    /** @returns {HTMLElement | null} */
    getAnchor: () => anchor,
  };
}

/** @returns {{ exportState: () => LaborState, importState: (data: object) => void }} */
export function initLaborCalculator() {
  const startTrigger = /** @type {HTMLButtonElement | null} */ (document.getElementById("labor-start-trigger"));
  const endTrigger = /** @type {HTMLButtonElement | null} */ (document.getElementById("labor-end-trigger"));
  const startDisplay = document.getElementById("labor-start-display");
  const endDisplay = document.getElementById("labor-end-display");
  const rateEl = /** @type {HTMLInputElement | null} */ (document.getElementById("labor-rate"));
  const after10El = /** @type {HTMLInputElement | null} */ (document.getElementById("labor-event-10"));
  const after14El = /** @type {HTMLInputElement | null} */ (document.getElementById("labor-event-14"));
  const nightEl = /** @type {HTMLInputElement | null} */ (document.getElementById("labor-event-night"));
  const totalEl = document.getElementById("labor-total");
  const summaryEl = document.getElementById("labor-summary");
  const breakdownEl = document.getElementById("labor-breakdown");
  const statusEl = document.getElementById("labor-status");
  const popover = /** @type {HTMLElement | null} */ (document.getElementById("labor-clock-popover"));

  /** @type {LaborState} */
  let localState = emptyLaborState();

  /** @type {ReturnType<typeof createClockController> | null} */
  let clock = null;

  function readInputs() {
    localState = {
      startTime: localState.startTime,
      endTime: localState.endTime,
      hourlyRate: rateEl ? Number(rateEl.value) || 0 : 0,
      events: {
        after10: after10El?.checked ?? true,
        after14: after14El?.checked ?? true,
        night: nightEl?.checked ?? true,
      },
    };
  }

  function writeInputs() {
    if (startDisplay) startDisplay.textContent = formatTimeDisplay(localState.startTime);
    if (endDisplay) endDisplay.textContent = formatTimeDisplay(localState.endTime);
    if (startTrigger) {
      startTrigger.classList.toggle("is-empty", !localState.startTime);
      startTrigger.setAttribute("aria-label", `Start time, ${formatTimeDisplay(localState.startTime)}`);
    }
    if (endTrigger) {
      endTrigger.classList.toggle("is-empty", !localState.endTime);
      endTrigger.setAttribute("aria-label", `End time, ${formatTimeDisplay(localState.endTime)}`);
    }
    if (rateEl) rateEl.value = localState.hourlyRate ? String(localState.hourlyRate) : "";
    if (after10El) after10El.checked = localState.events.after10;
    if (after14El) after14El.checked = localState.events.after14;
    if (nightEl) nightEl.checked = localState.events.night;
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function refresh() {
    readInputs();
    writeInputs();

    if (!localState.startTime || !localState.endTime) {
      if (totalEl) totalEl.textContent = "—";
      if (summaryEl) summaryEl.innerHTML = "";
      if (breakdownEl) breakdownEl.innerHTML = "";
      setStatus("Enter start time, end time, and hourly rate.");
      return;
    }

    const range = resolveCallRange(localState.startTime, localState.endTime);
    if (!range) {
      if (totalEl) totalEl.textContent = "—";
      if (summaryEl) summaryEl.innerHTML = "";
      if (breakdownEl) breakdownEl.innerHTML = "";
      setStatus("Could not parse one of the times.");
      return;
    }

    const startParsed = parseTimeOfDay(localState.startTime);
    const endParsed = parseTimeOfDay(localState.endTime);
    const overnight = Boolean(startParsed && endParsed && endParsed.msOfDay <= startParsed.msOfDay);
    const result = computeLaborCost(range.startMs, range.endMs, localState.hourlyRate, localState.events);
    if (totalEl) totalEl.textContent = formatMoney(result.totalCost);

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="labor-stat"><span class="labor-stat-label">Total hours</span><span class="labor-stat-value">${formatHours(result.totalHours)}</span></div>
        <div class="labor-stat"><span class="labor-stat-label">Straight (1×)</span><span class="labor-stat-value">${formatHours(result.hoursAt1x)} · ${formatMoney(result.costAt1x)}</span></div>
        <div class="labor-stat"><span class="labor-stat-label">Time-and-a-half (1.5×)</span><span class="labor-stat-value">${formatHours(result.hoursAt15x)} · ${formatMoney(result.costAt15x)}</span></div>
        <div class="labor-stat"><span class="labor-stat-label">Double (2×)</span><span class="labor-stat-value">${formatHours(result.hoursAt2x)} · ${formatMoney(result.costAt2x)}</span></div>
      `;
    }

    if (breakdownEl) {
      if (!result.segments.length) {
        breakdownEl.innerHTML = "";
      } else {
        breakdownEl.innerHTML = result.segments
          .map((seg) => {
            const reasons = seg.reasons.length > 0 ? seg.reasons.join(" + ") : "Base rate";
            const cost = seg.hours * localState.hourlyRate * seg.multiplier;
            return `<li class="labor-segment">
              <div class="labor-segment-main">
                <span class="labor-segment-range">${formatClock(seg.startMs)} → ${formatClock(seg.endMs)}</span>
                <span class="labor-segment-mult">${seg.multiplier}×</span>
              </div>
              <div class="labor-segment-meta">${formatHours(seg.hours)} · ${formatMoney(cost)} · ${reasons}</div>
            </li>`;
          })
          .join("");
      }
    }

    const rateNote = localState.hourlyRate > 0 ? "" : " Set an hourly rate to see dollar totals.";
    const overnightNote = overnight ? " Overnight call." : "";
    setStatus(
      `${formatHours(result.totalHours)} across ${result.segments.length} rate segment${result.segments.length === 1 ? "" : "s"}.${overnightNote}${rateNote}`
    );
  }

  if (popover) {
    clock = createClockController({
      popover,
      onCommit(timeValue) {
        const active = clock?.getAnchor();
        if (active === startTrigger) localState.startTime = timeValue;
        else if (active === endTrigger) localState.endTime = timeValue;
        refresh();
      },
    });
  }

  /**
   * @param {HTMLButtonElement | null} trigger
   * @param {"start" | "end"} which
   */
  function bindTimeTrigger(trigger, which) {
    trigger?.addEventListener("click", () => {
      if (!clock || !trigger) return;
      if (clock.isOpen() && clock.getAnchor() === trigger) {
        clock.close();
        return;
      }
      const value = which === "start" ? localState.startTime : localState.endTime;
      clock.open(value, trigger);
    });
  }

  bindTimeTrigger(startTrigger, "start");
  bindTimeTrigger(endTrigger, "end");

  rateEl?.addEventListener("input", refresh);
  rateEl?.addEventListener("change", refresh);
  after10El?.addEventListener("change", refresh);
  after14El?.addEventListener("change", refresh);
  nightEl?.addEventListener("change", refresh);

  refresh();

  return {
    exportState() {
      readInputs();
      return {
        startTime: localState.startTime,
        endTime: localState.endTime,
        hourlyRate: localState.hourlyRate,
        events: { ...localState.events },
      };
    },
    /** @param {object} data */
    importState(data) {
      localState = normalizeLaborState(data);
      writeInputs();
      refresh();
    },
  };
}

export const calculatorPlugin = {
  meta: {
    id: "labor-calculator",
    tabPanelId: "labor-calculator",
    stateKey: "labor",
    label: "Labor Calculator",
    requiredForSave: false,
    emptyState: emptyLaborState,
    /** @param {unknown} data */
    validateState(data) {
      return normalizeLaborState(data);
    },
  },
  init: initLaborCalculator,
};
