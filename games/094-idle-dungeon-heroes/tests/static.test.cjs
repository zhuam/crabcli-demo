#!/usr/bin/env node
/**
 * Idle Dungeon Heroes (Issue #94) acceptance tests.
 * Static checks intentionally mirror existing repository game tests without a browser.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const registry = fs.readFileSync(path.resolve(ROOT, '../registry.json'), 'utf8');
const hubJs = fs.readFileSync(path.resolve(ROOT, '../../hub/hub.js'), 'utf8');
const hubCss = fs.readFileSync(path.resolve(ROOT, '../../hub/hub.css'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, condition) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.error(`  ❌ ${label}`); failed++; }
}
function group(title) { console.log(`\n${title}`); }

group('AC1 · first screen playable within 3 seconds');
ok('local static HTML with viewport and no blocking tutorial', /<meta\s+name="viewport"/i.test(html) && !/tutorial/i.test(html));
ok('boot() invoked immediately from local app.js', /<script src="app\.js"><\/script>/.test(html) && /boot\(\);/.test(js));
ok('auto dispatch under 3 seconds configured', /AUTO_DISPATCH_MS:\s*900\b/.test(js) && /setTimeout\(\(\)\s*=>[\s\S]{0,120}CONFIG\.AUTO_DISPATCH_MS/.test(js));
ok('primary dispatch button exists on first screen', /id="dispatchBtn"[\s\S]{0,120}>派遣英雄/.test(html));

group('AC2 · session length <= 3 minutes');
ok('CONFIG.MAX_GAME_SEC is exactly 180', /MAX_GAME_SEC:\s*180\b/.test(js));
ok('combat loop fails on gameSec() >= CONFIG.MAX_GAME_SEC', /gameSec\(\)\s*>=\s*CONFIG\.MAX_GAME_SEC[\s\S]{0,100}endGame\(false/.test(js));

group('AC3 · mouse/touch plus keyboard input');
ok('click handlers cover mouse/touch actions', /addEventListener\('click'\s*,\s*\(\)\s*=>\s*dispatchHero\(\)\)/.test(js) && /addEventListener\('click'[\s\S]{0,120}upgradeHero/.test(js));
ok('drag equipment support exists', /draggable="true"/.test(js) && /addEventListener\('dragstart'/.test(js) && /addEventListener\('drop'/.test(js));
ok('keyboard listener supports 1/2/3, E, U, Space, R', /addEventListener\('keydown'/.test(js) && /e\.key\s*>=\s*'1'/.test(js) && /toLowerCase\(\)\s*===\s*'e'/.test(js) && /e\.code\s*===\s*'Space'/.test(js) && /toLowerCase\(\)\s*===\s*'r'/.test(js));

group('AC4 · win/fail result page and replay');
ok('result dialog and clear 再来一局 button exist', /id="resultModal"/.test(html) && /id="restartBtn"[\s\S]{0,80}再来一局/.test(html));
ok('victory and failure both call endGame/show result', /endGame\(true/.test(js) && /endGame\(false/.test(js) && /showResult\(victory/.test(js));
ok('restart button and keyboard restart call restartGame()', /restartBtn\.addEventListener\('click',\s*restartGame\)/.test(js) && /state\.finished[\s\S]{0,140}restartGame\(\)/.test(js));

group('AC5 · audio and haptic feedback');
ok('WebAudio oscillator feedback implemented', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js) && /createOscillator\(\)/.test(js));
ok('named sfx cover dispatch/equip/level/win/fail/deny', /dispatch:/.test(js) && /equip:/.test(js) && /level:/.test(js) && /win:/.test(js) && /fail:/.test(js) && /deny:/.test(js));
ok('navigator.vibrate guarded and used several times', /navigator\.vibrate/.test(js) && (js.match(/vibrate\(/g) || []).length >= 5);
ok('visible mute toggle persists settings', /id="muteBtn"/.test(html) && /LS\.SETTINGS/.test(js) && /lsSet\(LS\.SETTINGS,\s*settings\)/.test(js));

group('AC6 · localStorage best score');
ok('best-score key uses idle_dungeon_heroes_best', /BEST:\s*'idle_dungeon_heroes_best'/.test(js));
ok('best schema includes score, fastest clear, games, wins, highest room', /bestScore/.test(js) && /bestClearTimeSec/.test(js) && /gamesPlayed/.test(js) && /wins/.test(js) && /highestRoom/.test(js));
ok('endGame writes best record to localStorage', /function endGame\([\s\S]*lsSet\(LS\.BEST,\s*best\)/.test(js));

group('Game loop and progression');
ok('six dungeon rooms including boss configured', /(id:\s*'[^']+'[\s\S]*?){6}/.test(js) && /boss:\s*true/.test(js));
ok('hero unlock and set bonus logic present', /unlockRoom/.test(js) && /room\.unlock/.test(js) && /setBonus/.test(js) && /countSets\(/.test(js));
ok('equipment supports click fallback and auto equip', /selectedEquipId/.test(js) && /autoEquipBest/.test(js) && /一键装备最佳/.test(html));
ok('design artifact side panel sections implemented', /核心循环/.test(html) && /套装与槽位/.test(html) && /feedback-list/.test(html) && /notes-section/.test(html));
ok('runtime renders equipment slot drop targets', /function renderEquipmentSlots/.test(js) && /data-slot/.test(js) && /Drop target/.test(js));
ok('responsive design and reduced motion included', /@media \(max-width: 760px\)/.test(css) && /prefers-reduced-motion/.test(css));
ok('registry includes idle-dungeon-heroes', /"id":\s*"idle-dungeon-heroes"/.test(registry) && /"path":\s*"\/games\/094-idle-dungeon-heroes\/"/.test(registry));
ok('hub gives Game 094 a discoverable custom icon and polished card style', /'idle-dungeon-heroes':\s*'⚔️'/.test(hubJs) && /game-card-dungeon/.test(hubJs) && /\.game-card-dungeon/.test(hubCss));

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\nAll ${passed} checks passed.`);
