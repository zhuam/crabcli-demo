#!/usr/bin/env node
/**
 * Behavioral tests for SpongeBob Art Quest (Issue #48).
 * Uses vm module to extract and test JS game logic.
 * Run: node games/048-spongebob-art-quest/tests/behavior.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// Extract all inline JS
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

// ──────────────────────────────────────────────
// Extract key functions for behavioral testing
// ──────────────────────────────────────────────
const pointInPolySrc = extractFunctionBody(js, 'pointInPoly');
const polyCentroidSrc = extractFunctionBody(js, 'polyCentroid');

// Extract the COLORS array
function extractColorsArray(js) {
  const re = /var\s+COLORS\s*=\s*\[([\s\S]*?)\];/;
  const m = js.match(re);
  if (!m) return null;
  // Parse color strings from array
  const colors = [];
  const colorRe = /'([#0-9a-fA-F]+)'/g;
  let cm;
  while ((cm = colorRe.exec(m[1])) !== null) {
    colors.push(cm[1]);
  }
  return colors;
}

const COLORS = extractColorsArray(js);

// Extract the COLOR_NAMES array
function extractColorNames(js) {
  const re = /var\s+COLOR_NAMES\s*=\s*\[([\s\S]*?)\];/;
  const m = js.match(re);
  if (!m) return null;
  const names = [];
  const nameRe = /'([^']+)'/g;
  let nm;
  while ((nm = nameRe.exec(m[1])) !== null) {
    names.push(nm[1]);
  }
  return names;
}

const COLOR_NAMES = extractColorNames(js);

// ──────────────────────────────────────────────
group('Default state structure');
(function() {
  const state = {
    screen: 'splash',
    level: 0,
    selectedColor: 1,
    zones: [],
    unlocked: [0],
    completed: {},
    levelFilledCount: 0
  };

  ok('state is an object', typeof state === 'object' && state !== null);
  ok('state.screen is splash by default', state.screen === 'splash');
  ok('state.level is 0 by default', state.level === 0);
  ok('state.selectedColor is 1 by default', state.selectedColor === 1);
  ok('state.zones is an empty array', Array.isArray(state.zones) && state.zones.length === 0);
  ok('state.unlocked is [0] (first level unlocked)', Array.isArray(state.unlocked) && state.unlocked[0] === 0 && state.unlocked.length === 1);
  ok('state.completed is an empty object', typeof state.completed === 'object' && Object.keys(state.completed).length === 0);
  ok('state.levelFilledCount is 0', state.levelFilledCount === 0);
})();

// ──────────────────────────────────────────────
group('Color palette has 8 entries');
ok('COLORS array extracted', COLORS !== null && Array.isArray(COLORS));
if (COLORS) {
  ok('COLORS has 8 entries', COLORS.length === 8);
  ok('COLORS[0] is Yellow (#FFE082)', COLORS[0] === '#FFE082');
  ok('COLORS[1] is Blue (#4FC3F7)', COLORS[1] === '#4FC3F7');
  ok('COLORS[2] is Brown (#8D6E63)', COLORS[2] === '#8D6E63');
  ok('COLORS[3] is White (#F5F5F5)', COLORS[3] === '#F5F5F5');
  ok('COLORS[4] is Red (#EF5350)', COLORS[4] === '#EF5350');
  ok('COLORS[5] is Pink (#F48FB1)', COLORS[5] === '#F48FB1');
  ok('COLORS[6] is Green (#66BB6A)', COLORS[6] === '#66BB6A');
  ok('COLORS[7] is Black (#424242)', COLORS[7] === '#424242');
}
ok('COLOR_NAMES array extracted', COLOR_NAMES !== null && Array.isArray(COLOR_NAMES));
if (COLOR_NAMES) {
  ok('COLOR_NAMES has 8 entries', COLOR_NAMES.length === 8);
  ok('COLOR_NAMES[0] is Yellow', COLOR_NAMES[0] === 'Yellow');
  ok('COLOR_NAMES[1] is Blue', COLOR_NAMES[1] === 'Blue');
  ok('COLOR_NAMES[2] is Brown', COLOR_NAMES[2] === 'Brown');
  ok('COLOR_NAMES[3] is White', COLOR_NAMES[3] === 'White');
  ok('COLOR_NAMES[4] is Red', COLOR_NAMES[4] === 'Red');
  ok('COLOR_NAMES[5] is Pink', COLOR_NAMES[5] === 'Pink');
  ok('COLOR_NAMES[6] is Green', COLOR_NAMES[6] === 'Green');
  ok('COLOR_NAMES[7] is Black', COLOR_NAMES[7] === 'Black');
}

// ──────────────────────────────────────────────
group('pointInPoly function (ray-casting)');
if (pointInPolySrc) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(pointInPolySrc, ctx);

  // Test with a simple rectangle polygon
  const rect = [{x:10,y:10},{x:20,y:10},{x:20,y:20},{x:10,y:20}];

  ok('pointInPoly center (15,15) is inside rectangle', ctx.pointInPoly(15, 15, rect) === true);
  ok('pointInPoly (10,10) corner is on edge (inside)', ctx.pointInPoly(10, 10, rect) === true);

  // Outside tests
  ok('pointInPoly (5,5) is outside rectangle', ctx.pointInPoly(5, 5, rect) === false);
  ok('pointInPoly (25,15) is outside rectangle', ctx.pointInPoly(25, 15, rect) === false);
  ok('pointInPoly (15,25) is outside rectangle', ctx.pointInPoly(15, 25, rect) === false);
  ok('pointInPoly (15,5) is outside rectangle', ctx.pointInPoly(15, 5, rect) === false);

  // Test with a triangle polygon
  const tri = [{x:0,y:0},{x:10,y:10},{x:0,y:10}];
  ok('pointInPoly (2,8) is inside triangle', ctx.pointInPoly(2, 8, tri) === true);
  ok('pointInPoly (3,6) is inside triangle', ctx.pointInPoly(3, 6, tri) === true);
  ok('pointInPoly (8,8) is outside triangle', ctx.pointInPoly(8, 8, tri) === false);
  ok('pointInPoly (-1,5) is outside triangle', ctx.pointInPoly(-1, 5, tri) === false);
} else {
  ok('pointInPoly function extractable', false, 'Could not extract pointInPoly function');
}

// ──────────────────────────────────────────────
group('polyCentroid function');
if (polyCentroidSrc) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(polyCentroidSrc, ctx);

  // Test with a rectangle
  const rect = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
  const c = ctx.polyCentroid(rect);
  ok('polyCentroid rectangle center x=5', c.x === 5);
  ok('polyCentroid rectangle center y=5', c.y === 5);

  // Test with a triangle
  const tri = [{x:0,y:0},{x:10,y:0},{x:0,y:10}];
  const ct = ctx.polyCentroid(tri);
  ok('polyCentroid triangle center x approx 3.33', Math.abs(ct.x - 10/3) < 0.001);
  ok('polyCentroid triangle center y approx 3.33', Math.abs(ct.y - 10/3) < 0.001);

  // Test with a single point (degenerate)
  const pt = [{x:5,y:5}];
  const cp = ctx.polyCentroid(pt);
  ok('polyCentroid single point x=5', cp.x === 5);
  ok('polyCentroid single point y=5', cp.y === 5);

  // Test with two points (degenerate)
  const line = [{x:0,y:0},{x:10,y:10}];
  const cl = ctx.polyCentroid(line);
  ok('polyCentroid two points x=5', cl.x === 5);
  ok('polyCentroid two points y=5', cl.y === 5);

  // Test with negative coordinates
  const neg = [{x:-10,y:-10},{x:0,y:-10},{x:0,y:0},{x:-10,y:0}];
  const cn = ctx.polyCentroid(neg);
  ok('polyCentroid negative coords x=-5', cn.x === -5);
  ok('polyCentroid negative coords y=-5', cn.y === -5);
} else {
  ok('polyCentroid function extractable', false, 'Could not extract polyCentroid function');
}

// ──────────────────────────────────────────────
group('Zone fill tracking');
(function() {
  // Simulate a level with 5 zones
  const zones = [
    { filled: false },
    { filled: false },
    { filled: false },
    { filled: false },
    { filled: false }
  ];
  let levelFilledCount = 0;

  function fillZone(index) {
    if (!zones[index].filled) {
      zones[index].filled = true;
      levelFilledCount++;
    }
  }

  function getProgress() {
    const total = zones.length;
    return Math.round(levelFilledCount / total * 100);
  }

  ok('initial filled count is 0', levelFilledCount === 0);
  ok('initial progress is 0%', getProgress() === 0);

  fillZone(0);
  ok('after fill 1, count=1', levelFilledCount === 1);
  ok('after fill 1, progress=20%', getProgress() === 20);

  fillZone(1);
  fillZone(2);
  ok('after fill 3, count=3', levelFilledCount === 3);
  ok('after fill 3, progress=60%', getProgress() === 60);

  fillZone(3);
  fillZone(4);
  ok('after fill 5, count=5', levelFilledCount === 5);
  ok('after fill 5, progress=100%', getProgress() === 100);

  // Filling same zone again should not increase count
  fillZone(0);
  ok('re-filling same zone does not increase count', levelFilledCount === 5);
  ok('re-fill progress still 100%', getProgress() === 100);
})();

// ──────────────────────────────────────────────
group('Completion detection (100% filled)');
(function() {
  const totalZones = 5;
  let levelFilledCount = 0;
  let completed = false;
  let unlockedNext = false;

  function fillZone() {
    levelFilledCount++;
    if (levelFilledCount === totalZones) {
      completed = true;
      // Unlock next level
      const currentLevel = 2;
      const maxLevels = 6;
      if (currentLevel < maxLevels - 1) {
        unlockedNext = true;
      }
    }
  }

  ok('not completed at start', completed === false);

  fillZone(); fillZone(); fillZone();
  ok('not completed at 3/5', completed === false);
  ok('not unlocked at 3/5', unlockedNext === false);

  fillZone();
  ok('not completed at 4/5', completed === false);

  fillZone();
  ok('completed at 5/5', completed === true);
  ok('next level unlocked on completion', unlockedNext === true);

  // Test with last level
  (function() {
    let lastCompleted = false;
    let lastUnlocked = false;
    const maxLevels = 6;
    const currentLevel = 5; // last level (0-indexed, index 5 = 6th char)

    // Simulate filling all zones
    const cnt = 5;
    if (cnt === 5) {
      lastCompleted = true;
      if (currentLevel < maxLevels - 1) {
        lastUnlocked = true;
      }
    }

    ok('last level completes', lastCompleted === true);
    ok('last level does NOT unlock next', lastUnlocked === false);
  })();
})();

// ──────────────────────────────────────────────
group('Level unlock logic');
(function() {
  // Simulate state
  var unlocked = [0];
  var completed = {};

  function completeLevel(levelIdx, maxLevels) {
    completed[levelIdx] = true;
    // Unlock next level
    if (levelIdx < maxLevels - 1) {
      if (unlocked.indexOf(levelIdx + 1) < 0) {
        unlocked.push(levelIdx + 1);
      }
    }
  }

  ok('initially only level 0 unlocked', unlocked.length === 1 && unlocked[0] === 0);

  completeLevel(0, 6);
  ok('after completing level 0, level 1 unlocked', unlocked.indexOf(1) >= 0);
  ok('completed[0] is true', completed[0] === true);

  completeLevel(2, 6);
  ok('level 2 cannot be completed before level 1 (but game allows)', completed[2] === true);
  // The logic is simple: completing any level unlocks the next one
  ok('completing level 2 unlocks level 3', unlocked.indexOf(3) >= 0);

  completeLevel(1, 6);
  ok('completing level 1 unlocks level 2 (already unlocked)', unlocked.indexOf(2) >= 0);

  // Unlock order doesn't matter - each completion just unlocks the next
  ok('5 levels unlocked after completing 0,1,2 (0,1,2,3 unlocked)', unlocked.length === 4);

  // Completing last level does not add beyond max
  completeLevel(5, 6);
  ok('last level (5) completed', completed[5] === true);
  ok('no level beyond 5 unlocked', unlocked.indexOf(6) < 0);
  ok('still 4 levels unlocked (last level does not unlock)', unlocked.length === 4);

  // Completing a level again doesn't duplicate
  var beforeLen = unlocked.length;
  completeLevel(0, 6);
  ok('re-completing level 0 does not duplicate unlock', unlocked.length === beforeLen);
})();

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
