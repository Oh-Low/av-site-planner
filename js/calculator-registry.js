import { calculatorPlugin as ledPlugin } from "./led-calculator.js?v=54";
import { calculatorPlugin as projectorPlugin } from "./projector-calculator.js?v=6";
import { calculatorPlugin as signalFlowPlugin } from "./signal-flow.js?v=68";
import { calculatorPlugin as cablePlugin } from "./cable-calculator.js?v=16";
import { calculatorPlugin as laborPlugin } from "./labor-calculator.js";
import { calculatorPlugin as contentMapsPlugin } from "./content-maps.js?v=22";
import { calculatorPlugin as paperworkPlugin } from "./paperwork/composer.js?v=73";
import { groundplanPluginMeta } from "./groundplan-meta.js";

export { setCalculatorInstances, getCalculatorExport, getCalculatorInstance } from "./calculator-instances.js";

/** Groundplan init is loaded dynamically in app.js so it cannot block core startup. */
const groundplanPluginStub = { meta: groundplanPluginMeta, init: null };

export const CALCULATOR_PLUGINS = [
  ledPlugin,
  projectorPlugin,
  signalFlowPlugin,
  groundplanPluginStub,
  contentMapsPlugin,
  cablePlugin,
  laborPlugin,
  paperworkPlugin,
];

/** @returns {Record<string, { exportState?: () => object, importState?: (data: object) => void } | null>} */
export function initCalculatorInstances() {
  const instances = {};

  for (const plugin of CALCULATOR_PLUGINS) {
    const { stateKey, label } = plugin.meta;
    instances[stateKey] = null;
    if (typeof plugin.init !== "function") {
      continue;
    }
    try {
      instances[stateKey] = plugin.init();
    } catch (error) {
      console.error(`${label} failed to initialize:`, error);
    }
  }

  return instances;
}

/** @param {Record<string, { exportState?: () => object } | null>} instances */
export function ensureCalculatorsReady(instances) {
  const missing = CALCULATOR_PLUGINS.filter(
    (plugin) => plugin.meta.requiredForSave && !instances[plugin.meta.stateKey]?.exportState
  );

  if (missing.length) {
    throw new Error("Save and load are unavailable because a calculator failed to start.");
  }
}
