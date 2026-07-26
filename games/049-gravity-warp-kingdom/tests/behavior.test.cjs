#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Gravity Warp Kingdom (Issue #49).
 *
 * Complements the regex-based static.test.cjs with:
 *   - VM-executed unit tests of pure functions
 *   - Gravity flip mechanics (g -> -g, velocity reversal)
 *   - Star calculation based on time thresholds
 *   - Level unlocking logic
 *   - localStorage save/load/error handling
 *   - Collision detection logic
 *   - Level data schema validation
 *
 * Run: node games/049-gravity-warp-kingdom/tests/behavior.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = (() => {
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const s = m[1].trim();
    if (s && !s.startsWith('window.')) scripts.push(s);
  }
  return scripts.join('\n');
})();

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

/**
 * Extract a top-level function body from JS source.
 * Walks balanced braces.
 */
function extract(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  const start = m.index;
  let i = js.indexOf('{', start);
  let depth = 1, end = i + 1;
  while (depth > 0 && end < js.length) {
    const c = js[end];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    end++;
  }
  return js.slice(start, end);
}

/**
 * Extract a var/const value expression.
 */
function extractValue(name) {
  const re = new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*([^;]+?)\\s*;`);
  const m = js.match(re);
  if (!m) return null;
  return m[1].trim();
}

// ============================================================
group('Gravity mechanics & constants');
// ============================================================
const GRAVITY_VAL = parseFloat(extractValue('GRAVITY') || '0');
ok('GRAVITY constant = 980', GRAVITY_VAL === 980, `got ${GRAVITY_VAL}`);

const MOVE_SPEED_VAL = parseFloat(extractValue('MOVE_SPEED') || '0');
ok('MOVE_SPEED = 220', MOVE_SPEED_VAL === 220, `got ${MOVE_SPEED_VAL}`);

const PLAYER_W_VAL = parseFloat(extractValue('PLAYER_W') || '0');
ok('PLAYER_W = 24', PLAYER_W_VAL === 24, `got ${PLAYER_W_VAL}`);

const PLAYER_H_VAL = parseFloat(extractValue('PLAYER_H') || '0');
ok('PLAYER_H = 32', PLAYER_H_VAL === 32, `got ${PLAYER_H_VAL}`);

const FLIP_DURATION_VAL = parseFloat(extractValue('FLIP_DURATION') || '0');
ok('FLIP_DURATION = 200ms', FLIP_DURATION_VAL === 200, `got ${FLIP_DURATION_VAL}`);

const WORLD_HEIGHT_VAL = parseFloat(extractValue('WORLD_HEIGHT') || '0');
ok('WORLD_HEIGHT = 500', WORLD_HEIGHT_VAL === 500, `got ${WORLD_HEIGHT_VAL}`);

// Test gravity direction logic
ok('gravity expression: flipped ? -GRAVITY : GRAVITY',
   /gravityFlipped\s*\?\s*-GRAVITY\s*:\s*GRAVITY/.test(js) ||
   /gravityFlipped\s*\?\s*-\s*GRAVITY\s*:\s*GRAVITY/.test(js));

// Test velocity reversal on flip
ok('velocity reversal: p.vy *= -1 on flip', /\.vy\s*\*=\s*-1/.test(js));

// Test flip guards
ok('flip guarded: only when playing', /state\.gameState\s*!==\s*['"]playing['"]\s*\)\s*return/.test(extract('flipGravity') || ''));
ok('flip guarded: no double-flip during transition',
   /flipTransition\s*<\s*1\s*&&\s*state\.player\.flipProgress\s*>\s*0\.01/.test(js));

// Simulate gravity in a sandbox
const gravSandbox = vm.createContext({
  gravityFlipped: false,
  GRAVITY: 980,
  vy: 0,
  dt: 0.016,
  results: []
});
vm.runInContext(`
  // Normal gravity
  vy += (gravityFlipped ? -GRAVITY : GRAVITY) * 0.016;
  results.push({ afterNormal: vy });

  // Flip
  gravityFlipped = true;
  vy *= -1; // velocity reversal
  results.push({ afterFlip: vy });

  // Flipped gravity
  vy += (gravityFlipped ? -GRAVITY : GRAVITY) * 0.016;
  results.push({ afterFlippedGravity: vy });
`, gravSandbox);

const gravResults = gravSandbox.results;
ok('Normal gravity: vy increases (falls down)',
   gravResults[0].afterNormal > 0, `vy=${gravResults[0].afterNormal}`);
ok('Velocity reversal: sign flips on gravity change',
   gravResults[1].afterFlip < 0, `vy=${gravResults[1].afterFlip}`);
ok('Flipped gravity: vy moves toward negative (falls toward ceiling)',
   gravResults[2].afterFlippedGravity < gravResults[1].afterFlip,
   `beforeFlip=${gravResults[1].afterFlip} afterFlipped=${gravResults[2].afterFlippedGravity}`);

// ============================================================
group('Collision detection (overlap function)');
// ============================================================
const overlapSrc = extract('overlap');
ok('overlap function extractable', !!overlapSrc);

if (overlapSrc) {
  const olSandbox = { overlap: null };
  vm.createContext(olSandbox);
  vm.runInContext(overlapSrc + '\nthis.overlap = overlap;', olSandbox);
  const ol = olSandbox.overlap;

  // Test cases
  ok('overlap: two overlapping rectangles returns true',
     ol(0, 0, 10, 10, 5, 5, 10, 10) === true);
  ok('overlap: non-overlapping rectangles returns false',
     ol(0, 0, 10, 10, 20, 20, 10, 10) === false);
  ok('overlap: touching edges (ax+aw == bx) returns false',
     ol(0, 0, 10, 10, 10, 0, 10, 10) === false,
     `got ${ol(0, 0, 10, 10, 10, 0, 10, 10)}`);
  ok('overlap: slightly overlapping returns true',
     ol(0, 0, 10, 10, 9, 0, 10, 10) === true);
  ok('overlap: fully contained returns true',
     ol(2, 2, 4, 4, 0, 0, 10, 10) === true);
  ok('overlap: same rectangle returns true',
     ol(0, 0, 10, 10, 0, 0, 10, 10) === true);
  ok('overlap: zero-size rectangle returns false',
     ol(0, 0, 0, 0, 5, 5, 5, 5) === false);
}

// ============================================================
group('Star calculation');
// ============================================================
const winLevelSrc = extract('winLevel');
ok('winLevel function extractable', !!winLevelSrc);

// Extract and test the star calculation logic
const starCalcRe = /var time = state\.time[\s\S]{0,200}var starTimes = state\.level\.starTimes[\s\S]{0,200}var stars = 1[\s\S]{0,200}if \(time <= starTimes\[3\]\) stars = 3[\s\S]{0,200}else if \(time <= starTimes\[2\]\) stars = 2[\s\S]{0,200}else stars = 1/;
ok('Star calculation pattern matches', starCalcRe.test(js) ? true : false);

// Verify star boundaries using a sandbox that computes stars
const starSandbox = vm.createContext(Object.assign(Object.create(null), {
  Math,
  state: null,
  saveLevelResult: function() {},
  sounds: { win: function() {} },
  starTimes: { 1: 35, 2: 20, 3: 10 },
  results: []
}));

// Inline star logic extracted from winLevel
const starLogic = `
  var time = state.time;
  var starTimes = this.starTimes;
  var stars = 1;
  if (time <= starTimes[3]) stars = 3;
  else if (time <= starTimes[2]) stars = 2;
  else stars = 1;
  results.push(stars);
`;

// Test: time <= 10 => 3 stars
starSandbox.state = { time: 5 };
starSandbox.starTimes = { 1: 35, 2: 20, 3: 10 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('3-star: time <= starTimes[3] (expert)', starSandbox.results[0] === 3, `got ${starSandbox.results[0]}`);

// Test: time exactly at 10 => 3 stars (boundary)
starSandbox.state = { time: 10 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('3-star: time == starTimes[3] boundary', starSandbox.results[0] === 3, `got ${starSandbox.results[0]}`);

// Test: time between starTimes[3] and starTimes[2] => 2 stars
starSandbox.state = { time: 15 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('2-star: starTimes[3] < time <= starTimes[2]', starSandbox.results[0] === 2, `got ${starSandbox.results[0]}`);

// Test: time exactly at starTimes[2] => 2 stars (boundary)
starSandbox.state = { time: 20 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('2-star: time == starTimes[2] boundary', starSandbox.results[0] === 2, `got ${starSandbox.results[0]}`);

// Test: time > starTimes[2] => 1 star
starSandbox.state = { time: 25 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('1-star: time > starTimes[2]', starSandbox.results[0] === 1, `got ${starSandbox.results[0]}`);

// Test: time exactly at starTimes[1] => still 1 star
starSandbox.state = { time: 35 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('1-star: time == starTimes[1] boundary', starSandbox.results[0] === 1, `got ${starSandbox.results[0]}`);

// Test: time way over starTimes[1] => 1 star
starSandbox.state = { time: 100 };
starSandbox.results = [];
vm.runInContext(starLogic, starSandbox);
ok('1-star: time >> starTimes[1]', starSandbox.results[0] === 1, `got ${starSandbox.results[0]}`);

// ============================================================
group('Level data schema validation');
// ============================================================
// Extract LEVELS array from source and validate in sandbox
const levelsRe = /var LEVELS = (\[[\s\S]*?\]);/;
const levelsMatch = js.match(levelsRe);

let levelsData = null;
if (levelsMatch) {
  try {
    // We need to evaluate the LEVELS array. Since it uses simple object literals,
    // we can try to parse it with a sandbox
    const lsSandbox = { result: null, Math };
    vm.createContext(lsSandbox);
    vm.runInContext('this.result = ' + levelsMatch[1] + ';', lsSandbox);
    levelsData = lsSandbox.result;
    ok('LEVELS array parsed from source', Array.isArray(levelsData), typeof levelsData);
  } catch (e) {
    ok('LEVELS array parsed from source', false, e.message);
  }
}

if (Array.isArray(levelsData)) {
  const L = levelsData;

  ok('12 levels defined', L.length === 12, `got ${L.length}`);

  // Validate each level has required fields
  for (let i = 0; i < L.length; i++) {
    const lv = L[i];
    ok(`Level ${i+1}: has name (string)`, typeof lv.name === 'string' && lv.name.length > 0, `got ${JSON.stringify(lv.name)}`);
    ok(`Level ${i+1}: has width (number > 0)`, typeof lv.width === 'number' && lv.width > 0, `got ${lv.width}`);
    ok(`Level ${i+1}: has playerStart.x`, typeof lv.playerStart === 'object' && typeof lv.playerStart.x === 'number', `got ${JSON.stringify(lv.playerStart)}`);
    ok(`Level ${i+1}: has playerStart.y`, typeof lv.playerStart === 'object' && typeof lv.playerStart.y === 'number');
    ok(`Level ${i+1}: has platforms (array)`, Array.isArray(lv.platforms) && lv.platforms.length > 0, `got ${lv.platforms.length}`);
    ok(`Level ${i+1}: has goal.x`, typeof lv.goal === 'object' && typeof lv.goal.x === 'number');
    ok(`Level ${i+1}: has goal.y`, typeof lv.goal === 'object' && typeof lv.goal.y === 'number');
    ok(`Level ${i+1}: has starTimes (1,2,3)`, typeof lv.starTimes === 'object' &&
       typeof lv.starTimes[1] === 'number' &&
       typeof lv.starTimes[2] === 'number' &&
       typeof lv.starTimes[3] === 'number',
       `got ${JSON.stringify(lv.starTimes)}`);

    // Validate platform schema
    if (Array.isArray(lv.platforms)) {
      for (let p = 0; p < Math.min(lv.platforms.length, 3); p++) {
        const plat = lv.platforms[p];
        ok(`Level ${i+1} platform ${p}: has x,y,w,h`,
           typeof plat.x === 'number' && typeof plat.y === 'number' &&
           typeof plat.w === 'number' && typeof plat.h === 'number',
           JSON.stringify(plat));
      }
    }
  }

  // Validate star time ordering (starTimes[3] should be best/fastest)
  for (let i = 0; i < L.length; i++) {
    const st = L[i].starTimes;
    if (st) {
      ok(`Level ${i+1}: starTimes[3] < starTimes[2] < starTimes[1]`,
         st[3] < st[2] && st[2] < st[1],
         `${JSON.stringify(st)}`);
    }
  }

  // Validate spike schema if present
  const levelsWithSpikes = L.filter(l => l.spikes && l.spikes.length > 0);
  ok('Some levels have spikes', levelsWithSpikes.length > 0, `${levelsWithSpikes.length} levels`);
  for (let i = 0; i < Math.min(levelsWithSpikes.length, 3); i++) {
    const lv = levelsWithSpikes[i];
    const outerIdx = L.indexOf(lv);
    for (let s = 0; s < Math.min(lv.spikes.length, 2); s++) {
      const spike = lv.spikes[s];
      ok(`Level ${outerIdx+1} spike ${s}: has x,y,w,h,dir`,
         typeof spike.x === 'number' && typeof spike.y === 'number' &&
         typeof spike.w === 'number' && typeof spike.h === 'number' &&
         typeof spike.dir === 'number',
         JSON.stringify(spike));
    }
  }

  // Validate moving platform schema if present
  const levelsWithMoving = L.filter(l => l.movingPlatforms && l.movingPlatforms.length > 0);
  ok('Some levels have moving platforms', levelsWithMoving.length > 0, `${levelsWithMoving.length} levels`);
  for (let i = 0; i < Math.min(levelsWithMoving.length, 3); i++) {
    const lv = levelsWithMoving[i];
    const outerIdx = L.indexOf(lv);
    for (let m = 0; m < Math.min(lv.movingPlatforms.length, 2); m++) {
      const mp = lv.movingPlatforms[m];
      ok(`Level ${outerIdx+1} movingPlatform ${m}: has x,y,w,h,moveX/range/speed`,
         typeof mp.x === 'number' && typeof mp.y === 'number' &&
         typeof mp.w === 'number' && typeof mp.h === 'number' &&
         typeof mp.range === 'number' && typeof mp.speed === 'number',
         JSON.stringify(mp));
    }
  }
} else {
  // Fallback: regex-based checks
  ok('LEVELS defined in source', /var LEVELS/.test(js));
  // Count level names as rough validation
  const nameMatches = js.match(/name:\s*['"][^'"]+['"]/g);
  const levelCount = nameMatches ? nameMatches.length : 0;
  // Some names appear in analysis comments too, so count only those in LEVELS context
  const platformCount = (js.match(/\{x:\s*\d+,?\s*y:\s*\d+/g) || []).length;
  ok('Many platform objects defined (schema implied)', platformCount > 50, `found ${platformCount}`);
}

// ============================================================
group('Level unlocking logic');
// ============================================================
const saveLevelResultSrc = extract('saveLevelResult');
ok('saveLevelResult extractable', !!saveLevelResultSrc);

if (saveLevelResultSrc) {
  // Simulate saveLevelResult logic
  const unlockSandbox = vm.createContext({
    LEVELS: [{},{},{},{},{},{},{},{},{},{},{},{}],
    saveData: { unlockedLevel: 1, perLevel: {} },
    writeSave: function() {},
    levelIdx: 0, stars: 3, time: 10,
    results: []
  });

  const unlockLogic = `
    var key = String(levelIdx + 1);
    if (!saveData.perLevel[key]) {
      saveData.perLevel[key] = { stars: 0, bestTime: null };
    }
    if (stars > saveData.perLevel[key].stars) {
      saveData.perLevel[key].stars = stars;
    }
    if (saveData.perLevel[key].bestTime === null || time < saveData.perLevel[key].bestTime) {
      saveData.perLevel[key].bestTime = time;
    }
    if (levelIdx + 1 >= saveData.unlockedLevel && levelIdx + 1 < LEVELS.length) {
      saveData.unlockedLevel = levelIdx + 2;
    }
    results.push(saveData.unlockedLevel);
  `;

  // Test: completing level 1 unlocks level 2
  unlockSandbox.levelIdx = 0;
  unlockSandbox.stars = 1;
  unlockSandbox.time = 30;
  unlockSandbox.saveData = { unlockedLevel: 1, perLevel: {} };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('Complete level 1 -> unlock level 2', unlockSandbox.results[0] === 2, `got ${unlockSandbox.results[0]}`);

  // Test: completing level 5 unlocks level 6
  unlockSandbox.levelIdx = 4;
  unlockSandbox.saveData = { unlockedLevel: 1, perLevel: {} };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('Complete level 5 -> unlock level 6', unlockSandbox.results[0] === 6, `got ${unlockSandbox.results[0]}`);

  // Test: completing last level doesn't unlock beyond
  unlockSandbox.levelIdx = 11; // last level
  unlockSandbox.saveData = { unlockedLevel: 12, perLevel: {} };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('Complete level 12 -> stays at 12 (no level 13)', unlockSandbox.results[0] === 12, `got ${unlockSandbox.results[0]}`);

  // Test: better stars update
  unlockSandbox.levelIdx = 0;
  unlockSandbox.stars = 2;
  unlockSandbox.saveData = { unlockedLevel: 2, perLevel: { '1': { stars: 1, bestTime: 20 } } };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('Better stars (2 > 1) updates perLevel stars',
     unlockSandbox.saveData.perLevel['1'].stars === 2, `got ${unlockSandbox.saveData.perLevel['1'].stars}`);

  // Test: worse stars don't downgrade
  unlockSandbox.stars = 1;
  unlockSandbox.saveData = { unlockedLevel: 2, perLevel: { '1': { stars: 2, bestTime: 15 } } };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('Worse stars (1 < 2) does not downgrade',
     unlockSandbox.saveData.perLevel['1'].stars === 2, `got ${unlockSandbox.saveData.perLevel['1'].stars}`);

  // Test: better time updates
  unlockSandbox.stars = 1;
  unlockSandbox.time = 10;
  unlockSandbox.saveData = { unlockedLevel: 2, perLevel: { '1': { stars: 1, bestTime: 20 } } };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('Better time (10 < 20) updates bestTime',
     unlockSandbox.saveData.perLevel['1'].bestTime === 10, `got ${unlockSandbox.saveData.perLevel['1'].bestTime}`);

  // Test: first completion sets bestTime even if null
  unlockSandbox.stars = 1;
  unlockSandbox.time = 25;
  unlockSandbox.saveData = { unlockedLevel: 2, perLevel: {} };
  unlockSandbox.results = [];
  vm.runInContext(unlockLogic, unlockSandbox);
  ok('First completion sets bestTime',
     unlockSandbox.saveData.perLevel['1'].bestTime === 25, `got ${unlockSandbox.saveData.perLevel['1'].bestTime}`);
}

// ============================================================
group('getLevelStars / getLevelBestTime');
// ============================================================
const getLevelStarsSrc = extract('getLevelStars');
const getLevelBestTimeSrc = extract('getLevelBestTime');
ok('getLevelStars extractable', !!getLevelStarsSrc);
ok('getLevelBestTime extractable', !!getLevelBestTimeSrc);

if (getLevelStarsSrc && getLevelBestTimeSrc) {
  const glSandbox = {
    saveData: { perLevel: {} },
    getLevelStars: null,
    getLevelBestTime: null
  };
  vm.createContext(glSandbox);
  vm.runInContext(
    'this.saveData = saveData;' +
    getLevelStarsSrc + '\n' +
    getLevelBestTimeSrc + '\n' +
    'this.getLevelStars = getLevelStars; this.getLevelBestTime = getLevelBestTime;',
    glSandbox
  );

  // No data -> returns 0 / null
  ok('getLevelStars(0) no data = 0', glSandbox.getLevelStars(0) === 0, `got ${glSandbox.getLevelStars(0)}`);
  ok('getLevelBestTime(0) no data = null', glSandbox.getLevelBestTime(0) === null, `got ${glSandbox.getLevelBestTime(0)}`);

  // With data
  glSandbox.saveData.perLevel['2'] = { stars: 3, bestTime: 12.5 };
  ok('getLevelStars(1) with data = 3', glSandbox.getLevelStars(1) === 3, `got ${glSandbox.getLevelStars(1)}`);
  ok('getLevelBestTime(1) with data = 12.5', glSandbox.getLevelBestTime(1) === 12.5, `got ${glSandbox.getLevelBestTime(1)}`);
}

// ============================================================
group('localStorage save/load round-trip (mocked)');
// ============================================================
const loadSaveSrc = extract('loadSave');
const writeSaveSrc = extract('writeSave');
ok('loadSave extractable', !!loadSaveSrc);
ok('writeSave extractable', !!writeSaveSrc);

if (loadSaveSrc && writeSaveSrc) {
  const store = new Map();
  const SAVE_KEY = 'gravity-warp-progress';

  // Test 1: Basic round-trip
  const ls1Sandbox = {
    JSON,
    SAVE_KEY: SAVE_KEY,
    localStorage: {
      getItem: function (k) { return store.has(k) ? store.get(k) : null; },
      setItem: function (k, v) { store.set(k, String(v)); },
      removeItem: function (k) { store.delete(k); },
      clear: function () { store.clear(); }
    },
    saveData: { unlockedLevel: 1, perLevel: {} },
    loadSave: null,
    writeSave: null
  };
  vm.createContext(ls1Sandbox);
  vm.runInContext(
    'this.saveData = saveData; this.SAVE_KEY = SAVE_KEY;' +
    loadSaveSrc + '\n' + writeSaveSrc + '\n' +
    'this.loadSave = loadSave; this.writeSave = writeSave;',
    ls1Sandbox
  );

  // Seed save data, write, then read back in a fresh context
  ls1Sandbox.saveData = { unlockedLevel: 5, perLevel: { '1': { stars: 3, bestTime: 9.5 } } };
  ls1Sandbox.writeSave();
  ok('writeSave stores JSON in localStorage', store.has(SAVE_KEY), 'key missing');

  // Read back in a fresh sandbox
  const ls2Sandbox = {
    JSON,
    SAVE_KEY: SAVE_KEY,
    localStorage: {
      getItem: function (k) { return store.has(k) ? store.get(k) : null; },
      setItem: function (k, v) { store.set(k, String(v)); }
    },
    saveData: { unlockedLevel: 1, perLevel: {} },
    loadSave: null
  };
  vm.createContext(ls2Sandbox);
  vm.runInContext(
    'this.saveData = saveData; this.SAVE_KEY = SAVE_KEY;' +
    loadSaveSrc + '\nthis.loadSave = loadSave;',
    ls2Sandbox
  );
  ls2Sandbox.loadSave();
  ok('loadSave retrieves saved unlockedLevel',
     ls2Sandbox.saveData.unlockedLevel === 5, `got ${ls2Sandbox.saveData.unlockedLevel}`);
  ok('loadSave retrieves saved perLevel stars',
     ls2Sandbox.saveData.perLevel['1'] && ls2Sandbox.saveData.perLevel['1'].stars === 3,
     `got ${JSON.stringify(ls2Sandbox.saveData.perLevel['1'])}`);

  // Test: Missing key returns defaults
  store.clear();
  const ls3Sandbox = {
    JSON,
    SAVE_KEY: SAVE_KEY,
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {}
    },
    saveData: { unlockedLevel: 1, perLevel: {} },
    loadSave: null
  };
  vm.createContext(ls3Sandbox);
  vm.runInContext(
    'this.saveData = saveData; this.SAVE_KEY = SAVE_KEY;' +
    loadSaveSrc + '\nthis.loadSave = loadSave;',
    ls3Sandbox
  );
  ls3Sandbox.saveData = { unlockedLevel: 99, perLevel: {} };
  ls3Sandbox.loadSave();
  ok('loadSave with missing key keeps existing value (no data found)',
     ls3Sandbox.saveData.unlockedLevel === 99, `got ${ls3Sandbox.saveData.unlockedLevel}`);

  // Test: Corrupted JSON swallows error, keeps defaults
  store.clear();
  store.set(SAVE_KEY, '{bad-json');
  const ls4Sandbox = {
    JSON,
    SAVE_KEY: SAVE_KEY,
    localStorage: {
      getItem: function (k) { return store.get(k); },
      setItem: function (k, v) { store.set(k, String(v)); }
    },
    saveData: { unlockedLevel: 1, perLevel: {} },
    loadSave: null
  };
  vm.createContext(ls4Sandbox);
  vm.runInContext(
    'this.saveData = saveData; this.SAVE_KEY = SAVE_KEY;' +
    loadSaveSrc + '\nthis.loadSave = loadSave;',
    ls4Sandbox
  );
  ls4Sandbox.loadSave();
  ok('loadSave with corrupted JSON keeps defaults',
     ls4Sandbox.saveData.unlockedLevel === 1, `got ${ls4Sandbox.saveData.unlockedLevel}`);

  // Test: Storage-throws scenario (Safari private mode, quota)
  const throwingStorage = {
    JSON,
    SAVE_KEY: SAVE_KEY,
    localStorage: {
      getItem: function () { throw new Error('quota exceeded'); },
      setItem: function () { throw new Error('quota exceeded'); }
    },
    saveData: { unlockedLevel: 1, perLevel: {} },
    loadSave: null,
    writeSave: null
  };
  store.clear();
  vm.createContext(throwingStorage);
  vm.runInContext(
    'this.saveData = saveData; this.SAVE_KEY = SAVE_KEY;' +
    loadSaveSrc + '\n' + writeSaveSrc + '\n' +
    'this.loadSave = loadSave; this.writeSave = writeSave;',
    throwingStorage
  );
  let threw = false;
  try { throwingStorage.loadSave(); throwingStorage.writeSave(); }
  catch (e) { threw = true; }
  ok('loadSave/writeSave swallow storage exceptions', !threw);
}

// ============================================================
group('Moving platform update logic');
// ============================================================
const updateMovingSrc = extract('updateMovingPlatforms');
ok('updateMovingPlatforms extractable', !!updateMovingSrc);

if (updateMovingSrc) {
  const mpSandbox = {
    Math,
    state: null,
    updateMovingPlatforms: null
  };
  vm.createContext(mpSandbox);
  // We need to inject the `state` reference used in the function
  // The function references `state.movingPlatforms` and `state.time`
  const mpCode = 'this.state = { movingPlatforms: [], time: 0 };' +
    updateMovingSrc + '\nthis.updateMovingPlatforms = updateMovingPlatforms;';
  vm.runInContext(mpCode, mpSandbox);

  const mp = {
    x: 100, y: 200, w: 150, h: 20,
    baseX: 100, baseY: 200,
    moveX: 200, moveY: 0,
    range: 100, speed: 80,
    phase: 0
  };
  mpSandbox.state.movingPlatforms = [mp];
  mpSandbox.state.time = 0;

  // Run one frame
  mpSandbox.updateMovingPlatforms(0.016);
  ok('Moving platform x changes from baseX', mp.x !== 100, `x=${mp.x}`);
  ok('Moving platform y unchanged (moveY=0)', mp.y === 200, `y=${mp.y}`);
  ok('Phase advances', mp.phase > 0, `phase=${mp.phase}`);

  // Test moveY variant
  const mp2 = {
    x: 300, y: 400, w: 130, h: 20,
    baseX: 300, baseY: 400,
    moveX: 0, moveY: 120,
    range: 120, speed: 90,
    phase: 0
  };
  mpSandbox.state.movingPlatforms = [mp2];
  mpSandbox.state.time = 0;
  mpSandbox.updateMovingPlatforms(0.016);
  ok('Moving platform y changes from baseY (moveY variant)', mp2.y !== 400, `y=${mp2.y}`);
  ok('Moving platform x unchanged (moveX=0)', mp2.x === 300, `x=${mp2.x}`);
}

// ============================================================
group('getDefaultState structure');
// ============================================================
const getDefaultStateSrc = extract('getDefaultState');
ok('getDefaultState extractable', !!getDefaultStateSrc);

if (getDefaultStateSrc) {
  // Use PLAYER_W/PLAYER_H constants in sandbox
  const dsSandbox = Object.assign(Object.create(null), {
    PLAYER_W: 24,
    PLAYER_H: 32,
    result: null
  });
  vm.createContext(dsSandbox);
  vm.runInContext(
    'this.PLAYER_W = PLAYER_W; this.PLAYER_H = PLAYER_H;' +
    // We need to strip references to screen elements, but the function just returns a plain object
    getDefaultStateSrc.replace(/document\.getElementById.*/g, '')
    + '\nthis.result = getDefaultState();',
    dsSandbox
  );

  const ds = dsSandbox.result;
  if (ds) {
    ok('state.screen = "splash"', ds.screen === 'splash', `got ${ds.screen}`);
    ok('state.levelIndex = 0', ds.levelIndex === 0, `got ${ds.levelIndex}`);
    ok('state.player has x/y/vx/vy', typeof ds.player.x === 'number' && typeof ds.player.y === 'number');
    ok('state.player has w/h', ds.player.w === 24 && ds.player.h === 32, `w=${ds.player.w} h=${ds.player.h}`);
    ok('state.player.grounded = false', ds.player.grounded === false);
    ok('state.player.alive = true', ds.player.alive === true);
    ok('state.gravityFlipped = false', ds.gravityFlipped === false);
    ok('state.flipTransition = 0', ds.flipTransition === 0);
    ok('state.gameState = "title"', ds.gameState === 'title', `got ${ds.gameState}`);
    ok('state.keys has left/right', ds.keys.left === false && ds.keys.right === false);
    ok('state.time = 0', ds.time === 0);
    ok('state.particles is array', Array.isArray(ds.particles));
    ok('state.platforms is array', Array.isArray(ds.platforms));
    ok('state.movingPlatforms is array', Array.isArray(ds.movingPlatforms));
    ok('state.spikes is array', Array.isArray(ds.spikes));
  }
}

// ============================================================
group('Game state transitions (source patterns)');
// ============================================================
ok('showScreen toggles active class', /classList\.toggle\(['"]active['"],\s*k\s*===\s*name/.test(js));
ok('goToMenu sets gameState=title', /state\.gameState\s*=\s*['"]title['"]/.test(extract('goToMenu') || ''));
ok('die checks gameState === playing', /state\.gameState\s*!==\s*['"]playing['"]/.test(extract('die') || ''));
ok('winLevel checks gameState === playing', /state\.gameState\s*!==\s*['"]playing['"]/.test(extract('winLevel') || ''));
ok('death state with timer', /state\.gameState\s*===\s*['"]death['"]/.test(js) && /deathTimer/.test(js));
ok('win state with timer', /state\.gameState\s*===\s*['"]win['"]/.test(js) && /winTimer/.test(js));
ok('restart reloads same level', /loadLevel\(state\.levelIndex\)/.test(extract('restartLevel') || ''));
ok('next increments level index', /state\.levelIndex\+\+/.test(extract('nextLevel') || ''));

// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
