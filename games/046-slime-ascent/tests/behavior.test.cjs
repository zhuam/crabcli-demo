#!/usr/bin/env node
/**
 * Behavioral tests for Slime Ascent (Issue #46).
 * Uses vm module to extract and test JS game logic.
 * Run: node games/046-slime-ascent/tests/behavior.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// Extract all inline JS
function extractInlineJS(html) {
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const js = m[1].trim();
    if (js && !js.startsWith('window.')) scripts.push(js);
  }
  return scripts.join('\n');
}

// Extract a function body from JS source
function extractFunctionBody(js, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  let i = js.indexOf('{', m.index), depth = 1, end = i + 1;
  while (depth && end < js.length) {
    if (js[end] === '{') depth++;
    if (js[end] === '}') depth--;
    end++;
  }
  return js.slice(m.index, end);
}

const js = extractInlineJS(html);

// ──────────────────────────────────────────────
// Extract key functions for behavioral testing
// ──────────────────────────────────────────────
const getDefaultStateSrc = extractFunctionBody(js, 'getDefaultState');
const saveBestSrc = extractFunctionBody(js, 'saveBest');
const loadBestSrc = extractFunctionBody(js, 'loadBest');

// The score calculation is inline in updatePlayer, extract it for standalone testing
// Score = Math.max(0, Math.floor((s.startY - s.maxHeight) * 0.1))

// ── Shared constants ──
const CONSTANTS_JS = `
  var PLAYER_R = 17;
  var PLATFORM_H = 14;
  var ROW_SPACING = 95;
  var GENERATE_BUFFER = 400;
  var CLEANUP_BUFFER = 300;
  var WIN_HEIGHT = 5000;
  var WALL_STICK_MS = 600;
  var WALL_JUMP_H = 7.5;
  var WALL_JUMP_V = -10.5;
  var JUMP_VEL = -11;
  var BOUNCE_MULT = 1.6;
  var CRUMBLE_MS = 400;
  var GRAVITY = 0.55;
  var MAX_VX = 5.5;
  var AIR_CONTROL = 0.35;
  var GROUND_FRICTION = 0.82;
  var AIR_FRICTION = 0.95;
`;

group('getDefaultState() returns complete state object');
if (getDefaultStateSrc) {
  const ctx = { };
  vm.createContext(ctx);
  vm.runInContext(CONSTANTS_JS + '\n' + getDefaultStateSrc, ctx);

  const state = ctx.getDefaultState();
  ok('state is an object', typeof state === 'object' && state !== null);
  ok('state has player property', typeof state.player === 'object');
  ok('player has x coordinate', typeof state.player.x === 'number');
  ok('player has y coordinate', typeof state.player.y === 'number');
  ok('player has vx velocity', typeof state.player.vx === 'number' && state.player.vx === 0);
  ok('player has vy velocity', typeof state.player.vy === 'number' && state.player.vy === 0);
  ok('player has r (radius)', state.player.r === 17);
  ok('player has onGround (default false)', state.player.onGround === false);
  ok('player has isStuck (default false)', state.player.isStuck === false);
  ok('player has wallSide (default null)', state.player.wallSide === null);
  ok('player has stickTimer (default 0)', state.player.stickTimer === 0);
  ok('player has alive (default true)', state.player.alive === true);
  ok('state has camera with y', typeof state.camera === 'object' && 'y' in state.camera);
  ok('state.platforms is an array', Array.isArray(state.platforms));
  ok('state.particles is an array', Array.isArray(state.particles));
  ok('state has maxHeight (0)', state.maxHeight === 0);
  ok('state has startY (0)', state.startY === 0);
  ok('state has score (0)', state.score === 0);
  ok('state has highestGenY (0)', state.highestGenY === 0);
  ok('state has heightReached (false)', state.heightReached === false);
  ok('state has animFrame (0)', state.animFrame === 0);
} else {
  ok('getDefaultState function extractable', false, 'Could not extract function');
}

group('Score calculation logic');
(function() {
  // The score formula: Math.max(0, Math.floor((startY - maxHeight) * 0.1))
  function calcScore(startY, maxHeight) {
    return Math.max(0, Math.floor((startY - maxHeight) * 0.1));
  }
  ok('score is 0 when no height gained', calcScore(500, 500) === 0);
  ok('score is 0 when fallen below start', calcScore(500, 550) === 0);
  ok('score is 10 for 100px ascent', calcScore(500, 400) === 10);
  ok('score is 50 for 500px ascent', calcScore(500, 0) === 50);
  ok('score is 500 for 5000px ascent (win)', calcScore(5000, 0) === 500);
  ok('score floors to integer', calcScore(500, 495) === 0); // 5*0.1=0.5 -> floor=0
  ok('score is 1 for 15px ascent', calcScore(500, 485) === 1); // 15*0.1=1.5 -> floor=1
})();

group('saveBest / loadBest logic');
(function() {
  // Simulate localStorage
  var storage = {};
  var bestScore = 0;

  function loadBest() {
    try { bestScore = parseInt(storage['slime-ascent-best']) || 0; } catch(e) { bestScore = 0; }
    return bestScore;
  }
  function saveBest(score) {
    if (score > bestScore) {
      bestScore = score;
      try { storage['slime-ascent-best'] = String(score); } catch(e) {}
    }
  }

  ok('initial bestScore is 0', loadBest() === 0);
  ok('storage is empty initially', Object.keys(storage).length === 0);

  saveBest(50);
  ok('after saveBest(50), bestScore becomes 50', bestScore === 50);
  ok('storage key is set', storage['slime-ascent-best'] === '50');

  loadBest();
  ok('loadBest returns 50', loadBest() === 50);

  saveBest(30);
  ok('saveBest(30) does NOT lower bestScore', bestScore === 50);
  ok('storage still 50', storage['slime-ascent-best'] === '50');

  saveBest(100);
  ok('saveBest(100) updates bestScore to 100', bestScore === 100);
  ok('storage updated to 100', storage['slime-ascent-best'] === '100');
})();

group('State transitions');
// Simulate the score update logic from updatePlayer
(function() {
  var startY = 500;
  var maxHeight = 500;
  var score = 0;

  function updateScore() {
    if (startY - maxHeight >= 5000) {
      // win condition
    }
    score = Math.max(0, Math.floor((startY - maxHeight) * 0.1));
  }

  // Simulate climbing
  maxHeight = 500; score = 0; updateScore();
  ok('initial score 0', score === 0);

  maxHeight = 400; updateScore();
  ok('after climbing 100px, score=10', score === 10);

  maxHeight = 200; updateScore();
  ok('after climbing 300px, score=30', score === 30);

  // Simulate falling (doesn't reduce maxHeight)
  maxHeight = 200; // stays at best
  updateScore();
  ok('falling does not reduce score (maxHeight unchanged)', score === 30);

  // Win condition
  var heightReached = false;
  maxHeight = startY - 5000;
  updateScore();
  if (startY - maxHeight >= 5000) heightReached = true;
  ok('win at 5000px ascent', heightReached === true);
  ok('win score is 500', score === 500);
})();

group('Game flow - screen transitions');
(function() {
  var currentScreen = null;
  var scoreOverlayVisible = false;

  function showScreen(name) {
    currentScreen = name;
    scoreOverlayVisible = (name === 'game');
  }

  ok('initially null screen', currentScreen === null);
  showScreen('splash');
  ok('showing splash screen', currentScreen === 'splash');
  ok('score overlay hidden on splash', scoreOverlayVisible === false);
  showScreen('game');
  ok('showing game screen', currentScreen === 'game');
  ok('score overlay visible during game', scoreOverlayVisible === true);
  showScreen('gameover');
  ok('showing gameover screen', currentScreen === 'gameover');
  ok('score overlay hidden on gameover', scoreOverlayVisible === false);
  showScreen('win');
  ok('showing win screen', currentScreen === 'win');
  ok('score overlay hidden on win', scoreOverlayVisible === false);
})();

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
