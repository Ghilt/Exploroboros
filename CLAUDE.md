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
- **No merge commits — keep history linear.** Always **rebase**, never merge: `git pull --rebase` (the repo
  has `pull.rebase=true` set), and rebase a divergent branch onto its base rather than merging it. Do not
  create merge commits.
- **Rebase onto `main` BEFORE executing a plan — start from the latest state.** At the start of implementation
  work (once a plan is approved, before writing code), bring the working branch up to date with `main`
  (fast-forward where possible, per the rebase rule above) so you build on current code, not a stale snapshot.
  This matters most in **worktree sessions**, which are cut from `main` at creation and silently drift behind as
  `main` advances — e.g. this repo hit exactly this: a session cut at recipe **schema v2** while `main` had moved
  to **v3**, so the owner's exported images wouldn't reopen until the session was rebased (discovered only
  mid-feature). Catching up first avoids building on outdated behaviour/formats and the friction of a mid-work
  rebase. (If there are uncommitted changes: stash → rebase → reapply; see the worktree recipe in §9.)
- **Worktree sessions target `main` by default — the owner does NOT want a parked feature branch.** A git
  worktree can't check out `main` (it's checked out in the main repo), so the harness puts a session on its
  own `claude/<name>` branch — but treat that as **transient plumbing, not a deliverable**. Land work **on
  `main`**: commit on the worktree branch, then rebase onto `main` and **fast-forward `main`** to it (linear,
  per the rule above) so the result is on `main` as if worked there. Don't leave work parked on the branch,
  and don't open a PR or keep a standalone branch **unless the owner specifically asks for one**.
  (Per-worktree preview ports + announcing which sessions are running: §9.)

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
- **Image export (added 2026-06-28, resolves §4.2):** 100% **client-side**, **no new dependencies**. A pure,
  isomorphic core in `src/export/` (run-to-completion, seed remap, colorize, sizing, a Canvas2D renderer, a
  hand-rolled PNG **tEXt** metadata writer) runs inside a **Web Worker** (`new Worker(new URL(...), {type:'module'})`,
  Vite-bundled to its own ~50 KB chunk) that rasterises via **OffscreenCanvas** — so a big, slow export never
  freezes the interactive canvas — with a main-thread `<canvas>` fallback. The full generation **recipe** is
  embedded in the PNG so images can later be reopened (§6/§9). Uses only platform APIs (Worker, OffscreenCanvas,
  Canvas2D, Blob) — the §3 registry is unchanged.
- **Hosting + community-gallery backend (added 2026-07-04, `80b2d64`):** **Cloudflare Pages** serves the
  SPA; **Pages Functions** serve the `/api` (file-based routes in `functions/api/`), backed by **D1**
  (SQLite — gallery metadata) + **R2** (compact display images). One origin → no CORS, native
  `context.env.DB`/`BUCKET` bindings, one deploy + one dashboard (also where the owner deletes bad uploads
  — no in-app admin). Supersedes the never-wired Vercel plan. New dev deps (owner-approved 2026-07-04):
  **`wrangler` ^4.107** + **`@cloudflare/workers-types` ^4** (+ **`concurrently`** to run the local
  build-watch + server together) — no router lib (file-based Functions routing). The server reuses the
  pure `parseRecipe` to validate uploads. Config in `wrangler.toml`, schema in `migrations/`; local dev
  with the backend = **`npm run dev:local`** (see §9). **Deployed
  2026-07-04 → https://exploroboros.pages.dev** (`npm run deploy`; D1 `exploroboros` + R2
  `exploroboros-images` on the owner's account). See the §6 gallery entry + §9.
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
2. **Serverless image export** *(trigger: building export).* ~~`@vercel/og` vs `@napi-rs/canvas`.~~
   **Resolved 2026-06-28: no backend — export runs 100% client-side** (owner's call). The run cost scales
   with tiles+ticks (cheap) and rasterising vector fills is fast even at 4K+, everything is already pure, and
   the metadata-in-PNG means anything is re-generable in the browser. A Web Worker (+ OffscreenCanvas) keeps
   big, slow exports off the main thread; PNG metadata is a hand-rolled tEXt chunk (no dep). See `src/export/`
   (§9) and the image-export roadmap entry (§6). A backend stays an option only if very weak phones or
   server-rendered share images ever demand it.
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
- **Image export — client-side high-res PNG (done 2026-06-28, `97c6251`):** an Export menu in
  the canvas top bar runs the traverse to completion on its OWN large grid (the **export grid** is a separate
  knob — the interactive grid is just for exploring; walkers/paint are remapped onto it by bounds-centre
  offset), colours it, and rasterises to a PNG at a chosen pixel size — all in a **Web Worker** so the live
  canvas never freezes. Each export **auto-downloads** AND drops a **thumbnail** in the bottom-right strip;
  clicking a thumbnail swaps the canvas for a **zoom/pan image viewer** (the live canvas becomes a corner grid
  chip to return). The full generation **recipe** is embedded in the PNG (a tEXt chunk), **versioned with a
  migration chain** so a future build can still read today's images (and refuses an image from a *newer* build
  rather than misreading it) — see §9. Pure core + tests in `src/export/`; no new deps (§3/§4.2). Also fixed:
  tiles render **flush** when edges are off (the white anti-alias seam), in both the export and the live canvas.
- **Reopen from PNG (done 2026-06-28, `a1e6d0b`):** a saved creation's recipe loads back
  into the canvas. Two entry points: **click a gallery image** (the gallery carries placeholder recipes for
  now — `src/data/galleryRecipes.ts`), or **drag an exported PNG onto the canvas** (decodes the embedded
  recipe). `Workspace.loadRecipe` REPLACES the setup — tiling, grid (the big export grid clamped to an
  explorable size for editing), walkers + hand-paint (placed by their portable centre-offsets), and the
  predicate/traverser/coloring library (the stores gained `setAll`). The gallery hands off via
  `src/state/pendingRecipe.ts`; the Workspace consumes it on mount. *Known follow-up:* the original export
  resolution isn't preserved into the export menu after reopen (re-pick it).
- **Auto-place seeding (done 2026-07-03, `3e7a601`):** an `auto-place line {angle, percent, edge} if
  <predicate>` statement in a traverser definition seeds walkers by a **grid-relative** rule (resolved against
  whatever grid renders, so a pattern lines the edge on the big export grid too — unlike a hand-placed seed's
  absolute centre-offset). Ghost heads, non-removable (edit the rule), hand-placed seeds win a shared tile;
  rides in the traverser text so no recipe bump. Pure `src/traverse/autoplace.ts`; export + live editor share
  the merge (preview == export). Same commit fixed the Guide's in-page links (hash-routing bounce).
  *(Superseded 2026-07-04 — auto-place moved out of the traverser DSL into the Initial-state pane below.)*
- **Initial-state DSL — auto-place moved to its own pane (done 2026-07-04, `5155446`):** `auto-place` left the
  traverser DSL for a dedicated right-dock **Initial state** pane that seeds the *whole* starting state —
  traversers **and** per-tile registries `[A]/[B]/[C]` **and** `visited` — by grid-relative rules, encoded in
  the PNG so a creation reopens intact. `line {what, angle, percent, param}` picks the tiles a line crosses;
  `blob {what, x%, y%, radius, param}` a point grown out `radius` tile-rings (1 = one tile, BFS). `what` = a
  traverser (`t1`/name), a registry, or `visited`; the trailing `param` **sets** the heading / value / count,
  overwriting hand-paint. Pure `src/initstate/` (lex/parse/serialize/compile/geometry/resolve); recipe **schema
  v3** (+ v2→v3 migration — old PNGs still open). Traversers numbered `1:`,`2:`… (referenced `t1`/name). Preview
  == export (both call `resolveInitialState`). Removed the traverser-DSL auto-place; `src/traverse/autoplace.ts`
  is gone.
- **Canvas UI/UX cleanup (done 2026-07-04, `21bcec0`):** all panes 2× wide with a **one-open-per-side
  accordion** (title-click collapse; `Panel` now controllable); the debug toggle removed and the **traverser
  decision log** folded into the **bottom of Inspect** (traced only while Inspect is open); the **Predicates
  dock** replaced by a **"Custom predicates" popup** (`CustomPredicatesDialog`) reached by a badge on the
  Traversers / Coloring / Initial-state panes; layout **left: Traversers, Coloring · right: Inspect (+log),
  Initial state**; **pan/zoom keep the selection**; selecting a tile **auto-opens Inspect**; guide links open a
  new tab. Plus: Traversers list **red-badges** non-compiling defs, and predicate/traverser **names forbid**
  DSL reserved words + `t/e/r/l`+N patterns + duplicates (`src/dsl/reserved.ts`).
- **Community gallery — upload + browse (done 2026-07-04, `80b2d64`):** a public, no-login gallery anyone can
  share an export to (global **10/day** cap). Canvas Export → **⤴ Share** (name + message) re-encodes a compact
  WebP (`src/upload/compactImage.ts`) and posts it + the recipe; the **Gallery page** is now live — search /
  sort (new·top·name) / filter-by-tiling, **infinite scroll** (keyset cursor), **upvotes** (localStorage
  soft-guard), and a **spotlight** (message + tiling + **Import to canvas**, reusing `setPendingRecipe`).
  Backend = **Cloudflare Pages Functions + D1 + R2** (`functions/api/`, `migrations/`, `wrangler.toml`); uploads
  validated server-side by the pure `parseRecipe`. Pure client modules `src/gallery/` (api + feed/vote hooks) +
  `src/upload/`. Verified end-to-end on a local `wrangler pages dev` seeded with the 29 existing gallery
  fractals, then **deployed live 2026-07-04 → https://exploroboros.pages.dev** (launched **empty** — fills
  from uploads; the owner deletes bad uploads via the Cloudflare dashboard). Custom domain `exploroboros.io`
  is a todo (§8).
- **Expanded tiling set (done 2026-07-04, `8b13473`):** four more tilings beyond the 11 uniform + kalleboda —
  **3.4.6.12** & **3.4.3.12** (2-uniform dodecagon tilings), **Rhombille** (tumbling-blocks Laves dual), and
  **Kagome & Squares** `[3.4.4.6; 3.6.3.6]` — with a vertex-config oracle test proving the 2-uniform ones exact.
- **Aperiodic tilings (done 2026-07-04, `f3f7d27`):** **Penrose** (P3 fat/thin rhombi, Robinson-triangle
  deflation) and the **einstein "hat" monotile** (a port of Kaplan's H/T/P/F metatile substitution) — both
  substitution-generated, not lattices. The hat needed mid-edge (T-junction) vertices to satisfy `stitch()`.
- **DSL lists + reducers + directive fix (done 2026-07-05, `4a140c4`):** general lists `[a, b, …]` in the
  shared tile-predicate DSL (so conditions, `put` values, and Coloring all get them) — reducers `:sum`
  (default) / `:avg` (ceil) / `:min` / `:max` / `:all` / `:any` / `:none` / `:xor` (exactly one), edge ranges
  `[e1..3]` and multi-target `put [A, B]`. And a **directive semantics fix**: a move is decided forbid > allow
  > own-guard, so `always allow` overrides (never gates) — gallery recipes migrated to the `forbid` gate idiom.
  Groundwork toward the DSL-driven traversers below.
- **Traverser DSL — `@`-chained moves, bare registries, `if {}` blocks, `find-tile` search, `exists@path`
  (done 2026-07-06, `726b28f`):** move chains now join with `@` (`move e0@e4`) instead of `->`, matching how
  attribute `@`-paths already read neighbours — one separator, not two (`->` is gone; no recipe used it).
  Tile registries A/B/C no longer require brackets (`put A = 1`, `A == 5`) now that `[…]` unambiguously means
  a list — `[A]` still works as a one-element list. `if <predicate> { … }` groups any statements (nesting OK)
  to run only when the guard holds; an optional **`else { … }`** (and **`else if`**, a nested if-block in the
  else) covers the other case — the `else` may sit on the `}` line or its own line (both K&R and Allman brace
  styles parse) *(else added 2026-07-06, `a2dac29`)*. `find-tile <predicate> { <moves> }` runs a
  breadth-first **ghost-search** — its `move` lines spread the search tile to tile without moving the real
  walker, capped by the block's own **`max-split` (a `max-split = N` line inside it, DEFAULT 1** — like a
  walker's, so the search follows a single path by default; raise it to fan wider) *(max-split added
  2026-07-06, `a2dac29`)* — and returns the nearest matching tile (always ≥1 hop away); usable inline as a
  move target or as its own statement, referenced afterward as `f0`/`f1`/… (numbered by **source position**;
  a dangling `fN` is a compile error). An `fN` is a valid path
  **base** (`f0`, `f1@e0`, `tile-type@f1`) but never a later hop (`move e0@f1` is rejected). **`exists@path`**
  (added mid-session — the owner asked how to tell "find-tile found nothing" apart from "found a tile whose
  value happens to be 0/false", which nothing could answer: every off-grid fallback reads identically to a
  legitimate zero/false) tests whether an `@`-path resolved to a real tile at all; works on any path, not just
  `fN` (`exists@e0` tests a tiling boundary). New pure `src/traverse/lang/find.ts` (`bfsFind`); recipe
  **schema v6 → v7** (additive — old images still open; the bump exists only so a new-syntax image is stamped
  and an older build refuses it cleanly rather than failing to compile the traverser). Guide gained a "Blocks
  & search" chapter; autocomplete / in-pane syntax / the visual chip editor (a static read-only chip for
  `exists`, like the existing list-comparison forms) updated to match.
- **Export-failure debug log (committed 2026-07-06, `89929a7`):** a failed export (non-abort) now
  auto-downloads a **self-contained JSON debug log** to the user's downloads (the toast names the file)
  instead of only flashing "Export failed". The owner asked for something they can hand to a developer to
  understand a failure without the session — so it embeds the full **recipe** (traverser DSL, coloring,
  initial-state, predicates, seeds, paint, tiling, grid, output) plus which pipeline **stage** died
  (build-tiling / prepare / run / colorize / size / render / thumbnail / encode-blob / embed-metadata),
  the worker-vs-main path, the underlying error name/stack, the environment, the caps, how far the run
  got, and **guarded diagnostics** re-derived from the recipe: the real tile count, the caps-clamped
  target canvas size (reveals an OOM-sized request — the likely "export worker failed" cause), a
  per-traverser **compile check** (a broken definition is flagged by name), seed defs that resolve to
  nothing, and the initial-state compile. Pure `src/export/debugReport.ts` (never re-runs the traverse;
  every diagnostic guarded so the log always builds) + DOM-side `src/export/debugLog.ts`; a new
  `ExportFailure` error carries path/stage/cause, and the worker now sends name/stack/stage across the
  boundary (with `worker.onerror` capturing the `ErrorEvent` for a bare crash). **The intermittent real
  failure could not be reproduced on demand**, so the log-generation is verified (build / lint / 836 tests
  + a live-runtime exercise) but the on-device failure→download awaits the next occurrence. See §7/§9.
- **Downloadable traverse log (committed 2026-07-06, `8eebf56`):** a "⤓ Download full log" button (bottom
  of Inspect) runs the current setup to completion **traced** and downloads a self-contained JSON — every
  tick's per-walker decisions, a tile-geometry dictionary (id → shape + x,y), a per-tick summary, and the
  final state — for offline analysis / handing to a developer. Pure `src/traverse/traceLog.ts`. Built while
  diagnosing an owner "asymmetric fractal" report on Kagome & Squares, which turned out to be **not an engine
  bug**: absolute edge numbers are clockwise-**handed**, so a triangle's selective `eK@eK` routing is chiral
  (only a full fan preserves the tiling's mirror symmetry) — see §9. A permanent `symmetry.test.ts` now guards
  that the engine keeps full-fan patterns symmetric.
- **Next up:** **`exploroboros.io` custom domain** (register + attach — §8) → **DSL-driven traversers** (custom
  rules in the Traversers pane — paint/move/visit/split/guards/state, §5; reuses the predicate DSL) → **persist
  user exports across reloads** (IndexedDB).

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
| 2026-06-27 | Drag modes — one drag popup (Off default / Select / Paint→Visited·A·B·C, no separate control); off lets the mobile page scroll; select boxes a group → multi-tile Inspect (no per-tile stats) with Place-on-all / rotate-all / Remove-all / ± | ✅ yes | owner verified the running app (off lets the page scroll, the popup picks a paint target, box-select a row → place + rotate all at once) and said "commit" | `9b3f94b` |
| 2026-06-27 | Paint-select (freehand drag-to-select) + Shift-additive box/paint select; selection clears on pan/zoom/paint/empty-tap; painted tiles flash a fading outline | ✅ yes | owner verified after a hard-reload (paint-select gathers a non-box group; Shift+box/paint adds to the selection; plain replaces) and said "commit" — note the earlier "paint-select broken" was stale Konva HMR (§9), not a bug | `0957030` |
| 2026-06-28 | Image export — client-side high-res PNG (Export menu: grid size / resolution / background / edges; Web Worker render; auto-download + thumbnail strip + zoom/pan viewer; versioned recipe in PNG metadata; Abort; flush no-edge tiles in export + live canvas) | ✅ yes | owner reviewed the running export across iterations on desktop + mobile — caught the seam bleed + the off-screen mobile dialog (both fixed), asked for Abort + metadata versioning — then said "commit"; backed by build / lint / 394 tests + in-browser checks (worker render, recipe metadata round-trip, abort mid-run, 0 seam pixels, mobile dialog within viewport) | `97c6251` |
| 2026-06-28 | Reopen a saved creation — click a gallery image / drag an exported PNG onto the canvas → restores tiling, grid, walkers, hand-paint, and the traverser / predicate / coloring library | ✅ yes | owner opened gallery images into the canvas ("it works!"), flagged that traversers weren't loading into the pane (placeholder recipes had none) — fixed so opening loads traversers + named predicates + coloring — then said "commit"; backed by build / lint / 400 src tests + in-browser checks (gallery open switches tiling + populates all three panes; PNG drop round-trips an export) | `a1e6d0b` |
| 2026-06-28 | "Load prototype ports" debug button — gasket traverser ported from the prototype (traversal only; colour stays separate) | ✅ yes | owner approved ("good commit") with the change served on this worktree's OWN preview (port 5238, footer-labelled); backed by build / lint / 396 tests + served-source confirmation; gasket DSL compiles (max-split 3, two move gates, five moves) | `af6a65b` |
| 2026-06-28 | Export as a cancelable background job — Export closes the dialog immediately; the job shows as a running placeholder thumbnail (spinner, not clickable, X aborts → terminates the worker), then flips to the finished clickable thumbnail; thumbnail action buttons moved inside the corner (no clipped buttons, no stray horizontal scrollbar) | ✅ yes | owner verified the running app and said "commit"; backed by build / lint / 402 src tests + in-browser checks (dialog closes, running placeholder + spinner, abort removes the job, finished thumbnail clickable, strip has no horizontal scroll + buttons within bounds) | `1c1e9ac` |
| 2026-06-28 | Inspect/canvas UX polish — tile type in Inspect; registries under an "advanced" collapsible; compact −0+ steppers; Copy/Paste above advanced; traverser subheading on its own line; wider panes (1:1:1:2); traverser head always drawn (any display mode), hides that tile's labels, now a solid black pointy triangle | ✅ yes | owner reviewed on this worktree's own preview (port 5175) across iterations and said "this is good, commit"; backed by build / lint / 402 tests + an injected-DOM measurement (no horizontal overflow in the 17rem Inspect dock) | `7c97c54` |
| 2026-06-28 | Gallery — 23 prototype fractals ported to real recipes (traverser + colour ramps rescaled so they ring at our grid's tick scale; clicking an image reopens the real setup to regenerate in-tool and compare to the thumbnail); all gallery images slimmed to WebP (~174 → 21 MB) | ✅ yes | owner reopened a ported fractal + exported it on black and compared to the prototype thumbnail ("it looks good") — backed by build / lint / 402 tests incl. a headless run-to-completion grow check per recipe | `0d939f7` |
| 2026-06-28 | Export background is the whole plane — unpainted tiles take the chosen background (transparent leaves them clear), instead of fixed-white tiles with the background showing only as a border | ✅ yes | owner exported on a black background, saw the fractal on solid black matching the prototype renders, said "it looks good" | `ac23bb9` |
| 2026-06-28 | Visual language + component system — `docs/VISUAL-LANGUAGE.md`; reusable **SegmentedControl** (sliding indicator measured to the selected segment) / **Stepper** (single-digit −value+) / **Toggle** primitives; canvas top bar unified into ONE transport (play/pause/stop + speed segmented); speed & display are segmented controls (state shown, not cycling chips); tiling/drag/export menu triggers unified to one rounded-rect dropdown look (buttons no longer pills) with **Export moved rightmost**; Inspect steppers + placed-traverser controls + predicate Text/Visual + export edges toggle rebuilt on the primitives; design tokens (spacing, `--control-h`, radius ladder, elevation, state roles); fixed over-rounded "+ add rule"/"+ New" | ✅ yes | owner reviewed on this worktree's preview (port 5494) across iterations — flagged the segmented fill not aligning with the dividers (fixed: indicator measured to the selected segment's geometry) and the pill-shaped triggers (fixed: unified rounded-rect), then asked to move Export rightmost — and said "commit to master"; backed by build / lint / 411 tests (9 new primitive tests) + in-browser checks (uniform 1.9rem control heights, segments tile cleanly with the indicator matching the selection, the three triggers render identically) | `3147f4e` |
| 2026-06-28 | classic-2 fractal ported to the gallery (relative-nav XOR maze onto octagons — it was wrongly grouped with the rotation-routed fractals and deferred; classic itself stays deferred, it IS wedge-rotation-routed) | ✅ yes | owner asked why classic/classic-2 weren't ported; re-checking showed classic-2 has no rotation routing, so ported + verified (grows a maze, 81 ticks ~36% fill, headless grow-check) and owner said "commit"; build / lint / tests green | `41cc510` |
| 2026-06-28 | Export dialog — "pixels per tile" knob (grid size derived + shown as a hint, e.g. "grid ≈ 85 × 85 tiles") replaces the grid-size field; resolution is an explicit width × height with a **chain-lock** (linked by default — editing one scales the other; toggle to set them apart); the four right-hand controls (px/tile, width, height, background) share one 7rem column, aligned. Recipe schema → **v2** (output stores width × height; v1→v2 migration keeps old PNGs readable); `pickCanvasSize` takes explicit W×H (tiling fit/centred → a non-square size letterboxes onto the background) | ✅ yes | owner reviewed on this worktree's preview (port 5494), asked for px/tile + W×H-with-chain-lock then for the inputs aligned to one width — both done — and said "commit"; backed by build / lint / 412 tests (updated sizing/generate/recipe + a new v1→v2 migration test) + in-browser checks (all four controls 7rem wide; derived readout 85 = round(2048÷24)) | `0b573d4` |
| 2026-06-28 | Tiling-agnostic `orientation` attribute — a 0-based index of a tile's rotational variant within its shape (kalleboda wedges 0–3 / octagons 0; triangular up/down 0/1), so traversers route by it instead of the per-tiling `coordinate[slot]`; shown in Inspect and in the predicate menu + coloring ramp dropdown | ✅ yes | owner verified on this worktree's preview (5238) — Inspect shows orientation per tile across tilings — and said "this is good"; build / lint / 424 tests incl. new orientation unit tests | `a9c1142` |
| 2026-06-28 | classic / ringlare / wedge-seek ported to the gallery (3 of the 4 rotation-routed fractals; sierpinski still deferred — its absolute-compass wedge routing doesn't map onto our ~22.5°-rotated frame). classic crosses wedges with `move straight` (the wedge through-pairing), ringlare steers by visited-edge counts, wedge-seek is a shape fan — none ended up needing the `orientation` attribute (the through-pairing subsumed classic's rotation routing) | ✅ yes | owner reviewed the gallery regenerations on 5238 and approved; each grows to a natural stop in the headless grow-check (classic 36%, ringlare 11% single-walker rings, wedge-seek 53%); classic re-derived against the new wedge "straight" | `f6e64a8` |
| 2026-06-29 | Traverser DSL — directives flipped to **predicate-first** (`directive if <predicate> always forbid\|allow move`); new **`@ target`** decoration (the move's destination) so predicates read the CURRENT tile by default everywhere and gate the destination only when decorated; `@ target` also filters a move/morph rule's candidates per-branch (`if visited > 0 @ target then move [...]`). Guide reworked: single "Naming an edge" table + a compact "Move commands" examples table, "Conditions" → "Predicates" w/ a decoration table, new Directives grammar. Gallery + prototype-port directives migrated to `@ target` (behaviour preserved); no recipe migration (dev state — saved PNGs hand-fixed) | ✅ yes | owner reviewed on this worktree's preview (5553) and said "this seems good, please commit"; build / lint / **431 tests** (7 new: `@ target` directive, per-target rule guard, current-tile directive, parse/serialize round-trips) + served-source & DOM checks (guide renders the new sections; no old grammar anywhere in src) | `76dc35a` |
| 2026-06-29 | Traverse speed control → **step / slow / fast** (was slow/fast/max). `step` is manual — each click advances exactly one tick (the first click on a stopped run places the seeds, like Play's first beat); the continuous ▶ is disabled in step mode (advance via the step button). `slow` = 90ms (old "fast"), `fast` = one tick per frame (old "max"); default `slow`; the old 300ms slow dropped | ✅ yes | owner reviewed on this worktree's preview (5553) and said "please commit"; build / lint / **432 tests** (updated the speed-control test + a new step-mode test) + DOM check (control renders step/slow/fast with `slow` selected; the click behaviour is covered by the jsdom test since the headless tab doesn't fire React clicks) | `dc9f53a` |
| 2026-06-30 | **Debug mode** — a per-tick traverser **decision log** (toggle in the canvas bar → wide right "Debug" dock): per walker, the statements run + each candidate move and **why it was skipped/rejected**, a loud "no move" banner; **hovering a log row highlights the tiles on the grid** (current / the tile a guard *reads* via `@ edge`/`@ target` / chosen / rejected), click to pin; bounded tick-history scrubber; pairs with the **step** speed. Opt-in pure `TickTrace` (`stepTraversersTraced`) → **zero cost when off** (export path byte-identical) | ✅ yes | owner used it on this worktree's preview (5593) to pin down a long-standing edge bug (next row); build / lint / tests green (16 new: engine trace + the pure highlight mapper) | `58fd0b6` |
| 2026-06-30 | **Fix — edge numbering off-by-one at the 0/360 seam** (the bug the debug log surfaced). `clockwiseEdgeOrder` sorted purely by clockwise-from-top key, so a tile whose top edge sits just **west** of north — a float hair on flat-top octagons (the **slot-0 kalleboda** octagon) or tens of degrees on the chiral snubs — wrapped to ~359° and sorted LAST, rotating the numbering by one so `edge 0` pointed NE. Now **anchors edge 0 on the genuinely most-north edge**, then clockwise | ✅ yes | owner reproduced it via the debug log (`move edge 0` stepping NE off slot-0 octagons) + confirmed the fix on 5593; build / lint / **460 tests** (kalleboda "north = edge 0" regression + a general most-north-is-edge-0 invariant across all 12 tilings) | `e2ffb30` |
| 2026-06-30 | **sierpinski** ported to the gallery — the 4th/last rotation-routed fractal, a nested triangular Sierpinski gasket; finally exercises the `orientation` attribute (each wedge orientation relays a *different* absolute octagon edge). The octagon-fan edge order (`2,3,4,5,6,7,0,1`) **and** the orientation→edge map were found EMPIRICALLY: the two-edge octagon–wedge adjacency makes a low-first `edge 0..7` fan spend both max-split slots on ONE wedge (the walk marches single-file), so the order is tuned to hit two *distinct* wedges. Owner ported it by hand; I wired their version in (new `@ target` directive syntax) | ✅ yes | owner recreated the gasket themselves + said "commit all this to main"; build / lint / **432 tests** + headless grow-check (66 ticks, ~8% from a centre-wedge seed, natural stop) + ASCII confirming the recursive triangular voids | `27a7205` |
| 2026-06-30 | Export dialog defaults to a **black** background (fractals read best on black, matching the prototype renders); white / transparent still available | ✅ yes | owner asked for it + said "commit all this to main"; build / lint / 432 tests green | `9969914` |
| 2026-07-02 | **Fix — edge numbering scrambled on concave tiles (wedge)**; **Inspect tile mini** — a small oriented diagram of the selected tile with every edge numbered, plus a "Straightness" blurb (wedge: dotted opposite-edge pairing; triangle: right-handed). The 0/360-seam fix (row above) anchored edge 0 correctly but still SORTED by outward-normal angle, which only walks the perimeter clockwise for convex shapes — the wedge is concave, so its normals zig-zag and the numbering scattered (rotate didn't cycle 0..7 in order). Replaced the sort with a perimeter **walk** from the anchor (CCW winding → clockwise = decreasing local index); convex tiles unchanged, concave/chiral ones fixed. sierpinski's hand-placed wedge edge refs re-tuned to match (grow-check unchanged) | ✅ yes | owner found the scrambled wedge rotate order, gave the exact wrong sequences per slot; fix verified by a new perimeter-adjacency invariant (`edge-order.test.ts`, all 12 tilings) + owner re-tested rotate on a freshly-uncached port (5601, after an earlier same-port retest was fooled by browser cache from a prior server instance) and confirmed 0→1→…→7; build / lint / **462 tests** | `7df7090` |
| 2026-07-02 | **Refactor — a traverser's heading is now a single edge NUMBER** (the edge its `straight` move exits; 0 = north, clockwise). Turns are pure ring arithmetic (`r1` = heading+1, `l1` = heading−1 mod sides), the arrow **always** points at the heading edge (no "just-placed / first-step" special case), and the wedge's concave straight-through pairing is layered on **only when a walker arrives** on a tile — never during editor rotation. Fixes the two reported wedge bugs: `move r1` aimed at edge 7 now exits **edge 0**, and the `move straight` arrow now points at the real destination edge. The recipe still stores heading as a portable **angle**, converted at the load/save boundary (`remapSeeds` angle→edge, `buildRecipe` edge→angle), so old saved PNGs reopen unchanged (no schema bump); `classic` re-seeded north to keep its first move identical. Removed the old angle-based `chooseMove` / `headingOptions` / angle-`headingArrowDir` | ✅ yes | owner reported the scrambled `move r1`-on-wedge + the wrong `move straight` arrow on-device, specified the edge-number model, approved the refactor + re-verify pass, then said "commit"; backed by build / lint / **464 tests** (edges / step / arrow / exec / trace / recipe rewritten to the edge frame + a new r1-on-wedge regression). **Follow-up:** ringlare / xor-tri / xor-dense regenerate sparser under the new turn arithmetic — gallery re-tune pending | `96ede11` |
| 2026-07-03 | **Traverser DSL — "read another tile" moved off the whole guard onto each attribute as an `@`-path** (was a guard-level `@ target` / `@ edge`). An attribute now carries its own path: `visited@e1`, `tile-type@target`, `[A@r1@e5]`; no path = the current tile, so one predicate can read **several** tiles. `@target` / `@tile N` are terminal (a path's only hop); edge hops (`eN`/`rN`/`lN`/`straight`/`nearest-unvisited`) chain + re-aim. The move/edge token `edge N` → **`eN`**. An off-grid hop makes that attribute default (registry → 0, `tile-type@…` → false). Debug highlights **every** tile a row reads. `src/dsl` owns the path AST + parse/serialize/eval via a `nodeForPath` hook (stays walker-free; colorizer degrades); the traverse layer supplies the hook + detects per-target guards via `predReadsTarget`. Gallery + prototype recipes, the Guide, and the Traversers/Debug help migrated — behaviour identical (per-recipe grow-check unchanged); no schema bump | ✅ yes | owner tried it on this worktree's preview (5582) — asked the off-grid behaviour + why `[A]@e2` fails (path goes INSIDE the brackets: `[A@e2]`) questions, then said "please commit"; build / lint / **494 tests** (new dsl path parse/serialize/eval + `predReadsTarget` + traverse `@`-path / `eN` / per-leaf-redirection cases) + served-source/DOM checks | `2aec24b` |
| 2026-07-03 | **Auto-place traverser DSL — grid-relative seeding.** `auto-place line {angle, percent, edge} if <predicate>` inside a traverser definition seeds walkers by a RULE re-resolved against whatever tiling renders (small preview OR big export grid), so a pattern like "the top row" lines the edge at ANY size — unlike a hand-placed seed's absolute centre-offset, which drifts inward on a larger export. angle 0=row/90=column/±45=diagonal; percent 0–100 from the top-left; edge = the absolute heading (`% sides`); the `if` reuses the tile-predicate DSL. Walkers render **ghostly**, are **non-removable** from the canvas (edit the rule; Inspect says so), and a hand-placed seed **wins** a shared tile. Lives in the traverser text already stored in the PNG → **no recipe/schema change**. Pure `src/traverse/autoplace.ts` (lineTiles + resolveAutoPlacements + mergeByTile); export (`prepare.ts`) + live editor share the merge (preview == export). Also fixed the **Guide in-page TOC/cross-ref links** (hash routing bounced them to the landing page → intercept + scrollIntoView, clear the sticky nav) | ✅ yes | owner tried it on this worktree's preview (5260) across iterations — reported a diagonal/percent line reading "too thick"/doubled; I tried a single-file **lane-nearest** pass, but it looked worse on non-square tilings so **reverted to the straddle line** (thin line, tiles it passes) per owner — then "good commit it"; build / lint / **514 tests** (autoplace geometry/resolver/merge + DSL parse/serialize + export threading) + served-source checks | `3e7a601` |
| 2026-07-03 | **Traverser transport redesign** — Play/Pause is one toggling button; **Step** is a real button (advance one tick, pausing a running run); speed moves to a notched **turtle→rabbit slider** (new `SpeedBar` primitive) with four paces (very slow / slow / fast / max), decoupled from Step and re-pacing a live run, placed just right of the transport buttons. Also **Stop now reverts a run's A/B/C registry writes** back to their pre-run values (snapshotted at run start) — the registry counterpart of how it clears the visit trail while keeping hand-set state | ✅ yes | owner verified on this worktree's preview (5497) across iterations — flagged the speed slider stacked under the buttons made the bar too tall, so moved it to just right of the transport — then said "commit"; backed by build / lint / **502 tests** (SpeedBar unit tests + transport / step / Play-Pause-toggle + `restoreRegistries`) + served-source/DOM checks | `b9c9f7c` |
| 2026-07-04 | **Initial-state DSL — auto-place moved into its own pane** (seeds traversers **+** per-tile registries `[A]/[B]/[C]` **+** `visited`, not just walkers). A right-dock **Initial state** pane (2× wide) holds `auto-place line {what, angle, percent, param}` / `auto-place blob {what, x%, y%, radius, param}` — `what` = a traverser (`t1`/name), a registry, or `visited`; the trailing `param` **sets** heading / value / count; `line` picks the tiles a line crosses, `blob` a point grown out `radius` tile-rings; optional `if <predicate>`. Grid-relative (resolves against whatever grid renders → preview == export). Removed auto-place from the traverser DSL; new pure `src/initstate/`; recipe **schema v3** (+ v2→v3 migration, old PNGs still open); traversers numbered `1:`,`2:`… in their pane (referenced `t1`/name); a short spec now reports the shape template, not a bare `expected ","`. Rule-placed walkers ghostly + non-removable (edit the rule); hand seed wins a shared tile; a set overwrites hand-paint | ✅ yes | owner built a purple XOR fractal with it + said "Excellent commit this feature to main"; earlier flagged the cryptic `expected ,` (→ template error), asked for `1:` numbering + a 2× pane (all done); backed by build / lint / **531 tests** (full `src/initstate` suite + preview==export in `prepare.test.ts` + v2→v3 migration) + in-browser checks (pane mounts, canvas renders, served-source confirmed) | `5155446` |
| 2026-07-04 | **Reopen-from-PNG made discoverable + safety-gated**, plus a real export bug it surfaced. A persistent **"drag an image here to import"** box sits in the canvas (stacked above the tile/FPS HUD, bottom-left) and also opens a system file picker on click — the only import path on touch, where you can't drag a file; both routes share one `importFromFile`. A new **`ConfirmDialog`** ("Replace your current work?") gates the import whenever the panes already hold authored data (predicates / coloring rules / traversers / initial-state text / placed seeds / hand-paint — mirrors Reset's blank check); a blank canvas still imports straight away. The drag-over overlay now explains what dropping does. **Fix — export was baking a run's A/B/C registry writes into the recipe as if hand-painted:** registries carry no per-tick stamp (unlike visits), so `clearTraverserVisits` alone — the export base's only cleanup — stripped a run's visits but left its registry writes in place; a finished/auto-paused run's board (the natural moment to export) then exported verbatim. New shared `authoredBoard` (`src/canvas/overlay.ts`) reverts a live run's registries to their pre-run snapshot before `buildRecipe`, exactly what Stop already did — Stop and the export path now route through one helper so they can't drift apart again | ✅ yes (partial — see note) | owner dragged their own real exported PNG (schemaVersion 3, after rebasing this worktree onto main — see §2's new rebase-before-plan rule below, added the same session) onto the canvas and confirmed traversers/coloring/initial-state all loaded correctly, verifying the core drop-to-import mechanism; the click-to-file-picker route, the confirm-dialog gate, and the new overlay copy were **not** separately device-exercised. The registry-bake bug was root-caused from that SAME owner-provided PNG (decoded: 3392 tiles with a baked `A=1`, matching their two `auto-place blob {[A],…}` Initial-state rules exactly); the fix is covered by 2 new regression tests + the full suite but **not** re-verified on device via a fresh export→reopen round trip. Owner reviewed this account and said "please commit this"; build / lint / **537 tests** | `66d9a1d` |
| 2026-07-04 | **Canvas UI/UX cleanup.** All panes are 2× wide with a **one-open-per-side accordion** (click a pane title — not just the chevron — to collapse; `Panel` is now controllable). The debug toggle is gone and the per-tick **traverser decision log** folded into the **bottom of the Inspect pane** (traced only while Inspect is open — `traceOn`) with clearer empty text. The **Predicates dock** became a **"Custom predicates" popup** (`CustomPredicatesDialog`, hosting `PredicatePane`) opened by a badge at the foot of the Traversers / Coloring / Initial-state panes. Layout: **left = Traversers, Coloring · right = Inspect (+log), Initial state**. **Pan/zoom keep the selection** (only paint / empty-tap clear it); selecting a tile **auto-opens Inspect**; the **"Read the full guide"** links open in a new tab. Owner follow-ups: the **Traversers list red-badges** any definition that doesn't compile; **predicate/traverser names forbid** DSL reserved words + `t/e/r/l`+N reference patterns + duplicates (new `src/dsl/reserved.ts`); the Coloring "Custom predicates" badge **sticks to the pane bottom** like the others | ✅ yes | owner reviewed on this worktree's preview (port 5679) and said "good please commit"; live in-browser checks (accordion opens one pane per side + title-click collapse; predicates dialog opens from a pane badge and hosts the editor; the log sits at the bottom of Inspect; naming a predicate `move` shows a reserved-word error; a bad-DSL traverser gets a red badge; Coloring badge in `.coloring-foot` under `panel--fill`); build / lint / **547 tests** (7 new reserved-word tests) | `21bcec0` |
| 2026-07-04 | **Community gallery — upload + browse (Cloudflare R2 + D1).** No-login public gallery; global **10/day** cap. Canvas Export → **⤴ Share** (name + little message) → a compact WebP + the recipe are posted; the **Gallery page** is now live: search / sort (new·top·name) / tiling filter / **infinite scroll** / **upvotes** / **spotlight** (message + tiling + **Import to canvas**). Backend = **Cloudflare Pages Functions + D1 + R2** (`functions/api/`, `migrations/`, `wrangler.toml`); the pure `parseRecipe` validates uploads server-side; pure client `src/gallery/` + `src/upload/` | ✅ yes | owner ran the full stack on this worktree's `wrangler pages dev` (port 5356), seeded with the 29 existing gallery fractals + their real recipes: confirmed cards show the real images, sort/filter/search/upvote/infinite-scroll all work, the spotlight shows the message + tiling, and **Import to canvas restores the full setup** (traverser + coloring + walker + correct tiling) — first flagged the placeholder solid-colour seeds, which I replaced with the real fractals, then said "commit". Build / lint / **565 tests** (18 new: API `_lib` cursor/escape/query + a DOM-free server-`parseRecipe` guard) + a 22-check end-to-end API run on the local Cloudflare runtime (upload, image cache headers, atomic upvote, validation → 400, 10/day → 429, keyset pagination). **Deploy (Phase 4) + moderation runbook still to wire.** | `80b2d64` |
| 2026-07-04 | **Deployed the community gallery live — Cloudflare Pages + D1 + R2.** `npm run deploy` (`wrangler pages deploy dist`) → **https://exploroboros.pages.dev** (SPA + `/api` Functions on one origin; D1 `exploroboros` schema applied `--remote`; R2 `exploroboros-images`). Launched **empty** (owner's call — fills from uploads); `exploroboros.io` custom domain deferred to a todo. | ✅ backend verified live (owner to confirm the UI on-device) | owner authorised Wrangler, activated R2, chose "start empty" + "domain to the todo list". I verified the live deploy server-side: `GET /` → 200, `GET /api/creations` → 200 (empty), and an R2 round-trip through the live image route (`PUT` a probe object → `GET /api/img/…` → 200 with the right bytes + `immutable` cache → deleted). Owner to open the public URL on phone/desktop and run Export → ⤴ Share → gallery → Import as the final on-device confirmation | `605d35a` |
| 2026-07-04 | **Four new tilings from the expanded list** — `3.4.6.12` (dodecagon-hex) + `3.4.3.12` (dodecagon-square), both 2-uniform dodecagon tilings; **Rhombille** (the tumbling-blocks Laves dual of `3.6.3.6`); and **Kagome & Squares** `[3.4.4.6; 3.6.3.6]` (2-uniform, reconstructed from Wikimedia `2-uniform_n7.svg`). Pure generators in `src/tiling/generators/`: dodecagon-hex diminishes rhombitrihexagonal on an **index-4** hexagon sub-lattice (the denser √3 one just reproduces 4.6.12); dodecagon-square is dodecagons edge-to-edge on a square lattice + a square/4-triangle pinwheel per cell; rhombille = the three lattice-edge rhombi of a triangular lattice; kagome-square = kagome rows + solid square rows. New shared `windCCW` helper. The `[3.4.6.4; 3.6.3.6]` I first offered was a **non-tiling** (those two configs share no edge type) — corrected to the real `[3.4.4.6; 3.6.3.6]`. | ✅ yes | owner reviewed the generator-rendered PNGs of all four + said "Looks good please commit" (also viewable on this worktree's preview **5544**, footer-labelled). Backed by build / lint / **614 tests** including a strict **vertex-config oracle** (`demiregular-configs.test.ts`) proving each 2-uniform tiling has EXACTLY its two vertex configurations, per-shape edge-pairing counts, lattice-uniqueness, and rhombille's 3 orientations | `8b13473` |
| 2026-07-04 | **"Generate a random coloring" button — 100 hand-picked presets.** When the Coloring pane is **empty**, a button (styled exactly like "+ Add rule", no emoji) drops in one of **100** curated palettes at random. Each is on a fixed form: `if visited` → a **3–4 colour ramp** over **first-step / latest-step**, **modulo 10–300**, at **100% opacity**, in one of three fade styles — **smooth** (seamless loop), **sharp** (hard wrap → crisp rings), **bands** (posterised hard blocks, ≤3 colours); **10** of them add a **second rule on top at reduced opacity, driven by `visited-neighbors`**. Palettes curated from harmonic sources (viridis-family, ColorBrewer, popular gradients). Pure data + builder + random-pick in `src/data/coloringPresets.ts`; the coloring store gains `addRandomColoring` (+ pure `withAddedRules`). The button reuses `.rule-add` (no new CSS). | ✅ yes | owner reviewed on this worktree's preview (5276) + a generated 100-swatch sampler (each bar faded exactly as the colorizer renders it, 2 modulo cycles); asked to restyle the button to match "+ Add rule" and drop the emoji (both done), then said "good commit". Build / lint / **579 tests** (14 new: all-100 preset validity, the smooth/sharp/bands builder math, an end-to-end colorize per preset, the store's multi-add, and the button show/hide — the last hardened after catching a flaky two-combobox overlay case) | `88006d2` |
| 2026-07-04 | **Aperiodic tilings — Penrose (P3 rhombi) + the einstein "hat" monotile.** Two aperiodic tilings (no lattice; substitution-generated). **Penrose** (`penrose`): P3 fat/thin rhombi via Robinson-triangle **deflation** (Preshing) then merging each mirror pair back into a rhombus — the merge edge is the triangle's one non-unit-length side (the diagonal); thick:thin count → **φ**. **Hat** (`hat`): the 2023 einstein monotile — a faithful port of Kaplan's `hatviz` (the H/T/P/F **metatile substitution** rule table + geometry, pulled from the reference). The hat 13-gon isn't strictly edge-to-edge (a length-2 side abuts two shorter neighbour sides), so `insertTJunctions` adds the missing mid-edge vertices → `stitch()` builds a real adjacency graph (interior hats 10+ neighbours); **~1/7 hats reflected** (own shape class `hat-reflected`). Aperiodic tiles use a running-index `lattice` (deterministic generation → stable ids). | ✅ yes | owner verified both on this worktree's preview (**5544**) — "it works perfectly". Backed by build / lint / **637 tests** (Penrose φ-ratio + edge-pairing; hat reflected-ratio + edge-to-edge stitch + determinism; both added to lattice-uniqueness) + generator-rendered PNGs | `f3f7d27` |
| 2026-07-04 | **Coloring predicates can read a neighbour via absolute `@`-paths.** Inline/custom coloring predicates now resolve **absolute** `@`-paths against the tile being coloured — `[A@e0] > 0`, `visited@e2 == 0`, `tile-type@e1 == wedge`, edge chains (`@e0@e1`), `@tile N` — so a rule can colour by a neighbour's state. **Relative** hops (`@rN`/`@lN`/`@straight`/`@nearest-unvisited`/`@target`) need a walker's heading/destination, so they still resolve to nothing and the attribute falls back to its default (unchanged; owner chose no error for these). Parsing was already shared — the gap was that the colorizer supplied no `nodeForPath` resolver. New pure `resolveAbsolutePath` (`src/traverse/lang/exec.ts`, reuses `resolveChain`, rejects any relative/target segment); `colorize` wires it into each tile's `EvalContext`. | ✅ yes | owner hit `[A@e0] > 0` silently doing nothing in the coloring pane and asked why; root-caused to the walker-free coloring context omitting the path resolver, chose "support absolute paths"; verified on this worktree's preview (5276) — live in-browser run of the app's own `colorize` confirmed `[A@e0] > 0` colours the tile whose north neighbour has A while `[A@straight] > 0` (relative) colours nothing — then said "looks good please commit". Build / lint / **588 tests** (9 new: `resolveAbsolutePath` contract — edges/chains/`@tile N`/boundary/empty + relative/`@target` → null; end-to-end neighbour colouring + relative fall-back) | `5fbc235` |
| 2026-07-04 | **Traverser DSL — tile registries always bracketed in `put`/`increase`, and `@`-paths work there.** The write commands took bare registry letters (`put A = 1`) with no way to target another tile — out of step with how registries are READ in a guard (`[A]`, `[A@e1]`). Now tile registries A/B/C **require brackets** (`put [A] = 1`; a bare `put A = …` errors with a nudge to bracket it), and a write can carry an `@`-path so a walker writes a **neighbour** — `put [B@e1] = 1` sets B on the tile across edge 1 (an off-grid path is a no-op, mirroring how an off-grid read falls back to a default). Walker registries **P/Q/R stay bare** (mirrors how each is read; an `@`-path is meaningless for per-walker state). Reuses the `src/dsl` `RegRead`+`TilePath` machinery (one shared grammar for read & write); `put`/`increase` now carry a `WriteTarget` instead of a bare `Reg`. Guide + Traversers help + the `xor-diamond` gallery recipe migrated. Programs live as text in the PNG → no schema bump; a **breaking** syntax change (pre-release convention — old `put A =` PNGs are re-exported by hand, not migrated). | ✅ yes | owner verified on this worktree's preview (5314) — their reported 5-line program (`if [A@l1] == 1 then move straight` … `if [C] == 0 then put [B@e1] = 1`) now parses, and the old bare form errors. Backed by build / lint / **641 tests** (4 new: `@`-path write parse, neighbour-write exec, off-grid no-op, bare-registry rejection) + an in-browser run of the app's own `parseProgram` on the exact program (5 statements, round-trips byte-identically; `put A = 1` → "write tile registry A in brackets: [A]") | `7836c1e` |
| 2026-07-05 | **DSL lists `[a, b, …]` + reducers + ranges; and the `always allow` directive precedence fix.** Two things. **(1) Lists** across the shared tile-predicate DSL (`src/dsl`) — so conditions, `put` values AND the Coloring pane all get them. Owner's terminology: an **input position** (a condition / `put … =` RHS) holds an **output list** (reduced to a value); an **output position** (`move […]` / `put […]` LHS) holds an **input list** (targets, no modifier). Reducers on output lists: numeric `:sum` (default — `[A, B]` ≡ `[A, B]:sum`) / `:avg` (rounds UP) / `:min` / `:max`; boolean `:all` / `:any` / `:none` / `:xor` (**exactly one**) apply the comparison to EACH element then combine (so they need a comparison, can't make a number). A list is **homogeneous** — all numeric OR all `tile-type` (`[tile-type@r1, tile-type@r2]:xor == octagon`); **directions (`e/r/l/straight`) are not values** so `[r1]:sum` errors. Output lists: `move [r1..r4]` / `move [e1..3, e6..e8]` ranges (each vs `max-split`), multi-target `put [A, B] = [C, visited]:avg`. `RegRead` was generalised into a `ListReduce` of `RegTerm` elements — `[A]`/`[A, B]` round-trip byte-stable, so old recipes/predicates are unaffected; the colorizer inherits lists for **absolute** `@`-paths (`[A@e0] > 0`, `[visited@e1, visited@e2]:any == 0`). **(2) Directive fix** (`exec.ts`): each move candidate is decided **forbid > allow > the move's own guard** — a matching `allow` OVERRIDES the own guard, and an `allow` with nothing to override is a **no-op** (the reported bug: `always allow` over unguarded `move e0…e7` no longer gates). Since the gallery/prototype recipes used the OLD allow-as-gate idiom, they were migrated to `forbid` of the negation (behaviour-identical — the headless grow-check fill % are unchanged: classic 36%, sierpinski 9%, wedge-seek 56%, etc.). No schema bump (additive syntax + a behavioural fix; programs are text). See the §9 directive/list notes. | ✅ yes | owner verified on this worktree's preview (**5340**, footer-labelled) and said "looks good please commit"; backed by build / lint / **670 tests** (new `src/dsl/lists.test.ts`, colorize list case, traverse ranges / multi-target / `put [A, B] = [C, visited]:avg`, and directive precedence incl. the exact bug repro + allow-overrides-own-guard) + an in-browser run of the app's own parser in the real Vite runtime confirming every owner example parses/rejects with the right message, and the 29 gallery fractals regrowing at their documented fills | `4a140c4` |
| 2026-07-05 | **Export dialog — editable grid width/height with their own chain-lock; Resolution is the fixed anchor.** The dialog's grid size was a read-only "grid ≈ N × N" guess; it's now two editable fields with a chain-lock just like Resolution's, so the square tiling (the only generator that can honestly go rectangular — others average the two into one count) can hold an exact, deliberately uneven grid like 84×85. **Resolution only changes on a direct edit and never shows a `~`**; pixels-per-tile and the grid are two views of fitting that same fixed resolution — edit either and the other re-derives (marked `~`). Went through two corrections from the owner: first pass wrongly let the grid drive the resolution; the grid's own lock was then added to mirror Resolution's. Dialog widened (16rem → 21rem) so the extra row doesn't feel cramped. Recipe schema bumped to **v4** (`gridN` → `gridW`/`gridH`, migrated) — see the §9 recipe-versioning note for the gallery-fetch bug this bump surfaced and fixed (`fetchRecipe` now runs stored creations through `parseRecipe` like the PNG-import path already did). | ✅ yes | owner iterated on this worktree's preview (5449) across three rounds — asked for the grid chain-lock, then corrected the tie model twice (grid must not drive Resolution; Resolution is the anchor, px/grid are the two derived views) — then said "Good, commit". Backed by build / lint / **647 tests** (rectangular square-tiling + averaged-fallback buildTiling cases, a v3→v4 migration test, an asymmetric-grid export test, a `fetchRecipe` migration-safety test) + in-browser exercise of every edit direction (px, each grid field locked/unlocked, resolution) confirming the `~` lands only on the derived value and Resolution never moves except on its own edit; also checked the wider dialog still fits a phone-width viewport | `2a2ffe5` |
| 2026-07-05 | **Composable named predicates + no-spaces names + trimmed built-in presets.** A predicate can now be **referenced by name and combined with the rest of the language** everywhere a predicate is written (coloring inline field, traverser/initial-state guards): `Has_A and Has_C`, `not isCrowded`, `visited > 0 and isCrowded`. A new `predref` leaf (`src/dsl`) + pure `resolvePredRefs` (recursive inline, unknown-name + self/cyclic-reference = compile error). The **Coloring pane now flags a broken rule** (bad inline, deleted/uncompilable ref) with a red "error" badge + inline message — the fix for the original "fails silently" report. Names are now **single identifiers — no spaces** (use `_`; letters/digits/`_`/`-`, start with a letter): new zero-dep `src/dsl/names.ts` (`sanitizeName` + `malformedNameError` + `VALID_NAME`), wired into `reservedNameError`; this let the just-tried **quoted-name syntax be dropped** (simpler DSL). Lexers gained underscore/digit in identifiers (so `Has_A`/`Level_2` are one token) while `visited - 1` stays subtraction; the predicate DSL's `@e1`/`@r1` path segments now regex-split like the traverser DSL. **Built-in presets trimmed to 7** — Visited, **Visited_neighbor** (`visited-neighbors > 0`), Unvisited, **Unvisited_neighbor** (`visited-neighbors == 0`, owner's choice of the three offered meanings), Has_A/B/C — removing Rule90_gate / Odd_visits / Checkerboard / Triangles / Squares (verified no in-repo OR live-gallery recipe references them by id). Recipe **schema v4 → v5**: migration sanitizes stored predicate/traverser names (auto-named predicates left alone) + renames placed-walker `seed.def` in step; stores sanitize on load; **live D1 gallery `recipe_json` migrated** via new idempotent `tools/migrate-names.mjs --apply` (2 of 5 creations had space-named traversers — `walker matt`, `black knight`/`red knight` — whose seed.def refs were renamed with them). | ✅ yes | owner asked for composition, then "forbid spaces… simpler backend", then trimmed the preset list; verified live on this worktree's preview (5654) — `Has_A and Has_C` resolves to `[A] > 0 and [C] > 0`, a bad ref shows the badge + "unknown predicate", the 7-preset list shows no spaces, both neighbour presets resolve — then "good commit". Backed by build / lint / **706 tests** (new `names`/`resolveRefs`/traverser-`compile`/`bundledPredicates` suites + updates across dsl/initstate/panes + a v4→v5 migration test) + the live D1 dry-run/apply/idempotent-recheck. `sanitizeName` lives zero-dep so the recipe migration doesn't bloat the Cloudflare Functions bundle | `c94d692` |
| 2026-07-05 | **Canvas authoring UX pass — Inspect placement, traverser-editor help, display:none grid outline.** In **Inspect**, a placed walker shows its **definition name** (id-labelled, e.g. `0:Walker`), and the placement picker is a **"Place:" label + one direct-place button per definition** (single tap; collapses to a dropdown past 3 defs = the built-in Walker + 2 custom). The maximised **Traversers editor** grew a collapsible **Syntax** reference + a **"?"** to the guide, with the Done button pinned at the bottom (scrolling body) so it can't ride up next to the Name field. Display mode **none** now traces the whole grid's **outer perimeter** in thin black (the `b === null` boundary edges) so the plane reads as bounded. | ✅ yes | owner reviewed across iterations on this worktree's preview (**5371**, footer-labelled) — flagged the Done/Name layout + the picker style, both fixed — and said "this is perfect, please commit"; build / lint / **756 tests** (Inspect place-button + placed-name, editor syntax/help, direct-place flow) | `10b22a9` |
| 2026-07-05 | **Ctrl+Space DSL autocomplete across all four editors** (Traversers, Initial-state, Predicate, Coloring inline). A portal popup at the caret (`src/components/DslTextarea.tsx` + `DslInput` + pure `dslCompletions.ts`): **context-aware** — a blank line offers that DSL's **line-starting keywords** (traverser: if / move / put / increase / morph / update / directive / reset directives / heading / max-split / max-steps / movement; init: auto-place), and **predicate position** offers tile attributes + walker attributes + `not` + referenceable predicate names. Filters on the typed word (startsWith-first), wheel-scrollable (doesn't dismiss on its OWN scroll), arrow keys scroll the active row into view, Enter/Tab/click inserts, Esc closes. | ✅ yes | owner iterated on 5371 — asked for partial-word filtering, wheel-scroll, and blank-line line-starters (all done) — and approved; build / lint / **756 tests** (context switch, filter, insert, Esc, coloring-inline path, starter-keyword coverage) | `10b22a9` |
| 2026-07-05 | **Coloring eye-toggle + dice, and Initial-state presets.** Each coloring rule gets an **eye** by its trash to switch it **off without deleting** — the row dims and the rule stops painting **live AND in export** (colorizer skips `enabled === false`); **recipe schema v5 → v6** (additive optional `enabled`, default-enabled, so old images reproduce unchanged) so a switched-off rule reopens switched-off. A **dice** by each colour (flat swatch + every ramp stop) drops in a random hex. The **Initial-state pane** gained a **presets dropdown** (Edges / Cross / Diagonal cross) that **appends** its `auto-place` lines to the document. | ✅ yes | owner asked for these + said "this is perfect, please commit"; build / lint / **756 tests** (colorize skips a disabled rule, eye toggles the row, dice randomizes, v5→v6 migration, preset parse + append) + reopened with no console errors | `10b22a9` |
| 2026-07-05 | **Kalleboda brand mark + favicon, chevron speed icons, toolbar divider.** The nav mark (and the browser-tab favicon) is now a real 2-tile Kalleboda patch — an octagon with a wedge nuzzled into each of its two genuine gaps — with coordinates lifted from the actual generator (`src/tiling/generators/kalleboda.ts`) rather than hand-drawn; a first attempt hand-attached two wedges to one octagon with no real adjacency between them, and a second attempt added a second octagon per the owner's sketch, both superseded by this simpler owner-requested cut. New `BrandMark.tsx`; the favicon hardcodes the same accent colours (+ a `prefers-color-scheme` media query — favicons can't read the app's CSS). `SpeedBar`'s turtle/rabbit icons became a single chevron (slow) and triple chevron (fast) in the same line-icon idiom, pulled closer to the notched slider (`gap: var(--space-1)`). The canvas toolbar gained a `.canvas-divider` between the run/speed controls and the tiling/display tools (hidden once the bar wraps on mobile). Also: footer version bumped to `v0.1.0` (phase label dropped), and the landing page's editor blurb reworded to "…with an expressive visual editor backed by a dedicated language" with em dashes removed from the blurbs. | ✅ yes | owner iterated across several rounds on this worktree's preview (5408) — corrected the first hand-composed mark to a real tiling patch, then to match a hand-drawn sketch, then asked to drop the second octagon, then for the chevron icons and toolbar divider — and said "good commit this"; backed by build / lint / **756 tests** + in-browser checks (real-geometry extraction scripted against the actual generator, zoomed screenshots of the mark/favicon at several sizes, light + dark mode, mobile toolbar wrap) | `370fb0e` |
| 2026-07-05 | **Fix — renaming a traverser orphaned any walker already placed with it.** A placed walker stores its definition's NAME (`seed.def`), the engine's lookup key into `defs`; renaming only updated the definition's own name, so `defs.get(tr.def)` missed on the old name and the walker silently dropped next tick — "the traverser on the grid just leads to nothing," with no visible error. New pure `renameSeedDefs` (`src/traverse/step.ts`) plus a `Workspace.tsx` effect that diffs the traverser library's `id -> name` map each render and patches any matching `def` on both the authored `seeds` and a live run's `runLive` copy — mirrors the seed-def rewrite the v4→v5 recipe migration already does for the load-from-PNG path, just applied live instead of only on load. | ✅ yes | owner reported the bug ("place a traverser, rename it, it leads to nothing"); verified live on this worktree's preview (5468) — placed a custom "walker" definition, renamed it to "renamed" mid-session, watched Inspect's `.trav-name` update from "1:walker" to "1:renamed" with no re-placement, then Stepped twice and read the traverser log: `tr1 #210 → moved to #230 — move nearest-unvisited fired`, proving the engine resolved the renamed definition and kept walking — then said "looks good please commit"; backed by build / lint / **760 tests** (3 new `renameSeedDefs` unit tests + a Workspace regression test reproducing the exact place-then-rename sequence) | `00d6c76` |
| 2026-07-06 | **Fix — mobile nav bar caused horizontal scroll.** The logo + "Exploroboros" wordmark + Home/Canvas/Gallery links needed ~440px, overflowing a 375px-wide phone viewport by ~65px. Below 480px width: Home is hidden (tapping the logo already routes there — new `.nav-link--home` class), the brand mark shrinks 20%, and link padding/gaps/wordmark size tighten a bit further so it also holds on 320px-wide phones (measured ~21px still over with just the first two changes). Desktop/tablet nav (≥480px) is pixel-identical to before. | ✅ yes | owner reported the bug + asked for the Home-hide and a 20%-smaller logo specifically, then "is that enough to make stuff fit?"; verified headlessly on this worktree's preview (5429) via exact `scrollWidth`/`innerWidth` measurements at 320/360/375/430/480px (all zero overflow) and 481px (full nav reappears, unaffected) plus a desktop screenshot; owner then checked it and said "looks good commit"; build / lint / **760 tests** | `380a7a5` |
| 2026-07-06 | **Traverser DSL — `@`-chained moves, bare A/B/C registries, `if {}` blocks, `find-tile` search + `exists@path`.** Move chains join with `@` (`move e0@e4`) instead of `->` (gone — no recipe used it); tile registries no longer need brackets (`put A = 1`, `A == 5`, `[A]` still a one-element list); `if <predicate> { … }` groups statements (nests) to run only when the guard holds; `find-tile <predicate> { <moves> }` is a breadth-first ghost-search (its `move` lines fan the search out without moving the real walker) returning the nearest matching tile (≥1 hop away), usable inline or referenced afterward as `f0`/`f1`/… (numbered by source position; `fN` is a valid path base but never a later hop). **`exists@path`** — added mid-review after the owner asked how to tell a failed search from a found-but-falsy tile, which nothing could answer — tests whether any `@`-path resolved to a real tile. Recipe **schema v6 → v7** (additive; old images still open). Full design + files in §6. | ✅ yes | owner asked "how would I check for if f0 actually found a tile?", exposing the `exists@path` gap; I added it and confirmed live (an in-browser `runProgram` call on this worktree's preview showed `exists@f0` true only after a successful search, false after a failed one, while a plain `visited@f0` read `0` identically in both cases) — then owner said "good commit". Backed by build / lint / **802 tests** (44 new: `find.ts` BFS unit tests, parser/serializer/exec coverage for every new construct incl. `exists`, reserved-word + out-of-range-`fN` rejections, a v6→v7 migration test) + in-browser checks on this worktree's own preview (5618, footer-labelled) of every new form parsing/executing correctly and the old `->` / bad `fN` references being rejected; the owner's own device interaction with the running canvas was not separately narrated back in this session | `726b28f` |
| 2026-07-06 | **Fix — selecting a tile didn't move the camera, so a pane reopening could hide it.** Tapping a tile only ever opened Inspect; the canvas view itself never reacted, so a tile near where a side pane resizes the canvas back open (Inspect wasn't already the open right pane) could end up rendered behind it — reproduced live by tapping a tile in the region a reopening Inspect pane would cover and confirming it landed off-screen. `TilingCanvas` now eases the view (a quick ~240ms pan) to centre a freshly single-selected tile, and keeps it centred through whatever resize follows (the pane opening) until a manual pan/zoom, a new/cleared selection, or **Fit** (which always wins — "show me everything"). The fit-vs-follow-vs-clamp decision moved into a pure, unit-tested `reframeView` (`src/canvas/view.ts`) so the exact "container narrows right after selecting" regression is covered without a live Konva canvas. Also checked the exported-image viewer's fit-to-window (already correct on open + resize) and gave its initial fit a `useLayoutEffect` so there's never a frame at the wrong size on mount. | ✅ yes | owner reported the bug + root cause (opening Inspect shrinks the canvas out from under the click); I reproduced it live (tile rendered outside the reopened pane's canvas area), fixed it, then hit a headless-preview quirk — the tab was `document.hidden` from a fresh start, throttling `requestAnimationFrame` so the Konva canvas never painted (documented in §9) — so verification leaned on a new `reframeView` regression test that reproduces the exact scenario in pure code instead. Owner reviewed on this worktree's preview (5340, footer-labelled) and said "looks good please commit". Backed by build / lint / **809 tests** (6 new: `reframeView`'s fit/follow/clamp branches incl. the pane-narrowing regression and its no-stale-recentre counterpart) | `3771ccd` |
| 2026-07-06 | **`if/else(-if)` blocks + a `max-split` for `find-tile` (default 1).** The `if { … }` block gained an optional `else { … }` and `else if` chaining (an `else` may sit on the `}` line or its own line — K&R + Allman both parse); `find-tile` gained a `max-split = N` line (default 1, like a walker's), so a search now follows a single path by default and you raise max-split to fan wider (replacing the old "fans out fully" behaviour). | ✅ yes | owner asked for both ("complete the if {} block with an if else construction" + "in the find-tile block we need to support max-split, default 1"); confirmed live on this worktree's preview (5618) via an in-browser `runProgram` — an `if / else if / else` chain routed to the correct arm for A==1/2/other, and a `find-tile` with the default max-split 1 failed to reach a tile two hops EAST (single-path north walk → no move) while `max-split = 4` reached it — then owner said "good commit". Backed by build / lint / **811 tests** (else / else-if / Allman-brace + find-tile max-split cap: parse + exec + round-trip; existing find-tile exec tests updated to set `max-split = 4` where they relied on fan-out) | `a2dac29` |
| 2026-07-06 | **Export-failure debug log — a failed export downloads a rich, self-contained JSON report.** A non-abort export failure now auto-downloads `exploroboros-export-error-<tiling>-<stamp>.json` (the toast names it) instead of only flashing "Export failed". It carries the full recipe (traverser DSL + coloring + initial-state + predicates + seeds + paint + tiling + grid + output), the pipeline **stage** that died, worker-vs-main path, the underlying error name/stack, environment, caps, progress reached, and guarded diagnostics (real tile count, caps-clamped target canvas size → reveals OOM, per-traverser compile check, unresolved seed defs, initial-state compile). New `ExportFailure` (path/stage/cause) + worker error name/stack/stage across the boundary + `worker.onerror` capture; pure `src/export/debugReport.ts` + DOM `src/export/debugLog.ts`; `clampResolution` split out of `sizing.ts`. | ⚠️ partial — see note | owner hit "Export failed: export worker failed" earlier but **could not reproduce it on demand** ("cant reproduce, i guess we will know when it happens next time, please commit"), so the actual failure→download round-trip wasn't device-exercised; the log builder itself IS verified — build / lint / **836 tests** (18 new: `debugReport` happy/broken-traverser/unresolved-seed/robustness + `toErrorInfo` unwrap + `clampResolution`) **and a live-runtime exercise** on this worktree's preview (5342) that dynamically imported the app's own `buildExportDebugReport` and, against a simulated worker `ExportFailure`, unwrapped the cause (`RangeError`, path `worker`, stage `run`), built the real kalleboda tiling (14 489 tiles), flagged the broken traverser + its orphaned seed, and clamped a 20000² request to 8192² | `89929a7` |
| 2026-07-06 | **Downloadable traverse log — whole-run trace for debugging a pattern.** A "⤓ Download full log" button (bottom of Inspect, by the traverser log) runs the current setup to completion **traced** and downloads a self-contained JSON: every tick's per-walker decisions (statements + each candidate move and why chosen/rejected), a **geometry dictionary** (every tile id → shape + x,y, so positions can be checked for symmetry), a per-tick summary for the whole run, and the final visited/registry state. Pure `buildTraverseLog` (`src/traverse/traceLog.ts`, mirrors `initRun`, full traces capped but summary/final cover the whole run). Built while diagnosing an owner-reported "asymmetric fractal" on Kagome & Squares — see the §9 note: it is **NOT an engine bug**, it's that absolute edge numbers are clockwise-**handed**, so a triangle's selective `eK@eK` routing is chiral (a full fan `[e0..e2]` stays symmetric). New permanent `symmetry.test.ts` guards that the engine keeps full-fan patterns symmetric. | ✅ yes | owner asked me to find the asymmetry ("no guessing") + wanted a downloadable traverse log; I root-caused it with a headless real-engine probe + a control experiment (full-fan stays symmetric 14 ticks → engine exonerated; `e1@e1`→(+2,0), `e2@e2`→(0,−1.15) while the true mirror of `e1@e1` is (−2,0)=`e2@e5`), reported it, then owner said "good commit the debug log downloader". Build / lint / **842 tests** (6 new: traceLog + the symmetry regression); branch served on this worktree's preview (5342, footer-labelled) — the download button click itself wasn't device-exercised (headless tab hidden) | `8eebf56` |

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
  - [x] Tiling-agnostic **`orientation`** attribute — a 0-based index of a tile's rotational variant,
    derived from geometry (rank its `tileRotationDeg` among its shape's distinct rotation buckets;
    `src/tiling/orientation.ts`, memoized per Tiling). The portable substitute for routing by the
    tiling-specific discriminator coordinate: traversers use `orientation == k` on any tiling. Shown in
    Inspect; flows to the predicate menu + ramp dropdown automatically *(verified 2026-06-28, `a9c1142`)*
  - [x] Investigate the **expanded** tiling list
    (https://en.wikipedia.org/wiki/Uniform_tiling#Expanded_lists_of_uniform_tilings) for cool tilings to add
    beyond the 11 convex uniform + kalleboda — owner picked 4, all built & verified *(2026-07-04, `8b13473`)*:
    **3.4.6.12** (dodecagon-hex), **3.4.3.12** (dodecagon-square), **Rhombille** (Laves dual of 3.6.3.6), and
    **Kagome & Squares** `[3.4.4.6; 3.6.3.6]`. Non-edge-to-edge forms (Pythagorean, offset "brick" rows) were
    ruled out — `stitch()` needs edge-to-edge (T-junctions break adjacency). More of the 20 two-uniform tilings
    remain available if wanted. **Rigorous check:** the `demiregular-configs.test.ts` vertex-config oracle can
    validate any future 2-uniform generator.
  - [x] **Penrose tiling** (P3 rhombi) — *aperiodic*; Robinson-triangle **deflation** (Preshing) then merging
    mirror-pair triangles into fat/thin rhombi (the merge edge = a triangle's one non-unit side). thick:thin → φ
    (tested). `src/tiling/generators/penrose.ts` *(done & verified 2026-07-04, `f3f7d27`)*
  - [x] **Einstein "hat" monotile** — *aperiodic single tile*; faithful port of Kaplan's `hatviz` H/T/P/F
    **metatile substitution**. NOT strictly edge-to-edge (the 13-gon has a length-2 side) → `insertTJunctions`
    adds mid-edge vertices so `stitch()` builds adjacency; ~1/7 reflected (`hat-reflected` shape).
    `src/tiling/generators/hat.ts` *(done & verified 2026-07-04, `f3f7d27`)*. Follow-ups if wanted: P2 kite/dart
    Penrose; the **spectre** (chiral aperiodic monotile, no reflections).
  - [ ] Tile numbering as a canvas control — user-selectable scheme/origin (debug view currently numbers by generation order)
  - [x] Visualise edge numbering + opposite edges for the user — the Inspect **tile mini** (`TileMini`)
    draws the selected tile's real vertices in its on-canvas orientation with every edge numbered as the
    DSL sees it (`clockwiseEdgeOrder`), edge 0 accented, plus a **"Straightness"** blurb (wedges: dotted
    lines linking the hand-crafted opposite-edge pairing; triangles: right-handed straight-through)
    *(verified 2026-07-02, `7df7090`)*. The tiling-wide **cheat-sheet popup** below is still open.
  - [ ] **Tiling cheat-sheet info popup** — a little info popup that prints nice, helpful **edge guides** for
    the current tiling, especially the more **advanced tiles** (octagon + wedge, the dodecagon/triangle
    tilings, etc.): what each edge name/number points to, which edges are opposite, the wedge "straight"
    through-pairing, and the `orientation` variants. The user-facing companion to the edge-numbering
    visualisation above — help people reason about moves on tricky shapes *(owner, 2026-06-29)*
- [x] **Tile-predicate DSL + Predicate pane + Coloring pane** *(§5)* — pure `src/dsl/` engine
  (lex/parse/serialize/eval + attribute registry: numeric attrs, arithmetic, comparisons, and/or/not,
  grouping, required defaults, `tile-type == <shape>`, `rotation`); a Predicate pane (presets + persisted
  custom predicates as DSL text); a Coloring pane + pure `src/colorizer/` (predicate→colour rules, flat/ramp
  with breakpoints + modulo, per-rule opacity, drag-reorder) wired into the canvas. localStorage stores in
  `src/state/`; no new deps *(verified 2026-06-27, `b391faa`)*
  - [x] **"Generate a random coloring"** — shown only when the Coloring pane is empty; drops in one of **100**
    hand-picked presets at random (`src/data/coloringPresets.ts`). Fixed form: `if visited` → 3–4 colour ramp
    over first/latest-step, mod 10–300, 100% opacity, smooth/sharp/bands fade; 10 add a `visited-neighbors`
    overlay layer. Button reuses `.rule-add`; store gains `addRandomColoring` *(verified 2026-07-04, `88006d2`)*
  - [x] **Composable named predicates + no-spaces names** — a predicate can be referenced BY NAME and combined
    with `and`/`or`/`not` anywhere a predicate is written (coloring inline, traverser/initial-state guards):
    `Has_A and Has_C` (`src/dsl` `predref` leaf + pure `resolvePredRefs`, unknown/cyclic = compile error).
    Names are single identifiers — **no spaces** (`src/dsl/names.ts`: `sanitizeName` + `malformedNameError`);
    the quoted-name attempt was dropped. Coloring pane red-badges a broken rule (the "fails silently" fix).
    Built-in presets trimmed to 7 (Visited, Visited_neighbor, Unvisited, Unvisited_neighbor, Has_A/B/C).
    Recipe **schema v4→v5** sanitizes stored names (+ live D1 rewrite via `tools/migrate-names.mjs`)
    *(verified 2026-07-05, `c94d692`)*
- [x] **Visual predicate editor** — the mouse-driven **chip** UI over the same DSL AST (click an operator →
  dropdown w/ key accelerators; click an attribute → swap; inline number/shape edits), kept in sync with the
  text editor via serialize/parse. Structural add/group still done in Text mode — a possible follow-up
  *(verified 2026-06-27, `50f1aa0`)*
- [x] **Visual language + component system** — `docs/VISUAL-LANGUAGE.md` (philosophy, tokens, shape/roundedness
  rules, component library, good/bad) + reusable `SegmentedControl` / `Stepper` / `Toggle` primitives applied
  across the app; canvas top bar unified into one transport, speed/display as segmented controls, menu triggers
  unified (no pill buttons), Export moved rightmost; design tokens added to `index.css`
  *(verified 2026-06-28, `3147f4e`)*
- [ ] **Port the traverse engine** *(§5)* — reuses the predicate DSL
  - [x] Basic traverser + tick/run structure — pure `src/traverse/` engine (synchronous tick; a walker steps
    to the least-turn adjacent **unvisited** tile, re-aims, coalesces, auto-stops when trapped), Play/Pause/Stop
    + slow/fast/max speed chip, **authored seeds vs live run** (Stop restores the placement — the savable
    starting state; Reset removes), Inspect Place/aim/Remove (locked during a run), lime heading arrow in stats,
    grid-resize locked while running, mobile header wraps *(verified 2026-06-27, `064cfc7`)*
  - [x] **Overhaul the Play / Pause / Stop / step transport** — Play/Pause merged into one toggling button;
    **Step** is now a real button (advance one tick, pausing a running run — no longer a speed mode); speed
    moved to a notched turtle→rabbit **SpeedBar** (four paces, very slow → max), decoupled from Step and
    placed just right of the transport. Also Stop reverts a run's A/B/C registry writes (like it clears the
    visit trail, keeping hand-set state) *(verified 2026-07-03, `b9c9f7c`)*
  - [x] Attribute **`@`-paths** in the predicate/traverser DSL — the "read another tile" mechanism moved off
    the guard onto each attribute (`visited@e1`, `tile-type@target`, `[A@r1@e5]`; no path = current tile;
    `@target`/`@tile N` terminal); move/edge token `edge N` → `eN`. Groundwork for the DSL-driven traversers
    below *(verified 2026-07-03, `2aec24b`)*
  - [x] **Initial-state DSL (its own pane)** — `auto-place` moved OUT of the traverser DSL into a right-dock
    **Initial state** pane that seeds the whole starting state: traversers **+** per-tile registries
    `[A]/[B]/[C]` **+** `visited`. `auto-place line {what, angle, percent, param}` (tiles a line crosses) /
    `auto-place blob {what, x%, y%, radius, param}` (a point grown out `radius` tile-rings). `what` = a
    traverser (`t1`/name), a registry, or `visited`; `param` **sets** heading / value / count; grid-relative
    (preview == export); optional `if <predicate>`. Ghost heads, non-removable (edit the rule → Inspect note),
    hand seed wins a shared tile, a set overwrites hand-paint. Pure `src/initstate/`; recipe **schema v3**
    (+ v2→v3 migration). Traversers numbered `1:`,`2:`… (referenced `t1`/name); short-spec error names the
    template *(started as traverser-DSL auto-place 2026-07-03 `3e7a601`; moved + extended 2026-07-04 `5155446`)*
  - [ ] DSL-driven traversers — custom rules in the Traversers pane (paint / move along edge refs / visit /
    split / guards / state terms, §5), reusing the predicate DSL; replaces the one hardcoded behaviour
  - [x] Prototype-port loader (debug) — a "Load prototype ports" button at the bottom of the Traversers
    pane adds hardcoded traverser definitions ported from the prototype's `.tasks` files (traversal only;
    colour stays separate). Currently the **gasket** (XOR-unique fork). Preset data + the DSL translation
    live in `src/data/prototypePorts.ts`; extend that list to port more *(verified 2026-06-28, `af6a65b`)*
- [x] **Image export — client-side high-res PNG** *(§4.2; verified 2026-06-28, `97c6251`)* —
  pure core in `src/export/` (`runToCompletion` via the in-place `stepTraversersInto`, `remap` of seeds/paint
  by bounds-centre offset, `colorize`, `sizing` with device caps, the Canvas2D `renderTiling`, the recipe
  schema, and the `pngText` tEXt writer) — all unit-tested; a Web Worker (`exportWorker.ts`) +
  OffscreenCanvas driver with a main-thread fallback (`exportImage.ts`); the **Export menu** in the canvas
  top bar (grid size + resolution + background + edges) with a progress view + an **Abort** button
  (`AbortSignal` → `worker.terminate()`, cancels mid-run); the **thumbnail strip** (`ExportStrip`) + **image
  viewer** (`ImageViewer`) with the canvas↔image swap. Each export auto-downloads + embeds the **versioned**
  recipe (migration chain; refuses newer-than-this-build images). Flush no-edge tiles in export + live canvas.
  - [x] **Export dialog: pixels-per-tile + width × height** *(verified 2026-06-28, `0b573d4`)* — the menu
    takes a **px-per-tile** knob (grid size derived + shown as a hint, e.g. "grid ≈ 85 × 85 tiles") instead of
    a raw grid size, and the resolution is an explicit **width × height with a chain-lock** (linked scales both,
    toggle to set apart). Recipe `output` → `{ width, height }` (schema **v2** + v1→v2 migration); `pickCanvasSize`
    takes explicit W×H (tiling fit/centred → non-square letterboxes onto the background). The px/tile, width,
    height + background controls share one 7rem aligned column.
  - [ ] **Paint traverser seeds** — once **named traversers** can be placed by drag, add them (and colours)
    to the export menu / drag popup if useful (carried over from the paint-target item above).
  - [x] **Export background = the whole plane** — the chosen background fills unpainted tiles too (and
    "transparent" leaves them clear), so the fractal sits on it like the prototype — it was a fixed white
    base with the background showing only as a border *(verified 2026-06-28, `ac23bb9`)*
  - [x] **Fix — export baked a run's A/B/C registry writes into the recipe as hand-paint** — the export
    base only stripped run VISITS (`clearTraverserVisits`); run-written registries have no per-tick stamp
    to strip by, so they rode along verbatim (worst when exporting a just-finished/auto-paused run, the
    natural moment to export). New `authoredBoard` (`src/canvas/overlay.ts`) reverts a live run's
    registries to their pre-run snapshot before `buildRecipe`, same as Stop — both now share one helper
    *(verified 2026-07-04, `66d9a1d`)*
  - [x] **Export-failure debug log** — a failed export (non-abort) auto-downloads a self-contained JSON
    debug log (and the toast names the file) instead of only flashing "Export failed". It holds the full
    recipe (traverser DSL, coloring, initial-state, predicates, seeds, paint, tiling, grid, output) +
    which pipeline **stage** died + worker-vs-main path + the underlying error name/stack + environment +
    caps + progress reached + guarded diagnostics (real tile count, the caps-clamped target canvas size
    which reveals an OOM-sized request, a per-traverser compile check, unresolved seed defs, initial-state
    compile). Pure `src/export/debugReport.ts` (never re-runs the traverse; every diag guarded) +
    DOM-side `src/export/debugLog.ts`; new `ExportFailure` error + stage tracking in the export pipeline
    *(committed 2026-07-06, `89929a7`; the intermittent real failure couldn't be reproduced on demand —
    the log itself is verified, it lands next time an export fails)*
- [x] **Reopen from PNG** *(verified 2026-06-28, `a1e6d0b`)* — `Workspace.loadRecipe(recipe)`
  REPLACES the canvas setup from a recipe: tiling, grid (export grid clamped to ≤ `GRID_MAX` for editing),
  walkers + hand-paint (via `remapSeeds`/`remapPaint` centre-offsets), and the three stores (new `setAll`).
  Entry points: **gallery click** (placeholder recipes in `src/data/galleryRecipes.ts`, handed off via
  `src/state/pendingRecipe.ts`, consumed by the Workspace mount effect) and **drag an exported PNG onto the
  canvas** (`decodeRecipeFromPng` → `parseRecipe` → `loadRecipe`, with a result toast). Verified in-browser
  (gallery open switches tiling + loads seeds/stores; PNG drop round-trips an export). Build / lint / 397
  src tests pass.
  - [x] **Discoverable import + a safety gate** — a persistent "drag an image here to import" box (click
    → system file picker, the touch-friendly path in) and an "are you sure?" `ConfirmDialog` before an
    import replaces panes that already hold authored work (predicates / coloring / traversers /
    initial-state / seeds / paint) *(verified 2026-07-04, `66d9a1d`)*
  - [ ] **Preserve the export resolution on reopen** — a reopened recipe's original export grid isn't fed
    back into the export menu (its `gridN` seeds from the live/edit grid). Carry `recipe.gridN` as an export-
    grid hint so re-exporting matches the original size without re-typing it.
  - [x] **Gallery — real ported recipes** — the fake placeholder recipes are replaced by **27 prototype
    fractals ported to our DSL** (traverser + colour), each image wired to its recipe by filename and slimmed
    to WebP. classic crosses wedges via the wedge through-pairing (`move straight`); ringlare steers by
    visited-edge counts; wedge-seek is a shape fan; **sierpinski** is the rotation-routed nested gasket
    (orientation-routed, with an empirically-tuned octagon-fan edge order — the two-edge adjacency makes
    fan order matter). All four rotation-routed fractals are now ported. Deferred: the move-to-lowest /
    kill / hunger fractals, etc. — see `src/data/galleryRecipes.ts`
    *(verified 2026-06-28, `0d939f7`; classic-2 `41cc510`; classic/ringlare/wedge-seek `f6e64a8`; sierpinski `27a7205`)*
  - [ ] **Re-tune ringlare / xor-tri / xor-dense to the edge-number heading** — the 2026-07-02 heading
    refactor (`96ede11`) changed relative-turn arithmetic, so these three (single precise turns on wedges,
    not broad fans) now regenerate much sparser than their thumbnails (ringlare 11%→0.9%, xor-tri 25.5%→2.6%,
    xor-dense 28.3%→1.3%). Owner wanted a collaborative re-tune pass — re-derive their guarded turns against
    the new frame (or re-shoot the thumbnails). The other ~25 gallery fractals were unaffected or still healthy.
  - [x] **Community gallery — upload + browse** *(done 2026-07-04, `80b2d64`)* — anyone shares an export to a
    public Cloudflare-backed gallery (no login; 10/day cap): search / sort / filter-by-tiling / infinite
    scroll / upvotes / spotlight (message + tiling + Import-to-canvas). Upload from the Export strip's **⤴
    Share** (compact WebP + recipe). Backend `functions/api/` + D1 + R2; pure `src/gallery/` + `src/upload/`.
    Still open: a **"watch it grow" replay**, and **persisting a user's OWN exports locally** (IndexedDB).
- [x] **Debug features + a run log** — a per-tick traverser **decision log** (Debug pane, behind a
  canvas-bar toggle): per walker, the statements run + each candidate move and why it survived/was
  rejected, a "no move" banner; **hovering a row highlights the tiles it concerns on the grid** (current
  / the tile a guard reads / chosen / rejected), click to pin; a bounded tick-history scrubber; driven by
  an **opt-in pure `TickTrace`** (zero cost when off). Surfaced + fixed a real edge-numbering bug on first
  use *(owner, 2026-06-29; done & verified 2026-06-30, `58fd0b6`)*.
  - [x] **Downloadable traverse log** — the log-to-file aid: a "⤓ Download full log" button (bottom of
    Inspect) runs the current setup to completion **traced** and downloads a self-contained JSON (per-tick
    per-walker decisions + a tile-geometry dictionary + a per-tick summary + the final visited/registry
    state) for offline analysis. Pure `src/traverse/traceLog.ts` + `symmetry.test.ts`. Built while
    root-causing an "asymmetric fractal" that proved to be chiral absolute-edge routing, not an engine bug
    (§9) *(committed 2026-07-06, `8eebf56`)*
- [x] **Deploy to Cloudflare Pages** *(done 2026-07-04, `605d35a`)* — SPA + gallery Functions live at
  **https://exploroboros.pages.dev** (D1 `exploroboros` + R2 `exploroboros-images`; schema applied
  `--remote`; `npm run deploy`). Backend verified live (API + an R2 image round-trip); gallery launched
  empty. Moderation = delete a bad upload via the dashboard / `wrangler d1 execute … DELETE` +
  `wrangler r2 object delete`.
- [ ] **Custom domain `exploroboros.io`** — register it (Cloudflare Registrar, ~$35–50/yr) + attach it to
  the `exploroboros` Pages project as a custom domain (free SSL). Owner wants it; deferred until after live
  testing *(owner, 2026-07-04)*.

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
  scroll), **paint** (writes the chosen target — visited / A / B / C), **select** ("box select" — a
  marquee box → every tile whose centre is inside), or **paintselect** ("paint select" — freehand: drag
  over tiles to gather a non-box selection, pushed up live). Both selecting modes call `onSelectTiles`;
  holding **Shift** at the start of a box / paint-select drag **adds** to the current selection (union)
  instead of replacing it. A **paint** stroke or a **tap on empty space** fires `onDeselect` so the
  selection clears — but **pan and zoom keep the selection** (wheel-zoom, pinch, and middle-mouse pan are
  navigation, not a new gesture), as does a tap-on-tile or a box. A paint stroke flashes an **outline** on its tiles (`paintFlashRef` → `drawPaintFlash`) that
  fades to 0 over ~600ms (rAF) after release. A **display chip** (Workspace) cycles tile rendering —
  `edges` / `none` / `stats`; in `stats` the tile number, visited `vN`, and any non-zero registries
  (`A# B# C#`) print inside each tile, but only once tiles are a few screen px (`MIN_LABEL_PX`), so on
  dense grids you zoom in to read them (you can't fit thousands of readable labels at fit). In `stats` a
  **lime arrow** (`traverserHeads` prop → `drawTraverserHeads`) marks each traverser head + heading. `src/canvas/`
  holds its pure, tested helpers — `view.ts` (world↔screen transform), `pick.ts` (hit-testing),
  `stroke.ts` (paint gap-fill), `overlay.ts` (per-tile run state — the visit step-list + A/B/C
  registries, plus its updaters), `clipboard.ts`, `buildTiling.ts`, `flush.ts` (flush-tile rendering:
  `flattenColor` + `inflatePolygon`, see the gotcha below) — imported via `src/canvas/index.ts`.
- `src/components/TilingDebugView.tsx` — the original dependency-free SVG renderer. Still **live**: it
  draws the tiling-picker gallery thumbnails (`TilingThumbnail.tsx` → `TilingPicker.tsx`). Not used for
  the main canvas (that's the Konva `TilingCanvas`), but don't delete it — the picker needs it.
- `src/components/Workspace.tsx` — the Canvas-page multi-pane workspace: authoring docks (Traversers,
  Coloring) left, inspection docks (Inspect, Initial state) right, **one open per side at a time** (an
  accordion — `leftOpen`/`rightOpen`; `Panel` is controlled). Predicates have **no dock** — a **"Custom
  predicates" badge** at the foot of the authoring panes opens the shared `CustomPredicatesDialog`. The
  per-tick **traverser decision log** (`DebugPane`) lives at the **bottom of the Inspect pane** (there is
  no debug toggle; its trace is built only while Inspect is open — `traceOn = rightOpen === 'inspect'`).
  Selecting a tile **auto-opens Inspect**. It **builds the `Tiling`** from the picker `tilingId` + grid-size, and
  owns selection (`selectedIds` — one tile, or many from a select-box), the per-tile **state overlay**
  (`TileState` — a visit step-list + the A/B/C registries; see `src/canvas/overlay.ts`), the **drag**
  control (a popup choosing off / select / paint→target), and the copy/paste clipboard (all kept off the
  immutable `Tiling`, keyed by tile id). The Inspect dock has three states: **1** tile → full stats +
  controls (visits ± as step −1, registries ±, traverser Place/aim/Remove); **many** tiles (box-select) →
  no per-tile stats, just the same edits applied to **all** at once (Place on all / rotate all / Remove
  all / ±); **0** → a hint. It also owns the **traverse run**:
  authored **`seeds`** (placed + aimed walkers — the savable starting state) vs a throwaway **`runLive`**
  copy (null while stopped), a `running` flag + a `setInterval`/`requestAnimationFrame` **clock**
  (speed `slow` = 90ms interval / `fast` = one tick per frame; `step` is manual — `stepOnce` advances one
  tick per click, no timer, and the continuous ▶ is disabled in step mode), and the **Play / Pause / Stop**
  controls. **Stop** discards `runLive` and clears the
  run trail → the seeds reappear; **Reset** removes the seeds too. The Inspect Traverser section places/aims/
  removes seeds **only while stopped** (a run owns the walkers). Grid resize is locked while a run is active
  (`runLive !== null`). On **mobile**, Fit / Reset / grid-size collapse behind a **⋯ dropdown**
  (`.canvas-more` trigger + `.canvas-extra` popover, outside-tap/Escape to close); inline on desktop.
- `src/components/Panel.tsx` — reusable collapsible dock panel (collapses to a thin rail). Collapse is
  **controllable** (`collapsed` + `onCollapsedChange`, falling back to internal `useState` when
  uncontrolled) so Workspace can run the one-open-per-side accordion; the **whole header is the collapse
  button** (click the title, not just the chevron). `wide` = 2× width (34rem); `fill` (a SEPARATE marker,
  not implied by `wide`) lets the editor docks stretch their body — the fill rules live in
  `TraversersPane.css` scoped to `.panel--fill`, so every-pane-is-wide doesn't leak fill everywhere.
- `src/components/CustomPredicatesDialog.tsx` (+ `.css`) — the predicate library as a modal (the
  TilingPicker/ConfirmDialog portal recipe), hosting `<PredicatePane>` as its body. Opened by the "Custom
  predicates" badge (`.preds-badge`, in `index.css`) at the foot of the Traversers / Coloring /
  Initial-state panes; Workspace owns the open state (`predsOpen`).
- `src/components/HelpButton.tsx` (+ `.css`) — the reusable faded **"?" explainer**: a small muted
  button that opens a little info dialog (reuses the TilingPicker modal pattern — portal, Escape,
  backdrop, focus). Use it for non-obvious concepts (ethos §2); the Predicate + Coloring panes float
  one in their **top-right corner** (`.pane-help`, absolute), not inline with the lead text.
- `src/components/{ExportMenu,ExportStrip,ImageViewer}.tsx` (+ `.css`) — the export UI (drives `src/export/`).
  `ExportMenu` is the top-bar chip + popup (pixels-per-tile / grid width×height / resolution / background /
  edges) — a pure form that builds the recipe, calls `onStartExport`, and **closes immediately** (export is
  fire-and-forget; it has a "?" explainer for the concept). **Resolution is the fixed anchor** (own chain-lock,
  changes only on a direct edit, never shows `~`); pixels-per-tile and the grid width/height are two views of
  fitting that same fixed resolution — editing either re-derives the other (marked `~`), and the grid's own
  chain-lock keeps ITS width:height in ratio independently of the resolution's lock, so e.g. the square tiling
  (the only generator honest about a rectangular grid — others average width/height into one count) can hold
  an exact, deliberately uneven tile count like 84×85. `ExportStrip` is the
  bottom-right thumbnail strip: a job shows first as a **running** placeholder (dashed + pulsing, a spinner
  where the download button will be, **not clickable**, X = cancel), then flips to **done** (the real
  thumbnail — clickable to view, download + remove); a grid chip returns from the viewer. `ImageViewer` is the
  zoom/pan `<img>` (no Konva) that swaps in over the canvas. **Workspace owns the jobs:** `startExport` adds a
  running `ExportItem` immediately, runs `generateExport(params, signal)` (a per-job `AbortController` kept in
  a ref), then flips it to done + auto-downloads; `removeExport` aborts a running job (terminates its worker)
  or removes a finished one; it also owns the object-URL lifecycle (revoke on remove / cap-evict the oldest
  *finished* / unmount + abort-all) and the `viewingId` swap.
- `src/dsl/` — the **pure tile-predicate DSL** (no React/DOM/Konva), public API via `src/dsl/index.ts`.
  `types.ts` (AST: numeric `Expr` + boolean `Pred`, incl. the `shape`/`tile-type` leaf; each tile-reading
  leaf — `attr`/`regterm`/`shape` — carries an optional **`@`-path** `TilePath` that reads it on another
  tile. A **list** `[…]` is a `ListReduce` (`:sum` default / `:avg` ceil / `:min` / `:max` → an `Expr`) or,
  with a boolean reducer + comparison, a `ListNumCompare`/`ListShapeCompare` `Pred` (`:all`/`:any`/`:none`/
  `:xor` = exactly one). `[A]`/`[A, B]` are one/two-element lists of `RegTerm` — the old `RegRead` node is
  gone but the text round-trips byte-stable. A list is homogeneous (all-numeric OR all-`tile-type`); a bare
  direction (`r1`/`e2`) isn't a value. `parse.ts` intercepts a boolean-reduced list at the comparison level
  (`boolListAhead`); a numeric list is a normal atom (`parseListExpr`)),
  `lex.ts` (`@` is an `at` token), `parse.ts` (recursive descent; `parsePath` reads `@eN`/`@rN`/`@lN`/
  `@straight`/`@nearest-unvisited`/`@target`/`@tile N`), `serialize.ts` (canonical text = the auto-name;
  `serializePath`), `eval.ts` (`evalNumber`/`evalPredicate`; ÷/% by zero → 0; missing attr **or unresolved
  path** → its `default`/0, a `tile-type@…` on a missing tile → false), `attributes.ts` (the keyword→compute
  registry + `EvalContext`, incl. the **`nodeForPath` hook** that resolves a path to another tile's node —
  the traverse layer supplies a full resolver (it has a walker's heading/dest); the **colorizer supplies a
  walker-free one** (`resolveAbsolutePath`, `src/traverse/lang/exec.ts`) that resolves only **absolute**
  paths — `@eN` edge chains + `@tile N` — so a coloring predicate can read a neighbour (`[A@e0] > 0`),
  while relative hops (`@rN`/`@lN`/`@straight`/`@nearest-unvisited`/`@target`) still fall back to default),
  `target.ts` (`predReadsTarget`
  — does a guard read `@target`? drives per-branch move filtering), `edit.ts` (`replaceAt` for the visual
  editor). Reused by the visual editor + traversers, so keep it pure. **Path-placement gotcha:** the registry
  path goes INSIDE the brackets — `[A@e2]`, NOT `[A]@e2` (the latter errors "expected a comparison"); a bare
  attribute suffixes it (`visited@e2`), and `tile-type@e0 == wedge`. `@target`/`@tile N` must be a path's
  **only** hop (they name a tile directly); edge hops chain. `reserved.ts` (`reservedNameError` +
  `RESERVED_WORDS`) forbids naming a predicate/traverser a grammar word (every keyword across all three
  DSLs + attribute/registry names) or a positional reference (`t1`/`e3`/`r1`/`l2`) — the Predicate &
  Traversers editors show it as a red inline error (uniqueness vs other predicates/traversers is checked
  at the call site). The Traversers **list** also red-badges any definition that doesn't compile.
- `src/colorizer/` — pure `colorize(rules, predicateText, tiling, overlay, indexById) → Map<id, rgba>`:
  evaluates each rule's predicate once, alpha-composites matching rules top→bottom (per-rule opacity =
  blend), resolves flat/ramp (modulo + optional breakpoints). Memoized in Workspace, **not** per frame.
- `src/traverse/` — the **pure traverse engine** (no React/DOM/Konva), public API via `src/traverse/index.ts`.
  `types.ts` (`Traverser {id,tile,heading}` — heading in radians, world y-up, same convention as a side's
  outward `normalAngle`; `TraverseState`; `TickResult`), `step.ts` (`chooseMove` = least-turn to an adjacent
  **unvisited** tile, returning the new heading; `stepTraversers` = the synchronous tick: read the frozen
  overlay → compute all moves → coalesce same-tile walkers → write one visit per target at the new step;
  `headingOptions`/`rotateHeading` for the edge-snapped Inspect aim). The tick's decisions live in a shared
  `computeTick`; `stepTraversers` applies them to a **fresh** overlay (the live React run), while
  `stepTraversersInto` applies them **in place** into a mutable overlay — used by the headless export run so a
  long run on a big grid is O(work), not O(ticks × visited). May import `src/tiling` + the overlay helpers; the
  basic behaviour is hardcoded, with the **DSL-driven** traversers (§5) to slot in behind the same
  `stepTraversers` shape — so keep it pure. (Auto-place is no longer here — it moved to `src/initstate/`.)
  `traceLog.ts` (`buildTraverseLog`) runs a setup to completion **traced** (loops `stepTraversersTraced`,
  mirrors `initRun`) into a downloadable JSON — the "⤓ Download full log" button at the foot of Inspect.
- **Directive precedence — `forbid` > `allow` > the move's own guard** (`src/traverse/lang/exec.ts`
  `moveAllowed`, reworked 2026-07-05, `4a140c4`). Per candidate destination: a matching `forbid` blocks it;
  else a matching `allow` permits it — **overriding** even the move's own `if`-guard; else the own guard
  decides; else it's allowed. So `allow` only ever ADDS permission — one with nothing to override is a
  **no-op** (the old code wrongly treated `allow` as a REQUIREMENT, gating even unguarded moves). Hence **a
  gate is a `forbid` of the negation**, never an `allow` — "only onto unvisited" is `directive if
  visited@target > 0 always forbid move`; the gallery/prototype recipes were migrated off the old
  allow-as-gate idiom (see the `src/data/galleryRecipes.ts` header). A move rule's own non-`@target` guard
  is still gate-skipped up front ONLY when no `allow` directive is active (else it's evaluated per candidate,
  so an `allow` can resurrect it). Trace reject `by:'per-target'` was renamed `by:'own-guard'`.
- **Move chains join with `@`, registries can be bare, `if {}` blocks, `find-tile` search, `exists@path`**
  (2026-07-06, `726b28f`). `Chain` (`src/traverse/lang/types.ts`) is now `{base?: ChainBase; refs:
  EdgeRef[]}` — `base` is absent (the walker's current tile), `{kind:'found', index}` (a prior `find-tile`'s
  result, `fN`), or `{kind:'find', find: FindTile}` (an INLINE `find-tile … {…}` run right there, which also
  stores its result under its own index). `refs` join with `@` (the old `->` chain separator is gone — no
  recipe used it). A **`found` `PathSeg`** (`src/dsl/types.ts`) lets `fN` appear as the FIRST hop of any
  `@`-path (`tile-type@f1`, `[A@f1]`); the parser rejects it as a later hop (`e0@f1`) since it names a tile
  directly, same rule as `@target`/`@tile N`. **`find-tile <pred> { <moves> }`** is a pure BFS
  (`src/traverse/lang/find.ts` `bfsFind` — visited-set, excludes the start tile, capped at the tiling's tile
  count) seeded by expanding the walker's tile through the body's `move` lines (ghost moves — they carry no
  base of their own, and `find.maxSplit` caps how many children each frontier tile spawns, **default 1** so
  it's a single-path search unless a `max-split = N` line inside the block widens it; the cap is applied in
  `runFind`'s `expand`, and `parseFindTile` reads the `max-split` line — added 2026-07-06, `a2dac29`); the
  first tile matching `find-tile`'s own predicate is stored as that occurrence's `fN`, **numbered by SOURCE
  POSITION** (not runtime order) — `compile.ts`/`parse.ts` collect every `fN` reference via
  `src/dsl/target.ts`'s `predFoundIndices`/`exprFoundIndices` and reject one with no matching block. **Bare
  tile registries** — `parseAtom` (`src/dsl/parse.ts`) now accepts a lone `A`/`B`/`C` as a `RegTerm` outside
  a list (`A == 5`, `put A = 1`); `[A]` still parses as a one-element list, so both forms coexist and
  serialize distinctly. **`if <pred> { … } [else { … } | else if …]`** is an `IfBlock` `Stmt` (with an
  optional `elseBody`; `else if` is an `elseBody` of one nested if-block — parsed by the recursive `parseIf`
  in `parse.ts`, added 2026-07-06 `a2dac29`) — the traverser parser is BRACE-AWARE (`splitUnits` in
  `parse.ts` splits on `nl` only at brace-depth 0, so a block's body spans several lines as one parse unit,
  and a depth-0 `nl` whose next token is `else` does NOT split, so an Allman-style `}`/`else` stays one
  unit); `exec.ts`'s statement loop was refactored into a recursive `runStatements` so a block runs its
  `body` (or `elseBody`) inline, sharing the tick's directives/self-state/found-list. Header settings are
  rejected inside a block (parsed with a `null` settings sink). **`exists@path`** (a new `Pred` leaf, added mid-review after the owner asked
  how to distinguish a failed `find-tile` from one that found a tile with a falsy value — every existing
  off-grid fallback reads identically to a legitimate 0/false) is `ctxForLeaf(ctx, path) !== null`; works on
  any path (`exists@e0` tests a tiling boundary), requires a path (bare `exists` errors — the current tile
  always exists). All four Pred-exhaustive switches (`eval.ts`, `serialize.ts`, `target.ts`,
  `resolveRefs.ts`) plus the visual chip editor (`PredicateVisualEditor.tsx` — `exists` renders as a static
  read-only chip, same as `listcmp`/`shapecmp`) needed a case; the compiler's exhaustiveness checking is what
  caught every site.
- `src/initstate/` — the **pure Initial-state DSL + resolver** (no React/DOM/Konva), public API via
  `src/initstate/index.ts`. `types.ts` (`InitStmt {shape: line|blob, what, param, guard?}`; `what` = a
  traverser / an `[A]`–`[C]` reg / `visited`), `parse.ts` (reuses the traverser `lexProgram`; `auto-place
  line|blob {…} [if <pred>]`; a short/bad spec reports the shape TEMPLATE, not a bare `expected ","`),
  `serialize.ts`, `compile.ts` (resolve named-predicate guards), `geometry.ts` (`lineTiles` = the tiles a
  thin line crosses by vertex-straddle — NOT single-file, a "lane-nearest" variant was tried + reverted;
  `blobTiles` = the nearest tile + `radius-1` BFS rings via `uniqueNeighbors`), `resolve.ts`
  (`resolveInitialState(doc, tiling, order, defs, base, indexById)` → `{seeds, writes, unknownRefs}`, where
  `order` = user traverser NAMES in list order for `t1`,`t2`,… — a bare name resolves directly;
  `mergeByTile(hand, init)` hand-wins; `applyInitWrites(base, writes)` applies the SET-writes over hand-paint
  via `applyRegistryWrites` op `'set'` + `setVisits`). Grid-relative → used by BOTH the live Workspace and
  `prepare.ts` so preview == export. Guards run at seed time (no walker) → current-tile attributes only. The
  traverser `Program` is back to `{settings, statements}`.
- `src/export/` — the **pure, isomorphic image-export core** (no React/Konva), public API via
  `src/export/index.ts`. `runToCompletion.ts` (loops `stepTraversersInto` to completion, `maxTicks` cap),
  `remap.ts` (seed/paint placement by bounds-centre offset, grid-size-independent), `renderTiling.ts`
  (`renderToCanvas` — a Canvas2D subset of `drawTiles`; **flush** no-edge rendering via `src/canvas/flush.ts`;
  takes a structural `RenderCtx`, so `OffscreenCanvas`/`<canvas>`/a fake all work), `sizing.ts`
  (`pickCanvasSize` → aspect-matched WxH + device caps; `clampResolution` = just the caps-shrink math with
  no bounds, so the debug log can compute the target size without a tiling), `recipe.ts` (the serialisable
  `Recipe` + `buildRecipe`/`parseRecipe`; **versioned** — see below),
  `prepare.ts` (rebuilds
  defs/predicateText/index + remaps a recipe — **mirrors the Workspace assembly**, keep in sync), `generate.ts`
  (`computeExport` — the pure build→run→colorize→size; takes an `onStage` hook so a failure is attributable
  to a stage), `debugReport.ts` (the pure export-failure debug log — see below). **Impure (DOM, main-thread
  only, NOT in the pure graph):** `pngText.ts` is pure but `exportWorker.ts` (the Web Worker — imports only pure modules + uses
  OffscreenCanvas; Vite bundles it to its own chunk ~97 KB — it pulls the whole tiling/DSL engine via
  `computeExport`, so that size is expected; the guard is that it stays its OWN chunk with no React/Konva),
  `exportImage.ts` (worker driver + main-thread fallback +
  metadata splice + auto-download; takes an `AbortSignal` — abort `terminate()`s the worker mid-run and rejects
  with an `AbortError` the UI swallows as a cancel; also home to the `ExportFailure` error), `debugLog.ts`
  (gathers the environment + downloads the debug log), `download.ts`. **Keep Konva out** and keep the pure files DOM-free so the
  worker + Vitest stay happy.
  - **Export-failure debug log (`89929a7`).** A non-abort export failure downloads a rich JSON report so a
    developer can diagnose (and reproduce) it without the session — wired in `Workspace.startExport`'s
    `.catch` (`downloadExportDebugLog`; a user cancel / `AbortError` is skipped). **How failures carry
    context:** each candidate step is tagged with an `ExportStage` — `computeExport(recipe, caps,
    onProgress, onStage)` reports build-tiling/prepare/run/colorize/size; the worker + `viaMainThread` add
    render/thumbnail/encode-blob and `generateExport` adds embed-metadata. A failure is thrown as an
    **`ExportFailure`** (`exportImage.ts`) carrying `{path: 'worker'|'main-thread', stage, causeName,
    causeStack, workerEvent}`; the worker posts `{message, name, stack, stage}` across the boundary, and
    `worker.onerror` (the bare-crash / empty-message "export worker failed" case) captures the `ErrorEvent`
    fields. **The report** (`debugReport.ts`, PURE): `buildExportDebugReport` embeds the whole `Recipe`
    verbatim + environment (passed in by `debugLog.ts`) + caps + progress + a `summary` + **guarded**
    diagnostics — it re-runs only the CHEAP pure pieces (buildTiling, `compileProgram` per traverser,
    `compileDoc`, `clampResolution`/`pickCanvasSize`) and **never re-runs the traverse**; every diagnostic
    is individually try/caught into `diagnosticErrors`, so the log ALWAYS builds. `toErrorInfo` duck-types
    the `ExportFailure` (prefers `causeName`/`causeStack` over the wrapper's) so the pure module needs no
    DOM import. The single most useful fields when triaging: `summary.stage`, `diagnostics.targetCanvas`
    (a clamp reveals an OOM-sized request), and `diagnostics.traversers[].compiles`.
  - **Recipe versioning (so images survive app updates).** The recipe carries `schemaVersion` (the
    compatibility key) + `appVersion` (a human stamp, never branched on). **When you change the recipe shape
    OR an engine/DSL behaviour that affects how an old recipe reproduces, bump `RECIPE_SCHEMA_VERSION` and add
    a `MIGRATIONS` entry** (`{from, migrate}`) in `recipe.ts`. `parseRecipe` returns a `ParseResult`:
    it migrates an OLDER recipe up to the current shape (chain in `migrateRecipe`), and REFUSES a NEWER one
    with `reason: 'too-new'` (the reopen UI should say "update the app") — never strict-equality-reject an old
    image. Current exports are `schemaVersion: 7` (`MIGRATIONS` holds v1→v2 output-size + v2→v3 the empty
    `initialState` doc + v3→v4 which splits the single `gridN` into independent `gridW`/`gridH`, so the square
    tiling can export a genuinely rectangular grid + v4→v5 which sanitizes predicate/traverser NAMES —
    spaces → `_`, since names must now be single identifiers to be referenceable — and renames any placed
    walker's `seed.def` in step so it still resolves; auto-named predicates are left alone, and the rendered
    image is unchanged since names map to ids; **+ v5→v6 which is purely ADDITIVE** — coloring rules gained an
    optional `enabled` flag for the Coloring pane's eye toggle; absent = enabled so old recipes reproduce
    unchanged, and the migrate step just advances the version; **+ v6→v7, ALSO purely ADDITIVE** (2026-07-06)
    — the traverser DSL grew `@`-chained moves / bare registries / `if {}` blocks / `find-tile` search /
    `exists@path`, none of which change how an existing v6 PROGRAM reproduces (they're new syntax, not a
    reinterpretation of old syntax), so the step just advances the version; it exists only so a recipe that
    USES the new syntax is stamped v7 and an older build refuses it cleanly ("update the app") instead of
    trying and failing to compile the traverser). **The live gallery's stored `recipe_json` was ALSO rewritten
    once via `tools/migrate-names.mjs --apply`** (idempotent; a name-only transform, leaving each row's schema
    version for on-read migration) — do the same if names ever need another sweep. **Pre-release exception (2026-06-29, again 2026-07-03):**
    the breaking DSL changes (directives → predicate-first + `@ target`, then decoration → per-attribute
    `@`-paths + `edge N`→`eN`) deliberately did NOT bump the schema — while unreleased we hand-fix the few saved
    PNGs (the in-repo gallery/prototype recipes are just edited) instead of shipping migration code (owner's
    call). The **v3 bump (2026-07-04, `initialState`)** was the exception's exception: an ADDITIVE field, so a
    one-line v2→v3 migration (default `initialState: ''`) is cheaper than hand-fixing and keeps old PNGs
    opening. **The v4 bump (2026-07-05, `gridW`/`gridH`) resumed the always-bump-and-migrate rule** now that
    images are shared with others (the live community gallery) — and it's why: fixing it surfaced that
    `src/gallery/api.ts`'s `fetchRecipe` was casting a stored creation's JSON straight to `Recipe` with no
    `parseRecipe` call, unlike the PNG-import path, so an already-uploaded (pre-v4) creation would have
    silently broken on "Import to canvas" the moment this shipped — now fixed to migrate on fetch too.
- `src/state/` — localStorage-backed stores: `predicateStore.ts` (custom predicates as DSL text +
  name), `coloringStore.ts` (the ordered rules, key `…:coloring:v2`), `traverserStore.ts`,
  `initialStateStore.ts` (the single Initial-state DSL document — `{id, text}`), `persist.ts`
  (SSR/quota-safe load/save + `newId`). Pure list updaters are unit-tested; the hooks wire them to
  persistence. Each store has a **`setAll`** (replace the whole list/doc — used by reopen). `pendingRecipe.ts`
  is the one-shot gallery→canvas handoff: the gallery stashes a `Recipe`, the Workspace consumes it on mount.
- `src/data/galleryRecipes.ts` — placeholder `Recipe`s attached to the gallery images so clicking one opens a
  ready setup (fake for now; real saved creations will carry their recipe in the PNG). `Workspace.loadRecipe`
  applies a recipe (tiling/grid/seeds/paint + the four stores' `setAll`, incl. the Initial-state doc); the canvas-stage also accepts a
  dragged exported PNG (`decodeRecipeFromPng` → `parseRecipe` → `loadRecipe`).
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
  **The 0/360 seam is at north**, so `clockwiseEdgeOrder` **anchors edge 0 on the most-north edge** then
  **walks the perimeter clockwise from there** (CCW winding → clockwise = decreasing local index) —
  NOT a sort by outward-normal angle. Two bugs, two fixes, both guarded by `src/tiling/edge-order.test.ts`
  across all 12 tilings: (1) the raw clockwise-from-top key alone put a top edge sitting a hair (float
  round-off on flat-top octagons) or tens of degrees (the chiral snubs) *west* of north at ~359° → LAST,
  rotating the numbering by one (the slot-0 kalleboda octagon bug); anchoring on the most-north edge fixed
  it. (2) Anchoring alone still **sorted by angle**, which only walks the perimeter clockwise for **convex**
  shapes — the **wedge is concave**, so its normals zig-zag non-monotonically and the numbering scattered
  (rotate didn't cycle 0..7 in order); the fix was to replace the sort with a perimeter **walk**. The test
  file asserts both invariants: edge 0 = the most-north edge, AND consecutive edge numbers are
  perimeter-adjacent (`order[i] - order[i+1] ≡ 1 mod n`) — don't regress either.
- **Absolute edge numbers are clockwise-HANDED, so selective absolute routing is chiral** (the "asymmetric
  fractal" finding, 2026-07-06). `eN` is heading-independent, but the numbering is *clockwise from north*, so
  a mirror reflection maps **edge `k` → edge `(n−k)`**, NOT edge `k`→`k` (hexagon: e1↔e5, e2↔e4; triangle:
  e1↔e2). Consequences: a **full fan** (`move [e0..e5]`) is mirror-symmetric because the whole SET maps to
  itself; but a **selective** route is chiral — the mirror of a triangle's `move e1@e1` is `e2@e5`, not
  `e2@e2`, so `{e1@e1, e2@e2}` breaks the tiling's mirror symmetry (first triangle touched → asymmetry, even
  from a hexagon start). This is **not a bug** — it's inherent to a handed numbering. To keep a pattern
  symmetric, route by a mirror-invariant criterion (a full fan; the self-mirror north edge `e0`; neighbour
  shape), not by a raw clockwise index. `src/traverse/symmetry.test.ts` guards that the engine keeps full-fan
  patterns symmetric (so a real edge-numbering regression still fails); it deliberately does NOT test
  selective routing. The `⤓ Download full log` button (`traceLog.ts`) is how this was diagnosed — capture the
  run, check the visited set's geometry.
- **A traverser's `heading` is an edge NUMBER, not an angle** (`src/traverse/types.ts`; refactored
  2026-07-02, `96ede11`). It is the user-facing edge its `straight` move exits (0 = north, clockwise —
  the `clockwiseEdgeOrder` layer above). So `r1` = `(heading+1) mod sides`, `l1` = `heading-1`, the
  Inspect **rotate** is that same ring step (`rotateHeading` in `step.ts`), and the arrow just points at
  that edge — there is **no** "just-placed / first-step" special case. The whole tick runs in edge
  numbers; the **only** thing layered on top is the wedge's concave straight-through pairing
  (`straightPartner` in `src/traverse/lang/edges.ts`, from `shape.oppositeSides` where
  `straightThroughOpposite`), applied **only when a walker arrives** on a tile (to compute its new
  heading) — never during rotation. The Recipe/PNG format still stores heading as a portable **angle**
  for durability; convert at the boundary — `remapSeeds` (angle→`nearestEdge`) on load, `buildRecipe`
  (`edgeNormalAngle`) on save — so old images round-trip. **Don't reintroduce angle math into the tick.**
- **Inspect tile mini (`src/components/TileMini.tsx` + `.css`)** — a small SVG diagram at the top of the
  1-tile Inspect view: the selected tile's REAL vertices in its on-canvas orientation (world y-up flipped
  to SVG y-down), every edge labelled with its `clockwiseEdgeOrder` number (edge 0 accented), a heading
  arrow when a traverser sits there, and optional dotted `straightPairs` lines. Below it, a **"Straightness"**
  blurb: wedges name the dotted lines as their hand-crafted opposite-edge pairing (`shape.oppositeSides`
  where `straightThroughOpposite`); triangles just say right-handed (no edge is directly opposite on an
  odd-sided shape). Pure/no-Konva component, Vitest-tested with jsdom (plain SVG, unlike `TilingCanvas`).
- **The traverser decision log** lives in `src/components/DebugPane.tsx` (+ `.css`) with the pure
  trace→tiles mapper in `src/debug/highlights.ts` (Konva-free, unit-tested). It reads the engine's
  **opt-in** `TickTrace` (`src/traverse/trace.ts`, built only by `stepTraversersTraced`). It now sits at
  the **bottom of the Inspect pane** (the old standalone Debug dock + its canvas-bar toggle are gone).
  `Workspace` gates the cost with `traceOn = rightOpen === 'inspect'`: when Inspect is closed no trace is
  built and `TilingCanvas`'s `highlightGroups` is undefined (nothing drawn) — the zero-cost-when-hidden
  replacement for the toggle. The role-coloured outline overlay is `drawHighlights` in `TilingCanvas`.

**Running commands (tool shells):** `node`/`npm.cmd`/`npx.cmd` are NOT on PATH here — prepend it
every command: `$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx.cmd vitest run`
(`npm.cmd run build` / `npm.cmd run lint`). See §3.

**Local dev WITH the gallery backend (`npm run dev:local`).** Plain `npm run dev` is FRONTEND-ONLY — no
`/api`, so the gallery page just errors locally. To run the app *with* a working local gallery, use
**`npm run dev:local`** → open **http://localhost:8788**. It (1) seeds sample creations into a local
D1+R2 if the local gallery is empty (`tools/seed-local.mjs` + the committed `tools/sample-creations.json`
fixture — 8 real gallery fractals), then (2) runs `vite build --watch` + `wrangler pages dev` together
(via `concurrently`). **Edit → it auto-rebuilds (~2s) → refresh the browser** to see the change with the
backend live. `npm run seed:local` re-seeds standalone. Hard-won gotchas:
- It is **NOT** hot-module reload: `wrangler pages dev` serves the **built `dist/`** (because
  `wrangler.toml` has `pages_build_output_dir`) and **ignores `--proxy`**, so you can't proxy the live
  Vite dev server for true HMR — hence the build-watch + manual-refresh loop. (`wrangler pages dev` DOES
  re-read `dist/` per request, so a rebuild shows on refresh without restarting it — verified.) `--config`
  is also rejected by `pages dev` (Pages needs the standard `wrangler.toml`), so a bindings-only dev config
  isn't an option.
- The local D1 lives in `.wrangler/state`, keyed by the **`database_id`** — changing that id (as we did
  when wiring the real deployed DB) orphans the old local rows into a different sqlite; just re-run
  `seed:local`. Seeding runs BEFORE the server starts (inside `dev:local`) so there's no file-lock clash.
- `seed-local.mjs` invokes wrangler with an **argument array** (`execFileSync`, no shell) so SQL with
  parens/quotes/embedded recipe JSON passes without Windows `cmd` quoting hazards (a bare
  `wrangler d1 execute --command "SELECT COUNT(*)…"` in a shell breaks on the parens).
- Deploy is unaffected: `npm run deploy` is still `npm run build && wrangler pages deploy dist`.

**Running the gallery backend across SEVERAL worktrees/agents at once.** No shared local database — each
worktree's `.wrangler/state` lives inside that worktree's OWN directory (it's gitignored, never synced),
so every worktree that runs the backend gets its own private, throwaway local D1 + R2, seeded
independently. Two worktrees can seed/upload/experiment locally without ever touching each other's data.
The **only** truly shared thing is the REAL production database + bucket on Cloudflare — reached only by
an explicit `--remote` flag (`db:migrate`) or an actual `deploy`. Be deliberate before ever typing
`--remote` from a worktree session; local dev commands never need it.

The real danger is **ports**, and it's worse here than the existing Vite gotcha above. **`wrangler pages
dev` does NOT refuse an already-taken port the way Vite's `--strictPort` does** — verified by running two
instances on the same port at once: BOTH printed `Ready on http://127.0.0.1:8788`, and `netstat` showed
**two separate `workerd.exe` processes simultaneously `LISTENING` on the identical port**, with no
reliable way to know which one actually answers a given request. Unlike the Vite trap (predictably serves
the wrong tree), this is silently nondeterministic — don't rely on "it printed Ready" as proof you have
the port.

**The fix — give each worktree's backend its own port, same convention as the Vite preview port, offset
into a non-colliding range:** `8800 + (sum of the worktree folder name's char codes) % 500` (Vite uses
`5200 + … % 500`, so the two never collide with each other OR with the human's plain `8788` default).
Example: `gifted-colden-816061` → Vite port `5356` (matches this session's actual `.claude/launch.json`)
→ backend port `8956`.

**For AGENT verification, skip `npm run dev:local` entirely** (it's a human convenience: a live
build-watch loop defaulting to the fixed port 8788). Instead, reuse the exact `.claude/launch.json` +
`preview_start` recipe from the section below, just pointing at `wrangler pages dev` instead of Vite —
one build, one serve, an explicit unique port, no watch loop needed for a verification pass:
```json
{ "name": "gallery-<suffix>",
  "runtimeExecutable": "C:\\Program Files\\nodejs\\node.exe",
  "runtimeArgs": ["<worktree-abs-path>\\node_modules\\wrangler\\bin\\wrangler.js", "pages", "dev", "--port", "<PORT>"],
  "port": <PORT> }
```
Run `npm run build` first (and after each source edit — no watcher in this mode), then `preview_start`.
Seed once with `npm run seed:local` (or `node tools/seed-local.mjs`) before or after — it's independent of
which port later serves it.

**Never `taskkill /IM workerd.exe` blindly** — it kills EVERY worktree's (and the owner's) backend
process, not just yours (this session did exactly that during testing, before realizing the risk — got
away with it only because nothing else was running at the time). Always kill by the **specific PID** you
started or found via `netstat -ano | findstr :<your-port>`, same rule as the Vite-port discipline above.

**`npm run branches` does not (yet) show backend/gallery servers** — it only tracks the plain Vite
frontend dev-server ports (5170–5700). A worktree's `wrangler pages dev`/`dev:local` backend on an 88xx
port is invisible to it; check that separately (`netstat -ano | findstr :89` or just try the URL).

**Preview server (main checkout):** start via the preview tool using `.claude/launch.json` (name
`dev`) — it runs Vite through `node.exe` directly on **port 5174**, dodging the npm-shim policy. Don't
launch the dev server through Bash. **If you're in a git worktree, this default is wrong and will make
you preview the WRONG tree's code — read "Worktree sessions" next before starting a preview.**

**Worktree sessions (the owner may run several at once).** You can tell you're in one: your working
dir is `…\.claude\worktrees\<name>` and the environment note says "operating in a git worktree." The
owner runs multiple worktree sessions (and the main checkout) in parallel, each on its own branch — so
**never assume a server that's already running is serving *your* code.** The trap: every checkout's
`dev` config hardcodes **port 5174 `--strictPort`**, so only the FIRST Vite to bind 5174 wins; a second
worktree's `preview_start` then **silently reuses that running server** (another tree's code). The owner
also often keeps a manual `npm run dev -- --host` on **5173** (the main checkout, for the phone tunnel).
Two facts make the fix clean: (1) `.claude/launch.json` is **gitignored** (`.gitignore:27`) — per-worktree,
never merges, so give yours its own config freely (a fresh worktree may have NO launch.json — gitignored
files aren't checked out — or a copied 5174 one; either way, set your own); (2) a worktree here has **no
real `node_modules`** (only Vite cache dirs like `.vite`) — it resolves deps from the main repo's
`node_modules` by Node's upward walk, so the default **relative** `node_modules/vite/bin/vite.js` does
NOT resolve in a worktree; point at the main repo's **absolute** path. **Recipe** — before previewing,
write `.claude/launch.json` with a UNIQUE name (so the tool starts a fresh server, not reuse another's)
and a UNIQUE port, absolute vite path (cwd stays the worktree, so Vite serves *your* branch):

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "dev-<suffix>",
      "runtimeExecutable": "C:\\Program Files\\nodejs\\node.exe",
      "runtimeArgs": ["E:\\Code\\exploroboros\\node_modules\\vite\\bin\\vite.js", "--port", "<PORT>", "--strictPort"],
      "port": <PORT> }
  ]
}
```

Pick `<PORT>` deterministically from the worktree folder name so it's stable across restarts and
unlikely to clash: `5200 + (sum of the name's char codes) % 500`, then bump past any port already in use
(`Get-NetTCPConnection -State Listen`). E.g. worktree `sad-johnson-a61889` → **5238**. Then
`preview_start` your unique name and **confirm it's serving YOUR branch before trusting any check** —
fetch a known-new served source file with a *synchronous* `XMLHttpRequest` (an async `fetch` won't
serialize back through `preview_eval`), e.g. GET `/src/<a file your branch added>` and grep the response.
That served-source fetch is the reliable proof because the headless preview tab is frequently
non-interactive (React `onClick` never fires) and capture wedges — see the two "Preview-capture" /
"Konva + HMR" notes below; don't loop on it, hand the interactive/visual check to the owner's device.

**The owner's OWN BROWSER can still show stale code on a port that's proven correct via curl/XHR — a
fresh port is the fix, not a harder proof.** Seen 2026-07-01: the served-source XHR check above (run from
MY headless tab) confirmed a fix was live, and the owner even fully closed and reopened their browser and
confirmed the footer's worktree name — yet their tab still showed the OLD scrambled behaviour. The
headless tab's XHR check passes because it's a **separate browser profile with no history on that
origin**; the owner's tab had visited that exact `localhost:<port>` origin against an EARLIER server
instance (before the fix), and a full app close/reopen doesn't necessarily clear the HTTP/disk cache tied
to that origin. No amount of re-proving the server is correct will convince a tab that's reading its own
cache. **Fix: stand up a second `launch.json` config on a brand-new port the owner's browser has never
visited** and have them switch to that URL — don't keep asking them to re-verify the same port. Worth
doing pre-emptively whenever you land a fix on a port that's been iterated on for a while in the same
session, rather than waiting for a second "still broken" report to reach for it.

**Tell the owner, plainly and early — the owner does not read code and runs several sessions at once,
so they will NOT know which is which unless you say so.** As soon as you know your setup, state in your
reply: (1) that you're working in a **worktree session** (the worktree name + branch); (2) the **other
exploroboros instances currently running** and their addresses, so they aren't confused by the extras —
enumerate the listening Vite ports (`Get-NetTCPConnection -State Listen`, look at 5173 / 5174 / 52xx)
and label which is the main checkout vs another worktree where you can; and (3) **this session's own
address**, e.g. "this session is at `http://localhost:5238/#/canvas`". Repeat your address whenever you
hand something off to verify, so the owner opens the right page.

**Also label your pages in the footer (a persistent on-screen marker, so the owner can eyeball which
instance a tab is).** Append your session name to the version line in `src/components/Footer.tsx`:
`v0.0.0 · phase 0 - <worktree name>`. This is local-only and **must never reach main**, so enforce it
with `git update-index --skip-worktree src/components/Footer.tsx` — git then ignores the edit in your
worktree (it won't show in `git status` or commits; reverse with `--no-skip-worktree`). On main the line
stays `v0.0.0 · phase 0`. (The edit still compiles + renders — skip-worktree only hides it from git, not
from Vite. It's a *static* render, so it shows even when the headless tab's React events are dead.)

**Phone tunnel (develop on the go).** Use **ngrok** — the one that actually works here. In a terminal *the
owner keeps open*: `ngrok http <port>` (e.g. `5173` for the Vite dev server). It comes up on the account's
**reserved static domain `https://makeover-backless-helpline.ngrok-free.dev`** (same URL every run — nice for
on-the-go); on the phone, tap ngrok's one-time **"Visit Site"** button. ngrok's interstitial gates only the top
document, *not* the JS, so the SPA loads. Gotchas hit in practice:
- `vite.config.ts` needs `server: { allowedHosts: true }` or Vite returns "Blocked request" for the tunnel's
  Host header (added 2026-06-27).
- **`ngrok` → "The system cannot find the file specified"** = a broken **WindowsApps App Execution Alias**
  (0-byte reparse stub at `%LOCALAPPDATA%\Microsoft\WindowsApps\ngrok.exe`) shadowing the real binary on PATH.
  Fix: delete that stub (user-owned; re-creatable via Settings → App execution aliases) — `ngrok` then resolves
  to `…\WinGet\Packages\Ngrok.Ngrok_…\ngrok.exe`.
- **`ERR_NGROK_121` "agent version too old"** — the account requires agent **≥ 3.20.0**; run **`ngrok update`**
  (bumped 3.3.1 → 3.39.9 on 2026-07-03). Config + authtoken live at `%LOCALAPPDATA%\ngrok\ngrok.yml`.
- **Never launch the tunnel as a tool background process** — it prints its URL then exits 0 on stdio EOF within
  seconds; it must run in a real, persistent terminal. (So I can't hand over a live URL — verify with a
  start→probe→kill inside *one* command, then hand off the command for the owner to run.)

**Avoid localtunnel/loca.lt for this SPA:** its reminder page returns **HTTP 511** for asset/module requests, so
the phone receives reminder HTML *in place of the JavaScript* → **white screen** (React never boots). **trycloudflare
is blocked** here — `cloudflared tunnel --url …` fails with `context deadline exceeded` (TCP 443 to
`api.trycloudflare.com` dropped; ping/DNS resolve, so it looks fine but won't connect); don't retry it.
`localhost.run` (`ssh -R 80:localhost:5173 nokey@localhost.run`, prints a phone QR, no signup) is reachable but
was flaky/slow in testing.

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

**Hooks order under HMR.** Editing a hook-bearing module live (the `src/state` stores, or `Workspace.tsx`)
can make React log "a change in the order of Hooks called by Workspace" — the HMR boundary compares a render
under the old hook shape against one under the new shape. It's a dev-HMR artifact, not a real bug (the
`build` compiles and a fresh load is silent): **stop + start the dev server** and reload to clear it. Only
treat it as real if it survives a clean restart.

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

**Sometimes the preview tab is `document.hidden` from the very start, and it doesn't unstick.** Seen
2026-07-06: a brand-new `preview_start` tab (fresh server, fresh tab) had `document.visibilityState ===
'hidden'` immediately — not "after many ops" like the note above, and several `preview_stop`/`start` cycles
didn't clear it within the session. Chrome fully throttles `requestAnimationFrame` on a hidden page, so
**anything gated behind rAF never fires** — `TilingCanvas`'s host-size measurement (§ above) never resolves,
the Stage never mounts, `<canvas>` never appears, and `preview_screenshot` reliably times out. It also
starves `ResizeObserver` callbacks (they eventually fire, but only once *something else* pumps the event
loop — e.g. the next unrelated `preview_eval` round-trip — landing many seconds "late" relative to the resize
that triggered them), which can make correct resize-driven code (`ImageViewer`'s fit-on-resize) look broken
under a synchronous read-right-after-write test even though it isn't. **Don't chase this as an app bug** and
don't keep retrying start/stop — when you hit it, verify the logic a different way: extract the decision into
a small pure function in `src/canvas/` (or wherever) and unit-test it directly (no Konva/rAF/DOM needed), the
way `reframeView`'s pane-opening regression test does. Reserve live preview checks for things a pure test
truly can't cover, and lean on build / lint / tests + the owner's own device for the rest.

**Testing a Konva component (jsdom has no canvas).** Don't render `<TilingCanvas>` in Vitest — jsdom
can't back a real canvas. Keep the meaningful logic in the pure `src/canvas/` modules (unit-tested
there); where a component test needs the canvas, **`vi.mock` it** — `Workspace.test.tsx` mocks
`./TilingCanvas` with a tiny DOM stand-in that exposes the `onSelect` callback, so the
selection→inspect / paint / copy-paste wiring is testable without a canvas. The interactive feel is
verified on a real device.

**Gallery thumbnails look "broken" on a fresh dev server — it's vite-imagetools, not the app.** On a
freshly-started dev server with a COLD imagetools cache (a worktree's own server, or right after a restart),
the Gallery renders all ~29 thumbnails at once and vite-imagetools transforms them on-demand, concurrently.
Past ~10 concurrent cold transforms it returns **`Content-Type: image/undefined`** (valid WebP bytes, wrong
MIME) for the overflow, so the browser won't render them → `naturalWidth: 0` → broken-image icon. It's a
race (the broken set shifts each reload — ~17–19 of 29) and doesn't heal on retry within a session
(Vite 8 + vite-imagetools 10). **Dev-only: the production `build` emits every gallery image as a real hashed
file with the correct type — verified via a `vite preview` of `dist/` (0 broken).** A long-running checkout
(the main repo) hides it because its cache is warm. To eyeball the gallery on a branch, use a **build
preview** (`npm.cmd run build`, then a `vite preview` launch config — e.g. `preview-<suffix>` on its own
port) rather than the dev server. Don't chase it as an app bug — `vite.config.ts` / `src/data/gallery.ts`
are unchanged, and dropping the `format=webp` glob directive does NOT fix it (it's concurrency, not format).

**Web Worker (the export worker) — two speed bumps.** (1) **Keep it pure.** `exportWorker.ts` must import
only pure modules; a stray React/Konva import balloons (and breaks) its bundle. Verify after a `build`: the
`dist/assets/exportWorker-*.js` chunk should stay small (~50 KB) — if it jumps toward the main bundle size, a
heavy import leaked in. The tsconfig has no `WebWorker` lib (only `DOM`), so the worker types its global as a
small local `WorkerScope` cast instead of `DedicatedWorkerGlobalScope` (`OffscreenCanvas` lives in the DOM
lib, so that resolves). (2) **TS6 typed-array strictness:** `new Blob([bytes])` rejects `Uint8Array<ArrayBufferLike>`
(could be a `SharedArrayBuffer`); annotate functions that produce PNG bytes as `Uint8Array<ArrayBuffer>`
(see `pngText.ts`) so the Blob accepts them. The headless export run uses `stepTraversersInto` (mutates one
overlay in place) — never loop the immutable `stepTraversers` over a big grid (O(ticks × visited) → minutes).

**Flush tiles (no-edge mode) — a 1px stroke is NOT enough.** Two adjacent anti-aliased polygon fills only
partially cover their shared boundary pixels, and sequential alpha-compositing leaks ~25% of the background
through at every shared edge — a faint outline around *every* tile, even between same-coloured ones (and a
same-colour stroke is itself AA'd, so it doesn't fully cover). The fix (`src/canvas/flush.ts`, used by both
`drawTiles` and `renderTiling` when edges are off): fill each tile **once** with its **flattened opaque**
colour (`flattenColor` composites the rule colour over the base so overlaps don't darken or leak) on a
**slightly inflated** polygon (`inflatePolygon`, ~1.2 output px) so neighbours overlap and the later fill
covers the seam. Edges-on keeps the base→colour→edge layering (the edge stroke hides the seam). Verify by
sampling exported pixels (white tiles on a black bg → 0 dark pixels across the tiling interior), not by eye
on a compressed screenshot.

**Canvas-bar dropdowns spill off-screen on MOBILE — the recurring trap.** Every popup that hangs off a chip
in the `.canvas-controls` toolbar (the ⋯ extras, the drag menu, the Export dialog — and any future one)
breaks the same way on phones: the desktop pattern is a `position: relative` wrapper around the chip with a
`position: absolute` popup, which anchors the popup to the *chip*. But `.canvas-controls` is a **centered,
flex-wrapping** row, so on a narrow screen the chip lands in an unpredictable spot and the popup spills past
the viewport edge. **Fix (do this for EVERY bar dropdown):** in the `@media (max-width: 64rem)` block, set the
wrapper to `position: static` so the absolute popup anchors to the relative `.canvas-controls` bar instead,
and give the popup `left: 0.6rem; right: 0.6rem; width: auto; top: calc(100% + 0.3rem)` so it spans the bar
on-screen. Precedents: `.canvas-more-wrap` / `.canvas-drag` in `Workspace.css`, `.export-menu` / `.export-pop`
in `ExportMenu.css`. `.canvas-controls` is `position: relative` precisely to be this anchor — don't remove it.
Verify with `preview_resize` to a phone width, open the popup, and check its `getBoundingClientRect().right`
is within `innerWidth`.

**In-page anchor links break under hash routing.** The app routes on `window.location.hash` (`#/canvas`,
`#/guide` — `src/router/useHashRoute.ts`). A plain in-page anchor like `<a href="#anatomy">` OVERWRITES that
hash, so the router reads `#anatomy` as an unknown route and bounces to the landing page — the link neither
scrolls nor stays put (hit on the Guide's table-of-contents + its body cross-refs, fixed 2026-07-03). Fix: a
delegated `onClick` that intercepts `href="#id"` links (but NOT the router's `#/route` ones), `preventDefault`,
and `scrollIntoView` (see `Guide.tsx` `onGuideClick`); give the scroll targets `scroll-margin-top` to clear
the sticky `.nav-bar`. Don't add bare `#id` anchors in a hash-routed page without this.
