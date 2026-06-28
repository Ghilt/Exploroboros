import { describe, it, expect } from 'vitest'
import { compileProgram } from '../traverse'
import { PROTOTYPE_PORTS } from './prototypePorts'

// The ports are hardcoded DSL strings, so a typo only shows up when someone tries to place one. These
// compile them at build time (no named predicates → an empty name map) to catch that early.
describe('prototype ports', () => {
  it('every port compiles to a runnable program', () => {
    for (const port of PROTOTYPE_PORTS) {
      const result = compileProgram(port.text, new Map())
      expect(result.ok, `${port.name} should compile`).toBe(true)
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
