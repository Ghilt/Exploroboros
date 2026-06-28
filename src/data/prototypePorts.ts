// Hardcoded "prototype ports": traverser definitions hand-translated from the Python prototype's
// .tasks files into the app's traverser DSL. These are a debug aid — loaded on demand by the "Load
// prototype ports" button at the bottom of the Traversers pane — for sanity-checking the engine
// against patterns the prototype already produced. Only the TRAVERSAL behaviour is ported; colour is
// authored separately in the Coloring pane (so the ported `color …` lines are dropped here).
//
// Each `text` is app DSL the Traversers pane compiles; `name` becomes the placement/morph key. To
// port another prototype traverser, add an entry here.

export type PrototypePort = { name: string; text: string }

// gasket — prototype [gasket] (visualizer/rules/fractals.tasks): the Rule-90 / XOR-unique "birth"
// gate, forking up to three ways — fills densely yet leaves structured square voids and diagonal
// seams at several scales (a Sierpinski-carpet-like weave). Prototype lines → app DSL:
//   nav = relative                            → (the app default; omitted)
//   max-split = 3                             → max-split = 3
//   only move if visited == 0                 → directive move always allow if visited == 0
//   only move if adjacent-visited-unique == 1 → directive move always allow if visited-neighbors == 1
//   move rel 0 / 1 / 7 / 2 / 6                → move straight / r1 / l1 / r2 / l2
// A prototype `only move if PRED` filters every following move by its TARGET tile, which the app's
// `directive move always allow if PRED` does exactly (the guard is tested on the destination). The
// five moves are tried in that priority order, branching on each that passes the gate until max-split
// is reached. `visited-neighbors` is the app's canonical keyword for the prototype's
// `adjacent-visited-unique` (distinct visited neighbour tiles). The walker is placed + aimed and run
// from the canvas; relative moves make the start heading a rotation of the whole pattern.
const GASKET = `max-split = 3
directive move always allow if visited == 0
directive move always allow if visited-neighbors == 1
move straight
move r1
move l1
move r2
move l2`

export const PROTOTYPE_PORTS: ReadonlyArray<PrototypePort> = [{ name: 'gasket', text: GASKET }]
