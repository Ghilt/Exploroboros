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
  context did not stick here.
- **Framework:** React 19.2 + TypeScript 6 (strict). Largest ecosystem; first-class bindings for **both**
  candidate canvas renderers (see §4.1).
- **Build / dev:** Vite 8. Lint: **oxlint** (from the template). Tests: **Vitest 4** +
  `@testing-library/react` + `jsdom`. Scripts: `npm run dev | build | lint | preview`; `npx vitest run`.
- **Styling (current):** plain CSS — mobile-first, `clamp()` fluid type, CSS custom properties, light/dark via
  `prefers-color-scheme`. Low-stakes; revisit at scale (§4.4).
- **Hosting (planned, not yet wired):** Vercel — SPA auto-detected; native `@vercel/og` (Satori + resvg) for
  future serverless PNG export.
- **Repo:** local git repo at `E:\Code\exploroboros` (the owner's machine).

## 4. Deferred decisions / Open Questions (the embedded quiz)

Resolve each at the noted trigger — **ask the owner the question; don't assume.**

1. **Tile renderer** *(trigger: building the interactive plane).* PixiJS (WebGL; scales to 10k–50k+ tiles;
   pinch/pan via `pixi-viewport`; heavier, steeper curve) vs **Konva** (Canvas2D; touch-first; first-class
   `react-konva`; simplest to ~3k tiles). *Recommendation:* start with Konva for the MVP, wrap it behind a
   small renderer interface, migrate to PixiJS if tile counts grow. Hit-testing big tilings: `rbush` spatial
   index + point-in-polygon, or GPU color-picking at extreme counts.
2. **Serverless image export** *(trigger: building export).* `@vercel/og` (Satori + resvg; runs on Vercel
   edge; simplest) vs `@napi-rs/canvas` (full Canvas API; Node function). *Recommendation:* `@vercel/og`
   unless we need pixel-level canvas drawing. Cache by hashing the (tiling + rules) params.
3. **"Any-tiling" data schema** *(trigger: building the tiling model).* A tiling = a list of **tiles** (each:
   polygon vertex list + stable id) plus a **reciprocal edge-adjacency graph** (leave via edge `k` → arrive
   via the matching edge — see §5). Open: exact JSON shape; how edges are numbered for arbitrary polygons; how
   rules reference edges generically. *Ask the owner* how tilings will be authored/imported.
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

- **Phase 0 (this):** repo + this doc + responsive hello-world.
- **Next:** migrate any still-needed prototype detail into §5 **before** the origin repo is deleted.
- Then: generic tiling **render + data model** (§4.3) → port **static coloring DSL** → port **traverse
  engine** → **rule-authoring UI** (click/touch) → **serverless PNG export** (§4.2) → **deploy** to Vercel.

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

## 8. Todo list (working backlog)

The living, granular checklist of what's left to build — the operational companion to the §6 roadmap
(narrative) and the §7 log (what's verified). Add items as they surface; when the owner verifies a finished
item, check it off here, add the §7 row, then commit. While working I mirror the open items into the
in-session task tracker.

- [x] **Phase 0** — repo, living doc, responsive hello-world *(verified 2026-06-26, `f8a979d`)*
- [ ] **Generic tiling render + data model** *(§4.3)*
- [ ] **Port the static coloring DSL** *(§5)*
- [ ] **Port the traverse engine** *(§5)*
- [ ] **Rule-authoring UI** — click/touch
- [ ] **Serverless PNG export** *(§4.2)*
- [ ] **Deploy to Vercel**
