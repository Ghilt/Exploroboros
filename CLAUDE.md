# Exploroboros — living instruction document

> Auto-loaded by Claude Code every session. This is the single source of truth for **how we work**, **what's
> decided**, and **what we've learned**. Read it first; keep it updated as the project moves.

## 1. Vision

Exploroboros is a web app for **exploring tiled planes and growing fractal patterns on them**. A user picks
(or loads) a tiling, authors **coloring rules** and **traversal rules** by clicking/tapping tiles, watches
fractal/structured patterns emerge, and **exports the result as an image**. It must work well on **phone and
desktop** (touch + mouse) and support **any tiling**, not just one fixed grid.

It grows out of a Python prototype (the "nandeck octagon visualizer"); its hard-won lessons are captured in
§5 so we don't relearn them.

## 2. How we work (the ethos) — READ THIS

- **The owner does not read code.** Explain in plain language; never ask them to inspect diffs.
- **Verify before commit.** Nothing is committed until the owner has **verified it on a real device** (phone
  + desktop). I build it, run finite checks (build / typecheck / test), then hand off for the owner to look
  at. See §7 for how to expose the dev server to a phone.
- **Record what's verified.** When the owner confirms a feature, add a row to the §7 verification log, *then*
  commit — noting the feature and how it was verified.
- **Maintain the todo list.** §8 is the living backlog of what's left to build. Keep it current — add items as
  they surface; when the owner verifies a finished item, check it off there (and add the §7 row). While
  working I mirror the open items into the in-session task tracker to tick them off as I go.
- **Don't guess libraries.** §3 is the approved-tech registry (with versions). Use those. If something new is
  needed, propose it, get the owner's OK, and add it to §3 — never introduce dependencies silently.
- **When unsure, consult §4 (Open Questions) and ASK.** §4 is the embedded quiz: the genuine forks we haven't
  locked. If a task touches one, ask the owner the recorded question before building.
- **UX matters — help users understand (this app is for others too).** Prefer plain hover tooltips (HTML
  `title`) for quick hints; for a concept that needs a sentence or two, add a small faded **"?" explainer**
  (`HelpButton`, §9) that opens a little info dialog — kept muted so it doesn't clutter. When a new feature
  introduces a non-obvious concept, **ask the owner** whether it wants a "?" explainer there.
- **Commits:** only on the owner's say-so; to `main` unless told otherwise; the owner pushes.

## 3. Locked technology decisions (approved-tech registry)

Installed and confirmed working 2026-06-26:

- **Runtime:** Node.js 24.x LTS, npm 11.x. (Installed via `winget install OpenJS.NodeJS.LTS`. Node lives at
  `C:\Program Files\nodejs`; if a shell can't find `node`, that dir may be missing from its PATH.)
  **PowerShell gotcha (this machine):** execution policy is `AllSigned` at `LocalMachine`, which blocks npm's
  `npm.ps1`/`npx.ps1` shims (`npm run dev` → "not digitally signed"). **Reliable fix: call `npm.cmd`** (e.g.
  `npm.cmd run dev`) — `.cmd`/`.bat` files are NOT governed by execution policy — or run from `cmd.exe`. To
  make plain `npm` work in PowerShell, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` **in your own
  interactive PowerShell** (no admin; revert with `… Restricted`); setting it from an automation/other-scope
  context did not stick here. **In the non-interactive tool shells (Bash/PowerShell), `node`/`npm.cmd`/`npx.cmd`
  were not on PATH at all** — prepend the dir first, e.g. `$env:Path = 'C:\Program Files\nodejs;' + $env:Path`,
  then call `npm.cmd run build` / `npx.cmd vitest run`. (The preview server sidesteps this by launching Vite via
  `node.exe` directly — see `.claude/launch.json`.)
- **Framework:** React 19.2 + TypeScript 6 (strict). Largest ecosystem; first-class bindings for **both**
  candidate canvas renderers (see §4.1).
- **Build / dev:** Vite 8. Lint: **oxlint** (from the template). Tests: **Vitest 4** +
  `@testing-library/react` + `jsdom`. Scripts: `npm run dev | build | lint | preview`; `npx vitest run`.
- **Image optimization:** `vite-imagetools` 10 (build-time; pulls in `sharp`). Added 2026-06-26 with the
  owner's OK. Gallery images live in `src/assets/gallery/` and are auto-resized + re-encoded to WebP on build
  (originals untouched) — a 20 MB source PNG ships as ~0.1–0.9 MB. See `src/data/gallery.ts`.
- **Styling (current):** plain CSS — mobile-first, `clamp()` fluid type, CSS custom properties, light/dark via
  `prefers-color-scheme`. Low-stakes; revisit at scale (§4.4).
- **Tiling engine (added 2026-06-26):** pure, isomorphic TypeScript in `src/tiling/` — no React/DOM/canvas, no
  pixels (abstract **world coords, y-up, vertices CCW**), so the same code can run server-side later (SSR for
  slow devices). A tiling is a **node graph**: tiles (nodes) + **first-class edges**, built by per-tiling
  **generator** routines that emit polygons into a shared `stitch()` step (data shape in §4.3). The Canvas page
  now renders it through the interactive Konva plane (below); the original **plain-SVG** debug view
  (`src/components/TilingDebugView.tsx`) is kept as a dependency-free, tested reference.
- **Interactive canvas renderer (added 2026-06-27, resolves §4.1):** **Konva `^10.3`** + **react-konva
  `^19.2`** (matches React 19). `src/components/TilingCanvas.tsx` draws the whole tiling in ONE `Konva.Shape`
  `sceneFunc` — one canvas pass, viewport-culled, so it scales to ~10k tiles — with wheel/drag/pinch pan+zoom,
  tap-to-select, and drag-to-paint. All the math (world↔screen transform, hit-testing, stroke gap-fill,
  clipboard, tiling factory) lives in pure, isomorphic, Vitest-tested modules in `src/canvas/`. **Hard rule:
  `konva`/`react-konva` are imported ONLY in `TilingCanvas.tsx`** (a stray import into a pure module breaks
  Vitest/SSR). Installed 2026-06-27 with the owner's OK (`npm install konva react-konva`).
- **Hosting (planned, not yet wired):** Vercel — SPA auto-detected; native `@vercel/og` (Satori + resvg) for
  future serverless PNG export.
- **Repo:** local git repo at `E:\Code\exploroboros` (the owner's machine).

## 4. Deferred decisions / Open Questions (the embedded quiz)

Resolve each at the noted trigger — **ask the owner the question; don't assume.**

1. **Tile renderer** *(trigger: building the interactive plane).* PixiJS (WebGL; scales to 10k–50k+ tiles;
   pinch/pan via `pixi-viewport`; heavier, steeper curve) vs **Konva** (Canvas2D; touch-first; first-class
   `react-konva`; simplest to ~3k tiles). *(**Resolved 2026-06-27: Konva**, the owner's call when the
   interactive plane was built. `src/components/TilingCanvas.tsx` renders all tiles in a single `Konva.Shape`
   sceneFunc — one canvas pass, viewport-culled — with manual hit-testing via a dependency-free uniform
   spatial-hash + point-in-polygon (the square inverts its lattice O(1)); `rbush` stays the documented upgrade
   if hit-testing ever needs it. PixiJS/WebGL remains the escape hatch behind the same `TilingCanvas` boundary
   if tile counts must grow past Canvas2D limits.)*
2. **Serverless image export** *(trigger: building export).* `@vercel/og` (Satori + resvg; runs on Vercel
   edge; simplest) vs `@napi-rs/canvas` (full Canvas API; Node function). *Recommendation:* `@vercel/og`
   unless we need pixel-level canvas drawing. Cache by hashing the (tiling + rules) params.
3. **"Any-tiling" data schema** *(trigger: building the tiling model).* **Resolved 2026-06-26.** Tilings are
   **code-defined generators** (not an imported file format — owner's call); each emits raw polygons into a
   shared `stitch()` that detects coincident edges and builds the graph. Schema (`src/tiling/types.ts`): a
   `Tiling` = `nodes` (each tile: stable string id like `sq:r,c`, shape class, CCW `vertices`, `centroid`,
   intrinsic `lattice` coords, ordered `sides`) + **first-class** `edges` (each: two `{tile, side}` ends, or
   `b: null` for a boundary edge, plus segment geometry) + a JSON-native `shapes` registry + `bounds`. The
   tiling is an immutable, serialisable substrate; per-run state (visit counts, colours) lives in separate
   id-keyed overlays, not on nodes/edges.
   Edges are numbered **per tile** as a **local CCW side index** (`0..N-1`), each carrying an **outward-normal
   angle** (relative *and* absolute direction for the rules). Adjacency is the **stored side↔side pairing**
   (reciprocal by construction — no `(k+4)%N` formula). Opposite edges live on the shape as an array: 1 for
   even-sided polygons, 2 for odd (see §5). Stitching matches sides by quantized endpoint keys. The
   octagon+wedge (`kalleboda`, built 2026-06-27) turned out edge-to-edge at the *unit-edge* level, so its
   generator **welds coincident vertices** before `stitch()` rather than needing a collinear-overlap matcher —
   an octagon and a wedge still often share two edges, captured naturally as two paired sides. User-imported
   tilings remain a possible *future* feature, not built.
4. **Styling at scale** *(trigger: UI grows past a few screens).* Stay plain CSS, or adopt CSS Modules /
   Tailwind? *Recommendation:* CSS Modules when component count climbs.
5. **State management** *(trigger: rule-authoring UI).* React state + context, Zustand, or Redux?
   *Recommendation:* start with React state / Zustand; avoid Redux unless clearly needed.

## 5. Lessons from the prototype (self-contained)

The prototype renders an **octagon + wedge** tiling and grows patterns on it. Written to stand alone — the
origin repo (bottom of this section) **will be deleted**.

**Domain model (generalize to any tiling):**
- Tiles connect by **edges**. Edge directions use a compass 0–7 (0 = N, clockwise). Adjacency is
  **reciprocal**: leave via edge `k` → arrive on the neighbor via `(k+4)%8`; new heading = `k`. This
  compass/reciprocity idea generalizes — any tiling needs a per-tile edge list + a reciprocal neighbor graph.
- **Two-edged-adjacency quirk:** here ~80% of neighbor pairs share **two** edges, so "how many neighbors are
  visited" must distinguish *edges touched* vs *distinct tiles* (the prototype has both `adjacent-visited`
  and `adjacent-visited-unique`; the **unique** count is usually what you want). Any tiling with non-trivial
  adjacency needs this distinction.
- **Stable coordinates:** the prototype keys a radial number `num` and `row`/`col` on the shape-unit center
  (lattice coords), NOT pixels, so they stay stable across canvas/zoom changes. Lesson: derive tile
  identity/coords from the tiling's intrinsic structure, not screen pixels.

**Now implemented in `src/tiling/` (2026-06-26) — generalized from the above (so the origin repo can go):**
the compass 0–7 became a **local CCW side index `0..N-1`** plus a per-side **outward-normal angle** (gives the
rules both relative/turn and absolute/compass directions, for any polygon). Reciprocity is no longer the
`(k+4)%N` formula — the **side↔side pairing is stored on each edge**, so it works for mixed-polygon tilings.
The two-edged-adjacency distinction is preserved as `neighborEdges` (per shared edge) vs `uniqueNeighbors`
(distinct tiles). Stable identity uses intrinsic lattice coords (`sq:r,c`), never pixels. The **opposite-edge**
concept is generalized to an **array**: even-sided polygons have 1 opposite; odd-sided (triangle/pentagon) have
**2** — the sides flanking the opposite vertex. The two rule languages below are **not** ported yet (next).

**Two rule languages to port (the heart of the app):**
- **Static coloring rules:** `selector : predicate => color [@ weight]`. Selector = shape class; predicates
  test shape, edges, position, and post-traversal visit counts; rules stack top-to-bottom (later blends over
  earlier).
- **Traverse engine (fractals):** a tick-based graph walk. One or more "traversers" sit on tiles; each tick
  they paint (`color`), `move` along edge refs (relative / absolute / sets / ranges), `visit` neighbors, and
  **split** into branches (capped by `max-split`). Guards gate moves; state terms exist (`steps`, `splits`,
  `visited`, `adjacent-visited`[`-unique`], `heading`, `id`, `hunger`). Colors are literals or
  `ramp(var, stops…)`. A tick is **synchronous**: read frozen state → apply all writes → rebuild the
  traverser set. Identical traversers (same program + tile + heading) are **coalesced** to avoid 2ⁿ blow-up.

**What makes a pattern read as fractal (verify by rendering and LOOKING):**
- The **Rule-90 / XOR gate** — only move/paint where exactly one neighbor is visited
  (`adjacent-visited-unique == 1`) — is the one mechanism that produced **truly self-similar** output
  (Sierpinski-like). Plain self-avoiding walks branch but don't nest.
- **Gap-constraint principle:** a walk needs a gap-making constraint or it's a dud. *Over-restrict* (strict
  gate + only 1–2 directions) → dies in a few ticks. *No constraint* (self-avoid only, many directions) →
  floods ~100% into a boring smooth gradient. *Sweet spot:* a **loose** gap gate (`unique <= 1`, or
  `kill if crowded`, or a `visit`-carve) **plus ≥4 fallback directions** → ~35–70% fill with structure.
- **Tile-type routing that paints:** route by shape (e.g. octagons fan to all edges toward wedges, wedges
  route back) so behavior depends on the tile under the traverser ("sierpinski octagon-fan relay").
- Owner's taste: **each pattern should be a different mechanism** — never "same structure, different color".

**Origins (TEMPORARY local path — WILL BE DELETED):** prototype repo root
`E:\Files\photoshop\boardgame creative\tiling_experiment\nandeck-script`; full design doc
`…\tiling-experiment\tools\visualizer\ARCHITECTURE.md`; engine in that `visualizer/` folder (`tiling.py` =
geometry, `render_tiling.py` = static DSL + render, `traverse.py` = traverse engine). A fresh session may
read these **early on only** — the owner removes this repo once Exploroboros has progressed. Copy anything
still needed into this doc **before** then; do not rely on the path persisting.

## 6. Roadmap

- **Phase 0 (done):** repo + this doc + responsive hello-world.
- **Prototype migration (done 2026-06-26):** still-needed prototype detail captured + generalized in §5 — the
  origin repo can now be deleted safely.
- **Generic tiling render + data model (§4.3) — tiling set complete (2026-06-27):** data model, generic
  `stitch()`, the interactive Konva plane (zoom/pan, tap-select, drag-paint, copy/paste, grid-size probe),
  and the tiling picker are in and verified. **All 11 convex uniform Euclidean tilings + kalleboda now have
  generators** and are owner-verified (§7). Remaining sub-items are polish, not new tilings: let a drag paint
  attributes other than `visited`, a user-facing tile-numbering control, and edge-/opposite-edge visualisation
  (§8) — plus an optional look at the *expanded* uniform-tiling list for exotic extras.
- **Pattern engine — coloring + predicates (done 2026-06-27, `b391faa`):** a pure tile-predicate **DSL**
  (`src/dsl/`: lex/parse/serialize/eval + attribute registry), a **Predicate pane** (expandable presets +
  persisted custom predicates authored as DSL text), and a **Coloring pane** + pure **colorizer**
  (`src/colorizer/`) turning drag-reorderable predicate→colour rules (flat or ramp, per-rule opacity) into the
  canvas fill. Coordinates were made **unique per tile** first (dynamic Inspect labels; `tile-type` and
  `rotation` attributes). The old visit-count shading is gone; drag-to-paint stays as a data tool.
- **Visual predicate editor (done 2026-06-27, `50f1aa0`):** a Text/Visual toggle on a custom predicate;
  Visual renders the predicate as chips over its AST — click an operator for a dropdown (with keyboard
  accelerators), click an attribute to swap it, edit numbers/shapes inline; stays in sync with the text via
  serialize/parse. Structural add/group is still done in Text mode. Same pass: ramps can be driven by any
  attribute (incl. the step ones, with an index field for indexed ones).
- **Traverse engine — basic traverser + tick/run (done 2026-06-27):** a pure, isomorphic tick in
  `src/traverse/` — a walker steps to the **least-turn adjacent unvisited** tile, re-aims along the crossed
  edge, walkers on the same tile coalesce, the run auto-stops when all are trapped. UI: **Play / Pause / Stop**
  + a **slow/fast/max** speed chip (top-left of the canvas, where the title was; `max` = one tick per animation
  frame). Crucially it separates **authored seeds** (the placed + aimed walkers — the savable starting state of a
  fractal) from a **live run copy**, so **Stop** discards the run and restores the seeds (+ hand-painting), while
  only **Reset** removes the walkers. Inspect gets a Traverser section (Place / aim ↺↻ / Remove, locked during a
  run) and a **lime heading arrow** shows each head in `stats`. The hardcoded behaviour is a placeholder for the
  DSL-driven traversers below.
- **Next up:** **DSL-driven traversers** (custom rules in the Traversers pane — paint/move/visit/split/guards/
  state, §5; reuses the predicate DSL) → **serverless PNG export** (§4.2) → **deploy** to Vercel.

## 7. Verifying on a phone + verification log

**Expose the local dev server to a phone (free):**
- **Recommended — Cloudflare Quick Tunnel** (no account, HTTPS, works over cellular): one-time
  `winget install --id Cloudflare.cloudflared`; then with the dev server running (`npm run dev`), in another
  terminal run `cloudflared tunnel --url http://localhost:5173` and open the printed
  `https://<words>.trycloudflare.com` URL on the phone.
- **Zero-install fallback — same Wi-Fi:** `npm run dev -- --host`, then open `http://<PC-LAN-IP>:5173` on the
  phone (allow the Windows Firewall prompt; HTTP only).

**Verification log** — append a row when the owner verifies a feature; commit after.

| Date | Feature | Verified by owner? | How | Commit |
|------|---------|--------------------|-----|--------|
| 2026-06-26 | Responsive hello-world (Phase 0) | ✅ yes | owner viewed `npm run dev` on desktop + phone; renders well, dark mode followed phone setting | `f8a979d` |
| 2026-06-26 | Website shell — landing, Canvas + Gallery scaffolds, hash routing | ✅ yes | owner reviewed the running app (landing, canvas, gallery; light + dark) and approved | `de0dbd4` |
| 2026-06-26 | Tiling engine backbone + square-tiling debug view | ✅ yes | owner viewed the 20×20 square grid (white tiles, black edges) on desktop + phone and approved | `31c28d0` |
| 2026-06-27 | Multi-pane canvas workspace + tile inspector | ✅ yes | owner reviewed the running workspace (panes + collapse, click-to-inspect, visited controls; desktop + mobile) and approved | `6c73647` |
| 2026-06-27 | Tiling picker — modal gallery (Square + faithful Octagon+Wedge thumbnails; 10 planned) | ✅ yes | owner reviewed the running picker (open/close, choose Square, disabled Octagon+Wedge; desktop + mobile + dark) and approved | `e4f4e48` |
| 2026-06-27 | Interactive Konva canvas — zoom/pan, tap-select, drag-paint, copy/paste, grid-size + FPS probe | ✅ yes | owner reviewed the running interactive canvas (zoom/pan, paint, copy/paste, grid-size slider + tile-count/FPS) and approved as a checkpoint | `19c337d` |
| 2026-06-27 | Drag-to-paint — click inspects, click-drag paints (no mode toggle); passive "paint: visited" chip | ✅ yes | owner used the running canvas (tap-inspect, drag-paint, non-destructive resize) and approved; chose to keep resize non-destructive | `421a349` |
| 2026-06-27 | Display chip (edges / none / stats); stats labels engage across grid sizes (zoom to read on dense grids) | ✅ yes | owner reviewed the three display modes + the stats-label fix and approved | `ea86122` |
| 2026-06-27 | Full-height desktop canvas page — intro header removed, canvas fills the viewport, no page scroll | ✅ yes | owner viewed the canvas filling the desktop viewport with no page-scroll and approved | `3b18e69` |
| 2026-06-27 | Kalleboda (octagon + wedge) tiling — second selectable tiling | ✅ yes | owner approved the running tiling (select Kalleboda → gapless octagons + wedges; tap-select + drag-paint work on the concave tiles; light + dark desktop preview) | `6fd812e` |
| 2026-06-27 | Reset button (clears the visited overlay; disabled when blank) | ✅ yes | owner painted, hit Reset, saw it clear and the button grey out; approved | `b51e1ae` |
| 2026-06-27 | Triangular + Hexagonal tilings (+ auto gallery thumbnails) | ✅ yes | owner reviewed both running tilings (select Triangular / Hexagonal → gapless, ~400 tiles, select + paint work) and the gallery thumbnails; approved | `f4a6b92` |
| 2026-06-27 | Truncated Square (4.8.8) + Trihexagonal (3.6.3.6) tilings | ✅ yes | owner reviewed both running tilings (octagons+squares; kagome hexagons+triangles) — gapless, ~400 tiles; approved | `1eab3c4` |
| 2026-06-27 | Elongated Triangular (3.3.3.4.4) + Truncated Hexagonal (3.12.12) tilings | ✅ yes | owner reviewed both running tilings (square/triangle bands; dodecagons + triangle gaps) — gapless, ~388 tiles; approved | `3559ec0` |
| 2026-06-27 | Rhombitrihexagonal (3.4.6.4) + Truncated Trihexagonal (4.6.12) tilings | ✅ yes | owner reviewed both running tilings (hexagon rosettes ringed by squares+triangles; dodecagons + hexagons + squares) — gapless, ~399 tiles; approved | `bcd901a` |
| 2026-06-27 | Fix — visited overlay + selection cleared on tiling-type switch (no cross-tiling paint bleed; grid-size resize still keeps paint) | ✅ yes | owner reproduced the carry-over (paint Truncated Trihexagonal → switch to Rhombitrihexagonal), confirmed the new tiling now comes up blank and a resize still preserves paint | `8d241a8` |
| 2026-06-27 | Snub Square (3.3.4.3.4) + Snub Hexagonal (3.3.3.3.6) tilings — completes all 11 uniform + kalleboda | ✅ yes | owner reviewed both running chiral tilings (tilted-square pinwheel; hexagons in a triangle sea) — gapless, ~400 tiles; approved | `2e23482` |
| 2026-06-27 | Stats labels cap with zoom (more breathing room the closer you zoom) + triangles use a smaller share (20% vs 30%) | ✅ yes | owner verified on-device in display:stats (preview screenshot tool was wedged); zooming gives numbers room, triangle numbers no longer cramped | `8cd1212` |
| 2026-06-27 | Step-tracked visits (a visit logs its step; hand-made paint/Inspect = −1) + per-tile registries A/B/C; "paint:" target picker (visited/A/B/C); reusable faded "?" explainer (on Registries + step-visits) | ✅ yes | owner reviewed the running canvas on desktop + phone (Inspect shows the step list + A/B/C steppers with "?" dialogs; paint picker switches target; copy-paste carries all state; Reset clears) and approved | `bd2b72f` |
| 2026-06-27 | Tile-predicate DSL + Predicate pane + Coloring pane + colorizer; unique tile coordinates (dynamic Inspect); `tile-type` & `rotation` attributes; pane/colour UI polish | ✅ yes | owner reviewed the running app (desktop) across several iterations — authored predicates (presets expand, custom persist, live compile/errors), saw coloring rules recolour the tiling (flat, ramps with breakpoints, opacity blend), drag-reordered rules — and approved; old visit-shading removed, drag-paint kept as data | `b391faa` |
| 2026-06-27 | Visual chip predicate editor (Text/Visual toggle; click operator → dropdown + key accelerators, click attribute to swap, inline number/shape edits); ramps over any attribute incl. the step ones (+ index field for indexed); shortened adj-v-count / adj-t-v-count labels | ✅ yes | owner reviewed the running app and approved ("very good"); verified live — chips render, the operator dropdown's "-"/"<" accelerators set the op, the ramp dropdown lists first/latest/step + coordinate with an index field | `50f1aa0` |
| 2026-06-27 | Basic traverser + tick/run — Play/Pause/Stop + slow/fast/max speed chip; walker steps to the least-turn adjacent unvisited tile; authored seeds vs live run (Stop restores the placement, Reset removes); Inspect Place/aim/Remove; lime heading arrow in stats; mobile header wraps | ✅ yes | owner ran it on device — placed + aimed walkers, watched the lime arrows walk at each speed, confirmed Stop restores the placed walkers (not cleared) and the mobile controls stack — and said "commit" | `064cfc7` |
| 2026-06-27 | Grid resize locked during an active run (slider greys while playing/paused, frees on Stop); mobile ⋯ dropdown holds Fit / Reset / grid-size (inline on desktop) | ✅ yes | owner verified on device — the ⋯ menu reveals Fit/Reset/grid and the grid stays locked while a run is going — and approved | `3046977` |

## 8. Todo list (working backlog)

The living, granular checklist of what's left to build — the operational companion to the §6 roadmap
(narrative) and the §7 log (what's verified). Add items as they surface; when the owner verifies a finished
item, check it off here, add the §7 row, then commit. While working I mirror the open items into the
in-session task tracker.

- [x] **Phase 0** — repo, living doc, responsive hello-world *(verified 2026-06-26, `f8a979d`)*
- [x] **Website shell** — landing (pitch + nav), Canvas + Gallery scaffolds, hash routing *(verified 2026-06-26, `de0dbd4`)*
- [ ] **Generic tiling render + data model** *(§4.3)*
  - [x] Tiling engine backbone — data model, generic `stitch()`, square generator, SVG debug view
    *(verified 2026-06-26, `31c28d0`)*
  - [x] Tiling picker — modal gallery to choose a tiling (Canvas header). Square selectable;
    Octagon+Wedge a faithful preview thumbnail (from prototype geometry) but disabled; the other 10
    uniform tilings are placeholder cards. Catalog in `src/data/tilings.ts`; selection wired via
    Workspace `tilingId` for when real generators land *(verified 2026-06-27, `e4f4e48`)*
  - [x] Interactive Konva canvas — zoom/pan (wheel + drag + pinch), tap-to-select, drag-to-paint visited,
    Ctrl/Cmd+C / +V copy-paste of tile attributes (mobile Copy/Paste buttons + clipboard readout), a Fit
    button, and a grid-size slider with a tile-count + FPS HUD to find the rendering ceiling. Konva renderer
    (§3/§4.1) with pure tested helpers in `src/canvas/` *(verified 2026-06-27, `19c337d`)*
  - [ ] Paint other attributes — the **drag popup** (off / select / paint→Visited·A·B·C) chooses what a
    paint drag writes — **visited, or registry A/B/C** *(done & verified 2026-06-27, `bd2b72f`)*. Still to
    add: **paint traverser seeds** — once **named traversers** exist, add them to the drag popup's Paint
    list (and **colours** if useful).
  - [x] Step-tracked visits + per-tile registries (A/B/C) — a visit is now a **log of the steps** it
    happened on (count = list length; hand-made paint/Inspect visits are step −1); plus three free-form
    per-tile counters A/B/C. Both surface in the Inspect dock (with faded "?" explainers) and are
    paintable; in `stats` display they print inside tiles. Pure model + updaters in
    `src/canvas/overlay.ts`. Foundation for the traverse engine (§5) *(verified 2026-06-27, `bd2b72f`)*
  - [x] Octagon+wedge tiling (`kalleboda`) — second selectable tiling; wedge-snap + vertex-weld so the
    generic `stitch()` pairs shared edges (incl. the two-edged-adjacency quirk) *(verified 2026-06-27, `6fd812e`)*
  - [x] Regular uniform tilings — triangular (3.3.3.3.3.3) + hexagonal (6.6.6); gallery thumbnails now
    auto-render each ready tiling's real generator *(verified 2026-06-27, `f4a6b92`)*
  - [x] Semiregular batch 1 — truncated square (4.8.8) + trihexagonal (3.6.3.6) *(verified 2026-06-27, `1eab3c4`)*
  - [x] Semiregular batch 2 — elongated triangular (3.3.3.4.4) + truncated hexagonal (3.12.12) *(verified 2026-06-27, `3559ec0`)*
  - [x] Semiregular batch 3 — rhombitrihexagonal (3.4.6.4) + truncated trihexagonal (4.6.12) *(verified 2026-06-27, `bcd901a`)*
  - [x] Semiregular batch 4 — snub square (3.3.4.3.4) + snub hexagonal (3.3.3.3.6); the chiral pair.
    **All 11 convex uniform Euclidean tilings + kalleboda now have generators** *(verified 2026-06-27, `2e23482`)*
  - [x] Stats-label polish — labels cap their size as you zoom in (more breathing room) and triangles use a
    smaller share of the tile than other shapes *(verified 2026-06-27, `8cd1212`)*
  - [x] Unique tile coordinates + dynamic Inspect — every tiling's `lattice` now uniquely identifies each tile
    (triangular gains an orientation dim; multi-shape tilings a class/slot dim; the three centroid-keyed
    generators re-keyed to `[i,j,class]`); per-tiling `latticeLabels` on `TilingMeta` drive the Inspect
    coordinate readout. Prefactor for the DSL's `coordinate[n]` *(verified 2026-06-27, `b391faa`)*
  - [ ] Investigate the **expanded** uniform-tiling list
    (https://en.wikipedia.org/wiki/Uniform_tiling#Expanded_lists_of_uniform_tilings) for cool tilings to add
    beyond the 11 convex uniform + kalleboda (k-uniform, non-edge-to-edge, star/zero-angle forms, etc.) —
    pick favourites with the owner before building
  - [ ] Tile numbering as a canvas control — user-selectable scheme/origin (debug view currently numbers by generation order)
  - [ ] Visualise edge numbering + opposite edges for the user — show each tile's clockwise-from-top edge numbers and which edges are opposite (engine support exists: `clockwiseEdgeOrder`, `opposite`)
- [x] **Tile-predicate DSL + Predicate pane + Coloring pane** *(§5)* — pure `src/dsl/` engine
  (lex/parse/serialize/eval + attribute registry: numeric attrs, arithmetic, comparisons, and/or/not,
  grouping, required defaults, `tile-type == <shape>`, `rotation`); a Predicate pane (presets + persisted
  custom predicates as DSL text); a Coloring pane + pure `src/colorizer/` (predicate→colour rules, flat/ramp
  with breakpoints + modulo, per-rule opacity, drag-reorder) wired into the canvas. localStorage stores in
  `src/state/`; no new deps *(verified 2026-06-27, `b391faa`)*
- [x] **Visual predicate editor** — the mouse-driven **chip** UI over the same DSL AST (click an operator →
  dropdown w/ key accelerators; click an attribute → swap; inline number/shape edits), kept in sync with the
  text editor via serialize/parse. Structural add/group still done in Text mode — a possible follow-up
  *(verified 2026-06-27, `50f1aa0`)*
- [ ] **Port the traverse engine** *(§5)* — reuses the predicate DSL
  - [x] Basic traverser + tick/run structure — pure `src/traverse/` engine (synchronous tick; a walker steps
    to the least-turn adjacent **unvisited** tile, re-aims, coalesces, auto-stops when trapped), Play/Pause/Stop
    + slow/fast/max speed chip, **authored seeds vs live run** (Stop restores the placement — the savable
    starting state; Reset removes), Inspect Place/aim/Remove (locked during a run), lime heading arrow in stats,
    grid-resize locked while running, mobile header wraps *(verified 2026-06-27, `064cfc7`)*
  - [ ] DSL-driven traversers — custom rules in the Traversers pane (paint / move along edge refs / visit /
    split / guards / state terms, §5), reusing the predicate DSL; replaces the one hardcoded behaviour
- [ ] **Serverless PNG export** *(§4.2)*
- [ ] **Deploy to Vercel**

## 9. Dev loop & operational notes (gotchas)

Hard-won; read before fighting the tooling again.

**Where things live (current):**
- `src/tiling/` — the pure, isomorphic engine (no React/DOM/canvas, no pixels). `types.ts`,
  `geometry.ts`, `shapes.ts`, `stitch.ts` (the shared edge-detection step), `graph.ts` (queries),
  `generators/` (one per tiling). Public API via `src/tiling/index.ts` — import from there.
- `src/components/TilingCanvas.tsx` — the **live** interactive Konva renderer; the ONLY file that
  imports `konva`/`react-konva`. **Interaction:** tap = inspect a tile (always), two-finger (touch) /
  middle-mouse drag = pan, pinch / wheel = zoom. A one-finger **drag** depends on the `dragMode` prop
  (the Workspace "drag" popup): **off** (default — no capture; `touch-action: pan-y` lets the mobile page
  scroll), **paint** (writes the chosen target — visited / A / B / C), or **select** (a marquee box →
  `onSelectTiles` with every tile whose centre is inside). A **display chip** (Workspace) cycles tile rendering —
  `edges` / `none` / `stats`; in `stats` the tile number, visited `vN`, and any non-zero registries
  (`A# B# C#`) print inside each tile, but only once tiles are a few screen px (`MIN_LABEL_PX`), so on
  dense grids you zoom in to read them (you can't fit thousands of readable labels at fit). In `stats` a
  **lime arrow** (`traverserHeads` prop → `drawTraverserHeads`) marks each traverser head + heading. `src/canvas/`
  holds its pure, tested helpers — `view.ts` (world↔screen transform), `pick.ts` (hit-testing),
  `stroke.ts` (paint gap-fill), `overlay.ts` (per-tile run state — the visit step-list + A/B/C
  registries, plus its updaters), `clipboard.ts`, `buildTiling.ts` — imported via `src/canvas/index.ts`.
- `src/components/TilingDebugView.tsx` — the original dependency-free SVG renderer. Still **live**: it
  draws the tiling-picker gallery thumbnails (`TilingThumbnail.tsx` → `TilingPicker.tsx`). Not used for
  the main canvas (that's the Konva `TilingCanvas`), but don't delete it — the picker needs it.
- `src/components/Workspace.tsx` — the Canvas-page multi-pane workspace (canvas + Inspect /
  Traversers / Coloring docks); **builds the `Tiling`** from the picker `tilingId` + grid-size, and
  owns selection (`selectedIds` — one tile, or many from a select-box), the per-tile **state overlay**
  (`TileState` — a visit step-list + the A/B/C registries; see `src/canvas/overlay.ts`), the **drag**
  control (a popup choosing off / select / paint→target), and the copy/paste clipboard (all kept off the
  immutable `Tiling`, keyed by tile id). The Inspect dock has three states: **1** tile → full stats +
  controls (visits ± as step −1, registries ±, traverser Place/aim/Remove); **many** tiles (box-select) →
  no per-tile stats, just the same edits applied to **all** at once (Place on all / rotate all / Remove
  all / ±); **0** → a hint. It also owns the **traverse run**:
  authored **`seeds`** (placed + aimed walkers — the savable starting state) vs a throwaway **`runLive`**
  copy (null while stopped), a `running` flag + a `setInterval`/`requestAnimationFrame` **clock**
  (`slow`/`fast`/`max`), and the **Play / Pause / Stop** controls. **Stop** discards `runLive` and clears the
  run trail → the seeds reappear; **Reset** removes the seeds too. The Inspect Traverser section places/aims/
  removes seeds **only while stopped** (a run owns the walkers). Grid resize is locked while a run is active
  (`runLive !== null`). On **mobile**, Fit / Reset / grid-size collapse behind a **⋯ dropdown**
  (`.canvas-more` trigger + `.canvas-extra` popover, outside-tap/Escape to close); inline on desktop.
- `src/components/Panel.tsx` — reusable collapsible dock panel (collapses to a thin rail).
- `src/components/HelpButton.tsx` (+ `.css`) — the reusable faded **"?" explainer**: a small muted
  button that opens a little info dialog (reuses the TilingPicker modal pattern — portal, Escape,
  backdrop, focus). Use it for non-obvious concepts (ethos §2); the Predicate + Coloring panes float
  one in their **top-right corner** (`.pane-help`, absolute), not inline with the lead text.
- `src/dsl/` — the **pure tile-predicate DSL** (no React/DOM/Konva), public API via `src/dsl/index.ts`.
  `types.ts` (AST: numeric `Expr` + boolean `Pred`, incl. the `shape`/`tile-type` leaf), `lex.ts`,
  `parse.ts` (recursive descent), `serialize.ts` (canonical text = the auto-name), `eval.ts`
  (`evalNumber`/`evalPredicate`; ÷/% by zero → 0; missing attr → its `default`), `attributes.ts` (the
  keyword→compute registry + `EvalContext`), `edit.ts` (`replaceAt` for the visual editor). Reused by
  the visual editor + future traversers, so keep it pure.
- `src/colorizer/` — pure `colorize(rules, predicateText, tiling, overlay, indexById) → Map<id, rgba>`:
  evaluates each rule's predicate once, alpha-composites matching rules top→bottom (per-rule opacity =
  blend), resolves flat/ramp (modulo + optional breakpoints). Memoized in Workspace, **not** per frame.
- `src/traverse/` — the **pure traverse engine** (no React/DOM/Konva), public API via `src/traverse/index.ts`.
  `types.ts` (`Traverser {id,tile,heading}` — heading in radians, world y-up, same convention as a side's
  outward `normalAngle`; `TraverseState`; `TickResult`), `step.ts` (`chooseMove` = least-turn to an adjacent
  **unvisited** tile, returning the new heading; `stepTraversers` = the synchronous tick: read the frozen
  overlay → compute all moves → coalesce same-tile walkers → write one visit per target at the new step;
  `headingOptions`/`rotateHeading` for the edge-snapped Inspect aim). May import `src/tiling` + the overlay
  helpers; the basic behaviour is hardcoded, with the **DSL-driven** traversers (§5) to slot in behind the same
  `stepTraversers` shape — so keep it pure.
- `src/state/` — localStorage-backed stores: `predicateStore.ts` (custom predicates as DSL text +
  name), `coloringStore.ts` (the ordered rules, key `…:coloring:v2`), `persist.ts` (SSR/quota-safe
  load/save + `newId`). Pure list updaters are unit-tested; the hooks wire them to persistence.
- `src/components/{PredicatePane,ColoringPane,ColorField,ColorPicker,ReorderableList,TrashButton}.tsx`
  — the panes + their pieces. `ReorderableList` is a dependency-free pointer drag-reorder (touch+mouse);
  `ColorField` writes a coloring rule's colour as a readable sentence (a `+` turns one colour into a
  ramp); the colour picker is the native input (opacity lives on the **rule**, not per colour).
- **Tile fill now comes from the coloring rules**, not visit counts: Workspace passes a precomputed
  `colorFor` map into `TilingCanvas`; `drawTiles` paints the base then that colour. The old visit-count
  shading is removed — **drag-to-paint still records `visited`/A/B/C data** (the rules read it), it just
  no longer colours tiles itself.
- **Canvas page layout:** full-height on **desktop** — `App.tsx` adds an `app-canvas` class so `.app`
  becomes a fixed-height, non-scrolling viewport (`App.css`, `@media min-width: 64rem`); the workspace
  fills it and only the canvas (pan/zoom) and docks (own overflow) scroll. There's **no page header**
  (the nav's Canvas tab covers it). **Mobile** keeps the normal stacked, scrolling layout — don't
  re-add a header or a fixed page height there.
- Edge numbering has **two layers**: internal **local CCW side index** (geometry/winding) vs the
  user-facing **clockwise-from-top** number (`clockwiseEdgeOrder`). Don't conflate them.

**Running commands (tool shells):** `node`/`npm.cmd`/`npx.cmd` are NOT on PATH here — prepend it
every command: `$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx.cmd vitest run`
(`npm.cmd run build` / `npm.cmd run lint`). See §3.

**Preview server:** start via the preview tool using `.claude/launch.json` (name `dev`) — it runs
Vite through `node.exe` directly on **port 5174**, dodging the npm-shim policy. Don't launch the dev
server through Bash.

**Phone tunnel (develop on the go).** This network **blocks `trycloudflare.com`** — `cloudflared
tunnel --url …` fails with `context deadline exceeded` because TCP 443 to `api.trycloudflare.com` is
dropped (ping/DNS resolve fine, so it *looks* like it should work; it won't). Don't retry cloudflared
here. **`loca.lt` and `ngrok` endpoints ARE reachable** — use **localtunnel**: in a terminal *the owner
keeps open* (with the dev server up on 5173), `npx.cmd localtunnel --port 5173 --subdomain exploroboros`
→ `https://exploroboros.loca.lt` (drop `--subdomain` for a random URL if it's taken). The loca.lt
reminder page's password is the dev machine's **public IPv4**. Two gotchas: (1) `vite.config.ts` needs
`server: { allowedHosts: true }` or Vite returns "Blocked request" for the tunnel's Host header (added
2026-06-27); (2) **never launch the tunnel as a tool background process** — it prints its URL then exits
0 on stdio EOF within seconds; it must run in a real, persistent terminal. ngrok (free signup + authtoken)
is the sturdier backup if loca.lt gets flaky.

**After deleting/renaming a component:** Vite keeps the old module in its HMR graph and spams
`[vite] Failed to reload <file>` errors (the page may error too). Hard-reload the page; if it
persists, **stop + start the dev server** to clear the module graph and console buffer. The
production `build` is the source of truth for "does it actually compile" — it's unaffected by stale HMR.

**Don't trust preview screenshots for layout/width.** A wide-viewport screenshot renders content at
actual pixels into a fixed-width image, so a correct full-width layout *looks* left-weighted with
empty space on the right. Measure instead: `preview_eval` + `getBoundingClientRect()` (and compare
`document.documentElement.scrollWidth` vs `clientWidth` for real overflow).

**Phantom mobile horizontal scroll.** The emulated mobile viewport uses a desktop-style ~20px
scrollbar, so `clientWidth` < `innerWidth` and full-bleed elements (e.g. the nav) report ~20px of
overflow that does NOT happen on real phones (overlay scrollbars). Verify by listing elements whose
`right > clientWidth` before treating it as a real bug.

**Tests:** no global test setup file, so `@testing-library/react` renders accumulate within a file;
`screen.getBy*` then throws "multiple elements". Add `afterEach(cleanup)` in component tests that use
`screen` (or scope queries to each render's `container`).

**Konva + HMR ("Several Konva instances detected").** Editing the Konva-importing module
(`TilingCanvas.tsx`) under Vite HMR reloads it repeatedly, so the page accumulates several Konva
instances and react-konva logs reconciler / `<Canvas>` errors — *even though the render looks fine*.
It's a dev-HMR artifact, not a real bug: **stop + start the dev server** for a clean read (a fresh load
has a silent console). The production `build` is unaffected. A telltale variant after several edits: the
page reloads but the Stage never mounts — `size` stays 0×0, there are **no `<canvas>` elements** (only the
`.canvas-hud` shows), and the console is silent. Same cause, same fix (restart); a fresh load renders fine.
Note the 0×0 is `requestAnimationFrame`-gated: `TilingCanvas` measures its host in a rAF
(`TilingCanvas.tsx`), which a backgrounded/throttled headless tab won't fire, so the Stage waits for a paint
that never comes — a `preview_screenshot` (which forces a paint) usually mounts it.

**Preview-capture can wedge after many ops in a session.** Seen 2026-06-27: `preview_screenshot` timing out
after 30s **even on the canvas-free landing page**, with a silent console, surviving `preview_stop`/`start`
(the browser tab persists across server restarts). That's the capture subsystem, not the app — the dev server
+ `build` are fine and the owner's own browser renders normally. Don't loop on it: confirm via build / lint /
tests (the canvas render fn only runs *after* the Stage mounts, so a no-canvas state can't be caused by edits
to `drawTiles`) and hand visual checks to the owner's device. Retrying later sometimes finds it unstuck.

**Testing a Konva component (jsdom has no canvas).** Don't render `<TilingCanvas>` in Vitest — jsdom
can't back a real canvas. Keep the meaningful logic in the pure `src/canvas/` modules (unit-tested
there); where a component test needs the canvas, **`vi.mock` it** — `Workspace.test.tsx` mocks
`./TilingCanvas` with a tiny DOM stand-in that exposes the `onSelect` callback, so the
selection→inspect / paint / copy-paste wiring is testable without a canvas. The interactive feel is
verified on a real device.
