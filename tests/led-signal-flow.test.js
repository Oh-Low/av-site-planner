import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLedWallGear,
  LED_WALLS_FOLDER_ID,
  ledWallIdFromTypeId,
  listLedWallLibraryGear,
  resolveLedPowerConnectorType,
} from "../js/domain/led-signal-flow.js";
import { listPowerInputRows } from "../js/domain/signal-flow-power.js";

describe("led-signal-flow gear builder", () => {
  it("resolves power connector types from LED wall fields", () => {
    assert.equal(resolveLedPowerConnectorType("Soca"), "Soca");
    assert.equal(resolveLedPowerConnectorType("powercon"), "Powercon");
    assert.equal(resolveLedPowerConnectorType("unknown"), "Edison");
    assert.equal(resolveLedPowerConnectorType(""), "Edison");
  });

  it("builds ports from drawn power and data lines", () => {
    const gear = buildLedWallGear({
      id: "wall-1",
      name: "Main",
      powerConnector: "True1",
      powerLines: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      dataLines: [{ id: "d1" }, { id: "d2" }],
    });
    assert.ok(gear);
    assert.equal(gear.id, "led-wall:wall-1");
    assert.equal(gear.defaultName, "Main");
    assert.equal(gear.ports.length, 5);
    assert.equal(gear.ports[0].input, "Power 1");
    assert.equal(gear.ports[0].inputType, "True1");
    assert.equal(gear.ports[2].input, "Power 3");
    assert.equal(gear.ports[3].input, "ETH 1");
    assert.equal(gear.ports[3].inputType, "ETH");
    assert.equal(gear.ports[4].input, "ETH 2");
    assert.deepEqual(listPowerInputRows(gear.ports), [0, 1, 2]);
  });

  it("returns empty ports when no lines are drawn", () => {
    const gear = buildLedWallGear({
      id: "empty",
      name: "Empty",
      powerLines: [],
      dataLines: [],
    });
    assert.ok(gear);
    assert.equal(gear.ports.length, 0);
  });

  it("returns null without a wall id", () => {
    assert.equal(buildLedWallGear({ name: "No id" }), null);
  });

  it("lists LED walls in the library folder", () => {
    const list = listLedWallLibraryGear({
      grids: [
        { id: "w2", name: "B Wall", powerLines: [], dataLines: [{ id: "d1" }] },
        { id: "w1", name: "A Wall", powerLines: [{ id: "p1" }], dataLines: [] },
      ],
    });
    assert.equal(list.length, 2);
    assert.equal(list[0].label, "A Wall");
    assert.equal(list[0].folderId, LED_WALLS_FOLDER_ID);
    assert.equal(ledWallIdFromTypeId(list[0].id), "w1");
    assert.equal(list[1].label, "B Wall");
  });
});
