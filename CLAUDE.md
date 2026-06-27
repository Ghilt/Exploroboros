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
- **In progress — generic tiling render + data model (§4.3):** data model, generic `stitch()`, square
  generator, and the tiling picker are in and verified. The Canvas page now has an **interactive Konva plane**
  (zoom/pan, tap-select, drag-paint, copy/paste, a grid-size lag probe). *Awaiting owner real-device
  verification (§7).* Next: more tilings (the 11 uniform Euclidean tilings + octagon+wedge).
- Then: port **static coloring DSL** → port **traverse engine** → **rule-authoring UI** (click/touch) →
  **serverless PNG export** (§4.2) → **deploy** to Vercel.

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
  - [ ] Paint other attributes — a drag currently paints the **visited count** (shown by a passive
    "paint: visited" chip); let the user choose what a drag paints (e.g. colours, traverser seeds) once
    those land. Turn the chip into a picker then.
  - [x] Octagon+wedge tiling (`kalleboda`) — second selectable tiling; wedge-snap + vertex-weld so the
    generic `stitch()` pairs shared edges (incl. the two-edged-adjacency quirk) *(verified 2026-06-27, `6fd812e`)*
  - [x] Regular uniform tilings — triangular (3.3.3.3.3.3) + hexagonal (6.6.6); gallery thumbnails now
    auto-render each ready tiling's real generator *(verified 2026-06-27, `f4a6b92`)*
  - [ ] More tilings — the 8 remaining (semiregular) uniform Euclidean tilings: trihexagonal, snub square,
    snub hexagonal, elongated triangular, truncated square, truncated hexagonal, rhombitrihexagonal,
    truncated trihexagonal (added in small batches, verified between)
  - [ ] Tile numbering as a canvas control — user-selectable scheme/origin (debug view currently numbers by generation order)
  - [ ] Visualise edge numbering + opposite edges for the user — show each tile's clockwise-from-top edge numbers and which edges are opposite (engine support exists: `clockwiseEdgeOrder`, `opposite`)
- [ ] **Port the static coloring DSL** *(§5)*
- [ ] **Port the traverse engine** *(§5)*
- [ ] **Rule-authoring UI** — click/touch
- [ ] **Serverless PNG export** *(§4.2)*
- [ ] **Deploy to Vercel**

## 9. Dev loop & operational notes (gotchas)

Hard-won; read before fighting the tooling again.

**Where things live (current):**
- `src/tiling/` — the pure, isomorphic engine (no React/DOM/canvas, no pixels). `types.ts`,
  `geometry.ts`, `shapes.ts`, `stitch.ts` (the shared edge-detection step), `graph.ts` (queries),
  `generators/` (one per tiling). Public API via `src/tiling/index.ts` — import from there.
- `src/components/TilingCanvas.tsx` — the **live** interactive Konva renderer; the ONLY file that
  imports `konva`/`react-konva`. **Interaction (no modes):** tap = inspect a tile, drag = paint the
  visited overlay, two-finger (touch) / middle-mouse drag = pan, pinch / wheel = zoom. A **display
  chip** (Workspace) cycles tile rendering — `edges` / `none` / `stats`; in `stats` the tile number +
  visited `vN` print inside each tile, but only once tiles are a few screen px (`MIN_LABEL_PX`), so on
  dense grids you zoom in to read them (you can't fit thousands of readable labels at fit). `src/canvas/`
  holds its pure, tested helpers — `view.ts` (world↔screen transform), `pick.ts` (hit-testing),
  `stroke.ts` (paint gap-fill), `clipboard.ts`, `buildTiling.ts` — imported via `src/canvas/index.ts`.
- `src/components/TilingDebugView.tsx` — the original SVG renderer, now a dependency-free **tested
  reference** (not mounted in the app). Safe to delete once the Konva canvas is owner-verified.
- `src/components/Workspace.tsx` — the Canvas-page multi-pane workspace (canvas + Inspect /
  Traversers / Coloring docks); **builds the `Tiling`** from the picker `tilingId` + grid-size, and
  owns selection, the per-tile **visited** overlay, and the copy/paste clipboard (all kept off the
  immutable `Tiling`, keyed by tile id).
- `src/components/Panel.tsx` — reusable collapsible dock panel (collapses to a thin rail).
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

**Testing a Konva component (jsdom has no canvas).** Don't render `<TilingCanvas>` in Vitest — jsdom
can't back a real canvas. Keep the meaningful logic in the pure `src/canvas/` modules (unit-tested
there); where a component test needs the canvas, **`vi.mock` it** — `Workspace.test.tsx` mocks
`./TilingCanvas` with a tiny DOM stand-in that exposes the `onSelect` callback, so the
selection→inspect / paint / copy-paste wiring is testable without a canvas. The interactive feel is
verified on a real device.
