import './Nav.css'
import { useEffect, useRef, useState } from 'react'
import { BrandMark } from './BrandMark'
import { hrefFor, type Route } from '../router/useHashRoute'

const LINKS: ReadonlyArray<{ route: Route; label: string }> = [
  { route: 'landing', label: 'Home' },
  { route: 'canvas', label: 'Canvas' },
  { route: 'gallery', label: 'Gallery' },
  { route: 'tutorial', label: 'Tutorial' },
]

export function Nav({ route }: { route: Route }) {
  // Four links + the brand no longer fit a phone width, so on mobile the links collapse behind a
  // hamburger (a dropdown); desktop keeps them inline. Which is shown is decided by CSS media query —
  // this state only drives the dropdown's open/closed.
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  // Close on route change (a link was followed).
  useEffect(() => setMenuOpen(false), [route])

  // Close on an outside tap / Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <header className="nav-bar">
      <div className="nav container" ref={navRef}>
        <a className="nav-brand" href={hrefFor('landing')} aria-label="Exploroboros — home">
          <BrandMark className="nav-brand-mark" />
          <span className="nav-brand-text">Exploroboros</span>
        </a>
        <button
          type="button"
          className="nav-hamburger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            {menuOpen ? (
              <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            ) : (
              <path d="M4 7 H20 M4 12 H20 M4 17 H20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <nav className={`nav-links${menuOpen ? ' is-open' : ''}`} aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.route}
              className="nav-link"
              href={hrefFor(link.route)}
              aria-current={route === link.route ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
