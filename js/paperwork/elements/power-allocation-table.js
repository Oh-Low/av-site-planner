import {
  buildPowerAllocationRows,
  formatPhaseAmpSummary,
  formatPowerAllocationNumber,
  powerAllocationHeaderItems,
  powerAllocationRowsForPaperwork,
  sumPowerAllocationItems,
} from "../../domain/power-allocation.js";
import { resolveGearType } from "../../signal-flow-data.js";
import { escapeXml } from "../../shared/dom.js";
import { normalizeFontSizePt, resolveElementFontSizePt } from "../font-scale.js";
import { registerElementRenderer } from "./registry.js";

/**
 * Compact power-allocation table for paperwork — one CSS-grid table of loads
 * fed by Signal Flow power wires (gear-list style chrome).
 */
registerElementRenderer({
  type: "powerAllocationTable",
  label: "Power allocation table",
  render(host, ctx) {
    const { element, siteExports } = ctx;
    const fontSize = resolveElementFontSizePt(element);
    const sf = /** @type {{
      nodes?: object[],
      connections?: object[],
      customGearTypes?: object[],
    } | null} */ (siteExports?.signalFlow ?? null);
    const led = /** @type {{ grids?: object[], voltage?: number } | null} */ (
      siteExports?.led ?? null
    );
    const customTypes = Array.isArray(sf?.customGearTypes) ? sf.customGearTypes : [];
    const stored = siteExports?.powerAllocation;
    const roomId = typeof ctx.sheet?.roomId === "string" ? ctx.sheet.roomId : "";
    const rows =
      stored && typeof stored === "object" && Array.isArray(stored.rows)
        ? powerAllocationRowsForPaperwork(stored, roomId || null)
        : buildPowerAllocationRows({
            signalFlow: sf,
            led,
            resolveGear(node) {
              if (node?.gearOverride && typeof node.gearOverride === "object") {
                return /** @type {object} */ (node.gearOverride);
              }
              const typeId = typeof node?.typeId === "string" ? node.typeId : "";
              return resolveGearType(typeId, customTypes);
            },
          });

    host.classList.add("pw-el-power-alloc");
    host.style.setProperty("--pw-font-size", `${normalizeFontSizePt(fontSize)}pt`);

    if (!rows.length) {
      host.innerHTML =
        '<div class="pw-el-power-alloc-empty">No powered devices yet — connect gear in Signal Flow Power mode, then regenerate this sheet.</div>';
      return;
    }

    const body = [
      `<div class="pw-pa-row pw-pa-row--head" role="row">
        <span class="pw-pa-device" role="columnheader">Device</span>
        <span class="pw-pa-distro" role="columnheader">Distro</span>
        <span class="pw-pa-phase" role="columnheader">Phase</span>
        <span class="pw-pa-volt" role="columnheader">Voltage</span>
        <span class="pw-pa-watt" role="columnheader">Wattage</span>
        <span class="pw-pa-amp" role="columnheader">Amperage</span>
      </div>`,
      ...rows.map((row, index) => {
        if (row.kind === "header") {
          const totals = sumPowerAllocationItems(powerAllocationHeaderItems(rows, index));
          const level = row.level === "subsection" ? "subsection" : "section";
          const legs = formatPhaseAmpSummary(totals.phaseAmps);
          return `<div class="pw-pa-row pw-pa-row--${level}" role="row">
            <span class="pw-pa-device">${escapeXml(row.device)}</span>
            <span class="pw-pa-distro">${escapeXml(legs)}</span>
            <span class="pw-pa-phase"></span>
            <span class="pw-pa-volt"></span>
            <span class="pw-pa-watt">${escapeXml(formatPowerAllocationNumber(totals.wattage, 0))}</span>
            <span class="pw-pa-amp">${escapeXml(formatPowerAllocationNumber(totals.amperage, 2))}</span>
          </div>`;
        }
        const volts = row.voltage != null ? String(row.voltage) : "";
        const watts = formatPowerAllocationNumber(row.wattage, 0);
        const amps = formatPowerAllocationNumber(row.amperage, 2);
        return `<div class="pw-pa-row" role="row">
          <span class="pw-pa-device">${escapeXml(row.device)}</span>
          <span class="pw-pa-distro">${escapeXml(row.distro)}</span>
          <span class="pw-pa-phase">${escapeXml(row.phase)}</span>
          <span class="pw-pa-volt">${escapeXml(volts)}</span>
          <span class="pw-pa-watt">${escapeXml(watts)}</span>
          <span class="pw-pa-amp">${escapeXml(amps)}</span>
        </div>`;
      }),
    ].join("");

    host.innerHTML = `
      <section class="pw-el-power-alloc-pane">
        <div class="pw-el-power-alloc-title">Power Allocation</div>
        <div class="pw-el-power-alloc-body" role="table" aria-label="Power allocation">
          ${body}
        </div>
      </section>`;
  },
});
