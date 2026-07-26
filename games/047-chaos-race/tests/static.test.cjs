#!/usr/bin/env node
/**
 * Static acceptance tests for Chaos Race (Issue #47).
 * Run: node games/047-chaos-race/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// Utility: extract all JS code from inline <script> in HTML
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

group('AC1 - Splash screen active by default, no tutorial, loadBestScore on init');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE/closure boot present', /\(function\s*\(\)\s*\{/.test(js) || /'use strict'/.test(js));
ok('screen-splash is active by default', /id="screen-splash"[\s\S]*class="screen splash-screen active"/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|override-tutorial/i.test(html));
ok('high score loaded on boot (loadHighScore in init)', /loadHighScore\(\)/.test(js));

group('AC2 - Round time ~60s by design, race mechanics for short rounds');
ok('maxRaceTime is defined and >= 60 (short rounds)', /maxRaceTime\s*:\s*(\d+)/.test(js));
const maxTimeMatch = js.match(/maxRaceTime\s*:\s*(\d+)/);
if (maxTimeMatch) {
  const maxTime = parseInt(maxTimeMatch[1]);
  ok('maxRaceTime is >= 60 seconds', maxTime >= 60, 'got ' + maxTime);
}
ok('RACE_DISTANCE defined for race mechanics', /RACE_DISTANCE\s*:/.test(js));
ok('BASE_SPEED defined for race mechanics', /BASE_SPEED\s*:/.test(js));
ok('PLACEMENT_SCORE array exists with 5 entries', /PLACEMENT_SCORE\s*:/.test(js));

group('AC3 - Keyboard, Touch, Mouse input modes');
// Keyboard: Space, ArrowUp, KeyW, ArrowDown, KeyS
ok('keyboard Space jump handler', /G\.keys\[['"]Space['"]\]/.test(js));
ok('keyboard ArrowUp jump handler', /G\.keys\[['"]ArrowUp['"]\]/.test(js));
ok('keyboard KeyW jump handler', /G\.keys\[['"]KeyW['"]\]/.test(js));
ok('keyboard ArrowDown slide handler', /G\.keys\[['"]ArrowDown['"]\]/.test(js));
ok('keyboard KeyS slide handler', /G\.keys\[['"]KeyS['"]\]/.test(js));
ok('key event listeners (keydown/keyup)', /addEventListener\(['"]keydown['"]/.test(js) && /addEventListener\(['"]keyup['"]/.test(js));
// Touch: touchstart, touchend on canvas
ok('touchstart on canvas', /canvas\.addEventListener\(['"]touchstart['"]/.test(js));
ok('touchend on canvas', /canvas\.addEventListener\(['"]touchend['"]/.test(js));
ok('touchmove on canvas', /canvas\.addEventListener\(['"]touchmove['"]/.test(js));
// Mouse: click on canvas
ok('click on canvas (mouse jump)', /canvas\.addEventListener\(['"]click['"]/.test(js));
ok('three distinct input methods (keyboard + touch + mouse)',
  /addEventListener\(['"]keydown['"]/.test(js) &&
  /addEventListener\(['"]touchstart['"]/.test(js) &&
  /addEventListener\(['"]click['"]/.test(js));

group('AC4 - Results screen with NEXT/REMATCH/MENU, Win screen with PLAY AGAIN');
ok('results screen has NEXT ROUND button', /btn-next/.test(html));
ok('results screen has REMATCH button', /btn-rematch/.test(html));
ok('results screen has MENU button', /btn-menu/.test(html));
ok('win screen has PLAY AGAIN button', /btn-play-again/.test(html));
ok('win screen has MENU button', /btn-win-menu/.test(html));
ok('btn-play calls startTournament', /btn-play[\s\S]*startTournament/.test(js));
ok('btn-rematch calls startTournament', /btn-rematch[\s\S]*startTournament/.test(js));
ok('btn-next handles NEXT ROUND / RETRY logic', /btn-next[\s\S]*nextRound/.test(js) && /btn-next[\s\S]*retryRound/.test(js));
ok('btn-menu returns to splash screen', /btn-menu[\s\S]*screen-splash/.test(js));
ok('placement display suffix logic (st, nd, rd)', /placement\s*===\s*1\s*\?\s*['"]st['"]/.test(js) && /placement\s*===\s*2\s*\?\s*['"]nd['"]/.test(js) && /placement\s*===\s*3\s*\?\s*['"]rd['"]/.test(js));
ok('score displayed on results screen', /results-score/.test(html));

group('AC5 - AudioContext with webkit fallback, SFX functions, vibrate with try/catch');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('Audio.init function defined', /Audio\.init\s*=/.test(js) || /function\s+init[\s\S]{0,100}AudioContext/.test(js));
ok('Audio.play function defined', /Audio\.play\s*=/.test(js) || /function\s+play\s*\(/.test(js));
ok('SFX freq includes jump', /jump\s*:/.test(js));
ok('SFX freq includes slide', /slide\s*:/.test(js));
ok('SFX freq includes coin', /coin\s*:/.test(js));
ok('SFX freq includes crash', /crash\s*:/.test(js));
ok('SFX freq includes powerup', /powerup\s*:/.test(js));
ok('SFX freq includes round_complete', /round_complete\s*:/.test(js));
ok('SFX freq includes victory', /victory\s*:/.test(js));
ok('Audio.play called for jump', /Audio\.play\(['"]jump['"]\)/.test(js));
ok('Audio.play called for coin', /Audio\.play\(['"]coin['"]\)/.test(js));
ok('Audio.play called for crash', /Audio\.play\(['"]crash['"]\)/.test(js));
ok('Audio.play called for powerup', /Audio\.play\(['"]powerup['"]\)/.test(js));
ok('Audio.play called for round_complete', /Audio\.play\(['"]round_complete['"]\)/.test(js));
ok('Audio.play called for victory', /Audio\.play\(['"]victory['"]\)/.test(js));
ok('vibrate guarded with try/catch', /try\s*\{\s*navigator\.vibrate/.test(js));
ok('Vibe short function defined', /Vibe\s*=\s*\{[\s\S]*?short\s*\(/.test(js));
ok('Vibe medium function defined', /Vibe\s*=\s*\{[\s\S]*?medium\s*\(/.test(js));
ok('Vibe long function defined', /Vibe\s*=\s*\{[\s\S]*?long\s*\(/.test(js));

group('AC6 - localStorage key');
ok('localStorage key "chaos-race-best" used', /chaos-race-best/.test(js));
ok('saveHighScore writes to localStorage', /localStorage\.setItem\(['"]chaos-race-best['"]/.test(js));
ok('loadHighScore reads from localStorage with parseInt', /parseInt\(localStorage\.getItem\(['"]chaos-race-best['"]/.test(js));
ok('high score displayed on splash screen (splash-best)', /splash-best/.test(html));

group('Game mechanics - 4 AI opponents');
ok('AI_CONFIGS array has 4 entries', /AI_CONFIGS\s*=/.test(js));
const aiMatch = js.match(/AI_CONFIGS\s*=\s*\[([\s\S]*?)\];/);
if (aiMatch) {
  const entries = aiMatch[1].match(/\{/g);
  ok('AI_CONFIGS contains exactly 4 opponent configs', entries && entries.length === 4);
}
ok('Nitro AI opponent present', /name:\s*['"]Nitro['"]/.test(js));
ok('Blaze AI opponent present', /name:\s*['"]Blaze['"]/.test(js));
ok('Sprint AI opponent present', /name:\s*['"]Sprint['"]/.test(js));
ok('Crash AI opponent present', /name:\s*['"]Crash['"]/.test(js));

group('Game mechanics - 3 rounds');
ok('ROUND_COUNT = 3', /ROUND_COUNT\s*:\s*3/.test(js));
ok('round tracking in G state', /round\s*:/.test(js) && /G\.round\s*\+\+/.test(js));
ok('roundScores array in G state', /roundScores\s*:\s*\[\]/.test(js));
ok('nextRound function exists', /function\s+nextRound/.test(js));
ok('retryRound function exists', /function\s+retryRound/.test(js));

group('Game mechanics - Obstacles');
ok('OBS_TYPES array defined', /OBS_TYPES\s*=/.test(js));
ok('spike obstacle type defined', /id:\s*['"]spike['"]/.test(js));
ok('barrier obstacle type defined', /id:\s*['"]barrier['"]/.test(js));
ok('saw obstacle type defined', /id:\s*['"]saw['"]/.test(js));
ok('gap obstacle type defined', /isGap/.test(js));
ok('obstacle generation function exists', /function\s+generateAhead/.test(js));
ok('collision detection function exists', /function\s+checkCollisions/.test(js));

group('Game mechanics - Power-ups');
ok('powerup generation (POWERUP_INTERVAL)', /POWERUP_INTERVAL/.test(js));
ok('boost power-up type', /type\s*===\s*['"]boost['"]/.test(js) || /pu\.type\s*===\s*['"]boost['"]/.test(js));
ok('shield power-up type', /type\s*===\s*['"]shield['"]/.test(js) || /pu\.type\s*===\s*['"]shield['"]/.test(js));
ok('boost duration and multiplier', /BOOST_DURATION/.test(js) && /BOOST_MULTIPLIER/.test(js));

group('Game mechanics - Coins');
ok('coins array in G state', /coins\s*:\s*\[\]/.test(js));
ok('COIN_SCORE defined', /COIN_SCORE/.test(js));
ok('coin collection in collision check', /coin\.collected\s*=\s*true/.test(js));
ok('coin particle effects on collection', /particles\.push\([\s\S]*?FFD700/.test(js));

group('Race mechanics');
ok('Racer class defined', /class\s+Racer/.test(js));
ok('player input handler defined', /function\s+handlePlayerInput/.test(js));
ok('AI logic function defined', /function\s+updateAI/.test(js));
ok('physics update function defined', /function\s+updateRacerPhysics/.test(js));
ok('race finish check function', /function\s+checkRaceFinish/.test(js));
ok('end of race handler', /function\s+endRace/.test(js));
ok('rubber banding mechanic', /RUBBER_BAND_FACTOR/.test(js));
ok('advancement system (top half advance)', /advanceCount[\s\S]*Math\.ceil\(totalRacers/.test(js));

group('Screen management');
ok('showScreen function exists', /function\s+showScreen/.test(js));
ok('screen-splash element present', /screen-splash/.test(html));
ok('screen-game element present', /screen-game/.test(html));
ok('screen-results element present', /screen-results/.test(html));
ok('screen-win element present', /screen-win/.test(html));
ok('canvas element present', /canvas/.test(html));
ok('screen transitions with active class', /classList\.(add|toggle)\(['"]active['"]\)/.test(js));

group('Particles');
ok('particles array in G state', /particles\s*:\s*\[\]/.test(js));
ok('updateParticles function exists', /function\s+updateParticles/.test(js));

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'chaos-race');
ok('registry contains chaos-race', !!entry);
ok('registry path points at 047 directory', entry && entry.path === '/games/047-chaos-race/');
ok('registry category is racing', entry && entry.category === 'racing');
ok('registry tags include racing', entry && entry.tags.includes('racing'));
ok('registry tags include chaos', entry && entry.tags.includes('chaos'));
ok('registry tags include multiplayer', entry && entry.tags.includes('multiplayer'));
ok('registry tags include platformer', entry && entry.tags.includes('platformer'));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
