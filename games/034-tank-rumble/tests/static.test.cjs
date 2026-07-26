/* ═══════════════════════════════════════════════
   Tank Rumble — Static Tests
   Checks file structure, patterns, key functions
   ═══════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertContains(text, substr, msg) {
  assert(text.indexOf(substr) !== -1, msg + ' (contains "' + substr + '")');
}

// ─── File existence ───
console.log('\n[File Existence]');
const requiredFiles = [
  'index.html',
  'style.css',
  'app.js',
  'thumb.svg',
  'README.md',
  'tests/static.test.cjs',
  'tests/behavior.test.cjs',
];

requiredFiles.forEach(function (f) {
  var exists = fs.existsSync(path.join(BASE, f));
  assert(exists, f + ' exists');
});

// ─── index.html ───
console.log('\n[index.html]');
var html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');

assertContains(html, '<!DOCTYPE html>', 'Has DOCTYPE');
assertContains(html, 'game-frame.css', 'Includes game-frame.css');
assertContains(html, 'recordPlayed', 'Has recordPlayed pattern');
assertContains(html, 'viewport', 'Has viewport meta');
assertContains(html, 'back-to-hub', 'Has back-to-hub');

assertContains(html, 'titleScreen', 'Has title screen');
assertContains(html, 'gameScreen', 'Has game screen');
assertContains(html, 'resultScreen', 'Has result screen');
assertContains(html, 'playBtn', 'Has play button');
assertContains(html, 'retryBtn', 'Has retry button');
assertContains(html, 'homeBtn', 'Has home button');
assertContains(html, 'pauseOverlay', 'Has pause overlay');
assertContains(html, 'roundOverlay', 'Has round overlay');
assertContains(html, 'gameCanvas', 'Has game canvas');

assertContains(html, 'controls-bar', 'Has controls bar');
assertContains(html, 'dpad-btn', 'Has d-pad buttons');
assertContains(html, 'fireBtn', 'Has fire button');
assertContains(html, 'localStorage', 'Uses localStorage');
assertContains(html, 'tank_rumble_played', 'Has played sentinel');
assertContains(html, 'app.js', 'Loads app.js');

// Check for screen classes
assertContains(html, 'screen title-screen', 'Has title-screen class');
assertContains(html, 'screen game-screen', 'Has game-screen class');
assertContains(html, 'screen result-screen', 'Has result-screen class');

// ─── style.css ───
console.log('\n[style.css]');
var css = fs.readFileSync(path.join(BASE, 'style.css'), 'utf8');

assertContains(css, 'touch-action: manipulation', 'Has touch-action manipulation');
assertContains(css, 'prefers-reduced-motion', 'Has prefers-reduced-motion');
assertContains(css, 'max-width: 480px', 'Has mobile responsive');
assertContains(css, '100dvh', 'Uses dynamic viewport height');
assertContains(css, '@media', 'Has media queries');

assertContains(css, '--player-color', 'Has player color variable');
assertContains(css, '--enemy-color', 'Has enemy color variable');
assertContains(css, '--wall-color', 'Has wall color variable');
assertContains(css, '--ground-color', 'Has ground color variable');

assertContains(css, 'dpad', 'Has d-pad styles');
assertContains(css, 'fire-btn', 'Has fire button styles');
assertContains(css, 'round-overlay', 'Has round overlay styles');
assertContains(css, 'pause-overlay', 'Has pause overlay styles');
assertContains(css, 'result-screen', 'Has result screen styles');

// ─── app.js ───
console.log('\n[app.js]');
var js = fs.readFileSync(path.join(BASE, 'app.js'), 'utf8');

assertContains(js, 'use strict', 'Strict mode');
assertContains(js, 'COLS = 15', '15 columns defined');
assertContains(js, 'ROWS = 10', '10 rows defined');
assertContains(js, 'MOVE_COOLDOWN', 'Move cooldown defined');
assertContains(js, 'SHELL_SPEED', 'Shell speed defined');
assertContains(js, 'TANK_HP', 'Tank HP defined');
assertContains(js, 'ROUNDS_TO_WIN', 'Rounds to win defined');

assertContains(js, 'MAPS', 'Has maps array');
assertContains(js, 'DIR', 'Has directions');
assertContains(js, 'function moveTank', 'Has moveTank function');
assertContains(js, 'function fireShell', 'Has fireShell function');
assertContains(js, 'function updateShells', 'Has updateShells function');
assertContains(js, 'function updateAI', 'Has updateAI function');
assertContains(js, 'function checkLineOfSight', 'Has line of sight check');
assertContains(js, 'function render', 'Has render function');
assertContains(js, 'function drawGrid', 'Has drawGrid function');
assertContains(js, 'function drawTank', 'Has drawTank function');
assertContains(js, 'function drawHPBar', 'Has HP bar drawing');

assertContains(js, 'audioCtx', 'Has audio context');
assertContains(js, 'playTone', 'Has tone playback');
assertContains(js, 'playMove', 'Has move sound');
assertContains(js, 'playShoot', 'Has shoot sound');
assertContains(js, 'playHit', 'Has hit sound');
assertContains(js, 'playExplosion', 'Has explosion sound');
assertContains(js, 'playMatchWin', 'Has win sound');
assertContains(js, 'playMatchLose', 'Has lose sound');

assertContains(js, 'navigator.vibrate', 'Has vibration');
assertContains(js, 'localStorage', 'Uses localStorage');
assertContains(js, "'tank-rumble-best'", 'Has storage key');

assertContains(js, 'aiState', 'Has AI state');
assertContains(js, 'patrol', 'Has patrol state');
assertContains(js, 'attack', 'Has attack state');

assertContains(js, 'ArrowUp', 'Handles arrow keys');
assertContains(js, 'w', 'Handles W key');
assertContains(js, ' ', 'Handles space');
assertContains(js, 'touchstart', 'Handles touch');

assertContains(js, 'explosion', 'Has explosion array');
assertContains(js, 'particle', 'Has particle array');
assertContains(js, 'screenShake', 'Has screen shake');

// ─── thumb.svg ───
console.log('\n[thumb.svg]');
var svg = fs.readFileSync(path.join(BASE, 'thumb.svg'), 'utf8');

assertContains(svg, '<svg', 'SVG tag present');
assertContains(svg, 'viewBox', 'Has viewBox');
assertContains(svg, 'tank', 'Has tank element');

// ─── README.md ───
console.log('\n[README.md]');
var md = fs.readFileSync(path.join(BASE, 'README.md'), 'utf8');

assertContains(md, 'Tank Rumble', 'Has game title');
assertContains(md, 'Issue #34', 'Has issue number');
assertContains(md, 'Controls', 'Has controls section');
assertContains(md, 'localStorage', 'Mentions localStorage');
assertContains(md, 'tank-rumble-best', 'Has storage key');

// ─── Summary ───
console.log('\n═══ RESULTS ═══');
console.log('Passed: ' + passed + ' | Failed: ' + failed + '\n');

process.exit(failed > 0 ? 1 : 0);
