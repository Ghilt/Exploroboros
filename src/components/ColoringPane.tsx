import './ColoringPane.css'
import { parsePredicate } from '../dsl'
import type { ColoringRule } from '../colorizer'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'
import type { ColoringStore } from '../state/coloringStore'
import { ReorderableList, type DragHandleProps } from './ReorderableList'
import { ColorField } from './ColorField'
import { TrashButton } from './TrashButton'
import { HelpButton } from './HelpButton'

const INLINE = '__inline__'

type PredOption = { id: string; name: string }

// The Coloring pane: an ordered, drag-reorderable list of rules. Each rule paints the tiles its
// predicate matches with a colour (flat, or a ramp over an attribute). Rules read top→bottom; the
// last match sets the colour, but a translucent colour blends over the rules above it.
export function ColoringPane({
  store,
  customPredicates,
  onOpenPredicates,
}: {
  store: ColoringStore
  customPredicates: ReadonlyArray<PredOption>
  // Opens the shared Custom-predicates dialog (the badge at the pane foot). Optional so tests can omit it.
  onOpenPredicates?: () => void
}) {
  return (
    <div className="coloring-pane">
      <span className="pane-help">
        <HelpButton title="Coloring rules">
          <p>
            A coloring rule is a <strong>predicate</strong> (which tiles) plus a <strong>colour</strong>. Drag
            to reorder; rules apply top→bottom and the last matching rule sets a tile's colour.
          </p>
          <p>
            Give a rule a <strong>see-through colour</strong> (lower its opacity) to blend it over the rules
            above instead of replacing them — that's how you mix.
          </p>
          <p>
            A <strong>ramp</strong> fades across up to five colours, driven by a tile attribute. Apply{' '}
            <strong>modulo</strong> to wrap that attribute into a repeating cycle — e.g. visit count{' '}
            <code>mod 6</code> cycles the colours every six visits.
          </p>
        </HelpButton>
      </span>
      <p className="pane-lead">Each rule paints the tiles its predicate matches.</p>

      {!store.persistOk && (
        <p className="pane-warn">Couldn’t save to this browser — changes last only for this session.</p>
      )}

      {store.rules.length === 0 ? (
        <p className="pane-hint">No rules yet — add one to start coloring the tiling.</p>
      ) : (
        <ReorderableList
          items={store.rules}
          onReorder={store.reorder}
          renderItem={(rule, handle) => (
            <ColoringRuleRow
              rule={rule}
              customPredicates={customPredicates}
              handle={handle}
              onChange={(next) => store.replace(rule.id, next)}
              onRemove={() => store.remove(rule.id)}
            />
          )}
        />
      )}

      <button type="button" className="rule-add" onClick={store.add}>
        + Add rule
      </button>

      {onOpenPredicates && (
        <div className="coloring-foot">
          <button type="button" className="preds-badge" onClick={onOpenPredicates}>
            Custom predicates
          </button>
        </div>
      )}
    </div>
  )
}

function ColoringRuleRow({
  rule,
  customPredicates,
  handle,
  onChange,
  onRemove,
}: {
  rule: ColoringRule
  customPredicates: ReadonlyArray<PredOption>
  handle: DragHandleProps
  onChange: (next: ColoringRule) => void
  onRemove: () => void
}) {
  const predValue = rule.predicate.kind === 'ref' ? rule.predicate.id : INLINE
  const inlineText = rule.predicate.kind === 'inline' ? rule.predicate.text : ''
  const inlineError = rule.predicate.kind === 'inline' && !parsePredicate(inlineText).ok

  const selectPredicate = (v: string) => {
    if (v === INLINE) {
      onChange({ ...rule, predicate: { kind: 'inline', text: inlineText || 'visited > 0' } })
    } else {
      onChange({ ...rule, predicate: { kind: 'ref', id: v } })
    }
  }

  return (
    <div className="rule-row">
      <div className="rule-top">
        <button
          type="button"
          className="reorder-handle rule-grip"
          aria-label="reorder rule"
          onPointerDown={handle.onPointerDown}
          onPointerMove={handle.onPointerMove}
          onPointerUp={handle.onPointerUp}
        >
          ⋯
        </button>
        <TrashButton label="delete rule" onClick={onRemove} />
      </div>

      <div className="rule-sentence">
        <div className="rule-line">
          <span className="rule-word">if</span>
          <select
            className="rule-pred-select"
            value={predValue}
            aria-label="rule predicate"
            onChange={(e) => selectPredicate(e.target.value)}
          >
            <optgroup label="Bundled">
              {BUNDLED_PREDICATES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
            {customPredicates.length > 0 && (
              <optgroup label="Custom">
                {customPredicates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || '(unnamed)'}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={INLINE}>Inline…</option>
          </select>
        </div>

        {rule.predicate.kind === 'inline' && (
          <input
            className={`rule-inline${inlineError ? ' is-error' : ''}`}
            value={inlineText}
            spellCheck={false}
            aria-label="inline predicate"
            onChange={(e) => onChange({ ...rule, predicate: { kind: 'inline', text: e.target.value } })}
          />
        )}

        <ColorField
          color={rule.color}
          opacity={rule.opacity}
          onColor={(c) => onChange({ ...rule, color: c })}
          onOpacity={(o) => onChange({ ...rule, opacity: o })}
        />
      </div>
    </div>
  )
}
