#!/usr/bin/env node
/**
 * Static acceptance tests for Bridge Builder Frenzy (Issue #50).
 * Run: node games/050-bridge-builder-frenzy/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Extract inline JS (<script> block) and CSS (<style> block)
const jsMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const js = jsMatch ? jsMatch[1] : '';
const css = cssMatch ? cssMatch[1] : '';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
function group(title) { console.log(`\n=== ${title} ===`); }

group('AC1 - first screen playable, no tutorial gate');
ok('title screen and game screen containers exist', /id="screen-title"/.test(html) && /id="screen-game"/.test(html) && /id="screen-result"/.test(html));
ok('play button triggers startGame', /btn-play.*onclick="startGame\(\)"/.test(html) || /class="btn-play".*startGame/.test(html));
ok('no tutorial overlay copy', !/tutorial|how.to.play|教程弹窗/i.test(html));
ok('game boots immediately via IIFE init', /initState\(\)[\s\S]*setupCanvas\(\)[\s\S]*drawPreview\(\)/.test(js));
ok('back-to-hub link present', /back-to-hub/.test(html));

group('AC2 - session length and physics configuration');
ok('GRAVITY constant set', /GRAVITY\s*=\s*0\.15/.test(js));
ok('DAMPING constant set', /DAMPING\s*=\s*0\.99/.test(js));
ok('SUB_STEPS set for stability', /SUB_STEPS\s*=\s*8/.test(js));
ok('TRUCK_SPEED configured', /TRUCK_SPEED\s*=\s*1\.2/.test(js));
ok('MAX_BEAM_LENGTH capped at 180', /MAX_BEAM_LENGTH\s*=\s*180/.test(js));
ok('SNAP_RADIUS defined', /SNAP_RADIUS\s*=\s*18/.test(js));

group('AC3 - mouse, touch and keyboard input');
ok('mousedown handler on arena', /addEventListener\(['"]mousedown['"]/.test(js) && /handleBuildStart/.test(js));
ok('mousemove handler on window', /window\.addEventListener\(['"]mousemove['"]/.test(js) && /handleBuildMove/.test(js));
ok('mouseup handler for build end', /window\.addEventListener\(['"]mouseup['"]/.test(js) && /handleBuildEnd/.test(js));
ok('touchstart handler with preventDefault', /addEventListener\(['"]touchstart['"][\s\S]{0,200}e\.preventDefault/.test(js));
ok('touchmove handler for dragging', /addEventListener\(['"]touchmove['"]/.test(js) && /handleBuildMove/.test(js));
ok('touchend handler for release', /addEventListener\(['"]touchend['"]/.test(js) && /handleBuildEnd/.test(js));
ok('keyboard Escape to return to menu', /key\s*===\s*['"]Escape['"]/.test(js) && /menu\(\)/.test(js));
ok('Space/Enter starts game on title or tests bridge', /key\s*===\s*['"]\s['"]/.test(js) && /startTest\(\)/.test(js));
ok('Delete/Backspace triggers undo', /key\s*===\s*['"]Delete['"]/.test(js) && /undoBeam\(\)/.test(js));
ok('T key triggers test', /key\s*===\s*['"]t['"]/.test(js) && /startTest\(\)/.test(js));
ok('R key triggers reset', /key\s*===\s*['"]r['"]/.test(js) && /resetLevel\(\)/.test(js));
ok('number keys 1/2/3 select materials', /key\s*===\s*'1'[\s\S]{0,80}selectMaterial\(['"]wood['"]\)/.test(js) && /key\s*===\s*'2'[\s\S]{0,80}selectMaterial\(['"]steel['"]\)/.test(js) && /key\s*===\s*'3'[\s\S]{0,80}selectMaterial\(['"]cable['"]\)/.test(js));

group('AC4 - result screen, win/fail settlement and restart');
ok('result screen has stars, title, stats, actions', /id="result-stars"/.test(html) && /id="result-title"/.test(html) && /id="result-stats"/.test(html));
ok('next level button exists', /id="nextLvlBtn"/.test(html) && /continueNextLevel/.test(html));
ok('retry button exists', /onclick="retryLevel\(\)"/.test(html) || /btn-rematch/.test(html));
ok('menu button to return to title', /onclick="menu\(\)"/.test(html) && /btn-menu/.test(html));
ok('win path shows BRIDGE COMPLETE', /titleEl\.textContent\s*=\s*['"]BRIDGE COMPLETE!['"]/.test(js));
ok('lose path shows BRIDGE COLLAPSED', /titleEl\.textContent\s*=\s*['"]BRIDGE COLLAPSED!['"]/.test(js));
ok('levelComplete defined', /function\s+levelComplete/.test(js));
ok('levelComplete shows level-up overlay and stars', /getElementById\(['"]level-up-title['"]\)[\s\S]{0,80}LEVEL CLEAR/.test(js) && /starThresholds/.test(js) && /saveBestLevel/.test(js));
ok('gameOver handles lose path with showResult', /showResult\(won,\s*stars,\s*budgetLeft\)/.test(js));
ok('new best indicator in HTML and toggle logic in JS', /id="result-newbest"[\s\S]{0,80}NEW BEST LEVEL/.test(html) && /result-newbest.*style\.display\s*=\s*.*won\s*&&\s*isNew/.test(js));
ok('level-up overlay exists', /id="level-up"/.test(html) && /LEVEL CLEAR!/.test(html) && /onclick="nextLevel\(\)"/.test(html));

group('AC5 - audio and haptic feedback');
ok('WebAudio with webkit fallback used', /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('sfxPlace defined', /function\s+sfxPlace/.test(js) && /playTone\(660,0.08/.test(js));
ok('sfxTestStart defined', /function\s+sfxTestStart/.test(js));
ok('sfxCrack defined', /function\s+sfxCrack/.test(js));
ok('sfxCollapse defined', /function\s+sfxCollapse/.test(js));
ok('sfxWin defined with ascending tones', /function\s+sfxWin/.test(js) && /784/.test(js) && /playTone\(523/.test(js));
ok('sfxLose defined with descending tones', /function\s+sfxLose/.test(js) && /playTone\(400/.test(js) && /playTone\(300/.test(js));
ok('sfxLevelUp defined', /function\s+sfxLevelUp/.test(js));
ok('playTone guarded with try/catch', /try\{[\s\S]{0,500}catch/.test(js));
ok('sound toggle button and muting exist', /id="sound-toggle"/.test(html) && /toggleSound/.test(js) && /soundEnabled/.test(js));

group('AC6 - localStorage best score');
ok('STORAGE_KEY uses bridge-builder-best', /STORAGE_KEY\s*=\s*['"]bridge-builder-best['"]/.test(js));
ok('loadBestLevel reads from localStorage', /localStorage\.getItem\(STORAGE_KEY\)/.test(js) && /parseInt/.test(js));
ok('saveBestLevel writes to localStorage', /localStorage\.setItem\(STORAGE_KEY/.test(js));
ok('maxLevel loaded on game start', /state\.maxLevel\s*=\s*loadBestLevel\(\)/.test(js));
ok('best score display on title screen', /id="best-score-display"/.test(html) && /best-score/.test(html));
ok('levelComplete saves if new best', /if\(nextLvl\s*>\s*state\.maxLevel\)[\s\S]{0,80}saveBestLevel\(state\.maxLevel\)/.test(js));

group('Level definitions');
ok('5 levels defined', /LEVELS\s*=\s*\[/.test(js) && (js.match(/name:/g) || []).length >= 5);
ok('Level 1 has budget 600', /budget:600/.test(js));
ok('Level 1 uses wood material', /materials:\[['"]wood['"]\]/.test(js));
ok('Level 3 unlocks steel', /materials:\[['"]wood['"],[['"]steel['"]\]/.test(js));
ok('Level 5 unlocks cable', /materials:\[['"]wood['"],[['"]steel['"],[['"]cable['"]\]/.test(js));
ok('star thresholds per level', /starThresholds:\[0\.4,\s*0\.25,\s*0\.1\]/.test(js));

group('Material definitions');
ok('wood material defined with cost 3, strength 8', /wood:.*cost:\s*3.*strength:\s*8/.test(js));
ok('steel material defined with cost 6, strength 18', /steel:.*cost:\s*6.*strength:\s*18/.test(js));
ok('cable material defined with tensionOnly:true', /cable:.*tensionOnly:\s*true/.test(js));

group('Bridge building mechanics');
ok('handleBuildStart defined', /function\s+handleBuildStart/.test(js));
ok('handleBuildMove defined', /function\s+handleBuildMove/.test(js));
ok('handleBuildEnd defined', /function\s+handleBuildEnd/.test(js));
ok('getNodeAt snap logic exists', /function\s+getNodeAt/.test(js) && /SNAP_RADIUS/.test(js));
ok('physicsStep applies gravity and beam forces', /function\s+physicsStep/.test(js) && /GRAVITY/.test(js) && /forceMag/.test(js));
ok('beam stress check and break logic', /if\(stress\s*>\s*b\.strength\)[\s\S]{0,80}b\.broken\s*=\s*true/.test(js));
ok('startTest checks beams and connectivity', /function\s+startTest/.test(js) && /checkPathExists/.test(js));
ok('undoBeam restores budget', /function\s+undoBeam/.test(js) && /state\.budget\s*\+=\s*beam\.cost/.test(js));
ok('resetLevel reloads current level', /function\s+resetLevel[\s\S]{0,80}loadLevel\(state\.level\)/.test(js));

group('Truck physics');
ok('updateTruck animates truck across bridge', /function\s+updateTruck/.test(js) && /state\.truckX\s*\+=\s*state\.truckSpeed/.test(js));
ok('truck win condition on reaching right side', /state\.truckX\s*>\s*0\.92[\s\S]{0,60}state\.truckFinished\s*=\s*true/.test(js));
ok('truck collapse detection', /state\.truckFalling\s*=\s*true[\s\S]{0,80}sfxCollapse/.test(js));
ok('checkPathExists BFS connectivity check', /function\s+checkPathExists[\s\S]{0,200}BFS/.test(js) || /function\s+checkPathExists/.test(js) && /queue\.push/.test(js));

group('Particles and visual effects');
ok('spawnParticles defined', /function\s+spawnParticles/.test(js));
ok('updateParticles defined with life cycle', /function\s+updateParticles[\s\S]{0,200}p\.life\s*-=\s*0\.02/.test(js));

group('Responsive design');
ok('max-width 480px media query', /@media\s*\(max-width:\s*480px\)/.test(css));
ok('preview canvas on title screen', /id="preview-canvas"/.test(html) && /drawPreview/.test(js));

group('Registry integration');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'registry.json'), 'utf8'));
const entry = registry.games.find(g => g.id === 'bridge-builder-frenzy');
ok('registry contains bridge-builder-frenzy', !!entry);
ok('registry path points at 050 directory', entry && entry.path === '/games/050-bridge-builder-frenzy/');
ok('registry category is casual', entry && entry.category === 'casual');
ok('registry has puzzle tag', entry && Array.isArray(entry.tags) && entry.tags.includes('puzzle'));
ok('registry has physics tag', entry && Array.isArray(entry.tags) && entry.tags.includes('physics'));

console.log('\n' + '='.repeat(50));
console.log(`  ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
