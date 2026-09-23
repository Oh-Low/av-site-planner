import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyPaperworkState } from "../js/domain/paperwork.js";
import { syncSheetsFromSources } from "../js/paperwork/sync.js";
import "../js/paperwork/sheets/cover.js";
import "../js/paperwork/sheets/gear-list.js";
import "../js/paperwork/sheets/custom-plate.js";

describe("paperwork sheet sync order", () => {
  it("preserves user sheet order across merge sync", () => {
    const state = emptyPaperworkState();
    // Seed two generated-style sheets the user has reordered (B before A).
    state.sheets = [
      {
        id: "sheet-b",
        typeId: "cover",
        sourceKey: "cover",
        roomId: null,
        title: "Cover",
        included: true,
        order: 0,
        notes: "",
        elements: [],
        manual: false,
      },
      {
        id: "sheet-a",
        typeId: "gear-list",
        sourceKey: "gear-list",
        roomId: null,
        title: "Gear List",
        included: true,
        order: 1,
        notes: "",
        elements: [],
        manual: false,
      },
    ];
    state.activeSheetId = "sheet-b";

    syncSheetsFromSources(
      state,
      [
        {
          roomId: "room-1",
          roomName: "Ballroom",
          siteExports: {},
        },
      ],
      { mode: "merge" }
    );

    const ids = state.sheets
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((sheet) => sheet.id);
    assert.equal(ids[0], "sheet-b");
    assert.equal(ids[1], "sheet-a");
    assert.deepEqual(
      [...state.sheets].sort((a, b) => a.order - b.order).map((sheet) => sheet.order),
      state.sheets.map((_, i) => i)
    );
  });

  it("appends newly generated sheets after existing order", () => {
    const state = emptyPaperworkState();
    state.sheets = [
      {
        id: "manual-1",
        typeId: "custom-plate",
        sourceKey: null,
        roomId: null,
        title: "Notes",
        included: true,
        order: 0,
        notes: "",
        elements: [],
        manual: true,
      },
    ];

    syncSheetsFromSources(
      state,
      [
        {
          roomId: "room-1",
          roomName: "Ballroom",
          siteExports: {},
        },
      ],
      { mode: "add-missing" }
    );

    const sorted = state.sheets.slice().sort((a, b) => a.order - b.order);
    assert.equal(sorted[0].id, "manual-1");
    assert.ok(sorted.some((sheet) => sheet.typeId === "cover"));
    assert.ok(sorted.some((sheet) => sheet.typeId === "gear-list"));
  });
});
