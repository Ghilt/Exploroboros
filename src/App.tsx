import './App.css'
import { useSyncExternalStore } from 'react'
import { useRoute, chapterIdFromHash } from './router/useHashRoute'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Landing } from './pages/Landing'
import { Canvas } from './pages/Canvas'
import { Gallery } from './pages/Gallery'
import { Guide } from './pages/Guide'
import { Tutorial } from './pages/Tutorial'
import { DailyGame } from './pages/DailyGame'

const PAGES = {
  landing: Landing,
  canvas: Canvas,
  gallery: Gallery,
  guide: Guide,
  tutorial: Tutorial,
  daily: DailyGame,
} as const

function App() {
  const route = useRoute()
  const Page = PAGES[route]
  // A tutorial CHAPTER (a guided Workspace) wants the same full-height, non-scrolling layout as the
  // Canvas; the tutorial LANDING is a normal scrolling page. useRoute can't tell them apart (both are
  // the 'tutorial' route), so watch the hash's chapter sub-id directly.
  const inChapter = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    () => chapterIdFromHash(window.location.hash) !== null,
    () => false,
  )
  const canvasLike = route === 'canvas' || route === 'daily' || (route === 'tutorial' && inChapter)

  return (
    <div className={canvasLike ? 'app app-canvas' : 'app'}>
      <Nav route={route} />
      <main className="app-main">
        <Page />
      </main>
      <Footer />
    </div>
  )
}

export default App
