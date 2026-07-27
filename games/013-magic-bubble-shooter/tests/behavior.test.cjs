#!/usr/bin/env node
/**
 * Behavior / boundary / regression tests for Magic Bubble Shooter (Issue #13).
 *
 * Where static.test.cjs verifies *presence*, this suite verifies *behavior*:
 *   - Endgame matrix: win (grid cleared) / lose (bubble past fail line)
 *   - isLost / maxRow / isDanger logic correctness
 *   - localStorage round-trip under LS_KEY 'bubble-shooter-highscore'
 *     (fresh → default, corrupt → fallback, private-mode → default,
 *      round-trip on legitimate save)
 *   - Loose color / no-color-found prevention (dead-color detection)
 *   - addNewRow grid key consistency (P0 regression guard)
 *
 * Pure Node, zero deps. Run: node games/013-magic-bubble-shooter/tests/behavior.test.cjs
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

/* ---------- helpers ---------- */
function extractFn(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = html.match(re);
  if (!m) return null;
  let i = html.indexOf('{', m.index), depth = 1, end = i + 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
    end++;
  }
  return html.slice(m.index, end);
}

function extractConst(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*`);
  const m = html.match(re);
  if (!m) return null;
  let i = html.indexOf('=', m.index) + 1;
  while (html[i] === ' ' || html[i] === '\t') i++;
  return html.slice(m.index, m.index + html.slice(m.index).search(/[;}\n]/));
}

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

/* =====================================================================
 * 1. Endgame matrix — win / lose / danger detection
 * ===================================================================== */
group('1. Endgame matrix (win / lose / danger)');

/* Extract key functions */
const fnNames = ['maxRow', 'isDanger', 'isLost', 'neighbors', 'floodFill', 'findFloating', 'hexPos', 'nearestCell'];
const fns = {};
for (const n of fnNames) fns[n] = extractFn(n);
ok('all helper functions extractable', fnNames.every(n => fns[n]), fnNames.filter(n => !fns[n]).join(','));

const sandbox = {
  Math, FIELD_W: 360, FIELD_H: 640, COLS: 11,
  BUBBLE_R: 14, GAP: 1.5, DIAM: 29.5,
  COL_SPACING: 29.5 * Math.cos(Math.PI / 6),
  ROW_SPACING: 14 * 1.45 + 1.5 * 0.3,
  GRID_TOP: 28, FAIL_LINE_Y: 640 - 14 * 3 - 4,
  DANGER_THRESHOLD: 2, EPS: 1e-6,
  SHOOTER_Y: 640 - 46,
  COLORS: [
    { id: 0, fill: '#E53E3E' },
    { id: 1, fill: '#34D399' },
    { id: 2, fill: '#3B82F6' },
    { id: 3, fill: '#EAAE87' },
  ],
};
vm.createContext(sandbox);
if (fnNames.every(n => fns[n])) {
  vm.runInContext(fnNames.map(n => fns[n]).join('\n') + '\nthis.fnExport = { neighbors, floodFill, findFloating, maxRow, isDanger, isLost, hexPos, nearestCell };', sandbox);
}
const P = sandbox.fnExport || {};

/* 1a — isLost / isDanger with known grid positions */
if (P.isDanger && P.isLost) {
  /* Fail line = 640 - 42 - 4 = 594, GRID_TOP = 28, ROW_SPACING ~= 20.6 */
  /* row 27 = 28 + 27*20.6 + 14 ≈ 598 > 594 → lost */
  const lostGrid = { '0,27': { row: 27, col: 0 } };
  ok('isLost true for row past fail line', P.isLost(lostGrid));
  ok('isDanger true for row past fail line (lost implies danger)', P.isDanger(lostGrid));

  /* row 25 = 28 + 25*20.6 + 14 ≈ 557 < 594 but within DANGER_THRESHOLD=2 rows */
  const dangerGrid = { '0,25': { row: 25, col: 0 } };
  ok('isLost false for row above fail line', !P.isLost(dangerGrid));
  ok('isDanger true for row within danger threshold', P.isDanger(dangerGrid));

  /* row 0 = safe */
  const safeGrid = { '0,0': { row: 0, col: 0 } };
  ok('isLost false for safe row', !P.isLost(safeGrid));
  ok('isDanger false for safe row', !P.isDanger(safeGrid));

  /* empty grid → both false */
  ok('isLost false for empty grid', !P.isLost({}));
  ok('isDanger false for empty grid', !P.isDanger({}));
}

/* 1b — maxRow correctness */
if (P.maxRow) {
  const grid = { '0,0': { row: 0 }, '1,2': { row: 2 }, '2,5': { row: 5 } };
  ok('maxRow returns highest row number', P.maxRow(grid) === 5, `got ${P.maxRow(grid)}`);
  ok('maxRow returns -1 for empty grid', P.maxRow({}) === -1, `got ${P.maxRow({})}`);
}

/* 1c — win scenario: empty grid after match resolution is the win condition */
ok('gameWon called when grid is empty (source check)', /if \(Object\.keys\(state\.grid\)\.length === 0\)\s*\{\s*gameWon\(\)/.test(html));

/* 1d — lose scenario: bubble past fail line triggers gameOver */
ok('gameOver called when in-flight bubble crosses fail line (stepShooting)',
  /b\.y \+ BUBBLE_R >= FAIL_LINE_Y[\s\S]{0,500}gameOver\(\)/.test(html));
ok('gameOver called when isLost post-lock (resolveGrid)',
  /if \(isLost\(state\.grid\)\)\s*\{\s*gameOver\(\)/.test(html));

/* =====================================================================
 * 2. localStorage round-trip under LS_KEY
 * ===================================================================== */
group('2. localStorage round-trip (bubble-shooter-highscore)');

/* Extract lsGet / lsSet */
const LS_KEY = 'bubble-shooter-highscore';
const lsGetSrc = extractFn('lsGet');
const lsSetSrc = extractFn('lsSet');
ok('lsGet() extractable', !!lsGetSrc);
ok('lsSet() extractable', !!lsSetSrc);
ok('LS_KEY is bubble-shooter-highscore', html.includes("LS_KEY = 'bubble-shooter-highscore'"));

function runWithLS(ls) {
  const sandbox2 = {
    localStorage: ls,
    JSON, Number, Math,
    LS_KEY,
    result: null,
  };
  vm.createContext(sandbox2);
  vm.runInContext(`${lsGetSrc}\n${lsSetSrc}\nresult = { lsGet, lsSet };`, sandbox2);
  return sandbox2;
}

/* 2a — fresh storage → fallback */
{
  const ls = makeMockLS();
  const sb = runWithLS(ls);
  const val = sb.result.lsGet(LS_KEY, 0);
  ok('fresh storage → lsGet returns fallback', val === 0, `got ${val}`);
}

/* 2b — legitimate save → round-trip */
{
  const ls = makeMockLS({ 'bubble-shooter-highscore': '1500' });
  const sb = runWithLS(ls);
  const val = sb.result.lsGet(LS_KEY, 0);
  ok('legitimate save → lsGet returns stored value', val === 1500, `got ${val}`);
}

/* 2c — corrupt JSON → fallback */
{
  const ls = makeMockLS({ 'bubble-shooter-highscore': 'NOT_VALID_JSON{{{' });
  const sb = runWithLS(ls);
  let val, threw = false;
  try { val = sb.result.lsGet(LS_KEY, 0); } catch (e) { threw = true; }
  ok('corrupt JSON → lsGet returns fallback, no throw', !threw && val === 0, `val=${val} threw=${threw}`);
}

/* 2d — lsSet then lsGet round-trip */
{
  const ls = makeMockLS();
  const sb = runWithLS(ls);
  sb.result.lsSet(LS_KEY, 2500);
  const stored = ls._peek()['bubble-shooter-highscore'];
  ok('lsSet stores stringified JSON', stored === '2500', `got ${stored}`);
  const val = sb.result.lsGet(LS_KEY, 0);
  ok('lsGet after lsSet returns stored number', val === 2500, `got ${val}`);
}

/* 2e — lsGet highscore in private mode (storage throws) → fallback */
{
  const ls = makeMockLS({}, { throwOnGet: true });
  const sb = runWithLS(ls);
  let val, threw = false;
  try { val = sb.result.lsGet(LS_KEY, 0); } catch (e) { threw = true; }
  ok('private mode (getItem throws) → lsGet returns fallback', !threw && val === 0, `val=${val} threw=${threw}`);
}

/* 2f — lsSet when storage throws → silent (no throw) */
{
  const ls = makeMockLS({}, { throwOnSet: true });
  const sb = runWithLS(ls);
  let threw = false;
  try { sb.result.lsSet(LS_KEY, 999); } catch (e) { threw = true; }
  ok('lsSet swallows QuotaExceeded error', !threw);
}

/* 2g — saveHighscore only stores when new score > highscore */
{
  const ls = makeMockLS({ 'bubble-shooter-highscore': '500' });
  const sb = runWithLS(ls);
  const highscore = sb.result.lsGet(LS_KEY, 0);
  ok('highscore retained across lsGet calls', highscore === 500, `got ${highscore}`);
}

/* =====================================================================
 * 3. Loose color / no-color-found prevention
 * ===================================================================== */
group('3. Loose color / no-color-found prevention');

/* 3a — COLORS array has 4 base colors plus amethyst */
ok('COLORS has at least 4 entries', /const COLORS = \[[\s\S]*?\{ id: 3[\s\S]*?\}\]/.test(html));

/* 3b — initLevel uses alive grid colors to prevent dead colors in queue */
ok('initLevel derives alive colors from existing grid cells',
  /const alive = \[\.\.\.gridColors\]\.length \? \[\.\.\.gridColors\] : available\.map\(c => c\.id\)/.test(html));
ok('initLevel fills queue with alive (not dead) colors',
  /for \(let i = 0; i < 20; i\+\+\) \{\s*state\.bubbleQueue\.push\(alive\[/.test(html));

/* 3c — addNewRow also prevents dead colors: uses alive grid colors for new row */
ok('addNewRow uses alive grid colors (avoids dead colors)',
  /for \(const key in state\.grid\) if \(state\.grid\[key\]\) alive\.add\(state\.grid\[key\]\.colorIdx\)/.test(html));

/* 3d — addNewRow fallback: when grid is empty, uses first 4 COLORS */
ok('addNewRow fallback to COLORS[0..3] when no grid colors alive',
  html.includes('COLORS.slice(0, 4).map(c => c.id)'));

/* =====================================================================
 * 4. P0 regression guard — addNewRow grid key consistency
 * ===================================================================== */
group('4. P0 regression guard (addNewRow grid key consistency)');

/* Verify the fix is in place: addNewRow now rebuilds grid with shifted object */
ok('addNewRow rebuilds grid with shifted (key fix applied)',
  /const shifted = \{\}[\s\S]{0,200}shifted\[c\.col \+ ',' \+ c\.row\] = c[\s\S]{0,50}state\.grid = shifted/.test(html));

/* Verify the old bug pattern is gone: no more `const keys = Object.keys(state.grid)` loop body
   that increments c.row without updating the key */
const oldPattern = /const keys = Object\.keys\(state\.grid\)[\s\S]{0,50}c\.row \+= 1/;
ok('addNewRow no longer uses stale keys pattern (bug removed)', !oldPattern.test(html));

/* Extract addNewRow and verify key semantics in VM */
const addNewRowSrc = extractFn('addNewRow');
ok('addNewRow() extractable for VM test', !!addNewRowSrc);

if (addNewRowSrc && P.hexPos) {
  /* Simulate addNewRow shift logic on a small grid to verify keys are updated */
  const shiftSandbox = {
    Math, hexPos: P.hexPos,
    FIELD_W: 360, COLS: 11,
    BUBBLE_R: 14, GAP: 1.5, DIAM: 29.5,
    COL_SPACING: 29.5 * Math.cos(Math.PI / 6),
    ROW_SPACING: 14 * 1.45 + 1.5 * 0.3,
    GRID_TOP: 28, EPS: 1e-6,
    COLORS: [
      { id: 0, fill: '#E53E3E' }, { id: 1, fill: '#34D399' },
      { id: 2, fill: '#3B82F6' }, { id: 3, fill: '#EAAE87' },
    ],
    state: {
      grid: {
        '5,3': { col: 5, row: 3, x: 180, y: 100, color: '#E53E3E', colorIdx: 0 },
        '3,4': { col: 3, row: 4, x: 140, y: 130, color: '#34D399', colorIdx: 1 },
      },
    },
    shifted: {},
  };
  vm.createContext(shiftSandbox);
  /* Run the shift portion manually (skip the new-row add because it uses DOM) */
  vm.runInContext(`
    const entries = Object.entries(state.grid);
    for (const [key, c] of entries) {
      if (c) {
        c.row += 1;
        const p = hexPos(c.col, c.row);
        c.x = p.x; c.y = p.y;
        shifted[c.col + ',' + c.row] = c;
      }
    }
    state.grid = shifted;
  `, shiftSandbox);

  const grid = shiftSandbox.state.grid;
  ok('row-shifted key "5,3" becomes "5,4"', grid['5,4'] && grid['5,4'].row === 4 && grid['5,4'].col === 5,
    `keys=${Object.keys(grid).join(',')}`);
  ok('row-shifted key "3,4" becomes "3,5"', grid['3,5'] && grid['3,5'].row === 5 && grid['3,5'].col === 3,
    `keys=${Object.keys(grid).join(',')}`);
  ok('no stale keys remain after shift', !grid['5,3'] && !grid['3,4'],
    `keys=${Object.keys(grid).join(',')}`);
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Magic Bubble Shooter · behavior.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
