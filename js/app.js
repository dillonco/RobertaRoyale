/**
 * app.js - Application controller and UI renderer
 * Depends on euchre.js and ai.js.
 */

'use strict';

(() => {
  const E  = Euchre;
  const AI = EuchreAI;
  const P  = E.Phase;

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Era name generator ───────────────────────────────────────────────────

  const ERA_NAMES = [
    'Roberta','Beverly','Shirley','Marlene','Lorraine','Phyllis','Dolores',
    'Norma','Gloria','Joanne','Carolyn','Marilyn','Patricia','Sandra','Judith',
    'Barbara','Donna','Linda','Sharon','Karen','Susan','Nancy','Diane','Carol',
    'Janet','Kathleen','Margaret','Dorothy','Ruth','Helen','Betty','Frances',
    'Geraldine','Evelyn','Vivian','Audrey','Lois','Elaine','Bonnie','Janice',
    'Gail','Brenda','Cheryl','Sheila','Maureen','Colleen','Irene','Edith',
    'Joyce','Bernice','Mildred','Arlene','Constance','Wanda','Velma','Darlene',
    'Rhonda','Glenda','Jeanette','Rosemary','Alberta','Wilma','Thelma','Doreen'
  ];

  function randomEraName() {
    return ERA_NAMES[Math.floor(Math.random() * ERA_NAMES.length)];
  }

  // ── App State ────────────────────────────────────────────────────────────

  let gameState    = null;
  let selectedCardBtn = null;  // mobile two-tap: card awaiting confirmation
  let aiDifficulty = 'normal';
  let playerName   = '';
  let aiPending    = false;   // Prevent double-scheduling
  let tramEnabled  = true;    // House rule: auto-play TRAM sequences
  let tramActive   = false;   // Currently inside a TRAM auto-play
  let tramSeat     = null;    // Who called TRAM
  let _lastDealKey      = null;
  let _isDealAnim       = false;
  let _lastTricksPlayed = -1;

  const FLY_DUR      = 0.35;  // seconds a single card takes to fly
  const FLY_INTERVAL = 0.06;  // seconds between successive card departures

  // Pending "go alone" callback (set when dialog is open)
  let aloneCallback = null;

  // ── Multiplayer state ─────────────────────────────────────────────────────
  let multiplayerMode = false;
  let mySeatIndex     = 0;      // which seat index is "me"
  let isHost          = false;
  let myRoomCode      = null;

  // ── Routing & Persistence ─────────────────────────────────────────────────

  const STORAGE_KEY = 'robertaroyale_v1';

  function persistSave() {
    if (multiplayerMode) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        screen:       qs('.screen--active')?.id || 'screen-home',
        gameState,
        aiDifficulty,
        playerName,
        prevScores:   _prevScores,
      }));
    } catch (_) {}
  }

  function persistLoad() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function persistClear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function screenToHash(id)  { return '#' + id.replace('screen-', ''); }
  function hashToScreen(hash) {
    const slug = (hash || '').replace(/^#/, '');
    const id   = slug ? 'screen-' + slug : 'screen-home';
    return document.getElementById(id) ? id : 'screen-home';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function qs(sel, ctx = document) { return ctx.querySelector(sel); }
  function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

  function announce(msg, urgent = false) {
    const el = qs(urgent ? '#live-alert' : '#live-status');
    if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; }); }
  }

  function logActivity(msg, type = '', html = false) {
    const body = qs('#activity-log-body');
    if (!body) return;
    const entry = document.createElement('div');
    entry.className = 'activity-log-entry' + (type ? ` activity-log-entry--${type}` : '');
    if (html) entry.innerHTML = msg;
    else entry.textContent = msg;
    body.appendChild(entry);
    body.scrollTop = body.scrollHeight;
  }

  function clearActivityLog() {
    const body = qs('#activity-log-body');
    if (body) body.innerHTML = '';
  }

  function logDivider() {
    const body = qs('#activity-log-body');
    if (!body) return;
    const div = document.createElement('div');
    div.className = 'activity-log-entry activity-log-entry--divider';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function cardStr(card) {
    return `${card.rank}${E.SUIT_SYMBOL[card.suit]}`;
  }

  function suitHtml(suit) {
    return `<span class="suit-icon ${E.SUIT_COLOR[suit]}" aria-hidden="true">${E.SUIT_SYMBOL[suit]}</span>`;
  }

  function cardHtml(card, trump, options = {}) {
    const { playable = false, selected = false, faceDown = false, slot = '', small = false } = options;
    const color  = faceDown ? '' : E.SUIT_COLOR[card.suit];
    const isRB   = !faceDown && trump && E.isRightBower(card, trump);
    const isLB   = !faceDown && trump && E.isLeftBower(card, trump);
    const label  = faceDown ? 'Hidden card' : E.cardLabel(card, trump);
    const ariaDisabled = !faceDown && !playable ? 'aria-disabled="true"' : '';
    const tabIndex = faceDown ? '-1' : (playable ? '0' : '-1');
    const classes  = [
      'card',
      faceDown ? 'card--back' : 'card--face',
      color,
      playable  ? 'card--playable' : '',
      selected  ? 'card--selected' : '',
      isRB      ? 'card--right-bower' : '',
      isLB      ? 'card--left-bower'  : '',
      small     ? 'card--small' : '',
      slot      ? `card--${slot}` : '',
    ].filter(Boolean).join(' ');

    if (faceDown) {
      return `<div class="${classes}" aria-hidden="true"><div class="card-back-pattern"></div></div>`;
    }

    const rankDisp = card.rank;
    const suitDisp = E.SUIT_SYMBOL[card.suit];
    const bowerTag = isRB
      ? `<span class="bower-badge" title="Right Bower">RB</span>`
      : isLB ? `<span class="bower-badge bower-badge--left" title="Left Bower">LB</span>` : '';

    return `
      <button class="${classes}" aria-label="${label}" tabindex="${tabIndex}"
              ${ariaDisabled} data-card="${card.rank}-${card.suit}">
        ${bowerTag}
        <div class="card-corner top-left">
          <div class="card-rank">${rankDisp}</div>
          <div class="card-suit-sm">${suitDisp}</div>
        </div>
        <div class="card-center-suit">${suitDisp}</div>
        <div class="card-corner bottom-right" aria-hidden="true">
          <div class="card-rank">${rankDisp}</div>
          <div class="card-suit-sm">${suitDisp}</div>
        </div>
      </button>`;
  }

  // ── Screen Management ────────────────────────────────────────────────────

  function showScreen(id, { push = true } = {}) {
    qsa('.screen').forEach(el => {
      el.classList.toggle('screen--active', el.id === id);
      el.setAttribute('aria-hidden', el.id !== id ? 'true' : 'false');
    });
    const active = qs(`#${id}`);
    if (active) {
      const focusTarget = active.querySelector('[autofocus], button, input, [tabindex="0"]');
      if (focusTarget) focusTarget.focus();
    }
    if (push) history.pushState({ screen: id }, '', screenToHash(id));
    persistSave();
  }

  // ── Home Screen ──────────────────────────────────────────────────────────

  function initHome() {
    qs('#btn-play-practice').addEventListener('click', () => showScreen('screen-setup'));
    qs('#btn-play-private').addEventListener('click', () => showScreen('screen-private'));
    qs('#btn-play-quick').addEventListener('click',   () => showComingSoon('Quick Match'));
    qs('#btn-play-tourney').addEventListener('click', () => showComingSoon('Tournaments'));
  }

  function showComingSoon(mode) {
    const dlg = qs('#dialog-coming-soon');
    qs('#coming-soon-mode', dlg).textContent = mode;
    openDialog(dlg);
  }

  // ── Setup Screen ─────────────────────────────────────────────────────────

  function initSetup() {
    qs('#setup-name').value = randomEraName();
    qs('#btn-start-game').addEventListener('click', startPracticeGame);
    qs('#btn-back-setup').addEventListener('click', () => showScreen('screen-home'));
    qs('#setup-name').addEventListener('input', e => {
      playerName = e.target.value.trim() || randomEraName();
    });
  }

  function startPracticeGame() {
    playerName   = (qs('#setup-name').value.trim()) || randomEraName();
    aiDifficulty = qs('input[name="difficulty"]:checked').value;
    tramEnabled  = qs('#setup-tram').checked;
    const target = parseInt(qs('input[name="target"]:checked').value, 10);

    // Reset multiplayer state for solo play
    multiplayerMode = false;
    mySeatIndex     = 0;
    tramActive      = false;
    tramSeat        = null;

    const names = [playerName, 'West AI', 'Partner AI', 'East AI'];
    _prevScores = [0, 0];
    gameState = E.createGame(names, 0, target);
    clearActivityLog();
    showScreen('screen-game');
    renderGame();
    processGameLoop();
  }

  // ── Deal / trick-transition animation ────────────────────────────────────

  function playDealAnimation(quick) {
    const center = qs('#trick-center');
    if (!center || !gameState) return;

    const cr    = center.getBoundingClientRect();
    const fromX = cr.left + cr.width  / 2;
    const fromY = cr.top  + cr.height / 2;
    const cardW = 40, cardH = 58;

    // Show deck stack at trick-center
    const deck = document.createElement('div');
    deck.className = 'deal-deck';
    deck.style.cssText = `position:fixed;left:${fromX - cardW / 2}px;top:${fromY - cardH / 2}px;z-index:200;`;
    document.body.appendChild(deck);

    const cardsPerPlayer = quick ? 1 : 5;
    const flyDur         = quick ? 0.28 : FLY_DUR;
    const flyInterval    = quick ? 0.07 : FLY_INTERVAL;

    // Target centre of each player's area, in deal order (dealer+1 first)
    const dealOrder = [0, 1, 2, 3].map(offset => (gameState.dealer + 1 + offset) % 4);

    let pending = 0;

    dealOrder.forEach((seatIdx, seatOrder) => {
      const pos = seatToPos(seatIdx);
      const el  = pos === 'south'
        ? (qs('#human-hand') || qs('.player-area--south'))
        : qs(`.player-area--${pos}`);
      if (!el) return;

      const r  = el.getBoundingClientRect();
      const dx = (r.left + r.width  / 2 - fromX).toFixed(1);
      const dy = (r.top  + r.height / 2 - fromY).toFixed(1);

      for (let i = 0; i < cardsPerPlayer; i++) {
        const delay = ((i * 4 + seatOrder) * flyInterval).toFixed(2);
        const card  = document.createElement('div');
        card.className = 'deal-card-fly';
        card.style.cssText = `left:${fromX - cardW / 2}px;top:${fromY - cardH / 2}px;` +
          `--dx:${dx}px;--dy:${dy}px;--fly-dur:${flyDur}s;--fly-delay:${delay}s;`;
        document.body.appendChild(card);
        pending++;

        card.addEventListener('animationend', () => {
          card.remove();
          if (--pending <= 0) deck.remove();
        }, { once: true });
      }
    });

    // Fallback cleanup
    const maxDelay = ((cardsPerPlayer - 1) * 4 + 3) * flyInterval + flyDur + 0.3;
    setTimeout(() => {
      deck.remove();
      document.querySelectorAll('.deal-card-fly').forEach(c => c.remove());
    }, maxDelay * 1000);
  }

  // ── Game Rendering ───────────────────────────────────────────────────────

  function renderGame() {
    const s = gameState;
    if (!s) return;

    // Detect the start of a new hand for the deal animation
    const dealKey = `${s.dealer}-${s.scores[0]}-${s.scores[1]}`;
    _isDealAnim = s.phase === P.BIDDING_ROUND1 && s.tricksPlayed === 0 && dealKey !== _lastDealKey;
    if (_isDealAnim) {
      _lastDealKey      = dealKey;
      _lastTricksPlayed = 0;
      playDealAnimation(false);
    }

    renderScore(s);
    renderTrumpBadge(s);
    renderPlayerAreas(s);
    renderTrick(s);
    renderHumanHand(s);
    renderControls(s);
    renderDealerChip(s);
    renderMakerChip(s);
    if (!multiplayerMode) persistSave();
  }

  let _prevScores = [0, 0];

  function renderScore(s) {
    const el       = qs('#score-display');
    const myTeam   = multiplayerMode ? mySeatIndex % 2 : 0;
    const myScore  = s.scores[myTeam];
    const oppScore = s.scores[1 - myTeam];
    const pop0 = myScore  > _prevScores[0] ? 'score-value--pop' : '';
    const pop1 = oppScore > _prevScores[1] ? 'score-value--pop' : '';
    _prevScores = [myScore, oppScore];
    el.innerHTML = `
      <div class="scoreboard-pill">
        <div class="score-team">
          <span class="score-label">Us</span>
          <span class="score-value ${pop0}" aria-label="Your team: ${myScore}">${myScore}</span>
        </div>
        <div class="score-divider"></div>
        <div class="score-team">
          <span class="score-label">Them</span>
          <span class="score-value ${pop1}" aria-label="Opponents: ${oppScore}">${oppScore}</span>
        </div>
      </div>`;
  }

  function renderTrumpBadge(s) {
    const el = qs('#trump-badge');
    if (s.trump) {
      const suitName = s.trump.charAt(0).toUpperCase() + s.trump.slice(1);
      el.innerHTML = `
        <span class="trump-label">TRUMP</span>
        <span class="trump-suit ${E.SUIT_COLOR[s.trump]}">${E.SUIT_SYMBOL[s.trump]} ${suitName}</span>
        ${s.maker !== null ? `<span class="trump-maker">${escHtml(s.players[s.maker].name)} made it</span>` : ''}`;
      el.hidden = false;
      el.setAttribute('aria-label', `Trump suit: ${s.trump}`);
    } else {
      el.hidden = true;
    }
  }

  // Returns the CSS position class for seatIdx from the current viewer's perspective
  function seatToPos(seatIdx) {
    const POSITIONS = ['south', 'west', 'north', 'east'];
    return POSITIONS[(seatIdx - mySeatIndex + 4) % 4];
  }

  function renderDealerChip(s) {
    qsa('.dealer-chip').forEach(el => el.remove());
    const area = qs(`.player-area--${seatToPos(s.dealer)}`);
    if (area) {
      const chip = document.createElement('div');
      chip.className = 'dealer-chip';
      chip.title = 'Dealer';
      chip.setAttribute('aria-label', 'Dealer');
      chip.textContent = 'D';
      const nameEl = qs('.player-name', area);
      (nameEl || area).appendChild(chip);
    }
  }

  function renderMakerChip(s) {
    qsa('.maker-chip').forEach(el => el.remove());
    if (s.maker === null || !s.trump) return;
    const area = qs(`.player-area--${seatToPos(s.maker)}`);
    if (area) {
      const chip = document.createElement('div');
      chip.className = `maker-chip ${E.SUIT_COLOR[s.trump]}`;
      chip.title = `Called ${s.trump} trump`;
      chip.setAttribute('aria-label', `Called ${s.trump} trump`);
      chip.textContent = E.SUIT_SYMBOL[s.trump];
      const nameEl = qs('.player-name', area);
      (nameEl || area).appendChild(chip);
    }
  }

  function renderPlayerAreas(s) {
    for (let seatIdx = 0; seatIdx < 4; seatIdx++) {
      const pos       = seatToPos(seatIdx);
      const area      = qs(`.player-area--${pos}`);
      if (!area) continue;

      const nameEl   = qs('.player-name',    area);
      const tricksEl = qs('.player-tricks',  area);
      const statusEl = qs('.player-status',  area);
      const handEl   = qs('.player-hand-back', area);

      const isCurrent    = s.phase === P.PLAYING && s.currentPlayer === seatIdx;
      const isBidder     = (s.phase === P.BIDDING_ROUND1 || s.phase === P.BIDDING_ROUND2
                         || s.phase === P.DEALER_DISCARD) && s.currentBidder === seatIdx;
      const isActive     = isCurrent || isBidder
                        || (s.phase === P.DEALER_DISCARD && s.currentPlayer === seatIdx);
      const isSittingOut = s.sittingOut === seatIdx;
      const isMe         = seatIdx === mySeatIndex;
      const team         = E.teamOf(seatIdx);

      area.classList.toggle('player-area--active', isActive);
      area.classList.toggle('player-area--sitting-out', isSittingOut);

      if (nameEl) {
        nameEl.textContent = s.players[seatIdx].name + (isMe && multiplayerMode ? ' (You)' : '');
      }

      if (tricksEl) {
        const won = s.tricksPlayed > 0 ? s.teamTricks[team] : 0;
        tricksEl.innerHTML = `<div class="tricks-won" aria-label="${won} tricks">${
          Array.from({length: 3}, (_, i) =>
            `<div class="trick-dot${i < won ? ' won' : ''}"></div>`
          ).join('')
        }</div>`;
      }

      if (statusEl) {
        let st = '';
        if (isSittingOut) st = 'Sitting Out';
        else if (isCurrent && !isMe) st = 'Playing…';
        statusEl.innerHTML = (isActive && !isMe && !isSittingOut)
          ? `<span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>`
          : st;
      }

      // Render opponent card backs (everyone except my own seat)
      if (seatIdx !== mySeatIndex && handEl) {
        const count = s.hands[seatIdx].length;
        const seatOrder = (seatIdx - (s.dealer + 1) + 4) % 4;
        handEl.innerHTML = isSittingOut ? '' : Array.from({ length: count }, (_, i) => {
          const dealClass = _isDealAnim ? ' card--deal-in' : '';
          const dealVars  = _isDealAnim ? `; --deal-delay:${((i * 4 + seatOrder) * FLY_INTERVAL + FLY_DUR).toFixed(2)}s` : '';
          return `<div class="card card--back card--small${dealClass}" aria-hidden="true" style="--card-offset:${i}${dealVars}">
             <div class="card-back-pattern"></div>
           </div>`;
        }).join('');
      }
    }

    // Status text overlay
    const statusOverlay = qs('#game-status-text');
    if (statusOverlay) {
      if (s.phase === P.PLAYING && s.currentPlayer !== null) {
        const name = s.players[s.currentPlayer].name;
        statusOverlay.textContent = s.currentPlayer === mySeatIndex ? 'Your turn' : `${name}'s turn`;
      } else if (s.phase === P.BIDDING_ROUND1 || s.phase === P.BIDDING_ROUND2) {
        const bidder = s.currentBidder;
        statusOverlay.textContent = bidder === mySeatIndex ? '' : `${s.players[bidder].name} is bidding…`;
      } else {
        statusOverlay.textContent = '';
      }
    }
  }

  function renderTrick(s) {
    const center = qs('#trick-center');
    if (!center) return;

    // Show directional collection animation when trick is complete
    const COLLECT_CLASSES = ['trick-center--collect-north','trick-center--collect-south','trick-center--collect-west','trick-center--collect-east'];
    center.classList.remove(...COLLECT_CLASSES);
    if (s.phase === P.TRICK_END && s.trickWinner !== null) {
      center.classList.add(`trick-center--collect-${seatToPos(s.trickWinner)}`);
    }

    // Build lookup of which cards belong in which slot this render
    const trickMap = {};
    s.currentTrick.forEach(({ card, playerIndex }) => {
      trickMap[seatToPos(playerIndex)] = { card, playerIndex };
    });

    // Determine the currently-winning player: use trickWinner when the trick is
    // complete (TRICK_END), otherwise compute live — but only once ≥2 cards are down.
    let winningPlayer = null;
    if (s.trickWinner !== null) {
      winningPlayer = s.trickWinner;
    } else if (s.currentTrick.length >= 2) {
      winningPlayer = E.getTrickWinner(s.currentTrick, s.trump);
    }

    qsa('.trick-slot', center).forEach(slot => {
      const pos   = slot.id.replace('trick-slot-', '');
      const entry = trickMap[pos];

      if (!entry) {
        // Slot should be empty — clear only if it currently holds a card
        if (slot.dataset.cardKey) {
          slot.removeAttribute('data-card-key');
          slot.innerHTML = '<div class="trick-slot-placeholder"></div>';
        }
        slot.classList.remove('trick-slot--winner');
        return;
      }

      const { card, playerIndex } = entry;
      slot.classList.toggle('trick-slot--winner', playerIndex === winningPlayer);

      // Only re-render when the card actually changes — this ensures the
      // slide-in animation fires exactly once per newly played card
      const cardKey = `${card.rank}-${card.suit}`;
      if (slot.dataset.cardKey === cardKey) return;
      slot.dataset.cardKey = cardKey;
      slot.innerHTML = cardHtml(card, s.trump, { small: true });
    });

    // Up card display (round 1 only)
    const upCardEl = qs('#up-card-area');
    if (upCardEl) {
      if (s.phase === P.BIDDING_ROUND1 && s.upCard) {
        upCardEl.innerHTML = `
          <div class="up-card-label">Up Card</div>
          ${cardHtml(s.upCard, null, { small: false })}`;
        upCardEl.hidden = false;
      } else {
        upCardEl.hidden = true;
      }
    }

    // Led suit indicator — hide immediately on trick end or when no card has been led
    const ledEl = qs('#trick-led-indicator');
    if (ledEl) {
      if (s.phase === P.PLAYING && s.ledSuit && s.currentTrick.length > 0) {
        const suitName = s.ledSuit.charAt(0).toUpperCase() + s.ledSuit.slice(1);
        ledEl.innerHTML = `<span class="trick-led-label">LED</span><span class="trick-led-suit ${E.SUIT_COLOR[s.ledSuit]}">${E.SUIT_SYMBOL[s.ledSuit]} ${suitName}</span>`;
        ledEl.hidden = false;
      } else {
        ledEl.hidden = true;
        ledEl.innerHTML = '';
      }
    }
  }

  function applyHandFan(handEl) {
    const cards = Array.from(handEl.children);
    const n = cards.length;
    if (n === 0) return;
    const center = (n - 1) / 2;
    cards.forEach((btn, i) => {
      const d       = i - center;
      const rot     = d * 8;
      const yBase   = d * d * 5;
      const playable = btn.classList.contains('card--playable');
      const y       = playable ? yBase - 6 : yBase;
      const scale   = playable ? ' scale(1.07)' : '';
      btn.style.setProperty('--fan-transform', `rotate(${rot}deg) translateY(${y}px)${scale}`);
      btn.style.transform = 'var(--fan-transform)';
      btn.style.zIndex    = String(i + 1);
    });
  }

  function renderHumanHand(s) {
    clearCardSelection();
    const handEl    = qs('#human-hand');
    const pickupEl  = qs('#hand-pickup-card');
    if (!handEl) return;

    const seat      = mySeatIndex;
    const hand      = s.hands[seat];
    const phase     = s.phase;
    const isDiscard = phase === P.DEALER_DISCARD && s.currentPlayer === seat;
    const isPlay    = phase === P.PLAYING && s.currentPlayer === seat;
    const legal     = isPlay
      ? E.getLegalCards(hand, s.ledSuit, s.trump)
      : isDiscard ? hand : [];

    // Reset pickup slot
    if (pickupEl) { pickupEl.innerHTML = ''; pickupEl.hidden = true; }

    // During discard, lift the picked-up card out of the fan
    let fanHand = hand;
    if (isDiscard && s.upCard && pickupEl) {
      const upIdx = hand.findIndex(c => c.rank === s.upCard.rank && c.suit === s.upCard.suit);
      if (upIdx >= 0) {
        const upCard = hand[upIdx];
        pickupEl.innerHTML = `
          <div class="hand-pickup-label">Picked up — discard a card</div>
          ${cardHtml(upCard, s.trump, { playable: true })}`;
        pickupEl.hidden = false;
        fanHand = hand.filter((_, i) => i !== upIdx);
      }
    }

    handEl.setAttribute('aria-label', `Your hand — ${hand.length} cards`);
    handEl.innerHTML = fanHand.map(card => {
      const playable = legal.some(c => c === card);
      return cardHtml(card, s.trump, { playable });
    }).join('');
    applyHandFan(handEl);

    if (_isDealAnim) {
      const seatOrder = (mySeatIndex - (s.dealer + 1) + 4) % 4;
      qsa('.card', handEl).forEach((el, i) => {
        el.classList.add('card--deal-in');
        el.style.setProperty('--deal-delay', `${((i * 4 + seatOrder) * FLY_INTERVAL + FLY_DUR).toFixed(2)}s`);
      });
    }

    // Wire click handlers on both fan and pickup slot
    const isTouch = window.matchMedia('(hover: none)').matches;
    const wireClicks = container => {
      qsa('button.card--playable', container).forEach(btn => {
        btn.addEventListener('click', () => {
          if (isTouch) {
            if (selectedCardBtn === btn) {
              // Second tap — confirm and play
              clearCardSelection();
              handleCardClick(btn);
            } else {
              // First tap — select (lift) the card
              clearCardSelection();
              selectedCardBtn = btn;
              btn.classList.add('card--selected');
              const confirmBtn = qs('#card-confirm-btn');
              if (confirmBtn) confirmBtn.hidden = false;
            }
          } else {
            handleCardClick(btn);
          }
        });
        btn.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(btn); }
        });
      });
    };
    wireClicks(handEl);
    if (pickupEl) wireClicks(pickupEl);

    // Wire confirm button (touch two-tap flow)
    const confirmBtn = qs('#card-confirm-btn');
    if (confirmBtn) {
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', () => {
        if (selectedCardBtn) {
          const btn = selectedCardBtn;
          clearCardSelection();
          handleCardClick(btn);
        }
      });
    }

    // Prompt text
    const promptEl = qs('#hand-prompt');
    if (promptEl) {
      if (isDiscard)      promptEl.textContent = 'Discard a card from your hand';
      else if (isPlay)    promptEl.textContent = 'Your turn — play a card';
      else                promptEl.textContent = '';
    }
  }

  function clearCardSelection() {
    if (selectedCardBtn) {
      selectedCardBtn.classList.remove('card--selected');
      selectedCardBtn = null;
    }
    const confirmBtn = qs('#card-confirm-btn');
    if (confirmBtn) confirmBtn.hidden = true;
  }

  function handleCardClick(btn) {
    const s       = gameState;
    const phase   = s.phase;
    const seat    = mySeatIndex;
    const hand    = s.hands[seat];
    const cardKey = btn.dataset.card;
    const cardIdx = hand.findIndex(c => c && `${c.rank}-${c.suit}` === cardKey);
    if (cardIdx < 0) return;

    if (multiplayerMode) {
      if (phase === P.DEALER_DISCARD && s.currentPlayer === seat) {
        Network.send({ type: 'game_action', action: 'discard', cardIndex: cardIdx });
      } else if (phase === P.PLAYING && s.currentPlayer === seat) {
        Network.send({ type: 'game_action', action: 'play_card', cardIndex: cardIdx });
      }
      return;
    }

    if (phase === P.DEALER_DISCARD && s.currentPlayer === 0) {
      const discarded = hand[cardIdx];
      btn.classList.add('card--discarding');
      btn.disabled = true;
      setTimeout(() => {
        if (!gameState) return;
        gameState = E.actionDealerDiscard(s, cardIdx);
        renderGame();
        announce(`You discarded ${E.cardLabel(discarded, s.trump)}`);
        logActivity(`You discarded ${cardStr(discarded)}`);
        processGameLoop();
      }, 260);
    } else if (phase === P.PLAYING && s.currentPlayer === 0) {
      const card = hand[cardIdx];
      gameState = E.actionPlayCard(s, 0, cardIdx);
      renderGame();
      announce(`You played ${E.cardLabel(card, s.trump)}`);
      logActivity(`You played ${cardStr(card)}`, 'highlight');
      processGameLoop();
    }
  }

  // ── Bidding Controls ─────────────────────────────────────────────────────

  function setControlsOpen(open) {
    const cp      = qs('#controls-panel');
    const toggle  = qs('#controls-toggle');
    const badge   = qs('#controls-toggle-badge');
    const wrapper = qs('#human-hand-wrapper');
    if (!cp || !toggle) return;
    cp.classList.toggle('controls-panel--open', open);
    if (wrapper) wrapper.classList.toggle('panel-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close action panel' : 'Open action panel');
    if (badge) badge.hidden = open;
  }

  function renderControls(s) {
    const panel = qs('#controls-panel-inner');
    if (!panel) return;

    panel.innerHTML = '';

    const phase = s.phase;
    const seat            = mySeatIndex;
    const isHumanBidder   = (phase === P.BIDDING_ROUND1 || phase === P.BIDDING_ROUND2) && s.currentBidder === seat;
    const isHumanDiscard  = phase === P.DEALER_DISCARD && s.currentPlayer === seat;
    const isHumanPlay     = phase === P.PLAYING && s.currentPlayer === seat;
    const needsAction     = isHumanBidder || isHumanDiscard || isHumanPlay;

    if (isHumanBidder && phase === P.BIDDING_ROUND1) {
      renderBidRound1(s, panel);
    } else if (isHumanBidder && phase === P.BIDDING_ROUND2) {
      renderBidRound2(s, panel);
    } else if (isHumanDiscard) {
      panel.innerHTML = `<p class="controls-hint">Click a card in your hand to discard it.</p>`;
    } else if (isHumanPlay) {
      panel.innerHTML = `<p class="controls-hint">Select a card to play.</p>`;
    }

    // Auto-open when action needed, auto-close when not
    setControlsOpen(needsAction);

    // Show badge on toggle button when action needed but panel is closed
    const badge = qs('#controls-toggle-badge');
    if (badge) badge.hidden = true; // badge only shown while manually closed during action
  }

  function renderBidRound1(s, panel) {
    const isDealer = s.dealer === mySeatIndex;
    const orderText = isDealer ? 'Pick It Up' : 'Order It Up';
    const passText  = isDealer ? 'Turn It Down' : 'Pass';
    const suit = s.upCard.suit;

    panel.innerHTML = `
      <div class="bid-prompt">
        <span>Up card: ${suitHtml(suit)}<strong>${suit.charAt(0).toUpperCase() + suit.slice(1)}</strong></span>
        <span class="bid-sub">Make ${suit} trump?</span>
      </div>
      <div class="bid-buttons" role="group" aria-label="Round 1 bidding options">
        <button class="btn btn--primary" id="bid-order">${orderText}</button>
        <button class="btn btn--secondary" id="bid-order-alone">${orderText} — Go Alone</button>
        <button class="btn btn--ghost" id="bid-pass">${passText}</button>
      </div>`;

    qs('#bid-order', panel).addEventListener('click', () => {
      if (multiplayerMode) {
        Network.send({ type: 'game_action', action: 'order_up', alone: false });
      } else {
        const upSuit = s.upCard.suit;
        gameState = E.actionOrderUp(s, 0, false);
        renderGame();
        announce(`Trump is ${upSuit}`);
        logActivity(`You ordered up ${E.SUIT_SYMBOL[upSuit]} ${upSuit} — picking up ${cardStr(s.upCard)}`, 'highlight');
        processGameLoop();
      }
    });

    qs('#bid-order-alone', panel).addEventListener('click', () => {
      openAloneDialog(true, (alone) => {
        if (multiplayerMode) {
          Network.send({ type: 'game_action', action: 'order_up', alone });
        } else {
          const upSuit = s.upCard.suit;
          gameState = E.actionOrderUp(s, 0, alone);
          renderGame();
          announce(`Trump is ${upSuit}${alone ? ' — you go alone!' : ''}`);
          logActivity(`You ordered up ${E.SUIT_SYMBOL[upSuit]} ${upSuit} — picking up ${cardStr(s.upCard)}${alone ? ' · go alone!' : ''}`, 'highlight');
          processGameLoop();
        }
      }, true);
    });

    qs('#bid-pass', panel).addEventListener('click', () => {
      if (multiplayerMode) {
        Network.send({ type: 'game_action', action: 'pass_r1' });
      } else {
        gameState = E.actionPassRound1(s, 0);
        renderGame();
        announce(`You passed`);
        logActivity('You passed');
        processGameLoop();
      }
    });
  }

  function renderBidRound2(s, panel) {
    const isStuck = s.stickDealer && s.currentBidder === 0;
    const availSuits = E.SUITS.filter(suit => suit !== s.turnedDownSuit);

    panel.innerHTML = `
      <div class="bid-prompt">
        <span>Round 2 — Name a suit as trump</span>
        ${isStuck ? '<span class="bid-sub stuck-dealer">You must call (Stick the Dealer)</span>' : ''}
      </div>
      <div class="bid-buttons bid-buttons--suits" role="group" aria-label="Round 2 suit selection">
        ${availSuits.map(suit => `
          <button class="btn btn--suit btn--suit-${suit}" data-suit="${suit}"
                  aria-label="Call ${suit} as trump">
            ${suitHtml(suit)} ${suit.charAt(0).toUpperCase() + suit.slice(1)}
          </button>`).join('')}
        ${!isStuck ? '<button class="btn btn--ghost" id="bid-pass-r2">Pass</button>' : ''}
      </div>
      <div class="bid-alone-row">
        <label class="alone-toggle">
          <input type="checkbox" id="chk-alone-r2"> Go Alone (if calling)
        </label>
      </div>`;

    qsa('[data-suit]', panel).forEach(btn => {
      btn.addEventListener('click', () => {
        const suit  = btn.dataset.suit;
        const alone = qs('#chk-alone-r2', panel)?.checked ?? false;
        if (alone) {
          openAloneDialog(true, (confirmed) => {
            if (multiplayerMode) {
              Network.send({ type: 'game_action', action: 'call_suit', suit, alone: confirmed });
            } else {
              gameState = E.actionCallSuit(s, 0, suit, confirmed);
              renderGame();
              announce(`Trump is ${suit}${confirmed ? ' — you go alone!' : ''}`);
              logActivity(`You called ${E.SUIT_SYMBOL[suit]} ${suit}${confirmed ? ' — go alone!' : ''}`, 'highlight');
              processGameLoop();
            }
          }, true);
        } else {
          if (multiplayerMode) {
            Network.send({ type: 'game_action', action: 'call_suit', suit, alone: false });
          } else {
            gameState = E.actionCallSuit(s, 0, suit, false);
            renderGame();
            announce(`Trump is ${suit}`);
            logActivity(`You called ${E.SUIT_SYMBOL[suit]} ${suit} as trump`, 'highlight');
            processGameLoop();
          }
        }
      });
    });

    const passBtn = qs('#bid-pass-r2', panel);
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (multiplayerMode) {
          Network.send({ type: 'game_action', action: 'pass_r2' });
        } else {
          gameState = E.actionPassRound2(s, 0);
          renderGame();
          announce('You passed');
          logActivity('You passed');
          processGameLoop();
        }
      });
    }
  }

  // ── TRAM Detection ───────────────────────────────────────────────────────

  function detectTRAM(s) {
    if (s.phase !== P.PLAYING || s.currentTrick.length !== 0) return null;
    const tricksLeft = 5 - s.tricksPlayed;
    if (tricksLeft < 2) return null;

    const trump = s.trump;

    function cardVal(card, ledSuit) {
      if (E.effectiveSuit(card, trump) === trump)
        return 100 + E.trumpStrength(card, trump);
      if (ledSuit && card.suit === ledSuit)
        return 10 + E.RANK_VALUE[card.rank];
      return E.RANK_VALUE[card.rank];
    }

    function strongest(cards, ledSuit) {
      return cards.reduce((best, c) =>
        cardVal(c, ledSuit) > cardVal(best, ledSuit) ? c : best
      );
    }

    function weakest(cards, ledSuit) {
      return cards.reduce((low, c) =>
        cardVal(c, ledSuit) < cardVal(low, ledSuit) ? c : low
      );
    }

    for (let p = 0; p < 4; p++) {
      if (s.sittingOut === p) continue;
      if (!s.hands[p] || s.hands[p].length === 0) continue;

      const simHands = s.hands.map(h => h.slice());
      let leader = s.currentPlayer;
      let pWinsAll = true;

      for (let t = 0; t < tricksLeft; t++) {
        if (simHands[leader].length === 0) { pWinsAll = false; break; }

        const leadCard = strongest(simHands[leader], null);
        const ledSuit  = E.effectiveSuit(leadCard, trump);
        simHands[leader] = simHands[leader].filter(c => c !== leadCard);

        let bestCard   = leadCard;
        let bestPlayer = leader;

        for (let i = 1; i < 4; i++) {
          const seat = (leader + i) % 4;
          if (s.sittingOut === seat) continue;
          if (simHands[seat].length === 0) continue;

          const legal = E.getLegalCards(simHands[seat], ledSuit, trump);
          const isPartner   = (seat % 2) === (p % 2) && seat !== p;
          const isOpponent  = !isPartner && seat !== p;
          let play;

          if (seat === p) {
            // p always plays their strongest card to try to win
            play = strongest(legal, ledSuit);
          } else if (isOpponent) {
            // Opponents play adversarially: strongest card that beats the current
            // winner if possible; otherwise throw their weakest (keep strong cards
            // for later tricks where they might beat p).
            const canBeat = legal.filter(c => E.cardBeats(c, bestCard, ledSuit, trump));
            play = canBeat.length > 0 ? strongest(canBeat, ledSuit) : weakest(legal, ledSuit);
          } else {
            // Partner cooperates: always throw their weakest card so they never
            // accidentally take the trick away from p.
            play = weakest(legal, ledSuit);
          }

          simHands[seat] = simHands[seat].filter(c => c !== play);

          if (E.cardBeats(play, bestCard, ledSuit, trump)) {
            bestCard   = play;
            bestPlayer = seat;
          }
        }

        if (bestPlayer !== p) { pWinsAll = false; break; }
        leader = p;
      }

      if (pWinsAll) return p;
    }

    return null;
  }

  function showTRAMBanner(playerName) {
    const banner  = qs('#tram-banner');
    const textEl  = qs('#tram-banner-text');
    if (!banner || !textEl) return;

    textEl.textContent = `${playerName} — TRAM!`;
    banner.hidden = false;

    // Re-trigger animation by cloning
    const inner   = banner.querySelector('.tram-banner-inner');
    const clone   = inner.cloneNode(true);
    inner.parentNode.replaceChild(clone, inner);

    setTimeout(() => { banner.hidden = true; }, 2800);
  }

  // ── Game Loop ────────────────────────────────────────────────────────────

  function processGameLoop() {
    if (multiplayerMode) return; // Server drives AI and game loop
    const s = gameState;
    if (!s) return;
    aiPending = false;

    const phase = s.phase;

    // After trick ends, pause then continue
    if (phase === P.TRICK_END) {
      const ledEl = qs('#trick-led-indicator');
      if (ledEl) { ledEl.hidden = true; ledEl.innerHTML = ''; }
      const trickWinner = s.players[s.trickWinner];
      announce(`${trickWinner.name} wins the trick`);
      const trickSummary = s.currentTrick
        .map(({ card, playerIndex }) => {
          const label = `${seatToPos(playerIndex)[0].toUpperCase()}: ${cardStr(card)}`;
          return playerIndex === s.trickWinner
            ? `<strong class="trick-winner-card">${label}</strong>`
            : label;
        })
        .join(' · ');
      logActivity(`${trickWinner.name} wins the trick`, 'trick');
      logActivity(trickSummary, '', true);
      const trickDelay = tramActive ? 700 : 1400;
      setTimeout(() => {
        if (!gameState) return;
        gameState = E.advanceTrick(gameState);
        if (gameState.phase !== P.PLAYING) { tramActive = false; tramSeat = null; }
        renderGame();
        processGameLoop();
      }, trickDelay);
      return;
    }

    if (phase === P.HAND_END) {
      tramActive = false;
      tramSeat   = null;
      showHandResult(s);
      return;
    }

    // Check for TRAM at the start of each trick
    if (phase === P.PLAYING && s.currentTrick.length === 0 && !tramActive && tramEnabled) {
      const tram = detectTRAM(s);
      if (tram !== null) {
        tramActive = true;
        tramSeat   = tram;
        const tramName = s.players[tram].name;
        logActivity(`${tramName} — TRAM! The Rest Are Mine`, 'highlight');
        announce(`${tramName} — TRAM!`);
        showTRAMBanner(tramName);
      }
    }

    // Determine who needs to act
    let actorIdx = null;

    if (phase === P.BIDDING_ROUND1 || phase === P.BIDDING_ROUND2) {
      actorIdx = s.currentBidder;
    } else if (phase === P.DEALER_DISCARD) {
      actorIdx = s.currentPlayer; // dealer
    } else if (phase === P.PLAYING) {
      actorIdx = s.currentPlayer;
    }

    // During TRAM, human's turn is auto-played like AI
    if (actorIdx === null || (actorIdx === 0 && !tramActive)) return;

    // Schedule AI action (or human auto-play during TRAM)
    if (!aiPending) {
      aiPending = true;
      const delay = tramActive ? 350 + Math.random() * 150 : 700 + Math.random() * 500;
      setTimeout(() => performAIAction(actorIdx), delay);
    }
  }

  function performAIAction(actorIdx) {
    aiPending = false;
    const s = gameState;
    if (!s) return;

    const phase = s.phase;

    try {
      if (phase === P.BIDDING_ROUND1 && s.currentBidder === actorIdx) {
        const decision = AI.getBidR1(s, actorIdx, aiDifficulty);
        const name = s.players[actorIdx].name;
        if (decision.action === 'order') {
          const tn = s.upCard.suit;
          gameState = E.actionOrderUp(s, actorIdx, decision.alone);
          announce(`${name} ordered up ${tn} as trump` + (decision.alone ? ' and goes alone!' : ''));
          logActivity(`${name} ordered up ${E.SUIT_SYMBOL[tn]} ${tn} — picking up ${cardStr(s.upCard)}${decision.alone ? ' · go alone!' : ''}`, 'highlight');
          // AI dealer should auto-discard (only if dealer is also AI)
          if (gameState.phase === P.DEALER_DISCARD && gameState.currentPlayer !== 0) {
            const di = AI.getDiscard(gameState, gameState.currentPlayer, aiDifficulty);
            gameState = E.actionDealerDiscard(gameState, di);
          }
        } else {
          gameState = E.actionPassRound1(s, actorIdx);
          announce(`${name} passed`);
          logActivity(`${name} passed`);
        }

      } else if (phase === P.BIDDING_ROUND2 && s.currentBidder === actorIdx) {
        const decision = AI.getBidR2(s, actorIdx, aiDifficulty);
        const name = s.players[actorIdx].name;
        if (decision.action === 'call') {
          gameState = E.actionCallSuit(s, actorIdx, decision.suit, decision.alone);
          announce(`${name} called ${decision.suit} as trump` + (decision.alone ? ' and goes alone!' : ''));
          logActivity(`${name} called ${E.SUIT_SYMBOL[decision.suit]} ${decision.suit} as trump${decision.alone ? ' — go alone!' : ''}`, 'highlight');
        } else {
          gameState = E.actionPassRound2(s, actorIdx);
          announce(`${name} passed`);
          logActivity(`${name} passed`);
        }

      } else if (phase === P.DEALER_DISCARD && s.currentPlayer === actorIdx) {
        const name = s.players[actorIdx].name;
        const di = AI.getDiscard(s, actorIdx, aiDifficulty);
        gameState = E.actionDealerDiscard(s, di);
        announce(`${name} discarded a card`);
        logActivity(`${name} discarded`);

      } else if (phase === P.PLAYING && s.currentPlayer === actorIdx) {
        const name = s.players[actorIdx].name;
        const ci = AI.getPlay(s, actorIdx, aiDifficulty);
        const card = s.hands[actorIdx][ci];
        gameState = E.actionPlayCard(s, actorIdx, ci);
        announce(`${name} played ${E.cardLabel(card, s.trump)}`);
        logActivity(`${name} played ${cardStr(card)}`);
      }

    } catch (err) {
      console.error('AI action error:', err);
    }

    renderGame();
    processGameLoop();
  }

  // ── Alone Dialog ─────────────────────────────────────────────────────────

  function openAloneDialog(goingAlone, callback, forceAlone = false) {
    if (forceAlone) {
      // They already clicked "Go Alone" button — confirm directly
      const dlg = qs('#dialog-go-alone');
      aloneCallback = callback;
      openDialog(dlg);
      return;
    }
    // They clicked normal "Order Up" — just call without alone
    callback(false);
  }

  // ── Hand Result Overlay ──────────────────────────────────────────────────

  function showHandResult(s) {
    const r     = s.lastHandResult;
    const panel = qs('#hand-result');
    if (!panel || !r) return;

    const messages = {
      NORMAL:     { icon: '✓', title: 'Makers took it!',        cls: 'result--good' },
      MARCH:      { icon: '★', title: 'March! All 5 tricks!',   cls: 'result--great' },
      LONE_MARCH: { icon: '★', title: 'Lone March! 4 points!',  cls: 'result--great' },
      EUCHRE:     { icon: '✗', title: 'Euchred!',               cls: 'result--bad' },
    };

    const { icon, title, cls } = messages[r.type] || messages.NORMAL;
    const makerName   = s.players[s.maker].name;

    const descriptions = {
      NORMAL:     `${makerName} made ${r.makerTricks} tricks. +1 point.`,
      MARCH:      `${makerName}'s team swept all 5 tricks. +2 points!`,
      LONE_MARCH: `${makerName} went alone and swept all 5 tricks. +4 points!`,
      EUCHRE:     `${makerName} was euchred — only got ${r.makerTricks} trick${r.makerTricks !== 1 ? 's' : ''}. Opponents get +2!`,
    };

    panel.innerHTML = `
      <div class="hand-result-inner ${cls}" role="dialog" aria-modal="true" aria-labelledby="hand-result-title">
        <div class="result-icon" aria-hidden="true">${icon}</div>
        <h2 id="hand-result-title">${title}</h2>
        <p class="result-desc">${descriptions[r.type]}</p>
        <div class="result-score" aria-live="polite">
          <div class="result-score-row">
            <span>You &amp; Partner</span>
            <span class="score-big">${s.scores[0]}</span>
          </div>
          <div class="result-score-row">
            <span>Opponents</span>
            <span class="score-big">${s.scores[1]}</span>
          </div>
        </div>
        <button class="btn btn--primary" id="btn-next-hand" autofocus>Next Hand</button>
      </div>`;

    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    announce(title + ' ' + descriptions[r.type], true);

    const myTeam  = multiplayerMode ? mySeatIndex % 2 : 0;
    logActivity(`${title} — ${descriptions[r.type]}`, 'score');
    logActivity(`Score: Us ${s.scores[myTeam]} — Them ${s.scores[1 - myTeam]}`, 'score');

    const trap = trapFocus(panel);

    const isGameOver = s.scores.some(score => score >= s.targetScore);
    const nextBtn    = qs('#btn-next-hand', panel);

    if (multiplayerMode) {
      if (isHost) {
        if (nextBtn) nextBtn.textContent = isGameOver ? 'See Final Results →' : 'Next Hand';
        qs('#btn-next-hand', panel).addEventListener('click', () => {
          panel.hidden = true;
          panel.setAttribute('aria-hidden', 'true');
          trap.release();
          Network.send({ type: 'game_action', action: 'next_hand' });
        });
      } else {
        // Non-host just waits — replace button with status
        if (nextBtn) {
          nextBtn.textContent = 'Waiting for host to continue…';
          nextBtn.disabled = true;
        }
        // Panel will be hidden when server sends next game_state
      }
    } else {
      const btnLabel = isGameOver ? 'See Final Results →' : 'Next Hand';
      if (nextBtn) nextBtn.textContent = btnLabel;

      qs('#btn-next-hand', panel).addEventListener('click', () => {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        trap.release();
        if (isGameOver) {
          showGameOver(s);
        } else {
          tramActive = false;
          tramSeat   = null;
          gameState = E.startNextHand(s);
          logDivider();
          renderGame();
          processGameLoop();
        }
      });
    }
  }

  // ── Game Over Screen ─────────────────────────────────────────────────────

  function showGameOver(s) {
    const [t0, t1] = s.scores;
    const youWon   = t0 >= s.targetScore;
    const title    = youWon ? 'You Win!' : 'Opponents Win';
    const sub      = youWon
      ? `Your team reached ${t0} points first. Well played!`
      : `Opponents reached ${t1} points. Better luck next time!`;

    qs('#gameover-title').textContent   = title;
    qs('#gameover-subtitle').textContent = sub;
    qs('#gameover-score-you').textContent = `You & Partner: ${t0}`;
    qs('#gameover-score-opp').textContent = `Opponents: ${t1}`;

    showScreen('screen-gameover');
    announce(title + '. ' + sub, true);
  }

  // ── Dialog Utilities ─────────────────────────────────────────────────────

  function openDialog(dlg) {
    dlg.showModal ? dlg.showModal() : (dlg.hidden = false);
    const trap = trapFocus(dlg);
    dlg._releaseTrap = trap.release;
  }

  function closeDialog(dlg) {
    dlg.close ? dlg.close() : (dlg.hidden = true);
    if (dlg._releaseTrap) { dlg._releaseTrap(); dlg._releaseTrap = null; }
  }

  /** Basic focus trap for a container. Returns { release }. */
  function trapFocus(container) {
    const focusable = () => qsa(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      container
    ).filter(el => !el.closest('[aria-hidden="true"]'));

    function handleKey(e) {
      const els = focusable();
      if (!els.length) return;
      if (e.key !== 'Tab') return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', handleKey);
    const first = focusable()[0];
    if (first) first.focus();

    return { release: () => document.removeEventListener('keydown', handleKey) };
  }

  // ── Multiplayer helpers ───────────────────────────────────────────────────

  function leaveMultiplayer() {
    Network.disconnect();
    multiplayerMode = false;
    mySeatIndex     = 0;
    isHost          = false;
    myRoomCode      = null;
    gameState       = null;
    _prevScores     = [0, 0];
    // Hide hand result overlay if visible
    const panel = qs('#hand-result');
    if (panel) { panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); }
  }

  function setPrivateError(msg) {
    const el = qs('#private-error');
    if (el) el.textContent = msg;
  }

  // ── Private Game Screen ───────────────────────────────────────────────────

  function initPrivateScreen() {
    qs('#private-name').value = randomEraName();
    qs('#btn-back-private').addEventListener('click', () => showScreen('screen-home'));

    qs('#btn-create-room').addEventListener('click', async () => {
      setPrivateError('');
      const name = (qs('#private-name').value.trim()) || randomEraName();
      qs('#btn-create-room').disabled = true;
      try {
        await Network.connect();
        setupNetworkHandlers();
        Network.send({ type: 'create_room', playerName: name });
      } catch (err) {
        setPrivateError(err.message);
        qs('#btn-create-room').disabled = false;
      }
    });

    qs('#btn-join-room').addEventListener('click', async () => {
      setPrivateError('');
      const name = (qs('#private-name').value.trim()) || randomEraName();
      const code = qs('#join-code-input').value.trim().toUpperCase();
      if (code.length !== 6) { setPrivateError('Enter the 6-character room code.'); return; }
      qs('#btn-join-room').disabled = true;
      try {
        await Network.connect();
        setupNetworkHandlers();
        Network.send({ type: 'join_room', code, playerName: name });
      } catch (err) {
        setPrivateError(err.message);
        qs('#btn-join-room').disabled = false;
      }
    });

    // Allow Enter key in code input to trigger Join
    qs('#join-code-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') qs('#btn-join-room').click();
    });
  }

  // ── Lobby Screen ──────────────────────────────────────────────────────────

  function showLobby(code, players, hostStatus) {
    myRoomCode = code;
    isHost     = hostStatus;

    const card = qs('.lobby-card');
    if (card) card.classList.toggle('is-host', isHost);

    const codeBtn = qs('#lobby-code-btn');
    if (codeBtn) codeBtn.textContent = code;

    renderLobbySeats(players);
    updateLobbyStartBtn(players);

    showScreen('screen-lobby');
  }

  function renderLobbySeats(players) {
    const container = qs('#lobby-seats');
    if (!container) return;
    const SEAT_LABELS = ['South (You)', 'West', 'North (Partner)', 'East'];
    const TEAM_LABELS = ['Team A', 'Team B', 'Team A', 'Team B'];
    container.innerHTML = Array.from({ length: 4 }, (_, i) => {
      const p      = players.find(pl => pl.seatIndex === i);
      const filled = !!p;
      const isMe   = p && p.id === (Network.isConnected() ? undefined : null) || (p && p.seatIndex === mySeatIndex);
      const meFlag = filled && p.seatIndex === mySeatIndex;
      return `
        <div class="lobby-seat lobby-seat--${filled ? 'filled' : 'empty'}${meFlag ? ' lobby-seat--me' : ''}${i === 0 && p ? ' lobby-seat--host' : ''}"
             role="listitem">
          <div class="lobby-seat-dot"></div>
          <div class="lobby-seat-info">
            <div class="lobby-seat-name">${filled ? escHtml(p.name) : 'Empty'}</div>
            <div class="lobby-seat-sub">${filled ? TEAM_LABELS[i] : SEAT_LABELS[i]}</div>
          </div>
        </div>`;
    }).join('');
  }

  function updateLobbyStartBtn(players) {
    const btn = qs('#btn-start-private');
    if (!btn) return;
    if (!isHost) { btn.hidden = true; return; }
    btn.hidden = false;
    const tg = qs('#lobby-target-group');
    if (tg) tg.hidden = false;
    const count = players.filter(p => p.connected !== false).length;
    btn.disabled = count < 2;
    btn.textContent = count < 2
      ? 'Start Game (need 2+ players)'
      : `Start Game (${count} player${count !== 1 ? 's' : ''})`;
  }

  function initLobbyScreen() {
    qs('#lobby-code-btn').addEventListener('click', () => {
      const code = myRoomCode;
      if (!code) return;
      navigator.clipboard?.writeText(code).then(() => {
        const hint = qs('#copy-hint');
        if (hint) {
          hint.textContent = 'copied!';
          hint.classList.add('copy-hint--done');
          setTimeout(() => {
            hint.textContent = 'click to copy';
            hint.classList.remove('copy-hint--done');
          }, 2000);
        }
      }).catch(() => {});
    });

    qs('#btn-start-private').addEventListener('click', () => {
      const target = parseInt(qs('input[name="lobby-target"]:checked')?.value, 10) || 10;
      Network.send({ type: 'start_game', target });
    });

    qs('#btn-leave-lobby').addEventListener('click', () => {
      leaveMultiplayer();
      showScreen('screen-home');
    });
  }

  // ── Network handlers ──────────────────────────────────────────────────────

  function setupNetworkHandlers() {
    Network.on('room_created', msg => {
      mySeatIndex = msg.seatIndex;
      qs('#btn-create-room').disabled = false;
      showLobby(msg.code, msg.players, true);
    });

    Network.on('room_joined', msg => {
      mySeatIndex = msg.seatIndex;
      qs('#btn-join-room').disabled = false;
      showLobby(msg.code, msg.players, false);
    });

    Network.on('player_joined', msg => {
      renderLobbySeats(msg.players);
      updateLobbyStartBtn(msg.players);
      const newP = msg.players[msg.players.length - 1];
      announce(`${newP?.name || 'A player'} joined the room`);
    });

    Network.on('player_left', msg => {
      renderLobbySeats(msg.players);
      updateLobbyStartBtn(msg.players);
      const name = msg.name || 'A player';
      logActivity(`${escHtml(name)} left the lobby`);
      announce(`${name} left the room`);
    });

    Network.on('host_changed', msg => {
      if (msg.hostId === /* our id unknown client-side */ null) return;
      // Refresh lobby — we may now be host if we were first remaining player
      // Since we can't know our id from the client easily, check if start btn appears
    });

    Network.on('game_started', msg => {
      multiplayerMode = true;
      mySeatIndex     = msg.seatIndex;
      _prevScores     = [0, 0];
      gameState       = msg.state;
      clearActivityLog();
      showScreen('screen-game');
      renderGame();
    });

    Network.on('game_state', msg => {
      const prevPhase = gameState?.phase;
      const prevTrump = gameState?.trump;
      gameState = msg.state;

      // Log when trump is newly established (bidding resolved server-side)
      if (!prevTrump && gameState.trump && gameState.maker !== null) {
        const makerName = gameState.players[gameState.maker].name;
        const suit = gameState.trump;
        logActivity(`${makerName} made ${E.SUIT_SYMBOL[suit]} ${suit} trump`, 'highlight');
      }

      // Log trick completion
      if (gameState.phase === P.TRICK_END && prevPhase !== P.TRICK_END && gameState.trickWinner !== null) {
        const winner = gameState.players[gameState.trickWinner];
        const trickSummary = gameState.currentTrick
          .map(({ card, playerIndex }) => {
            const label = `${seatToPos(playerIndex)[0].toUpperCase()}: ${cardStr(card)}`;
            return playerIndex === gameState.trickWinner
              ? `<strong class="trick-winner-card">${label}</strong>`
              : label;
          })
          .join(' · ');
        logActivity(`${winner.name} wins the trick`, 'trick');
        logActivity(trickSummary, '', true);
      }

      // Dismiss hand result overlay when moving out of HAND_END
      if (prevPhase === P.HAND_END && gameState.phase !== P.HAND_END) {
        const panel = qs('#hand-result');
        if (panel && !panel.hidden) {
          panel.hidden = true;
          panel.setAttribute('aria-hidden', 'true');
        }
      }

      renderGame();

      // Show hand result when entering HAND_END
      if (prevPhase !== P.HAND_END && gameState.phase === P.HAND_END) {
        showHandResult(gameState);
      }
    });

    Network.on('game_over', msg => {
      showGameOver({ scores: msg.scores, targetScore: msg.targetScore });
    });

    Network.on('player_disconnected', msg => {
      announce(`${msg.name} disconnected — AI takes over`, false);
      const status = qs('#lobby-status');
      if (status) status.textContent = `${msg.name} disconnected — AI is playing their seat`;
    });

    Network.on('error', msg => {
      setPrivateError(msg.message);
      qs('#btn-create-room') && (qs('#btn-create-room').disabled = false);
      qs('#btn-join-room')   && (qs('#btn-join-room').disabled = false);
    });

    Network.on('disconnect', () => {
      if (multiplayerMode) {
        announce('Disconnected from server', true);
      }
    });
  }

  function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function printConsoleBanner() {
    console.log([
      '%c',
      ' ___   ___   ___   ___  ',
      '|A  | |K  | |Q  | |J  | ',
      '| ♠ | | ♥ | | ♦ | | ♣ | ',
      '|__A| |__K| |__Q| |__J| ',
    ].join('\n'), 'font-family: monospace; font-size: 13px; line-height: 1.5;');
    console.log(
      '%cHey. Hey, you.',
      'font-size: 16px; font-weight: bold; color: #93f005;'
    );
    console.log(
      '%cPlease, I\'m begging you — close the DevTools and go enjoy the game.\nThis is euchre. It\'s a card game. For fun. Nobody is cryptomining.\nThere\'s no tracking pixel buried in the jack of clubs.\nJust... chill out. Deal the cards. Have a good time. 🃏',
      'font-size: 13px; color: #ccc; line-height: 1.6;'
    );
  }

  function init() {
    printConsoleBanner();
    initHome();
    initSetup();
    initPrivateScreen();
    initLobbyScreen();

    // Go alone dialog buttons
    const dlgAlone = qs('#dialog-go-alone');
    if (dlgAlone) {
      qs('#btn-alone-yes', dlgAlone).addEventListener('click', () => {
        closeDialog(dlgAlone);
        if (aloneCallback) { aloneCallback(true); aloneCallback = null; }
      });
      qs('#btn-alone-no', dlgAlone).addEventListener('click', () => {
        closeDialog(dlgAlone);
        if (aloneCallback) { aloneCallback(false); aloneCallback = null; }
      });
      dlgAlone.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeDialog(dlgAlone);
          if (aloneCallback) { aloneCallback(false); aloneCallback = null; }
        }
      });
    }

    // Coming soon dialog close
    const dlgSoon = qs('#dialog-coming-soon');
    if (dlgSoon) {
      qs('#btn-close-soon', dlgSoon).addEventListener('click', () => closeDialog(dlgSoon));
      dlgSoon.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeDialog(dlgSoon);
      });
    }

    // Game over buttons
    const btnPlayAgain = qs('#btn-play-again');
    if (btnPlayAgain) btnPlayAgain.addEventListener('click', () => showScreen('screen-setup'));
    const btnHomeAgain = qs('#btn-home-again');
    if (btnHomeAgain) btnHomeAgain.addEventListener('click', () => showScreen('screen-home'));

    // Rules modal
    const btnRules = qs('#btn-rules');
    const dlgRules = qs('#dialog-rules');
    if (btnRules && dlgRules) {
      btnRules.addEventListener('click', () => openDialog(dlgRules));
      qs('#btn-close-rules', dlgRules).addEventListener('click', () => closeDialog(dlgRules));
      dlgRules.addEventListener('keydown', e => { if (e.key === 'Escape') closeDialog(dlgRules); });
    }

    // Activity log — collapse toggle (desktop header) + mobile open/close
    const btnLogToggle   = qs('#btn-log-toggle');
    const activityLog    = qs('#activity-log');
    const btnLogCollapse = qs('#btn-log-collapse');

    // Restore collapsed state
    if (activityLog && localStorage.getItem('logCollapsed') === '1') {
      activityLog.classList.add('activity-log--collapsed');
      if (btnLogCollapse) btnLogCollapse.setAttribute('aria-expanded', 'false');
    }

    if (btnLogCollapse && activityLog) {
      btnLogCollapse.addEventListener('click', e => {
        e.stopPropagation();
        const collapsed = activityLog.classList.toggle('activity-log--collapsed');
        btnLogCollapse.setAttribute('aria-expanded', String(!collapsed));
        localStorage.setItem('logCollapsed', collapsed ? '1' : '0');
      });
    }

    if (btnLogToggle && activityLog) {
      btnLogToggle.addEventListener('click', () => {
        const open = activityLog.classList.toggle('activity-log--open');
        btnLogToggle.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', e => {
        if (activityLog.classList.contains('activity-log--open') &&
            !activityLog.contains(e.target) && e.target !== btnLogToggle) {
          activityLog.classList.remove('activity-log--open');
          btnLogToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Quit game button
    const dlgQuit  = qs('#dialog-quit');
    const btnQuit  = qs('#btn-quit-game');
    const btnQuitY = qs('#btn-quit-yes', dlgQuit);
    const btnQuitN = qs('#btn-quit-no',  dlgQuit);
    if (btnQuit && dlgQuit) {
      btnQuit.addEventListener('click', () => openDialog(dlgQuit));
      btnQuitY.addEventListener('click', () => {
        closeDialog(dlgQuit);
        if (multiplayerMode) leaveMultiplayer();
        gameState = null;
        persistClear();
        showScreen('screen-home');
      });
      btnQuitN.addEventListener('click', () => closeDialog(dlgQuit));
      dlgQuit.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeDialog(dlgQuit);
      });
    }

    // Controls panel toggle button
    qs('#controls-toggle')?.addEventListener('click', () => {
      const isOpen = qs('#controls-panel')?.classList.contains('controls-panel--open');
      setControlsOpen(!isOpen);
    });

    // ── Back/Forward navigation ──────────────────────────────────────────
    window.addEventListener('popstate', e => {
      const id = e.state?.screen || hashToScreen(location.hash);

      // Navigating back to game screen — only if game is in memory
      if (id === 'screen-game') {
        if (gameState && !multiplayerMode) {
          showScreen('screen-game', { push: false });
          renderGame();
          processGameLoop();
        } else {
          history.replaceState({ screen: 'screen-home' }, '', '#home');
          showScreen('screen-home', { push: false });
        }
        return;
      }

      // Navigating back to lobby without a connection — go home
      if (id === 'screen-lobby' && !multiplayerMode) {
        history.replaceState({ screen: 'screen-home' }, '', '#home');
        showScreen('screen-home', { push: false });
        return;
      }

      showScreen(id, { push: false });
    });

    // ── Initial routing ──────────────────────────────────────────────────
    const saved      = persistLoad();
    const hashScreen = hashToScreen(location.hash);

    if (saved?.screen === 'screen-game' && saved.gameState) {
      // Restore an in-progress game
      gameState       = saved.gameState;
      aiDifficulty    = saved.aiDifficulty || 'normal';
      playerName      = saved.playerName   || 'You';
      _prevScores     = saved.prevScores   || [0, 0];
      mySeatIndex     = 0;
      multiplayerMode = false;
      // Pre-seed keys so restore doesn't trigger deal/trick animations
      _lastDealKey      = `${gameState.dealer}-${gameState.scores[0]}-${gameState.scores[1]}`;
      _lastTricksPlayed = gameState.tricksPlayed;
      history.replaceState({ screen: 'screen-game' }, '', '#game');
      showScreen('screen-game', { push: false });
      renderGame();
      if (gameState.phase !== P.HAND_END) processGameLoop();
      else showHandResult(gameState);
    } else if (saved?.screen === 'screen-gameover' && saved.gameState) {
      gameState = saved.gameState;
      history.replaceState({ screen: 'screen-gameover' }, '', '#gameover');
      showGameOver(saved.gameState);
    } else if (hashScreen !== 'screen-home') {
      history.replaceState({ screen: hashScreen }, '', screenToHash(hashScreen));
      showScreen(hashScreen, { push: false });
    } else {
      history.replaceState({ screen: 'screen-home' }, '', '#home');
      showScreen('screen-home', { push: false });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
