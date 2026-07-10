import { describe, it, expect } from 'vitest'
import { compileProgram } from '../traverse'
import { reservedNameError } from '../dsl'
import { PROTOTYPE_PORTS, pickRandomPort } from './prototypePorts'

// The ports are hardcoded DSL strings, so a typo only shows up when someone tries to place one. These
// compile them at build time (no named predicates → an empty name map) to catch that early. Visual
// beauty is the owner's to judge on-device; these are just correctness guards on the deliverable.
describe('prototype ports', () => {
  it('has a palette of ~50 varied definitions', () => {
    expect(PROTOTYPE_PORTS.length).toBeGreaterThanOrEqual(50)
  })

  it('every port compiles to a runnable program (with no named predicates)', () => {
    for (const port of PROTOTYPE_PORTS) {
      const result = compileProgram(port.text, new Map())
      expect(result.ok, `${port.name} should compile: ${result.ok ? '' : result.error.message}`).toBe(true)
    }
  })

  it('every port name is UI-clean (not reserved) and unique', () => {
    const seen = new Set<string>()
    for (const port of PROTOTYPE_PORTS) {
      expect(reservedNameError(port.name), `${port.name} should be a usable name`).toBeNull()
      const key = port.name.toLowerCase()
      expect(seen.has(key), `${port.name} is duplicated`).toBe(false)
      seen.add(key)
    }
  })

  it('every port has a beauty weight in 1..3', () => {
    for (const port of PROTOTYPE_PORTS) {
      expect(port.beauty, `${port.name} beauty`).toBeGreaterThanOrEqual(1)
      expect(port.beauty, `${port.name} beauty`).toBeLessThanOrEqual(3)
    }
  })

  it('pickRandomPort always returns a member of the palette', () => {
    const names = new Set(PROTOTYPE_PORTS.map((p) => p.name))
    for (let i = 0; i < 200; i += 1) {
      expect(names.has(pickRandomPort().name)).toBe(true)
    }
  })

  it('gasket ports the XOR-unique fork: max-split 3, two move gates, five moves', () => {
    const gasket = PROTOTYPE_PORTS.find((p) => p.name === 'gasket')
    expect(gasket).toBeDefined()
    const result = compileProgram(gasket!.text, new Map())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.settings.maxSplit).toBe(3)
    expect(result.value.statements.filter((s) => s.kind === 'directive')).toHaveLength(2)
    expect(result.value.statements.filter((s) => s.kind === 'rule')).toHaveLength(5)
  })
})
