# Roberta Royale

A free, browser-based Euchre card game. Play solo against AI or host a private game with friends — no account required.

## Features

- Practice mode vs AI (normal + easy difficulty)
- Private multiplayer rooms (2–4 players, AI fills empty seats)
- Go alone, stick-the-dealer rules
- Fully responsive — works on mobile and desktop

## Running locally

**Solo only (no multiplayer):**

Open `index.html` directly in a browser. No server needed.

**With multiplayer:**

```bash
npm install
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

The WebSocket server defaults to port `3000`. Override with the `PORT` environment variable:

```bash
PORT=8080 node server.js
```

## Deploying to production

The frontend (static files) and WebSocket backend can be split across hosts.

**Frontend** — deploy the static files (`index.html`, `css/`, `js/`) to any static host (Cloudflare Pages, Netlify, etc.).

**Backend** — deploy `server.js` to a host that supports persistent WebSocket connections (Fly.io, Railway, Render, etc.).

Then set your backend URL in `js/config.js`:

```js
window.WS_URL = 'wss://your-server.fly.dev';
```

## Project structure

```
index.html        Main HTML — all screens and dialogs
css/style.css     Styles
server.js         Node.js WebSocket + HTTP server
js/
  euchre.js       Pure game engine (immutable state)
  ai.js           AI bid/play logic
  network.js      WebSocket client
  app.js          App controller and UI renderer
  config.js       Runtime config (WS_URL)
```

## License

MIT
