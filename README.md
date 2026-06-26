# Exploroboros

A web app for exploring **tiled planes** and growing **fractal patterns** on them — author coloring and
traversal rules on any tiling, watch fractals emerge, and export images. Works on phone and desktop.

> Project ethos, decisions, open questions, and lessons live in **[CLAUDE.md](./CLAUDE.md)** — start there.

## Develop

Requires **Node.js 24 LTS**.

```sh
npm install        # once
npm run dev        # dev server → http://localhost:5173
npm run build      # typecheck (tsc -b) + production build → dist/
npm run preview    # serve the production build
npm run lint       # oxlint
npx vitest run     # run unit tests once
```

## Verify on a phone

- **Cloudflare Quick Tunnel** (free, no account, HTTPS):
  ```sh
  winget install --id Cloudflare.cloudflared        # once
  cloudflared tunnel --url http://localhost:5173    # with `npm run dev` running
  ```
  Open the printed `https://….trycloudflare.com` URL on your phone.
- **Or same Wi-Fi:** `npm run dev -- --host`, then open `http://<your-PC-IP>:5173` on the phone.

## Status

**Phase 0** — responsive hello world. See [CLAUDE.md](./CLAUDE.md) §6 for the roadmap.
