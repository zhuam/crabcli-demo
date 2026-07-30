#!/usr/bin/env node
/**
 * Static acceptance tests for Gridlock Garden (Game 042).
 * Run: node games/042-gridlock-garden/tests/static.test.cjs
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

// Extract all JS code from inline <script> in HTML
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

const js = extractInlineJS(html);

group('AC1 - Splash / Title screen, playable in 3 seconds, no tutorial');
ok('IIFE boot present', /\(function\s*\(\)\s*\{/.test(js));
ok('title screen with play button', /id="playBtn"/.test(html) && /id="titleScreen"/.test(html));
ok('no tutorial overlay or how-to-play text', !/tutorial|how.to.play|教程/i.test(html));
ok('high score loaded on boot', /loadHighScore\(\)/.test(js) || /loadHighScore\s*=/.test(js));
ok('level select button exists', /id="levelSelectBtn"/.test(html) || /id="levelBackBtn"/.test(html));

group('AC2 - Single session ≤ 3 min (timer built-in)');
ok('timer display element exists', /id="timerDisplay"/.test(html));
ok('startTimer function defined', /function\s+startTimer\s*\(/.test(js) || /startTimer\s*=/.test(js));
ok('stopTimer function defined', /function\s+stopTimer\s*\(/.test(js) || /stopTimer\s*=/.test(js));
ok('formatTime helper for minutes:seconds', /formatTime/.test(js) && /Math\.floor/.test(js));
ok('timer interval set at ≤500ms', /setInterval\s*\([\s\S]*?200/.test(js) || /setInterval\s*\([\s\S]*?500/.test(js));

group('AC3 - Input modes: Touch, Mouse, Keyboard');
ok('click handler on grid cells', /addEventListener\(\s*'click'/.test(js));
ok('touchstart handler on grid cells', /addEventListener\(\s*'touchstart'/.test(js));
ok('palette click for plant selection', /plant-btn/.test(html));
ok('keyboard 1-9 selects plants', /e\.key\s*>=\s*['"]1['"]/.test(js));
ok('keyboard H for hint', /e\.key\s*===\s*['"]h['"]/.test(js) || /e\.key\s*===\s*['"]H['"]/.test(js));
ok('keyboard R for reset', /e\.key\s*===\s*['"]r['"]/.test(js) || /e\.key\s*===\s*['"]R['"]/.test(js));
ok('keyboard Escape to quit', /Escape/.test(js));
ok('touch events on plant palette', /plant-btn[\s\S]{0,200}touchstart/.test(js));

group('AC4 - Result screen with Play Again / Retry / Menu');
ok('result screen exists', /id="resultScreen"/.test(html));
ok('result has retry button', /id="resultRetryBtn"/.test(html));
ok('result has menu button', /id="resultMenuBtn"/.test(html));
ok('result has next level button', /id="resultNextBtn"/.test(html));
ok('result stars element exists', /id="resultStars"/.test(html));
ok('retry calls startLevel', /resultRetryBtn\.addEventListener\([\s\S]{0,100}startLevel/.test(js));
ok('menu returns to title screen', /resultMenuBtn\.addEventListener\([\s\S]{0,100}showScreen\(titleScreen\)/.test(js) || /resultMenuBtn\.addEventListener\([\s\S]{0,100}titleScreen/.test(js));
ok('result shows moves and time', /resultDetail/.test(html) && /moveCount/.test(js));

group('AC5 - Sound FX and vibration');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('ensureAudio function', /function\s+ensureAudio\s*\(/.test(js) || /ensureAudio/.test(js));
ok('playTone uses createOscillator', /createOscillator/.test(js) && /createGain/.test(js));
ok('playPlace sound function', /function\s+playPlace\s*\(/.test(js) || /playPlace\s*=/.test(js));
ok('playRemove sound function', /function\s+playRemove\s*\(/.test(js) || /playRemove\s*=/.test(js));
ok('playWin sound function', /function\s+playWin\s*\(/.test(js) || /playWin\s*=/.test(js));
ok('playFail sound function', /function\s+playFail\s*\(/.test(js) || /playFail\s*=/.test(js));
ok('vibrate guarded with try/catch', /try\s*\{[\s\S]{0,30}navigator\.vibrate/.test(js));
ok('vibrate called on place/remove', /vibrate\(/.test(js));

group('AC6 - localStorage persistence');
ok('STORAGE_KEY defined', /STORAGE_KEY\s*=/.test(js));
ok('LEVEL_KEY defined for progress', /LEVEL_KEY\s*=/.test(js));
ok('saveHighScore writes to localStorage', /localStorage\.setItem\(\s*STORAGE_KEY/.test(js));
ok('loadHighScore reads with parseInt', /parseInt\(localStorage\.getItem\(\s*STORAGE_KEY/.test(js));
ok('best score displayed on title screen', /id="titleBest"/.test(html) && /titleBest\.textContent/.test(js));
ok('level progress saved on win', /saveLevelProgress/.test(js));
ok('current level persisted', /saveCurrentLevel/.test(js));

group('Game mechanics - Grid, plants, levels');
ok('LEVELS array with multiple entries', /const LEVELS\s*=\s*\[/.test(js) || /const LEVELS\s*=\s*\[/.test(html));
ok('at least 10 levels defined', (html.match(/size:/g) || []).length >= 10);
ok('PLANTS array with emoji', /const PLANTS\s*=/.test(js));
ok('grid cells in HTML with class cell', /class="cell"/.test(html) || /\.cell\s*\{/.test(html));
ok('deriveRules function defined', /function\s+deriveRules\s*\(/.test(js));
ok('checkRule function defined', /function\s+checkRule\s*\(/.test(js));
ok('onClickCell handler defined', /function\s+onClickCell\s*\(/.test(js));
ok('checkWin function defined', /function\s+checkWin\s*\(/.test(js));
ok('renderGrid function defined', /function\s+renderGrid\s*\(/.test(js));
ok('renderPalette function defined', /function\s+renderPalette\s*\(/.test(js));
ok('startLevel function defined', /function\s+startLevel\s*\(/.test(js));
ok('hint system with hintBtn', /id="hintBtn"/.test(html));
ok('reset button exists', /id="resetBtn"/.test(html));
ok('quit button exists', /id="quitBtn"/.test(html));
ok('prefilled / hint cells in level data', /hints\s*:/.test(js));
ok('selectedPlant state toggling', /selectedPlant/.test(js));

group('Registry integration');
let registry;
try {
  registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
} catch(e) {
  registry = { games: [] };
}
const id = 'gridlock-garden';
const entry = registry.games.find(g => g.id === id);
ok('registry contains gridlock-garden', !!entry);
if (entry) {
  ok('registry path points at 042 directory', entry.path === '/games/042-gridlock-garden/');
  ok('registry category is puzzle', entry.category === 'puzzle' || entry.category === 'casual');
  ok('registry has singleplayer tag', entry.tags && entry.tags.includes('singleplayer'));
  ok('registry has puzzle tag', entry.tags && entry.tags.includes('puzzle'));
}

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
