import {
  buildSignalFlowSvg,
  normalizeSignalFlowCrop,
} from "../signal-flow-svg.js?v=9";
import { resolveElementFontSizePt } from "../font-scale.js?v=4";
import { registerElementRenderer } from "./registry.js?v=3";

/**
 * @param {import("../state.js").PageElement} element
 * @param {Record<string, unknown> | null} signalFlow
 */
function resolveColorByCableType(element, signalFlow) {
  if (typeof element.content?.colorByCableType === "boolean") {
    return element.content.colorByCableType;
  }
  return signalFlow?.colorByCableType === true;
}

registerElementRenderer({
  type: "signalFlowDiagram",
  label: "Signal flow diagram",
  render(host, ctx) {
    const { element, siteExports, editable, selected } = ctx;
    const signalFlow = /** @type {Record<string, unknown> | null} */ (
      siteExports?.signalFlow ?? null
    );

    host.classList.add("pw-el-signal-flow");
    const nodes = Array.isArray(signalFlow?.nodes) ? signalFlow.nodes : [];
    if (!nodes.length) {
      host.innerHTML =
        '<div class="pw-el-signal-flow-empty">Add devices in Signal Flow to show a diagram.</div>';
      return;
    }

    const showCropEditor = Boolean(editable && selected);
    const colorByCableType = resolveColorByCableType(element, signalFlow);
    const fontSizePt = resolveElementFontSizePt(element);
    const frame = {
      frameWIn: Number(element.w) || 16,
      frameHIn: Number(element.h) || 9,
    };
    const sized = buildSignalFlowSvg(signalFlow, {
      showCropEditor: false,
      colorByCableType,
      fontSizePt,
      ...frame,
    });
    if (!sized) {
      host.innerHTML =
        '<div class="pw-el-signal-flow-empty">Signal flow diagram could not be built.</div>';
      return;
    }
    const crop = normalizeSignalFlowCrop(
      element.content?.crop,
      sized.contentWidth,
      sized.contentHeight
    );
    const built =
      crop || showCropEditor
        ? buildSignalFlowSvg(signalFlow, {
            crop,
            showCropEditor,
            colorByCableType,
            fontSizePt,
            ...frame,
          })
        : sized;

    if (!built) {
      host.innerHTML =
        '<div class="pw-el-signal-flow-empty">Signal flow diagram could not be built.</div>';
      return;
    }

    host.classList.toggle("is-cropping", showCropEditor);
    host.innerHTML = `
      <div class="pw-el-signal-flow-head">
        <span>Signal flow${built.cropped ? " · Cropped" : ""}${
          showCropEditor ? " · Drag handles to crop" : ""
        }</span>
        <span class="pw-el-signal-flow-meta">${built.nodeCount} device${
          built.nodeCount === 1 ? "" : "s"
        } · ${built.connectionCount} connection${
          built.connectionCount === 1 ? "" : "s"
        }</span>
      </div>
      <div class="pw-el-signal-flow-canvas">${built.svg}</div>`;
  },
});
