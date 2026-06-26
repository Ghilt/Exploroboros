import './Canvas.css'
import { useMemo } from 'react'
import { TodoScaffold } from '../components/TodoScaffold'
import { TilingDebugView } from '../components/TilingDebugView'
import { squareTiling } from '../tiling'

export function Canvas() {
  // Precomputed on load; no user-triggered computation yet.
  const tiling = useMemo(() => squareTiling(20, 20), [])

  return (
    <div className="canvas-page">
      <header className="page-head">
        <p className="page-eyebrow">Workspace</p>
        <h1 className="page-title">Canvas</h1>
        <p className="page-lead">
          Where the magic happens — pick a tiling, author rules, and watch patterns grow.
        </p>
      </header>

      <div className="canvas-stage">
        <TilingDebugView tiling={tiling} />
      </div>

      <TodoScaffold
        title="Build the interactive canvas"
        items={[
          'Generic tiling render + data model (§4.3) — square debug view ✓',
          'More tilings (the 11 uniform + octagon-wedge)',
          'Static coloring rules (DSL)',
          'Traverse engine (fractal growth)',
          'Rule authoring by click / tap',
          'Interactive plane renderer (§4.1: Konva vs PixiJS)',
          'Export the result as an image (§4.2)',
        ]}
      >
        <p>
          The canvas shows a debug view of a 20×20 square tiling straight from the new
          tiling engine. The interactive plane, rule editor, and fractal growth arrive in
          later phases — tracked in the backlog in CLAUDE.md §8.
        </p>
      </TodoScaffold>
    </div>
  )
}
