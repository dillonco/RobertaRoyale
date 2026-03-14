'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Euchre = require('../js/euchre.js');

const { Phase } = Euchre;

// ── Helpers ───────────────────────────────────────────────────────────────────

function card(suit, rank) { return { suit, rank }; }

/** Minimal game state with known hands for deterministic tests. */
function makeState(overrides = {}) {
  return {
    players: [
      { id: 0, name: 'South' }, { id: 1, name: 'West' },
      { id: 2, name: 'North' }, { id: 3, name: 'East' },
    ],
    dealer: 0,
    trump: null,
    upCard: card('spades', 'J'),   // right bower if spades called
    turnedDownSuit: null,
    phase: Phase.BIDDING_ROUND1,
    currentBidder: 1,              // left of dealer
    currentPlayer: null,
    maker: null, makerTeam: null,
    alone: false, alonePlayer: null, sittingOut: null,
    hands: [
      // Seat 0 (dealer / South) — strong spades hand
      [card('spades','A'), card('spades','K'), card('spades','Q'), card('hearts','A'), card('clubs','9')],
      // Seat 1 (West)
      [card('hearts','Q'), card('diamonds','K'), card('clubs','10'), card('spades','9'), card('hearts','10')],
      // Seat 2 (North)
      [card('clubs','A'), card('diamonds','A'), card('clubs','K'), card('hearts','K'), card('hearts','9')],
      // Seat 3 (East)
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

// ── Card utilities ────────────────────────────────────────────────────────────

describe('isRightBower', () => {
  it('identifies Jack of trump suit', () => {
    assert.ok(Euchre.isRightBower(card('spades','J'), 'spades'));
  });
  it('rejects Jack of other suit', () => {
    assert.ok(!Euchre.isRightBower(card('clubs','J'), 'spades'));
  });
  it('rejects non-Jack of trump suit', () => {
    assert.ok(!Euchre.isRightBower(card('spades','A'), 'spades'));
  });
  it('returns false when trump is null', () => {
    assert.ok(!Euchre.isRightBower(card('spades','J'), null));
  });
});

describe('isLeftBower', () => {
  it('identifies Jack of same-color suit (clubs J when spades is trump)', () => {
    assert.ok(Euchre.isLeftBower(card('clubs','J'), 'spades'));
  });
  it('identifies Jack of same-color suit (diamonds J when hearts is trump)', () => {
    assert.ok(Euchre.isLeftBower(card('diamonds','J'), 'hearts'));
  });
  it('rejects right bower', () => {
    assert.ok(!Euchre.isLeftBower(card('spades','J'), 'spades'));
  });
  it('rejects Jack of wrong color', () => {
    assert.ok(!Euchre.isLeftBower(card('hearts','J'), 'spades'));
  });
});

describe('effectiveSuit', () => {
  it('left bower plays as trump, not its printed suit', () => {
    assert.equal(Euchre.effectiveSuit(card('clubs','J'), 'spades'), 'spades');
  });
  it('right bower plays as trump', () => {
    assert.equal(Euchre.effectiveSuit(card('spades','J'), 'spades'), 'spades');
  });
  it('normal card plays as its printed suit', () => {
    assert.equal(Euchre.effectiveSuit(card('hearts','A'), 'spades'), 'hearts');
  });
});

describe('trumpStrength', () => {
  it('right bower is strongest (8)', () => {
    assert.equal(Euchre.trumpStrength(card('spades','J'), 'spades'), 8);
  });
  it('left bower is second strongest (7)', () => {
    assert.equal(Euchre.trumpStrength(card('clubs','J'), 'spades'), 7);
  });
  it('Ace of trump is 6', () => {
    assert.equal(Euchre.trumpStrength(card('spades','A'), 'spades'), 6);
  });
  it('9 of trump is 1', () => {
    assert.equal(Euchre.trumpStrength(card('spades','9'), 'spades'), 1);
  });
});

describe('cardBeats', () => {
  it('trump beats non-trump', () => {
    assert.ok(Euchre.cardBeats(card('spades','9'), card('hearts','A'), 'hearts', 'spades'));
  });
  it('higher trump beats lower trump', () => {
    assert.ok(Euchre.cardBeats(card('spades','A'), card('spades','9'), 'spades', 'spades'));
  });
  it('right bower beats left bower', () => {
    assert.ok(Euchre.cardBeats(card('spades','J'), card('clubs','J'), 'spades', 'spades'));
  });
  it('card not following suit does not beat led suit', () => {
    assert.ok(!Euchre.cardBeats(card('clubs','A'), card('hearts','9'), 'hearts', 'spades'));
  });
  it('higher led-suit card beats lower led-suit card', () => {
    assert.ok(Euchre.cardBeats(card('hearts','A'), card('hearts','9'), 'hearts', 'spades'));
  });
  it('lower card does not beat higher of same suit', () => {
    assert.ok(!Euchre.cardBeats(card('hearts','9'), card('hearts','A'), 'hearts', 'spades'));
  });
});

describe('getTrickWinner', () => {
  it('trump wins over led suit', () => {
    const trick = [
      { card: card('hearts','A'), playerIndex: 0 },
      { card: card('spades','9'), playerIndex: 1 },  // low trump wins
      { card: card('hearts','K'), playerIndex: 2 },
      { card: card('hearts','Q'), playerIndex: 3 },
    ];
    assert.equal(Euchre.getTrickWinner(trick, 'spades'), 1);
  });
  it('highest trump wins when multiple trump played', () => {
    const trick = [
      { card: card('spades','9'), playerIndex: 0 },
      { card: card('spades','A'), playerIndex: 1 },
      { card: card('spades','J'), playerIndex: 2 }, // right bower
      { card: card('clubs','J'),  playerIndex: 3 }, // left bower
    ];
    assert.equal(Euchre.getTrickWinner(trick, 'spades'), 2);
  });
  it('highest led-suit card wins when no trump played', () => {
    const trick = [
      { card: card('hearts','9'), playerIndex: 0 },
      { card: card('hearts','A'), playerIndex: 1 },
      { card: card('clubs','K'),  playerIndex: 2 }, // off-suit, doesn't count
      { card: card('hearts','K'), playerIndex: 3 },
    ];
    assert.equal(Euchre.getTrickWinner(trick, 'spades'), 1);
  });
});

describe('getLegalCards', () => {
  const hand = [card('hearts','A'), card('hearts','K'), card('spades','9'), card('clubs','Q')];

  it('all cards legal when leading', () => {
    assert.equal(Euchre.getLegalCards(hand, null, 'spades').length, 4);
  });
  it('must follow led suit when possible', () => {
    const legal = Euchre.getLegalCards(hand, 'hearts', 'spades');
    assert.ok(legal.every(c => c.suit === 'hearts'));
    assert.equal(legal.length, 2);
  });
  it('any card legal when cannot follow suit', () => {
    const legal = Euchre.getLegalCards(hand, 'diamonds', 'spades');
    assert.equal(legal.length, 4);
  });
  it('left bower must follow trump, not its printed suit', () => {
    const handWithLeftBower = [card('clubs','J'), card('hearts','A')];
    // clubs J is left bower when spades is trump — must follow spades, not clubs
    const legalSpades = Euchre.getLegalCards(handWithLeftBower, 'spades', 'spades');
    assert.equal(legalSpades.length, 1);
    assert.deepEqual(legalSpades[0], card('clubs','J'));
  });
});

// ── calcHandResult ────────────────────────────────────────────────────────────

describe('calcHandResult', () => {
  it('EUCHRE: makers take < 3 tricks — opponents score 2', () => {
    const r = Euchre.calcHandResult(0, false, [2, 3]);
    assert.equal(r.type, 'EUCHRE');
    assert.equal(r.scoringTeam, 1);
    assert.equal(r.points, 2);
  });
  it('NORMAL: makers take 3 tricks — 1 point', () => {
    const r = Euchre.calcHandResult(0, false, [3, 2]);
    assert.equal(r.type, 'NORMAL');
    assert.equal(r.scoringTeam, 0);
    assert.equal(r.points, 1);
  });
  it('MARCH: makers take all 5 without going alone — 2 points', () => {
    const r = Euchre.calcHandResult(1, false, [0, 5]);
    assert.equal(r.type, 'MARCH');
    assert.equal(r.scoringTeam, 1);
    assert.equal(r.points, 2);
  });
  it('LONE_MARCH: lone player takes all 5 — 4 points', () => {
    const r = Euchre.calcHandResult(0, true, [5, 0]);
    assert.equal(r.type, 'LONE_MARCH');
    assert.equal(r.scoringTeam, 0);
    assert.equal(r.points, 4);
  });
});

// ── Game actions ──────────────────────────────────────────────────────────────

describe('createGame', () => {
  it('starts in BIDDING_ROUND1 with 4 players each holding 5 cards', () => {
    const g = Euchre.createGame(['S','W','N','E'], 0, 10);
    assert.equal(g.phase, Phase.BIDDING_ROUND1);
    assert.equal(g.players.length, 4);
    assert.ok(g.hands.every(h => h.length === 5));
    assert.equal(g.scores[0], 0);
    assert.equal(g.scores[1], 0);
    assert.equal(g.targetScore, 10);
  });
  it('first bidder is left of dealer', () => {
    const g = Euchre.createGame(['S','W','N','E'], 2, 10);
    assert.equal(g.currentBidder, 3);
  });
});

describe('actionOrderUp', () => {
  it('throws when it is not the player\'s turn', () => {
    const s = makeState();
    assert.throws(() => Euchre.actionOrderUp(s, 0), /invalid state/);
  });
  it('sets trump to upCard suit and transitions to DEALER_DISCARD', () => {
    const s = makeState();
    const s2 = Euchre.actionOrderUp(s, 1); // seat 1 is currentBidder
    assert.equal(s2.phase, Phase.DEALER_DISCARD);
    assert.equal(s2.trump, 'spades');
    assert.equal(s2.maker, 1);
    assert.equal(s2.makerTeam, 1);
    assert.equal(s2.currentPlayer, s.dealer); // dealer must discard
  });
  it('dealer gets upCard added to hand (6 cards before discard)', () => {
    const s = makeState();
    const s2 = Euchre.actionOrderUp(s, 1);
    assert.equal(s2.hands[s.dealer].length, 6);
  });
  it('sets alone flag when goAlone=true', () => {
    const s = makeState();
    const s2 = Euchre.actionOrderUp(s, 1, true);
    assert.ok(s2.alone);
    assert.equal(s2.alonePlayer, 1);
  });
});

describe('actionPassRound1', () => {
  it('advances to next bidder', () => {
    const s = makeState();
    const s2 = Euchre.actionPassRound1(s, 1);
    assert.equal(s2.currentBidder, 2);
    assert.equal(s2.phase, Phase.BIDDING_ROUND1);
  });
  it('moves to BIDDING_ROUND2 after all 4 pass', () => {
    let s = makeState();
    s = Euchre.actionPassRound1(s, 1);
    s = Euchre.actionPassRound1(s, 2);
    s = Euchre.actionPassRound1(s, 3);
    s = Euchre.actionPassRound1(s, 0);
    assert.equal(s.phase, Phase.BIDDING_ROUND2);
    assert.equal(s.turnedDownSuit, 'spades');
    assert.equal(s.currentBidder, 1); // back to left of dealer
  });
});

describe('actionCallSuit', () => {
  it('throws when calling the turned-down suit', () => {
    const s = makeState({ phase: Phase.BIDDING_ROUND2, currentBidder: 1, turnedDownSuit: 'spades' });
    assert.throws(() => Euchre.actionCallSuit(s, 1, 'spades'), /turned-down/);
  });
  it('transitions to PLAYING with correct trump', () => {
    const s = makeState({ phase: Phase.BIDDING_ROUND2, currentBidder: 1, turnedDownSuit: 'spades' });
    const s2 = Euchre.actionCallSuit(s, 1, 'hearts');
    assert.equal(s2.phase, Phase.PLAYING);
    assert.equal(s2.trump, 'hearts');
    assert.equal(s2.maker, 1);
  });
});

describe('actionPassRound2', () => {
  it('advances bidder', () => {
    const s = makeState({ phase: Phase.BIDDING_ROUND2, currentBidder: 1, turnedDownSuit: 'spades' });
    const s2 = Euchre.actionPassRound2(s, 1);
    assert.equal(s2.currentBidder, 2);
  });
  it('sticks dealer when all 4 pass round 2', () => {
    let s = makeState({ phase: Phase.BIDDING_ROUND2, currentBidder: 1, turnedDownSuit: 'spades' });
    s = Euchre.actionPassRound2(s, 1);
    s = Euchre.actionPassRound2(s, 2);
    s = Euchre.actionPassRound2(s, 3);
    s = Euchre.actionPassRound2(s, 0); // dealer passes last, then gets stuck
    assert.equal(s.currentBidder, 0); // dealer is stuck
    assert.ok(s.stickDealer);
  });
});

describe('actionDealerDiscard', () => {
  it('reduces dealer hand to 5 and transitions to PLAYING', () => {
    const s = makeState();
    const s2 = Euchre.actionOrderUp(s, 1); // dealer gets 6 cards
    const s3 = Euchre.actionDealerDiscard(s2, 0); // discard index 0
    assert.equal(s3.hands[s.dealer].length, 5);
    assert.equal(s3.phase, Phase.PLAYING);
  });
  it('sittingOut is partner of alone caller', () => {
    const s = makeState();
    const s2 = Euchre.actionOrderUp(s, 1, true); // alone
    const s3 = Euchre.actionDealerDiscard(s2, 0);
    assert.equal(s3.sittingOut, 3); // partner of seat 1 is seat 3
  });
});

describe('actionPlayCard', () => {
  /** Build a state in PLAYING with known hands and trump=spades. */
  function playingState(overrides = {}) {
    return makeState({
      phase: Phase.PLAYING,
      trump: 'spades',
      currentPlayer: 1,
      hands: [
        [card('hearts','A'), card('clubs','9')],
        [card('hearts','Q'), card('spades','9')],
        [card('clubs','A'), card('diamonds','A')],
        [card('diamonds','Q'), card('clubs','Q')],
      ],
      ...overrides,
    });
  }

  it('removes card from hand', () => {
    const s = playingState();
    const s2 = Euchre.actionPlayCard(s, 1, 0); // seat 1 plays index 0
    assert.equal(s2.hands[1].length, 1);
  });
  it('adds card to currentTrick', () => {
    const s = playingState();
    const s2 = Euchre.actionPlayCard(s, 1, 0);
    assert.equal(s2.currentTrick.length, 1);
    assert.equal(s2.currentTrick[0].playerIndex, 1);
  });
  it('throws on illegal card (must follow suit)', () => {
    // Seat 1 has hearts Q and spades 9; led suit is spades → must play spades 9
    const s = playingState({ ledSuit: 'spades', currentTrick: [{ card: card('spades','A'), playerIndex: 0 }] });
    assert.throws(() => Euchre.actionPlayCard(s, 1, 0), /illegal card/); // hearts Q is illegal
  });
  it('transitions to TRICK_END when all 4 play', () => {
    let s = playingState();
    s = Euchre.actionPlayCard(s, 1, 0);
    s = { ...s, currentPlayer: 2 };
    s = Euchre.actionPlayCard(s, 2, 0);
    s = { ...s, currentPlayer: 3 };
    s = Euchre.actionPlayCard(s, 3, 0);
    s = { ...s, currentPlayer: 0 };
    s = Euchre.actionPlayCard(s, 0, 0);
    assert.equal(s.phase, Phase.TRICK_END);
  });
});

describe('advanceTrick', () => {
  it('throws when not in TRICK_END', () => {
    assert.throws(() => Euchre.advanceTrick(makeState()), /not in TRICK_END/);
  });
  it('clears trick and advances to PLAYING', () => {
    const s = makeState({
      phase: Phase.TRICK_END,
      pendingPhase: Phase.PLAYING,
      nextTrickLeader: 2,
      currentTrick: [{ card: card('hearts','A'), playerIndex: 0 }],
    });
    const s2 = Euchre.advanceTrick(s);
    assert.equal(s2.phase, Phase.PLAYING);
    assert.equal(s2.currentPlayer, 2);
    assert.equal(s2.currentTrick.length, 0);
    assert.equal(s2.ledSuit, null);
  });
  it('advances to HAND_END when pending', () => {
    const s = makeState({ phase: Phase.TRICK_END, pendingPhase: Phase.HAND_END, nextTrickLeader: 0 });
    const s2 = Euchre.advanceTrick(s);
    assert.equal(s2.phase, Phase.HAND_END);
  });
});

describe('startNextHand', () => {
  it('increments dealer and hand number', () => {
    const s = makeState({ dealer: 1, handNumber: 3, scores: [5, 3] });
    const s2 = Euchre.startNextHand(s);
    assert.equal(s2.dealer, 2);
    assert.equal(s2.handNumber, 4);
  });
  it('preserves scores', () => {
    const s = makeState({ scores: [7, 4] });
    const s2 = Euchre.startNextHand(s);
    assert.deepEqual(s2.scores, [7, 4]);
  });
  it('resets per-hand fields', () => {
    const s = makeState({ trump: 'hearts', maker: 2, teamTricks: [3, 2] });
    const s2 = Euchre.startNextHand(s);
    assert.equal(s2.trump, null);
    assert.equal(s2.maker, null);
    assert.deepEqual(s2.teamTricks, [0, 0]);
    assert.equal(s2.phase, Phase.BIDDING_ROUND1);
  });
  it('deals 5 cards to each player', () => {
    const s = makeState();
    const s2 = Euchre.startNextHand(s);
    assert.ok(s2.hands.every(h => h.length === 5));
  });
});

describe('teamOf', () => {
  it('seats 0 and 2 are team 0', () => {
    assert.equal(Euchre.teamOf(0), 0);
    assert.equal(Euchre.teamOf(2), 0);
  });
  it('seats 1 and 3 are team 1', () => {
    assert.equal(Euchre.teamOf(1), 1);
    assert.equal(Euchre.teamOf(3), 1);
  });
});
