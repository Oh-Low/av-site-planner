/**
 * Tiny arithmetic expression evaluator for numeric text fields, so users can
 * type things like "4800 + 256", "4800*2", or "(3840-256)/2". Supports
 * + - * / with the usual precedence, parentheses, unary minus, and decimals.
 * No eval(), no identifiers — anything unexpected returns null.
 */

/**
 * @param {unknown} text
 * @returns {number|null} The evaluated value, or null if the input is not a
 *   complete valid expression.
 */
export function evaluateMathExpression(text) {
  const src = String(text ?? "").trim();
  if (!src) return null;
  let pos = 0;

  function skipSpaces() {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  }

  /** @returns {number|null} */
  function parseExpression() {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      skipSpaces();
      const op = src[pos];
      if (op !== "+" && op !== "-") return left;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
  }

  /** @returns {number|null} */
  function parseTerm() {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      skipSpaces();
      const op = src[pos];
      // Support "x" and "×" as multiplication since sizes are often written 1920x1080.
      if (op !== "*" && op !== "/" && op !== "x" && op !== "×") return left;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      left = op === "/" ? left / right : left * right;
    }
  }

  /** @returns {number|null} */
  function parseFactor() {
    skipSpaces();
    const ch = src[pos];
    if (ch === "+" || ch === "-") {
      pos++;
      const value = parseFactor();
      return value === null ? null : ch === "-" ? -value : value;
    }
    if (ch === "(") {
      pos++;
      const value = parseExpression();
      if (value === null) return null;
      skipSpaces();
      if (src[pos] !== ")") return null;
      pos++;
      return value;
    }
    const match = /^\d*\.?\d+/.exec(src.slice(pos));
    if (!match) return null;
    pos += match[0].length;
    return Number(match[0]);
  }

  const result = parseExpression();
  skipSpaces();
  if (result === null || pos !== src.length || !Number.isFinite(result)) return null;
  return result;
}
