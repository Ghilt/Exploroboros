import './ColoringPane.css'
import '../components/PredicatePane.css'
import { useMemo } from 'react'
import { parsePredicate, resolvePredRefs } from '../dsl'
import type { ColoringRule } from '../colorizer'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'
import type { ColoringStore } from '../state/coloringStore'
import { ReorderableList, type DragHandleProps } from './ReorderableList'
import { ColorField } from './ColorField'
import { TrashButton } from './TrashButton'
import { EyeButton } from './EyeButton'
import { DuplicateButton } from './DuplicateButton'
import { HelpButton } from './HelpButton'
import { DslInput } from './DslTextarea'
import { buildDslCompletions, type DslCompletion } from './dslCompletions'

const INLINE = '__inline__'
const EMPTY_NAMES: ReadonlyMap<string, string> = new Map()

type PredOption = { id: string; name: string; text: string }

// Parse then inline any named-predicate references (`isCrowded and Has_A`) — the one check that
// covers every way a predicate's text can fail: a syntax error, or a reference to an unknown/cyclic name.
function checkPredicateText(text: string, predicateNames: ReadonlyMap<string, string>): string | null {
  const r = parsePredicate(text)
  if (!r.ok) return r.error.message
  const resolved = resolvePredRefs(r.value, predicateNames)
  return resolved.ok ? null : resolved.error.message
}

// Why a rule's chosen predicate currently matches nothing (so the row can flag it instead of just
// silently colouring nothing): the referenced predicate was deleted, or it (or something it references)
// doesn't compile.
function refProblem(id: string, customPredicates: ReadonlyArray<PredOption>, predicateNames: ReadonlyMap<string, string>): string | null {
  if (BUNDLED_PREDICATES.some((b) => b.id === id)) return null
  const custom = customPredicates.find((p) => p.id === id)
  if (!custom) return 'this predicate no longer exists — pick another'
  const problem = checkPredicateText(custom.text, predicateNames)
  return problem ? `"${custom.name || '(unnamed)'}" doesn't compile: ${problem}` : null
}

// The Coloring pane: an ordered, drag-reorderable list of rules. Each rule paints the tiles its
// predicate matches with a colour (flat, or a ramp over an attribute). Rules read top→bottom; the
// last match sets the colour, but a translucent colour blends over the rules above it.
export function ColoringPane({
  store,
  customPredicates,
  predicateNames,
  onOpenPredicates,
}: {
  store: ColoringStore
  customPredicates: ReadonlyArray<PredOption>
  // Predicate NAME -> DSL text, so an inline predicate can reference another by name (`isCrowded and
  // Has_A`) — same map the traverser guards resolve against. Defaults to empty so tests can omit it.
  predicateNames?: ReadonlyMap<string, string>
  // Opens the shared Custom-predicates dialog (the badge at the pane foot). Optional so tests can omit it.
  onOpenPredicates?: () => void
}) {
  const names = predicateNames ?? EMPTY_NAMES
  // Ctrl+Space suggestions for an inline predicate: tile attributes + referenceable predicate names.
  const completions = useMemo(() => buildDslCompletions({ predicateNames: names }), [names])
  return (
    <div className="coloring-pane">
      <span className="pane-help">
        <HelpButton title="Coloring rules">
          <p>
            A coloring rule is a <strong>predicate</strong> (which tiles) plus a <strong>colour</strong>. Drag
            to reorder; rules apply top→bottom and the last matching rule sets a tile's colour.
          </p>
          <p>
            Pick a saved predicate from the dropdown, or choose <strong>Inline…</strong> to type your own —
            inline text can also reference a saved predicate <strong>by name</strong>, combined with{' '}
            <code>and</code> / <code>or</code> / <code>not</code>: <code>Has_A and Has_C</code>. Names have no
            spaces (use <code>_</code>). A red <strong>error</strong> badge appears next to a rule whose
            predicate doesn't compile — hover it for why.
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
        <>
          <p className="pane-hint">No rules yet — add one, or generate a ready-made palette to start coloring.</p>
          <button type="button" className="rule-add" onClick={store.addRandomColoring}>
            Generate a random coloring
          </button>
        </>
      ) : (
        <ReorderableList
          items={store.rules}
          onReorder={store.reorder}
          renderItem={(rule, handle) => (
            <ColoringRuleRow
              rule={rule}
              customPredicates={customPredicates}
              predicateNames={names}
              completions={completions}
              handle={handle}
              onChange={(next) => store.replace(rule.id, next)}
              onDuplicate={() => store.duplicate(rule.id)}
              onRemove={() => store.remove(rule.id)}
            />
          )}
        />
      )}

      <button type="button" className="rule-add" data-tut="add-coloring-rule" onClick={store.add}>
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
  predicateNames,
  completions,
  handle,
  onChange,
  onDuplicate,
  onRemove,
}: {
  rule: ColoringRule
  customPredicates: ReadonlyArray<PredOption>
  predicateNames: ReadonlyMap<string, string>
  completions: DslCompletion[]
  handle: DragHandleProps
  onChange: (next: ColoringRule) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const predValue = rule.predicate.kind === 'ref' ? rule.predicate.id : INLINE
  const inlineText = rule.predicate.kind === 'inline' ? rule.predicate.text : ''
  const inlineError = rule.predicate.kind === 'inline' ? checkPredicateText(inlineText, predicateNames) : null
  const problem = inlineError ?? (rule.predicate.kind === 'ref' ? refProblem(rule.predicate.id, customPredicates, predicateNames) : null)
  // A ref to a predicate that's since been deleted has no matching <option> — without one the <select>
  // silently shows the first option instead, masking exactly the broken state `problem` just flagged.
  const refId = rule.predicate.kind === 'ref' ? rule.predicate.id : null
  const isDangling =
    refId !== null && !BUNDLED_PREDICATES.some((b) => b.id === refId) && !customPredicates.some((p) => p.id === refId)

  const selectPredicate = (v: string) => {
    if (v === INLINE) {
      onChange({ ...rule, predicate: { kind: 'inline', text: inlineText || 'visited > 0' } })
    } else {
      onChange({ ...rule, predicate: { kind: 'ref', id: v } })
    }
  }
  // Absent = enabled, so old rules keep colouring; the eye toggle sets it false to switch off.
  const enabled = rule.enabled !== false

  return (
    <div className={`rule-row${enabled ? '' : ' is-disabled'}`}>
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
        {problem && (
          <span className="pred-badge-err" title={problem}>
            error
          </span>
        )}
        <EyeButton
          on={enabled}
          onToggle={() => onChange({ ...rule, enabled: !enabled })}
          label={enabled ? 'switch this rule off' : 'switch this rule on'}
        />
        <DuplicateButton label="duplicate rule" onClick={onDuplicate} />
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
            {isDangling && <option value={refId ?? ''}>(deleted predicate)</option>}
            <option value={INLINE}>Inline…</option>
          </select>
        </div>

        {rule.predicate.kind === 'inline' && (
          <>
            <DslInput
              className={`rule-inline${inlineError ? ' is-error' : ''}`}
              value={inlineText}
              spellCheck={false}
              aria-label="inline predicate"
              completions={completions}
              onValueChange={(t) => onChange({ ...rule, predicate: { kind: 'inline', text: t } })}
            />
            {inlineError && (
              <p className="pred-status pred-status--err" role="alert">
                {inlineError}
              </p>
            )}
          </>
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
