/**
 * Query the shared calculator shell inside a tab panel.
 * Supports new `.calc-*` markup and legacy layout class names during migration.
 *
 * @param {string} panelId
 * @param {{
 *   statusId?: string,
 *   hintId?: string,
 *   resetViewId?: string,
 *   viewportId?: string,
 *   worldId?: string,
 *   paletteId?: string,
 * }} [slots]
 */
export function queryCalcShell(panelId, slots = {}) {
  const root = document.getElementById(panelId);
  if (!root) return null;

  /** @param {string | undefined} id */
  const byId = (id) => (id ? document.getElementById(id) : null);

  const shell = {
    root,
    layout: root.querySelector(".calc-layout, .led-layout, .signal-flow-layout"),
    sidebar: root.querySelector(".calc-sidebar, .led-sidebar, .signal-flow-sidebar"),
    canvasWrap: root.querySelector(".calc-canvas-wrap, .led-canvas-wrap, .signal-flow-canvas-wrap"),
    status: byId(slots.statusId),
    hint: byId(slots.hintId),
    resetView: byId(slots.resetViewId),
    viewport: byId(slots.viewportId),
    world: byId(slots.worldId),
    palette: byId(slots.paletteId),
    /** @param {string} message */
    setStatus(message) {
      if (shell.status) shell.status.textContent = message;
    },
  };

  return shell;
}

/**
 * Wire sidebar tab buttons to panels inside a calculator sidebar.
 * @param {HTMLElement} sidebar
 * @param {{
 *   panelIdForTab: (tabId: string) => string,
 *   onChange?: (tabId: string) => void,
 *   tabSelector?: string,
 *   panelSelector?: string,
 * }} options
 */
export function bindSidebarTabs(sidebar, options) {
  const tabSelector = options.tabSelector ?? ".sidebar-tab";
  const panelSelector = options.panelSelector ?? ".sidebar-tab-panel";
  const tabs = sidebar.querySelectorAll(tabSelector);
  const panels = sidebar.querySelectorAll(panelSelector);

  /** @param {string} tabId */
  function setActive(tabId) {
    tabs.forEach((tab) => {
      const active = tab.dataset.sidebarTab === tabId;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    panels.forEach((panel) => {
      const active = panel.id === options.panelIdForTab(tabId);
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    options.onChange?.(tabId);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActive(tab.dataset.sidebarTab ?? "");
    });
  });

  return { setActive };
}
