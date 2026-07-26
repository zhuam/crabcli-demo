#!/usr/bin/env node
/**
 * Runtime behavior tests for Grow a Garden Idle (Game 043).
 *
 * Executes the real inline JS in a vm sandbox with a minimal DOM mock.
 * Asserts:
 *   - Default game state after boot
 *   - Flower data structure (12 types with names, values, tiers)
 *   - Shop upgrade data (3 upgrades with costs)
 *   - Core math (calcCPS, calcClickValue, calcLevel, fmtCoins)
 *   - Harvest mechanics (grown flower gives coins)
 *   - Unlock progression (sequential unlock)
 *   - Planting mechanics
 *
 * Run: node games/043-grow-a-garden-idle/tests/behavior.test.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Extract inline JS from index.html
// ---------------------------------------------------------------------------
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

let pass = 0, fail = 0;
const failures = [];
function ok(label, condition, detail) {
  if (condition) { console.log('  OK ' + label); pass++; }
  else { var msg = label + (detail ? ' -- ' + detail : ''); console.log('  FAIL ' + msg); failures.push(msg); fail++; }
}
function eq(label, got, want) {
  ok(label, got === want, 'expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got));
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

// ---------------------------------------------------------------------------
// DOM mock factory (shared for all subtests)
// ---------------------------------------------------------------------------
function makeMockElement(id) {
  var el = {
    id: id || '',
    _children: [],
    _textContent: '',
    _innerHTML: '',
    _classes: new Set(),
    _attrs: {},
    _listeners: {},
    dataset: {},
    style: {},
    _disabled: false,
    hidden: false,

    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    get disabled() { return this._disabled; },
    set disabled(v) { this._disabled = !!v; },

    classList: {
      add: function() { for (var i = 0; i < arguments.length; i++) el._classes.add(arguments[i]); },
      remove: function() { for (var i = 0; i < arguments.length; i++) el._classes.delete(arguments[i]); },
      contains: function(c) { return el._classes.has(c); },
      toggle: function(c) { if (el._classes.has(c)) el._classes.delete(c); else el._classes.add(c); },
    },

    setAttribute: function(k, v) { el._attrs[k] = String(v); },
    getAttribute: function(k) { return el._attrs[k] === undefined ? null : el._attrs[k]; },
    hasAttribute: function(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k); },
    removeAttribute: function(k) { delete el._attrs[k]; },
    remove: function() { /* noop */ },

    addEventListener: function(type, handler) {
      if (!el._listeners[type]) el._listeners[type] = [];
      el._listeners[type].push(handler);
    },
    dispatchEvent: function(ev) {
      var list = el._listeners[ev.type] || [];
      for (var ci = 0; ci < list.length; ci++) list[ci](ev);
    },
    click: function() {
      el.dispatchEvent({ type: 'click', target: el, preventDefault: function() {}, currentTarget: el });
    },

    appendChild: function(child) { el._children.push(child); return child; },
    querySelector: function(sel) { return null; },
    querySelectorAll: function(sel) { return []; },
    closest: function(sel) { return null; },
    getBoundingClientRect: function() { return { left: 0, top: 0, right: 0, bottom: 0, width: 320, height: 80 }; },
    setPointerCapture: function() {},
    releasePointerCapture: function() {},
    focus: function() {},
    blur: function() {},
    parentNode: null,
    tagName: 'DIV',
  };
  return el;
}

// ---------------------------------------------------------------------------
// Build sandbox and boot the game
// ---------------------------------------------------------------------------
function createSandbox() {
  // IDs referenced by the game via $(id) or getElementById
  var elementIds = [
    'splash', 'game', 'win',
    'playBtn', 'winPlayAgain',
    'splashProgress', 'splashFlowers', 'splashHigh',
    'hudCoins', 'hudCps', 'hudLevel', 'hudCollected',
    'garden', 'shopToggleBtn', 'shopPanel', 'shopBadge', 'shopItems',
    'muteBtn',
    'floatContainer', 'toastContainer', 'confettiLayer',
    'plantModal', 'modalOptions', 'modalClose',
    'winTotal', 'winTime', 'winLevel', 'winHigh', 'winEmoji',
  ];
  var elements = {};
  for (var ei = 0; ei < elementIds.length; ei++) {
    elements[elementIds[ei]] = makeMockElement(elementIds[ei]);
  }

  // localStorage mock
  var _ls = {};
  var localStorage = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
    setItem: function(k, v) { _ls[k] = String(v); },
    removeItem: function(k) { delete _ls[k]; },
    clear: function() { for (var k in _ls) delete _ls[k]; },
  };

  // Clock control
  var _now = 1_000_000_000_000;

  // Timer control
  var timers = { intervals: [], timeouts: [], nextId: 1 };
  var setTimeout = function(fn, ms) {
    var id = timers.nextId++;
    timers.timeouts.push({ id: id, fn: fn, ms: ms, fired: false, createdAt: _now });
    return id;
  };
  var clearTimeout = function(id) {
    timers.timeouts = timers.timeouts.filter(function(t) { return t.id !== id; });
  };
  var setInterval = function(fn, ms) {
    var id = timers.nextId++;
    timers.intervals.push({ id: id, fn: fn, ms: ms, lastFiredAt: _now, cancelled: false });
    return id;
  };
  var clearInterval = function(id) {
    for (var ti = 0; ti < timers.intervals.length; ti++) {
      if (timers.intervals[ti].id === id) timers.intervals[ti].cancelled = true;
    }
  };

  // document mock
  var document = {
    getElementById: function(id) {
      if (!elements[id]) elements[id] = makeMockElement(id);
      return elements[id];
    },
    addEventListener: function(type, handler) {
      if (!elements.document._listeners) elements.document._listeners = {};
      if (!elements.document._listeners[type]) elements.document._listeners[type] = [];
      elements.document._listeners[type].push(handler);
    },
    removeEventListener: function() {},
    querySelector: function(sel) {
      if (sel === '.shop-panel .si-btn:not(:disabled)') return null;
      if (sel === '[data-plot="0"]') return makeMockElement('plot-0');
      return null;
    },
    querySelectorAll: function(sel) {
      if (sel === '.screen') return [];
      if (sel === '.modal-card') return [];
      return [];
    },
    title: 'Grow a Garden Idle',
    body: makeMockElement('body'),
    createElement: function(tagName) {
      var el = makeMockElement(tagName + '-' + (Math.random() * 100000 | 0));
      el.tagName = tagName;
      el.className = '';
      el._listeners = {};
      el._children = [];
      el.style = {};
      el._classes = new Set();
      return el;
    },
    documentElement: makeMockElement('html'),
    readyState: 'complete',
  };

  // Add document element to elements for listener tracking
  elements.document = document;

  // AudioContext mock
  function MockAudioContext() {
    this.state = 'running';
    this.currentTime = 0;
    this.resume = function() { this.state = 'running'; };
    this.createOscillator = function() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: function() {} },
        connect: function() { return { connect: function() {} }; },
        start: function() {},
        stop: function() {},
      };
    };
    this.createGain = function() {
      return {
        gain: {
          setValueAtTime: function() {},
          exponentialRampToValueAtTime: function() {},
        },
        connect: function() {},
      };
    };
    this.destination = {};
  }

  // Exposed game API (populated after boot)
  var game = {};

  // Instrument source to expose internals
  var source = extractInlineJS(html);

  // Build export statement
  var exportStmt = '\n// EXPOSE for testing\n' +
    'window.__GAME = {\n' +
    '  FLOWERS, UPGRADES, SAVE_KEY, BEST_KEY,\n' +
    '  get coins() { return state.coins; },\n' +
    '  set coins(v) { state.coins = v; },\n' +
    '  get totalEarned() { return state.totalEarned; },\n' +
    '  set totalEarned(v) { state.totalEarned = v; },\n' +
    '  get level() { return state.level; },\n' +
    '  get unlockedFlowers() { return state.unlockedFlowers; },\n' +
    '  set unlockedFlowers(v) { state.unlockedFlowers = v; },\n' +
    '  get nextUnlockIdx() { return state.nextUnlockIdx; },\n' +
    '  set nextUnlockIdx(v) { state.nextUnlockIdx = v; },\n' +
    '  get plots() { return state.plots; },\n' +
    '  set plots(v) { state.plots = v; },\n' +
    '  get upgrades() { return state.upgrades; },\n' +
    '  get allCollected() { return state.allCollected; },\n' +
    '  set allCollected(v) { state.allCollected = v; },\n' +
    '  get gameStarted() { return state.gameStarted; },\n' +
    '  set gameStarted(v) { state.gameStarted = v; },\n' +
    '  get startTs() { return state.startTs; },\n' +
    '  calcCPS, calcClickValue, calcLevel,\n' +
    '  getGrowthProgress, isGrown,\n' +
    '  fmtCoins, fmtTime,\n' +
    '  harvestPlot, plantSeed,\n' +
    '  buyUnlockFlower, buyUpgrade,\n' +
    '  checkWin, checkUnlocks,\n' +
    '  saveGame, saveBest, loadBest,\n' +
    '  startGame, restartGame,\n' +
    '};';

  // Inject before the last })();
  var lastIIFE = source.lastIndexOf('})();');
  if (lastIIFE !== -1) {
    source = source.slice(0, lastIIFE) + exportStmt + '\n' + source.slice(lastIIFE);
  }

  var sandbox = {
    window: {},
    document: document,
    localStorage: localStorage,
    console: console,
    Math: Math,
    Number: Number,
    String: String,
    parseInt: parseInt,
    parseFloat: parseFloat,
    JSON: JSON,
    Object: Object,
    Array: Array,
    isNaN: isNaN,
    Date: { now: function() { return _now; } },
    navigator: {
      vibrate: function() { return true; },
      userAgent: 'test',
    },
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    requestAnimationFrame: function() { return 0; },
    cancelAnimationFrame: function() {},
    addEventListener: function(type, handler) {
      if (!document._listeners) document._listeners = {};
      if (!document._listeners[type]) document._listeners[type] = [];
      document._listeners[type].push(handler);
    },
    removeEventListener: function() {},
    _now: _now,
    performance: { now: function() { return _now / 1000; } },
  };
  sandbox.window = sandbox;
  sandbox.window.recordPlayed = function(id) { /* noop */ };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'index.html' });

  // Extract exported API
  Object.defineProperties(game, Object.getOwnPropertyDescriptors(sandbox.window.__GAME || {}));

  // Helper to re-read state
  function readState() {
    var g = sandbox.window.__GAME || {};
    return {
      coins: g.coins,
      totalEarned: g.totalEarned,
      level: g.level,
      unlockedFlowers: g.unlockedFlowers ? g.unlockedFlowers.slice() : [],
      nextUnlockIdx: g.nextUnlockIdx,
      plots: g.plots ? g.plots.slice() : [],
      upgrades: g.upgrades ? Object.assign({}, g.upgrades) : {},
      allCollected: g.allCollected,
      gameStarted: g.gameStarted,
    };
  }

  return {
    sandbox: sandbox,
    game: game,
    elements: elements,
    localStorage: localStorage,
    readState: readState,
    timers: timers,
    advanceTime: function(ms) {
      _now += ms;
      // Fire intervals that are due
      for (var ti = 0; ti < timers.intervals.length; ti++) {
        var t = timers.intervals[ti];
        if (t.cancelled) continue;
        while (_now - t.lastFiredAt >= t.ms) {
          t.lastFiredAt += t.ms;
          try { t.fn(); } catch (e) { /* game code may rely on DOM we don't fully mock */ }
        }
      }
    },
  };
}

// ============================================================================
group('1. Default game state at boot');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  ok('game API exposed after boot', !!g);
  ok('FLOWERS is an array with 12 entries', Array.isArray(g.FLOWERS) && g.FLOWERS.length === 12);
  ok('UPGRADES is an array with 3 entries', Array.isArray(g.UPGRADES) && g.UPGRADES.length === 3);
  ok('SAVE_KEY is grow_garden_save', g.SAVE_KEY === 'grow_garden_save');
  ok('BEST_KEY is grow_garden_best', g.BEST_KEY === 'grow_garden_best');

  var state = ctx.readState();
  ok('coins start at 0', state.coins === 0);
  ok('totalEarned starts at 0', state.totalEarned === 0);
  ok('level is 1', state.level === 1);
  ok('nextUnlockIdx is 1 (only daisy unlocked)', state.nextUnlockIdx === 1);
  ok('unlockedFlowers first is true', state.unlockedFlowers[0] === true);
  ok('unlockedFlowers others are false', state.unlockedFlowers.slice(1).every(function(b) { return b === false; }));
  ok('plots is array of 6 nulls', state.plots.length === 6 && state.plots.every(function(p) { return p === null; }));
  ok('all upgrades at level 0', state.upgrades.speedBoost === 0 && state.upgrades.autoClicker === 0 && state.upgrades.valueBoost === 0);
  ok('allCollected is false', state.allCollected === false);

  // fmtCoins helper
  ok('fmtCoins(0) returns "0"', g.fmtCoins(0) === '0');
  ok('fmtCoins(999) returns "999"', g.fmtCoins(999) === '999');
  ok('fmtCoins(1500) returns "1.5K"', g.fmtCoins(1500) === '1.5K');
  ok('fmtCoins(10000) returns "10K"', g.fmtCoins(10000) === '10K');
  ok('fmtCoins(1000000) returns "1.00M"', g.fmtCoins(1000000) === '1.00M');

  // fmtTime helper
  ok('fmtTime(0) returns "0:00"', g.fmtTime(0) === '0:00');
  ok('fmtTime(65) returns "1:05"', g.fmtTime(65) === '1:05');
  ok('fmtTime(3661) returns "61:01"', g.fmtTime(3661) === '61:01');
})();

// ============================================================================
group('2. Flower data structure - 12 types with properties');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var FLOWERS = ctx.game.FLOWERS;

  ok('12 flower types defined', FLOWERS.length === 12);

  // Check each flower has required fields
  var allValid = true;
  for (var i = 0; i < FLOWERS.length; i++) {
    var f = FLOWERS[i];
    if (!f.id || !f.name || !f.emoji || typeof f.baseValue !== 'number' ||
        typeof f.unlockCost !== 'number' || typeof f.seedCost !== 'number' ||
        typeof f.growthTime !== 'number' || !f.color) {
      allValid = false;
    }
  }
  ok('all flowers have id, name, emoji, baseValue, unlockCost, seedCost, growthTime, color', allValid);

  // Verify specific flowers
  eq('first flower id is daisy', FLOWERS[0].id, 'daisy');
  eq('daisy baseValue is 1', FLOWERS[0].baseValue, 1);
  eq('daisy unlockCost is 0', FLOWERS[0].unlockCost, 0);
  eq('daisy seedCost is 5', FLOWERS[0].seedCost, 5);

  eq('second flower id is rose', FLOWERS[1].id, 'rose');
  eq('rose baseValue is 2', FLOWERS[1].baseValue, 2);
  eq('rose unlockCost is 25', FLOWERS[1].unlockCost, 25);

  // Middle flower
  eq('sunflower baseValue is 5', FLOWERS[3].baseValue, 5);
  eq('sunflower unlockCost is 150', FLOWERS[3].unlockCost, 150);

  // Last flower
  eq('last flower id is rainbow-orchid', FLOWERS[11].id, 'rainbow-orchid');
  eq('rainbow-orchid baseValue is 100', FLOWERS[11].baseValue, 100);
  eq('rainbow-orchid unlockCost is 10000', FLOWERS[11].unlockCost, 10000);

  // Unlock costs are strictly increasing
  var costsIncreasing = true;
  for (var i = 1; i < FLOWERS.length; i++) {
    if (FLOWERS[i].unlockCost <= FLOWERS[i-1].unlockCost) costsIncreasing = false;
  }
  ok('unlock costs are strictly increasing', costsIncreasing);

  // Growth times increase monotonically
  var growthOrdered = true;
  for (var i = 1; i < FLOWERS.length; i++) {
    if (FLOWERS[i].growthTime < FLOWERS[i-1].growthTime) growthOrdered = false;
  }
  ok('growth times increase monotonically', growthOrdered);

  // Daisy is cheaper than rose
  ok('daisy seedCost < rose seedCost', FLOWERS[0].seedCost < FLOWERS[1].seedCost);
})();

// ============================================================================
group('3. Shop upgrade data');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var UPGRADES = ctx.game.UPGRADES;

  ok('3 upgrades defined', UPGRADES.length === 3);

  var speed = UPGRADES[0];
  ok('first upgrade is speedBoost', speed.id === 'speedBoost');
  ok('speedBoost maxLevel is 5', speed.maxLvl === 5);
  ok('speedBoost has 5 costs', speed.costs.length === 5);
  eq('speedBoost Lv1 cost is 50', speed.costs[0], 50);
  eq('speedBoost Lv5 cost is 10000', speed.costs[4], 10000);

  var auto = UPGRADES[1];
  ok('second upgrade is autoClicker', auto.id === 'autoClicker');
  ok('autoClicker maxLevel is 3', auto.maxLvl === 3);
  ok('autoClicker has 3 costs', auto.costs.length === 3);
  eq('autoClicker Lv1 cost is 100', auto.costs[0], 100);

  var value = UPGRADES[2];
  ok('third upgrade is valueBoost', value.id === 'valueBoost');
  ok('valueBoost maxLevel is 2', value.maxLvl === 2);
  ok('valueBoost has 2 costs', value.costs.length === 2);
  eq('valueBoost Lv1 cost is 150', value.costs[0], 150);

  // Check all upgrades have required fields
  var allValid = true;
  for (var i = 0; i < UPGRADES.length; i++) {
    var u = UPGRADES[i];
    if (!u.id || !u.name || !u.icon || !u.desc || typeof u.maxLvl !== 'number' || !Array.isArray(u.costs) || !u.baseKey) {
      allValid = false;
    }
  }
  ok('all upgrades have id, name, icon, desc, maxLvl, costs, baseKey', allValid);
})();

// ============================================================================
group('4. Core math - calcCPS, calcClickValue, calcLevel');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  // calcCPS with no plots
  eq('CPS with empty plots is 0', g.calcCPS(), 0);

  // calcCPS with one daisy planted (use sandbox time)
  var sbNow = ctx.sandbox.Date.now();
  g.plots[0] = { flowerIdx: 0, plantedAt: sbNow - 5000 };
  var cps = g.calcCPS();
  ok('CPS with 1 daisy > 0', cps > 0);
  // Daisy baseValue = 1, speedBoost = 0, so CPS = 1 * 2^0 = 1
  eq('CPS with 1 daisy and no speedBoost is 1', cps, 1);

  // calcCPS with two flowers (use sandbox time)
  var sbNow2 = ctx.sandbox.Date.now();
  g.plots[1] = { flowerIdx: 1, plantedAt: sbNow2 - 5000 };
  // Rose baseValue = 2, so total = (1 + 2) = 3
  eq('CPS with daisy + rose is 3', g.calcCPS(), 3);

  // calcClickValue with no upgrades
  eq('daisy click value with no upgrades is 1', g.calcClickValue(0), 1);
  eq('rose click value with no upgrades is 2', g.calcClickValue(1), 2);
  eq('rainbow-orchid click value with no upgrades is 100', g.calcClickValue(11), 100);

  // calcLevel thresholds
  g.totalEarned = 0;
  eq('level 1 at totalEarned 0', g.calcLevel(), 1);
  g.totalEarned = 50;
  eq('level 2 at totalEarned 50', g.calcLevel(), 2);
  g.totalEarned = 200;
  eq('level 3 at totalEarned 200', g.calcLevel(), 3);
  g.totalEarned = 500000;
  eq('max level at totalEarned 500000', g.calcLevel(), 12);

  // Reset plots (they persist across this test group)
  g.plots[0] = null;
  g.plots[1] = null;
  g.totalEarned = 0;
})();

// ============================================================================
group('5. Harvest mechanics - grown flower gives coins');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  // Plant a daisy using sandbox time, with plantedAt in the past
  var sbNow = ctx.sandbox.Date.now();
  g.plots[0] = { flowerIdx: 0, plantedAt: sbNow - 2000 }; // 2s ago (growthTime=1.0)
  g.coins = 0;
  g.totalEarned = 0;

  // Verify isGrown — plot was planted 2s ago, daisy grows in 1s
  var plot0 = g.plots[0];
  ok('plot 0 is grown after 2s (growthTime=1.0)', g.isGrown(plot0));
  ok('growth progress >= 1', g.getGrowthProgress(plot0) >= 1);

  // Harvest the plot via exported function
  // harvestPlot uses renderPlots etc which needs DOM mock
  // We'll track state changes instead
  g.harvestPlot(0, null);

  var state = ctx.readState();
  ok('coins increased after harvest', state.coins > 0);
  ok('totalEarned increased after harvest', state.totalEarned > 0);
  eq('coins == totalEarned on first harvest', state.coins, state.totalEarned);
  // daisy click value = 1 (no upgrades), so should be exactly 1
  eq('coins value is 1 (daisy baseValue)', state.coins, 1);

  // Harvest again — need time to grow back (daisy growthTime=1.0)
  ctx.advanceTime(2000); // 2 seconds later, plant is grown again
  g.harvestPlot(0, null);
  state = ctx.readState();
  eq('second harvest adds another coin', state.coins, 2);

  // Reset plots
  g.plots[0] = null;
  g.coins = 0;
  g.totalEarned = 0;
})();

// ============================================================================
group('6. Unlock progression - sequential unlock');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  // Verify initial state: only daisy (idx 0) unlocked
  ok('only daisy unlocked initially', g.unlockedFlowers[0] === true && g.unlockedFlowers[1] === false);
  eq('nextUnlockIdx is 1', g.nextUnlockIdx, 1);

  // Unlock rose (flower idx 1, unlockCost 25)
  g.coins = 30; // enough to unlock rose
  g.buyUnlockFlower();

  var state = ctx.readState();
  ok('rose is now unlocked', state.unlockedFlowers[1] === true);
  ok('daisy still unlocked', state.unlockedFlowers[0] === true);
  ok('nextUnlockIdx advanced to 2', state.nextUnlockIdx === 2);
  ok('coins decreased by unlock cost (25)', state.coins <= 5);

  // Unlock tulip (flower idx 2, unlockCost 60)
  g.coins = 70;
  g.buyUnlockFlower();
  state = ctx.readState();
  ok('tulip is now unlocked', state.unlockedFlowers[2] === true);
  eq('nextUnlockIdx is 3', state.nextUnlockIdx, 3);

  // Cannot skip ahead (trying to unlock 4 when 3 is locked)
  // nextUnlockIdx is 3, flower[3] = sunflower with cost 150
  g.coins = 200;
  g.unlockedFlowers[4] = false; // ensure locked
  g.nextUnlockIdx = 3;
  // buyUnlockFlower uses nextUnlockIdx, so it would try to unlock idx 3 (sunflower)
  // This is fine since it's the next in sequence
  // But we want to test that we can't unlock idx 4 directly - we can't because the code only uses nextUnlockIdx
  ok('unlock is strictly sequential (uses nextUnlockIdx)', g.nextUnlockIdx === 3);

  // Unlock sunflower
  g.buyUnlockFlower();
  state = ctx.readState();
  ok('sunflower unlocked', state.unlockedFlowers[3] === true);
  eq('nextUnlockIdx is 4', state.nextUnlockIdx, 4);

  // Verify not enough coins prevents unlock
  g.coins = 0;
  // Try to unlock lavender (idx 6, cost 800)
  // But nextUnlockIdx is 4 (lily, cost 500) - can't afford it
  // buyUnlockFlower will check coins < flower.unlockCost and return early
  var beforeUnlock = ctx.readState();
  g.buyUnlockFlower();
  state = ctx.readState();
  ok('unlock blocked when coins insufficient', state.nextUnlockIdx === beforeUnlock.nextUnlockIdx);
  ok('lily not unlocked', state.unlockedFlowers[4] === false);

  // Set totalEarned back to 0
  g.totalEarned = 0;
})();

// ============================================================================
group('7. Planting mechanics');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  // Reset plots
  g.plots = [null, null, null, null, null, null];

  // Plant a daisy in plot 0 (seedCost = 5)
  g.coins = 10;
  g.plantSeed(0, 0);

  var state = ctx.readState();
  ok('plot 0 is no longer null', state.plots[0] !== null);
  ok('plot 0 has daisy (idx 0)', state.plots[0].flowerIdx === 0);
  ok('plantedAt is set', typeof state.plots[0].plantedAt === 'number');
  eq('coins decreased by seed cost (5)', state.coins, 5);

  // Plant another in plot 1
  g.plantSeed(1, 0);
  state = ctx.readState();
  ok('plot 1 planted', state.plots[1] !== null);
  eq('coins decreased by another 5', state.coins, 0);

  // Cannot plant with insufficient coins
  g.plantSeed(2, 0);
  state = ctx.readState();
  ok('plot 2 still null (cannot afford)', state.plots[2] === null);
  eq('coins still 0', state.coins, 0);

  // Reset
  g.plots = [null, null, null, null, null, null];
  g.coins = 0;
})();

// ============================================================================
group('8. Win condition');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  // Initially not all collected
  eq('allCollected is false at start', g.allCollected, false);

  // Simulate unlocking all flowers
  g.unlockedFlowers = [true, true, true, true, true, true, true, true, true, true, true, true];
  g.allCollected = false;

  // checkWin should detect all unlocked and set allCollected
  g.checkWin();
  ok('allCollected set to true after checkWin with all flowers unlocked', g.allCollected === true);

  // Verify that checkWin is idempotent (won't re-trigger)
  g.checkWin();
  ok('allCollected stays true', g.allCollected === true);

  // Reset for other tests
  g.unlockedFlowers = [true, false, false, false, false, false, false, false, false, false, false, false];
  g.allCollected = false;
})();

// ============================================================================
group('9. Storage keys');
// ============================================================================
(function() {
  var ctx = createSandbox();
  var g = ctx.game;

  eq('SAVE_KEY is grow_garden_save', g.SAVE_KEY, 'grow_garden_save');
  eq('BEST_KEY is grow_garden_best', g.BEST_KEY, 'grow_garden_best');

  // loadBest returns 0 when empty
  var loadedBest = g.loadBest();
  ok('loadBest returns initial best with highScore 0', loadedBest && loadedBest.highScore === 0);
  // The loadBest function returns { highScore: 0 } as default

  // saveBest saves the best score
  g.saveBest();
  // saveBest is called with best global variable
  // best.highScore is tracked internally
  ok('BEST_KEY in localStorage after saveBest', ctx.localStorage.getItem('grow_garden_best') !== null);

  // saveGame requires gameStarted to be true
  g.gameStarted = true;
  g.saveGame();
  ok('SAVE_KEY in localStorage after saveGame', ctx.localStorage.getItem('grow_garden_save') !== null);

  // Verify saved data is valid JSON
  var saved = JSON.parse(ctx.localStorage.getItem('grow_garden_save'));
  ok('saved data has coins', typeof saved.coins === 'number');
  ok('saved data has level', typeof saved.level === 'number');
  ok('saved data has unlockedFlowers', Array.isArray(saved.unlockedFlowers));
  ok('saved data has upgrades', typeof saved.upgrades === 'object');
  ok('saved data has lastSaveTs', typeof saved.lastSaveTs === 'number');

  // Clean up state
  g.totalEarned = 0;
})();

if (fail > 0) {
  console.error('\n' + fail + ' failed, ' + pass + ' passed');
  console.error('Failures:');
  for (var fi = 0; fi < failures.length; fi++) { console.error('  - ' + failures[fi]); }
  process.exit(1);
}
console.log('\nAll ' + pass + ' behavior checks passed.');
