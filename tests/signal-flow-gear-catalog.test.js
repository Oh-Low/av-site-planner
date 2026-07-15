import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeGearCatalogs,
  prepareCatalogFromFile,
} from "../js/signal-flow-gear-presets.js";

describe("signal-flow gear catalog merge", () => {
  it("merges overlay folders and gear onto presets", () => {
    const merged = mergeGearCatalogs([
      {
        folders: [
          { id: "fld-library", name: "Library", parentId: null },
          { id: "fld-brands", name: "Brands", parentId: "fld-library" },
        ],
        gear: [
          {
            id: "barco-e2",
            label: "Barco E2",
            category: "Video",
            folderId: "fld-brands",
            inputs: ["In"],
            outputs: ["Out"],
          },
        ],
      },
      {
        folders: [{ id: "fld-acme", name: "Acme", parentId: "fld-library" }],
        gear: [
          {
            id: "acme-1",
            label: "Acme Box",
            category: "Video",
            folderId: "fld-acme",
            inputs: ["HDMI In"],
            outputs: ["HDMI Out"],
          },
        ],
      },
    ]);

    assert.ok(merged.folders.some((f) => f.id === "fld-library"));
    assert.ok(merged.folders.some((f) => f.id === "fld-acme"));
    assert.ok(merged.gear.some((g) => g.id === "barco-e2"));
    assert.ok(merged.gear.some((g) => g.id === "acme-1"));
  });

  it("lets later catalogs override earlier gear by id", () => {
    const merged = mergeGearCatalogs([
      {
        folders: [{ id: "fld-a", name: "A", parentId: null }],
        gear: [{ id: "g1", label: "Old", category: "Video", folderId: "fld-a", inputs: ["A"], outputs: ["B"] }],
      },
      {
        folders: [{ id: "fld-a", name: "A Renamed", parentId: null }],
        gear: [{ id: "g1", label: "New", category: "Audio", folderId: "fld-a", inputs: ["X"], outputs: ["Y"] }],
      },
    ]);

    assert.equal(merged.folders.find((f) => f.id === "fld-a")?.name, "A Renamed");
    assert.equal(merged.gear.find((g) => g.id === "g1")?.label, "New");
    assert.equal(merged.gear.find((g) => g.id === "g1")?.category, "Audio");
  });

  it("places overlay catalog gear in a folder named after the file", () => {
    const prepared = prepareCatalogFromFile("inventory.json", {
      folders: [],
      gear: [
        {
          id: "atem",
          label: "ATEM",
          category: "Video",
          folderId: "fld-brand-blackmagic",
          inputs: ["SDI In"],
          outputs: ["PGM"],
        },
      ],
    });

    assert.equal(prepared.folders.length, 1);
    assert.equal(prepared.folders[0].id, "fld-file-inventory");
    assert.equal(prepared.folders[0].name, "inventory");
    assert.equal(prepared.folders[0].parentId, "fld-library");
    assert.equal(prepared.gear[0].folderId, "fld-file-inventory");
  });

  it("leaves presets.json folder structure unchanged", () => {
    const prepared = prepareCatalogFromFile("presets.json", {
      folders: [{ id: "fld-library", name: "Library", parentId: null }],
      gear: [{ id: "source", label: "Source", category: "Video", inputs: [], outputs: ["Out"] }],
    });
    assert.equal(prepared.folders[0].id, "fld-library");
    assert.equal(prepared.gear[0].folderId, undefined);
  });
});
