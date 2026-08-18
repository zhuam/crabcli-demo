#!/usr/bin/env node
/**
 * Static acceptance tests for Stickman Archer Duel (Issue #2, PR #110).
 * Run: node games/002-stickman-archer-duel/tests/static.test.cjs
 *
 * Covers:
 *  - standalone requirement (PR #110): no external local file dependencies,
 *    the game must be openable by double-clicking the single index.html
 *  - issue acceptance criteria (AC1..AC6) via source assertions
 *
 * This file follows the "static test" pattern from other games
 * (games/040-sneak-the-fart/tests/static.test.cjs et al.).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Single-file game: all JS lives inline in index.html
const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const js = scriptMatches.map(m => m[1]).join('\n\n/* ---- next <script> block ---- */\n\n');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

/* =====================================================================
 * Standalone (PR #110 core change)
 * ===================================================================== */
group('Standalone · no external local dependencies');
ok('no reference to shared game-frame.css', !/game-frame\.css/.test(html));
ok('no relative local href/src (../ or ./)', !/(href|src)=["']\.{1,2}\//i.test(html));
ok('no external script files (all <script> inline)', !/<script\b[^>]*\bsrc=/i.test(html));
const stylesheetLinks = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].map(m => m[0]);
ok('all stylesheet links are CDN (https), not local files',
  stylesheetLinks.every(l => /href=["']https:\/\//i.test(l)),
  'found: ' + JSON.stringify(stylesheetLinks));
ok('game logic present inline', js.length > 10000, 'inline JS only ' + js.length + ' chars');

/* =====================================================================
 * AC1 · 首屏 3 秒内可进入游玩，无需教程
 * ===================================================================== */
group('AC1 · Quick entry (no tutorial / ≤3s to play)');
ok('viewport meta with maximum-scale=1', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('title screen active by default', /<section[^>]*class="[^"]*active[^"]*"[^>]*id="titleScreen"/.test(html));
ok('PLAY button present', /id="playBtn"/.test(html));
ok('playBtn click starts game', /playBtn\.addEventListener\(\s*['"]click['"][\s\S]{0,80}startGame/.test(js));
ok('Enter/Space on title starts game', /titleScreen\.classList\.contains\(['"]active['"]\)[\s\S]{0,200}startGame\(\)/.test(js));
ok('round intro is short (1.2s) before playable', /hideRoundOverlay\(\);\s*startPlayerTurn\(\);\s*},\s*1200\)/.test(js));
ok('no tutorial / instructions overlay', !/tutorial|howtoplay|instructions/i.test(html));

/* =====================================================================
 * AC2 · 单局时长 ≤ 3 分钟
 * ===================================================================== */
group('AC2 · Short matches (≤3 min)');
ok('best-of-3 match (MATCH_WINS = 2)', /MATCH_WINS\s*=\s*2/.test(js));
ok('match ends when either side reaches MATCH_WINS',
  /playerWins\s*>=\s*MATCH_WINS\s*\|\|\s*[\s\S]{0,40}enemyWins\s*>=\s*MATCH_WINS/.test(js));
ok('headshot is an instant round kill', /isHeadshot/.test(js));

/* =====================================================================
 * AC3 · 触屏 / 鼠标 / 键盘三种输入至少支持两种
 * ===================================================================== */
group('AC3 · Input: mouse + touch + keyboard');
ok('mouse: mousedown on canvas', /canvas\.addEventListener\(\s*['"]mousedown['"]/.test(js));
ok('mouse: mouseup on canvas', /canvas\.addEventListener\(\s*['"]mouseup['"]/.test(js));
ok('touch: touchstart on canvas', /canvas\.addEventListener\(\s*['"]touchstart['"]/.test(js));
ok('keyboard: keydown listener', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('keyboard: arrow-key aiming (ArrowUp/ArrowDown)', /ArrowUp/.test(js) && /ArrowDown/.test(js));
ok('keyboard: ArrowLeft/ArrowRight angle adjust', /ArrowLeft/.test(js) && /ArrowRight/.test(js));
ok('keyboard: Enter fires', /['"]Enter['"]/.test(js));

/* =====================================================================
 * AC4 · 结算页有清晰的“再来一局”按钮
 * ===================================================================== */
group('AC4 · Rematch on result screen');
ok('result screen present', /id="resultScreen"/.test(html));
ok('REMATCH button present', /id="retryBtn"[^>]*>[\s\S]{0,20}REMATCH/.test(html));
ok('retryBtn click restarts game', /retryBtn\.addEventListener\(\s*['"]click['"][\s\S]{0,80}startGame/.test(js));
ok('HOME button returns to title', /homeBtn\.addEventListener\(\s*['"]click['"][\s\S]{0,80}showScreen\(\s*['"]title['"]\s*\)/.test(js));

/* =====================================================================
 * AC5 · 关键音效与震动反馈
 * ===================================================================== */
group('AC5 · Sound + haptics');
ok('Web Audio API context created', /new\s+\(window\.AudioContext\s*\|\|\s*window\.webkitAudioContext\)/.test(js));
ok('sound effects via playTone', /function\s+playTone\(/.test(js));
ok('hit sound defined', /function\s+playHit\(/.test(js));
ok('vibration feedback via navigator.vibrate', /navigator\.vibrate/.test(js));

/* =====================================================================
 * AC6 · 通关或失败时记录最高分到本地存储
 * ===================================================================== */
group('AC6 · Best score persisted locally');
ok('best-score storage key defined', /STORAGE_KEY\s*=\s*['"]stickman_archer_best['"]/.test(js));
ok('reads best from localStorage', /localStorage\.getItem\(\s*STORAGE_KEY\s*\)/.test(js));
ok('writes best to localStorage', /localStorage\.setItem\(\s*STORAGE_KEY\s*/.test(js));
ok('best updated on match end', /state\.playerWins\s*>\s*best[\s\S]{0,60}setBest/.test(js));
ok('storage access guarded with try/catch', /try\s*{\s*return\s+parseInt\(localStorage\.getItem/.test(js));

/* =====================================================================
 * Registry integration
 * ===================================================================== */
group('Registry · game discoverable from the hub');
const registryPath = path.join(ROOT, '..', 'registry.json');
let registry = null;
try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (e) {}
ok('registry.json exists and parses', !!registry && Array.isArray(registry.games));
const entry = registry && registry.games.find(g => g.id === 'stickman-archer-duel');
ok('registry entry present for id stickman-archer-duel', !!entry);
ok('registry path points at this game dir', !!entry && entry.path === '/games/002-stickman-archer-duel/');

/* =====================================================================
 * Result
 * ===================================================================== */
console.log('\n========================================');
console.log('passed: ' + pass + ', failed: ' + fail);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('All static acceptance tests passed.');
process.exit(0);
