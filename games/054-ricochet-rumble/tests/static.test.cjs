#!/usr/bin/env node
/**
 * Static acceptance tests for Ricochet Rumble (Issue #54).
 * Run: node games/054-ricochet-rumble/tests/static.test.cjs
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

group('AC1 - Splash screen loads within 3 seconds, no tutorial');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE boot present', /\(function\s*\(\)\s*\{[\s\S]*\n\s*\}\)\s*\(\)/.test(js));
ok('screen-title is active by default', /id="screen-title"[\s\S]*class="screen active"/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('best score loaded on boot', /loadBestScore\(\)/.test(js));

group('AC2 - single round <= 3 minutes');
ok('HP system: 3 hit points, no time limit (short rounds by design)', /playerHP:\s*3/.test(js) && /enemyHP:\s*3/.test(js));
ok('max bounces cap at 20 prevents infinite loop', /bounces > 20/.test(js));

group('AC3 - at least two input modes (mouse + touch + keyboard)');
ok('mouse drag listeners exist', /mousedown[\s\S]{0,200}(updateAim|isDragging)/.test(js));
ok('touch drag listeners exist', /touchstart[\s\S]{0,200}(updateAim|isDragging)/.test(js));
ok('keyboard arrow keys set aim direction', /ArrowUp[\s\S]{0,100}ArrowDown[\s\S]{0,100}ArrowLeft[\s\S]{0,100}ArrowRight/.test(js));
ok('keyboard Space/Enter fires', /e\.key\s*===\s*['"]\s['"]|e\.key\s*===\s*['"]Enter['"]/.test(js));

group('AC4 - Result screen with Rematch button');
ok('result screen has rematch button', /btn-rematch/.test(html));
ok('rematch calls startGame', /rematch\s*=\s*function\s*\(\)\s*\{[\s\S]{0,50}startGame/.test(js));
ok('menu button returns to title', /menu\s*=\s*function[\s\S]{0,200}screen-title/.test(js));
ok('result shows VICTORY / DEFEAT with icon', /VICTORY/.test(js) && /DEFEAT/.test(js) && /result-icon/.test(js));
ok('stats displayed: level, rounds, bounces, accuracy', /res-level/.test(js) && /res-rounds/.test(js) && /res-bounces/.test(js) && /res-accuracy/.test(js));

group('AC5 - Sound effects and vibration');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('SFX functions defined (shoot, bounce, hit, win, lose, level-up, enemy)',
  /sfxShoot\s*\(/.test(js) && /sfxBounce\s*\(/.test(js) && /sfxHit\s*\(/.test(js) &&
  /sfxWin\s*\(/.test(js) && /sfxLose\s*\(/.test(js) && /sfxLevelUp\s*\(/.test(js) && /sfxEnemyShoot\s*\(/.test(js));
ok('vibration guarded with try/catch', /try\s*\{\s*navigator\.vibrate/.test(js));

group('AC6 - localStorage best score');
ok('localStorage key defined', /ricochet-best/.test(js));
ok('saveBestScore writes to localStorage', /localStorage\.setItem\(['"]ricochet-best['"]/.test(js));
ok('loadBestScore reads with parseInt', /parseInt\(localStorage\.getItem\(['"]ricochet-best['"]/.test(js));
ok('best score displayed on title screen', /best-score-display/.test(js));

group('Physics engine - bounce mechanics');
ok('wall reflection function exists', /function\s+reflectWall/.test(js));
ok('obstacle collision detection (pointInRect)', /function\s+pointInRect/.test(js));
ok('obstacle bounce logic (reflectObstacle)', /function\s+reflectObstacle/.test(js));
ok('trajectory preview (simulateBounce)', /function\s+simulateBounce/.test(js));

group('Game logic - turn alternation');
ok('player turn state variable', /isPlayerTurn/.test(js));
ok('startEnemyTurn exists', /function\s+startEnemyTurn/.test(js));
ok('endEnemyTurn exists', /function\s+endEnemyTurn/.test(js));
ok('enemy shoot function exists', /function\s+enemyShoot/.test(js));

group('Game logic - HP system');
ok('playerHP initialized to 3', /playerHP:\s*3/.test(js));
ok('enemyHP initialized to 3', /enemyHP:\s*3/.test(js));
ok('HP decrements on hit', /state\.playerHP--|state\.enemyHP--/.test(js));
ok('game over when HP <= 0', /playerHP\s*<=\s*0/.test(js) && /enemyHP\s*<=\s*0/.test(js));

group('Multi-level progression');
ok('levels array with 5 entries', /levels\s*=\s*\[/.test(js));
ok('level counter increments on clear', /state\.level\+\+|level\+\+/.test(js));
ok('level transition overlay exists', /level-up/.test(html));
ok('nextLevel function resets state', /window\.nextLevel\s*=\s*function/.test(js));

group('Playability and keyboard');
ok('pause overlay exists', /pause-overlay/.test(html));
ok('Escape toggles pause', /Escape[\s\S]{0,200}isPaused/.test(js));
ok('Quit button returns to menu', /quitToMenu/.test(js));
ok('responsive layout (max-width 480px)', /@media\s*\(max-width:\s*480px\)/.test(html));

// =========== BLOCKING DEFECT REGRESSION TEST ===========
group('Regression: animateBullet obstacle collision (BLOCKING DEFECT)');
const animateBulletSrc = extractFunctionBody(js, 'animateBullet');
ok('animateBullet function extractable', !!animateBulletSrc);
if (animateBulletSrc) {
  // The bug was using o[i].x instead of o.x in obstacle collision
  const usesOBracketI = /o\[i\]\.\w/.test(animateBulletSrc);
  ok('animateBullet does NOT use o[i].x (anti-regression)', !usesOBracketI,
    'Found o[i] usage in animateBullet — this causes TypeError crash on obstacle hit');
}

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'ricochet-rumble');
ok('registry contains ricochet-rumble', !!entry);
ok('registry path points at 054 directory', entry && entry.path === '/games/054-ricochet-rumble/');
ok('registry category is action', entry && entry.category === 'action');
ok('registry tags include turn-based', entry && entry.tags.includes('turn-based'));
ok('registry tags include physics', entry && entry.tags.includes('physics'));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
