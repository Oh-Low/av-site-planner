import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addManualPowerAllocationRow,
  addPowerAllocationHeader,
  amperageFromWattage,
  wattageFromAmperage,
  buildPowerAllocationRows,
  emptyPowerAllocationState,
  formatPhaseAmpSummary,
  formatPowerAllocationNumber,
  phaseForNumberKey,
  phaseFromPortLabel,
  phaseLegs,
  phasesForVoltage,
  powerAllocationHeaderItems,
  powerAllocationRowsForDisplay,
  powerAllocationRowsForPaperwork,
  removePowerAllocationRow,
  sumPowerAllocationItems,
  syncPowerAllocationRows,
  updatePowerAllocationRow,
  updatePowerAllocationSettings,
  voltageFromPortLabel,
  wattageFromNote,
} from "../js/domain/power-allocation.js";

describe("power allocation helpers", () => {
  it("parses phase from port labels", () => {
    assert.equal(phaseFromPortLabel("Phase X Out"), "X");
    assert.equal(phaseFromPortLabel("L2 Camlock"), "Y");
    assert.equal(phaseFromPortLabel("Edison 1"), "");
    assert.equal(phaseFromPortLabel("XY Cam"), "XY");
    assert.equal(phaseFromPortLabel("L2-L3"), "ZY");
    assert.equal(phaseFromPortLabel("YZ Out"), "ZY");
    assert.deepEqual(phasesForVoltage(208), ["XY", "XZ", "ZY"]);
    assert.deepEqual(phasesForVoltage(120), ["X", "Y", "Z"]);
    assert.equal(phaseForNumberKey(120, "1"), "X");
    assert.equal(phaseForNumberKey(120, "2"), "Y");
    assert.equal(phaseForNumberKey(120, "3"), "Z");
    assert.equal(phaseForNumberKey(208, "1"), "XY");
    assert.equal(phaseForNumberKey(208, "2"), "XZ");
    assert.equal(phaseForNumberKey(208, "3"), "ZY");
    assert.equal(phaseForNumberKey(208, "4"), null);
    assert.deepEqual(phaseLegs("XY"), ["X", "Y"]);
    assert.deepEqual(phaseLegs("ZY"), ["Z", "Y"]);
  });

  it("infers voltage from labels and connector types", () => {
    assert.equal(voltageFromPortLabel("208V Distro", null), 208);
    assert.equal(voltageFromPortLabel("Edison Out", "Edison"), 120);
    assert.equal(voltageFromPortLabel("Cam Out", "CamLock"), 208);
  });

  it("parses wattage notes and amps", () => {
    assert.equal(wattageFromNote("150W LED wash"), 150);
    assert.equal(amperageFromWattage(1200, 120), 10);
    assert.equal(formatPowerAllocationNumber(10.5, 2), "10.5");
    assert.equal(formatPowerAllocationNumber(10, 2), "10");
  });
});

describe("buildPowerAllocationRows", () => {
  const gearById = {
    "power-soca-breakout-edison": {
      id: "power-soca-breakout-edison",
      label: "Edison Soca Breakout",
      domain: "power",
      ports: [
        { input: "Soca In", inputType: "Soca", output: "Edison 1", outputType: "Edison" },
        { input: "—", inputType: null, output: "Edison 2", outputType: "Edison" },
        { input: "—", inputType: null, output: "Edison 3", outputType: "Edison" },
      ],
    },
    "power-indu-35": {
      id: "power-indu-35",
      label: "INDU 35 Distro",
      domain: "power",
      ports: [
        { input: "CamLock In", inputType: "CamLock", output: "Soca 208 1", outputType: "Soca" },
        { input: "—", inputType: null, output: "Soca 120 1", outputType: "Soca" },
      ],
    },
    "switcher": {
      id: "switcher",
      label: "Switcher",
      domain: "signal",
      wattage: 240,
      ports: [
        { input: "Power In", inputType: "Edison", output: "—", outputType: null },
      ],
    },
    "processor": {
      id: "processor",
      label: "Processor",
      domain: "signal",
      note: "85 watts idle",
      ports: [
        { input: "Power In", inputType: "True1", output: "—", outputType: null },
      ],
    },
  };

  /** @param {{ typeId?: string, gearOverride?: object | null }} node */
  function resolveGear(node) {
    if (node.gearOverride) return node.gearOverride;
    return gearById[String(node.typeId)] ?? null;
  }

  it("lists only power-fed loads and walks through Soca adapters to the distro", () => {
    const rows = buildPowerAllocationRows({
      signalFlow: {
        nodes: [
          { id: "distro", name: "House Distro", typeId: "power-indu-35" },
          { id: "breakout", name: "Stage Soca", typeId: "power-soca-breakout-edison" },
          { id: "sw", name: "Main Switcher", typeId: "switcher" },
          { id: "proc", name: "LED Proc", typeId: "processor" },
          { id: "lonely", name: "Unpowered Box", typeId: "switcher" },
        ],
        connections: [
          {
            fromNodeId: "distro",
            fromRow: 0,
            fromCol: "output",
            toNodeId: "breakout",
            toRow: 0,
            toCol: "input",
            power: true,
          },
          {
            fromNodeId: "breakout",
            fromRow: 0,
            fromCol: "output",
            toNodeId: "sw",
            toRow: 0,
            toCol: "input",
            power: true,
          },
          {
            fromNodeId: "distro",
            fromRow: 1,
            fromCol: "output",
            toNodeId: "proc",
            toRow: 0,
            toCol: "input",
            power: true,
          },
          {
            fromNodeId: "sw",
            fromRow: 0,
            fromCol: "output",
            toNodeId: "proc",
            toRow: 0,
            toCol: "input",
            power: false,
          },
        ],
      },
      resolveGear,
    });

    assert.equal(rows.length, 2);
    assert.equal(
      rows.some((r) => /soca|breakout/i.test(r.device)),
      false
    );
    const sw = rows.find((r) => r.device === "Main Switcher");
    const proc = rows.find((r) => r.device === "LED Proc");
    assert.ok(sw);
    assert.ok(proc);
    assert.equal(sw.distro, "House Distro");
    assert.equal(sw.voltage, 208);
    assert.equal(sw.phase, "");
    assert.equal(sw.wattage, 240);
    assert.equal(sw.amperage, 240 / 208);
    assert.equal(proc.distro, "House Distro");
    assert.equal(proc.voltage, 120);
    assert.equal(proc.wattage, 85);
    assert.ok(proc.amperage != null && Math.abs(proc.amperage - 85 / 120) < 1e-9);
  });

  it("computes LED wall wattage from live LED export", () => {
    const rows = buildPowerAllocationRows({
      signalFlow: {
        nodes: [
          { id: "out", name: "Outlet", typeId: "power-20a-wall-outlet" },
          {
            id: "wall",
            name: "IMAG Wall",
            typeId: "led-wall:wall-1",
            ledWallId: "wall-1",
          },
        ],
        connections: [
          {
            fromNodeId: "out",
            fromRow: 0,
            fromCol: "output",
            toNodeId: "wall",
            toRow: 0,
            power: true,
          },
        ],
      },
      led: {
        voltage: 120,
        grids: [
          {
            id: "wall-1",
            rows: 2,
            cols: 3,
            tile: { wattage: 100 },
          },
        ],
      },
      resolveGear(node) {
        if (node.typeId === "power-20a-wall-outlet") {
          return {
            id: "power-20a-wall-outlet",
            label: "20A Wall outlet",
            domain: "power",
            ports: [
              {
                input: "—",
                inputType: null,
                output: "Edison Out",
                outputType: "Edison",
              },
            ],
          };
        }
        return { id: "led", label: "LED Wall", domain: "led", ports: [] };
      },
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].device, "IMAG Wall");
    assert.equal(rows[0].wattage, 600);
    assert.equal(rows[0].voltage, 120);
    assert.equal(rows[0].amperage, 5);
  });

  it("splits an LED wall into a section with one row per power line", () => {
    const rows = buildPowerAllocationRows({
      signalFlow: {
        nodes: [
          { id: "out", name: "Outlet", typeId: "power-20a-wall-outlet" },
          { id: "wall", name: "IMAG Wall", typeId: "led-wall:wall-1", ledWallId: "wall-1" },
        ],
        connections: [
          {
            fromNodeId: "out",
            fromRow: 0,
            fromCol: "output",
            toNodeId: "wall",
            toRow: 0,
            power: true,
          },
        ],
      },
      led: {
        voltage: 120,
        grids: [
          {
            id: "wall-1",
            name: "IMAG Wall",
            rows: 2,
            cols: 3,
            tile: { wattage: 100 },
            powerLines: [
              { id: "p1", name: "Circuit A", tiles: [0, 1, 2] },
              { id: "p2", name: "Circuit B", tiles: [3, 4] },
            ],
          },
        ],
      },
      resolveGear(node) {
        if (node.typeId === "power-20a-wall-outlet") {
          return {
            id: "power-20a-wall-outlet",
            label: "20A Wall outlet",
            domain: "power",
            ports: [{ input: "—", inputType: null, output: "Edison Out", outputType: "Edison" }],
          };
        }
        return { id: "led", label: "LED Wall", domain: "led", ports: [] };
      },
    });

    assert.equal(rows[0].kind, "header");
    assert.equal(rows[0].device, "IMAG Wall");
    assert.equal(rows[0].keyPart, "led");
    assert.deepEqual(
      rows.slice(1).map((row) => ({ device: row.device, wattage: row.wattage, phase: row.phase, keyPart: row.keyPart })),
      [
        { device: "Circuit A", wattage: 300, phase: "", keyPart: "line:p1" },
        { device: "Circuit B", wattage: 200, phase: "", keyPart: "line:p2" },
        { device: "Unassigned", wattage: 100, phase: "", keyPart: "line:unassigned" },
      ]
    );
    assert.equal(rows[1].distro, "Outlet");
    assert.equal(rows[1].amperage, 2.5);
  });

  it("returns empty when nothing is power-connected", () => {
    assert.deepEqual(
      buildPowerAllocationRows({
        signalFlow: {
          nodes: [{ id: "a", name: "Box", typeId: "switcher" }],
          connections: [],
        },
        resolveGear,
      }),
      []
    );
  });
});

describe("power allocation calculator state", () => {
  const live = [
    {
      device: "Switcher",
      distro: "House Distro",
      phase: "X",
      voltage: 208,
      wattage: 240,
      amperage: 240 / 208,
      nodeId: "sw",
      roomId: "r1",
      room: "Main",
    },
    {
      device: "Processor",
      distro: "House Distro",
      phase: "Y",
      voltage: 120,
      wattage: 85,
      amperage: 85 / 120,
      nodeId: "pr",
      roomId: "r2",
      room: "Lobby",
    },
  ];

  it("keeps overrides and hide flags across sync, and ignores search in paperwork", () => {
    let state = syncPowerAllocationRows(emptyPowerAllocationState(), live);
    const switcher = state.rows.find((row) => row.nodeId === "sw");
    assert.ok(switcher);
    state = updatePowerAllocationRow(state, switcher.id, {
      device: "A1 Switcher",
      wattage: 416,
    });
    state = updatePowerAllocationRow(state, switcher.id, { included: false });
    state = updatePowerAllocationSettings(state, {
      searchQuery: "processor",
      roomFilter: "Lobby",
    });

    const nextLive = live.map((row) =>
      row.nodeId === "sw" ? { ...row, device: "Switcher renamed", wattage: 100, amperage: 1 } : row
    );
    state = syncPowerAllocationRows(state, nextLive);
    const kept = state.rows.find((row) => row.nodeId === "sw");
    assert.equal(kept.device, "A1 Switcher");
    assert.equal(kept.wattage, 416);
    assert.equal(kept.voltage, 208);
    assert.equal(kept.amperage, 2);
    assert.equal(kept.included, false);
    assert.equal(kept.overrides.device, true);
    assert.equal(kept.overrides.wattage, true);
    assert.equal(kept.overrides.amperage, undefined);

    const processor = state.rows.find((row) => row.nodeId === "pr");
    assert.equal(processor.device, "Processor");
    assert.equal(processor.wattage, 85);

    assert.deepEqual(
      powerAllocationRowsForDisplay(state).map((row) => row.nodeId),
      ["pr"]
    );
    assert.deepEqual(
      powerAllocationRowsForPaperwork(state, "r1").map((row) => row.nodeId),
      []
    );
    assert.deepEqual(
      powerAllocationRowsForPaperwork(state, "r2").map((row) => row.device),
      ["Processor"]
    );
  });

  it("keeps an amperage override when wattage also changes", () => {
    let state = syncPowerAllocationRows(emptyPowerAllocationState(), live);
    const switcher = state.rows.find((row) => row.nodeId === "sw");
    state = updatePowerAllocationRow(state, switcher.id, { amperage: 9 });
    state = updatePowerAllocationRow(state, switcher.id, { wattage: 500 });
    state = syncPowerAllocationRows(state, live);
    const kept = state.rows.find((row) => row.nodeId === "sw");
    assert.equal(kept.wattage, 500);
    assert.equal(kept.amperage, 9);
  });

  it("keeps a circuit phase override and totals the section by leg", () => {
    const live = [
      {
        device: "IMAG Wall",
        distro: "",
        phase: "",
        voltage: null,
        wattage: null,
        amperage: null,
        nodeId: "wall",
        roomId: "r1",
        room: "Main",
        kind: "header",
        level: "section",
        keyPart: "led",
      },
      {
        device: "Circuit A",
        distro: "Outlet",
        phase: "",
        voltage: 120,
        wattage: 300,
        amperage: 2.5,
        nodeId: "wall",
        roomId: "r1",
        room: "Main",
        kind: "item",
        keyPart: "line:p1",
      },
      {
        device: "Circuit B",
        distro: "Outlet",
        phase: "",
        voltage: 120,
        wattage: 300,
        amperage: 2.5,
        nodeId: "wall",
        roomId: "r1",
        room: "Main",
        kind: "item",
        keyPart: "line:p2",
      },
    ];
    let state = syncPowerAllocationRows(emptyPowerAllocationState(), live);
    const circuitA = state.rows.find((row) => row.device === "Circuit A");
    state = updatePowerAllocationRow(state, circuitA.id, { phase: "X" });
    state = updatePowerAllocationRow(
      state,
      state.rows.find((row) => row.device === "Circuit B").id,
      { phase: "Y" }
    );
    state = syncPowerAllocationRows(
      state,
      live.map((row) => (row.keyPart === "line:p1" ? { ...row, device: "Renamed" } : row))
    );
    const kept = state.rows.find((row) => row.sourceKey.endsWith("line:p1"));
    assert.equal(kept.device, "Renamed");
    assert.equal(kept.phase, "X");
    const headerIndex = state.rows.findIndex((row) => row.kind === "header");
    const totals = sumPowerAllocationItems(powerAllocationHeaderItems(state.rows, headerIndex));
    assert.equal(totals.wattage, 600);
    assert.equal(totals.amperage, 5);
    assert.equal(formatPhaseAmpSummary(totals.phaseAmps), "X 2.5 · Y 2.5");

    const header = state.rows[headerIndex];
    state = updatePowerAllocationRow(state, header.id, { included: false });
    assert.deepEqual(powerAllocationRowsForPaperwork(state, "r1"), []);

    state = addPowerAllocationHeader(state, "subsection", { device: "Spare", room: "Main", roomId: "r1" });
    state = updatePowerAllocationSettings(state, { searchQuery: "renamed" });
    assert.deepEqual(
      powerAllocationRowsForDisplay(state).map((row) => row.device),
      ["IMAG Wall", "Renamed"]
    );
  });

  it("counts a 208V pair on both legs", () => {
    let state = addManualPowerAllocationRow(emptyPowerAllocationState(), {
      device: "Wall processor",
      voltage: 208,
      wattage: 2080,
      phase: "yz",
    });
    const row = state.rows[0];
    assert.equal(row.phase, "ZY");
    assert.equal(row.amperage, 10);
    state = addPowerAllocationHeader(state, "section", { device: "Distro" });
    state = {
      ...state,
      rows: [state.rows[1], state.rows[0]],
    };
    const totals = sumPowerAllocationItems(powerAllocationHeaderItems(state.rows, 0));
    assert.equal(formatPhaseAmpSummary(totals.phaseAmps), "Y 10 · Z 10");

    state = updatePowerAllocationRow(state, row.id, { voltage: 120, phase: "X" });
    state = updatePowerAllocationRow(state, row.id, { voltage: 208 });
    const kept = state.rows.find((item) => item.id === row.id);
    assert.equal(kept.phase, "X");
    state = addManualPowerAllocationRow(state, { device: "Spare", voltage: 208, phase: "X" });
    const spare = state.rows.find((item) => item.device === "Spare");
    const edited = updatePowerAllocationRow(state, spare.id, { wattage: 208 });
    assert.equal(edited.rows.find((item) => item.id === spare.id).phase, "X");
  });

  it("keeps a chosen phase when wattage changes and drops only an automatic mismatch", () => {
    let state = addManualPowerAllocationRow(emptyPowerAllocationState(), {
      device: "Par",
      voltage: 120,
      phase: "X",
      wattage: 120,
    });
    const id = state.rows[0].id;
    state = updatePowerAllocationRow(state, id, { wattage: 240 });
    assert.equal(state.rows[0].phase, "X");
    state = updatePowerAllocationRow(state, id, { voltage: 208 });
    assert.equal(state.rows[0].phase, "");
    state = updatePowerAllocationRow(state, id, { phase: "XY", wattage: 416 });
    assert.equal(state.rows[0].phase, "XY");
    assert.equal(state.rows[0].amperage, 2);
    state = updatePowerAllocationRow(state, id, { voltage: 120 });
    assert.equal(state.rows[0].phase, "XY");
  });

  it("fills the other load number when a manual row sets watts or amps", () => {
    let state = addManualPowerAllocationRow(emptyPowerAllocationState(), {
      device: "Work light",
      voltage: 120,
      wattage: 240,
    });
    let row = state.rows[0];
    assert.equal(row.amperage, 2);
    state = updatePowerAllocationRow(state, row.id, { amperage: 5 });
    row = state.rows.find((item) => item.id === row.id);
    assert.equal(row.wattage, 600);
    assert.equal(row.overrides.wattage, undefined);
    assert.equal(row.overrides.amperage, true);
    state = updatePowerAllocationRow(state, row.id, { voltage: 208 });
    row = state.rows.find((item) => item.id === row.id);
    assert.equal(row.amperage, 5);
    assert.equal(row.wattage, 1040);
    state = updatePowerAllocationRow(state, row.id, { wattage: 416 });
    row = state.rows.find((item) => item.id === row.id);
    assert.equal(row.wattage, 416);
    assert.equal(row.amperage, 2);
    assert.equal(row.overrides.amperage, undefined);
    assert.equal(wattageFromAmperage(2, 208), 416);
  });

  it("appends manual rows and refuses to delete auto rows", () => {
    let state = syncPowerAllocationRows(emptyPowerAllocationState(), live);
    const autoId = state.rows[0].id;
    state = addManualPowerAllocationRow(state, {
      device: "Work light",
      room: "Main",
      roomId: "r1",
      voltage: 120,
      wattage: 60,
    });
    state = syncPowerAllocationRows(state, live);
    assert.equal(state.rows.at(-1).source, "manual");
    assert.equal(state.rows.at(-1).device, "Work light");
    assert.equal(state.rows.at(-1).amperage, 0.5);
    state = removePowerAllocationRow(state, autoId);
    assert.ok(state.rows.some((row) => row.id === autoId));
    const manualId = state.rows.at(-1).id;
    state = removePowerAllocationRow(state, manualId);
    assert.equal(state.rows.some((row) => row.id === manualId), false);
  });
});
