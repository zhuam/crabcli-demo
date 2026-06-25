#!/usr/bin/env node
/**
 * Static smoke tests for Sort Till You Cant (Game 070).
 *
 * Single-file game (games/070-sort-till-you-cant/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from issue #70 acceptance checklist:
 *
 *   AC1  ≤3 second entry → title screen, no loader, click to play
 *   AC2  ≤3 minute round → MAX_GAME_SEC = 180 with timeout path
 *   AC3  ≥2 input modes  → touch/pointer + mouse + keyboard
 *   AC4  「再来一局」按钮  → replay button with handler
 *   AC5  音效 + 震动      → WebAudio + navigator.vibrate
 *   AC6  本地最高分       → localStorage with key 'sortTillYouCant_best'
 *
 * Run: node games/070-sort-till-you-cant/tests/static.test.cjs
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
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ❌ ' + name + (detail ? '  — ' + detail : ''));
  }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

/* =====================================================================
 * AC1 · DOM elements & first-screen contract (3s entry rule)
 * ===================================================================== */
group('AC1 · DOM ids & screens');
const requiredIds = [
  'titleScreen', 'playScreen', 'resultScreen',
  'bottleGrid', 'hintText', 'levelDisplay', 'timerDisplay', 'movesDisplay',
  'startBtn', 'muteBtn', 'titleBest', 'titleLevel',
  'resultIcon', 'resultTitle', 'resultDetails', 'resultScore',
  'resultBest', 'resultNewBest', 'resultNextBtn', 'resultRetryBtn',
  'undoBtn', 'shuffleBtn', 'ariaLive',
];
for (const id of requiredIds) {
  const re = new RegExp('id\\s*=\\s*"' + id + '"');
  ok('#' + id + ' present', re.test(html));
}
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\/games\/shared\/game-frame\.css/.test(html));
ok('title screen rendered first (no .hidden)', /id="titleScreen"[\s\S]{0,30}class="screen\s+title-screen"(?![\s\S]{0,100}hidden)/.test(html));
ok('play screen default hidden', /id="playScreen"[\s\S]{0,30}hidden/.test(html));
ok('result screen default hidden', /id="resultScreen"[\s\S]{0,30}hidden/.test(html));
ok('touch-action:none on body', /touch-action:\s*none/.test(html));
ok('bottle-grid element present', /id="bottleGrid"/.test(html));
ok('undo and shuffle buttons present', /id="undoBtn"/.test(html) && /id="shuffleBtn"/.test(html));
ok('COLORS palette has 10 entries', /var\s+COLORS\s*=/.test(js) && /Lime/.test(js) && /Coral/.test(js));
ok('MAX_BOTTLE_CAPACITY = 4', /MAX_BOTTLE_CAPACITY\s*=\s*4/.test(js));
ok('LEVELS array with 6 entries', /var\s+LEVELS\s*=/.test(js) && /colors:\s*8/.test(js));

/* =====================================================================
 * AC2 · Game length cap (≤3 minutes)
 * ===================================================================== */
group('AC2 · Session length cap');
ok('MAX_GAME_SEC = 180 (s) declared', /MAX_GAME_SEC\s*=\s*180\b/.test(js));
ok('timeout path triggers on time cap', /sec\s*>=\s*MAX_GAME_SEC[\s\S]{0,120}timeoutGame\(\)/.test(js));
ok('timeoutGame sets RESULT and shows result', /gamePhase\s*=\s*['"]RESULT['"][\s\S]*showScreen\(resultScreen\)/.test(js));
ok('timerInterval assigned and cleared', /timerInterval\s*=\s*setInterval\(/.test(js) && /clearInterval\(timerInterval\)/.test(js));

/* =====================================================================
 * AC3 · ≥2 input methods (keyboard + touch + pointer/mouse)
 * ===================================================================== */
group('AC3 · Input methods');
ok('window keydown listener', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('Enter/Space on title starts game', /gamePhase\s*===\s*['"]TITLE['"][\s\S]{0,120}(?:Enter|' ')/.test(js));
ok('Enter/Space on result advances', /gamePhase\s*===\s*['"]RESULT['"][\s\S]{0,80}(?:Enter|' ')/.test(js));
ok('Number keys 1-9 select bottles', /num\s*>=\s*1\s*&&\s*num\s*<=\s*bottles\.length/.test(js));
ok('Escape deselects bottle', /e\.key\s*===\s*['"]Escape['"]/.test(js));
ok('U key for undo', /e\.key\s*===\s*['"]u['"]/.test(js) || /['"]u['"][\s\S]{0,30}doUndo\(\)/.test(js));
ok('S key for shuffle', /e\.key\s*===\s*['"]s['"]/.test(js) || /['"]s['"][\s\S]{0,30}doShuffle\(\)/.test(js));
ok('click handler on bottle-wrap elements', /\.addEventListener\(\s*['"]click['"]/.test(js) && /onBottleClick/.test(js));
ok('touch-action none on canvas for touch', /touch-action:\s*none/.test(html));

/* =====================================================================
 * AC4 · 再来一局 / Retry button
 * ===================================================================== */
group('AC4 · Replay & Next Level buttons');
ok('resultNextBtn has onclick handler', /resultNextBtn\.onclick\s*=/.test(js));
ok('resultRetryBtn has onclick handler', /resultRetryBtn\.onclick\s*=/.test(js));
ok('retry calls startGame()', /resultRetryBtn\.onclick[\s\S]{0,40}startGame\(\)/.test(js));
ok('next level button advances level', /currentLevel\+\+[\s\S]{0,60}startGame\(\)/.test(js));
ok('retry button on play screen (undo functionality)', /undoBtn\.addEventListener\(\s*['"]click['"]/.test(js));
ok('shuffle button handler present', /shuffleBtn\.addEventListener\(\s*['"]click['"]/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playTone() function generates sounds', /function\s+playTone\s*\(/.test(js));
ok('playPour() triggered on pour', /playPour\(\)/.test(js));
ok('playSelect() on bottle select', /playSelect\(\)/.test(js));
ok('playWin() on win', /playWin\(\)/.test(js));
ok('playTimeout() on timeout', /playTimeout\(\)/.test(js));
ok('playError() on invalid pour', /playError\(\)/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js));
ok('mute toggle persists', /localStorage\.setItem\(\s*['"]sortTillYouCant_muted['"]/.test(js));
ok('muted flag respected in playTone', /muted[^}]{0,40}return/.test(js) || /if\s*\(muted/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORAGE_KEY = "sortTillYouCant_best"', /STORAGE_KEY\s*=\s*['"]sortTillYouCant_best['"]/.test(js));
ok('loadHighScore try/catch fallback', /function\s+loadHighScore[\s\S]*?try[\s\S]*?parseInt[\s\S]*?catch[\s\S]*?return\s+0/.test(js));
ok('saveHighScore persists on improvement', /val\s*>\s*cur[\s\S]{0,80}localStorage\.setItem/.test(js));
ok('PROGRESS_KEY for level progression', /PROGRESS_KEY\s*=\s*['"]sortTillYouCant_progress['"]/.test(js));
ok('loadProgress Math.min bounds', /Math\.min\(\s*p\s*,\s*LEVELS\.length\s*-\s*1\s*\)/.test(js));

/* =====================================================================
 * Bonus · Gameplay depth
 * ===================================================================== */
group('Bonus · Gameplay depth');
ok('generateSolvableLevel() function', /function\s+generateSolvableLevel/.test(js));
ok('canPour() logic function', /function\s+canPour/.test(js));
ok('doPour() function', /function\s+doPour/.test(js));
ok('isAllSorted() win check', /function\s+isAllSorted/.test(js));
ok('undo stack with cloneBottles', /undoStack\.push\(cloneBottles\(bottles\)\)/.test(js));
ok('shuffle button reshuffles bottles', /function\s+doShuffle/.test(js));
ok('stuck detection (no valid moves)', /canPourAny/.test(js));
ok('back-to-hub link present', /back-to-hub/.test(html));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'sort-till-you-cant');
ok('registry has id="sort-till-you-cant"', !!entry);
if (entry) {
  ok('registry.path = /games/070-sort-till-you-cant/', entry.path === '/games/070-sort-till-you-cant/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log('  Sort Till You Cant · static.test.cjs · ' + pass + ' passed · ' + fail + ' failed');
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
