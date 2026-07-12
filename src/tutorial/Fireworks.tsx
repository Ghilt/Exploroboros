import { useEffect, useRef } from 'react'

// A short, self-contained celebratory particle burst on a full-screen canvas — no dependencies. Cancels
// its animation frame on unmount, and under prefers-reduced-motion it renders nothing (no motion). Each
// particle is a tiny tumbling wedge (the kalleboda tiling's wedge tile, src/tiling/generators/kalleboda.ts),
// not a plain dot, so the celebration echoes the tiling the app is about.
type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  rot: number
  vr: number
  mirror: 1 | -1
}

const COLORS = ['#e2682a', '#c0398e', '#6d2b8f', '#f2c14e', '#4bb3a6', '#ffffff']
const rand = (a: number, b: number) => a + Math.random() * (b - a)

// The kalleboda wedge's own vertices (unit edge length, see WEDGE in kalleboda.ts), reduced here to its
// centroid and scaled to a unit radius so any particle size can be substituted at draw time.
const WEDGE_RAW: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [Math.SQRT2 / 2, Math.SQRT2 / 2],
  [1 + Math.SQRT2 / 2, Math.SQRT2 / 2],
  [1 + Math.SQRT2 / 2, 1 + Math.SQRT2 / 2],
  [Math.SQRT2 / 2, 1 + Math.SQRT2 / 2],
  [0, 1 + Math.SQRT2],
  [-Math.SQRT2 / 2, 1 + Math.SQRT2 / 2],
  [0, 1],
]
function normalizedWedge(): ReadonlyArray<readonly [number, number]> {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < WEDGE_RAW.length; i += 1) {
    const [x0, y0] = WEDGE_RAW[i]
    const [x1, y1] = WEDGE_RAW[(i + 1) % WEDGE_RAW.length]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area *= 0.5
  cx /= 6 * area
  cy /= 6 * area
  const maxR = Math.max(...WEDGE_RAW.map(([x, y]) => Math.hypot(x - cx, y - cy)))
  return WEDGE_RAW.map(([x, y]) => [(x - cx) / maxR, (y - cy) / maxR] as const)
}
const WEDGE_UNIT = normalizedWedge()

function drawWedge(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.scale(p.mirror * p.size, p.size)
  ctx.beginPath()
  WEDGE_UNIT.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = p.color
  ctx.fill()
  ctx.restore()
}

export function Fireworks({ durationMs = 4200 }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    let particles: Particle[] = []
    const burst = (x: number, y: number) => {
      const base = COLORS[Math.floor(Math.random() * COLORS.length)]
      for (let i = 0; i < 42; i += 1) {
        const a = rand(0, Math.PI * 2)
        const sp = rand(1.5, 6) * dpr
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: rand(45, 95),
          color: Math.random() < 0.25 ? COLORS[Math.floor(Math.random() * COLORS.length)] : base,
          size: rand(5, 10) * dpr,
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.22, 0.22),
          mirror: Math.random() < 0.5 ? 1 : -1,
        })
      }
    }

    let start = 0
    let lastBurst = -1e9
    let raf = 0
    const frame = (t: number) => {
      if (!start) start = t
      const elapsed = t - start
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (elapsed < durationMs * 0.6 && t - lastBurst > 240) {
        lastBurst = t
        burst(rand(canvas.width * 0.15, canvas.width * 0.85), rand(canvas.height * 0.12, canvas.height * 0.55))
      }
      const g = 0.05 * dpr
      particles = particles.filter((p) => p.life < p.max)
      for (const p of particles) {
        p.life += 1
        p.vy += g
        p.vx *= 0.99
        p.vy *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.max)
        drawWedge(ctx, p)
      }
      ctx.globalAlpha = 1
      if (elapsed < durationMs || particles.length > 0) raf = requestAnimationFrame(frame)
    }
    burst(canvas.width * 0.3, canvas.height * 0.35)
    burst(canvas.width * 0.7, canvas.height * 0.4)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [durationMs])

  return <canvas ref={ref} className="tut-fireworks" aria-hidden="true" />
}
