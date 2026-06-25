#!/usr/bin/env node
/**
 * Static smoke tests for Sparkle Sweep (Game 075).
 *
 * Single-file game (games/075-sparkle-sweep/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from issue #75 acceptance checklist:
 *
 *   AC1  ≤3 second entry → title screen, no loader, click/press to play
 *   AC2  ≤3 minute round → MAX_GAME_SEC = 180 with timeout path
 *   AC3  ≥2 input modes  → touch/pointer + mouse + keyboard
 *   AC4  「再来一局」按钮  → replay button with handler
 *   AC5  音效 + 震动      → WebAudio + navigator.vibrate
 *   AC6  本地最高分       → localStorage with key 'sparkleSweep_best'
 *
 * Run: node games/075-sparkle-sweep/tests/static.test.cjs
 * Pure Node — no jsdom, no deps.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// extract the inline <script> body (the game has exactly one inline script block)
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
  'revealCanvas', 'dirtCanvas', 'canvasWrap',
  'levelDisplay', 'timerDisplay', 'scoreDisplay', 'progressFill',
  'startBtn', 'muteBtn', 'titleBest',
  'resultIcon', 'resultTitle', 'resultDetails', 'resultScore',
  'resultBest', 'resultNewBest', 'resultNextBtn', 'resultRetryBtn',
  'hintText',
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present`, re.test(html));
}
ok('canvas elements present', /<canvas[^>]*id="revealCanvas"/.test(html) && /<canvas[^>]*id="dirtCanvas"/.test(html));
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\/games\/shared\/game-frame\.css/.test(html));
ok('title screen rendered first (no .hidden)', /id="titleScreen"[\s\S]{0,30}class="screen\s+title-screen"(?![\s\S]{0,100}hidden)/.test(html));
ok('play screen default hidden', /id="playScreen"[\s\S]{0,30}hidden/.test(html));
ok('result screen default hidden', /id="resultScreen"[\s\S]{0,30}hidden/.test(html));
ok('touch-action:none on canvas-wrap', /touch-action:\s*none/.test(html));

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
ok('Arrow keys move cleaning cursor', /case\s+['"]ArrowUp['"]/.test(js) || /e\.key\s*===\s*['"]ArrowUp['"]/.test(js));
ok('WASD keys work', /['"]w['"]\s*:/.test(js) || /e\.key\s*===\s*['"]w['"]/.test(js));
ok('1/2/3 number keys switch brush size', /case\s+['"]1['"]:[\s\S]{0,30}brushSize\s*=\s*18/.test(js));
ok('Enter/Space on title starts game', /gamePhase\s*===\s*['"]TITLE['"][\s\S]{0,120}(?:Enter|' ')/.test(js));
ok('Enter/Space on result advances', /gamePhase\s*===\s*['"]RESULT['"][\s\S]{0,80}(?:Enter|' ')/.test(js));
ok('pointerdown listener on canvasWrap', /addEventListener\(\s*['"]pointerdown['"]/.test(js));
ok('pointermove listener on window for drawing', /addEventListener\(\s*['"]pointermove['"]/.test(js));
ok('touchstart prevent on canvasWrap', /touchstart['"][\s\S]{0,80}preventDefault/.test(js));

/* =====================================================================
 * AC4 · 再来一局 / Retry button
 * ===================================================================== */
group('AC4 · Replay & Next Scene buttons');
ok('resultNextBtn has onclick handler', /resultNextBtn\.onclick\s*=/.test(js));
ok('resultRetryBtn has onclick handler', /resultRetryBtn\.onclick\s*=/.test(js));
ok('retry calls startGame()', /resultRetryBtn\.onclick[\s\S]{0,40}startGame\(\)/.test(js));
ok('next scene button advances level', /currentLevel\+\+[\s\S]{0,60}startGame\(\)/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on suspended state', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playTone() function generates sounds', /function\s+playTone\s*\(/.test(js));
ok('playClean() triggered on cleaning', /playClean\(\)/.test(js));
ok('playComplete() on win', /playComplete\(\)/.test(js));
ok('playTimeout() on timeout', /playTimeout\(\)/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js));
ok('mute toggle persists', /localStorage\.setItem\(\s*['"]sparkleSweep_muted['"]/.test(js));
ok('muted flag respected in playTone', /muted[^}]{0,40}return/.test(js) || /if\s*\(muted/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORAGE_KEY = "sparkleSweep_best"', /STORAGE_KEY\s*=\s*['"]sparkleSweep_best['"]/.test(js));
ok('loadHighScore try/catch fallback', /function\s+loadHighScore[\s\S]*?try[\s\S]*?parseInt[\s\S]*?catch[\s\S]*?return\s+0/.test(js));
ok('saveHighScore persists on improvement', /val\s*>\s*cur[\s\S]{0,80}localStorage\.setItem/.test(js));
ok('PROGRESS_KEY for level progression', /PROGRESS_KEY\s*=\s*['"]sparkleSweep_progress['"]/.test(js));
ok('loadProgress Math.min bounds', /Math\.min\(\s*p\s*,\s*SCENES\.length\s*-\s*1\s*\)/.test(js));

/* =====================================================================
 * Bonus · Scene variety & clean mechanics
 * ===================================================================== */
group('Bonus · Gameplay depth');
ok('5 scenes defined', /var\s+SCENES\s*=/.test(js) && /garden/.test(js) && /beach/.test(js) && /mountains/.test(js) && /city/.test(js) && /starry/.test(js));
ok('3 brush sizes (18/32/50)', /brushSize\s*=\s*18[\s\S]{0,120}brushSize\s*=\s*32[\s\S]{0,120}brushSize\s*=\s*50/.test(js));
ok('cleanAt modifies dirt canvas pixels', /data\[idx\]\s*=\s*0[\s\S]{0,120}dirtCtx\.putImageData/.test(js));
ok('getCleanPercent returns percentage', /getCleanPercent[\s\S]*?cleanPixels\s*\/\s*totalDirtPixels[\s\S]*?\*\s*100/.test(js));
ok('sparkle particle system', /spawnSparkles\(/.test(js) && /updateSparkles/.test(js));
ok('"use strict"', /['"]use strict['"]/.test(js));
ok('back-to-hub link present', /back-to-hub/.test(html));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'sparkle-sweep');
ok('registry has id="sparkle-sweep"', !!entry);
if (entry) {
  ok('registry.path = /games/075-sparkle-sweep/', entry.path === '/games/075-sparkle-sweep/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
}

/* =====================================================================
 * Debug surface for testing
 * ===================================================================== */
group('Bonus · Dev surface');
ok('revealCanvas ref accessible', /revealCanvas\s*=\s*\$\(['"]revealCanvas['"]\)/.test(js));
ok('dirtCtx.getImageData for pixel math', /dirtCtx\.getImageData\(/.test(js));

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Sparkle Sweep · static.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
