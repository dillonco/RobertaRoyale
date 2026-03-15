'use strict';

const http   = require('http');
const WebSocket = require('ws');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Load game modules ─────────────────────────────────────────────────────────
const Euchre = require('./js/euchre.js');
global.Euchre = Euchre;          // ai.js reads Euchre from global scope
const EuchreAI = require('./js/ai.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.xml':  'application/xml',
  '.txt':  'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// ── Room state ────────────────────────────────────────────────────────────────
// room = { code, players:[{id,name,seatIndex,ws,reconnectToken,disconnectedAt,_reconnectTimer}],
//          gameState, hostId, aiSeats, aiDifficulty, _aiTimer, _trickTimer }
const rooms = new Map();

const RECONNECT_GRACE_MS = 3 * 60 * 1000; // 3 minutes

function genReconnectToken() {
  return crypto.randomBytes(16).toString('hex');
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function playerList(room) {
  return room.players.map(p => ({
    id:        p.id,
    name:      p.name,
    seatIndex: p.seatIndex,
    connected: !!p.ws && p.ws.readyState === 1,
  }));
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, excludeId = null) {
  room.players.forEach(p => { if (p.id !== excludeId) send(p.ws, msg); });
}

/** Return state with only `seatIndex`'s hand visible; others replaced with nulls. */
function filteredState(state, seatIndex) {
  return {
    ...state,
    hands: state.hands.map((h, i) => i === seatIndex ? h : h.map(() => null)),
  };
}

// ── Message handlers ──────────────────────────────────────────────────────────

function handleCreate(ws, msg) {
  if (ws.roomCode) return send(ws, { type: 'error', message: 'Already in a room.' });
  if (rooms.size >= 100) return send(ws, { type: 'error', message: 'Server is full. Try again later.' });
  const code   = genCode();
  const token  = genReconnectToken();
  const player = { id: ws.id, name: (msg.playerName || 'Host').slice(0, 20), seatIndex: 0, ws, reconnectToken: token };
  const room   = {
    code, players: [player], gameState: null,
    hostId: ws.id, aiSeats: [], aiDifficulty: 'normal', _aiTimer: null, _trickTimer: null,
  };
  rooms.set(code, room);
  ws.roomCode = code;
  send(ws, { type: 'room_created', code, seatIndex: 0, players: playerList(room), isHost: true, reconnectToken: token });
}

function handleJoin(ws, msg) {
  if (ws.roomCode) return send(ws, { type: 'error', message: 'Already in a room.' });
  const code = (msg.code || '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room)                return send(ws, { type: 'error', message: 'Room not found. Check the code and try again.' });
  if (room.players.length >= 4) return send(ws, { type: 'error', message: 'Room is full (4 / 4 players).' });
  if (room.gameState)       return send(ws, { type: 'error', message: 'Game already in progress.' });

  const seatIndex = room.players.length;
  const token     = genReconnectToken();
  const player    = { id: ws.id, name: (msg.playerName || `Player ${seatIndex + 1}`).slice(0, 20), seatIndex, ws, reconnectToken: token };
  room.players.push(player);
  ws.roomCode = code;

  send(ws, { type: 'room_joined', code, seatIndex, players: playerList(room), isHost: false, reconnectToken: token });
  broadcast(room, { type: 'player_joined', players: playerList(room) }, ws.id);
}

function handleChangeSeat(ws, msg) {
  const room = rooms.get(ws.roomCode);
  if (!room || room.gameState) return;

  const target    = parseInt(msg.seat, 10);
  if (isNaN(target) || target < 0 || target > 3) return;

  const requester = room.players.find(p => p.id === ws.id);
  if (!requester || requester.seatIndex === target) return;

  const occupant  = room.players.find(p => p.seatIndex === target);
  if (occupant) occupant.seatIndex = requester.seatIndex;
  requester.seatIndex = target;

  const list = playerList(room);
  room.players.forEach(p => {
    if (p.ws) send(p.ws, { type: 'seat_changed', players: list, seatIndex: p.seatIndex });
  });
}

function handleStart(ws, msg) {
  const room = rooms.get(ws.roomCode);
  if (!room || room.hostId !== ws.id) return;
  if (room.gameState) return send(ws, { type: 'error', message: 'Game already started.' });
  if (room.players.length < 2) return send(ws, { type: 'error', message: 'Need at least 2 players to start.' });

  const AI_NAMES = { 0: 'South AI', 1: 'West AI', 2: 'Partner AI', 3: 'East AI' };
  const occupied = new Set(room.players.map(p => p.seatIndex));
  const aiSeats  = [0, 1, 2, 3].filter(i => !occupied.has(i));
  const names    = Array.from({ length: 4 }, (_, i) => room.players.find(p => p.seatIndex === i)?.name || AI_NAMES[i]);
  const target   = parseInt(msg.target, 10) || 10;
  const diff     = ['easy', 'normal', 'hard'].includes(msg.aiDifficulty) ? msg.aiDifficulty : 'normal';

  room.aiSeats      = aiSeats;
  room.aiDifficulty = diff;
  room.gameState    = Euchre.createGame(names, 0, target, {
    canadianLoner: !!msg.canadianLoner,
    tramEnabled:   msg.tram !== false,
  });

  room.players.forEach(p => {
    send(p.ws, {
      type: 'game_started',
      seatIndex: p.seatIndex,
      state: filteredState(room.gameState, p.seatIndex),
    });
  });

  scheduleAI(room);
}

function handleAction(ws, msg) {
  const room = rooms.get(ws.roomCode);
  if (!room || !room.gameState) return;
  const player = room.players.find(p => p.id === ws.id);
  if (!player) return;

  const P    = Euchre.Phase;
  const s    = room.gameState;
  const seat = player.seatIndex;

  try {
    switch (msg.action) {
      case 'order_up':
        if (s.phase !== P.BIDDING_ROUND1 || s.currentBidder !== seat) return;
        room.gameState = Euchre.actionOrderUp(s, seat, !!msg.alone);
        // If dealer is AI, auto-discard
        if (room.gameState.phase === P.DEALER_DISCARD && room.aiSeats.includes(room.gameState.currentPlayer)) {
          const di = EuchreAI.getDiscard(room.gameState, room.gameState.currentPlayer, room.aiDifficulty || 'normal');
          room.gameState = Euchre.actionDealerDiscard(room.gameState, di);
        }
        break;
      case 'pass_r1':
        if (s.phase !== P.BIDDING_ROUND1 || s.currentBidder !== seat) return;
        room.gameState = Euchre.actionPassRound1(s, seat);
        break;
      case 'call_suit':
        if (s.phase !== P.BIDDING_ROUND2 || s.currentBidder !== seat) return;
        room.gameState = Euchre.actionCallSuit(s, seat, msg.suit, !!msg.alone);
        break;
      case 'pass_r2':
        if (s.phase !== P.BIDDING_ROUND2 || s.currentBidder !== seat) return;
        room.gameState = Euchre.actionPassRound2(s, seat);
        break;
      case 'discard':
        if (typeof msg.cardIndex !== 'number') return;
        if (s.phase !== P.DEALER_DISCARD || s.currentPlayer !== seat) return;
        room.gameState = Euchre.actionDealerDiscard(s, msg.cardIndex);
        break;
      case 'play_card':
        if (typeof msg.cardIndex !== 'number') return;
        if (s.phase !== P.PLAYING || s.currentPlayer !== seat) return;
        room.gameState = Euchre.actionPlayCard(s, seat, msg.cardIndex);
        break;
      case 'next_hand':
        if (s.phase !== P.HAND_END || room.hostId !== ws.id) return;
        if (s.scores.some(sc => sc >= s.targetScore)) {
          broadcastGameOver(room);
          return;
        }
        room.gameState = Euchre.startNextHand(s);
        break;
      default:
        return;
    }
  } catch (err) {
    console.error('Action error:', err.message);
    return send(ws, { type: 'error', message: err.message });
  }

  broadcastState(room);
  scheduleAI(room);
}

function handleDisconnect(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const idx = room.players.findIndex(p => p.id === ws.id);
  if (idx === -1) return;

  if (!room.gameState) {
    // Pre-game: remove and reassign seats
    const leftName = room.players[idx].name;
    room.players.splice(idx, 1);
    room.players.forEach((p, i) => { p.seatIndex = i; });
    if (room.players.length === 0) { rooms.delete(room.code); return; }
    if (room.hostId === ws.id) {
      room.hostId = room.players[0].id;
      broadcast(room, { type: 'host_changed', hostId: room.hostId });
    }
    broadcast(room, { type: 'player_left', players: playerList(room), name: leftName });
  } else {
    // In-game: start grace period before handing seat to AI
    const p = room.players[idx];
    p.ws             = null;
    p.disconnectedAt = Date.now();
    broadcast(room, { type: 'player_disconnected', name: p.name, seatIndex: p.seatIndex }, ws.id);

    // Start reconnect timer — after grace period, hand off to AI permanently
    p._reconnectTimer = setTimeout(() => {
      p._reconnectTimer = null;
      if (!rooms.has(room.code)) return; // room was deleted
      if (!room.aiSeats.includes(p.seatIndex)) room.aiSeats.push(p.seatIndex);
      broadcast(room, { type: 'player_disconnected', name: p.name, seatIndex: p.seatIndex });
      scheduleAI(room);
    }, RECONNECT_GRACE_MS);

    // Still schedule AI in case it's their turn right now
    scheduleAI(room);
  }
}

function handleRejoin(ws, msg) {
  const code  = (msg.code || '').toUpperCase().trim();
  const token = msg.reconnectToken;
  const room  = rooms.get(code);
  if (!room || !room.gameState) return send(ws, { type: 'error', message: 'Room not found or game not in progress.' });

  const player = room.players.find(p => p.reconnectToken === token);
  if (!player) return send(ws, { type: 'error', message: 'Reconnect token invalid or expired.' });

  // Clear grace period timer
  if (player._reconnectTimer) {
    clearTimeout(player._reconnectTimer);
    player._reconnectTimer = null;
  }

  // Remove from aiSeats if present (they're back)
  const aiIdx = room.aiSeats.indexOf(player.seatIndex);
  if (aiIdx !== -1) room.aiSeats.splice(aiIdx, 1);

  // Restore ws and update player id to new connection
  player.ws = ws;
  player.id = ws.id;
  player.disconnectedAt = null;
  ws.roomCode = code;

  send(ws, {
    type:       'game_rejoined',
    seatIndex:  player.seatIndex,
    state:      filteredState(room.gameState, player.seatIndex),
  });

  broadcast(room, { type: 'player_rejoined', name: player.name, seatIndex: player.seatIndex }, player.id);
}

// ── State broadcasting ────────────────────────────────────────────────────────

function broadcastState(room) {
  const P = Euchre.Phase;
  const s = room.gameState;

  room.players.forEach(p => {
    if (p.ws) send(p.ws, { type: 'game_state', state: filteredState(s, p.seatIndex) });
  });

  // Auto-advance TRICK_END after delay
  if (s.phase === P.TRICK_END && !room._trickTimer) {
    room._trickTimer = setTimeout(() => {
      room._trickTimer = null;
      if (!room.gameState || room.gameState.phase !== P.TRICK_END) return;
      room.gameState = Euchre.advanceTrick(room.gameState);
      broadcastState(room);
      scheduleAI(room);
    }, 1400);
  }
}

function broadcastGameOver(room) {
  const s = room.gameState;
  broadcast(room, { type: 'game_over', scores: s.scores, targetScore: s.targetScore });
  clearTimeout(room._aiTimer);
  clearTimeout(room._trickTimer);
  // Clear any pending reconnect timers
  room.players.forEach(p => { if (p._reconnectTimer) { clearTimeout(p._reconnectTimer); p._reconnectTimer = null; } });
  rooms.delete(room.code);
}

// ── AI scheduling ─────────────────────────────────────────────────────────────

function scheduleAI(room) {
  if (!room.gameState || room._aiTimer) return;
  const P = Euchre.Phase;
  const s = room.gameState;
  if (s.phase === P.TRICK_END || s.phase === P.HAND_END) return;

  let actor = null;
  if (s.phase === P.BIDDING_ROUND1 || s.phase === P.BIDDING_ROUND2) actor = s.currentBidder;
  else if (s.phase === P.DEALER_DISCARD || s.phase === P.PLAYING)   actor = s.currentPlayer;
  if (actor === null || !room.aiSeats.includes(actor)) return;

  room._aiTimer = setTimeout(() => {
    room._aiTimer = null;
    if (!room.gameState) return;
    const s2 = room.gameState;
    const P2 = Euchre.Phase;

    const diff = room.aiDifficulty || 'normal';
    try {
      if (s2.phase === P2.BIDDING_ROUND1 && room.aiSeats.includes(s2.currentBidder)) {
        const d = EuchreAI.getBidR1(s2, s2.currentBidder, diff);
        room.gameState = d.action === 'order'
          ? Euchre.actionOrderUp(s2, s2.currentBidder, d.alone)
          : Euchre.actionPassRound1(s2, s2.currentBidder);
        const gs = room.gameState;
        if (gs.phase === P2.DEALER_DISCARD && room.aiSeats.includes(gs.currentPlayer)) {
          const di = EuchreAI.getDiscard(gs, gs.currentPlayer, diff);
          room.gameState = Euchre.actionDealerDiscard(gs, di);
        }
      } else if (s2.phase === P2.BIDDING_ROUND2 && room.aiSeats.includes(s2.currentBidder)) {
        const d = EuchreAI.getBidR2(s2, s2.currentBidder, diff);
        room.gameState = d.action === 'call'
          ? Euchre.actionCallSuit(s2, s2.currentBidder, d.suit, d.alone)
          : Euchre.actionPassRound2(s2, s2.currentBidder);
      } else if (s2.phase === P2.DEALER_DISCARD && room.aiSeats.includes(s2.currentPlayer)) {
        const di = EuchreAI.getDiscard(s2, s2.currentPlayer, diff);
        room.gameState = Euchre.actionDealerDiscard(s2, di);
      } else if (s2.phase === P2.PLAYING && room.aiSeats.includes(s2.currentPlayer)) {
        const ci = EuchreAI.getPlay(s2, s2.currentPlayer, diff);
        room.gameState = Euchre.actionPlayCard(s2, s2.currentPlayer, ci);
      } else {
        return;
      }
    } catch (err) {
      console.error('AI error:', err.message);
      return;
    }

    broadcastState(room);
    scheduleAI(room);
  }, 700 + Math.random() * 600);
}

// ── HTTP static file server ───────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  const urlPath  = req.url.split('?')[0];

  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const filePath = path.resolve(ROOT, '.' + urlPath === '/.' ? '/index.html' : '.' + urlPath);
  const safe     = path.resolve(ROOT, urlPath === '/' ? 'index.html' : urlPath.slice(1));

  if (!safe.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(safe, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(safe).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────────────────────────────────────

const wss = new WebSocket.Server({ server: httpServer });
let nextId = 1;

wss.on('connection', ws => {
  ws.id       = `p${nextId++}`;
  ws.roomCode = null;

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'create_room': handleCreate(ws, msg); break;
        case 'join_room':   handleJoin(ws, msg);   break;
        case 'rejoin_room': handleRejoin(ws, msg); break;
        case 'change_seat': handleChangeSeat(ws, msg); break;
        case 'start_game':  handleStart(ws, msg);  break;
        case 'game_action': handleAction(ws, msg); break;
      }
    } catch (e) { console.error('WS message error:', e.message); }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', err => console.error('WS error:', err.message));
});

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`\n  Roberta Royale — http://localhost:${PORT}\n`);
  });
}

module.exports = { httpServer, wss };
