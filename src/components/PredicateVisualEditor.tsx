import './PredicateVisualEditor.css'
import { useMemo, useState, type ReactNode } from 'react'
import {
  TILE_ATTRIBUTES,
  attrSpec,
  parsePredicate,
  replaceAt,
  serialize,
  serializePath,
  type ArithOp,
  type AttrName,
  type AttrRef,
  type CompareOp,
  type Expr,
  type Path,
  type Pred,
} from '../dsl'
import { ChipPopover, type ChipOption } from './ChipPopover'

// Operators offered per position, each with a keyboard accelerator (open the chip, press the key).
const ARITH_OPS: ChipOption[] = [
  { id: '+', label: 'add', accel: '+' },
  { id: '-', label: 'subtract', accel: '-' },
  { id: '*', label: 'multiply', accel: '*' },
  { id: '/', label: 'divide', accel: '/' },
  { id: '%', label: 'modulo', accel: '%' },
]
const COMPARE_OPS: ChipOption[] = [
  { id: '==', label: 'equals', accel: '=' },
  { id: '!=', label: 'not equal', accel: '!' },
  { id: '<', label: 'less than', accel: '<' },
  { id: '<=', label: 'at most' },
  { id: '>', label: 'greater than', accel: '>' },
  { id: '>=', label: 'at least' },
]
const BOOL_OPS: ChipOption[] = [
  { id: 'and', label: 'and', accel: 'a' },
  { id: 'or', label: 'or', accel: 'o' },
]
const SHAPE_OPS: ChipOption[] = [
  { id: '==', label: 'is', accel: '=' },
  { id: '!=', label: 'is not', accel: '!' },
]
const ATTR_OPTIONS: ChipOption[] = TILE_ATTRIBUTES.map((a) => ({ id: a.name, label: a.label }))

const OP_SYMBOL: Record<string, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '%': '%',
  '==': '=',
  '!=': '≠',
  '<': '<',
  '<=': '≤',
  '>': '>',
  '>=': '≥',
  and: 'and',
  or: 'or',
}
const SHAPE_SYMBOL: Record<string, string> = { '==': 'is', '!=': 'is not' }

// Swap an attribute for another, keeping a sensible index/default — and the @-path (which tile it reads).
function swapAttr(attr: AttrRef, name: AttrName): AttrRef {
  const spec = attrSpec(name)
  const next: AttrRef = { kind: 'attr', name, scope: attr.scope }
  if (spec?.indexed) next.index = attr.index ?? 0
  if (spec?.needsDefault) next.fallback = attr.fallback ?? 0
  if (attr.path) next.path = attr.path
  return next
}

// Renders a predicate as a row of clickable chips over its AST. Click an operator → a dropdown of
// operators (with keyboard accelerators); click an attribute → swap it; click a number/shape →
// edit it inline. Every edit re-serializes and is pushed up as text, so the text and visual editors
// stay in sync. Building/grouping structure is done in Text mode for now (they share the same DSL).
export function PredicateVisualEditor({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const parsed = useMemo(() => parsePredicate(text), [text])
  const [openId, setOpenId] = useState<string | null>(null)

  if (!parsed.ok) {
    return (
      <p className="pv-invalid">
        This predicate has a syntax error — switch to <strong>Text</strong> to fix it.
      </p>
    )
  }

  const ast = parsed.value
  const apply = (path: Path, node: Pred | Expr) => {
    setOpenId(null)
    onChange(serialize(replaceAt(ast, path, node)))
  }

  const opChip = (id: string, symbol: string, options: ChipOption[], onSelect: (op: string) => void): ReactNode => {
    const open = openId === id
    return (
      <span className="pv-chip-wrap">
        <button
          type="button"
          className="pv-op"
          aria-haspopup="listbox"
          aria-expanded={open}
          title="change operator"
          onClick={() => setOpenId(open ? null : id)}
        >
          {symbol}
        </button>
        {open && <ChipPopover options={options} onSelect={onSelect} onClose={() => setOpenId(null)} />}
      </span>
    )
  }

  const attrChip = (path: Path, attr: AttrRef): ReactNode => {
    const id = `${path.join('/')}:attr`
    const open = openId === id
    const spec = attrSpec(attr.name)
    return (
      <span className="pv-attr">
        <span className="pv-chip-wrap">
          <button
            type="button"
            className="pv-name"
            aria-haspopup="listbox"
            aria-expanded={open}
            title="change attribute"
            onClick={() => setOpenId(open ? null : id)}
          >
            {spec?.label ?? attr.name}
          </button>
          {open && (
            <ChipPopover
              options={ATTR_OPTIONS}
              onSelect={(name) => apply(path, swapAttr(attr, name as AttrName))}
              onClose={() => setOpenId(null)}
            />
          )}
        </span>
        {attr.index !== undefined && (
          <NumberChip
            value={attr.index}
            ariaLabel="attribute index"
            bracket
            onCommit={(n) => apply(path, { ...attr, index: Math.max(0, Math.round(n)) })}
          />
        )}
        {attr.path && (
          <span className="pv-static pv-path" title="edit paths in Text mode">
            {serializePath(attr.path)}
          </span>
        )}
        {attr.fallback !== undefined && (
          <span className="pv-default">
            default
            <NumberChip value={attr.fallback} ariaLabel="default value" onCommit={(n) => apply(path, { ...attr, fallback: n })} />
          </span>
        )}
      </span>
    )
  }

  const renderExpr = (e: Expr, path: Path): ReactNode => {
    switch (e.kind) {
      case 'number':
        return <NumberChip value={e.value} ariaLabel="number" onCommit={(n) => apply(path, { kind: 'number', value: n })} />
      case 'attr':
        return attrChip(path, e)
      case 'reg':
        // A registry read [A] / [A, B] (+ optional @path). Shown as a static chip; edit it in Text mode.
        return <span className="pv-static pv-reg">[{e.regs.map((r) => r.toUpperCase()).join(', ')}]{serializePath(e.path)}</span>

      case 'neg':
        return (
          <span className="pv-frag">
            <span className="pv-static">−</span>
            {renderExpr(e.operand, [...path, 'operand'])}
          </span>
        )
      case 'bin':
        return (
          <span className="pv-frag">
            {renderExpr(e.left, [...path, 'left'])}
            {opChip(`${path.join('/')}:op`, OP_SYMBOL[e.op] ?? e.op, ARITH_OPS, (v) => apply(path, { ...e, op: v as ArithOp }))}
            {renderExpr(e.right, [...path, 'right'])}
          </span>
        )
      case 'group':
        return (
          <span className="pv-frag">
            <span className="pv-paren">(</span>
            {renderExpr(e.inner, [...path, 'inner'])}
            <span className="pv-paren">)</span>
          </span>
        )
    }
  }

  const renderPred = (p: Pred, path: Path): ReactNode => {
    switch (p.kind) {
      case 'compare':
        return (
          <span className="pv-frag">
            {renderExpr(p.left, [...path, 'left'])}
            {opChip(`${path.join('/')}:op`, OP_SYMBOL[p.op] ?? p.op, COMPARE_OPS, (v) =>
              apply(path, { ...p, op: v as CompareOp }),
            )}
            {renderExpr(p.right, [...path, 'right'])}
          </span>
        )
      case 'shape':
        return (
          <span className="pv-frag">
            <span className="pv-static">tile-type{serializePath(p.path)}</span>
            {opChip(`${path.join('/')}:op`, SHAPE_SYMBOL[p.op] ?? p.op, SHAPE_OPS, (v) =>
              apply(path, { ...p, op: v as '==' | '!=' }),
            )}
            <TextChip value={p.shape} ariaLabel="shape name" onCommit={(s) => apply(path, { ...p, shape: s })} />
          </span>
        )
      case 'not':
        return (
          <span className="pv-frag">
            <span className="pv-static">not</span>
            {renderPred(p.operand, [...path, 'operand'])}
          </span>
        )
      case 'bool':
        return (
          <span className="pv-frag">
            {renderPred(p.left, [...path, 'left'])}
            {opChip(`${path.join('/')}:op`, OP_SYMBOL[p.op] ?? p.op, BOOL_OPS, (v) => apply(path, { ...p, op: v as 'and' | 'or' }))}
            {renderPred(p.right, [...path, 'right'])}
          </span>
        )
      case 'pgroup':
        return (
          <span className="pv-frag">
            <span className="pv-paren">(</span>
            {renderPred(p.inner, [...path, 'inner'])}
            <span className="pv-paren">)</span>
          </span>
        )
    }
  }

  return (
    <div className="pv-editor" role="group" aria-label="visual predicate editor">
      {renderPred(ast, [])}
    </div>
  )
}

// Inline-editable numeric chip: click to type a value, commit on blur/Enter, cancel on Escape.
function NumberChip({
  value,
  onCommit,
  ariaLabel,
  bracket,
}: {
  value: number
  onCommit: (n: number) => void
  ariaLabel: string
  bracket?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  if (editing) {
    const commit = () => {
      const n = Number(draft)
      if (!Number.isNaN(n)) onCommit(n)
      setEditing(false)
    }
    return (
      <input
        className="pv-num-input"
        type="number"
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') {
            setDraft(String(value))
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className="pv-num"
      aria-label={ariaLabel}
      onClick={() => {
        setDraft(String(value))
        setEditing(true)
      }}
    >
      {bracket ? `[${value}]` : value}
    </button>
  )
}

// Inline-editable text chip (the shape name in a tile-type test).
function TextChip({ value, onCommit, ariaLabel }: { value: string; onCommit: (s: string) => void; ariaLabel: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (editing) {
    const commit = () => {
      const v = draft.trim()
      if (v) onCommit(v)
      setEditing(false)
    }
    return (
      <input
        className="pv-text-input"
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <button
      type="button"
      className="pv-value"
      aria-label={ariaLabel}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
    >
      {value}
    </button>
  )
}
