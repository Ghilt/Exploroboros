# Exploroboros

A web app for exploring **tiled planes** and growing **fractal patterns** on them — author coloring and
traversal rules on any tiling, watch fractals emerge, and export images. Works on phone and desktop.
Includes a public **community gallery** anyone can upload creations to.

> Project ethos, decisions, open questions, and lessons live in **[CLAUDE.md](./CLAUDE.md)** — start there
> for the "why." This file is the practical "how do I run it" reference.

**Live site:** https://exploroboros.pages.dev

## One-time setup

Requires **Node.js 24 LTS**.

```sh
npm install
```

**Windows PowerShell note:** this machine's security policy blocks npm's `.ps1` shims, so plain `npm` /
`npx` may fail with "not digitally signed." Use **`npm.cmd`** / **`npx.cmd`** instead (e.g. `npm.cmd run
build`), or run from a plain Command Prompt window, where it's not an issue.

To ever **deploy** or touch the real database, log in once (opens a browser to approve):
```sh
npx wrangler login
```
This is stored per-Windows-account, not per-project — you only do it once, ever, on this machine.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Frontend only → **http://localhost:5173**, instant hot-reload. The **Gallery page won't work** in this mode — there's no backend behind it. Use for pure UI/styling work. |
| `npm run dev:local` | The full app **with a working local gallery** → **http://localhost:8788**. Seeds a handful of sample fractals into a local, private database + image store on first run. Edit a file → it auto-rebuilds (~2s) → **refresh the browser** to see it (not true hot-reload, but close). |
| `npm run seed:local` | Re-seed the local sample gallery data on demand (safe to run anytime; skips if already seeded). |
| `npm run build` | Type-check + production build → `dist/`. |
| `npm run preview` | Serve the production build (`dist/`) as a static site — no backend, same caveat as `dev`. |
| `npm run lint` | Run the linter (oxlint). |
| `npx vitest run` | Run the automated test suite once. |
| `npm run branches` | **Dashboard of every git worktree** (e.g. every Claude Code session) and whether its dev server is running — see below. |
| `npm run deploy` | Build **and push the app live** to https://exploroboros.pages.dev. One command, ~20–30 seconds. |
| `npm run db:migrate` | Apply a database schema change to the **real, live** database. Only needed when a change adds/alters a database table — you'll be told explicitly when that's the case. |
| `npm run db:migrate:local` | Same, but for your local database only. Normally automatic (part of `dev:local`) — rarely needed by hand. |

**The gallery has two separate "worlds":**
- **Local** (`npm run dev:local`) — a private database + image store that lives only on your machine.
  Anything you upload or seed here never touches the real site and disappears if you delete `.wrangler/`.
- **Live** (`npm run deploy`) — the real, public database everyone sees at exploroboros.pages.dev.

Only `npm run deploy` and `npm run db:migrate` ever touch the live one — everything else is local-only and
safe to experiment with freely.

## `npm run branches` — see what's running where

If you (or Claude Code) have several worktrees/sessions going at once, each on its own branch, this gives
you a live status board:

```sh
npm run branches
```

It lists every git worktree, whether its dev server (`npm run dev`) is running and on which port, flags
any orphaned leftover servers, and shows any active phone tunnel (ngrok/localtunnel) and which worktree it
points at. Pick a number to start/stop that worktree's server, `r` to refresh, `q` to quit.

**Current limitation:** it only tracks the plain frontend dev server (`npm run dev`, ports ~5170–5700) — it
does **not** yet know about a worktree's `npm run dev:local` gallery backend (which lives on a different
port range, ~8800+). If you need to check whether a worktree's *local gallery* is up, visit its URL
directly or ask whoever/whatever started it which port it used.

## Viewing it on your phone

**For the real, live site:** just open **https://exploroboros.pages.dev** on your phone directly — it's
already public, no tunnel needed.

**For testing uncommitted local work on your phone,** use **ngrok**:

```sh
ngrok http 5173     # tunnels `npm run dev` (frontend only, gallery won't work)
ngrok http 8788     # tunnels `npm run dev:local` (full app, gallery works with local sample data)
```

It prints a public HTTPS URL in the terminal (with a reserved ngrok domain it's the same URL every
time). On your phone, tap ngrok's one-time **"Visit Site"** button and the app loads normally.

Keep the `ngrok` command running in its own terminal window while you're using it.

**Known snags + fixes:**
- **`ngrok` says "the system cannot find the file specified"** — a broken Windows shortcut is shadowing
  the real program. Fix: delete `%LOCALAPPDATA%\Microsoft\WindowsApps\ngrok.exe` (Windows will silently
  offer to recreate it via Settings → App execution aliases — just delete the file), then try again.
- **`ERR_NGROK_121` "agent version too old"** — run `ngrok update`, then try again.

## Multiple Claude Code sessions at once

Each Claude Code session/worktree is fully isolated: its own branch, its own local gallery database and
images (nothing shared between sessions), so several can run and experiment locally in parallel without
interfering with each other. The **only** shared thing across all of them is the one real live site —
which only changes when someone actually runs `npm run deploy` (or `npm run db:migrate` for a schema
change). Use `npm run branches` to see which sessions currently have a dev server running.
