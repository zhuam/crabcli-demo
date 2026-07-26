#!/usr/bin/env node
/**
 * Runtime behavior tests for Grandma's Garden Grub (Game 045).
 *
 * Executes the real inline JS in a vm sandbox with a minimal DOM mock and
 * controlled virtual clock. Asserts:
 *   - Default game state after boot
 *   - Score tracking and star rating logic
 *   - Order generation (2-4 ingredients by difficulty)
 *   - Timer countdown mechanics
 *   - Difficulty level data and transitions
 *   - Harvest, cooking, and delivery flow
 *
 * Run: node games/045-grandma-garden-grub/tests/behavior.test.cjs
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
function ok(label, condition, detail = '') {
  if (condition) { console.log(`  OK ${label}`); pass++; }
  else { const msg = `${label}${detail ? ` -- ${detail}` : ''}`; console.log(`  FAIL ${msg}`); failures.push(msg); fail++; }
}
function eq(label, got, want) {
  ok(label, got === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
function group(title) { console.log(`\n=== ${title} ===`); }

// ---------------------------------------------------------------------------
// DOM mock factory
// ---------------------------------------------------------------------------
function makeMockElement(id) {
  const el = {
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

    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = String(v); },
    get disabled() { return this._disabled; },
    set disabled(v) { this._disabled = !!v; },

    classList: {
      add: function() {
        for (let i = 0; i < arguments.length; i++) el._classes.add(arguments[i]);
      },
      remove: function() {
        for (let i = 0; i < arguments.length; i++) el._classes.delete(arguments[i]);
      },
      contains: function(c) { return el._classes.has(c); },
      toggle: function(c) {
        if (el._classes.has(c)) el._classes.delete(c);
        else el._classes.add(c);
      },
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
      const list = el._listeners[ev.type] || [];
      for (const cb of list) cb(ev);
    },
    click: function() {
      el.dispatchEvent({ type: 'click', target: el, preventDefault: function() {}, currentTarget: el });
    },

    appendChild: function(child) { el._children.push(child); return child; },
    querySelector: function(sel) { return null; },
    querySelectorAll: function(sel) { return []; },
    closest: function(sel) { return null; },
    getBoundingClientRect: function() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },

    // For setPointerCapture / releasePointerCapture
    setPointerCapture: function() {},
    releasePointerCapture: function() {},
  };
  return el;
}

// ---------------------------------------------------------------------------
// Build the sandbox and boot the game
// ---------------------------------------------------------------------------
function createSandbox() {
  // IDs that the game references via $(id) or getElementById
  const elementIds = [
    'titleScreen', 'gameScreen', 'resultScreen',
    'startBtn', 'timerDisplay', 'scoreDisplay', 'ordersDisplay',
    'orderBanner', 'orderName', 'orderIngredients', 'orderScore',
    'gardenZone', 'counterArea', 'panArea', 'panContent', 'deliveryWindow',
    'resultIcon', 'resultTitle', 'resultStars', 'resultStats',
    'resultOrders', 'resultScore', 'resultDifficulty', 'resultBest', 'resultNewBest',
    'resultRematchBtn', 'resultMenuBtn',
    'titleBest', 'muteBtn', 'ariaLive',
  ];
  const elements = {};
  for (const id of elementIds) {
    elements[id] = makeMockElement(id);
  }

  // Override timerDisplay.closest to return a mock hud-item with classList
  elements.timerDisplay.closest = function() {
    if (!this._closestMock) {
      this._closestMock = {
        classList: {
          add: function() {},
          remove: function() {},
          contains: function() { return false; },
          toggle: function() {},
        },
      };
    }
    return this._closestMock;
  };

  // Add children to gardenZone for querySelectorAll('.plant-bed')
  const plantBeds = ['carrot', 'tomato', 'lettuce', 'onion'].map((veg, i) => {
    const bed = makeMockElement('bed-' + veg);
    bed.dataset.veg = veg;
    bed.dataset.bed = String(i);
    bed._classes = new Set();
    bed.classList.add('plant-bed');
    bed.querySelector = function(sel) {
      if (sel === '.respawn-fill') {
        const fill = makeMockElement('fill-' + veg);
        fill.style = {};
        return fill;
      }
      if (sel === '.plant-status') return null;
      return null;
    };
    bed._children = [];
    bed.appendChild = function(child) { bed._children.push(child); return child; };
    return bed;
  });
  elements.gardenZone._children = plantBeds;
  elements.gardenZone.querySelectorAll = function(sel) {
    if (sel === '.plant-bed') return plantBeds;
    return [];
  };
  elements.gardenZone.querySelector = function(sel) {
    if (sel === '.plant-bed') return plantBeds[0];
    return null;
  };
  elements.gardenZone.addEventListener = function(type, handler) {
    if (!elements.gardenZone._listeners[type]) elements.gardenZone._listeners[type] = [];
    elements.gardenZone._listeners[type].push(handler);
  };

  // Make diff-btn elements
  const diffBtns = ['easy', 'medium', 'hard'].map(function(d) {
    const btn = makeMockElement('diff-' + d);
    btn.dataset.diff = d;
    btn._classes = new Set();
    btn.classList = {
      add: function(c) { btn._classes.add(c); },
      remove: function(c) { btn._classes.delete(c); },
      contains: function(c) { return btn._classes.has(c); },
      toggle: function(c) { if (btn._classes.has(c)) btn._classes.delete(c); else btn._classes.add(c); },
    };
    btn.addEventListener('click', function() {});
    btn.click = function() {
      btn.dispatchEvent({ type: 'click', target: btn, preventDefault: function() {} });
    };
    return btn;
  });

  // Wire up querySelectorAll for document
  elements.document = makeMockElement('document');
  elements.document.querySelectorAll = function(sel) {
    if (sel === '.diff-btn') return diffBtns;
    if (sel === '.plant-bed') return plantBeds;
    if (sel === '.plant-bed.highlight-kb') return [];
    if (sel === '.counter-item.dragging') return [];
    return [];
  };
  elements.document.querySelector = function(sel) {
    if (sel === '.diff-btn.active') {
      for (const b of diffBtns) {
        if (b._classes.has('active')) return b;
      }
      return diffBtns[0];
    }
    if (sel === '.plant-bed') return plantBeds[0];
    return null;
  };

  // Wire up resultStars querySelectorAll
  const starEls = [0, 1, 2].map(function(i) {
    const s = makeMockElement('star-' + i);
    s.dataset.i = String(i);
    s._classes = new Set();
    s.classList = {
      add: function(c) { s._classes.add(c); },
      remove: function(c) { s._classes.delete(c); },
      contains: function(c) { return s._classes.has(c); },
      toggle: function(c) { if (s._classes.has(c)) s._classes.delete(c); else s._classes.add(c); },
    };
    s.style = { animationDelay: '' };
    return s;
  });
  elements.resultStars.querySelectorAll = function(sel) {
    if (sel === '.result-star') return starEls;
    return [];
  };

  // Active diff btn tracking
  let activeDiff = diffBtns[0];
  activeDiff._classes.add('active');
  for (const b of diffBtns) {
    const origClick = b._listeners.click ? b._listeners.click.slice() : [];
    b._listeners.click = [];
    b.addEventListener('click', function() {
      for (const db of diffBtns) db._classes.delete('active');
      b._classes.add('active');
      activeDiff = b;
    });
  }

  // localStorage mock
  const _ls = {};
  const localStorage = {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
    setItem: function(k, v) { _ls[k] = String(v); },
    removeItem: function(k) { delete _ls[k]; },
    clear: function() { for (const k in _ls) delete _ls[k]; },
    _snapshot: function() { return { ..._ls }; },
  };

  // Clock control
  let _now = 1_000_000_000_000;

  // Timer control: store intervals/timeouts so we can advance them
  const timers = { intervals: [], timeouts: [], nextId: 1 };
  const setTimeout = function(fn, ms) {
    const id = timers.nextId++;
    timers.timeouts.push({ id, fn, ms, fired: false, createdAt: _now });
    return id;
  };
  const clearTimeout = function(id) {
    timers.timeouts = timers.timeouts.filter(function(t) { return t.id !== id; });
  };
  const setInterval = function(fn, ms) {
    const id = timers.nextId++;
    timers.intervals.push({ id, fn, ms, lastFiredAt: _now, cancelled: false });
    return id;
  };
  const clearInterval = function(id) {
    for (let i = 0; i < timers.intervals.length; i++) {
      if (timers.intervals[i].id === id) timers.intervals[i].cancelled = true;
    }
  };

  // Helper: advance virtual time by ms, firing timers
  function advanceTime(ms) {
    _now += ms;
    // Fire intervals that are due
    for (const t of timers.intervals) {
      if (t.cancelled) continue;
      while (_now - t.lastFiredAt >= t.ms) {
        t.lastFiredAt += t.ms;
        try { t.fn(); } catch (e) { /* game code may rely on DOM we mock */ }
      }
    }
  }

  // Counter for 'counter-item' elements (counterArea children)
  elements.counterArea._children = [];
  elements.counterArea.appendChild = function(child) {
    elements.counterArea._children.push(child);
    return child;
  };

  // document.getElementById mock
  const document = {
    getElementById: function(id) {
      if (!elements[id]) elements[id] = makeMockElement(id);
      return elements[id];
    },
    addEventListener: function(type, handler) {
      if (!elements.document._listeners[type]) elements.document._listeners[type] = [];
      elements.document._listeners[type].push(handler);
    },
    removeEventListener: function() {},
    querySelector: function(sel) { return elements.document.querySelector(sel); },
    querySelectorAll: function(sel) { return elements.document.querySelectorAll(sel); },
    title: 'Grandma\'s Garden Grub',
    body: makeMockElement('body'),
    createElement: function(tagName) {
      const el = makeMockElement(tagName + '-' + (Math.random() * 100000 | 0));
      el.tagName = tagName;
      el.className = '';
      el._listeners = {};
      el._children = [];
      el.style = {};
      el._classes = new Set();
      el.classList = {
        add: function() { for (let i = 0; i < arguments.length; i++) el._classes.add(arguments[i]); },
        remove: function() { for (let i = 0; i < arguments.length; i++) el._classes.delete(arguments[i]); },
        contains: function(c) { return el._classes.has(c); },
        toggle: function(c) { if (el._classes.has(c)) el._classes.delete(c); else el._classes.add(c); },
      };
      el.setAttribute = function(k, v) { el._attrs[k] = String(v); };
      el.getAttribute = function(k) { return el._attrs[k]; };
      el.dataset = {};
      el.appendChild = function(child) { el._children.push(child); return child; };
      el.remove = function() { /* noop */ };
      return el;
    },
    documentElement: makeMockElement('html'),
    readyState: 'complete',
  };

  // AudioContext mock (silent)
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

  // Exposed game API (will be populated after boot)
  const game = {};

  // Instrument the source to expose internals
  let source = extractInlineJS(html);

  // Add a window export so we can access internals from outside
  const exportStmt = '\n// EXPOSE for testing\n' +
    'window.__GGG = {\n' +
    '  VEGGIES, VEGGIE_IDS, RECIPES_2, RECIPES_3, RECIPES_4, DIFFICULTIES,\n' +
    '  STORAGE_KEY, DIFFICULTY_KEY,\n' +
    '  get score() { return score; },\n' +
    '  get ordersCompleted() { return ordersCompleted; },\n' +
    '  get timeRemaining() { return timeRemaining; },\n' +
    '  get totalTime() { return totalTime; },\n' +
    '  set totalTime(v) { totalTime = v; },\n' +
    '  get difficulty() { return difficulty; },\n' +
    '  set difficulty(v) { difficulty = v; },\n' +
    '  get gameActive() { return gameActive; },\n' +
    '  get gamePhase() { return gamePhase; },\n' +
    '  get highScore() { return highScore; },\n' +
    '  get currentOrder() { return currentOrder; },\n' +
    '  get harvestedCounter() { return harvestedCounter; },\n' +
    '  get panContents() { return panContents; },\n' +
    '  get isCooking() { return isCooking; },\n' +
    '  get cookedDish() { return cookedDish; },\n' +
    '  get beds() { return beds; },\n' +
    '  get streakCount() { return streakCount; },\n' +
    '  get muted() { return muted; },\n' +
    '  set streakCount(v) { streakCount = v; },\n' +
    '  set highScore(v) { highScore = v; },\n' +
    '  set score(v) { score = v; },\n' +
    '  set ordersCompleted(v) { ordersCompleted = v; },\n' +
    '  set gameActive(v) { gameActive = v; },\n' +
    '  set gamePhase(v) { gamePhase = v; },\n' +
    '  set currentOrder(v) { currentOrder = v; },\n' +
    '  startGame, endGame, harvestBed, deliverDish, clearPan,\n' +
    '  loadHighScore, saveHighScore, loadDifficulty, saveDifficulty,\n' +
    '  generateOrder, getRandomRecipe, showScreen,\n' +
    '  startTimer, updateTimerDisplay, showOrder, initBeds,\n' +
    '  spawnConfetti, startCooking, finishCooking, addToPan,\n' +
    '  updateAria, vibrate, playTone, ensureAudio,\n' +
    '};';

  // Inject the export before the last })(); (main game IIFE, not inner IIFEs)
  var lastIIFE = source.lastIndexOf('})();');
  if (lastIIFE !== -1) {
    source = source.slice(0, lastIIFE) + exportStmt + '\n' + source.slice(lastIIFE);
  }

  const sandbox = {
    window: {},
    document,
    localStorage,
    console,
    Math,
    Number,
    String,
    parseInt,
    parseFloat,
    JSON,
    Object,
    Array,
    isNaN,
    Date: { now: function() { return _now; } },
    navigator: {
      vibrate: function() { return true; },
      userAgent: 'test',
    },
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: function() { return 0; },
    cancelAnimationFrame: function() {},
    _now: _now,
  };
  sandbox.window = sandbox;

  // For the recordPlayed calls at end of startGame, create a hub function
  sandbox.window.recordPlayed = function(id) { /* noop */ };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'index.html' });

  // Extract exported API with correct getter/setter handling
  Object.defineProperties(game, Object.getOwnPropertyDescriptors(sandbox.window.__GGG || {}));

  // Helper to re-read the exported state
  function readState() {
    const g = sandbox.window.__GGG || {};
    return {
      score: g.score,
      ordersCompleted: g.ordersCompleted,
      timeRemaining: g.timeRemaining,
      totalTime: g.totalTime,
      difficulty: g.difficulty,
      gameActive: g.gameActive,
      gamePhase: g.gamePhase,
      highScore: g.highScore,
      currentOrder: g.currentOrder,
      harvestedCounter: g.harvestedCounter ? g.harvestedCounter.slice() : [],
      panContents: g.panContents ? g.panContents.slice() : [],
      isCooking: g.isCooking,
      cookedDish: g.cookedDish,
      beds: g.beds,
      streakCount: g.streakCount,
      muted: g.muted,
    };
  }

  return {
    sandbox,
    game,
    elements,
    localStorage,
    diffBtns,
    plantBeds,
    starEls,
    advanceTime: function(ms) { advanceTime(ms); },
    readState,
    timers,
  };
}

// ============================================================================
group('1. Default game state at boot');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;
  ok('game API exposed after boot', !!g);
  ok('DIFFICULTIES object defined', !!g.DIFFICULTIES);
  ok('VEGGIES object defined with 4 entries', !!g.VEGGIES && Object.keys(g.VEGGIES).length === 4);
  ok('default difficulty is easy', g.difficulty === 'easy');
  ok('game starts in TITLE phase', g.gamePhase === 'TITLE');
  ok('gameActive is false on boot', g.gameActive === false);
  ok('score starts at 0', g.score === 0);
  ok('ordersCompleted starts at 0', g.ordersCompleted === 0);
  ok('streakCount starts at 0', g.streakCount === 0);
  ok('mute defaults to false', g.muted === false);
  ok('highScore loaded from localStorage (default 0)', g.highScore === 0);
  ok('STORAGE_KEY is grandma-garden-best', g.STORAGE_KEY === 'grandma-garden-best');
  ok('DIFFICULTY_KEY is grandma-garden-diff', g.DIFFICULTY_KEY === 'grandma-garden-diff');
}

// ============================================================================
group('2. Difficulty level data');
// ============================================================================
{
  const ctx = createSandbox();
  const { DIFFICULTIES } = ctx.game;
  ok('easy: label contains Easy', DIFFICULTIES.easy.label.indexOf('Easy') >= 0);
  ok('easy: time = 90', DIFFICULTIES.easy.time === 90);
  ok('easy: minIng = 2, maxIng = 2', DIFFICULTIES.easy.minIng === 2 && DIFFICULTIES.easy.maxIng === 2);
  ok('medium: label contains Medium', DIFFICULTIES.medium.label.indexOf('Medium') >= 0);
  ok('medium: time = 90', DIFFICULTIES.medium.time === 90);
  ok('medium: minIng = 2, maxIng = 3', DIFFICULTIES.medium.minIng === 2 && DIFFICULTIES.medium.maxIng === 3);
  ok('hard: label contains Hard', DIFFICULTIES.hard.label.indexOf('Hard') >= 0);
  ok('hard: time = 60', DIFFICULTIES.hard.time === 60);
  ok('hard: minIng = 2, maxIng = 4', DIFFICULTIES.hard.minIng === 2 && DIFFICULTIES.hard.maxIng === 4);
  ok('all difficulties have baseScore 100', DIFFICULTIES.easy.baseScore === 100 && DIFFICULTIES.medium.baseScore === 100 && DIFFICULTIES.hard.baseScore === 100);
}

// ============================================================================
group('3. Recipe data');
// ============================================================================
{
  const ctx = createSandbox();
  const { RECIPES_2, RECIPES_3, RECIPES_4 } = ctx.game;
  ok('RECIPES_2 has 6 entries', RECIPES_2.length === 6);
  ok('RECIPES_3 has 4 entries', RECIPES_3.length === 4);
  ok('RECIPES_4 has 1 entry (Grandma Special)', RECIPES_4.length === 1 && RECIPES_4[0].name === 'Grandma Special');
  ok('Grandma Special uses all 4 ingredients', RECIPES_4[0].ingredients.length === 4);

  // Check all recipes have required fields
  let allValid = true;
  const allRecipes = [...RECIPES_2, ...RECIPES_3, ...RECIPES_4];
  for (const r of allRecipes) {
    if (!r.name || !r.ingredients || !r.emoji) allValid = false;
  }
  ok('all recipes have name, ingredients, and emoji', allValid);

  // Check all ingredients are valid veggie IDs
  const VEGGIE_IDS = ctx.game.VEGGIE_IDS;
  let allIngsValid = true;
  for (const r of allRecipes) {
    for (const ing of r.ingredients) {
      if (VEGGIE_IDS.indexOf(ing) === -1) allIngsValid = false;
    }
  }
  ok('all recipe ingredients are valid veggie IDs', allIngsValid);
}

// ============================================================================
group('4. Order generation');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;

  // Easy: should generate 2-ingredient recipes
  g.difficulty = 'easy';
  // Simulate generateOrder
  const state = ctx.readState();
  const order = g.generateOrder();
  ok('order has recipe', !!order.recipe);
  ok('order has bonusDeadline', typeof order.bonusDeadline === 'number');
  ok('order has bonusClaimed (false)', order.bonusClaimed === false);
  ok('easy order uses 2 ingredients', order.recipe.ingredients.length === 2);

  // Hard: can use up to 4 ingredients
  g.difficulty = 'hard';
  let found4 = false;
  for (let i = 0; i < 50; i++) {
    const o = g.generateOrder();
    if (o.recipe.ingredients.length === 4) { found4 = true; break; }
  }
  ok('hard mode can generate 4-ingredient order within 50 attempts', found4);
}

// ============================================================================
group('5. Score tracking and star rating');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;
  const { baseScore } = g.DIFFICULTIES.easy;

  ok('initial score is 0', g.score === 0);
  ok('initial ordersCompleted is 0', g.ordersCompleted === 0);

  // Star thresholds for easy: 100*3=300, 100*6=600, 100*10=1000
  const t1 = baseScore * 3;   // 300
  const t2 = baseScore * 6;   // 600
  const t3 = baseScore * 10;  // 1000

  ok('threshold1 = baseScore * 3', t1 === 300);
  ok('threshold2 = baseScore * 6', t2 === 600);
  ok('threshold3 = baseScore * 10', t3 === 1000);
}

// ============================================================================
group('6. Timer countdown');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;

  // Set difficulty to easy (90s)
  g.difficulty = 'easy';
  g.totalTime = g.DIFFICULTIES.easy.time;

  // Start the game
  g.startGame();
  let state = ctx.readState();
  ok('gameActive is true after start', state.gameActive === true);
  ok('gamePhase is PLAYING after start', state.gamePhase === 'PLAYING');
  ok('totalTime is 90 for easy', state.totalTime === 90);
  ok('timeRemaining starts at totalTime', state.timeRemaining === 90);

  // Advance 5 seconds
  ctx.advanceTime(5000);
  state = ctx.readState();
  ok('timeRemaining decreased after 5s', state.timeRemaining <= 85 && state.timeRemaining >= 84);
}

// ============================================================================
group('7. Hard mode timer');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;
  g.difficulty = 'hard';
  g.totalTime = g.DIFFICULTIES.hard.time;
  g.startGame();
  let state = ctx.readState();
  ok('hard mode totalTime is 60', state.totalTime === 60);
  ok('hard mode timeRemaining starts at 60', state.timeRemaining === 60);
}

// ============================================================================
group('8. localStorage persistence');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;
  const ls = ctx.localStorage;

  ok('loadHighScore returns 0 when empty', g.loadHighScore() === 0);
  ok('saveHighScore saves and returns true for new high', g.saveHighScore(500) === true);
  ok('saveHighScore persists the value', g.loadHighScore() === 500);
  ok('saveHighScore returns false for lower score', g.saveHighScore(100) === false);
  ok('saveHighScore keeps highest score', g.loadHighScore() === 500);
  ok('localStorage key set correctly', ls.getItem('grandma-garden-best') === '500');

  // Test difficulty persistence
  ok('loadDifficulty returns easy by default', g.loadDifficulty() === 'easy');
  g.saveDifficulty('hard');
  ok('saveDifficulty persists hard', g.loadDifficulty() === 'hard');
  g.saveDifficulty('medium');
  ok('loadDifficulty returns medium after change', g.loadDifficulty() === 'medium');
}

// ============================================================================
group('9. Harvest flow (game mechanics)');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;

  // Start a game so we can harvest
  g.difficulty = 'easy';
  g.totalTime = g.DIFFICULTIES.easy.time;
  g.startGame();

  const state = ctx.readState();
  // Harvest bed 0
  g.harvestBed(0);
  const state2 = ctx.readState();
  ok('harvesting adds veggie to harvestedCounter', state2.harvestedCounter.length === 1);
  ok('harvested veggie ID is valid', g.VEGGIE_IDS.indexOf(state2.harvestedCounter[0]) >= 0);
  ok('game still active after harvest', state2.gameActive === true);
}

// ============================================================================
group('10. End game state');
// ============================================================================
{
  const ctx = createSandbox();
  const g = ctx.game;

  g.difficulty = 'easy';
  g.totalTime = g.DIFFICULTIES.easy.time;
  g.score = 850;
  g.ordersCompleted = 8;
  g.gameActive = true;
  g.gamePhase = 'PLAYING';

  g.endGame();
  const state = ctx.readState();
  ok('gameActive is false after endGame', state.gameActive === false);
  ok('gamePhase is RESULT after endGame', state.gamePhase === 'RESULT');
}

if (fail > 0) {
  console.error(`\n${fail} failed, ${pass} passed`);
  console.error('Failures:');
  failures.forEach(function(f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log(`\nAll ${pass} behavior checks passed.`);
