import './PredicatePane.css'
import { useMemo, useState } from 'react'
import { parsePredicate, resolvePredRefs, serialize, reservedNameError } from '../dsl'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'
import type { PredicateStore, StoredPredicate } from '../state/predicateStore'
import { HelpButton } from './HelpButton'
import { TrashButton } from './TrashButton'
import { PredicateVisualEditor } from './PredicateVisualEditor'
import { SegmentedControl } from './SegmentedControl'
import { DslTextarea } from './DslTextarea'
import { buildDslCompletions } from './dslCompletions'

const EMPTY_NAMES: ReadonlyMap<string, string> = new Map()

// The Predicate pane: a library of reusable tile predicates. Rows show just the name; click one to
// expand it — a bundled predicate reveals its DSL (read-only), a custom one opens its editor. "+ New"
// makes a custom predicate from scratch. Custom predicates persist in the browser.
export function PredicatePane({
  store,
  predicateNames,
  traverserNames = [],
}: {
  store: PredicateStore
  // Predicate NAME -> DSL text (bundled + every custom predicate, incl. this one's own live text) so a
  // predicate's own text can reference another by name and the live preview can catch an unknown/cyclic
  // reference, not just a syntax error. Optional so a bare PredicatePane (e.g. in tests) still works.
  predicateNames?: ReadonlyMap<string, string>
  // Traverser names to keep predicate names distinct from (names are referenced across the DSLs). Optional
  // so a bare PredicatePane (e.g. in tests) still works.
  traverserNames?: ReadonlyArray<string>
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id))
  const add = () => setExpandedId(store.add())
  const remove = (id: string) => {
    store.remove(id)
    if (id === expandedId) setExpandedId(null)
  }

  // A custom predicate name is invalid if it's malformed (space / illegal char), a reserved DSL word /
  // reference pattern, or already used by a preset, another custom predicate, or a traverser (names must
  // be unique across the DSLs). The identifier rules apply only to a USER-given name — an AUTO name
  // mirrors the DSL text ("visited > 0"), which has spaces/operators by design and is display-only.
  const nameError = (p: StoredPredicate): string | null => {
    if (!p.autoName) {
      const reserved = reservedNameError(p.name)
      if (reserved) return reserved
    }
    const n = p.name.trim().toLowerCase()
    if (!n) return null
    if (BUNDLED_PREDICATES.some((b) => b.name.trim().toLowerCase() === n)) {
      return `"${p.name.trim()}" is already a preset predicate — choose another name`
    }
    if (store.predicates.some((o) => o.id !== p.id && o.name.trim().toLowerCase() === n)) {
      return `"${p.name.trim()}" is already used by another predicate`
    }
    if (traverserNames.some((tn) => tn.trim().toLowerCase() === n)) {
      return `"${p.name.trim()}" is already used by a traverser — names must be unique`
    }
    return null
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
            colour, and a <strong>traverser</strong> guard can test one too. Reference a saved predicate by
            name, and combine several with <code>and</code> / <code>or</code> / <code>not</code>:{' '}
            <code>Has_A and Has_C</code>. Names have <strong>no spaces</strong> — use <code>_</code> to join
            words.
          </p>
          <p>
            Test a tile's shape with <code>tile-type == triangle</code> (any shape name), or its orientation
            with <code>rotation</code>. Attributes that might not exist for a tile (a specific step, an
            out-of-range coordinate) need a <code>default</code>, e.g. <code>step[3] default 0</code>.
          </p>
          <p>
            Read a <strong>neighbour</strong> with a <code>.</code>-path — <code>visited.e1</code>,{' '}
            <code>[A.e0]</code>, <code>tile-type.e2</code> (absolute <code>eN</code> / <code>.tN</code> hops).
            Compare two tile references by identity with <code>e0 == e3</code> (in a traverser guard,{' '}
            <code>target</code> and relative refs work too). A <strong>list</strong> <code>[…]</code> reduces
            several values to one: <code>[A, B]</code> (sum),{' '}
            <code>[A, B, C]:max</code>, or test each with <code>:all</code> / <code>:any</code> /{' '}
            <code>:none</code> / <code>:xor</code>, e.g. <code>[visited.e1, visited.e2]:any == 0</code>.
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
                  <PredicateEditor
                    key={p.id}
                    predicate={p}
                    nameError={nameError(p)}
                    predicateNames={predicateNames ?? EMPTY_NAMES}
                    onSetText={store.setText}
                    onRename={store.rename}
                  />
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
  nameError,
  predicateNames,
  onSetText,
  onRename,
}: {
  predicate: StoredPredicate
  nameError: string | null
  predicateNames: ReadonlyMap<string, string>
  onSetText: (id: string, text: string) => void
  onRename: (id: string, name: string) => void
}) {
  const [mode, setMode] = useState<'text' | 'visual'>('text')
  const result = useMemo(() => parsePredicate(predicate.text), [predicate.text])
  // A predicate can reference another by name (`isCrowded and Has_A`) — resolve it too, so an
  // unknown/cyclic reference shows up here rather than only later, in whatever coloring rule or
  // traverser guard ends up using it.
  const refError = useMemo(() => {
    if (!result.ok) return null
    const r = resolvePredRefs(result.value, predicateNames)
    return r.ok ? null : r.error.message
  }, [result, predicateNames])
  // Ctrl+Space suggestions: tile attributes + referenceable predicate names.
  const completions = useMemo(() => buildDslCompletions({ predicateNames }), [predicateNames])

  return (
    <div className="pred-editor">
      <label className="pred-field">
        <span className="pred-field-label">Name</span>
        <input
          className={`pred-name-input${nameError ? ' is-error' : ''}`}
          value={predicate.name}
          onChange={(e) => onRename(predicate.id, e.target.value)}
          aria-label="predicate name"
        />
      </label>
      {nameError && (
        <p className="pred-status pred-status--err" role="alert">
          {nameError}
        </p>
      )}

      <div className="pred-mode">
        <SegmentedControl
          ariaLabel="editor mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'visual', label: 'Visual' },
          ]}
        />
      </div>

      {mode === 'text' ? (
        <>
          <label className="pred-field">
            <span className="pred-field-label">DSL</span>
            <DslTextarea
              className="pred-text"
              value={predicate.text}
              spellCheck={false}
              rows={3}
              aria-label="predicate DSL"
              completions={completions}
              onValueChange={(t) => onSetText(predicate.id, t)}
            />
          </label>
          <p className="dsl-hint">
            <kbd>Ctrl</kbd>+<kbd>Space</kbd> — suggest attributes &amp; predicates
          </p>
        </>
      ) : (
        <PredicateVisualEditor text={predicate.text} onChange={(t) => onSetText(predicate.id, t)} />
      )}

      {!result.ok ? (
        <p className="pred-status pred-status--err" role="alert">
          {result.error.message}
        </p>
      ) : refError ? (
        <p className="pred-status pred-status--err" role="alert">
          {refError}
        </p>
      ) : (
        <p className="pred-status pred-status--ok">✓ {serialize(result.value)}</p>
      )}
    </div>
  )
}
