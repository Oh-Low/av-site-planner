import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILTIN_FOLDERS,
  BUILTIN_GEAR_PLACEMENTS,
  createGearFolder,
  getFolderBreadcrumb,
  listChildFolders,
  listGearInFolder,
  mergeGearFolders,
} from "../js/signal-flow-gear-library.js";

describe("signal-flow gear library", () => {
  it("lists Brands under the Library folder", () => {
    const top = listChildFolders(BUILTIN_FOLDERS, null);
    assert.deepEqual(top.map((f) => f.id), ["fld-library"]);
    const libraryChildren = listChildFolders(BUILTIN_FOLDERS, "fld-library");
    assert.ok(libraryChildren.some((f) => f.id === "fld-brands"));
    const brandChildren = listChildFolders(BUILTIN_FOLDERS, "fld-brands");
    assert.ok(brandChildren.some((f) => f.id === "fld-brand-barco"));
    assert.ok(brandChildren.some((f) => f.id === "fld-brand-novastar"));
  });

  it("includes overlay company folders from extra catalogs", () => {
    const libraryChildren = listChildFolders(BUILTIN_FOLDERS, "fld-library");
    assert.ok(libraryChildren.some((f) => f.id === "fld-file-example-company"));
    assert.ok(libraryChildren.some((f) => f.id === "fld-file-inventory"));
  });

  it("builds breadcrumbs through brand folders", () => {
    const crumbs = getFolderBreadcrumb(BUILTIN_FOLDERS, "fld-brand-barco");
    assert.deepEqual(crumbs.map((c) => c.name), ["Root", "Library", "Brands", "Barco"]);
  });

  it("lists brand gear inside brand folders", () => {
    const barco = listGearInFolder(BUILTIN_FOLDERS, BUILTIN_GEAR_PLACEMENTS, [], "fld-brand-barco");
    assert.ok(barco.some((g) => g.id === "barco-e2"));
    assert.ok(barco.some((g) => g.id === "barco-udx-4k22"));

    const novastar = listGearInFolder(
      BUILTIN_FOLDERS,
      BUILTIN_GEAR_PLACEMENTS,
      [],
      "fld-brand-novastar"
    );
    assert.ok(novastar.some((g) => g.id === "novastar-mctrl4k"));

    const blackmagic = listGearInFolder(
      BUILTIN_FOLDERS,
      BUILTIN_GEAR_PLACEMENTS,
      [],
      "fld-brand-blackmagic"
    );
    assert.ok(blackmagic.some((g) => g.id === "bmd-atem-mini-pro-iso"));

    const analogway = listGearInFolder(
      BUILTIN_FOLDERS,
      BUILTIN_GEAR_PLACEMENTS,
      [],
      "fld-brand-analogway"
    );
    assert.ok(analogway.some((g) => g.id === "analogway-livepremier-awj-200f"));
  });

  it("includes custom premade gear in the active folder", () => {
    const custom = [
      {
        id: "gear-custom",
        label: "Custom Mixer",
        defaultName: "Custom Mixer",
        category: "Audio",
        kind: "premade",
        folderId: "fld-brand-barco",
        ports: [{ input: "In 1", output: "Out 1" }],
      },
    ];
    const gear = listGearInFolder(
      BUILTIN_FOLDERS,
      BUILTIN_GEAR_PLACEMENTS,
      custom,
      "fld-brand-barco"
    );
    assert.ok(gear.some((g) => g.id === "gear-custom"));
  });

  it("shows the user-layer override of built-in gear in its catalog folder", () => {
    const override = {
      id: "barco-e2",
      label: "Barco E2 (house config)",
      defaultName: "Barco E2 (house config)",
      category: "Video",
      kind: "premade",
      folderId: "fld-brand-barco",
      ports: [{ input: "Custom In", output: "Custom Out" }],
    };
    const gear = listGearInFolder(
      BUILTIN_FOLDERS,
      BUILTIN_GEAR_PLACEMENTS,
      [override],
      "fld-brand-barco"
    );
    const e2 = gear.filter((g) => g.id === "barco-e2");
    assert.equal(e2.length, 1);
    assert.equal(e2[0].label, "Barco E2 (house config)");
  });

  it("creates user folders under a parent", () => {
    const folder = createGearFolder("Racks", "fld-brands", BUILTIN_FOLDERS);
    assert.ok(folder);
    assert.equal(folder?.parentId, "fld-brands");

    const all = mergeGearFolders(BUILTIN_FOLDERS, folder ? [folder] : []);
    const children = listChildFolders(all, "fld-brands");
    assert.ok(children.some((f) => f.name === "Racks"));
  });
});
