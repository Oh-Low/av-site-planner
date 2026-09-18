/** @param {unknown} value */
export function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through for values structuredClone rejects.
    }
  }
  return JSON.parse(JSON.stringify(value));
}
