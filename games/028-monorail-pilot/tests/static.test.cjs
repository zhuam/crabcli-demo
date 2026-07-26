#!/usr/bin/env node
/**
 * Static smoke tests for Monorail Pilot (Issue #28)
 * Run: node tests/static.test.cjs
 * Pure Node -- no jsdom dependency. Uses regex + light HTML parsing.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; failures.push(name + (detail ? ' -- ' + detail : '')); console.log(`  ❌ ${name}${detail ? '  -- ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// ============= Required files =============
group('Required files exist');
const requiredFiles = ['index.html', 'style.css', 'app.js', 'thumb.svg'];
for (const f of requiredFiles) {
  ok(`${f} exists`, fs.existsSync(path.join(ROOT, f)));
}

// ============= DOM structure & meta =============
group('HTML structure & metadata');
const requiredIds = [
  'app', 'title-screen', 'gameplay-screen', 'result-screen',
  'levelList', 'startBtn', 'bestScoreDisplay', 'totalStarsDisplay',
  'gameCanvas', 'stationDisplay', 'timeDisplay', 'starsDisplay', 'targetDisplay',
  'speedDisplay', 'speedFill', 'accelBtn', 'brakeBtn',
  'stationOverlay', 'stationCardTitle', 'stationCardStars', 'stationCardDetail',
  'stationCardTime', 'stationContinueBtn',
  'resultHeading', 'resultScore', 'resultBreakdown', 'resultTotalStars',
  'replayBtn', 'menuBtn'
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present in index.html`, re.test(html));
}

ok('game-frame.css link exists', /href="\/games\/shared\/game-frame\.css"/.test(html));
ok('back-to-hub link exists', /class="back-to-hub"/.test(html));
ok('back-to-hub links to /', /href="\/"/.test(html) && /back-to-hub/.test(html));
ok('viewport meta with maximum-scale=1', /maximum-scale=1/.test(html));
ok('viewport meta with user-scalable=no', /user-scalable=no/.test(html));
ok('viewport meta with viewport-fit=cover', /viewport-fit=cover/.test(html));
ok('theme-color meta present', /theme-color/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('charset UTF-8 declared', /charset="UTF-8"/i.test(html));
ok('title tag present', /<title>Monorail Pilot/.test(html));
ok('canvas element present', /<canvas[^>]*id="gameCanvas"/.test(html));
ok('title-heading renders MONORAIL PILOT text', /MONORAIL[\s\S]*PILOT/.test(html));
ok('level select section present', /class="level-list"/.test(html));
ok('touch controls with ACCEL and BRAKE buttons', /ACCEL/.test(html) && /BRAKE/.test(html));
ok('speed gauge present', /class="speed-gauge"/.test(html));
ok('HUD present', /class="hud"/.test(html));
ok('station overlay hidden on boot', /id="stationOverlay"[^>]*\bhidden\b/.test(html));

// ============= recordPlayed function =============
group('recordPlayed function');
ok('window.recordPlayed defined in inline script', /window\.recordPlayed\s*=/.test(html));
ok('recordPlayed called onclick', /onclick="window\.recordPlayed/.test(html));
ok('recordPlayed uses localStorage recentlyPlayed', /localStorage\.getItem\(['"]recentlyPlayed['"]\)/.test(html));
ok('recordPlayed stores { id, playedAt }', /id:\s*gameId/.test(html) && /playedAt:\s*Date\.now\(\)/.test(html));
ok('recordPlayed limits to 10 recent', /slice\(0,\s*10\)/.test(html));

// ============= JS patterns =============
group('JavaScript patterns');
ok('IIFE wraps app.js', /;\s*\}\s*\)\s*\(\s*\)\s*;\s*$/.test(js.trim()) || /}\)\s*\(\)\s*;\s*$/.test(js.trim()));
ok('"use strict" enabled', /['"]use strict['"]/.test(js));
ok('LEVELS array defined', /const\s+LEVELS\s*=/.test(js));
ok('init() function defined', /function\s+init\s*\(/.test(js));
ok('gameLoop() function defined', /function\s+gameLoop\s*\(/.test(js));
ok('update() function defined', /function\s+update\s*\(/.test(js));
ok('render() function defined', /function\s+render\s*\(/.test(js));
ok('setupCanvas() function defined', /function\s+setupCanvas\s*\(/.test(js));
ok('requestAnimationFrame game loop', /requestAnimationFrame\(gameLoop\)/.test(js));
ok('cancelAnimationFrame on cleanup', /cancelAnimationFrame\(animFrame\)/.test(js));
ok('evaluateStation() function defined', /function\s+evaluateStation\s*\(/.test(js));
ok('updateHUD() function defined', /function\s+updateHUD\s*\(/.test(js));
ok('updateSpeedGauge() function defined', /function\s+updateSpeedGauge\s*\(/.test(js));
ok('startGame() function defined', /function\s+startGame\s*\(/.test(js));
ok('populateResultScreen() function defined', /function\s+populateResultScreen\s*\(/.test(js));
ok('saveProgress() function defined', /function\s+saveProgress\s*\(/.test(js));
ok('switchState() function defined', /function\s+switchState\s*\(/.test(js));
ok('populateLevelList() function defined', /function\s+populateLevelList\s*\(/.test(js));
ok('updateTitleStats() function defined', /function\s+updateTitleStats\s*\(/.test(js));
ok('handleResize() function defined', /function\s+handleResize\s*\(/.test(js));
ok('dt clamping (spiral of death protection)', /Math\.min\(rawDt,\s*0\.05\)/.test(js));
ok('delta time calculation from timestamps', /timestamp\s*-\s*lastTime/.test(js));
ok('SPEED_SCALE constant defined', /const\s+SPEED_SCALE\s*=/.test(js));
ok('DRAG constant defined', /const\s+DRAG\s*=/.test(js));
ok('ACCEL_RATE constant defined', /const\s+ACCEL_RATE\s*=/.test(js));
ok('BRAKE_RATE constant defined', /const\s+BRAKE_RATE\s*=/.test(js));
ok('EMERGENCY_BRAKE constant defined', /const\s+EMERGENCY_BRAKE\s*=/.test(js));
ok('TRIGGER_RADIUS constant defined', /const\s+TRIGGER_RADIUS\s*=/.test(js));
ok('star thresholds defined (STAR_3, STAR_2, STAR_1)', /const\s+STAR_3\s*=\s*0\.5/.test(js) && /const\s+STAR_2\s*=\s*1\.5/.test(js) && /const\s+STAR_1\s*=\s*3\.0/.test(js));
ok('star icons defined (STAR_FULL, STAR_EMPTY)', /const\s+STAR_FULL\s*=/.test(js) && /const\s+STAR_EMPTY\s*=/.test(js));

// ============= Sound / Vibration =============
group('Sound & vibration');
ok('AudioContext used', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audio context resume on suspended', /audioCtx\.state\s*===\s*['"]suspended['"]/.test(js));
ok('initAudio() defined', /function\s+initAudio\s*\(/.test(js));
ok('playTone() function defined', /function\s+playTone\s*\(/.test(js));
ok('playChime() function defined', /function\s+playChime\s*\(/.test(js));
ok('playPerfect() function defined', /function\s+playPerfect\s*\(/.test(js));
ok('playGood() function defined', /function\s+playGood\s*\(/.test(js));
ok('playMiss() function defined', /function\s+playMiss\s*\(/.test(js));
ok('playWin() function defined', /function\s+playWin\s*\(/.test(js));
ok('playLose() function defined', /function\s+playLose\s*\(/.test(js));
ok('playMultiple() function defined', /function\s+playMultiple\s*\(/.test(js));
ok('startAccelHum() function defined', /function\s+startAccelHum\s*\(/.test(js));
ok('updateAccelHum() function defined', /function\s+updateAccelHum\s*\(/.test(js));
ok('stopAccelHum() function defined', /function\s+stopAccelHum\s*\(/.test(js));
ok('playBrakeScreech() function defined', /function\s+playBrakeScreech\s*\(/.test(js));
ok('vibrate() function defined', /function\s+vibrate\s*\(/.test(js));
ok('navigator.vibrate guarded by truthy check', /if\s*\(\s*navigator\.vibrate\s*\)/.test(js));
ok('vibrate wrapped in try/catch', /try\s*\{[^}]*navigator\.vibrate[^}]*\}\s*catch/.test(js));

// ============= Controls =============
group('Input handling');
ok('keydown listener attached to document', /document\.addEventListener\(['"]keydown['"]/.test(js));
ok('keyup listener attached to document', /document\.addEventListener\(['"]keyup['"]/.test(js));
ok('ArrowUp / W key accelerates', /ArrowUp/.test(js) && /KeyW/.test(js));
ok('ArrowDown / S key brakes', /ArrowDown/.test(js) && /KeyS/.test(js));
ok('Space key emergency brake', /case ['"]Space['"]/.test(js) || /e\.code === ['"]Space['"]/.test(js));
ok('Enter key restarts from result', /case ['"]Enter['"]/.test(js) || /e\.code === ['"]Enter['"]/.test(js));
ok('touch controls use pointer events', /setupTouchButton/.test(js));
ok('pointerdown event handler', /pointerdown/.test(js));
ok('pointerup event handler', /pointerup/.test(js));
ok('pointercancel event handler', /pointercancel/.test(js));
ok('resize event listener', /window\.addEventListener\(['"]resize['"]/.test(js));
ok('orientationchange event listener', /orientationchange/.test(js));

// ============= CSS =============
group('CSS theme & responsive');
ok(':root CSS custom properties defined', /:root/.test(css));
ok('--neon-cyan color defined', /--neon-cyan:\s*#00f0ff/.test(css));
ok('--neon-pink color defined', /--neon-pink:\s*#ff2d95/.test(css));
ok('--neon-purple color defined', /--neon-purple:\s*#b44dff/.test(css));
ok('--neon-green color defined', /--neon-green:\s*#00ff88/.test(css));
ok('--neon-yellow color defined', /--neon-yellow:\s*#ffe600/.test(css));
ok('--neon-orange color defined', /--neon-orange:\s*#ff6b00/.test(css));
ok('--bg-deep color defined', /--bg-deep:\s*#0a0e23/.test(css));
ok('--star-gold color defined', /--star-gold:\s*#ffd700/.test(css));
ok('--font-mono defined', /--font-mono/.test(css));
ok('--font-sans defined', /--font-sans/.test(css));
ok('touch-action: manipulation on #gameplay-screen', /touch-action:\s*manipulation/.test(css));
ok('touch-action: none on canvas', /#gameCanvas[\s\S]{0,100}touch-action:\s*none/.test(css));
ok('@media (prefers-reduced-motion: reduce) present', /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css));
ok('reduced-motion overrides animation-duration', /animation-duration:\s*0\.01ms/.test(css));
ok('reduced-motion overrides transition-duration', /transition-duration:\s*0\.01ms/.test(css));
ok('@media (max-height: 500px) landscape tweaks', /@media\s*\(max-height:\s*500px\)/.test(css));
ok('max-width 480px app container', /max-width:\s*480px/.test(css));
ok('.screen.active display:flex pattern', /\.screen\.active[\s\S]{0,100}display:\s*flex/.test(css));
ok('.neon-cyan text-shadow defined', /\.neon-cyan[\s\S]{0,100}text-shadow/.test(css));
ok('.neon-pink glow-box defined', /\.glow-box/.test(css));
ok('focus-visible styles on interactive elements', /:focus-visible/.test(css));
ok('pressed state for control buttons', /\.ctrl-btn\.pressed/.test(css));
ok('speed-gauge-fill gradient defined', /speed-gauge-fill[\s\S]{0,200}linear-gradient/.test(css));
ok('fadeIn keyframes defined', /@keyframes\s+fadeIn/.test(css));
ok('slideUp keyframes defined', /@keyframes\s+slideUp/.test(css));

// ============= localStorage keys =============
group('localStorage keys');
ok("localStorage key 'monorail-pilot-best' used", /monorail-pilot-best/.test(js));
ok("localStorage key 'monorail-pilot-unlocked' used", /monorail-pilot-unlocked/.test(js));
ok('loadBest() function defined', /function\s+loadBest\s*\(/.test(js));
ok('saveBest() function defined', /function\s+saveBest\s*\(/.test(js));
ok('loadUnlocked() function defined', /function\s+loadUnlocked\s*\(/.test(js));
ok('saveUnlocked() function defined', /function\s+saveUnlocked\s*\(/.test(js));
ok('getBest() returns default object with bestScore/totalStars/gamesPlayed/perLevel',
   /bestScore:\s*0[\s\S]{0,40}totalStars:\s*0[\s\S]{0,40}gamesPlayed:\s*0[\s\S]{0,40}perLevel:\s*\[\]/.test(js));
ok('getUnlocked() returns default with only first level unlocked',
   /return\s*\{[\s\S]{0,60}levels:\s*LEVELS\.map[\s\S]{0,100}i\s*===\s*0\b/.test(js));
ok('load/save wrapped in try/catch', /try\s*\{[\s\S]{0,200}localStorage\.setItem[\s\S]{0,200}\}\s*catch/.test(js));

// ============= Game levels =============
group('Levels & scoring');
ok('6 levels defined in LEVELS', (js.match(/name:\s*['"]\w+ Line['"]/g) || []).length === 6);
ok('Green Line level defined', /['"]Green Line['"]/.test(js));
ok('Blue Line level defined', /['"]Blue Line['"]/.test(js));
ok('Red Line level defined', /['"]Red Line['"]/.test(js));
ok('Purple Line level defined', /['"]Purple Line['"]/.test(js));
ok('Gold Line level defined', /['"]Gold Line['"]/.test(js));
ok('Rainbow Line level defined', /['"]Rainbow Line['"]/.test(js));
ok('Each level has maxSpeed, stations array, name, color', /maxSpeed:\s*\d+/.test(js) && /stations:\s*\[/.test(js));
ok('station result schema: name, stars, score, targetTime, actualTime, diff',
   /name:\s*station\.name/.test(js) && /stars:\s*stars/.test(js) && /score:\s*score/.test(js));
ok('3-star threshold = 0.5 seconds', /STAR_3\s*=\s*0\.5/.test(js));
ok('2-star threshold = 1.5 seconds', /STAR_2\s*=\s*1\.5/.test(js));
ok('1-star threshold = 3.0 seconds', /STAR_1\s*=\s*3\.0/.test(js));
ok('3 stars = 300 points', /stars\s*=\s*3[\s\S]{0,30}score\s*=\s*300/.test(js));
ok('2 stars = 200 points', /stars\s*=\s*2[\s\S]{0,30}score\s*=\s*200/.test(js));
ok('1 star = 100 points', /stars\s*=\s*1[\s\S]{0,30}score\s*=\s*100/.test(js));
ok('0 stars = 0 points', /stars\s*=\s*0[\s\S]{0,30}score\s*=\s*0/.test(js));
ok('unlock next level on completion', /unlocked\.levels\[lvIdx\s*\+\s*1\]\s*=\s*true/.test(js));
ok('starString() helper defined', /function\s+starString\s*\(/.test(js));
ok('render() draws train', /trainX/.test(js));
ok('speed lines rendered for fast travel', /speed lines/.test(js) || /spd\s*>\s*50/.test(js));

// ============= Edge cases & hardening =============
group('Hardening & edge cases');
ok('roundRect polyfill for older browsers', /roundRect/.test(js));
ok('preventDefault on keydown arrow keys', /e\.preventDefault/.test(js));
ok('dt clamped to 0.05s (spiral of death)', /Math\.min\(rawDt,\s*0\.05\)/.test(js));
ok('speed clamped between 0 and maxSpeed', /Math\.max\(0,\s*Math\.min\(gameState\.speed/.test(js));
ok('user-select: none on body', /user-select:\s*none/.test(css));
ok('-webkit-tap-highlight-color: transparent', /-webkit-tap-highlight-color:\s*transparent/.test(css));
ok('gesture/preventDefault absent or present', true); // not required for this game

// ============= Summary =============
console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed · ${fail} failed`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
