import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONNECTOR_TYPES,
  isPowerConnection,
  isPowerConnectorType,
  normalizeGearEntry,
  serializeGearForCatalog,
} from "../js/signal-flow-gear-schema.js";
import {
  GEAR_TYPES,
  POWER_GEAR_TYPES,
  resolveGearType,
} from "../js/signal-flow-data.js";
import {
  BRAND_GEAR_TYPES,
  GENERIC_GEAR_TYPES,
  prepareCatalogFromFile,
} from "../js/signal-flow-gear-presets.js";
import {
  BUILTIN_FOLDERS,
  BUILTIN_GEAR_PLACEMENTS,
  listGearInFolder,
} from "../js/signal-flow-gear-library.js";
import { buildLedWallGear } from "../js/domain/led-signal-flow.js";
import {
  allPowerInputsConnected,
  gearForPowerMode,
  gearForSignalMode,
  isPowerDomainGear,
  isPowerDomainNode,
  listPowerInputRows,
  migrateLegacyPowerInletConnections,
  needsSyntheticPowerIn,
  nodeWorldPosition,
  seedPowerPositionFromSignal,
  setNodeWorldPosition,
} from "../js/domain/signal-flow-power.js";

describe("signal-flow power mode schema", () => {
  it("includes power connector types", () => {
    for (const type of ["Edison", "Soca", "Powercon", "True1", "CamLock"]) {
      assert.ok(CONNECTOR_TYPES.includes(type), type);
      assert.equal(isPowerConnectorType(type), true, type);
    }
    assert.equal(isPowerConnectorType("HDMI"), false);
    assert.equal(isPowerConnectorType(null), false);
  });

  it("detects power connections via power inlet column or flag", () => {
    assert.equal(isPowerConnection({ toCol: "power" }), true);
    assert.equal(isPowerConnection({ fromCol: "power" }), true);
    assert.equal(isPowerConnection({ power: true, fromCol: "output", toCol: "input" }), true);
    assert.equal(isPowerConnection({ fromCol: "output", toCol: "input" }), false);
  });

  it("round-trips domain:power on catalog gear", () => {
    const gear = normalizeGearEntry({
      id: "power-test",
      label: "Test Outlet",
      category: "Power",
      domain: "power",
      outputs: ["Edison Out"],
      outputTypes: ["Edison"],
      inputs: ["—"],
    });
    assert.ok(gear);
    assert.equal(gear.domain, "power");
    assert.equal(gear.ports[0].outputType, "Edison");

    const serialized = serializeGearForCatalog(gear);
    assert.equal(serialized.domain, "power");
    const again = normalizeGearEntry(serialized);
    assert.equal(again?.domain, "power");
  });

  it("ships 20A Wall outlet as power-only gear", () => {
    assert.ok(POWER_GEAR_TYPES.some((g) => g.id === "power-20a-wall-outlet"));
    const outlet = resolveGearType("power-20a-wall-outlet");
    assert.equal(outlet.label, "20A Wall outlet");
    assert.equal(outlet.domain, "power");
    assert.equal(outlet.ports[0].outputType, "Edison");
    assert.ok(GEAR_TYPES.some((g) => g.id === "power-20a-wall-outlet"));
  });

  it("ships Company Switch with a CamLock output", () => {
    const gear = resolveGearType("power-company-switch");
    assert.equal(gear.label, "Company Switch");
    assert.equal(gear.domain, "power");
    assert.equal(gear.ports.length, 1);
    assert.equal(gear.ports[0].input, "—");
    assert.equal(gear.ports[0].output, "CamLock Out");
    assert.equal(gear.ports[0].outputType, "CamLock");
    assert.ok(POWER_GEAR_TYPES.some((g) => g.id === "power-company-switch"));
  });

  it("ships Soca breakouts with Soca in and six typed outs", () => {
    /** @type {{ id: string, label: string, outType: string }[]} */
    const breakouts = [
      {
        id: "power-soca-breakout-edison",
        label: "Edison Soca Breakout",
        outType: "Edison",
      },
      {
        id: "power-soca-breakout-powercon",
        label: "Powercon Soca Breakout",
        outType: "Powercon",
      },
      {
        id: "power-soca-breakout-true1",
        label: "True1 Soca Breakout",
        outType: "True1",
      },
    ];
    for (const spec of breakouts) {
      const gear = resolveGearType(spec.id);
      assert.equal(gear.label, spec.label);
      assert.equal(gear.domain, "power");
      assert.equal(gear.ports.length, 6);
      assert.equal(gear.ports[0].inputType, "Soca");
      assert.equal(gear.ports[0].input, "Soca In");
      for (let i = 0; i < 6; i += 1) {
        assert.equal(gear.ports[i].outputType, spec.outType);
      }
      assert.ok(POWER_GEAR_TYPES.some((g) => g.id === spec.id));
      assert.ok(!GENERIC_GEAR_TYPES.some((g) => g.id === spec.id));
    }
  });

  it("ships INDU 35 Distro with CamLock in/thru, Socas, and Edisons", () => {
    const gear = resolveGearType("power-indu-35");
    assert.equal(gear.label, "INDU 35 Distro");
    assert.equal(gear.domain, "power");
    assert.equal(gear.ports.length, 11);
    assert.equal(gear.ports[0].input, "CamLock In");
    assert.equal(gear.ports[0].inputType, "CamLock");
    assert.equal(gear.ports[0].output, "CamLock Thru");
    assert.equal(gear.ports[0].outputType, "CamLock");
    for (let i = 1; i <= 8; i += 1) {
      assert.equal(gear.ports[i].outputType, "Soca");
    }
    assert.equal(gear.ports[9].outputType, "Edison");
    assert.equal(gear.ports[10].outputType, "Edison");
    assert.ok(POWER_GEAR_TYPES.some((g) => g.id === "power-indu-35"));
  });

  it("excludes power gear from signal Gear browser listings", () => {
    assert.ok(!GENERIC_GEAR_TYPES.some((g) => g.domain === "power"));
    assert.ok(!BRAND_GEAR_TYPES.some((g) => g.domain === "power"));
    assert.ok(!BUILTIN_GEAR_PLACEMENTS.some((p) => p.gearId === "power-20a-wall-outlet"));

    const root = listGearInFolder(BUILTIN_FOLDERS, BUILTIN_GEAR_PLACEMENTS, [], null);
    assert.ok(!root.some((g) => g.id === "power-20a-wall-outlet"));
  });

  it("does not wrap power.json in a Library folder", () => {
    const prepared = prepareCatalogFromFile("power.json", {
      folders: [],
      gear: [
        {
          id: "power-x",
          label: "X",
          category: "Power",
          domain: "power",
          inputs: ["—"],
          outputs: ["Edison Out"],
          outputTypes: ["Edison"],
        },
      ],
    });
    assert.equal(prepared.folders.length, 0);
    assert.equal(prepared.gear[0].folderId, undefined);
  });

  it("filters connections by mode (signal vs power)", () => {
    const connections = [
      { id: "s1", fromCol: "output", toCol: "input" },
      { id: "p1", fromCol: "output", toCol: "power" },
    ];
    const signalOnly = connections.filter((c) => !isPowerConnection(c));
    const powerOnly = connections.filter((c) => isPowerConnection(c));
    assert.deepEqual(
      signalOnly.map((c) => c.id),
      ["s1"]
    );
    assert.deepEqual(
      powerOnly.map((c) => c.id),
      ["p1"]
    );
  });
});

describe("power mode table remapping", () => {
  it("keeps row count and places Power In at the top-left", () => {
    const gear = {
      id: "matrix",
      label: "Matrix",
      defaultName: "Matrix",
      category: "Video",
      domain: "signal",
      ports: [
        { input: "HDMI 1", output: "Out 1", inputType: "HDMI", outputType: "HDMI" },
        { input: "HDMI 2", output: "Out 2", inputType: "HDMI", outputType: "HDMI" },
        { input: "HDMI 3", output: "Out 3", inputType: "HDMI", outputType: "HDMI" },
      ],
    };
    assert.equal(needsSyntheticPowerIn(gear), true);
    const power = gearForPowerMode(gear);
    assert.equal(power.ports.length, 3);
    assert.equal(power.ports[0].input, "Power In");
    assert.equal(power.ports[0].inputType, "Edison");
    assert.equal(power.ports[0].output, "—");
    assert.equal(power.ports[1].input, "—");
    assert.equal(power.ports[1].output, "—");
    assert.equal(power.ports[2].input, "—");
    assert.equal(power.ports[2].output, "—");
  });

  it("packs LED power inputs from the top using max(power, signal) rows", () => {
    const gear = buildLedWallGear({
      id: "wall-1",
      name: "Main",
      powerConnector: "Edison",
      powerLines: [{ id: "p1" }, { id: "p2" }],
      dataLines: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    });
    assert.ok(gear);
    assert.equal(gear.ports.length, 5); // stored: power + signal
    const power = gearForPowerMode(gear);
    assert.equal(power.ports.length, 3); // display: max(2, 3)
    assert.equal(power.ports[0].input, "Power 1");
    assert.equal(power.ports[1].input, "Power 2");
    assert.equal(power.ports[2].input, "—");
    assert.ok(power.ports.every((p) => p.output === "—"));
  });

  it("packs LED ETH inputs from the top using max(power, signal) rows", () => {
    const gear = buildLedWallGear({
      id: "wall-1",
      name: "Main",
      powerConnector: "Edison",
      powerLines: [{ id: "p1" }, { id: "p2" }],
      dataLines: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
    });
    assert.ok(gear);
    const signal = gearForSignalMode(gear);
    assert.equal(signal.ports.length, 3);
    assert.equal(signal.ports[0].input, "ETH 1");
    assert.equal(signal.ports[0].inputType, "ETH");
    assert.equal(signal.ports[1].input, "ETH 2");
    assert.equal(signal.ports[2].input, "ETH 3");
    assert.ok(signal.ports.every((p) => p.output === "—"));
  });

  it("keeps power outputs for pure power sources", () => {
    const outlet = {
      id: "outlet",
      label: "Outlet",
      defaultName: "Outlet",
      category: "Power",
      domain: "power",
      ports: [{ input: "—", output: "Edison Out", inputType: null, outputType: "Edison" }],
    };
    assert.equal(needsSyntheticPowerIn(outlet), false);
    const power = gearForPowerMode(outlet);
    assert.equal(power.ports.length, 1);
    assert.equal(power.ports[0].input, "—");
    assert.equal(power.ports[0].output, "Edison Out");
    assert.equal(power.ports[0].outputType, "Edison");
  });

  it("reports powered only when every power input has a feed", () => {
    const ports = gearForPowerMode({
      id: "w",
      label: "W",
      defaultName: "W",
      category: "Video",
      ports: [
        { input: "Power 1", output: "—", inputType: "Edison", outputType: null },
        { input: "Power 2", output: "—", inputType: "Edison", outputType: null },
        { input: "ETH 1", output: "—", inputType: "ETH", outputType: null },
      ],
    }).ports;
    assert.deepEqual(listPowerInputRows(ports), [0, 1]);
    assert.equal(allPowerInputsConnected(ports, [], "n1"), false);
    assert.equal(
      allPowerInputsConnected(
        ports,
        [{ toNodeId: "n1", toCol: "input", toRow: 0, power: true }],
        "n1"
      ),
      false
    );
    assert.equal(
      allPowerInputsConnected(
        ports,
        [
          { toNodeId: "n1", toCol: "input", toRow: 0, power: true },
          { toNodeId: "n1", toCol: "input", toRow: 1, power: true },
        ],
        "n1"
      ),
      true
    );
  });

  it("migrates legacy toCol:power onto the first power input row", () => {
    const nodes = [{ id: "n1" }];
    const gear = {
      id: "g",
      label: "G",
      defaultName: "G",
      category: "Video",
      ports: [{ input: "HDMI In", output: "Out", inputType: "HDMI", outputType: "HDMI" }],
    };
    const migrated = migrateLegacyPowerInletConnections(
      nodes,
      [
        {
          id: "w1",
          fromNodeId: "out",
          fromRow: 0,
          fromCol: "output",
          toNodeId: "n1",
          toRow: 0,
          toCol: "power",
        },
      ],
      () => gear
    );
    assert.equal(migrated[0].toCol, "input");
    assert.equal(migrated[0].toRow, 0);
    assert.equal(migrated[0].power, true);
    assert.equal(isPowerConnection(migrated[0]), true);
  });

  it("keeps signal labels on the base gear while power mode clears them", () => {
    const gear = {
      id: "matrix",
      label: "Matrix",
      defaultName: "Matrix",
      category: "Video",
      domain: "signal",
      ports: [
        { input: "HDMI In", output: "HDMI Out", inputType: "HDMI", outputType: "HDMI" },
      ],
    };
    const power = gearForPowerMode(gear);
    assert.equal(gear.ports[0].input, "HDMI In");
    assert.equal(gear.ports[0].output, "HDMI Out");
    assert.equal(power.ports[0].input, "Power In");
    assert.equal(power.ports[0].output, "—");
  });
});

describe("power vs signal layout positions", () => {
  it("detects power-domain gear", () => {
    assert.equal(isPowerDomainGear({ domain: "power" }), true);
    assert.equal(isPowerDomainGear({ domain: "signal" }), false);
    assert.equal(isPowerDomainGear({}), false);
    assert.equal(isPowerDomainGear({ id: "power-company-switch" }), true);
    assert.equal(isPowerDomainNode({ typeId: "power-company-switch" }), true);
    assert.equal(isPowerDomainNode({ typeId: "matrix" }, { domain: "signal" }), false);
  });

  it("falls back to signal x/y until power layout is set", () => {
    const node = { x: 100, y: 200 };
    assert.deepEqual(nodeWorldPosition(node, "signal"), { x: 100, y: 200 });
    assert.deepEqual(nodeWorldPosition(node, "power"), { x: 100, y: 200 });
  });

  it("keeps power and signal positions independent after both are set", () => {
    const node = { x: 10, y: 20, powerX: 10, powerY: 20 };
    setNodeWorldPosition(node, 50, 60, "power");
    assert.deepEqual(nodeWorldPosition(node, "signal"), { x: 10, y: 20 });
    assert.deepEqual(nodeWorldPosition(node, "power"), { x: 50, y: 60 });
    setNodeWorldPosition(node, 70, 80, "signal");
    assert.deepEqual(nodeWorldPosition(node, "signal"), { x: 70, y: 80 });
    assert.deepEqual(nodeWorldPosition(node, "power"), { x: 50, y: 60 });
  });

  it("seeds power layout from signal when missing", () => {
    const node = { x: 30, y: 40 };
    seedPowerPositionFromSignal(node);
    assert.equal(node.powerX, 30);
    assert.equal(node.powerY, 40);
    seedPowerPositionFromSignal(node);
    setNodeWorldPosition(node, 99, 99, "signal");
    assert.equal(node.powerX, 30);
    assert.equal(node.powerY, 40);
  });
});
