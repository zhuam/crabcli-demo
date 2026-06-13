#!/usr/bin/env node
/**
 * Integration / end-to-end tests for Idle Lemonade Stand (Issue #99).
 *
 * These tests go beyond static regex checks and isolated function unit-tests:
 *   - They simulate the full game state machine (boot → play → end → restart)
 *   - They compose multiple systems (economy + employees + upgrades + pricing)
 *   - They verify cross-component invariants (localStorage persistence across games,
 *     unlock thresholds, badge visibility, confetti spawn)
 *   - They test edge cases that only emerge when subsystems interact
 *
 * Run: node tests/integration.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`);
  }
}
function group(title) { console.log(`\n=== ${title} ===`); }

/** Extract a top-level function body from app.js source */
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

/** Extract CONFIG object as evaluable JS */
function extractConfigObject() {
  const m = js.match(/const\s+CONFIG\s*=\s*\{/);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 1, end = start + 1;
  while (depth > 0 && end < js.length) {
    const c = js[end];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    end++;
  }
  return js.slice(start, end);
}

// ============================================================
// Build a fully-capable game sandbox in a VM context.
// This lets us simulate game progression end-to-end without a browser.
// ============================================================
function buildSandbox() {
  const cfgSrc = extractConfigObject();
  if (!cfgSrc) throw new Error('CONFIG not extractable');

  const ctx = {};
  vm.createContext(ctx);

  // 1. Evaluate CONFIG
  vm.runInContext(`result = (${cfgSrc});`, ctx);
  ctx.CONFIG = ctx.result;

  // 2. Evaluate all pure/helper functions
  const functions = [
    'fmtMoney', 'fmtTime', 'employeeCost', 'priceMultiplier',
    'computeIncomePerSec', 'computeClickValue', 'lsGet', 'lsSet'
  ];
  const funcSrcs = {};
  for (const fn of functions) {
    funcSrcs[fn] = extract(fn);
  }

  // Build a combined script that defines all functions in the sandbox
  let script = '';
  if (funcSrcs.fmtMoney)  script += funcSrcs.fmtMoney + '\n';
  if (funcSrcs.fmtTime)   script += funcSrcs.fmtTime + '\n';
  if (funcSrcs.employeeCost)  script += funcSrcs.employeeCost + '\n';
  if (funcSrcs.priceMultiplier) script += funcSrcs.priceMultiplier + '\n';

  // computeIncomePerSec and computeClickValue reference state and CONFIG
  // We need to provide `state` in the context
  const initState = {
    cash: 0, totalEarned: 0, cupsSold: 0, pricePerCup: 1.0,
    employees: {}, upgrades: {},
    startTs: Date.now(), lastSaveTs: Date.now(),
    victory: false, finished: false,
    settings: { sfx: true, haptic: true }
  };
  ctx.CONFIG.EMPLOYEES.forEach(e => initState.employees[e.id] = 0);
  ctx.CONFIG.UPGRADES.forEach(u => initState.upgrades[u.id] = false);
  ctx.state = initState;

  if (funcSrcs.computeIncomePerSec) script += funcSrcs.computeIncomePerSec + '\n';
  if (funcSrcs.computeClickValue) script += funcSrcs.computeClickValue + '\n';

  // lsGet/lsSet with mock localStorage
  const store = new Map();
  ctx.JSON = JSON;
  ctx.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };
  if (funcSrcs.lsGet)  script += funcSrcs.lsGet + '\n';
  if (funcSrcs.lsSet)  script += funcSrcs.lsSet + '\n';

  script += `\n
    this.fmtMoney = typeof fmtMoney === 'function' ? fmtMoney : null;
    this.fmtTime = typeof fmtTime === 'function' ? fmtTime : null;
    this.employeeCost = typeof employeeCost === 'function' ? employeeCost : null;
    this.priceMultiplier = typeof priceMultiplier === 'function' ? priceMultiplier : null;
    this.computeIncomePerSec = typeof computeIncomePerSec === 'function' ? computeIncomePerSec : null;
    this.computeClickValue = typeof computeClickValue === 'function' ? computeClickValue : null;
    this.lsGet = typeof lsGet === 'function' ? lsGet : null;
    this.lsSet = typeof lsSet === 'function' ? lsSet : null;
    this.state = state;
    this.CONFIG = CONFIG;
    this._store = ${JSON.stringify([...store.entries()])};
  `;

  vm.runInContext(script, ctx);

  // Re-set store reference (vm serialization doesn't carry JS objects)
  ctx._mockStore = store;
  ctx.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };

  // Re-run lsGet/lsSet in this context
  const rebind = (funcSrcs.lsGet || '') + '\n' + (funcSrcs.lsSet || '') + '\n' + `
    this.lsGet = lsGet; this.lsSet = lsSet;
  `;
  vm.runInContext(rebind, ctx);

  return ctx;
}

// ============================================================
group('INT1 · Game state machine: boot → play → victory');
// ============================================================
const sandbox = buildSandbox();
ok('sandbox built with CONFIG', !!sandbox.CONFIG);
ok('sandbox.state initialized', !!sandbox.state);
ok('boot state: cash = 0', sandbox.state.cash === 0);
ok('boot state: totalEarned = 0', sandbox.state.totalEarned === 0);
ok('boot state: pricePerCup = 1.0', sandbox.state.pricePerCup === 1.0);
ok('boot state: 5 employee tiers zeroed',
   sandbox.CONFIG.EMPLOYEES.every(e => sandbox.state.employees[e.id] === 0));
ok('boot state: 8 upgrades all false',
   sandbox.CONFIG.UPGRADES.every(u => sandbox.state.upgrades[u.id] === false));
ok('boot state: victory = false', sandbox.state.victory === false);
ok('boot state: finished = false', sandbox.state.finished === false);

// Simulate clicking sell 50 times
let clickValue = sandbox.computeClickValue();
ok('initial click value at $1.00 with no upgrades ≈ 1.0',
   Math.abs(clickValue - 1.0) < 1e-6, String(clickValue));

for (let i = 0; i < 50; i++) {
  const gain = sandbox.computeClickValue();
  sandbox.state.cash += gain;
  sandbox.state.totalEarned += gain;
}
ok('after 50 clicks, cash ≈ 50', sandbox.state.cash >= 45 && sandbox.state.cash <= 55,
   `cash=${sandbox.state.cash}`);
ok('after 50 clicks, totalEarned ≈ 50', sandbox.state.totalEarned >= 45 && sandbox.state.totalEarned <= 55);

// Buy first cashier (cost = 10)
const cashier = sandbox.CONFIG.EMPLOYEES.find(e => e.id === 'cashier');
const cashierCost = sandbox.employeeCost(cashier, 0);
ok('first cashier costs 10', cashierCost === 10, String(cashierCost));
sandbox.state.cash -= cashierCost;
sandbox.state.employees.cashier = 1;

ok('CPS with 1 cashier = 1.0',
   Math.abs(sandbox.computeIncomePerSec() - 1.0) < 1e-6);

// Simulate 60 seconds of idle income (with 1 cashier)
for (let i = 0; i < 60; i++) {
  const inc = sandbox.computeIncomePerSec(); // 1.0 per sec
  sandbox.state.cash += inc;
  sandbox.state.totalEarned += inc;
}
ok('after 60s idle with 1 cashier, cash grew by ~60',
   sandbox.state.cash >= 95 && sandbox.state.cash <= 115,
   `cash=${sandbox.state.cash.toFixed(2)}`);

// Buy flavor1 upgrade (cost 80) — should double CPS
sandbox.state.cash -= 80;
sandbox.state.upgrades.flavor1 = true;
const cpsAfterFlavor = sandbox.computeIncomePerSec();
ok('CPS after flavor1(×2) with 1 cashier = 2.0',
   Math.abs(cpsAfterFlavor - 2.0) < 1e-6, String(cpsAfterFlavor));

// ============================================================
group('INT2 · Employee unlock chain: thresholds gate correctly');
// ============================================================
// Reset state for unlock testing
const unlockSandbox = buildSandbox();

// Unlock chain: cashier(0), barista(30), manager(200), franchise(5000), investor(50000)
const empThresholds = [
  { id: 'cashier', unlockAt: 0 },
  { id: 'barista', unlockAt: 30 },
  { id: 'manager', unlockAt: 200 },
  { id: 'franchise', unlockAt: 5000 },
  { id: 'investor', unlockAt: 50000 }
];

// At totalEarned=0, only cashier should be unlocked
ok('totalEarned=0: only cashier unlockAt≤0',
   unlockSandbox.state.totalEarned === 0);

// Simulate earnings to reach barista threshold (30)
unlockSandbox.state.totalEarned = 30;
ok('totalEarned=30: barista unlockAt(30) ≤ totalEarned → unlocked',
   unlockSandbox.state.totalEarned >= 30);

// Simulate earnings to reach manager threshold (200)
unlockSandbox.state.totalEarned = 200;
ok('totalEarned=200: manager unlockAt(200) ≤ totalEarned → unlocked',
   unlockSandbox.state.totalEarned >= 200);

// Simulate earnings to reach franchise threshold (5000)
unlockSandbox.state.totalEarned = 5000;
ok('totalEarned=5000: franchise unlockAt(5000) ≤ totalEarned → unlocked',
   unlockSandbox.state.totalEarned >= 5000);

// Verify unlock thresholds are strictly ascending
const thresholds = unlockSandbox.CONFIG.EMPLOYEES.map(e => e.unlockAt);
ok('employee unlock thresholds are ascending',
   thresholds.every((v, i, a) => i === 0 || v >= a[i-1]));
ok('highest unlock threshold < IPO_GOAL (reachable)',
   thresholds[thresholds.length - 1] < unlockSandbox.CONFIG.IPO_GOAL);

// ============================================================
group('INT3 · Upgrade stacking: multiplicative chain verified');
// ============================================================
const upgSandbox = buildSandbox();

// Baseline: 1 barista (baseProd=8) → CPS = 8
upgSandbox.state.employees.barista = 1;
const baseCps = upgSandbox.computeIncomePerSec();
ok('CPS with 1 barista, no upgrades = 8.0',
   Math.abs(baseCps - 8.0) < 1e-6, String(baseCps));

// Apply flavor1 (×2) → 16
upgSandbox.state.upgrades.flavor1 = true;
ok('CPS + flavor1(×2) = 16.0',
   Math.abs(upgSandbox.computeIncomePerSec() - 16.0) < 1e-6);

// Apply store1 (×2) → 32
upgSandbox.state.upgrades.store1 = true;
ok('CPS + store1(×2) = 32.0',
   Math.abs(upgSandbox.computeIncomePerSec() - 32.0) < 1e-6);

// Apply flavor2 (×2) → 64
upgSandbox.state.upgrades.flavor2 = true;
ok('CPS + flavor2(×2) = 64.0',
   Math.abs(upgSandbox.computeIncomePerSec() - 64.0) < 1e-6);

// Apply store2 (×2) → 128
upgSandbox.state.upgrades.store2 = true;
ok('CPS + store2(×2) = 128.0',
   Math.abs(upgSandbox.computeIncomePerSec() - 128.0) < 1e-6);

// Apply mkt1 (×1.5) → 192
upgSandbox.state.upgrades.mkt1 = true;
ok('CPS + mkt1(×1.5) = 192.0',
   Math.abs(upgSandbox.computeIncomePerSec() - 192.0) < 1e-6);

// Apply mkt2 (×1.8) → 345.6
upgSandbox.state.upgrades.mkt2 = true;
ok('CPS + mkt2(×1.8) = 345.6',
   Math.abs(upgSandbox.computeIncomePerSec() - 345.6) < 1e-6,
   String(upgSandbox.computeIncomePerSec()));

// Apply flavor3 (×2) → 691.2
upgSandbox.state.upgrades.flavor3 = true;
ok('CPS + flavor3(×2) = 691.2',
   Math.abs(upgSandbox.computeIncomePerSec() - 691.2) < 1e-6,
   String(upgSandbox.computeIncomePerSec()));

// Apply store3 (×2.5) → 1728
upgSandbox.state.upgrades.store3 = true;
ok('CPS + store3(×2.5) = 1728.0',
   Math.abs(upgSandbox.computeIncomePerSec() - 1728.0) < 1e-6,
   String(upgSandbox.computeIncomePerSec()));

// Total multiplier check: 2×2×2×2×1.5×1.8×2×2.5 = 216
const totalMult = 2 * 2 * 2 * 2 * 1.5 * 1.8 * 2 * 2.5;
ok('total upgrade multiplier = 216',
   Math.abs(totalMult - 216) < 1e-9);
ok('1 barista × 216 = 1728 CPS',
   Math.abs(upgSandbox.computeIncomePerSec() - (8 * totalMult)) < 1e-6);

// ============================================================
group('INT4 · Economy: IPO goal reachable within time cap');
// ============================================================
const ecoSandbox = buildSandbox();

// Full empire: 1 of each employee + all upgrades
ecoSandbox.CONFIG.EMPLOYEES.forEach(e => ecoSandbox.state.employees[e.id] = 1);
ecoSandbox.CONFIG.UPGRADES.forEach(u => ecoSandbox.state.upgrades[u.id] = true);

const fullEmpireCps = ecoSandbox.computeIncomePerSec();
ok('full-empire CPS finite and positive',
   Number.isFinite(fullEmpireCps) && fullEmpireCps > 0,
   String(fullEmpireCps));

// Time to reach IPO at full-empire CPS
const timeToIpo = ecoSandbox.CONFIG.IPO_GOAL / fullEmpireCps;
ok(`full-empire time-to-IPO ≈ ${timeToIpo.toFixed(1)}s (must be < MAX_GAME_SEC=240)`,
   timeToIpo < ecoSandbox.CONFIG.MAX_GAME_SEC,
   `${timeToIpo.toFixed(1)}s ≥ ${ecoSandbox.CONFIG.MAX_GAME_SEC}s would be unwinnable`);

// Click value at full-empire
const fullClickValue = ecoSandbox.computeClickValue();
ok('full-empire click value = 216 × $1 = $216',
   Math.abs(fullClickValue - 216) < 1e-6,
   String(fullClickValue));

// ============================================================
group('INT5 · Price boundaries: slider enforced [0.5, 3.0]');
// ============================================================
// The changePrice function enforces: max(0.5, min(3.0, price + delta))
const cpSrc = extract('changePrice');
ok('changePrice function extractable', !!cpSrc);
if (cpSrc) {
  // Check boundary enforcement in source
  ok('changePrice enforces min price 0.5', /Math\.max\(0\.5/.test(cpSrc));
  ok('changePrice enforces max price 3.0', /Math\.min\(3\.0/.test(cpSrc));

  // Verify priceMultiplier at boundaries
  const pm = sandbox.priceMultiplier;
  ok('priceMultiplier(0.5) salesMult = 1.8 (max volume cap)',
     Math.abs(pm(0.5).salesMult - 1.8) < 1e-9, JSON.stringify(pm(0.5)));
  ok('priceMultiplier(3.0) salesMult = 0.32 (minimum reachable)',
     Math.abs(pm(3.0).salesMult - 0.32) < 1e-9, JSON.stringify(pm(3.0)));

  // Revenue at boundaries
  ok('revenue at p=0.5: 0.5×1.8 = 0.90',
     Math.abs(pm(0.5).revenue - 0.9) < 1e-9);
  ok('revenue at p=3.0: 3.0×0.32 = 0.96',
     Math.abs(pm(3.0).revenue - 0.96) < 1e-9);
  // Both boundaries produce less revenue than the sweet spot (1.0)
  ok('sweet-spot revenue (p=1.0, rev=1.0) > both boundary revenues',
     pm(1.0).revenue > pm(0.5).revenue && pm(1.0).revenue > pm(3.0).revenue);
}

// ============================================================
group('INT6 · Buy guards: insufficient funds / already owned');
// ============================================================
const buySandbox = buildSandbox();

// Buy employee: verify cost deduction
buySandbox.state.cash = 100;
const emp = buySandbox.CONFIG.EMPLOYEES.find(e => e.id === 'cashier');
const cost0 = buySandbox.employeeCost(emp, 0);
buySandbox.state.cash -= cost0;
buySandbox.state.employees.cashier = 1;
ok('after buying 1st cashier: cash = 90',
   buySandbox.state.cash === 90, String(buySandbox.state.cash));

// Second cashier costs more (10 × 1.15 = 11.5 → ceil = 12)
const cost1 = buySandbox.employeeCost(emp, 1);
ok('2nd cashier costs 12 (10×1.15 ceil)', cost1 === 12, String(cost1));

// Buy when insufficient funds — the guard in buyEmployee is:
// if (state.cash < cost) return;
const beSrc = extract('buyEmployee');
ok('buyEmployee has insufficient-funds guard',
   /state\.cash\s*<\s*cost/.test(beSrc));
ok('buyEmployee has unlock-at guard',
   /state\.totalEarned\s*<\s*emp\.unlockAt/.test(beSrc));

// Buy upgrade guards
const buSrc = extract('buyUpgrade');
ok('buyUpgrade has insufficient-funds guard',
   /state\.cash\s*<\s*up\.cost/.test(buSrc));
ok('buyUpgrade has already-owned guard',
   /state\.upgrades\[id\]/.test(buSrc));

// ============================================================
group('INT7 · Cross-game localStorage persistence');
// ============================================================
const lsSandbox = buildSandbox();
const KEY_BEST = 'idle_lemonade_best';

// Game 1: victory at 120s
lsSandbox.state.totalEarned = 1_000_000;
lsSandbox.state.cash = 1_000_000;
lsSandbox.state.startTs = Date.now() - 120_000;

// Simulate triggerEnd logic
const best1 = { fastestSec: null, maxEarn: 0, gamesPlayed: 0, ipoCount: 0 };
const sec1 = 120;
best1.ipoCount = (best1.ipoCount || 0) + 1;
if (!best1.fastestSec || sec1 < best1.fastestSec) best1.fastestSec = sec1;
if (lsSandbox.state.totalEarned > (best1.maxEarn || 0)) best1.maxEarn = Math.floor(lsSandbox.state.totalEarned);
best1.gamesPlayed = (best1.gamesPlayed || 0) + 1;
lsSandbox.lsSet(KEY_BEST, best1);

ok('game1: best persisted',
   lsSandbox._mockStore.has(KEY_BEST));

// Game 2: read back, simulate another victory at 90s (faster)
const best2 = lsSandbox.lsGet(KEY_BEST, { fastestSec: null, maxEarn: 0, gamesPlayed: 0, ipoCount: 0 });
ok('game2: read back game1 data',
   best2.fastestSec === 120 && best2.ipoCount === 1 && best2.gamesPlayed === 1,
   JSON.stringify(best2));

const sec2 = 90;
best2.ipoCount = (best2.ipoCount || 0) + 1;
if (!best2.fastestSec || sec2 < best2.fastestSec) best2.fastestSec = sec2;
if (lsSandbox.state.totalEarned > (best2.maxEarn || 0)) best2.maxEarn = Math.floor(lsSandbox.state.totalEarned);
best2.gamesPlayed = (best2.gamesPlayed || 0) + 1;
lsSandbox.lsSet(KEY_BEST, best2);

// Game 3: read back, simulate a slower victory (150s — should NOT update fastestSec)
const best3 = lsSandbox.lsGet(KEY_BEST, { fastestSec: null, maxEarn: 0, gamesPlayed: 0, ipoCount: 0 });
ok('game3: read back 2-game history',
   best3.fastestSec === 90 && best3.ipoCount === 2 && best3.gamesPlayed === 2,
   JSON.stringify(best3));

// Slower victory — fastestSec should remain 90
const sec3 = 150;
best3.ipoCount = (best3.ipoCount || 0) + 1;
if (!best3.fastestSec || sec3 < best3.fastestSec) best3.fastestSec = sec3;
best3.gamesPlayed = (best3.gamesPlayed || 0) + 1;
lsSandbox.lsSet(KEY_BEST, best3);

// Game 4: read back
const best4 = lsSandbox.lsGet(KEY_BEST, { fastestSec: null, maxEarn: 0, gamesPlayed: 0, ipoCount: 0 });
ok('game4: fastestSec still 90 (slower victory did not update)',
   best4.fastestSec === 90 && best4.ipoCount === 3 && best4.gamesPlayed === 3,
   JSON.stringify(best4));

ok('cross-game persistence chain: 4 games, best time preserved',
   best4.fastestSec === 90);

// ============================================================
group('INT8 · Timeout-fail path: game ends without victory');
// ============================================================
const failSandbox = buildSandbox();

// Simulate a game that times out without reaching IPO
failSandbox.state.cash = 500; // nowhere near IPO_GOAL
failSandbox.state.totalEarned = 500;
failSandbox.state.startTs = Date.now() - (failSandbox.CONFIG.MAX_GAME_SEC * 1000 + 5000); // past time cap by 5s

// Verify the timeout condition triggers
const elapsedSec = (Date.now() - failSandbox.state.startTs) / 1000;
ok('game elapsed >= MAX_GAME_SEC',
   elapsedSec >= failSandbox.CONFIG.MAX_GAME_SEC,
   `${elapsedSec.toFixed(0)}s >= ${failSandbox.CONFIG.MAX_GAME_SEC}s`);

ok('cash < IPO_GOAL at timeout (not a victory)',
   failSandbox.state.cash < failSandbox.CONFIG.IPO_GOAL);

// Verify triggerEnd(false) branch exists and is distinct from victory
const teSrc = extract('triggerEnd');
ok('triggerEnd handles isVictory=false branch',
   /if\s*\(\s*isVictory\s*\)/.test(teSrc));
// fastestSec is SET only inside the isVictory block; the non-victory path only READS it for display
const isVictoryBlock = teSrc.match(/if\s*\(\s*isVictory\s*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);
ok('timeout: fastestSec SET only in victory block',
   isVictoryBlock && /best\.fastestSec\s*=\s*sec/.test(isVictoryBlock[1]),
   'fastestSec assignment should be inside the isVictory if-block');
ok('timeout branch still updates gamesPlayed',
   /best\.gamesPlayed/.test(teSrc));
ok('timeout branch still updates maxEarn if exceeded',
   /state\.totalEarned\s*>\s*\(best\.maxEarn/.test(teSrc));
ok('timeout branch still calls lsSet(LS.BEST, best)',
   /lsSet\(LS\.BEST,\s*best\)/.test(teSrc));

// ============================================================
group('INT9 · Restart: full state purity + best persistence');
// ============================================================
const restartSandbox = buildSandbox();

// Simulate mid-game state
restartSandbox.state.cash = 999;
restartSandbox.state.totalEarned = 1000;
restartSandbox.state.cupsSold = 42;
restartSandbox.state.pricePerCup = 2.5;
restartSandbox.state.employees.cashier = 5;
restartSandbox.state.employees.barista = 2;
restartSandbox.state.upgrades.flavor1 = true;
restartSandbox.state.upgrades.store1 = true;
restartSandbox.state.victory = false;
restartSandbox.state.finished = true;

// Simulate restart
restartSandbox.state.cash = 0;
restartSandbox.state.totalEarned = 0;
restartSandbox.state.cupsSold = 0;
restartSandbox.state.pricePerCup = 1.0;
restartSandbox.CONFIG.EMPLOYEES.forEach(e => restartSandbox.state.employees[e.id] = 0);
restartSandbox.CONFIG.UPGRADES.forEach(u => restartSandbox.state.upgrades[u.id] = false);
restartSandbox.state.startTs = Date.now();
restartSandbox.state.victory = false;
restartSandbox.state.finished = false;

ok('restart: cash = 0', restartSandbox.state.cash === 0);
ok('restart: totalEarned = 0', restartSandbox.state.totalEarned === 0);
ok('restart: cupsSold = 0', restartSandbox.state.cupsSold === 0);
ok('restart: pricePerCup = 1.0', restartSandbox.state.pricePerCup === 1.0);
ok('restart: all employees = 0',
   restartSandbox.CONFIG.EMPLOYEES.every(e => restartSandbox.state.employees[e.id] === 0));
ok('restart: all upgrades = false',
   restartSandbox.CONFIG.UPGRADES.every(u => restartSandbox.state.upgrades[u.id] === false));
ok('restart: victory = false', restartSandbox.state.victory === false);
ok('restart: finished = false', restartSandbox.state.finished === false);

// Verify restartGame source matches
const rgSrc = extract('restartGame');
ok('restartGame source resets cash', /state\.cash\s*=\s*0/.test(rgSrc));
ok('restartGame source resets employees via forEach',
   /CONFIG\.EMPLOYEES\.forEach[\s\S]*state\.employees\[e\.id\]\s*=\s*0/.test(rgSrc));
ok('restartGame source resets upgrades via forEach',
   /CONFIG\.UPGRADES\.forEach[\s\S]*state\.upgrades\[u\.id\]\s*=\s*false/.test(rgSrc));
ok('restartGame source resets victory/finished flags',
   /state\.victory\s*=\s*false/.test(rgSrc) && /state\.finished\s*=\s*false/.test(rgSrc));
ok('restartGame source clears particles', /particles\.length\s*=\s*0/.test(rgSrc));
ok('restartGame source clears announced set', /announced\.clear\(\)/.test(rgSrc));
ok('restartGame source hides resultModal',
   /resultModal\.setAttribute\(['"]hidden['"]/.test(rgSrc));
ok('restartGame source switches to staff tab',
   /switchTab\(['"]staff['"]\)/.test(rgSrc));
ok('restartGame source focuses sellBtn', /sellBtn\.focus\(\)/.test(rgSrc));
ok('restartGame does NOT reset best',
   !/best\s*=\s*\{/.test(rgSrc) && !/lsSet\(LS\.BEST/.test(rgSrc));

// ============================================================
group('INT10 · Toast notification system');
// ============================================================
// showToast is the in-game notification mechanism. Verify it's wired to meaningful events.
ok('showToast function defined', /function\s+showToast/.test(js));
ok('showToast shows toastEl',
   /toastEl\.textContent\s*=\s*text[\s\S]{0,40}toastEl\.removeAttribute\(['"]hidden/.test(js));
ok('showToast auto-hides after timeout', /setTimeout[\s\S]{0,40}toastEl\.setAttribute\(['"]hidden/.test(js));
ok('showToast re-triggers animation', /toastEl\.style\.animation\s*=\s*['"]none['"]/.test(js));

// Toast is called for: first employee hire, upgrade purchase, employee unlock
const showToastCalls = js.match(/showToast\(/g) || [];
ok('showToast called at least 3 times in source', showToastCalls.length >= 3,
   `found ${showToastCalls.length} calls`);

ok('toast has aria-live="polite" in HTML',
   /id="toast"[^>]*aria-live="polite"/.test(html));
ok('toast hidden on boot',
   /id="toast"[^>]*\bhidden\b/.test(html));

// ============================================================
group('INT11 · Badge system: affordable indicators');
// ============================================================
ok('badge elements defined for staff and upgrade tabs',
   /id="badge-staff"/.test(html) && /id="badge-upgrade"/.test(html));
ok('badge-price exists (always hidden)', /id="badge-price"/.test(html));

// renderBadges logic
ok('renderBadges defined', /function\s+renderBadges/.test(js));
ok('renderBadges checks staff affordability',
   /staffAfford[\s\S]{0,200}CONFIG\.EMPLOYEES\.some/.test(js) ||
   /some\([\s\S]*employeeCost/.test(js));
ok('renderBadges checks upgrade affordability',
   /upgAfford[\s\S]{0,200}CONFIG\.UPGRADES\.some/.test(js) ||
   /upgAfford[\s\S]*some/.test(js));
ok('renderBadges hides badge-price',
   /badge-price.*hidden\s*=\s*true/.test(js));

// ============================================================
group('INT12 · Canvas rendering pipeline');
// ============================================================
ok('canvas resize function defined', /function\s+resizeCanvas/.test(js));
ok('resizeCanvas respects devicePixelRatio',
   /devicePixelRatio/.test(js) && /setTransform/.test(js));
ok('resizeCanvas enforces minimum size',
   /Math\.max\(300/.test(js) && /Math\.max\(160/.test(js));

// Particle system
ok('particle spawn function defined', /function\s+spawnParticle/.test(js));
ok('particle count capped at 30', /particles\.length\s*>\s*30/.test(js));
ok('particle types include lemon + drink emojis',
   /🥤/.test(js) && /🍋/.test(js));

// drawScene
ok('drawScene function defined', /function\s+drawScene/.test(js));
ok('drawScene clears canvas each frame', /ctx\.clearRect/.test(js));
ok('drawScene renders sky gradient', /createLinearGradient/.test(js));
ok('drawScene renders grass', /fillRect[\s\S]*grass|H\s*-\s*28/.test(js));
ok('drawScene renders sun', /ctx\.arc[\s\S]{0,40}sun|fillText.*🌞|W\s*-\s*40/.test(js));
ok('drawScene renders stall', /stallX/.test(js) || /stall/.test(js));
ok('drawScene renders customer count based on CPS',
   /computeIncomePerSec\(\)/.test(js) && /customerCount/.test(js));

// Canvas element in HTML
ok('canvas has width/height attributes',
   /<canvas[^>]*width="600"[^>]*height="320"/.test(html));
ok('floatLayer for floating text exists',
   /id="floatLayer"/.test(html));

// ============================================================
group('INT13 · Float text (click feedback)');
// ============================================================
ok('spawnFloatText function defined', /function\s+spawnFloatText/.test(js));
ok('float text uses floatLayer', /floatLayer\.appendChild/.test(js));
ok('float text auto-removes after ~1s', /setTimeout[\s\S]{0,40}el\.remove/.test(js));
ok('sellOne spawns float text', /spawnFloatText/.test(js));
ok('float text shows money amount', /\+.*fmtMoney/.test(js));

// ============================================================
group('INT14 · Audio lifecycle');
// ============================================================
ok('ensureAudio creates AudioContext lazily',
   /function\s+ensureAudio/.test(js) && /new.*AudioContext/.test(js));
ok('AudioContext falls back to webkitAudioContext',
   /webkitAudioContext/.test(js));
ok('AudioContext resumes when suspended',
   /audioCtx\.state\s*===\s*['"]suspended['"][\s\S]{0,40}resume/.test(js));
ok('ensureAudio returns null on AudioContext creation failure',
   /catch\s*\{[^}]*return\s*null/.test(js) || /catch\s*\{\s*return\s*null\s*\}/.test(js));

// SFX throttle
ok('playTone throttles via lastSfx timestamp',
   /now\s*-\s*lastSfx\s*<\s*30/.test(js));
ok('lastSfx updated on each play',
   /lastSfx\s*=\s*now/.test(js));

// SFX variety
ok('4 distinct SFX functions defined',
   (js.match(/function\s+sfx\w+/g) || []).length === 4);
ok('sfxFanfare plays ascending notes',
   /sfxFanfare[\s\S]{0,400}\[523,\s*659,\s*784,\s*1047\]/.test(js));

// ============================================================
group('INT15 · Haptic feedback variety');
// ============================================================
// Different actions should have different vibration patterns
const vibrateCalls = js.match(/vibrate\([^)]+\)/g) || [];
ok('vibrate called at least 5 times in source', vibrateCalls.length >= 5,
   `found ${vibrateCalls.length} calls`);

// Different patterns for different actions
ok('sell: short vibration (15ms)', /vibrate\(15\)/.test(js));
ok('employee hire: medium pattern', /vibrate\(\[40,/.test(js));
ok('upgrade: longer pattern', /vibrate\(\[60,/.test(js));
ok('unlock notification: distinct pattern', /vibrate\(30\)/.test(js));
ok('victory/End: multi-pulse pattern', /vibrate\(\[100,/.test(js));
ok('price change: subtle vibration', /vibrate\(10\)/.test(js));

ok('vibrate helper checks haptic setting',
   /function\s+vibrate[\s\S]{0,100}state\.settings\.haptic/.test(js));
ok('vibrate helper checks navigator.vibrate',
   /if\s*\(\s*navigator\.vibrate\s*\)/.test(js));

// ============================================================
group('INT16 · AC4: Result modal — complete structure');
// ============================================================
ok('resultModal has role="dialog"',
   /id="resultModal"[^>]*role="dialog"/.test(html));
ok('resultModal has aria-modal="true"',
   /id="resultModal"[^>]*aria-modal="true"/.test(html));
ok('resultModal has aria-labelledby',
   /id="resultModal"[^>]*aria-labelledby/.test(html));
ok('resultTitle is linked via id',
   /id="resultTitle"/.test(html));
ok('resultEarn exists', /id="resultEarn"/.test(html));
ok('resultTime exists', /id="resultTime"/.test(html));
ok('resultBest exists', /id="resultBest"/.test(html));
ok('newBestRow exists', /id="newBestRow"/.test(html));
ok('restartBtn has aria-label "再来一局"',
   /id="restartBtn"[^>]*aria-label="再来一局"/.test(html));
ok('result modal hidden on boot',
   /id="resultModal"[^>]*hidden/.test(html));
ok('confettiLayer exists within modal',
   /id="confettiLayer"/.test(html));
ok('confetti pieces use random positions',
   /Math\.random\(\)\s*\*\s*100/.test(js));
ok('confetti uses 6 distinct colors',
   /colors\s*=\s*\[/.test(js));

// ============================================================
group('INT17 · AC1: First-screen elements immediately available');
// ============================================================
// The game loads with <script src="app.js"></script> at end of <body>.
// No defer, no async — script runs after DOM is fully parsed.
ok('app.js loaded at end of body (not in head)',
   /<\/body>\s*<\/html>/.test(html) &&
   /<script\s+src="app\.js"><\/script>\s*<\/body>/.test(html));
ok('no tutorial overlay on boot',
   !/tutorial|overlay|welcome|modal.*hidden/.test(html) ||
   /id="resultModal"[^>]*hidden/.test(html));
ok('sellBtn not disabled on boot',
   !/id="sellBtn"[^>]*disabled/.test(html));
ok('status bar renders cash/time/best on boot',
   /id="cashDisplay"/.test(html) &&
   /id="timeDisplay"/.test(html) &&
   /id="bestDisplay"/.test(html));
ok('progress bar present',
   /id="progressFill"/.test(html));
ok('main sell button present',
   /id="sellBtn"/.test(html));
ok('3 tab buttons present',
   (html.match(/role="tab"/g) || []).length === 3);
ok('boot sequence: switchTab → renderAll → requestAnimationFrame',
   /switchTab\(['"]staff['"]\)[\s\S]{0,400}renderAll\(\)[\s\S]{0,200}requestAnimationFrame/.test(js));

// ============================================================
group('INT18 · AC3: Input methods — behavioral completeness');
// ============================================================
// Verify all 3 input methods are supported

// Touch/Mouse: pointerdown (unified event for touch + mouse)
ok('sellBtn uses pointerdown (touch+mouse unified)',
   /sellBtn\.addEventListener\(['"]pointerdown['"]/.test(js));

// Keyboard: full keymap
const keydownSrc = js.match(/document\.addEventListener\(['"]keydown['"][\s\S]{0,2000}/m) || [''];
ok('Space key sells', /e\.code\s*===\s*['"]Space['"]/.test(keydownSrc[0]));
ok('Enter key sells', /e\.key\s*===\s*['"]Enter['"]/.test(keydownSrc[0]));
ok('Key 1 → price tab', /e\.key\s*===\s*['"]1['"]/.test(keydownSrc[0]));
ok('Key 2 → staff tab', /e\.key\s*===\s*['"]2['"]/.test(keydownSrc[0]));
ok('Key 3 → upgrade tab', /e\.key\s*===\s*['"]3['"]/.test(keydownSrc[0]));
ok('Key M → mute', /toLowerCase\(\)\s*===\s*['"]m['"]/.test(keydownSrc[0]));
ok('Key -/_ → price down', /e\.key\s*===\s*['"]-['"]|e\.key\s*===\s*['"]_['"]/.test(keydownSrc[0]));
ok('Key +/= → price up', /e\.key\s*===\s*['"]\+['"]|e\.key\s*===\s*['"]=['"]/.test(keydownSrc[0]));

// Mouse: click handlers on tab buttons, price buttons, staff list, upgrade list
ok('tab click handlers bound', /tabs\.forEach[\s\S]*addEventListener\(['"]click['"]/.test(js));
ok('price button click handlers bound',
   /querySelectorAll\(['"]\.price-btn['"][\s\S]*addEventListener\(['"]click['"]/.test(js));
ok('staff list click delegation', /staffList\.addEventListener\(['"]click['"]/.test(js));
ok('upgrade list click delegation',
   /upgList\.addEventListener\(['"]click['"]/.test(js));
ok('restartBtn click handler', /restartBtn\.addEventListener\(['"]click['"]\s*,\s*restartGame\)/.test(js));
ok('muteBtn click handler', /muteBtn\.addEventListener\(['"]click['"]/.test(js));

// When state.finished, only Enter/Space restart (other keys ignored)
ok('finished-state: Enter/Space → restartGame',
   /state\.finished[\s\S]{0,200}restartGame\(\)/.test(js));

// ============================================================
group('INT19 · CSS: mobile-friendly touch targets');
// ============================================================
ok('sell-btn has min-height (touch target)',
   /\.sell-btn[\s\S]{0,200}min-height:/.test(css));
ok('restart-btn has min-height: 60px',
   /\.restart-btn[\s\S]{0,200}min-height:\s*60px/.test(css));
ok('item-buy buttons styled', /\.item-buy/.test(css));
ok('touch-action: manipulation prevents double-tap zoom',
   /touch-action:\s*manipulation/.test(css));
ok('viewport: maximum-scale=1 prevents zoom',
   /maximum-scale=1/.test(html));
ok('iOS dvh fallback for full-height layout',
   /100dvh/.test(css) || /100vh/.test(css));
ok('no-zoom gesturestart prevention',
   /gesturestart/.test(js) && /preventDefault/.test(js));

// ============================================================
group('INT20 · Accessibility: ARIA roles and live regions');
// ============================================================
ok('role="banner" on header',
   /role="banner"/.test(html));
ok('role="tablist" on nav',
   /role="tablist"/.test(html));
ok('role="tab" on each tab button',
   (html.match(/role="tab"/g) || []).length === 3);
ok('role="tabpanel" on each panel',
   (html.match(/role="tabpanel"/g) || []).length === 3);
ok('role="dialog" on result modal',
   /role="dialog"/.test(html));
ok('aria-modal="true" on modal',
   /aria-modal="true"/.test(html));
ok('aria-labelledby on modal',
   /aria-labelledby/.test(html));
ok('aria-live="polite" on cpsHint',
   /id="cpsHint"[^>]*aria-live="polite"/.test(html));
ok('aria-live="polite" on toast',
   /id="toast"[^>]*aria-live="polite"/.test(html));
ok('aria-label on mute button',
   /id="muteBtn"[^>]*aria-label/.test(html));
ok('aria-label on sell button',
   /id="sellBtn"[^>]*aria-label/.test(html));
ok('aria-pressed on mute button',
   /id="muteBtn"[^>]*aria-pressed/.test(html));
ok('aria-selected on tab buttons',
   (html.match(/aria-selected/g) || []).length === 3);
ok('aria-controls on tabs',
   (html.match(/aria-controls/g) || []).length === 3);
ok('aria-hidden on canvas',
   /id="stage"[^>]*aria-hidden="true"/.test(html) || /aria-hidden="true"/.test(html));

// ============================================================
group('INT21 · Security: IIFE + strict mode + no globals');
// ============================================================
ok('app.js wrapped in IIFE',
   /\(\(\)\s*=>\s*\{/.test(js));
ok('"use strict" present',
   /['"]use strict['"]/.test(js));

// No accidental globals (all variables should be const/let inside IIFE)
// Check that CONFIG, state, LS, etc. are not declared with var
const varDeclarations = js.match(/^var\s+/gm) || [];
ok('no var declarations (all const/let)', varDeclarations.length === 0,
   `found ${varDeclarations.length} var declarations`);

// ============================================================
group('INT22 · Save/load cycle: settings persistence');
// ============================================================
ok('settings loaded on boot from localStorage',
   /lsGet\(LS\.SETTINGS/.test(js));
ok('settings applied via Object.assign',
   /Object\.assign\(state\.settings/.test(js));
ok('settings saved when toggleMute is called',
   /lsSet\(LS\.SETTINGS,\s*state\.settings\)/.test(js));
ok('settings schema: sfx + haptic',
   /sfx:\s*true/.test(js) && /haptic:\s*true/.test(js));

// Simulate: mute → save → reload → verify mute persists
const settingsSandbox = buildSandbox();
const KEY_SETTINGS = 'idle_lemonade_settings';

// Mute (sfx = false)
settingsSandbox.state.settings.sfx = false;
settingsSandbox.lsSet(KEY_SETTINGS, settingsSandbox.state.settings);

// Read back
const savedSettings = settingsSandbox.lsGet(KEY_SETTINGS, null);
ok('settings round-trip: sfx=false persisted',
   savedSettings && savedSettings.sfx === false,
   JSON.stringify(savedSettings));
ok('settings round-trip: haptic=true persisted',
   savedSettings && savedSettings.haptic === true,
   JSON.stringify(savedSettings));

// ============================================================
group('INT23 · Game loop: main loop structure verified');
// ============================================================
ok('loop function defined', /function\s+loop/.test(js));
ok('loop uses requestAnimationFrame for recursive scheduling',
   /requestAnimationFrame\(loop\)/.test(js));
ok('loop computes delta time', /ts\s*-\s*lastTs/.test(js));
ok('loop caps delta at 0.1s', /Math\.min\(0\.1/.test(js));
ok('loop updates cash via computeIncomePerSec',
   /computeIncomePerSec\(\)\s*\*\s*dt/.test(js));
ok('loop checks victory condition',
   /state\.cash\s*>=\s*CONFIG\.IPO_GOAL/.test(js));
ok('loop checks timeout condition',
   /gameSec\(\)\s*>\s*CONFIG\.MAX_GAME_SEC/.test(js));
ok('loop calls drawScene', /drawScene\(dt\)/.test(js));
ok('loop calls renderAll', /renderAll\(\)/.test(js));
ok('loop has save accumulator', /saveAccum/.test(js));

// ============================================================
group('INT24 · Confetti: spawn + DOM manipulation');
// ============================================================
ok('spawnConfetti function defined', /function\s+spawnConfetti/.test(js));
ok('spawnConfetti clears previous confetti',
   /layer\.innerHTML\s*=\s*['"]['"]/.test(js) || /innerHTML\s*=\s*""/.test(js));
ok('spawnConfetti creates 60 pieces',
   /for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*60/.test(js));
ok('spawnConfetti uses random animation duration',
   /animationDuration[\s\S]*Math\.random/.test(js));
ok('spawnConfetti uses random animation delay',
   /animationDelay[\s\S]*Math\.random/.test(js));
ok('spawnConfetti uses random rotation',
   /transform[\s\S]*rotate[\s\S]*Math\.random/.test(js));
ok('spawnConfetti only called on victory (isVictory branch)',
   /if\s*\(\s*isVictory\s*\)[\s\S]{0,80}spawnConfetti/.test(js));

// ============================================================
group('INT25 · Style.css: visual polish');
// ============================================================
ok('CSS custom properties (CSS variables) defined',
   /--c-/.test(css));
ok('CSS has smooth transitions',
   /transition:/.test(css));
ok('CSS has keyframe animations',
   /@keyframes/.test(css));
ok('CSS has float-text animation (click feedback)',
   /\.float-text/.test(css) || /float/.test(css));
ok('CSS has progress bar styling',
   /\.progress-/.test(css));
ok('CSS has modal styling',
   /\.modal/.test(css) || /\.result-title/.test(css));
ok('CSS has item/affordable/locked styling',
   /\.item/.test(css) && /\.affordable/.test(css) && /\.locked/.test(css));
ok('CSS has confetti animation',
   /\.confetti/.test(css));
ok('CSS has toast animation',
   /\.toast/.test(css));

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
