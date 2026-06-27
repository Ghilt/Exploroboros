import './Canvas.css'
import { useMemo } from 'react'
import { Workspace } from '../components/Workspace'
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

      <Workspace tiling={tiling} />
    </div>
  )
}
