import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addGearListHeader,
  addManualGearListItem,
  autoCablePlanFromCableCards,
  autoCablesFromCableCards,
  autoGearFromSignalFlow,
  autoLedWallSectionsFromLed,
  classifyLedLineJumpers,
  emptyGearListState,
  flattenManualCables,
  fuzzyTextMatch,
  gearListRowSearchText,
  gearListRowsForDisplay,
  gearListSourceKeyLinksToSignalFlow,
  isGearListCableOtherSection,
  ledWallNeighborJumperCount,
  ledWallTileGridSize,
  nodeIdsForGearListSourceKey,
  orderGearListCablePlan,
  partitionGearListSections,
  roomIdFromGearListSourceKey,
  scopeGearListCablePlan,
  scopeGearListItems,
  summarizeLedMapJumpers,
  moveGearListRow,
  normalizeGearListState,
  removeGearListRow,
  reorderGearListRow,
  syncGearListRows,
  unscopedGearListSourceKey,
  updateGearListRow,
  updateGearListSettings,
  filterGearListRowsForPaperwork,
  gearListRowsForPaperwork,
  isGearListRowIncluded,
} from "../js/domain/gear-list.js";

describe("gear list domain", () => {
  it("partitions gear list rows into LED / Signal Flow / Cables columns", () => {
    const sections = partitionGearListSections([
      {
        id: "h1",
        kind: "header",
        label: "LED",
        level: "section",
        source: "manual",
        sourceKey: null,
      },
      {
        id: "a",
        kind: "item",
        category: "gear",
        label: "Tile",
        detail: "",
        qty: 4,
        length: null,
        room: "",
        place: "",
        notes: "",
        source: "auto",
        sourceKey: "x",
      },
      {
        id: "h2",
        kind: "header",
        label: "Signal Flow gear",
        level: "section",
        source: "manual",
        sourceKey: null,
      },
      {
        id: "b",
        kind: "item",
        category: "gear",
        label: "Switcher",
        detail: "",
        qty: 1,
        length: null,
        room: "",
        place: "",
        notes: "",
        source: "manual",
        sourceKey: null,
      },
      {
        id: "h3",
        kind: "header",
        label: "Cables",
        level: "section",
        source: "manual",
        sourceKey: null,
      },
      {
        id: "h3b",
        kind: "header",
        label: "FOH → Stage + 10 m",
        level: "subsection",
        source: "auto",
        sourceKey: "cable-route:r1",
      },
      {
        id: "c",
        kind: "item",
        category: "cable",
        label: "HDMI",
        detail: "",
        qty: 2,
        length: 25,
        room: "",
        place: "",
        notes: "",
        source: "auto",
        sourceKey: "y",
      },
      {
        id: "h4",
        kind: "header",
        label: "Soft goods",
        level: "section",
        source: "manual",
        sourceKey: null,
      },
      {
        id: "d",
        kind: "item",
        category: "gear",
        label: "Drape",
        detail: "",
        qty: 3,
        length: null,
        room: "",
        place: "",
        notes: "",
        source: "manual",
        sourceKey: null,
      },
    ]);
    assert.deepEqual(
      sections.map((s) => s.title),
      ["LED", "Signal Flow", "Cables", "Soft goods"]
    );
    assert.equal(sections[2].rows[0].kind, "header");
    assert.equal(sections[2].rows[1].label, "HDMI");
  });

  it("starts with LED, Signal Flow, and Cables section headers", () => {
    const state = emptyGearListState();
    assert.equal(state.rows.length, 3);
    assert.equal(state.rows[0].kind, "header");
    assert.equal(state.rows[0].label, "LED");
    assert.match(state.rows[1].label, /Signal Flow/i);
    assert.match(state.rows[2].label, /Cable/i);
  });

  it("condenses same-name gear and keeps renames as separate lines", () => {
    const gear = autoGearFromSignalFlow([
      { id: "n1", name: "Display", typeId: "display" },
      { id: "n2", name: "Display", typeId: "display" },
      { id: "n3", name: "Switcher", typeId: "switcher" },
      { id: "n4", name: "Display Left", typeId: "display" },
    ]);
    assert.equal(gear.length, 3);
    const displays = gear.find((g) => g.label === "Display");
    const displayLeft = gear.find((g) => g.label === "Display Left");
    const switcher = gear.find((g) => g.label === "Switcher");
    assert.ok(displays);
    assert.equal(displays.qty, 2);
    assert.ok(displayLeft);
    assert.equal(displayLeft.qty, 1);
    assert.ok(switcher);
    assert.equal(switcher.qty, 1);
  });

  it("groups nameless nodes by typeId and named custom nodes by name", () => {
    const gear = autoGearFromSignalFlow([
      { id: "a", typeId: "matrix" },
      { id: "b", typeId: "matrix" },
      { id: "c", name: "Spare soft goods" },
      { id: "d", name: "Spare soft goods" },
    ]);
    assert.equal(gear.length, 2);
    assert.equal(gear.find((g) => g.label === "matrix")?.qty, 2);
    assert.equal(gear.find((g) => g.label === "Spare soft goods")?.qty, 2);
  });

  it("condenses same-type cables within a route regardless of path detail", () => {
    const plan = autoCablePlanFromCableCards({
      routeCards: [
        {
          id: "r1",
          title: "FOH → Stage",
          lengthLabel: "12 m",
          rows: [
            {
              connectionId: "c1",
              cableLabel: "HDMI",
              fromDevice: "Switcher",
              toDevice: "Display",
              amount: 2,
              length: 50,
            },
            {
              connectionId: "c2",
              cableLabel: "HDMI",
              fromDevice: "Laptop",
              toDevice: "Switcher",
              amount: 1,
              length: 25,
            },
            {
              connectionId: "c3",
              cableLabel: "SDI",
              fromDevice: "Cam",
              toDevice: "E2",
              amount: 1,
              length: 25,
            },
            {
              connectionId: "c4",
              cableLabel: "HDMI",
              fromDevice: "PC",
              toDevice: "Mon",
              amount: 1,
              length: 50,
            },
          ],
        },
      ],
    });
    assert.equal(plan.sections.length, 1);
    const items = plan.sections[0].items;
    // Type order (HDMI before SDI), then length ascending within type.
    assert.deepEqual(
      items.map((i) => `${i.label}:${i.length}:${i.qty}`),
      ["HDMI:25:1", "HDMI:50:3", "SDI:25:1"]
    );
    assert.equal(items.every((i) => i.detail === ""), true);
  });

  it("inserts on reorder instead of swapping", () => {
    let state = emptyGearListState();
    state = addManualGearListItem(state, { label: "A", qty: 1 });
    state = addManualGearListItem(state, { label: "B", qty: 1 });
    state = addManualGearListItem(state, { label: "C", qty: 1 });
    const ids = state.rows.filter((r) => r.kind === "item").map((r) => r.id);
    // Move C before A → A,B,C becomes C,A,B
    state = reorderGearListRow(state, ids[2], ids[0], "before");
    const labels = state.rows.filter((r) => r.kind === "item").map((r) => r.label);
    assert.deepEqual(labels, ["C", "A", "B"]);
    // Move A after B → C,B,A
    const ids2 = state.rows.filter((r) => r.kind === "item").map((r) => r.id);
    state = reorderGearListRow(state, ids2[1], ids2[2], "after");
    const labels2 = state.rows.filter((r) => r.kind === "item").map((r) => r.label);
    assert.deepEqual(labels2, ["C", "B", "A"]);
  });

  it("puts each route's cables under a subsection named route + length", () => {
    const plan = autoCablePlanFromCableCards({
      routeCards: [
        {
          id: "r1",
          title: "FOH → Stage",
          lengthLabel: "12.4 m",
          rows: [
            {
              connectionId: "c1",
              cableLabel: "HDMI",
              fromDevice: "Switcher",
              toDevice: "Display",
              fromNodeId: "n1",
              toNodeId: "n2",
              amount: 2,
            },
          ],
        },
        {
          id: "r2",
          title: "Stage → Delay",
          lengthLabel: "40 ft",
          rows: [
            {
              connectionId: "c2",
              cableLabel: "SDI",
              fromDevice: "Matrix",
              toDevice: "TX",
              amount: 1,
            },
          ],
        },
      ],
      placeCards: [
        {
          id: "p1",
          title: "FOH",
          lengthLabel: "Local",
          rows: [
            {
              connectionId: "c3",
              cableLabel: "XLR",
              fromDevice: "Mic",
              toDevice: "Console",
              amount: 1,
            },
          ],
        },
      ],
      manualsByRoute: {
        r1: [{ id: "m1", cableLabel: "CAT6", fromDevice: "SW", toDevice: "AP", amount: 1 }],
      },
    });

    assert.equal(plan.sections.length, 3);
    assert.equal(plan.sections[0].header.label, "FOH → Stage + 12.4 m");
    assert.equal(plan.sections[0].header.level, "subsection");
    assert.equal(plan.sections[0].header.sourceKey, "cable-route:r1");
    assert.equal(plan.sections[0].items.length, 2); // HDMI + manual CAT6
    assert.equal(plan.sections[1].header.label, "Stage → Delay + 40 ft");
    assert.equal(plan.sections[2].header.label, "Other");
    const other = plan.sections.find((s) => s.header.sourceKey === "cable-other");
    assert.ok(other);
    assert.equal(other.header.label, "Other");
    assert.equal(other.items.length, 1);
    assert.equal(other.items[0].label, "XLR");
    assert.equal(plan.looseItems.length, 0);
  });

  it("keeps multi-room route subsections ahead of Other buckets", () => {
    const room1 = autoCablePlanFromCableCards({
      roomName: "Ballroom A",
      routeCards: [
        {
          id: "r-a",
          title: "FOH → Stage",
          lengthLabel: "10 m",
          rows: [
            {
              connectionId: "c1",
              cableLabel: "HDMI",
              fromDevice: "A",
              toDevice: "B",
              amount: 1,
            },
          ],
        },
      ],
      placeCards: [
        {
          id: "p-a",
          title: "FOH",
          rows: [
            {
              connectionId: "c2",
              cableLabel: "XLR",
              fromDevice: "Mic",
              toDevice: "Desk",
              amount: 1,
            },
          ],
        },
      ],
    });
    const room2 = autoCablePlanFromCableCards({
      roomName: "Ballroom B",
      routeCards: [
        {
          id: "r-b",
          title: "Control → Stage",
          lengthLabel: "25 m",
          rows: [
            {
              connectionId: "c3",
              cableLabel: "SDI",
              fromDevice: "C",
              toDevice: "D",
              amount: 1,
            },
          ],
        },
      ],
      placeCards: [],
    });
    assert.equal(room1.sections[1].header.label, "Other — Ballroom A");
    assert.equal(isGearListCableOtherSection(room1.sections[1]), true);

    const merged = orderGearListCablePlan({
      sections: [...room1.sections, ...room2.sections],
      looseItems: [],
    });
    assert.deepEqual(
      merged.sections.map((s) => s.header.label),
      ["FOH → Stage + 10 m", "Control → Stage + 25 m", "Other — Ballroom A"]
    );

    let state = emptyGearListState();
    state = syncGearListRows(state, [], merged, []);
    const cableIdx = state.rows.findIndex(
      (r) => r.kind === "header" && r.level === "section" && /cable/i.test(r.label)
    );
    const underCable = state.rows
      .slice(cableIdx + 1)
      .filter((r) => r.kind === "header" && r.level === "subsection")
      .map((r) => r.label);
    assert.deepEqual(underCable, [
      "FOH → Stage + 10 m",
      "Control → Stage + 25 m",
      "Other — Ballroom A",
    ]);
  });

  it("builds flat auto cable rows from cable calculator cards (legacy helper)", () => {
    const cables = autoCablesFromCableCards({
      routeCards: [
        {
          id: "r1",
          title: "FOH → Stage",
          lengthLabel: "10 m",
          rows: [
            {
              connectionId: "c1",
              cableLabel: "HDMI",
              fromDevice: "Switcher",
              toDevice: "Display",
              fromNodeId: "n1",
              toNodeId: "n2",
              amount: 2,
            },
          ],
        },
      ],
      placeCards: [],
      manualCables: [
        {
          id: "m1",
          cableLabel: "XLR",
          fromDevice: "Mic",
          toDevice: "Console",
          amount: 1,
        },
      ],
    });
    assert.equal(cables.length, 2);
    const hdmi = cables.find((c) => c.label === "HDMI");
    const xlr = cables.find((c) => c.label === "XLR");
    assert.ok(hdmi);
    assert.equal(hdmi.qty, 2);
    assert.equal(hdmi.detail, "");
    assert.equal(hdmi.source, "auto");
    assert.ok(xlr);
    assert.equal(xlr.detail, "");
  });

  it("flattens manual cables from route and place maps", () => {
    const manuals = flattenManualCables({
      routes: { r1: [{ id: "a", cableLabel: "SDI", fromDevice: "A", toDevice: "B", amount: 1 }] },
      places: { p1: [{ id: "b", cableLabel: "CAT6", fromDevice: "", toDevice: "", amount: 3 }] },
    });
    assert.equal(manuals.length, 2);
  });

  it("syncs auto rows by sourceKey and preserves manual rows and order", () => {
    let state = emptyGearListState();
    state = addManualGearListItem(state, { label: "Spare projector", qty: 1 });
    const autoGear = autoGearFromSignalFlow([{ id: "n1", name: "Switcher", typeId: "switcher" }]);
    const cablePlan = autoCablePlanFromCableCards({
      routeCards: [
        {
          id: "r1",
          title: "FOH → Stage",
          lengthLabel: "12 m",
          rows: [
            {
              connectionId: "c1",
              cableLabel: "HDMI",
              fromDevice: "A",
              toDevice: "B",
              amount: 1,
            },
          ],
        },
      ],
    });

    state = syncGearListRows(state, autoGear, cablePlan);
    assert.ok(state.rows.some((r) => r.kind === "item" && r.label === "Switcher"));
    assert.ok(
      state.rows.some(
        (r) => r.kind === "header" && r.sourceKey === "cable-route:r1" && r.label === "FOH → Stage + 12 m"
      )
    );
    assert.ok(state.rows.some((r) => r.kind === "item" && r.label === "HDMI"));
    assert.ok(state.rows.some((r) => r.kind === "item" && r.label === "Spare projector"));

    // Renamed instances become separate lines
    state = syncGearListRows(
      state,
      autoGearFromSignalFlow([
        { id: "n1", name: "Main Switcher", typeId: "switcher" },
        { id: "n2", name: "Backup Switcher", typeId: "switcher" },
      ]),
      cablePlan
    );
    assert.ok(state.rows.some((r) => r.kind === "item" && r.label === "Main Switcher"));
    assert.ok(state.rows.some((r) => r.kind === "item" && r.label === "Backup Switcher"));
    assert.equal(
      state.rows.some((r) => r.kind === "item" && r.source === "auto" && r.label === "Switcher"),
      false
    );

    // Identical names of the same type still condense
    const beforeId = state.rows.find((r) => r.label === "Main Switcher")?.id;
    state = syncGearListRows(
      state,
      autoGearFromSignalFlow([
        { id: "n1", name: "Main Switcher", typeId: "switcher" },
        { id: "n2", name: "Main Switcher", typeId: "switcher" },
      ]),
      cablePlan
    );
    const synced = state.rows.find((r) => r.label === "Main Switcher");
    assert.equal(synced?.id, beforeId);
    assert.equal(synced?.kind === "item" ? synced.qty : 0, 2);
    assert.equal(
      state.rows.some((r) => r.kind === "item" && r.label === "Backup Switcher"),
      false
    );

    // Remove upstream node
    state = syncGearListRows(state, [], cablePlan);
    assert.equal(
      state.rows.some((r) => r.kind === "item" && r.source === "auto" && r.category === "gear"),
      false
    );
    assert.ok(state.rows.some((r) => r.label === "Spare projector"));
  });

  it("supports header/item edit, move, reorder, and remove", () => {
    let state = emptyGearListState();
    state = addGearListHeader(state, "Extras");
    state = addGearListHeader(state, "Stage left", undefined, "subsection");
    state = addManualGearListItem(state, { label: "C-stand", qty: 2 });
    const item = state.rows.find((r) => r.kind === "item" && r.label === "C-stand");
    const subsection = state.rows.find(
      (r) => r.kind === "header" && r.level === "subsection" && r.label === "Stage left"
    );
    assert.ok(item);
    assert.ok(subsection);
    state = updateGearListRow(state, item.id, { qty: 4, notes: "Black" });
    const updated = state.rows.find((r) => r.id === item.id);
    assert.equal(updated?.kind === "item" ? updated.qty : 0, 4);
    assert.equal(updated?.kind === "item" ? updated.notes : "", "Black");

    const idx = state.rows.findIndex((r) => r.id === item.id);
    state = moveGearListRow(state, item.id, -1);
    assert.equal(state.rows[idx - 1].id, item.id);

    // Drag item before the first section header
    const firstId = state.rows[0].id;
    state = reorderGearListRow(state, item.id, firstId, "before");
    assert.equal(state.rows[0].id, item.id);

    state = removeGearListRow(state, item.id);
    assert.equal(
      state.rows.some((r) => r.id === item.id),
      false
    );
  });

  it("normalizes legacy headers without level to section", () => {
    const custom = normalizeGearListState({
      rows: [
        { id: "h1", kind: "header", label: "Legacy" },
        { id: "h2", kind: "header", label: "Nested", level: "subsection" },
      ],
    });
    assert.equal(custom.rows[0].kind === "header" ? custom.rows[0].level : "", "section");
    assert.equal(custom.rows[1].kind === "header" ? custom.rows[1].level : "", "subsection");
  });
  it("normalizes unknown or empty payloads to a usable state", () => {
    const empty = normalizeGearListState(null);
    assert.ok(empty.rows.length >= 2);
    const custom = normalizeGearListState({
      rows: [
        { id: "h1", kind: "header", label: "  Stage  " },
        { id: "i1", kind: "item", label: "Lamp", qty: 0, source: "manual" },
        { kind: "nope" },
      ],
    });
    assert.equal(custom.rows.length, 2);
    assert.equal(custom.rows[0].label, "Stage");
    assert.equal(custom.rows[1].kind === "item" ? custom.rows[1].qty : 0, 1);
  });

  it("defaults included to true and preserves false through normalize", () => {
    const state = normalizeGearListState({
      rows: [
        { id: "h1", kind: "header", label: "LED" },
        { id: "i1", kind: "item", label: "Lamp", included: false },
        { id: "i2", kind: "item", label: "Cable", category: "cable", included: true },
      ],
    });
    assert.equal(isGearListRowIncluded(state.rows[0]), true);
    assert.equal(state.rows[0].included, true);
    assert.equal(state.rows[1].included, false);
    assert.equal(state.rows[2].included, true);
  });

  it("filters eyeball-excluded rows and whole sections from paperwork", () => {
    const rows = [
      {
        id: "h-led",
        kind: "header",
        label: "LED",
        level: "section",
        source: "manual",
        sourceKey: null,
        included: false,
      },
      {
        id: "led-item",
        kind: "item",
        category: "gear",
        label: "Tile",
        detail: "",
        qty: 10,
        length: null,
        room: "",
        place: "",
        notes: "",
        source: "manual",
        sourceKey: null,
        included: true,
      },
      {
        id: "h-sf",
        kind: "header",
        label: "Signal Flow gear",
        level: "section",
        source: "manual",
        sourceKey: null,
        included: true,
      },
      {
        id: "sw",
        kind: "item",
        category: "gear",
        label: "Switcher",
        detail: "",
        qty: 1,
        length: null,
        room: "",
        place: "",
        notes: "",
        source: "manual",
        sourceKey: null,
        included: false,
      },
      {
        id: "mtx",
        kind: "item",
        category: "gear",
        label: "Matrix",
        detail: "",
        qty: 1,
        length: null,
        room: "",
        place: "",
        notes: "",
        source: "manual",
        sourceKey: null,
        included: true,
      },
    ];
    const filtered = filterGearListRowsForPaperwork(rows);
    assert.equal(
      filtered.some((r) => r.id === "h-led" || r.id === "led-item"),
      false
    );
    assert.equal(filtered.some((r) => r.id === "sw"), false);
    assert.ok(filtered.some((r) => r.id === "h-sf"));
    assert.ok(filtered.some((r) => r.id === "mtx"));

    const paperwork = gearListRowsForPaperwork({
      rows,
      settings: {
        totalOnly: true,
        roomFilter: "Ballroom A",
        placeFilter: "FOH",
        searchQuery: "Switcher",
      },
    });
    // Filters / search / totalOnly are calculator-only — paperwork ignores them
    assert.ok(paperwork.some((r) => r.id === "mtx"));
    assert.equal(paperwork.some((r) => r.id === "sw"), false);
    assert.equal(paperwork.some((r) => r.id === "led-item"), false);
  });

  it("preserves included flags across sync for auto rows", () => {
    let state = emptyGearListState();
    const gear = autoGearFromSignalFlow([
      { id: "n1", name: "Switcher", typeId: "switcher" },
    ]);
    state = syncGearListRows(state, gear, { sections: [], looseItems: [] });
    const auto = state.rows.find((r) => r.kind === "item" && r.label === "Switcher");
    assert.ok(auto);
    state = updateGearListRow(state, auto.id, { included: false, notes: "FOH only" });
    state = syncGearListRows(
      state,
      autoGearFromSignalFlow([{ id: "n1", name: "Switcher", typeId: "switcher" }]),
      { sections: [], looseItems: [] }
    );
    const again = state.rows.find((r) => r.kind === "item" && r.label === "Switcher");
    assert.ok(again);
    assert.equal(again.included, false);
    assert.equal(again.kind === "item" ? again.notes : "", "FOH only");
  });

  it("orders Signal Flow gear by show room order then place without new sections", () => {
    const places = [
      { id: "p-stage", name: "Stage" },
      { id: "p-foh", name: "FOH" },
      { id: "p-ctrl", name: "Control" },
    ];
    const gearB = autoGearFromSignalFlow(
      [
        { id: "1", name: "Switcher", typeId: "switcher", placeId: "p-stage" },
        { id: "2", name: "Display", typeId: "display", placeId: "p-foh" },
        { id: "3", name: "Matrix", typeId: "matrix", placeId: "p-foh" },
      ],
      { places, roomName: "Ballroom B" }
    );
    const gearA = autoGearFromSignalFlow(
      [
        { id: "4", name: "Amp", typeId: "amp", placeId: "p-ctrl" },
        { id: "5", name: "Speaker", typeId: "speaker", placeId: "p-stage" },
      ],
      { places, roomName: "Ballroom A" }
    );
    // Within one room: place then label
    assert.deepEqual(
      gearB.map((g) => `${g.place}:${g.label}`),
      ["FOH:Display", "FOH:Matrix", "Stage:Switcher"]
    );

    // Concatenate in Shows-tab order (B before A) — must not alphabeticalize rooms.
    let state = emptyGearListState();
    state = syncGearListRows(state, [...gearB, ...gearA], { sections: [], looseItems: [] });
    const sfItems = state.rows.filter(
      (r) => r.kind === "item" && r.source === "auto" && r.category === "gear"
    );
    assert.deepEqual(
      sfItems.map((r) => `${r.room}|${r.place}|${r.label}`),
      [
        "Ballroom B|FOH|Display",
        "Ballroom B|FOH|Matrix",
        "Ballroom B|Stage|Switcher",
        "Ballroom A|Control|Amp",
        "Ballroom A|Stage|Speaker",
      ]
    );
    // Still only the default section headers — no room/place subsections.
    const autoHeaders = state.rows.filter((r) => r.kind === "header" && r.source === "auto");
    assert.equal(autoHeaders.length, 0);
    const sectionLabels = state.rows
      .filter((r) => r.kind === "header" && r.level === "section")
      .map((r) => r.label);
    assert.deepEqual(sectionLabels, ["LED", "Signal Flow gear", "Cables"]);
  });

  it("skips LED wall nodes in Signal Flow gear import", () => {
    const gear = autoGearFromSignalFlow([
      { id: "n1", name: "Matrix", typeId: "matrix" },
      { id: "n2", name: "Main Wall", typeId: "led-wall:w1", ledWallId: "w1" },
      { id: "n3", name: "Also Wall", typeId: "led-wall:w2" },
    ]);
    assert.equal(gear.length, 1);
    assert.equal(gear[0].label, "Matrix");
  });

  it("maps gear-list sourceKeys back to Signal Flow node ids", () => {
    const nodes = [
      { id: "a", typeId: "display", name: "Display", placeId: "p1" },
      { id: "b", typeId: "display", name: "Display", placeId: "p1" },
      { id: "c", typeId: "display", name: "Display Left", placeId: "p2" },
      { id: "d", typeId: "display", name: "Display", placeId: "p2" },
      { id: "w", typeId: "led-wall:w1", ledWallId: "w1", name: "Main", placeId: "p1" },
    ];
    const places = [
      { id: "p1", name: "FOH" },
      { id: "p2", name: "Stage" },
    ];
    const gear = autoGearFromSignalFlow(nodes, { places, roomName: "Ballroom A" });
    const fohDisplay = gear.find((g) => g.label === "Display" && g.place === "FOH");
    const stageDisplay = gear.find((g) => g.label === "Display" && g.place === "Stage");
    assert.ok(fohDisplay);
    assert.equal(fohDisplay.qty, 2);
    assert.equal(fohDisplay.room, "Ballroom A");
    assert.ok(stageDisplay);
    assert.equal(stageDisplay.qty, 1);
    assert.deepEqual(nodeIdsForGearListSourceKey(nodes, fohDisplay.sourceKey).sort(), [
      "a",
      "b",
    ]);
    assert.deepEqual(nodeIdsForGearListSourceKey(nodes, "led-wall:w1:tiles"), ["w"]);
    assert.equal(gearListSourceKeyLinksToSignalFlow(fohDisplay.sourceKey), true);
    assert.equal(gearListSourceKeyLinksToSignalFlow("cable:route:x:Cat6|150"), false);
  });

  it("scopes auto sourceKeys by room and still resolves SF ids", () => {
    const nodes = [
      { id: "a", typeId: "display", name: "Display", placeId: "p1" },
      { id: "b", typeId: "display", name: "Display", placeId: "p1" },
    ];
    const gear = autoGearFromSignalFlow(nodes, {
      places: [{ id: "p1", name: "FOH" }],
      roomName: "Ballroom A",
    });
    const scoped = scopeGearListItems("room-1", gear);
    assert.equal(scoped[0].sourceKey, `room:room-1|${gear[0].sourceKey}`);
    assert.equal(roomIdFromGearListSourceKey(scoped[0].sourceKey), "room-1");
    assert.equal(unscopedGearListSourceKey(scoped[0].sourceKey), gear[0].sourceKey);
    assert.equal(gearListSourceKeyLinksToSignalFlow(scoped[0].sourceKey), true);
    assert.deepEqual(nodeIdsForGearListSourceKey(nodes, scoped[0].sourceKey).sort(), [
      "a",
      "b",
    ]);
    const plan = scopeGearListCablePlan("room-2", {
      sections: [
        {
          header: {
            id: "h1",
            kind: "header",
            label: "Other",
            level: "subsection",
            source: "auto",
            sourceKey: "cable-other",
          },
          items: [],
        },
      ],
      looseItems: [],
    });
    assert.equal(plan.sections[0].header.sourceKey, "room:room-2|cable-other");
  });

  it("fuzzy-matches row fields and keeps ancestor headers", () => {
    assert.equal(fuzzyTextMatch("Short Ethercon", "ethrcon"), true);
    assert.equal(fuzzyTextMatch("Short Ethercon", "power"), false);
    assert.equal(fuzzyTextMatch("FOH Display", "foh disp"), true);

    let state = emptyGearListState();
    state = {
      ...state,
      rows: [
        state.rows[0],
        {
          id: "sub",
          kind: "header",
          label: "LED - Wall A",
          level: "subsection",
          source: "auto",
          sourceKey: "led-wall:w1:header",
        },
        {
          id: "a",
          kind: "item",
          category: "gear",
          label: "NovaStar processor",
          detail: "",
          qty: 1,
          length: null,
          room: "Ballroom A",
          place: "FOH",
          notes: "spare",
          source: "auto",
          sourceKey: "sf-gear:a",
        },
        {
          id: "b",
          kind: "item",
          category: "cable",
          label: "HDMI",
          detail: "12 m",
          qty: 2,
          length: 25,
          room: "Ballroom A",
          place: "Stage",
          notes: "",
          source: "auto",
          sourceKey: "cable:1",
        },
        state.rows[1],
        {
          id: "c",
          kind: "item",
          category: "gear",
          label: "Switcher",
          detail: "",
          qty: 1,
          length: null,
          room: "Ballroom B",
          place: "Control",
          notes: "",
          source: "manual",
          sourceKey: null,
        },
      ],
    };

    state = updateGearListSettings(state, { searchQuery: "nvstar" });
    let view = gearListRowsForDisplay(state);
    assert.equal(view.some((r) => r.kind === "item" && r.id === "a"), true);
    assert.equal(view.some((r) => r.kind === "item" && r.id === "b"), false);
    assert.equal(view.some((r) => r.kind === "header" && r.label === "LED"), true);
    assert.equal(view.some((r) => r.kind === "header" && r.label === "LED - Wall A"), true);
    assert.equal(view.some((r) => r.kind === "header" && /signal flow/i.test(r.label)), false);

    state = updateGearListSettings(state, { searchQuery: "stage" });
    view = gearListRowsForDisplay(state);
    assert.equal(view.some((r) => r.id === "b"), true);
    assert.equal(view.some((r) => r.id === "a"), false);

    assert.match(gearListRowSearchText(/** @type {import("../js/domain/gear-list.js").GearListItem} */ ({
      id: "x",
      kind: "item",
      category: "cable",
      label: "Cat6",
      detail: "riser",
      qty: 4,
      length: 100,
      room: "Hall",
      place: "Deck",
      notes: "labeled",
      source: "auto",
      sourceKey: "k",
    })), /Cat6.*riser.*labeled.*Hall.*Deck.*100/i);
  });

  it("filters by room or place before Total only condensation", () => {
    let state = emptyGearListState();
    state = {
      ...state,
      rows: [
        state.rows[0],
        {
          id: "sub",
          kind: "header",
          label: "LED - Wall",
          level: "subsection",
          source: "auto",
          sourceKey: "led-wall:w1:header",
        },
        {
          id: "a",
          kind: "item",
          category: "gear",
          label: "Display",
          detail: "",
          qty: 2,
          length: null,
          room: "Ballroom A",
          place: "FOH",
          notes: "",
          source: "auto",
          sourceKey: "sf-gear:a",
        },
        {
          id: "b",
          kind: "item",
          category: "gear",
          label: "Display",
          detail: "",
          qty: 3,
          length: null,
          room: "Ballroom A",
          place: "Stage",
          notes: "",
          source: "auto",
          sourceKey: "sf-gear:b",
        },
        {
          id: "c",
          kind: "item",
          category: "gear",
          label: "Display",
          detail: "",
          qty: 1,
          length: null,
          room: "Ballroom B",
          place: "FOH",
          notes: "",
          source: "auto",
          sourceKey: "sf-gear:c",
        },
        ...state.rows.slice(1),
      ],
    };

    state = updateGearListSettings(state, { placeFilter: "FOH" });
    let view = gearListRowsForDisplay(state);
    const fohItems = view.filter((r) => r.kind === "item");
    assert.equal(fohItems.length, 2);
    assert.ok(fohItems.every((r) => r.kind === "item" && r.place === "FOH"));

    state = updateGearListSettings(state, { roomFilter: "Ballroom A", placeFilter: "" });
    view = gearListRowsForDisplay(state);
    const roomItems = view.filter((r) => r.kind === "item");
    assert.equal(roomItems.length, 2);
    assert.ok(roomItems.every((r) => r.kind === "item" && r.room === "Ballroom A"));

    state = updateGearListSettings(state, { totalOnly: true, placeFilter: "FOH", roomFilter: "" });
    view = gearListRowsForDisplay(state);
    const totals = view.filter((r) => r.kind === "item" && r.label === "Display");
    assert.equal(totals.length, 1);
    assert.equal(totals[0].kind === "item" ? totals[0].qty : 0, 3); // 2 FOH A + 1 FOH B
  });

  it("Total only drops subsections and merges like items across place/room/notes", () => {
    let state = emptyGearListState();
    state = {
      ...state,
      rows: [
        ...state.rows.slice(0, 1),
        {
          id: "h-a",
          kind: "header",
          label: "LED - Wall",
          level: "subsection",
          source: "auto",
          sourceKey: "led-wall:w1:header",
        },
        {
          id: "i1",
          kind: "item",
          category: "gear",
          label: "ROE BP 2",
          detail: "4×3",
          qty: 12,
          length: null,
          room: "Ballroom A",
          place: "Stage",
          notes: "A",
          source: "auto",
          sourceKey: "led-wall:w1:tiles",
        },
        {
          id: "i2",
          kind: "item",
          category: "gear",
          label: "ROE BP 2",
          detail: "4×3",
          qty: 8,
          length: null,
          room: "Ballroom B",
          place: "FOH",
          notes: "B",
          source: "auto",
          sourceKey: "led-wall:w2:tiles",
        },
        ...state.rows.slice(1),
      ],
    };
    assert.equal(gearListRowsForDisplay(state).some((r) => r.kind === "header" && r.level === "subsection"), true);

    state = updateGearListSettings(state, { totalOnly: true });
    const view = gearListRowsForDisplay(state);
    assert.equal(view.some((r) => r.kind === "header" && r.level === "subsection"), false);
    const tiles = view.filter((r) => r.kind === "item" && r.label === "ROE BP 2");
    assert.equal(tiles.length, 1);
    assert.equal(tiles[0].kind === "item" ? tiles[0].qty : 0, 20);
    assert.equal(tiles[0].kind === "item" ? tiles[0].place : "", "");
    assert.equal(tiles[0].kind === "item" ? tiles[0].room : "", "");
    assert.equal(tiles[0].kind === "item" ? tiles[0].notes : "", "");
  });

  it("classifies LED map jumpers as horizontal, vertical, or long", () => {
    assert.equal(ledWallNeighborJumperCount(3, 4), 3 * 3 + 4 * 2);
    assert.equal(ledWallTileGridSize({ rows: 2, cols: 5, generated: false }).tiles, 10);
    // 4-col wall: 0→1 H, 1→5 V, 5→7 long (skip), 0→5 diagonal long
    assert.deepEqual(classifyLedLineJumpers([0, 1, 5, 7], 4), {
      horizontal: 1,
      vertical: 1,
      long: 1,
    });
    assert.deepEqual(classifyLedLineJumpers([0, 5], 4), {
      horizontal: 0,
      vertical: 0,
      long: 1,
    });
    assert.deepEqual(
      summarizeLedMapJumpers(
        [{ tiles: [0, 1, 2] }, { tiles: [0, 4] }],
        4
      ),
      { horizontal: 2, vertical: 1, long: 0 }
    );
  });

  it("imports each LED wall with Ethercon/Powercon from drawn maps", () => {
    const sections = autoLedWallSectionsFromLed({
      grids: [
        {
          id: "w2",
          name: "B Wall",
          rows: 2,
          cols: 2,
          generated: true,
          generatedRows: 2,
          generatedCols: 2,
          tile: { name: "ROE BP 2" },
          dataLines: [{ tiles: [0, 1] }],
          powerLines: [{ tiles: [0, 2] }],
        },
        {
          id: "w1",
          name: "A Wall",
          rows: 3,
          cols: 4,
          generated: true,
          generatedRows: 3,
          generatedCols: 4,
          tile: { name: "Infiled DB 2.6" },
          // H: 0→1, 1→2; V: 2→6; Long: 6→4 (same row, skip one)
          dataLines: [{ tiles: [0, 1, 2, 6, 4] }],
          // H: 0→1; V: 1→5; Long: 5→7
          powerLines: [{ tiles: [0, 1, 5, 7] }, { tiles: [8, 9] }],
        },
      ],
    });
    assert.equal(sections.length, 2);
    assert.equal(sections[0].header.label, "LED - A Wall");
    assert.equal(sections[0].header.level, "subsection");
    const aTiles = sections[0].items.find((i) => i.label === "Infiled DB 2.6");
    assert.ok(aTiles);
    assert.equal(aTiles.qty, 12);
    assert.equal(aTiles.detail, "4×3");

    const ethH = sections[0].items.find(
      (i) => i.label === "Short Ethercon" && i.detail === "Horizontal"
    );
    const ethV = sections[0].items.find(
      (i) => i.label === "Short Ethercon" && i.detail === "Vertical"
    );
    const ethL = sections[0].items.find(
      (i) => i.label === "Long Ethercon" && i.detail === "Long"
    );
    assert.ok(ethH);
    assert.equal(ethH.qty, 2);
    assert.ok(ethV);
    assert.equal(ethV.qty, 1);
    assert.ok(ethL);
    assert.equal(ethL.qty, 1);

    const pwrH = sections[0].items.find(
      (i) => i.label === "Short Powercon" && i.detail === "Horizontal"
    );
    const pwrV = sections[0].items.find(
      (i) => i.label === "Short Powercon" && i.detail === "Vertical"
    );
    const pwrL = sections[0].items.find(
      (i) => i.label === "Long Powercon" && i.detail === "Long"
    );
    assert.ok(pwrH);
    assert.equal(pwrH.qty, 2); // 0→1 and 8→9
    assert.ok(pwrV);
    assert.equal(pwrV.qty, 1);
    assert.ok(pwrL);
    assert.equal(pwrL.qty, 1);

    assert.equal(sections[1].header.label, "LED - B Wall");
    const bTiles = sections[1].items.find((i) => i.label === "ROE BP 2");
    assert.ok(bTiles);
    const bEth = sections[1].items.find((i) => i.label === "Short Ethercon");
    const bPwr = sections[1].items.find((i) => i.label === "Short Powercon");
    assert.ok(bEth);
    assert.equal(bEth.detail, "Horizontal");
    assert.equal(bEth.qty, 1);
    assert.ok(bPwr);
    assert.equal(bPwr.detail, "Vertical");
    assert.equal(bPwr.qty, 1);

    let state = emptyGearListState();
    state = syncGearListRows(
      state,
      autoGearFromSignalFlow([{ id: "n1", name: "Switcher", typeId: "switcher" }]),
      { sections: [], looseItems: [] },
      sections
    );
    const labels = state.rows.map((r) => r.label);
    const ledSectionAt = labels.indexOf("LED");
    const wallAt = labels.indexOf("LED - A Wall");
    const sfAt = labels.indexOf("Signal Flow gear");
    const switcherAt = labels.indexOf("Switcher");
    assert.ok(ledSectionAt >= 0);
    assert.ok(wallAt > ledSectionAt);
    assert.ok(sfAt > wallAt);
    assert.ok(switcherAt > sfAt);
    assert.ok(
      state.rows.some((r) => r.kind === "item" && r.label === "Infiled DB 2.6" && r.qty === 12)
    );
  });
});

