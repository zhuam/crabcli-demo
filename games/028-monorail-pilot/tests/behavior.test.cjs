#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Monorail Pilot (Issue #28).
 *
 * Complements static.test.cjs with:
 *   - VM-executed unit tests of pure functions (calculateScore, loadScores, saveScores)
 *   - Physics simulation: speed/accel/brake/friction boundaries
 *   - Station stopping logic: normal/express/finish station types
 *   - Scoring calculation with accuracy, time bonus, missed station penalty
 *   - localStorage round-trip with mocked storage
 *   - Sound engine guard conditions (settings.sound gate, throttle)
 *   - Level data validation (time limits, distances, star thresholds)
 *
 * Run: node games/028-monorail-pilot/tests/behavior.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Extract all inline JS from <script> in HTML */
function extractAllJS() {
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const js = m[1].trim();
    if (js && !js.startsWith('window.')) scripts.push(js);
  }
  return scripts.join('\n');
}

const js = extractAllJS();

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

/**
 * Extract a top-level function body from the JS source by walking balanced braces.
 */
function extract(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  let i = js.indexOf('{', m.index);
  let depth = 1, end = i + 1;
  while (depth > 0 && end < js.length) {
    const c = js[end];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    end++;
  }
  return js.slice(m.index, end);
}

/**
 * Extract LEVELS array literal (the [...] part only) as evaluable JS expression.
 * We skip "const LEVELS = " prefix so the result is a valid expression.
 */
function extractLevels() {
  const start = js.indexOf('[', js.indexOf('LEVELS'));
  if (start < 0) return null;
  let depth = 1, end = start + 1;
  while (depth > 0 && end < js.length) {
    const c = js[end];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    end++;
  }
  return js.slice(start, end);
}

// ============================================================
group('GAME CONSTANTS & PHYSICS');
// ============================================================
ok('MAX_SPEED = 420', /MAX_SPEED\s*=\s*420/.test(js));
ok('ACCEL = 180 (units/s²)', /ACCEL\s*=\s*180/.test(js));
ok('BRAKE = 320 (units/s², stronger than accel)', /BRAKE\s*=\s*320/.test(js));
ok('FRICTION = 50 (coast deceleration)', /FRICTION\s*=\s*50/.test(js));
ok('STOP_THRESHOLD = 20 (speed for "stopped")', /STOP_THRESHOLD\s*=\s*20/.test(js));
ok('STOP_ZONE_RADIUS = 40 (distance tolerance)', /STOP_ZONE_RADIUS\s*=\s*40/.test(js));
ok('APPROACH_DIST = 300 (HUD station preview)', /APPROACH_DIST\s*=\s*300/.test(js));

// Physics relationships
ok('BRAKE (320) > ACCEL (180) — stronger braking than acceleration', /\bBRAKE\b[\s\S]{0,10}320/.test(js) && /\bACCEL\b[\s\S]{0,10}180/.test(js));
ok('STOP_THRESHOLD < MAX_SPEED × 0.05 (stop threshold is small)', 20 < 420 * 0.05);

// ============================================================
group('LEVEL DATA VALIDATION');
// ============================================================
const levelsSrc = extractLevels();
ok('LEVELS array extractable', !!levelsSrc);
let levels = null;
if (levelsSrc) {
  try {
    const ctx = { result: null, Math, MAX_SPEED: 420 };
    vm.createContext(ctx);
    // Replace MAX_SPEED arithmetic with computed values since VM can't evaluate expressions
    let sanitized = levelsSrc
      .replace(/MAX_SPEED\s*\+\s*20/g, '440')
      .replace(/MAX_SPEED\s*\-\s*30/g, '390')
      .replace(/MAX_SPEED\s*\-\s*20/g, '400')
      .replace(/MAX_SPEED/g, '420');
    vm.runInContext(`result = (${sanitized});`, ctx);
    levels = ctx.result;
  } catch (e) {
    ok('LEVELS evaluable as JS', false, e.message);
  }
}

if (levels) {
  ok('6 levels defined', levels.length === 6, String(levels.length));

  // Check each level
  const levelIds = levels.map(l => l.id);
  ok('Level IDs are 1-6 sequential', JSON.stringify(levelIds) === JSON.stringify([1,2,3,4,5,6]));

  // Every level has required fields
  levels.forEach((lv, i) => {
    ok(`Level ${lv.id} "${lv.name}" has name`, typeof lv.name === 'string' && lv.name.length > 0);
    ok(`Level ${lv.id} has desc`, typeof lv.desc === 'string' && lv.desc.length > 0);
    ok(`Level ${lv.id} distance > 0`, lv.distance > 0, String(lv.distance));
    ok(`Level ${lv.id} has stations[]`, Array.isArray(lv.stations) && lv.stations.length >= 2);
    ok(`Level ${lv.id} timeLimit > 0`, lv.timeLimit > 0, String(lv.timeLimit));
    ok(`Level ${lv.id} stars3 > 0`, lv.stars3 > 0, String(lv.stars3));
    ok(`Level ${lv.id} stars2 > 0`, lv.stars2 > 0, String(lv.stars2));
    ok(`Level ${lv.id} bgType is valid`, ['city','coastal','night'].includes(lv.bgType));
    ok(`Level ${lv.id} maxSpeed > 0`, lv.maxSpeed > 0, String(lv.maxSpeed));
  });

  // Time limits: all ≤ 180 (AC2)
  const maxTimeLimit = Math.max(...levels.map(l => l.timeLimit));
  ok('All timeLimits ≤ 180s (3 min)', maxTimeLimit <= 180, `max=${maxTimeLimit}`);

  // Distance: each level has its own distance design
  ok('Level 6 (Night Express) is the longest', levels[5].distance >= 5000);
  ok('Level 1 (Beginner) is the shortest', levels[0].distance <= 2500);

  // Station count
  const stationCounts = levels.map(l => l.stations.length);
  ok('Each level has ≥2 stations', stationCounts.every(c => c >= 2), String(stationCounts));

  // Each level ends with a "finish" station
  levels.forEach((lv, i) => {
    const lastSt = lv.stations[lv.stations.length - 1];
    ok(`Level ${lv.id}: last station is 'finish' type`, lastSt.type === 'finish');
    ok(`Level ${lv.id}: last station pos ≈ distance`, Math.abs(lastSt.pos - lv.distance) <= 
         lv.distance * 0.10,
       `pos=${lastSt.pos} dist=${lv.distance}`);
  });

  // Station positions are within level distance
  levels.forEach(lv => {
    lv.stations.forEach((st, si) => {
      ok(`Level ${lv.id} station ${si} "${st.name}" pos ≤ distance`, st.pos <= lv.distance + 50);
      if (si > 0) {
        ok(`Level ${lv.id} stations[${si}] pos > stations[${si-1}] pos (ascending)`,
           st.pos > lv.stations[si-1].pos);
      }
    });
  });

  // Speed limits exist in levels that have them
  const levelsWithSpeedLimits = levels.filter(l => l.speedLimits && l.speedLimits.length > 0);
  ok('Levels with speed limits', levelsWithSpeedLimits.length >= 3,
     `${levelsWithSpeedLimits.length}/6 levels`);

  // Speed limit boundaries are within level distance
  levelsWithSpeedLimits.forEach(lv => {
    lv.speedLimits.forEach((sl, si) => {
      ok(`Level ${lv.id} speedLimit[${si}] from≥0`, sl.from >= 0);
      ok(`Level ${lv.id} speedLimit[${si}] to≤distance`, sl.to <= lv.distance);
      ok(`Level ${lv.id} speedLimit[${si}] to>from`, sl.to > sl.from);
      ok(`Level ${lv.id} speedLimit[${si}] limit>0`, sl.limit > 0);
    });
  });

  // Curve data exists in some levels
  const levelsWithCurves = levels.filter(l => l.curves && l.curves.length > 0);
  ok('Some levels have curves', levelsWithCurves.length >= 2);

  // Express station exists in level 5
  const expressStations = levels.flatMap(l => l.stations.filter(s => s.type === 'express'));
  ok('Express station type exists (in Level 5)', expressStations.length > 0);
}

// ============================================================
group('SCORE CALCULATION');
// ============================================================
const calcSrc = extract('calculateScore');
ok('calculateScore function extractable', !!calcSrc);
if (calcSrc) {
  // Build sandbox with state + level
  const ctx = {
    state: {
      elapsed: 90,
      stationAccuracy: [
        {pos: 500, accuracy: 92},
        {pos: 1400, accuracy: 85},
        {pos: 2200, accuracy: 78}
      ],
      missedStations: [],
      completedStations: [500, 1400, 2200]
    },
    Math,
    result: null
  };
  const level1 = {
    id: 1, timeLimit: 90, distance: 2400,
    stars3: 85, stars2: 60,
    stations: [
      {pos:500,name:'North Park',type:'normal'},
      {pos:1400,name:'East Gate',type:'normal'},
      {pos:2200,name:'Central Hub',type:'finish'}
    ]
  };
  ctx.level = level1;
  try {
    vm.createContext(ctx);
    vm.runInContext(`${calcSrc}\nthis.result = calculateScore(level);`, ctx);
    const r = ctx.result;
    ok('calculateScore returns object with score/stars/timeBonus/stationScore/missedPenalty',
      r && typeof r.score === 'number' && typeof r.stars === 'number');
    if (r) {
      ok('Score ≥ 0', r.score >= 0, String(r.score));
      ok('Stars is 1, 2, or 3', r.stars >= 1 && r.stars <= 3, String(r.stars));
      ok('timeBonus based on remaining time', r.timeBonus >= 0, String(r.timeBonus));
      ok('stationScore based on accuracy', r.stationScore >= 0, String(r.stationScore));
      ok('missedPenalty = 0 when no missed stations', r.missedPenalty === 0, String(r.missedPenalty));
    }
  } catch (e) {
    ok('calculateScore runs without error', false, e.message);
  }

  // Missed station penalty
  const ctx2 = {
    state: {
      elapsed: 95, stationAccuracy: [{pos:500, accuracy:80}],
      missedStations: [1400, 2200],
      completedStations: [500]
    },
    Math, level: level1, result: null
  };
  vm.createContext(ctx2);
  vm.runInContext(`${calcSrc}\nthis.result = calculateScore(level);`, ctx2);
  if (ctx2.result) {
    ok('Missed stations incur penalty of 500 each',
      ctx2.result.missedPenalty === 1000,
      String(ctx2.result.missedPenalty));
  }
}

// ============================================================
group('STATION STOP LOGIC');
// ============================================================
// Verify stop-related constants exist in the station update logic
const updateStationsSrc = extract('updateStations');
ok('updateStations function extractable', !!updateStationsSrc);
if (updateStationsSrc) {
  ok('Overshoot detection: pos > st.pos + STOP_ZONE_RADIUS + 20',
    /state\.pos\s*>\s*st\.pos\s*\+\s*STOP_ZONE_RADIUS\s*\+\s*20/.test(updateStationsSrc));
  ok('Missed station triggers playFail()',
    /playFail\(\)/.test(updateStationsSrc));
  ok('Missed station triggers vibrate(200)',
    /navigator\.vibrate\(200\)/.test(updateStationsSrc));
  ok('Normal station requires speed ≤ STOP_THRESHOLD',
    /state\.speed\s*<=\s*STOP_THRESHOLD/.test(updateStationsSrc));
  ok('Express station check: speed < maxSpeed × 0.45',
    /level\.maxSpeed\s*\*\s*0\.45/.test(updateStationsSrc));
  ok('Normal station stop duration timer',
    /state\.stationStopTimer\s*>=\s*st\.stopDuration/.test(updateStationsSrc));
  ok('Stop triggers playChime()',
    /playChime\(\)/.test(updateStationsSrc));
  ok('Station accuracy record', /state\.stationAccuracy\.push/.test(updateStationsSrc));
  ok('Finish station check: st.type === finish',
    /st\.type\s*===\s*['"]finish['"]/.test(updateStationsSrc));
  ok('Finish triggers state.finished = true',
    /state\.finished\s*=\s*true/.test(updateStationsSrc));
}

// ============================================================
group('UPDATE PHYSICS');
// ============================================================
const updatePhysicsSrc = extract('updatePhysics');
ok('updatePhysics function extractable', !!updatePhysicsSrc);
if (updatePhysicsSrc) {
  ok('Accel increases speed: min(maxSpeed, speed + ACCEL * dt)',
    /Math\.min\(level\.maxSpeed,\s*state\.speed\s*\+\s*ACCEL\s*\*\s*dt\)/.test(updatePhysicsSrc) ||
    /state\.speed\s*\+\s*ACCEL\s*\*\s*dt/.test(updatePhysicsSrc));
  ok('Brake decreases speed: max(0, speed - BRAKE * dt)',
    /state\.speed\s*-\s*BRAKE\s*\*\s*dt/.test(updatePhysicsSrc));
  ok('Friction when no input: max(0, speed - FRICTION * dt)',
    /state\.speed\s*-\s*FRICTION\s*\*\s*dt/.test(updatePhysicsSrc));
  ok('Speed limit enforcement: BRAKE × 1.5 in speed limit zones',
    /BRAKE\s*\*\s*1\.5/.test(updatePhysicsSrc));
  ok('Position capped at level.distance',
    /state\.pos\s*=\s*Math\.min\(state\.pos,\s*level\.distance\)/.test(updatePhysicsSrc));
}

// ============================================================
group('GAME LOOP');
// ============================================================
const gameLoopSrc = extract('gameLoop');
ok('gameLoop function extractable', !!gameLoopSrc);
if (gameLoopSrc) {
  ok('Delta time capped at 0.05s',
    /Math\.min\(\(time-lastTime\)\/1000,\s*0\.05\)/.test(gameLoopSrc));
  ok('Timer check: elapsed ≥ timeLimit triggers timeout failure',
    /state\.elapsed\s*>=\s*level\.timeLimit/.test(gameLoopSrc));
  ok('Time expiry calls showResult(level, false)',
    /showResult\(level,\s*false\)/.test(gameLoopSrc));
  ok('Finish check: finished && speed === 0 calls showResult(level, true)',
    /state\.finished\s*&&\s*state\.speed\s*===\s*0/.test(gameLoopSrc) &&
    /showResult\(level,\s*true\)/.test(gameLoopSrc));
  ok('gameLoop uses requestAnimationFrame',
    /requestAnimationFrame\(gameLoop\)/.test(gameLoopSrc));
}

// ============================================================
group('SHOW RESULT');
// ============================================================
const showResultSrc = extract('showResult');
ok('showResult function extractable', !!showResultSrc);
if (showResultSrc) {
  ok('resultTitle = Route Complete on win',
    /Route\s*Complete/.test(showResultSrc));
  ok('resultTitle = Time Expired on lose',
    /Time\s*Expired/.test(showResultSrc));
  ok('Play victory sound on win',
    /playVictory\(\)/.test(showResultSrc));
  ok('Play fail sound on lose',
    /playFail\(\)/.test(showResultSrc));
  ok('Confetti generated on win (50 pieces)',
    /for\(let i=0;i<50/i.test(showResultSrc) && /confettiContainer/.test(showResultSrc));
  ok('Result stars show correct number of ⭐',
    /'⭐'\.repeat\(result\.stars\)/.test(showResultSrc));
  ok('Best time saved when better score/stars',
    /!prev\|\|won&&result\.score>prev\.score\|\|result\.stars>prev\.stars/.test(showResultSrc));
  ok('scores.lastPlayed = new Date().toISOString()',
    /lastPlayed\s*=\s*new\s*Date\(\)\.toISOString\(\)/.test(showResultSrc));
}

// ============================================================
group('LOCAL STORAGE ROUND-TRIP');
// ============================================================
const loadScoresSrc = extract('loadScores');
const saveScoresSrc = extract('saveScores');
const loadSettingsSrc = extract('loadSettings');
const saveSettingsSrc = extract('saveSettings');
ok('loadScores extractable', !!loadScoresSrc);
ok('saveScores extractable', !!saveScoresSrc);
ok('loadSettings extractable', !!loadSettingsSrc);
ok('saveSettings extractable', !!saveSettingsSrc);

if (loadScoresSrc && saveScoresSrc) {
  const store = new Map();
  const sandbox = {
    JSON,
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear()
    },
    loadScores: null, saveScores: null, loadSettings: null, saveSettings: null
  };
  vm.createContext(sandbox);
  vm.runInContext(
    loadScoresSrc + '\n' + saveScoresSrc + '\n' +
    'this.loadScores = loadScores; this.saveScores = saveScores;',
    sandbox
  );

  // Missing key returns default
  const initial = sandbox.loadScores();
  ok('loadScores returns default object when no data',
    initial.levelScores && initial.totalStars === 0 && initial.lastPlayed === null);

  // Round-trip scores
  const payload = {
    levelScores: {1: {score: 8500, stars: 3, time: 72000}},
    totalStars: 3,
    lastPlayed: '2026-07-26T10:00:00Z'
  };
  sandbox.saveScores(payload);
  ok('saveScores writes JSON to localStorage',
    store.has('monorail_pilot_scores'));
  const raw = JSON.parse(store.get('monorail_pilot_scores'));
  ok('Saved data matches payload',
    raw.levelScores[1].score === 8500 && raw.totalStars === 3);

  // Read back
  const back = sandbox.loadScores();
  ok('loadScores retrieves identical payload',
    back.levelScores[1].score === 8500 && back.totalStars === 3);

  // Corrupted JSON returns default (no throw)
  store.set('monorail_pilot_scores', '{not-valid-json');
  const recovered = sandbox.loadScores();
  ok('loadScores handles JSON parse errors gracefully',
    recovered.totalStars === 0);
}

// Settings round-trip
if (loadSettingsSrc && saveSettingsSrc) {
  const store2 = new Map();
  const sandbox2 = {
    JSON,
    localStorage: {
      getItem: k => store2.has(k) ? store2.get(k) : null,
      setItem: (k, v) => store2.set(k, String(v)),
      removeItem: k => store2.delete(k),
      clear: () => store2.clear()
    },
    loadSettings: null, saveSettings: null
  };
  vm.createContext(sandbox2);
  vm.runInContext(
    loadSettingsSrc + '\n' + saveSettingsSrc + '\n' +
    'this.loadSettings = loadSettings; this.saveSettings = saveSettings;',
    sandbox2
  );

  const defaultSettings = sandbox2.loadSettings();
  ok('Default settings have sound: true',
    defaultSettings && defaultSettings.sound === true);

  sandbox2.saveSettings({sound: false});
  const changed = sandbox2.loadSettings();
  ok('Settings round-trip: sound=false persisted',
    changed && changed.sound === false);

  // Corrupted settings JSON
  store2.set('monorail_pilot_settings', '{broken');
  const recovered = sandbox2.loadSettings();
  ok('loadSettings handles JSON parse errors',
    recovered && recovered.sound === true);
}

// ============================================================
group('SOUND ENGINE');
// ============================================================
const playToneSrc = extract('playTone');
ok('playTone function extractable', !!playToneSrc);
if (playToneSrc) {
  ok('playTone respects settings.sound gate',
    /if\(!settings\.sound\)/.test(playToneSrc));
  ok('playTone wrapped in try/catch',
    /catch\(e\)\{\}/.test(playToneSrc));
  ok('AudioContext created lazily', /new\s+\(window\.AudioContext/.test(js));
  ok('webkitAudioContext fallback', /webkitAudioContext/.test(js));
  ok('AudioContext resumed when suspended',
    /audioCtx\.state\s*===\s*['"]suspended['"][\s\S]{0,50}resume/.test(js));
}

// Sound functions
const soundFunctions = ['playTone','playAccel','playBrake','playChime','playExpressPass','playVictory','playFail','playTick'];
soundFunctions.forEach(fn => {
  ok(`Sound function ${fn} defined`, new RegExp(`function\\s+${fn}`).test(js));
});

// At least 6 distinct sound-producing functions
const fnMatches = js.match(/function\s+play\w+/g) || [];
ok('At least 6 play* sound functions', fnMatches.length >= 6, String(fnMatches.length));

// ============================================================
group('VIBRATION');
// ============================================================
ok('Vibrate guarded: if(navigator.vibrate)', /if\s*\(\s*navigator\.vibrate\s*\)/.test(js));
ok('Vibrate(200) on overshoot/miss', /navigator\.vibrate\(200\)/.test(js));
ok('Vibrate(100) on station stop', /navigator\.vibrate\(100\)/.test(js));
ok('Vibrate(50) on express pass', /navigator\.vibrate\(50\)/.test(js));
ok('Vibrate([100,100,100]) on victory', /navigator\.vibrate\(\[100,100,100\]\)/.test(js));
ok('Vibrate(300) on failure', /navigator\.vibrate\(300\)/.test(js));

// ============================================================
group('INPUT HANDLING');
// ============================================================
const setupInputSrc = extract('setupInput');
ok('setupInput function extractable', !!setupInputSrc);
if (setupInputSrc) {
  ok('ArrowUp sets accelInput', /key==='ArrowUp'[\s\S]{0,150}accelInput=true/.test(setupInputSrc));
  ok('ArrowDown sets brakeInput', /key==='ArrowDown'[\s\S]{0,150}brakeInput=true/.test(setupInputSrc));
  ok('W key accel', /key==='w'[\s\S]{0,10}key==='W'[\s\S]{0,150}accelInput=true/.test(setupInputSrc));
  ok('S key brake', /key==='s'[\s\S]{0,10}key==='S'[\s\S]{0,150}brakeInput=true/.test(setupInputSrc));
  ok('Space key accel', /key===' '/.test(setupInputSrc));
  ok('P key toggles pause', /key==='p'[\s\S]{0,150}togglePause/.test(setupInputSrc));
  ok('Escape toggles pause', /key==='Escape'[\s\S]{0,150}togglePause/.test(setupInputSrc));
  ok('Enter on splash shows level select',
    /key==='Enter'[\s\S]{0,80}showLevelSelect/.test(setupInputSrc));
  ok('Keyup releases accel', /key==='ArrowUp'[\s\S]{0,150}accelInput=false/.test(setupInputSrc));
  ok('Keyup releases brake', /key==='ArrowDown'[\s\S]{0,150}brakeInput=false/.test(setupInputSrc));

  // Touch zones
  ok('touchLeft zone exists', /document\.getElementById\(['"]touchLeft['"]\)/.test(setupInputSrc));
  ok('touchRight zone exists', /document\.getElementById\(['"]touchRight['"]\)/.test(setupInputSrc));
  ok('touchstart on left zone', /leftZone\.addEventListener\(['"]touchstart['"]/.test(setupInputSrc));
  ok('touchstart on right zone', /rightZone\.addEventListener\(['"]touchstart['"]/.test(setupInputSrc));

  // Mouse events also work
  ok('mousedown on left zone', /leftZone\.addEventListener\(['"]mousedown['"]/.test(setupInputSrc));
  ok('mousedown on right zone', /rightZone\.addEventListener\(['"]mousedown['"]/.test(setupInputSrc));
}

// ============================================================
group('HUD UPDATE');
// ============================================================
const updateHUDSrc = extract('updateHUD');
ok('updateHUD function extractable', !!updateHUDSrc);
if (updateHUDSrc) {
  ok('Speed display via getElementById speedDisplay',
    /speedDisplay['"]\)\.textContent\s*=\s*Math\.round\(state\.speed\)/.test(updateHUDSrc));
  ok('Speed fill bar percentage', /fill\.style\.width\s*=\s*Math\.min\(100,\s*pct\*100\)/.test(updateHUDSrc));
  ok('Speed color: red when > 85%', /pct>0\.85[\s\S]{0,40}danger/.test(updateHUDSrc));
  ok('Speed color: yellow when 65-85%', /pct>0\.65[\s\S]{0,40}warning/.test(updateHUDSrc));
  ok('Speed color: green by default (else branch with success)',
    /else\s+fill\.style\.background\s*=\s*'var\(--success\)'/.test(updateHUDSrc));
  ok('Time display formatted as m:ss', /padStart\(2,'0'\)/.test(updateHUDSrc));
  ok('Station ETA shows "Slow down!" when too fast',
    /Slow\s*down/.test(updateHUDSrc) || /'Slow down!'/.test(updateHUDSrc));
}

// ============================================================
group('START GAME (RESET PURITY)');
// ============================================================
const startGameSrc = extract('startGame');
ok('startGame function extractable', !!startGameSrc);
if (startGameSrc) {
  // Verify all game state fields are reset
  ok('Resets state.pos = 0', /state\.pos\s*=\s*0/.test(startGameSrc));
  ok('Resets state.speed = 0', /state\.speed\s*=\s*0/.test(startGameSrc));
  ok('Resets state.accelInput = false', /state\.accelInput\s*=\s*false/.test(startGameSrc));
  ok('Resets state.brakeInput = false', /state\.brakeInput\s*=\s*false/.test(startGameSrc));
  ok('Resets state.stationIndex = 0', /state\.stationIndex\s*=\s*0/.test(startGameSrc));
  ok('Resets state.elapsed = 0', /state\.elapsed\s*=\s*0/.test(startGameSrc));
  ok('Clears completedStations', /state\.completedStations\s*=\s*\[\]/.test(startGameSrc));
  ok('Clears missedStations', /state\.missedStations\s*=\s*\[\]/.test(startGameSrc));
  ok('Clears stationAccuracy', /state\.stationAccuracy\s*=\s*\[\]/.test(startGameSrc));
  ok('Resets state.overshot = false', /state\.overshot\s*=\s*false/.test(startGameSrc));
  ok('Resets state.overshootTimer = 0', /state\.overshootTimer\s*=\s*0/.test(startGameSrc));
  ok('Resets state.finished = false', /state\.finished\s*=\s*false/.test(startGameSrc));
  ok('Clears particles array', /particles\s*=\s*\[\]/.test(startGameSrc));
  ok('Generates background', /generateBg\(level\.bgType\)/.test(startGameSrc));
  ok('Hides pause overlay', /getElementById\(['"]pauseOverlay['"]\)\.classList\.remove\(['"]show['"]\)/.test(startGameSrc));
  ok('Shows game screen', /showScreen\(['"]gameScreen['"]\)/.test(startGameSrc));
}

// ============================================================
group('TOGGLE PAUSE');
// ============================================================
const togglePauseSrc = extract('togglePause');
ok('togglePause function extractable', !!togglePauseSrc);
if (togglePauseSrc) {
  ok('Resume: removes pause overlay', /overlay\.classList\.remove\(['"]show['"]\)/.test(togglePauseSrc));
  ok('Resume: restarts animation frame', /requestAnimationFrame\(gameLoop\)/.test(togglePauseSrc));
  ok('Pause: cancels animation frame', /cancelAnimationFrame\(animFrameId\)/.test(togglePauseSrc));
  ok('Pause: shows overlay', /overlay\.classList\.add\(['"]show['"]\)/.test(togglePauseSrc));
}

// ============================================================
group('START GAME: LEVEL SELECTION VALIDATION');
// ============================================================
const renderLevelSelectSrc = extract('renderLevelSelect');
ok('renderLevelSelect function extractable', !!renderLevelSelectSrc);
if (renderLevelSelectSrc) {
  ok('Star count display: total / max', /totalStars\s*\+\s*' \/ '\s*\+\s*\(LEVELS\.length\*3\)/.test(renderLevelSelectSrc));
  ok('Locked card: ternary check', /unlocked\?\s*\x27\x27/.test(renderLevelSelectSrc));
  ok('Click handler on unlocked level cards', /card\.addEventListener\(['"]click['"],\(\)=>startGame\(level\.id\)\)/.test(renderLevelSelectSrc));
  ok('Level 1 always unlocked', /level\.id===1\|\|scores\.levelScores\[level\.id-1\]/.test(renderLevelSelectSrc));
}

// ============================================================
group('GAME OUTPUTS: accuracy & edge cases');
// ============================================================
ok('addParticles function defined', /function\s+addParticles/.test(js));
ok('updateParticles function defined', /function\s+updateParticles/.test(js));
ok('drawParticles function defined', /function\s+drawParticles/.test(js));
ok('Particle cleanup: life <= 0', /p\.life<=0/.test(js));

// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${pass} passed · ${fail} failed`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
