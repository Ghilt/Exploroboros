// Public surface of the pure colorizer.

export type { RampStop, Ramp, RampAttr, RuleColor, PredicateRef, ColoringRule } from './types'
export { RAMP_ATTRS, MAX_RAMP_STOPS } from './types'
export { colorize, compileRules, type CompiledRule } from './colorize'
