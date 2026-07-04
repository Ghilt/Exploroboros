// Doc -> canonical text. Round-trips through parseDoc, and serves as the persisted form (stored in the
// Initial-state pane + the PNG recipe). The `if` guard reuses src/dsl's predicate serializer.

import { serialize as serializePred } from '../dsl'
import type { Doc, Guard, InitStmt, What } from './types'

function whatText(w: What): string {
  switch (w.kind) {
    case 'traverser':
      return w.ref
    case 'reg':
      return `[${w.reg.toUpperCase()}]`
    case 'visited':
      return 'visited'
  }
}

function guardText(g: Guard): string {
  return g.pred.kind === 'named' ? g.pred.name : serializePred(g.pred.pred)
}

export function serializeStmt(s: InitStmt): string {
  const w = whatText(s.what)
  const body =
    s.shape.kind === 'line'
      ? `line {${w}, ${s.shape.angle}, ${s.shape.percent}, ${s.param}}`
      : `blob {${w}, ${s.shape.x}, ${s.shape.y}, ${s.shape.radius}, ${s.param}}`
  const base = `auto-place ${body}`
  return s.guard ? `${base} if ${guardText(s.guard)}` : base
}

export function serializeDoc(doc: Doc): string {
  return doc.map(serializeStmt).join('\n')
}
