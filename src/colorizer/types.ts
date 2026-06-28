// Data model for coloring rules. Pure (no React/DOM) so the colorizer can live beside src/tiling and
// run under Vitest/SSR; the React store in src/state imports these types.

import { TILE_ATTRIBUTES, type AttrName } from '../dsl'

// A ramp fades across up to 5 colours, driven by a numeric tile attribute. Any attribute the DSL
// exposes can drive it — including the step ones (first-step / latest-step / step[n]) and coordinates.
// Indexed attributes (coordinate, step) use `attrIndex`; an attribute with no value for a tile reads
// as 0. Modulo (the normal usage) wraps the value into a repeating cycle.
export type RampAttr = AttrName

export const RAMP_ATTRS: ReadonlyArray<RampAttr> = TILE_ATTRIBUTES.map((a) => a.name)

export const MAX_RAMP_STOPS = 5

// One colour stop on a ramp. `at` is the breakpoint — the attribute value where this colour sits
// (in the attribute's units; within [0, mod) when modulo is set). Leave every breakpoint blank
// (null) for an even fade; set them for prototype-style control over where each colour lands.
export type RampStop = { hex: string; at: number | null }

export type Ramp = {
  attr: RampAttr
  attrIndex?: number // for indexed attributes (coordinate, step); ignored otherwise
  mod: number | null
  stops: ReadonlyArray<RampStop> // 1..MAX_RAMP_STOPS
}

// A rule's colour is one flat colour or a ramp. Opacity is NOT here — it's a single value on the
// whole rule (a translucent rule blends over the rules above it).
export type RuleColor = { kind: 'flat'; hex: string } | { kind: 'ramp'; ramp: Ramp }

// A rule's predicate is either a reference to a Predicate-pane predicate (by id) or an inline one.
export type PredicateRef = { kind: 'ref'; id: string } | { kind: 'inline'; text: string }

export type ColoringRule = {
  id: string
  predicate: PredicateRef
  color: RuleColor
  opacity: number // 0..1, applied to the whole rule's colour
}
