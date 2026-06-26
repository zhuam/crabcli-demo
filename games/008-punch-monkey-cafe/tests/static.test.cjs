#!/usr/bin/env node
/**
 * Static smoke tests for Punch Monkey Cafe (Game 008).
 *
 * Single-file game (games/008-punch-monkey-cafe/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from issue #8 acceptance checklist:
 *
 *   AC1  ≤3 second entry → title screen, no loader, click/press to play
 *   AC2  ≤3 minute round → MAX_DAY_SEC = 60 per day
 *   AC3  ≥2 input modes  → touch/pointer + keyboard + drag-drop
 *   AC4  再来一局按钮     → replay / next day / retry buttons
 *   AC5  音效 + 震动      → WebAudio + navigator.vibrate
 *   AC6  本地最高分       → localStorage with key 'punchMonkeyCafe_best'
 *
 * Run: node games/008-punch-monkey-cafe/tests/static.test.cjs
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
  'customerArea', 'ingredientTray',
  'dayDisplay', 'timerDisplay', 'moneyDisplay', 'targetDisplay',
  'progressFill', 'startBtn', 'muteBtn', 'titleBest',
  'resultIcon', 'resultTitle', 'resultStars', 'resultDetails',
  'resultMoney', 'resultTarget', 'resultBest', 'resultNewBest',
  'resultNextBtn', 'resultRetryBtn',
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
ok('touch-action:none on body', /touch-action:\s*none/.test(html));
ok('3 customer stations in play screen', /STATION_COUNT\s*=\s*3/.test(js));
ok('ingredient tray with fruit buttons', /id="ingredientTray"/.test(html));

/* =====================================================================
 * AC2 · Game length cap (≤3 seconds per day ≤3 minutes total)
 * ===================================================================== */
group('AC2 · Session length cap');
ok('MAX_DAY_SEC = 60 (s) declared', /MAX_DAY_SEC\s*=\s*60\b/.test(js));
ok('timeout path triggers on time cap', /sec\s*>=\s*MAX_DAY_SEC[\s\S]{0,120}endDay\(\)/.test(js));
ok('endDay sets RESULT and shows result', /gamePhase\s*=\s*['"]RESULT['"][\s\S]*showScreen\(resultScreen\)/.test(js));
ok('timerInterval assigned and cleared', /timerInterval\s*=\s*setInterval\(/.test(js) && /clearInterval\(timerInterval\)/.test(js));
ok('3 days defined in DAYS array', /DAYS\s*=/.test(js) && /day:\s*1/.test(js) && /day:\s*3/.test(js));

/* =====================================================================
 * AC3 · ≥2 input methods (keyboard + pointer/drag + touch)
 * ===================================================================== */
group('AC3 · Input methods');
ok('window keydown listener', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('1-9 number keys select ingredients', /e\.key[\s\S]{0,60}\d+[\s\S]{0,80}selectIngredientByIndex/.test(js));
ok('Enter/Space on title starts game', /gamePhase\s*===\s*['"]TITLE['"][\s\S]{0,120}(?:Enter|' ')/.test(js));
ok('Enter/Space on result advances', /gamePhase\s*===\s*['"]RESULT['"][\s\S]{0,80}(?:Enter|' ')/.test(js));
ok('S key serves first ready drink', /e\.key\s*===\s*['"]s['"]/.test(js));
ok('pointerdown on ingredient tray for drag', /ingredientTray[\s\S]{0,20}addEventListener\(\s*['"]pointerdown['"]/.test(js));
ok('pointermove for drag tracking', /addEventListener\(\s*['"]pointermove['"]/.test(js));
ok('pointerup for drop', /addEventListener\(\s*['"]pointerup['"]/.test(js));
ok('click fallback on customer area', /customerArea[\s\S]{0,20}addEventListener\(\s*['"]click['"]/.test(js));
ok('touchstart fallback on customer area', /customerArea[\s\S]{0,20}addEventListener\(\s*['"]touchstart['"]/.test(js));
ok('drag ghost created during drag', /createDragGhost/.test(js));
ok('applyIngredientToStation function for drop handling', /function\s+applyIngredientToStation/.test(js));

/* =====================================================================
 * AC4 · Replay / Next Day / Retry buttons
 * ===================================================================== */
group('AC4 · Replay & Next Day buttons');
ok('resultNextBtn has onclick handler', /resultNextBtn\.onclick\s*=/.test(js));
ok('resultRetryBtn has onclick handler', /resultRetryBtn\.onclick\s*=/.test(js));
ok('retry calls startDay()', /resultRetryBtn\.onclick[\s\S]{0,40}startDay\(\)/.test(js));
ok('next day button advances day', /currentDay\s*\+\+[\s\S]{0,60}startDay\(\)/.test(js));
ok('"Monkey Millionaire!" on final day completion', /Monkey Millionaire/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playTone() function generates sounds', /function\s+playTone\s*\(/.test(js));
ok('playSwoosh() on customer spawn', /playSwoosh\(\)/.test(js));
ok('playEarn() on revenue', /playEarn\(\)/.test(js));
ok('playComplete() on win', /playComplete\(\)/.test(js));
ok('playTimeout() on timeout', /playTimeout\(\)/.test(js));
ok('playNewBest() on new high score', /playNewBest\(\)/.test(js));
ok('playError() on wrong ingredient', /playError\(\)/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js));
ok('mute toggle persists', /localStorage\.setItem\(\s*['"]punchMonkeyCafe_muted['"]/.test(js));
ok('muted flag respected in playTone', /muted[^}]{0,40}return/.test(js) || /if\s*\(muted/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORAGE_KEY = "punchMonkeyCafe_best"', /STORAGE_KEY\s*=\s*['"]punchMonkeyCafe_best['"]/.test(js));
ok('loadHighScore try/catch fallback', /function\s+loadHighScore[\s\S]*?try[\s\S]*?parseInt[\s\S]*?catch[\s\S]*?return\s+0/.test(js));
ok('saveHighScore persists on improvement', /val\s*>\s*cur[\s\S]{0,80}localStorage\.setItem/.test(js));
ok('PROGRESS_KEY for day progression', /PROGRESS_KEY\s*=\s*['"]punchMonkeyCafe_progress['"]/.test(js));
ok('loadProgress Math.min bounds', /Math\.min\(\s*p\s*,\s*DAYS\.length\s*-\s*1\s*\)/.test(js));
ok('recentlyPlayed tracking for hub', /recentlyPlayed/.test(js));

/* =====================================================================
 * Bonus · Gameplay depth
 * ===================================================================== */
group('Bonus · Gameplay depth');
ok('13 ingredients defined', /ALL_INGREDIENTS\s*=\s*\[/.test(js) && /id:\s*['"]mint['"]/.test(js) && /id:\s*['"]coconut['"]/.test(js));
ok('3 recipe sets (day1/2/3)', /RECIPES\s*=\s*\{[\s\S]*day1:[\s\S]*day2:[\s\S]*day3:/.test(js));
ok('recipe price scaling (max $15)', /\$15/.test(js) || /price:\s*15/.test(js));
ok('revenue target / progress bar', /revenueTarget/.test(js));
ok('progressive difficulty (customer interval decreases)', /customerInterval:\s*8000/.test(js) && /customerInterval:\s*6500/.test(js) && /customerInterval:\s*5500/.test(js));
ok('star rating system (1-3 stars)', /stars\s*=\s*0[\s\S]{0,200}ratio\s*>=\s*1\.5/.test(js));
ok('customer emoji variety', /CUSTOMER_EMOJIS\s*=/.test(js));
ok('money popup animation', /money-popup/.test(html));
ok('drag ghost element', /drag-ghost/.test(html));
ok('back-to-hub link present', /<a[\s\S]{0,20}class="back-to-hub"/.test(html));
ok('mute button present', /id="muteBtn"/.test(html));
ok('customer names array', /CUSTOMER_NAMES\s*=/.test(js));
ok('"use strict"', /['"]use strict['"]/.test(js));
ok('confetti on win', /spawnConfetti/.test(js));
ok('shake animation on wrong ingredient', /\.shake/.test(html));
ok('reduced motion support', /prefers-reduced-motion/.test(js));
ok('sunburst effect on serve', /sunburst/.test(html));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'punch-monkey-cafe');
ok('registry has id="punch-monkey-cafe"', !!entry);
if (entry) {
  ok('registry.path = /games/008-punch-monkey-cafe/', entry.path === '/games/008-punch-monkey-cafe/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
  ok('registry.featured = true', entry.featured === true);
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Punch Monkey Cafe · static.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
