import './Canvas.css'
import { Workspace } from '../components/Workspace'

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

      <Workspace />
    </div>
  )
}
