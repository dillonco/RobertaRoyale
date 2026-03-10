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

The frontend (static files) and backend WebSocket server are deployed separately.

### Frontend — Cloudflare Pages

Deploy `index.html`, `css/`, and `js/` to Cloudflare Pages:

1. Push the repo to GitHub
2. Cloudflare Pages → Create a project → Connect the repo
3. Leave build command and output directory empty (no build step)
4. Deploy

### Backend — Mac (self-hosted)

The WebSocket server runs as a background process on a Mac, deployed automatically via a GitHub Actions self-hosted runner.

**One-time setup on the Mac:**

```bash
git clone https://github.com/your-org/RobertaRoyale /Users/nix/RobertaRoyale
cd /Users/nix/RobertaRoyale
npm ci --omit=dev
bash scripts/start.sh
```

Install the GitHub Actions self-hosted runner on the Mac (Settings → Actions → Runners → New self-hosted runner), then every push to `main` auto-deploys via `.github/workflows/deploy-mac.yml`.

**Manual start/stop/restart:**

```bash
bash scripts/start.sh
bash scripts/stop.sh
bash scripts/restart.sh
```

Server logs: `logs/server.log`

### Connect frontend to backend

Edit `js/config.js` and set `WS_URL` to the backend's public WebSocket URL (e.g. via Cloudflare Tunnel):

```js
window.WS_URL = 'wss://your-server-url';
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
