/**
 * Extensible drawing-tool registry for the paperwork composer.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   title?: string,
 *   cursor?: string,
 *   oneShot?: boolean,
 * }} DrawTool
 */

/** @type {Map<string, DrawTool>} */
const TOOLS = new Map();

/** @param {DrawTool} tool */
export function registerDrawTool(tool) {
  TOOLS.set(tool.id, tool);
}

/** @param {string} id */
export function getDrawTool(id) {
  return TOOLS.get(id) ?? null;
}

export function listDrawTools() {
  return [...TOOLS.values()];
}

registerDrawTool({ id: "select", label: "Select", title: "Select", cursor: "default", oneShot: false });
registerDrawTool({ id: "text", label: "Text", title: "Text box", cursor: "text", oneShot: true });
registerDrawTool({
  id: "heading",
  label: "Heading",
  title: "Heading",
  cursor: "text",
  oneShot: true,
});
registerDrawTool({ id: "line", label: "Line", title: "Line", cursor: "crosshair", oneShot: true });
registerDrawTool({
  id: "polyline",
  label: "Polyline",
  title: "Polyline",
  cursor: "crosshair",
  oneShot: true,
});
registerDrawTool({ id: "arrow", label: "Arrow", title: "Arrow", cursor: "crosshair", oneShot: true });
registerDrawTool({
  id: "rect",
  label: "Rect",
  title: "Rectangle",
  cursor: "crosshair",
  oneShot: true,
});
registerDrawTool({
  id: "ellipse",
  label: "Ellipse",
  title: "Ellipse",
  cursor: "crosshair",
  oneShot: true,
});
