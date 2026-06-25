#!/usr/bin/env node
/**
 * Static smoke tests for Auto Spa Dash (Game 071).
 *
 * Single-file game (games/071-auto-spa-dash/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from issue #71 acceptance checklist:
 *
 *   AC1  ≤3 second entry → title screen, no loader, click/press to play
 *   AC2  ≤3 minute round → MAX_GAME_SEC = 180 with timeout path
 *   AC3  ≥2 input modes  → touch/pointer + keyboard + drag-drop
 *   AC4  再来一局按钮     → replay / next level button with handlers
 *   AC5  音效 + 震动      → WebAudio + navigator.vibrate
 *   AC6  本地最高分       → localStorage with key 'autoSpaDash_best'
 *
 * Run: node games/071-auto-spa-dash/tests/static.test.cjs
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
  'titleScreen', 'playScreen', 'resultScreen',
  'garage', 'toolTray',
  'levelDisplay', 'timerDisplay', 'moneyDisplay', 'progressFill',
  'startBtn', 'muteBtn', 'titleBest',
  'resultIcon', 'resultTitle', 'resultStars', 'resultDetails',
  'resultMoney', 'resultTarget', 'resultBest', 'resultNewBest',
  'resultNextBtn', 'resultRetryBtn', 'hintText',
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present`, re.test(html));
}
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\/games\/shared\/game-frame\.css/.test(html));
ok('title screen rendered first (no .hidden)', /id="titleScreen"[\s\S]{0,30}class="screen\s+title-screen"(?![\s\S]{0,100}hidden)/.test(html));
ok('play screen default hidden', /id="playScreen"[\s\S]{0,30}hidden/.test(html));
ok('result screen default hidden', /id="resultScreen"[\s\S]{0,30}hidden/.test(html));
ok('touch-action:none on #app container', /touch-action:\s*none/.test(html));
ok('garage element present (bay container)', /id="garage"/.test(html));
ok('tool buttons with wash/wax/dry', /data-tool="wash"/.test(html) && /data-tool="wax"/.test(html) && /data-tool="dry"/.test(html));

/* =====================================================================
 * AC2 · Game length cap (≤3 minutes)
 * ===================================================================== */
group('AC2 · Session length cap');
ok('MAX_GAME_SEC = 180 (s) declared', /MAX_GAME_SEC\s*=\s*180\b/.test(js));
ok('timeout path triggers on time cap', /sec\s*>=\s*MAX_GAME_SEC[\s\S]{0,120}endGame\(\)/.test(js));
ok('endGame sets RESULT and shows result', /gamePhase\s*=\s*['"]RESULT['"][\s\S]*showScreen\(resultScreen\)/.test(js));
ok('timerInterval assigned and cleared', /timerInterval\s*=\s*setInterval\(/.test(js) && /clearInterval\(timerInterval\)/.test(js));

/* =====================================================================
 * AC3 · ≥2 input methods (keyboard + pointer/drag + touch)
 * ===================================================================== */
group('AC3 · Input methods');
ok('window keydown listener', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('1/2/3 number keys switch tools', /e\.key\s*===\s*['"]1['"]/.test(js));
ok('Enter/Space on title starts game', /gamePhase\s*===\s*['"]TITLE['"][\s\S]{0,120}(?:Enter|' ')/.test(js));
ok('Enter/Space on result advances', /gamePhase\s*===\s*['"]RESULT['"][\s\S]{0,80}(?:Enter|' ')/.test(js));
ok('pointerdown on tool tray for drag', /toolTray[\s\S]{0,20}addEventListener\(\s*['"]pointerdown['"]/.test(js));
ok('pointermove for drag tracking', /addEventListener\(\s*['"]pointermove['"]/.test(js));
ok('pointerup for drop', /addEventListener\(\s*['"]pointerup['"]/.test(js));
ok('touchstart fallback on garage', /garage[\s\S]{0,20}addEventListener\(\s*['"]touchstart['"]/.test(js));
ok('drag ghost element created', /createDragGhost/.test(js));
ok('applyToolToBay function for drop handling', /function\s+applyToolToBay/.test(js));

/* =====================================================================
 * AC4 · Replay / Next Level buttons
 * ===================================================================== */
group('AC4 · Replay & Next Level buttons');
ok('resultNextBtn has onclick handler', /resultNextBtn\.onclick\s*=/.test(js));
ok('resultRetryBtn has onclick handler', /resultRetryBtn\.onclick\s*=/.test(js));
ok('retry calls startGame()', /resultRetryBtn\.onclick[\s\S]{0,40}startGame\(\)/.test(js));
ok('next level button advances level', /currentLevel\s*\+\+[\s\S]{0,60}startGame\(\)/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playTone() function generates sounds', /function\s+playTone\s*\(/.test(js));
ok('playSwoosh() on car arrival', /playSwoosh\(\)/.test(js));
ok('playEarn() on revenue', /playEarn\(\)/.test(js));
ok('playComplete() on win', /playComplete\(\)/.test(js));
ok('playTimeout() on timeout', /playTimeout\(\)/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js));
ok('mute toggle persists', /localStorage\.setItem\(\s*['"]autoSpaDash_muted['"]/.test(js));
ok('muted flag respected in playTone', /muted[^}]{0,40}return/.test(js) || /if\s*\(muted/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORAGE_KEY = "autoSpaDash_best"', /STORAGE_KEY\s*=\s*['"]autoSpaDash_best['"]/.test(js));
ok('loadHighScore try/catch fallback', /function\s+loadHighScore[\s\S]*?try[\s\S]*?parseInt[\s\S]*?catch[\s\S]*?return\s+0/.test(js));
ok('saveHighScore persists on improvement', /val\s*>\s*cur[\s\S]{0,80}localStorage\.setItem/.test(js));
ok('PROGRESS_KEY for level progression', /PROGRESS_KEY\s*=\s*['"]autoSpaDash_progress['"]/.test(js));
ok('loadProgress Math.min bounds', /Math\.min\(\s*p\s*,\s*LEVELS\.length\s*-\s*1\s*\)/.test(js));

/* =====================================================================
 * Bonus · Gameplay depth
 * ===================================================================== */
group('Bonus · Gameplay depth');
ok('8 levels defined', /var\s+LEVELS\s*=/.test(js) && /level:\s*1/.test(js) && /level:\s*8/.test(js));
ok('3 service steps (wash/wax/dry)', /id:\s*['"]wash['"]/.test(js) && /id:\s*['"]wax['"]/.test(js) && /id:\s*['"]dry['"]/.test(js));
ok('3 parking bays (expandable to 4)', /BAY_COUNT\s*=/.test(js) || /bays:\s*4/.test(js));
ok('revenue target / progress bar', /revenueTarget/.test(js));
ok('star rating system (1-3 stars)', /stars\s*=\s*0[\s\S]{0,200}ratio\s*>=\s*1\.5/.test(js));
ok('car spawn interval per level', /carInterval/.test(js));
ok('money popup animation', /money-popup/.test(html));
ok('drag ghost element', /drag-ghost/.test(html));
ok('back-to-hub link present', /back-to-hub/.test(html));
ok('"use strict"', /['"]use strict['"]/.test(js));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'auto-spa-dash');
ok('registry has id="auto-spa-dash"', !!entry);
if (entry) {
  ok('registry.path = /games/071-auto-spa-dash/', entry.path === '/games/071-auto-spa-dash/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Auto Spa Dash · static.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
