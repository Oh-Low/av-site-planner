/**
 * Labor calculator UI — domain math lives in js/domain/labor.js.
 */

import {
  computeLaborCost,
  emptyLaborState,
  formatClock,
  formatHours,
  formatMoney,
  formatTimeDisplay,
  formatTimeValue,
  normalizeLaborState,
  parseTimeOfDay,
  resolveCallRange,
  snapMinutes,
} from "./domain/labor.js";
import { recordBefore } from "./undo-runtime.js";

export {
  defaultLaborEvents,
  emptyLaborState,
  normalizeLaborEvents,
  normalizeLaborState,
  parseTimeOfDay,
  formatTimeValue,
  snapMinutes,
  formatTimeDisplay,
  resolveCallRange,
  isNightWindow,
  multiplierFromEarned,
  payTierAt,
  collectBoundaries,
  computeLaborCost,
  computeLaborCostFromTimes,
  formatHours,
  formatMoney,
  formatClock,
} from "./domain/labor.js";

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
        if (active !== startTrigger && active !== endTrigger) return;
        const prev = active === startTrigger ? localState.startTime : localState.endTime;
        if (prev === timeValue) return;
        recordBefore("labor", "time");
        if (active === startTrigger) localState.startTime = timeValue;
        else localState.endTime = timeValue;
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

  rateEl?.addEventListener("input", () => {
    recordBefore("labor", "form", { coalesceMs: 400 });
    refresh();
  });
  rateEl?.addEventListener("change", refresh);
  after10El?.addEventListener("change", () => {
    recordBefore("labor", "events");
    refresh();
  });
  after14El?.addEventListener("change", () => {
    recordBefore("labor", "events");
    refresh();
  });
  nightEl?.addEventListener("change", () => {
    recordBefore("labor", "events");
    refresh();
  });

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
