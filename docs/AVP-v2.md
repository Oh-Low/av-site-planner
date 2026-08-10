# AV Site Plan format (`.AVP` v2)

Canonical contract for Phase 0 of the rebuild. Source of truth in code:
`js/site-state.js` + each plugin’s `meta.emptyState` / `meta.validateState`.

**Format version:** `2`  
**Import accepts:** `1` | `2` (v1 is migrated via `migrateSiteStateToV2`)  
**MIME / extension:** JSON body; preferred extension `.avp` (also `.json`; `.txt` recovered on download)

Persistence is **file export/import only** — no `localStorage` / IndexedDB.

---

## Envelope

```json
{
  "formatVersion": 2,
  "app": "av-site-planner",
  "exportedAt": "2026-07-23T00:00:00.000Z",
  "activeTab": "led-calculator",
  "places": [],
  "led": { },
  "projector": { },
  "signalFlow": { },
  "groundplan": { },
  "contentMaps": { },
  "cable": { },
  "labor": { },
  "paperwork": { }
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `formatVersion` | Yes | Must be `1` or `2` on import |
| `app` | Yes | Must be `"av-site-planner"` after migrate |
| `exportedAt` | No | ISO string; defaulted on migrate if missing |
| `activeTab` | No | Tab panel id at export; default `"led-calculator"` |
| `places` | No | Shared venues `{ id, name }[]` — lifted from legacy `signalFlow.places` |
| `led` | **Yes** | `requiredForSave`; must have `grids` array |
| `projector` | **Yes** | `requiredForSave`; must have ≥1 screen |
| `signalFlow` … `paperwork` | No | Filled from `emptyState()` when omitted on migrate |

Registry order (also save order): led → projector → signalFlow → groundplan → contentMaps → cable → labor → paperwork.

---

## Domain kernels (`js/domain/`)

| Module | Role |
|--------|------|
| `places.js` | Root venue identity — normalize / lift / strip |
| `labor.js` | Labor state + pay-tier math |
| `cable.js` | Manual cable state + derived route/place cards |
| `led.js` | LED wall section deep normalize |
| `projector.js` | Projector section deep normalize |
| `groundplan.js` | Floor-plan section empty/validate |
| `signal-flow.js` | Graph section empty/normalize (no nested places) |
| `content-maps.js` | Surfaces/rasters/test-pattern normalize |
| `paperwork.js` | Packet state normalize |
| `site-document.js` | Thin document store — `peek` / `subscribe` / `load` |
| `index.js` | Barrel re-exports |

Calculators re-export domain APIs for backward compatibility. Prefer importing from `js/domain/` in new code and tests.

`parseSiteDocument(text)` in `site-state.js` loads a parsed plan into a `SiteDocument`.  
App chrome syncs a singleton via `js/site-document-runtime.js` on import/export (`getSiteDocument()`).

## Shared root: `places`

**Domain module:** `js/domain/places.js`

Canonical venue list for Signal Flow assignment, Groundplan markers, Cable place cards, and Paperwork diagrams.

| Field | Type | Notes |
|-------|------|--------|
| (array item) `id` | string | Stable id |
| (array item) `name` | string | Display name; list sorted by name |

**Migrate:** If root `places` is absent, copy from legacy `signalFlow.places`. If root key exists (even `[]`), it wins. Nested `signalFlow.places` is stripped on parse/save.

**Runtime:** Signal Flow still holds places in memory for UI; `buildSiteState` writes them to root and strips the nested key. `app.js` injects root places into Signal Flow on import.

---

### `led` — required

**emptyState:** none (missing section fails validate)  
**validateState:** `normalizeLedState` in `js/domain/led.js` — requires `grids` array; coerces voltage/bitrate; backfills processors / `processorId`

| Field | Type | Notes |
|-------|------|--------|
| `grids` | `WallGrid[]` | May be `[]` |
| `activeGridId` | `string \| null` | |
| `voltage` | number | Runtime: `120` \| `208` (coerced on import UI path) |
| `bitrate` | number | Runtime: `8` \| `10` \| `12` |

**WallGrid (runtime / export):** `id`, `name`, `tile` (processorType, wiringType, pixelWidth/Height, totalPixels, maxPerPort, metricWidth/Height, weight, wattage, id?), `rows`, `cols`, `generated`, `generatedRows`, `generatedCols`, `dataLines[]`, `powerLines[]`, `processors[]`, `activeProcessorId`, `activeLineType`, `activeLineId`, `view?`

**LineSet:** `id`, `name`, `tiles` (flat grid indices), `startLabel`, `endLabel`, `startLabelDraft`, `endLabelDraft`, `processorId?`

---

### `projector` — required

**emptyState:** none  
**validateState:** `normalizeProjectorState` in `js/domain/projector.js` — requires ≥1 screen; normalizes screen fields + active ids

| Field | Type | Notes |
|-------|------|--------|
| `screens` | `ProjectionScreen[]` | **Length ≥ 1** required |
| `activeScreenId` | `string \| null` | |
| `activeSidebarTab` | `"screen" \| "projectors"` | |

**ProjectionScreen:** `id`, `name`, `unit` (`ft`\|`m`), `aspectId`, `width`, `height`, `projectors[]`, `projectorGroups[]`, `activeProjectorId`, `activeGroupId`, `view?`

---

### `signalFlow` — optional

**emptyState / validate:** `emptySignalFlowState` / `normalizeSignalFlowState` in `js/domain/signal-flow.js`.

| Field | Persisted? | Notes |
|-------|------------|--------|
| `nodes` | Yes | Device instances on canvas; optional `layout: { w, h, inColW, outColW, portTop, portRowH }` measured from the interactive chrome so Paperwork wires match |
| `connections` | Yes | Port-to-port wires (+ optional route waypoints) |
| `customGearTypes` | Yes | Local / overridden gear; `kind === "blank"` filtered out |
| `gearLibraryFolders` | Yes | |
| `colorByCableType` | Yes | Default `false` |
| `grid` | Yes | `{ snap, size }` — size clamped 4–400, default 20 |

`places` are **not** stored under `signalFlow` (see root `places` above).

---

### `groundplan` — optional

**emptyState / validate:** rebuilds known top-level keys (`js/domain/groundplan.js`).

| Field | Type | Notes |
|-------|------|--------|
| `imageDataUrl` | `string \| null` | PNG **data URL** (can make multi-MB files) |
| `imageWidth` / `imageHeight` | number | |
| `scale` | object | `pointA`, `pointB`, `unit` (`metric`\|`imperial`), `distanceMeters` |
| `placeMarkers` | array | `placeId`, `x`, `y`, `width?`, `height?`, `color?`, `shape?` |
| `cableRoutes` | array | `id`, `fromPlaceId`, `toPlaceId`, `points[{x,y,heightMeters?}]`, `color?`, `labelX?`, `labelY?` |
| `rulerLines` | array | `id`, `points[{x,y}]` |
| `showScaleInViewport` | boolean | Default `true` |

---

### `contentMaps` — optional

**emptyState / validate:** `emptyContentMapsState` / `normalizeContentMapsState` in `js/domain/content-maps.js`.

| Field | Type |
|-------|------|
| `surfaces` | `Surface[]` (`id`, `name`, `width`, `height`, `zones[]`, `source?`, `pattern?`) |
| `activeSurfaceId` | `string \| null` |
| `zoneLabels` | `{ name, resolution, anchor }` |
| `rasters` | `Raster[]` (+ `groups[]`) |
| `activeRasterId` | `string \| null` |
| `outputLabels` | `{ name, resolution, anchor }` |
| `testPattern` | `{ sourceType: "surface"\|"raster", sourceId }` |

Zones: `id`, `name`, `x`, `y`, `width`, `height`, `color`, `source?: { type: "led"\|"projector", id }`.

Legacy: if `testPattern` still carries a `type` field (old global pattern), it is seeded onto surfaces/rasters missing `pattern`.

---

### `cable` — optional

**emptyState:** `{ "routes": {}, "places": {} }`  
**validateState:** `normalizeCableState` — only manual cables.

| Field | Type | Notes |
|-------|------|--------|
| `routes` | `Record<routeId, ManualCable[]>` | Keys = groundplan route ids |
| `places` | Record<placeId, ManualCable[]> | Keys = root place ids |

**ManualCable:** `{ id, cableLabel, fromDevice, toDevice, amount }` (`amount` int 1–999; empty `cableLabel` dropped).

Auto-derived cables from signal-flow connections are **never** stored.

---

### `labor` — optional

**emptyState:**
```json
{
  "startTime": "",
  "endTime": "",
  "hourlyRate": 0,
  "events": { "after10": true, "after14": true, "night": true }
}
```

**validateState:** `normalizeLaborState`. Legacy `startLocal` / `endLocal` (datetime-local) accepted and converted to time-only; not re-emitted.

---

### `paperwork` — optional

**emptyState / validate:** `emptyPaperworkState` / `normalizePaperworkState` in `js/domain/paperwork.js`.

| Field | Notes |
|-------|--------|
| `identity` | Project title-block strings; `date` defaults to today on empty |
| `paper` | `size` ∈ paper-sizes ids (default `arch-c`); `orientation` landscape\|portrait |
| `titleBlockDefault` | boolean |
| `titleBlockLogo` | `data:image/…` string, max ~2.5M chars, else `null` |
| `sheets` | Sheet instances (`typeId`, `sourceKey`, `elements`, `manual`, …) |
| `sharedElements` | Elements shown across sheets |
| `decorations` | Draw tools (text, shapes, polylines, …) |
| `drawStyle` | fill, stroke, strokeWidth, fontSize |
| `activeSheetId` | Must match a sheet or first/null |
| `selectedElementId` | UI selection; exported + normalized |
| `selectedDecorationId` | Exported |

| `rightPanelCollapsed`, `collapsedFolders` | UI chrome |
| `libraryFolders`, `libraryPlacements`, `sheetFolders` | Library tree |
| `grid` | `{ snap, visible, sizeIn }` inches |

Sheet `typeId` values in use: `cover`, `cable-runs`, `led-wall-cable`, `led-wall-power`, `signal-flow`, `surface-map`, `raster-map`, `custom-plate`.

---

## Decisions locked (Phase 0–1)

| Topic | Decision |
|-------|----------|
| Asset packaging | **Keep data URLs in v2** for groundplan images and paperwork logos. Defer `.avpz` / sidecar assets to a future formatVersion 3 (Phase 2+). |
| Contract bugfixes | signalFlow `colorByCableType` + `grid` now round-trip; contentMaps has `validateState`; paperwork exports `selectedElementId`. |
| Places ownership | Root `.AVP` `places` (Phase 1). Legacy `signalFlow.places` lifted on import. Domain module: `js/domain/places.js`. |
| Domain layout | Folders under `js/domain/` (no separate package yet). |
| Tooling | Vite + TypeScript (`allowJs`); no `?v=` cache busts. |
| Phase 1 complete | All section kernels + SiteDocument sync on import/export. LED/projector deep normalize in domain. |

## Remaining notes

1. **groundplan** / **paperwork** logos still embed binary as data URLs → large `.AVP` files until v3.
2. LED / projector use deep normalize in `js/domain/led.js` and `js/domain/projector.js` (projectors nested objects still largely pass through).

---

## Migration notes (v1 → v2)

`migrateSiteStateToV2` copies present section keys and fills missing **optional** sections via `emptyState()`. It does **not** invent `led` / `projector` — those must already be present or validate fails.

`fixtures/default.avp` includes root `places` plus all section keys (led through paperwork) with empty/default shapes.
