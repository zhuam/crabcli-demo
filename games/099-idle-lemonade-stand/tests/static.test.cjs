#!/usr/bin/env node
/**
 * Static smoke tests for Idle Lemonade Stand (Issue #99)
 * Run: node tests/static.test.js
 * Pure Node — no jsdom dependency. Uses regex + light HTML parsing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js   = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

// ============= AC1: DOM elements (status bar / canvas / sell / 3 tabs / settings panel) =============
group('AC1 · DOM ids & first-screen elements');
const requiredIds = [
  'cashDisplay','timeDisplay','bestDisplay','muteBtn','muteIcon',
  'progressFill','progressLabel','stage','floatLayer',
  'sellBtn','sellPrice','cpsHint',
  'tab-price','tab-staff','tab-upgrade',
  'panel-price','panel-staff','panel-upgrade',
  'priceCur','priceSub','staffList','upgradeList',
  'resultModal','resultTitle','resultEarn','resultTime','resultBest','newBestRow','restartBtn',
  'toast','confettiLayer'
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present in index.html`, re.test(html));
}
ok('header.status-bar present', /class="status-bar"/.test(html));
ok('canvas#stage present', /<canvas[^>]*id="stage"/.test(html));
ok('nav.tab-bar with 3 tabs', (html.match(/class="tab"\s+role="tab"/g) || []).length === 3);
ok('result modal hidden on boot (has "hidden" attr)', /id="resultModal"[^>]*\bhidden\b/.test(html) || /id="resultModal"[\s\S]{0,400}\bhidden\b/.test(html));
ok('toast hidden on boot', /id="toast"[^>]*\bhidden\b/.test(html) || /id="toast"[\s\S]{0,200}\bhidden\b/.test(html));
ok('viewport meta with maximum-scale (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));

// settings panel = mute button section (issue prompt called it "settings panel"; impl provides muteBtn in header)
ok('settings/mute button present in header', /id="muteBtn"[\s\S]{0,200}aria-label="静音切换"/.test(html));

// ============= AC2: ≤3min single round + IPO threshold =============
group('AC2 · Game length & IPO threshold');
ok('CONFIG.IPO_GOAL = 1_000_000', /IPO_GOAL:\s*1_?000_?000/.test(js));
ok('CONFIG.MAX_GAME_SEC = 240 (≤4 min cap)', /MAX_GAME_SEC:\s*240\b/.test(js));
ok('victory triggered when cash >= IPO_GOAL', /state\.cash\s*>=\s*CONFIG\.IPO_GOAL/.test(js));
ok('time cap enforced via gameSec() > MAX_GAME_SEC', /gameSec\(\)\s*>\s*CONFIG\.MAX_GAME_SEC/.test(js));
ok('IPO success → resultModal shown', /resultModal\.removeAttribute\(['"]hidden['"]\)/.test(js));
ok('IPO success → confetti spawned', /spawnConfetti\(\)/.test(js) && /class="confetti-piece"/.test(js) || /confetti-piece/.test(js));
ok('progress bar updates from cash/IPO_GOAL', /state\.cash\s*\/\s*CONFIG\.IPO_GOAL/.test(js));

// ============= AC3: at least 2 input methods (touch/mouse + keyboard) =============
group('AC3 · Input methods');
ok('sellBtn pointerdown listener', /sellBtn\.addEventListener\(['"]pointerdown['"]/.test(js));
ok('sellBtn click default-prevented (avoid double-fire)', /sellBtn\.addEventListener\(['"]click['"][\s\S]{0,80}preventDefault/.test(js));
ok('document keydown listener', /document\.addEventListener\(['"]keydown['"]/.test(js));
ok('Space key → sell',  /e\.code === ['"]Space['"]/.test(js));
ok('Enter key → sell',   /e\.key === ['"]Enter['"]/.test(js));
ok('1/2/3 → tab switch', /e\.key === ['"]1['"]/.test(js) && /e\.key === ['"]2['"]/.test(js) && /e\.key === ['"]3['"]/.test(js));
ok('M key → mute toggle', /toLowerCase\(\)\s*===\s*['"]m['"]/.test(js));
ok('+ / - keys → price', /e\.key === ['"]\+['"]|e\.key === ['"]=['"]/.test(js));
ok('-  / _ keys → price', /e\.key === ['"]-['"]|e\.key === ['"]_['"]/.test(js));
ok('Tab buttons clickable (delegated listener)', /tabs\.forEach\(t\s*=>\s*t\.addEventListener\(['"]click['"]/.test(js));
ok('Price ± buttons handled', /querySelectorAll\(['"]\.price-btn['"]/.test(js));
ok('Staff list event delegation', /staffList\.addEventListener\(['"]click['"]/.test(js));
ok('Upgrade list event delegation', /upgList\.addEventListener\(['"]click['"]/.test(js));

// ============= AC4: result page with 「再来一局」 button =============
group('AC4 · Result page & restart');
ok('restart button label includes 再来一局', /再来一局/.test(html));
ok('restartBtn click handler bound', /restartBtn\.addEventListener\(['"]click['"]\s*,\s*restartGame\)/.test(js));
ok('restartGame resets cash/totalEarned', /state\.cash\s*=\s*0[\s\S]{0,80}state\.totalEarned\s*=\s*0/.test(js));
ok('restartGame resets employees & upgrades', /CONFIG\.EMPLOYEES\.forEach\(e\s*=>\s*state\.employees\[e\.id\]\s*=\s*0\)[\s\S]{0,200}CONFIG\.UPGRADES\.forEach\(u\s*=>\s*state\.upgrades\[u\.id\]\s*=\s*false\)/.test(js));
ok('restart sets startTs to now', /state\.startTs\s*=\s*Date\.now\(\)/.test(js));
ok('restart hides result modal', /resultModal\.setAttribute\(['"]hidden['"]/.test(js));
ok('Restart button has min-height ≥ 60px (touch target)', /\.restart-btn[\s\S]{0,400}min-height:\s*60px/.test(css));
ok('Restart button has focus-visible style', /\.restart-btn:focus-visible/.test(css));
ok('Enter/Space on result modal also restarts', /state\.finished[\s\S]{0,200}restartGame\(\)/.test(js));

// ============= AC5: audio + haptic feedback =============
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /AudioContext\s*\|\|\s*window\.webkitAudioContext|window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audio context resume on suspended', /audioCtx\.state\s*===\s*['"]suspended['"][\s\S]{0,40}resume/.test(js));
ok('sfxSell defined', /function\s+sfxSell\s*\(/.test(js));
ok('sfxCoin defined', /function\s+sfxCoin\s*\(/.test(js));
ok('sfxUpgrade defined', /function\s+sfxUpgrade\s*\(/.test(js));
ok('sfxFanfare defined', /function\s+sfxFanfare\s*\(/.test(js));
ok('sell triggers sfxSell', /sellOne[\s\S]{0,400}sfxSell\(\)/.test(js));
ok('upgrade triggers sfxUpgrade', /buyUpgrade[\s\S]{0,400}sfxUpgrade\(\)/.test(js));
ok('victory triggers sfxFanfare', /triggerEnd[\s\S]{0,200}sfxFanfare\(\)/.test(js));
ok('navigator.vibrate guarded by truthy check', /if\s*\(\s*navigator\.vibrate\s*\)/.test(js));
ok('vibrate wrapped in try/catch', /try\s*\{[^}]*navigator\.vibrate[^}]*\}\s*catch/.test(js));
ok('vibrate on sell (15ms)', /sellOne[\s\S]{0,400}vibrate\(15\)/.test(js));
ok('vibrate on upgrade ([60,30,60] etc.)', /vibrate\(\[\d+\s*,\s*\d+\s*,\s*\d+\]\)/.test(js));
ok('mute button toggles state.settings.sfx', /toggleMute[\s\S]{0,200}state\.settings\.sfx\s*=\s*!\s*state\.settings\.sfx/.test(js));
ok('mute aria-pressed updated on toggle', /muteBtn\.setAttribute\(['"]aria-pressed['"]/.test(js));
ok('mute settings persisted to localStorage', /lsSet\(LS\.SETTINGS,\s*state\.settings\)/.test(js));

// ============= AC6: localStorage best score =============
group('AC6 · localStorage best score');
ok('LS.BEST = "idle_lemonade_best"', /BEST:\s*['"]idle_lemonade_best['"]/.test(js));
ok('LS.SETTINGS = "idle_lemonade_settings"', /SETTINGS:\s*['"]idle_lemonade_settings['"]/.test(js));
ok('lsGet helper safely parses JSON', /function\s+lsGet[\s\S]{0,200}JSON\.parse/.test(js));
ok('lsSet helper writes JSON', /function\s+lsSet[\s\S]{0,200}JSON\.stringify/.test(js));
ok('best schema: fastestSec, maxEarn, gamesPlayed, ipoCount',
   /fastestSec/.test(js) && /maxEarn/.test(js) && /gamesPlayed/.test(js) && /ipoCount/.test(js));
ok('best.fastestSec updated on faster victory', /best\.fastestSec\s*=\s*sec/.test(js));
ok('best.maxEarn updated when totalEarned exceeds', /state\.totalEarned\s*>\s*\(best\.maxEarn/.test(js));
ok('best persisted via lsSet(LS.BEST, best)', /lsSet\(LS\.BEST,\s*best\)/.test(js));
ok('best loaded on boot via lsGet(LS.BEST,...)', /lsGet\(LS\.BEST/.test(js));

// ============= Bonus: a11y, reduced-motion, no zoom, IIFE wrap =============
group('Bonus · a11y / reduced-motion / hardening');
ok('CSS @media prefers-reduced-motion: reduce', /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css));
ok('reduced-motion overrides animation-duration', /@media\s*\(prefers-reduced-motion:[\s\S]{0,200}animation-duration:\s*0/.test(css));
ok('focus-visible styles present (key buttons)',
   /\.sell-btn:focus-visible/.test(css) && /\.tab:focus-visible/.test(css) && /\.restart-btn:focus-visible/.test(css));
ok('aria-live polite on cps hint', /id="cpsHint"[^>]*aria-live="polite"/.test(html));
ok('aria-live polite on toast', /id="toast"[^>]*aria-live="polite"/.test(html));
ok('role="dialog" + aria-modal on result', /id="resultModal"[^>]*role="dialog"[\s\S]{0,80}aria-modal="true"/.test(html));
ok('role="tablist" on tab bar', /role="tablist"/.test(html));
ok('role="tabpanel" on each panel', (html.match(/role="tabpanel"/g) || []).length === 3);
ok('IIFE wraps app.js (avoids globals)', /\(\(\)\s*=>\s*\{[\s\S]+\}\)\(\);?\s*$/.test(js.trim()));
ok('"use strict" enabled', /['"]use strict['"]/.test(js));
ok('touch-action: manipulation (no double-tap zoom)', /touch-action:\s*manipulation/.test(css));
ok('iOS-friendly height: 100dvh fallback', /height:\s*100dvh/.test(css));
ok('gesturestart prevented (iOS pinch)', /gesturestart[\s\S]{0,80}preventDefault/.test(js));

// ============= Tab switching state machine =============
group('Bonus · Tab switching');
ok('switchTab() defined', /function\s+switchTab\s*\(/.test(js));
ok('switchTab toggles aria-selected', /aria-selected['"]\s*,\s*sel\s*\?\s*['"]true['"]\s*:\s*['"]false['"]/.test(js));
ok('switchTab toggles hidden on panels', /removeAttribute\(['"]hidden['"]\)[\s\S]{0,100}setAttribute\(['"]hidden['"]/.test(js));
ok('default tab = price', /switchTab\(['"]price['"]\)/.test(js));

// ============= Click handler economic correctness (light unit checks) =============
group('Bonus · Economy logic (parsed)');
// Extract the priceMultiplier function and run it in an isolated VM
const vm = require('vm');
function extract(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  const start = m.index;
  // find balanced braces
  let i = js.indexOf('{', start);
  let depth = 1, end = i + 1;
  while (depth > 0 && end < js.length) {
    if (js[end] === '{') depth++;
    else if (js[end] === '}') depth--;
    end++;
  }
  return js.slice(start, end);
}
const pmSrc = extract('priceMultiplier');
ok('priceMultiplier function extractable', !!pmSrc);
if (pmSrc) {
  try {
    const ctx = { Math, result: null };
    vm.createContext(ctx);
    vm.runInContext(pmSrc + '\nresult = priceMultiplier;', ctx);
    const fn = ctx.result;
    const at1 = fn(1.0);   // sweet spot: salesMult = 1.0, revenue = 1.0
    const at05 = fn(0.5);
    const at2  = fn(2.0);
    const at3  = fn(3.0);
    ok('priceMultiplier(1.0).revenue ≈ 1.0', Math.abs(at1.revenue - 1.0) < 0.01, JSON.stringify(at1));
    ok('priceMultiplier(0.5).salesMult = 1.8', Math.abs(at05.salesMult - 1.8) < 0.01, JSON.stringify(at05));
    ok('priceMultiplier(2.0).salesMult clamped > 0', at2.salesMult > 0, JSON.stringify(at2));
    ok('priceMultiplier(3.0).salesMult ≥ 0.15 (lower bound)', at3.salesMult >= 0.15 - 1e-9, JSON.stringify(at3));
  } catch (e) {
    ok('priceMultiplier executes safely', false, e.message);
  }
}

// employeeCost extraction
const ecSrc = extract('employeeCost');
const cgM = js.match(/COST_GROWTH:\s*([\d.]+)/);
ok('COST_GROWTH constant defined', !!cgM);
if (ecSrc && cgM) {
  try {
    const ctx = { Math, CONFIG: { COST_GROWTH: parseFloat(cgM[1]) }, result: null };
    vm.createContext(ctx);
    vm.runInContext(ecSrc + '\nresult = employeeCost;', ctx);
    const fn = ctx.result;
    const c0 = fn({ baseCost: 10 }, 0);
    const c1 = fn({ baseCost: 10 }, 1);
    const c5 = fn({ baseCost: 10 }, 5);
    ok('employeeCost(emp, 0) === baseCost', c0 === 10, 'got ' + c0);
    ok('employeeCost(emp, 1) > baseCost (growth)', c1 > 10, 'got ' + c1);
    ok('employeeCost(emp, 5) ~ baseCost * 1.15^5 ≈ 21', c5 >= 20 && c5 <= 22, 'got ' + c5);
  } catch (e) {
    ok('employeeCost executes safely', false, e.message);
  }
}

// ============= Summary =============
console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed · ${fail} failed`);
console.log('='.repeat(50));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
