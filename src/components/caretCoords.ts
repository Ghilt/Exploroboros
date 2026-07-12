// The mirror-div caret geometry for the DSL textarea/input fields — kept out of DslTextarea.tsx so that
// file exports only React components (Fast Refresh). Used by the Ctrl+Space autocomplete (to place the
// popup at the caret) and by the traverser editor's path-preview swatch gutter (to align a swatch to each
// source line). Client-only (needs layout); never call during render/SSR.

type Field = HTMLTextAreaElement | HTMLInputElement

const MIRROR_PROPS = [
  'direction',
  'boxSizing',
  'width',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const

// camelCase style key -> CSS property name (e.g. borderTopWidth -> border-top-width).
function cssName(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

// Pixel position of the caret inside a textarea/input, relative to the field's border-box (so the caller
// adds getBoundingClientRect() to place a fixed popup). The standard mirror-div technique: render an
// off-screen div styled identically to the field, put the text up to the caret in it followed by a marker
// span, and read the span's offset. Only runs on real interaction (never during render/tests).
export function caretCoordinates(el: Field, position: number): { top: number; left: number; height: number } {
  const isInput = el.tagName === 'INPUT'
  const computed = getComputedStyle(el)
  const div = document.createElement('div')
  const s = div.style
  s.position = 'absolute'
  s.visibility = 'hidden'
  s.whiteSpace = isInput ? 'pre' : 'pre-wrap'
  s.wordWrap = isInput ? 'normal' : 'break-word'
  s.top = '0'
  s.left = '0'
  s.overflow = 'hidden'
  for (const prop of MIRROR_PROPS) {
    s.setProperty(cssName(prop), computed.getPropertyValue(cssName(prop)))
  }
  s.height = 'auto'
  // An <input> collapses runs of whitespace and never wraps; mirror that so the marker lands right.
  div.textContent = isInput ? el.value.slice(0, position).replace(/\s/g, ' ') : el.value.slice(0, position)
  const span = document.createElement('span')
  span.textContent = (isInput ? el.value.slice(position).replace(/\s/g, ' ') : el.value.slice(position)) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const top = span.offsetTop + parseFloat(computed.borderTopWidth || '0') - el.scrollTop
  const left = span.offsetLeft + parseFloat(computed.borderLeftWidth || '0') - el.scrollLeft
  const height = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2
  document.body.removeChild(div)
  return { top, left, height }
}

// The pixel top (relative to the textarea's border-box, scroll already accounted for) and line height of
// the line that CONTAINS the character at `charOffset` — pass a line's first-character offset to place a
// swatch beside it. Reuses caretCoordinates, so it stays correct even when a long line wraps.
export function lineTopFor(el: HTMLTextAreaElement, charOffset: number): { top: number; height: number } {
  const c = caretCoordinates(el, charOffset)
  return { top: c.top, height: c.height }
}
