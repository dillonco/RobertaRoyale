'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the text of the first @media block whose condition matches the
 * given string (e.g. 'max-width: 480px').
 */
function getMediaBlock(condition) {
  const start = css.indexOf(`@media (${condition})`);
  assert.notEqual(start, -1, `@media (${condition}) block not found in style.css`);
  let depth = 0, i = start;
  while (i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Unclosed @media (${condition}) block`);
}

// ── html / body overflow ──────────────────────────────────────────────────────

describe('overflow-x hidden', () => {
  it('html element has overflow-x: hidden', () => {
    assert.match(css, /html\s*\{[^}]*overflow-x:\s*hidden/);
  });

  it('body element has overflow-x: hidden', () => {
    assert.match(css, /body\s*\{[^}]*overflow-x:\s*hidden/s);
  });
});

// ── #human-hand-wrapper centering ────────────────────────────────────────────

describe('#human-hand-wrapper centering', () => {
  it('uses left: 0 instead of left: 50%', () => {
    const block = css.match(/#human-hand-wrapper\s*\{[^}]+\}/s)?.[0];
    assert.ok(block, '#human-hand-wrapper rule not found');
    assert.match(block, /left:\s*0/, 'should use left: 0');
    assert.doesNotMatch(block, /left:\s*50%/, 'should not use left: 50%');
  });

  it('uses right: 0 to span full width', () => {
    const block = css.match(/#human-hand-wrapper\s*\{[^}]+\}/s)?.[0];
    assert.ok(block, '#human-hand-wrapper rule not found');
    assert.match(block, /right:\s*0/);
  });

  it('does not use translateX(-50%) for centering', () => {
    const block = css.match(/#human-hand-wrapper\s*\{[^}]+\}/s)?.[0];
    assert.ok(block, '#human-hand-wrapper rule not found');
    assert.doesNotMatch(block, /translateX\(-50%\)/);
  });
});

// ── Grid columns ─────────────────────────────────────────────────────────────

describe('game-table grid columns', () => {
  it('≤480px: side columns are 60px', () => {
    const block = getMediaBlock('max-width: 480px');
    assert.match(block, /grid-template-columns:\s*60px\s+1fr\s+60px/);
  });

  it('≤360px: side columns are 52px', () => {
    const block = getMediaBlock('max-width: 360px');
    assert.match(block, /grid-template-columns:\s*52px\s+1fr\s+52px/);
  });
});

// ── East/west card back sizes ─────────────────────────────────────────────────

describe('east/west card back dimensions', () => {
  it('≤480px: card backs are 18×26px', () => {
    const block = getMediaBlock('max-width: 480px');
    // Find the east/west card--back rule inside this media block
    assert.match(block, /player-area--east[^}]+card--back[^}]*width:\s*18px/s,
      'east card back width should be 18px at ≤480px');
    assert.match(block, /player-area--east[^}]+card--back[^}]*height:\s*26px/s,
      'east card back height should be 26px at ≤480px');
  });

  it('≤360px: card backs are 16×22px', () => {
    const block = getMediaBlock('max-width: 360px');
    assert.match(block, /player-area--east[^}]+card--back[^}]*width:\s*16px/s,
      'east card back width should be 16px at ≤360px');
    assert.match(block, /player-area--east[^}]+card--back[^}]*height:\s*22px/s,
      'east card back height should be 22px at ≤360px');
  });
});

// ── East/west player-info layout ─────────────────────────────────────────────

describe('east/west player-info', () => {
  it('≤480px: does not force width: 100%', () => {
    const block = getMediaBlock('max-width: 480px');
    // Extract just the east/west player-info rule
    const ruleStart = block.indexOf('player-area--east .player-info');
    assert.notEqual(ruleStart, -1, 'east .player-info rule not found in ≤480px block');
    const ruleEnd = block.indexOf('}', ruleStart);
    const rule = block.slice(ruleStart, ruleEnd);
    assert.doesNotMatch(rule, /width:\s*100%/,
      'player-info should not use width: 100% — causes column overflow on narrow screens');
  });

  it('≤480px: uses flex-direction: column', () => {
    const block = getMediaBlock('max-width: 480px');
    const ruleStart = block.indexOf('player-area--east .player-info');
    const ruleEnd = block.indexOf('}', ruleStart);
    const rule = block.slice(ruleStart, ruleEnd);
    assert.match(rule, /flex-direction:\s*column/);
  });
});

// ── Center glow container size ────────────────────────────────────────────────

describe('center-glow-container', () => {
  it('≤480px: width is ≤ 200px to prevent iOS Safari scroll-width inflation', () => {
    const block = getMediaBlock('max-width: 480px');
    const match = block.match(/\.center-glow-container\s*\{[^}]*width:\s*(\d+)px/);
    assert.ok(match, '.center-glow-container width not overridden in ≤480px block');
    const width = parseInt(match[1], 10);
    assert.ok(width <= 200, `glow container width ${width}px exceeds 200px — may push east column off screen on 393px viewport`);
  });
});

// ── player-area min-width ─────────────────────────────────────────────────────

describe('player-area base styles', () => {
  it('has min-width: 0 to prevent grid item content from expanding track', () => {
    const block = css.match(/\.player-area\s*\{[^}]+\}/s)?.[0];
    assert.ok(block, '.player-area rule not found');
    assert.match(block, /min-width:\s*0/);
  });
});
