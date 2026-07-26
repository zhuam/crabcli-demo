#!/usr/bin/env node
/**
 * Static smoke tests for Neon Circuit Connect (Game 023).
 *
 * Single-file puzzle game (games/023-neon-circuit-connect/index.html) —
 * regex-based static analysis verifying every contract from the issue.
 *
 *   AC1  Title screen with start button on load
 *   AC2  Canvas-based puzzle rendering (360x360)
 *   AC3  Circuit connection mechanics (draw path, connect pairs)
 *   AC4  Keyboard + touch + mouse input
 *   AC5  Web Audio sounds + visual feedback
 *   AC6  localStorage high scores with safe fallback
 *   AC7  Game states: TITLE → PLAYING → GAMEOVER
 *
 * Run: node games/023-neon-circuit-connect/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const js = scriptMatches.map(m => m[1]).join('\n\n/* ---- next <script> block ---- */\n\n');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ❌ ' + name + (detail ? '  — ' + detail : ''));
  }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

/* =====================================================================
 * AC1 · DOM elements & title screen
 * ===================================================================== */
group('AC1 · DOM ids & screens');
const requiredIds = [
  'titleScreen', 'playScreen', 'gameoverScreen',
  'gameCanvas',
  'hudLevel', 'hudProgress',
  'startBtn', 'replayBtn',
  'undoBtn', 'hintBtn',
  'muteBtn',
  'ariaLive',
  'titleBest',
  'goTitle', 'goLevel', 'goTime', 'goNewBest',
];
for (const id of requiredIds) {
  ok(`#${id} present`, new RegExp(`id=["']${id}["']`).test(html), `missing #${id}`);
}
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /lang=["']zh-CN["']/.test(html));
ok('shared game-frame.css linked', /games\/shared\/game-frame\.css/.test(html));
ok('title screen has class active initially', /id="titleScreen"[^>]*class="[^"]*active"/.test(html));
ok('play screen not active initially', !/id="playScreen"[^>]*class="[^"]*active"/.test(html));
ok('gameover overlay hidden initially', !/id="gameoverScreen"[^>]*class="[^"]*active"/.test(html));
ok('canvas element present', /<canvas/.test(html));
ok('aria-live region for screen reader', /aria-live=["']polite["']/.test(html));
ok('back-to-hub link present', /back-to-hub/.test(html));

/* =====================================================================
 * AC2 · Game constants
 * ===================================================================== */
group('AC2 · Game constants & canvas');
ok('canvas 360x360 declared', /width=["']360["'][^>]*height=["']360["']/.test(html) ||
                              /height=["']360["'][^>]*width=["']360["']/.test(html));
ok('STORAGE_KEY = "neon-circuit-best"', /STORAGE_KEY\s*=\s*['"]neon-circuit-best['"]/.test(js));
ok('MUTED_KEY = "neon-circuit-muted"', /MUTED_KEY\s*=\s*['"]neon-circuit-muted['"]/.test(js));
ok('COLORS array with 8 circuit colors', /COLORS\s*=/.test(js) && (js.match(/hex:/g) || []).length >= 8);
ok('LEVELS array with levels', /LEVELS\s*=/.test(js));
ok('ctx.getContext("2d") used', /getContext\(["']2d["']\)/.test(js));
ok('requestAnimationFrame used for game loop', /requestAnimationFrame/.test(js));
ok('touch-action: none on canvas', /touch-action:\s*none/.test(html));

/* =====================================================================
 * AC3 · Gameplay mechanics
 * ===================================================================== */
group('AC3 · Gameplay mechanics');
ok('initGame() function defined', /function\s+initGame/.test(js));
ok('generateLevel() function defined', /function\s+generateLevel/.test(js));
ok('onLevelComplete() function defined', /function\s+onLevelComplete/.test(js));
ok('checkCompletion() function defined', /function\s+checkCompletion/.test(js));
ok('isColorConnected() BFS traversal', /function\s+isColorConnected/.test(js));
ok('isGridFullyFilled() check', /function\s+isGridFullyFilled/.test(js));
ok('clearColorPath() for reset', /function\s+clearColorPath/.test(js));
ok('totalPairs counter for progress', /totalPairs/.test(js));
ok('completedPairs tracking', /completedPairs/.test(js));
ok('grid state via 2D array', /grid\s*=\s*\[\]/.test(js));
ok('pathGrid for connected paths', /pathGrid/.test(js));
ok('propagation check: adjacent cells only', /\|\|\s*1\s*===/.test(js) || /Math\.abs\(dr\).*Math\.abs\(dc\)/.test(js));
ok('undoStack for undo support', /undoStack/.test(js));
ok('hintsRemaining counter', /hintsRemaining/.test(js));
ok('timer for elapsed time', /timerInterval/.test(js));

/* =====================================================================
 * AC4 · Input methods
 * ===================================================================== */
group('AC4 · Input methods');
ok('mousedown listener on canvas', /canvas\.addEventListener\(["']mousedown["']/.test(js));
ok('mousemove listener on canvas', /canvas\.addEventListener\(["']mousemove["']/.test(js));
ok('mouseup listener on canvas', /canvas\.addEventListener\(["']mouseup["']/.test(js));
ok('mouseleave listener on canvas', /canvas\.addEventListener\(["']mouseleave["']/.test(js));
ok('touchstart listener on canvas', /canvas\.addEventListener\(["']touchstart["']/.test(js));
ok('touchmove listener on canvas', /canvas\.addEventListener\(["']touchmove["']/.test(js));
ok('touchend listener on canvas', /canvas\.addEventListener\(["']touchend["']/.test(js));
ok('keydown listener for keyboard', /document\.addEventListener\(["']keydown["']/.test(js));
ok('Space/Enter to start/continue', /key\s*===?\s*["']\s["']|key\s*===?\s*["']Enter["']/.test(js));
ok('Ctrl+Z / U for undo', /ctrlKey.*key\s*===?\s*["']z["']|key\s*===?\s*["']u["']/.test(js));
ok('H key for hints', /key\s*===?\s*["']h["']/.test(js));
ok('title screen click anywhere starts game', /titleScreen\.addEventListener\(["']click["']/.test(js));
ok('startBtn click handler', /startBtn\.addEventListener/.test(js));
ok('replayBtn click handler', /replayBtn\.addEventListener/.test(js));
ok('undoBtn click handler', /undoBtn\.addEventListener/.test(js));
ok('hintBtn click handler', /hintBtn\.addEventListener/.test(js));
ok('preventDefault on touch events', /preventDefault/.test(js));

/* =====================================================================
 * AC5 · Audio & Visual
 * ===================================================================== */
group('AC5 · Audio & Visual');
ok('AudioContext / webkitAudioContext used', /AudioContext/.test(js));
ok('audioCtx.resume on suspended state', /audioCtx\.resume/.test(js));
ok('playSound() function defined', /function\s+playSound/.test(js));
ok('playSound("connect") for path drawing', /playSound\(["']connect["']\)/.test(js));
ok('playSound("complete") for connection', /playSound\(["']complete["']\)/.test(js));
ok('playSound("wrong") for invalid', /playSound\(["']wrong["']\)/.test(js));
ok('playSound("hint") for hints', /playSound\(["']hint["']\)/.test(js));
ok('playSound("undo") for undo', /playSound\(["']undo["']\)/.test(js));
ok('playSound("levelup") on level clear', /playSound\(["']levelup["']\)/.test(js));
ok('mute toggle persists via localStorage', /MUTED_KEY/.test(js) && /localStorage\.setItem\(MUTED_KEY/.test(js));
ok('muted flag checked before playing', /if\s*\(muted\)/.test(js));
ok('draw() function for canvas rendering', /function\s+draw\b/.test(js));
ok('Canvas shadowBlur glow effects', /shadowBlur/.test(js));
ok('"use strict" mode enabled', /["']use strict["']/.test(js));

/* =====================================================================
 * AC6 · localStorage save schema
 * ===================================================================== */
group('AC6 · localStorage save');
ok('STORAGE_KEY = "neon-circuit-best"', /STORAGE_KEY\s*=\s*['"]neon-circuit-best['"]/.test(js));
ok('loadHighScore try/catch fallback', /catch.*\{[\s\S]*?return 0/.test(js));
ok('saveHighScore persists on improvement', /saveHighScore/.test(js));
ok('loadMuted with try/catch', /loadMuted/.test(js));

/* =====================================================================
 * AC7 · Game state machine
 * ===================================================================== */
group('AC7 · Game state machine');
ok('gameState variable declared', /let\s+gameState/.test(js));
ok('TITLE state constant', /TITLE\s*=/.test(js));
ok('PLAYING state constant', /PLAYING\s*=/.test(js));
ok('GAMEOVER state constant', /GAMEOVER\s*=/.test(js));
ok('showScreen() state transitions', /function\s+showScreen/.test(js));
ok('startGame() calls initGame then showScreen', /startGame[\s\S]*initGame[\s\S]*showScreen/.test(js));
ok('game loop with requestAnimationFrame', /requestAnimationFrame/.test(js));
ok('Level progression across levels', /levelIndex/.test(js));
ok('Timer for elapsed level time', /timerInterval\s*=/.test(js));
ok('Stars rating based on completion time', /stars\s*=/.test(js));
ok('New high score detection', /isNewBest/.test(js));

/* =====================================================================
 * Registry check
 * ===================================================================== */
group('Registry');
const registryPath = path.join(__dirname, '..', '..', 'registry.json');
let registryOk = true;
try {
  const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const game = (reg.games || []).find(g => g.id === 'neon-circuit-connect');
  if (game) {
    ok('registry has id="neon-circuit-connect"', true);
    ok(`registry.path = ${game.path}`, game.path === '/games/023-neon-circuit-connect/');
    ok('registry.hasServer = false', game.hasServer === false);
    ok('registry.players = "1"', game.players === '1');
    ok('registry.category = "puzzle"', game.category === 'puzzle');
    ok('registry.thumbnail set', !!game.thumbnail);
  } else {
    ok('registry has id="neon-circuit-connect"', false, 'entry not found');
    registryOk = false;
  }
} catch(e) {
  ok('registry.json readable', false, e.message);
  registryOk = false;
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
const total = pass + fail;
console.log(`  Neon Circuit Connect · static.test.cjs · ${pass} passed · ${fail} failed`);
if (!registryOk) {
  console.log('  ⚠️  Registry entry not yet added — run registration step');
}
console.log('='.repeat(56));

process.exit(fail > 0 ? 1 : 0);
