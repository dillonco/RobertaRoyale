'use strict';

/**
 * UX improvements test suite.
 * Verifies that CSS and HTML required for the new UX features are present.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');

const css  = fs.readFileSync(path.join(__dirname, '../css/style.css'),  'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'),      'utf8');

// ── Helper ────────────────────────────────────────────────────────────────────

/** Find the first CSS rule block for a selector fragment. */
function getRule(selectorFragment) {
  const idx = css.indexOf(selectorFragment);
  if (idx === -1) return null;
  const open  = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

// ── Active-pulse animation ────────────────────────────────────────────────────

describe('active-pulse animation', () => {
  it('@keyframes active-pulse is defined', () => {
    assert.ok(css.includes('@keyframes active-pulse'),
      '@keyframes active-pulse must be defined');
  });

  it('.player-area--active .player-info uses the active-pulse animation', () => {
    const rule = getRule('.player-area--active .player-info');
    assert.ok(rule, '.player-area--active .player-info rule not found');
    assert.match(rule, /animation/, 'rule should include an animation property');
    assert.match(rule, /active-pulse/, 'animation should reference active-pulse');
  });
});

// ── Team dot styles ───────────────────────────────────────────────────────────

describe('team dot styles', () => {
  it('.team-dot has border-radius: 50% (circular)', () => {
    const rule = getRule('.team-dot');
    assert.ok(rule, '.team-dot rule not found');
    assert.match(rule, /border-radius:\s*50%/);
  });

  it('.team-dot--us uses accent color', () => {
    const rule = getRule('.team-dot--us');
    assert.ok(rule, '.team-dot--us rule not found');
    // Should reference --accent or a literal accent green
    assert.ok(
      rule.includes('--accent') || rule.includes('#93F005') || rule.includes('#93f005'),
      '.team-dot--us should use accent color'
    );
  });

  it('.team-dot--them is visually distinct from accent', () => {
    const rule = getRule('.team-dot--them');
    assert.ok(rule, '.team-dot--them rule not found');
    assert.ok(
      !rule.includes('--accent') && !rule.includes('#93F005'),
      '.team-dot--them should NOT use the accent color'
    );
  });
});

// ── Tricks count ──────────────────────────────────────────────────────────────

describe('tricks count styles', () => {
  it('.tricks-count rule is defined', () => {
    assert.ok(css.includes('.tricks-count'), '.tricks-count selector not found in CSS');
  });

  it('.tricks-count uses a monospace font family', () => {
    const rule = getRule('.tricks-count');
    assert.ok(rule, '.tricks-count rule not found');
    assert.match(rule, /font-family/, '.tricks-count should specify font-family');
  });
});

// ── Score target ──────────────────────────────────────────────────────────────

describe('score-target style', () => {
  it('.score-target rule is defined', () => {
    assert.ok(css.includes('.score-target'), '.score-target selector not found in CSS');
  });

  it('.score-target uses a smaller font-size', () => {
    const rule = getRule('.score-target');
    assert.ok(rule, '.score-target rule not found');
    assert.match(rule, /font-size/, '.score-target should reduce font-size');
  });
});

// ── Trump ambient border ──────────────────────────────────────────────────────

describe('trump ambient border on #trick-center', () => {
  it('#trick-center has a transparent border for ambient color transitions', () => {
    // We expect the rule that sets the initial transparent border.
    // There may be multiple #trick-center blocks; look for the one with 'transparent'
    assert.ok(
      css.includes('border: 2px solid transparent'),
      '#trick-center should have border: 2px solid transparent for ambient trump effect'
    );
  });

  it('#screen-game[data-trump="hearts"] colors #trick-center border red', () => {
    assert.ok(
      css.includes('[data-trump="hearts"]') || css.includes("[data-trump='hearts']"),
      'trump ambient border for hearts must be defined'
    );
  });

  it('#screen-game[data-trump="spades"] colors #trick-center border', () => {
    assert.ok(
      css.includes('[data-trump="spades"]') || css.includes("[data-trump='spades']"),
      'trump ambient border for spades must be defined'
    );
  });
});

// ── Trick-winner overlay ──────────────────────────────────────────────────────

describe('trick-winner overlay', () => {
  it('#trick-winner-overlay rule is defined in CSS', () => {
    assert.ok(css.includes('#trick-winner-overlay'), '#trick-winner-overlay selector not found');
  });

  it('#trick-winner-overlay.visible triggers an animation', () => {
    const idx = css.indexOf('#trick-winner-overlay.visible');
    assert.notEqual(idx, -1, '#trick-winner-overlay.visible rule not found');
    const open  = css.indexOf('{', idx);
    const close = css.indexOf('}', open);
    const rule  = css.slice(open + 1, close);
    assert.match(rule, /animation/, '.visible rule must include an animation');
  });

  it('@keyframes trick-winner-pop is defined', () => {
    assert.ok(css.includes('@keyframes trick-winner-pop'),
      '@keyframes trick-winner-pop must be defined');
  });

  it('#trick-winner-overlay div exists in index.html', () => {
    assert.ok(
      html.includes('id="trick-winner-overlay"'),
      '#trick-winner-overlay div must be present in index.html'
    );
  });
});

// ── Turned-down card overlay ──────────────────────────────────────────────────

describe('turned-down card styles', () => {
  it('.turned-down-wrap rule is defined', () => {
    assert.ok(css.includes('.turned-down-wrap'), '.turned-down-wrap not found in CSS');
  });

  it('.turned-down-x is positioned absolutely over the card', () => {
    const rule = getRule('.turned-down-x');
    assert.ok(rule, '.turned-down-x rule not found');
    assert.match(rule, /position:\s*absolute/);
  });

  it('.turned-down-x uses a red color to indicate rejection', () => {
    const rule = getRule('.turned-down-x');
    assert.ok(rule, '.turned-down-x rule not found');
    // Should contain some form of red
    assert.ok(
      rule.includes('229,') || rule.includes('231,') || rule.includes('red') ||
      rule.includes('#e') || rule.includes('rgba(2'),
      '.turned-down-x should use a red color'
    );
  });
});

// ── Stuck-dealer chip ─────────────────────────────────────────────────────────

describe('stuck-chip style', () => {
  it('.stuck-chip rule is defined', () => {
    assert.ok(css.includes('.stuck-chip'), '.stuck-chip selector not found in CSS');
  });

  it('.stuck-chip uses a red/warning color to indicate urgency', () => {
    const rule = getRule('.stuck-chip');
    assert.ok(rule, '.stuck-chip rule not found');
    // Should use #f87070 or similar red
    assert.ok(
      rule.includes('#f87070') || rule.includes('248,112') || rule.includes('red'),
      '.stuck-chip should be styled in a warning/red color'
    );
  });

  it('.stuck-chip uses border-radius: 9999px (pill shape)', () => {
    const rule = getRule('.stuck-chip');
    assert.ok(rule, '.stuck-chip rule not found');
    assert.match(rule, /border-radius:\s*9999px/);
  });
});

// ── Maker chip as text pill ───────────────────────────────────────────────────

describe('maker-chip text pill', () => {
  it('.maker-chip uses border-radius: 9999px (pill, not circle)', () => {
    const rule = getRule('.maker-chip');
    assert.ok(rule, '.maker-chip rule not found');
    assert.match(rule, /border-radius:\s*9999px/,
      '.maker-chip should be a text pill (border-radius: 9999px), not a circle');
  });

  it('.maker-chip is not a fixed 16×16px circle', () => {
    const rule = getRule('.maker-chip');
    assert.ok(rule, '.maker-chip rule not found');
    assert.doesNotMatch(rule, /border-radius:\s*50%/,
      '.maker-chip should not use border-radius: 50%');
  });
});

// ── Sitting-out player ────────────────────────────────────────────────────────

describe('sitting-out player styles', () => {
  it('.player-area--sitting-out has opacity 0.5', () => {
    const rule = getRule('.player-area--sitting-out');
    assert.ok(rule, '.player-area--sitting-out rule not found');
    assert.match(rule, /opacity:\s*\.5|opacity:\s*0\.5/,
      'sitting-out player should have opacity: .5');
  });

  it('.player-area--sitting-out .player-status overrides font-style to normal', () => {
    const idx = css.indexOf('.player-area--sitting-out .player-status');
    assert.notEqual(idx, -1, '.player-area--sitting-out .player-status rule not found');
    const open  = css.indexOf('{', idx);
    const close = css.indexOf('}', open);
    const rule  = css.slice(open + 1, close);
    assert.match(rule, /font-style:\s*normal/,
      'sitting-out player-status should override italic to normal');
  });
});

// ── Mode card available/coming-soon styles ────────────────────────────────────

describe('mode card available vs coming-soon styles', () => {
  it('Practice vs AI and Private Game cards have mode-badge but NOT mode-card--soon', () => {
    assert.ok(
      html.includes('id="btn-play-practice"') &&
      !html.match(/id="btn-play-practice"[^>]*class="[^"]*mode-card--soon/),
      'Practice vs AI should not have mode-card--soon'
    );
    assert.ok(
      html.includes('id="btn-play-private"') &&
      !html.match(/id="btn-play-private"[^>]*class="[^"]*mode-card--soon/),
      'Private Game should not have mode-card--soon'
    );
  });

  it('Quick Match and Tournaments cards have mode-card--soon class', () => {
    assert.match(html, /id="btn-play-quick"[^>]*class="[^"]*mode-card--soon/,
      'Quick Match button should have mode-card--soon class');
    assert.match(html, /id="btn-play-tourney"[^>]*class="[^"]*mode-card--soon/,
      'Tournaments button should have mode-card--soon class');
  });

  it('coming-soon badges use mode-badge--soon class', () => {
    // Both COMING SOON badges should carry mode-badge--soon
    const matches = [...html.matchAll(/mode-badge--soon/g)];
    assert.ok(matches.length >= 2, 'should be at least 2 mode-badge--soon elements');
  });

  it('available-now badges do NOT carry mode-badge--soon', () => {
    // Each AVAILABLE NOW span should have class="mode-badge" with no --soon suffix
    assert.ok(
      html.includes('class="mode-badge">AVAILABLE NOW'),
      'AVAILABLE NOW badge should use only mode-badge, not mode-badge--soon'
    );
    assert.ok(
      !html.includes('mode-badge--soon">AVAILABLE NOW'),
      'AVAILABLE NOW badge must not carry mode-badge--soon'
    );
  });

  it('.mode-card--soon has reduced opacity', () => {
    const rule = getRule('.mode-card--soon');
    assert.ok(rule, '.mode-card--soon rule not found');
    assert.match(rule, /opacity/, '.mode-card--soon should set opacity');
  });

  it('.mode-card--soon suppresses hover lift (no transform)', () => {
    const idx = css.indexOf('.mode-card--soon:hover');
    assert.notEqual(idx, -1, '.mode-card--soon:hover rule not found');
    const open  = css.indexOf('{', idx);
    const close = css.indexOf('}', open);
    const rule  = css.slice(open + 1, close);
    assert.match(rule, /transform:\s*none/, '.mode-card--soon:hover should set transform: none');
  });

  it('.mode-badge--soon is visually distinct from the available badge', () => {
    const rule = getRule('.mode-badge--soon');
    assert.ok(rule, '.mode-badge--soon rule not found');
    // Should NOT use the accent green
    assert.ok(
      !rule.includes('var(--accent)') && !rule.includes('#93f005') && !rule.includes('#93F005'),
      '.mode-badge--soon should not use the accent color'
    );
  });
});

// ── Disabled button style ─────────────────────────────────────────────────────

describe('disabled button style', () => {
  it('.btn:disabled rule is defined', () => {
    assert.ok(css.includes('.btn:disabled'), '.btn:disabled selector not found');
  });

  it('.btn:disabled has reduced opacity', () => {
    const rule = getRule('.btn:disabled');
    assert.ok(rule, '.btn:disabled rule not found');
    assert.match(rule, /opacity/, '.btn:disabled should reduce opacity');
  });

  it('.btn:disabled sets cursor: not-allowed', () => {
    const rule = getRule('.btn:disabled');
    assert.ok(rule, '.btn:disabled rule not found');
    assert.match(rule, /cursor:\s*not-allowed/, '.btn:disabled should use not-allowed cursor');
  });
});

// ── Lobby seat change feedback ────────────────────────────────────────────────

describe('lobby seat-change styles', () => {
  it('@keyframes seat-moved is defined', () => {
    assert.ok(css.includes('@keyframes seat-moved'),
      '@keyframes seat-moved must be defined for seat-change flash');
  });

  it('.lobby-seat--just-moved uses the seat-moved animation', () => {
    const rule = getRule('.lobby-seat--just-moved');
    assert.ok(rule, '.lobby-seat--just-moved rule not found');
    assert.match(rule, /seat-moved/, '.lobby-seat--just-moved should reference seat-moved animation');
  });

  it('.lobby-seat-move button is defined with a fixed width and height', () => {
    const rule = getRule('.lobby-seat-move');
    assert.ok(rule, '.lobby-seat-move rule not found');
    assert.match(rule, /width:\s*30px/, '.lobby-seat-move should be 30px wide');
    assert.match(rule, /height:\s*30px/, '.lobby-seat-move should be 30px tall');
  });
});

// ── Lobby screen scrollability ────────────────────────────────────────────────

describe('lobby screen layout', () => {
  it('#screen-lobby has a standalone rule setting justify-content: flex-start', () => {
    // The standalone rule starts at the beginning of a line (not inside a grouped selector)
    assert.ok(
      /(?:^|\n)#screen-lobby\s*\{[^}]*justify-content:\s*flex-start/m.test(css),
      '#screen-lobby should have a standalone rule with justify-content: flex-start'
    );
  });

  it('html does not use overflow: hidden (allows lobby to scroll vertically)', () => {
    const idx = css.indexOf('html {');
    assert.notEqual(idx, -1, 'html rule not found');
    const open  = css.indexOf('{', idx);
    const close = css.indexOf('}', open);
    const rule  = css.slice(open + 1, close);
    assert.doesNotMatch(rule, /overflow:\s*hidden/,
      'html should not use overflow: hidden — it prevents the lobby from scrolling on short screens');
  });
});
