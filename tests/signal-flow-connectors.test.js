import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGearPortsFromConnectors,
  createGearType,
  emptyConnectorCounts,
  expandConnectorLabels,
} from "../js/signal-flow-data.js";

describe("gear connector ports", () => {
  it("expands connector counts into numbered labels", () => {
    const counts = emptyConnectorCounts();
    counts.HDMI = 2;
    counts.XLR = 1;
    assert.deepEqual(expandConnectorLabels(counts), ["HDMI 1", "HDMI 2", "XLR 1"]);
  });

  it("builds paired port rows from connector counts", () => {
    const inputs = emptyConnectorCounts();
    inputs.HDMI = 2;
    inputs.SDI = 1;
    const outputs = emptyConnectorCounts();
    outputs.HDMI = 1;
    outputs.ETH = 1;

    const ports = buildGearPortsFromConnectors(inputs, outputs);
    assert.equal(ports.length, 3);
    assert.deepEqual(ports[0], {
      input: "HDMI 1",
      output: "HDMI 1",
      inputType: "HDMI",
      outputType: "HDMI",
    });
    assert.deepEqual(ports[1], {
      input: "HDMI 2",
      output: "ETH 1",
      inputType: "HDMI",
      outputType: "ETH",
    });
    assert.deepEqual(ports[2], {
      input: "SDI 1",
      output: "—",
      inputType: "SDI",
      outputType: null,
    });
  });

  it("creates gear from connector counts", () => {
    const inputs = emptyConnectorCounts();
    inputs["USB-C"] = 1;
    const outputs = emptyConnectorCounts();
    outputs.DP = 2;

    const gear = createGearType({
      name: "Dock",
      category: "Other",
      inputCounts: inputs,
      outputCounts: outputs,
    });

    assert.equal(gear.ports.length, 2);
    assert.equal(gear.ports[0].input, "USB-C 1");
    assert.equal(gear.ports[0].inputType, "USB-C");
    assert.equal(gear.ports[0].output, "DP 1");
    assert.equal(gear.ports[0].outputType, "DP");
    assert.equal(gear.ports[1].output, "DP 2");
    assert.equal(gear.ports[1].outputType, "DP");
  });
});
