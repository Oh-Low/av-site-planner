import { syncLocalNavs } from "./local-nav.js";

/** @param {PointerEvent | MouseEvent} e */
export function isPanPointerDown(e) {
  return e.button === 2;
}

/** @param {unknown} s */
export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wire main app tab buttons to their panels.
 * @param {string} [tabSelector]
 * @param {string} [panelSelector]
 */
export function bindTabBar(tabSelector = ".tab", panelSelector = ".tab-panel") {
  const tabs = document.querySelectorAll(tabSelector);
  const panels = document.querySelectorAll(panelSelector);

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
      });

      /** @type {HTMLElement | null} */
      let shownPanel = null;

      panels.forEach((panel) => {
        const active = panel.id === target;
        const wasHidden = panel.hidden;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
        // Let calculators re-render layout-dependent UI (e.g. wire paths)
        // that cannot be measured while the panel is display:none.
        if (active && wasHidden) {
          shownPanel = panel instanceof HTMLElement ? panel : null;
          panel.dispatchEvent(new CustomEvent("tab-shown"));
        }
      });

      const nav = tab.closest(".local-nav, .tab-bar");
      if (nav instanceof HTMLElement) syncLocalNavs(nav, true);
      // Sidebar local-navs inside the newly shown calculator were 0×0 while hidden.
      if (shownPanel) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => syncLocalNavs(shownPanel, false));
        });
      }
    });
  });
}
