import './Gallery.css'
import { GALLERY } from '../data/gallery'
import { PatternThumb } from '../components/PatternThumb'
import { TodoScaffold } from '../components/TodoScaffold'
import { setPendingRecipe } from '../state/pendingRecipe'
import { hrefFor } from '../router/useHashRoute'
import type { Recipe } from '../export'

export function Gallery() {
  // Open a creation in the canvas: stash its recipe, then navigate. The Workspace consumes it on mount.
  const open = (recipe: Recipe) => {
    setPendingRecipe(recipe)
    window.location.hash = hrefFor('canvas')
  }

  return (
    <div className="gallery-page">
      <header className="page-head">
        <p className="page-eyebrow">Showcase</p>
        <h1 className="page-title">Gallery</h1>
        <p className="page-lead">Saved creations — click one to open it in the canvas and keep going.</p>
      </header>

      {GALLERY.length > 0 ? (
        <div className="gallery-grid">
          {GALLERY.map((item) => {
            const r = item.recipe
            return (
              <PatternThumb
                key={item.id}
                src={item.src}
                title={item.title}
                onOpen={r ? () => open(r) : undefined}
              />
            )
          })}
        </div>
      ) : null}

      <TodoScaffold
        title="Make the gallery live"
        items={['Persist saved creations across reloads', 'Replay a pattern growing (watch mode)', 'Share / export links']}
      >
        <p>
          Click any image to load its setup into the canvas (placeholder setups for now). Drop more
          images into <code>src/assets/gallery/</code> and they appear here automatically; a real saved
          creation will carry its full setup inside the exported PNG.
        </p>
      </TodoScaffold>
    </div>
  )
}
