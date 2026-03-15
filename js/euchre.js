/**
 * euchre.js - Pure game engine for Euchre
 * All state updates are immutable (return new objects).
 * No DOM dependencies.
 */

'use strict';

const Euchre = (() => {

  // ── Constants ────────────────────────────────────────────────────────────

  const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
  const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];

  const RANK_VALUE = { '9': 1, '10': 2, 'J': 3, 'Q': 4, 'K': 5, 'A': 6 };

  const SUIT_PARTNER = {
    hearts: 'diamonds', diamonds: 'hearts',
    clubs: 'spades',   spades: 'clubs',
  };

  const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const SUIT_COLOR  = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };

  const RANK_DISPLAY = { '9': '9', '10': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A' };

  const Phase = Object.freeze({
    BIDDING_ROUND1: 'BIDDING_ROUND1',
    BIDDING_ROUND2: 'BIDDING_ROUND2',
    DEALER_DISCARD: 'DEALER_DISCARD',
    PLAYING:        'PLAYING',
    TRICK_END:      'TRICK_END',
    HAND_END:       'HAND_END',
    GAME_OVER:      'GAME_OVER',
  });

  // ── Card Utilities ───────────────────────────────────────────────────────

  function createDeck() {
    const deck = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ suit, rank });
    return deck;
  }

  function shuffleDeck(deck) {
    const d = deck.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function isRightBower(card, trump) {
    return !!trump && card.rank === 'J' && card.suit === trump;
  }

  function isLeftBower(card, trump) {
    return !!trump && card.rank === 'J' && card.suit === SUIT_PARTNER[trump];
  }

  /** Returns the suit the card plays as (left bower plays as trump suit). */
  function effectiveSuit(card, trump) {
    if (isRightBower(card, trump) || isLeftBower(card, trump)) return trump;
    return card.suit;
  }

  /** Numeric strength among trump cards only (higher = stronger). */
  function trumpStrength(card, trump) {
    if (isRightBower(card, trump)) return 8;
    if (isLeftBower(card, trump))  return 7;
    return RANK_VALUE[card.rank]; // A=6, K=5, Q=4, 10=2, 9=1
  }

  /** True if `challenger` beats `best` given the led suit and trump. */
  function cardBeats(challenger, best, ledSuit, trump) {
    const cIsTrump = effectiveSuit(challenger, trump) === trump;
    const bIsTrump = effectiveSuit(best, trump) === trump;

    if (cIsTrump && bIsTrump)
      return trumpStrength(challenger, trump) > trumpStrength(best, trump);
    if (cIsTrump) return true;
    if (bIsTrump) return false;

    const cFollows = challenger.suit === ledSuit;
    const bFollows = best.suit === ledSuit;
    if (cFollows && bFollows) return RANK_VALUE[challenger.rank] > RANK_VALUE[best.rank];
    if (cFollows) return true;
    return false;
  }

  /** Returns the player index who wins the trick. */
  function getTrickWinner(trick, trump) {
    const ledSuit = effectiveSuit(trick[0].card, trump);
    let best = 0;
    for (let i = 1; i < trick.length; i++)
      if (cardBeats(trick[i].card, trick[best].card, ledSuit, trump)) best = i;
    return trick[best].playerIndex;
  }

  /** Returns only the legal cards the player may play. */
  function getLegalCards(hand, ledSuit, trump) {
    if (!ledSuit) return hand.slice();
    const follow = hand.filter(c => effectiveSuit(c, trump) === ledSuit);
    return follow.length > 0 ? follow : hand.slice();
  }

  /** Human-readable label including bower status. */
  function cardLabel(card, trump) {
    const sn = card.suit.charAt(0).toUpperCase() + card.suit.slice(1);
    const rn = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' }[card.rank] || card.rank;
    let label = `${rn} of ${sn}`;
    if (trump) {
      if (isRightBower(card, trump)) label += ' — Right Bower';
      else if (isLeftBower(card, trump)) label += ' — Left Bower';
    }
    return label;
  }

  // ── Game State ───────────────────────────────────────────────────────────

  function teamOf(playerIndex) { return playerIndex % 2; }

  function dealHands() {
    const deck = shuffleDeck(createDeck());
    return {
      hands: [deck.slice(0, 5), deck.slice(5, 10), deck.slice(10, 15), deck.slice(15, 20)],
      upCard: deck[20],
    };
  }

  /**
   * Creates the initial game state.
   * @param {string[]} playerNames  [South, West, North, East] — South (index 0) is human.
   * @param {number}   dealerIndex  0-3
   * @param {number}   targetScore  First to this wins (5, 7, or 10).
   */
  function createGame(playerNames, dealerIndex = 0, targetScore = 10, options = {}) {
    const { hands, upCard } = dealHands();
    return {
      players: playerNames.map((name, i) => ({ id: i, name })),
      dealer:        dealerIndex,
      trump:         null,
      upCard,
      turnedDownSuit: null,
      phase:          Phase.BIDDING_ROUND1,
      currentBidder:  (dealerIndex + 1) % 4,
      currentPlayer:  null,
      maker:          null,
      makerTeam:      null,
      alone:          false,
      alonePlayer:    null,
      sittingOut:     null,
      hands,                      // Array[4] of card arrays
      currentTrick:   [],         // [{card, playerIndex}]
      ledSuit:        null,
      trickWinner:    null,
      tricksPlayed:   0,
      teamTricks:     [0, 0],
      scores:         [0, 0],
      targetScore,
      handNumber:     1,
      lastHandResult: null,
      stickDealer:    false,
      pendingPhase:   null,
      nextTrickLeader: null,
      canadianLoner:  !!options.canadianLoner,
      tramEnabled:    options.tramEnabled !== undefined ? !!options.tramEnabled : true,
    };
  }

  // ── Pure Action Handlers ─────────────────────────────────────────────────

  function actionOrderUp(state, playerIndex, goAlone = false) {
    if (state.phase !== Phase.BIDDING_ROUND1 || state.currentBidder !== playerIndex)
      throw new Error('actionOrderUp: invalid state');

    // Canadian Loner: ordering up your partner forces a loner
    const isOrderingPartner = playerIndex !== state.dealer &&
                              (playerIndex + 2) % 4 === state.dealer;
    if (state.canadianLoner && isOrderingPartner) goAlone = true;

    const trump = state.upCard.suit;
    // Dealer picks up the upCard (temporarily 6 cards; they'll discard)
    const hands = state.hands.map((h, i) =>
      i === state.dealer ? [...h, state.upCard] : [...h]
    );

    return {
      ...state,
      trump,
      maker:         playerIndex,
      makerTeam:     teamOf(playerIndex),
      alone:         goAlone,
      alonePlayer:   goAlone ? playerIndex : null,
      hands,
      phase:         Phase.DEALER_DISCARD,
      currentPlayer: state.dealer,
      currentBidder: null,
    };
  }

  function actionPassRound1(state, playerIndex) {
    if (state.phase !== Phase.BIDDING_ROUND1 || state.currentBidder !== playerIndex)
      throw new Error('actionPassRound1: invalid state');

    const next = (playerIndex + 1) % 4;
    const roundStart = (state.dealer + 1) % 4;

    if (next === roundStart) {
      // All 4 passed round 1 → go to round 2
      return {
        ...state,
        turnedDownSuit: state.upCard.suit,
        phase:         Phase.BIDDING_ROUND2,
        currentBidder: roundStart,
      };
    }
    return { ...state, currentBidder: next };
  }

  function actionDealerDiscard(state, cardIndex) {
    if (state.phase !== Phase.DEALER_DISCARD)
      throw new Error('actionDealerDiscard: invalid state');

    const dealer = state.dealer;
    const hands = state.hands.map((h, i) =>
      i === dealer ? h.filter((_, j) => j !== cardIndex) : [...h]
    );

    const sittingOut = state.alone && state.alonePlayer !== null
      ? (state.alonePlayer + 2) % 4
      : null;

    let firstPlayer = (state.dealer + 1) % 4;
    if (sittingOut === firstPlayer) firstPlayer = (firstPlayer + 1) % 4;

    return {
      ...state,
      hands,
      sittingOut,
      phase:         Phase.PLAYING,
      currentPlayer: firstPlayer,
      currentBidder: null,
    };
  }

  function actionCallSuit(state, playerIndex, suit, goAlone = false) {
    if (state.phase !== Phase.BIDDING_ROUND2 || state.currentBidder !== playerIndex)
      throw new Error('actionCallSuit: invalid state');
    if (suit === state.turnedDownSuit)
      throw new Error('actionCallSuit: cannot call turned-down suit');

    const sittingOut = goAlone ? (playerIndex + 2) % 4 : null;
    let firstPlayer = (state.dealer + 1) % 4;
    if (sittingOut === firstPlayer) firstPlayer = (firstPlayer + 1) % 4;

    return {
      ...state,
      trump:         suit,
      maker:         playerIndex,
      makerTeam:     teamOf(playerIndex),
      alone:         goAlone,
      alonePlayer:   goAlone ? playerIndex : null,
      sittingOut,
      phase:         Phase.PLAYING,
      currentPlayer: firstPlayer,
      currentBidder: null,
      stickDealer:   false,
    };
  }

  function actionPassRound2(state, playerIndex) {
    if (state.phase !== Phase.BIDDING_ROUND2 || state.currentBidder !== playerIndex)
      throw new Error('actionPassRound2: invalid state');

    const next = (playerIndex + 1) % 4;
    const roundStart = (state.dealer + 1) % 4;

    if (next === roundStart) {
      // All passed round 2 — stick the dealer (dealer must call)
      return { ...state, currentBidder: state.dealer, stickDealer: true };
    }
    return { ...state, currentBidder: next };
  }

  function actionPlayCard(state, playerIndex, cardIndex) {
    if (state.phase !== Phase.PLAYING || state.currentPlayer !== playerIndex)
      throw new Error('actionPlayCard: invalid state');

    const hand = state.hands[playerIndex];
    const card = hand[cardIndex];

    const legal = getLegalCards(hand, state.ledSuit, state.trump);
    if (!legal.some(c => c === card))
      throw new Error('actionPlayCard: illegal card');

    const hands = state.hands.map((h, i) =>
      i === playerIndex ? h.filter((_, j) => j !== cardIndex) : [...h]
    );

    const trick = [...state.currentTrick, { card, playerIndex }];
    const ledSuit = state.ledSuit || effectiveSuit(card, state.trump);
    const playersInTrick = state.alone ? 3 : 4;

    if (trick.length < playersInTrick) {
      // Trick still in progress — advance to next player
      let next = (playerIndex + 1) % 4;
      if (state.sittingOut === next) next = (next + 1) % 4;
      return { ...state, hands, currentTrick: trick, ledSuit, currentPlayer: next };
    }

    // Trick complete
    const winnerIndex = getTrickWinner(trick, state.trump);
    const winnerTeam  = teamOf(winnerIndex);
    const teamTricks  = state.teamTricks.map((t, i) => i === winnerTeam ? t + 1 : t);
    const tricksPlayed = state.tricksPlayed + 1;

    if (tricksPlayed === 5) {
      // Hand over — always pause at HAND_END so UI can show result, then may go to GAME_OVER
      const result = calcHandResult(state.makerTeam, state.alone, teamTricks);
      const scores = state.scores.map((s, i) => i === result.scoringTeam ? s + result.points : s);

      return {
        ...state, hands, currentTrick: trick, ledSuit, teamTricks,
        tricksPlayed, trickWinner: winnerIndex, scores,
        lastHandResult: result,
        phase:         Phase.TRICK_END,
        pendingPhase:  Phase.HAND_END,
        nextTrickLeader: winnerIndex,
      };
    }

    // More tricks remain
    let nextLeader = winnerIndex;
    if (state.sittingOut === nextLeader) nextLeader = (nextLeader + 1) % 4;

    return {
      ...state, hands, currentTrick: trick, ledSuit, teamTricks,
      tricksPlayed, trickWinner: winnerIndex,
      phase:         Phase.TRICK_END,
      pendingPhase:  Phase.PLAYING,
      nextTrickLeader: nextLeader,
    };
  }

  /** Advances past TRICK_END to the next phase (PLAYING / HAND_END / GAME_OVER). */
  function advanceTrick(state) {
    if (state.phase !== Phase.TRICK_END)
      throw new Error('advanceTrick: not in TRICK_END');

    if (state.pendingPhase === Phase.PLAYING) {
      return {
        ...state,
        phase:          Phase.PLAYING,
        currentTrick:   [],
        ledSuit:        null,
        trickWinner:    null,
        currentPlayer:  state.nextTrickLeader,
        nextTrickLeader: null,
        pendingPhase:   null,
      };
    }
    return { ...state, phase: state.pendingPhase, pendingPhase: null };
  }

  /** Resets for the next hand (increments dealer, redeals). */
  function startNextHand(state) {
    const newDealer = (state.dealer + 1) % 4;
    const { hands, upCard } = dealHands();
    return {
      ...state,
      dealer:         newDealer,
      trump:          null,
      upCard,
      turnedDownSuit: null,
      phase:          Phase.BIDDING_ROUND1,
      currentBidder:  (newDealer + 1) % 4,
      currentPlayer:  null,
      maker:          null,
      makerTeam:      null,
      alone:          false,
      alonePlayer:    null,
      sittingOut:     null,
      hands,
      currentTrick:   [],
      ledSuit:        null,
      trickWinner:    null,
      tricksPlayed:   0,
      teamTricks:     [0, 0],
      lastHandResult: null,
      handNumber:     state.handNumber + 1,
      stickDealer:    false,
      pendingPhase:   null,
      nextTrickLeader: null,
    };
  }

  /**
   * Checks whether the current trick-leader can guarantee winning all remaining
   * tricks. Returns the seat index of the player calling TRAM, or null.
   */
  function detectTRAM(s) {
    if (s.phase !== Phase.PLAYING || s.currentTrick.length !== 0) return null;
    const tricksLeft = 5 - s.tricksPlayed;
    if (tricksLeft < 2) return null;

    // Don't call TRAM when the scoring outcome is already decided
    if (s.makerTeam !== null && s.makerTeam !== undefined) {
      const makerTricks    = s.teamTricks[s.makerTeam];
      const nonMakerTricks = s.teamTricks[1 - s.makerTeam];
      // Euchre is inevitable — makers can't reach 3 even if they win everything left
      if (makerTricks + tricksLeft < 3) return null;
      // Make is secured and march (5 tricks) is impossible — score won't change
      if (makerTricks >= 3 && nonMakerTricks > 0) return null;
    }

    const trump = s.trump;

    function strength(card) {
      if (effectiveSuit(card, trump) === trump)
        return 100 + trumpStrength(card, trump);
      return RANK_VALUE[card.rank];
    }

    const inAnyHand = new Set();
    s.hands.forEach(h => h && h.forEach(c => inAnyHand.add(c.rank + '|' + c.suit)));

    const fullDeck = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        fullDeck.push({ suit, rank });

    // Only the current trick-leader can call TRAM
    const p = s.currentPlayer;
    if (p === null || p === undefined) return null;
    if (!s.hands[p] || s.hands[p].length === 0) return null;

    const pKeys = new Set(s.hands[p].map(c => c.rank + '|' + c.suit));
    const pool  = fullDeck.filter(c => {
      const key = c.rank + '|' + c.suit;
      return inAnyHand.has(key) && !pKeys.has(key);
    });

    const hand       = s.hands[p].slice().sort((a, b) => strength(b) - strength(a));
    // otherCount = active players other than p
    const otherCount = [0, 1, 2, 3].filter(i => s.sittingOut !== i && i !== p).length;

    for (let t = 0; t < tricksLeft; t++) {
      if (hand.length === 0) return null;

      const leadCard = hand.shift();
      const ledSuit  = effectiveSuit(leadCard, trump);

      // 1. Can any unknown card of the same suit beat the lead?
      const unknownSameSuit = pool.filter(c => effectiveSuit(c, trump) === ledSuit);
      if (unknownSameSuit.some(c => cardBeats(c, leadCard, ledSuit, trump))) return null;

      // 2. If leading non-trump, could an opponent be void and trump in?
      if (ledSuit !== trump) {
        const unknownTrump = pool.filter(c => effectiveSuit(c, trump) === trump);
        if (unknownTrump.length > 0 && unknownSameSuit.length < otherCount) return null;
      }

      // p wins this trick — remove otherCount cards from the pool (worst-case)
      const bySuit  = unknownSameSuit.slice().sort((a, b) => strength(a) - strength(b));
      const byOther = pool
        .filter(c => effectiveSuit(c, trump) !== ledSuit)
        .sort((a, b) => strength(a) - strength(b));

      let toRemove = otherCount;
      for (const c of [...bySuit, ...byOther]) {
        if (toRemove === 0) break;
        const idx = pool.findIndex(x => x.rank === c.rank && x.suit === c.suit);
        if (idx !== -1) { pool.splice(idx, 1); toRemove--; }
      }
    }

    return p;
  }

  function calcHandResult(makerTeam, alone, teamTricks) {
    const mt = teamTricks[makerTeam];
    const ot = 1 - makerTeam;
    if (mt < 3)  return { type: 'EUCHRE',     scoringTeam: ot,        points: 2, makerTricks: mt };
    if (mt === 5 && alone)
                 return { type: 'LONE_MARCH', scoringTeam: makerTeam, points: 4, makerTricks: mt };
    if (mt === 5)return { type: 'MARCH',      scoringTeam: makerTeam, points: 2, makerTricks: mt };
    return       { type: 'NORMAL',            scoringTeam: makerTeam, points: 1, makerTricks: mt };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    SUITS, RANKS, RANK_VALUE, SUIT_PARTNER, SUIT_SYMBOL, SUIT_COLOR, RANK_DISPLAY, Phase,
    isRightBower, isLeftBower, effectiveSuit, trumpStrength,
    cardBeats, getTrickWinner, getLegalCards, cardLabel,
    teamOf, createGame,
    actionOrderUp, actionPassRound1, actionDealerDiscard,
    actionCallSuit, actionPassRound2, actionPlayCard,
    advanceTrick, startNextHand, calcHandResult, detectTRAM,
  };
})();

if (typeof module !== 'undefined') module.exports = Euchre;
