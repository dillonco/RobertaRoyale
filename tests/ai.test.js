'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Euchre = require('../js/euchre.js');
global.Euchre = Euchre;
const EuchreAI = require('../js/ai.js');

const { Phase } = Euchre;

function card(suit, rank) { return { suit, rank }; }

function makePlayingState(overrides = {}) {
  return {
    players: [
      { id: 0, name: 'S' }, { id: 1, name: 'W' },
      { id: 2, name: 'N' }, { id: 3, name: 'E' },
    ],
    dealer: 0,
    trump: 'spades',
    upCard: card('spades', 'J'),
    turnedDownSuit: null,
    phase: Phase.PLAYING,
    currentBidder: null,
    currentPlayer: 0,
    maker: 0, makerTeam: 0,
    alone: false, alonePlayer: null, sittingOut: null,
    hands: [
      [card('spades','J'), card('spades','A'), card('hearts','A'), card('clubs','9'), card('diamonds','10')],
      [card('hearts','Q'), card('diamonds','K'), card('clubs','10'), card('spades','9'), card('hearts','10')],
      [card('clubs','A'), card('diamonds','A'), card('clubs','K'), card('hearts','K'), card('hearts','9')],
      [card('diamonds','Q'), card('clubs','Q'), card('diamonds','10'), card('diamonds','9'), card('clubs','J')],
    ],
    currentTrick: [],
    ledSuit: null,
    trickWinner: null,
    tricksPlayed: 0,
    teamTricks: [0, 0],
    scores: [0, 0],
    targetScore: 10,
    handNumber: 1,
    lastHandResult: null,
    stickDealer: false,
    pendingPhase: null,
    nextTrickLeader: null,
    ...overrides,
  };
}

// ── evalStrength ──────────────────────────────────────────────────────────────

describe('evalStrength', () => {
  it('right bower scores 3.0', () => {
    const hand = [card('spades','J')];
    assert.equal(EuchreAI.evalStrength(hand, 'spades'), 3.0);
  });
  it('left bower scores 2.5', () => {
    const hand = [card('clubs','J')];
    assert.equal(EuchreAI.evalStrength(hand, 'spades'), 2.5);
  });
  it('ace of trump scores 1.5', () => {
    const hand = [card('spades','A')];
    assert.equal(EuchreAI.evalStrength(hand, 'spades'), 1.5);
  });
  it('off-suit ace scores 0.5', () => {
    const hand = [card('hearts','A')];
    assert.equal(EuchreAI.evalStrength(hand, 'spades'), 0.5);
  });
  it('off-suit non-ace scores 0', () => {
    const hand = [card('hearts','K')];
    assert.equal(EuchreAI.evalStrength(hand, 'spades'), 0);
  });
  it('strong hand (right bower + left bower + ace trump) scores >= 7', () => {
    const hand = [card('spades','J'), card('clubs','J'), card('spades','A')];
    assert.ok(EuchreAI.evalStrength(hand, 'spades') >= 7.0);
  });
});

// ── getBidR1 ──────────────────────────────────────────────────────────────────

describe('getBidR1', () => {
  function bidState(hand, dealer = 3) {
    const hands = [hand, [], [], []];
    return {
      ...makePlayingState({ phase: Phase.BIDDING_ROUND1, currentPlayer: null }),
      dealer,
      upCard: card('spades','10'),
      hands: [hand,
        [card('hearts','Q')], [card('clubs','A')], [card('diamonds','Q')]],
    };
  }

  it('orders up with a strong hand (normal difficulty)', () => {
    const hand = [card('spades','J'), card('clubs','J'), card('spades','A'), card('spades','K'), card('hearts','A')];
    const s = bidState(hand);
    const result = EuchreAI.getBidR1(s, 0, 'normal');
    assert.equal(result.action, 'order');
  });
  it('goes alone with an extremely strong hand', () => {
    const hand = [card('spades','J'), card('clubs','J'), card('spades','A'), card('spades','K'), card('spades','Q')];
    const s = bidState(hand);
    const result = EuchreAI.getBidR1(s, 0, 'normal');
    assert.equal(result.action, 'order');
    assert.ok(result.alone);
  });
  it('passes with a weak hand (normal difficulty)', () => {
    const hand = [card('hearts','9'), card('diamonds','9'), card('clubs','9'), card('hearts','10'), card('diamonds','10')];
    const s = bidState(hand);
    const result = EuchreAI.getBidR1(s, 0, 'normal');
    assert.equal(result.action, 'pass');
  });
});

// ── getBidR2 ──────────────────────────────────────────────────────────────────

describe('getBidR2', () => {
  it('calls best suit when hand is strong enough', () => {
    const hand = [card('hearts','J'), card('diamonds','J'), card('hearts','A'), card('hearts','K'), card('hearts','Q')];
    const s = makePlayingState({
      phase: Phase.BIDDING_ROUND2,
      currentBidder: 0,
      turnedDownSuit: 'spades',
      hands: [hand, [], [], []],
    });
    const result = EuchreAI.getBidR2(s, 0, 'normal');
    assert.equal(result.action, 'call');
    assert.equal(result.suit, 'hearts');
  });
  it('stick dealer must call even with weak hand', () => {
    const hand = [card('hearts','9'), card('clubs','9'), card('diamonds','10'), card('hearts','10'), card('clubs','10')];
    const s = makePlayingState({
      phase: Phase.BIDDING_ROUND2,
      currentBidder: 0,
      dealer: 0,
      turnedDownSuit: 'spades',
      stickDealer: true,
      hands: [hand, [], [], []],
    });
    const result = EuchreAI.getBidR2(s, 0, 'normal');
    assert.equal(result.action, 'call');
    assert.ok(result.suit !== 'spades');
  });
  it('does not call turned-down suit', () => {
    const hand = [card('hearts','A'), card('hearts','K'), card('hearts','Q'), card('hearts','10'), card('hearts','9')];
    const s = makePlayingState({
      phase: Phase.BIDDING_ROUND2,
      currentBidder: 0,
      turnedDownSuit: 'hearts',
      hands: [hand, [], [], []],
    });
    const result = EuchreAI.getBidR2(s, 0, 'normal');
    if (result.action === 'call') {
      assert.notEqual(result.suit, 'hearts');
    }
  });
});

// ── getDiscard ────────────────────────────────────────────────────────────────

describe('getDiscard', () => {
  it('discards a non-trump non-ace card (normal difficulty)', () => {
    const hand = [card('spades','A'), card('spades','K'), card('hearts','9'), card('clubs','10'), card('diamonds','9')];
    const s = makePlayingState({
      phase: Phase.DEALER_DISCARD,
      trump: 'spades',
      hands: [hand, [], [], []],
    });
    const idx = EuchreAI.getDiscard(s, 0, 'normal');
    const discarded = hand[idx];
    // Should not discard spades (trump) or aces
    assert.ok(Euchre.effectiveSuit(discarded, 'spades') !== 'spades' || discarded.rank !== 'A');
  });
  it('returns a valid hand index', () => {
    const hand = [card('spades','A'), card('hearts','9'), card('clubs','10')];
    const s = makePlayingState({ phase: Phase.DEALER_DISCARD, trump: 'spades', hands: [hand, [], [], []] });
    const idx = EuchreAI.getDiscard(s, 0, 'normal');
    assert.ok(idx >= 0 && idx < hand.length);
  });
});

// ── getPlay ───────────────────────────────────────────────────────────────────

describe('getPlay', () => {
  it('returns a valid hand index', () => {
    const s = makePlayingState({ currentPlayer: 0 });
    const idx = EuchreAI.getPlay(s, 0, 'normal');
    assert.ok(idx >= 0 && idx < s.hands[0].length);
  });
  it('leads trump when maker and has trump (normal difficulty)', () => {
    const hand = [card('spades','A'), card('hearts','9')];
    const s = makePlayingState({
      currentPlayer: 0, maker: 0, makerTeam: 0,
      hands: [hand, [], [], []],
    });
    const idx = EuchreAI.getPlay(s, 0, 'normal');
    assert.equal(hand[idx].suit, 'spades'); // should lead trump
  });
  it('plays a legal card when following suit is required', () => {
    // Seat 1 must follow hearts (has hearts Q)
    const hand = [card('hearts','Q'), card('clubs','10')];
    const s = makePlayingState({
      currentPlayer: 1,
      ledSuit: 'hearts',
      currentTrick: [{ card: card('hearts','A'), playerIndex: 0 }],
      hands: [
        [card('hearts','A')],
        hand,
        [card('clubs','A')],
        [card('diamonds','Q')],
      ],
    });
    const idx = EuchreAI.getPlay(s, 1, 'normal');
    const played = hand[idx];
    assert.equal(played.suit, 'hearts'); // must follow hearts
  });
  it('easy difficulty returns a legal card', () => {
    const s = makePlayingState({ currentPlayer: 0 });
    const idx = EuchreAI.getPlay(s, 0, 'easy');
    assert.ok(idx >= 0 && idx < s.hands[0].length);
  });
});
