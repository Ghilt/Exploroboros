import { useMemo } from 'react'
import './Landing.css'
import { hrefFor } from '../router/useHashRoute'
import { GALLERY, pickRandom } from '../data/gallery'
import { PatternThumb } from '../components/PatternThumb'

const FEATURES: ReadonlyArray<{ icon: string; title: string; body: string }> = [
  {
    icon: '✦',
    title: 'Playful exploration',
    body: 'Wander across any tiled plane, poke at tiles, and watch what unfolds, guided by nothing but curiosity.',
  },
  {
    icon: '✎',
    title: 'A powerful, intuitive editor',
    body: 'Author coloring and traversal rules by hand, with an expressive visual editor backed by a dedicated language.',
  },
  {
    icon: '♡',
    title: 'No accounts, no ads',
    body: 'No sign-ups, no tracking, nothing to buy. Just for the love of it.',
  },
]

export function Landing() {
  const featured = useMemo(() => pickRandom(GALLERY, 3), [])

  return (
    <div className="landing">
      <section className="landing-hero">
        <p className="landing-eyebrow">Tiled-plane · fractal exploration</p>
        <h1 className="landing-title">Exploroboros</h1>
        <div className="landing-cta">
          <a className="btn btn-primary" href={hrefFor('canvas')}>
            Open the Canvas
          </a>
          <a className="btn btn-ghost" href={hrefFor('gallery')}>
            Browse the Gallery →
          </a>
        </div>
      </section>

      <section className="landing-features" aria-label="What it is">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="feature">
            <span className="feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <h2 className="feature-title">{feature.title}</h2>
            <p className="feature-body">{feature.body}</p>
          </article>
        ))}
      </section>

      {featured.length > 0 ? (
        <section className="landing-gallery" aria-label="From the gallery">
          <div className="landing-gallery-head">
            <h2 className="landing-section-title">From the gallery</h2>
            <a className="landing-link" href={hrefFor('gallery')}>
              See all →
            </a>
          </div>
          <div className="landing-gallery-grid">
            {featured.map((item) => (
              <PatternThumb key={item.id} src={item.src} title={item.title} href={hrefFor('gallery')} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
