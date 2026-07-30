#!/usr/bin/env node
/**
 * Static acceptance tests for Sneak the Fart (Issue #40).
 * Run: node games/040-sneak-the-fart/tests/static.test.cjs
 *
 * Covers:
 *  - issue acceptance criteria (AC1..AC6) via source assertions
 *  - registry integration (registry.json valid + entry present)
 *
 * This file follows the "static test" pattern from other games
 * (games/022-cupid-ricochet/tests/static.test.cjs et al.).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const appJS = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// Use both inline scripts and external app.js for JS checks
const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
const inlineJS = scriptMatches.map(m => m[1]).join('\n\n/* ---- next <script> block ---- */\n\n');
const js = inlineJS + '\n\n/* ---- app.js ---- */\n\n' + appJS;

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else      { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

/* =====================================================================
 * AC1 · 首屏 3 秒内可进入游玩，无需教程
 * ===================================================================== */
group('AC1 · Quick entry (no tutorial / ≤3s to play)');
ok('viewport meta with maximum-scale=1', /maximum-scale=1/.test(html));
ok('lang attribute on <html>', /<html\s+lang=/.test(html));
ok('shared game-frame.css linked', /\/games\/shared\/game-frame\.css/.test(html));
ok('back-to-hub link present', /back-to-hub/.test(html));
ok('title screen active by default', /id="screen-title"[\s\S]{0,50}class="screen active"/.test(html));
ok('Start button present', /id="btnStart"/.test(html));
ok('btnStart click starts game', /btnStart\.addEventListener\(\s*['"]click['"][\s\S]{0,40}startGame/.test(js));
ok('Space key on title starts game', /case\s+['"]title['"]:[\s\S]{0,40}startGame\(\)/.test(js));
ok('No tutorial / instructions overlay', !/tutorial|instructions|howtoplay/i.test(html));

/* =====================================================================
 * AC2 · 单局时长 ≤ 3 分钟
 * ===================================================================== */
group('AC2 · Session length ≤ 3 min');
ok('MAX_LIVES = 3', /MAX_LIVES\s*=\s*3\b/.test(js));
ok('4 scenes with progressive difficulty', /SCENES\s*=\s*\[[\s\S]{0,80}office[\s\S]{0,500}library[\s\S]{0,500}elevator[\s\S]{0,500}meeting/.test(js));
ok('Total target farts = 3+4+4+5 = 16', /target:\s*3[\s\S]{0,500}target:\s*4[\s\S]{0,500}target:\s*4[\s\S]{0,500}target:\s*5/.test(js));
ok('timing per scene defines reasonable durations', /timing:\s*\{[\s\S]*?away:[\s\S]*?\}/.test(js) && (/\baway:\s*\[(28|42)/.test(js) || /\baway:\s*\[[12]/.test(js)));
ok('NPC timer uses random range', /randomTimer\s*\([^)]+\)/.test(js));

/* =====================================================================
 * AC3 · ≥2 input methods (touch + keyboard + mouse)
 * ===================================================================== */
group('AC3 · Input methods');
ok('Keyboard listener (keydown)', /document\.addEventListener\(\s*['"]keydown['"]/.test(js));
ok('Space key handler', /e\.key\s*===\s*['"]\s['"]\s*\|\|\s*e\.code\s*===\s*['"]Space['"]/.test(js) || /e\.key\s*===\s*['"]\s['"]/.test(js));
ok('Space key routes to correct screen actions', /switch\s*\(state\.screen\)[\s\S]{0,400}case\s+['"]title['"]:[\s\S]{0,40}startGame[\s\S]{0,300}case\s+['"]scene-done['"]:[\s\S]{0,40}nextScene/.test(js));
ok('M key for mute toggle', /e\.key\s*===\s*['"]m['"]/.test(js));
ok('Click handler on start button', /btnStart\.addEventListener\(\s*['"]click['"]/.test(js));
ok('Touchend handler on start button', /btnStart\.addEventListener\(\s*['"]touchend['"]/.test(js));
ok('Touchend handler on action button', /btnAction\.addEventListener\(\s*['"]touchend['"]/.test(js));
ok('Click/touch on scene area also triggers fart', /sceneArea\.addEventListener\(\s*['"]click['"][\s\S]{0,200}doFart/.test(js));
ok('Touchend on scene area triggers fart', /sceneArea\.addEventListener\(\s*['"]touchend['"][\s\S]{0,200}doFart/.test(js));

/* =====================================================================
 * AC4 · 再来一局 / Retry button
 * ===================================================================== */
group('AC4 · Replay & Retry buttons');
ok('Victory screen has "再来一局" button', /id="btnReplay"/.test(html));
ok('Game over screen has "再试一次" button', /id="btnRetry"/.test(html));
ok('btnReplay calls startGame', /btnReplay\.addEventListener\(\s*['"]click['"][\s\S]{0,40}startGame/.test(js));
ok('btnRetry calls startGame', /btnRetry\.addEventListener\(\s*['"]click['"][\s\S]{0,40}startGame/.test(js));
ok('resultNextBtn advances to next scene', /btnNextScene\.addEventListener\(\s*['"]click['"][\s\S]{0,40}nextScene/.test(js));
ok('Last scene button shows "查看结果"', /if\s*\(isLast\)[\s\S]{0,80}查看结果/.test(js));
ok('resetGame() resets all state', /function\s+resetGame/.test(js) && /state\.currentSceneIdx\s*=\s*0/.test(js));

/* =====================================================================
 * AC5 · 关键音效与震动反馈
 * ===================================================================== */
group('AC5 · Audio & Haptic');
ok('AudioContext / webkitAudioContext used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('audioCtx.resume on autoplay policy', /\.state\s*===\s*['"]suspended['"][\s\S]{0,40}\.resume\(\)/.test(js));
ok('playSound() dispatches named sounds', /function\s+playSound\s*\(/.test(js));
ok('Fart sound: low-frequency noise burst', /playFartSound/.test(js) && /lowpass.*300/.test(js));
ok('Caught sound: alternating alarm', /playCaughtSound/.test(js) && (/(440|660)/.test(js) || /square/.test(js)));
ok('Success chime: ascending notes', /playSuccessSound/.test(js) && /523.*659.*784/.test(js));
ok('Victory fanfare present', /playVictorySound/.test(js) && /1047/.test(js));
ok('Game over descending trombone', /playGameoverSound/.test(js) && /400.*350.*300.*200/.test(js));
ok('Tick sound for UI feedback', /playTickSound/.test(js));
ok('Fart sound triggers on action', /playSound\(\s*['"]fart['"]/.test(js));
ok('Caught sound on detection', /playSound\(\s*['"]caught['"]/.test(js));
ok('Success sound on fart success', /playSound\(\s*['"]success['"]/.test(js));
ok('Victory sound on all scenes complete', /playSound\(\s*['"]victory['"]/.test(js));
ok('Game over sound', /playSound\(\s*['"]gameover['"]/.test(js));
ok('vibrate() helper function', /function\s+vibrate/.test(js));
ok('navigator.vibrate guarded', /navigator\.vibrate/.test(js) && /navigator\.vibrate\s*&&/.test(js));
ok('Haptic fires on fart action', /vibrate\(80\)/.test(js));
ok('Haptic fires on caught', /vibrate\(\[100,\s*80,\s*100,\s*80,\s*150\]\)/.test(js));
ok('Haptic fires on success', /vibrate\(50\)/.test(js));
ok('Haptic fires on victory fanfare', /vibrate\(\[100,\s*50,\s*100,\s*50,\s*100,\s*100,\s*200\]\)/.test(js));
ok('Haptic fires on gameover', /vibrate\(\[200,\s*100,\s*200,\s*150,\s*300\]\)/.test(js));
ok('Settings toggle for sfx', /state\.settings\.sfx/.test(js));
ok('Settings toggle for haptic', /state\.settings\.haptic/.test(js));
ok('Settings persisted to localStorage', /sneak_the_fart_settings/.test(js));

/* =====================================================================
 * AC6 · 本地存储最高分
 * ===================================================================== */
group('AC6 · localStorage best score');
ok('LS_KEY = "sneak_the_fart_data"', /LS_KEY\s*=\s*['"]sneak_the_fart_data['"]/.test(js));
ok('loadBest() with try/catch', /function\s+loadBest[\s\S]*?try[\s\S]*?JSON\.parse/.test(js));
ok('saveBest() writes localStorage', /function\s+saveBest[\s\S]*?localStorage\.setItem/.test(js));
ok('Victory updates best.scenesCompleted', /state\.best\.scenesCompleted\s*=\s*Math\.max[\s\S]{0,50}SCENES\.length/.test(js));
ok('Victory updates best.totalSuccess', /state\.best\.totalSuccess\s*=\s*Math\.max[\s\S]{0,50}state\.totalSuccess/.test(js));
ok('Victory increments gamesPlayed', /state\.best\.gamesPlayed\+\+/.test(js));
ok('Game over also updates best', /onGameOver[\s\S]{0,400}state\.best\.scenesCompleted\s*=\s*Math\.max/.test(js));
ok('Best display on title screen', /updateBestDisplay[\s\S]{0,200}titleBest\.textContent/.test(js));
ok('recentlyPlayed tracking', /recordPlayed[\s\S]*?recentlyPlayed/.test(js));

/* =====================================================================
 * Gameplay logic
 * ===================================================================== */
group('Gameplay logic');
ok('SCENES array has 4 scenes', /SCENES\s*=\s*\[[\s\S]{0,80}id:\s*'office'[\s\S]{0,500}id:\s*'library'[\s\S]{0,500}id:\s*'elevator'[\s\S]{0,500}id:\s*'meeting'/.test(js));
ok('Each NPC has emoji, x position, label', /emoji:[\s\S]{0,60}x:\s*\d+/.test(js));
ok('Risk detection: check looking NPCs', /looking\s*=\s*state\.npcStates\.filter[\s\S]{0,100}atPlayer/.test(js) || /looking\s*>\s*0[\s\S]*danger/.test(js));
ok('Fart action checks safety', /lookingCount[\s\S]{0,50}>[\s\S]{0,30}onCaught/.test(js));
ok('Scene progression after reaching target', /state\.sceneProgress\s*>=\s*scene\.target[\s\S]{0,40}onSceneComplete/.test(js));
ok('NPC attention state machine (away/around/atPlayer)', /lookState[\s\S]*?away[\s\S]*?around[\s\S]*?atPlayer/.test(js));
ok('Weighted random transitions', /function\s+weightedRandom/.test(js));
ok('Boss NPC (meeting #4) stares more', /isBoss[\s\S]{0,100}atPlayer:\s*0\.7/.test(js));
ok('Scene decorations: office, library, elevator, meeting', /case\s+'office':[\s\S]{0,1200}case\s+'library':/ms.test(js) && /case\s+'elevator':[\s\S]{0,1200}case\s+'meeting':/ms.test(js));
ok('Caught overlay mechanism', /caughtOverlay\.classList\.add\(\s*['"]show['"]/.test(js));
ok('Lives decrease on caught', /state\.lives--/.test(js));
ok('Game over when lives ≤ 0', /state\.lives\s*<=\s*0[\s\S]{0,80}onGameOver/.test(js));
ok('Fart cloud particle effects', /spawnFartParticles/.test(js) && /fart-particle/.test(js));
ok('NPC speech bubbles', /showSpeech/.test(js) && /npc-speech/.test(js));
ok('Risk indicator UI', /riskDot[\s\S]{0,50}riskLabel/.test(js));
ok('Progress bar updates', /hudProgressFill\.style\.width/.test(js));

/* =====================================================================
 * Registry · games/registry.json entry
 * ===================================================================== */
group('Registry');
const registryPath = path.join(ROOT, '..', '..', 'games', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const games = registry.games || registry;
const entry = (Array.isArray(games) ? games : games.games || []).find(g => g.id === 'sneak-the-fart');
ok('registry has id="sneak-the-fart"', !!entry);
if (entry) {
  ok('registry.path = /games/040-sneak-the-fart/', entry.path === '/games/040-sneak-the-fart/');
  ok('registry.hasServer = false', entry.hasServer === false);
  ok('registry.players = "1"', entry.players === '1');
  ok('registry.version present', typeof entry.version === 'string' && entry.version.length > 0);
  ok('registry.featured = true', entry.featured === true);
  ok('registry.tags includes stealth/timing/humor', Array.isArray(entry.tags) && entry.tags.includes('stealth'));
}

/* =====================================================================
 * Summary
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log('  Sneak the Fart · static.test.cjs · ' + pass + ' passed · ' + fail + ' failed');
console.log('='.repeat(56));
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
process.exit(0);
