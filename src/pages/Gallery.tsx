import './Gallery.css'
import { GALLERY } from '../data/gallery'
import { PatternThumb } from '../components/PatternThumb'
import { TodoScaffold } from '../components/TodoScaffold'

export function Gallery() {
  return (
    <div className="gallery-page">
      <header className="page-head">
        <p className="page-eyebrow">Showcase</p>
        <h1 className="page-title">Gallery</h1>
        <p className="page-lead">Saved creations — watch the patterns that emerged on the plane.</p>
      </header>

      {GALLERY.length > 0 ? (
        <div className="gallery-grid">
          {GALLERY.map((item) => (
            <PatternThumb key={item.id} src={item.src} title={item.title} />
          ))}
        </div>
      ) : null}

      <TodoScaffold
        title="Make the gallery live"
        items={[
          'Persist and load saved creations',
          'Replay a pattern growing (watch mode)',
          'Re-open a creation back in the canvas',
          'Share / export links',
        ]}
      >
        <p>
          These are example renders. Drop more images into <code>src/assets/gallery/</code> and
          they appear here automatically.
        </p>
      </TodoScaffold>
    </div>
  )
}
