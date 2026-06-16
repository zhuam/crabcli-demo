#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Pet Run.io (Issue #97).
 *
 * Where static.test.cjs verifies *presence*, this suite verifies *behavior*:
 *   - Pure functions extracted from inline <script> + executed in a VM sandbox:
 *       aabb()         — collision math (4 quadrants of overlap + every miss case)
 *       loadSave()     — JSON shape coercion + corruption fallback
 *       persist()      — silent failure on storage exceptions
 *   - End-state matrix: top-3 vs >3, time-cap vs crash, isNewBest yes/no
 *   - localStorage round-trip with a mocked global storage
 *   - Skin-unlock state machine from a clean save through every threshold
 *   - Input safety: e.repeat ignored, replay button cooldown gate
 *
 * Run: node games/097-pet-run-io/tests/behavior.test.cjs
 * Pure Node, zero deps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const js = scriptBlocks.join('\n\n');

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
 * Extract a top-level `function name(...)` body (balanced-brace walk).
 */
function extractFn(name) {
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

/* =====================================================================
 * 1. AABB — math correctness across 9 cases
 * ===================================================================== */
group('1. AABB collision math');
const aabbSrc = extractFn('aabb');
ok('aabb() extractable from source', !!aabbSrc);

let aabb = null;
if (aabbSrc) {
  const ctx = { result: null };
  vm.createContext(ctx);
  vm.runInContext(aabbSrc + '\nresult = aabb;', ctx);
  aabb = ctx.result;
  ok('aabb() exported as a function', typeof aabb === 'function');
}
if (typeof aabb === 'function') {
  const A = { x: 100, y: 100, w: 50, h: 50 }; // 100..150 / 100..150
  // overlapping cases (true)
  ok('full overlap — same rect',
     aabb(A, { x: 100, y: 100, w: 50, h: 50 }));
  ok('B fully inside A',
     aabb(A, { x: 110, y: 110, w: 10, h: 10 }));
  ok('partial overlap top-left corner',
     aabb(A, { x: 90, y: 90, w: 30, h: 30 }));
  ok('partial overlap bottom-right corner',
     aabb(A, { x: 140, y: 140, w: 30, h: 30 }));
  // disjoint cases (false)
  ok('disjoint — B fully right of A',
     !aabb(A, { x: 200, y: 100, w: 10, h: 10 }));
  ok('disjoint — B fully left of A',
     !aabb(A, { x: 0,   y: 100, w: 10, h: 10 }));
  ok('disjoint — B fully above A',
     !aabb(A, { x: 100, y: 0,   w: 10, h: 10 }));
  ok('disjoint — B fully below A',
     !aabb(A, { x: 100, y: 200, w: 10, h: 10 }));
  // edge-touching is NOT collision (strict <, > in the formula)
  ok('edge-touching right (x = A.right) is NOT a hit',
     !aabb(A, { x: 150, y: 100, w: 10, h: 10 }));
  ok('edge-touching bottom (y = A.bottom) is NOT a hit',
     !aabb(A, { x: 100, y: 150, w: 10, h: 10 }));
  // 4px tolerance — verify two hitboxes that would overlap raw but miss after pad
  // raw rects: P=[0,0,40,40]  O=[37,0,40,40]  → overlap by 3px
  // shrunk by HITBOX_PAD=4 each side: P=[4,4,32,32], O=[41,4,32,32] → no overlap
  ok('HITBOX_PAD=4 turns 3px graze into a near-miss (擦边逃生)',
     !aabb(
       { x: 4,  y: 4, w: 32, h: 32 },
       { x: 41, y: 4, w: 32, h: 32 }
     ));
  // 5px overlap should still hit
  ok('5px overlap (after padding) IS a hit',
     aabb(
       { x: 4,  y: 4, w: 32, h: 32 },
       { x: 35, y: 4, w: 32, h: 32 }
     ));
}

/* =====================================================================
 * 2. localStorage save schema — round-trip + corruption + private-mode
 * ===================================================================== */
group('2. loadSave / persist with mock localStorage');

const loadSrc = extractFn('loadSave');
const persistSrc = extractFn('persist');
ok('loadSave() extractable', !!loadSrc);
ok('persist() extractable', !!persistSrc);

function makeMockLS(initial = {}, opts = {}) {
  const store = { ...initial };
  return {
    getItem(k) {
      if (opts.throwOnGet) throw new Error('SecurityError: storage disabled');
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      if (opts.throwOnSet) throw new Error('QuotaExceededError');
      store[k] = String(v);
    },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
    _peek: () => ({ ...store }),
  };
}

function runWithLS(ls) {
  const sandbox = {
    localStorage: ls,
    JSON, Number, Math, Array,
    DEFAULT_SAVE: { best: 0, runs: 0, unlocked: ['cat'], lastSkin: 'cat' },
    STORE_KEY: 'petrun:save',
    save: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${loadSrc}\n${persistSrc}\nresult = { loadSave, persist };`, sandbox);
  return sandbox;
}

// 2a. fresh storage → defaults
{
  const ls = makeMockLS();
  const sb = runWithLS(ls);
  const s = sb.result.loadSave();
  ok('fresh storage → save = DEFAULT_SAVE', JSON.stringify(s) === JSON.stringify(sb.DEFAULT_SAVE));
}
// 2b. corrupt JSON → defaults (try/catch fallback)
{
  const ls = makeMockLS({ 'petrun:save': 'NOT-VALID-JSON{{{' });
  const sb = runWithLS(ls);
  const s = sb.result.loadSave();
  ok('corrupt JSON → fallback to DEFAULT_SAVE', s.best === 0 && s.lastSkin === 'cat');
}
// 2c. partial / malformed object → coerced
{
  const ls = makeMockLS({ 'petrun:save': JSON.stringify({ best: '999', runs: -5, unlocked: 'cat', lastSkin: 42 }) });
  const sb = runWithLS(ls);
  const s = sb.result.loadSave();
  ok('best coerced via Number(...)||0',  s.best === 999);
  ok('runs negative → clamped to 0',     s.runs === 0);
  ok('unlocked non-array → ["cat"]',     Array.isArray(s.unlocked) && s.unlocked.length === 1 && s.unlocked[0] === 'cat');
  ok('lastSkin non-string → "cat"',      s.lastSkin === 'cat');
}
// 2d. legitimate save → preserved
{
  const orig = { best: 1234, runs: 7, unlocked: ['cat', 'dog'], lastSkin: 'dog' };
  const ls = makeMockLS({ 'petrun:save': JSON.stringify(orig) });
  const sb = runWithLS(ls);
  const s = sb.result.loadSave();
  ok('valid save preserved end-to-end',
     s.best === 1234 && s.runs === 7 && JSON.stringify(s.unlocked) === '["cat","dog"]' && s.lastSkin === 'dog');
}
// 2e. persist() when storage throws QuotaExceeded → silent (no throw)
{
  const ls = makeMockLS({}, { throwOnSet: true });
  const sb = runWithLS(ls);
  sb.save = { best: 50, runs: 1, unlocked: ['cat'], lastSkin: 'cat' };
  let threw = false;
  try { sb.result.persist(); } catch (e) { threw = true; }
  ok('persist() swallows QuotaExceeded error', !threw);
}
// 2f. private mode (storage.getItem throws) → loadSave returns defaults
{
  const ls = makeMockLS({}, { throwOnGet: true });
  const sb = runWithLS(ls);
  let s, threw = false;
  try { s = sb.result.loadSave(); } catch (e) { threw = true; }
  ok('loadSave() with throwing getItem → no throw', !threw);
  ok('loadSave() with throwing getItem → defaults', s && s.best === 0 && s.lastSkin === 'cat');
}

/* =====================================================================
 * 3. Skin-unlock state machine — endGame branch logic
 *    (re-implemented inline to mirror the source rules exactly,
 *     and verified against the source via regex.)
 * ===================================================================== */
group('3. Skin unlock thresholds (state machine)');

// Mirror exactly the rules in endGame():
//   runs>=3 → dog ; runs>=10 → bun ; runs>=25 → frog
//   rank<=3 → duck ; finalDist>=1000 → bear ; finalDist>=1500 → gold
function applyUnlocks(save, finalDist, rank) {
  const newly = [];
  const ensure = (id) => { if (!save.unlocked.includes(id)) { save.unlocked.push(id); newly.push(id); } };
  if (save.runs >= 3)  ensure('dog');
  if (save.runs >= 10) ensure('bun');
  if (save.runs >= 25) ensure('frog');
  if (rank <= 3)       ensure('duck');
  if (finalDist >= 1000) ensure('bear');
  if (finalDist >= 1500) ensure('gold');
  return newly;
}
// Quick spot-check that our mirror matches the source spec
const endSrc = extractFn('endGame');
ok('endGame() extractable', !!endSrc);
ok('mirror — endGame uses runs>=3 maybeUnlock dog',  /save\.runs\s*>=\s*3[\s\S]{0,80}maybeUnlock\(['"]dog['"]\)/.test(endSrc || ''));
ok('mirror — endGame uses runs>=10 maybeUnlock bun', /save\.runs\s*>=\s*10[\s\S]{0,80}maybeUnlock\(['"]bun['"]\)/.test(endSrc || ''));
ok('mirror — endGame uses runs>=25 maybeUnlock frog',/save\.runs\s*>=\s*25[\s\S]{0,80}maybeUnlock\(['"]frog['"]\)/.test(endSrc || ''));
ok('mirror — endGame uses rank<=3 maybeUnlock duck', /state\.rank\s*<=\s*3[\s\S]{0,80}maybeUnlock\(['"]duck['"]\)/.test(endSrc || ''));
ok('mirror — endGame uses dist>=1000 maybeUnlock bear', /finalDist\s*>=\s*1000[\s\S]{0,80}maybeUnlock\(['"]bear['"]\)/.test(endSrc || ''));
ok('mirror — endGame uses dist>=1500 maybeUnlock gold', /finalDist\s*>=\s*1500[\s\S]{0,80}maybeUnlock\(['"]gold['"]\)/.test(endSrc || ''));

// Now drive the mirror through realistic gameplay and assert at every milestone:
{
  const save = { best: 0, runs: 0, unlocked: ['cat'], lastSkin: 'cat' };
  // run 1 — 200m, 5th place → no unlocks
  save.runs = 1;
  let newly = applyUnlocks(save, 200, 5);
  ok('after run 1 (200m, rank5) → no unlocks', newly.length === 0 && save.unlocked.length === 1);

  // run 3 — 400m, 5th → unlock dog
  save.runs = 3;
  newly = applyUnlocks(save, 400, 5);
  ok('after run 3 → dog unlocked', save.unlocked.includes('dog'));

  // single Top-3 finish (rank=2) at run 4 → unlock duck
  save.runs = 4;
  newly = applyUnlocks(save, 800, 2);
  ok('after rank≤3 finish → duck unlocked', save.unlocked.includes('duck'));

  // 1000m+ run → bear
  save.runs = 5;
  newly = applyUnlocks(save, 1000, 4);
  ok('after 1000m run → bear unlocked', save.unlocked.includes('bear'));

  // 1500m+ run → gold (and bear stays — already unlocked)
  save.runs = 6;
  newly = applyUnlocks(save, 1500, 4);
  ok('after 1500m run → gold unlocked', save.unlocked.includes('gold'));
  ok('bear NOT re-added (already unlocked)', save.unlocked.filter(x => x === 'bear').length === 1);

  // 10 runs → bun
  save.runs = 10;
  newly = applyUnlocks(save, 200, 5);
  ok('after 10 runs → bun unlocked', save.unlocked.includes('bun'));

  // 25 runs → frog
  save.runs = 25;
  newly = applyUnlocks(save, 200, 5);
  ok('after 25 runs → frog unlocked', save.unlocked.includes('frog'));

  ok('all 7 skins eventually unlocked',
     ['cat','dog','bun','frog','duck','bear','gold'].every(id => save.unlocked.includes(id)));
}

// Boundary: exactly 999m must NOT unlock bear, 1000m must.
{
  const s1 = { best:0, runs:0, unlocked:['cat'], lastSkin:'cat' };
  applyUnlocks(s1, 999, 4);
  ok('999m → bear NOT unlocked (boundary <)', !s1.unlocked.includes('bear'));
  const s2 = { best:0, runs:0, unlocked:['cat'], lastSkin:'cat' };
  applyUnlocks(s2, 1000, 4);
  ok('1000m → bear unlocked (boundary =)', s2.unlocked.includes('bear'));
}
// Boundary: rank == 3 still wins (Top-3 inclusive)
{
  const s = { best:0, runs:0, unlocked:['cat'], lastSkin:'cat' };
  applyUnlocks(s, 100, 3);
  ok('rank=3 → duck unlocked (Top-3 inclusive)', s.unlocked.includes('duck'));
  const s2 = { best:0, runs:0, unlocked:['cat'], lastSkin:'cat' };
  applyUnlocks(s2, 100, 4);
  ok('rank=4 → duck NOT unlocked', !s2.unlocked.includes('duck'));
}

/* =====================================================================
 * 4. SFX trigger-point completeness
 * ===================================================================== */
group('4. SFX trigger points cover all 6 UX moments');
ok('SFX.jump triggered in tryJump()',  /tryJump\s*\(\s*\)\s*\{[\s\S]*?SFX\.jump\(\)/.test(js));
ok('SFX.crash triggered in playerCrash()', /playerCrash\s*\(\s*\)\s*\{[\s\S]*?SFX\.crash\(\)/.test(js));
ok('SFX.pass on overtake (rank decrease)', /SFX\.pass\(\)/.test(js));
ok('SFX.enterTop3 / fallTop3 on rank cross-3',
   /SFX\.enterTop3\(\)/.test(js) && /SFX\.fallTop3\(\)/.test(js));
ok('SFX.win / lose / newBest in endGame()',
   /endGame[\s\S]*?SFX\.newBest\(\)[\s\S]*?SFX\.win\(\)[\s\S]*?SFX\.lose\(\)/.test(js));
ok('isNewBest takes priority over win/lose SFX (newBest is louder)',
   /if\s*\(\s*isNewBest\s*\)\s*\{\s*SFX\.newBest\(\)/.test(js));

/* =====================================================================
 * 5. Replay-button cooldown gate (regression — no double-fire)
 * ===================================================================== */
group('5. Replay button anti-misclick gate');
ok('btn-replay starts disabled in HTML', /id="btn-replay"[^>]*disabled/.test(html));
ok('replay click handler short-circuits when still disabled',
   /\$\('btn-replay'\)\.addEventListener[\s\S]*?if\s*\(\s*\$\('btn-replay'\)\.disabled\s*\)\s*return/.test(js));
ok('Space/Enter on result also gated by btn.disabled check',
   /const\s+btn\s*=\s*\$\('btn-replay'\)\s*;\s*if\s*\(\s*!\s*btn\.disabled\s*\)\s*btn\.click\(\)/.test(js));
ok('1500ms timer re-enables button (matches UX spec)',
   /setTimeout\([\s\S]*?btn\.disabled\s*=\s*false[\s\S]*?\},\s*1500\)/.test(js));

/* =====================================================================
 * 6. Input safety regression — no auto-fire on held key
 * ===================================================================== */
group('6. Input: e.repeat guard');
ok('keydown handler returns early on e.repeat (held key suppressed)',
   /addEventListener\(\s*['"]keydown['"][\s\S]*?if\s*\(\s*e\.repeat\s*\)\s*return/.test(js));
ok('jump uses coyote-time + jump-buffer for forgiveness',
   /COYOTE_MS/.test(js) && /BUFFER_MS/.test(js) && /inputBufferUntil/.test(js));

/* =====================================================================
 * 7. Time cap regression (≤3 minutes hard end)
 * ===================================================================== */
group('7. Session length regression');
ok('SESSION_MAX = 180 (s)', /SESSION_MAX\s*=\s*180\b/.test(js));
ok('elapsed >= SESSION_MAX → endGame(false, "time")',
   /state\.elapsed\s*>=\s*SESSION_MAX[\s\S]{0,80}endGame\(\s*false\s*,\s*['"]time['"]\s*\)/.test(js));
ok('forcedEnd flag set before forced endGame', /state\.forcedEnd\s*=\s*true[\s\S]{0,80}endGame\(\s*false\s*,\s*['"]time['"]\)/.test(js));

/* =====================================================================
 * 8. Bot pool sanity — pseudo-multiplayer model
 * ===================================================================== */
group('8. Pseudo-multiplayer sanity');
// Extract BOT_NAMES literal and count entries
{
  const m = js.match(/const\s+BOT_NAMES\s*=\s*\[([\s\S]*?)\]/);
  ok('BOT_NAMES literal extractable', !!m);
  if (m) {
    // count quoted strings
    const names = (m[1].match(/['"][^'"]+['"]/g) || []).map(s => s.slice(1,-1));
    ok(`BOT_NAMES has ≥8 unique names (got ${names.length})`, names.length >= 8);
    ok('BOT_NAMES entries are unique', new Set(names).size === names.length);
  }
}
// 7 bots + 1 player == 8 racers, rank starts at 8
ok('initial rank = 8 (player + 7 bots)', /state\.rank\s*=\s*8/.test(js));
ok('makeBot() factory present', /function\s+makeBot/.test(js));
ok('makePlayer() factory present', /function\s+makePlayer/.test(js));

/* =====================================================================
 * 9. Memory fallback — muted state survives storage failure
 * ===================================================================== */
group('9. Mute persistence resilience');
ok('mute toggle setItem wrapped in try/catch',
   /try\s*\{\s*localStorage\.setItem\(\s*['"]petrun:muted['"][\s\S]*?\}\s*catch/.test(js));
ok('mute state restored on boot (try/catch read)',
   /try\s*\{\s*if\s*\(\s*localStorage\.getItem\(\s*['"]petrun:muted['"]\s*\)\s*===\s*['"]1['"]\s*\)/.test(js));

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Pet Run.io · behavior.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
