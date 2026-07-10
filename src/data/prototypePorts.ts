// A PALETTE of ready-made traverser definitions — hand-authored DSL programs, each a different way to
// grow a pattern. They are loaded on demand by the "Load prototype ports" button at the foot of the
// Traversers pane, which now adds ONE traverser picked at RANDOM (weighted toward the ones most likely
// to look good from a simple single placement — see `beauty` + `pickRandomPort` below). Click it a few
// times to shuffle through the palette; each load lands in your Traversers library ready to place.
//
// HOW TO USE ONE (they only describe MOVEMENT + tile data — colour is authored separately in the
// Coloring pane, which reads the `visited` / `[A]` data these write):
//   1. Click "Load prototype ports" → a new traverser appears in the list.
//   2. Select a tile near the CENTRE, open Inspect, and "Place" that definition on it (its header
//      max-split / heading / movement are applied automatically when you place it).
//   3. Press Play. Add a Coloring rule (e.g. the "Generate a random coloring" button) to see it.
//   A few notes per entry below say when a design wants something special (several seeds, a line seed
//   via the Initial-state pane, or a particular board numbering).
//
// TILING-AGNOSTIC BY DESIGN. Unlike the gallery recipes (which lean on kalleboda's octagon/wedge
// shapes), every program here is built only from UNIVERSAL mechanisms — relative moves
// (straight / r1 / l1 / …), the built-in `nearest-unvisited`, XOR / totalistic birth gates on
// `visited-neighbors` / `visited-edges`, per-tile registries `[A]`, walker state `P`, `steps` timing,
// `tile-number` / `orientation` / `edge-count` routing, `find-tile` search, and registry cellular
// automata. So they run — and grow something — on ANY tiling (square, triangular, hex, penrose, hat, …),
// not just one. Absolute `move [e0..e11]` fans wrap on tiles with fewer sides, so they stay full fans
// (and thus mirror-symmetric) everywhere.
//
// THE DESIGN PRINCIPLES behind the beautiful ones (from the prototype's hard-won lessons, CLAUDE.md §5):
//   • The Rule-90 / XOR gate — grow ONLY where exactly one neighbour is visited
//     (`visited-neighbors@target == 1`) — is the mechanism that makes truly self-similar, Sierpinski-like
//     output. It's the backbone of the "gasket" family.
//   • Gap constraint: a walk needs a gap-making rule or it's a dud. Over-restrict → dies in a few ticks;
//     no constraint → floods into a boring blob. The sweet spot is a LOOSE gate (`unique <= 1`) PLUS
//     ≥4 fallback directions → ~35–70% fill WITH structure.
//   • Each entry is a genuinely DIFFERENT mechanism (never "same structure, different colour").
//
// To add one: append a `def(name, beauty, [lines])`. `beauty` (1 experimental/situational, 2 solid,
// 3 showcase) only biases the random pick; every entry stays in the list. Names must be a single word
// (hyphens ok), not a reserved DSL word.

export type PrototypePort = {
  name: string
  text: string
  // Relative likelihood of being the one served by the random button (higher = more often). Reflects how
  // reliably it looks good from a single centre placement. Omitted = 1.
  beauty?: number
}

const def = (name: string, beauty: number, lines: string[]): PrototypePort => ({ name, text: lines.join('\n'), beauty })

// ---- shared building blocks (kept named so the intent of each program reads clearly) ----
// A GATE is a `forbid` of the negation: "only move onto tiles where PRED" ⇒ "forbid the target when NOT
// PRED" (an `allow` only OVERRIDES a forbid, so it can't gate on its own — see exec.ts). `@target` makes
// the guard read the move's DESTINATION rather than the current tile.
const ONLY_UNVISITED = 'directive if visited@target > 0 always forbid move' // grow only into fresh tiles
const BIRTH_XOR1 = 'directive if visited-neighbors@target != 1 always forbid move' // Rule-90: exactly one visited neighbour
const BIRTH_TOTAL13 = 'directive if visited-neighbors@target != 1 and visited-neighbors@target != 3 always forbid move'
const BIRTH_LOOSE = 'directive if visited-neighbors@target > 1 always forbid move' // the loose gap gate: at most one
const THREAD_EDGE1 = 'directive if visited-edges@target != 1 always forbid move' // thread single-edge adjacencies (mazes)

// Relative move fans (heading-relative, so the seed's aim rotates the whole pattern).
const FAN3 = ['move straight', 'move r1', 'move l1']
const FAN5 = ['move straight', 'move r1', 'move l1', 'move r2', 'move l2']
const FAN7 = ['move straight', 'move r1', 'move l1', 'move r2', 'move l2', 'move r3', 'move l3']
// Fan to EVERY edge on any tiling (wraps on tiles with < 12 sides; duplicates coalesce). Orientation-fixed.
const ALL_EDGES = 'move [e0..e11]'

// ============================================================================================
// GROUP A — XOR / Rule-90 birth gaskets. The proven self-similar family: grow only into unvisited
// tiles that have exactly ONE (or a small set of) visited neighbours, fanning several ways. Single
// centre seed → a nested gasket. Vary the gate + fan width + max-split for different densities.
// ============================================================================================

// The classic (the original prototype port): XOR-unique fork, five ways. Dense yet leaves structured
// square voids + diagonal seams at several scales.
const GASKET = def('gasket', 3, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, ...FAN5])
// Wider fork cap → a denser Sierpinski-carpet weave.
const CARPET = def('carpet', 3, ['max-split = 5', ONLY_UNVISITED, BIRTH_XOR1, ...FAN5])
// Three-way fan → cleaner, sparser triangular gasket.
const GASKET_TRIO = def('gasket-trio', 2, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, ...FAN3])
// Birth gated on visited EDGES (a two-edge neighbour counts twice) instead of distinct neighbours —
// same on the square grid, different texture on tilings with multi-edge adjacency.
const THREAD_GASKET = def('thread-gasket', 2, ['max-split = 3', ONLY_UNVISITED, THREAD_EDGE1, ...FAN5])
// Totalistic birth (one OR three visited neighbours) → a busier, lace-like automaton.
const TOTALISTIC = def('totalistic', 2, ['max-split = 5', ONLY_UNVISITED, BIRTH_TOTAL13, ...FAN5])
// The §5 "sweet spot": a LOOSE gap gate (≤ 1 visited neighbour) + 5 directions → ~35–70% structured fill.
const LOOSE_WEAVE = def('loose-weave', 3, ['max-split = 5', ONLY_UNVISITED, BIRTH_LOOSE, ...FAN5])
// Six-way XOR fan (covers up to hexagonal fan-out) → a frost / dendrite look.
const FROST = def('frost', 3, ['max-split = 6', ONLY_UNVISITED, BIRTH_XOR1, ...FAN5, 'move r3'])
// Absolute full-edge fan under the XOR gate → a radially SYMMETRIC XOR flower (a full fan stays
// mirror-symmetric on any tiling). Place one seed at the centre.
const MANDALA = def('mandala', 3, ['max-split = 12', ONLY_UNVISITED, BIRTH_XOR1, ALL_EDGES])
// Full-edge fan with the single-edge-thread gate → crisp radial snowflake arms.
const SNOWFLAKE = def('snowflake', 2, ['max-split = 6', ONLY_UNVISITED, THREAD_EDGE1, ALL_EDGES])
// Seven-way loose fan → a bushy star burst.
const STARBURST = def('starburst', 3, ['max-split = 7', ONLY_UNVISITED, BIRTH_LOOSE, ...FAN7])
// Birth on EXACTLY TWO visited neighbours — an unusual CA rule that grows thin, filament-y structures.
const PAIR_BIRTH = def('pair-birth', 1, ['max-split = 5', ONLY_UNVISITED, 'directive if visited-neighbors@target != 2 always forbid move', ...FAN5])
// Same XOR growth as `gasket`, but expressed with an ALLOW carve-out: forbid every target, then ALLOW
// only the unvisited XOR-birth ones (allow OVERRIDES a forbid). A demo of the allow/forbid interplay.
const XOR_ALLOW = def('xor-allow', 2, [
  'max-split = 3',
  'directive if visited@target >= 0 always forbid move',
  'directive if visited@target == 0 and visited-neighbors@target == 1 always allow move',
  ...FAN5,
])

// ============================================================================================
// GROUP B — timed branching. A `move straight` backbone that periodically sprouts side branches
// (every N steps), gated to unvisited tiles. Single seed → trees, veins, ferns. The branch period +
// which turns fire set the silhouette.
// ============================================================================================

// Y-forks every 7 steps (max-split 2 lets the fork replace the trunk) → capillary veins.
const VEINS = def('veins', 3, ['max-split = 2', ONLY_UNVISITED, 'if steps % 7 == 0 then move r1', 'if steps % 7 == 0 then move l1', 'move straight'])
// Trunk CONTINUES (max-split 3) and sprouts a wide r2/l2 pair every 5 → a fern frond.
const FERN = def('fern', 3, ['max-split = 3', ONLY_UNVISITED, 'if steps % 5 == 0 then move r2', 'if steps % 5 == 0 then move l2', 'move straight'])
// A four-way burst every 9 steps → branching coral.
const CORAL = def('coral', 2, ['max-split = 4', ONLY_UNVISITED, 'if steps % 9 == 0 then move [r1, l1, r2, l2]', 'move straight'])
// Only ever turns ONE way when it branches → the whole tree curls.
const CURL = def('curl', 2, ['max-split = 2', ONLY_UNVISITED, 'if steps % 4 == 0 then move r1', 'move straight'])
// Two different branch periods (right every 3, left every 5) → asymmetric feathering.
const FEATHER = def('feather', 2, ['max-split = 3', ONLY_UNVISITED, 'if steps % 3 == 0 then move r1', 'if steps % 5 == 0 then move l1', 'move straight'])
// Long straight runs, rare offset jags → forked lightning.
const LIGHTNING = def('lightning', 2, ['max-split = 2', ONLY_UNVISITED, 'if steps % 11 == 0 then move r1', 'if steps % 11 == 5 then move l1', 'move straight'])
// No trunk — a self-avoiding two-way branch every tick → a dense woven thicket.
const THICKET = def('thicket', 1, ['max-split = 2', ONLY_UNVISITED, 'move r1', 'move l1', 'move straight'])

// ============================================================================================
// GROUP C — XOR growth with step-timed turns. The gasket birth gate, but the walker mostly goes
// straight and only offers turns on a beat (every N steps). The beat length changes the lattice pitch.
// ============================================================================================
const XOR_TRI = def('xor-tri', 3, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, 'move straight', 'if steps % 5 == 0 then move r1', 'if steps % 5 == 0 then move l1'])
const XOR_STAR = def('xor-star', 2, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, 'move straight', 'if steps % 4 == 0 then move r1', 'if steps % 4 == 0 then move l1'])
const XOR_DENSE = def('xor-dense', 3, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, 'move straight', 'if steps % 3 == 0 then move r1', 'if steps % 3 == 0 then move l1'])
const XOR_SLOW = def('xor-slow', 2, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, 'move straight', 'if steps % 6 == 0 then move r1', 'if steps % 6 == 0 then move l1'])

// ============================================================================================
// GROUP D — turmites (Langton's-ant style). A SINGLE long-lived walker that reads the current tile's
// registry [A], turns based on it, and flips it — then revisits freely (no unvisited gate). Emergent
// "highways" and rugs; genuinely different from the branching families. Colour by registry A.
// ============================================================================================

// Langton's ant: on A==0 turn right & set A=1, else turn left & set A=0.
const ANT = def('ant', 3, ['if [A] == 0 {', 'put A = 1', 'move r1', '} else {', 'put A = 0', 'move l1', '}'])
// A sharper-turning ant (r2 / l2) → a different rug.
const ANT_MIRROR = def('ant-mirror', 2, ['if [A] == 0 {', 'put A = 1', 'move r2', '} else {', 'put A = 0', 'move l2', '}'])
// A three-state turmite (A cycles 0→1→2→0 with turns R, L, r2). Multi-state turmites make ornate,
// often symmetric growth.
const ANT_TRI = def('ant-tri', 2, [
  'if [A] == 0 {', 'put A = 1', 'move r1', '}',
  'if [A] == 1 {', 'put A = 2', 'move l1', '}',
  'if [A] == 2 {', 'put A = 0', 'move r2', '}',
])
// A "beaver": go straight on A==0 (and mark it), turn on A==1 (and clear it) → boxy spirals.
const BEAVER = def('beaver', 2, ['if [A] == 0 {', 'put A = 1', 'move straight', '} else {', 'put A = 0', 'move r1', '}'])

// ============================================================================================
// GROUP E — self-avoiding maze walks. Grow only into unvisited tiles, threading narrow gaps so corridors
// form. Turns listed in priority order; max-split + the gate decide which survive.
// ============================================================================================

// Only thread tiles touching exactly one visited edge → tight labyrinth corridors.
const LABYRINTH = def('labyrinth', 2, ['max-split = 2', ONLY_UNVISITED, THREAD_EDGE1, 'move r1', 'move l1', 'move r2', 'move l2', 'move straight'])
// Loose gate (≤1 visited neighbour) + three directions → a chunkier maze.
const MAZE = def('maze', 2, ['max-split = 2', ONLY_UNVISITED, BIRTH_LOOSE, 'move r1', 'move l1', 'move straight'])
// A single walker following the right-hand rule (prefer right, then straight, then left) → hugging spirals.
const RIGHT_HAND = def('right-hand', 1, ['max-split = 1', ONLY_UNVISITED, 'move r1', 'move straight', 'move l1', 'move r2', 'move l2'])
// A smooth space-filling snake: keep going straight, else take the least-turn unvisited neighbour.
const SERPENT = def('serpent', 1, ['max-split = 1', ONLY_UNVISITED, 'move straight', 'move nearest-unvisited'])

// ============================================================================================
// GROUP F — routing by STRUCTURE. The turn each step depends on the tile / walk state (its step count,
// board number, edge count, or rotational variant), so the same program adapts its texture to whatever
// tiling it runs on. Universal attributes only.
// ============================================================================================

// Alternate the turn direction every step → a tight zigzag ribbon.
const ZIGZAG = def('zigzag', 2, ['max-split = 2', ONLY_UNVISITED, 'if steps % 2 == 0 then move r1', 'if steps % 2 == 1 then move l1', 'move straight'])
// A three-beat turn cycle (right, left, hard-right) → a repeating meander motif.
const TERNARY = def('ternary', 2, ['max-split = 2', ONLY_UNVISITED, 'if steps % 3 == 0 then move r1', 'if steps % 3 == 1 then move l1', 'if steps % 3 == 2 then move r2', 'move straight'])
// Turn by the parity of the tile's board NUMBER (the numbering you pick in canvas settings) → the pattern
// re-textures when you switch numbering scheme.
const NUM_ROUTE = def('num-route', 2, ['max-split = 2', ONLY_UNVISITED, 'if tile-number % 2 == 0 then move r1', 'if tile-number % 2 == 1 then move l1', 'move straight'])
// Turn by tile VALENCE (edge count): on tilings that mix polygon sizes, big and small tiles steer
// oppositely — a shape-aware walk with no tiling-specific names.
const VALENCE = def('valence', 2, ['max-split = 2', ONLY_UNVISITED, 'if edge-count > 4 then move r1', 'if edge-count < 5 then move l1', 'move straight'])
// Route by a tile's rotational variant (`orientation`) → picks out the tiling's own symmetry cells.
const ORIENT_FAN = def('orient-fan', 2, ['max-split = 3', ONLY_UNVISITED, 'if orientation == 0 then move r1', 'if orientation == 1 then move l1', 'if orientation == 2 then move r2', 'move straight'])

// ============================================================================================
// GROUP G — walker STATE machines. Use the walker's own registers (P) and `update` to change behaviour
// over the course of the walk — meanders, memory-driven branching, widening bursts.
// ============================================================================================

// Count P up forever; curl right for 10 steps, then left for 10, … → a slow serpentine meander.
const MEANDER = def('meander', 2, ['max-split = 2', ONLY_UNVISITED, 'increase P', 'if P % 20 < 10 then move r1', 'if P % 20 >= 10 then move l1', 'move straight'])
// Remember crowding: every time it passes a busy tile, bump P; after 3 such, fork — then reset P. The
// branch cadence depends on the terrain, not a fixed clock.
const MEMORY = def('memory', 2, ['max-split = 2', ONLY_UNVISITED, 'if visited-neighbors > 1 then increase P', 'if P >= 3 then move [r1, l1]', 'if P >= 3 then put P = 0', 'move straight'])
// XOR growth that periodically WIDENS its fork cap (via `update max-split`) then narrows again →
// rhythmic bursts of density.
const SURGE = def('surge', 1, ['max-split = 1', ONLY_UNVISITED, BIRTH_XOR1, 'if steps % 10 == 0 then update max-split 6', 'if steps % 10 == 4 then update max-split 1', ...FAN5])

// ============================================================================================
// GROUP H — chained-hop moves. Each move HOPS two tiles in one tick (`a@b`), re-aiming after the first
// hop, so the walk lands on a sparser sub-lattice — knight-move and skip patterns.
// ============================================================================================

// Two-hop XOR growth (straight-straight, r1-r1, l1-l1) → a gasket on a coarser lattice.
const LEAPFROG = def('leapfrog', 2, ['max-split = 3', ONLY_UNVISITED, BIRTH_XOR1, 'move straight@straight', 'move r1@r1', 'move l1@l1'])
// L-shaped (knight-ish) hops in four ways → a woven diagonal lattice.
const KNIGHT = def('knight', 2, ['max-split = 4', ONLY_UNVISITED, 'move straight@r1', 'move straight@l1', 'move r1@straight', 'move l1@straight'])
// Four L-hops as a single split, loosely gated → an interlaced weave.
const WEAVE = def('weave', 2, ['max-split = 4', ONLY_UNVISITED, BIRTH_LOOSE, 'move [straight@r1, straight@l1, r1@straight, l1@straight]'])

// ============================================================================================
// GROUP I — directive PHASES. Two move phases in a single tick with different gates, separated by
// `reset directives` — the walk behaves one way, then another, each step.
// ============================================================================================

// Phase 1: fork r1/l1 only into fresh tiles. Reset. Phase 2: push straight while it stays uncrowded.
const TWO_PHASE = def('two-phase', 2, ['max-split = 2', ONLY_UNVISITED, 'if steps % 2 == 0 then move r1', 'if steps % 2 == 0 then move l1', 'reset directives', BIRTH_LOOSE, 'move straight'])
// A gated turn then an UNGATED straight (which may revisit) → a self-crossing lattice.
const GATE_FLIP = def('gate-flip', 2, ['max-split = 2', 'directive if visited@target > 0 always forbid move', 'move r2', 'reset directives', 'move straight'])

// ============================================================================================
// GROUP J — list reducers. Steer by combining several neighbours with a list reducer (`:xor`, `:any`, …)
// — a directional cellular-automaton flavour.
// ============================================================================================

// Push straight only when EXACTLY ONE of the two side neighbours is visited (a directional XOR).
const XOR_SIDE = def('xor-side', 1, ['max-split = 3', ONLY_UNVISITED, 'if [visited@r1, visited@l1]:xor == 1 then move straight', 'move r1', 'move l1'])
// Prefer straight once ANY nearby tile ahead is visited → grows along its own frontier.
const ANY_GROW = def('any-grow', 1, ['max-split = 2', ONLY_UNVISITED, 'if [visited@r1, visited@l1, visited@r2, visited@l2]:any > 0 then move straight', 'move r1', 'move l1'])

// ============================================================================================
// GROUP K — search-based (find-tile / find-lowest-tile). The walker JUMPS to a tile located by a search
// rather than only stepping to a neighbour. Great with a chosen board numbering + a step-based colour.
// ============================================================================================

// Fill the plane in board-NUMBER order (teleport to the lowest-numbered unvisited tile each tick). Set
// the numbering to `spiral` in canvas settings and colour by `step` → an unspooling spiral gradient.
const SPIRAL_FILL = def('spiral-fill', 1, ['find-lowest-tile visited == 0', 'move f0'])
// The same, from the HIGH-numbered end.
const HIGH_FILL = def('high-fill', 1, ['find-highest-tile visited == 0', 'move f0'])
// A wanderer that space-fills: step to an adjacent unvisited tile when it can; when boxed in, BFS-search
// for the nearest unvisited tile (f0) and jump to it — so it never dies until the whole plane is full.
// Shows off `find-tile`, `exists@f0`, and a found-tile move target together.
const WANDERER = def('wanderer', 2, [
  'max-split = 1',
  'find-tile visited == 0 {',
  'max-split = 8',
  'move [e0..e11]',
  '}',
  'move nearest-unvisited',
  'if exists@f0 then move f0',
])

// ============================================================================================
// GROUP L — registry cellular automata. A row of walkers sweeping in lockstep, each computing its tile's
// [A] from the parity of the row behind → 1-D CA unrolled into 2-D (Rule-90 → the Sierpinski triangle).
// THESE WANT A LINE SEED: in the Initial-state pane, seed a whole row all facing the same way and mark a
// couple of [A] cells, e.g.  auto-place line {t1, 0, 0, 2}  +  auto-place blob {[A], 50, 0, 1, 1}. Colour
// by registry A. (A single hand-placed walker just draws a 1-wide trail.)
// ============================================================================================

// Wider XOR neighbourhood (the tile behind + its two neighbours) → a woven diamond CA.
const WAVE = def('wave', 1, ['if ([A@r2] + [A@r2@r1] + [A@r2@l1]) % 2 == 1 then put A = 1', 'move straight'])
// Pure Rule-90 (XOR of the two cells diagonally behind) → the classic Sierpinski triangle from a line seed.
const PASCAL = def('pascal', 1, ['if ([A@r2@r1] + [A@r2@l1]) % 2 == 1 then put A = 1', 'move straight'])

// The full palette (order is stable; the random button weights by `beauty`).
export const PROTOTYPE_PORTS: ReadonlyArray<PrototypePort> = [
  // A — XOR / Rule-90 gaskets
  GASKET, CARPET, GASKET_TRIO, THREAD_GASKET, TOTALISTIC, LOOSE_WEAVE, FROST, MANDALA, SNOWFLAKE, STARBURST, PAIR_BIRTH, XOR_ALLOW,
  // B — timed branching
  VEINS, FERN, CORAL, CURL, FEATHER, LIGHTNING, THICKET,
  // C — XOR with step-timed turns
  XOR_TRI, XOR_STAR, XOR_DENSE, XOR_SLOW,
  // D — turmites
  ANT, ANT_MIRROR, ANT_TRI, BEAVER,
  // E — mazes
  LABYRINTH, MAZE, RIGHT_HAND, SERPENT,
  // F — structural routing
  ZIGZAG, TERNARY, NUM_ROUTE, VALENCE, ORIENT_FAN,
  // G — walker-state machines
  MEANDER, MEMORY, SURGE,
  // H — chained hops
  LEAPFROG, KNIGHT, WEAVE,
  // I — directive phases
  TWO_PHASE, GATE_FLIP,
  // J — list reducers
  XOR_SIDE, ANY_GROW,
  // K — search-based
  SPIRAL_FILL, HIGH_FILL, WANDERER,
  // L — registry cellular automata (want a line seed)
  WAVE, PASCAL,
]

// Pick ONE port at random, weighted by `beauty` (higher = more likely) so the showcase fractals come up
// most often while the experimental ones still surface. This is app-runtime code, so Math.random is fine.
export function pickRandomPort(ports: ReadonlyArray<PrototypePort> = PROTOTYPE_PORTS): PrototypePort {
  const weights = ports.map((p) => Math.max(0, p.beauty ?? 1))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return ports[Math.floor(Math.random() * ports.length)]
  let r = Math.random() * total
  for (let i = 0; i < ports.length; i += 1) {
    r -= weights[i]
    if (r < 0) return ports[i]
  }
  return ports[ports.length - 1]
}
