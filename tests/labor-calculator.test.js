import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectBoundaries,
  computeLaborCost,
  computeLaborCostFromTimes,
  isNightWindow,
  parseTimeOfDay,
  payTierAt,
  resolveCallRange,
  snapMinutes,
} from "../js/labor-calculator.js";

const MS_PER_HOUR = 3_600_000;

/** Local datetime helper: year, month(1-12), day, hour, minute */
function localMs(y, m, d, h = 0, min = 0) {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

describe("payTierAt", () => {
  it("starts at 1× with no events", () => {
    const day = localMs(2026, 7, 13, 10, 0);
    const tier = payTierAt(0, day);
    assert.equal(tier.multiplier, 1);
    assert.deepEqual(tier.reasons, []);
  });

  it("applies 1.5× after the 10th hour only", () => {
    const day = localMs(2026, 7, 13, 10, 0);
    const tier = payTierAt(10 * MS_PER_HOUR, day);
    assert.equal(tier.multiplier, 1.5);
    assert.deepEqual(tier.reasons, ["After 10th hour"]);
  });

  it("applies 2× after the 14th hour (10th + 14th)", () => {
    const day = localMs(2026, 7, 13, 10, 0);
    const tier = payTierAt(14 * MS_PER_HOUR, day);
    assert.equal(tier.multiplier, 2);
    assert.deepEqual(tier.reasons, ["After 10th hour", "After 14th hour"]);
  });

  it("applies 1.5× for night work alone", () => {
    const night = localMs(2026, 7, 13, 2, 0);
    const tier = payTierAt(0, night);
    assert.equal(tier.multiplier, 1.5);
    assert.deepEqual(tier.reasons, ["Midnight–6am"]);
  });

  it("stacks night + after-10 to 2× and caps there", () => {
    const night = localMs(2026, 7, 13, 1, 0);
    const tier = payTierAt(10 * MS_PER_HOUR, night);
    assert.equal(tier.multiplier, 2);
    assert.ok(tier.reasons.includes("After 10th hour"));
    assert.ok(tier.reasons.includes("Midnight–6am"));
  });

  it("does not raise above 2× when all three events apply", () => {
    const night = localMs(2026, 7, 13, 3, 0);
    const tier = payTierAt(14 * MS_PER_HOUR, night);
    assert.equal(tier.multiplier, 2);
    assert.equal(tier.reasons.length, 3);
  });

  it("ignores disabled pay events", () => {
    const night = localMs(2026, 7, 13, 3, 0);
    const tier = payTierAt(14 * MS_PER_HOUR, night, {
      after10: false,
      after14: false,
      night: true,
    });
    assert.equal(tier.multiplier, 1.5);
    assert.deepEqual(tier.reasons, ["Midnight–6am"]);
  });
});

describe("isNightWindow", () => {
  it("is true from midnight through 5:59", () => {
    assert.equal(isNightWindow(localMs(2026, 7, 13, 0, 0)), true);
    assert.equal(isNightWindow(localMs(2026, 7, 13, 5, 59)), true);
  });

  it("is false from 6:00 onward", () => {
    assert.equal(isNightWindow(localMs(2026, 7, 13, 6, 0)), false);
    assert.equal(isNightWindow(localMs(2026, 7, 13, 12, 0)), false);
  });
});

describe("snapMinutes", () => {
  it("snaps to 5-minute increments", () => {
    assert.equal(snapMinutes(0), 0);
    assert.equal(snapMinutes(2), 0);
    assert.equal(snapMinutes(3), 5);
    assert.equal(snapMinutes(57), 55);
    assert.equal(snapMinutes(58), 0);
  });
});

describe("parseTimeOfDay", () => {
  it("parses HH:MM values", () => {
    const t = parseTimeOfDay("08:30");
    assert.deepEqual(t, { hours: 8, minutes: 30, seconds: 0, msOfDay: 8.5 * MS_PER_HOUR });
  });

  it("returns null for empty input", () => {
    assert.equal(parseTimeOfDay(""), null);
  });
});

describe("resolveCallRange", () => {
  it("keeps same-day calls when end is after start", () => {
    const range = resolveCallRange("09:00", "17:00");
    assert.ok(range);
    assert.equal((range.endMs - range.startMs) / MS_PER_HOUR, 8);
  });

  it("treats end before start as overnight", () => {
    const range = resolveCallRange("22:00", "06:00");
    assert.ok(range);
    assert.equal((range.endMs - range.startMs) / MS_PER_HOUR, 8);
  });

  it("treats equal times as a 24-hour overnight call", () => {
    const range = resolveCallRange("08:00", "08:00");
    assert.ok(range);
    assert.equal((range.endMs - range.startMs) / MS_PER_HOUR, 24);
  });
});

describe("computeLaborCostFromTimes", () => {
  it("charges straight time for a daytime 8-hour call", () => {
    const result = computeLaborCostFromTimes("09:00", "17:00", 100);
    assert.equal(result.totalHours, 8);
    assert.equal(result.hoursAt1x, 8);
    assert.equal(result.hoursAt15x, 0);
    assert.equal(result.hoursAt2x, 0);
    assert.equal(result.totalCost, 800);
  });

  it("applies 1.5× only to hours after 10", () => {
    const result = computeLaborCostFromTimes("08:00", "20:00", 100);
    assert.equal(result.totalHours, 12);
    assert.equal(result.hoursAt1x, 10);
    assert.equal(result.hoursAt15x, 2);
    assert.equal(result.hoursAt2x, 0);
    assert.equal(result.totalCost, 10 * 100 + 2 * 150);
  });

  it("applies 2× after 14 hours from overtime stacking alone", () => {
    const result = computeLaborCostFromTimes("06:00", "22:00", 100);
    assert.equal(result.totalHours, 16);
    assert.equal(result.hoursAt1x, 10);
    assert.equal(result.hoursAt15x, 4);
    assert.equal(result.hoursAt2x, 2);
    assert.equal(result.totalCost, 10 * 100 + 4 * 150 + 2 * 200);
  });

  it("applies night premium for early-morning hours and holds it after 6am", () => {
    const result = computeLaborCostFromTimes("04:00", "08:00", 100);
    assert.equal(result.totalHours, 4);
    // Night bumps to 1.5× and stays earned after 6am (no step-down).
    assert.equal(result.hoursAt15x, 4);
    assert.equal(result.hoursAt1x, 0);
    assert.equal(result.totalCost, 4 * 150);
  });

  it("keeps earned night after leaving the night window", () => {
    const result = computeLaborCostFromTimes("03:00", "09:00", 100);
    assert.equal(result.totalHours, 6);
    assert.equal(result.hoursAt15x, 6);
    assert.equal(result.hoursAt1x, 0);
  });

  it("handles overnight stacking past 10 and 14 hours", () => {
    // 8:00 → 7:00 next day = 23h
    const result = computeLaborCostFromTimes("08:00", "07:00", 50);
    assert.equal(result.totalHours, 23);
    assert.equal(result.hoursAt1x, 10);
    assert.equal(result.hoursAt15x, 4);
    assert.equal(result.hoursAt2x, 9);
    assert.equal(result.totalCost, 10 * 50 + 4 * 75 + 9 * 100);
  });

  it("stacks night + after-10 to 2× from 6am–8am on an 8pm–8am call", () => {
    // 20:00–00:00: 4h @1×
    // 00:00–06:00: 6h @1.5× (night earned)
    // 06:00–08:00: 2h @2× (night stays earned + after 10th hour at 06:00)
    const result = computeLaborCostFromTimes("20:00", "08:00", 100);
    assert.equal(result.totalHours, 12);
    assert.equal(result.hoursAt1x, 4);
    assert.equal(result.hoursAt15x, 6);
    assert.equal(result.hoursAt2x, 2);
    assert.equal(result.totalCost, 4 * 100 + 6 * 150 + 2 * 200);

    const morning = result.segments.filter((seg) => {
      const hour = new Date(seg.startMs).getHours();
      return hour >= 6 && hour < 8;
    });
    assert.ok(morning.length > 0);
    assert.ok(morning.every((seg) => seg.multiplier === 2));
  });

  it("can disable night premium via event flags", () => {
    const result = computeLaborCostFromTimes("04:00", "08:00", 100, {
      after10: true,
      after14: true,
      night: false,
    });
    assert.equal(result.hoursAt1x, 4);
    assert.equal(result.hoursAt15x, 0);
    assert.equal(result.totalCost, 400);
  });
});

describe("computeLaborCost", () => {
  it("returns empty result when end is not after start", () => {
    const t = localMs(2026, 7, 13, 10, 0);
    const result = computeLaborCost(t, t, 100);
    assert.equal(result.totalCost, 0);
    assert.equal(result.segments.length, 0);
  });
});

describe("collectBoundaries", () => {
  it("includes OT and night cutovers", () => {
    const start = localMs(2026, 7, 13, 8, 0);
    const end = localMs(2026, 7, 14, 8, 0);
    const bounds = collectBoundaries(start, end);
    assert.ok(bounds.includes(start + 10 * MS_PER_HOUR));
    assert.ok(bounds.includes(start + 14 * MS_PER_HOUR));
    assert.ok(bounds.includes(localMs(2026, 7, 14, 0, 0)));
    assert.ok(bounds.includes(localMs(2026, 7, 14, 6, 0)));
    assert.equal(bounds[0], start);
    assert.equal(bounds[bounds.length - 1], end);
  });
});
