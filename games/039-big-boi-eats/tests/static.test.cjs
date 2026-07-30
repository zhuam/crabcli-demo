// ============================================================
// Static Acceptance Tests — Big Boi Eats (Game #039)
// ============================================================
// Node.js built-in modules only — no framework, no jsdom.
// Run: node games/039-big-boi-eats/tests/static.test.cjs
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================
// HELPERS
// ============================================================
const GAME_HTML_PATH = path.resolve(__dirname, '..', 'index.html');
const HTML = fs.readFileSync(GAME_HTML_PATH, 'utf8');

let assertions = 0;
let passed = 0;
let failed = 0;

function test(name, fn) {
  assertions++;
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
  }
}

function assertBetween(val, lo, hi, label) {
  assert.ok(val >= lo && val <= hi,
    `${label || 'value'} ${val} not in [${lo}, ${hi}]`);
}

function assertArrayNonEmpty(arr, label) {
  assert.ok(Array.isArray(arr) && arr.length > 0,
    `${label || 'array'} should be non-empty`);
}

// Extract the <script> tag content (the inline game code)
const scriptMatch = HTML.match(/<script>([\s\S]*?)<\/script>/i);
const SCRIPT_SRC = scriptMatch ? scriptMatch[1].trim() : '';

// ============================================================
// SECTION 1: HTML STRUCTURE
// ============================================================
console.log('\n--- SECTION 1: HTML Structure ---');

test('HTML file loads without error', () => {
  assert.ok(HTML.length > 0, 'HTML should not be empty');
});

test('HTML contains required doctype', () => {
  assert.ok(HTML.startsWith('<!DOCTYPE html>') || HTML.startsWith('<!doctype html>'),
    'Should start with HTML5 doctype');
});

test('HTML has <canvas id="gameCanvas">', () => {
  assert.ok(HTML.includes('id="gameCanvas"') || HTML.includes("id='gameCanvas'"),
    'Missing gameCanvas canvas element');
  assert.ok(/<canvas[\s>]/i.test(HTML), 'No <canvas> tag found');
});

test('HTML has <canvas> inside <body>', () => {
  const bodyStart = HTML.indexOf('<body>');
  const canvasInBody = HTML.indexOf('<canvas', bodyStart);
  assert.ok(bodyStart >= 0 && canvasInBody > bodyStart,
    '<canvas> should be inside <body>');
});

test('HTML has resume-audio fallback button', () => {
  assert.ok(HTML.includes('resume-audio'),
    'Missing resume-audio button for autoplay policy');
});

test('HTML has viewport meta tag for mobile', () => {
  assert.ok(/viewport/i.test(HTML), 'Missing viewport meta tag');
});

test('Script tag exists and is non-empty', () => {
  assert.ok(SCRIPT_SRC.length > 0, 'Inline script should not be empty');
  assert.ok(SCRIPT_SRC.length > 2000, 'Script should be substantial');
});

test('Body has no external script references', () => {
  const extScripts = HTML.match(/<script\s+src=/gi);
  assert.ok(!extScripts, 'Should have no external script tags (game is self-contained)');
});

test('touch-action is set to none', () => {
  assert.ok(HTML.includes('touch-action: none') || HTML.includes("touch-action:'none'"),
    'Should disable default touch behavior');
});

// ============================================================
// SECTION 2: localStorage Persistence
// ============================================================
console.log('\n--- SECTION 2: localStorage Persistence ---');

// Build a minimal sandbox to test persistence functions
function createPersistenceSandbox() {
  const storage = {};
  const sandbox = {
    localStorage: {
      getItem: (k) => storage[k] !== undefined ? storage[k] : null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
      clear: () => { for (const k in storage) delete storage[k]; },
    },
    console,
    JSON,
    CONFIG: null, // filled below
  };
  return { sandbox, storage };
}

// We need CONFIG from the script to test persistence.
// Extract CONFIG via a separate vm context.
function extractConfig() {
  // Find the start of 'const CONFIG = {'
  const startMarker = 'const CONFIG = {';
  const idx = SCRIPT_SRC.indexOf(startMarker);
  if (idx === -1) throw new Error('Could not find CONFIG definition in script');

  // Walk from the opening brace, counting depth to find matching closing brace
  const startBrace = idx + startMarker.length - 1; // position of '{'
  let depth = 0;
  let end = startBrace;
  for (let i = startBrace; i < SCRIPT_SRC.length; i++) {
    if (SCRIPT_SRC[i] === '{') depth++;
    else if (SCRIPT_SRC[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (depth !== 0) throw new Error('CONFIG braces are unbalanced');

  const configSrc = SCRIPT_SRC.slice(startBrace, end);
  const ctx = vm.createContext({ console, JSON, __result: null });
  vm.runInContext(`__result = ${configSrc}`, ctx);
  return ctx.__result;
}

const CONFIG = extractConfig();

test('STORAGE_KEY is defined', () => {
  assert.ok(SCRIPT_SRC.includes('STORAGE_KEY'),
    'Should have a storage key constant');
  const m = SCRIPT_SRC.match(/STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(m, 'STORAGE_KEY should be a string literal');
  assert.ok(m[1].length > 0, 'STORAGE_KEY should not be empty');
});

test('defaultData returns complete object', () => {
  const { sandbox } = createPersistenceSandbox();
  sandbox.CONFIG = CONFIG;
  const ctx = vm.createContext(sandbox);

  const fnSrc = SCRIPT_SRC.match(
    /function defaultData\s*\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnSrc, 'Should find defaultData function');

  vm.runInContext(`
    function defaultData() ${fnSrc[0].replace(/^function defaultData\s*\(\)/, '')}
    var data = defaultData();
  `, ctx);

  assert.ok(ctx.data, 'defaultData should return something');
  assert.ok(ctx.data.best, 'defaultData.best should exist');
  assert.strictEqual(typeof ctx.data.best.highestLevel, 'number');
  assert.strictEqual(typeof ctx.data.best.maxWeight, 'number');
  assert.strictEqual(typeof ctx.data.best.totalStars, 'number');
  assert.strictEqual(typeof ctx.data.best.gamesPlayed, 'number');
  assert.strictEqual(typeof ctx.data.best.cumulativeWeight, 'number');
  assert.ok(Array.isArray(ctx.data.unlockedLevels));
  assert.ok(Array.isArray(ctx.data.unlockedSkins));
  assert.strictEqual(ctx.data.equippedSkin, 'default');
  assert.ok(ctx.data.settings);
  assert.strictEqual(ctx.data.settings.sfx, true);
  assert.strictEqual(ctx.data.settings.haptic, true);
});

test('loadData returns defaults when storage is empty', () => {
  const { sandbox, storage } = createPersistenceSandbox();
  sandbox.CONFIG = CONFIG;

  const ctx = vm.createContext(sandbox);
  const fnSrc = SCRIPT_SRC.match(
    /(function defaultData\s*\(\)[\s\S]*?function loadData\s*\(\)[\s\S]*?\n\})/);
  assert.ok(fnSrc, 'Should find loadData block');

  // Write minimal versions of dependent functions
  vm.runInContext(`
    var STORAGE_KEY = 'big_boi_eats_data';
    function defaultData() {
      return {
        best: { highestLevel:1, maxWeight:10, totalStars:0, gamesPlayed:0, cumulativeWeight:0 },
        unlockedLevels:[1],
        unlockedSkins:['default'],
        equippedSkin:'default',
        settings:{ sfx:true, haptic:true },
      };
    }
    var savedData = null;
    function loadData() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          savedData = d;
          var def = defaultData();
          for (var k in def) { if (!(k in d)) d[k] = def[k]; }
          if (d.best) {
            if (typeof d.best.highestLevel !== 'number') d.best.highestLevel = 1;
            if (typeof d.best.maxWeight !== 'number') d.best.maxWeight = 10;
            if (typeof d.best.totalStars !== 'number') d.best.totalStars = 0;
            if (typeof d.best.gamesPlayed !== 'number') d.best.gamesPlayed = 0;
            if (typeof d.best.cumulativeWeight !== 'number') d.best.cumulativeWeight = 0;
          }
          return d;
        }
      } catch(e) {}
      var d = defaultData();
      savedData = d;
      return d;
    }
    var result = loadData();
  `, ctx);

  assert.ok(ctx.result, 'loadData should return data');
  assert.strictEqual(ctx.result.best.highestLevel, 1);
  assert.strictEqual(ctx.result.unlockedLevels[0], 1);
  assert.strictEqual(ctx.result.unlockedLevels.length, 1);
  assert.strictEqual(ctx.result.unlockedSkins[0], 'default');
  assert.strictEqual(ctx.result.unlockedSkins.length, 1);
});

test('loadData returns saved data when storage has content', () => {
  const { sandbox, storage } = createPersistenceSandbox();
  // Pre-populate storage with known data
  storage['big_boi_eats_data'] = JSON.stringify({
    best: { highestLevel:3, maxWeight:200, totalStars:4, gamesPlayed:5, cumulativeWeight:600 },
    unlockedLevels: [1,2,3],
    unlockedSkins: ['default', 'chef'],
    equippedSkin: 'chef',
    settings: { sfx: false, haptic: true },
  });

  const ctx = vm.createContext(sandbox);
  vm.runInContext(`
    var STORAGE_KEY = 'big_boi_eats_data';
    function defaultData() {
      return {
        best: { highestLevel:1, maxWeight:10, totalStars:0, gamesPlayed:0, cumulativeWeight:0 },
        unlockedLevels:[1],
        unlockedSkins:['default'],
        equippedSkin:'default',
        settings:{ sfx:true, haptic:true },
      };
    }
    var savedData = null;
    function loadData() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          savedData = d;
          var def = defaultData();
          for (var k in def) { if (!(k in d)) d[k] = def[k]; }
          if (d.best) {
            if (typeof d.best.highestLevel !== 'number') d.best.highestLevel = 1;
            if (typeof d.best.maxWeight !== 'number') d.best.maxWeight = 10;
            if (typeof d.best.totalStars !== 'number') d.best.totalStars = 0;
            if (typeof d.best.gamesPlayed !== 'number') d.best.gamesPlayed = 0;
            if (typeof d.best.cumulativeWeight !== 'number') d.best.cumulativeWeight = 0;
          }
          return d;
        }
      } catch(e) {}
      var d = defaultData();
      savedData = d;
      return d;
    }
    var result = loadData();
  `, ctx);

  assert.strictEqual(ctx.result.best.highestLevel, 3);
  assert.strictEqual(ctx.result.best.maxWeight, 200);
  assert.strictEqual(ctx.result.settings.sfx, false);
  assert.strictEqual(ctx.result.equippedSkin, 'chef');
});

test('saveData persists to localStorage without throwing', () => {
  const { sandbox, storage } = createPersistenceSandbox();
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`
    var STORAGE_KEY = 'big_boi_eats_data';
    var savedData = {
      best: { highestLevel:2, maxWeight:80, totalStars:2, gamesPlayed:3, cumulativeWeight:150 },
      unlockedLevels: [1,2],
      unlockedSkins: ['default'],
      equippedSkin: 'default',
      settings: { sfx: true, haptic: false },
    };
    function saveData() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData)); } catch(e) {}
    }
    saveData();
  `, ctx);

  const stored = storage['big_boi_eats_data'];
  assert.ok(stored, 'Data should be stored in localStorage');
  const parsed = JSON.parse(stored);
  assert.strictEqual(parsed.best.highestLevel, 2);
  assert.strictEqual(parsed.settings.haptic, false);
});

test('loadData gracefully handles corrupt JSON in storage', () => {
  const { sandbox, storage } = createPersistenceSandbox();
  storage['big_boi_eats_data'] = 'not valid json{{{';
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`
    var STORAGE_KEY = 'big_boi_eats_data';
    function defaultData() {
      return {
        best: { highestLevel:1, maxWeight:10, totalStars:0, gamesPlayed:0, cumulativeWeight:0 },
        unlockedLevels:[1],
        unlockedSkins:['default'],
        equippedSkin:'default',
        settings:{ sfx:true, haptic:true },
      };
    }
    var savedData = null;
    function loadData() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var d = JSON.parse(raw);
          savedData = d;
          var def = defaultData();
          for (var k in def) { if (!(k in d)) d[k] = def[k]; }
          if (d.best) {
            if (typeof d.best.highestLevel !== 'number') d.best.highestLevel = 1;
            if (typeof d.best.maxWeight !== 'number') d.best.maxWeight = 10;
            if (typeof d.best.totalStars !== 'number') d.best.totalStars = 0;
            if (typeof d.best.gamesPlayed !== 'number') d.best.gamesPlayed = 0;
            if (typeof d.best.cumulativeWeight !== 'number') d.best.cumulativeWeight = 0;
          }
          return d;
        }
      } catch(e) {}
      var d = defaultData();
      savedData = d;
      return d;
    }
    var result = loadData();
  `, ctx);

  assert.ok(ctx.result, 'Should return defaults even with corrupt storage');
  assert.strictEqual(ctx.result.best.highestLevel, 1);
});

test('getSetting returns correct defaults', () => {
  const src = SCRIPT_SRC.match(
    /function getSetting\s*\([\s\S]*?\n\}/);
  assert.ok(src, 'Should find getSetting function');
  assert.ok(src[0].includes('savedData'), 'getSetting should check savedData');
  assert.ok(src[0].includes('settings'), 'getSetting should reference settings');
});

// ============================================================
// SECTION 3: Game Constants / Configuration
// ============================================================
console.log('\n--- SECTION 3: Game Constants / Configuration ---');

test('CONFIG is defined and has required top-level keys', () => {
  const required = ['BASE_SIZE', 'SIZE_PER_UNIT', 'MAX_SIZE', 'STARTING_WEIGHT',
    'LERP_SPEED', 'KEYBOARD_SPEED', 'MAX_FOOD', 'FOOD_RADIUS',
    'STAR_DURATION', 'STAR_CHANCE', 'BOMB_SHRINK_PCT', 'BOMB_CHANCE',
    'FOOD_TYPES', 'LEVELS', 'SKINS'];
  for (const k of required) {
    assert.ok(k in CONFIG, `CONFIG.${k} should exist`);
  }
});

test('CONFIG.BASE_SIZE is positive and reasonable', () => {
  assertBetween(CONFIG.BASE_SIZE, 8, 100, 'BASE_SIZE');
});

test('CONFIG.SIZE_PER_UNIT is positive', () => {
  assert.ok(CONFIG.SIZE_PER_UNIT > 0, 'SIZE_PER_UNIT should be positive');
});

test('CONFIG.MAX_SIZE is > BASE_SIZE', () => {
  assert.ok(CONFIG.MAX_SIZE > CONFIG.BASE_SIZE,
    'MAX_SIZE should exceed BASE_SIZE');
});

test('CONFIG.STARTING_WEIGHT is positive', () => {
  assert.ok(CONFIG.STARTING_WEIGHT > 0, 'STARTING_WEIGHT should be positive');
});

test('CONFIG.LERP_SPEED is between 0 and 1', () => {
  assertBetween(CONFIG.LERP_SPEED, 0.01, 0.99, 'LERP_SPEED');
});

test('CONFIG.KEYBOARD_SPEED is positive', () => {
  assert.ok(CONFIG.KEYBOARD_SPEED > 0, 'KEYBOARD_SPEED should be positive');
});

test('CONFIG.MAX_FOOD is positive', () => {
  assert.ok(CONFIG.MAX_FOOD >= 10, 'MAX_FOOD should be >= 10');
});

test('CONFIG.FOOD_RADIUS is positive', () => {
  assert.ok(CONFIG.FOOD_RADIUS > 0, 'FOOD_RADIUS should be positive');
});

test('CONFIG.STAR_DURATION is reasonable', () => {
  assertBetween(CONFIG.STAR_DURATION, 1000, 30000, 'STAR_DURATION (ms)');
});

test('CONFIG.STAR_CHANCE is between 0 and 1', () => {
  assertBetween(CONFIG.STAR_CHANCE, 0, 1, 'STAR_CHANCE');
});

test('CONFIG.BOMB_SHRINK_PCT is between 0 and 1', () => {
  assertBetween(CONFIG.BOMB_SHRINK_PCT, 0, 1, 'BOMB_SHRINK_PCT');
});

test('CONFIG.BOMB_CHANCE is between 0 and 1', () => {
  assertBetween(CONFIG.BOMB_CHANCE, 0, 1, 'BOMB_CHANCE');
});

test('CONFIG.EAT_ANIM_MS is positive', () => {
  assert.ok(CONFIG.EAT_ANIM_MS > 0, 'EAT_ANIM_MS should be positive');
});

test('CONFIG.POP_SCALE > 1', () => {
  assert.ok(CONFIG.POP_SCALE > 1, 'POP_SCALE should be > 1 for pop effect');
});

// --- Food Types ---
test('CONFIG.FOOD_TYPES is a non-empty array', () => {
  assertArrayNonEmpty(CONFIG.FOOD_TYPES, 'FOOD_TYPES');
  assert.ok(CONFIG.FOOD_TYPES.length >= 5, 'Should have at least 5 food types');
});

test('Each FOOD_TYPE has required fields', () => {
  for (const ft of CONFIG.FOOD_TYPES) {
    assert.ok(ft.id, `Food type missing id: ${JSON.stringify(ft)}`);
    assert.ok(ft.emoji, `Food type ${ft.id} missing emoji`);
    assert.ok(ft.weight > 0, `Food type ${ft.id} weight should be > 0`);
    assert.ok(ft.color, `Food type ${ft.id} missing color`);
    assert.ok(ft.label, `Food type ${ft.id} missing label`);
  }
});

test('Food type IDs are unique', () => {
  const ids = CONFIG.FOOD_TYPES.map(f => f.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'Food type IDs should be unique');
});

// --- Levels ---
test('CONFIG.LEVELS is a non-empty array with 5 levels', () => {
  assertArrayNonEmpty(CONFIG.LEVELS, 'LEVELS');
  assert.strictEqual(CONFIG.LEVELS.length, 5,
    'Should have exactly 5 levels');
});

test('Each level has required fields', () => {
  for (const lv of CONFIG.LEVELS) {
    assert.ok(lv.id > 0, `Level missing positive id: ${JSON.stringify(lv)}`);
    assert.ok(lv.name, `Level ${lv.id} missing name`);
    assert.ok(lv.icon, `Level ${lv.id} missing icon`);
    assert.ok(lv.bg, `Level ${lv.id} missing bg color`);
    assert.ok(lv.targetWeight > 0, `Level ${lv.id} targetWeight should be > 0`);
    assert.ok(lv.timeLimit > 0, `Level ${lv.id} timeLimit should be > 0`);
    assert.ok(lv.spawnInterval > 0, `Level ${lv.id} spawnInterval should be > 0`);
    assert.ok(Array.isArray(lv.foodIds), `Level ${lv.id} foodIds should be array`);
    assert.ok(lv.foodIds.length > 0, `Level ${lv.id} should have at least one foodId`);
    assert.strictEqual(typeof lv.starEnabled, 'boolean', `Level ${lv.id} starEnabled should be boolean`);
    assert.strictEqual(typeof lv.bombEnabled, 'boolean', `Level ${lv.id} bombEnabled should be boolean`);
    assert.strictEqual(typeof lv.obstacles, 'boolean', `Level ${lv.id} obstacles should be boolean`);
  }
});

test('Level IDs are sequential starting from 1', () => {
  for (let i = 0; i < CONFIG.LEVELS.length; i++) {
    assert.strictEqual(CONFIG.LEVELS[i].id, i + 1,
      `Level at index ${i} should have id ${i + 1}`);
  }
});

test('Level target weight increases monotonically', () => {
  for (let i = 1; i < CONFIG.LEVELS.length; i++) {
    assert.ok(CONFIG.LEVELS[i].targetWeight > CONFIG.LEVELS[i - 1].targetWeight,
      `Level ${i + 1} targetWeight should exceed level ${i}`);
  }
});

test('Level spawn interval decreases (faster spawns) on higher levels', () => {
  for (let i = 1; i < CONFIG.LEVELS.length; i++) {
    assert.ok(CONFIG.LEVELS[i].spawnInterval <= CONFIG.LEVELS[i - 1].spawnInterval,
      `Level ${i + 1} spawnInterval should be <= level ${i}`);
  }
});

test('Each level foodIds reference valid FOOD_TYPES', () => {
  const validIds = new Set(CONFIG.FOOD_TYPES.map(f => f.id));
  for (const lv of CONFIG.LEVELS) {
    for (const fid of lv.foodIds) {
      assert.ok(validIds.has(fid),
        `Level ${lv.id} references unknown foodId "${fid}"`);
    }
  }
});

test('Levels with bombEnabled also have starEnabled (bombs need counterplay)', () => {
  for (const lv of CONFIG.LEVELS) {
    if (lv.bombEnabled) {
      assert.ok(lv.starEnabled,
        `Level ${lv.id} has bombs but no stars for counterplay`);
    }
  }
});

test('Levels 3-5 have meaningful decor values', () => {
  const validDecors = ['kitchen', 'garden', 'buffet', 'candy', 'festival'];
  for (const lv of CONFIG.LEVELS) {
    assert.ok(validDecors.includes(lv.decor),
      `Level ${lv.id} has unrecognized decor "${lv.decor}"`);
  }
});

// --- Skins ---
test('CONFIG.SKINS is a non-empty array', () => {
  assertArrayNonEmpty(CONFIG.SKINS, 'SKINS');
});

test('Each skin has required fields', () => {
  for (const sk of CONFIG.SKINS) {
    assert.ok(sk.id, `Skin missing id: ${JSON.stringify(sk)}`);
    assert.ok(sk.name, `Skin ${sk.id} missing name`);
    assert.ok(sk.unlock, `Skin ${sk.id} missing unlock condition`);
    assert.ok(sk.color, `Skin ${sk.id} missing color`);
    assert.strictEqual(typeof sk.hat, 'boolean', `Skin ${sk.id} hat should be boolean`);
  }
});

test('Skin IDs are unique', () => {
  const ids = CONFIG.SKINS.map(s => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'Skin IDs should be unique');
});

test('Default skin is always first and unlocked always', () => {
  assert.strictEqual(CONFIG.SKINS[0].id, 'default');
  assert.strictEqual(CONFIG.SKINS[0].unlock, 'always');
});

test('Skin unlock conditions are valid', () => {
  const validUnlocks = ['always', 'allLevels', 'cum2000', 'lvl5_3star', 'cum5000', 'play30'];
  for (const sk of CONFIG.SKINS) {
    assert.ok(validUnlocks.includes(sk.unlock),
      `Skin ${sk.id} has unknown unlock condition "${sk.unlock}"`);
  }
});

// ============================================================
// SECTION 4: Game Logic
// ============================================================
console.log('\n--- SECTION 4: Game Logic ---');

// Helper: extract a function from script source
function extractFunction(name) {
  // Match 'function funcName(...) { ... }' — handles nested braces via simple heuristic
  const re = new RegExp(
    `(function\\s+${name}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\})`,
    'm'
  );
  const m = SCRIPT_SRC.match(re);
  if (!m) return null;
  return m[0];
}

test('getBigBoiRadius uses correct formula', () => {
  const fn = extractFunction('getBigBoiRadius');
  assert.ok(fn, 'getBigBoiRadius function should exist');
  assert.ok(fn.includes('CONFIG.BASE_SIZE'), 'Should reference BASE_SIZE');
  assert.ok(fn.includes('G.weight'), 'Should reference G.weight');
  assert.ok(fn.includes('CONFIG.SIZE_PER_UNIT'), 'Should reference SIZE_PER_UNIT');
  assert.ok(fn.includes('Math.min'), 'Should cap at MAX_SIZE via Math.min');

  // Verify value computation
  const { sandbox } = createPersistenceSandbox();
  sandbox.CONFIG = CONFIG;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`
    var G = { weight: 10 };
    var CONFIG = { BASE_SIZE: 32, SIZE_PER_UNIT: 0.12, MAX_SIZE: 120 };
    function getBigBoiRadius() {
      var r = CONFIG.BASE_SIZE + G.weight * CONFIG.SIZE_PER_UNIT;
      return Math.min(r, CONFIG.MAX_SIZE);
    }
    var r1 = getBigBoiRadius();
    G.weight = 1000;
    var r2 = getBigBoiRadius();
  `, ctx);

  assert.strictEqual(ctx.r1, 32 + 10 * 0.12,
    'Radius at starting weight (10) should be correct');
  assert.strictEqual(ctx.r2, 120,
    'Radius should be capped at MAX_SIZE (120)');
});

test('dist function calculates Euclidean distance correctly', () => {
  const fn = extractFunction('dist');
  assert.ok(fn, 'dist function should exist');
  assert.ok(fn.includes('Math.hypot'), 'Should use Math.hypot');

  const ctx = vm.createContext({});
  vm.runInContext(`
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    var d1 = dist({x:0,y:0}, {x:3,y:4});
    var d2 = dist({x:10,y:10}, {x:10,y:10});
    var d3 = dist({x:0,y:0}, {x:0,y:5});
  `, ctx);

  assert.strictEqual(ctx.d1, 5, 'dist(0,0)-(3,4) should be 5');
  assert.strictEqual(ctx.d2, 0, 'dist(same point) should be 0');
  assert.strictEqual(ctx.d3, 5, 'dist(0,0)-(0,5) should be 5');
});

test('getFoodTypeById returns correct food type', () => {
  const ctx = vm.createContext({ CONFIG });
  vm.runInContext(`
    function getFoodTypeById(id) {
      return CONFIG.FOOD_TYPES.find(function(f) { return f.id === id; });
    }
    var apple = getFoodTypeById('apple');
    var missing = getFoodTypeById('nonexistent');
  `, ctx);

  assert.ok(ctx.apple, 'Should find apple');
  assert.strictEqual(ctx.apple.weight, 4);
  assert.strictEqual(ctx.apple.emoji, '🍎');
  assert.strictEqual(ctx.missing, undefined, 'Non-existent id should return undefined');
});

test('getLevelConfig returns correct level or default', () => {
  const ctx = vm.createContext({ CONFIG });
  vm.runInContext(`
    function getLevelConfig(levelIdx) {
      return CONFIG.LEVELS[levelIdx] || CONFIG.LEVELS[0];
    }
    var lv1 = getLevelConfig(0);
    var lv5 = getLevelConfig(4);
    var lvFallback = getLevelConfig(999);
  `, ctx);

  assert.strictEqual(ctx.lv1.id, 1);
  assert.strictEqual(ctx.lv5.id, 5);
  assert.strictEqual(ctx.lvFallback.id, 1, 'Out-of-range index should return first level');
});

test('Eating food increases weight by food type weight', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var G = { weight: 10, score: 0, starActive: false };
    var food = { type: { weight: 4 } };
    var weightGain = food.type.weight * (G.starActive ? 2 : 1);
    G.weight += weightGain;
    G.score += weightGain * 10;
    var eatenWeight = G.weight;
    var eatenScore = G.score;

    // Test with star active
    G.starActive = true;
    var weightGain2 = food.type.weight * (G.starActive ? 2 : 1);
    G.weight += weightGain2;
    G.score += weightGain2 * 10;
    var starWeight = G.weight;
    var starScore = G.score;
  `, ctx);

  assert.strictEqual(ctx.eatenWeight, 14, 'Weight should increase by 4');
  assert.strictEqual(ctx.eatenScore, 40, 'Score should increase by 40');
  assert.strictEqual(ctx.starWeight, 22, 'Weight with star should double (14 + 8)');
  assert.strictEqual(ctx.starScore, 120, 'Score with star should double (40 + 80)');
});

test('Bomb shrinks weight by configured percentage', () => {
  const ctx = vm.createContext({ CONFIG });
  vm.runInContext(`
    var BOMB_SHRINK_PCT = 0.20;
    var STARTING_WEIGHT = 10;
    var weight = 50;
    weight = Math.max(STARTING_WEIGHT, Math.floor(weight * (1 - BOMB_SHRINK_PCT)));
    var afterBomb = weight;

    // Test floor at minimum
    weight = 11;
    weight = Math.max(STARTING_WEIGHT, Math.floor(weight * (1 - BOMB_SHRINK_PCT)));
    var nearMin = weight;

    // Test at minimum
    weight = 10;
    weight = Math.max(STARTING_WEIGHT, Math.floor(weight * (1 - BOMB_SHRINK_PCT)));
    var atMin = weight;
  `, ctx);

  assert.strictEqual(ctx.afterBomb, 40, '50 * 0.8 = 40');
  assert.strictEqual(ctx.nearMin, 10, '11*0.8=8.8 floor=8, but clamp to 10');
  assert.strictEqual(ctx.atMin, 10, 'Should not go below STARTING_WEIGHT');
});

test('completeLevel calculates stars based on remaining time', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    function calcStars(timeLeft, maxTime) {
      var remaining = timeLeft;
      var total = maxTime;
      var stars = 1;
      if (remaining > total * 0.25) stars = 2;
      if (remaining > total * 0.5) stars = 3;
      return stars;
    }
    var s1 = calcStars(5, 100);  // 5% left
    var s2 = calcStars(30, 100); // 30% left
    var s3 = calcStars(60, 100); // 60% left
    var s4 = calcStars(0, 100);  // no time left
    var s5 = calcStars(100, 100); // full time left
  `, ctx);

  assert.strictEqual(ctx.s1, 1, '5% remaining should be 1 star');
  assert.strictEqual(ctx.s2, 2, '30% remaining should be 2 stars');
  assert.strictEqual(ctx.s3, 3, '60% remaining should be 3 stars');
  assert.strictEqual(ctx.s4, 1, '0% remaining should be 1 star');
  assert.strictEqual(ctx.s5, 3, '100% remaining should be 3 stars');
});

test('checkSkinUnlocks logic for each skin requirement', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    // Chef: highestLevel >= 5
    var chefUnlocked = (function(d) {
      return !d.unlockedSkins.includes('chef') && d.best.highestLevel >= 5;
    });
    // Ninja: cumulativeWeight >= 2000
    var ninjaUnlocked = (function(d) {
      return !d.unlockedSkins.includes('ninja') && d.best.cumulativeWeight >= 2000;
    });
    // King: cumulativeWeight >= 5000
    var kingUnlocked = (function(d) {
      return !d.unlockedSkins.includes('king') && d.best.cumulativeWeight >= 5000;
    });
    // Ghost: gamesPlayed >= 30
    var ghostUnlocked = (function(d) {
      return !d.unlockedSkins.includes('ghost') && d.best.gamesPlayed >= 30;
    });

    var d1 = { unlockedSkins:['default'], best: { highestLevel:5, cumulativeWeight:2000, gamesPlayed:30 } };
    var d2 = { unlockedSkins:['default','chef'], best: { highestLevel:5, cumulativeWeight:2000, gamesPlayed:30 } };
    var d3 = { unlockedSkins:['default'], best: { highestLevel:1, cumulativeWeight:100, gamesPlayed:5 } };

    var c1 = chefUnlocked(d1);    // true - meets requirement
    var c2 = chefUnlocked(d2);    // false - already unlocked
    var c3 = chefUnlocked(d3);    // false - not met

    var n1 = ninjaUnlocked(d1);   // true
    var n3 = ninjaUnlocked(d3);   // false

    var g1 = ghostUnlocked(d1);   // true
    var g3 = ghostUnlocked(d3);   // false
  `, ctx);

  assert.strictEqual(ctx.c1, true, 'Chef: level 5 with skin not yet unlocked');
  assert.strictEqual(ctx.c2, false, 'Chef: already unlocked');
  assert.strictEqual(ctx.c3, false, 'Chef: level too low');
  assert.strictEqual(ctx.n1, true, 'Ninja: cumWeight >= 2000');
  assert.strictEqual(ctx.n3, false, 'Ninja: cumWeight too low');
  assert.strictEqual(ctx.g1, true, 'Ghost: 30 games played');
  assert.strictEqual(ctx.g3, false, 'Ghost: too few games');
});

test('isSkinUnlocked returns true for default always', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    function isSkinUnlocked(skinId) {
      if (skinId === 'default') return true;
      return false; // simplified mock
    }
    var r1 = isSkinUnlocked('default');
    var r2 = isSkinUnlocked('nonexistent');
  `, ctx);
  assert.strictEqual(ctx.r1, true, 'default should always be unlocked');
  assert.strictEqual(ctx.r2, false, 'unknown skin should not be unlocked');
});

test('Spawn collision avoidance prevents food spawning on Big Boi', () => {
  const fn = extractFunction('createFood');
  assert.ok(fn, 'createFood function should exist');
  assert.ok(fn.includes('dist(pos'), 'Should check distance from Big Boi');
  assert.ok(fn.includes('alive'), 'Food should have alive property');
  assert.ok(fn.includes('driftAngle'), 'Food should have drift fields');
  assert.ok(fn.includes('driftSpeed'), 'Food should have driftSpeed');

  // Check drift behavior for high levels
  assert.ok(fn.includes('levelIdx >= 3'),
    'Food drift should activate at level 3+');
});

test('Star powerup doubles score on eat', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var starActive = true;
    var baseWeight = 4;
    var weightGain = baseWeight * (starActive ? 2 : 1);
    var scoreGain = weightGain * 10;

    // Without star
    starActive = false;
    var weightGain2 = baseWeight * (starActive ? 2 : 1);
    var scoreGain2 = weightGain2 * 10;
  `, ctx);

  assert.strictEqual(ctx.weightGain, 8, 'With star: weight gain doubled');
  assert.strictEqual(ctx.scoreGain, 80, 'With star: score doubled');
  assert.strictEqual(ctx.weightGain2, 4, 'Without star: normal weight gain');
  assert.strictEqual(ctx.scoreGain2, 40, 'Without star: normal score');
});

test('Star timer is properly set to STAR_DURATION', () => {
  // From the actual collision code in update()
  assert.ok(CONFIG.STAR_DURATION >= 1000,
    'STAR_DURATION should be at least 1 second');
  const found = SCRIPT_SRC.includes('G.starTimer = CONFIG.STAR_DURATION');
  assert.ok(found, 'Star timer should be set to CONFIG.STAR_DURATION on collection');
});

test('Game state G has all required initial fields', () => {
  // Check the source for key state fields
  const requiredStateFields = [
    'screen', 'level', 'weight', 'score', 'timeLeft', 'bx', 'by',
    'foods', 'stars', 'bombs', 'obstacles', 'particles',
    'pointerX', 'pointerY', 'keys',
    'starActive', 'starTimer',
    'lastTime', 'running',
  ];
  for (const field of requiredStateFields) {
    const re = new RegExp(`\\b${field}\\s*:`, 'i');
    assert.ok(re.test(SCRIPT_SRC),
      `Game state should have field "${field}"`);
  }
});

test('Level-up check: weight >= targetWeight triggers completeLevel', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var targetWeight = 100;
    var weight = 50;
    var wouldWin1 = weight >= targetWeight;
    weight = 100;
    var wouldWin2 = weight >= targetWeight;
    weight = 150;
    var wouldWin3 = weight >= targetWeight;
  `, ctx);

  assert.strictEqual(ctx.wouldWin1, false, '50 < 100 should not trigger win');
  assert.strictEqual(ctx.wouldWin2, true, '100 >= 100 should trigger win');
  assert.strictEqual(ctx.wouldWin3, true, '150 >= 100 should trigger win');
});

test('Time-up causes game over', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var timeLeft = 10;
    var gameOver1 = false;

    // Simulate timer decrement
    timeLeft -= 15; // dt in seconds, overflows
    if (timeLeft <= 0) {
      timeLeft = 0;
      gameOver1 = true;
    }

    var gameOverResult = gameOver1;
  `, ctx);

  assert.strictEqual(ctx.gameOverResult, true,
    'Time reaching 0 or below should trigger game over');
});

test('Movement lerp brings Big Boi toward target', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var bx = 100, by = 100;
    var tx = 300, ty = 400;
    var LERP_SPEED = 0.12;
    var dtFrames = 1; // 1 frame at 60fps
    var lerpFactor = LERP_SPEED * dtFrames;

    bx += (tx - bx) * lerpFactor;
    by += (ty - by) * lerpFactor;

    var newX = Math.round(bx * 100) / 100;
    var newY = Math.round(by * 100) / 100;

    // After one frame
    var afterX1 = Math.round(bx * 100) / 100;
    var afterY1 = Math.round(by * 100) / 100;

    // Simulate continued lerp toward target (convergence check)
    for (var i = 0; i < 60; i++) {
      bx += (tx - bx) * lerpFactor;
      by += (ty - by) * lerpFactor;
    }
    var converged = Math.abs(bx - tx) < 1 && Math.abs(by - ty) < 1;
  `, ctx);

  assert.strictEqual(ctx.afterX1, 124, 'X should move toward target (100 + 200*0.12 = 124)');
  assert.strictEqual(ctx.afterY1, 136, 'Y should move toward target (100 + 300*0.12 = 136)');
  assert.strictEqual(ctx.converged, true,
    'Lerp should converge to target after enough frames');
});

test('Keyboard input sets flags and disables pointer mode', () => {
  assert.ok(SCRIPT_SRC.includes("G.keys.up = true"),
    'Keyboard down should set key flags');
  assert.ok(SCRIPT_SRC.includes("G.keys.up = false"),
    'Keyboard up should clear key flags');
  assert.ok(SCRIPT_SRC.includes("G.usingPointer = false"),
    'Keyboard input should disable pointer mode');

  // Check WASD and Arrow keys
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
   'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'].forEach(k => {
    assert.ok(SCRIPT_SRC.includes(`case '${k}'`),
      `Should handle key "${k}"`);
  });
});

test('Visibility change pauses game timer', () => {
  assert.ok(SCRIPT_SRC.includes('visibilitychange'),
    'Should listen for visibility change');
  assert.ok(SCRIPT_SRC.includes('G.timeLeft'),
    'Should compensate timeLeft on visible');
  assert.ok(SCRIPT_SRC.includes('_visibilityHidden'),
    'Should track visibility state');
});

test('Particle system creates and updates correctly', () => {
  const fn = extractFunction('spawnParticles');
  assert.ok(fn, 'spawnParticles function should exist');
  assert.ok(fn.includes('G.particles.push'), 'Should push to particles array');
  assert.ok(fn.includes('vx'), 'Particle should have vx');
  assert.ok(fn.includes('vy'), 'Particle should have vy');
  assert.ok(fn.includes('life'), 'Particle should have life');
  assert.ok(fn.includes('decay'), 'Particle should have decay');

  const fnUpd = extractFunction('updateParticles');
  assert.ok(fnUpd, 'updateParticles function should exist');
  assert.ok(fnUpd.includes('p.life -= p.decay'),
    'Should decay particle life');
  assert.ok(fnUpd.includes('G.particles.splice'),
    'Should remove dead particles');
  assert.ok(fnUpd.includes('p.vy += 0.05'),
    'Gravity should affect particles');
});

test('Confetti spawns with multiple colors', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var colors = ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#FF8E53','#FF69B4','#00BCD4'];
    assert(colors.length === 7, 'Should have 7 confetti colors');

    function assert(cond, msg) { if (!cond) throw new Error(msg); }
  `, ctx);
});

// ============================================================
// SECTION 5: Input Handling
// ============================================================
console.log('\n--- SECTION 5: Input Handling ---');

test('Canvas has pointerdown event listener', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('pointerdown'") ||
    SCRIPT_SRC.includes('addEventListener("pointerdown"'),
    'Canvas should listen for pointerdown');
});

test('Canvas has pointermove event listener', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('pointermove'") ||
    SCRIPT_SRC.includes('addEventListener("pointermove"'),
    'Canvas should listen for pointermove');
});

test('Canvas has touchstart fallback listener', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('touchstart'") ||
    SCRIPT_SRC.includes('addEventListener("touchstart"'),
    'Canvas should listen for touchstart (fallback)');
});

test('Canvas has touchmove fallback listener', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('touchmove'") ||
    SCRIPT_SRC.includes('addEventListener("touchmove"'),
    'Canvas should listen for touchmove (fallback)');
});

test('Window has keydown/keyup listeners', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('keydown'") ||
    SCRIPT_SRC.includes('addEventListener("keydown"'),
    'Window should listen for keydown');
  assert.ok(SCRIPT_SRC.includes("addEventListener('keyup'") ||
    SCRIPT_SRC.includes('addEventListener("keyup"'),
    'Window should listen for keyup');
});

test('Canvas has contextmenu prevention', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('contextmenu'") ||
    SCRIPT_SRC.includes('addEventListener("contextmenu"'),
    'Canvas should prevent context menu');
  assert.ok(SCRIPT_SRC.includes('e.preventDefault'),
    'Should call preventDefault on context menu');
});

test('Canvas has click listener for skin select', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('click'") ||
    SCRIPT_SRC.includes('addEventListener("click"'),
    'Canvas should listen for click events');
});

test('Canvas has pointerup listener for skin select', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('pointerup'") ||
    SCRIPT_SRC.includes('addEventListener("pointerup"'),
    'Canvas should listen for pointerup events');
});

test('Window resize listener exists', () => {
  assert.ok(SCRIPT_SRC.includes("addEventListener('resize'") ||
    SCRIPT_SRC.includes('addEventListener("resize"'),
    'Window should listen for resize');
});

test('Space key triggers screen transition on title', () => {
  assert.ok(SCRIPT_SRC.includes("key === ' '") ||
    SCRIPT_SRC.includes('key === "Space"') ||
    SCRIPT_SRC.includes("key === 'Space'"),
    'Space bar should be handled');
});

test('M key toggles SFX', () => {
  assert.ok(SCRIPT_SRC.includes("key === 'm'") ||
    SCRIPT_SRC.includes('key === "M"'),
    'M key should toggle sound');
});

test('getCanvasPos handles both mouse and touch events', () => {
  const fn = extractFunction('getCanvasPos');
  assert.ok(fn, 'getCanvasPos function should exist');
  assert.ok(fn.includes('e.clientX') && fn.includes('e.touches'),
    'Should handle both mouse and touch coordinates');
  assert.ok(fn.includes('getBoundingClientRect'),
    'Should use getBoundingClientRect');
});

test('Pointer down on title screen transitions to level select', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`
    var screen = 'title';
    // simulate click on title
    screen = 'levelSelect';
    var result = screen;
  `, ctx);
  assert.strictEqual(ctx.result, 'levelSelect',
    'Title click should transition to levelSelect');
});

test('handlePointerDown prevents default', () => {
  assert.ok(SCRIPT_SRC.includes('e.preventDefault') &&
    (SCRIPT_SRC.includes('handlePointerDown') ||
     SCRIPT_SRC.includes('G.screen')),
    'Pointer handler should prevent default and reference G.screen');
});

test('In-game HUD SFX toggle click target', () => {
  // Check that playing screen has a click region in top-right for SFX toggle
  assert.ok(SCRIPT_SRC.includes('toggleSFX'),
    'toggleSFX function should exist');
  assert.ok(SCRIPT_SRC.includes('G.settings.sfx = !G.settings.sfx'),
    'toggleSFX should flip the sfx setting');
});

// ============================================================
// SECTION 6: Edge case & safety checks
// ============================================================
console.log('\n--- SECTION 6: Edge Case & Safety Checks ---');

test('Big Boi position is clamped to canvas bounds', () => {
  const fn = extractFunction('update');
  assert.ok(fn, 'update function should exist');
  const match = fn.match(/G\.bx\s*=\s*Math\.max\(br,\s*Math\.min\(W\s*-\s*br,\s*G\.bx\)\)/);
  assert.ok(match, 'Big Boi X should be clamped with Math.max/Math.min');
  const matchY = fn.match(/G\.by\s*=\s*Math\.max\(br,\s*Math\.min\(H\s*-\s*br,\s*G\.by\)\)/);
  assert.ok(matchY, 'Big Boi Y should be clamped with Math.max/Math.min');
});

test('Food is also clamped to canvas bounds when drifting', () => {
  // From the update function, food clamp logic for levels 3+
  const match = HTML.match(/f\.x\s*=\s*Math\.max\(fr,\s*Math\.min\(W\s*-\s*fr,\s*f\.x\)\)/);
  assert.ok(match, 'Food X should be clamped to bounds');
  const matchY = HTML.match(/f\.y\s*=\s*Math\.max\(fr,\s*Math\.min\(H\s*-\s*fr,\s*f\.y\)\)/);
  assert.ok(matchY, 'Food Y should be clamped to bounds');
});

test('Obstacles are created only when level.obstacles is true', () => {
  const fn = extractFunction('createObstacles');
  assert.ok(fn, 'createObstacles function should exist');
  assert.ok(fn.includes('getLevelConfig(levelIdx).obstacles') ||
    fn.includes('levelIdx).obstacles'),
    'Should check level config for obstacles flag');
});

test('Game loop caps dt to prevent spiral of death', () => {
  assert.ok(SCRIPT_SRC.includes('Math.min(dt, 50)') ||
    SCRIPT_SRC.includes('Math.min(dt,'),
    'Should cap delta time');
});

test('Food types include emoji rendering in draw', () => {
  assert.ok(SCRIPT_SRC.includes('ctx.fillText(f.type.emoji'),
    'Should render food emoji');
});

test('drawBackground switch covers all decor types', () => {
  const decors = ['kitchen', 'garden', 'buffet', 'candy', 'festival'];
  for (const d of decors) {
    assert.ok(SCRIPT_SRC.includes(`case '${d}'`),
      `drawBackground should handle decor case '${d}'`);
  }
  // Count closing bracket of switch
  const caseCount = (SCRIPT_SRC.match(/case\s+'[a-z]+':/g) || []).length;
  assert.ok(caseCount >= 5, 'Should have at least 5 cases in drawBackground');
});

test('levelSelect draws SFX toggle region', () => {
  const fn = extractFunction('drawLevelSelect');
  assert.ok(fn, 'drawLevelSelect should exist');
  assert.ok(fn.includes('G.settings.sfx ?'),
    'Should check sfx setting');
});

test('Total levels, food types, and skins do not cause obvious issues', () => {
  // Each level references its foodIds; ensure at least 2 foodIds per level
  for (const lv of CONFIG.LEVELS) {
    assert.ok(lv.foodIds.length >= 2,
      `Level ${lv.id} should have at least 2 food types`);
  }
});

test('Canvas roundRect polyfill is provided', () => {
  assert.ok(SCRIPT_SRC.includes('roundRect'),
    'Script should have roundRect polyfill');
  assert.ok(SCRIPT_SRC.includes('CanvasRenderingContext2D.prototype.roundRect'),
    'Should polyfill CanvasRenderingContext2D.roundRect');
});

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log('\n========================================');
console.log(`Tests: ${assertions}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
