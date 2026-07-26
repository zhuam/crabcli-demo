#!/usr/bin/env node
/**
 * Static acceptance tests for Grow a Garden Idle (Game 043).
 * Validates HTML/JS structure against requirements.
 * Run: node games/043-grow-a-garden-idle/tests/static.test.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; failures.push(name + (detail ? ' - ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
function group(title) { console.log('\n=== ' + title + ' ==='); }

// Utility: extract all JS code from inline <script> in HTML
function extractInlineJS(html) {
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const js = m[1].trim();
    if (js && !js.startsWith('window.')) scripts.push(js);
  }
  return scripts.join('\n');
}

const js = extractInlineJS(html);

group('AC1 - Splash screen with PLAY button, collection progress, no tutorial');
ok('script is inline and non-empty', js.length > 0);
ok('IIFE boot present', /\(function\s*\(\)\s*\{/.test(js));
ok('splash has PLAY button', /id="playBtn"/.test(html) && /PLAY/.test(html));
ok('collection progress X/12 displayed', /splashProgress[\s\S]{0,200}\/\s*12/.test(html));
ok('no tutorial overlay copy', !/tutorial|how to play|tutorial-modal/i.test(html));
ok('high score display on splash', /splashHigh.*High Score/.test(html));
ok('flower progress icons on splash', /id="splashFlowers"/.test(html));

group('AC2 - Idle game with CPS, auto-generation, incremental progression');
ok('CPS calculation function exists', /function\s+calcCPS\s*\(/.test(js));
ok('game loop exists for passive income', /function\s+gameLoop\s*\(/.test(js));
ok('passive income in game loop', /state\.coins\s*\+=\s*gain/.test(js) || /state\.coins\s*\+=\s*cps/.test(js));
ok('auto-clicker upgrade defined', /autoClicker/.test(js));
ok('auto-harvest function exists', /function\s+autoHarvest\s*\(/.test(js));
ok('requestAnimationFrame loop', /requestAnimationFrame\(\s*gameLoop\s*\)/.test(js));
ok('level calculation from totalEarned', /function\s+calcLevel\s*\(/.test(js));
ok('incremental thresholds for level up', /thresholds/.test(js) && /totalEarned/.test(js));
ok('unlimited play (no timer countdown)', !/totalTime\s*=\s*\d+/.test(js) && !/timeRemaining/.test(js));
ok('fmtCoins helper for display', /function\s+fmtCoins\s*\(/.test(js));

group('AC3 - Input modes (Mouse click, Touch tap, Keyboard)');
ok('click handler for plots', /addEventListener\(['"]click['"][\s\S]{0,200}plotClick/.test(js) || /attachPlotEvents/.test(js));
ok('touchmove handler present', /touchmove/.test(js));
ok('gesturestart prevention', /gesturestart[\s\S]{0,50}e\.preventDefault/.test(js));
ok('keyboard: 1-6 select plots', /case\s+['"]1['"][\s\S]{0,200}case\s+['"]6['"]/.test(js));
ok('keyboard: Space harvests selected plot', /case\s+['"]\s['"]/.test(js) || /e\.key\s*===\s*['"]\s['"]/.test(js));
ok('keyboard: U toggles shop', /case\s+['"]u['"]:\s*case\s+['"]U['"]/.test(js) || /e\.key\s*===\s*['"]u['"]/.test(js));
ok('keyboard: Enter buys shop item', /case\s+['"]Enter['"]/.test(js) || /e\.key\s*===\s*['"]Enter['"]/.test(js));

group('AC4 - Win screen with PLAY AGAIN showing stats');
ok('win screen exists with id', /id="win"/.test(html));
ok('PLAY AGAIN button exists', /id="winPlayAgain"/.test(html) && /PLAY AGAIN/.test(html));
ok('win stats: total coins', /id="winTotal"/.test(html));
ok('win stats: time played', /id="winTime"/.test(html));
ok('win stats: level', /id="winLevel"/.test(html));
ok('win stats: high score', /id="winHigh"/.test(html));
ok('triggerWin function exists', /function\s+triggerWin\s*\(/.test(js));
ok('confetti on win', /function\s+spawnConfetti\s*\(/.test(js));
ok('restartGame resets state', /function\s+restartGame\s*\(/.test(js));

group('AC5 - AudioContext + fallback, SFX functions, vibrate with try/catch');
ok('AudioContext with webkit fallback', /AudioContext\s*\|\|\s*window\.webkitAudioContext/.test(js));
ok('ensureAudio function exists', /function\s+ensureAudio\s*\(/.test(js));
ok('playTone helper uses oscillator', /createOscillator/.test(js) && /createGain/.test(js));
ok('sfxHarvest function defined', /function\s+sfxHarvest\s*\(/.test(js));
ok('sfxBuy function defined', /function\s+sfxBuy\s*\(/.test(js));
ok('sfxUnlock function defined', /function\s+sfxUnlock\s*\(/.test(js));
ok('sfxWin function defined', /function\s+sfxWin\s*\(/.test(js));
ok('vibrate guarded with try/catch', /try\s*\{[\s\S]{0,30}navigator\.vibrate/.test(js));
ok('mute toggle button exists', /id="muteBtn"/.test(html));
ok('mute toggle toggles sfx setting', /state\.settings\.sfx\s*=\s*!state\.settings\.sfx/.test(js));

group('AC6 - localStorage keys for persistence');
ok('SAVE_KEY defined as grow_garden_save', /SAVE_KEY\s*=\s*['"]grow_garden_save['"]/.test(js));
ok('BEST_KEY defined as grow_garden_best', /BEST_KEY\s*=\s*['"]grow_garden_best['"]/.test(js));
ok('saveGame writes to localStorage', /localStorage\.setItem\(\s*SAVE_KEY/.test(js));
ok('loadGame reads from localStorage', /localStorage\.getItem\(\s*SAVE_KEY/.test(js));
ok('saveGame persists coins', /coins.*state\.coins/.test(js));
ok('saveGame persists level', /level.*state\.level/.test(js));
ok('saveGame persists unlockedFlowers', /unlockedFlowers.*state\.unlockedFlowers/.test(js));
ok('saveGame persists upgrades', /upgrades.*\.\.\.state\.upgrades/.test(js));
ok('saveGame persists timestamp', /lastSaveTs[\s\S]{0,20}Date\.now/.test(js));
ok('beforeunload saves game', /beforeunload[\s\S]{0,50}saveGame/.test(js));
ok('offline earnings calculation', /elapsed[\s\S]{0,100}cps\s*\*\s*elapsed/.test(js));

group('Game mechanics - 12 flower types');
ok('FLOWERS array with 12 entries', /FLOWERS\s*=\s*\[[\s\S]{0,2000}rainbow-orchid/.test(js));
ok('flower: daisy (baseValue 1)', /daisy[\s\S]{0,100}baseValue:1/.test(js));
ok('flower: blue-rose (baseValue 50)', /blue-rose[\s\S]{0,100}baseValue:50/.test(js));
ok('flower: rainbow-orchid (baseValue 100)', /rainbow-orchid[\s\S]{0,100}baseValue:100/.test(js));
ok('each flower has id, name, emoji, baseValue, unlockCost, seedCost, growthTime, color', /id:.*name:.*emoji:.*baseValue:.*unlockCost:.*seedCost:.*growthTime:.*color:/.test(js));
ok('6 plots defined', /plots.*null.*null.*null.*null.*null.*null/.test(js) || /6.*plots/.test(js));

group('Game mechanics - Harvest and shop upgrades');
ok('harvestPlot function exists', /function\s+harvestPlot\s*\(/.test(js));
ok('plantSeed function exists', /function\s+plantSeed\s*\(/.test(js));
ok('buyUpgrade function exists', /function\s+buyUpgrade\s*\(/.test(js));
ok('buyUnlockFlower function exists', /function\s+buyUnlockFlower\s*\(/.test(js));
ok('UPGRADES array with speedBoost, autoClicker, valueBoost', /speedBoost[\s\S]{0,200}autoClicker[\s\S]{0,200}valueBoost/.test(js));
ok('calcClickValue includes valueBoost multiplier', /valueBoost/.test(js) && /calcClickValue/.test(js));
ok('shop panel render function', /function\s+renderShop\s*\(/.test(js));
ok('shop toggle functionality', /function\s+toggleShop\s*\(/.test(js));
ok('float text on harvest', /function\s+spawnFloatText\s*\(/.test(js));
ok('offline earnings banner', /showOfflineBanner/.test(js));
ok('progression: sequential flower unlock', /nextUnlockIdx/.test(js));

group('Registry integration');
ok('window.__gameRegistry exists', /__gameRegistry/.test(js));
ok('registry id is grow-a-garden-idle', /['"]grow-a-garden-idle['"]/.test(js));
ok('registry category is casual', /category:\s*['"]casual['"]/.test(js));
ok('registry tags include idle', /tags[\s\S]{0,200}['"]idle['"]/.test(js));
ok('registry tags include garden', /tags[\s\S]{0,200}['"]garden['"]/.test(js));

console.log('\n' + '='.repeat(50));
console.log('  ' + pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(50));
if (fail) {
  console.log('\nFailures:');
  failures.forEach(function(f) { console.log('  - ' + f); });
  process.exit(1);
}
