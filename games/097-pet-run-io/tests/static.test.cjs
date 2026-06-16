#!/usr/bin/env node
/**
 * Static smoke tests for Pet Run.io (Issue #97).
 *
 * Single-file game (games/097-pet-run-io/index.html) — these tests
 * use regex over the raw HTML/inline-JS to verify that the implementation
 * carries every contract from .x-miner/artifacts/analysis/{tech,ux}-analysis.md
 * and the issue-#97 acceptance checklist:
 *
 *   AC1  3-second entry  → no loader, click-to-play title screen
 *   AC2  ≤3 minute round → SESSION_MAX = 180 with forcedEnd
 *   AC3  ≥2 input modes  → keyboard + touch + mouse
 *   AC4  「再来一局」button → present, 1.5s cooldown, replay handler
 *   AC5  音效 + 震动      → WebAudio + navigator.vibrate
 *   AC6  本地最高分       → localStorage 'petrun:save'
 *
 *   + AABB collision with 4px hitbox padding (per tech 3.4)
 *   + 8 bots / Top-3 winners model (per tech 3.3)
 *   + skin unlock thresholds (per tech 3.7 / endGame() rules)
 *
 * Run: node games/097-pet-run-io/tests/static.test.cjs
 * Pure Node — no jsdom, no deps.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// extract the inline <script> body (the game has exactly one inline script block)
const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const js = scriptMatches.map(m => m[1]).join('\n\n/* ---- next <script> block ---- */\n\n');

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

/* =====================================================================
 * AC1 · DOM elements & first-screen contract (3s entry rule)
 * ===================================================================== */
group('AC1 · DOM ids & screens');
const requiredIds = [
  // top-level screens
  'title-screen', 'play-screen', 'result-screen', 'pets-screen',
  // canvas + HUD
  'stage-canvas', 'hud-rank', 'hud-dist', 'hud-best',
  // title controls
  'btn-start', 'btn-pets', 'btn-mute', 'mute-glyph',
  // result page
  'res-trophy', 'res-heart', 'res-pos', 'res-sub', 'res-dist', 'res-best',
  'res-pass', 'res-newrec', 'res-newrec-text', 'res-tip',
  'btn-replay', 'btn-result-pets', 'cooldown-hint',
  // pets page
  'pets-grid', 'pets-back',
];
for (const id of requiredIds) {
  const re = new RegExp(`id\\s*=\\s*"${id}"`);
  ok(`#${id} present`, re.test(html));
}
ok('canvas#stage-canvas present', /<canvas[^>]*id="stage-canvas"/.test(html));
ok('viewport meta with maximum-scale=1 (no zoom)', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked (back-to-hub button)', /\/games\/shared\/game-frame\.css/.test(html));
ok('title screen rendered first (default .active)', /class="screen\s+active"\s+id="title-screen"/.test(html));
ok('play / result / pets default hidden (no .active)',
   !/active[^"]*"\s+id="play-screen"/.test(html) &&
   !/active[^"]*"\s+id="result-screen"/.test(html) &&
   !/active[^"]*"\s+id="pets-screen"/.test(html));
ok('touch-action:none on canvas-wrap (prevents scroll/zoom)', /touch-action:\s*none/.test(html));

/* =====================================================================
 * AC2 · Game length cap (≤3 minutes)
 * ===================================================================== */
group('AC2 · Session length cap');
ok('SESSION_MAX = 180 (s) declared', /SESSION_MAX\s*=\s*180\b/.test(js));
ok('forcedEnd path triggers endGame on time cap',
   /state\.elapsed\s*>=\s*SESSION_MAX[\s\S]{0,80}endGame\(false,\s*['"]time['"]\)/.test(js));

/* =====================================================================
 * AC3 · ≥2 input methods (keyboard + touch + mouse)
 * ===================================================================== */
group('AC3 · Input methods');
// keyboard
ok('window keydown listener', /window\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('ArrowUp / Space / W → jump', /e\.key\s*===\s*['"]ArrowUp['"][\s\S]{0,400}tryJump\(\)/.test(js));
ok('ArrowDown / S → slide', /e\.key\s*===\s*['"]ArrowDown['"][\s\S]{0,200}trySlide\(\)/.test(js));
ok('M key → mute toggle', /e\.key\s*===\s*['"]m['"]\s*\|\|\s*e\.key\s*===\s*['"]M['"][\s\S]{0,80}toggleMute\(\)/.test(js));
ok('Space/Enter on result triggers replay (when not disabled)',
   /state\.phase\s*===\s*['"]result['"][\s\S]{0,200}btn-replay[\s\S]{0,80}\.click\(\)/.test(js));
// touch + mouse
ok('canvas touchstart listener (passive:false)', /addEventListener\(\s*['"]touchstart['"][\s\S]{0,80}passive:\s*false/.test(js));
ok('canvas mousedown listener', /addEventListener\(\s*['"]mousedown['"]/.test(js));
ok('top-half tap = jump, bottom-half tap = slide',
   /yRel\s*>\s*0\.62[\s\S]{0,40}trySlide[\s\S]{0,40}tryJump/.test(js));
// e.repeat guard against held-down auto-jump
ok('keydown ignores e.repeat (no auto-fire)', /if\s*\(\s*e\.repeat\s*\)\s*return/.test(js));

/* =====================================================================
 * AC4 · 「再来一局」replay button + 1.5s cooldown
 * ===================================================================== */
group('AC4 · Replay button & cooldown');
ok('btn-replay label includes 再来一局', /id="btn-replay"[\s\S]{0,200}再来一局/.test(html));
ok('btn-replay default disabled', /id="btn-replay"[^>]*\bdisabled\b/.test(html));
ok('btn-replay click handler bound', /btn-replay['"]\)\.addEventListener\(\s*['"]click['"]/.test(js));
ok('replay handler calls startGame()', /btn-replay[\s\S]{0,200}startGame\(\)/.test(js));
ok('replay handler short-circuits when still disabled (anti-misclick)',
   /\$\('btn-replay'\)\.disabled\s*\)\s*return/.test(js));
ok('1500ms cooldown re-enables button', /setTimeout\(\(\s*\)\s*=>\s*\{[\s\S]{0,200}btn\.disabled\s*=\s*false[\s\S]{0,200}\},\s*1500\)/.test(js));
ok('cooldown-hint shown during the 1.5s window',
   /cooldown-hint['"]\)\.style\.display\s*=\s*['"]block['"][\s\S]{0,400}cooldown-hint['"]\)\.style\.display\s*=\s*['"]none['"]/.test(js));
ok('replay button cooling animation (.cooling class via reflow)',
   /\.classList\.add\(\s*['"]cooling['"]\s*\)/.test(js) && /void\s+btn\.offsetWidth/.test(js));

/* =====================================================================
 * AC5 · Audio (WebAudio synth) + Haptic (navigator.vibrate)
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used',
   /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume() on first user input (iOS unlock)',
   /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('SFX object exposes jump/crash/win/lose/newBest',
   /SFX\s*=\s*\{[\s\S]*?jump\(\)[\s\S]*?crash\(\)[\s\S]*?win\(\)[\s\S]*?lose\(\)[\s\S]*?newBest\(\)/.test(js));
ok('SFX.enterTop3 / fallTop3 (rank-change cues)',
   /enterTop3\(\)/.test(js) && /fallTop3\(\)/.test(js));
ok('SFX.pass (overtake cue) defined', /pass\(\)\s*\{/.test(js));
ok('vibrate() helper guards navigator.vibrate truthiness',
   /if\s*\(\s*navigator\.vibrate[\s\S]{0,40}navigator\.vibrate\(/.test(js));
ok('vibrate() helper try/catch wrapped (no throw on unsupported)',
   /try\s*\{[^}]*navigator\.vibrate[^}]*\}\s*catch/.test(js));
ok('vibrate() respects muted flag (no buzz when muted)',
   /if\s*\(\s*navigator\.vibrate\s*&&\s*!muted\s*\)/.test(js));
ok('crash → vibrate(80)', /crash\(\)[\s\S]{0,140}vibrate\(80\)/.test(js));
ok('win → vibrate pattern array', /win\(\)[\s\S]{0,300}vibrate\(\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]\)/.test(js));
ok('newBest → vibrate(200)', /newBest\(\)[\s\S]{0,300}vibrate\(200\)/.test(js));
ok('mute toggle persists to localStorage key petrun:muted',
   /localStorage\.setItem\(\s*['"]petrun:muted['"]/.test(js));
ok('muted flag respected — tone() bails when muted', /if\s*\(\s*muted\s*\)\s*return/.test(js));

/* =====================================================================
 * AC6 · localStorage best score (with safe fallback)
 * ===================================================================== */
group('AC6 · localStorage save schema');
ok('STORE_KEY = "petrun:save"', /STORE_KEY\s*=\s*['"]petrun:save['"]/.test(js));
ok('default save shape: best/runs/unlocked/lastSkin',
   /DEFAULT_SAVE\s*=\s*\{[\s\S]*?best:\s*0[\s\S]*?runs:\s*0[\s\S]*?unlocked:\s*\[\s*['"]cat['"][\s\S]*?lastSkin:\s*['"]cat['"]/.test(js));
ok('loadSave() try/catch — corrupt JSON falls back to default',
   /function\s+loadSave\s*\(\)\s*\{[\s\S]*?try\s*\{[\s\S]*?JSON\.parse[\s\S]*?\}\s*catch[\s\S]*?return\s*\{\s*\.\.\.DEFAULT_SAVE\s*\}/.test(js));
ok('loadSave() coerces numeric fields with Math.max',
   /Math\.max\(0,\s*Number\(o\.best\)\|\|0\)/.test(js));
ok('loadSave() validates unlocked is non-empty array (else default ["cat"])',
   /Array\.isArray\(o\.unlocked\)\s*&&\s*o\.unlocked\.length\s*\?\s*o\.unlocked\.slice\(\)\s*:\s*\[\s*['"]cat['"]\s*\]/.test(js));
ok('persist() try/catch — silent on QuotaExceeded / private mode',
   /function\s+persist\s*\(\s*\)\s*\{\s*try\s*\{\s*localStorage\.setItem\(\s*STORE_KEY[\s\S]*?\}\s*catch/.test(js));
ok('save.best updated only on improvement', /isNewBest\s*=\s*finalDist\s*>\s*save\.best[\s\S]{0,80}save\.best\s*=\s*finalDist/.test(js));
ok('save.runs incremented every game end', /save\.runs\s*\+=\s*1/.test(js));

/* =====================================================================
 * Tech 3.4 · AABB collision with 4px hitbox padding
 * ===================================================================== */
group('Tech 3.4 · AABB collision + 4px tolerance');
ok('HITBOX_PAD = 4 declared', /HITBOX_PAD\s*=\s*4\b/.test(js));
ok('aabb() function present', /function\s+aabb\s*\(\s*a\s*,\s*b\s*\)/.test(js));
ok('aabb formula is the canonical 4-axis check',
   /a\.x\s*<\s*b\.x\s*\+\s*b\.w\s*&&\s*a\.x\s*\+\s*a\.w\s*>\s*b\.x\s*&&\s*a\.y\s*<\s*b\.y\s*\+\s*b\.h\s*&&\s*a\.y\s*\+\s*a\.h\s*>\s*b\.y/.test(js));
ok('playerHitbox shrinks rect by HITBOX_PAD on each side',
   /x:\s*p\.x\s*-\s*baseSize\*0\.5\s*\+\s*HITBOX_PAD[\s\S]{0,200}w:\s*baseSize\s*-\s*HITBOX_PAD\*2/.test(js));
ok('obstacleRect shrinks rect by HITBOX_PAD on each side',
   /x:\s*x\s*\+\s*HITBOX_PAD[\s\S]{0,200}w:\s*o\.w\s*-\s*HITBOX_PAD\*2[\s\S]{0,80}h:\s*o\.h\s*-\s*HITBOX_PAD\*2/.test(js));
ok('collision iteration calls aabb() against player hitbox',
   /aabb\(\s*playerRect\s*,\s*r\s*\)/.test(js));
ok('crash sets player.crashed and triggers endGame', /playerCrash\(\)/.test(js) && /endGame\(state\.rank\s*<=\s*3,\s*['"]crash['"]\)/.test(js));

/* =====================================================================
 * Tech 3.3 · Pseudo-multiplayer: 8 racers, Top-3 winners
 * ===================================================================== */
group('Tech 3.3 · Multi-racer & ranking');
ok('BOT_NAMES pool present (≥8 names)',
   /BOT_NAMES\s*=\s*\[\s*['"][^'"]+['"](?:\s*,\s*['"][^'"]+['"]){7,}/.test(js));
ok('rank computed by counting bots ahead of player',
   /1\s*\+\s*state\.bots\.filter\(\s*b\s*=>\s*b\.progress\s*>\s*player\.progress\s*\)\.length/.test(js));
ok('Top-3 promotion = win condition (state.rank <= 3)',
   /state\.rank\s*<=\s*3/.test(js));
ok('overtake awards passes counter + SFX.pass',
   /state\.passes\s*\+=\s*\(state\.rank\s*-\s*newRank\)[\s\S]{0,40}SFX\.pass\(\)/.test(js));
ok('rank-pill flashes on entering / falling out of Top 3',
   /hud-rank-pill['"]\)\.classList\.add\(\s*['"]flash['"]/.test(js));
ok('bot speed factor jitter exists (avoid one-line race)',
   /baseFactor\s*=\s*0\.93\s*\+\s*Math\.random\(\)\s*\*\s*0\.16/.test(js));
ok('bot rubber-band: nextStumbleAt / failTimer logic present',
   /nextStumbleAt/.test(js) && /failTimer/.test(js));

/* =====================================================================
 * Tech 3.7 · Skin catalog + unlock thresholds
 * ===================================================================== */
group('Tech 3.7 · Skin unlock thresholds');
ok('cat is the default skin', /unlocked:\s*\['cat'\]/.test(js) && /lastSkin:\s*['"]cat['"]/.test(js));
ok('runs >= 3  → unlock dog',  /save\.runs\s*>=\s*3[\s\S]{0,80}maybeUnlock\(['"]dog['"]\)/.test(js));
ok('runs >= 10 → unlock bun',  /save\.runs\s*>=\s*10[\s\S]{0,80}maybeUnlock\(['"]bun['"]\)/.test(js));
ok('runs >= 25 → unlock frog', /save\.runs\s*>=\s*25[\s\S]{0,80}maybeUnlock\(['"]frog['"]\)/.test(js));
ok('top-3 finish → unlock duck', /state\.rank\s*<=\s*3[\s\S]{0,80}maybeUnlock\(['"]duck['"]\)/.test(js));
ok('1000m run → unlock bear', /finalDist\s*>=\s*1000[\s\S]{0,80}maybeUnlock\(['"]bear['"]\)/.test(js));
ok('1500m run → unlock gold (limited)', /finalDist\s*>=\s*1500[\s\S]{0,80}maybeUnlock\(['"]gold['"]\)/.test(js));
ok('PETS catalog enumerates 7 skins', /const\s+PETS\s*=\s*\[\s*(?:\{[^}]*id:\s*['"][^'"]+['"][^}]*\}\s*,?\s*){7}/.test(js));

/* =====================================================================
 * Tech 4 · Coyote / input buffer / countdown — feel-good polish
 * ===================================================================== */
group('Tech 4 · Polish constants');
ok('COYOTE_MS defined', /COYOTE_MS\s*=\s*\d+/.test(js));
ok('BUFFER_MS defined (jump input buffer)', /BUFFER_MS\s*=\s*\d+/.test(js));
ok('GRAVITY positive constant', /GRAVITY\s*=\s*\d+/.test(js));
ok('JUMP_V0 negative (upward)', /JUMP_V0\s*=\s*-\d+/.test(js));
ok('SLIDE_DUR defined', /SLIDE_DUR\s*=\s*[\d.]+/.test(js));
ok('PX_PER_METER defined', /PX_PER_METER\s*=\s*\d+/.test(js));
ok('countdown phase rendered (3-2-1-GO)', /state\.phase\s*===\s*['"]countdown['"]/.test(js));

/* =====================================================================
 * Tech 7 · Registry + acceptance plumbing
 * ===================================================================== */
group('Registry · games/registry.json entry');
const registryPath = path.join(ROOT, '..', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry; // tolerate either shape
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'pet-run-io');
ok('registry has id="pet-run-io"', !!entry);
if (entry) {
  ok('registry.path = /games/097-pet-run-io/', entry.path === '/games/097-pet-run-io/');
  ok('registry.hasServer = false (single-file game)', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.thumbnail set', typeof entry.thumbnail === 'string' && entry.thumbnail.length > 0);
}

/* =====================================================================
 * Bonus · debug surface for tests + memory-fallback safety
 * ===================================================================== */
group('Bonus · Test hooks & guards');
ok('window.PetRun debug hook exposed', /window\.PetRun\s*=\s*\{\s*state\s*,\s*save\s*,\s*PETS\s*\}/.test(js));
ok('"use strict"', /['"]use strict['"]/.test(js));
ok('back-to-hub link present (game-frame.css class)',
   /class="back-to-hub"|back-to-hub/.test(html) || /\/games\/shared\/game-frame\.css/.test(html));

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log(`  Pet Run.io · static.test.cjs · ${pass} passed · ${fail} failed`);
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
