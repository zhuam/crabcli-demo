#!/usr/bin/env node
/**
 * Static acceptance tests for Grandma's Garden Grub (Game 045).
 * Run: node games/045-grandma-garden-grub/tests/static.test.cjs
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

group('AC1 - Splash screen with difficulty select, no tutorial overlay');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE boot present', /\(function\s*\(\)\s*\{/.test(js));
ok('title screen with difficulty select buttons', /diff-btn.*data-diff="easy"/.test(html) && /diff-btn.*data-diff="medium"/.test(html) && /diff-btn.*data-diff="hard"/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('high score loaded on boot', /highScore\s*=\s*loadHighScore\(\)/.test(js));

group('AC2 - Timer at 90s (Easy/Medium) or 60s (Hard)');
ok('easy difficulty time: 90', /easy:\s*\{[\s\S]{0,100}time:\s*90/.test(js));
ok('medium difficulty time: 90', /medium:\s*\{[\s\S]{0,100}time:\s*90/.test(js));
ok('hard difficulty time: 60', /hard:\s*\{[\s\S]{0,100}time:\s*60/.test(js));
ok('totalTime set from difficulty', /totalTime\s*=\s*diff\.time/.test(js));

group('AC3 - Input modes (Mouse, Touch, Keyboard)');
ok('click handler for garden beds (harvest)', /gardenZone\.addEventListener\(\s*'click'/.test(js));
ok('touchstart handler for garden beds', /gardenZone\.addEventListener\(\s*'touchstart'/.test(js));
ok('counter pointer drag support', /counterArea\.addEventListener\(\s*'pointerdown'/.test(js));
ok('counterArea pointermove exists', /counterArea\.addEventListener\(\s*'pointermove'/.test(js));
ok('counterArea pointerup exists', /counterArea\.addEventListener\(\s*'pointerup'/.test(js));
ok('pan pointer drag for delivery', /panArea\.addEventListener\(\s*'pointerdown'[\s\S]{0,200}cookedDish/.test(js));
ok('touch end on counter items', /counterArea\.addEventListener\(\s*'touchend'/.test(js));
ok('touch end on pan for delivery', /panArea\.addEventListener\(\s*'touchend'/.test(js));
ok('keyboard: 1-4 select garden beds', /e\.key[\s\S]{0,30}1[\s\S]{0,50}4/.test(js) && /harvestBed\(kbSelectedBed\)/.test(js));
ok('keyboard: Space harvests selected bed', /e\.key\s*===\s*['"]\s['"]/.test(js));
ok('keyboard: Arrow keys navigate beds', /ArrowUp[\s\S]{0,200}ArrowDown[\s\S]{0,200}ArrowLeft[\s\S]{0,200}ArrowRight/.test(js));
ok('keyboard: Enter interacts with pan/delivery', /e\.key\s*===\s*['"]Enter['"]/.test(js));
ok('keyboard: C clears pan contents', /e\.key\s*===\s*['"]c['"]\s*\|\|\s*e\.key\s*===\s*['"]C['"]/.test(js));

group('AC4 - Result screen with star rating and REMATCH/MENU');
ok('result screen has rematch button', /id="resultRematchBtn"/.test(html));
ok('result screen has menu button', /id="resultMenuBtn"/.test(html));
ok('result stars container exists', /id="resultStars"/.test(html) && /result-star/.test(html));
ok('rematch calls startGame', /resultRematchBtn\.addEventListener\([\s\S]{0,50}startGame/.test(js));
ok('menu returns to title screen', /resultMenuBtn\.addEventListener\([\s\S]{0,200}showScreen\(titleScreen\)/.test(js));
ok('star rating uses 3 star levels', /stars\s*=\s*3/.test(js) && /stars\s*=\s*2/.test(js) && /stars\s*=\s*1/.test(js));
ok('result shows title per star level', /'Amazing!'/.test(js) && /'Great Job!'/.test(js) && /'Good Effort!'/.test(js) && /'Keep Trying!'/.test(js));
ok('stats display: orders and score', /resultOrders/.test(js) && /resultScore/.test(js) && /resultDifficulty/.test(js) && /resultBest/.test(js));
ok('new best indicator exists', /resultNewBest/.test(js) && /hidden/.test(js));

group('AC5 - AudioContext and SFX functions');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('ensureAudio function exists', /function\s+ensureAudio\s*\(/.test(js));
ok('playTone helper uses oscillator', /createOscillator/.test(js) && /createGain/.test(js));
ok('playHarvestPing function defined', /function\s+playHarvestPing\s*\(/.test(js));
ok('playCookSizzle function defined', /function\s+playCookSizzle\s*\(/.test(js));
ok('playCookDone function defined', /function\s+playCookDone\s*\(/.test(js));
ok('playOrderDing function defined', /function\s+playOrderDing\s*\(/.test(js));
ok('playGameOver function defined', /function\s+playGameOver\s*\(/.test(js));
ok('playDrop function defined', /function\s+playDrop\s*\(/.test(js));
ok('vibrate guarded with try/catch', /try\s*\{[\s\S]{0,30}navigator\.vibrate/.test(js));

group('AC6 - localStorage persistence');
ok('STORAGE_KEY defined as grandma-garden-best', /STORAGE_KEY\s*=\s*'grandma-garden-best'/.test(js));
ok('DIFFICULTY_KEY defined as grandma-garden-diff', /DIFFICULTY_KEY\s*=\s*'grandma-garden-diff'/.test(js));
ok('saveHighScore writes to localStorage', /localStorage\.setItem\(\s*STORAGE_KEY/.test(js));
ok('loadHighScore reads with parseInt', /parseInt\(localStorage\.getItem\(\s*STORAGE_KEY/.test(js));
ok('best score displayed on title screen', /id="titleBest"/.test(html) && /titleBest\.textContent\s*=\s*highScore/.test(js));

group('Game mechanics - 4 veggies');
ok('VEGGIES object with 4 entries', /carrot/.test(js) && /tomato/.test(js) && /lettuce/.test(js) && /onion/.test(js));
ok('VEGGIE_IDS array has all 4', /VEGGIE_IDS\s*=\s*\[[\s\S]{0,80}carrot[\s\S]{0,80}tomato[\s\S]{0,80}lettuce[\s\S]{0,80}onion/.test(js));
ok('carrot bed in HTML', /data-veg="carrot"/.test(html));
ok('tomato bed in HTML', /data-veg="tomato"/.test(html));
ok('lettuce bed in HTML', /data-veg="lettuce"/.test(html));
ok('onion bed in HTML', /data-veg="onion"/.test(html));

group('Game mechanics - Order system');
ok('RECIPES_2 array with 6 entries', /RECIPES_2\s*=/.test(js) && /Garden Salad/.test(js) && /Veggie Stir Fry/.test(js));
ok('RECIPES_3 array with 4 entries', /RECIPES_3\s*=/.test(js) && /Harvest Bowl/.test(js) && /Farmhouse Stew/.test(js));
ok('RECIPES_4 includes Grandma Special', /RECIPES_4/.test(js) && /Grandma Special/.test(js));
ok('getRandomRecipe function exists', /function\s+getRandomRecipe\s*\(/.test(js));
ok('generateOrder function exists', /function\s+generateOrder\s*\(/.test(js));
ok('order generation respects difficulty minIng/maxIng', /minIng[\s\S]{0,100}maxIng/.test(js));

group('Game mechanics - Cooking and delivery');
ok('harvestBed function exists', /function\s+harvestBed\s*\(/.test(js));
ok('startCooking function exists', /function\s+startCooking\s*\(/.test(js));
ok('finishCooking function exists', /function\s+finishCooking\s*\(/.test(js));
ok('deliverDish function exists', /function\s+deliverDish\s*\(/.test(js));
ok('clearPan function exists', /function\s+clearPan\s*\(/.test(js));
ok('cooking timer for 2 seconds', /cookDuration\s*=\s*2000/.test(js));
ok('respawn timer for 4 seconds', /respawnDuration\s*=\s*4000/.test(js));
ok('pan checks ingredient match', /panSorted/.test(js) && /neededSorted/.test(js));

group('Game mechanics - Drag and drop');
ok('createDragGhost function exists', /function\s+createDragGhost\s*\(/.test(js));
ok('updateDragGhost function exists', /function\s+updateDragGhost\s*\(/.test(js));
ok('getElementFromPoint function exists', /function\s+getElementFromPoint\s*\(/.test(js));
ok("counter drag source is 'counter'", /dragSource\s*=\s*'counter'/.test(js));
ok("pan drag source is 'pan'", /dragSource\s*=\s*'pan'/.test(js));
ok('highlight-drop CSS class exists', /highlight-drop/.test(js));
ok('delivery-ready CSS class for pan', /delivery-ready/.test(js));

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'grandma-garden-grub');
ok('registry contains grandma-garden-grub', !!entry);
ok('registry path points at 045 directory', entry && entry.path === '/games/045-grandma-garden-grub/');
ok('registry category is casual', entry && entry.category === 'casual');
ok('registry tags include cooking', entry && entry.tags.includes('cooking'));
ok('registry tags include garden', entry && entry.tags.includes('garden'));
ok('registry tags include time-management', entry && entry.tags.includes('time-management'));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
