import './PredicatePane.css'
import { useMemo, useState } from 'react'
import { parsePredicate, serialize } from '../dsl'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'
import type { PredicateStore, StoredPredicate } from '../state/predicateStore'
import { HelpButton } from './HelpButton'
import { TrashButton } from './TrashButton'
import { PredicateVisualEditor } from './PredicateVisualEditor'

// The Predicate pane: a library of reusable tile predicates. Rows show just the name; click one to
// expand it — a bundled predicate reveals its DSL (read-only), a custom one opens its editor. "+ New"
// makes a custom predicate from scratch. Custom predicates persist in the browser.
export function PredicatePane({ store }: { store: PredicateStore }) {
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
        <HelpButton title="Predicates">
          <p>
            A <strong>predicate</strong> is a yes/no test on a tile — written in a small language, e.g.{' '}
            <code>visited &gt; 0</code> or <code>visited-neighbors == 1</code>. You combine attributes
            (visit count, registries, coordinates, edge count…) with maths and <code>and</code> / <code>or</code>{' '}
            / <code>not</code>.
          </p>
          <p>
            Build a library here, then reuse them — a <strong>coloring rule</strong> is just a predicate plus a
            colour. The same predicates will later drive traversers, so they feel the same everywhere.
          </p>
          <p>
            Test a tile's shape with <code>tile-type == triangle</code> (any shape name), or its orientation
            with <code>rotation</code>. Attributes that might not exist for a tile (a specific step, an
            out-of-range coordinate) need a <code>default</code>, e.g. <code>step[3] default 0</code>.
          </p>
        </HelpButton>
      </span>
      <p className="pane-lead">Predicates ask a yes/no question about a tile.</p>

      {!store.persistOk && (
        <p className="pane-warn">Couldn’t save to this browser — changes last only for this session.</p>
      )}

      <section className="pred-section">
        <header className="pred-section-head">
          <span>Your predicates</span>
          <button type="button" className="pred-add" onClick={add}>
            + New
          </button>
        </header>
        {store.predicates.length > 0 && (
          <ul className="pred-list">
            {store.predicates.map((p) => (
              <li key={p.id} className={p.id === expandedId ? 'is-expanded' : undefined}>
                <div className="pred-row">
                  <button type="button" className="pred-name" aria-expanded={p.id === expandedId} onClick={() => toggle(p.id)}>
                    {p.name || '(unnamed)'}
                  </button>
                  <TrashButton label={`delete ${p.name || 'predicate'}`} onClick={() => remove(p.id)} />
                </div>
                {p.id === expandedId && (
                  <PredicateEditor key={p.id} predicate={p} onSetText={store.setText} onRename={store.rename} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pred-section">
        <header className="pred-section-head">
          <span>Presets</span>
        </header>
        <ul className="pred-list">
          {BUNDLED_PREDICATES.map((b) => (
            <li key={b.id} className={b.id === expandedId ? 'is-expanded' : undefined}>
              <div className="pred-row">
                <button type="button" className="pred-name" aria-expanded={b.id === expandedId} onClick={() => toggle(b.id)}>
                  {b.name}
                </button>
              </div>
              {b.id === expandedId && (
                <div className="pred-detail">
                  <code className="pred-dsl">{b.text}</code>
                  <p className="pred-desc">{b.description}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// The custom-predicate editor: a name field plus a Text/Visual toggle over the same predicate — the
// DSL text box, or the chip editor (PredicateVisualEditor), both compiled live with an inline error.
// Fully controlled by the store so the auto-name follows the text until the user types their own name.
function PredicateEditor({
  predicate,
  onSetText,
  onRename,
}: {
  predicate: StoredPredicate
  onSetText: (id: string, text: string) => void
  onRename: (id: string, name: string) => void
}) {
  const [mode, setMode] = useState<'text' | 'visual'>('text')
  const result = useMemo(() => parsePredicate(predicate.text), [predicate.text])

  return (
    <div className="pred-editor">
      <label className="pred-field">
        <span className="pred-field-label">Name</span>
        <input
          className="pred-name-input"
          value={predicate.name}
          onChange={(e) => onRename(predicate.id, e.target.value)}
          aria-label="predicate name"
        />
      </label>

      <div className="pred-mode" role="group" aria-label="editor mode">
        <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
          Text
        </button>
        <button type="button" aria-pressed={mode === 'visual'} onClick={() => setMode('visual')}>
          Visual
        </button>
      </div>

      {mode === 'text' ? (
        <label className="pred-field">
          <span className="pred-field-label">DSL</span>
          <textarea
            className="pred-text"
            value={predicate.text}
            spellCheck={false}
            rows={3}
            aria-label="predicate DSL"
            onChange={(e) => onSetText(predicate.id, e.target.value)}
          />
        </label>
      ) : (
        <PredicateVisualEditor text={predicate.text} onChange={(t) => onSetText(predicate.id, t)} />
      )}

      {result.ok ? (
        <p className="pred-status pred-status--ok">✓ {serialize(result.value)}</p>
      ) : (
        <p className="pred-status pred-status--err" role="alert">
          {result.error.message}
        </p>
      )}
    </div>
  )
}
