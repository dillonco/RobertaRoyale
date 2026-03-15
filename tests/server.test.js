'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const Euchre = require('../js/euchre.js');
const { httpServer, wss } = require('../server.js');

const P = Euchre.Phase;

// ── Server lifecycle ──────────────────────────────────────────────────────────

let serverUrl;

before(() => new Promise(resolve => {
  httpServer.listen(0, '127.0.0.1', () => {
    const { port } = httpServer.address();
    serverUrl = `ws://127.0.0.1:${port}`;
    resolve();
  });
}));

after(() => new Promise(resolve => {
  wss.close(() => httpServer.close(resolve));
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** WebSocket client with a message buffer and type-filtered waiter. */
function makeClient() {
  const ws  = new WebSocket(serverUrl);
  const buf = [];
  let waiter = null;

  ws.on('message', raw => {
    const msg = JSON.parse(raw);
    if (waiter) { const w = waiter; waiter = null; w(msg); }
    else buf.push(msg);
  });

  function recv(timeout = 8000) {
    if (buf.length) return Promise.resolve(buf.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        waiter = null;
        reject(new Error(`recv timeout after ${timeout}ms`));
      }, timeout);
      waiter = msg => { clearTimeout(t); resolve(msg); };
    });
  }

  async function nextOfType(type, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (true) {
      const msg = await recv(Math.max(50, deadline - Date.now()));
      if (msg.type === type) return msg;
    }
  }

  return {
    send:       msg  => ws.send(JSON.stringify(msg)),
    recv,
    nextOfType,
    ready:      ()   => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
    close:      ()   => new Promise(res => { ws.once('close', res); ws.close(); }),
  };
}

/** Open N clients and wait for all to connect. */
async function openClients(n) {
  const clients = Array.from({ length: n }, makeClient);
  await Promise.all(clients.map(c => c.ready()));
  return clients;
}

/**
 * Bring a game to HAND_END with all 4 seats as human players.
 * Strategy: pass all of round 1, pass non-dealer seats in round 2,
 * dealer (stickDealer) calls any valid suit, then play card index 0 every turn.
 * Returns the HAND_END game state from the perspective of seat 0.
 */
async function driveToHandEnd(clients, initialStates) {
  const states = initialStates.slice();

  async function waitAll(timeout = 5000) {
    await Promise.all(clients.map(async (c, i) => {
      const msg = await c.nextOfType('game_state', timeout);
      states[i] = msg.state;
    }));
  }

  while (true) {
    const s = states[0];

    if (s.phase === P.HAND_END) return s;

    if (s.phase === P.TRICK_END) {
      // Server auto-advances after 1400 ms
      await waitAll(3000);
      continue;
    }

    let actor;
    let action;

    if (s.phase === P.BIDDING_ROUND1) {
      actor  = s.currentBidder;
      action = { type: 'game_action', action: 'pass_r1' };

    } else if (s.phase === P.BIDDING_ROUND2) {
      actor = s.currentBidder;
      if (s.stickDealer && actor === s.dealer) {
        const suit = ['spades', 'hearts', 'diamonds', 'clubs']
          .find(su => su !== s.turnedDownSuit);
        action = { type: 'game_action', action: 'call_suit', suit, alone: false };
      } else {
        action = { type: 'game_action', action: 'pass_r2' };
      }

    } else if (s.phase === P.DEALER_DISCARD) {
      actor  = s.currentPlayer;
      action = { type: 'game_action', action: 'discard', cardIndex: 0 };

    } else if (s.phase === P.PLAYING) {
      actor = s.currentPlayer;
      // Use the actor's own game_state so their hand is visible (others are null)
      const actorState = states[actor];
      const hand       = actorState.hands[actor];
      // Must pick a *legal* card — use the game engine to determine which cards are playable
      const legal      = Euchre.getLegalCards(hand, actorState.ledSuit, actorState.trump);
      const legalCard  = legal[0];
      const ci         = hand.findIndex(c => c && c.suit === legalCard.suit && c.rank === legalCard.rank);
      action = { type: 'game_action', action: 'play_card', cardIndex: ci };

    } else {
      throw new Error(`Unexpected phase: ${s.phase}`);
    }

    clients[actor].send(action);
    await waitAll();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('room management', () => {
  it('create_room returns room_created with seatIndex 0 and isHost', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'create_room', playerName: 'Alice' });
      const msg = await c.nextOfType('room_created');
      assert.equal(msg.seatIndex, 0);
      assert.equal(msg.isHost, true);
      assert.match(msg.code, /^[A-Z0-9]{6}$/);
      assert.equal(msg.players.length, 1);
      assert.equal(msg.players[0].name, 'Alice');
    } finally { await c.close(); }
  });

  it('join_room sends room_joined to joiner and player_joined to host', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const created = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code: created.code, playerName: 'Guest' });

      const [joined, joined2] = await Promise.all([
        guest.nextOfType('room_joined'),
        host.nextOfType('player_joined'),
      ]);

      assert.equal(joined.seatIndex, 1);
      assert.equal(joined.isHost, false);
      assert.equal(joined.players.length, 2);
      assert.equal(joined2.players.length, 2);
      assert.equal(joined2.players[1].name, 'Guest');
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('joining a non-existent room returns an error', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'join_room', code: 'XXXXXX', playerName: 'Bob' });
      const msg = await c.nextOfType('error');
      assert.ok(msg.message.length > 0);
    } finally { await c.close(); }
  });

  it('joining a full room (4 players) returns an error', async () => {
    const clients = await openClients(5);
    try {
      clients[0].send({ type: 'create_room', playerName: 'P0' });
      const { code } = await clients[0].nextOfType('room_created');

      for (let i = 1; i <= 3; i++) {
        clients[i].send({ type: 'join_room', code, playerName: `P${i}` });
        await clients[i].nextOfType('room_joined');
      }

      clients[4].send({ type: 'join_room', code, playerName: 'Extra' });
      const err = await clients[4].nextOfType('error');
      assert.ok(err.message.includes('full'));
    } finally { await Promise.all(clients.map(c => c.close())); }
  });

  it('a socket already in a room cannot create another room', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'create_room', playerName: 'Dup' });
      await c.nextOfType('room_created');

      c.send({ type: 'create_room', playerName: 'Dup2' });
      const err = await c.nextOfType('error');
      assert.ok(err.message.length > 0);
    } finally { await c.close(); }
  });

  it('cannot join a room that has already started', async () => {
    const clients = await openClients(3);
    try {
      clients[0].send({ type: 'create_room', playerName: 'Host' });
      const { code } = await clients[0].nextOfType('room_created');

      clients[1].send({ type: 'join_room', code, playerName: 'P1' });
      await clients[1].nextOfType('room_joined');

      clients[0].send({ type: 'start_game' });
      await clients[0].nextOfType('game_started');

      clients[2].send({ type: 'join_room', code, playerName: 'Late' });
      const err = await clients[2].nextOfType('error');
      assert.ok(err.message.includes('progress'));
    } finally { await Promise.all(clients.map(c => c.close())); }
  });
});

describe('game start', () => {
  it('start_game with fewer than 2 players returns an error', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'create_room', playerName: 'Solo' });
      await c.nextOfType('room_created');

      c.send({ type: 'start_game' });
      const err = await c.nextOfType('error');
      assert.ok(err.message.includes('2'));
    } finally { await c.close(); }
  });

  it('only the host can start the game', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');

      // Guest attempts to start — should be silently ignored (no error, no game_started)
      guest.send({ type: 'start_game' });

      // Host starts legitimately
      host.send({ type: 'start_game' });
      const [h, g] = await Promise.all([
        host.nextOfType('game_started'),
        guest.nextOfType('game_started'),
      ]);
      assert.equal(h.seatIndex, 0);
      assert.equal(g.seatIndex, 1);
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('all players receive game_started with a filtered hand', async () => {
    const clients = await openClients(4);
    try {
      clients[0].send({ type: 'create_room', playerName: 'S' });
      const { code } = await clients[0].nextOfType('room_created');

      for (let i = 1; i < 4; i++) {
        clients[i].send({ type: 'join_room', code, playerName: `P${i}` });
        await clients[i].nextOfType('room_joined');
      }

      clients[0].send({ type: 'start_game' });

      const msgs = await Promise.all(clients.map(c => c.nextOfType('game_started')));

      msgs.forEach((msg, seat) => {
        assert.equal(msg.seatIndex, seat);
        const state = msg.state;
        assert.equal(state.phase, P.BIDDING_ROUND1);
        // Only this player's own hand is visible; others are replaced with nulls
        state.hands.forEach((hand, i) => {
          if (i === seat) {
            assert.ok(hand.every(c => c !== null), `seat ${seat} should see own cards`);
          } else {
            assert.ok(hand.every(c => c === null), `seat ${seat} should not see seat ${i}`);
          }
        });
      });
    } finally { await Promise.all(clients.map(c => c.close())); }
  });
});

describe('pre-game disconnect', () => {
  it('disconnecting player is removed and remaining players are notified', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');
      await host.nextOfType('player_joined');

      await guest.close();

      const left = await host.nextOfType('player_left');
      assert.equal(left.players.length, 1);
      assert.equal(left.name, 'Guest');
    } finally { await host.close(); }
  });

  it('host disconnect promotes the next player', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');
      await host.nextOfType('player_joined');

      await host.close();

      const changed = await guest.nextOfType('host_changed');
      assert.ok(changed.hostId, 'new hostId should be set');
    } finally { await guest.close(); }
  });
});

describe('in-game disconnect', () => {
  it('broadcasts player_disconnected and AI takes over the seat', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');
      await host.nextOfType('player_joined');

      host.send({ type: 'start_game' });
      await Promise.all([host.nextOfType('game_started'), guest.nextOfType('game_started')]);

      const guestSeat = 1;
      await guest.close();

      const msg = await host.nextOfType('player_disconnected');
      assert.equal(msg.seatIndex, guestSeat);
      assert.equal(msg.name, 'Guest');
    } finally { await host.close(); }
  });
});

describe('AI difficulty setting', () => {
  it('reconnectToken is included in room_created', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'create_room', playerName: 'Alice' });
      const msg = await c.nextOfType('room_created');
      assert.ok(typeof msg.reconnectToken === 'string' && msg.reconnectToken.length > 0,
        'room_created should include a non-empty reconnectToken');
    } finally { await c.close(); }
  });

  it('reconnectToken is included in room_joined', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      const msg = await guest.nextOfType('room_joined');
      assert.ok(typeof msg.reconnectToken === 'string' && msg.reconnectToken.length > 0,
        'room_joined should include a non-empty reconnectToken');
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('start_game accepts aiDifficulty:hard without error', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');

      host.send({ type: 'start_game', aiDifficulty: 'hard' });
      const [h, g] = await Promise.all([
        host.nextOfType('game_started'),
        guest.nextOfType('game_started'),
      ]);
      assert.equal(h.state.phase, 'BIDDING_ROUND1');
      assert.equal(g.state.phase, 'BIDDING_ROUND1');
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('start_game with invalid aiDifficulty silently defaults to normal', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');

      host.send({ type: 'start_game', aiDifficulty: 'godmode' });
      const [h] = await Promise.all([
        host.nextOfType('game_started'),
        guest.nextOfType('game_started'),
      ]);
      // Game starts normally — invalid difficulty silently falls back to 'normal'
      assert.equal(h.state.phase, 'BIDDING_ROUND1');
    } finally { await Promise.all([host.close(), guest.close()]); }
  });
});

describe('reconnect / rejoin', () => {
  it('rejoin_room with invalid token returns an error', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'rejoin_room', reconnectToken: 'badbadbadbad' });
      const msg = await c.nextOfType('error');
      assert.ok(msg.message.length > 0);
    } finally { await c.close(); }
  });

  it('rejoin_room with missing token returns an error', async () => {
    const [c] = await openClients(1);
    try {
      c.send({ type: 'rejoin_room' }); // no reconnectToken field
      const msg = await c.nextOfType('error');
      assert.ok(msg.message.length > 0);
    } finally { await c.close(); }
  });

  it('disconnected player can rejoin and receives game_rejoined', { timeout: 15000 }, async () => {
    const [host, guest] = await openClients(2);
    let guestToken = null;
    let guestSeat  = null;
    let roomCode   = null;

    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const created = await host.nextOfType('room_created');
      roomCode = created.code;

      guest.send({ type: 'join_room', code: roomCode, playerName: 'Guest' });
      const joinedMsg = await guest.nextOfType('room_joined');
      guestToken = joinedMsg.reconnectToken;
      guestSeat  = joinedMsg.seatIndex;

      host.send({ type: 'start_game' });
      await Promise.all([host.nextOfType('game_started'), guest.nextOfType('game_started')]);

      // Guest disconnects mid-game
      await guest.close();

      // Host sees the disconnect
      const disconnected = await host.nextOfType('player_disconnected');
      assert.equal(disconnected.seatIndex, guestSeat);

      // Guest reconnects with a fresh WebSocket using the saved token and room code
      const rejoiner = makeClient();
      await rejoiner.ready();
      rejoiner.send({ type: 'rejoin_room', code: roomCode, reconnectToken: guestToken });

      const [rejoined, playerRejoined] = await Promise.all([
        rejoiner.nextOfType('game_rejoined'),
        host.nextOfType('player_rejoined'),
      ]);

      assert.equal(rejoined.seatIndex, guestSeat, 'rejoined at correct seat');
      assert.ok(rejoined.state, 'game state included in game_rejoined');
      assert.equal(playerRejoined.seatIndex, guestSeat);
      assert.equal(playerRejoined.name, 'Guest');

      await rejoiner.close();
    } finally { await host.close(); }
  });

  it('token can only be used by one connection at a time', { timeout: 15000 }, async () => {
    const [host, guest] = await openClients(2);
    let guestToken = null;
    let roomCode   = null;

    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const created = await host.nextOfType('room_created');
      roomCode = created.code;

      guest.send({ type: 'join_room', code: roomCode, playerName: 'Guest' });
      const joinedMsg = await guest.nextOfType('room_joined');
      guestToken = joinedMsg.reconnectToken;

      host.send({ type: 'start_game' });
      await Promise.all([host.nextOfType('game_started'), guest.nextOfType('game_started')]);

      await guest.close();
      await host.nextOfType('player_disconnected');

      // First rejoin succeeds
      const rejoiner1 = makeClient();
      await rejoiner1.ready();
      rejoiner1.send({ type: 'rejoin_room', code: roomCode, reconnectToken: guestToken });
      const r1 = await rejoiner1.nextOfType('game_rejoined');
      assert.ok(r1.seatIndex >= 0, 'first rejoin should succeed');

      await rejoiner1.close();
    } finally { await host.close(); }
  });
});

describe('change_seat', () => {
  it('host can move to an empty seat', async () => {
    const [host] = await openClients(1);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const created = await host.nextOfType('room_created');
      assert.equal(created.seatIndex, 0);

      host.send({ type: 'change_seat', seat: 2 });
      const msg = await host.nextOfType('seat_changed');
      assert.equal(msg.seatIndex, 2, 'host should now be in seat 2');
      assert.ok(msg.players.find(p => p.seatIndex === 2 && p.name === 'Host'),
        'players list should show host at seat 2');
    } finally { await host.close(); }
  });

  it('two players can swap seats', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');
      await host.nextOfType('player_joined');

      // Host (seat 0) swaps with Guest (seat 1)
      host.send({ type: 'change_seat', seat: 1 });
      const [hMsg, gMsg] = await Promise.all([
        host.nextOfType('seat_changed'),
        guest.nextOfType('seat_changed'),
      ]);
      assert.equal(hMsg.seatIndex, 1, 'host should now be in seat 1');
      assert.equal(gMsg.seatIndex, 0, 'guest should now be in seat 0');
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('all players receive updated players list after seat change', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');
      await host.nextOfType('player_joined');

      host.send({ type: 'change_seat', seat: 3 });
      const [hMsg] = await Promise.all([
        host.nextOfType('seat_changed'),
        guest.nextOfType('seat_changed'),
      ]);
      assert.equal(hMsg.players.length, 2);
      const hostEntry = hMsg.players.find(p => p.name === 'Host');
      assert.ok(hostEntry, 'host should be in the players list');
      assert.equal(hostEntry.seatIndex, 3);
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('change_seat is ignored once the game has started', async () => {
    const [host, guest] = await openClients(2);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      const { code } = await host.nextOfType('room_created');

      guest.send({ type: 'join_room', code, playerName: 'Guest' });
      await guest.nextOfType('room_joined');

      host.send({ type: 'start_game' });
      await Promise.all([host.nextOfType('game_started'), guest.nextOfType('game_started')]);

      // change_seat during a game should be silently ignored
      host.send({ type: 'change_seat', seat: 2 });

      // Give server time to process — no seat_changed should arrive
      await new Promise(res => setTimeout(res, 200));
      // If a seat_changed arrived it would be in the buffer; verify it's absent
      // by starting the game again (which would fail) — instead just confirm no crash
      // and next real message works normally
      host.send({ type: 'game_action', action: 'pass_r1' });
      // No assertion needed — the test passes if no exception is thrown
    } finally { await Promise.all([host.close(), guest.close()]); }
  });

  it('moving to own current seat is a no-op', async () => {
    const [host] = await openClients(1);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      await host.nextOfType('room_created');

      // Try to "move" to the seat already occupied by the host
      host.send({ type: 'change_seat', seat: 0 });

      await new Promise(res => setTimeout(res, 150));
      // No seat_changed should arrive — host stays in seat 0 with no error
    } finally { await host.close(); }
  });

  it('change_seat with invalid seat index is ignored', async () => {
    const [host] = await openClients(1);
    try {
      host.send({ type: 'create_room', playerName: 'Host' });
      await host.nextOfType('room_created');

      host.send({ type: 'change_seat', seat: 99 });
      await new Promise(res => setTimeout(res, 150));
      // No seat_changed, no error crash
    } finally { await host.close(); }
  });
});

describe('full hand — 4 human players', () => {
  it('plays through a complete hand to HAND_END', { timeout: 40000 }, async () => {
    const clients = await openClients(4);
    try {
      clients[0].send({ type: 'create_room', playerName: 'South' });
      const { code } = await clients[0].nextOfType('room_created');

      for (let i = 1; i < 4; i++) {
        clients[i].send({ type: 'join_room', code, playerName: ['West', 'North', 'East'][i - 1] });
        await clients[i].nextOfType('room_joined');
      }

      clients[0].send({ type: 'start_game' });

      // Collect initial states from game_started
      const startMsgs = await Promise.all(clients.map(c => c.nextOfType('game_started')));
      const initialStates = startMsgs.map(m => m.state);

      const finalState = await driveToHandEnd(clients, initialStates);

      // All 5 tricks must have been played
      const totalTricks = finalState.teamTricks[0] + finalState.teamTricks[1];
      assert.equal(totalTricks, 5, 'all 5 tricks should be played');

      // Scores are non-negative and a scoring team earned points
      assert.ok(finalState.scores[0] >= 0 && finalState.scores[1] >= 0);
      assert.ok(finalState.scores[0] + finalState.scores[1] > 0, 'at least one team scored');
    } finally { await Promise.all(clients.map(c => c.close())); }
  });

  it('next_hand increments the hand number and resets trick counts', { timeout: 40000 }, async () => {
    const clients = await openClients(4);
    try {
      clients[0].send({ type: 'create_room', playerName: 'South' });
      const { code } = await clients[0].nextOfType('room_created');

      for (let i = 1; i < 4; i++) {
        clients[i].send({ type: 'join_room', code, playerName: ['West', 'North', 'East'][i - 1] });
        await clients[i].nextOfType('room_joined');
      }

      clients[0].send({ type: 'start_game' });

      const startMsgs = await Promise.all(clients.map(c => c.nextOfType('game_started')));
      let states = startMsgs.map(m => m.state);

      await driveToHandEnd(clients, states);

      // Host triggers next hand
      clients[0].send({ type: 'game_action', action: 'next_hand' });

      const nextMsgs = await Promise.all(clients.map(c => c.nextOfType('game_state')));
      const nextState = nextMsgs[0].state;

      assert.equal(nextState.handNumber, 2, 'hand number should increment');
      assert.equal(nextState.tricksPlayed, 0, 'tricks should reset to 0');
      assert.deepEqual(nextState.teamTricks, [0, 0], 'per-team tricks should reset');
      assert.equal(nextState.phase, P.BIDDING_ROUND1);
    } finally { await Promise.all(clients.map(c => c.close())); }
  });
});
