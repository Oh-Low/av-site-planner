/**
 * Sliding raised thumb for shared local-nav / tab-bar tracks.
 * One thumb per track; moves to the active item with CSS transitions.
 */

const NAV_SELECTOR = ".local-nav, .tab-bar, .sidebar-tabs";

/** Direct children that participate in the track. */
const ITEM_SELECTOR =
  ":scope > .local-nav__item, :scope > .sidebar-tab, :scope > .app-tab, :scope > .tab, :scope > .sf-gear-mode";

/** @type {WeakMap<HTMLElement, { sync: (animate?: boolean) => void }>} */
const controllers = new WeakMap();

/**
 * Run after the browser has committed layout (needed when a panel just left display:none).
 * @param {() => void} fn
 */
function afterLayout(fn) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

/**
 * @param {HTMLElement} nav
 * @returns {HTMLElement[]}
 */
function getNavItems(nav) {
  return /** @type {HTMLElement[]} */ ([...nav.querySelectorAll(ITEM_SELECTOR)]);
}

/**
 * @param {HTMLElement} nav
 * @returns {HTMLElement | null}
 */
function getActiveItem(nav) {
  const items = getNavItems(nav);
  return items.find((el) => el.classList.contains("active")) ?? items[0] ?? null;
}

/**
 * @param {HTMLElement} nav
 * @param {boolean} [animate]
 */
function positionThumb(nav, animate = true) {
  const thumb = /** @type {HTMLElement | null} */ (nav.querySelector(":scope > .local-nav__thumb"));
  if (!thumb) return;

  const active = getActiveItem(nav);
  if (!active) {
    thumb.style.opacity = "0";
    return;
  }

  const navRect = nav.getBoundingClientRect();
  const itemRect = active.getBoundingClientRect();
  if (itemRect.width < 1 || itemRect.height < 1 || navRect.width < 1 || navRect.height < 1) {
    thumb.style.opacity = "0";
    return;
  }

  const left = itemRect.left - navRect.left + nav.scrollLeft;
  const top = itemRect.top - navRect.top + nav.scrollTop;

  if (!animate) {
    thumb.style.transition = "none";
  } else if (thumb.style.transition === "none") {
    thumb.style.transition = "";
    void thumb.offsetWidth;
  }

  thumb.style.opacity = "1";
  thumb.style.width = `${itemRect.width}px`;
  thumb.style.height = `${itemRect.height}px`;
  thumb.style.transform = `translate(${left}px, ${top}px)`;

  if (!animate) {
    void thumb.offsetWidth;
    thumb.style.transition = "";
  }
}

/**
 * Mount sliding thumb behavior on a single track.
 * @param {HTMLElement} nav
 */
export function mountLocalNav(nav) {
  const existing = controllers.get(nav);
  if (existing) {
    existing.sync(false);
    return existing;
  }

  nav.classList.add("is-sliding-nav");

  let thumb = /** @type {HTMLElement | null} */ (nav.querySelector(":scope > .local-nav__thumb"));
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = "local-nav__thumb";
    thumb.setAttribute("aria-hidden", "true");
    nav.prepend(thumb);
  }

  /** @type {number} */
  let raf = 0;
  /** @param {boolean} [animate] */
  function sync(animate = true) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      positionThumb(nav, animate);
    });
  }

  const observer = new MutationObserver(() => sync(true));
  for (const item of getNavItems(nav)) {
    observer.observe(item, { attributes: true, attributeFilter: ["class", "aria-selected"] });
  }

  nav.addEventListener(
    "scroll",
    () => {
      sync(false);
    },
    { passive: true }
  );

  // Panels start display:none — remeasure when the track gets a real size.
  if (typeof ResizeObserver !== "undefined") {
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const box = entry?.contentRect;
      const w = box?.width ?? nav.getBoundingClientRect().width;
      const h = box?.height ?? nav.getBoundingClientRect().height;
      if (w < 1 || h < 1) {
        lastW = 0;
        lastH = 0;
        return;
      }
      const appeared = lastW < 1 || lastH < 1;
      const changed = Math.abs(w - lastW) > 0.5 || Math.abs(h - lastH) > 0.5;
      lastW = w;
      lastH = h;
      if (appeared || changed) sync(false);
    });
    ro.observe(nav);
  }

  const controller = { sync };
  controllers.set(nav, controller);

  sync(false);
  return controller;
}

/**
 * Reposition thumbs (e.g. after layout or programmatic selection).
 * @param {ParentNode | null} [root]
 * @param {boolean} [animate]
 */
export function syncLocalNavs(root = document, animate = false) {
  const scope = root ?? document;
  /** @type {HTMLElement[]} */
  const navs = [];
  if (scope instanceof Element && scope.matches(NAV_SELECTOR)) {
    navs.push(/** @type {HTMLElement} */ (scope));
  }
  scope.querySelectorAll(NAV_SELECTOR).forEach((nav) => {
    if (nav instanceof HTMLElement) navs.push(nav);
  });
  for (const nav of navs) {
    const controller = controllers.get(nav) ?? mountLocalNav(nav);
    controller.sync(animate);
  }
}

/** Enhance every local-nav / tab-bar currently in the document. */
export function initLocalNavs() {
  document.querySelectorAll(NAV_SELECTOR).forEach((nav) => {
    if (nav instanceof HTMLElement) mountLocalNav(nav);
  });

  window.addEventListener(
    "resize",
    () => {
      syncLocalNavs(document, false);
    },
    { passive: true }
  );

  document.fonts?.ready?.then(() => syncLocalNavs(document, false)).catch(() => {});

  const themeObserver = new MutationObserver(() => syncLocalNavs(document, false));
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  document.addEventListener("tab-shown", (event) => {
    const panel = event.target;
    if (!(panel instanceof HTMLElement)) return;
    afterLayout(() => syncLocalNavs(panel, false));
  });
}
