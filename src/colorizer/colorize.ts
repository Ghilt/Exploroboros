// Turn the coloring rules into a per-tile fill colour. Pure: evaluate each rule's predicate against
// a tile, and alpha-composite the colours of all matching rules top→bottom, each at its own opacity
// (last opaque rule wins; a translucent later rule blends over the ones above). Predicates are parsed
// once per call, never per tile, so this stays cheap enough to memoize on input changes.

import type { Tiling } from '../tiling'
import type { TileState } from '../canvas'
import { attrSpec, evalPredicate, parsePredicate, type EvalContext, type Pred } from '../dsl'
import type { ColoringRule, Ramp } from './types'

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = Number.parseInt(h, 16)
  if (h.length !== 6 || Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

// The breakpoint position of each stop: its `at` if set, else evenly spaced across the domain — one
// full modulo cycle when modulo is set, otherwise the stop index (so value 0,1,2,… picks stop 0,1,2…).
function stopPositions(ramp: Ramp): number[] {
  const n = ramp.stops.length
  const span = ramp.mod && ramp.mod > 0 ? ramp.mod : Math.max(1, n - 1)
  return ramp.stops.map((s, i) => (s.at != null ? s.at : (n > 1 ? (i / (n - 1)) * span : 0)))
}

// Resolve a ramp to a concrete hex for a numeric value `v`. Modulo wraps `v` into one cycle; the
// value is then clamped to the stop range and linearly interpolated between the surrounding stops.
function rampColor(ramp: Ramp, v: number): string {
  const stops = ramp.stops
  if (stops.length === 0) return '#000000'
  if (stops.length === 1) return stops[0].hex

  const positions = stopPositions(ramp)
  const last = positions.length - 1
  const u = ramp.mod && ramp.mod > 0 ? ((v % ramp.mod) + ramp.mod) % ramp.mod : v
  if (u <= positions[0]) return stops[0].hex
  if (u >= positions[last]) return stops[last].hex

  let j = 0
  while (j < last - 1 && u >= positions[j + 1]) j += 1
  const p0 = positions[j]
  const p1 = positions[j + 1]
  const t = p1 > p0 ? (u - p0) / (p1 - p0) : 0
  const c0 = hexToRgb(stops[j].hex)
  const c1 = hexToRgb(stops[j + 1].hex)
  return rgbToHex([c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t])
}

function hexFor(rule: ColoringRule, ctx: EvalContext): string {
  if (rule.color.kind === 'flat') return rule.color.hex
  const ramp = rule.color.ramp
  const spec = attrSpec(ramp.attr)
  // Indexed attrs (coordinate, step) read at attrIndex; a missing value reads as 0 (the fade floor).
  const v = spec?.compute(ctx, ramp.attrIndex ?? 0) ?? 0
  return rampColor(ramp, v)
}

type Accum = { r: number; g: number; b: number; a: number }

// Source-over composite of `hex` at opacity `alpha` onto the running accumulator.
function over(dst: Accum, hex: string, alpha: number): Accum {
  const [sr, sg, sb] = hexToRgb(hex)
  const sa = clamp01(alpha)
  const outA = sa + dst.a * (1 - sa)
  if (outA === 0) return { r: 0, g: 0, b: 0, a: 0 }
  return {
    r: (sr * sa + dst.r * dst.a * (1 - sa)) / outA,
    g: (sg * sa + dst.g * dst.a * (1 - sa)) / outA,
    b: (sb * sa + dst.b * dst.a * (1 - sa)) / outA,
    a: outA,
  }
}

function rgbaString(c: Accum): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Number(c.a.toFixed(3))})`
}

function ruleText(rule: ColoringRule, predicateText: ReadonlyMap<string, string>): string | null {
  return rule.predicate.kind === 'inline' ? rule.predicate.text : predicateText.get(rule.predicate.id) ?? null
}

export type CompiledRule = { pred: Pred; rule: ColoringRule }

// Parse each rule's predicate once. Rules whose predicate is missing or does not parse are dropped
// (the editor surfaces the error elsewhere) so a broken rule can't throw mid-colorize.
export function compileRules(
  rules: ReadonlyArray<ColoringRule>,
  predicateText: ReadonlyMap<string, string>,
): CompiledRule[] {
  const out: CompiledRule[] = []
  for (const rule of rules) {
    const text = ruleText(rule, predicateText)
    if (text == null) continue
    const r = parsePredicate(text)
    if (r.ok) out.push({ pred: r.value, rule })
  }
  return out
}

// tileId -> CSS rgba() of the stacked matching rules. Tiles with no match are absent (the canvas
// falls back to the base tile fill). `predicateText` maps predicate id -> DSL for `ref` predicates.
export function colorize(
  rules: ReadonlyArray<ColoringRule>,
  predicateText: ReadonlyMap<string, string>,
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  indexById: ReadonlyMap<string, number>,
): Map<string, string> {
  const compiled = compileRules(rules, predicateText)
  const out = new Map<string, string>()
  if (compiled.length === 0) return out

  for (const node of tiling.nodes) {
    const ctx: EvalContext = { node, tiling, overlay, indexById }
    let acc: Accum | null = null
    for (const { pred, rule } of compiled) {
      if (!evalPredicate(pred, ctx)) continue
      acc = over(acc ?? { r: 0, g: 0, b: 0, a: 0 }, hexFor(rule, ctx), rule.opacity)
    }
    if (acc) out.set(node.id, rgbaString(acc))
  }
  return out
}
