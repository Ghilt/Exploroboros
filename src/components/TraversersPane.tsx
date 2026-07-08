import './PredicatePane.css'
import './TraversersPane.css'
import { useMemo, useState } from 'react'
import { compileProgram } from '../traverse'
import { reservedNameError } from '../dsl'
import type { TraverserStore, StoredTraverser } from '../state/traverserStore'
import { PROTOTYPE_PORTS } from '../data/prototypePorts'
import { HelpButton } from './HelpButton'
import { TrashButton } from './TrashButton'
import { DslTextarea } from './DslTextarea'
import { buildDslCompletions, TRAVERSER_STARTERS } from './dslCompletions'

// The Traversers pane: a library of walker DEFINITIONS, each a DSL program describing how a walker
// moves and writes registries each tick. The pane has two modes: a LIST of definitions, and a
// full-pane EDITOR (opened by clicking a row or "+ New") that maximises editing space, with a "Done"
// button at the bottom to return to the list. Edits autosave. Reuses the predicate pane's styles.
export function TraversersPane({
  store,
  predicateNames,
  onOpenPredicates,
}: {
  store: TraverserStore
  // name -> DSL text, so a guard can reference a saved predicate by name (resolved at compile).
  predicateNames: ReadonlyMap<string, string>
  // Opens the shared Custom-predicates dialog (the badge at the pane foot). Optional so tests can omit it.
  onOpenPredicates?: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId ? store.traversers.find((t) => t.id === editingId) ?? null : null

  // Compile every definition (memoized) so the list can flag the ones that don't compile with a red badge.
  const compileError = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const t of store.traversers) {
      const c = compileProgram(t.text, predicateNames)
      m.set(t.id, c.ok ? null : c.error.message)
    }
    return m
  }, [store.traversers, predicateNames])

  // Predicate names (bundled + custom) a traverser name must not collide with (case-insensitive).
  const predNamesLower = useMemo(
    () => new Set([...predicateNames.keys()].map((k) => k.toLowerCase())),
    [predicateNames],
  )
  // A name is invalid if it's a reserved DSL word / reference pattern, or already used by a predicate or
  // another traverser — names are referenced across the DSLs (a guard by name, a seed by `t1`/name), so
  // they must be unique and free of grammar words.
  const nameError = (t: StoredTraverser): string | null => {
    const reserved = reservedNameError(t.name)
    if (reserved) return reserved
    const n = t.name.trim().toLowerCase()
    if (!n) return null
    if (predNamesLower.has(n)) return `"${t.name.trim()}" is already used by a predicate — names must be unique`
    if (store.traversers.some((o) => o.id !== t.id && o.name.trim().toLowerCase() === n)) {
      return `"${t.name.trim()}" is already used by another traverser`
    }
    return null
  }

  // ---- editor mode: the editor consumes the whole pane ----
  if (editing) {
    return (
      <div className="predicate-pane trav-pane trav-pane--editing">
        <TraverserEditor
          key={editing.id}
          traverser={editing}
          predicateNames={predicateNames}
          nameError={nameError(editing)}
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
            <code>move l2</code> (stronger left), <code>move e3</code> (the numbered edge), or{' '}
            <code>move nearest-unvisited</code> (step to the closest-by-heading unvisited neighbour — the
            built-in walker). <code>move [r1, l1]</code> splits (capped by <code>max-split</code>); a range{' '}
            <code>move [e1..e3]</code> splits over every edge between; <code>move straight -&gt; r1</code> hops
            twice in one tick.
          </p>
          <p>
            <strong>Registries:</strong> <code>put [A] = [A] + 1</code>, <code>increase P</code>. A/B/C live on
            the tile (always in brackets — <code>[A]</code>, or <code>[A, B]</code> to sum when reading); P/Q/R
            travel with the walker (bare). Read or write another tile with a <code>@</code>-path:{' '}
            <code>if visited@r1 &gt; 0 then put [B@e1] = 1</code>. Write several at once with{' '}
            <code>put [A, B] = …</code>. Reference a saved predicate by name. Also:{' '}
            <code>morph &lt;name&gt; …</code>, <code>update max-split 2</code>, and{' '}
            <code>directive if &lt;predicate&gt; always forbid move</code> / <code>reset directives</code>{' '}
            (forbid gates; allow is an exception over a forbid).
          </p>
          <p>
            <strong>Lists</strong> — <code>[…]</code> in a condition reduces its items to one value:{' '}
            <code>[A, B]</code> (sum, the default), <code>:avg</code> / <code>:min</code> / <code>:max</code>, or
            apply the comparison to each with <code>:all</code> / <code>:any</code> / <code>:none</code> /{' '}
            <code>:xor</code> — <code>if [visited@e1, visited@e2]:xor == 1 then …</code>.
          </p>
          <p>
            Each tick reads the board <strong>as it was at the start of the tick</strong> (a walker doesn’t
            see its own or others’ writes until next tick). If two walkers share a tile in one tick,{' '}
            <code>increase</code> from both <strong>adds up</strong>; a <code>put</code> is{' '}
            <strong>last-writer-wins</strong> — so prefer <code>increase</code> when several walkers may meet.
          </p>
          <p>
            <strong>Seeding:</strong> place walkers on the canvas by hand, or seed them by a
            grid-relative rule in the <strong>Initial state</strong> pane (which can also preset tile
            registries and <code>visited</code>). There a traverser is named by its number below —{' '}
            <code>t1</code>, <code>t2</code>, … — or by name.
          </p>
          <p className="help-readmore">
            <a href="#/guide" target="_blank" rel="noopener noreferrer">
              Read the full guide →{' '}
            </a>
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
            {store.traversers.map((t, i) => {
              const problem = compileError.get(t.id) || nameError(t)
              return (
                <li key={t.id}>
                  <div className="pred-row">
                    <button type="button" className="pred-name" onClick={() => setEditingId(t.id)}>
                      <span className="trav-ord" title={`reference as t${i + 1} or by name in the Initial state pane`}>
                        {i + 1}:
                      </span>{' '}
                      {t.name || '(unnamed)'}
                    </button>
                    {problem && (
                      <span className="pred-badge-err" title={problem}>
                        {compileError.get(t.id) ? 'error' : 'name'}
                      </span>
                    )}
                    <TrashButton label={`delete ${t.name || 'traverser'}`} onClick={() => remove(t.id)} />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="pane-hint">No traversers yet. The built-in “Walker” is always available to place.</p>
        )}
      </section>

      <div className="trav-foot">
        {onOpenPredicates && (
          <button type="button" className="preds-badge" onClick={onOpenPredicates}>
            Custom predicates
          </button>
        )}
        {/* Debug: add hardcoded traverser definitions ported from the prototype (currently just gasket). */}
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
  nameError,
  onSetText,
  onRename,
  onDone,
}: {
  traverser: StoredTraverser
  predicateNames: ReadonlyMap<string, string>
  nameError: string | null
  onSetText: (id: string, text: string) => void
  onRename: (id: string, name: string) => void
  onDone: () => void
}) {
  const result = useMemo(() => compileProgram(traverser.text, predicateNames), [traverser.text, predicateNames])
  const [showSyntax, setShowSyntax] = useState(false)
  // Ctrl+Space suggestions: tile attributes, the walker's own attributes (a traverser IS a walker here),
  // and every referenceable predicate name.
  const completions = useMemo(() => buildDslCompletions({ predicateNames, includeTraverser: true }), [predicateNames])

  return (
    <div className="trav-edit">
      <div className="trav-edit-scroll">
      <label className="pred-field trav-edit-name">
        <span className="pred-field-label">Name</span>
        <input
          className={`pred-name-input${nameError ? ' is-error' : ''}`}
          value={traverser.name}
          onChange={(e) => onRename(traverser.id, e.target.value)}
          aria-label="traverser name"
        />
      </label>
      {nameError && (
        <p className="pred-status pred-status--err" role="alert">
          {nameError}
        </p>
      )}

      <DslTextarea
        className="pred-text trav-edit-text"
        value={traverser.text}
        spellCheck={false}
        aria-label="traverser DSL"
        completions={completions}
        starters={TRAVERSER_STARTERS}
        onValueChange={(t) => onSetText(traverser.id, t)}
      />
      <p className="dsl-hint">
        <kbd>Ctrl</kbd>+<kbd>Space</kbd> — suggest attributes &amp; predicates
      </p>

      {result.ok ? (
        <p className="pred-status pred-status--ok">✓ {result.value.statements.length} rule(s)</p>
      ) : (
        <p className="pred-status pred-status--err" role="alert">
          {result.error.message}
        </p>
      )}

      {/* A collapsible grammar reference, mirroring the Initial-state pane, plus a "?" leading to the
          full guide — so the syntax is at hand while editing without leaving the maximised editor. */}
      <section className="pred-section trav-syntax">
        <header className="pred-section-head">
          <span className="trav-syntax-title">
            Syntax
            <HelpButton title="Traverser rules">
              <p>
                A traverser definition is a little program, run <strong>top-to-bottom every tick</strong>:{' '}
                <code>if &lt;predicate&gt; then &lt;action&gt;</code> lines (or an{' '}
                <code>if &lt;predicate&gt; {'{ … }'}</code> block) that move the walker and write registries
                (a bare action always fires). <code>find-tile</code> searches the plane for a tile.
              </p>
              <p className="help-readmore">
                <a href="#/guide" target="_blank" rel="noopener noreferrer">
                  Read the full guide →{' '}
                </a>
                <span className="help-readmore-note">(every keyword, with diagrams)</span>
              </p>
            </HelpButton>
          </span>
          <button type="button" className="pred-add" onClick={() => setShowSyntax((v) => !v)}>
            {showSyntax ? 'Hide' : 'Show'}
          </button>
        </header>
        {showSyntax && (
          <div className="trav-syntax-body">
            <pre className="trav-syntax-code">{`if <predicate> then <action>     run top-to-bottom each tick
if <predicate> { … } else { … }  a block (else optional; else if chains)
<action>                         a bare action always fires

move straight | r1 | l2 | e3 | nearest-unvisited
move [r1, l1]                    split — capped by max-split
move e0@e4                       two hops in one tick (@ chains)
put A = A + 1                    write a tile registry (A/B/C, bare)
increase P                       bump a walker register (P/Q/R)
directive if <predicate> always forbid move

find-tile <predicate> {          search outward for a tile → f0
  max-split = 4                  fan width (default 1 = single path)
  move [e0, e1, e2, e3]          ghost moves spread the search
}
move f0                          then step to the tile it found

find-lowest-tile visited == 0    lowest-numbered match, whole plane → f1
find-highest-tile [A] > 0        highest-numbered match → f2`}</pre>
            <ul className="trav-syntax-legend">
              <li>
                <strong>predicate</strong> — a tile test (<code>visited-neighbors == 1</code>), a saved
                predicate by name, or a mix with <code>and</code>/<code>or</code>/<code>not</code>. Read a
                neighbour with an <code>@</code>-path: <code>visited@r1</code>.
              </li>
              <li>
                <strong>edges</strong> — <code>straight</code>, <code>r1</code>/<code>l1</code> (turn),{' '}
                <code>e3</code> (numbered edge), <code>nearest-unvisited</code>. Chain hops with{' '}
                <code>@</code>: <code>e0@e4</code>.
              </li>
              <li>
                <strong>registries</strong> — <code>A</code>/<code>B</code>/<code>C</code> sit on the tile
                (bracket a list: <code>[A, B]</code>); <code>P</code>/<code>Q</code>/<code>R</code> travel
                with the walker.
              </li>
              <li>
                <strong>find-tile</strong> — a breadth-first search; its <code>move</code> lines spread it
                tile to tile (capped by <code>max-split</code>, default 1 = a single path — raise it to fan
                out), and the first tile matching the predicate becomes <code>f0</code> (then <code>f1</code>
                …). Use it as a move target or read it: <code>tile-type@f0</code>. Test whether it found
                anything with <code>exists@f0</code> — a plain read (e.g. <code>visited@f0</code>) can't tell
                "not found" from "found, value 0".
              </li>
              <li>
                <strong>find-lowest-tile</strong> / <strong>find-highest-tile</strong> — no braces: they scan
                the WHOLE plane for the lowest- (or highest-) <em>numbered</em> matching tile → <code>fN</code>.
                The number follows the board numbering (canvas settings), so with <strong>spiral</strong>{' '}
                “lowest” is the nearest the centre. The condition reads only the tile itself + absolute{' '}
                <code>@e</code>-paths (no walker heading / <code>@target</code>).
              </li>
              <li>
                <strong>header</strong> (top, any order) — <code>max-split</code>, <code>heading</code>{' '}
                (edge number), <code>movement = relative|absolute</code>, <code>max-steps</code>.
              </li>
            </ul>
          </div>
        )}
      </section>
      </div>

      <div className="trav-edit-foot">
        <button type="button" className="trav-done" onClick={onDone}>
          ‹ Done
        </button>
      </div>
    </div>
  )
}
