#!/usr/bin/env node
/**
 * Static smoke tests for Magic Bubble Shooter (Game 013).
 *
 * Single-file game (games/013-magic-bubble-shooter/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from issue #13 acceptance checklist:
 *
 *   AC1  ≤3 second entry → title screen, no loader, click/press to play
 *   AC2  ≤3 minute round  → game-over path with clear condition
 *   AC3  ≥2 input modes  → mouse + touch + keyboard
 *   AC4  Play Again button → result screen retry
 *   AC5  Sound + haptic  → WebAudio + navigator.vibrate
 *   AC6  localStorage high-score tracking
 *
 * Run: node games/013-magic-bubble-shooter/tests/static.test.cjs
 * Pure Node — no jsdom, no deps.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// extract the inline <script> body
const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const js = scriptMatches.map(m => m[1]).join('\n\n/* ---- next <script> block ---- */\n\n');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`);
  }
}
function group(title) { console.log(`\n=== ${title} ===`); }

/* =====================================================================
 * AC1 · DOM elements & first-screen contract (3s entry rule)
 * ===================================================================== */
group('AC1 · DOM ids & screens');
const requiredIds = [
  'titleScreen', 'gameScreen', 'resultScreen',
  'gameCanvas', 'pauseOverlay',
  'playBtn', 'pauseBtn', 'resumeBtn', 'quitBtn', 'retryBtn', 'homeBtn',
  'levelDisplay', 'scoreDisplay', 'ballsDisplay', 'dangerLineFill',
  'resultIcon', 'resultTitle', 'resultScore', 'resultLevel', 'resultPopped', 'resultBest',
  'titleBest',
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present`, re.test(html));
}
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\.\.\/\.\.\/games\/shared\/game-frame\.css/.test(html));
ok('canvas element present', /<canvas[\s>]/.test(html));
ok('title screen shown by default (class="screen title-screen active")', /class="screen\s+title-screen\s+active"/.test(html));
ok('game screen not active by default', /class="screen\s+game-screen"(?![\s\S]{0,30}active)/.test(html));
ok('result screen not active by default', /class="screen\s+result-screen"(?![\s\S]{0,30}active)/.test(html));
ok('touch-action: manipulation on body', /touch-action:\s*manipulation/.test(html));
ok('canvas has touch-action: none', /touch-action:\s*none/.test(html));
ok('pause overlay hidden by default', /class="pause-overlay"(?![\s\S]{0,30}active)/.test(html));

/* =====================================================================
 * AC2 · Game length / round structure (≤3 minute rounds)
 * ===================================================================== */
group('AC2 · Session structure');
ok('MAX_LEVELS constant defined', /MAX_LEVELS\s*=\s*\d+/.test(js));
ok('COLS = 8 constant', /COLS\s*=\s*8/.test(js));
ok('MIN_MATCH = 3 constant', /MIN_MATCH\s*=\s*3/.test(js));
ok('endGame() function exists', /function\s+endGame\s*\(/.test(js));
ok('levelComplete() function exists', /function\s+levelComplete\s*\(/.test(js));
ok('game-over triggers result screen', /showScreen\(['"]result['"]\)/.test(js));
ok('grid collision detection for shot bubble', /function\s+checkCollision/.test(js));
ok('flood fill match detection', /function\s+floodFill/.test(js));
ok('floating bubble removal', /function\s+findFloating/.test(js));
ok('danger zone check', /dangerY/.test(js) && /state\.dangerPct/.test(js));

/* =====================================================================
 * AC3 · ≥2 input methods (mouse + keyboard + touch)
 * ===================================================================== */
group('AC3 · Input methods');
ok('mousemove listener for aiming', /addEventListener\(\s*['"]mousemove['"]/.test(js));
ok('click listener for shooting', /addEventListener\(\s*['"]click['"]/.test(js));
ok('touchstart listener', /addEventListener\(\s*['"]touchstart['"]/.test(js));
ok('touchmove listener', /addEventListener\(\s*['"]touchmove['"]/.test(js));
ok('touchend listener for release shoot', /addEventListener\(\s*['"]touchend['"]/.test(js));
ok('keydown listener (global)', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('ArrowLeft key handling', /case\s+['"]ArrowLeft['"]:/.test(js));
ok('ArrowRight key handling', /case\s+['"]ArrowRight['"]:/.test(js));
ok('Space/Enter for shoot', /case\s+['"]\s['"]:/.test(js) && /case\s+['"]Enter['"]:/.test(js));
ok('Escape for pause', /key\s*===\s*['"]Escape['"]/.test(js));

/* =====================================================================
 * AC4 · Play Again button on result screen
 * ===================================================================== */
group('AC4 · Result screen & Play Again');
ok('retryBtn (Play Again) exists in HTML', /id="retryBtn"/.test(html));
ok('homeBtn exists', /id="homeBtn"/.test(html));
ok('retryBtn has onclick handler in JS', /retryBtn\.onclick\s*=/.test(js) || /getElementById\(['"]retryBtn['"]\)[\s\S]{0,100}\.onclick\s*=/.test(js));
ok('retry starts game', /startGame\(/.test(js));
ok('homeBtn goes to title', /showScreen\(['"]title['"]\)/.test(js) && /homeBtn/.test(html));
ok('result screen shows score', /resultScore[\s\S]{0,30}state\.score/.test(js));
ok('result screen shows level', /resultLevel[\s\S]{0,30}state\.level/.test(js));
ok('result screen has new best indicator', /resultBest[\s\S]{0,30}(?:best|getBest)/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playTone() function generates sounds', /function\s+playTone\s*\(/.test(js));
ok('playShoot() on bubble launch', /playShoot\(\)/.test(js));
ok('playPop() on bubble pop', /playPop\(/.test(js));
ok('playMatch() on match', /playMatch\(/.test(js));
ok('playWin() on level complete', /playWin\(\)/.test(js));
ok('playGameOver() on game over', /playGameOver\(\)/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORAGE_KEY = "magic_bubble_shooter_best"', /STORAGE_KEY\s*=\s*['"]magic_bubble_shooter_best['"]/.test(js));
ok('getBest() try/catch with parseInt fallback', /function\s+getBest[\s\S]*?try[\s\S]*?parseInt[\s\S]*?catch[\s\S]*?return\s+0/.test(js));
ok('setBest() localStorage.setItem', /localStorage\.setItem\(\s*STORAGE_KEY/.test(js));
ok('score > best → update best', /state\.score\s*>\s*best[\s\S]{0,80}setBest/.test(js));

/* =====================================================================
 * Bonus · Gameplay depth
 * ===================================================================== */
group('Bonus · Gameplay depth');
ok('special bubble types (rainbow = -2)', /RAINBOW_COLOR\s*=\s*-2/.test(js));
ok('special bubble types (bomb = -3)', /BOMB_COLOR\s*=\s*-3/.test(js));
ok('bomb radius explosion', /function\s+getBombRadius/.test(js));
ok('rainbow matching logic', /RAINBOW_COLOR/.test(js) && /floodFill/.test(js));
ok('level progression system', /RAINBOW_LEVEL\s*=\s*5/.test(js) && /BOMB_LEVEL\s*=\s*10/.test(js));
ok('next bubble preview', /nextBubble/.test(js));
ok('particle sparkle effects', /function\s+addSparkle/.test(js));
ok('floating score text', /function\s+addFloatingText/.test(js));
ok('danger indicator bar', /dangerLineFill/.test(html) || /timerBar/.test(js));
ok('requestAnimationFrame game loop', /requestAnimationFrame\(/.test(js));
ok('resize handler', /addEventListener\(\s*['"]resize['"]/.test(js));
ok('"use strict"', /['"]use strict['"]/.test(js));
ok('canvas rendering context', /getContext\(['"]2d['"]\)/.test(js));
ok('hex grid neighbor calculation', /getNeighbors/.test(js));
ok('floating bubble cleanup', /findFloating\(\)/.test(js));
ok('reshuffle on no-moves', /reshuffleGrid/.test(js));
ok('title screen Play button > Enter/Space', /titleScreen[\s\S]{0,80}(?:Enter|' ')/.test(js) && /startGame\(1\)/.test(js));
ok('pause overlay toggle logic', /state\.paused\s*=\s*!state\.paused/.test(js));
ok('Result screen retry button has onclick override for next level', /retryBtn\.onclick/.test(js));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'magic-bubble-shooter');
ok('registry has id="magic-bubble-shooter"', !!entry);
if (entry) {
  ok('registry.path = /games/013-magic-bubble-shooter/', entry.path === '/games/013-magic-bubble-shooter/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Magic Bubble Shooter · static.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
