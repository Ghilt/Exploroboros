# Daily word game — a side experiment

> ⚠️ **This is a little side experiment, not part of the main Exploroboros product direction (yet).**
> It's a **hidden feature**: reachable only by typing `#/daily` — there is **no nav link**, and it's
> deliberately kept off the §6 roadmap / §8 backlog in `CLAUDE.md`. It reuses the tiling engine + the
> Konva canvas + one `Panel`, and otherwise stands alone. Treat it as a playground; nothing here is a
> commitment. This doc captures the planning session that produced it so the context isn't lost.

## Concept

A daily **Boggle-like word game played ON a tiling** — the tiling is the star, not fractals. Each day a
tiling is filled with letters (one per tile). You **drag across edge-touching tiles to spell a word**; a
preview chip shows the letters as the path grows; release to submit. Valid words score (Scrabble letter
values) and join a found-words list; misses pulse red. It must feel good on touch + mouse and work on
**any** tiling (differently-sized/shaped tiles).

## How to reach it

Run the app and open **`/#/daily`**. No menu entry (hidden on purpose). The whole page is just the
canvas + one right-hand "Daily" pane — no action/transport bar.

## Locked design decisions (with rationale)

Settled during the 2026-07-18 planning quiz. Each is a fork we deliberately picked:

| Decision | Choice | Why |
|---|---|---|
| **Adjacency** | **Edge-only** | Tiles connect only across a shared edge. Free from the engine (`uniqueNeighbors`), unambiguous for the drag. (Vertex/corner adjacency was the Boggle-diagonal alternative — rejected as new geometry + fuzzy hit-testing.) |
| **Tilings / board region** | **All tilings, clipped to a rectangle at a target tile count (~100)**, rotating daily | Maximum variety (incl. aperiodic). The precise rectangle clip is deferred — for now each generator's natural patch IS the board. |
| **Letters** | **Random English/Scrabble frequency bag** | Simple, deterministic, reads like English. Solvability is NOT guaranteed (Boggle-style). A vowel floor / solver gate is deferred. |
| **Dictionary** | **Client-side, bundled, with live prefix feedback** | Instant validation + a live "keep going vs dead end" hint; works offline. |
| **Word list** | **ENABLE** (public-domain, ~172k words) | The official Scrabble lists (NWL/TWL) are copyrighted; ENABLE is open and near-equivalent in coverage. |
| **Where it runs** | **Backend-served daily seed** (planned) — thin `{date, tilingId, rect, letterSeed}` the client rebuilds from | Server = authority (no peeking at future days), sets up leaderboards later; dictionary stays client-side. **Not built yet** — the board is currently generated **client-side from the date**, which already gives everyone the same daily board. |
| **Daily rollover** | **UTC midnight** | One shared board per calendar day. |
| **Generation guardrails** | **Vowel floor + min word length 3** | Cheap quality (no full solver). The vowel floor is a server concern (deferred with the backend); min-length-3 is live. NWL-style 2-letter words are therefore off for now. |
| **Tile reuse** | **Each tile once per word** (self-avoiding; drag back to undo) | Classic Boggle feel; matches the backtrack gesture. |
| **Scoring** | **Scrabble letter-sum** (placeholder) | Real scoring **rules** + a **win condition** are deliberately deferred. |

## Architecture

**Client/server split (intended):** the server publishes a tiny daily **seed**; the client rebuilds the
identical board with the tiling engine it already ships, renders it, runs the trace gesture, and
validates words locally against the bundled dictionary. No board geometry over the wire; no per-word
round-trips. (The server half is **not built yet** — see Deferred.)

**File map (all under `src/`):**

- `wordgame/board.ts` — pure, isomorphic board: a seeded PRNG (`mulberry32`), `seedFromDateKey`,
  `utcDateKey`, the Scrabble letter values + `wordScore`, a curated 6-tiling rotation, and
  `dailyBoard(dateKey) → { tilingId, label, tiling, letters }`. **Pure function of its key** — feeding a
  random key is exactly what the debug "Randomize" uses.
- `wordgame/dictionary.ts` — a **sorted-array + binary search** dictionary (`buildDictionary`, `isWord`,
  `isPrefix`). Sorted-array not a trie, to stay light in memory at 172k words.
- `wordgame/wordlist.ts` — a small curated **placeholder** list (used instantly on mount).
- `wordgame/enable1.txt` — the full **ENABLE** list (public domain, ~172k words), pulled from the
  dolph/dictionary mirror.
- `wordgame/enableList.ts` — `loadEnableWords()`: `await import('./enable1.txt?raw')`. The dynamic import
  makes it its **own lazy chunk** (~1.7 MB / 464 KB gzip), fetched only on `#/daily`; it swaps in over the
  placeholder on mount.
- `wordgame/submit.ts` — pure `judgeWord(dict, foundWords, word)` → accept / short / unknown / duplicate
  (+ the word's value). `MIN_WORD_LENGTH = 3` is the single min-length knob.
- `canvas/traceStroke.ts` — pure `extendTrace(tiling, path, tile)`: the self-avoiding trace reducer. On a
  new tile it **BFS-routes the path to the cursor** (bridging tiles a fast drag skipped, routing around
  used tiles); landing on any earlier tile **retreats** to it. So the path always keeps up with the
  cursor.
- `canvas/letters.ts` — pure `inscribedRadius(node)`: frames a letter to a tile's inscribed circle so a
  small triangle and a big dodecagon both read.
- `pages/DailyGame.tsx` (+ `.css`) — the page: builds the board, owns the trace path / found words /
  flash, lazy-loads ENABLE, live chip feedback (green valid / dim dead-end), the debug "Randomize"
  button. Chip + score + found list in the pane.
- `components/TilingCanvas.tsx` — gained **additive** word-game props: `letters` (a `drawLetters` pass),
  a `'trace'` `DragMode` + `onTraceMove`/`onTraceEnd` (reports the tile under the pointer live; the page
  owns the rules), `tracePath` + `traceStatus` (a `drawTracePath` highlight), and `burst` (a self-clearing
  `drawBurst` rAF: released tiles scale up slightly + fade, green accepted / red rejected).
- `router/useHashRoute.ts` + `App.tsx` — a hidden `'daily'` route (no nav link; `canvasLike` full-height
  layout).
- `raw-modules.d.ts` — a narrow `declare module '*?raw'` (the project had no `vite-env.d.ts`).

## What's built

1. The hidden `#/daily` view (canvas + one pane, no action bar) with a deterministic daily board and
   letters framed on any tiling.
2. Drag-to-trace with a live preview chip; **robust** fast-drag (BFS gap-bridging) + backtracking.
3. The full loop: ENABLE dictionary validation, Scrabble-sum score, found-words list, live
   valid/dead-end chip hints, and a gentle green/red **release burst**.
4. A debug **Randomize** button (re-rolls tiling + letters; the page is hidden so a debug control is fine).

## Verified / not verified

- ✅ **Headless (this session):** build (tsc + vite), lint (clean), the full Vitest suite (**1107**),
  plus a live-runtime check that the ENABLE lazy chunk loads all 172,823 words and validates (real words
  accept, junk + dead-end prefixes reject). The trace reducer has unit tests for gap-bridging, long
  jumps, routing around used tiles, and backtracking.
- ✅ **Owner device:** the on-canvas feel — letter framing, drag/trace, the release burst, and the
  fast-drag robustness — confirmed by the owner (the Konva canvas can't mount on the headless preview
  tab, per `CLAUDE.md` §9, so the visual/interactive pass is always the owner's).
- ⚠️ Not committed as a product feature; this is the experiment doc + hidden code only.

## Deferred / possible next threads

- **Goal + a board solver** — a solver (DFS + dictionary prefix pruning) to find every word, enabling a
  target/par, a "solved" state, and "you found X of ~Y words" completion. Also unlocks guaranteed-solvable
  boards + difficulty rating. *(The recommended next thread — gives the daily a point.)*
- **Persist progress** — remember today's found words + score across reloads (localStorage, keyed by date).
- **Backend daily seed** — the server half (Cloudflare Function) + vowel floor at publish; groundwork for
  leaderboards/sharing.
- **Precise rectangle clip** to a target tile count (vs each generator's natural patch); **mobile layout**
  polish; and un-hiding it (a nav entry) if it graduates from "experiment".
