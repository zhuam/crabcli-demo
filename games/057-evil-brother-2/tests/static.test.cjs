#!/usr/bin/env node
/**
 * Static acceptance tests for Evil Brother 2 (Issue #57).
 * Run: node games/057-evil-brother-2/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
// main game logic = the largest inline <script> block
const js = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
  .map(m => m[1])
  .sort((a, b) => b.length - a.length)[0];

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

function extractConst(name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*`);
  const m = js.match(re);
  if (!m) return null;
  const i = m.index + m[0].length;
  const open = js[i];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0, end = i;
  for (; end < js.length; end++) {
    if (js[end] === open) depth++;
    else if (js[end] === close) { depth--; if (depth === 0) { end++; break; } }
  }
  return js.slice(m.index, end);
}
function extractFunction(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = js.match(re);
  if (!m) return null;
  let i = js.indexOf('{', m.index), depth = 1, end = i + 1;
  while (depth && end < js.length) {
    if (js[end] === '{') depth++;
    if (js[end] === '}') depth--;
    end++;
  }
  return js.slice(m.index, end);
}

group('AC1 - first screen playable within 3s, no tutorial');
ok('start button + game screen + scene + tray present',
  /id="btn-start"/.test(html) && /id="scr-game"/.test(html) && /id="scene"/.test(html) && /id="tray-grid"/.test(html));
ok('three FSM screens exist', /id="scr-title"/.test(html) && /id="scr-game"/.test(html) && /id="scr-result"/.test(html));
ok('no tutorial / how-to-play overlay copy', !/tutorial|how to play|教程弹窗/i.test(html));
ok('script boots immediately via init()', /function init\(/.test(js) && /init\(\);\s*$/.test(js.trim()));
ok('single file: only external dep is shared game-frame.css',
  (html.match(/<link[^>]+stylesheet[^>]+>/g) || []).length === 1 &&
  /<link[^>]+shared\/game-frame\.css/.test(html));
ok('no external scripts / fonts / media',
  !/<script[^>]+src=/.test(html) && !/@import/.test(css) && !/<audio|<video/.test(html) && !/url\(\s*["']?http/.test(css));

group('AC2 - round length <= 3 minutes');
ok('CONFIG.MAX_GAME_SEC = 180', /MAX_GAME_SEC:\s*180\b/.test(js));
ok('timer counts down each second', /state\.timeLeft\s*-=\s*1/.test(js));
ok('timeout triggers finishGame(false)', /state\.timeLeft\s*<=\s*0[\s\S]{0,60}finishGame\(false\)/.test(js));
ok('win path exists (collect all badges)', /finishGame\(true\)/.test(js));

group('AC3 - at least two of touch / mouse / keyboard');
ok('keyboard handler present', /addEventListener\(['"]keydown['"]/.test(js));
ok('keys 1-5 select tool', /key >= ['"]1['"] && key <= ['"]5['"]/.test(js) && /selectTool\(parseInt\(key/.test(js));
ok('arrows cycle hotspot focus', /ArrowLeft/.test(js) && /ArrowRight/.test(js) && /highlightFocus\(\)/.test(js));
ok('Space executes prank', /\(key === ['"] ['"] \|\| key === ['"]Spacebar['"]\)[\s\S]{0,60}executePrank\(state\.hsFocus\)/.test(js));
ok('pointer/click handlers on tools and hotspots', /addEventListener\(['"]click['"], function\(\)\{ selectTool\(i\)/.test(js) && /addEventListener\(['"]click['"], function\(\)\{ executePrank\(i\)/.test(js));
ok('touch-action manipulation in CSS', /touch-action:\s*manipulation/.test(css));

group('AC4 - settlement screen with clear restart');
ok('result screen has 再来一局 button', /id="btn-restart"[\s\S]{0,80}再来一局/.test(html));
ok('restart wired to startGame', /btn-restart[\s\S]{0,140}startGame\(\)/.test(js));
ok('restart has 1.5s cooldown (disabled attr)', /RESTART_COOLDOWN:\s*1500/.test(js) && /rb\.disabled = true/.test(js) && /rb\.disabled = false/.test(js));
ok('R key restarts from result', /\(key === ['"]r['"] \|\| key === ['"]R['"]\) && !state\.lockedRestart/.test(js));
ok('win triggered by collecting WIN_BADGES achievements', /WIN_BADGES:\s*6/.test(js) && /state\.earned\.size >= CONFIG\.WIN_BADGES/.test(js));

group('AC5 - audio and haptic feedback');
ok('WebAudio with webkit fallback', /window\.AudioContext \|\| window\.webkitAudioContext/.test(js));
ok('lazy AudioContext resumed on gesture', /audioCtx\.state === ['"]suspended['"][\s\S]{0,80}resume/.test(js) && /function ensureAudio/.test(js));
ok('sfx functions exist', /function sfxPrank/.test(js) && /function sfxGrade/.test(js) && /function sfxWin/.test(js) && /function sfxFail/.test(js) && /function sfxBadge/.test(js));
ok('navigator.vibrate guarded with try/catch', /if \(navigator\.vibrate\) try \{ navigator\.vibrate\(pattern\); \} catch/.test(js));
ok('CSS shake fallback for iOS (no vibrate)', /@keyframes shake-x/.test(css) && /sceneEl\.classList\.add\(['"]shake['"]\)/.test(js));
ok('executePrank produces sfx + vibrate feedback', /sfxPrank\(\);[\s\S]{0,40}vibrate\(/.test(js));

group('AC6 - best score + achievements persisted to localStorage');
ok('best score key is game-specific', /LS_BEST:\s*['"]evil_brother_2_best['"]/.test(js));
ok('achievements key is game-specific', /LS_ACH:\s*['"]evil_brother_2_achievements['"]/.test(js));
ok('safe JSON localStorage helpers with try/catch', /function lsGet[\s\S]{0,180}try/.test(js) && /function lsSet[\s\S]{0,120}try/.test(js));
ok('finishGame persists best on win/fail', /isNewBest = state\.score > prevBest/.test(js) && /if \(isNewBest\) lsSet\(CONFIG\.LS_BEST, state\.score\)/.test(js));
ok('achievements persist across sessions', /lsSet\(CONFIG\.LS_ACH, Array\.from\(state\.earned\)\)/.test(js) && /new Set\(lsGet\(CONFIG\.LS_ACH/.test(js));

group('Game data integrity (vm)');
const configSrc = extractConst('CONFIG');
const toolsSrc = extractConst('TOOLS');
const achSrc = extractConst('ACH');
const scenesSrc = extractConst('SCENES');
const ptsSrc = extractConst('GRADE_PTS');
const fmtSrc = extractFunction('fmtTime');
ok('constants + fmtTime extractable', !!(configSrc && toolsSrc && achSrc && scenesSrc && ptsSrc && fmtSrc));
if (configSrc && toolsSrc && achSrc && scenesSrc && ptsSrc && fmtSrc) {
  const ctx = { String, Math };
  vm.createContext(ctx);
  vm.runInContext(
    [configSrc, toolsSrc, achSrc, scenesSrc, ptsSrc].join('\n') +
    '\nthis.CONFIG=CONFIG;this.TOOLS=TOOLS;this.ACH=ACH;this.SCENES=SCENES;this.GRADE_PTS=GRADE_PTS;', ctx);
  vm.runInContext(fmtSrc + '\nthis.fmtTime=fmtTime;', ctx);

  ok('exactly 6 achievements (win condition)', ctx.ACH.length === ctx.CONFIG.WIN_BADGES && ctx.ACH.length === 6);
  ok('5 tools in tray', ctx.TOOLS.length === 5);
  ok('2 scenes (living + kitchen)', ctx.SCENES.length === 2 && ctx.SCENES[0].id === 'living' && ctx.SCENES[1].id === 'kitchen');
  ok('roach tool locked behind 2 achievements', ctx.TOOLS[4].id === 'roach' && ctx.TOOLS[4].unlockAt === ctx.CONFIG.TOOL_UNLOCK_BADGES);
  ok('first three tools unlocked from start', ctx.TOOLS.slice(0, 3).every(t => t.unlockAt === 0));

  const allHotspots = ctx.SCENES.flatMap(s => s.hotspots);
  ok('every hotspot has a best-tool mapping', allHotspots.every(h => Array.isArray(h.best) && h.best.length > 0));
  ok('each core tool achievement is reachable', ['cushion', 'spider', 'ice', 'gum'].every(
    tid => allHotspots.some(h => h.best.includes(tid))));
  ok('a TV hotspot exists for 电视惊魂 achievement', allHotspots.some(h => h.isTv === true));
  ok('grade points ordered S > A > B > C', ctx.GRADE_PTS.S > ctx.GRADE_PTS.A && ctx.GRADE_PTS.A > ctx.GRADE_PTS.B && ctx.GRADE_PTS.B > ctx.GRADE_PTS.C);

  ok('fmtTime formats 180s as 3:00', ctx.fmtTime(180) === '3:00');
  ok('fmtTime pads single-digit seconds', ctx.fmtTime(65) === '1:05');
  ok('fmtTime clamps negatives to 0:00', ctx.fmtTime(-5) === '0:00');
}

group('Registry + hub integration');
const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'games', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'evil-brother-2');
ok('registry contains evil-brother-2', !!entry);
ok('registry path points at 057 directory', entry && entry.path === '/games/057-evil-brother-2/');
ok('registry category is casual', entry && entry.category === 'casual');
ok('registry thumbnail points at thumb.png', entry && entry.thumbnail === '/games/057-evil-brother-2/thumb.png');

const hubMain = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const hubNew = fs.readFileSync(path.join(REPO, 'hub', 'new-hub.html'), 'utf8');
ok('hub index.html GAMES registers evil-brother-2', /id:"evil-brother-2"/.test(hubMain));
ok('hub new-hub.html GAMES registers evil-brother-2', /id:"evil-brother-2"/.test(hubNew));
ok('thumb.png exists', fs.existsSync(path.join(ROOT, 'thumb.png')));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
