import './Canvas.css'
import { TodoScaffold } from '../components/TodoScaffold'

export function Canvas() {
  return (
    <div className="canvas-page">
      <header className="page-head">
        <p className="page-eyebrow">Workspace</p>
        <h1 className="page-title">Canvas</h1>
        <p className="page-lead">
          Where the magic happens — pick a tiling, author rules, and watch patterns grow.
        </p>
      </header>

      <div className="canvas-stage" role="img" aria-label="Interactive plane placeholder">
        <span className="canvas-stage-note">interactive plane goes here</span>
      </div>

      <TodoScaffold
        title="Build the interactive canvas"
        items={[
          'Tile renderer (§4.1: Konva vs PixiJS — to decide with owner)',
          'Generic tiling render + data model (§4.3)',
          'Static coloring rules (DSL)',
          'Traverse engine (fractal growth)',
          'Rule authoring by click / tap',
          'Export the result as an image (§4.2)',
        ]}
      >
        <p>
          This screen is a placeholder. The plane, tools, and rule editor arrive in later
          phases — tracked in the backlog in CLAUDE.md §8.
        </p>
      </TodoScaffold>
    </div>
  )
}
