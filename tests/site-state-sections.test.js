/**
 * Phase 0: round-trip / normalize coverage for optional .AVP sections.
 * Documents current contract behavior, including known gaps.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  emptyCableState,
  normalizeCableState,
} from "../js/domain/cable.js";
import {
  emptyGroundplanState,
  validateGroundplanState,
} from "../js/domain/groundplan.js";
import { emptyLaborState, normalizeLaborState } from "../js/domain/labor.js";
import {
  emptyPaperworkState,
  normalizePaperworkState,
} from "../js/domain/paperwork.js";
import { emptyContentMapsState } from "../js/domain/content-maps.js";
import {
  SITE_STATE_VERSION,
  migrateSiteStateToV2,
  parseSiteState,
  validateSiteState,
} from "../js/site-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../fixtures/default.avp");

/** Use domain empty state (same shape as content-maps emptyContentMapsState). */
const emptyContentMaps = emptyContentMapsState();

const minimalRequired = {
  formatVersion: 2,
  app: "av-site-planner",
  exportedAt: "2026-07-25T00:00:00.000Z",
  activeTab: "led-calculator",
  led: { grids: [], activeGridId: null, voltage: 120, bitrate: 8 },
  projector: {
    screens: [
      {
        id: "screen-1",
        name: "Projection Screen",
        unit: "ft",
        aspectId: "16:9",
        width: 16,
        height: 9,
        projectors: [],
        projectorGroups: [],
        activeProjectorId: null,
        activeGroupId: null,
        view: null,
      },
    ],
    activeScreenId: "screen-1",
    activeSidebarTab: "screen",
  },
};

describe("fixtures/default.avp", () => {
  it("parses and fills optional sections from emptyState", () => {
    const raw = readFileSync(fixturePath, "utf8");
    const parsed = parseSiteState(raw);
    assert.equal(parsed.formatVersion, SITE_STATE_VERSION);
    assert.ok(Array.isArray(parsed.led.grids));
    assert.equal(parsed.projector.screens.length, 1);
    assert.equal("places" in parsed.signalFlow, false);
    assert.deepEqual(parsed.places, []);
    assert.equal(parsed.groundplan.imageDataUrl, null);
    assert.deepEqual(parsed.contentMaps.surfaces, []);
    assert.deepEqual(parsed.cable, emptyCableState());
    assert.equal(parsed.labor.hourlyRate, 0);
    assert.equal(parsed.paperwork.paper.size, "arch-c");
  });
});

describe("groundplan section", () => {
  it("round-trips through validateGroundplanState", () => {
    const sample = {
      imageDataUrl: "data:image/png;base64,abc",
      imageWidth: 2000,
      imageHeight: 1000,
      scale: {
        pointA: { x: 10, y: 10 },
        pointB: { x: 110, y: 10 },
        unit: "imperial",
        distanceMeters: 3.048,
      },
      placeMarkers: [
        {
          placeId: "p1",
          x: 100,
          y: 200,
          width: 40,
          height: 40,
          color: "#ff0000",
          shape: "pill",
        },
      ],
      cableRoutes: [
        {
          id: "r1",
          fromPlaceId: "p1",
          toPlaceId: "p2",
          points: [
            { x: 0, y: 0 },
            { x: 50, y: 50, heightMeters: 1.2 },
          ],
          color: "#00ff00",
          labelX: 25,
          labelY: 25,
        },
      ],
      rulerLines: [{ id: "ruler-1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
      showScaleInViewport: false,
      extraTopLevel: "dropped",
    };

    const normalized = validateGroundplanState(sample);
    assert.equal(normalized.imageDataUrl, sample.imageDataUrl);
    assert.equal(normalized.scale.unit, "imperial");
    assert.equal(normalized.placeMarkers.length, 1);
    assert.equal(normalized.cableRoutes[0].points[1].heightMeters, 1.2);
    assert.equal(normalized.showScaleInViewport, false);
    assert.equal("extraTopLevel" in normalized, false);

    const again = validateGroundplanState(normalized);
    assert.deepEqual(again, normalized);
  });

  it("fills empty groundplan when null", () => {
    assert.deepEqual(validateGroundplanState(null), emptyGroundplanState());
  });

  it("survives full site parse", () => {
    const state = {
      ...minimalRequired,
      groundplan: {
        ...emptyGroundplanState(),
        placeMarkers: [{ placeId: "stage", x: 1, y: 2 }],
      },
    };
    const parsed = parseSiteState(JSON.stringify(state));
    assert.equal(parsed.groundplan.placeMarkers[0].placeId, "stage");
  });
});

describe("contentMaps section", () => {
  it("migrate fills emptyState when omitted", () => {
    const migrated = migrateSiteStateToV2(minimalRequired);
    assert.deepEqual(migrated.contentMaps.surfaces, emptyContentMaps.surfaces);
    assert.equal(migrated.contentMaps.activeSurfaceId, null);
    assert.deepEqual(migrated.contentMaps.zoneLabels, emptyContentMaps.zoneLabels);
    assert.deepEqual(migrated.contentMaps.testPattern, emptyContentMaps.testPattern);
  });

  it("validateState normalizes surfaces and strips unknown keys", () => {
    const messy = {
      ...emptyContentMaps,
      surfaces: [{ id: "s1", name: "Main", width: 1920, height: 1080, zones: [] }],
      activeSurfaceId: "s1",
      unexpected: true,
    };
    const state = validateSiteState({
      ...migrateSiteStateToV2(minimalRequired),
      contentMaps: messy,
    });
    assert.equal("unexpected" in state.contentMaps, false);
    assert.equal(state.contentMaps.surfaces[0].id, "s1");
    assert.equal(state.contentMaps.surfaces[0].width, 1920);
    assert.equal(state.contentMaps.activeSurfaceId, "s1");
  });
});

describe("cable section", () => {
  it("normalizes manual cables and drops invalid rows", () => {
    const normalized = normalizeCableState({
      routes: {
        r1: [
          {
            id: "m1",
            cableLabel: "HDMI",
            fromDevice: "A",
            toDevice: "B",
            amount: 2.7,
            extra: 1,
          },
          { cableLabel: "  ", fromDevice: "x", toDevice: "y", amount: 1 },
        ],
      },
      places: {
        p1: [{ cableLabel: "XLR", fromDevice: "", toDevice: "", amount: 0 }],
      },
      junk: true,
    });

    assert.equal("junk" in normalized, false);
    assert.equal(normalized.routes.r1.length, 1);
    assert.equal(normalized.routes.r1[0].amount, 2);
    assert.equal("extra" in normalized.routes.r1[0], false);
    assert.equal(normalized.places.p1[0].amount, 1);

    assert.deepEqual(normalizeCableState(normalized), normalized);
    assert.deepEqual(normalizeCableState(null), emptyCableState());
  });

  it("round-trips through parseSiteState", () => {
    const cable = {
      routes: {
        "route-1": [
          { id: "m1", cableLabel: "SDI", fromDevice: "Cam", toDevice: "SW", amount: 3 },
        ],
      },
      places: {},
    };
    const parsed = parseSiteState(JSON.stringify({ ...minimalRequired, cable }));
    assert.equal(parsed.cable.routes["route-1"][0].cableLabel, "SDI");
    assert.equal(parsed.cable.routes["route-1"][0].amount, 3);
  });
});

describe("labor section", () => {
  it("normalizes rates, events, and legacy datetime-local fields", () => {
    const normalized = normalizeLaborState({
      startLocal: "2026-07-25T08:30",
      endLocal: "2026-07-25T18:00",
      hourlyRate: 45.5,
      events: { after10: false, after14: true, night: false },
      extra: 1,
    });
    assert.equal(normalized.startTime, "08:30");
    assert.equal(normalized.endTime, "18:00");
    assert.equal(normalized.hourlyRate, 45.5);
    assert.deepEqual(normalized.events, { after10: false, after14: true, night: false });
    assert.equal("extra" in normalized, false);
    assert.equal("startLocal" in normalized, false);

    assert.deepEqual(normalizeLaborState(null), emptyLaborState());
  });

  it("round-trips through parseSiteState", () => {
    const labor = {
      startTime: "09:00:00",
      endTime: "17:00:00",
      hourlyRate: 30,
      events: { after10: true, after14: false, night: true },
    };
    const parsed = parseSiteState(JSON.stringify({ ...minimalRequired, labor }));
    assert.deepEqual(parsed.labor, labor);
  });
});

describe("paperwork section", () => {
  it("normalizes paper, sheets, and strips unknown top-level keys", () => {
    const normalized = normalizePaperworkState({
      identity: { show: "Demo", venue: "Hall A" },
      paper: { size: "letter", orientation: "portrait" },
      titleBlockDefault: false,
      sheets: [
        {
          id: "s1",
          typeId: "cover",
          sourceKey: null,
          title: "Cover",
          included: true,
          order: 0,
          notes: "",
          elements: [],
        },
      ],
      activeSheetId: "s1",
      selectedElementId: "el-1",
      selectedDecorationId: "d-1",
      grid: { snap: false, visible: true, sizeIn: 0.5 },
      unknown: "gone",
    });

    assert.equal(normalized.identity.show, "Demo");
    assert.equal(normalized.paper.size, "letter");
    assert.equal(normalized.paper.orientation, "portrait");
    assert.equal(normalized.titleBlockDefault, false);
    assert.equal(normalized.sheets[0].id, "s1");
    assert.equal(normalized.activeSheetId, "s1");
    assert.equal(normalized.selectedElementId, "el-1");
    assert.equal(normalized.grid.sizeIn, 0.5);
    assert.equal(normalized.grid.snap, false);
    assert.equal("unknown" in normalized, false);
  });

  it("falls back to empty paperwork shape", () => {
    const empty = emptyPaperworkState();
    const normalized = normalizePaperworkState(null);
    assert.equal(normalized.paper.size, empty.paper.size);
    assert.equal(normalized.sheets.length, 0);
    assert.equal(normalized.titleBlockLogo, null);
  });

  it("round-trips through parseSiteState", () => {
    const paperwork = normalizePaperworkState({
      identity: { show: "Tour 2026" },
      sheets: [{ id: "cover-1", typeId: "cover", title: "Cover", order: 0, elements: [] }],
      activeSheetId: "cover-1",
    });
    const parsed = parseSiteState(JSON.stringify({ ...minimalRequired, paperwork }));
    assert.equal(parsed.paperwork.identity.show, "Tour 2026");
    assert.equal(parsed.paperwork.sheets[0].typeId, "cover");
  });
});

describe("signalFlow colorByCableType and grid", () => {
  it("parseSiteState preserves colorByCableType and grid", () => {
    const parsed = parseSiteState(
      JSON.stringify({
        ...minimalRequired,
        signalFlow: {
          nodes: [{ id: "n1" }],
          connections: [],
          customGearTypes: [],
          gearLibraryFolders: [],
          colorByCableType: true,
          grid: { snap: false, size: 32 },
        },
      })
    );
    assert.equal(parsed.signalFlow.nodes.length, 1);
    assert.equal(parsed.signalFlow.colorByCableType, true);
    assert.deepEqual(parsed.signalFlow.grid, { snap: false, size: 32 });
  });

  it("clamps grid size and defaults when omitted", () => {
    const parsed = parseSiteState(
      JSON.stringify({
        ...minimalRequired,
        signalFlow: {
          nodes: [],
          connections: [],
          grid: { snap: true, size: 9999 },
        },
      })
    );
    assert.equal(parsed.signalFlow.colorByCableType, false);
    assert.equal(parsed.signalFlow.grid.size, 400);
  });
});

describe("root places", () => {
  it("lifts nested places and strips them from signalFlow", () => {
    const parsed = parseSiteState(
      JSON.stringify({
        ...minimalRequired,
        signalFlow: {
          nodes: [{ id: "n1" }],
          connections: [],
          places: [{ id: "p1", name: "Stage" }],
        },
      })
    );
    assert.deepEqual(parsed.places, [{ id: "p1", name: "Stage" }]);
    assert.equal("places" in parsed.signalFlow, false);
  });

  it("keeps root places when both root and nested exist", () => {
    const parsed = parseSiteState(
      JSON.stringify({
        ...minimalRequired,
        places: [{ id: "root", name: "Root" }],
        signalFlow: {
          nodes: [],
          connections: [],
          places: [{ id: "nested", name: "Nested" }],
        },
      })
    );
    assert.deepEqual(parsed.places, [{ id: "root", name: "Root" }]);
    assert.equal("places" in parsed.signalFlow, false);
  });
});

describe("full optional envelope round-trip", () => {
  it("parse → validate preserves populated optional sections", () => {
    const envelope = {
      ...minimalRequired,
      places: [{ id: "stage", name: "Stage" }],
      signalFlow: {
        nodes: [],
        connections: [],
        customGearTypes: [],
        gearLibraryFolders: [],
        colorByCableType: true,
        grid: { snap: true, size: 24 },
      },
      groundplan: {
        ...emptyGroundplanState(),
        placeMarkers: [{ placeId: "stage", x: 10, y: 20, shape: "rect" }],
      },
      contentMaps: {
        ...emptyContentMaps,
        surfaces: [
          { id: "surf-1", name: "LED wall", width: 3840, height: 2160, zones: [] },
        ],
        activeSurfaceId: "surf-1",
      },
      cable: {
        routes: {},
        places: {
          stage: [
            { id: "mc1", cableLabel: "ETH", fromDevice: "SW", toDevice: "AP", amount: 1 },
          ],
        },
      },
      labor: {
        startTime: "10:00",
        endTime: "22:00",
        hourlyRate: 40,
        events: { after10: true, after14: true, night: true },
      },
      paperwork: normalizePaperworkState({
        identity: { show: "Full envelope" },
        sheets: [{ id: "c1", typeId: "cover", title: "Cover", order: 0, elements: [] }],
      }),
    };

    const parsed = parseSiteState(JSON.stringify(envelope));
    assert.equal(parsed.places[0].id, "stage");
    assert.equal("places" in parsed.signalFlow, false);
    assert.equal(parsed.signalFlow.colorByCableType, true);
    assert.equal(parsed.signalFlow.grid.size, 24);
    assert.equal(parsed.groundplan.placeMarkers[0].placeId, "stage");
    assert.equal(parsed.contentMaps.surfaces[0].id, "surf-1");
    assert.equal(parsed.cable.places.stage[0].cableLabel, "ETH");
    assert.equal(parsed.labor.hourlyRate, 40);
    assert.equal(parsed.paperwork.identity.show, "Full envelope");
  });
});
