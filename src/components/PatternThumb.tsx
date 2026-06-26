import { useState, type ReactNode } from 'react'
import './PatternThumb.css'

type Props = {
  src: string
  title: string
  blurb?: string
  /** When set, the whole thumbnail becomes a link (e.g. into the gallery). */
  href?: string
}

export function PatternThumb({ src, title, blurb, href }: Props) {
  const [failed, setFailed] = useState(false)

  const media = failed ? (
    <div className="thumb-fallback" role="img" aria-label={`${title} — preview image not added yet`}>
      <span className="thumb-fallback-mark" aria-hidden="true">◆</span>
      <span className="thumb-fallback-note">image slot</span>
    </div>
  ) : (
    <img
      className="thumb-img"
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )

  const inner: ReactNode = (
    <>
      <div className="thumb-media">{media}</div>
      <figcaption className="thumb-cap">
        <span className="thumb-title">{title}</span>
        {blurb ? <span className="thumb-blurb">{blurb}</span> : null}
      </figcaption>
    </>
  )

  return (
    <figure className="thumb">
      {href ? (
        <a className="thumb-link" href={href}>
          {inner}
        </a>
      ) : (
        inner
      )}
    </figure>
  )
}
