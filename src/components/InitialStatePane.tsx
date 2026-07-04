import './PredicatePane.css'
import './InitialStatePane.css'
import { useMemo, useState } from 'react'
import { compileDoc } from '../initstate'
import type { InitialStateStore } from '../state/initialStateStore'
import { HelpButton } from './HelpButton'

// The Initial-state pane: one DSL document of `auto-place` lines that seed a fractal's STARTING state —
// traversers, per-tile registries, and visited marks — by grid-relative rules (resolved against
// whatever grid renders, so a pattern scales onto the big export grid). Reuses the predicate pane's
// styles. The document rides into the exported PNG so a creation reopens intact.
export function InitialStatePane({
  store,
  predicateNames,
  traverserNames,
}: {
  store: InitialStateStore
  // name -> DSL text, so an `if` guard can reference a saved predicate by name (resolved at compile).
  predicateNames: ReadonlyMap<string, string>
  // User traverser names in list order — for validating `t1`/name references and flagging typos.
  traverserNames: ReadonlyArray<string>
}) {
  const [showSyntax, setShowSyntax] = useState(false)

  const compiled = useMemo(() => compileDoc(store.text, predicateNames), [store.text, predicateNames])

  // Traverser references that name no traverser (t1..tN or a known name) — flagged so a typo is visible.
  const unknownRefs = useMemo(() => {
    if (!compiled.ok) return []
    const valid = new Set<string>(traverserNames)
    traverserNames.forEach((_, i) => valid.add(`t${i + 1}`))
    const bad = new Set<string>()
    for (const s of compiled.value) {
      if (s.what.kind === 'traverser' && !valid.has(s.what.ref)) bad.add(s.what.ref)
    }
    return [...bad]
  }, [compiled, traverserNames])

  return (
    <div className="predicate-pane init-pane">
      <span className="pane-help">
        <HelpButton title="Initial state">
          <p>
            Seed a fractal’s <strong>starting state</strong> by rules that scale with the grid — so the
            same setup lays out correctly on the small edit grid AND the big export grid (unlike a
            hand-placed walker, which drifts when you export bigger).
          </p>
          <p>
            Each line places <strong>one thing</strong> on the tiles a shape covers:{' '}
            <code>auto-place line {'{'}t1, 0, 0, 0{'}'}</code> or{' '}
            <code>auto-place blob {'{'}[A], 50, 50, 2, 5{'}'}</code>. The first slot is <strong>what</strong>{' '}
            — a traverser (<code>t1</code>, <code>t2</code>, … or its name), a registry <code>[A]</code>/
            <code>[B]</code>/<code>[C]</code>, or <code>visited</code>. The last slot <strong>sets</strong>{' '}
            a value: a traverser’s heading edge, the registry’s value, or how many <code>visited</code>{' '}
            marks (0 = mark once). It overwrites any hand-painted value on that tile.
          </p>
          <p>
            <strong>line</strong> {'{'}angle, percent, …{'}'}: angle 0 = row, 90 = column, ±45 = diagonal;
            percent 0–100 across from the top-left. <strong>blob</strong> {'{'}x%, y%, radius, …{'}'}: a
            point (50,50 = centre) grown out <code>radius</code> tile-rings (1 = one tile).
          </p>
          <p>
            Add <code>if &lt;predicate&gt;</code> to filter (the ordinary tile predicates, e.g.{' '}
            <code>tile-type == octagon</code>). Init-placed walkers show <strong>ghostly</strong> and are
            changed by editing the rule, not from the canvas; a hand-placed walker wins a shared tile.
          </p>
          <p className="help-readmore">
            <a href="#/guide">Read the full guide → </a>
          </p>
        </HelpButton>
      </span>
      <p className="pane-lead">Seed walkers, registries and visited by grid-relative rules.</p>

      {!store.persistOk && (
        <p className="pane-warn">Couldn’t save to this browser — changes last only for this session.</p>
      )}

      <textarea
        className="pred-text init-text"
        value={store.text}
        spellCheck={false}
        aria-label="initial-state DSL"
        placeholder={'auto-place line {t1, 0, 0, 0}\nauto-place blob {[A], 50, 50, 2, 5}'}
        onChange={(e) => store.setText(e.target.value)}
      />

      {compiled.ok ? (
        <p className="pred-status pred-status--ok">
          ✓ {compiled.value.length} placement{compiled.value.length === 1 ? '' : 's'}
          {unknownRefs.length > 0 ? ` · unknown traverser: ${unknownRefs.join(', ')}` : ''}
        </p>
      ) : (
        <p className="pred-status pred-status--err" role="alert">
          {compiled.error.message}
        </p>
      )}

      <section className="pred-section init-syntax">
        <header className="pred-section-head">
          <span>Syntax</span>
          <button type="button" className="pred-add" onClick={() => setShowSyntax((v) => !v)}>
            {showSyntax ? 'Hide' : 'Show'}
          </button>
        </header>
        {showSyntax && (
          <div className="init-syntax-body">
            <pre className="init-syntax-code">{`auto-place line {what, angle, percent, param} [if <predicate>]
auto-place blob {what, x%, y%, radius, param} [if <predicate>]`}</pre>
            <ul className="init-legend">
              <li>
                <strong>what</strong> — a traverser (<code>t1</code>, <code>t2</code>, … or a name), a
                registry <code>[A]</code>/<code>[B]</code>/<code>[C]</code>, or <code>visited</code>.
              </li>
              <li>
                <strong>param</strong> — sets it: a traverser’s heading edge; a registry’s value; or the
                number of <code>visited</code> marks (0 = once).
              </li>
              <li>
                <strong>line</strong> — <code>angle</code> 0 = row, 90 = column, ±45 = diagonal;{' '}
                <code>percent</code> 0–100 from the top-left.
              </li>
              <li>
                <strong>blob</strong> — <code>x%,y%</code> a point (50,50 = centre); <code>radius</code> in
                tile-rings (1 = one tile).
              </li>
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
