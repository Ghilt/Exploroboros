import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the Exploroboros landing heading by default', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: /exploroboros/i }),
    ).toBeTruthy()
  })

  it('offers navigation to the canvas and gallery', () => {
    render(<App />)
    expect(screen.getAllByRole('link', { name: /canvas/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /gallery/i }).length).toBeGreaterThan(0)
  })
})
