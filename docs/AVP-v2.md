# AV Site Plan format (`.AVP`)

Canonical contract. Source of truth in code: `js/site-state.js`, `js/domain/show-document.js`, and each plugin’s `meta.emptyState` / `meta.validateState`.

**Current format version:** `3` (multi-show document)  
**Import accepts:** `1` | `2` | `3`  
- v1/v2 single-room plans migrate into one Show + one Room  
- v3 is the Shows / Rooms / Templates envelope  

**MIME / extension:** JSON body; preferred extension `.avp`

**Persistence:**
- **Autosave** of the full v3 document to **IndexedDB** (browser return)
- **Export / Import** for manual multi-show `.AVP` files (Export prompts: entire profile vs current show only)
- Theme preference still uses `localStorage` (separate)

---

## v3 envelope (Shows / Rooms / Templates)

```json
{
  "formatVersion": 3,
  "app": "av-site-planner",
  "exportedAt": "2026-09-17T00:00:00.000Z",
  "activeShowId": "show-1",
  "activeRoomId": "room-1",
  "activeTab": "shows",
  "shows": [
    {
      "id": "show-1",
      "name": "Tour 2026",
      "rooms": [
        {
          "id": "room-1",
          "name": "Main Ballroom",
          "plan": { "places": [], "led": {}, "projector": {}, "signalFlow": {} }
        }
      ]
    }
  ],
  "templates": [
    { "id": "tpl-1", "name": "Standard LED room", "plan": { } }
  ]
}
```

| Field | Notes |
|-------|--------|
| `shows[]` | Each show owns nested `rooms[]` |
| `rooms[].plan` | Full calculator snapshot (legacy v2 section payload) |
| `templates[]` | Global room templates; **copied** into a show when added |
| `activeShowId` / `activeRoomId` | Selection restored on load |

**Shows tab:** first tool tab — manage Shows, Rooms (for the selected show), and Room Templates (add / remove / duplicate / rename; save room as template; add template to show).

**Editing:** Selecting a room loads its `plan` into the calculators. Mutations (including undo `recordBefore`) flush the live calculators back into the active room and debounce an IndexedDB write. Switching rooms clears the undo stack.

---

## Room plan (v2 section payload)

Each room’s `plan` matches the former single-file site plan body (without the multi-show envelope):

```json
{
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
| `places` | No | Venues for this room — lifted from legacy `signalFlow.places` |
| `led` | **Yes** | `requiredForSave`; must have `grids` array |
| `projector` | **Yes** | `requiredForSave`; must have ≥1 screen |
| `signalFlow` … `paperwork` | No | Filled from `emptyState()` when omitted on migrate |

Registry order: led → projector → signalFlow → groundplan → contentMaps → cable → labor → paperwork.

Legacy single-file v2 documents also carried `formatVersion`, `app`, `exportedAt`, `activeTab` at the root; those move to the v3 envelope on migrate.

---

## Domain kernels (`js/domain/`)

| Module | Role |
|--------|------|
| `show-document.js` | v3 Shows / Rooms / Templates normalize + CRUD |
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

Runtime: `js/show-document-runtime.js` (flush/load active room, IndexedDB autosave), `js/show-document-idb.js`, `js/shows.js` (Shows tab UI).

`parseShowDocument(text)` loads a v3 document (migrating v1/v2).  
`parseSiteState(text)` still returns the **active room** as a v2-shaped plan for older helpers/tests.

---

## Shared: `places` (per room plan)

**Domain module:** `js/domain/places.js`

Canonical venue list for Signal Flow assignment, Groundplan markers, Cable place cards, and Paperwork diagrams — scoped to each room’s `plan`.

| Field | Type | Notes |
|-------|------|--------|
| (array item) `id` | string | Stable id |
| (array item) `name` | string | Display name; list sorted by name |

**Migrate:** If room `places` is absent, copy from legacy `signalFlow.places`. Nested `signalFlow.places` is stripped on parse/save.

---

## Calculator sections

See the remainder of this document for per-section field contracts (`led`, `projector`, `signalFlow`, `groundplan`, `contentMaps`, `cable`, `labor`, `paperwork`). Those shapes are unchanged; they now live under `shows[].rooms[].plan` (or inside a template’s `plan`).

### `led` — required

**emptyState:** none (missing section fails validate)  
**validateState:** `normalizeLedState` in `js/domain/led.js` — requires `grids` array; coerces voltage/bitrate; backfills processors / `processorId`

### `projector` — required

**emptyState:** none  
**validateState:** `normalizeProjectorState` in `js/domain/projector.js` — requires ≥1 screen; normalizes screen fields + active ids

### `signalFlow` — optional

**emptyState / validate:** `emptySignalFlowState` / `normalizeSignalFlowState` in `js/domain/signal-flow.js`.

Nodes may include optional measured `layout: { w, h, inColW, outColW, portTop, portRowH }` for paperwork wire fidelity.

### `groundplan` — optional

**emptyState / validate:** rebuilds known top-level keys (`js/domain/groundplan.js`).

### `contentMaps` — optional

**emptyState / validate:** `emptyContentMapsState` / `normalizeContentMapsState` in `js/domain/content-maps.js`.

### `cable` — optional

**emptyState / validate:** domain cable helpers; auto-derived cables are never stored.

### `labor` — optional

**emptyState / validate:** `js/domain/labor.js`.

### `paperwork` — optional

**emptyState / validate:** `js/domain/paperwork.js`.

---

## Decisions log

| Topic | Decision |
|-------|----------|
| Contract | v3 multi-show envelope; room plans keep v2 section validators |
| Persistence | IndexedDB autosave + manual Export/Import (profile or current show) |
| Places ownership | Per room plan (lift from legacy `signalFlow.places`) |
| Templates | Global; copy into shows; rooms can be saved as templates |
| Tooling | Vite + TypeScript (`allowJs`); Shows tab is first on load |
