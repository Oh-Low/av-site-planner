import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlaceCards,
  buildRouteCards,
  emptyCableState,
  formatCablePath,
  groupRowsByCableType,
  inferCableType,
  matchRouteConnections,
  normalizeCableState,
  pruneManualCables,
} from "../js/domain/cable.js";

const nodes = [
  { id: "n1", typeId: "switcher", name: "Switcher", placeId: "p-a" },
  { id: "n2", typeId: "display", name: "Display", placeId: "p-b" },
  { id: "n3", typeId: "source", name: "Source", placeId: "p-a" },
  { id: "n4", typeId: "matrix", name: "Matrix", placeId: "p-a" },
];

const places = [
  { id: "p-a", name: "FOH" },
  { id: "p-b", name: "Stage" },
];

const connections = [
  {
    id: "c1",
    fromNodeId: "n1",
    fromRow: 0,
    fromCol: "output",
    toNodeId: "n2",
    toRow: 0,
    toCol: "input",
  },
  {
    id: "c2",
    fromNodeId: "n3",
    fromRow: 0,
    fromCol: "output",
    toNodeId: "n4",
    toRow: 0,
    toCol: "input",
  },
];

describe("cable calculator cards", () => {
  it("names cables from the destination input port type", () => {
    const label = inferCableType(connections[0], nodes, []);
    assert.equal(label, "HDMI");
  });

  it("falls back to the source output type when the input has no type", () => {
    // Source HDMI Out → Matrix In 1 (untyped) should still resolve HDMI.
    const label = inferCableType(connections[1], nodes, []);
    assert.equal(label, "HDMI");
  });

  it("resolves Fiber from a Fiber-labeled destination input", () => {
    const fiberNodes = [
      { id: "tx", typeId: "custom-tx", name: "TX", placeId: "p-a" },
      { id: "rx", typeId: "custom-rx", name: "RX", placeId: "p-b" },
    ];
    const custom = [
      {
        id: "custom-tx",
        label: "TX",
        defaultName: "TX",
        category: "Video",
        ports: [{ input: "—", output: "Fiber Out", outputType: "Fiber" }],
      },
      {
        id: "custom-rx",
        label: "RX",
        defaultName: "RX",
        category: "Video",
        ports: [{ input: "Fiber In", output: "—", inputType: "Fiber" }],
      },
    ];
    const conn = {
      id: "cf",
      fromNodeId: "tx",
      fromRow: 0,
      fromCol: "output",
      toNodeId: "rx",
      toRow: 0,
      toCol: "input",
    };
    assert.equal(inferCableType(conn, fiberNodes, custom), "Fiber");
  });

  it("resolves Fiber from source output when destination input is untyped", () => {
    const fiberNodes = [
      {
        id: "tx",
        typeId: "blank",
        name: "TX",
        gearOverride: {
          ports: [{ input: "—", output: "OPT Out", outputType: "Fiber" }],
        },
      },
      {
        id: "rx",
        typeId: "blank",
        name: "RX",
        gearOverride: {
          ports: [{ input: "In 1", output: "—" }],
        },
      },
    ];
    const conn = {
      id: "cf2",
      fromNodeId: "tx",
      fromRow: 0,
      fromCol: "output",
      toNodeId: "rx",
      toRow: 0,
      toCol: "input",
    };
    assert.equal(inferCableType(conn, fiberNodes, []), "Fiber");
  });

  it("groups rows by cable type with device paths", () => {
    const groups = groupRowsByCableType([
      { connectionId: "a", cableLabel: "HDMI", fromDevice: "Mac Studio", toDevice: "Barco E2" },
      { connectionId: "b", cableLabel: "SDI", fromDevice: "Camera", toDevice: "Switcher" },
      { connectionId: "c", cableLabel: "HDMI", fromDevice: "Camera", toDevice: "Barco E2" },
      { connectionId: "d", cableLabel: "HDMI", fromDevice: "Laptop", toDevice: "Switcher" },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].type, "HDMI");
    assert.equal(groups[0].count, 3);
    assert.equal(groups[0].rows[0].fromDevice, "Mac Studio");
    assert.equal(groups[1].type, "SDI");
    assert.equal(groups[1].count, 1);
  });

  it("matches route connections bidirectionally by place pair", () => {
    const route = {
      id: "r1",
      fromPlaceId: "p-b",
      toPlaceId: "p-a",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const matched = matchRouteConnections(route, connections, nodes);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, "c1");
  });

  it("includes power connections with types from the power-mode port table", () => {
    const powerNodes = [
      {
        id: "distro",
        typeId: "blank",
        name: "Soca breakout",
        placeId: "p-a",
        gearOverride: {
          ports: [
            { input: "Fiber In", output: "Fiber Out", inputType: "Fiber", outputType: "Fiber" },
            { input: "—", output: "Soca Out", outputType: "Soca" },
          ],
        },
      },
      {
        id: "cvt",
        typeId: "blank",
        name: "Novastar CVT",
        placeId: "p-b",
        gearOverride: {
          ports: [
            { input: "Fiber In", output: "—", inputType: "Fiber" },
            { input: "Power In", output: "—", inputType: "Edison" },
          ],
        },
      },
    ];
    // Power wire at remapped power-table row 0 (first power ports), not signal Fiber row.
    const powerConn = {
      id: "c-power",
      fromNodeId: "distro",
      fromRow: 0,
      fromCol: "output",
      toNodeId: "cvt",
      toRow: 0,
      toCol: "input",
      power: true,
    };
    const signalConn = {
      id: "c-fiber",
      fromNodeId: "distro",
      fromRow: 0,
      fromCol: "output",
      toNodeId: "cvt",
      toRow: 0,
      toCol: "input",
    };

    assert.equal(inferCableType(powerConn, powerNodes, []), "Soca");
    assert.equal(inferCableType(signalConn, powerNodes, []), "Fiber");

    const route = {
      id: "r1",
      fromPlaceId: "p-a",
      toPlaceId: "p-b",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    const cards = buildRouteCards({
      places,
      nodes: powerNodes,
      connections: [powerConn, signalConn],
      customGearTypes: [],
      routes: [route],
      scale: null,
    });
    assert.equal(cards[0].rows.length, 2);
    const powerRow = cards[0].rows.find((r) => r.connectionId === "c-power");
    const signalRow = cards[0].rows.find((r) => r.connectionId === "c-fiber");
    assert.equal(powerRow?.cableLabel, "Soca");
    assert.equal(powerRow?.power, true);
    assert.equal(signalRow?.cableLabel, "Fiber");
    assert.equal(signalRow?.power, false);
  });

  it("builds place cards with local cables only", () => {
    const cards = buildPlaceCards({ places, nodes, connections, customGearTypes: [] });
    const foh = cards.find((c) => c.id === "p-a");
    assert.ok(foh);
    assert.equal(foh.lengthLabel, "Local");
    assert.equal(foh.rows.length, 1);
    assert.equal(foh.rows[0].connectionId, "c2");
    const stage = cards.find((c) => c.id === "p-b");
    assert.equal(stage?.rows.length, 0);
  });

  it("builds route cards with length when scale is set", () => {
    const cards = buildRouteCards({
      places,
      nodes,
      connections,
      customGearTypes: [],
      routes: [
        {
          id: "r1",
          fromPlaceId: "p-a",
          toPlaceId: "p-b",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      scale: {
        pointA: { x: 0, y: 0 },
        pointB: { x: 100, y: 0 },
        distanceMeters: 10,
        unit: "metric",
      },
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].title, "FOH → Stage");
    assert.equal(cards[0].rows.length, 1);
    assert.match(cards[0].lengthLabel, /10/);
  });

  it("normalizes and prunes manual cable state", () => {
    const state = normalizeCableState({
      routes: {
        r1: [{ id: "m1", cableLabel: "HDMI", fromDevice: "A", toDevice: "B", amount: 3 }],
        gone: [{ id: "m2", cableLabel: "SDI", fromDevice: "C", toDevice: "D" }],
      },
      places: {
        "p-a": [{ cableLabel: "XLR", fromDevice: "", toDevice: "", amount: 2 }],
      },
    });
    assert.equal(state.routes.r1.length, 1);
    assert.equal(state.routes.r1[0].amount, 3);
    assert.equal(state.places["p-a"][0].fromDevice, "");
    assert.equal(state.places["p-a"][0].amount, 2);

    const pruned = pruneManualCables(state, ["r1"], ["p-a"]);
    assert.ok(pruned.routes.r1);
    assert.equal(pruned.routes.gone, undefined);
    assert.deepEqual(emptyCableState(), { routes: {}, places: {}, placeLengths: {} });
  });

  it("normalizes place lengths to the standard set", () => {
    const state = normalizeCableState({
      placeLengths: { "p-a": 25, "p-b": 7, "p-c": "50" },
    });
    assert.deepEqual(state.placeLengths, { "p-a": 25, "p-c": 50 });
  });

  it("uses card title when from and to are blank", () => {
    assert.equal(formatCablePath({ fromDevice: "", toDevice: "" }, "FOH → Stage"), "FOH → Stage");
    assert.equal(formatCablePath({ fromDevice: "A", toDevice: "B" }, "FOH → Stage"), "A → B");
  });

  it("sums amounts when grouping cable types", () => {
    const groups = groupRowsByCableType([
      { connectionId: "a", cableLabel: "HDMI", fromDevice: "", toDevice: "", amount: 3 },
      { connectionId: "b", cableLabel: "HDMI", fromDevice: "Cam", toDevice: "E2", amount: 2 },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 5);
  });

  it("collapses auto cables between the same gear pair", () => {
    const groups = groupRowsByCableType([
      {
        connectionId: "c1",
        cableLabel: "HDMI",
        fromDevice: "Mac Studio",
        toDevice: "Barco E2",
        fromNodeId: "n-mac",
        toNodeId: "n-e2",
        amount: 1,
      },
      {
        connectionId: "c2",
        cableLabel: "HDMI",
        fromDevice: "Mac Studio",
        toDevice: "Barco E2",
        fromNodeId: "n-mac",
        toNodeId: "n-e2",
        amount: 1,
      },
      {
        connectionId: "c3",
        cableLabel: "HDMI",
        fromDevice: "Camera",
        toDevice: "Barco E2",
        fromNodeId: "n-cam",
        toNodeId: "n-e2",
        amount: 1,
      },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 3);
    assert.equal(groups[0].rows.length, 2);
    assert.equal(groups[0].rows[0].amount, 2);
    assert.equal(groups[0].rows[1].amount, 1);
  });
});
