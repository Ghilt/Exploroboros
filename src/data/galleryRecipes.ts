// Real generation recipes for the gallery — traverser fractals ported from the Python prototype
// (visualizer/rules/fractals.tasks) into our DSL, keyed by image filename. Clicking a gallery image
// reopens the real setup so it regenerates in-tool; compare the live result to the thumbnail (the
// prototype's own render) to verify the port.
//
// Prototype → our DSL:
//   `only move if PRED`                  → `directive if PRED @ target always allow move` (gates the destination)
//   rel 0 / 1 / 7 / 2 / 6 / 3             → move straight / r1 / l1 / r2 / l2 / r3
//   `adjacent-visited-unique`             → visited-neighbors   (distinct visited neighbour tiles)
//   `adjacent-visited`                    → visited-edges       (a two-edge neighbour counts twice)
//   `octagon` / `wedge`                   → tile-type == octagon / wedge
//   `move edge {0..7}`                    → move [edge 0, …, edge 7] (a split over all sides)
//   `reset move restriction`              → reset directives
// Seeds: the prototype's `start = N heading k` becomes a seed at the tiling centre (offset 0,0) facing
// the compass-k direction; we place by position-offset (the prototype's tile numbers don't map to
// ours), so the fractal STRUCTURE matches even if it sits elsewhere. All run on kalleboda (octagon +
// wedge), the prototype's tiling.
//
// COLOUR — rescaled to our scale. The prototype colours by `step` over thousands of ticks with big
// moduli (mod 600 / 12000…); our interactive grid runs only ~50–80 ticks, so those moduli barely
// advance (a flat wash). `ring()` keeps each ramp's stop COLOURS and relative spacing but compresses
// the modulo to RING_MOD, so the palette cycles into concentric rings like the prototype — see §9.
//
// The rotation-routed family is now fully ported via the tiling-agnostic `orientation` attribute:
// classic (wedge rotation → r1/l1), ringlare (visited-count steering), wedge-seek (shape fan), and
// sierpinski — the nested triangular gasket that finally exercises `orientation` (each wedge orientation
// relays a DIFFERENT absolute octagon edge). sierpinski's orientation→edge map AND the octagon-fan edge
// order were found EMPIRICALLY (the literal compass-bearing map doesn't transfer to our welded wedge
// seating, and the fan order matters because of the two-edge octagon–wedge adjacency — see its comment).
// Also skipped: ember/accrete/bw-rings
// (`move to lowest`), prune (`kill`), twin-spiral (`hunger`/`starve`) — genuinely missing DSL features;
// weave-3/rift (`col`/`num` with no clean lattice equivalent); compass-paint/eddy (colour-by-heading —
// we don't record per-tile heading); quiz (malformed source). carve/carve-2 and xor-wide/tangle (no
// reference render) left for later.

import { RECIPE_SCHEMA_VERSION, APP_VERSION, type Recipe, type RecipeSeed } from '../export'
import type { ColoringRule, RampStop } from '../colorizer'
import type { StoredTraverser } from '../state/traverserStore'

const GRID = 64
// Prototype compass 0 = North; our heading is radians (0 = east, CCW+), so compass k = π/2 − k·π/4.
const compass = (k: number): number => Math.PI / 2 - (k * Math.PI) / 4
// Cycles of a colour ramp over one run at our scale — the modulo `ring()` compresses each ramp to.
const RING_MOD = 36

const def = (name: string, lines: string[]): StoredTraverser => ({ id: `gx-${name}`, name, text: lines.join('\n') })

const stop = (hex: string, at: number): RampStop => ({ hex, at })

const rule = (id: string, predId: string, color: ColoringRule['color']): ColoringRule => ({
  id,
  predicate: { kind: 'ref', id: predId },
  color,
  opacity: 1,
})
const inlineRule = (id: string, predText: string, color: ColoringRule['color']): ColoringRule => ({
  id,
  predicate: { kind: 'inline', text: predText },
  color,
  opacity: 1,
})

// A step-ramp over visited tiles, the prototype's stop positions compressed into RING_MOD so the
// palette cycles into rings at our tick scale. `protoMod` is the prototype's modulo (for the rescale).
const ring = (id: string, protoMod: number, stops: RampStop[], predId = 'visited'): ColoringRule =>
  rule(id, predId, {
    kind: 'ramp',
    ramp: {
      attr: 'first-step',
      mod: RING_MOD,
      stops: stops.map((s) => ({ hex: s.hex, at: Math.round(((s.at ?? 0) * RING_MOD) / protoMod) })),
    },
  })
const inlineRing = (id: string, predText: string, protoMod: number, stops: RampStop[]): ColoringRule =>
  inlineRule(id, predText, {
    kind: 'ramp',
    ramp: { attr: 'first-step', mod: RING_MOD, stops: stops.map((s) => ({ hex: s.hex, at: Math.round(((s.at ?? 0) * RING_MOD) / protoMod) })) },
  })
const flat = (id: string, hex: string, predId = 'visited'): ColoringRule => rule(id, predId, { kind: 'flat', hex })

const seed = (
  def: string,
  maxSplit: number,
  opts: { shape?: 'octagon' | 'wedge'; heading?: number; offset?: { x: number; y: number } } = {},
): RecipeSeed => ({
  offset: opts.offset ?? { x: 0, y: 0 },
  shape: opts.shape,
  heading: opts.heading ?? compass(0),
  def,
  maxSplit,
  maxSteps: 50000,
  movement: 'relative',
  p: 0,
  q: 0,
  r: 0,
})

const recipe = (background: string, seeds: RecipeSeed[], traverser: StoredTraverser, coloringRules: ColoringRule[]): Recipe => ({
  schemaVersion: RECIPE_SCHEMA_VERSION,
  appVersion: APP_VERSION,
  app: 'exploroboros',
  tilingId: 'kalleboda',
  gridN: GRID,
  output: { width: 2048, height: 2048, edges: false, background },
  seeds,
  paint: [],
  predicates: [],
  traversers: [traverser],
  coloringRules,
})

// Shared move lists.
const XOR_5 = ['move straight', 'move r1', 'move l1', 'move r2', 'move l2'] // the five-way fan
const XOR_3 = ['move straight', 'move r1', 'move l1'] // three-way fan
const GATE_UNVISITED = 'directive if visited == 0 @ target always allow move'
const GATE_XOR1 = 'directive if visited-neighbors == 1 @ target always allow move' // Rule-90 birth
const GATE_TOTALISTIC = 'directive if visited-neighbors == 1 or visited-neighbors == 3 @ target always allow move'

// --- traverser definitions ---
const GASKET = def('gasket', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, ...XOR_5])
const OCTA_XOR = def('octa-xor', ['max-split = 5', GATE_UNVISITED, 'directive if tile-type == octagon @ target always allow move', GATE_XOR1, ...XOR_5])
const CARPET = def('carpet', ['max-split = 5', GATE_UNVISITED, GATE_XOR1, ...XOR_5])
const OCTA_CARPET = def('octa-carpet', ['max-split = 5', GATE_UNVISITED, 'directive if tile-type == octagon @ target always allow move', GATE_XOR1, ...XOR_5])
// labyrinth-2 navigates wedges by turns; when the wedge "straight" pairing changed (so straight crosses
// the body to a different octagon), the pure-turn walk trapped early. Appending `move straight` as a
// fallback + seeding south restores a ~43% maze (was ~41%). Thumbnail will drift — re-verify in a gallery pass.
const LABYRINTH = def('labyrinth-2', ['max-split = 2', GATE_UNVISITED, 'directive if visited-edges == 1 @ target always allow move', 'move r1', 'move l1', 'move r2', 'move l2', 'move straight'])
const NESTED = def('nested-rings', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, ...XOR_3])
const SIERP_GASKET = def('sierp-gasket', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, ...XOR_3]) // sierp-shape + sierp-3 share this
const PULSE = def('pulse', ['max-split = 3', GATE_UNVISITED, GATE_TOTALISTIC, ...XOR_3])
const TOTALIST = def('totalist', ['max-split = 6', GATE_UNVISITED, GATE_TOTALISTIC, ...XOR_5, 'move r3'])
const LICHEN = def('lichen', ['max-split = 5', GATE_UNVISITED, GATE_TOTALISTIC, ...XOR_5])
const XOR_TRI = def('xor-tri', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, 'move straight', 'if steps % 5 == 0 then move r1', 'if steps % 5 == 0 then move l1'])
const XOR_STAR = def('xor-star', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, 'move straight', 'if steps % 4 == 0 then move r1', 'if steps % 4 == 0 then move l1'])
const XOR_SLOW = def('xor-slow', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, 'move straight', 'if steps % 6 == 0 then move r1', 'if steps % 6 == 0 then move l1'])
const XOR_DENSE = def('xor-dense', ['max-split = 3', GATE_UNVISITED, GATE_XOR1, 'move straight', 'if steps % 3 == 0 then move r1', 'if steps % 3 == 0 then move l1'])
const VEINS = def('veins', ['max-split = 2', GATE_UNVISITED, 'if steps % 7 == 0 then move r1', 'if steps % 7 == 0 then move l1', 'move straight'])
const BRANCH_SLOW = def('branch-slow', ['max-split = 2', GATE_UNVISITED, 'move straight', 'if steps % 6 == 0 then move r1'])
const SHAPE_MAZE = def('shape-maze', ['max-split = 2', GATE_UNVISITED, 'directive if visited-neighbors <= 1 @ target always allow move', 'if tile-type == octagon then move r1', 'if tile-type == octagon then move l1', 'if tile-type == wedge then move r2', 'if tile-type == wedge then move l2', 'move straight'])
const SHAPE_ROUTER = def('shape-router', ['max-split = 2', GATE_UNVISITED, 'if tile-type == octagon then move r1', 'if tile-type == octagon then move l1', 'if tile-type == wedge then move r2', 'if tile-type == wedge then move l2'])
const TWO_PHASE = def('two-phase', ['max-split = 2', GATE_UNVISITED, 'directive if tile-type == wedge @ target always allow move', 'move r1', 'move l1', 'reset directives', GATE_UNVISITED, 'directive if visited-neighbors <= 1 @ target always allow move', 'move straight', 'move r2'])
const FROST = def('frost-wedge', ['max-split = 5', GATE_UNVISITED, GATE_XOR1, ...XOR_5])
const FERN = def('fern', ['max-split = 9', GATE_UNVISITED, 'directive if visited-neighbors <= 1 @ target always allow move', 'move straight', 'if steps % 4 == 0 and tile-type == octagon then move [edge 0, edge 1, edge 2, edge 3, edge 4, edge 5, edge 6, edge 7]'])
const SPEED_VIS = def('speed-vis', ['max-split = 8', GATE_UNVISITED, 'directive if visited-neighbors <= 1 @ target always allow move', 'move [edge 0, edge 1, edge 2, edge 3, edge 4, edge 5, edge 6, edge 7]'])
// classic-2 — relative-nav XOR maze, four turns, only onto OCTAGONS. No rotation routing, so it ports
// cleanly (it was wrongly grouped with the absolute-nav fractals).
const CLASSIC2 = def('classic-2', ['max-split = 2', GATE_UNVISITED, 'directive if visited-edges == 1 @ target always allow move', 'directive if tile-type == octagon @ target always allow move', 'move r1', 'move l1', 'move r2', 'move l2'])
// classic — relative-nav XOR maze: an octagon "bounces" r2/l2 off a wedge straight ahead, and a wedge
// crosses STRAIGHT to the octagon on the other side. The prototype hand-coded the wedge crossing as a
// per-rotation turn (rot 0/180 → r1, 90/270 → l1); our wedge "straight" IS that crossing for a walker
// that ENTERED the wedge (the owner-specified through-pairing — edges.ts), so `move straight` reproduces
// it directly once the walk is underway; rotation routing (and `orientation`) isn't needed here. Seeded
// on the centre WEDGE facing NORTH (π/2 = edge 0): a just-placed walker has no entry edge, so its FIRST
// `move straight` leaves via the edge it faces (edge 0), which is the same octagon the old through-pairing
// seed crossed to — so the walk is byte-identical from step 1, then transits wedges by the pairing. The
// `visited-edges == 1` gate only threads single-edge adjacencies (kalleboda is mostly two-edged), so the
// start is heading-sensitive — edge 0 (the through-exit) grows ~36%, other aims stall.
const CLASSIC = def('classic', [
  'max-split = 2',
  GATE_UNVISITED,
  'directive if visited-edges == 1 @ target always allow move',
  'if tile-type == wedge @ straight then move r2',
  'if tile-type == wedge @ straight then move l2',
  'if tile-type == wedge then move straight',
])

// ringlare — relative-nav single self-avoiding walker steered by how many visited EDGES the candidate
// target touches; winds into nested rings. No rotation/absolute edges. Each prototype `move edge K if
// adjacent-visited == M` → a guarded relative move whose guard reads the target via `@ <rel-edge>`
// (adjacent-visited → visited-edges; edge 0/1/6/7→straight/r1/l2/l1). The one prototype line with two
// different decorated subjects (`edge 0 is … and edge 7 is …`) is dropped — a guard carries one `@`.
const RINGLARE = def('ringlare', [
  'max-split = 1',
  GATE_UNVISITED,
  'if visited-edges == 1 @ r1 then move r1',
  'if (visited-edges == 2 or visited-edges == 1) @ straight then move straight',
  'if visited-edges == 3 @ l2 then move l2',
  'if visited-edges == 5 @ straight then move straight',
  'if visited-edges == 3 @ r1 then move r1',
  'if visited-edges == 2 @ r1 then move r1',
  'if visited-edges == 4 @ straight then move straight',
  'if visited-edges == 4 @ l1 then move l1',
  'if visited-edges == 3 @ straight then move straight',
  'if visited-edges == 4 @ l2 then move l2',
  'if visited-edges == 6 @ l2 then move l2',
  'if visited-edges == 5 @ l2 then move l2',
  'if visited-edges == 6 @ straight then move straight',
])

// wedge-seek — absolute-nav XOR fan that alternates shape: from a wedge fan to all neighbouring octagons,
// from an octagon fan to all neighbouring wedges. The octagon-target fan (`@ edge K` octagon) also offers
// octagon→octagon from octagons, but the wedge-target fan is listed first and max-split 2 caps it, so
// octagon→wedge / wedge→octagon dominate (kalleboda has no wedge–wedge adjacency, so the wedge fan never
// fires from a wedge). The absolute index doesn't matter — we try all 8 edges via per-edge target gates.
const EDGES_0_7 = [0, 1, 2, 3, 4, 5, 6, 7]
const WEDGE_SEEK = def('wedge-seek', [
  'max-split = 2',
  'movement = absolute',
  GATE_UNVISITED,
  'directive if visited-neighbors == 1 @ target always allow move',
  ...EDGES_0_7.map((k) => `if tile-type == wedge @ edge ${k} then move edge ${k}`),
  ...EDGES_0_7.map((k) => `if tile-type == octagon @ edge ${k} then move edge ${k}`),
])

// sierpinski — absolute-nav XOR-UNIQUE birth, rotation-routed through wedges (the prototype's
// "classic-3"): a genuine nested triangular Sierpinski gasket in fire tones. An octagon fans to its
// neighbouring wedges; each wedge relays to ONE octagon in an absolute direction fixed by its
// `orientation`; the unique-birth gate (`visited-neighbors == 1`) carves the relay tree into the
// recursive triangular voids. This is the one ported fractal that genuinely needs the tiling-agnostic
// `orientation` attribute (each wedge orientation relays a DIFFERENT absolute way). max-split is the
// prototype's 2. Two details the owner pinned down porting this by hand:
//  - FAN ORDER MATTERS. An octagon touches each wedge across TWO edges, so a low-first `edge 0..7` fan
//    spends both max-split slots on the SAME (lowest-numbered) wedge — the walk marches single-file and
//    never makes the 2-D gasket. Listing the fan 2,3,4,5,6,7,0,1 picks a DIFFERENT pair of edges to win
//    the two slots, landing on two DISTINCT wedges so the tree branches.
//  - the orientation→edge relay map (2→7,3→7,0→5,1→4) is coupled to that fan order (a different order
//    needs a different map — our welded wedge seating differs from the prototype's, so the literal
//    compass bearings don't transfer). Found empirically; then re-mapped 1:1 to the same physical wedge
//    edges when wedge edge numbering switched to clockwise-perimeter order (old 2→1,3→6,0→5,1→2). Result
//    is oriented/mirrored vs the prototype render, but the same gasket: ~8% fill from the centre WEDGE
//    seed, natural stop. (The octagon→wedge fan below uses octagon edges, unaffected by that switch.)
const SIERPINSKI = def('sierpinski', [
  'movement = absolute',
  'max-split = 2',
  GATE_UNVISITED,
  GATE_XOR1,
  'if orientation == 2 and tile-type == wedge then move edge 7',
  'if orientation == 3 and tile-type == wedge then move edge 7',
  'if orientation == 0 and tile-type == wedge then move edge 5',
  'if orientation == 1 and tile-type == wedge then move edge 4',
  ...[2, 3, 4, 5, 6, 7, 0, 1].map((k) => `if tile-type == wedge @ edge ${k} then move edge ${k}`),
])

// Image filename (in src/assets/gallery/) → its recipe.
export const GALLERY_RECIPES: Readonly<Record<string, Recipe>> = {
  'gasket.webp': recipe('#0a0410', [seed('gasket', 3)], GASKET, [ring('gasket-c', 600, [stop('#FFE08A', 0), stop('#FF6A3D', 200), stop('#B5179E', 500)])]),
  'octa-xor.webp': recipe('#04040a', [seed('octa-xor', 5, { shape: 'octagon' })], OCTA_XOR, [ring('octa-xor-c', 260, [stop('#FFFFC8', 0), stop('#FF6428', 120), stop('#781E5A', 260)])]),
  'carpet.webp': recipe('#0a0408', [seed('carpet', 5)], CARPET, [ring('carpet-c', 380, [stop('#FFE08A', 0), stop('#FF6A3D', 120), stop('#7A1E5A', 260)])]),
  'octa-carpet.webp': recipe('#0a0a04', [seed('octa-carpet', 5, { shape: 'octagon' })], OCTA_CARPET, [ring('octa-carpet-c', 60, [stop('#FFFFC8', 0), stop('#FF6428', 20), stop('#781E5A', 50)])]),
  'labyrinth-2.webp': recipe('#0e0c18', [seed('labyrinth-2', 2, { heading: compass(4) })], LABYRINTH, [ring('labyrinth-2-c', 460, [stop('#9AD0FF', 0), stop('#7B5BF2', 220), stop('#E0509A', 460)])]),
  'classic-2.webp': recipe('#000000', [seed('classic-2', 2, { shape: 'octagon' })], CLASSIC2, [ring('classic-2-c', 350, [stop('#FAE9A0', 0), stop('#0070FA', 39), stop('#FAE9A0', 350)])]),
  'classic.webp': recipe('#000000', [seed('classic', 2, { shape: 'wedge', heading: Math.PI / 2 })], CLASSIC, [ring('classic-c', 35, [stop('#4AE9A0', 0), stop('#000000', 35)])]),
  'ringlare.webp': recipe('#04060c', [seed('ringlare', 1, { heading: (3 * Math.PI) / 4 })], RINGLARE, [ring('ringlare-c', 400, [stop('#00FFC8', 0), stop('#FF00A0', 200)])]),
  'wedge-seek.webp': recipe('#0c0604', [seed('wedge-seek', 2, { shape: 'octagon' })], WEDGE_SEEK, [ring('wedge-seek-c', 720, [stop('#FFD0A0', 0), stop('#E0602E', 240), stop('#5A1E2A', 480)])]),
  'sierpinski.webp': recipe('#000000', [seed('sierpinski', 2, { shape: 'wedge' })], SIERPINSKI, [ring('sierpinski-c', 50, [stop('#FFE68C', 0), stop('#FF9628', 25), stop('#DC3C28', 49)])]),
  'nested-rings.webp': recipe('#060006', [seed('nested-rings', 3)], NESTED, [ring('nested-rings-c', 60, [stop('#FFFFFF', 0), stop('#2A0E4A', 5), stop('#FF4DA0', 40)])]),
  'sierp-shape.webp': recipe('#060406', [seed('sierp-gasket', 3)], SIERP_GASKET, [
    inlineRing('sierp-shape-oct', 'tile-type == octagon', 400, [stop('#FFE08A', 0), stop('#FF6A3D', 200)]),
    inlineRing('sierp-shape-wed', 'tile-type == wedge', 400, [stop('#7AF5E0', 0), stop('#2B6CE0', 200)]),
  ]),
  'sierp-3.webp': recipe('#100610', [seed('sierp-gasket', 3, { heading: compass(0) }), seed('sierp-gasket', 3, { heading: compass(3) }), seed('sierp-gasket', 3, { heading: compass(6) })], SIERP_GASKET, [ring('sierp-3-c', 470, [stop('#FFD23F', 0), stop('#E84899', 140), stop('#3A1E6B', 320)])]),
  'xor-tri.webp': recipe('#000000', [seed('xor-tri', 3, { heading: compass(0) }), seed('xor-tri', 3, { heading: compass(3) }), seed('xor-tri', 3, { heading: compass(6) })], XOR_TRI, [flat('xor-tri-c', '#ffffff')]),
  'xor-star.webp': recipe('#000000', Array.from({ length: 8 }, (_, k) => seed('xor-star', 3, { heading: compass(k) })), XOR_STAR, [flat('xor-star-c', '#ffffff')]),
  'xor-slow.webp': recipe('#000000', [seed('xor-slow', 3)], XOR_SLOW, [flat('xor-slow-c', '#ffffff')]),
  'xor-dense.webp': recipe('#000000', [seed('xor-dense', 3)], XOR_DENSE, [flat('xor-dense-c', '#ffffff')]),
  'pulse.webp': recipe('#060006', [seed('pulse', 3)], PULSE, [ring('pulse-c', 150, [stop('#FFFFFF', 0), stop('#FF6AC8', 60), stop('#2A0E4A', 120)])]),
  'totalist.webp': recipe('#0a0600', [seed('totalist', 6)], TOTALIST, [ring('totalist-c', 12000, [stop('#FFF0B0', 0), stop('#FF7A2A', 4000), stop('#8A1E2A', 8000)])]),
  'lichen.webp': recipe('#060a06', [seed('lichen', 5, { offset: { x: -8, y: -8 } }), seed('lichen', 5, { offset: { x: 8, y: -8 } }), seed('lichen', 5, { offset: { x: -8, y: 8 } }), seed('lichen', 5, { offset: { x: 8, y: 8 } })], LICHEN, [
    rule('lichen-c', 'visited', { kind: 'ramp', ramp: { attr: 'visited-neighbors', mod: null, stops: [stop('#DFFFB0', 0), stop('#5BBF4A', 2), stop('#1F6B3A', 4), stop('#0A3A1E', 6)] } }),
  ]),
  'veins.webp': recipe('#080c08', [seed('veins', 2)], VEINS, [ring('veins-c', 700, [stop('#CFF59A', 0), stop('#5BBF4A', 300), stop('#1F6B3A', 600)])]),
  'branch-slow.webp': recipe('#000000', [seed('branch-slow', 2)], BRANCH_SLOW, [flat('branch-slow-c', '#ffffff')]),
  'shape-maze.webp': recipe('#080810', [seed('shape-maze', 2)], SHAPE_MAZE, [ring('shape-maze-c', 720, [stop('#9AD0FF', 0), stop('#7B5BF2', 240), stop('#E0509A', 480)])]),
  'shape-router.webp': recipe('#0a0a12', [seed('shape-router', 2, { shape: 'octagon' })], SHAPE_ROUTER, [
    inlineRule('shape-router-wed', 'tile-type == wedge', { kind: 'flat', hex: '#FF5A3C' }),
    inlineRing('shape-router-oct', 'tile-type == octagon', 240, [stop('#78C8FF', 0), stop('#3C50C8', 240)]),
  ]),
  'two-phase.webp': recipe('#0a0804', [seed('two-phase', 2)], TWO_PHASE, [ring('two-phase-c', 640, [stop('#FFE08A', 0), stop('#FF6A3D', 200), stop('#7A1E2A', 420)])]),
  'frost-wedge.webp': recipe('#02040c', [seed('frost-wedge', 5, { heading: compass(1) })], FROST, [
    inlineRule('frost-oct', 'tile-type == octagon', { kind: 'flat', hex: '#0A0E1A' }),
    inlineRing('frost-wed', 'tile-type == wedge', 12000, [stop('#FFFFFF', 0), stop('#9AD8FF', 5000), stop('#4060C0', 10000)]),
  ]),
  'fern.webp': recipe('#060c0a', [seed('fern', 9, { shape: 'octagon' })], FERN, [ring('fern-c', 40, [stop('#9AF5B0', 0), stop('#4AC78A', 10), stop('#2A8F6A', 20), stop('#1A5F4A', 30)])]),
  'speed-vis.webp': recipe('#040c0a', [seed('speed-vis', 8)], SPEED_VIS, [ring('speed-vis-c', 10, [stop('#FFFFC8', 0), stop('#FF6428', 5), stop('#CF002D', 10)])]),
}
