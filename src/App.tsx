import './App.css'
import { useRoute } from './router/useHashRoute'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Landing } from './pages/Landing'
import { Canvas } from './pages/Canvas'
import { Gallery } from './pages/Gallery'

const PAGES = {
  landing: Landing,
  canvas: Canvas,
  gallery: Gallery,
} as const

function App() {
  const route = useRoute()
  const Page = PAGES[route]

  return (
    <div className="app">
      <Nav route={route} />
      <main className="app-main">
        <Page />
      </main>
      <Footer />
    </div>
  )
}

export default App
