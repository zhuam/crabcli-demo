#!/usr/bin/env node
/**
 * Runtime behavior tests for Idle Dungeon Heroes (Issue #94).
 *
 * The static suite checks acceptance criteria by source presence. This suite
 * executes the real app.js in a small DOM sandbox and verifies stateful game
 * behavior that can regress while static checks still pass: equipment swapping,
 * set bonuses, hero unlock progression, victory/failure settlement, and
 * localStorage best-score persistence.
 *
 * Run: node games/094-idle-dungeon-heroes/tests/behavior.test.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let passed = 0;
let failed = 0;
const failures = [];
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  OK ${label}`);
    passed += 1;
  } else {
    const msg = `${label}${detail ? ` -- ${detail}` : ''}`;
    console.error(`  FAIL ${msg}`);
    failures.push(msg);
    failed += 1;
  }
}
function group(title) { console.log(`\n${title}`); }

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
    this._innerHTML = '';
    this.classList = {
      add() {},
      remove() {},
      contains() { return false; }
    };
  }
  set textContent(value) { this._textContent = String(value); }
  get textContent() { return this._textContent; }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }
  querySelectorAll() { return []; }
  focus() { this.focused = true; }
}

function makeLocalStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) { store[key] = String(value); },
    removeItem(key) { delete store[key]; },
    clear() { Object.keys(store).forEach(key => delete store[key]); },
    snapshot() { return { ...store }; }
  };
}

function createSandbox({ now = 1_000, best = null } = {}) {
  const ids = [
    'roomDisplay', 'timerDisplay', 'goldDisplay', 'bestDisplay', 'muteBtn', 'dispatchBtn', 'roomTrack',
    'partyList', 'partyPower', 'monsterStage', 'monsterTimer', 'monsterName', 'monsterFigure', 'monsterHpBar',
    'monsterHpText', 'damageFloat', 'lootList', 'miniProgress', 'upgradeList', 'autoEquipBtn', 'battleLog',
    'resultModal', 'resultBadge', 'resultTitle', 'resultCopy', 'resultScore', 'resultRoom', 'resultTime',
    'resultBest', 'newBestText', 'restartBtn', 'toast', 'equipGrid'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new MockElement(id)]));
  const lsInitial = {
    idle_dungeon_heroes_settings: JSON.stringify({ sfx: false, haptic: false })
  };
  if (best) lsInitial.idle_dungeon_heroes_best = JSON.stringify(best);
  const localStorage = makeLocalStorage(lsInitial);
  let currentNow = now;
  let timeoutId = 0;
  const sandbox = {
    console,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Date: { now: () => currentNow },
    localStorage,
    navigator: { vibrate() { sandbox.vibrateCalls += 1; return true; } },
    setTimeout(fn) { timeoutId += 1; return timeoutId; },
    clearTimeout() {},
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    document: {
      getElementById(id) {
        if (!elements[id]) elements[id] = new MockElement(id);
        return elements[id];
      },
      addEventListener(type, handler) { elements.document.addEventListener(type, handler); },
      querySelector() { return null; }
    },
    window: {},
    vibrateCalls: 0
  };
  elements.document = new MockElement('document');
  sandbox.window = sandbox;
  sandbox.advanceTime = ms => { currentNow += ms; };

  const instrumented = source.replace(
    'window.__idleDungeonHeroes = { CONFIG, state, restartGame, dispatchHero, upgradeHero, equipItem, autoEquipBest, computeScore };',
    'window.__idleDungeonHeroes = { CONFIG, state, restartGame, dispatchHero, upgradeHero, equipItem, autoEquipBest, computeScore, heroStats, clearRoom, endGame };'
  );
  vm.createContext(sandbox);
  vm.runInContext(instrumented, sandbox, { filename: 'app.js' });
  return { sandbox, game: sandbox.window.__idleDungeonHeroes, elements, localStorage };
}

function clone(item, uid) { return { ...item, uid }; }

/* =====================================================================
 * 1. Boot and initial playability
 * ===================================================================== */
group('1. Boot and initial playability');
{
  const { game, elements } = createSandbox();
  ok('runtime API exposed after immediate boot', !!game && !!game.CONFIG && !!game.state);
  ok('three-minute cap is configured at runtime', game.CONFIG.MAX_GAME_SEC === 180);
  ok('first hero starts unlocked and dispatched', game.state.heroes.aria.unlocked && game.state.heroes.aria.dispatched);
  ok('later heroes are locked at boot', !game.state.heroes.mira.unlocked && !game.state.heroes.bronn.unlocked);
  ok('initial inventory has starter equipment for no-tutorial play', game.state.inventory.length === 2);
  ok('first render paints HUD values', elements.roomDisplay.textContent === '第 1 / 6 层' && elements.timerDisplay.textContent === '3:00');
  ok('first render paints design-aligned equipment slots', /data-slot="weapon"/.test(elements.equipGrid.innerHTML) && /Drop target/.test(elements.equipGrid.innerHTML));
}

/* =====================================================================
 * 2. Equipment state: click/drag target behavior is backed by equipItem()
 * ===================================================================== */
group('2. Equipment equip and replacement behavior');
{
  const { game } = createSandbox();
  const aria = game.state.heroes.aria;
  const first = game.state.inventory[0];
  const initialInventoryCount = game.state.inventory.length;

  game.equipItem(first.uid, 'aria');
  ok('equipping removes item from inventory', game.state.inventory.length === initialInventoryCount - 1);
  ok('equipping fills the matching hero slot', aria.equipment[first.slot] && aria.equipment[first.slot].uid === first.uid);
  ok('equipping clears selected equipment', game.state.selectedEquipId === null);

  const strongerWeapon = clone(game.CONFIG.EQUIPMENT.find(item => item.slot === first.slot), 'regression-stronger-weapon');
  strongerWeapon.power = first.power + 50;
  strongerWeapon.atk = first.atk + 20;
  game.state.inventory.push(strongerWeapon);
  game.equipItem(strongerWeapon.uid, 'aria');

  ok('replacement equips the new item in the same slot', aria.equipment[first.slot].uid === strongerWeapon.uid);
  ok('replacement returns the old item to inventory', game.state.inventory.some(item => item.uid === first.uid));
  ok('replacement never duplicates the equipped item in inventory', !game.state.inventory.some(item => item.uid === strongerWeapon.uid));
}

/* =====================================================================
 * 3. Set bonuses and auto-equip progression
 * ===================================================================== */
group('3. Set bonus and auto-equip behavior');
{
  const { game } = createSandbox();
  const emberItems = game.CONFIG.EQUIPMENT.filter(item => item.set === 'ember').map((item, index) => clone(item, `ember-${index}`));
  const testHero = {
    ...game.CONFIG.HEROES[0],
    level: 2,
    hp: 1,
    unlocked: true,
    dispatched: true,
    equipment: { weapon: emberItems[0], armor: emberItems[1], relic: emberItems[2] }
  };
  const stats = game.heroStats(testHero);
  const rawAtk = testHero.baseAtk + 6 + emberItems.reduce((sum, item) => sum + item.atk, 0);
  const rawHp = testHero.baseHp + 24 + emberItems.reduce((sum, item) => sum + item.hp, 0);
  ok('three-piece set reports a set bonus', stats.setBonus === true && stats.setPieces === 3);
  ok('two-plus pieces apply attack multiplier', stats.atk === Math.round(rawAtk * 1.2));
  ok('three pieces apply health multiplier', stats.maxHp === Math.round(rawHp * 1.25));

  game.state.inventory.splice(0, game.state.inventory.length, ...emberItems);
  game.autoEquipBest();
  ok('autoEquipBest fills all three slots for the active hero', ['weapon', 'armor', 'relic'].every(slot => game.state.heroes.aria.equipment[slot]));
  ok('autoEquipBest consumes equipped inventory entries', game.state.inventory.length === 0);
}

/* =====================================================================
 * 4. Dungeon progression unlocks new heroes
 * ===================================================================== */
group('4. Dungeon progression and unlocks');
{
  const { game } = createSandbox();
  game.state.roomIndex = 1;
  game.state.monsterHp = game.CONFIG.DUNGEONS[1].hp;
  ok('Mira starts locked before Bone Hall clear', game.state.heroes.mira.unlocked === false);
  game.clearRoom();
  ok('clearing Bone Hall unlocks Mira', game.state.heroes.mira.unlocked === true);
  ok('newly unlocked hero is dispatched immediately', game.state.heroes.mira.dispatched === true);
  ok('room advances after non-boss clear', game.state.roomIndex === 2 && game.state.monsterHp === game.CONFIG.DUNGEONS[2].hp);
}

/* =====================================================================
 * 5. Settlement and localStorage best-score persistence
 * ===================================================================== */
group('5. Settlement and localStorage persistence');
{
  const { game, elements, localStorage } = createSandbox({ now: 10_000 });
  game.state.roomIndex = game.CONFIG.DUNGEONS.length - 1;
  game.state.gold = 500;
  game.state.kills = 5;
  game.state.startTs = 10_000;
  game.computeScore(true);

  const expectedScore = game.computeScore(true);
  game.endGame(true, 'test victory');
  const saved = JSON.parse(localStorage.getItem('idle_dungeon_heroes_best'));
  ok('victory marks game finished and victorious', game.state.finished === true && game.state.victory === true);
  ok('victory score is computed and shown', game.state.score === expectedScore && elements.resultScore.textContent === String(expectedScore));
  ok('victory persists games/wins/highest room', saved.gamesPlayed === 1 && saved.wins === 1 && saved.highestRoom === 6);
  ok('victory persists best score and clear time', saved.bestScore === expectedScore && saved.bestClearTimeSec === 0);
  ok('victory result modal shows replay affordance', elements.resultModal.hidden === false && elements.restartBtn.focused === true);

  game.endGame(true, 'second call should be ignored');
  const afterSecondCall = JSON.parse(localStorage.getItem('idle_dungeon_heroes_best'));
  ok('endGame is idempotent after finish', afterSecondCall.gamesPlayed === 1 && afterSecondCall.wins === 1);
}

{
  const existingBest = { bestScore: 9999, bestClearTimeSec: 42, gamesPlayed: 2, wins: 1, highestRoom: 4 };
  const { game, elements, localStorage } = createSandbox({ now: 50_000, best: existingBest });
  game.state.roomIndex = 2;
  game.state.startTs = 20_000;
  game.endGame(false, 'test failure');
  const saved = JSON.parse(localStorage.getItem('idle_dungeon_heroes_best'));
  ok('failure marks game finished without victory', game.state.finished === true && game.state.victory === false);
  ok('failure increments games but not wins', saved.gamesPlayed === 3 && saved.wins === 1);
  ok('failure preserves higher historical best score', saved.bestScore === existingBest.bestScore);
  ok('failure result title is clear', elements.resultTitle.textContent === '远征失败');
}

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  console.error(failures.map(item => ` - ${item}`).join('\n'));
  process.exit(1);
}
console.log(`\nAll ${passed} behavior checks passed.`);
