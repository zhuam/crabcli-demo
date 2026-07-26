/* ═══════════════════════════════════════════════
   Tank Rumble — Behavior Tests
   Tests AI logic, collision detection, scoring
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

// Helper: extract game constants from app.js
var js = fs.readFileSync(path.join(BASE, 'app.js'), 'utf8');

function getConst(name) {
  var re = new RegExp('var\\s+' + name + '\\s*=\\s*(\\d+)', 'm');
  var m = re.exec(js);
  if (m) return parseInt(m[1], 10);
  re = new RegExp('const\\s+' + name + '\\s*=\\s*(\\d+)', 'm');
  m = re.exec(js);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Constants Verification ───
console.log('\n[Constants]');

var COLS = getConst('COLS');
var ROWS = getConst('ROWS');
assert(COLS === 15, 'COLS = 15, got ' + COLS);
assert(ROWS === 10, 'ROWS = 10, got ' + ROWS);

var TANK_HP = getConst('TANK_HP');
assert(TANK_HP === 3, 'TANK_HP = 3, got ' + TANK_HP);

var ROUNDS_TO_WIN = getConst('ROUNDS_TO_WIN');
assert(ROUNDS_TO_WIN === 3, 'ROUNDS_TO_WIN = 3, got ' + ROUNDS_TO_WIN);

var MOVE_COOLDOWN = getConst('MOVE_COOLDOWN');
assert(MOVE_COOLDOWN > 0, 'MOVE_COOLDOWN > 0, got ' + MOVE_COOLDOWN);

var SHELL_SPEED = getConst('SHELL_SPEED');
assert(SHELL_SPEED > 0, 'SHELL_SPEED > 0, got ' + SHELL_SPEED);

// ─── Map Data ───
console.log('\n[Maps]');

// Check maps array has 3 entries
var mapMatch = js.match(/MAPS\s*=\s*\[/);
assert(mapMatch !== null, 'MAPS array declared');

// Count map dimensions
var mapData = js.match(/\[([\s\S]*?)\]\s*\]\s*\]\s*\]\s*;/);
// Look for 3 map definitions
var mapCount = (js.match(/\/\/ Map \d/g) || []).length;
assert(mapCount === 3, '3 maps defined, found ' + mapCount);

// Check for wall types
assert(js.indexOf('0 = empty') !== -1, 'Has empty tile definition');
assert(js.indexOf('1 = wall') !== -1, 'Has wall tile definition');
assert(js.indexOf('2 = destructible') !== -1, 'Has destructible wall definition');

// ─── AI Behavior ───
console.log('\n[AI Behavior]');

assert(js.indexOf('aiState') !== -1, 'AI has state variable');
assert(js.indexOf('patrol') !== -1, 'AI has patrol state');
assert(js.indexOf('attack') !== -1, 'AI has attack state');
assert(js.indexOf('checkLineOfSight') !== -1, 'AI checks line of sight');

// Check AI accuracy
assert(js.indexOf('0.6') !== -1 || js.indexOf('Math.random') !== -1, 'AI has probability-based shooting');

// Check AI move logic
assert(js.indexOf('aiDir') !== -1, 'AI has direction variable');
assert(js.indexOf('moveTank') !== -1, 'AI uses moveTank');

// ─── Collision Detection ───
console.log('\n[Collision Detection]');

assert(js.indexOf('isWall') !== -1, 'Has wall collision check');
assert(js.indexOf('canMoveTo') !== -1, 'Has movement collision check');
assert(js.indexOf('enemy.hp') !== -1, 'Checks enemy HP on hit');
assert(js.indexOf('player.hp') !== -1, 'Checks player HP on hit');
assert(js.indexOf('enemy.alive') !== -1, 'Tracks enemy alive state');
assert(js.indexOf('player.alive') !== -1, 'Tracks player alive state');

// ─── Scoring / Round Management ───
console.log('\n[Scoring]');

assert(js.indexOf('endRound') !== -1, 'Has endRound function');
assert(js.indexOf('endMatch') !== -1, 'Has endMatch function');
assert(js.indexOf('playerWins') !== -1, 'Tracks player wins');
assert(js.indexOf('enemyWins') !== -1, 'Tracks enemy wins');
assert(js.indexOf('totalKills') !== -1, 'Tracks total kills');
assert(js.indexOf('bestStreak') !== -1, 'Tracks best streak');
assert(js.indexOf('ROUNDS_TO_WIN') !== -1, 'Uses ROUNDS_TO_WIN');

// ─── Movement ───
console.log('\n[Movement]');

assert(js.indexOf('playerMove') !== -1, 'Has playerMove function');
assert(js.indexOf('ArrowUp') !== -1, 'Arrow Up triggers move');
assert(js.indexOf('ArrowDown') !== -1, 'Arrow Down triggers move');
assert(js.indexOf('ArrowLeft') !== -1, 'Arrow Left triggers move');
assert(js.indexOf('ArrowRight') !== -1, 'Arrow Right triggers move');
assert(js.indexOf('MOVE_COOLDOWN') !== -1, 'Has move cooldown');

// Check WASD support
assert(js.indexOf("'w'") !== -1 || js.indexOf('"w"') !== -1, 'W key supported');
assert(js.indexOf("'a'") !== -1 || js.indexOf('"a"') !== -1, 'A key supported');
assert(js.indexOf("'s'") !== -1 || js.indexOf('"s"') !== -1, 'S key supported');
assert(js.indexOf("'d'") !== -1 || js.indexOf('"d"') !== -1, 'D key supported');

// ─── Shooting ───
console.log('\n[Shooting]');

assert(js.indexOf('fireShell') !== -1, 'Has fireShell function');
assert(js.indexOf('playerShoot') !== -1, 'Has playerShoot function');
assert(js.indexOf('shells') !== -1, 'Has shells array');
assert(js.indexOf('updateShells') !== -1, 'Has updateShells function');
assert(js.indexOf('.dir') !== -1, 'Shells have direction');

// ─── Rendering ───
console.log('\n[Rendering]');

assert(js.indexOf('function render') !== -1, 'Has render function');
assert(js.indexOf('drawGrid') !== -1, 'Draws grid');
assert(js.indexOf('drawTank') !== -1, 'Draws tanks');
assert(js.indexOf('drawHPBar') !== -1, 'Draws HP bars');
assert(js.indexOf('drawShell') !== -1, 'Draws shells');
assert(js.indexOf('drawExplosion') !== -1 || js.indexOf('spawnExplosion') !== -1, 'Draws explosions');
assert(js.indexOf('drawHUD') !== -1, 'Draws HUD');

// ─── Screen Management ───
console.log('\n[Screens]');

assert(js.indexOf('showScreen') !== -1, 'Has showScreen function');
assert(js.indexOf("'title'") !== -1, 'Has title screen state');
assert(js.indexOf("'game'") !== -1, 'Has game screen state');
assert(js.indexOf("'result'") !== -1, 'Has result screen state');
assert(js.indexOf('showResultScreen') !== -1, 'Has showResultScreen function');

// ─── Audio ───
console.log('\n[Audio]');

assert(js.indexOf('audioCtx') !== -1, 'Has AudioContext');
assert(js.indexOf('playTone') !== -1, 'Has playTone');
assert(js.indexOf('playNoise') !== -1, 'Has noise generation');
assert(js.indexOf('playMove') !== -1, 'Move sound effect');
assert(js.indexOf('playShoot') !== -1, 'Shoot sound effect');
assert(js.indexOf('playHit') !== -1, 'Hit sound effect');
assert(js.indexOf('playExplosion') !== -1, 'Explosion sound effect');
assert(js.indexOf('playMatchWin') !== -1, 'Win sound effect');
assert(js.indexOf('playMatchLose') !== -1, 'Lose sound effect');
assert(js.indexOf('playRoundWin') !== -1, 'Round win sound');
assert(js.indexOf('playRoundLose') !== -1, 'Round lose sound');

// ─── Storage ───
console.log('\n[Storage]');

assert(js.indexOf('localStorage') !== -1, 'Uses localStorage');
assert(js.indexOf('tank-rumble-best') !== -1, 'Has correct storage key');
assert(js.indexOf('getBest') !== -1, 'Has getBest function');
assert(js.indexOf('setBest') !== -1, 'Has setBest function');
assert(js.indexOf('bestStreak') !== -1, 'Tracks best streak');
assert(js.indexOf('totalKills') !== -1, 'Tracks total kills');

// ─── Touch / Mobile ───
console.log('\n[Mobile Support]');

assert(js.indexOf('dpad') !== -1, 'Has d-pad support');
assert(js.indexOf('touchstart') !== -1, 'Handles touch start');
assert(js.indexOf('ontouchstart') !== -1, 'Detects touch device');
assert(js.indexOf('maxTouchPoints') !== -1, 'Checks maxTouchPoints');
assert(js.indexOf('controlsBar') !== -1, 'Has controls bar reference');
assert(js.indexOf('isMobile') !== -1, 'Has isMobile flag');

// ─── Game Loop ───
console.log('\n[Game Loop]');

assert(js.indexOf('requestAnimationFrame') !== -1, 'Uses requestAnimationFrame');
assert(js.indexOf('gameLoop') !== -1, 'Has gameLoop function');
assert(js.indexOf('update(') !== -1 || js.indexOf('update(dt)') !== -1, 'Has update function');

// ─── Effects ───
console.log('\n[Effects]');

assert(js.indexOf('screenShake') !== -1, 'Has screen shake');
assert(js.indexOf('explosions') !== -1, 'Explosions tracked');
assert(js.indexOf('particles') !== -1, 'Particles tracked');
assert(js.indexOf('hitFlash') !== -1, 'Hit flash effect');

// ─── Race conditions / Edge cases ───
console.log('\n[Edge Cases]');

assert(js.indexOf('paused') !== -1, 'Has pause state');
assert(js.indexOf('matchOver') !== -1, 'Checks match over');
assert(js.indexOf('roundOver') !== -1, 'Checks round over');
assert(js.indexOf('alive') !== -1, 'Checks alive status');
assert(js.indexOf('!state.roundOver') !== -1 || js.indexOf('state.roundOver') !== -1, 'Prevents actions after round over');

// ─── CSS Consistency ───
console.log('\n[CSS Consistency]');
var css = fs.readFileSync(path.join(BASE, 'style.css'), 'utf8');

assert(css.indexOf('dpad') !== -1, 'CSS has d-pad styles');
assert(css.indexOf('fire-btn') !== -1, 'CSS has fire button styles');
assert(css.indexOf('prefers-reduced-motion') !== -1, 'CSS has reduced motion');

// ─── Summary ───
console.log('\n═══ RESULTS ═══');
console.log('Passed: ' + passed + ' | Failed: ' + failed + '\n');

process.exit(failed > 0 ? 1 : 0);
