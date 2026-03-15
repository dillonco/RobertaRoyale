/**
 * ai.js - AI player logic for Euchre
 * Depends on Euchre (euchre.js must be loaded first).
 */

'use strict';

const EuchreAI = (() => {
  const E = Euchre; // alias

  // ── Hand Evaluation ──────────────────────────────────────────────────────

  /**
   * Scores the strength of a hand assuming a given trump suit.
   * Used for both bidding and discard decisions.
   */
  function evalStrength(hand, trump) {
    let score = 0;
    for (const card of hand) {
      if (E.isRightBower(card, trump))         score += 3.0;
      else if (E.isLeftBower(card, trump))     score += 2.5;
      else if (E.effectiveSuit(card, trump) === trump) {
        score += card.rank === 'A' ? 1.5 : card.rank === 'K' ? 1.2 : 1.0;
      } else if (card.rank === 'A') {
        score += 0.5; // off-suit ace
      }
    }
    return score;
  }

  // ── Round 1 Bid ──────────────────────────────────────────────────────────

  /**
   * Decide whether to order up the up-card in round 1.
   * @returns {{ action: 'order'|'pass', alone: boolean }}
   */
  function getBidR1(state, playerIndex, difficulty) {
    const trump = state.upCard.suit;

    // Dealer evaluates as if they already have the up-card
    const evalHand = playerIndex === state.dealer
      ? [...state.hands[playerIndex], state.upCard]
      : state.hands[playerIndex];

    const strength = evalStrength(evalHand, trump);

    if (difficulty === 'easy') {
      if (strength >= 3.5 && Math.random() < 0.85) return { action: 'order', alone: false };
      if (strength >= 2.0 && Math.random() < 0.5)  return { action: 'order', alone: false };
      if (Math.random() < 0.10)                     return { action: 'order', alone: false };
      return { action: 'pass' };
    }

    // Canadian Loner: if ordering up partner, it's forced alone — use higher threshold
    const isOrderingPartner = playerIndex !== state.dealer &&
                              (playerIndex + 2) % 4 === state.dealer;
    const forcedAlone = state.canadianLoner && isOrderingPartner;

    if (difficulty === 'hard') {
      const threshold = isOrderingPartner ? 2.8 : 2.0;
      if (strength >= 5.5) return { action: 'order', alone: true };
      if (forcedAlone && strength >= threshold) return { action: 'order', alone: true };
      if (!forcedAlone && strength >= threshold) return { action: 'order', alone: false };
      return { action: 'pass' };
    }

    // Normal
    if (strength >= 6.0) return { action: 'order', alone: true  };
    if (forcedAlone && strength >= 3.5) return { action: 'order', alone: true };
    if (!forcedAlone && strength >= 2.5) return { action: 'order', alone: false };
    return { action: 'pass' };
  }

  // ── Round 2 Bid ──────────────────────────────────────────────────────────

  /**
   * Decide which suit to call (or pass) in round 2.
   * @returns {{ action: 'call'|'pass', suit?: string, alone: boolean }}
   */
  function getBidR2(state, playerIndex, difficulty) {
    const hand = state.hands[playerIndex];
    const mustCall = state.stickDealer && state.currentBidder === state.dealer;

    let bestSuit = null;
    let bestScore = 0;

    for (const suit of E.SUITS) {
      if (suit === state.turnedDownSuit) continue;
      const sc = evalStrength(hand, suit);
      if (sc > bestScore) { bestScore = sc; bestSuit = suit; }
    }

    // Fallback for stick-dealer with no good suit
    const fallback = E.SUITS.find(s => s !== state.turnedDownSuit);

    if (difficulty === 'easy') {
      if (mustCall) return { action: 'call', suit: bestSuit || fallback, alone: false };
      if (bestScore >= 3.0 && Math.random() < 0.8) return { action: 'call', suit: bestSuit, alone: false };
      if (Math.random() < 0.15 && bestSuit)         return { action: 'call', suit: bestSuit, alone: false };
      return { action: 'pass' };
    }

    if (difficulty === 'hard') {
      if (mustCall) return { action: 'call', suit: bestSuit || fallback, alone: bestScore >= 5.0 };
      if (bestScore >= 5.0) return { action: 'call', suit: bestSuit, alone: true };
      if (bestScore >= 1.8) return { action: 'call', suit: bestSuit, alone: false };
      return { action: 'pass' };
    }

    // Normal
    if (mustCall) return { action: 'call', suit: bestSuit || fallback, alone: bestScore >= 6.0 };
    if (bestScore >= 6.0) return { action: 'call', suit: bestSuit, alone: true  };
    if (bestScore >= 2.0) return { action: 'call', suit: bestSuit, alone: false };
    return { action: 'pass' };
  }

  // ── Dealer Discard ───────────────────────────────────────────────────────

  /**
   * Returns the index in the dealer's hand of the card to discard.
   */
  function getDiscard(state, playerIndex, difficulty) {
    const hand  = state.hands[playerIndex];
    const trump = state.trump;

    if (difficulty === 'easy') {
      // Discard first non-trump non-ace; else random
      const safe = hand.findIndex(c =>
        E.effectiveSuit(c, trump) !== trump && c.rank !== 'A'
      );
      return safe >= 0 ? safe : Math.floor(Math.random() * hand.length);
    }

    // Normal/Hard: discard weakest non-trump; if all trump, discard weakest trump
    const indexed = hand.map((c, i) => ({ c, i }));
    const nonTrump = indexed.filter(x => E.effectiveSuit(x.c, trump) !== trump);

    if (nonTrump.length > 0) {
      // Prefer to keep aces; discard lowest non-trump non-ace first
      const nonAce = nonTrump.filter(x => x.c.rank !== 'A');
      const pool = nonAce.length > 0 ? nonAce : nonTrump;
      return pool.reduce((a, b) =>
        E.RANK_VALUE[a.c.rank] <= E.RANK_VALUE[b.c.rank] ? a : b
      ).i;
    }

    // All trump — discard weakest
    return indexed.reduce((a, b) =>
      E.trumpStrength(a.c, trump) <= E.trumpStrength(b.c, trump) ? a : b
    ).i;
  }

  // ── Card Play ────────────────────────────────────────────────────────────

  /**
   * Returns the index in the player's hand of the card to play.
   * Guaranteed to return a legal card index — all strategy branches assign
   * `chosen` from within `legal`, and a safety net catches any edge case.
   */
  function getPlay(state, playerIndex, difficulty) {
    const hand  = state.hands[playerIndex];
    const trump = state.trump;
    const legal = E.getLegalCards(hand, state.ledSuit, trump);

    let chosen; // always set to a card object from `legal`

    if (difficulty === 'easy') {
      chosen = legal[Math.floor(Math.random() * legal.length)];
    } else {
      // ── Normal / Hard difficulty ───────────────────────────────────────

      const myTeam    = E.teamOf(playerIndex);
      const isMaker   = myTeam === state.makerTeam;
      const isLeading = !state.ledSuit;

      // Helper: card value (trump cards ranked higher overall)
      function cardValue(c) {
        return E.effectiveSuit(c, trump) === trump
          ? E.trumpStrength(c, trump) + 10
          : E.RANK_VALUE[c.rank];
      }

      const highest = (cards) => cards.reduce((a, b) => cardValue(a) >= cardValue(b) ? a : b);
      const lowest  = (cards) => cards.reduce((a, b) => cardValue(a) <= cardValue(b) ? a : b);

      if (isLeading) {
        // ── Leading ─────────────────────────────────────────────────────
        if (difficulty === 'hard') {
          if (isMaker) {
            // Lead highest trump on first trick to pull trump
            const trumps = legal.filter(c => E.effectiveSuit(c, trump) === trump);
            if (trumps.length > 0) { chosen = highest(trumps); }
          }
          // If we have a suit where we hold the only trump of that suit and
          // partner hasn't played yet, consider leading it (fall through to highest)
          if (!chosen) chosen = highest(legal);
        } else {
          // Normal
          if (isMaker) {
            // Lead highest trump to pull opponents' trump
            const trumps = legal.filter(c => E.effectiveSuit(c, trump) === trump);
            if (trumps.length > 0) { chosen = highest(trumps); }
          }
          if (!chosen) chosen = highest(legal);
        }
      } else {
        // ── Following ───────────────────────────────────────────────────
        const trick    = state.currentTrick;
        const trickLed = E.effectiveSuit(trick[0].card, trump);

        // Current best card in the trick
        const currentWinner = trick.reduce((best, play) =>
          E.cardBeats(play.card, best.card, trickLed, trump) ? play : best
        );

        // Is my partner currently winning?
        const partnerIdx     = (playerIndex + 2) % 4;
        const partnerWinning = currentWinner.playerIndex === partnerIdx;

        if (difficulty === 'hard') {
          if (partnerWinning) {
            // Partner is winning — don't waste trump or high cards
            chosen = lowest(legal);
          } else {
            // Partner not winning — try to win
            const winners = legal.filter(c =>
              E.cardBeats(c, currentWinner.card, trickLed, trump)
            );
            if (winners.length > 0) {
              // When defending (not maker), play second-hand-low principle:
              // use cheapest winning card to conserve high cards
              chosen = lowest(winners);
            } else {
              // Can't win — play lowest to not waste strong cards
              chosen = lowest(legal);
            }
          }
        } else {
          // Normal
          if (partnerWinning) {
            // Don't waste cards — play lowest legal
            chosen = lowest(legal);
          } else {
            // Try to win with the cheapest card that beats the current winner
            const winners = legal.filter(c =>
              E.cardBeats(c, currentWinner.card, trickLed, trump)
            );
            chosen = winners.length > 0 ? lowest(winners) : lowest(legal);
          }
        }
      }
    }

    // Safety net: if strategy produced a card not in legal (should never
    // happen, but guards against future logic errors), fall back to the
    // first legal card so the AI never reneges.
    if (!legal.includes(chosen)) chosen = legal[0];

    return hand.indexOf(chosen);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return { evalStrength, getBidR1, getBidR2, getDiscard, getPlay };
})();

if (typeof module !== 'undefined') module.exports = EuchreAI;
