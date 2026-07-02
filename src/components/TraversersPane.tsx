import './PredicatePane.css'
import './TraversersPane.css'
import { useMemo, useState } from 'react'
import { compileProgram } from '../traverse'
import type { TraverserStore, StoredTraverser } from '../state/traverserStore'
import { PROTOTYPE_PORTS } from '../data/prototypePorts'
import { HelpButton } from './HelpButton'
import { TrashButton } from './TrashButton'

// The Traversers pane: a library of walker DEFINITIONS, each a DSL program describing how a walker
// moves and writes registries each tick. The pane has two modes: a LIST of definitions, and a
// full-pane EDITOR (opened by clicking a row or "+ New") that maximises editing space, with a "Done"
// button at the bottom to return to the list. Edits autosave. Reuses the predicate pane's styles.
export function TraversersPane({
  store,
  predicateNames,
}: {
  store: TraverserStore
  // name -> DSL text, so a guard can reference a saved predicate by name (resolved at compile).
  predicateNames: ReadonlyMap<string, string>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId ? store.traversers.find((t) => t.id === editingId) ?? null : null

  // ---- editor mode: the editor consumes the whole pane ----
  if (editing) {
    return (
      <div className="predicate-pane trav-pane trav-pane--editing">
        <TraverserEditor
          key={editing.id}
          traverser={editing}
          predicateNames={predicateNames}
          onSetText={store.setText}
          onRename={store.rename}
          onDone={() => setEditingId(null)}
        />
      </div>
    )
  }

  // ---- list mode ----
  const add = () => setEditingId(store.add())
  const remove = (id: string) => store.remove(id)

  return (
    <div className="predicate-pane trav-pane">
      <span className="pane-help">
        <HelpButton title="Traversers">
          <p>
            A <strong>traverser</strong> is a walker on the tiling. A definition is a little program,
            run <strong>top-to-bottom every tick</strong>: <code>if &lt;predicate&gt; then &lt;action&gt;</code>{' '}
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
            <strong>Registries:</strong> <code>put A = [A] + 1</code>, <code>increase P</code>. A/B/C live on
            the tile; P/Q/R travel with the walker. Read a tile registry as <code>[A]</code> (or{' '}
            <code>[A, B]</code> to sum). Read another tile with <code>@</code>:{' '}
            <code>if visited &gt; 0 @ r1 then move l1</code>. Reference a saved predicate by name. Also:{' '}
            <code>morph &lt;name&gt; …</code>, <code>update max-split 2</code>, and{' '}
            <code>directive if &lt;predicate&gt; always forbid move</code> / <code>reset directives</code>.
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
            Header settings (any order): <code>max-split</code>, <code>heading</code> (edge number),{' '}
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
              <li key={t.id}>
                <div className="pred-row">
                  <button type="button" className="pred-name" onClick={() => setEditingId(t.id)}>
                    {t.name || '(unnamed)'}
                  </button>
                  <TrashButton label={`delete ${t.name || 'traverser'}`} onClick={() => remove(t.id)} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pane-hint">No traversers yet. The built-in “Walker” is always available to place.</p>
        )}
      </section>

      {/* Debug: add hardcoded traverser definitions ported from the prototype (currently just gasket). */}
      <div className="trav-ports">
        <button
          type="button"
          className="trav-ports-btn"
          title={`Debug — add prototype-ported traversers: ${PROTOTYPE_PORTS.map((p) => p.name).join(', ')}`}
          onClick={() => store.addPresets(PROTOTYPE_PORTS)}
        >
          Load prototype ports
        </button>
      </div>
    </div>
  )
}

// The full-pane editor: name + a program textarea that grows to fill the pane, a live compile status,
// and a "Done" button that returns to the list. Edits autosave through the store as you type.
function TraverserEditor({
  traverser,
  predicateNames,
  onSetText,
  onRename,
  onDone,
}: {
  traverser: StoredTraverser
  predicateNames: ReadonlyMap<string, string>
  onSetText: (id: string, text: string) => void
  onRename: (id: string, name: string) => void
  onDone: () => void
}) {
  const result = useMemo(() => compileProgram(traverser.text, predicateNames), [traverser.text, predicateNames])

  return (
    <div className="trav-edit">
      <label className="pred-field trav-edit-name">
        <span className="pred-field-label">Name</span>
        <input
          className="pred-name-input"
          value={traverser.name}
          onChange={(e) => onRename(traverser.id, e.target.value)}
          aria-label="traverser name"
        />
      </label>

      <textarea
        className="pred-text trav-edit-text"
        value={traverser.text}
        spellCheck={false}
        aria-label="traverser DSL"
        onChange={(e) => onSetText(traverser.id, e.target.value)}
      />

      {result.ok ? (
        <p className="pred-status pred-status--ok">✓ {result.value.statements.length} rule(s)</p>
      ) : (
        <p className="pred-status pred-status--err" role="alert">
          {result.error.message}
        </p>
      )}

      <div className="trav-edit-foot">
        <button type="button" className="trav-done" onClick={onDone}>
          ‹ Done
        </button>
      </div>
    </div>
  )
}
