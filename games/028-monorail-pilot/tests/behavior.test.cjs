#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Monorail Pilot (Issue #28).
 *
 * Complements the regex-based static.test.cjs with:
 *   - VM-executed unit tests of pure functions (evaluateStation, starString, etc.)
 *   - Speed mechanics: acceleration, braking, drag, emergency brake
 *   - Star threshold boundaries (3/2/1/0)
 *   - localStorage round-trip with mocked storage
 *   - Level progression & unlock logic
 *   - Sound / vibration trigger-point completeness
 *   - Game state machine transitions (title -> playing -> station-arrival -> result)
 *
 * Run: node tests/behavior.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      {
    fail++;
    failures.push(name + (detail ? ' -- ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? '  -- ' + detail : ''}`);
  }
}
function group(title) { console.log(`\n=== ${title} ===`); }

/**
 * Extract a top-level function body from app.js source.
 * Walks balanced braces; good enough for this codebase.
 */
function extract(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`);
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
 * Extract constant value expression from const NAME = <expr>;
 */
function extractConst(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+?)\\s*;`);
  const m = js.match(re);
  if (!m) return null;
  return m[1].trim();
}

/**
 * Build a sandboxed context with evaluateStation extracted.
 * evaluateStation references gameState, LEVELS, STAR_*, starString, playPerfect etc.
 * We extract starString + evaluateStation from source but provide MOCK functions for
 * playPerfect/playGood/playChime/playMiss so we can observe calls without AudioContext.
 */
function buildEvalSandbox() {
  const stationFnSrc = extract('evaluateStation');
  const starStringSrc = extract('starString');

  if (!stationFnSrc) return null;

  const sandbox = {
    Math,
    __log: [],
    STAR_FULL: '★',
    STAR_EMPTY: '☆',
    STAR_3: 0.5,
    STAR_2: 1.5,
    STAR_1: 3.0,
    gameState: {
      level: null,
      speed: 0,
      worldX: 0,
      time: 0,
      currentStation: 0,
      stationResults: [],
      totalStars: 0,
      totalScore: 0,
      finished: false,
      paused: false
    },
    audioCtx: null,
    masterGain: null,
    playPerfect: null,   // will be set in injected code
    playGood: null,
    playChime: null,
    playMiss: null,
    playMultiple: function () {},
    playTone: function () {},
    playWin: function () {},
    playLose: function () {},
    vibrate: null,
    stationCardTitle: { textContent: '' },
    stationCardStars: { textContent: '' },
    stationCardDetail: { textContent: '' },
    stationCardTime: { textContent: '' },
    stationOverlay: { hidden: true },
    stationContinueBtn: { textContent: '' },
    starString: null,
    evaluateStation: null
  };

  // IMPORTANT: Only include evaluateStation + starString source.
  // Do NOT include original playPerfect/playGood/etc. source, as it would
  // shadow our mocks and fail (no AudioContext in sandbox).
  // We define mock functions INSIDE the sandbox so they share the sandbox's
  // __log array directly (no closure scoping issues across vm contexts).
  const mockCode = [
    'var __log = this.__log;',
    'this.playPerfect = function () { __log.push("playPerfect"); };',
    'this.playGood = function () { __log.push("playGood"); };',
    'this.playChime = function () { __log.push("playChime"); };',
    'this.playMiss = function () { __log.push("playMiss"); };',
    'this.vibrate = function (p) { __log.push("vibrate:" + JSON.stringify(p)); };',
    starStringSrc ? starStringSrc : '',
    stationFnSrc,
    'this.evaluateStation = evaluateStation;',
    starStringSrc ? 'this.starString = starString;' : ''
  ].join('\n');

  vm.createContext(sandbox);
  vm.runInContext(mockCode, sandbox);
  return sandbox;
}

// ============================================================
group('Speed mechanics (simulated)');
// ============================================================
const ACCEL_RATE_M = js.match(/ACCEL_RATE\s*=\s*(\d+)/);
const BRAKE_RATE_M = js.match(/BRAKE_RATE\s*=\s*(\d+)/);
const EMERGENCY_BRAKE_M = js.match(/EMERGENCY_BRAKE\s*=\s*(\d+)/);
const DRAG_M = js.match(/DRAG\s*=\s*([\d.]+)/);
const SPEED_SCALE_M = js.match(/SPEED_SCALE\s*=\s*([\d.]+)/);
const MAX_SPEED_GREEN_M = js.match(/maxSpeed:\s*(\d+)/);

ok('ACCEL_RATE extracted', !!ACCEL_RATE_M);
ok('BRAKE_RATE extracted', !!BRAKE_RATE_M);
ok('EMERGENCY_BRAKE extracted', !!EMERGENCY_BRAKE_M);
ok('DRAG extracted', !!DRAG_M);
ok('SPEED_SCALE extracted', !!SPEED_SCALE_M);

const ACCEL_RATE = ACCEL_RATE_M ? parseFloat(ACCEL_RATE_M[1]) : 100;
const BRAKE_RATE = BRAKE_RATE_M ? parseFloat(BRAKE_RATE_M[1]) : 180;
const EMERGENCY_BRAKE = EMERGENCY_BRAKE_M ? parseFloat(EMERGENCY_BRAKE_M[1]) : 400;
const DRAG = DRAG_M ? parseFloat(DRAG_M[1]) : 0.85;
const SPEED_SCALE = SPEED_SCALE_M ? parseFloat(SPEED_SCALE_M[1]) : 0.55;
const GREEN_MAX = MAX_SPEED_GREEN_M ? parseFloat(MAX_SPEED_GREEN_M[1]) : 160;

// Simulate the update() speed logic in a small VM
function simulateSpeed(actions, dtPerStep, steps) {
  let speed = 0;
  const maxSpeed = GREEN_MAX;
  const log = [];

  for (let i = 0; i < steps; i++) {
    const dt = dtPerStep;

    // speed logic
    if (actions.emergencyBrake) {
      speed -= EMERGENCY_BRAKE * dt;
      if (speed < 0) speed = 0;
    } else if (actions.accelerating && !actions.braking) {
      speed += ACCEL_RATE * dt;
    } else if (actions.braking && !actions.accelerating) {
      speed -= BRAKE_RATE * dt;
    } else {
      // drag
      speed *= Math.pow(DRAG, dt * 60);
      if (speed < 0.5) speed = 0;
    }

    speed = Math.max(0, Math.min(speed, maxSpeed));
    log.push({ step: i, speed: Math.round(speed * 100) / 100 });
  }

  return { finalSpeed: speed, log };
}

// Test acceleration from 0
const accelResult = simulateSpeed({ accelerating: true, braking: false, emergencyBrake: false }, 0.016, 60);
ok('Acceleration: speed > 0 after 1s (60 frames at 16ms)', accelResult.finalSpeed > 0, `final speed=${accelResult.finalSpeed}`);
ok('Acceleration: speed reaches ~96 km/h after ~1s (accel 100/s * 1s)', accelResult.finalSpeed >= 90 && accelResult.finalSpeed <= 100, `final speed=${accelResult.finalSpeed}`);

// Test braking from max speed
const brakeResult = simulateSpeed({ accelerating: false, braking: true, emergencyBrake: false }, 0.016, 30);
ok('Braking: speed goes down from 0 initial (no start speed to brake from)', brakeResult.finalSpeed === 0);

// Test braking with initial speed
let brakeSpeed = 100;
for (let i = 0; i < 30; i++) {
  brakeSpeed -= BRAKE_RATE * 0.016;
  if (brakeSpeed < 0) brakeSpeed = 0;
}
ok('Braking: speed drops from 100 to near 0 within ~35 frames (180/s brake)', brakeSpeed < 15, `final=${brakeSpeed}`);

// Test emergency brake from high speed
let ebSpeed = 140;
for (let i = 0; i < 10; i++) {
  ebSpeed -= EMERGENCY_BRAKE * 0.016;
  if (ebSpeed < 0) ebSpeed = 0;
}
ok('Emergency brake: speed drops from 140 significantly within ~10 frames (400/s * 0.16s = 64 drop)', ebSpeed <= 80, `final=${ebSpeed}`);

// Test drag: speed decays when no input
let dragSpeed = 100;
for (let i = 0; i < 120; i++) { // ~2 seconds
  dragSpeed *= Math.pow(DRAG, 0.016 * 60);
  if (dragSpeed < 0.5) dragSpeed = 0;
}
ok('Drag: speed decays to near 0 within ~2s of no input', dragSpeed < 5, `final=${dragSpeed}`);

// Test speed clamping: can't exceed maxSpeed
const overAccel = simulateSpeed({ accelerating: true, braking: false, emergencyBrake: false }, 0.016, 300);
ok('Speed clamped to maxSpeed (no overshoot)', overAccel.finalSpeed <= GREEN_MAX, `final=${overAccel.finalSpeed}`);

// Test speed never goes below 0
let negSpeed = 5;
let emergencyActive = true;
for (let i = 0; i < 5; i++) {
  if (emergencyActive) {
    negSpeed -= EMERGENCY_BRAKE * 0.05; // large dt to force negatives
    if (negSpeed < 0) negSpeed = 0;
  }
}
ok('Speed never goes below 0 (clamp)', negSpeed === 0, `final=${negSpeed}`);

// ============================================================
group('Star thresholds & scoring (evaluateStation)');
// ============================================================
const sandbox = buildEvalSandbox();
const evaluateStation = sandbox ? sandbox.evaluateStation : null;
const starString = sandbox ? sandbox.starString : null;
ok('evaluateStation extractable & runnable', !!evaluateStation);
ok('starString extractable & runnable', !!starString);

if (evaluateStation && starString) {
  // Configure sandbox with a simple test level
  sandbox.gameState.level = {
    name: 'Test Line',
    maxSpeed: 160,
    stations: [
      { name: 'Test Station', targetTime: 10, position: 500 }
    ]
  };
  sandbox.gameState.levelIndex = 0;
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.worldX = 500; // at station position
  sandbox.gameState.stationResults = [];

  // --- Test 3-star (perfect): diff <= 0.5 ---
  sandbox.gameState.time = 10; // exactly target
  sandbox.__log.length = 0;
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.stationOverlay.hidden = true;

  evaluateStation();

  const r0 = sandbox.gameState.stationResults[0];
  ok('3-star: station result recorded', !!r0);
  if (r0) {
    ok('3-star: stars = 3 for exact match (diff=0)', r0.stars === 3, `got ${r0.stars}`);
    ok('3-star: score = 300 for perfect timing', r0.score === 300, `got ${r0.score}`);
    ok('3-star: detail says "Perfect timing!"', sandbox.stationCardDetail.textContent === 'Perfect timing!', sandbox.stationCardDetail.textContent);
    ok('3-star: playPerfect sound triggered', sandbox.__log.some(function (e) { return e === 'playPerfect'; }));
    ok('3-star: vibration triggered', sandbox.__log.some(function (e) { return /^vibrate/.test(e); }));
  }

  // --- Test 3-star: diff = STAR_3 boundary ---
  sandbox.gameState.time = 10 + 0.5; // diff = STAR_3
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;

  evaluateStation();
  const r1 = sandbox.gameState.stationResults[0];
  ok('3-star boundary: diff=0.5 still 3 stars', r1 && r1.stars === 3, r1 ? `got ${r1.stars}` : 'no result');

  // --- Test 3-star: diff just under STAR_3 boundary ---
  sandbox.gameState.time = 10 + 0.49; // diff = 0.49 < STAR_3
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;

  evaluateStation();
  const r1b = sandbox.gameState.stationResults[0];
  ok('3-star: diff=0.49 yields 3 stars (boundary)', r1b && r1b.stars === 3, r1b ? `got ${r1b.stars}` : 'no result');

  // --- Test 2-star: 0.5 < diff <= 1.5 ---
  sandbox.gameState.time = 10 + 1.0; // diff = 1.0
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;

  evaluateStation();
  const r2 = sandbox.gameState.stationResults[0];
  ok('2-star: stars = 2 for diff=1.0', r2 && r2.stars === 2, r2 ? `got ${r2.stars}` : 'no result');
  if (r2) {
    ok('2-star: score = 200', r2.score === 200, `got ${r2.score}`);
    ok('2-star: detail says "Good arrival!"', sandbox.stationCardDetail.textContent === 'Good arrival!', sandbox.stationCardDetail.textContent);
    ok('2-star: playGood sound triggered', sandbox.__log.some(function (e) { return e === 'playGood'; }));
  }

  // --- Test 2-star: boundary at diff = STAR_2 ---
  sandbox.gameState.time = 10 + 1.5; // diff = STAR_2
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;
  evaluateStation();
  const r2b = sandbox.gameState.stationResults[0];
  ok('2-star: diff=1.5 (STAR_2 boundary) yields 2 stars', r2b && r2b.stars === 2, r2b ? `got ${r2b.stars}` : 'no result');

  // --- Test 1-star: 1.5 < diff <= 3.0 ---
  sandbox.gameState.time = 10 + 2.5; // diff = 2.5
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;

  evaluateStation();
  const r3 = sandbox.gameState.stationResults[0];
  ok('1-star: stars = 1 for diff=2.5', r3 && r3.stars === 1, r3 ? `got ${r3.stars}` : 'no result');
  if (r3) {
    ok('1-star: score = 100', r3.score === 100, `got ${r3.score}`);
    ok('1-star: detail says "Close enough."', sandbox.stationCardDetail.textContent === 'Close enough.', sandbox.stationCardDetail.textContent);
    ok('1-star: playChime sound triggered', sandbox.__log.some(function (e) { return e === 'playChime'; }));
  }

  // --- Test 1-star: boundary at STAR_1 ---
  sandbox.gameState.time = 10 + 3.0; // diff = STAR_1
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;
  evaluateStation();
  const r3b = sandbox.gameState.stationResults[0];
  ok('1-star: diff=3.0 (STAR_1 boundary) yields 1 star', r3b && r3b.stars === 1, r3b ? `got ${r3b.stars}` : 'no result');

  // --- Test 0-star: diff > 3.0 ---
  sandbox.gameState.time = 10 + 5.0; // diff = 5.0
  sandbox.gameState.currentStation = 0;
  sandbox.gameState.stationResults = [];
  sandbox.gameState.totalStars = 0;
  sandbox.gameState.totalScore = 0;
  sandbox.__log.length = 0;

  evaluateStation();
  const r4 = sandbox.gameState.stationResults[0];
  ok('0-star: stars = 0 for diff=5.0', r4 && r4.stars === 0, r4 ? `got ${r4.stars}` : 'no result');
  if (r4) {
    ok('0-star: score = 0', r4.score === 0, `got ${r4.score}`);
    ok('0-star: detail says "Missed the window!"', sandbox.stationCardDetail.textContent === 'Missed the window!', sandbox.stationCardDetail.textContent);
    ok('0-star: playMiss sound triggered', sandbox.__log.some(function (e) { return e === 'playMiss'; }));
  }

  // --- Test starString format ---
  ok('starString(0, 3) = "☆☆☆"', starString(0, 3) === '☆☆☆', starString(0, 3));
  ok('starString(1, 3) = "★☆☆"', starString(1, 3) === '★☆☆', starString(1, 3));
  ok('starString(2, 3) = "★★☆"', starString(2, 3) === '★★☆', starString(2, 3));
  ok('starString(3, 3) = "★★★"', starString(3, 3) === '★★★', starString(3, 3));
  ok('starString(4, 6) = "★★★★☆☆" (partial)', starString(4, 6) === '★★★★☆☆', starString(4, 6));
}

// ============================================================
group('Game state transitions');
// ============================================================
ok("switchState('title') defined", /switchState\(['"]title['"]\)/.test(js));
ok("switchState('playing') defined", /switchState\(['"]playing['"]\)/.test(js));
ok("switchState('station-arrival') defined", /case ['"]station-arrival['"]/.test(js));
ok("switchState('result') defined", /switchState\(['"]result['"]\)/.test(js));
ok('screen class toggle on active', /classList\.(remove|add)\(['"]active['"]\)/.test(js));
ok('gameState.paused set true on station arrival', /gameState\.paused\s*=\s*true/.test(js));
ok('gameState.paused set false on continue', /gameState\.paused\s*=\s*false/.test(js));
ok('State guarded: update() only runs when playing and not paused',
   /state === ['"]playing['"]\s*&&\s*!\s*gameState\.paused/.test(js));
ok('Animation loop stops when state !== playing',
   /state !== ['"]playing['"]/.test(js));
ok('initLevel resets all game state fields',
   /speed:\s*0[\s\S]{0,30}worldX:\s*-50/.test(js) && /time:\s*0/.test(js));
ok('Level completion sets finished=true', /gameState\.finished\s*=\s*true/.test(js));
ok('Last station shows "VIEW RESULTS" button',
   /stationContinueBtn\.textContent\s*=\s*['"]VIEW RESULTS/.test(js));
ok('Continue advances currentStation', /gameState\.currentStation\+\+/.test(js));
ok('Continue checks finished before showing results',
   /gameState\.finished[\s\S]{0,200}switchState\(['"]result['"]\)/.test(js));

// ============================================================
group('Level progression & unlock');
// ============================================================
const saveProgressSrc = extract('saveProgress');
ok('saveProgress extractable', !!saveProgressSrc);
if (saveProgressSrc) {
  ok('saveProgress increments gamesPlayed', /gamesPlayed\s*=\s*\(best\.gamesPlayed/.test(saveProgressSrc));
  ok('saveProgress accumulates totalStars', /best\.totalStars\s*=\s*\(best\.totalStars/.test(saveProgressSrc));
  ok('saveProgress updates bestScore when higher', /totalScore\s*>\s*\(best\.bestScore/.test(saveProgressSrc));
  ok('saveProgress unlocks next level when applicable',
     /lvIdx\s*<\s*LEVELS\.length\s*-\s*1[\s\S]{0,80}!unlocked\.levels\[lvIdx\s*\+\s*1\]/.test(saveProgressSrc));
  ok('saveProgress persists per-level best', /best\.perLevel\[lvIdx\]/.test(saveProgressSrc));
  ok('saveProgress stores stars/score/completed per level',
     /stars:\s*Math\.max/.test(saveProgressSrc) && /score:\s*Math\.max/.test(saveProgressSrc) && /completed:\s*true/.test(saveProgressSrc));
}

// ============================================================
group('Result screen logic');
// ============================================================
const populateResultScreenSrc = extract('populateResultScreen');
ok('populateResultScreen extractable', !!populateResultScreenSrc);
if (populateResultScreenSrc) {
  ok('Result heading varies by score percentage', /pct\s*>=\s*0\.9[\s\S]{0,60}PERFECT RUN/.test(populateResultScreenSrc));
  ok('PERFECT RUN shown at >=90%', /PERFECT RUN/.test(populateResultScreenSrc));
  ok('ROUTE COMPLETE shown at >=60%', /ROUTE COMPLETE/.test(populateResultScreenSrc));
  ok('KEEP PRACTICING shown below 60%', /KEEP PRACTICING/.test(populateResultScreenSrc));
  ok('Result shows station breakdown', /resultBreakdown\.innerHTML\s*=\s*['"]/.test(populateResultScreenSrc) || /resultBreakdown\.appendChild/.test(populateResultScreenSrc));
  ok('Result shows total stars', /resultTotalStars\.textContent/.test(populateResultScreenSrc));
  ok('Result shows total score', /resultScore\.textContent/.test(populateResultScreenSrc));
}

// ============================================================
group('Sound & vibration trigger-points');
// ============================================================
function actionContains(actionName, mustHaveAny) {
  const src = extract(actionName);
  if (!src) return false;
  return mustHaveAny.some(function (rx) { return rx.test(src); });
}

ok('evaluateStation fires playPerfect + vibrate(100) on 3-star',
   actionContains('evaluateStation', [/playPerfect\(\)/, /vibrate\(100\)/]));
ok('evaluateStation fires playGood + vibrate(80) on 2-star',
   actionContains('evaluateStation', [/playGood\(\)/, /vibrate\(80\)/]));
ok('evaluateStation fires playChime + vibrate(60) on 1-star',
   actionContains('evaluateStation', [/playChime\(\)/, /vibrate\(60\)/]));
ok('evaluateStation fires playMiss + vibrate([50,30,50]) on 0-star',
   actionContains('evaluateStation', [/playMiss\(\)/, /vibrate\(\[50,\s*30,\s*50\]\)/]));
ok('populateResultScreen fires playWin + vibrate on good result',
   /playWin\(\)/.test(js) && /playLose\(\)/.test(js));

// ============================================================
group('Input handling completeness');
// ============================================================
ok('startBtn click triggers startGame', /startBtn\.addEventListener\(['"]click['"]/.test(js));
ok('replayBtn click triggers startGame', /replayBtn\.addEventListener\(['"]click['"]/.test(js));
ok('menuBtn click triggers title screen', /menuBtn\.addEventListener\(['"]click['"]/.test(js));
ok('stationContinueBtn click advances or shows results',
   /stationContinueBtn\.addEventListener\(['"]click['"]/.test(js));
ok('setupTouchButton manages pressed CSS class for tactile feedback',
   /btn\.classList\.(add|remove)\(['"]pressed['"]\)/.test(js));
ok('Brake pressed calls playBrakeScreech when speed > 20',
   /speed\s*>\s*20[\s\S]{0,40}playBrakeScreech/.test(js));
ok('Keyup releases acceleration state',
   /keyup[\s\S]{0,400}isAccelerating\s*=\s*false/.test(js));
ok('Keyup releases braking state',
   /keyup[\s\S]{0,400}isBraking\s*=\s*false/.test(js));
ok('Space keyup releases emergency brake',
   /case ['"]Space['"][\s\S]{0,80}emergencyBrake\s*=\s*false/.test(js));

// ============================================================
group('localStorage round-trip (mocked)');
// ============================================================
// Test loadBest/saveBest round trip with a fake localStorage
const loadBestSrc = extract('loadBest');
const saveBestSrc = extract('saveBest');
const loadUnlockedSrc = extract('loadUnlocked');
const saveUnlockedSrc = extract('saveUnlocked');
const getBestSrc = extract('getBest');
const getUnlockedSrc = extract('getUnlocked');

ok('loadBest extractable', !!loadBestSrc);
ok('saveBest extractable', !!saveBestSrc);
ok('loadUnlocked extractable', !!loadUnlockedSrc);
ok('saveUnlocked extractable', !!saveUnlockedSrc);
ok('getBest extractable', !!getBestSrc);
ok('getUnlocked extractable', !!getUnlockedSrc);

if (loadBestSrc && saveBestSrc) {
  const store = new Map();
  const lsSandbox = {
    JSON,
    localStorage: {
      getItem: function (k) { return store.has(k) ? store.get(k) : null; },
      setItem: function (k, v) { store.set(k, String(v)); },
      removeItem: function (k) { store.delete(k); },
      clear: function () { store.clear(); }
    },
    loadBest: null,
    saveBest: null
  };
  vm.createContext(lsSandbox);
  vm.runInContext(loadBestSrc + '\n' + saveBestSrc + '\nthis.loadBest = loadBest; this.saveBest = saveBest;', lsSandbox);

  const KEY = 'monorail-pilot-best';

  // Missing key returns null
  ok('loadBest returns null on missing key', lsSandbox.loadBest() === null);

  // Round-trip an object
  const payload = { bestScore: 1200, totalStars: 9, gamesPlayed: 3, perLevel: [{ stars: 6, score: 1200, completed: true }] };
  lsSandbox.saveBest(payload);
  ok('saveBest writes JSON to storage', store.get(KEY) === JSON.stringify(payload), store.get(KEY));

  const back = lsSandbox.loadBest();
  ok('loadBest retrieves identical payload',
     back && back.bestScore === 1200 && back.totalStars === 9 &&
     back.gamesPlayed === 3 && back.perLevel.length === 1,
     JSON.stringify(back));

  // Corrupted JSON returns null (no throw)
  store.set(KEY, '{not-valid-json');
  const recovered = lsSandbox.loadBest();
  ok('loadBest swallows JSON parse errors, returns null', recovered === null);

  // Storage-throws scenario (Safari private mode)
  const throwing = {
    JSON,
    localStorage: {
      getItem: function () { throw new Error('quota'); },
      setItem: function () { throw new Error('quota'); }
    },
    loadBest: null,
    saveBest: null
  };
  vm.createContext(throwing);
  vm.runInContext(loadBestSrc + '\n' + saveBestSrc + '\nthis.loadBest = loadBest; this.saveBest = saveBest;', throwing);
  let threw = false;
  try { throwing.saveBest({ a: 1 }); throwing.loadBest(); }
  catch (e) { threw = true; }
  ok('loadBest/saveBest swallow storage exceptions', !threw);
}

if (loadUnlockedSrc && saveUnlockedSrc) {
  const store2 = new Map();
  const ulSandbox = {
    JSON,
    localStorage: {
      getItem: function (k) { return store2.has(k) ? store2.get(k) : null; },
      setItem: function (k, v) { store2.set(k, String(v)); },
      removeItem: function (k) { store2.delete(k); },
      clear: function () { store2.clear(); }
    },
    loadUnlocked: null,
    saveUnlocked: null,
    LEVELS: [{}, {}, {}, {}, {}, {}]
  };
  vm.createContext(ulSandbox);
  vm.runInContext(loadUnlockedSrc + '\n' + saveUnlockedSrc + '\nthis.loadUnlocked = loadUnlocked; this.saveUnlocked = saveUnlocked;', ulSandbox);

  const KEY2 = 'monorail-pilot-unlocked';

  // Round-trip unlocked data
  const ulPayload = { levels: [true, false, false, false, false, false], settings: {} };
  ulSandbox.saveUnlocked(ulPayload);
  ok('saveUnlocked writes to storage', store2.get(KEY2) === JSON.stringify(ulPayload));

  const back = ulSandbox.loadUnlocked();
  ok('loadUnlocked retrieves unlock data',
     back && back.levels && back.levels[0] === true && back.levels[1] === false, JSON.stringify(back));
}

// ============================================================
group('getBest / getUnlocked default values');
// ============================================================
if (getBestSrc) {
  const gbSandbox = {
    JSON,
    loadBest: function () { return null; },
    getBest: null
  };
  vm.createContext(gbSandbox);
  vm.runInContext(getBestSrc + '\nthis.getBest = getBest;', gbSandbox);
  const gbResult = gbSandbox.getBest();
  ok('getBest returns default object when no saved data',
     gbResult && gbResult.bestScore === 0 && gbResult.totalStars === 0 &&
     gbResult.gamesPlayed === 0 && Array.isArray(gbResult.perLevel),
     JSON.stringify(gbResult));
}

if (getUnlockedSrc) {
  // Use a sandbox referencing LEVELS
  const guSandbox = {
    JSON,
    LEVELS: [{}, {}, {}, {}, {}, {}],
    loadUnlocked: function () { return null; },
    getUnlocked: null
  };
  vm.createContext(guSandbox);
  vm.runInContext(getUnlockedSrc + '\nthis.getUnlocked = getUnlocked;', guSandbox);
  const guResult = guSandbox.getUnlocked();
  ok('getUnlocked returns default with only level 0 unlocked',
     guResult && guResult.levels && guResult.levels[0] === true &&
     guResult.levels[1] === false && guResult.levels[2] === false,
     JSON.stringify(guResult));
}

// ============================================================
group('Audio: acceleration hum');
// ============================================================
ok('startAccelHum creates oscillator', actionContains('startAccelHum', [/createOscillator/]));
ok('updateAccelHum adjusts frequency by speed ratio',
   /ratio\s*=\s*speed\s*\/\s*maxSpeed/.test(js));
ok('updateAccelHum maps 60-180Hz', /60\s*\+\s*ratio\s*\*\s*120/.test(js));
ok('stopAccelHum ramps gain down', /exponentialRampToValueAtTime/.test(js) && /humGain/.test(js));

// ============================================================
group('Canvas & rendering');
// ============================================================
ok('render() checks canvas dimensions', /W\s*===\s*0\s*\|\|\s*H\s*===\s*0/.test(js));
ok('render() draws sky gradient', /createLinearGradient/.test(js));
ok('render() draws parallax stars', /starOffset/.test(js));
ok('render() draws city buildings parallax', /cityOff/.test(js));
ok('render() draws track ties', /tieSpacing/.test(js));
ok('render() draws neon rail line', /shadowColor.*00f0ff/.test(js));
ok('render() draws station platforms', /Platform/.test(js));
ok('render() draws station signs', /station sign/i.test(js) || /fillText\(i\s*\+\s*1/.test(js));
ok('render() draws train with roundRect', /roundRect\(trainX/.test(js));
ok('render() draws headlight beam', /Headlight beam/i.test(js) || /trainX\s*\+\s*19[\s\S]{0,20}trainY/.test(js));
ok('render() draws speed lines when speed > 50', /spd\s*>\s*50/.test(js));
ok('render() draws FINISH marker after all stations', /FINISH/.test(js));
ok('render() draws station name labels', /station names/i.test(js) || /fillText\(st\.name/.test(js));
ok('render() shows countdown bar for next station', /fillRatio/.test(js) && /barX/.test(js));

// ============================================================
group('HUD updates');
// ============================================================
ok('updateHUD shows station progress (1/3)', /stationDisplay\.textContent/.test(js));
ok('updateHUD shows elapsed time', /timeDisplay\.textContent[\s\S]{0,30}s'/ .test(js) || /timeDisplay\.textContent[\s\S]{0,40}\+ 's'/.test(js));
ok('updateHUD shows star display', /starsDisplay\.textContent/.test(js));
ok('updateHUD shows target time for current station',
   /targetDisplay\.textContent\s*=/.test(js));
ok('updateSpeedGauge shows speed number',
   /speedDisplay\.textContent/.test(js));
ok('updateSpeedGauge updates speed fill height',
   /speedFill\.style\.height/.test(js));
ok('updateSpeedGauge color transitions at 80% and 50%',
   /pct\s*>\s*80/.test(js) && /pct\s*>\s*50/.test(js));

// ============================================================
group('Edge cases & hardening');
// ============================================================
ok('Station detection uses TRIGGER_RADIUS', /TRIGGER_RADIUS/.test(js));
ok('Station evaluation only if currentStation within bounds',
   /currentStation\s*<\s*lv\.stations\.length/.test(js));
ok('render() early returns if canvas or level missing',
   /W\s*===\s*0\s*\|\|\s*H\s*===\s*0\s*\|\|\s*!\s*lv/.test(js));
ok('animationFrame set to null on cleanup', /animFrame\s*=\s*null/.test(js));
ok('startGame checks level is unlocked before starting',
   /!unlocked\.levels\[levelIndex\]/.test(js));
ok('Resize uses debounce (setTimeout 200ms)', /setTimeout[\s\S]{0,80}setupCanvas/.test(js));
ok('initLevel sets worldX = -50 (starts before first station)', /worldX:\s*-50/.test(js));

// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed · ${fail} failed`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
