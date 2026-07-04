import type { CreationItem } from '../gallery/types'

// One creation in the gallery grid: its compact image (click → spotlight) + name + an upvote button.
type Props = {
  item: CreationItem
  voted: boolean
  onUpvote: () => void
  onOpen: () => void
}

export function GalleryCard({ item, voted, onUpvote, onOpen }: Props) {
  return (
    <figure className="gcard">
      <button type="button" className="gcard-open" onClick={onOpen} title={`Open “${item.name}”`}>
        <img className="gcard-img" src={item.imageUrl} alt={item.name} loading="lazy" />
      </button>
      <figcaption className="gcard-cap">
        <span className="gcard-name" title={item.name}>
          {item.name}
        </span>
        <button
          type="button"
          className={`gcard-vote${voted ? ' is-voted' : ''}`}
          onClick={onUpvote}
          disabled={voted}
          title={voted ? 'You upvoted this' : 'Upvote'}
          aria-label={`Upvote ${item.name}, currently ${item.upvotes}`}
        >
          <span className="gcard-vote-mark" aria-hidden="true">▲</span>
          <span className="gcard-vote-count">{item.upvotes}</span>
        </button>
      </figcaption>
    </figure>
  )
}
