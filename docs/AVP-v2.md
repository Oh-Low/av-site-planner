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
      "gearList": { },
      "paperwork": { },
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
  "rigging": { }
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `places` | No | Venues for this room — lifted from legacy `signalFlow.places` |
| `led` | **Yes** | `requiredForSave`; must have `grids` array |
| `projector` | **Yes** | `requiredForSave`; must have ≥1 screen |
| `signalFlow` … `rigging` | No | Filled from `emptyState()` when omitted on migrate |

**Show-scoped (not in room plan):** `paperwork`, `gearList`, and `powerAllocation` live on `shows[]` (same pattern). Legacy room-plan copies of paperwork and gear list are hoisted on normalize; nested `powerAllocation` is stripped.

Registry order (room plan sections): led → projector → signalFlow → groundplan → contentMaps → cable → labor → rigging. Show-scoped plugins: gearList → powerAllocation → paperwork.

Legacy single-file v2 documents also carried `formatVersion`, `app`, `exportedAt`, `activeTab` at the root; those move to the v3 envelope on migrate.

---

## Domain kernels (`js/domain/`)

| Module | Role |
|--------|------|
| `show-document.js` | v3 Shows / Rooms / Templates normalize + CRUD |
| `places.js` | Root venue identity — normalize / lift / strip |
| `labor.js` | Labor state + pay-tier math |
| `cable.js` | Manual cable state + derived route/place cards |
| `gear-list.js` | Ordered gear/cable list synced from SF + cable cards |
| `power-allocation.js` | Power-load rows synced from Signal Flow power wires |
| `led.js` | LED wall section deep normalize |
| `projector.js` | Projector section deep normalize |
| `groundplan.js` | Floor-plan section empty/validate |
| `signal-flow.js` | Graph section empty/normalize (no nested places) |
| `content-maps.js` | Surfaces/rasters/test-pattern normalize |
| `paperwork.js` | Packet state normalize |
| `rigging.js` | Sized part catalog, mates, equal-share load solver |
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

**Power mode:** Top sidebar slider (Signal / Power) switches canvas layout and wires; a second slider (Places / Gear) only changes the left menu. Shared devices, separate layouts: Signal and Power each store their own node positions (`x`/`y` vs `powerX`/`powerY`). New gear placed in Signal seeds Power at the same spot; dragging in one mode does not move the other. Power-domain gear (outlets, distros, company switch) is hidden on the Signal canvas and only appears under Power. Each device has two display tables of the same row count (`max(power ports, signal ports)`): **Signal** packs signal ports from the top and clears power cells to "—"; **Power** packs power ports from the top (synthetic Edison **Power In** when none) and clears signal cells to "—". Corner circle is **status only** (green when every power-typed input has a feed). Power wires use `power: true` on connections.

**LED walls:** Listed under a locked **LED Walls** folder in the Gear library — drag onto the canvas to place (one node per wall; dropping again moves it). Linked nodes (`ledWallId`) refresh ports/name from drawn `powerLines` / `dataLines` on Signal Flow import and tab show; deleted LED walls remove their nodes. Power input count = power lines; ETH input count = data lines; power type from `powerConnector` when known else Edison.

### `groundplan` — optional

**emptyState / validate:** rebuilds known top-level keys (`js/domain/groundplan.js`).

### `contentMaps` — optional

**emptyState / validate:** `emptyContentMapsState` / `normalizeContentMapsState` in `js/domain/content-maps.js`.

### `cable` — optional

**emptyState / validate:** domain cable helpers; auto-derived cables are never stored. Optional `placeLengths` maps place id → standard stock length (`5|10|15|25|50|100|150|200`). Manual cables may include `length`.

### `gearList` — show-scoped (optional)

Stored on `shows[].gearList`, not inside `rooms[].plan`. Aggregates auto rows from **every room** in the show (room-scoped `sourceKey`s like `room:<id>|sf-gear:…`); settings filters (`roomFilter` / `placeFilter` / `totalOnly`) narrow the view.

**emptyState / validate:** `js/domain/gear-list.js`. Ordered `rows` of `header` | `item`. Headers have `level: "section" | "subsection"` and optional auto `source` / `sourceKey`. Each cable route syncs as an auto subsection labeled `[route] + [length]`; place-local cables sync under a trailing **Other** subsection. Auto items are re-derived from Signal Flow nodes and Cable Calculator cards on refresh; only order, notes, manual headers, and manual items are authoritative in the file.

### `powerAllocation` — show-scoped (optional)

Stored on `shows[].powerAllocation`, not inside `rooms[].plan`. One table for the show. Auto rows use `sourceKey` `pa:<roomId>:<nodeId>`. Per-field `overrides` keep edited device, distro, phase, voltage, wattage, and amperage across sync. `settings.searchQuery` and `settings.roomFilter` are calculator-only. `included: false` hides a row from that room’s paperwork sheet.

**emptyState / validate:** `js/domain/power-allocation.js`.

### `labor` — optional

**emptyState / validate:** `js/domain/labor.js`.

### `rigging` — optional

**emptyState / validate:** `js/domain/rigging.js`.

```json
{
  "parts": [
    {
      "id": "rg-1",
      "typeId": "aircraft-cable",
      "name": "Aircraft cable",
      "x": 0,
      "y": 0,
      "rotationDeg": 0,
      "props": { "lengthIn": 48, "weightLb": 1, "wllLb": 2000 }
    }
  ],
  "mates": [
    {
      "id": "mate-1",
      "aPartId": "rg-1",
      "aAttachId": "top",
      "bPartId": "rg-2",
      "bAttachId": "bottom"
    }
  ],
  "grid": { "snap": true, "sizeIn": 1 }
}
```

World units are inches. Connections are mates only (no drawn wires). LED import is not stored yet.

### `paperwork` — show-scoped (optional)

Stored on `shows[].paperwork`, not inside `rooms[].plan`.

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
