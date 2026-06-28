import './Guide.css'
import { hrefFor } from '../router/useHashRoute'

// A fleshed-out reference for the traverser DSL — reached from the "?" explainer in the Traversers
// pane ("Read the full guide"). Plain content + small inline SVG diagrams (themeable via CSS vars) so
// visual learners get a picture of edges, splits, decoration, and directives. No new dependencies.
export function Guide() {
  return (
    <div className="guide container">
      <header className="page-head">
        <p className="page-eyebrow">Reference</p>
        <h1 className="page-title">The traverser language</h1>
        <p className="page-lead">
          A traverser is a walker that lives on the tiling. You give it a little program; every{' '}
          <strong>tick</strong> it runs that program top-to-bottom to decide what to write and where to
          move. Patterns emerge from many ticks. This page explains the whole language.
        </p>
        <p>
          <a className="btn btn-ghost" href={hrefFor('canvas')}>
            ← Back to the Canvas
          </a>
        </p>
      </header>

      <nav className="guide-toc" aria-label="On this page">
        <a href="#anatomy">Anatomy</a>
        <a href="#settings">Settings</a>
        <a href="#moving">Moving</a>
        <a href="#conditions">Conditions</a>
        <a href="#registries">Registries</a>
        <a href="#directives">Directives</a>
        <a href="#morph">Morph &amp; update</a>
        <a href="#examples">Examples</a>
      </nav>

      <section className="guide-section" id="anatomy">
        <h2>Anatomy of a definition</h2>
        <p>
          A definition has an optional <strong>settings header</strong> followed by a list of{' '}
          <strong>rules</strong> and <strong>directives</strong>, one per line. A rule is{' '}
          <code>if &lt;condition&gt; then &lt;action&gt;</code>; a line with just an action always fires.
          Lines run <strong>top to bottom</strong> each tick. <code>#</code> starts a comment.
        </p>
        <pre className="guide-code">{`max-split = 2            # header settings (any order)
movement = relative

if visited == 0 @ straight then move straight   # a rule
increase P                                       # a bare action: always runs`}</pre>
        <p className="guide-note">
          A tick reads the board <strong>as it was at the start of the tick</strong> — a walker never sees
          its own (or another walker's) writes until the next tick. A walker that doesn't move this tick is
          removed; it persists only by moving.
        </p>
      </section>

      <section className="guide-section" id="settings">
        <h2>Settings</h2>
        <table className="guide-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>Default</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>max-split</code></td>
              <td><code>1</code></td>
              <td>Most branches the walker may spawn in one tick (1 = never splits).</td>
            </tr>
            <tr>
              <td><code>heading</code></td>
              <td>—</td>
              <td>Starting heading in degrees (0 = east, 90 = up). Overridable when you place it.</td>
            </tr>
            <tr>
              <td><code>movement</code></td>
              <td><code>relative</code></td>
              <td>Whether edge shorthands are framed by the heading (relative) or by north (absolute).</td>
            </tr>
            <tr>
              <td><code>max-steps</code></td>
              <td><code>50000</code></td>
              <td>Lifetime cap in ticks; the walker is dropped after this many.</td>
            </tr>
          </tbody>
        </table>
        <p>
          A walker can change its own settings mid-run with <code>update</code> (see below).
        </p>
      </section>

      <section className="guide-section" id="moving">
        <h2>Moving</h2>
        <p>
          You move by naming an <strong>edge</strong>. Edges are relative to your heading:{' '}
          <code>straight</code> continues forward, <code>r1</code>/<code>r2</code>/… turn right
          (clockwise) by increasing amounts, and <code>l1</code>/<code>l2</code>/… turn left. This works
          on any tile shape without you tracking edge numbers.
        </p>
        <EdgeFanDiagram />
        <p>Other ways to name an edge:</p>
        <ul>
          <li>
            <code>edge N</code> — the absolute edge by its <em>clockwise-from-top</em> number (0 at the top),
            regardless of heading.
          </li>
          <li>
            <code>nearest-unvisited</code> — the closest-by-heading neighbour you haven't visited yet (the
            built-in "Walker" uses this; great for carving mazes).
          </li>
        </ul>
        <p>
          Two combinations: a <strong>set</strong> <code>[a, b]</code> <strong>splits</strong> the walker
          (one branch per edge, capped by <code>max-split</code>), and a <strong>chain</strong>{' '}
          <code>a -&gt; b</code> hops several edges in a single tick — only the <em>final</em> tile is
          visited; the ones passed through are not.
        </p>
        <SplitChainDiagram />
      </section>

      <section className="guide-section" id="conditions">
        <h2>Conditions</h2>
        <p>
          A rule's guard is a yes/no test, written two ways (mix freely):
        </p>
        <ul>
          <li>
            <strong>Inline</strong>: <code>visited &gt; 0</code>, <code>tile-type == triangle</code>,{' '}
            combined with <code>and</code> / <code>or</code> / <code>not</code> and arithmetic — the same
            language as the Predicates pane.
          </li>
          <li>
            <strong>By name</strong>: write the name of a predicate you saved in the Predicates pane, e.g.{' '}
            <code>if isCrowded then …</code>.
          </li>
        </ul>
        <p>
          By default a condition asks about the tile you're <em>on</em>. Add <code>@ &lt;edge&gt;</code>{' '}
          (or <code>@ tile N</code>) to ask about a <strong>different</strong> tile instead — the one
          across that edge.
        </p>
        <DecorationDiagram />
        <pre className="guide-code">{`if visited > 0 @ r1 then move l1   # "if the tile to my right is visited, turn left"`}</pre>
      </section>

      <section className="guide-section" id="registries">
        <h2>Registries</h2>
        <p>
          Registries are counters you read and write. There are two kinds:
        </p>
        <ul>
          <li>
            <strong>Tile</strong> registries <code>A</code> <code>B</code> <code>C</code> — live on the
            tile (shared with drag-paint).
          </li>
          <li>
            <strong>Walker</strong> registries <code>P</code> <code>Q</code> <code>R</code> — travel with
            the walker (and are kept through a move, split, or morph).
          </li>
        </ul>
        <p>
          Write with <code>put X = &lt;formula&gt;</code> (set) or <code>increase X [by &lt;formula&gt;]</code>{' '}
          (add). Read a tile registry in a formula as <code>registry-a</code> / <code>registry-b</code> /{' '}
          <code>registry-c</code>, and walker ones as <code>P</code> / <code>Q</code> / <code>R</code>;
          formulas may also use any tile attribute and the walker's <code>steps</code>, <code>splits</code>,{' '}
          <code>heading</code>.
        </p>
        <pre className="guide-code">{`put A = visited + 1     # set tile registry A
increase P              # add 1 to walker registry P
put Q = registry-a      # copy the tile's A into the walker's Q`}</pre>
        <p className="guide-note">
          If two walkers share a tile in one tick, <code>increase</code> from both <strong>adds up</strong>,
          but a <code>put</code> is <strong>last-writer-wins</strong>. Prefer <code>increase</code> when
          walkers may meet.
        </p>
      </section>

      <section className="guide-section" id="directives">
        <h2>Directives</h2>
        <p>
          A <strong>directive</strong> is a standing rule about <em>all</em> moves that come after it —
          a way to gate movement without repeating a condition on every <code>move</code>. The form is:
        </p>
        <pre className="guide-code">{`directive move always forbid if <condition>
directive move always allow  if <condition>
reset directives`}</pre>
        <p>
          When a walker tries to move onto a tile, every active directive is checked against that{' '}
          <strong>destination</strong>: the move is taken only if it passes every <code>allow</code> and
          trips no <code>forbid</code> (<strong>forbid wins</strong>). Directives stack as the program runs
          top-to-bottom; <code>reset directives</code> clears them so later moves are unconstrained again.
        </p>
        <DirectiveDiagram />
        <pre className="guide-code">{`directive move always forbid if visited > 0   # never step onto a visited tile…
move [straight, r1, l1, r2, l2]               # …try these, the directive filters them

reset directives                              # from here on, moves are unfiltered again
move straight`}</pre>
        <p className="guide-note">
          A directive only constrains the <code>move</code>/<code>morph</code> lines that follow it in the
          program — not the ones above it.
        </p>
      </section>

      <section className="guide-section" id="morph">
        <h2>Morph &amp; update</h2>
        <p>
          <code>morph &lt;name&gt; &lt;edge&gt;</code> works exactly like <code>move</code>, but the arriving
          walker switches to a <strong>different definition</strong> (by its name) — it keeps its step count
          and its <code>P</code>/<code>Q</code>/<code>R</code> registries, only the program changes. Use it
          for relays where behaviour depends on where the walker has been.
        </p>
        <p>
          <code>update &lt;setting&gt; &lt;value&gt;</code> changes the walker's own setting from here on —
          e.g. <code>update max-split 3</code>, <code>update heading 90</code>, <code>update movement absolute</code>.
        </p>
      </section>

      <section className="guide-section" id="examples">
        <h2>Examples</h2>
        <h3>Maze carver (the built-in Walker)</h3>
        <pre className="guide-code">{`move nearest-unvisited`}</pre>
        <p>Steps to the closest unvisited neighbour each tick, re-aiming as it goes — carves a maze and stops when boxed in.</p>

        <h3>Self-avoiding splitter</h3>
        <pre className="guide-code">{`max-split = 3
directive move always forbid if visited > 0
move [straight, r1, l1]`}</pre>
        <p>Branches forward/left/right, but never onto a visited tile — branches die as they run out of room, leaving a tree.</p>

        <h3>Breadcrumb counter</h3>
        <pre className="guide-code">{`increase A                 # tally how many times this tile is touched
put P = P + visited        # accumulate a trail length on the walker
move nearest-unvisited`}</pre>
        <p>Colour the result by reading <code>registry-a</code> from a ramp in the Coloring pane.</p>

        <p className="guide-back">
          <a className="btn btn-primary" href={hrefFor('canvas')}>
            ← Back to the Canvas
          </a>
        </p>
      </section>
    </div>
  )
}

// ---- diagrams (inline SVG, themed via currentColor / CSS vars) ----

// A fan from the walker showing straight / r1·r2 (right) / l1·l2 (left) relative to the heading.
function EdgeFanDiagram() {
  const cx = 160
  const cy = 120
  const R = 78
  // angle in degrees measured clockwise from "up" (screen). Right turns are positive.
  const ray = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180 // 0deg = up
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) }
  }
  const rays: Array<{ deg: number; label: string; right?: boolean; left?: boolean }> = [
    { deg: -90, label: 'l2', left: true },
    { deg: -45, label: 'l1', left: true },
    { deg: 0, label: 'straight' },
    { deg: 45, label: 'r1', right: true },
    { deg: 90, label: 'r2', right: true },
  ]
  return (
    <figure className="guide-figure">
      <svg viewBox="0 0 320 200" role="img" aria-label="Edge shorthands fan out from the walker's heading: straight ahead, r1 and r2 to the right, l1 and l2 to the left.">
        {rays.map((r) => {
          const p = ray(r.deg)
          const straight = r.deg === 0
          return (
            <g key={r.label}>
              <line
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                className={straight ? 'gd-heading' : 'gd-ray'}
              />
              <circle cx={p.x} cy={p.y} r={straight ? 4.5 : 3} className={straight ? 'gd-heading-dot' : 'gd-ray-dot'} />
              <text x={p.x} y={p.y - 9} textAnchor="middle" className={straight ? 'gd-label gd-label--strong' : 'gd-label'}>
                {r.label}
              </text>
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={6} className="gd-walker" />
        <text x={cx} y={cy + 24} textAnchor="middle" className="gd-caption">
          your heading →
        </text>
      </svg>
      <figcaption>Edges are named relative to your heading. r = right (clockwise), l = left.</figcaption>
    </figure>
  )
}

// Split (one tick, two branches) vs chain (one tick, two hops, only the end visited).
function SplitChainDiagram() {
  return (
    <figure className="guide-figure">
      <svg viewBox="0 0 380 180" role="img" aria-label="A set like [l1, r1] splits into two branches; a chain like straight then r1 hops twice in one tick, visiting only the final tile.">
        {/* split */}
        <Tile x={20} y={70} walker label="" />
        <line x1={60} y1={90} x2={120} y2={45} className="gd-ray" />
        <line x1={60} y1={90} x2={120} y2={135} className="gd-ray" />
        <Tile x={120} y={25} visited />
        <Tile x={120} y={115} visited />
        <text x={90} y={170} textAnchor="middle" className="gd-mono">move [l1, r1]</text>

        {/* chain */}
        <Tile x={220} y={70} walker />
        <line x1={260} y1={90} x2={300} y2={90} className="gd-ray gd-ray--dash" />
        <line x1={300} y1={90} x2={332} y2={50} className="gd-ray" />
        <Tile x={290} y={70} passed />
        <Tile x={320} y={30} visited />
        <text x={300} y={170} textAnchor="middle" className="gd-mono">move straight {'->'} r1</text>
      </svg>
      <figcaption>
        <strong>Split</strong>: branches (capped by max-split). <strong>Chain</strong>: hops in one tick —
        the dashed tile is passed through, only the last is visited.
      </figcaption>
    </figure>
  )
}

// Decoration: a condition with @ r1 asks about the neighbour, not the current tile.
function DecorationDiagram() {
  return (
    <figure className="guide-figure">
      <svg viewBox="0 0 320 130" role="img" aria-label="visited > 0 @ r1 tests the tile across edge r1, not the tile the walker is on.">
        <Tile x={70} y={45} walker />
        <line x1={110} y1={65} x2={150} y2={65} className="gd-ray" />
        <text x={130} y={56} textAnchor="middle" className="gd-label gd-label--strong">@ r1</text>
        <Tile x={150} y={45} asked />
        <text x={90} y={110} textAnchor="middle" className="gd-caption">you are here</text>
        <text x={170} y={110} textAnchor="middle" className="gd-caption">asks about this</text>
      </svg>
      <figcaption>
        <code>visited &gt; 0 @ r1</code> reads the tile across <code>r1</code> — the decoration redirects the
        question to a neighbour.
      </figcaption>
    </figure>
  )
}

// Directive: forbid filters candidate moves; a visited destination is blocked.
function DirectiveDiagram() {
  return (
    <figure className="guide-figure">
      <svg viewBox="0 0 320 170" role="img" aria-label="With a forbid-if-visited directive, a move onto a visited tile is blocked while a move onto an empty tile is allowed.">
        <Tile x={130} y={70} walker />
        {/* allowed move (right, empty) */}
        <line x1={170} y1={90} x2={232} y2={90} className="gd-ray gd-ok" />
        <Tile x={230} y={70} />
        <text x={250} y={130} textAnchor="middle" className="gd-caption gd-ok-text">allowed</text>
        {/* forbidden move (up, visited) */}
        <line x1={150} y1={70} x2={150} y2={28} className="gd-ray gd-no gd-ray--dash" />
        <Tile x={130} y={8} visited />
        <text x={205} y={28} textAnchor="middle" className="gd-caption gd-no-text">forbidden (visited)</text>
      </svg>
      <figcaption>
        <code>directive move always forbid if visited &gt; 0</code> drops any following move whose
        destination is visited.
      </figcaption>
    </figure>
  )
}

// A small tile box used across the diagrams. `walker` shows a dot; `visited`/`asked`/`passed` tint it.
function Tile({
  x,
  y,
  walker,
  visited,
  asked,
  passed,
  label,
}: {
  x: number
  y: number
  walker?: boolean
  visited?: boolean
  asked?: boolean
  passed?: boolean
  label?: string
}) {
  const cls = visited ? 'gd-tile gd-tile--visited' : asked ? 'gd-tile gd-tile--asked' : passed ? 'gd-tile gd-tile--passed' : 'gd-tile'
  return (
    <g>
      <rect x={x} y={y} width={40} height={40} rx={4} className={cls} />
      {walker && <circle cx={x + 20} cy={y + 20} r={6} className="gd-walker" />}
      {label ? (
        <text x={x + 20} y={y + 25} textAnchor="middle" className="gd-label">
          {label}
        </text>
      ) : null}
    </g>
  )
}
