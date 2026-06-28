# Exploroboros — Visual Language & Component Guidelines

> The single reference for **how the interface looks and behaves**. Read this before adding UI. The
> goal is that Exploroboros reads as **one carefully designed system**, not a pile of individually
> styled widgets. When in doubt, reuse a primitive here rather than inventing a new control.

The tokens named below (`--accent`, `--radius-sm`, `--control-h`, …) are real CSS variables defined
in [`src/index.css`](../src/index.css). The components (`SegmentedControl`, `Stepper`, `Toggle`, …)
live in [`src/components/`](../src/components/). Keep this doc honest against the code.

---

## 1. Core visual philosophy

Exploroboros is a playground for **recursive polygonal fractals on tiled planes**. The chrome around
that should feel:

- **clean · technical · spacious · geometric · understated · precise · quietly playful**

It is a tool, like a CAD app or a creative-coding notebook — calm and legible so the *artwork* is the
loud thing on screen, not the buttons.

**Where the "fractal" feeling comes from** — recursive polygons, tilings, graph structures,
subdivision, nested geometry, repetition, symmetry, and **negative space**. Never from glossy
gradients, flame/Mandelbrot imagery, or texture pasted onto UI.

**Avoid:** glossy UI, neumorphism, heavy drop-shadows, glassmorphism, skeuomorphic knobs/switches
that imitate physical objects, and generic "AI app" aesthetics.

### The one rule above the others — show state, don't hide it

If a setting has a few possible values, **show them all** with the current one marked, instead of
hiding them behind a menu you have to open to even see the options.

> ✅ `slow │ fast │ max`  (a segmented control — you see every choice and which is active)
> ❌ `speed ▾`  (a dropdown / cycling chip — the options and current value are hidden)

This is why the canvas toolbar uses **segmented controls** for speed and display, not the old
"click-to-cycle" chips.

---

## 2. Design tokens

The reusable vocabulary. Use tokens; don't hard-code values. All live in
[`src/index.css`](../src/index.css) and are redefined for dark mode in the same file.

### Color

| Token | Light | Role |
|-------|-------|------|
| `--bg` | warm cream `#fbf6f0` | page background |
| `--surface` | white | panels, cards, popups |
| `--surface-2` | `#f5ece1` | inset/secondary surfaces, selected fills |
| `--fg` | near-black `#1d1622` | primary text |
| `--muted` | `#6f6571` | secondary text, inactive labels |
| `--line` | `#e8ddce` | borders, dividers |
| `--accent` | orange `#e2682a` | **emphasis / active / selection** |
| `--accent-strong` | `#c9551c` | warnings / errors / hover-pressed |
| `--accent-2` | magenta `#c0398e` | secondary accent (brand gradients, ramps) |
| `--accent-3` | purple `#6d2b8f` | tertiary accent (brand gradients, ramps) |
| `--on-accent` | `#fff7f0` | text on an accent fill |

Plus semantic aliases: `--state-selected` (= accent) and `--state-warn` (= accent-strong).

### Spacing scale

`--space-1: .25rem` · `--space-2: .4rem` · `--space-3: .6rem` · `--space-4: .9rem` ·
`--space-5: 1.4rem` · `--space-6: 2rem`. Reach for a step on the scale before an arbitrary value.

### Radii

| Token | Value | Use for |
|-------|-------|---------|
| `--radius` | 5px | panes, cards, dialogs |
| `--radius-sm` | 8px | **all buttons & control bodies** |
| `--radius-pill` | 999px | **chips / tags / status pills only** |

### Other

- **Border widths:** `--bw-1: 1px` (default), `--bw-2: 2px` (emphasis/drop-targets).
- **Control height:** `--control-h: 1.9rem` — the shared height for inline/bar controls (see §6).
- **Elevation:** `--elev-1` (hover/drag), `--elev-2` (dropdowns/menus), `--elev-3` (modals). Three
  depths, no more.
- **Type:** `--sans` (system UI font) for prose/labels; `--mono` for numbers, state labels, code.

---

## 3. Color system — emphasis, states, restraint

**Restraint over saturation.** Accent is a *highlight*, not a fill-everything. Most of the screen is
cream/white/line/muted; orange marks the one thing that matters in a given spot.

| State | Treatment |
|-------|-----------|
| Default | `--fg` text on `--surface`, `--line` border |
| Hover (interactive) | text + border → `--accent` |
| Active / selected | `--accent` text (often `font-weight: 600`) + a soft `--surface-2` fill |
| Disabled | `opacity: .4–.45`, `cursor: not-allowed` — never a different colour |
| Warning / error | `--accent-strong` (`--state-warn`) |
| Focus (keyboard) | `2px solid --accent` outline, `3px` offset (global in `index.css`) |

Don't introduce new status colours (no green "success", no red "danger") — the warm palette carries
meaning through accent vs strong-accent. Add one only with the owner's sign-off and a token.

---

## 4. Typography

- **`--sans`** for everything readable: prose, page titles, control labels.
- **`--mono`** for anything that is *data or state*: numbers, coordinates, DSL text, the value in a
  stepper, the labels in a segmented control. Mono signals "this is a value the machine cares about".
- **Fluid sizing** with `clamp()` for page-level headings (see `.page-title`); fixed rem for dense
  control text.
- **Hierarchy:** page title (clamp ~2–3.25rem, weight 800) → section/pane title (mono, ~0.78rem,
  uppercase, letter-spaced, muted) → body (~0.85–0.9rem) → control/state label (mono, ~0.72rem).

### The recursion motif in type — subtle, never decorative

Express recursion through **negative space inside letterforms** — recursive counters in `o b p e a`,
small polygonal cut-outs — and only on the **wordmark / display headings**. It must stay readable.
Never apply a fractal *texture* across running text.

*Status:* aspirational guidance for a future custom wordmark; body text stays the system font today.

---

## 5. Shape language & the roundedness rule

A strict radius ladder keeps shapes meaningful. **This matters — getting it wrong (e.g. a button
rounded into a pill) makes the UI feel off.**

| Radius | What it's for |
|--------|---------------|
| `--radius` (5px) | panes, cards, dialogs |
| `--radius-sm` (8px) | **every button and control body** — the default for anything clickable that holds a label |
| `--radius-pill` (999px) | **chips, tags, status pills ONLY** — small read-only or mode labels |
| `50%` | circles: graph nodes, badges, the round "?" help button, spinners |

> ❌ **Bad:** the old "+ add rule" / "+ New" buttons used `999px` and became full pills. A button is
> not a pill. → Fixed to `--radius-sm`.
> ✅ **Good:** a labelled action uses `--radius-sm`; a small status/mode chip uses `--radius-pill`.

**Other shapes** — polygons, hexagons, octagons belong to **iconography and brand**, never to chrome.
Thin connecting lines (`--line`, `--bw-1`) express structure (graphs, dividers, tile edges).

---

## 6. Component library

A small family of primitives. Prefer composing these over new one-off controls.

### Uniform control height

All inline/bar controls — buttons, chips, segmented controls, dropdowns — share `--control-h` so a
row of mixed controls aligns on **one baseline**. Don't ship a control that's a different height than
its neighbours in the same row.

> ✅ tiling-picker · drag chip · display segmented · export chip all 1.9rem tall, aligned.
> ❌ a 1.4rem chip sitting next to a 1.9rem button — the row looks broken.

### Primary button

The one loud action (`Open Canvas`, `Export`). Accent fill, `--on-accent` text, `--radius-sm`,
weight 600. One per context, max. Class pattern: `.btn .btn-primary` (`index.css`).

### Secondary / ghost button

Lower-emphasis actions (`Fit`, `Reset`, `Cancel`). Transparent, `--line` border, `--fg` text; hover
→ accent border + text. `.btn-ghost`, `.canvas-btn`.

### Segmented control — `SegmentedControl`

For **2–4 mutually-exclusive values** where showing them all aids understanding. One bordered track,
equal-width segments, a **sliding** indicator under the selected one, accent selected text. Keyboard
arrows move the selection.

- Use it instead of a dropdown or a cycling chip when options are few. Examples: run speed
  (`slow│fast│max`), tile display (`edges│none│stats`), predicate editor (`Text│Visual`).
- `embedded` drops its outer border so it nests inside another bordered shell (e.g. the transport).

### Dropdown

For **larger collections** where exposing every option is impractical (export resolution/background,
drag-mode menu, tiling picker). Style it like an **inspector/property panel** (mono, `--surface`
popup, `--elev-2`), not a generic web `<select>` page form.

### Stepper — `Stepper`

A compact `[− value +]` for a small integer. **Sized for a single digit** so it keeps a tidy fixed
width and never reflows. One connected unit with hairline dividers. Used across the Inspect dock
(visited, registries A/B/C). Disables `−`/`+` at `min`/`max`.

### Toggle — `Toggle`

A binary on/off switch (track + sliding knob) for true two-state settings (e.g. "Show tile edges").
Three+ values → use a SegmentedControl instead; many → a dropdown.

### Inspector rows

Properties align as `label … control`, like a pro editor — not floating controls. The Inspect dock
uses a `label / value` grid; the export menu uses `.export-row` (label left, control right). Keep new
property UIs in this aligned form.

### Chip / tag

A small `--radius-pill` label naming a state or a menu trigger (drag chip, tiling/export triggers).
Read-only or opens a menu. **Not** for primary actions.

### Tabs / collapsible docks

Panes collapse to a thin rail (`Panel`); disclosure triangles rotate to show open/closed. Clear
active state via accent; minimal ornament.

---

## 7. Layout system

- **Grid feel:** consistent gutters and padding drawn from the spacing scale. Panes sit flush on
  desktop (shared rounded corners), stack on mobile.
- **Radii tiers & border weights:** as in §2/§5. Default border `--bw-1 solid --line`.
- **Breakpoint:** a single `64rem` threshold separates mobile (stacked, scrolling) from desktop
  (full-height, non-scrolling canvas page).
- **Bar dropdowns on mobile:** any popup hanging off a chip in the centered, wrapping
  `.canvas-controls` bar must **re-anchor to the bar** (`position: static` + span `left/right`) or it
  spills off-screen. (Full recipe in `CLAUDE.md` §9.)

---

## 8. Iconography

Derive icons from the domain: **graph nodes, edges, recursion, subdivision, polygons, traversal,
grids**. Inline SVG, `stroke: currentColor`, ~2px strokes, rounded joins (see
[`TrashButton.tsx`](../src/components/TrashButton.tsx), the heading-arrow in `Workspace.tsx`). Avoid
generic office-clipart icons.

---

## 9. Motion

Motion should suggest **recursive computation**, quietly:

- segmented-control indicator **slides** to the selection (`transform`, ~0.16s ease);
- toggle knob slides; disclosure triangles rotate; nodes/panels expand.
- ~0.12–0.16s, `ease`. **No** bounce, overshoot, or springy motion.
- Everything respects `prefers-reduced-motion` (global block in `index.css`) — transitions collapse
  to instant.

---

## 10. Consistency rules + good/bad

- **Reuse a primitive** before styling a new widget. If you need a control that doesn't exist,
  propose adding it here.
- **Few values → SegmentedControl; many → Dropdown; binary → Toggle; small integer → Stepper.**
- **Buttons use `--radius-sm`, never a pill.** Pills are chips/tags only.
- **One control height per row** (`--control-h`).
- **Accent is a highlight, not a background.** Reach for `--muted`/`--line`/`--surface-2` first.
- **Mono = data/state, sans = prose.**
- **Tokens, not literals.** New colour/spacing/radius → add a token, don't hard-code.

### Worked example — the canvas transport (before → after)

> ❌ **Before:** `▶ ❚❚ ■`  …gap…  `speed: fast` — three buttons and a separate cycling chip that hid
> the speed options; visually disconnected, mismatched heights.
> ✅ **After:** one connected `transport` shell — `▶ ❚❚ ■ │ slow fast max` — the speed segmented
> control sits inside the same bordered unit behind a divider, every speed visible, the selection
> sliding. It reads as **one** control.

---

## Future / out of scope (noted, not built)

- A custom recursive-letterform wordmark/font (only guidance + a sketch for now).
- A live in-app style-guide page rendering these components (this Markdown is the source of truth
  today).
