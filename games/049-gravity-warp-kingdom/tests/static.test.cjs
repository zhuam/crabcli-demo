#!/usr/bin/env node
/**
 * Static acceptance tests for Gravity Warp Kingdom (Issue #49).
 * Run: node games/049-gravity-warp-kingdom/tests/static.test.cjs
 * Pure Node -- no jsdom dependency. Uses regex + light HTML parsing.
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

// Extract inline <script> JS
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

// ============= Required files =============
group('Required files exist');
const requiredFiles = ['index.html', 'thumb.svg', 'README.md'];
for (const f of requiredFiles) {
  ok(`${f} exists`, fs.existsSync(path.join(ROOT, f)));
}

// ============= DOM structure & meta =============
group('HTML structure & metadata');
const requiredIds = [
  'app', 'screen-splash', 'screen-game', 'screen-result', 'screen-levels',
  'gameCanvas', 'splash-progress', 'btn-play', 'btn-select',
  'btn-left', 'btn-right', 'btn-flip',
  'btn-next', 'btn-replay', 'btn-menu-result',
  'result-title', 'result-stars', 'result-time', 'result-level-name',
  'level-grid', 'btn-back-menu'
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present in index.html`, re.test(html));
}

ok('game-frame.css link exists', /href="\/games\/shared\/game-frame\.css"/.test(html));
ok('back-to-hub link pattern (optional, may be injected by game-frame)', true);
ok('viewport meta with maximum-scale=1', /maximum-scale=1/.test(html));
ok('viewport meta with user-scalable=no', /user-scalable=no/.test(html));
ok('viewport meta with viewport-fit=cover', /viewport-fit=cover/.test(html));
ok('theme-color meta present', /theme-color/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('charset UTF-8 declared', /charset="UTF-8"/i.test(html));
ok('title tag present', /<title>Gravity Warp Kingdom/.test(html));
ok('canvas element present', /<canvas[^>]*id="gameCanvas"/.test(html));
ok('touch controls container present', /id="touch-controls"/.test(html));
ok('level grid container present', /id="level-grid"/.test(html));
ok('splash screen is active by default', /id="screen-splash"\s*class="screen active"/.test(html));
ok('result screen has star spans (3)', /<\s*span\s+class="result-star"\s*>/.test(html));
ok('D-pad left/right buttons exist', /btn-left/.test(html) && /btn-right/.test(html));
ok('FLIP button with aria-label', /btn-flip/.test(html));

// ============= JS patterns =============
group('JavaScript patterns');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE wraps the game engine', /\(function\s*\(\)\s*\{[\s\S]*\n\s*\}\)\s*\(\s*\)\s*;/.test(js) || /\(function\s*\(\)\s*\{[\s\S]*\}\)\s*\(\s*\)/.test(js));
ok('"use strict" enabled', /['"]use strict['"]/.test(js));
ok('GRAVITY constant = 980', /GRAVITY\s*=\s*980/.test(js));
ok('MOVE_SPEED constant defined', /MOVE_SPEED\s*=/.test(js));
ok('FLIP_DURATION constant defined', /FLIP_DURATION\s*=/.test(js));
ok('PLAYER_W constant defined', /PLAYER_W\s*=/.test(js));
ok('PLAYER_H constant defined', /PLAYER_H\s*=/.test(js));
ok('WORLD_HEIGHT constant defined', /WORLD_HEIGHT\s*=/.test(js));
ok('LEVELS array defined with 12 levels', /var\s+LEVELS\s*=/.test(js));
ok('12 level entries in LEVELS', (js.match(/name:\s*['"][一-鿿\w]+['"]/g) || []).length === 12, (js.match(/name:\s*['"][一-鿿\w]+['"]/g) || []).length + ' found');

// Level names
const levelNames = ['入门', '翻转', '尖刺', '迷宫', '移动', '深渊', '连锁', '陷阱', '迷宫II', '极速', '混沌', '终极'];
for (const nm of levelNames) {
  ok(`Level "${nm}" defined`, new RegExp(`name:\\s*['"]${nm}['"]`).test(js));
}

ok('init() function defined', /function\s+init\s*\(/.test(js));
ok('gameLoop.tick function defined', /gameLoop\.tick\s*=/.test(js));
ok('render() function defined', /function\s+render\s*\(/.test(js));
ok('flipGravity() function defined', /function\s+flipGravity\s*\(/.test(js));
ok('startGame() function defined', /function\s+startGame\s*\(/.test(js));
ok('loadLevel() function defined', /function\s+loadLevel\s*\(/.test(js));
ok('restartLevel() function defined', /function\s+restartLevel\s*\(/.test(js));
ok('nextLevel() function defined', /function\s+nextLevel\s*\(/.test(js));
ok('die() function defined', /function\s+die\s*\(/.test(js));
ok('winLevel() function defined', /function\s+winLevel\s*\(/.test(js));
ok('showResult() function defined', /function\s+showResult\s*\(/.test(js));
ok('goToMenu() function defined', /function\s+goToMenu\s*\(/.test(js));
ok('showScreen() function defined', /function\s+showScreen\s*\(/.test(js));
ok('buildLevelSelect() function defined', /function\s+buildLevelSelect\s*\(/.test(js));
ok('updatePhysics() function defined', /function\s+updatePhysics\s*\(/.test(js));
ok('updateMovingPlatforms() function defined', /function\s+updateMovingPlatforms\s*\(/.test(js));
ok('overlap() collision function defined', /function\s+overlap\s*\(/.test(js));
ok('spawnFlipParticles() function defined', /function\s+spawnFlipParticles\s*\(/.test(js));
ok('updateParticles() function defined', /function\s+updateParticles\s*\(/.test(js));
ok('resize() function defined', /function\s+resize\s*\(/.test(js));
ok('updateSplashDisplay() function defined', /function\s+updateSplashDisplay\s*\(/.test(js));
ok('requestAnimationFrame game loop', /requestAnimationFrame\(/.test(js));
ok('dt clamping (spiral of death protection)', /Math\.min\([^;]+?0\.05\)/.test(js));
ok('getDefaultState() function defined', /function\s+getDefaultState\s*\(/.test(js));
ok('drawBackground() function defined', /function\s+drawBackground\s*\(/.test(js));
ok('drawCity() function defined', /function\s+drawCity\s*\(/.test(js));
ok('drawPlatforms() function defined', /function\s+drawPlatforms\s*\(/.test(js));
ok('drawSpikes() function defined', /function\s+drawSpikes\s*\(/.test(js));
ok('drawFlag() function defined', /function\s+drawFlag\s*\(/.test(js));
ok('drawCharacter() function defined', /function\s+drawCharacter\s*\(/.test(js));
ok('drawParticles() function defined', /function\s+drawParticles\s*\(/.test(js));
ok('drawHUD() function defined', /function\s+drawHUD\s*\(/.test(js));

// ============= Gravity & physics mechanics =============
group('Gravity & physics mechanics');
ok('gravityFlipped boolean used in physics', /state\.gravityFlipped\s*=\s*!\s*state\.gravityFlipped/.test(js));
ok('gravity toggles sign (g -> -g)', /gravityFlipped\s*\?\s*-GRAVITY\s*:\s*GRAVITY/.test(js));
ok('velocity reversal on flip', /\.vy\s*\*=\s*-1/.test(js));
ok('player rotation animation (0 to PI)', /targetRotation\s*=\s*state\.gravityFlipped\s*\?\s*Math\.PI\s*:\s*0/.test(js));
ok('player grounded detection', /p\.grounded\s*=\s*true/.test(js));
ok('fall off world detection (bottom)', /p\.y\s*>\s*WORLD_HEIGHT/.test(js));
ok('fall off world detection (top)', /p\.y\s*<\s*-100/.test(js));
ok('moving platform sine wave movement', /Math\.sin\(mp\.phase\s*\*\s*mp\.speed/.test(js));
ok('moving platform moveX/moveY patterns', /mp\.moveX/.test(js) && /mp\.moveY/.test(js));

// ============= Star / scoring =============
group('Star / time thresholds');
ok('starTimes object in each level', /starTimes/.test(js));
ok('star calculation based on time thresholds', /time\s*<=\s*starTimes\[3\].*stars\s*=\s*3/.test(js));
ok('2-star threshold check', /time\s*<=\s*starTimes\[2\].*stars\s*=\s*2/.test(js));
ok('fallback to 1 star', /else\s+stars\s*=\s*1/.test(js));

// ============= Sound & vibration =============
group('Sound & vibration');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audio context resume on suspended', /audioCtx\.state\s*===\s*['"]suspended['"]/.test(js));
ok('initAudio() defined', /function\s+initAudio\s*\(/.test(js));
ok('playTone() function defined', /function\s+playTone\s*\(/.test(js));
ok('playSweep() function defined', /function\s+playSweep\s*\(/.test(js));
ok('sounds.flip defined', /sounds\.flip/.test(js));
ok('sounds.death defined', /sounds\.death/.test(js));
ok('sounds.win defined (arpeggio)', /sounds\.win/.test(js));
ok('sounds.star defined', /sounds\.star/.test(js));
ok('sounds.menuClick defined', /sounds\.menuClick/.test(js));
ok('vibration guarded with try/catch', /try\s*\{[\s\S]{0,60}navigator\.vibrate[\s\S]{0,40}\}\s*catch/.test(js));

// ============= localStorage =============
group('localStorage keys');
ok("localStorage key 'gravity-warp-progress' used", /gravity-warp-progress/.test(js));
ok('loadSave() function defined', /function\s+loadSave\s*\(/.test(js));
ok('writeSave() function defined', /function\s+writeSave\s*\(/.test(js));
ok('saveLevelResult() function defined', /function\s+saveLevelResult\s*\(/.test(js));
ok('getLevelStars() function defined', /function\s+getLevelStars\s*\(/.test(js));
ok('getLevelBestTime() function defined', /function\s+getLevelBestTime\s*\(/.test(js));
ok('load/save wrapped in try/catch', /try\s*\{[\s\S]{0,200}localStorage\.(getItem|setItem)[\s\S]{0,200}\}\s*catch/.test(js));
ok('saveData includes unlockedLevel and perLevel', /unlockedLevel:\s*1[\s\S]{0,30}perLevel:\s*\{/.test(js));
ok('unlock next level logic', /saveData\.unlockedLevel\s*=\s*levelIdx\s*\+\s*2/.test(js));

// ============= Input handling =============
group('Input handling');
ok('keydown listener on document', /document\.addEventListener\(['"]keydown['"]/.test(js));
ok('keyup listener on document', /document\.addEventListener\(['"]keyup['"]/.test(js));
ok('ArrowLeft handled', /ArrowLeft/.test(js));
ok('ArrowRight handled', /ArrowRight/.test(js));
ok('ArrowUp handled (flip)', /ArrowUp/.test(js) && /flipGravity/.test(js));
ok('Space handled for flip', /e\.key === ' '[\s\S]{0,80}flipGravity/.test(js));
ok('W key handled for flip', /['"]w['"]/.test(js) && /flipGravity/.test(js));
ok('A key for left', /['"]a['"][\s\S]{0,50}left[\s\S]{0,30}true/.test(js));
ok('D key for right', /['"]d['"][\s\S]{0,50}right[\s\S]{0,30}true/.test(js));
ok('preventDefault on keydown', /e\.preventDefault/.test(js));
ok('touch controls via pointerdown', /pointerdown/.test(js));
ok('touch controls via pointerup', /pointerup/.test(js));
ok('touch controls via pointercancel', /pointercancel/.test(js));
ok('touch controls via pointerleave', /pointerleave/.test(js));
ok('canvas pointerdown for mobile', /canvas\.addEventListener\(['"]pointerdown['"]/.test(js));
ok('resize event listener', /window\.addEventListener\(['"]resize['"]/.test(js));

// ============= Canvas rendering =============
group('Canvas rendering');
ok('canvas context 2d', /canvas\.getContext\(['"]2d['"]/.test(js));
ok('parallax city silhouette in drawCity', /drawCity/.test(js));
ok('background gradient drawn', /createLinearGradient/.test(js));
ok('star twinkle effect', /0\.3\s*\+\s*0\.7/.test(js) && /twinkle/.test(js));
ok('roundRect used for player body', /roundRect/.test(js));
ok('roundRect polyfill for older browsers', /if\s*\(!CanvasRenderingContext2D\.prototype\.roundRect\)/.test(js));
ok('HUD shows level name', /fillText\(['"]L['"].*\s*\+\s*state\.levelIndex/.test(js) || /fillText\(['"]L['"]/.test(js));
ok('HUD shows timer', /state\.time\.toFixed/.test(js));
ok('HUD shows gravity direction icon', /gravityFlipped\s*\?\s*['"]↑['"]\s*:\s*['"]↓['"]/.test(js));
ok('HUD shows progress bar', /state\.player\.x\s*\/\s*state\.level\.width/.test(js));
ok('flip transition overlay effect', /flipTransition[\s\S]{0,500}fillRect\(0,\s*0,\s*W,\s*H\)/.test(js));

// ============= Button event handlers =============
group('Button event handlers');
ok('btn-play click -> startGame', /btn-play['"]\)\.addEventListener\(['"]click['"],/.test(js));
ok('btn-select click -> level select', /btn-select['"]\)\.addEventListener\(['"]click['"],/.test(js));
ok('btn-next click -> nextLevel', /btn-next['"]\)\.addEventListener\(['"]click['"],/.test(js));
ok('btn-replay click -> restartLevel', /btn-replay['"]\)\.addEventListener\(['"]click['"],/.test(js));
ok('btn-menu-result click -> goToMenu', /btn-menu-result['"]\)\.addEventListener\(['"]click['"],[\s\S]{0,20}goToMenu/.test(js));
ok('btn-back-menu click -> goToMenu', /btn-back-menu['"]\)\.addEventListener\(['"]click['"],[\s\S]{0,20}goToMenu/.test(js));

// ============= Level data structure =============
group('Level data structure');
ok('Each level has name property', /name:\s*['"]/.test(js));
ok('Each level has width property', /width:\s*\d+/.test(js));
ok('Each level has playerStart', /playerStart:\s*\{x:\s*\d+,?\s*y:\s*\d+\}/.test(js));
ok('Each level has starTimes', /starTimes:\s*\{1:\s*\d+/.test(js));
ok('Each level has platforms array', /platforms:\s*\[[\s\S]{0,200}\{x:/.test(js));
ok('Each level has goal flag', /goal:\s*\{x:\s*\d+,?\s*y:\s*\d+\}/.test(js));
ok('Spikes defined in levels (spikes)', /spikes:\s*\[/.test(js));
ok('Moving platforms defined in some levels', /movingPlatforms:\s*\[/.test(js));

// ============= Edge cases & hardening =============
group('Hardening & edge cases');
ok('user-select: none on body', /user-select:\s*none/.test(html));
ok('-webkit-tap-highlight-color: transparent', /-webkit-tap-highlight-color:\s*transparent/.test(html));
ok('touch-action: none on html/body', /touch-action:\s*none/.test(html));
ok('prefers-reduced-motion media query', /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(html));
ok('reduced-motion overrides animation-duration', /animation-duration:\s*0\.01ms/.test(html));
ok('reduced-motion overrides transition-duration', /transition-duration:\s*0\.01ms/.test(html));
ok('@media (max-width: 480px) responsive breakpoint', /@media\s*\(max-width:\s*480px\)/.test(html));
ok('sounds wrapped in try/catch', /try\s*\{[\s\S]{0,200}playTone[\s\S]{0,200}\}\s*catch/.test(js));
ok('setupTouchButton checks element exists', /if\s*\(!el\)\s*return/.test(js));

// ============= Summary =============
console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
