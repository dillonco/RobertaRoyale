# Roberta Royale

A free, browser-based Euchre card game. Play solo against AI or host a private game with friends — no account required.

## Features

- Practice mode vs AI (normal + easy difficulty)
- Private multiplayer rooms (2–4 players, AI fills empty seats)
- Go alone, stick-the-dealer rules
- Fully responsive — works on mobile and desktop

## Prerequisites

Node.js ≥ 16 is required to run the multiplayer server. The recommended way to install and manage Node.js is [nvm](https://github.com/nvm-sh/nvm):

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Restart your shell, then install the latest LTS release
nvm install --lts
nvm use --lts

# Verify
node --version
npm --version
```

> On macOS you can also use [Homebrew](https://brew.sh): `brew install node`
> On Windows, use [nvm-windows](https://github.com/coreybutler/nvm-windows) or the official installer at nodejs.org.

Solo mode (practice vs AI) opens directly in the browser with no Node.js required.

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

### Backend — Mac (self-hosted, Docker)

The WebSocket server runs in Docker on a Mac, deployed automatically via a GitHub Actions self-hosted runner.

**Prerequisites on the Mac:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) must be installed and running.

**One-time setup on the Mac:**

```bash
git clone https://github.com/your-org/RobertaRoyale /Users/nix/RobertaRoyale
cd /Users/nix/RobertaRoyale
bash scripts/start.sh
```

Install the GitHub Actions self-hosted runner on the Mac (Settings → Actions → Runners → New self-hosted runner), then every push to `main` auto-deploys via `.github/workflows/deploy-mac.yml`.

**Manual start/stop/restart:**

```bash
bash scripts/start.sh    # build image and start container
bash scripts/stop.sh     # stop and remove container
bash scripts/restart.sh  # rebuild and restart
```

**View logs:**

```bash
docker compose logs -f
```

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
