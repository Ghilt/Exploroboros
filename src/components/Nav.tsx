import './Nav.css'
import { hrefFor, type Route } from '../router/useHashRoute'

const LINKS: ReadonlyArray<{ route: Route; label: string }> = [
  { route: 'landing', label: 'Home' },
  { route: 'canvas', label: 'Canvas' },
  { route: 'gallery', label: 'Gallery' },
]

export function Nav({ route }: { route: Route }) {
  return (
    <header className="nav-bar">
      <div className="nav container">
        <a className="nav-brand" href={hrefFor('landing')} aria-label="Exploroboros — home">
          <span className="nav-brand-mark" aria-hidden="true" />
          <span className="nav-brand-text">Exploroboros</span>
        </a>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.route}
              className="nav-link"
              href={hrefFor(link.route)}
              aria-current={route === link.route ? 'page' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
