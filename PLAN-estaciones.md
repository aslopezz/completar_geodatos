# Plan: Estaciones & Protocolos (kmz_proceso)

Instructions for a coding agent. Execute **one phase per session / PR**. Stop after each phase, report, and wait for approval before starting the next.

---

## 0. Ground rules (read first)

Follow `AGENTS.md` / `CLAUDE.md`. In addition:

1. **One phase at a time.** Never start the next phase without explicit approval.
2. **Behavior-preserving first.** Phases 1–3 are refactors: the CSV and KMZ exports must be byte-identical before and after (see "Verification").
3. **No new dependencies** unless a phase says so and the user approves. No version bumps.
4. **Keep point identity as-is:** a point is identified by its index in `data.points`. Do not change that.
5. **Do not touch** the Shiny CSV contract: the columns, their order, the `;` separator, UTF-8 without BOM, the `dd-mm-YYYY` date format and `"lat, lon"` coordinates (see `exportCsv`).
6. **Styles:** use existing CSS variables/classes (`demo-*`, `var(--palm)`, etc.). Do not hardcode colors.
7. **Spanish UI text**, consistent with the existing UI. Code identifiers may follow the existing mix (`estacion`, `protocolo`, `metodologia`).
8. If something in this plan conflicts with what you find in the code, **stop and ask**. Do not improvise a redesign.

### How SOLID applies here (keep it pragmatic: functions + types, no classes needed)

| Principle | Concretely in this repo |
|---|---|
| **S**ingle responsibility | `GeoPreview.tsx` currently does map, form, bulk edit, table and species search. Extract *only the piece a phase touches*. Domain logic goes to `src/lib/*` as pure functions; components only render and dispatch. |
| **O**pen/closed | Protocols are **data** (a catalog), not `if`s. Station suggestions are **pluggable strategies**: a new heuristic is a new file, with no edits to existing ones. |
| **L**iskov | Every suggester honors the same `EstacionSuggester` contract and returns suggestions without mutating state. |
| **I**nterface segregation | New components receive narrow props (what they render + callbacks), never the whole `GeoPreview` state. |
| **D**ependency inversion | Exports and UI depend on `resolvePointAttributes()` and `getProtocolos()`, not on raw state shapes or hardcoded lists. This lets the catalog move to Supabase later without touching consumers. |

### Verification (every phase)

- `npx tsc --noEmit` passes.
- `npm run build` passes.
- Manual check with `npm run dev`, using a real KMZ/GPX of a campaign with points and at least one track:
  - Assign species to 2–3 points, set estación/protocolo (default + one override + one bulk).
  - Export CSV and KMZ.
- **Refactor phases (1–3):** export CSV/KMZ *before* the change (on `main`) and *after* with the same inputs, then `diff` them. They must be identical. Report the diff result.
- There is no test runner in the repo. Do **not** add one without asking. If the user approves adding `vitest` (dev dependency only), pure modules in `src/lib/` get unit tests.

### Report format at end of each phase

- Files changed/created (one line each, with purpose).
- Verification results (tsc, build, diff, manual checklist).
- Anything surprising found in the code.
- Open questions for the user.

---

## Target architecture (where we are heading; do NOT build it all at once)

```
src/lib/
  protocolos.ts           # catalog: { id, nombre, sigla }[] + getProtocolos(), findProtocolo()
  point-attributes.ts     # resolvePointAttributes(): the single place deciding estación/protocolo/metodología of a point
  estaciones.ts           # Estacion type + pure ops (create/rename/setProtocolo/assign/unassign/remove/pointsOf)
  suggest/
    types.ts              # EstacionSuggester contract
    by-name-prefix.ts     # first strategy
    (later) by-track-proximity.ts, by-time-gap.ts
src/hooks/
  useEstaciones.ts        # useReducer wrapper over lib/estaciones.ts
src/components/
  EstacionesPanel.tsx     # list/create/edit estaciones
  (later) PointsTable.tsx # extracted only when grouping needs it
```

Resolution order for a point's attributes (final state):
**per-point override → estación → campaign default (`meta`) → fallback (point name / empty)**

---

## UI spec (keep it as simple as possible)

Principles: **no modals, no new pages, no drag & drop, no collapsible sections, no new libraries.** Reuse the existing classes (`demo-list-item`, `demo-input`, `demo-select`, `demo-button`, `demo-table`, `demo-pill`). Add at most one new block (the Estaciones panel) and one new control (the "Asignar" select in the bulk bar). Everything else stays where it is.

Final layout of the page (top → bottom). Only the **★** parts are new.

```
[ map preview ]                                        ← points colored by estación ★ (Phase 5)
[ KMZ · 42 puntos · 2 tracks ]  [Zona UTM ▾] [Exportar CSV] [Exportar KMZ]

┌ Terreno [________]  Estación (por defecto) [____]  Protocolo [____▾]  Metodología [__] ┐   ← unchanged
└──────────────────────────────────────────────────────────────────────────────────────┘

┌ Estaciones ★ ───────────────────────────────────────────────────────────────────────┐
│  Nombre        Protocolo                         Puntos                              │
│  [TA-01    ]   [Transecta                 ▾]     12      [Quitar]                    │
│  [POA-03   ]   [Punto de observación de aves▾]   5      [Quitar]                    │
│  [+ Nueva estación]                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌ 3 seleccionados   Asignar a estación ★ [TA-01 ▾] [Asignar]   … existing bulk fields … ┐  ← only when points are checked
└──────────────────────────────────────────────────────────────────────────────────────┘

Puntos table (unchanged columns). Estación/Protocolo/Metodología placeholders now come from the estación.
  ── TA-01 · Transecta · 12 puntos ──────────  ★ header row (Phase 5, plain <tr>, not collapsible)
  ☐ WPT001  …
  ── Sin asignar · 7 puntos ─────────────────
  ☐ WPT050  …
```

Rules:
- **Estaciones panel:** one row per estación with three things: name (text input), protocol (input + catalog datalist, same as today), and a point count. Then a "Quitar" button. The sigla/metodología is shown, not edited (it comes from the catalog). "+ Nueva estación" adds an empty row with the name focused. If there are no estaciones, the panel shows only the button and one muted line: "Crea estaciones para agrupar puntos y asignarles protocolo."
- **Assigning:** only through the existing checkbox selection + "Asignar a estación" select. The select includes a "— Sin estación —" option to unassign. No per-row estación select in the table (the per-point text override stays as it is today).
- **Quitar estación:** no confirmation dialog. Its points return to "Sin asignar".
- **Map:** only the fill color changes. No legend beyond the estación name already shown in the panel (optional small color dot next to the name).
- **Suggestions (Phase 6):** one button, "Sugerir estaciones", next to "+ Nueva estación". It shows an inline list (`TA1 → 8 puntos  [✓]`) with "Aplicar" / "Cancelar" buttons in the same panel. No modal.
- **Deferred (not in the UI now):** linking a track to an estación, editing metodología per estación, colour pickers, filters, search.

---

## Phase 1: Protocol catalog (refactor, no visible change)

**Goal:** a single source of truth for protocols and their siglas.

Steps:
1. Create `src/lib/protocolos.ts`:
   ```ts
   export type Protocolo = { id: string; nombre: string; sigla: string; alias?: readonly string[] }
   const PROTOCOLOS: readonly Protocolo[] = [ /* see table below */ ]
   export function getProtocolos(): readonly Protocolo[]
   // case/accent/space-insensitive match against nombre, sigla or any alias
   export function findProtocolo(texto: string | undefined): Protocolo | undefined
   ```

   **Catalog (confirmed by the user):**

   | id | nombre (shown in UI) | sigla | alias (old datalist values / variants that must still match) |
   |---|---|---|---|
   | `transecta` | Transecta | TA | |
   | `poa` | Punto de observación de aves | POA | Punto de aves, Puntos de aves |
   | `bat` | Ecolocalizadores | BAT | Detección de ecolocalizaciones |
   | `ct` | Cámaras trampa | CT | Trampas cámara, Trampa cámara |
   | `tsh` | Trampas Sherman | TSH | Trampas sherman |
   | `mn` | Monitoreo nocturno | MN | Muestreo nocturno |
   | `mta` | Tránsito aéreo | MTA | |
   | `censo` | Censo | *(pending)* | |
   | `punto-conteo` | Punto de conteo | *(pending)* | |
   | `recorrido-pedestre` | Recorrido pedestre | *(pending)* | |
   | `transecta-aves` | Transecta para aves | *(pending)* | |

   - Rows marked *(pending)* get `sigla: ''`. Ask the user whether they stay, get a sigla, or get merged into another protocol (e.g. `Transecta para aves` → `Transecta`?).
   - The sigla is the single source for the "NOMBRE METODOLOGIA" column, and later for station-name prefixes in Phase 6.
2. In `geo-export.ts`, make `metodologiaFor()` use `findProtocolo(p)?.sigla ?? ''` and delete `PROTOCOL_METHOD`. Keep the `metodologiaFor` / `nextMetodologia` signatures unchanged.
3. In `GeoPreview.tsx`, render the `<datalist>` options from `getProtocolos()` (show `nombre`, optionally as `"POA · Punto de observación de aves"` in the option label).

Acceptance:
- `Transecta` still yields `TA`, and anything with no protocol or an unknown one still yields an empty metodología. Exports for those cases are byte-identical.
- **Intended change:** the other protocols now autofill their sigla (e.g. "Punto de aves" → POA). Report this in the diff instead of treating it as a regression.
- Free text is still accepted. An unknown protocol simply gets no sigla.
Out of scope: switching inputs to `<select>`, renaming values already typed by the user.

---

## Phase 2: Single resolver for point attributes (refactor, no visible change)

**Goal:** one function decides a point's estación/protocolo/metodología, so later phases add the estación layer in one place.

Steps:
1. Create `src/lib/point-attributes.ts`:
   ```ts
   export type PointAttributes = { estacion: string; protocolo: string; metodologia: string }
   export function resolvePointAttributes(
     pointName: string,
     meta: CsvMeta,
     override: PointOverride | undefined,
   ): PointAttributes
   ```
   - Move the exact logic now inlined in `exportCsv` (lines building ESTACION / PROTOCOLO / METODOLOGIA). Keep the same precedence and the same trimming.
2. `exportCsv` calls the resolver.
3. Table placeholders in `GeoPreview.tsx` may keep their current logic in this phase (do not change UI behavior). Note in the report where they differ from the resolver, if anywhere.

Acceptance: exports are byte-identical.
Out of scope: any estación concept.

---

## Phase 3: Estación domain module (pure, not wired to UI)

**Goal:** the Estación model and its operations, with no UI.

Steps:
1. Create `src/lib/estaciones.ts`:
   ```ts
   export type Estacion = { id: string; nombre: string; protocolo: string; metodologia: string; trackIndex?: number }
   export type EstacionesState = { estaciones: Estacion[]; pointEstacion: Record<number, string> }
   export type EstacionesAction =
     | { type: 'create'; estacion: Estacion }
     | { type: 'update'; id: string; patch: Partial<Omit<Estacion, 'id'>> }
     | { type: 'remove'; id: string }                         // its points become unassigned
     | { type: 'assign'; id: string; points: number[] }
     | { type: 'unassign'; points: number[] }
   export function estacionesReducer(state: EstacionesState, action: EstacionesAction): EstacionesState
   export function pointsOf(state: EstacionesState, id: string): number[]
   ```
   - `protocolo` stores the protocol **name** (string, like today), and `metodologia` defaults through `metodologiaFor()`. This keeps free-text protocols working.
   - The reducer is pure: no `crypto`, no dates. IDs are created by the caller.
2. Extend `resolvePointAttributes` with an optional `estacion?: Estacion` argument, inserted in the order **override → estación → meta → fallback**. When `estacion` is undefined, the output must be identical to Phase 2.

Acceptance: tsc/build pass, exports byte-identical (no estaciones exist yet).

---

## Phase 4: Estaciones panel + assignment (first visible change)

**Goal:** the user can create estaciones and assign checked points to them.

Steps:
1. `src/hooks/useEstaciones.ts`: `useReducer(estacionesReducer, initial)` plus helpers (`create(nombre, protocolo)` generates the id with `crypto.randomUUID()`).
2. `src/components/EstacionesPanel.tsx`, with narrow props:
   ```ts
   { estaciones: Estacion[]; counts: Record<string, number>;
     onCreate(): void; onUpdate(id: string, patch: { nombre?: string; protocolo?: string }): void; onRemove(id: string): void }
   ```
   - Exactly as in the **UI spec**: name, protocol (datalist from `getProtocolos()`), sigla shown read-only, point count, and "Quitar". No track link and no metodología editing (deferred).
   - Place it between the default-fields block and the bulk bar.
3. Bulk bar (shown when points are checked): add **"Asignar a estación"** `<select>` (including "— Sin estación —") + an "Asignar" button that dispatches `assign` / `unassign`. Keep the existing bulk fields for now.
4. Points table: the Estación cell shows the assigned estación name as placeholder (via the resolver). The per-point override inputs remain and still win.
5. `exportCsv` receives the estaciones state (or a `getEstacionOf(index)` function; prefer the function, per DIP) and passes the estación to the resolver.

Acceptance:
- Without creating estaciones, exports are byte-identical to before.
- With estaciones, the CSV shows each point's estación/protocolo/metodología from its estación unless overridden.
- No changes to the KMZ export in this phase.

---

## Phase 5: Group the table + color the map by estación

1. Extract the points table into `src/components/PointsTable.tsx` (moving existing JSX; behavior unchanged), then add grouping: one plain header `<tr>` per estación (`TA-01 · Transecta · 12 puntos`) plus a "Sin asignar" group at the end. No collapsing and no sorting controls.
2. Map: fill each point's circle with its estación's color. Colors come from a small palette of **existing** CSS variables, assigned by estación order. If there aren't enough variables, add them to the stylesheet (per the style rules).

Acceptance: same rows and the same editing as before, now grouped. Exports are unchanged from Phase 4.

---

## Phase 6: Suggestion strategies (opt-in, user confirms)

1. `src/lib/suggest/types.ts`:
   ```ts
   export type EstacionSuggestion = { nombre: string; protocolo?: string; points: number[] }
   export interface EstacionSuggester { id: string; label: string; suggest(data: ImportResult, unassigned: number[]): EstacionSuggestion[] }
   ```
2. `by-name-prefix.ts`: group unassigned points by the prefix of their name (e.g. `TA1-01`, `TA1_02` → `TA1`). Infer the protocol only if the prefix matches a catalog sigla.
3. UI (see the UI spec): a "Sugerir estaciones" button shows an inline list in the Estaciones panel (estación → N points, each with a checkbox) and "Aplicar" / "Cancelar" buttons. Nothing is applied until the user confirms. No modal.
4. Register suggesters in an array. Adding a new strategy must not require editing existing ones.

Later, as separate PRs: `by-track-proximity.ts` (points within X m of an estación's linked track), `by-time-gap.ts`.

---

## Phase 7 (later, needs user decision): cleanup & persistence

- Decide whether to keep the per-point protocolo/metodología override or limit overrides to estación only.
- Switch protocol inputs to `<select>` + "Otro…" once the catalog names are final.
- Move `getProtocolos()` to read from Supabase (read-only, as `species.ts` does), keeping the same function signature and the constant as fallback.
- Darwin Core export: estación → `eventID`, terreno → `parentEventID`, linked track → `footprintWKT` + `samplingEffort`.

---

## Known issue (do not fix unless the user asks)

- In `routes/index.tsx`, `<GeoPreview data={result} />` has no `key`, so loading a second file keeps the previous file's per-index state (species, overrides, removed points). A likely fix is `key={result.fileName}` (or a load counter). Report it if you observe it, but leave it unchanged.

## Open questions for the user (agent: ask, don't guess)

1. Siglas for Censo, Punto de conteo, Recorrido pedestre and Transecta para aves: keep them, assign a sigla, or merge them? (The other siglas are confirmed in Phase 1.)
2. ~~Protocol names~~: resolved. Catalog `nombre` is the display name, and the old variants are kept as `alias`.
3. Do GPS point names follow a naming convention per estación? (Determines how useful Phase 6 is.)
4. OK to add `vitest` as a dev dependency for unit tests of `src/lib/`?