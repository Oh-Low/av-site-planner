/** @type {Record<string, { exportState?: () => object, importState?: (data: object) => void } | null> | null} */
let calculatorInstances = null;

/** @param {Record<string, { exportState?: () => object, importState?: (data: object) => void } | null>} instances */
export function setCalculatorInstances(instances) {
  calculatorInstances = instances;
}

/** @param {string} stateKey */
export function getCalculatorExport(stateKey) {
  return calculatorInstances?.[stateKey]?.exportState?.() ?? null;
}

/** @param {string} stateKey */
export function getCalculatorInstance(stateKey) {
  return calculatorInstances?.[stateKey] ?? null;
}
