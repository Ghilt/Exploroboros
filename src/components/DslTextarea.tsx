import './DslTextarea.css'
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import type { DslCompletion } from './dslCompletions'
import { caretCoordinates } from './caretCoords'

// The DSL editors' Ctrl+Space autocomplete. Two drop-in fields share it: <DslTextarea> (traverser /
// initial-state / predicate editors) and <DslInput> (the coloring inline predicate). Press Ctrl+Space to
// suggest what fits at the cursor; the list narrows as you type and inserts at the caret. The popup is a
// portal so it sits at the caret without disturbing the host's (tight flex) layout.
//
// Context: when `starters` is given (statement-based DSLs), a cursor at the START of a line offers those
// line-starting keywords; anywhere else offers `completions` (the predicate/expression tokens). Fields
// that are purely a predicate (coloring inline, the predicate editor) pass no `starters`, so they always
// offer `completions`. Lists are assembled by buildDslCompletions / the *_STARTERS in ./dslCompletions.

// Identifier characters — the "current word" the cursor sits in (what we filter + replace on accept).
const WORD = /[A-Za-z0-9_-]/

type Menu = { items: DslCompletion[]; active: number; top: number; left: number }

type Field = HTMLTextAreaElement | HTMLInputElement

// Rank a candidate against the typed prefix: exact-prefix first, then substring, then the rest.
function score(v: string, pfx: string): number {
  const lv = v.toLowerCase()
  return lv.startsWith(pfx) ? 0 : lv.includes(pfx) ? 1 : 2
}

function wordStart(text: string, caret: number): number {
  let s = caret
  while (s > 0 && WORD.test(text[s - 1])) s -= 1
  return s
}

// The shared behaviour, given a ref to the field. Returns the keydown handler to attach and the popup to
// render after the field.
function useDslAutocomplete(opts: {
  ref: RefObject<Field | null>
  value: string
  onValueChange: (v: string) => void
  completions: DslCompletion[]
  starters?: ReadonlyArray<DslCompletion>
}): { onKeyDown: (e: ReactKeyboardEvent) => void; menu: ReactNode } {
  const { ref, value, onValueChange, completions, starters } = opts
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  // Which list applies at the cursor: the line-starters when the cursor is at a statement start (the
  // current line, up to the word being typed, is blank) and starters were supplied; else the expression
  // list. Then filter by the word under the cursor.
  const compute = (): Menu | null => {
    const el = ref.current
    if (!el) return null
    const caret = el.selectionStart ?? el.value.length
    const start = wordStart(el.value, caret)
    const lineStart = el.value.lastIndexOf('\n', caret - 1) + 1
    const atStatementStart = el.value.slice(lineStart, start).trim() === ''
    const list = starters && atStatementStart ? starters : completions
    const pfx = el.value.slice(start, caret).toLowerCase()
    const items = list
      .filter((c) => c.value.toLowerCase().includes(pfx))
      .slice()
      .sort((a, b) => score(a.value, pfx) - score(b.value, pfx) || a.value.localeCompare(b.value))
      .slice(0, 40)
    if (items.length === 0) return null
    const coords = caretCoordinates(el, caret)
    const rect = el.getBoundingClientRect()
    const top = Math.min(rect.top + coords.top + coords.height, window.innerHeight - 16)
    const left = Math.max(8, Math.min(rect.left + coords.left, window.innerWidth - 240))
    return { items, active: 0, top, left }
  }

  // Replace the word under the cursor with the chosen token, then restore focus + caret.
  const accept = (item: DslCompletion) => {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart ?? value.length
    const start = wordStart(value, caret)
    const before = value.slice(0, start)
    const after = value.slice(caret)
    const newCaret = before.length + item.value.length
    onValueChange(before + item.value + after)
    setMenu(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(newCaret, newCaret)
    })
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.defaultPrevented) return
    if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault()
      setMenu(compute())
      return
    }
    if (!menu) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setMenu((m) => (m ? { ...m, active: (m.active + 1) % m.items.length } : m))
        break
      case 'ArrowUp':
        e.preventDefault()
        setMenu((m) => (m ? { ...m, active: (m.active - 1 + m.items.length) % m.items.length } : m))
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        accept(menu.items[menu.active])
        break
      case 'Escape':
        e.preventDefault()
        setMenu(null)
        break
      default:
        break
    }
  }

  // While open, re-filter + reposition as the text (and caret) change from typing.
  useEffect(() => {
    if (!menu) return
    setMenu((m) => {
      const next = compute()
      return next ? { ...next, active: m ? Math.min(m.active, next.items.length - 1) : 0 } : null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Keep the highlighted row visible when arrowing through a long list. (scrollIntoView is absent in
  // jsdom, so guard it — the tests exercise the menu without a real layout.)
  useEffect(() => {
    if (!menu) return
    const active = menuRef.current?.querySelector('.dsl-ac-item.is-active')
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' })
  }, [menu])

  // Dismiss on an outside pointer, or on scroll/resize — but NOT when the scroll happens INSIDE the menu
  // (that's the user wheel-scrolling the suggestion list, which must keep it open).
  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenu(null)
    }
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      setMenu(null)
    }
    const dismiss = () => setMenu(null)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [menu])

  const portal =
    menu &&
    createPortal(
      <div ref={menuRef} className="dsl-ac" role="listbox" aria-label="DSL suggestions" style={{ top: menu.top, left: menu.left }}>
        {menu.items.map((it, i) => (
          <button
            type="button"
            role="option"
            aria-selected={i === menu.active}
            key={`${it.kind}:${it.value}`}
            className={`dsl-ac-item${i === menu.active ? ' is-active' : ''}`}
            // Keep focus in the field so accept can restore the caret.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => accept(it)}
          >
            <span className="dsl-ac-val">{it.value}</span>
            <span className={`dsl-ac-kind dsl-ac-kind--${it.kind}`}>{kindLabel(it.kind)}</span>
            {it.hint && <span className="dsl-ac-hint">{it.hint}</span>}
          </button>
        ))}
      </div>,
      document.body,
    )

  return { onKeyDown, menu: portal }
}

function kindLabel(kind: DslCompletion['kind']): string {
  switch (kind) {
    case 'predicate':
      return 'predicate'
    case 'walker':
      return 'walker'
    case 'keyword':
      return 'keyword'
    default:
      return 'attr'
  }
}

// Emit the field's current selection (debounced) on select/keyup/mouseup, and null on blur — the hook the
// path preview listens to. A no-op when `onSelectionChange` is absent, so non-preview fields pay nothing.
function useSelectionEmitter(
  ref: RefObject<Field | null>,
  onSelectionChange?: (sel: { start: number; end: number } | null) => void,
): { onSelect: () => void; onKeyUp: () => void; onMouseUp: () => void; onBlur: () => void } {
  const timer = useRef<number | null>(null)
  const cb = useRef(onSelectionChange)
  cb.current = onSelectionChange
  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current)
    },
    [],
  )
  const emit = () => {
    const el = ref.current
    if (!cb.current || !el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? start
    if (timer.current != null) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => cb.current?.({ start, end }), 80)
  }
  const onBlur = () => {
    if (timer.current != null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    cb.current?.(null)
  }
  return { onSelect: emit, onKeyUp: emit, onMouseUp: emit, onBlur }
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (v: string) => void
  completions: DslCompletion[]
  starters?: ReadonlyArray<DslCompletion>
  // Emitted (debounced ~80ms) with the current selection on select/keyup/mouseup, and null on blur — for
  // the path-preview feature. Absent = the field ignores selection (zero overhead). Independent of the
  // Ctrl+Space autocomplete's own onKeyDown.
  onSelectionChange?: (sel: { start: number; end: number } | null) => void
}

export function DslTextarea({ value, onValueChange, completions, starters, onKeyDown, onSelectionChange, ...rest }: TextareaProps) {
  const ref = useRef<Field | null>(null)
  const ac = useDslAutocomplete({ ref, value, onValueChange, completions, starters })
  const sel = useSelectionEmitter(ref, onSelectionChange)
  return (
    <>
      <textarea
        {...rest}
        ref={ref as RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          ac.onKeyDown(e)
        }}
        onSelect={sel.onSelect}
        onKeyUp={sel.onKeyUp}
        onMouseUp={sel.onMouseUp}
        onBlur={sel.onBlur}
      />
      {ac.menu}
    </>
  )
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (v: string) => void
  completions: DslCompletion[]
  starters?: ReadonlyArray<DslCompletion>
}

export function DslInput({ value, onValueChange, completions, starters, onKeyDown, ...rest }: InputProps) {
  const ref = useRef<Field | null>(null)
  const ac = useDslAutocomplete({ ref, value, onValueChange, completions, starters })
  return (
    <>
      <input
        {...rest}
        ref={ref as RefObject<HTMLInputElement>}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          ac.onKeyDown(e)
        }}
      />
      {ac.menu}
    </>
  )
}
