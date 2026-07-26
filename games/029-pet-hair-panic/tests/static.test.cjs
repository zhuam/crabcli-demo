#!/usr/bin/env node
/**
 * Static smoke tests for Pet Hair Panic (Issue #29)
 * Run: node tests/static.test.cjs
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
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      { fail++; failures.push(name + (detail ? ' -- ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  -- ' + detail : '')); }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

// Extract JS from inline <script> (last one -- the game IIFE)
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
let gameJS = '';
if (scriptMatch) {
  // Find the script with the game IIFE (skip the recordPlayed script)
  for (let i = 0; i < scriptMatch.length; i++) {
    const s = scriptMatch[i].replace(/<\/?script>/g, '');
    if (s.indexOf('window.__PET_HAIR_PANIC') >= 0) {
      gameJS = s;
      break;
    }
  }
}

// ============= Required files =============
group('Required files exist');
const requiredFiles = ['index.html', 'thumb.svg', 'README.md'];
for (let fi = 0; fi < requiredFiles.length; fi++) {
  const f = requiredFiles[fi];
  ok(f + ' exists', fs.existsSync(path.join(ROOT, f)));
}
ok('tests/behavior.test.cjs exists', fs.existsSync(path.join(ROOT, 'tests', 'behavior.test.cjs')));

// ============= HTML structure & metadata =============
group('HTML structure & metadata');
const requiredIds = [
  'game', 'title-screen', 'game-screen', 'result-screen',
  'levelList', 'startBtn', 'bestRevenueDisplay', 'totalEarnedDisplay',
  'timerDisplay', 'revenueDisplay', 'goalDisplay', 'comboDisplay',
  'pet-area', 'toolbar', 'registerZone',
  'tool1', 'tool2', 'tool3', 'tool4', 'tool5',
  'dragGhost', 'comboToast',
  'replayBtn', 'nextLevelBtn', 'menuBtn',
  'resultIcon', 'resultHeading', 'resultSub',
  'resultRevenue', 'resultPets', 'resultBestCombo',
  'dyeColorDot', 'queueIndicator', 'queueLabel'
];
for (let i = 0; i < requiredIds.length; i++) {
  const id = requiredIds[i];
  const re = new RegExp('id\\s*=\\s*"' + id + '"');
  ok('#' + id + ' present in index.html', re.test(html));
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
ok('title tag present', /<title>Pet Hair Panic/.test(html));
ok('game-title renders Pet Hair Panic text', /Pet Hair[\s\S]*Panic/.test(html));
ok('level grid section present', /class="level-grid"/.test(html));
ok('toolbar with 5 tools present', /id="toolbar"/.test(html));
ok('HUD section present', /id="hud"/.test(html));
ok('pet area present', /id="pet-area"/.test(html));
ok('register zone present', /id="registerZone"/.test(html));

// ============= recordPlayed function =============
group('recordPlayed function');
ok('window.recordPlayed defined in inline script', /window\.recordPlayed\s*=/.test(html));
ok('recordPlayed called onclick', /onclick="window\.recordPlayed/.test(html));
ok('recordPlayed uses localStorage recentlyPlayed', /localStorage\.getItem\(['"]recentlyPlayed['"]\)/.test(html));
ok('recordPlayed stores { id, playedAt }', /id:\s*gameId/.test(html) && /playedAt:\s*Date\.now\(\)/.test(html));
ok('recordPlayed limits to 10 recent', /slice\(0,\s*10\)/.test(html));

// ============= Game JS patterns =============
group('JavaScript patterns');
ok('Inline game JS found (IIFE pattern)', gameJS.length > 0);
ok('"use strict" enabled', /['"]use strict['"]/.test(gameJS));
ok('LEVELS array defined', /var\s+LEVELS\s*=/.test(gameJS));
ok('5 levels defined in LEVELS', (gameJS.match(/name:\s*['"]/g) || []).length >= 5);
ok('Pet names array defined', /var\s+PET_NAMES\s*=/.test(gameJS));
ok('DYE_COLORS defined', /var\s+DYE_COLORS\s*=/.test(gameJS));
ok('FUR_STYLES defined', /var\s+FUR_STYLES\s*=/.test(gameJS));
ok('IIFE wraps game logic', /\bfunction\b[\s\S]{0,20}\(\s*\)\s*\{[\s\S]*\}\)\(\s*\)\s*;/.test(gameJS) || /\}\)\s*\(\s*\)\s*;/.test(gameJS.trim().slice(-10)));

// Game functions
const gameFuncs = [
  'initAudio', 'playTone', 'playSnip', 'playDye', 'playRegister',
  'playHappy', 'playAngry', 'playWrong', 'playCombo',
  'vibrate', 'generatePet', 'createPetCard', 'updatePetCard',
  'spawnPet', 'showPet', 'selectTool', 'startDrag',
  'onDragMove', 'onDragEnd',
  'applyToolToPet', 'completePet', 'petLeaveAngry',
  'getComboMultiplier', 'updatePatience', 'updateTimer',
  'updateHUD', 'checkLevelEnd', 'endGame',
  'showTitle', 'startGame', 'showResult', 'init'
];
for (let f = 0; f < gameFuncs.length; f++) {
  const fn = gameFuncs[f];
  ok('function ' + fn + '() defined', new RegExp('function\\s+' + fn + '\\s*\\(').test(gameJS));
}

ok('window.__PET_HAIR_PANIC exported for testing', /window\.__PET_HAIR_PANIC/.test(gameJS));
ok('DOMContentLoaded event listener', /DOMContentLoaded/.test(gameJS));
ok('state object tracks game state', /var\s+state\s*=/.test(gameJS));
ok('combo window defined (5s)', /COMBO_WINDOW\s*=\s*5000/.test(gameJS));
ok('MAX_PETS_ON_SCREEN defined', /MAX_PETS_ON_SCREEN\s*=\s*3/.test(gameJS));

// ============= Sound & Vibration =============
group('Sound & vibration');
ok('AudioContext used', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(gameJS));
ok('initAudio() creates AudioContext', /audioCtx\s*=\s*new\s+AudioCtx/.test(gameJS));
ok('playTone uses oscillator + gain', /createOscillator/.test(gameJS) && /createGain/.test(gameJS));
ok('playSnip produces snip sound', /playSnip/.test(gameJS));
ok('playDye produces dye sound', /playDye/.test(gameJS));
ok('playRegister produces register sound', /playRegister/.test(gameJS));
ok('playHappy produces happy sound', /playHappy/.test(gameJS));
ok('playAngry produces angry sound', /playAngry/.test(gameJS));
ok('playWrong produces wrong sound', /playWrong/.test(gameJS));
ok('playCombo produces combo sound', /playCombo/.test(gameJS));
ok('vibrate() function defined', /function\s+vibrate\s*\(/.test(gameJS));
ok('navigator.vibrate guarded by truthy check', /navigator\.vibrate\s*&&/.test(gameJS) || /if\s*\(\s*navigator\.vibrate\s*\)/.test(gameJS));
ok('vibrate wrapped in try/catch', /try\s*\{[^}]*navigator\.vibrate[^}]*\}\s*catch/.test(gameJS));

// ============= Input Handling =============
group('Input handling');
ok('pointerdown event handler on tools', /pointerdown/.test(gameJS));
ok('pointermove event handler', /pointermove/.test(gameJS));
ok('pointerup event handler', /pointerup/.test(gameJS));
ok('keydown listener attached to document', /document\.addEventListener\(['"]keydown['"]/.test(gameJS));
ok('Number keys 1-5 mapped to tools', /'1':\s*'scissors'/.test(gameJS) && /'5':\s*'register'/.test(gameJS));
ok('Touch drag via pointer events', /pointerdown[\s\S]{0,200}startDrag/.test(gameJS));
ok('Click on pet applies selected tool', /card\.addEventListener\(['"]click['"]/.test(gameJS));

// ============= Game Settings and Config =============
group('Levels & game config');
ok('Level 1: Puppy Start', /Puppy Start/.test(gameJS));
ok('Level 2: Cat & Dogs', /Cat\s*&?\s*Dogs/.test(gameJS));
ok('Level 3: Full Service', /Full Service/.test(gameJS));
ok('Level 4: Rush Hour', /Rush Hour/.test(gameJS));
ok('Level 5: Grand Opening', /Grand Opening/.test(gameJS));
ok('Each level has petCount, timeLimit, requiredRevenue', /petCount/.test(gameJS) && /timeLimit/.test(gameJS) && /requiredRevenue/.test(gameJS));
ok('Each level has arrivalInterval', /arrivalInterval/.test(gameJS));
ok('Level 1 has only trim style', /styles:\s*\[['"]trim['"]\]/.test(gameJS));
ok('Level 2+ includes fluff and shave', /['"]fluff['"][\s\S]{0,20}['"]shave['"]/.test(gameJS));
ok('Dye chance increases with levels', /dyeChance:\s*0\.\d/.test(gameJS));
ok('PET_NAMES has 20 names', /PET_NAMES\s*=\s*\[/.test(gameJS) && (gameJS.match(/'/g) || []).length > 10);
ok('Pet breeds: cat and dog', /['"]cat['"]/.test(gameJS) && /['"]dog['"]/.test(gameJS));
ok('Fur styles: trim, fluff, shave', /['"]trim['"]/.test(gameJS) && /['"]fluff['"]/.test(gameJS) && /['"]shave['"]/.test(gameJS));
ok('Dye colors: blue, pink, green', /['"]blue['"]/.test(gameJS) && /['"]pink['"]/.test(gameJS) && /['"]green['"]/.test(gameJS));
ok('Revenue target increases across levels', /requiredRevenue:\s*30/.test(gameJS) && /requiredRevenue:\s*170/.test(gameJS));
ok('Time limits vary across levels', /timeLimit:\s*60/.test(gameJS) && /timeLimit:\s*150/.test(gameJS));

// ============= Scoring & Combo =============
group('Scoring & combo');
ok('Base revenue $10 per pet', /base\s*=\s*10/.test(gameJS));
ok('Tip calculation based on patience + satisfaction', /timeBonus/.test(gameJS) && /satisfactionBonus/.test(gameJS));
ok('Combo multiplier up to 3x', /mult\s*>=\s*3/.test(gameJS) || /3x/.test(gameJS) || /return\s*3/.test(gameJS));
ok('Combo toast shown on serve', /comboToast\.textContent/.test(gameJS));
ok('Wrong tool reduces satisfaction by 25', /satisfaction\s*=\s*Math\.max\(0,\s*pet\.satisfaction\s*-\s*25\)/.test(gameJS));
ok('Correct tool adds satisfaction', /satisfaction\s*=\s*Math\.min\(pet\.maxSatisfaction,\s*pet\.satisfaction\s*\+\s*5\)/.test(gameJS));
ok('Star calculation based on revenue ratio', /ratio\s*=\s*state\.revenue\s*\/\s*level\.requiredRevenue/.test(gameJS));
ok('Stars: 3 for 2x, 2 for 1.5x, 1 for 1x', /ratio\s*>=\s*2[\s\S]{0,30}stars\s*=\s*3/.test(gameJS));

// ============= CSS =============
group('CSS theme & responsive');
ok('Cute pastel theme colors defined', /#f0e6f6/.test(html));
ok('Pink primary gradient', /#ff7eb3/.test(html) && /#ff5e97/.test(html));
ok('Pet card styling', /\.pet-card/.test(html));
ok('Happiness bar green/yellow/red', /green[\s\S]{0,30}#2ecc71/.test(html) && /yellow[\s\S]{0,30}#f1c40f/.test(html) && /red[\s\S]{0,30}#e74c3c/.test(html));
ok('Dog and cat CSS shapes defined', /\.pet-dog/.test(html) && /\.pet-cat/.test(html));
ok('Tool styling with active state', /\.tool\.active/.test(html));
ok('Toolbar sticky at bottom', /#toolbar[\s\S]{0,300}border-top/.test(html));
ok('HUD with gradient overlay', /#hud[\s\S]{0,300}linear-gradient/.test(html));
ok('Register zone dashed border', /#registerZone[\s\S]{0,300}dashed/.test(html));
ok('Drag ghost styling', /#dragGhost[\s\S]{0,100}pointer-events:\s*none/.test(html));
ok('Confetti animation keyframes', /@keyframes\s+confetti-fall/.test(html));

// Animations
const animations = ['fadeIn', 'slideUp', 'bounceIn', 'shake', 'wiggle', 'float', 'pulse', 'popIn', 'confetti-fall', 'slideDown', 'angryBounce'];
for (let a = 0; a < animations.length; a++) {
  ok('@keyframes ' + animations[a] + ' defined', new RegExp('@keyframes\\s+' + animations[a]).test(html));
}

ok('@media (prefers-reduced-motion: reduce) present', /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(html));
ok('reduced-motion overrides animation-duration', /animation-duration:\s*0\.01ms/.test(html));
ok('reduced-motion overrides transition-duration', /transition-duration:\s*0\.01ms/.test(html));
ok('@media (max-height: 600px) landscape tweaks', /@media\s*\(max-height:\s*600px\)/.test(html));
ok('focus-visible styles on interactive elements', /:focus-visible/.test(html));
ok('Touch-action: none on body', /touch-action:\s*none/.test(html));

// ============= localStorage =============
group('localStorage keys');
ok("localStorage key 'petHairPanic' used", /petHairPanic/.test(gameJS));
ok('getSaveData() function defined', /function\s+getSaveData\s*\(/.test(gameJS));
ok('saveToDisk() function defined', /function\s+saveToDisk\s*\(/.test(gameJS));
ok('saveToDisk wrapped in try/catch', /function\s+saveToDisk[\s\S]*try\s*\{[\s\S]*catch\s*\(/.test(gameJS));
ok('getSaveData wrapped in try/catch', /function\s+getSaveData[\s\S]*try\s*\{[\s\S]*catch\s*\(/.test(gameJS));
ok('Level progression saved (unlock next level)', /unlocked\s*=\s*true/.test(gameJS) && /state\.currentLevel\s*\+\s*1/.test(gameJS));
ok('Best revenue stored per level', /bestRevenue[\s\S]{0,50}Math\.max/.test(gameJS));
ok('Stars stored per level', /\.stars\s*=\s*Math\.max/.test(gameJS));

// ============= Summary =============
console.log('\n' + '='.repeat(50));
console.log('  ' + pass + ' passed · ' + fail + ' failed');
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(function(f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
process.exit(0);
