#!/usr/bin/env node
/**
 * Static acceptance tests for Slime Ascent (Issue #46).
 * Run: node games/046-slime-ascent/tests/static.test.cjs
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

group('AC1 - Splash screen loads, no tutorial overlay');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE boot present', /\(function\s*\(\)\s*\{[\s\S]*\n\s*\}\)\s*\(\)/.test(js));
ok('screen-splash is active by default', /id="screen-splash"\s*class="screen active"/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('loadBest() called on init', /loadBest\(\)/.test(js));

group('AC2 - Round duration ≤ 3 min (platform skill-based)');
ok('gravity constant defined', /GRAVITY\s*=\s*0\.55/.test(js));
ok('jump velocity defined', /JUMP_VEL\s*=\s*-11/.test(js));
ok('max horizontal speed capped', /MAX_VX\s*=\s*5\.5/.test(js));
ok('slime alive: true in default state', /alive:\s*true/.test(js));
ok('slime alive = false on death/inactive', /alive\s*=\s*false/.test(js));
ok('death check exists (y > camera + H + 100)', /p\.y\s*>\s*s\.camera\.y\s*\+\s*H\s*\+\s*100/.test(js));
ok('win height threshold defined (5000px)', /WIN_HEIGHT\s*=\s*5000/.test(js));

group('AC3 - At least 2 input modes (keyboard + touch + mouse)');
ok('keydown listener with Space/Arrow handling', /keydown[\s\S]{0,500}Space[\s\S]{0,100}handleJump/.test(js));
ok('keyup listener exists', /keyup[\s\S]{0,200}keys\[/.test(js));
ok('touchstart listener on canvas', /canvas\.addEventListener\(['"]touchstart['"]/.test(js));
ok('touch handler calls handleJump', /touchActive\s*=\s*true[\s\S]{0,30}handleJump/.test(js));
ok('touchmove listener on canvas', /canvas\.addEventListener\(['"]touchmove['"]/.test(js));
ok('touchend listener on canvas', /canvas\.addEventListener\(['"]touchend['"]/.test(js));
ok('mousedown listener on canvas triggers jump', /mousedown[\s\S]{0,100}handleJump/.test(js));
ok('click on play button starts game', /btn-play['"]\)\.addEventListener\(['"]click['"],\s*startGame/.test(js));

group('AC4 - Result screen with Rematch button');
ok('screen-gameover exists with rematch button', /id="btn-rematch"/.test(html));
ok('screen-win exists with replay button', /id="btn-replay"/.test(html));
ok('gameOver() function exists', /function\s+gameOver\s*\(\)/.test(js));
ok('winGame() function exists', /function\s+winGame\s*\(\)/.test(js));
ok('goToMenu() function exists', /function\s+goToMenu\s*\(\)/.test(js));
ok('rematch button calls startGame', /btn-rematch['"]\)\.addEventListener\(['"]click['"],\s*startGame/.test(js));
ok('replay button calls startGame', /btn-replay['"]\)\.addEventListener\(['"]click['"],\s*startGame/.test(js));
ok('MENU buttons call goToMenu', /btn-menu['"]\)\.addEventListener\(['"]click['"],\s*goToMenu/.test(js) && /btn-menu2['"]\)\.addEventListener\(['"]click['"],\s*goToMenu/.test(js));

group('AC5 - Sound effects and vibration');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('SFX functions defined (jump, stick, bounce, win, lose, crumble)',
  /sfxJump\s*\(/.test(js) && /sfxStick\s*\(/.test(js) && /sfxBounce\s*\(/.test(js) &&
  /sfxWin\s*\(/.test(js) && /sfxLose\s*\(/.test(js) && /sfxCrumb\s*\(/.test(js));
ok('playTone helper exists for audio synthesis', /function\s+playTone\s*\(/.test(js));
ok('vibration guarded with try/catch', /try\s*\{[\s\S]{0,30}navigator\.vibrate/.test(js));

group('AC6 - localStorage high score');
ok('localStorage key is slime-ascent-best', /slime-ascent-best/.test(js));
ok('saveBest() defined', /function\s+saveBest\s*\(/.test(js));
ok('loadBest() defined', /function\s+loadBest\s*\(/.test(js));
ok('saveBest writes to localStorage', /localStorage\.setItem\(['"]slime-ascent-best['"]/.test(js));
ok('loadBest reads with parseInt', /parseInt\(localStorage\.getItem\(['"]slime-ascent-best['"]/.test(js));
ok('splash screen shows best score', /splash-best/.test(html));
ok('game over screen shows best score', /go-best/.test(html));
ok('win screen shows best score', /win-best/.test(html));

group('Game mechanics - Slime physics');
ok('gravity applied in updatePlayer', /p\.vy\s*\+=\s*GRAVITY/.test(js));
ok('horizontal input via Arrow keys', /keys\[['"]ArrowLeft['"\]][\s\S]{0,50}hInput\s*=\s*-1/.test(js));
ok('wall sticking with timer', /WALL_STICK_MS/.test(js) && /p\.isStuck\s*=\s*true/.test(js));
ok('wall jump mechanics exist', /WALL_JUMP_H/.test(js) && /WALL_JUMP_V/.test(js));
ok('terminal velocity cap at 15', /p\.vy\s*>\s*15\s*\)\s*p\.vy\s*=\s*15/.test(js));
ok('air control and friction constants', /AIR_CONTROL\s*=\s*0\.35/.test(js) && /AIR_FRICTION\s*=\s*0\.95/.test(js));
ok('squash and stretch rendering', /sqFactor/.test(js) && /stFactor/.test(js));

group('Game mechanics - Platform types');
ok('normal platform type defined', /type:\s*['"]normal['"]/.test(js));
ok('moving platform type referenced', /===?\s*['"]moving['"]/.test(js));
ok('crumble platform type referenced', /===?\s*['"]crumble['"]/.test(js));
ok('bouncy platform type referenced', /===?\s*['"]bouncy['"]/.test(js));
ok('platform colors map defined', /PLATFORM_COLORS/.test(js));
ok('moving platform sinusoidal movement', /Math\.sin[\s\S]{0,100}moveRange/.test(js));
ok('crumble platform break logic exists', /plat\.broken\s*=\s*true/.test(js));
ok('bouncy platform bounce multiplier', /BOUNCE_MULT/.test(js));

group('Game mechanics - Collision detection');
ok('wall bounds collision (left wall)', /p\.x\s*\+\s*dx\s*-\s*p\.r\s*<\s*0/.test(js));
ok('wall bounds collision (right wall)', /p\.x\s*\+\s*dx\s*\+\s*p\.r\s*>\s*W/.test(js));
ok('platform collision detection with feet overlap check', /feetY\s*>=\s*pTop\s*&&\s*feetY\s*<=\s*pBot\s*\+\s*10/.test(js));
ok('particle system for visual feedback', /addParticles\(/.test(js));

group('Game flow - screens and state management');
ok('showScreen function exists', /function\s+showScreen\s*\(/.test(js));
ok('startGame function exists', /function\s+startGame\s*\(/.test(js));
ok('getDefaultState returns complete state object', /function\s+getDefaultState/.test(js));
ok('state includes player, camera, platforms, particles', /player:\s*\{[\s\S]{0,200}camera:\s*\{[\s\S]{0,200}platforms:\s*\[[\s\S]{0,200}particles:\s*\[/.test(js));
ok('game loop with requestAnimationFrame', /requestAnimationFrame\(gameLoop\.tick\)/.test(js));
ok('canvas resize function', /function\s+resize\s*\(/.test(js));
ok('window resize listener to clamp player', /window\.addEventListener\(['"]resize['"]/.test(js));

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'slime-ascent');
ok('registry contains slime-ascent', !!entry);
ok('registry path points at 046 directory', entry && entry.path === '/games/046-slime-ascent/');
ok('registry category is platformer', entry && entry.category === 'platformer');
ok('registry tags include slime', entry && entry.tags.includes('slime'));
ok('registry tags include wall-jump', entry && entry.tags.includes('wall-jump'));
ok('registry tags include neon', entry && entry.tags.includes('neon'));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
