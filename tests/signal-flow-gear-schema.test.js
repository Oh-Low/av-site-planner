import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gearPortsToSideLists,
  normalizeGearEntry,
  normalizePortRow,
  serializeGearForCatalog,
  sideListsToGearPorts,
} from "../js/signal-flow-gear-schema.js";

describe("gear port rows with dividers", () => {
  it("preserves divider flags through normalization", () => {
    const row = normalizePortRow({
      input: "HDMI In 1",
      output: "PGM Out",
      inputDivider: true,
    });
    assert.equal(row.inputDivider, true);
    assert.equal(row.outputDivider, undefined);
    assert.equal(row.inputType, "HDMI");
  });

  it("omits divider keys when flags are absent", () => {
    const row = normalizePortRow({ input: "XLR 1", output: "—" });
    assert.deepEqual(row, {
      input: "XLR 1",
      output: "—",
      inputType: "XLR",
      outputType: null,
    });
  });
});

describe("editor side lists", () => {
  it("splits ports into per-side ordered lists with dividers", () => {
    const { inputs, outputs } = gearPortsToSideLists([
      { input: "HDMI 1", output: "PGM", inputType: "HDMI", outputType: "SDI" },
      { input: "HDMI 2", output: "—", inputType: "HDMI", inputDivider: true },
      { input: "XLR 1", output: "AUX", outputDivider: true },
    ]);

    assert.deepEqual(inputs, [
      { kind: "port", label: "HDMI 1", type: "HDMI" },
      { kind: "divider" },
      { kind: "port", label: "HDMI 2", type: "HDMI" },
      { kind: "port", label: "XLR 1", type: "XLR" },
    ]);
    assert.deepEqual(outputs, [
      { kind: "port", label: "PGM", type: "SDI" },
      { kind: "divider" },
      { kind: "port", label: "AUX", type: null },
    ]);
  });

  it("zips side lists back into rows, padding the shorter side", () => {
    const ports = sideListsToGearPorts(
      [
        { kind: "port", label: "HDMI 1", type: "HDMI" },
        { kind: "divider" },
        { kind: "port", label: "XLR 1", type: "XLR" },
        { kind: "port", label: "XLR 2", type: "XLR" },
      ],
      [{ kind: "port", label: "PGM Out", type: "SDI" }]
    );

    assert.equal(ports.length, 3);
    assert.deepEqual(ports[0], {
      input: "HDMI 1",
      output: "PGM Out",
      inputType: "HDMI",
      outputType: "SDI",
    });
    assert.equal(ports[1].input, "XLR 1");
    assert.equal(ports[1].inputDivider, true);
    assert.equal(ports[1].output, "—");
    assert.equal(ports[2].input, "XLR 2");
    assert.equal(ports[2].inputDivider, undefined);
  });

  it("drops trailing dividers with no port after them", () => {
    const ports = sideListsToGearPorts(
      [{ kind: "port", label: "In 1", type: null }, { kind: "divider" }],
      [{ kind: "port", label: "Out 1", type: null }]
    );
    assert.equal(ports.length, 1);
    assert.equal(ports[0].inputDivider, undefined);
  });

  it("round-trips ports through side lists unchanged", () => {
    const original = [
      { input: "HDMI 1", output: "PGM", inputType: "HDMI", outputType: "SDI" },
      { input: "HDMI 2", output: "AUX", inputType: "HDMI", outputType: "SDI", inputDivider: true },
      { input: "—", output: "ETH Out", inputType: null, outputType: "ETH", outputDivider: true },
    ].map((r) => normalizePortRow(r));

    const { inputs, outputs } = gearPortsToSideLists(original);
    const rebuilt = sideListsToGearPorts(inputs, outputs);
    assert.deepEqual(rebuilt, original);
  });
});

describe("catalog entry serialization", () => {
  it("serializes gear to the catalog ports form including dividers", () => {
    const entry = serializeGearForCatalog({
      id: "gear-1",
      label: "My Switcher",
      defaultName: "My Switcher",
      category: "Video",
      ports: [
        { input: "HDMI 1", output: "PGM", inputType: "HDMI", outputType: "HDMI" },
        { input: "HDMI 2", output: "—", inputType: "HDMI", inputDivider: true },
      ],
    });

    assert.deepEqual(entry, {
      id: "gear-1",
      label: "My Switcher",
      category: "Video",
      ports: [
        { input: "HDMI 1", output: "PGM", inputType: "HDMI", outputType: "HDMI" },
        { input: "HDMI 2", output: "—", inputType: "HDMI", inputDivider: true },
      ],
    });
  });

  it("round-trips through normalizeGearEntry", () => {
    const gear = {
      id: "gear-2",
      label: "Console",
      defaultName: "FOH Console",
      category: "Audio",
      ports: [
        { input: "XLR 1", output: "Main L", inputType: "XLR", outputType: "XLR" },
        { input: "XLR 2", output: "Main R", inputType: "XLR", outputType: "XLR", outputDivider: true },
      ],
    };
    const parsed = normalizeGearEntry(serializeGearForCatalog(gear));
    assert.ok(parsed);
    assert.equal(parsed.label, "Console");
    assert.equal(parsed.ports[1].outputDivider, true);
    assert.equal(parsed.ports[1].outputType, "XLR");
  });

  it("still accepts the parallel-arrays catalog form", () => {
    const parsed = normalizeGearEntry({
      id: "legacy-1",
      label: "Legacy Box",
      category: "Video",
      inputs: ["HDMI In 1", "HDMI In 2"],
      outputs: ["SDI Out"],
    });
    assert.ok(parsed);
    assert.equal(parsed.ports.length, 2);
    assert.equal(parsed.ports[0].inputType, "HDMI");
    assert.equal(parsed.ports[1].output, "—");
  });
});
