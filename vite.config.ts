/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { imagetools } from 'vite-imagetools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), imagetools()],
  // Accept the Host header from public dev tunnels (loca.lt / ngrok / etc.) so
  // the phone can reach the dev server; otherwise Vite returns "Blocked request".
  server: { allowedHosts: true },
  test: {
    environment: 'jsdom',
  },
})
