import './Guide.css'
import type { MouseEvent } from 'react'
import { hrefFor } from '../router/useHashRoute'

// The app uses hash ROUTING (#/guide), so a plain in-page anchor like href="#anatomy" would overwrite the
// route hash — the router reads it as an unknown route and bounces to the landing page. Intercept clicks on
// the in-page section links (href="#id", but NOT the router's "#/route" links) and scroll to the section
// ourselves, leaving the URL on #/guide. `scroll-margin-top` (Guide.css) clears the sticky nav.
function onGuideClick(e: MouseEvent<HTMLDivElement>) {
  const link = (e.target as HTMLElement).closest('a')
  if (!link) return
  const href = link.getAttribute('href') ?? ''
  if (!href.startsWith('#') || href.startsWith('#/')) return
  const el = document.getElementById(href.slice(1))
  if (!el) return
  e.preventDefault()
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// A fleshed-out reference for the traverser DSL — reached from the "?" explainer in the Traversers
// pane ("Read the full guide"). Plain content + small inline SVG diagrams (themeable via CSS vars) so
// visual learners get a picture of edges, splits, attribute paths, and directives. No new dependencies.
export function Guide() {
  return (
    <div className="guide container" onClick={onGuideClick}>
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
        <a href="#tiles">Tiles &amp; attributes</a>
        <a href="#moving">Moving</a>
        <a href="#predicates">Predicates</a>
        <a href="#registries">Registries</a>
        <a href="#directives">Directives</a>
        <a href="#morph">Morph &amp; update</a>
        <a href="#autoplace">Auto-place</a>
        <a href="#examples">Examples</a>
      </nav>

      <section className="guide-section" id="anatomy">
        <h2>Anatomy of a traverser definition</h2>
        <p>
          The little program you give a traverser is called its <strong>definition</strong>. Here is a
          small one:
        </p>
        <pre className="guide-code">{`max-split = 2                  # a settings header line (optional)

if visited > 0 then move l1    # a rule — runs only when its predicate holds
move straight                  # a bare action — always runs`}</pre>
        <p>Reading it line by line:</p>
        <ul>
          <li>
            <code>max-split = 2</code> is a <strong>settings header</strong> line. The header is optional and
            sits at the top; the full list is under <a href="#settings">Settings</a>.
          </li>
          <li>
            <code>if visited &gt; 0 then move l1</code> is a <strong>rule</strong> — the shape is{' '}
            <code>if &lt;predicate&gt; then &lt;action&gt;</code>, and it fires only when the predicate is
            true. (Here: "if the tile I'm on has been visited, turn left.")
          </li>
          <li>
            <code>move straight</code> is a <strong>bare action</strong> — no <code>if</code>, so it always
            runs.
          </li>
          <li>
            <code>#</code> starts a <strong>comment</strong>, and blank lines are ignored.
          </li>
        </ul>
        <p>
          Every tick, the walker runs these lines <strong>top to bottom</strong>. A standing rule about
          movement — a <strong>directive</strong> — is a fourth kind of line, covered under{' '}
          <a href="#directives">Directives</a>.
        </p>
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
              <td><code>0</code></td>
              <td>Starting heading as an <strong>edge number</strong> (0 = the top edge, going clockwise) — the edge <code>straight</code> exits. Overridable when you place it.</td>
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

      <section className="guide-section" id="tiles">
        <h2>Tiles &amp; attributes</h2>
        <p>
          A traverser lives on a <strong>tiling</strong> — a board of <strong>tiles</strong>. Everything a
          walker decides comes from reading facts about a tile, called its <strong>attributes</strong>.
          These are the same attributes the <strong>Predicates</strong> and <strong>Coloring</strong> panes
          use, so what you learn here applies across the whole app.
        </p>

        <h3>The board</h3>
        <ul>
          <li>
            <strong>Tile</strong> — a single polygon (a square, triangle, hexagon, …). A walker always sits
            on exactly one tile.
          </li>
          <li>
            <strong>Edge</strong> — one side of a tile. You move by naming an edge (see <a href="#moving">Moving</a>).
          </li>
          <li>
            <strong>Neighbour</strong> — a tile that shares an edge with this one. Most tiles touch their
            neighbours across a single edge, but in some tilings (e.g. the octagon + wedge) one neighbour is
            reached across <em>two</em> edges — which is why visit-counting comes in two flavours below.
          </li>
          <li>
            <strong>Visited</strong> — a tile is "visited" once a walker has landed on it (or you've painted
            it by hand). Visits accumulate; the tile remembers how many and on which ticks.
          </li>
        </ul>

        <h3>Tile attributes you can read</h3>
        <p>
          Use any of these in a predicate or a formula. They report on the tile being asked about — the one
          you're on, or a neighbour if you add <code>@ &lt;edge&gt;</code> (see <a href="#predicates">Predicates</a>).
        </p>

        <p className="guide-subhead"><strong>Visit state</strong></p>
        <table className="guide-table">
          <thead>
            <tr><th>Attribute</th><th>What it reports</th></tr>
          </thead>
          <tbody>
            <tr><td><code>visited</code></td><td>How many times the tile has been visited (0 if never).</td></tr>
            <tr><td><code>visited-neighbors</code></td><td>How many <em>distinct neighbour tiles</em> are visited (a two-edge neighbour counts once). This is the usual Rule-90 / fractal count.</td></tr>
            <tr><td><code>visited-edges</code></td><td>How many <em>adjacent edges</em> lead to a visited tile (a two-edge neighbour counts twice).</td></tr>
            <tr><td><code>first-step</code></td><td>The tick of the tile's <em>first</em> visit. Needs <code>default</code>.</td></tr>
            <tr><td><code>latest-step</code></td><td>The tick of the tile's <em>most recent</em> visit. Needs <code>default</code>.</td></tr>
            <tr><td><code>step[n]</code></td><td>The tick of the <em>n</em>-th visit (0-based). Needs <code>default</code>.</td></tr>
          </tbody>
        </table>

        <p className="guide-subhead"><strong>Registries</strong> (per-tile counters — also writable, see <a href="#registries">Registries</a>)</p>
        <table className="guide-table">
          <thead>
            <tr><th>Attribute</th><th>What it reports</th></tr>
          </thead>
          <tbody>
            <tr><td><code>[A]</code></td><td>The tile's A counter. (Also <code>[B]</code>, <code>[C]</code>; lowercase <code>[a]</code> is fine.)</td></tr>
            <tr><td><code>[A, B]</code></td><td>The <em>sum</em> of the listed registries — here A + B.</td></tr>
          </tbody>
        </table>

        <p className="guide-subhead"><strong>Shape &amp; identity</strong></p>
        <table className="guide-table">
          <thead>
            <tr><th>Attribute</th><th>What it reports</th></tr>
          </thead>
          <tbody>
            <tr><td><code>tile-type</code></td><td>The shape class, tested categorically — <code>tile-type == triangle</code>, never a number. A name a tiling doesn't have simply matches nothing.</td></tr>
            <tr><td><code>edge-count</code></td><td>How many sides the tile has.</td></tr>
            <tr><td><code>rotation</code></td><td>The tile's orientation, in degrees.</td></tr>
            <tr><td><code>tile-number</code></td><td>The tile's index in the tiling (a stable per-tile id).</td></tr>
            <tr><td><code>coordinate[n]</code></td><td>The <em>n</em>-th lattice coordinate of the tile. What each index means varies per tiling. Needs <code>default</code>.</td></tr>
          </tbody>
        </table>
        <p className="guide-note">
          Attributes that may have no value for a tile — <code>first-step</code>, <code>latest-step</code>,{' '}
          <code>step[n]</code>, <code>coordinate[n]</code> — require a fallback written as{' '}
          <code>default N</code>, e.g. <code>first-step default -1</code>. The fallback is used whenever the
          tile has no such value (never visited, index out of range).
        </p>

        <h3>Walker state</h3>
        <p>
          Only while a walker is running, a few extra attributes report on the <em>walker itself</em> rather
          than the tile:
        </p>
        <ul>
          <li><code>steps</code> — how many ticks this walker has taken.</li>
          <li><code>splits</code> — how many times it has split.</li>
          <li><code>heading</code> — the edge number its <code>straight</code> currently exits (0 = the top edge, clockwise).</li>
          <li><code>P</code> / <code>Q</code> / <code>R</code> — its own registries that travel with it (see <a href="#registries">Registries</a>).</li>
        </ul>
      </section>

      <section className="guide-section" id="moving">
        <h2>Moving</h2>
        <p>
          A move command is <code>move &lt;edge&gt;</code>. There is <strong>one vocabulary for naming an
          edge</strong>, used everywhere a move (or an attribute's <a href="#predicates">path</a>) names a
          direction. Every tile's edges are numbered <em>clockwise from the top</em> (0, 1, 2, …); your
          <strong> heading</strong> is simply the edge number <code>straight</code> exits, and the turns
          step that number around the ring — so the same rule works on any tile shape, the concave wedge
          included.
        </p>

        <p className="guide-subhead"><strong>Naming an edge</strong></p>
        <table className="guide-table">
          <thead>
            <tr><th>Name</th><th>The edge it picks</th></tr>
          </thead>
          <tbody>
            <tr><td><code>straight</code></td><td>The edge you're heading at — the heading edge itself. (<code>s</code> for short.)</td></tr>
            <tr><td><code>r1</code>, <code>r2</code>, …</td><td>Turn <strong>right</strong> (clockwise): heading <strong>+1</strong>, +2, … around the edge ring.</td></tr>
            <tr><td><code>l1</code>, <code>l2</code>, …</td><td>Turn <strong>left</strong> (counter-clockwise): heading <strong>−1</strong>, −2, … around the ring.</td></tr>
            <tr><td><code>eN</code> (<code>e0</code>, <code>e3</code>…)</td><td>The <strong>absolute</strong> edge by its <em>clockwise-from-top</em> number (0 at the top), regardless of heading.</td></tr>
            <tr><td><code>nearest-unvisited</code></td><td>The unvisited neighbour the fewest edges around from your heading (great for carving mazes).</td></tr>
          </tbody>
        </table>
        <EdgeFanDiagram />
        <p className="guide-note">
          Every move <strong>re-aims</strong> you: you arrive on the next tile already facing "straight
          ahead", so chaining <code>move straight</code> keeps going in a line. On the concave wedge that
          straight-ahead follows the tile's built-in <em>straight-through</em> pairing (enter one edge,
          leave the matching one) — which is why <code>straight</code> crosses a wedge cleanly while the
          turns still count its edges one at a time.
        </p>

        <p className="guide-subhead"><strong>Combining edges</strong></p>
        <ul>
          <li>
            <strong>Split</strong> — <code>[a, b, …]</code> branches the walker, one branch per edge (capped
            by <code>max-split</code>).
          </li>
          <li>
            <strong>Chain</strong> — <code>a -&gt; b -&gt; …</code> hops several edges in a single tick; only
            the <em>final</em> tile is visited (the ones passed through are not).
          </li>
        </ul>
        <SplitChainDiagram />

        <p className="guide-subhead"><strong>Move commands</strong></p>
        <table className="guide-table">
          <thead>
            <tr><th>Command</th><th>What it does</th></tr>
          </thead>
          <tbody>
            <tr><td><code>move straight</code></td><td>Step forward one tile.</td></tr>
            <tr><td><code>move r1</code></td><td>Turn right and step.</td></tr>
            <tr><td><code>move l2</code></td><td>Take the second edge to the left.</td></tr>
            <tr><td><code>move e0</code></td><td>Cross the top edge, whatever your heading.</td></tr>
            <tr><td><code>move nearest-unvisited</code></td><td>Step to the closest unvisited neighbour — the built-in Walker.</td></tr>
            <tr><td><code>move [straight, r1, l1]</code></td><td>Split: branch forward, right and left at once.</td></tr>
            <tr><td><code>move straight -&gt; r1</code></td><td>Hop two edges in one tick; only the final tile is visited.</td></tr>
            <tr><td><code>if visited@target == 0 then move [r1, l1, straight]</code></td><td>A <a href="#predicates">predicate</a> gates the move: split three ways, but keep only the branches landing on an <em>unvisited</em> tile (<code>@target</code> on the attribute tests each destination).</td></tr>
          </tbody>
        </table>
        <p className="guide-note">
          <code>straight</code>/<code>r</code>/<code>l</code> are framed by your heading; <code>eN</code> is
          always absolute. Set <code>movement = absolute</code> in the header to frame <em>all</em> of them by
          north instead.
        </p>
      </section>

      <section className="guide-section" id="predicates">
        <h2>Predicates</h2>
        <p>
          A <strong>predicate</strong> is the yes/no test in a rule's <code>if</code> (and in a{' '}
          <a href="#directives">directive</a>). Write it two ways, mixed freely:
        </p>
        <ul>
          <li>
            <strong>Inline</strong>: <code>visited &gt; 0</code>, <code>visited-neighbors == 1</code>,{' '}
            <code>tile-type == triangle</code> — any <a href="#tiles">tile attribute</a> combined with{' '}
            <code>and</code> / <code>or</code> / <code>not</code> and arithmetic. This is the same language
            (and the same attributes) as the <strong>Predicates</strong> pane. (<code>==</code> and{' '}
            <code>=</code> both mean "equals".)
          </li>
          <li>
            <strong>By name</strong>: write the name of a predicate you saved in the Predicates pane, e.g.{' '}
            <code>if isCrowded then …</code>.
          </li>
        </ul>
        <p>
          Each attribute reads the tile you're <strong>on</strong> by default. Add an <strong>@-path</strong>{' '}
          right after the attribute to read it on <em>another</em> tile — <code>visited@e1</code>,{' '}
          <code>tile-type@target</code>, <code>[A@r1]</code>. Different attributes in one predicate can point
          at different tiles.
        </p>
        <table className="guide-table">
          <thead>
            <tr><th>Path</th><th>Reads the attribute on…</th></tr>
          </thead>
          <tbody>
            <tr><td><code>@e0</code>, <code>@r1</code>, <code>@straight</code>…</td><td>The neighbour across that edge — any <a href="#moving">edge name</a> (<code>eN</code>, <code>r</code>/<code>l</code>, <code>straight</code>, <code>nearest-unvisited</code>).</td></tr>
            <tr><td><code>@e0@e0@e3</code>, <code>@r1@e5</code></td><td>Follow several edges in turn (re-aiming at each) and read the tile you land on.</td></tr>
            <tr><td><code>@target</code></td><td>The tile a move is <strong>heading to</strong>. Dynamic: with a split it's tested <em>per branch</em>, so it filters which branches survive. This is how a <a href="#directives">directive</a> gates moves.</td></tr>
            <tr><td><code>@tile N</code></td><td>The tile with absolute number <code>N</code>.</td></tr>
          </tbody>
        </table>
        <p className="guide-note">
          <code>@target</code> and <code>@tile N</code> name a tile directly, so nothing can follow them; edge
          hops (<code>@e0</code>, <code>@r1</code>…) chain freely.
        </p>
        <DecorationDiagram />
        <pre className="guide-code">{`if visited@r1 > 0 then move l1                          # if the tile to my right is visited, turn left
if visited@target == 0 then move [r1, l1, straight]    # split, but only onto unvisited tiles`}</pre>
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
          (add), where <code>X</code> is a single registry letter (<code>A</code>–<code>C</code> or{' '}
          <code>P</code>–<code>R</code>). <strong>Read</strong> a tile registry in a formula with brackets:{' '}
          <code>[A]</code> (lowercase <code>[a]</code> too), and <code>[A, B]</code> for the <em>sum</em>.
          Walker registries read as bare <code>P</code> / <code>Q</code> / <code>R</code>; formulas may also
          use any tile attribute and the walker's <code>steps</code>, <code>splits</code>, <code>heading</code>.
        </p>
        <pre className="guide-code">{`put A = visited + 1     # set tile registry A
increase P              # add 1 to walker registry P
put Q = [A]             # copy the tile's A into the walker's Q
if [A, B] > 0 then ...  # true when A + B is positive`}</pre>
        <p className="guide-note">
          If two walkers share a tile in one tick, <code>increase</code> from both <strong>adds up</strong>,
          but a <code>put</code> is <strong>last-writer-wins</strong>. Prefer <code>increase</code> when
          walkers may meet.
        </p>
      </section>

      <section className="guide-section" id="directives">
        <h2>Directives</h2>
        <p>
          A <strong>directive</strong> is a standing rule about <em>all</em> moves that come after it — a way
          to gate movement without repeating a <a href="#predicates">predicate</a> on every <code>move</code>.
          The form puts the predicate first:
        </p>
        <pre className="guide-code">{`directive if <predicate> always forbid move
directive if <predicate> always allow  move
reset directives`}</pre>
        <p>
          Each candidate destination of a following move must pass every active directive: it's taken only if
          no <code>forbid</code> predicate holds and every <code>allow</code> predicate holds
          (<strong>forbid wins</strong>). Like any predicate the test reads the tile you're{' '}
          <strong>on</strong> by default — so to gate by where you're <em>going</em>, add{' '}
          <code>@target</code> to its attribute(s) (almost always what you want). Directives stack as the program runs
          top-to-bottom; <code>reset directives</code> clears them so later moves are unconstrained again.
        </p>
        <DirectiveDiagram />
        <pre className="guide-code">{`directive if visited@target > 0 always forbid move     # never step onto a visited tile…
move [straight, r1, l1, r2, l2]                        # …try these, the directive filters them

reset directives                                       # from here on, moves are unfiltered again
move straight`}</pre>
        <p className="guide-note">
          A directive is just a <code>@target</code> guard made standing: it constrains the{' '}
          <code>move</code>/<code>morph</code> lines that <em>follow</em> it — never the ones above.
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
          e.g. <code>update max-split 3</code>, <code>update heading 2</code> (aim at edge 2), <code>update movement absolute</code>.
        </p>
      </section>

      <section className="guide-section" id="autoplace">
        <h2>Auto-place</h2>
        <p>
          Normally you place walkers by hand on the canvas. <strong>Auto-place</strong> instead seeds them by
          a <em>rule</em> that is re-evaluated against whatever grid is showing — so a pattern you author on
          the small exploration grid still lands correctly when you <strong>export</strong> at a much larger
          size. (A hand-placed walker keeps its absolute distance from the centre, so on a bigger grid it
          drifts inward — auto-place is the grid-relative alternative.) Write the rule inside a definition:
        </p>
        <pre className="guide-code">{`auto-place line {0, 0, 0} if tile-type == octagon
move nearest-unvisited`}</pre>
        <p>
          <code>auto-place line {'{'}angle, percent, edge{'}'}</code> drops a walker on every tile the line
          crosses:
        </p>
        <table className="guide-table">
          <thead>
            <tr><th>Field</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td><code>angle</code></td><td>The line's angle in degrees — <code>0</code> = a row (horizontal), <code>90</code> = a column (vertical), <code>45</code> / <code>-45</code> = the diagonals.</td></tr>
            <tr><td><code>percent</code></td><td>How far across, measured from the <strong>top-left</strong>: <code>0</code> = the top (for a row) or left (for a column) edge, <code>100</code> = the far side. Diagonals are less intuitive — experiment.</td></tr>
            <tr><td><code>edge</code></td><td>The <strong>absolute edge number</strong> (0 = the top edge, clockwise) each walker aims at. A number past a tile's edge count just wraps.</td></tr>
          </tbody>
        </table>
        <p>
          The optional <code>if &lt;predicate&gt;</code> is an ordinary <a href="#predicates">tile predicate</a> —
          only tiles on the line that match get a walker (drop it to place on all of them). There's no walker
          yet at placement time, so walker-relative paths (<code>@target</code>, …) have nothing to read;
          stick to tile facts like <code>tile-type</code>, <code>orientation</code>, <code>coordinate</code>.
        </p>
        <p className="guide-note">
          Auto-placed walkers appear <strong>ghostly</strong> on the canvas and can't be removed with the
          canvas controls — edit or delete the <code>auto-place</code> line to change them. Where a
          hand-placed walker shares a tile, the hand-placed one wins. Every definition's own{' '}
          <code>auto-place</code> lines contribute, so comment a line out to switch it off.
        </p>
      </section>

      <section className="guide-section" id="examples">
        <h2>Examples</h2>
        <h3>Maze carver (the built-in Walker)</h3>
        <pre className="guide-code">{`move nearest-unvisited`}</pre>
        <p>Steps to the closest unvisited neighbour each tick, re-aiming as it goes — carves a maze and stops when boxed in.</p>

        <h3>Self-avoiding splitter</h3>
        <pre className="guide-code">{`max-split = 3
directive if visited@target > 0 always forbid move
move [straight, r1, l1]`}</pre>
        <p>Branches forward/left/right, but never onto a visited tile — branches die as they run out of room, leaving a tree.</p>

        <h3>Breadcrumb counter</h3>
        <pre className="guide-code">{`increase A                 # tally how many times this tile is touched
put P = P + visited        # accumulate a trail length on the walker
move nearest-unvisited`}</pre>
        <p>Colour the result by driving a ramp from <strong>Registry A</strong> in the Coloring pane.</p>

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

// Path: an attribute with @r1 reads the neighbour, not the current tile.
function DecorationDiagram() {
  return (
    <figure className="guide-figure">
      <svg viewBox="0 0 320 130" role="img" aria-label="visited@r1 > 0 reads the tile across edge r1, not the tile the walker is on.">
        <Tile x={70} y={45} walker />
        <line x1={110} y1={65} x2={150} y2={65} className="gd-ray" />
        <text x={130} y={56} textAnchor="middle" className="gd-label gd-label--strong">@r1</text>
        <Tile x={150} y={45} asked />
        <text x={90} y={110} textAnchor="middle" className="gd-caption">you are here</text>
        <text x={170} y={110} textAnchor="middle" className="gd-caption">reads this</text>
      </svg>
      <figcaption>
        <code>visited@r1 &gt; 0</code> reads the tile across <code>r1</code> — the <code>@</code>-path
        redirects that attribute to a neighbour.
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
        <code>directive if visited@target &gt; 0 always forbid move</code> drops any following move whose
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
