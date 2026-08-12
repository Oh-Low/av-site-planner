/** @typedef {"graphite" | "ember" | "sea" | "chalk"} ThemeId */

export const THEME_STORAGE_KEY = "av-site-planner.theme";

/** @type {ReadonlyArray<{ id: ThemeId, label: string }>} */
export const THEMES = Object.freeze([
  { id: "graphite", label: "Graphite" },
  { id: "ember", label: "Ember" },
  { id: "sea", label: "Sea" },
  { id: "chalk", label: "Chalk" },
]);

const THEME_IDS = new Set(THEMES.map((t) => t.id));

/**
 * @param {unknown} value
 * @returns {ThemeId}
 */
export function normalizeThemeId(value) {
  if (typeof value === "string" && THEME_IDS.has(/** @type {ThemeId} */ (value))) {
    return /** @type {ThemeId} */ (value);
  }
  return "graphite";
}

/** @returns {ThemeId} */
export function getStoredTheme() {
  try {
    return normalizeThemeId(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "graphite";
  }
}

/**
 * @param {ThemeId} themeId
 * @param {{ persist?: boolean }} [options]
 */
export function applyTheme(themeId, options = {}) {
  const id = normalizeThemeId(themeId);
  const root = document.documentElement;
  root.dataset.theme = id;

  if (options.persist !== false) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* ignore quota / private mode */
    }
  }

  const select = document.getElementById("theme-select");
  if (select instanceof HTMLSelectElement && select.value !== id) {
    select.value = id;
  }

  return id;
}

/** Apply stored theme and wire the chrome control. */
export function initThemeControls() {
  const current = applyTheme(getStoredTheme(), { persist: false });
  const select = document.getElementById("theme-select");
  if (!(select instanceof HTMLSelectElement)) return current;

  select.value = current;
  select.addEventListener("change", () => {
    applyTheme(normalizeThemeId(select.value));
  });

  return current;
}
