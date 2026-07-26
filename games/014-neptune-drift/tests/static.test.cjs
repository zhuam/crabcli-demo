#!/usr/bin/env node
/**
 * Static smoke tests for Neptune Drift (Game 014).
 *
 * Single-file game (games/014-neptune-drift/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from issue #14 acceptance checklist:
 *
 *   AC1  ≤3 second entry → title screen, no loader, click to play
 *   AC2  ≤3 minute round → time limits per track (90/120/150s)
 *   AC3  ≥2 input modes  → keyboard + touch + mouse/pointer
 *   AC4  "Play Again" button on game-over/win screen
 *   AC5  Web Audio API sound effects
 *   AC6  localStorage high score tracking
 *
 * Run: node games/014-neptune-drift/tests/static.test.cjs
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
  'screen-title', 'screen-trackselect', 'screen-gameplay', 'screen-result',
  'game-canvas', 'hud', 'countdown', 'cd-num',
  'hud-speed-val', 'hud-score-val', 'hud-timer-val', 'hud-drift-badge', 'hud-boost-fill',
  'splash-btn', 'race-btn', 'btn-retry', 'btn-menu',
  'result-icon', 'result-title', 'result-score', 'result-best',
  'rs-top-speed', 'rs-drifts',
];
for (const id of requiredIds) {
  const re = new RegExp('id\\s*=\\s*"' + id + '"');
  ok('#' + id + ' present', re.test(html));
}
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\/games\/shared\/game-frame\.css/.test(html));
ok('title screen rendered first (active class)', /class="screen active"[\s\S]{0,30}id="screen-title"/.test(html));
ok('gameplay screen hidden by default', /class="screen"[\s\S]{0,40}id="screen-gameplay"/.test(html) && !/class="screen active"[\s\S]{0,40}id="screen-gameplay"/.test(html));
ok('result screen hidden by default', /class="screen"[\s\S]{0,40}id="screen-result"/.test(html) && !/class="screen active"[\s\S]{0,40}id="screen-result"/.test(html));
ok('touch-action:none on body', /touch-action:\s*none/.test(html));
ok('canvas element present', /<canvas[\s\S]*?id="game-canvas"/.test(html));
ok('game-frame.css has back-to-hub styles (via CSS include)', /\/games\/shared\/game-frame\.css/.test(html));
ok('PLAY AGAIN button on result screen', /btn-retry[\s\S]{0,100}PLAY AGAIN/.test(html));

/* =====================================================================
 * AC2 · Game length cap (≤3 minutes per round)
 * ===================================================================== */
group('AC2 · Session length cap');
ok('timeLimit per track defined (90/120/150s)', /timeLimit:\s*90/.test(html) && /timeLimit:\s*120/.test(html) && /timeLimit:\s*150/.test(html));
ok('timer countdown decrements', /remainingSec\s*-=\s*dt/.test(js));
ok('timeout triggers endGame on 0', /remainingSec\s*<=\s*0[\s\S]{0,80}endGame\(false\)/.test(js));
ok('timer HUD updates every frame', /hud-timer-val/.test(js) && /remainingSec/.test(js));
ok('3 tracks defined', /TRACKS\s*=/.test(js) && /Neptune Ring/.test(html) && /Abyssal Trench/.test(html) && /Plasma Vortex/.test(html));

/* =====================================================================
 * AC3 · ≥2 input methods (keyboard + touch + pointer/mouse)
 * ===================================================================== */
group('AC3 · Input methods');
ok('keydown listener attached', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('Arrow key handling', /(?:ArrowUp|ArrowLeft|ArrowRight|ArrowDown)/.test(js));
ok('WASD key handling', /keys\[\s*['"]w['"]\s*\]/.test(js) && /keys\[\s*['"]a['"]\s*\]/.test(js));
ok('Enter/Space on title advances', /titleActive[\s\S]{0,60}showScreen\('screen-trackselect'\)/.test(js));
ok('Enter/Space on track select starts race', /trackActive[\s\S]{0,60}startGame\(\)/.test(js));
ok('Enter/Space on result retries', /resultActive[\s\S]{0,60}retryGame\(\)/.test(js));
ok('pointerdown handler on canvas', /canvas\.addEventListener\(\s*['"]pointerdown['"]/.test(js));
ok('pointermove handler on canvas', /canvas\.addEventListener\(\s*['"]pointermove['"]/.test(js));
ok('pointerup handler on canvas', /canvas\.addEventListener\(\s*['"]pointerup['"]/.test(js));
ok('touch/mouse steering in update', /touchActive/.test(js));
ok('preventDefault on game keys', /e\.preventDefault\(\)/.test(js));

/* =====================================================================
 * AC4 · "Play Again" button on game-over/win screen
 * ===================================================================== */
group('AC4 · Play Again button');
ok('btn-retry element with PLAY AGAIN text', /id="btn-retry"[\s\S]{0,100}>PLAY AGAIN</.test(html));
ok('btn-retry click handler calls retryGame', /\$\(\s*['"]btn-retry['"]\)[\s\S]{0,40}addEventListener[\s\S]{0,30}retryGame/.test(js) || /btn-retry[\s\S]{0,50}click[\s\S]{0,50}retryGame/.test(js));
ok('retryGame function exists', /function\s+retryGame/.test(js));
ok('retryGame calls startGame', /retryGame[\s\S]{0,60}startGame/.test(js));
ok('menu button (go back to track select) exists', /id="btn-menu"/.test(html));
ok('btn-menu click handler calls goToMenu', /btn-menu[\s\S]{0,40}goToMenu/.test(js));
ok('MENU button text present', /MENU/.test(html));

/* =====================================================================
 * AC5 · Web Audio API sound effects
 * ===================================================================== */
group('AC5 · Audio (WebAudio synth)');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /audioCtx\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playTone() function generates sounds', /function\s+playTone/.test(js));
ok('playNoise() function for drift sound', /function\s+playNoise/.test(js));
ok('playCrashSound() defined', /function\s+playCrashSound/.test(js));
ok('playFinishSound() defined (win sound)', /function\s+playFinishSound/.test(js));
ok('playLoseSound() defined (lose sound)', /function\s+playLoseSound/.test(js));
ok('playBoostSound() defined', /function\s+playBoostSound/.test(js));
ok('playCountdownSound() defined', /function\s+playCountdownSound/.test(js));
ok('playGoSound() defined', /function\s+playGoSound/.test(js));
ok('oscillator connected to destination', /osc\.connect\(\s*gain\s*\)[\s\S]{0,40}gain\.connect\(\s*audioCtx\.destination\s*\)/.test(js));
ok('navigator.vibrate used', /navigator\.vibrate/.test(js));

/* =====================================================================
 * AC6 · localStorage high score tracking
 * ===================================================================== */
group('AC6 · localStorage persistence');
ok('localStorage save key "neptune_drift"', /localStorage\.setItem\(\s*['"]neptune_drift['"]/.test(js) || /localStorage\.getItem\(\s*['"]neptune_drift['"]/.test(js));
ok('loadSave try/catch with fallback', /function\s+loadSave[\s\S]*?try[\s\S]*?catch/.test(js));
ok('save function persists data', /function\s+save[\s\S]*?localStorage\.setItem/.test(js));
ok('bestScore tracked across sessions', /bestScore/.test(js));
ok('cumulativeScore tracked for unlocks', /cumulativeScore/.test(js));
ok('new best indicator in results', /newBest/.test(js) && /NEW BEST/.test(html));
ok('unlock system checks cumulative score', /unlock\.type\s*===\s*['"]score['"][\s\S]{0,80}cumulativeScore/.test(js));
ok('save called on endGame', /function endGame[\s\S]*?save\(\)/.test(js));

/* =====================================================================
 * Bonus · Gameplay depth
 * ===================================================================== */
group('Bonus · Gameplay depth');
ok('drift mechanics with angle-based detection', /lateralAccel[\s\S]{0,40}DRIFT_THRESHOLD/.test(js));
ok('boost system from drift energy', /boostEnergy/.test(js) && /BOOST_GAIN_RATE/.test(js));
ok('checkpoint system implemented', /function\s+checkCheckpoints/.test(js));
ok('lap counting system', /state\.lap\+\+/.test(js) && /totalLaps/.test(js));
ok('particle effects system', /particles\.push/.test(js));
ok('engine sound varies with speed', /updateEngine/.test(js));
ok('canvas rendering function', /function\s+render/.test(html));
ok('car drawing function', /function\s+drawCar/.test(html));
ok('track drawing function', /function\s+drawTrack/.test(html));
ok('title best score display', /title-best/.test(html));
ok('3 difficulty levels (easy/medium/hard)', /easy/.test(html) && /medium/.test(html) && /hard/.test(html));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'neptune-drift');
ok('registry has id="neptune-drift"', !!entry);
if (entry) {
  ok('registry.path = /games/014-neptune-drift/', entry.path === '/games/014-neptune-drift/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
  ok('registry.tags includes drift', entry.tags && entry.tags.includes('drift'));
  ok('registry.tags includes racing', entry.tags && entry.tags.includes('racing'));
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log('  Neptune Drift · static.test.cjs · ' + pass + ' passed · ' + fail + ' failed');
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
