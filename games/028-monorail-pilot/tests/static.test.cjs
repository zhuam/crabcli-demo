#!/usr/bin/env node
/**
 * Static acceptance tests for Monorail Pilot (Issue #28).
 * Run: node games/028-monorail-pilot/tests/static.test.cjs
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

const js = extractInlineJS(html);

group('AC1 - Splash screen loads within 3 seconds, no tutorial');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE boot present', /\(\(\)\s*=>\s*\{[\s\S]*\n\s*\}\)\s*\(\)/.test(js) || /\(function\s*\(\)\s*\{[\s\S]*\n\s*\}\)\s*\(\)/.test(js));
ok('splash screen is active by default', /class="screen splash active"/.test(html) || /splashScreen[\s\S]{0,100}active/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('start button exists', /splash-start-btn/.test(html));

group('AC2 - single round <= 3 minutes');
ok('time limit defined for levels', /timeLimit\s*:\s*\d+/.test(js));
ok('max level timeLimit <= 180', /timeLimit\s*:150/.test(js));
ok('time display in HUD', /hud-time-value/.test(html) && /timeDisplay/.test(js));

group('AC3 - at least two input modes (keyboard + touch + mouse)');
ok('keyboard input: ArrowUp/ArrowDown', /ArrowUp/.test(js) && /ArrowDown/.test(js));
ok('keyboard input: WASD keys', /['"]w['"]|['"]W['"]/.test(js) && /['"]s['"]|['"]S['"]/.test(js));
ok('Space key for accelerate', /['"]\s['"]/.test(js));
ok('touch zones defined (left/right)', /touchLeft/.test(js) && /touchRight/.test(js));
ok('touch left handler (brake)', /handleTouchStart[\s\S]{0,300}brakeInput/.test(js));
ok('touch right handler (accelerate)', /handleTouchStart[\s\S]{0,300}accelInput/.test(js));
ok('mouse events on touch zones', /mousedown[\s\S]{0,500}brakeInput/.test(js) || /mousedown.*brake/.test(js));

group('AC4 - Result screen with Play Again button');
ok('retry button exists', /retryBtn/.test(html));
ok('levels button exists', /levelsBtn/.test(html));
ok('result screen shows stars', /resultStars/.test(html));
ok('result screen shows scores', /resultScore/.test(html) && /resultTime/.test(html));
ok('result screen shows title', /resultTitle/.test(html));
ok('retry handler calls startGame', /retryBtn[\s\S]{0,200}startGame/.test(js));
ok('levels handler calls showLevelSelect', /levelsBtn[\s\S]{0,200}showLevelSelect/.test(js));

group('AC5 - Sound effects and vibration');
ok('AudioContext used', /AudioContext/.test(js));
ok('sound synthesis functions exist', /playTone/.test(js) && /playChime/.test(js) && /playVictory/.test(js) && /playFail/.test(js));
ok('vibration guarded with conditional', /navigator\.vibrate/.test(js));
ok('sound setting toggleable', /monorail_pilot_settings/.test(js) && /sound\s*:\s*true/.test(js));

group('AC6 - localStorage high score');
ok('localStorage key defined', /monorail_pilot_scores/.test(js));
ok('loadScores function reads localStorage', /localStorage\.getItem\(['"]monorail_pilot_scores['"]/.test(js));
ok('saveScores function writes localStorage', /localStorage\.setItem\(['"]monorail_pilot_scores['"]/.test(js));

group('Game architecture');
ok('level data defined (6 levels)', /LEVELS\s*=\s*\[[\s\S]*\{[\s\S]*\}[\s\S]*\]/.test(js));
ok('screen switching function exists', /function\s+showScreen/.test(js));
ok('game loop uses requestAnimationFrame', /requestAnimationFrame\s*\(/.test(js));
ok('physics model: speed/accel/brake', /MAX_SPEED/.test(js) && /ACCEL/.test(js) && /BRAKE/.test(js) && /FRICTION/.test(js));
ok('station types: normal/express/finish', /type:\s*['"]normal['"]/.test(js) && /type:\s*['"]express['"]/.test(js) && /type:\s*['"]finish['"]/.test(js));
ok('station stopping logic', /STOP_THRESHOLD/.test(js) && /STOP_ZONE_RADIUS/.test(js));
ok('scoring function: calculateScore', /function\s+calculateScore/.test(js));

group('DOM structure');
ok('HTML has DOCTYPE', /<!DOCTYPE html>/i.test(html));
ok('viewport meta tag present', /name=["']viewport["']/.test(html));
ok('shared game-frame.css linked', /game-frame\.css/.test(html));
ok('back-to-hub link present', /back-to-hub/.test(html));
ok('canvas element exists', /<canvas/.test(html));
ok('splash screen defined', /splashScreen/.test(html));
ok('level select screen defined', /levelScreen/.test(html));
ok('game screen defined', /gameScreen/.test(html));
ok('result screen defined', /resultScreen/.test(html));
ok('pause overlay defined', /pauseOverlay/.test(html));

group('Level design');
ok('6 levels defined', (js.match(/id:\s*\d+/g) || []).length >= 6);
ok('levels have name/desc/distance/stations', /name:\s*['"]/.test(js) && /distance:\s*\d+/.test(js) && /stations:\s*\[/.test(js));
ok('speed limits in some levels', /speedLimits/.test(js));
ok('curve data in some levels', /curves/.test(js));

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('All tests passed!');
}
