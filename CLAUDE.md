# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local development

```bash
# Solo mode — no server needed, open directly in browser:
open index.html

# Multiplayer (requires Node.js ≥ 16):
npm install
node server.js
# → http://localhost:3000
# Open two tabs and create/join the same room code to test multiplayer locally.
```

No build step, no bundler, no transpilation. Changes to any file take effect on the next browser refresh.

The `PORT` environment variable overrides the default 3000:
```bash
PORT=8080 node server.js
```

## Production deployment

### Architecture

```
Players → Cloudflare Pages (CDN)     — serves index.html, css/, js/
             ↓ WebSocket
          WebSocket server (Fly.io)  — runs server.js, holds room state in memory
```

Solo mode (Practice vs AI) works entirely from Cloudflare Pages with no backend.
Multiplayer requires the WebSocket server.

---

### 1. WebSocket server — Fly.io

Fly.io is recommended: free allowance covers a single small VM, WebSockets work without any proxy config, and `fly deploy` handles everything.

**One-time setup:**
```bash
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login
fly launch                   # creates fly.toml, detects Node, sets PORT automatically
```

When prompted: choose a name (e.g. `euchre-server`), pick a region close to your users, decline Postgres.

**`fly.toml` — key settings to confirm:**
```toml
[http_service]
  internal_port = 3000
  force_https = true

  [[http_service.checks]]
    path = "/"          # server.js serves 200 on /
```

**Deploy:**
```bash
fly deploy
# Server will be live at https://euchre-server.fly.dev
# WebSocket endpoint: wss://euchre-server.fly.dev
```

> **Important:** Room state lives in memory. A `fly deploy` or crash clears all active rooms. This is acceptable for a card game — active players get disconnected and see the disconnect screen. For persistence across deploys, Fly Machines' `[mounts]` could store state to disk, but that's not needed yet.

---

### 2. Configure the frontend WebSocket URL

Edit `js/config.js` and set `WS_URL` to your Fly.io server:

```js
window.WS_URL = 'wss://euchre-server.fly.dev';
```

This file is the only thing that changes between local dev (`null`) and production.

---

### 3. Frontend — Cloudflare Pages

**Files to deploy:** everything except `server.js`, `node_modules/`, `package.json`, `.gitignore` — i.e. `index.html`, `css/`, `js/` (including the updated `config.js`).

**Setup via Cloudflare dashboard:**
1. Push the repo to GitHub
2. Go to Cloudflare Pages → Create a project → Connect to GitHub repo
3. Build settings:
   - **Build command:** *(leave empty — no build step)*
   - **Output directory:** *(leave empty or set to `/`)*
4. Deploy

After the first deploy, Cloudflare Pages gives you a `*.pages.dev` URL. You can add a custom domain in the Pages dashboard.

**No `_redirects` file is needed** — the app is entirely single-page with no client-side routing.

---

### 4. CORS — server.js

The WebSocket upgrade request from `pages.dev` (or your custom domain) will include an `Origin` header. The current `server.js` does not validate `Origin`, so it accepts connections from any origin by default. That's fine for a public game. If you want to lock it down later, add an origin check in the `wss.on('connection')` handler.

---

### Deployment checklist

- [ ] `js/config.js` — `WS_URL` set to `wss://your-server.fly.dev`
- [ ] `fly deploy` succeeded, server responds at the HTTPS URL
- [ ] Cloudflare Pages deployed with updated `config.js`
- [ ] Open the site, create a Private Game room — confirm the WebSocket connects

---

## Architecture

### Two execution environments

The same game logic runs in two places:

1. **Browser (solo mode):** `euchre.js` + `ai.js` + `network.js` + `app.js` loaded as plain `<script defer>` tags. All globals (`Euchre`, `EuchreAI`, `Network`) are set on `window`. `config.js` loads synchronously (no `defer`) so `window.WS_URL` is available when the deferred scripts run.

2. **Node.js server (multiplayer):** `server.js` loads `euchre.js` via `require()`, then sets `global.Euchre` before loading `ai.js` — because `ai.js` reads `Euchre` from global scope to work in both environments.

### State flow

```
BIDDING_ROUND1 → BIDDING_ROUND2 → DEALER_DISCARD → PLAYING → TRICK_END → HAND_END → (next hand or game over)
```

- State never skips HAND_END. GAME_OVER is only a `Phase` constant; the server calls `broadcastGameOver()` + deletes the room instead of setting that phase.
- Every state mutation returns a **new object** — `euchre.js` is purely functional with no mutation.

### Solo vs multiplayer in app.js

`multiplayerMode` (bool) and `mySeatIndex` (0–3) are the key flags.

- **Solo:** `app.js` drives the game loop via `processGameLoop()`, which schedules AI actions with `setTimeout`. Human is always seat 0 (South).
- **Multiplayer:** Server drives everything. `processGameLoop()` is a no-op. The client just re-renders on each `game_state` message. `seatToPos(seatIdx)` rotates the board so the local player always appears at South.

### Perspective rotation

```js
seatToPos(seatIdx) = ['south','west','north','east'][(seatIdx - mySeatIndex + 4) % 4]
```

### Teams

Seat 0 (South) + Seat 2 (North) = team 0. Seats 1 + 3 = team 1.

### Server room lifecycle

- `rooms` Map: max 100 rooms. Room is deleted when all players disconnect pre-game or when `broadcastGameOver()` is called.
- Disconnected mid-game: seat is added to `room.aiSeats` and AI takes over — the player object stays with `ws = null`.
- TRICK_END: server auto-advances after 1400ms via `_trickTimer`. HAND_END requires host to send `{action:'next_hand'}`.

### Key files

| File | Role |
|------|------|
| `js/config.js` | Runtime config — set `WS_URL` here for production. |
| `js/euchre.js` | Pure game engine — all rules, state transitions, card logic. Exported as `Euchre` namespace. |
| `js/ai.js` | Bid/discard/play decisions. Exported as `EuchreAI`. Reads `Euchre` from global scope. |
| `js/network.js` | WebSocket client wrapper. Uses `window.WS_URL` if set, otherwise same-origin. |
| `js/app.js` | App controller + all UI rendering. Single IIFE. |
| `server.js` | HTTP static file server + WebSocket game server. Handles all room/AI logic for multiplayer. |

### XSS safety

Player names must be escaped before inserting into `innerHTML`. Use the `escHtml()` helper defined at the top of `app.js`. All other name display uses `.textContent` and is safe by default.

### CSS conventions

- CSS variables defined in `:root` in `style.css` — `--accent` is `#93f005` (green).
- WCAG AA contrast maintained. ARIA live regions (`#live-status`, `#live-alert`) used for screen-reader announcements via `announce()` in app.js.
- Responsive breakpoints are `@media` blocks at the bottom of `style.css`.

---

## Mobile development

### Target device

Primary target is **iPhone 15 Pro** (393×852 CSS px, `device-pixel-ratio: 3`). All layout changes must be verified at this viewport first.

### Layout structure

The game table uses a 3-column CSS grid:

```
[west 60px] [center 1fr] [east 60px]
```

Breakpoints:
- `≤ 480px` — `60px 1fr 60px` (mobile default)
- `≤ 360px` — `52px 1fr 52px`
- `≥ 768px` — `120px 1fr 120px`
- `≥ 1024px` — `140px 1fr 140px`
- `≥ 1280px` — `200px 1fr 200px`

### East/west card backs

East and west player cards are rendered upright in layout then rotated ±90° with `transform: rotate`. **CSS transforms do not affect layout flow** — the card's layout box stays its original size. This means the visual footprint extends outside the layout box and can overflow/clip if columns are too narrow.

Current sizes at `≤ 480px`: `18×26px`. After rotation the visual width is 26px, which fits within the ~47px inner column width.

At `≤ 360px`: `16×22px`.

### Centering #human-hand-wrapper

Use `left: 0; right: 0; margin: 0 auto` — **not** `left: 50%; transform: translateX(-50%)`. The translate approach breaks in Mobile Safari when any element causes document overflow, because `left: 50%` resolves against the wider document rather than the viewport.

Both `html` and `body` have `overflow-x: hidden` to prevent horizontal scroll on mobile.

### Touch targets

All interactive elements (buttons, cards) must meet the 44×44px minimum touch target size. Cards smaller than 44px use padding or wrapper sizing to achieve this.

### Testing checklist for CSS changes

1. iPhone 15 Pro (393px) — solo game, all 4 players visible
2. 360px viewport (Chrome DevTools → Galaxy S20) — all players visible
3. Landscape mobile (`max-height: 500px`) — no overlap with hand wrapper
4. Play cards to reduce hand size — fan stays centered
5. Confirm east player is not clipped by `.game-table { overflow: hidden }`
