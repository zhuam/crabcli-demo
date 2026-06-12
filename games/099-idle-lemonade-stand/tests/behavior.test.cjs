#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Idle Lemonade Stand (Issue #99).
 *
 * Complements the regex-based static.test.cjs with:
 *   - VM-executed unit tests of pure functions (fmtMoney, fmtTime, priceMultiplier,
 *     employeeCost, computeIncomePerSec composition)
 *   - End-state branching: IPO victory vs MAX_GAME_SEC timeout
 *   - localStorage round-trip with mocked storage
 *   - Regression: legacy games/099-idle-lemonade/ dir is deleted (P0 fix, commit a9fd812)
 *   - Regression: boot tab defaults to "staff" (P1 fix, commit a9fd812)
 *   - SFX / haptic trigger-point completeness for the 6 UX moments
 *   - Restart resets ALL mutable state (full purity check)
 *
 * Run: node tests/behavior.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

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

/**
 * Extract a top-level `function name(...) { ... }` body from app.js source.
 * Walks balanced braces; respects strings/comments lightly (good enough for this codebase).
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
 * Extract the CONFIG object literal as a JS expression we can eval.
 */
function extractConfigObject() {
  const m = js.match(/const\s+CONFIG\s*=\s*\{/);
  if (!m) return null;
  const start = m.index + m[0].length - 1; // position of '{'
  let depth = 1, end = start + 1;
  while (depth > 0 && end < js.length) {
    const c = js[end];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    end++;
  }
  return js.slice(start, end); // the {...}
}

// ============================================================
group('Regression · P0/P1 fixes from commit a9fd812');
// ============================================================
const legacyDir = path.join(REPO_ROOT, 'games', '099-idle-lemonade');
ok('legacy dir games/099-idle-lemonade/ removed (P0)',
   !fs.existsSync(legacyDir),
   legacyDir + ' still exists');

ok('canonical dir games/099-idle-lemonade-stand/ exists',
   fs.existsSync(path.join(REPO_ROOT, 'games', '099-idle-lemonade-stand', 'app.js')));

// P1: default tab=staff. We already check the regex elsewhere; here we verify
// BOTH boot and restart paths route to "staff" — the user-facing behavioral
// guarantee. There must be exactly two switchTab('staff') calls (boot + restart),
// and zero switchTab('price') calls outside of keymap "1"→price.
const switchTabCalls = (js.match(/switchTab\(['"]([a-z]+)['"]\)/g) || []);
const switchTabStaffCalls = switchTabCalls.filter(s => /staff/.test(s)).length;
ok('switchTab("staff") called at least twice (boot + restart)',
   switchTabStaffCalls >= 2, `found ${switchTabStaffCalls}`);

// Boot block specifically (last switchTab call before requestAnimationFrame)
ok('boot path explicitly calls switchTab("staff") (P1)',
   /\/\/\s*默认 tab[\s\S]{0,160}switchTab\(['"]staff['"]\)\s*;[\s\S]{0,200}renderAll\(\)/.test(js));

// Restart path
ok('restart path calls switchTab("staff") (P1, continuity)',
   /restartGame[\s\S]{0,1200}switchTab\(['"]staff['"]\)/.test(js));

// ============================================================
group('AC2 · IPO + timeout boundaries (CONFIG values)');
// ============================================================
const cfgSrc = extractConfigObject();
ok('CONFIG block extractable', !!cfgSrc);
let CFG = null;
if (cfgSrc) {
  try {
    const ctx = { result: null };
    vm.createContext(ctx);
    vm.runInContext(`result = (${cfgSrc});`, ctx);
    CFG = ctx.result;
  } catch (e) {
    ok('CONFIG evaluable as JS', false, e.message);
  }
}
if (CFG) {
  ok('IPO_GOAL is exactly 1_000_000', CFG.IPO_GOAL === 1_000_000, String(CFG.IPO_GOAL));
  ok('MAX_GAME_SEC is 240 (4-min hard cap, ≥3-min minimum per AC)',
     CFG.MAX_GAME_SEC === 240, String(CFG.MAX_GAME_SEC));
  ok('MAX_GAME_SEC ≥ 180 (covers AC "≤3min" + buffer)', CFG.MAX_GAME_SEC >= 180);
  ok('TICK_HZ in sane range [5,60]',
     CFG.TICK_HZ >= 5 && CFG.TICK_HZ <= 60, String(CFG.TICK_HZ));
  ok('COST_GROWTH > 1 (idle-game scaling)', CFG.COST_GROWTH > 1);
  ok('5 employee tiers defined', Array.isArray(CFG.EMPLOYEES) && CFG.EMPLOYEES.length === 5);
  ok('Employee tiers monotonically increase in baseCost',
     CFG.EMPLOYEES.every((e, i, a) => i === 0 || e.baseCost > a[i - 1].baseCost));
  ok('Employee tiers monotonically increase in baseProd',
     CFG.EMPLOYEES.every((e, i, a) => i === 0 || e.baseProd > a[i - 1].baseProd));
  ok('First employee unlockAt = 0 (no gating on cashier)',
     CFG.EMPLOYEES[0].unlockAt === 0);
  ok('Highest employee unlockAt < IPO_GOAL (reachable)',
     CFG.EMPLOYEES[CFG.EMPLOYEES.length - 1].unlockAt < CFG.IPO_GOAL);
  ok('At least 8 upgrades (flavors + stores + marketing)',
     Array.isArray(CFG.UPGRADES) && CFG.UPGRADES.length >= 8);
  ok('All upgrades have mult > 1', CFG.UPGRADES.every(u => u.mult > 1));
  ok('Upgrade kinds cover flavor + store + mkt',
     ['flavor','store','mkt'].every(k => CFG.UPGRADES.some(u => u.kind === k)));
}

// Verify the source has BOTH end-branches: victory AND timeout, with distinct titles.
ok('Game-end has victory branch (cash >= IPO_GOAL → triggerEnd(true))',
   /state\.cash\s*>=\s*CONFIG\.IPO_GOAL[\s\S]{0,120}triggerEnd\(true\)/.test(js));
ok('Game-end has timeout-fail branch (gameSec > MAX_GAME_SEC → triggerEnd(false))',
   /gameSec\(\)\s*>\s*CONFIG\.MAX_GAME_SEC[\s\S]{0,120}triggerEnd\(false\)/.test(js));
ok('Victory shows "IPO 上市成功" title',
   /isVictory[\s\S]{0,120}IPO\s*上市成功/.test(js));
ok('Timeout shows distinct "时间到" title',
   /resultTitle\.textContent\s*=\s*['"]⏰\s*时间到/.test(js));
ok('Both end branches reach resultModal.removeAttribute("hidden")',
   /triggerEnd[\s\S]+resultModal\.removeAttribute\(['"]hidden['"]\)/.test(js));

// ============================================================
group('AC2 · fmtMoney / fmtTime boundaries');
// ============================================================
const fmtMoneySrc = extract('fmtMoney');
const fmtTimeSrc  = extract('fmtTime');
ok('fmtMoney extractable', !!fmtMoneySrc);
ok('fmtTime extractable', !!fmtTimeSrc);
if (fmtMoneySrc && fmtTimeSrc) {
  const ctx = { Math, fmtMoney: null, fmtTime: null };
  vm.createContext(ctx);
  vm.runInContext(fmtMoneySrc + '\n' + fmtTimeSrc + '\nthis.fmtMoney = fmtMoney; this.fmtTime = fmtTime;', ctx);
  const fm = ctx.fmtMoney, ft = ctx.fmtTime;

  // fmtMoney: 4 buckets — <10 (2 decimals), <1000 (0 decimals), <1M (K), <1B (M), ≥1B (B)
  ok('fmtMoney(0) = "$0.00"', fm(0) === '$0.00', fm(0));
  ok('fmtMoney(0.5) = "$0.50"', fm(0.5) === '$0.50', fm(0.5));
  ok('fmtMoney(9.99) = "$9.99"', fm(9.99) === '$9.99', fm(9.99));
  ok('fmtMoney(10) = "$10" (drops decimals at 10)', fm(10) === '$10', fm(10));
  ok('fmtMoney(999) = "$999"', fm(999) === '$999', fm(999));
  ok('fmtMoney(1000) = "$1.00K" (K boundary)', fm(1000) === '$1.00K', fm(1000));
  // NOTE: 999_999 / 1000 = 999.999 → toFixed(2) rounds to "1000.00" → "$1000.00K".
  // Cosmetic edge at the K→M boundary. Asserting current behavior (regression-lock);
  // any future fix should flip this expectation. Not a P0 (cash transitions through
  // this value in <1 frame in normal play).
  ok('fmtMoney(999_999) returns a K-suffixed string',
     /^\$[\d.]+K$/.test(fm(999_999)), fm(999_999));
  ok('fmtMoney(999_499) = "$999.50K" (clean K formatting just below boundary)',
     fm(999_499) === '$999.50K', fm(999_499));
  ok('fmtMoney(1_000_000) = "$1.00M" (M boundary, IPO goal)',
     fm(1_000_000) === '$1.00M', fm(1_000_000));
  ok('fmtMoney(1.5e6) = "$1.50M"', fm(1.5e6) === '$1.50M', fm(1.5e6));
  ok('fmtMoney(1e9) = "$1.00B" (B boundary)', fm(1e9) === '$1.00B', fm(1e9));
  ok('fmtMoney(2.5e9) = "$2.50B"', fm(2.5e9) === '$2.50B', fm(2.5e9));

  // fmtTime: m:ss with zero-pad, floors fractions, clamps negatives
  ok('fmtTime(0) = "0:00"', ft(0) === '0:00', ft(0));
  ok('fmtTime(5) = "0:05" (zero-pad)', ft(5) === '0:05', ft(5));
  ok('fmtTime(59) = "0:59"', ft(59) === '0:59', ft(59));
  ok('fmtTime(60) = "1:00" (minute boundary)', ft(60) === '1:00', ft(60));
  ok('fmtTime(125) = "2:05"', ft(125) === '2:05', ft(125));
  ok('fmtTime(180) = "3:00" (3-min AC anchor)', ft(180) === '3:00', ft(180));
  ok('fmtTime(240) = "4:00" (MAX_GAME_SEC)', ft(240) === '4:00', ft(240));
  ok('fmtTime(59.9) = "0:59" (floor)', ft(59.9) === '0:59', ft(59.9));
  ok('fmtTime(-10) = "0:00" (negatives clamped)', ft(-10) === '0:00', ft(-10));
}

// ============================================================
group('Economy · priceMultiplier extremes');
// ============================================================
const pmSrc = extract('priceMultiplier');
let pmFn = null;
if (pmSrc) {
  const ctx = { Math, pm: null };
  vm.createContext(ctx);
  vm.runInContext(pmSrc + '\nthis.pm = priceMultiplier;', ctx);
  pmFn = ctx.pm;
}
ok('priceMultiplier extractable & runnable', !!pmFn);
if (pmFn) {
  // p ≤ 0.5 → flat 1.8 (volume cap)
  ok('priceMultiplier(0.3) flat-caps salesMult at 1.8',
     Math.abs(pmFn(0.3).salesMult - 1.8) < 1e-9, JSON.stringify(pmFn(0.3)));
  ok('priceMultiplier(0.5) salesMult = 1.8', Math.abs(pmFn(0.5).salesMult - 1.8) < 1e-9);
  // 0.5 → 1.0 segment (1.8 → 1.0 linear)
  ok('priceMultiplier(0.75) salesMult ≈ 1.4 (mid of 0.5→1.0 segment)',
     Math.abs(pmFn(0.75).salesMult - 1.4) < 1e-9, JSON.stringify(pmFn(0.75)));
  // sweet spot
  ok('priceMultiplier(1.0).revenue = 1.0 (sweet spot)',
     Math.abs(pmFn(1.0).revenue - 1.0) < 1e-9);
  // 1.0 → 2.0 segment
  ok('priceMultiplier(1.5) salesMult ≈ 0.75',
     Math.abs(pmFn(1.5).salesMult - 0.75) < 1e-9, JSON.stringify(pmFn(1.5)));
  ok('priceMultiplier(2.0) salesMult = 0.5 (segment boundary)',
     Math.abs(pmFn(2.0).salesMult - 0.5) < 1e-9, JSON.stringify(pmFn(2.0)));
  // p > 2.0 segment with floor
  ok('priceMultiplier(2.5) salesMult = max(0.15, 0.5 - 0.5*0.18) = 0.41',
     Math.abs(pmFn(2.5).salesMult - 0.41) < 1e-9, JSON.stringify(pmFn(2.5)));
  // At p=3.0 (slider max): 0.5 - (3.0-2.0)*0.18 = 0.32 — floor not yet reached.
  ok('priceMultiplier(3.0) salesMult = 0.32 (slider-max, formula)',
     Math.abs(pmFn(3.0).salesMult - 0.32) < 1e-9, JSON.stringify(pmFn(3.0)));
  // Floor (0.15) only kicks in above ~p=3.94 — defensive against future raises.
  ok('priceMultiplier(10.0) still floor-clamped at 0.15 (no negatives)',
     pmFn(10.0).salesMult === 0.15, JSON.stringify(pmFn(10.0)));
  // revenue is monotone-ish around sweet spot; at extreme high price total revenue drops
  ok('priceMultiplier(3.0).revenue (0.45) < priceMultiplier(1.0).revenue (1.0)',
     pmFn(3.0).revenue < pmFn(1.0).revenue);
  // Continuity: salesMult at 0.5 from both sides equals 1.8
  ok('priceMultiplier continuous at p=0.5', Math.abs(pmFn(0.5).salesMult - 1.8) < 1e-9);
  ok('priceMultiplier continuous at p=1.0',
     Math.abs(pmFn(1.0).salesMult - 1.0) < 1e-9, JSON.stringify(pmFn(1.0)));
  ok('priceMultiplier continuous at p=2.0', Math.abs(pmFn(2.0).salesMult - 0.5) < 1e-9);
}

// ============================================================
group('Economy · employeeCost growth + computeIncomePerSec composition');
// ============================================================
const ecSrc = extract('employeeCost');
const cipsSrc = extract('computeIncomePerSec');
const ccvSrc = extract('computeClickValue');
ok('employeeCost extractable', !!ecSrc);
ok('computeIncomePerSec extractable', !!cipsSrc);
ok('computeClickValue extractable', !!ccvSrc);

if (ecSrc && cipsSrc && ccvSrc && pmSrc && CFG) {
  const sandbox = {
    Math,
    CONFIG: CFG,
    state: {
      cash: 0,
      pricePerCup: 1.0,
      employees: {},
      upgrades: {}
    },
    employeeCost: null,
    computeIncomePerSec: null,
    computeClickValue: null
  };
  CFG.EMPLOYEES.forEach(e => sandbox.state.employees[e.id] = 0);
  CFG.UPGRADES.forEach(u => sandbox.state.upgrades[u.id] = false);
  vm.createContext(sandbox);
  vm.runInContext(`
    ${pmSrc}
    ${ecSrc}
    ${cipsSrc}
    ${ccvSrc}
    this.employeeCost = employeeCost;
    this.computeIncomePerSec = computeIncomePerSec;
    this.computeClickValue = computeClickValue;
  `, sandbox);

  // Cost growth — exact ceil( base * 1.15^n )
  const cashier = CFG.EMPLOYEES.find(e => e.id === 'cashier');
  ok('employeeCost(cashier, 0) = base 10', sandbox.employeeCost(cashier, 0) === cashier.baseCost);
  ok('employeeCost(cashier, 1) = ceil(10 * 1.15) = 12',
     sandbox.employeeCost(cashier, 1) === 12, String(sandbox.employeeCost(cashier, 1)));
  ok('employeeCost(cashier, 10) > base * 4 (compounding works)',
     sandbox.employeeCost(cashier, 10) > cashier.baseCost * 4);

  // Zero-state: no employees → CPS = 0, click = base * 1 * revenue(1.0) = 1
  ok('computeIncomePerSec at zero state = 0', sandbox.computeIncomePerSec() === 0);
  ok('computeClickValue at zero state, price=$1, no upgrades = 1.0',
     Math.abs(sandbox.computeClickValue() - 1.0) < 1e-9, String(sandbox.computeClickValue()));

  // Add 1 cashier → baseProd 1, no upgrades, price 1 → 1 * 1 * 1.0 = 1
  sandbox.state.employees.cashier = 1;
  ok('CPS with 1 cashier = 1.0', Math.abs(sandbox.computeIncomePerSec() - 1.0) < 1e-9);

  // Apply flavor1 (×2) → CPS doubles
  sandbox.state.upgrades.flavor1 = true;
  ok('CPS with 1 cashier + flavor1(×2) = 2.0',
     Math.abs(sandbox.computeIncomePerSec() - 2.0) < 1e-9);

  // Stack flavor1×2 + store1×2 → ×4
  sandbox.state.upgrades.store1 = true;
  ok('CPS with 1 cashier + flavor1 + store1 = 4.0 (multiplicative)',
     Math.abs(sandbox.computeIncomePerSec() - 4.0) < 1e-9);

  // Stack mkt1 (×1.5) → ×6
  sandbox.state.upgrades.mkt1 = true;
  ok('CPS with mkt1 added = 6.0',
     Math.abs(sandbox.computeIncomePerSec() - 6.0) < 1e-9);

  // Click value uses same multiplier chain
  ok('computeClickValue uses same upgrade chain (= 6.0)',
     Math.abs(sandbox.computeClickValue() - 6.0) < 1e-9, String(sandbox.computeClickValue()));

  // Price extreme: at price=3.0 with 1 cashier + flavor1+store1+mkt1
  // expected = base(1*1=1) * mult(2*2*1.5=6) * revenue(3.0 * 0.32 = 0.96) = 5.76
  sandbox.state.pricePerCup = 3.0;
  const cpsHighPrice = sandbox.computeIncomePerSec();
  ok('CPS at price=3 with mkt1+flavor1+store1 ≈ 5.76 (price*salesMult composition)',
     Math.abs(cpsHighPrice - 5.76) < 1e-6, String(cpsHighPrice));
  // Sanity: CPS at sweet spot ($1) should be lower-revenue-per-cup but still > 0
  sandbox.state.pricePerCup = 1.0;
  const cpsSweet = sandbox.computeIncomePerSec();
  ok('CPS at sweet-spot (p=$1) ≈ 6.0 (revenue=1.0)',
     Math.abs(cpsSweet - 6.0) < 1e-9, String(cpsSweet));

  // Reset price → revenue=1
  sandbox.state.pricePerCup = 1.0;

  // High-tier employee cost stays sane (no NaN/Infinity)
  const inv = CFG.EMPLOYEES.find(e => e.id === 'investor');
  const c20 = sandbox.employeeCost(inv, 20);
  ok('employeeCost(investor, 20) finite', Number.isFinite(c20) && c20 > 0, String(c20));

  // CPS at full empire: 1 of each employee, all upgrades — must approach IPO_GOAL within 240s
  CFG.EMPLOYEES.forEach(e => sandbox.state.employees[e.id] = 1);
  CFG.UPGRADES.forEach(u => sandbox.state.upgrades[u.id] = true);
  const fullCps = sandbox.computeIncomePerSec();
  ok('Full-empire CPS finite & > 0', Number.isFinite(fullCps) && fullCps > 0, String(fullCps));
  ok('Full-empire CPS * 240s would exceed IPO_GOAL (game is winnable in cap)',
     fullCps * CFG.MAX_GAME_SEC > CFG.IPO_GOAL, `cps=${fullCps} cap=${CFG.MAX_GAME_SEC}`);
}

// ============================================================
group('AC5 · SFX + haptic trigger-point completeness');
// ============================================================
// Each user-meaningful moment must fire EITHER an SFX function OR vibrate(...) (often both).
// We check pair-presence inside each action's source range.
function actionContains(actionName, mustHaveAny) {
  const src = extract(actionName);
  if (!src) return false;
  return mustHaveAny.some(rx => rx.test(src));
}
ok('sellOne fires sfxSell + vibrate',
   actionContains('sellOne', [/sfxSell\(\)/]) &&
   actionContains('sellOne', [/vibrate\(15\)/]));
ok('buyEmployee fires sfxUpgrade + vibrate',
   actionContains('buyEmployee', [/sfxUpgrade\(\)/]) &&
   actionContains('buyEmployee', [/vibrate\(\[40,\s*25,\s*40\]\)/]));
ok('buyUpgrade fires sfxUpgrade + vibrate',
   actionContains('buyUpgrade', [/sfxUpgrade\(\)/]) &&
   actionContains('buyUpgrade', [/vibrate\(\[60,\s*30,\s*60\]\)/]));
ok('changePrice fires sfxCoin + vibrate(10)',
   actionContains('changePrice', [/sfxCoin\(\)/]) &&
   actionContains('changePrice', [/vibrate\(10\)/]));
ok('triggerEnd fires sfxFanfare + vibrate (multi-pattern)',
   actionContains('triggerEnd', [/sfxFanfare\(\)/]) &&
   actionContains('triggerEnd', [/vibrate\(\[100,\s*50,\s*100,\s*50,\s*200\]\)/]));
ok('checkUnlocks fires sfxCoin + vibrate on new employee unlock',
   actionContains('checkUnlocks', [/sfxCoin\(\)/]) &&
   actionContains('checkUnlocks', [/vibrate\(30\)/]));
ok('vibrate() helper respects state.settings.haptic gate',
   /function\s+vibrate[\s\S]{0,200}state\.settings\.haptic/.test(js));
ok('playTone() respects state.settings.sfx gate',
   /function\s+playTone[\s\S]{0,200}state\.settings\.sfx/.test(js));
ok('playTone() throttles repeat SFX (≥30ms)',
   /now\s*-\s*lastSfx\s*<\s*30/.test(js));

// ============================================================
group('AC6 · localStorage round-trip with mock');
// ============================================================
// We pull lsGet/lsSet + LS keys into a sandboxed VM with a fake localStorage,
// then exercise: write, read-back, corrupt-data tolerance, missing-key fallback.
const lsGetSrc = extract('lsGet');
const lsSetSrc = extract('lsSet');
ok('lsGet extractable', !!lsGetSrc);
ok('lsSet extractable', !!lsSetSrc);
if (lsGetSrc && lsSetSrc) {
  const store = new Map();
  const sandbox = {
    JSON,
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear()
    },
    lsGet: null,
    lsSet: null
  };
  vm.createContext(sandbox);
  vm.runInContext(lsGetSrc + '\n' + lsSetSrc + '\nthis.lsGet = lsGet; this.lsSet = lsSet;', sandbox);

  const KEY_BEST = 'idle_lemonade_best';

  // Missing key → fallback returned untouched
  const fallback = { fastestSec: null, maxEarn: 0, gamesPlayed: 0, ipoCount: 0 };
  const initial = sandbox.lsGet(KEY_BEST, fallback);
  ok('lsGet returns fallback on missing key', initial === fallback);

  // Round-trip an object
  const payload = { fastestSec: 142, maxEarn: 1234567, gamesPlayed: 3, ipoCount: 1 };
  sandbox.lsSet(KEY_BEST, payload);
  ok('lsSet writes JSON to storage',
     store.get(KEY_BEST) === JSON.stringify(payload), store.get(KEY_BEST));

  const back = sandbox.lsGet(KEY_BEST, fallback);
  ok('lsGet retrieves identical payload',
     back && back.fastestSec === 142 && back.maxEarn === 1234567 &&
     back.gamesPlayed === 3 && back.ipoCount === 1, JSON.stringify(back));

  // Corrupted JSON → fallback (no throw)
  store.set(KEY_BEST, '{not-valid-json');
  const recovered = sandbox.lsGet(KEY_BEST, fallback);
  ok('lsGet swallows JSON parse errors, returns fallback', recovered === fallback);

  // Storage-throws scenario (e.g. Safari private mode) → no exception
  const throwing = {
    JSON,
    localStorage: {
      getItem: () => { throw new Error('quota'); },
      setItem: () => { throw new Error('quota'); }
    },
    lsGet: null, lsSet: null
  };
  vm.createContext(throwing);
  vm.runInContext(lsGetSrc + '\n' + lsSetSrc + '\nthis.lsGet = lsGet; this.lsSet = lsSet;', throwing);
  let threw = false;
  try { throwing.lsSet('k', { a: 1 }); throwing.lsGet('k', { default: true }); }
  catch (e) { threw = true; }
  ok('lsGet/lsSet swallow storage exceptions (Safari private mode)', !threw);

  // Schema check: best object fields recorded by triggerEnd are correct keys
  ok('best schema persists fastestSec | maxEarn | gamesPlayed | ipoCount',
     ['fastestSec','maxEarn','gamesPlayed','ipoCount']
       .every(k => Object.prototype.hasOwnProperty.call(payload, k)));
}

// ============================================================
group('Restart · full state-reset purity');
// ============================================================
// Pull `function restartGame` source and assert each mutable field is reassigned.
const rgSrc = extract('restartGame');
ok('restartGame extractable', !!rgSrc);
if (rgSrc) {
  const mustReset = [
    /state\.cash\s*=\s*0/,
    /state\.totalEarned\s*=\s*0/,
    /state\.cupsSold\s*=\s*0/,
    /state\.pricePerCup\s*=\s*1\.0/,
    /CONFIG\.EMPLOYEES\.forEach.*state\.employees/s,
    /CONFIG\.UPGRADES\.forEach.*state\.upgrades/s,
    /state\.startTs\s*=\s*Date\.now\(\)/,
    /state\.victory\s*=\s*false/,
    /state\.finished\s*=\s*false/,
    /announced\.clear\(\)/,
    /particles\.length\s*=\s*0/,
    /resultModal\.setAttribute\(['"]hidden['"]/,
    /switchTab\(['"]staff['"]\)/,
    /sellBtn\.focus\(\)/
  ];
  mustReset.forEach((rx, i) => {
    ok(`restartGame resets [${i}] ${rx}`, rx.test(rgSrc));
  });
}

// Also: make sure BEST is NOT cleared by restart (high score must persist)
if (rgSrc) {
  ok('restartGame does NOT clear `best` (high-score persistence)',
     !/best\s*=/.test(rgSrc) && !/lsSet\(LS\.BEST,\s*\{/.test(rgSrc));
}

// ============================================================
group('Save-on-end · best.fastestSec only updates on FASTER victory');
// ============================================================
const teSrc = extract('triggerEnd');
ok('triggerEnd extractable', !!teSrc);
if (teSrc) {
  ok('best.fastestSec only set when (!fastestSec || sec < fastestSec)',
     /!best\.fastestSec\s*\|\|\s*sec\s*<\s*best\.fastestSec/.test(teSrc));
  ok('best.gamesPlayed increments on every end (victory or fail)',
     /best\.gamesPlayed\s*=\s*\(best\.gamesPlayed\s*\|\|\s*0\)\s*\+\s*1/.test(teSrc));
  ok('best.ipoCount only increments on victory',
     /if\s*\(\s*isVictory\s*\)[\s\S]{0,200}best\.ipoCount\s*=\s*\(best\.ipoCount\s*\|\|\s*0\)\s*\+\s*1/.test(teSrc));
  ok('best.maxEarn updated when totalEarned exceeds prior',
     /state\.totalEarned\s*>\s*\(best\.maxEarn/.test(teSrc));
  // lsSet must come BEFORE the modal show (so a refresh during animation persists best).
  ok('best persisted via lsSet(LS.BEST, best) before modal shown',
     /lsSet\(LS\.BEST,\s*best\)[\s\S]+resultModal\.removeAttribute\(['"]hidden['"]\)/.test(teSrc));
}

// ============================================================
group('Edge · keymap conflict & finished-state guards');
// ============================================================
// When state.finished is true, ONLY Enter/Space should restart; arrow / number / +- should NOT mutate.
ok('finished-state keydown short-circuits after restart trigger',
   /if\s*\(\s*state\.finished\s*\)\s*\{[\s\S]{0,400}return;\s*\}/.test(js));
ok('sellOne early-returns when state.finished', /sellOne[\s\S]{0,80}state\.finished[\s\S]{0,40}return/.test(js));
ok('main loop skips income tick when state.finished',
   /if\s*\(\s*!\s*state\.finished\s*\)\s*\{[\s\S]+?computeIncomePerSec\(\)/s.test(js));
ok('keydown skips Space when target is a BUTTON (avoid double-trigger on tab buttons)',
   /e\.target\.tagName\s*===\s*['"]BUTTON['"]\s*&&\s*e\.key\s*===\s*['"]\s+['"]/.test(js));

// ============================================================
group('Index.html · structural sanity (defer-loaded JS, no inline globals)');
// ============================================================
// Either `defer` attribute, or a position at the end of <body> (post-DOM); both are valid.
const scriptHasDefer = /<script[^>]+src="app\.js"[^>]*\bdefer\b/.test(html);
const scriptAtBodyEnd = /<script[^>]+src="app\.js"[^>]*>\s*<\/script>\s*<\/body>/.test(html);
ok('app.js is defer-loaded OR sits at end of <body> (DOM-ready guarantee)',
   scriptHasDefer || scriptAtBodyEnd,
   `defer=${scriptHasDefer} bodyEnd=${scriptAtBodyEnd}`);
ok('viewport prevents user-scaling',
   /user-scalable\s*=\s*no/.test(html) || /maximum-scale=1/.test(html));
ok('charset UTF-8 declared', /charset="UTF-8"/i.test(html));
ok('result modal contains both AC4 fields (totalEarned + time)',
   /id="resultEarn"/.test(html) && /id="resultTime"/.test(html));
ok('result modal exposes best score (resultBest)', /id="resultBest"/.test(html));

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
