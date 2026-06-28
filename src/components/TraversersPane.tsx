import './PredicatePane.css'
import { useMemo, useState } from 'react'
import { compileProgram } from '../traverse'
import type { TraverserStore, StoredTraverser } from '../state/traverserStore'
import { HelpButton } from './HelpButton'
import { TrashButton } from './TrashButton'

// The Traversers pane: a library of walker DEFINITIONS, each a DSL program describing how a walker
// moves and writes registries each tick. Rows show the name; click to expand the editor (name + DSL
// text), compiled live with an inline error. Definitions persist in the browser; place one on a tile
// from the Inspect pane, then Play. Reuses the predicate pane's styles.
export function TraversersPane({
  store,
  predicateNames,
}: {
  store: TraverserStore
  // name -> DSL text, so a guard can reference a saved predicate by name (resolved at compile).
  predicateNames: ReadonlyMap<string, string>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id))
  const add = () => setExpandedId(store.add())
  const remove = (id: string) => {
    store.remove(id)
    if (id === expandedId) setExpandedId(null)
  }

  return (
    <div className="predicate-pane">
      <span className="pane-help">
        <HelpButton title="Traversers">
          <p>
            A <strong>traverser</strong> is a walker on the tiling. A definition is a little program,
            run <strong>top-to-bottom every tick</strong>: <code>if &lt;condition&gt; then &lt;action&gt;</code>{' '}
            lines (a bare action always fires).
          </p>
          <p>
            <strong>Move</strong> by edge: <code>move straight</code>, <code>move r1</code> (weak right),{' '}
            <code>move l2</code> (stronger left), <code>move edge 3</code> (the numbered edge), or{' '}
            <code>move nearest-unvisited</code> (step to the closest-by-heading unvisited neighbour — the
            built-in walker). <code>move [r1, l1]</code> splits (capped by <code>max-split</code>);{' '}
            <code>move straight -&gt; r1</code> hops twice in one tick.
          </p>
          <p>
            <strong>Registries:</strong> <code>put A = visited + 1</code>, <code>increase P</code>. A/B/C live on
            the tile; P/Q/R travel with the walker. Read another tile with{' '}
            <code>@</code>: <code>if visited &gt; 0 @ r1 then move l1</code>. Reference a saved predicate by
            name. Also: <code>morph &lt;name&gt; …</code>, <code>update max-split 2</code>, and{' '}
            <code>directive move always forbid if &lt;condition&gt;</code> / <code>reset directives</code>.
          </p>
          <p>
            Each tick reads the board <strong>as it was at the start of the tick</strong> (a walker doesn’t
            see its own or others’ writes until next tick). If two walkers share a tile in one tick,{' '}
            <code>increase</code> from both <strong>adds up</strong>; a <code>put</code> is{' '}
            <strong>last-writer-wins</strong> — so prefer <code>increase</code> when several walkers may meet.
          </p>
          <p className="help-readmore">
            <a href="#/guide">Read the full guide → </a>
            <span className="help-readmore-note">(every keyword, with diagrams)</span>
          </p>
          <p>
            Header settings (any order): <code>max-split</code>, <code>heading</code> (degrees),{' '}
            <code>movement = relative|absolute</code>, <code>max-steps</code>. Traversers only write data —
            colour comes from the <strong>Coloring</strong> pane reading it.
          </p>
        </HelpButton>
      </span>
      <p className="pane-lead">A traverser walks the tiles and writes data each tick.</p>

      {!store.persistOk && (
        <p className="pane-warn">Couldn’t save to this browser — changes last only for this session.</p>
      )}

      <section className="pred-section">
        <header className="pred-section-head">
          <span>Your traversers</span>
          <button type="button" className="pred-add" onClick={add}>
            + New
          </button>
        </header>
        {store.traversers.length > 0 ? (
          <ul className="pred-list">
            {store.traversers.map((t) => (
              <li key={t.id} className={t.id === expandedId ? 'is-expanded' : undefined}>
                <div className="pred-row">
                  <button type="button" className="pred-name" aria-expanded={t.id === expandedId} onClick={() => toggle(t.id)}>
                    {t.name || '(unnamed)'}
                  </button>
                  <TrashButton label={`delete ${t.name || 'traverser'}`} onClick={() => remove(t.id)} />
                </div>
                {t.id === expandedId && (
                  <TraverserEditor
                    key={t.id}
                    traverser={t}
                    predicateNames={predicateNames}
                    onSetText={store.setText}
                    onRename={store.rename}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pane-hint">No traversers yet. The built-in “Walker” is always available to place.</p>
        )}
      </section>
    </div>
  )
}

function TraverserEditor({
  traverser,
  predicateNames,
  onSetText,
  onRename,
}: {
  traverser: StoredTraverser
  predicateNames: ReadonlyMap<string, string>
  onSetText: (id: string, text: string) => void
  onRename: (id: string, name: string) => void
}) {
  const result = useMemo(() => compileProgram(traverser.text, predicateNames), [traverser.text, predicateNames])

  return (
    <div className="pred-editor">
      <label className="pred-field">
        <span className="pred-field-label">Name</span>
        <input
          className="pred-name-input"
          value={traverser.name}
          onChange={(e) => onRename(traverser.id, e.target.value)}
          aria-label="traverser name"
        />
      </label>

      <label className="pred-field">
        <span className="pred-field-label">Program</span>
        <textarea
          className="pred-text"
          value={traverser.text}
          spellCheck={false}
          rows={6}
          aria-label="traverser DSL"
          onChange={(e) => onSetText(traverser.id, e.target.value)}
        />
      </label>

      {result.ok ? (
        <p className="pred-status pred-status--ok">✓ {result.value.statements.length} rule(s)</p>
      ) : (
        <p className="pred-status pred-status--err" role="alert">
          {result.error.message}
        </p>
      )}
    </div>
  )
}

