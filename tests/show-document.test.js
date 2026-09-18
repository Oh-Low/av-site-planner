import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addRoom,
  addTemplateToShow,
  documentForSingleShowExport,
  duplicateRoom,
  emptyShowDocument,
  normalizeShowDocument,
  reorderRoom,
  saveRoomAsTemplate,
  wrapV2PlanAsShowDocument,
} from "../js/domain/show-document.js";
import {
  emptyRoomPlan,
  normalizeRoomPlan,
  parseShowDocument,
  parseSiteState,
} from "../js/site-state.js";

describe("show-document domain", () => {
  it("emptyShowDocument has one show and one room", () => {
    const plan = emptyRoomPlan();
    const doc = emptyShowDocument(plan);
    assert.equal(doc.formatVersion, 3);
    assert.equal(doc.shows.length, 1);
    assert.equal(doc.shows[0].rooms.length, 1);
    assert.equal(doc.activeShowId, doc.shows[0].id);
    assert.equal(doc.activeRoomId, doc.shows[0].rooms[0].id);
    assert.equal(doc.templates.length, 0);
  });

  it("wrapV2PlanAsShowDocument nests the plan", () => {
    const v2 = {
      formatVersion: 2,
      app: "av-site-planner",
      exportedAt: "2026-01-01T00:00:00.000Z",
      activeTab: "signal-flow",
      places: [{ id: "p1", name: "FOH" }],
      led: emptyRoomPlan().led,
      projector: emptyRoomPlan().projector,
    };
    const doc = wrapV2PlanAsShowDocument(v2, emptyRoomPlan);
    assert.equal(doc.shows[0].name, "Imported");
    assert.deepEqual(doc.shows[0].rooms[0].plan.places, [{ id: "p1", name: "FOH" }]);
    assert.equal(doc.activeTab, "signal-flow");
  });

  it("template copy is independent of the source room", () => {
    const doc = emptyShowDocument(emptyRoomPlan());
    const show = doc.shows[0];
    const room = show.rooms[0];
    room.plan = normalizeRoomPlan({
      ...room.plan,
      places: [{ id: "a", name: "Stage" }],
    });
    const template = saveRoomAsTemplate(doc, show.id, room.id, "Stage kit");
    assert.ok(template);
    assert.equal(template.name, "Stage kit");
    room.plan.places = [];
    assert.equal(template.plan.places[0].name, "Stage");

    const added = addTemplateToShow(doc, show.id, template.id);
    assert.ok(added);
    assert.equal(show.rooms.length, 2);
    template.plan.places[0].name = "Changed";
    assert.equal(added.plan.places[0].name, "Stage");
  });

  it("duplicateRoom clones plan", () => {
    const doc = emptyShowDocument(emptyRoomPlan());
    const show = doc.shows[0];
    show.rooms[0].plan.places = [{ id: "x", name: "A" }];
    const copy = duplicateRoom(doc, show.id, show.rooms[0].id);
    assert.ok(copy);
    show.rooms[0].plan.places[0].name = "B";
    assert.equal(copy.plan.places[0].name, "A");
  });

  it("documentForSingleShowExport keeps one show and drops templates", () => {
    const doc = emptyShowDocument(emptyRoomPlan());
    doc.shows.push({
      id: "show-2",
      name: "Second",
      rooms: [{ id: "room-2", name: "R2", plan: emptyRoomPlan() }],
    });
    doc.templates.push({
      id: "tpl-1",
      name: "Kit",
      plan: emptyRoomPlan(),
    });
    doc.activeShowId = doc.shows[0].id;
    const slice = documentForSingleShowExport(doc);
    assert.equal(slice.shows.length, 1);
    assert.equal(slice.shows[0].id, doc.shows[0].id);
    assert.equal(slice.templates.length, 0);
    assert.equal(doc.shows.length, 2);
    assert.equal(doc.templates.length, 1);
  });

  it("reorderRoom and cross-list insert indexes", () => {
    const doc = emptyShowDocument(emptyRoomPlan());
    const show = doc.shows[0];
    const a = show.rooms[0];
    const b = addRoom(doc, show.id, emptyRoomPlan(), "B");
    const c = addRoom(doc, show.id, emptyRoomPlan(), "C");
    assert.ok(b && c);
    assert.deepEqual(
      show.rooms.map((r) => r.id),
      [a.id, b.id, c.id]
    );
    assert.equal(reorderRoom(doc, show.id, c.id, a.id, "before"), true);
    assert.deepEqual(
      show.rooms.map((r) => r.id),
      [c.id, a.id, b.id]
    );

    const template = saveRoomAsTemplate(doc, show.id, a.id, "From A", 0);
    assert.ok(template);
    assert.equal(doc.templates[0].id, template.id);
    const room = addTemplateToShow(doc, show.id, template.id, "From tpl", 1);
    assert.ok(room);
    assert.equal(show.rooms[1].id, room.id);
  });

  it("normalizeShowDocument drops garbage plans via normalizePlan", () => {
    const doc = normalizeShowDocument(
      {
        formatVersion: 3,
        shows: [{ name: "S", rooms: [{ name: "R", plan: { led: { grids: [] } } }] }],
      },
      normalizeRoomPlan,
      emptyRoomPlan
    );
    assert.ok(Array.isArray(doc.shows[0].rooms[0].plan.led.grids));
    assert.ok(doc.shows[0].rooms[0].plan.projector);
  });
});

describe("parseShowDocument", () => {
  it("migrates v2 files into one show / one room", () => {
    const v2 = JSON.stringify({
      formatVersion: 2,
      app: "av-site-planner",
      places: [],
      led: { grids: [], activeGridId: null, voltage: 120, bitrate: 8 },
      projector: emptyRoomPlan().projector,
    });
    const doc = parseShowDocument(v2);
    assert.equal(doc.formatVersion, 3);
    assert.equal(doc.shows.length, 1);
    assert.equal(doc.shows[0].rooms.length, 1);
  });

  it("round-trips v3 JSON", () => {
    const original = emptyShowDocument(emptyRoomPlan());
    original.shows[0].name = "Tour";
    const again = parseShowDocument(JSON.stringify(original));
    assert.equal(again.shows[0].name, "Tour");
    assert.equal(again.formatVersion, 3);
  });

  it("parseSiteState still returns a v2-shaped active room plan", () => {
    const doc = emptyShowDocument(emptyRoomPlan());
    doc.shows[0].rooms[0].plan.places = [{ id: "p", name: "House" }];
    const plan = parseSiteState(JSON.stringify(doc));
    assert.equal(plan.formatVersion, 2);
    assert.equal(plan.places[0].name, "House");
  });
});
