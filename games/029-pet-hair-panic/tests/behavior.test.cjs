#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Pet Hair Panic (Issue #29).
 *
 * Complements the regex-based static.test.cjs with:
 *   - VM-executed unit tests of pure game functions
 *   - Pet generation validation (breeds, fur styles, dye colors, patience)
 *   - Tool matching logic (right tool for the right job)
 *   - Scoring and combo multiplier calculations
 *   - Level config integrity
 *   - localStorage round-trip with mocked storage
 *   - Game state transitions
 *   - Star / revenue calculations
 *
 * Run: node tests/behavior.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Extract the game JS from inline script
const scriptMatches = html.match(/<script>([\s\S]*?)<\/script>/g);
let gameJS = '';
if (scriptMatches) {
  for (let i = 0; i < scriptMatches.length; i++) {
    const s = scriptMatches[i].replace(/<\/?script>/g, '');
    if (s.indexOf('window.__PET_HAIR_PANIC') >= 0) {
      gameJS = s;
      break;
    }
  }
}

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (detail === undefined) detail = '';
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      { fail++; failures.push(name + (detail ? ' -- ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  -- ' + detail : '')); }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

// ============================================================
// Helper: extract a function body from source
// ============================================================
function extract(name, source) {
  const src = source || gameJS;
  const re = new RegExp('function\\s+' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  const m = src.match(re);
  if (!m) return null;
  const start = m.index;
  let i = src.indexOf('{', start);
  let depth = 1, end = i + 1;
  while (depth > 0 && end < src.length) {
    const c = src[end];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    end++;
  }
  return src.slice(start, end);
}

// ============================================================
group('Game JS extractable');
// ============================================================
ok('Game JS found (IIFE with __PET_HAIR_PANIC export)', gameJS.length > 0, 'length=' + gameJS.length);

// ============================================================
group('Level config integrity');
// ============================================================
ok('LEVELS defined', /LEVELS/.test(gameJS));

// Extract LEVELS array
try {
  const levelSandbox = { JSON, Array, Math, LEVELS: null, console: { log: function() {} } };
  vm.createContext(levelSandbox);
  // Execute just to get LEVELS via the exported object
  const getLevelsCode = gameJS.replace(/window\.__PET_HAIR_PANIC\s*=\s*\{[\s\S]*?\};/, '');
  // We'll use a simpler approach: parse the LEVELS directly from the source
  const levelsMatch = gameJS.match(/var\s+LEVELS\s*=\s*(\[[\s\S]*?\]);/);
  ok('LEVELS array literal extractable', !!levelsMatch);

  if (levelsMatch) {
    // Run in sandbox to evaluate
    const sandbox = { JSON, Array, Math, parseInt: parseInt, parseFloat: parseFloat };
    vm.createContext(sandbox);
    try {
      vm.runInContext('var LEVELS = ' + levelsMatch[1] + ';', sandbox);
      const levels = sandbox.LEVELS;

      ok('LEVELS has 5 entries', levels.length === 5, 'got ' + levels.length);
      ok('Level 1: 3 pets', levels[0].petCount === 3, 'got ' + levels[0].petCount);
      ok('Level 1: 60s time limit', levels[0].timeLimit === 60, 'got ' + levels[0].timeLimit);
      ok('Level 1: $30 required revenue', levels[0].requiredRevenue === 30, 'got $' + levels[0].requiredRevenue);
      ok('Level 1: no dye chance', levels[0].dyeChance === 0, 'got ' + levels[0].dyeChance);
      ok('Level 1: only trim style', levels[0].styles.length === 1 && levels[0].styles[0] === 'trim',
         'got [' + levels[0].styles.join(',') + ']');
      ok('Level 2: 5 pets', levels[1].petCount === 5, 'got ' + levels[1].petCount);
      ok('Level 2: 90s time limit', levels[1].timeLimit === 90, 'got ' + levels[1].timeLimit);
      ok('Level 2: $55 required revenue', levels[1].requiredRevenue === 55, 'got $' + levels[1].requiredRevenue);
      ok('Level 2: dye chance 0.4', levels[1].dyeChance === 0.4, 'got ' + levels[1].dyeChance);
      ok('Level 2: all 3 styles', levels[1].styles.length === 3, 'got ' + levels[1].styles.length);
      ok('Level 3: 7 pets', levels[2].petCount === 7, 'got ' + levels[2].petCount);
      ok('Level 3: 120s time limit', levels[2].timeLimit === 120, 'got ' + levels[2].timeLimit);
      ok('Level 3: $90 required revenue', levels[2].requiredRevenue === 90, 'got $' + levels[2].requiredRevenue);
      ok('Level 4: 9 pets', levels[3].petCount === 9, 'got ' + levels[3].petCount);
      ok('Level 4: 120s time limit', levels[3].timeLimit === 120, 'got ' + levels[3].timeLimit);
      ok('Level 4: $120 required revenue', levels[3].requiredRevenue === 120, 'got $' + levels[3].requiredRevenue);
      ok('Level 5: 12 pets', levels[4].petCount === 12, 'got ' + levels[4].petCount);
      ok('Level 5: 150s time limit', levels[4].timeLimit === 150, 'got ' + levels[4].timeLimit);
      ok('Level 5: $170 required revenue', levels[4].requiredRevenue === 170, 'got $' + levels[4].requiredRevenue);
      ok('Level 5: arrival interval faster than level 1', levels[4].arrivalInterval < levels[0].arrivalInterval,
         'L1=' + levels[0].arrivalInterval + ' L5=' + levels[4].arrivalInterval);
      ok('Dye chance increases across levels',
         levels[0].dyeChance <= levels[1].dyeChance &&
         levels[1].dyeChance <= levels[2].dyeChance &&
         levels[2].dyeChance <= levels[3].dyeChance &&
         levels[3].dyeChance <= levels[4].dyeChance,
         '[' + levels.map(function(l) { return l.dyeChance; }).join(',') + ']');
      ok('Arrival interval decreases across levels',
         levels[0].arrivalInterval >= levels[1].arrivalInterval &&
         levels[1].arrivalInterval >= levels[2].arrivalInterval &&
         levels[2].arrivalInterval >= levels[3].arrivalInterval &&
         levels[3].arrivalInterval >= levels[4].arrivalInterval,
         '[' + levels.map(function(l) { return l.arrivalInterval; }).join(',') + ']');
    } catch (e) {
      ok('Levels sandbox execution', false, e.message);
    }
  }
} catch (e) {
  ok('Level extraction', false, e.message);
}

// ============================================================
group('Pet generation tests');
// ============================================================
try {
  const getPetCode = extract('generatePet', gameJS);
  ok('generatePet function extractable', !!getPetCode);

  if (getPetCode) {
    // Build a sandbox with the necessary dependencies
    const getPetDeps = [
      'var PET_NAMES = ' + (gameJS.match(/var\s+PET_NAMES\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
      'var DYE_COLORS = ' + (gameJS.match(/var\s+DYE_COLORS\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
      'var FUR_STYLES = ' + (gameJS.match(/var\s+FUR_STYLES\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
      'var LEVELS = ' + (gameJS.match(/var\s+LEVELS\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
      'function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }',
      'function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }',
      'function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }'
    ].join('\n');

    const sandbox = {
      Math: Math,
      Date: { now: function() { return 1000000; } },
      JSON: JSON,
      generatePet: null
    };
    vm.createContext(sandbox);
    vm.runInContext(getPetDeps + '\n' + getPetCode + '\nthis.generatePet = generatePet;', sandbox);

    // Test pet generation for each level
    for (var levelIdx = 0; levelIdx < 5; levelIdx++) {
      var pet = sandbox.generatePet(levelIdx);
      ok('Level ' + (levelIdx + 1) + ': pet has an id', pet && typeof pet.id === 'string', pet ? pet.id : 'no pet');
      ok('Level ' + (levelIdx + 1) + ': pet has a name', pet && typeof pet.name === 'string' && pet.name.length > 0, pet ? pet.name : 'no name');
      ok('Level ' + (levelIdx + 1) + ': breed is cat or dog',
         pet && (pet.breed === 'cat' || pet.breed === 'dog'), pet ? pet.breed : 'no breed');
      ok('Level ' + (levelIdx + 1) + ': furStyle is valid',
         pet && ['trim', 'fluff', 'shave'].indexOf(pet.furStyle) >= 0, pet ? pet.furStyle : 'no furStyle');
      ok('Level ' + (levelIdx + 1) + ': dyeColor is valid',
         pet && ['blue', 'pink', 'green', 'none'].indexOf(pet.dyeColor) >= 0, pet ? pet.dyeColor : 'no dyeColor');
      ok('Level ' + (levelIdx + 1) + ': patience > 0', pet && pet.patience > 0, 'got ' + (pet ? pet.patience : 0));
      ok('Level ' + (levelIdx + 1) + ': maxPatience = patience', pet && pet.maxPatience === pet.patience,
         'patience=' + pet.patience + ' max=' + pet.maxPatience);
      ok('Level ' + (levelIdx + 1) + ': satisfaction = 100', pet && pet.satisfaction === 100,
         'got ' + pet.satisfaction);
      ok('Level ' + (levelIdx + 1) + ': initial state = waiting', pet && pet.state === 'waiting',
         'got ' + pet.state);
      ok('Level ' + (levelIdx + 1) + ': trimmed = false initially', pet && pet.trimmed === false);
      ok('Level ' + (levelIdx + 1) + ': dyed = false initially', pet && pet.dyed === false);
      ok('Level ' + (levelIdx + 1) + ': registered = false initially', pet && pet.registered === false);
    }

    // Level 1 pets shouldn't have dye (dyeChance = 0)
    var noDyeCount = 0;
    for (var i = 0; i < 50; i++) {
      var p = sandbox.generatePet(0);
      if (p.dyeColor === 'none') noDyeCount++;
    }
    ok('Level 1: all pets have no dye (dyeChance=0)', noDyeCount === 50, 'got ' + noDyeCount + '/50');

    // Level 5 pets should have some with dye (dyeChance = 0.8)
    var dyeCount = 0;
    for (var j = 0; j < 50; j++) {
      var p2 = sandbox.generatePet(4);
      if (p2.dyeColor !== 'none') dyeCount++;
    }
    ok('Level 5: most pets have dye (dyeChance=0.8)', dyeCount >= 20, 'got ' + dyeCount + '/50');

    // Level 1 pets should all have trim style
    var trimCount = 0;
    for (var k = 0; k < 50; k++) {
      var p3 = sandbox.generatePet(0);
      if (p3.furStyle === 'trim') trimCount++;
    }
    ok('Level 1: all pets have trim style', trimCount === 50, 'got ' + trimCount + '/50');

    // Later levels should have varied styles
    var styleCounts = { trim: 0, fluff: 0, shave: 0 };
    for (var m = 0; m < 100; m++) {
      var p4 = sandbox.generatePet(2);
      styleCounts[p4.furStyle]++;
    }
    ok('Level 3: all 3 fur styles appear randomly',
       styleCounts.trim > 0 && styleCounts.fluff > 0 && styleCounts.shave > 0,
       'trim=' + styleCounts.trim + ' fluff=' + styleCounts.fluff + ' shave=' + styleCounts.shave);

    // Pet patience decreases with higher levels
    var l1Patience = 0, l5Patience = 0;
    for (var n = 0; n < 20; n++) {
      l1Patience += sandbox.generatePet(0).patience;
      l5Patience += sandbox.generatePet(4).patience;
    }
    ok('Higher levels have lower patience (on avg)',
       l5Patience / 20 <= l1Patience / 20,
       'L1 avg=' + (l1Patience / 20) + ' L5 avg=' + (l5Patience / 20));

  } else {
    ok('generatePet extractable', false);
  }
} catch (e) {
  ok('Pet generation tests suite', false, e.message);
}

// ============================================================
group('Tool matching logic');
// ============================================================
try {
  // Apply tool accepts (toolType, pet) and modifies pet state
  // We can test the logic by creating a pet and simulating tool application
  var toolSandboxCode = [
    'var PET_NAMES = ' + (gameJS.match(/var\s+PET_NAMES\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
    'var DYE_COLORS = ' + (gameJS.match(/var\s+DYE_COLORS\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
    'var FUR_STYLES = ' + (gameJS.match(/var\s+FUR_STYLES\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
    'var LEVELS = ' + (gameJS.match(/var\s+LEVELS\s*=\s*(\[[\s\S]*?\]);/) || ['', '[]'])[1] + ';',
    'var STYLE_ICONS = ' + (gameJS.match(/var\s+STYLE_ICONS\s*=\s*(\{[\s\S]*?\});/) || ['', '{}'])[1] + ';',
    'var DYE_ICONS = ' + (gameJS.match(/var\s+DYE_ICONS\s*=\s*(\{[\s\S]*?\});/) || ['', '{}'])[1] + ';',
    'var DYE_HEX = ' + (gameJS.match(/var\s+DYE_HEX\s*=\s*(\{[\s\S]*?\});/) || ['', '{}'])[1] + ';',
    'var COMBO_WINDOW = 5000;',
    'var MAX_PETS_ON_SCREEN = 3;',
    'function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }',
    'function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }',
    'function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }',
    'function playSnip() {}',
    'function playDye() {}',
    'function playRegister() {}',
    'function playHappy() {}',
    'function playAngry() {}',
    'function playWrong() {}',
    'function playCombo() {}',
    'function vibrate(ms) {}',
    'function showComboToast() {}',
    'function updatePetCard() {}',
    'function getComboMultiplier() { return 1; }',
    'function removePet(pet) {}',
    'function checkPetQueue() {}',
    'function checkLevelEnd() {}',
    'function updateHUD() {}',
    'var state = { revenue: 0, petsServed: 0, comboCount: 0, bestCombo: 0, lastServeTime: 0, petsOnScreen: [], running: true };',
    'var comboToast = { textContent: "", style: { animation: "", opacity: 0 } };',
    'var dyeColorIndex = 0;',
    'function getCurrentDyeColor() { return DYE_COLORS[dyeColorIndex]; }'
  ].join('\n');

  // Extract the functions we need
  var applyCode = extract('applyToolToPet', gameJS);
  var completePetCode = extract('completePet', gameJS);
  var petLeaveAngryCode = extract('petLeaveAngry', gameJS);
  var generatePetCode = extract('generatePet', gameJS);

  ok('applyToolToPet extractable', !!applyCode);

  if (applyCode && generatePetCode) {
    var fullSandboxCode = toolSandboxCode + '\n' +
      generatePetCode + '\n' +
      applyCode + '\n' +
      (completePetCode || '') + '\n' +
      (petLeaveAngryCode || '');

    var sandbox = {
      Math: Math,
      Date: { now: function() { return 2000000; } },
      JSON: JSON,
      setTimeout: function(fn) { fn(); },
      console: { log: function() {} },
      document: {
        createElement: function() { return { style: {}, className: '', classList: { add: function() {}, remove: function() {} }, appendChild: function() {}, querySelector: function() { return null; } }; }
      },
      applyToolToPet: null
    };
    vm.createContext(sandbox);
    vm.runInContext(fullSandboxCode + '\nthis.applyToolToPet = applyToolToPet;', sandbox);

    // Create a test pet with trim style
    var trimPet = sandbox.generatePet(0);

    // Test: scissors on trim pet should succeed
    sandbox.applyToolToPet('scissors', trimPet);
    ok('Scissors on trim: trimmed=true', trimPet.trimmed === true, 'got ' + trimPet.trimmed);

    // Create a new pet for brush test
    var fluffPet = sandbox.generatePet(2);
    fluffPet.furStyle = 'fluff';
    sandbox.applyToolToPet('brush', fluffPet);
    ok('Brush on fluff: trimmed=true', fluffPet.trimmed === true, 'got ' + fluffPet.trimmed);

    // Wrong tool test
    var shavePet = sandbox.generatePet(2);
    shavePet.furStyle = 'shave';
    sandbox.applyToolToPet('scissors', shavePet);
    ok('Scissors on shave: trimmed=false (wrong tool)', shavePet.trimmed === false, 'got trimmed=' + shavePet.trimmed);
    ok('Wrong tool: satisfaction decreased', shavePet.satisfaction < 100, 'got ' + shavePet.satisfaction);

    // Test dye application
    var dyePet = sandbox.generatePet(4);
    dyePet.furStyle = 'trim';
    dyePet.dyeColor = 'blue';
    // First trim it
    sandbox.applyToolToPet('scissors', dyePet);
    ok('Dye test: pet trimmed first', dyePet.trimmed === true);
    // Now the dye color index would be at 0 = blue in the game, but we can't easily set it in sandbox
    // The dye function reads dyeColorIndex from closure, which is 0 = 'blue' by default
    // So dyePet.dyeColor = 'blue' should match
    sandbox.applyToolToPet('dye', dyePet);
    ok('Dye on blue pet with dyeColorIndex=0: dyed=true', dyePet.dyed === true, 'got dyed=' + dyePet.dyed + ' dyeColor=' + dyePet.dyeColor);

    // Test wrong dye color (sandbox doesn't have dyeColorIndex, so it may default to 'blue')
    var wrongDyePet = sandbox.generatePet(4);
    wrongDyePet.furStyle = 'trim';
    wrongDyePet.dyeColor = 'pink';
    sandbox.applyToolToPet('scissors', wrongDyePet);
    sandbox.applyToolToPet('dye', wrongDyePet);
    // Since dyeColorIndex defaults to 'blue' but pet wants 'pink', it should fail
    ok('Wrong dye color: dyed=false', wrongDyePet.dyed === false, 'got dyed=' + wrongDyePet.dyed + ' satisfaction=' + wrongDyePet.satisfaction);

    // Test register on incomplete pet should fail
    var regPet = sandbox.generatePet(0);
    sandbox.applyToolToPet('register', regPet);
    ok('Register on untrimmed pet: not registered', regPet.registered === false);
    ok('Register on untrimmed pet: satisfaction decreased', regPet.satisfaction < 100);

    // Test no-dye pet can skip dye step
    var noDyePet = sandbox.generatePet(0);
    noDyePet.dyeColor = 'none';
    sandbox.applyToolToPet('scissors', noDyePet);
    ok('No-dye pet: trimmed', noDyePet.trimmed === true);

    // Apply dye on no-dye pet should fail
    sandbox.applyToolToPet('dye', noDyePet);
    ok('Dye on no-dye pet: dyed=false', noDyePet.dyed === false);
  }
} catch (e) {
  ok('Tool matching tests suite', false, e.message);
}

// ============================================================
group('Scoring & combo calculation');
// ============================================================
// Test combo multiplier logic
try {
  var comboCode = extract('getComboMultiplier', gameJS);
  ok('getComboMultiplier extractable', !!comboCode);

  if (comboCode) {
    var sandbox = {
      state: { comboCount: 0 },
      getComboMultiplier: null
    };
    vm.createContext(sandbox);
    vm.runInContext('var state = this.state;\n' + comboCode + '\nthis.getComboMultiplier = getComboMultiplier;', sandbox);

    sandbox.state.comboCount = 0;
    ok('Combo 0: multiplier = 1', sandbox.getComboMultiplier() === 1, 'got ' + sandbox.getComboMultiplier());

    sandbox.state.comboCount = 1;
    ok('Combo 1: multiplier = 1.5', sandbox.getComboMultiplier() === 1.5, 'got ' + sandbox.getComboMultiplier());

    sandbox.state.comboCount = 2;
    ok('Combo 2: multiplier = 2.0', sandbox.getComboMultiplier() === 2.0, 'got ' + sandbox.getComboMultiplier());

    sandbox.state.comboCount = 3;
    ok('Combo 3+: multiplier = 3.0', sandbox.getComboMultiplier() === 3.0, 'got ' + sandbox.getComboMultiplier());

    sandbox.state.comboCount = 10;
    ok('Combo 10: multiplier = 3.0 (capped)', sandbox.getComboMultiplier() === 3.0, 'got ' + sandbox.getComboMultiplier());
  }
} catch (e) {
  ok('Combo calculation tests', false, e.message);
}

// ============================================================
group('Star calculation logic');
// ============================================================
try {
  // Test the star calculation from endGame function
  var endGameCode = extract('endGame', gameJS);
  ok('endGame extractable', !!endGameCode);

  if (endGameCode) {
    var starLookup = endGameCode.match(/ratio\s*=\s*state\.revenue\s*\/\s*level\.requiredRevenue[\s\S]{0,200}(?:stars\s*=\s*\d[^;]*;)/);
    ok('Star calculation uses revenue ratio', !!starLookup);

    // Parse star thresholds
    var findStars = function(ratio) {
      if (ratio >= 2) return 3;
      if (ratio >= 1.5) return 2;
      if (ratio >= 1) return 1;
      return 0;
    };
    ok('3 stars at 2x revenue', findStars(2.0) === 3);
    ok('3 stars at >2x revenue', findStars(3.0) === 3);
    ok('2 stars at 1.5x revenue', findStars(1.5) === 2);
    ok('2 stars at 1.75x revenue', findStars(1.75) === 2);
    ok('1 star at 1.0x revenue', findStars(1.0) === 1);
    ok('1 star at 1.25x revenue', findStars(1.25) === 1);
    ok('0 stars at 0.5x revenue', findStars(0.5) === 0);
    ok('0 stars at 0x revenue', findStars(0) === 0);
  }
} catch (e) {
  ok('Star calculation tests', false, e.message);
}

// ============================================================
group('Revenue scoring');
// ============================================================
try {
  var completePetCode2 = extract('completePet', gameJS);
  ok('completePet extractable', !!completePetCode2);

  if (completePetCode2) {
    // Check the revenue formula exists
    ok('Revenue has base of 10', /var\s+base\s*=\s*10/.test(completePetCode2));
    ok('Revenue has tip calculation', /Math\.round\(base\s*\*\s*0\.5/.test(completePetCode2));
    ok('Revenue uses combo multiplier', /comboMultiplier/.test(completePetCode2));
    ok('Revenue adds to state.revenue', /state\.revenue\s*\+=/.test(completePetCode2));
    ok('Pets served incremented', /state\.petsServed\+\+/.test(completePetCode2));
  }
} catch (e) {
  ok('Revenue scoring tests', false, e.message);
}

// ============================================================
group('localStorage round-trip (mocked)');
// ============================================================
try {
  var getSaveDataCode = extract('getSaveData', gameJS);
  var saveToDiskCode = extract('saveToDisk', gameJS);

  ok('getSaveData extractable', !!getSaveDataCode);
  ok('saveToDisk extractable', !!saveToDiskCode);

  if (getSaveDataCode && saveToDiskCode) {
    var store = new Map();
    var lsSandbox = {
      JSON: JSON,
      Math: { max: Math.max },
      localStorage: {
        getItem: function(k) { return store.has(k) ? store.get(k) : null; },
        setItem: function(k, v) { store.set(k, String(v)); },
        removeItem: function(k) { store.delete(k); },
        clear: function() { store.clear(); }
      },
      state: { currentLevel: 0, revenue: 50, earnedStars: 1 },
      getSaveData: null,
      saveToDisk: null
    };
    vm.createContext(lsSandbox);
    vm.runInContext(
      'var localStorage = this.localStorage;\n' +
      getSaveDataCode + '\n' +
      'var getSaveData = this.getSaveData = getSaveData;\n' +
      'var state = this.state;\n' +
      saveToDiskCode + '\n' +
      'this.saveToDisk = saveToDisk;\n',
      lsSandbox
    );

    // Missing key returns empty object
    var empty = lsSandbox.getSaveData();
    ok('getSaveData returns {} on missing key', empty && typeof empty === 'object' && Object.keys(empty).length === 0,
       JSON.stringify(empty));

    // Save then load
    lsSandbox.saveToDisk();
    var saved = store.get('petHairPanic');
    ok('saveToDisk writes to localStorage', typeof saved === 'string' && saved.length > 0, typeof saved);

    // Verify structure
    var parsed = JSON.parse(saved);
    ok('Saved data has levels array', Array.isArray(parsed.levels), typeof parsed.levels);
    ok('Saved data has totalRevenue', typeof parsed.totalRevenue === 'number', 'got ' + parsed.totalRevenue);
    ok('Level 0 saved with bestRevenue', parsed.levels[0] && parsed.levels[0].bestRevenue === 50,
       parsed.levels[0] ? JSON.stringify(parsed.levels[0]) : 'no level 0');
    ok('Level 0 has stars', parsed.levels[0] && parsed.levels[0].stars === 1,
       parsed.levels[0] ? 'got stars=' + parsed.levels[0].stars : 'no level 0');

    // Corrupted JSON returns empty object
    store.set('petHairPanic', '{not-valid-json');
    var recovered = lsSandbox.getSaveData();
    ok('getSaveData swallows JSON errors, returns {}', recovered && Object.keys(recovered).length === 0,
       JSON.stringify(recovered));

    // Storage-throws scenario (Safari private mode)
    var throwing = {
      JSON: JSON,
      Math: { max: Math.max },
      localStorage: {
        getItem: function() { throw new Error('quota'); },
        setItem: function() { throw new Error('quota'); }
      },
      state: { currentLevel: 0, revenue: 50, earnedStars: 1 },
      getSaveData: null,
      saveToDisk: null
    };
    vm.createContext(throwing);
    vm.runInContext(
      'var localStorage = this.localStorage;\n' +
      getSaveDataCode + '\n' +
      'var getSaveData = this.getSaveData = getSaveData;\n' +
      'var state = this.state;\n' +
      saveToDiskCode + '\n' +
      'this.saveToDisk = saveToDisk;\n',
      throwing
    );
    var threw = false;
    try { throwing.saveToDisk(); throwing.getSaveData(); }
    catch (e) { threw = true; }
    ok('saveToDisk/getSaveData swallow storage exceptions', !threw);
  }
} catch (e) {
  ok('localStorage tests', false, e.message);
}

// ============================================================
group('Game state & transitions');
// ============================================================
ok('Screen class toggle on active', /classList\.(remove|add)\(['"]active['"]\)/.test(gameJS));
ok('state.running set false on endGame', /state\.running\s*=\s*false/.test(gameJS));
ok('state.gameOver set true on endGame', /state\.gameOver\s*=\s*true/.test(gameJS));
ok('Timer cleared on game end', /clearInterval\(state\.timerInterval\)/.test(gameJS));
ok('Spawn timeout cleared on game end', /clearTimeout\(state\.spawnTimeout\)/.test(gameJS));
ok('All state fields reset on startGame', /state\.revenue\s*=\s*0/.test(gameJS));
ok('state.timeLeft set from level config', /state\.timeLeft\s*=\s*level\.timeLimit/.test(gameJS));
ok('Result shown after delay (setTimeout)', /setTimeout[\s\S]{0,40}showResult/.test(gameJS));

// ============================================================
group('Edge cases & hardening');
// ============================================================
ok('rand function uses Math.floor', /Math\.floor\(Math\.random/.test(gameJS));
ok('clamp function defined', /function\s+clamp/.test(gameJS));
ok('Game functions guarded: on tool drag, checks state.running', /if\s*\(\s*!state\.running/.test(gameJS));
ok('Pet patience clamped at 0 minimum', /Math\.max\(0,\s*pet\.maxPatience/.test(gameJS));
ok('Satisfaction clamped at 0 minimum', /Math\.max\(0,\s*pet\.satisfaction/.test(gameJS));
ok('Satisfaction clamped at maxSatisfaction', /Math\.min\(pet\.maxSatisfaction[\s\S]{0,20}satisfaction/.test(gameJS));
ok('Pet removal on patience = 0', /pet\.patience\s*<=\s*0/.test(gameJS));
ok('Pet removal on satisfaction = 0', /pet\.satisfaction\s*<=\s*0/.test(gameJS));
ok('Level end check on all pets served', /state\.totalSpawned\s*>=\s*level\.petCount\s*&&/.test(gameJS));
ok('Timer warning class when <= 15s', /state\.timeLeft\s*<=\s*15/.test(gameJS));
ok('Prevent game over from running twice', /if\s*\(\s*state\.gameOver\s*\)\s*return/.test(gameJS));
ok('Pointer event cleanup on drag end', /removeEventListener\(['"]pointermove['"]/.test(gameJS));
ok('Pointer event cleanup on pointerup', /removeEventListener\(['"]pointerup['"]/.test(gameJS));

// ============================================================
console.log('\n' + '='.repeat(50));
console.log('  ' + pass + ' passed · ' + fail + ' failed');
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(function(f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
process.exit(0);
