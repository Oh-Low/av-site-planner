import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sheetHeadingText, sheetListPresentation, sheetListTitle } from "../js/paperwork/sheet-tree.js";

describe("sheetListPresentation", () => {
  it("formats LED cable sheets as Room / Wall | Cable Diagram", () => {
    assert.deepEqual(
      sheetListPresentation({
        typeId: "led-wall-cable",
        title: "Room 1 — LED Cable — Wall 1",
      }),
      { room: "Room 1", detail: "LED Wall 1 | Cable Diagram" }
    );
  });

  it("formats LED power sheets", () => {
    assert.deepEqual(
      sheetListPresentation({
        typeId: "led-wall-power",
        title: "Ballroom — LED Power — Main",
      }),
      { room: "Ballroom", detail: "LED Main | Power Diagram" }
    );
  });

  it("formats room-scoped signal flow", () => {
    assert.deepEqual(
      sheetListPresentation({
        typeId: "signal-flow",
        title: "Room 1 — Signal Flow",
      }),
      { room: "Room 1", detail: "Signal Flow" }
    );
  });

  it("sheetListTitle joins room and detail", () => {
    assert.equal(
      sheetListTitle({
        typeId: "led-wall-cable",
        title: "Room 1 — LED Cable — Wall 1",
      }),
      "Room 1 — LED Wall 1 | Cable Diagram"
    );
  });

  it("sheetHeadingText uses a newline between room and detail", () => {
    assert.equal(
      sheetHeadingText({
        typeId: "led-wall-cable",
        title: "Room 1 — LED Cable — Wall 1",
      }),
      "Room 1\nLED Wall 1 | Cable Diagram"
    );
  });
});
