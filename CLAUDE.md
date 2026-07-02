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
- **Hosting (planned, not yet wired):** Vercel — SPA auto-detected. (Export is client-side now (§4.2); a
  serverless renderer like `@vercel/og` stays an option only for future server-rendered share images.)
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
- **Next up:** **DSL-driven traversers** (custom rules in the Traversers pane — paint/move/visit/split/guards/
  state, §5; reuses the predicate DSL) → **persist user exports across reloads** (IndexedDB) → **deploy** to Vercel.

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
  - [ ] Investigate the **expanded** uniform-tiling list
    (https://en.wikipedia.org/wiki/Uniform_tiling#Expanded_lists_of_uniform_tilings) for cool tilings to add
    beyond the 11 convex uniform + kalleboda (k-uniform, non-edge-to-edge, star/zero-angle forms, etc.) —
    pick favourites with the owner before building
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
  - [ ] **Overhaul the Play / Pause / Stop / step transport** — the run controls don't make sense as they
    stand and are too cumbersome *(owner, 2026-06-29)*. Rethink the whole transport as one coherent thing:
    how Play / Pause / Stop, the **step** button, and the slow/fast speeds relate (e.g. step disabling Play
    feels awkward; Stop vs Pause vs Reset is muddy). Aim for an obvious, low-friction control.
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
- [x] **Reopen from PNG** *(verified 2026-06-28, `a1e6d0b`)* — `Workspace.loadRecipe(recipe)`
  REPLACES the canvas setup from a recipe: tiling, grid (export grid clamped to ≤ `GRID_MAX` for editing),
  walkers + hand-paint (via `remapSeeds`/`remapPaint` centre-offsets), and the three stores (new `setAll`).
  Entry points: **gallery click** (placeholder recipes in `src/data/galleryRecipes.ts`, handed off via
  `src/state/pendingRecipe.ts`, consumed by the Workspace mount effect) and **drag an exported PNG onto the
  canvas** (`decodeRecipeFromPng` → `parseRecipe` → `loadRecipe`, with a result toast). Verified in-browser
  (gallery open switches tiling + loads seeds/stores; PNG drop round-trips an export). Build / lint / 397
  src tests pass.
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
  - [ ] **User-saved gallery** — let the user save their own exports into the gallery (recipe rides in the
    PNG metadata); persist across reloads (IndexedDB) + a "watch it grow" replay.
- [x] **Debug features + a run log** — a per-tick traverser **decision log** (Debug pane, behind a
  canvas-bar toggle): per walker, the statements run + each candidate move and why it survived/was
  rejected, a "no move" banner; **hovering a row highlights the tiles it concerns on the grid** (current
  / the tile a guard reads / chosen / rejected), click to pin; a bounded tick-history scrubber; driven by
  an **opt-in pure `TickTrace`** (zero cost when off). Surfaced + fixed a real edge-numbering bug on first
  use *(owner, 2026-06-29; done & verified 2026-06-30, `58fd0b6`)*. A console / log-to-file aid stays a
  possible follow-up.
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
  scroll), **paint** (writes the chosen target — visited / A / B / C), **select** ("box select" — a
  marquee box → every tile whose centre is inside), or **paintselect** ("paint select" — freehand: drag
  over tiles to gather a non-box selection, pushed up live). Both selecting modes call `onSelectTiles`;
  holding **Shift** at the start of a box / paint-select drag **adds** to the current selection (union)
  instead of replacing it. Any **non-selecting** gesture (pan / zoom /
  paint / a tap on empty space) fires `onDeselect` so the selection clears — only a tap-on-tile or a box
  keeps it. A paint stroke flashes an **outline** on its tiles (`paintFlashRef` → `drawPaintFlash`) that
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
  (speed `slow` = 90ms interval / `fast` = one tick per frame; `step` is manual — `stepOnce` advances one
  tick per click, no timer, and the continuous ▶ is disabled in step mode), and the **Play / Pause / Stop**
  controls. **Stop** discards `runLive` and clears the
  run trail → the seeds reappear; **Reset** removes the seeds too. The Inspect Traverser section places/aims/
  removes seeds **only while stopped** (a run owns the walkers). Grid resize is locked while a run is active
  (`runLive !== null`). On **mobile**, Fit / Reset / grid-size collapse behind a **⋯ dropdown**
  (`.canvas-more` trigger + `.canvas-extra` popover, outside-tap/Escape to close); inline on desktop.
- `src/components/Panel.tsx` — reusable collapsible dock panel (collapses to a thin rail).
- `src/components/HelpButton.tsx` (+ `.css`) — the reusable faded **"?" explainer**: a small muted
  button that opens a little info dialog (reuses the TilingPicker modal pattern — portal, Escape,
  backdrop, focus). Use it for non-obvious concepts (ethos §2); the Predicate + Coloring panes float
  one in their **top-right corner** (`.pane-help`, absolute), not inline with the lead text.
- `src/components/{ExportMenu,ExportStrip,ImageViewer}.tsx` (+ `.css`) — the export UI (drives `src/export/`).
  `ExportMenu` is the top-bar chip + popup (grid size / resolution / background / edges, a px-per-tile
  readout) — a pure form that builds the recipe, calls `onStartExport`, and **closes immediately** (export is
  fire-and-forget; it has a "?" explainer for the grid-vs-resolution concept). `ExportStrip` is the
  bottom-right thumbnail strip: a job shows first as a **running** placeholder (dashed + pulsing, a spinner
  where the download button will be, **not clickable**, X = cancel), then flips to **done** (the real
  thumbnail — clickable to view, download + remove); a grid chip returns from the viewer. `ImageViewer` is the
  zoom/pan `<img>` (no Konva) that swaps in over the canvas. **Workspace owns the jobs:** `startExport` adds a
  running `ExportItem` immediately, runs `generateExport(params, signal)` (a per-job `AbortController` kept in
  a ref), then flips it to done + auto-downloads; `removeExport` aborts a running job (terminates its worker)
  or removes a finished one; it also owns the object-URL lifecycle (revoke on remove / cap-evict the oldest
  *finished* / unmount + abort-all) and the `viewingId` swap.
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
  `headingOptions`/`rotateHeading` for the edge-snapped Inspect aim). The tick's decisions live in a shared
  `computeTick`; `stepTraversers` applies them to a **fresh** overlay (the live React run), while
  `stepTraversersInto` applies them **in place** into a mutable overlay — used by the headless export run so a
  long run on a big grid is O(work), not O(ticks × visited). May import `src/tiling` + the overlay helpers; the
  basic behaviour is hardcoded, with the **DSL-driven** traversers (§5) to slot in behind the same
  `stepTraversers` shape — so keep it pure.
- `src/export/` — the **pure, isomorphic image-export core** (no React/Konva), public API via
  `src/export/index.ts`. `runToCompletion.ts` (loops `stepTraversersInto` to completion, `maxTicks` cap),
  `remap.ts` (seed/paint placement by bounds-centre offset, grid-size-independent), `renderTiling.ts`
  (`renderToCanvas` — a Canvas2D subset of `drawTiles`; **flush** no-edge rendering via `src/canvas/flush.ts`;
  takes a structural `RenderCtx`, so `OffscreenCanvas`/`<canvas>`/a fake all work), `sizing.ts`
  (`pickCanvasSize` → aspect-matched WxH + device caps), `recipe.ts` (the serialisable `Recipe` +
  `buildRecipe`/`parseRecipe`; **versioned** — see below),
  `prepare.ts` (rebuilds
  defs/predicateText/index + remaps a recipe — **mirrors the Workspace assembly**, keep in sync), `generate.ts`
  (`computeExport` — the pure build→run→colorize→size). **Impure (DOM, main-thread only, NOT in the pure
  graph):** `pngText.ts` is pure but `exportWorker.ts` (the Web Worker — imports only pure modules + uses
  OffscreenCanvas; Vite bundles it to its own chunk), `exportImage.ts` (worker driver + main-thread fallback +
  metadata splice + auto-download; takes an `AbortSignal` — abort `terminate()`s the worker mid-run and rejects
  with an `AbortError` the UI swallows as a cancel), `download.ts`. **Keep Konva out** and keep the pure files DOM-free so the
  worker + Vitest stay happy.
  - **Recipe versioning (so images survive app updates).** The recipe carries `schemaVersion` (the
    compatibility key) + `appVersion` (a human stamp, never branched on). **When you change the recipe shape
    OR an engine/DSL behaviour that affects how an old recipe reproduces, bump `RECIPE_SCHEMA_VERSION` and add
    a `MIGRATIONS` entry** (`{from, migrate}`) in `recipe.ts`. `parseRecipe` returns a `ParseResult`:
    it migrates an OLDER recipe up to the current shape (chain in `migrateRecipe`), and REFUSES a NEWER one
    with `reason: 'too-new'` (the reopen UI should say "update the app") — never strict-equality-reject an old
    image. Current exports are `schemaVersion: 2` (the v1→v2 output-size migration lives in `MIGRATIONS`).
    **Pre-release exception (2026-06-29):** the breaking DSL change (directives → predicate-first + `@ target`)
    deliberately did NOT bump the schema — while unreleased we hand-fix the few saved PNGs instead of shipping
    migration code (owner's call); resume the bump-and-migrate rule once images are shared with others.
- `src/state/` — localStorage-backed stores: `predicateStore.ts` (custom predicates as DSL text +
  name), `coloringStore.ts` (the ordered rules, key `…:coloring:v2`), `traverserStore.ts`, `persist.ts`
  (SSR/quota-safe load/save + `newId`). Pure list updaters are unit-tested; the hooks wire them to
  persistence. Each store has a **`setAll`** (replace the whole list — used by reopen). `pendingRecipe.ts`
  is the one-shot gallery→canvas handoff: the gallery stashes a `Recipe`, the Workspace consumes it on mount.
- `src/data/galleryRecipes.ts` — placeholder `Recipe`s attached to the gallery images so clicking one opens a
  ready setup (fake for now; real saved creations will carry their recipe in the PNG). `Workspace.loadRecipe`
  applies a recipe (tiling/grid/seeds/paint + the three stores' `setAll`); the canvas-stage also accepts a
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
- **Inspect tile mini (`src/components/TileMini.tsx` + `.css`)** — a small SVG diagram at the top of the
  1-tile Inspect view: the selected tile's REAL vertices in its on-canvas orientation (world y-up flipped
  to SVG y-down), every edge labelled with its `clockwiseEdgeOrder` number (edge 0 accented), a heading
  arrow when a traverser sits there, and optional dotted `straightPairs` lines. Below it, a **"Straightness"**
  blurb: wedges name the dotted lines as their hand-crafted opposite-edge pairing (`shape.oppositeSides`
  where `straightThroughOpposite`); triangles just say right-handed (no edge is directly opposite on an
  odd-sided shape). Pure/no-Konva component, Vitest-tested with jsdom (plain SVG, unlike `TilingCanvas`).
- **Debug mode** lives in `src/components/DebugPane.tsx` (+ `.css`) with the pure trace→tiles mapper in
  `src/debug/highlights.ts` (Konva-free, unit-tested). It reads the engine's **opt-in** `TickTrace`
  (`src/traverse/trace.ts`, built only by `stepTraversersTraced`). A canvas-bar **toggle** in `Workspace`
  gates it: off → no trace is built and `TilingCanvas`'s `highlightGroups` is undefined (nothing drawn);
  the role-coloured outline overlay is `drawHighlights` in `TilingCanvas`.

**Running commands (tool shells):** `node`/`npm.cmd`/`npx.cmd` are NOT on PATH here — prepend it
every command: `$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx.cmd vitest run`
(`npm.cmd run build` / `npm.cmd run lint`). See §3.

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
