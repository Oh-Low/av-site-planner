# AV Site Planner

Planning tools for AV professionals. Build LED walls, projectors, signal paths, cable lists, groundplans, rigging plans, and printable site paperwork — all in the browser.

**Live demo:** Enable [GitHub Pages](https://docs.github.com/en/pages) on this repository (Settings → Pages → Deploy from branch → `main` / root).

## Tools

| Tab | Status |
|-----|--------|
| **LED Calculator** | Full — tile presets, wall grid, power & data line drawing, resource meters |
| **Projector Calculator** | Full — screen sizing, throw/lens math, multi-screen & multi-projector (blend, stack, tile) |
| **Signal Flow Chart** | Full — drag gear onto canvas, port-to-port wiring, pan/zoom; premade catalogs in `data/gear/` |
| Cable Calculator | Placeholder |
| Groundplan | Placeholder |
| Rigging Calculator | Placeholder |
| Paperwork Composer | Placeholder |

## LED Calculator

Plan how to build and wire a grid of LED tiles into a wall:

- **Prebuilt or custom tiles** — processor, wiring direction, pixels, dimensions, weight, wattage, max per port
- **Wall grid** — set rows/columns; each tile is outlined on a visual wall
- **Data lines** — limited by `max per port ÷ total pixels per tile`
- **Power lines** — 120V or 208V; `(wattage × tiles) ÷ voltage` must stay ≤ 20A per line
- **One connection per tile** — each tile can join only one data line and one power line
- **Line tools** — new, edit, remove, label start/end (shown in circles on the wall)
- **Resource bars** — usage per line for data (tiles) and power (amps)

Use **Print / Export** or your browser print dialog for site paperwork.

## Projector Calculator

Plan projection screens and projector placement:

- **Screen sizing** — linked width, height, and diagonal with aspect ratio presets
- **Multiple projection screens** — add, remove, rename (double-click), switch between screens
- **Multiple projectors per screen** — single, edge blend, stacked, or tiled roles
- **Preset or custom projectors** — starter inventory in `projector-data.js` (replace when your lens list is ready)
- **Throw & lens** — linked throw distance and image width, lens zoom slider, in-range validation
- **Canvas** — front-view diagram with coverage zones, blend overlap, and throw lines

## Signal Flow Chart

Plan device wiring on a freeform canvas:

- **Premade gear library** — browse brands/folders and drag devices onto the canvas
- **Custom gear** — build templates port by port: ordered inputs/outputs with labels, connector types, and divider lines; organize into folders
- **Gear editing** — edit any gear (pencil icon in the library); edited built-in gear becomes a local override that shadows the catalog version
- **Library import/export** — export a folder (or all custom gear) as a catalog JSON file; import a catalog JSON into the selected folder
- **Wiring** — port-to-port orthogonal routes with draggable segments
- **Places** — assign devices to venues for paperwork

### Adding built-in gear (JSON catalogs)

Gear lives under [`data/gear/`](data/gear/). Multiple JSON files are merged in order from [`data/gear/index.json`](data/gear/index.json), so presets and company inventories can coexist.

**To add a company inventory:**

1. Create e.g. `data/gear/acme.json` with your gear (folders are optional — omitted by default).
2. Register it in `CATALOG_MODULES` inside [`js/signal-flow-gear-presets.js`](js/signal-flow-gear-presets.js).
3. Add `"acme.json"` to the `catalogs` array in `data/gear/index.json`.
4. Hard-refresh the page.

Overlay files (everything except `presets.json`) automatically appear under **Library** in a folder named after the file (e.g. `inventory.json` → `inventory`). Gear in that file is placed in that folder; you do not need a `folderId`.

```json
{
  "gear": [
    {
      "id": "acme-switcher-1",
      "label": "Acme Switcher",
      "category": "Video",
      "inputs": ["HDMI In 1", "HDMI In 2"],
      "inputTypes": ["HDMI", "HDMI"],
      "outputs": ["PGM HDMI", "PVW HDMI"],
      "outputTypes": ["HDMI", "HDMI"]
    }
  ]
}
```

Optional `inputTypes` / `outputTypes` arrays run parallel to `inputs` / `outputs`. When omitted, types are inferred from labels that contain connector names (`HDMI`, `SDI`, `DP`, `USB-C`, `XLR`, `ETH`).
- Later catalogs override earlier ones when `id`s match (folders or gear).
- `presets.json` keeps the built-in Library / Brands folder tree; use `folderId` there as before.
- `defaultName` is optional (defaults to `label`).
- Ports use parallel `inputs` / `outputs` arrays (uneven lengths pad with `"—"`), or the canonical `ports` row form below.
- See `data/gear/example-company.json` / `inventory.json` for overlay samples.

Gear can alternatively declare a `ports` array of rows, which also supports divider lines (a thicker separator drawn above that row's cell). This is the format the in-app **Export gear library** button writes, so exported files can be dropped into `data/gear/` directly:

```json
{
  "gear": [
    {
      "id": "acme-switcher-2",
      "label": "Acme Switcher II",
      "category": "Video",
      "note": "Optional text shown on the device above its ports",
      "ports": [
        { "input": "HDMI In 1", "output": "PGM Out", "inputType": "HDMI", "outputType": "HDMI" },
        { "input": "HDMI In 2", "output": "AUX Out", "inputType": "HDMI", "outputType": "HDMI" },
        { "input": "XLR In 1", "output": "—", "inputType": "XLR", "inputDivider": true }
      ]
    }
  ]
}
```

## Site plans (`.AVP` files)

Export saves a JSON site plan with extension `.AVP` (format version **2**). Import accepts version **1** or **2** — older files are migrated automatically on load.

```json
{
  "formatVersion": 2,
  "app": "av-site-planner",
  "exportedAt": "2026-06-30T12:00:00.000Z",
  "activeTab": "led-calculator",
  "led": { "grids": [], "activeGridId": null, "voltage": 120, "bitrate": 8 },
  "projector": { "screens": [], "activeScreenId": null, "activeSidebarTab": "screen" },
  "signalFlow": { "nodes": [], "connections": [] }
}
```

| Field | Required on import | Notes |
|-------|-------------------|--------|
| `led` | Yes | Must include a `grids` array |
| `projector` | Yes | Must include at least one screen in `screens` |
| `signalFlow` | No | Defaults to empty nodes/connections if omitted |
| `activeTab` | No | Restores the tab that was open at export time |

Validation is driven by each calculator's `calculatorPlugin.meta.validateState` hook in `js/calculator-registry.js`.

## Local use

No build step required. Open `index.html` in a browser, or serve locally:

```bash
cd av-site-planner
python3 -m http.server 8080
# visit http://localhost:8080
```

ES modules require a local server (not `file://`).

Run unit tests with Node:

```bash
node --test tests/
```

## Project layout

| Path | Role |
|------|------|
| `js/app.js` | App shell — tabs, export/import, calculator bootstrap |
| `js/calculator-registry.js` | Registers calculator plugins and initializes them |
| `js/site-state.js` | `.AVP` export/import bundle (format version 2) |
| `js/projector-math.js` | Pure throw/lens math (unit-tested) |
| `data/gear/` | Signal-flow catalog JSON files (`index.json`, `presets.json`, company overlays) |
| `js/shared/` | Shared helpers — `dom`, `clone`, `id`, `calc-shell`, `inline-editor`, `pan-zoom`, `ortho-path` |
| `css/calc-shell.css` | Shared calculator layout (`.calc-layout`, sidebar, viewport, toolbar) |
| `css/main.css` | Assembled styles (`@import` of partials) |

All three live calculators use the shared shell. Signal Flow uses `createTransformPanZoom`; LED and Projector use `createSvgViewBoxPanZoom` and `createListNameEditor`.

## Adding a calculator

### 1. Tab and shell markup

Add a tab button in `index.html` and a panel using the shared shell:

```html
<section id="cable-calculator" class="tab-panel" role="tabpanel" hidden>
  <div class="calc-layout">
    <aside class="calc-sidebar"><!-- sidebar controls --></aside>
    <div class="calc-canvas-wrap">
      <div class="canvas-toolbar">
        <span id="cable-status"></span>
        <div class="canvas-toolbar-actions">
          <span class="view-hint"></span>
          <button type="button" class="btn btn-secondary" id="cable-reset-view">Reset view</button>
        </div>
      </div>
      <div class="calc-viewport" id="cable-viewport">
        <div class="calc-world" id="cable-world"><!-- canvas content --></div>
      </div>
    </div>
  </div>
</section>
```

Use `calc-viewport calc-viewport--svg` instead of `calc-viewport` when pan/zoom is SVG viewBox-based (LED / Projector pattern).

### 2. Calculator module

Create `js/cable-calculator.js`:

- Call `queryCalcShell("cable-calculator", { statusId, viewportId, ... })`
- Wire pan/zoom with `createTransformPanZoom` or `createSvgViewBoxPanZoom`
- Return `{ exportState, importState }` from `initCableCalculator()`

### 3. Plugin registration

Export a `calculatorPlugin` and append it in `js/calculator-registry.js`:

```javascript
export const calculatorPlugin = {
  meta: {
    id: "cable-calculator",
    tabPanelId: "cable-calculator",
    stateKey: "cable",
    label: "Cable Calculator",
    requiredForSave: false,
    emptyState: () => ({ runs: [] }),
    validateState(data) {
      if (data == null) return { runs: [] };
      if (!Array.isArray(data.runs)) {
        throw new Error("The file is missing valid cable calculator data.");
      }
      return data;
    },
  },
  init: initCableCalculator,
};
```

| `meta` field | Purpose |
|--------------|---------|
| `id` | Stable calculator identifier |
| `tabPanelId` | Matches the tab panel `id` in `index.html` |
| `stateKey` | Property name in the `.AVP` JSON object |
| `requiredForSave` | If `true`, export/import fails when the calculator does not start |
| `emptyState()` | Default section written on export when optional |
| `validateState(data)` | Called on import; throw to reject, return normalized data |

### 4. Styles and wiring

1. Add `css/cable-calculator.css` and `@import` it from `css/main.css`.
2. No changes to `js/app.js` are needed — the registry bootstraps all plugins.
3. Bump `SITE_STATE_VERSION` in `js/site-state.js` when you add a **required** section or change existing saved shapes.

## GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Save — the site will be at `https://<user>.github.io/<repo>/`

## License

MIT
