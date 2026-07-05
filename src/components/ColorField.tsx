import './ColorField.css'
import { attrSpec } from '../dsl'
import { MAX_RAMP_STOPS, RAMP_ATTRS, type Ramp, type RampStop, type RuleColor } from '../colorizer'
import { ColorPicker } from './ColorPicker'
import { TrashButton } from './TrashButton'
import { DiceButton } from './DiceButton'

// A fresh random #rrggbb for the dice button. (Math.random is fine in app code.)
function randomHex(): string {
  return `#${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, '0')}`
}

// The colour half of a coloring rule, written as a readable sentence. One colour is "flat"; the +
// adds a second colour, turning it into a ramp that fades across up to 5 colours driven by an
// attribute (with optional modulo and per-colour breakpoints). Opacity is a single value for the
// whole rule.
export function ColorField({
  color,
  opacity,
  onColor,
  onOpacity,
}: {
  color: RuleColor
  opacity: number
  onColor: (c: RuleColor) => void
  onOpacity: (o: number) => void
}) {
  if (color.kind === 'flat') {
    return (
      <div className="color-field">
        <p className="rule-frag">then color the tile</p>
        <div className="rule-line">
          <ColorPicker value={color.hex} onChange={(hex) => onColor({ kind: 'flat', hex })} />
          <DiceButton label="randomize colour" onClick={() => onColor({ kind: 'flat', hex: randomHex() })} />
          <span className="rule-word">at</span>
          <OpacityInput value={opacity} onChange={onOpacity} />
          <span className="rule-word">opacity</span>
        </div>
        <AddColour onClick={() => onColor(toRamp(color.hex))} />
      </div>
    )
  }

  const ramp = color.ramp
  const stops = ramp.stops
  const setRamp = (next: Partial<Ramp>) => onColor({ kind: 'ramp', ramp: { ...ramp, ...next } })
  const setStop = (i: number, next: RampStop) => setRamp({ stops: stops.map((s, k) => (k === i ? next : s)) })
  const addStop = () => setRamp({ stops: [...stops, { hex: '#ffffff', at: null }] })
  const removeStop = (i: number) => {
    const next = stops.filter((_, k) => k !== i)
    if (next.length <= 1) onColor({ kind: 'flat', hex: (next[0] ?? stops[0]).hex }) // one colour is flat again
    else setRamp({ stops: next })
  }

  return (
    <div className="color-field">
      <p className="rule-frag">then color the tile with a fade based on</p>
      <div className="rule-line">
        <select
          className="ramp-attr"
          value={ramp.attr}
          aria-label="ramp attribute"
          onChange={(e) => setRamp({ attr: e.target.value as Ramp['attr'] })}
        >
          {RAMP_ATTRS.map((a) => (
            <option key={a} value={a}>
              {attrSpec(a)?.label ?? a}
            </option>
          ))}
        </select>
        {attrSpec(ramp.attr)?.indexed && (
          <input
            type="number"
            min={0}
            className="rule-num"
            value={ramp.attrIndex ?? 0}
            aria-label="ramp attribute index"
            title="which index to fade over"
            onChange={(e) => setRamp({ attrIndex: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          />
        )}
        <span className="rule-word" aria-hidden="true">
          %
        </span>
        <input
          type="number"
          min={1}
          className="rule-num"
          value={ramp.mod ?? ''}
          placeholder="—"
          aria-label="ramp modulo"
          onChange={(e) => setRamp({ mod: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })}
        />
      </div>

      <p className="rule-frag">with the color fading between</p>
      <ol className="ramp-stops">
        {stops.map((stop, i) => (
          <li key={i} className="ramp-stop">
            <ColorPicker value={stop.hex} label={`stop ${i + 1}`} onChange={(hex) => setStop(i, { ...stop, hex })} />
            <input
              type="number"
              className="rule-num"
              value={stop.at ?? ''}
              placeholder="auto"
              aria-label={`breakpoint ${i + 1}`}
              onChange={(e) => setStop(i, { ...stop, at: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <DiceButton label={`randomize stop ${i + 1}`} onClick={() => setStop(i, { ...stop, hex: randomHex() })} />
            <TrashButton label={`remove stop ${i + 1}`} onClick={() => removeStop(i)} />
          </li>
        ))}
      </ol>
      {stops.length < MAX_RAMP_STOPS && <AddColour onClick={addStop} />}

      <div className="rule-line">
        <span className="rule-word">at</span>
        <OpacityInput value={opacity} onChange={onOpacity} />
        <span className="rule-word">opacity</span>
      </div>
    </div>
  )
}

function AddColour({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="color-add" aria-label="add a colour" title="Add a colour" onClick={onClick}>
      +
    </button>
  )
}

function OpacityInput({ value, onChange }: { value: number; onChange: (o: number) => void }) {
  const pct = Math.round(value * 100)
  return (
    <input
      type="number"
      min={0}
      max={100}
      className="rule-num"
      value={pct}
      aria-label="rule opacity"
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(Math.min(100, Math.max(0, Number.isNaN(n) ? 0 : n)) / 100)
      }}
    />
  )
}

function toRamp(hex: string): RuleColor {
  return { kind: 'ramp', ramp: { attr: 'visited', mod: 6, stops: [{ hex, at: null }, { hex: '#ffffff', at: null }] } }
}
