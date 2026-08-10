# Calculator plugin instance APIs

Inventory of what each tool exposes after `init()`. Used by `js/app.js`, `js/site-state.js`, and cross-tool peeks via `getCalculatorExport` / `getCalculatorInstance`.

Plugin registration: `js/calculator-registry.js` → `CALCULATOR_PLUGINS`.  
All live tools (including Groundplan) register with `init` and boot via `initCalculatorInstances()`.

---

## Shared plugin meta

| Field | Purpose |
|-------|---------|
| `id` | Stable calculator id |
| `tabPanelId` | Matches `index.html` panel `id` |
| `stateKey` | Key in the `.AVP` JSON object |
| `label` | Human name (errors / UI) |
| `requiredForSave` | If true, save/load fails when `exportState` is missing |
| `emptyState()` | Optional section default on migrate / empty export |
| `validateState(data)` | Optional; normalize or throw on import |

---

## Instance methods by tool

| stateKey | Methods | Notes |
|----------|---------|--------|
| `led` | `exportState`, `importState`, `flushFormToState`, `refreshUi` | `exportState` is read-only (no form flush) so paperwork peeks during import cannot clobber. App calls `refreshUi` after import. |
| `projector` | `exportState`, `importState`, `flushFormToState` | Same read-only export rule as LED. |
| `signalFlow` | `exportState`, `importState`, `addPlace`, `renamePlace`, `deletePlace` | Places live in SF UI memory; persisted at document root via `buildSiteState`. |
| `groundplan` | `exportState`, `importState` | Resolves places lazily via `getCalculatorInstance("signalFlow")` (optional inject still supported). |
| `contentMaps` | `exportState`, `importState` | Peeks LED/projector via `getCalculatorExport`. No `validateState` on meta. |
| `cable` | `exportState`, `importState`, `refresh` | `refresh` rebuilds derived cards from SF + groundplan. App/tab show should call it. |
| `labor` | `exportState`, `importState` | Pure-ish; state is small. |
| `paperwork` | `exportState`, `importState` | Peeks all calculators via `getCalculatorExport` / site export collection for Generate/Update. |

---

## Cross-tool communication (today)

```
getCalculatorExport(stateKey)  → instance.exportState() | null
getCalculatorInstance(stateKey) → instance | null
```

There is **no event bus**. Downstream tools (cable, content maps, paperwork) pull live snapshots when they need them.

Special cases in `app.js`:

1. After full site import: `led.refreshUi()` before other tools that peek LED.
2. Save path: `flushFormToState` on each instance that has it, then `exportState`; places lifted to root.
3. Import path: root `places` injected into Signal Flow section before `importState`.

---

## Export / import invariants

| Rule | Why |
|------|-----|
| `exportState` must not write form defaults into memory during peeks | Import of one tool can trigger peeks from another while forms still hold stale defaults |
| `flushFormToState` only on user Save | Separates “snapshot for paperwork” from “commit form” |
| Optional sections may be `{}`-filled from `emptyState` | Missing keys on old files |
| Auto cable rows are never in `cable` export | Derived at runtime |

---

## Gaps to close in later phases

- Calculators still own live mutable state; `SiteDocument` is synced on import/export via `site-document-runtime.js` (`getSiteDocument().peek`) — not yet used for mid-edit peeks.
- No shared event bus — cross-reads via `getCalculatorExport` / document peek after sync.
- Rigging tab has **no** plugin / `stateKey`.
- Cable `refresh` is easy to forget when upstream data changes while Cable tab is hidden.
- Paperwork `exportState` includes selection ids (`selectedElementId`, `selectedDecorationId`).
