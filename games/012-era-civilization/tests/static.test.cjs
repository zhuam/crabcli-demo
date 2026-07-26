#!/usr/bin/env node
/**
 * Era Civilization.io (Issue #12) static acceptance tests.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const registry = fs.readFileSync(path.resolve(ROOT, '..', 'registry.json'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, condition) {
  if (condition) { console.log('  ✅ ' + label); passed++; }
  else { console.error('  ❌ ' + label); failed++; }
}
function group(title) { console.log('\n' + title); }

group('AC1 · first screen playable within 3 seconds, no tutorial');
ok('viewport meta tag present', /<meta\s+name="viewport"/i.test(html));
ok('no blocking tutorial content', !/tutorial/i.test(html));
ok('game-frame.css is linked', /game-frame\.css/.test(html));
ok('canvas element present', /<canvas/i.test(html));
ok('start button exists', /id="startBtn"/.test(html));

group('AC2 · session length <= 3 minutes');
ok('GAME_MAX_MS is exactly 180000 (3 min)', /GAME_MAX_MS\s*=\s*180000/.test(html));

group('AC3 · mouse, touch and keyboard input');
ok('keyboard listener for arrow keys', /addEventListener\('keydown'[\s\S]{0,1000}ArrowUp/.test(html));
ok('keyboard listener for WASD', /addEventListener\('keydown'[\s\S]{0,1000}['"]w['"]/.test(html));
ok('mouse drag handlers present', /mousedown/.test(html) && /mouseup/.test(html) && /mousemove/.test(html));
ok('touch drag handlers present', /touchstart/.test(html) && /touchmove/.test(html));

group('AC4 · game-over screen with play again');
ok('gameover overlay element exists', /id="gameoverOverlay"/.test(html));
ok('replay button exists', /id="replayBtn"/.test(html));
ok('endGame function defined', /function endGame\(/.test(html));
ok('play again text in Chinese', /再来一局/.test(html));

group('AC5 · sound effects via Web Audio API');
ok('AudioContext used', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(html));
ok('oscillator created for sound', /createOscillator\(\)/.test(html));
ok('multiple sound types: claim, era, die', /['"]claim['"]/.test(html) && /['"]era['"]/.test(html) && /['"]die['"]/.test(html));
ok('mute toggle present', /id="muteBtn"/.test(html));

group('AC6 · localStorage high score tracking');
ok('high score storage key defined', /STORAGE_KEY\s*=\s*'era-civilization-best'/.test(html));
ok('loadHighScore function reads from localStorage', /localStorage\.getItem\(STORAGE_KEY\)/.test(html));
ok('saveHighScore function writes to localStorage', /localStorage\.setItem\(STORAGE_KEY/.test(html));
ok('high score displayed on title screen', /id="titleBest"/.test(html));
ok('new best indicator on game-over', /id="goNewBest"/.test(html));

group('Era progression logic');
ok('three era configurations defined', /石器[\s\S]{0,500}工业[\s\S]{0,500}未来/.test(html));
ok('era threshold checks in progEra function', /function progEra\(\)/.test(html));
ok('era flash overlay present', /id="eraFlash"/.test(html));
ok('era selector buttons on title screen', /class="era-btn"/.test(html));
ok('era badge icon element exists', /id="eraBadgeIcon"/.test(html));

group('Territory scoring');
ok('score percentage displayed', /pScore\s*=\s*Math\.round\(/.test(html) && /%/.test(html));
ok('territory counting function defined', /function countT\(/.test(html));
ok('score shown in HUD', /id="scoreDisplay"/.test(html));
ok('score shown on gameover screen', /id="goScore"/.test(html));

group('Core game mechanics');
ok('grid map initialization', /function initMap\(\)/.test(html));
ok('flood fill or territory claiming logic', /function floodFill\(/.test(html) || /function claimTerritory\(/.test(html));
ok('AI opponent update logic', /function updateAI\(\)/.test(html));
ok('player trail collision with AI', /trail\[ny\]&&trail\[ny\]\[nx\]===2/.test(html));
ok('game loop renders', /function render\(\)/.test(html));
ok('canvas resize on window resize', /resize/.test(html) && /canvas/.test(html));

group('Registry');
ok('registry includes era-civilization', /"id":\s*"era-civilization"/.test(registry));

if (failed) {
  console.error('\n' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('\nAll ' + passed + ' checks passed.');
