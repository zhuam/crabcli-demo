/* ===== Idle Dungeon Heroes · app.js =====
 * Game 094: idle/RPG short session. Heroes auto-clear a six-room dungeon.
 */
(() => {
  'use strict';

  const CONFIG = {
    MAX_GAME_SEC: 180,
    TICK_HZ: 8,
    AUTO_DISPATCH_MS: 900,
    DUNGEONS: [
      { id: 'gate', name: 'Goblin Gate', glyph: 'G', hp: 58, atk: 4, gold: 28, unlock: null },
      { id: 'hall', name: 'Bone Hall', glyph: 'B', hp: 92, atk: 6, gold: 42, unlock: 'mira' },
      { id: 'nest', name: 'Spider Nest', glyph: 'S', hp: 136, atk: 8, gold: 58, unlock: null },
      { id: 'vault', name: 'Ogre Vault', glyph: 'O', hp: 204, atk: 12, gold: 82, unlock: 'bronn' },
      { id: 'crypt', name: 'Rune Crypt', glyph: 'R', hp: 278, atk: 15, gold: 108, unlock: null },
      { id: 'shrine', name: 'Dragon Shrine', glyph: 'D', hp: 390, atk: 20, gold: 150, unlock: null, boss: true }
    ],
    HEROES: [
      { id: 'aria', name: 'Aria', role: '剑士', icon: 'A', baseAtk: 15, baseHp: 105, unlockRoom: 0 },
      { id: 'mira', name: 'Mira', role: '游侠', icon: 'M', baseAtk: 18, baseHp: 78, unlockRoom: 2 },
      { id: 'bronn', name: 'Bronn', role: '守护', icon: 'B', baseAtk: 11, baseHp: 145, unlockRoom: 4 }
    ],
    EQUIPMENT: [
      { id: 'ember-sword', name: '余烬长剑', slot: 'weapon', set: 'ember', atk: 9, hp: 0, rarity: 'rare', power: 9 },
      { id: 'ember-mail', name: '余烬铠甲', slot: 'armor', set: 'ember', atk: 0, hp: 36, rarity: 'rare', power: 7 },
      { id: 'ember-ring', name: '余烬戒指', slot: 'relic', set: 'ember', atk: 5, hp: 18, rarity: 'rare', power: 8 },
      { id: 'moon-bow', name: '月影短弓', slot: 'weapon', set: 'moon', atk: 12, hp: 0, rarity: 'epic', power: 12 },
      { id: 'moon-cloak', name: '月影披风', slot: 'armor', set: 'moon', atk: 3, hp: 30, rarity: 'epic', power: 10 },
      { id: 'dragon-charm', name: '龙心护符', slot: 'relic', set: 'dragon', atk: 8, hp: 28, rarity: 'legend', power: 14 }
    ]
  };

  const LS = {
    BEST: 'idle_dungeon_heroes_best',
    SETTINGS: 'idle_dungeon_heroes_settings'
  };

  const $ = id => document.getElementById(id);
  const els = {
    roomDisplay: $('roomDisplay'), timerDisplay: $('timerDisplay'), goldDisplay: $('goldDisplay'), bestDisplay: $('bestDisplay'),
    muteBtn: $('muteBtn'), dispatchBtn: $('dispatchBtn'), roomTrack: $('roomTrack'), partyList: $('partyList'), partyPower: $('partyPower'),
    monsterStage: $('monsterStage'), monsterTimer: $('monsterTimer'), monsterName: $('monsterName'), monsterFigure: $('monsterFigure'),
    monsterHpBar: $('monsterHpBar'), monsterHpText: $('monsterHpText'), damageFloat: $('damageFloat'), lootList: $('lootList'),
    miniProgress: $('miniProgress'), upgradeList: $('upgradeList'), autoEquipBtn: $('autoEquipBtn'), battleLog: $('battleLog'),
    resultModal: $('resultModal'), resultBadge: $('resultBadge'), resultTitle: $('resultTitle'), resultCopy: $('resultCopy'), resultScore: $('resultScore'),
    resultRoom: $('resultRoom'), resultTime: $('resultTime'), resultBest: $('resultBest'), newBestText: $('newBestText'), restartBtn: $('restartBtn'), toast: $('toast')
  };

  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  let best = lsGet(LS.BEST, { bestScore: 0, bestClearTimeSec: null, gamesPlayed: 0, wins: 0, highestRoom: 1 });
  let settings = lsGet(LS.SETTINGS, { sfx: true, haptic: true });
  let audioCtx = null;
  let lastTs = 0;
  let accumulator = 0;
  let rafId = null;

  const state = makeInitialState();

  function makeInitialState() {
    const heroes = {};
    CONFIG.HEROES.forEach(h => {
      heroes[h.id] = { ...h, level: 1, xp: 0, hp: h.baseHp, dispatched: h.unlockRoom === 0, unlocked: h.unlockRoom === 0, equipment: { weapon: null, armor: null, relic: null } };
    });
    return {
      startTs: Date.now(), finished: false, victory: false, roomIndex: 0, monsterHp: CONFIG.DUNGEONS[0].hp,
      gold: 35, score: 0, kills: 0, selectedHeroId: 'aria', selectedEquipId: null, inventory: [makeDrop(0), makeDrop(1)], heroes,
      log: ['Aria 已自动派遣，副本开始。'], lastMonsterHit: 0
    };
  }

  function makeDrop(seed) {
    const base = CONFIG.EQUIPMENT[seed % CONFIG.EQUIPMENT.length];
    return { ...base, uid: `${base.id}-${Date.now()}-${Math.floor(Math.random() * 9999)}` };
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function gameSec() { return (Date.now() - state.startTs) / 1000; }
  function remainingSec() { return Math.max(0, CONFIG.MAX_GAME_SEC - gameSec()); }
  function currentRoom() { return CONFIG.DUNGEONS[state.roomIndex]; }
  function selectedHero() { return state.heroes[state.selectedHeroId] || state.heroes.aria; }

  function heroStats(hero) {
    const items = Object.values(hero.equipment).filter(Boolean);
    const setCounts = countSets(hero);
    const setAtkMult = Object.values(setCounts).some(n => n >= 2) ? 1.2 : 1;
    const setHpMult = Object.values(setCounts).some(n => n >= 3) ? 1.25 : 1;
    const itemAtk = items.reduce((sum, item) => sum + item.atk, 0);
    const itemHp = items.reduce((sum, item) => sum + item.hp, 0);
    return {
      atk: Math.round((hero.baseAtk + (hero.level - 1) * 6 + itemAtk) * setAtkMult),
      maxHp: Math.round((hero.baseHp + (hero.level - 1) * 24 + itemHp) * setHpMult),
      setPieces: items.length,
      setBonus: setAtkMult > 1 || setHpMult > 1
    };
  }
  function countSets(hero) {
    return Object.values(hero.equipment).filter(Boolean).reduce((acc, item) => {
      acc[item.set] = (acc[item.set] || 0) + 1;
      return acc;
    }, {});
  }
  function party() { return Object.values(state.heroes).filter(h => h.unlocked && h.dispatched); }
  function partyPower() { return party().reduce((sum, h) => sum + heroStats(h).atk, 0); }
  function levelCost(hero) { return 35 + hero.level * hero.level * 24; }

  function ensureAudio() {
    if (!settings.sfx) return null;
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, dur = 0.08, type = 'sine', gain = 0.045) {
    const ctx = ensureAudio(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    vol.gain.setValueAtTime(0.0001, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(vol).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
  }
  function playSfx(name) {
    const map = {
      dispatch: () => { tone(330, .08, 'triangle'); setTimeout(() => tone(495, .09, 'triangle'), 60); },
      hit: () => tone(140, .04, 'square', .025),
      equip: () => { tone(620, .06, 'triangle'); setTimeout(() => tone(820, .06, 'sine'), 55); },
      level: () => { tone(520, .07, 'sine'); setTimeout(() => tone(780, .11, 'sine'), 70); },
      win: () => { [440, 660, 880].forEach((f, i) => setTimeout(() => tone(f, .13, 'triangle'), i * 90)); },
      fail: () => { tone(160, .2, 'sawtooth', .035); setTimeout(() => tone(95, .22, 'sawtooth', .03), 130); },
      deny: () => tone(90, .08, 'square', .03)
    };
    (map[name] || map.hit)();
  }
  function vibrate(pattern) {
    if (settings.haptic && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }

  function log(msg) {
    state.log.unshift(msg);
    state.log = state.log.slice(0, 8);
  }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { els.toast.hidden = true; }, 1800);
  }

  function dispatchHero(id = state.selectedHeroId) {
    const hero = state.heroes[id];
    if (!hero || !hero.unlocked) { deny('英雄尚未解锁'); return; }
    if (!hero.dispatched) log(`${hero.name} 加入远征。`);
    hero.dispatched = true;
    hero.hp = Math.max(hero.hp, Math.ceil(heroStats(hero).maxHp * 0.7));
    state.selectedHeroId = id;
    playSfx('dispatch'); vibrate(18); render();
  }
  function upgradeHero(id = state.selectedHeroId) {
    const hero = state.heroes[id];
    if (!hero || !hero.unlocked) return deny('先解锁英雄');
    const cost = levelCost(hero);
    if (state.gold < cost) return deny(`金币不足，还差 ${cost - state.gold}`);
    state.gold -= cost;
    hero.level += 1;
    hero.hp = heroStats(hero).maxHp;
    log(`${hero.name} 升到 Lv.${hero.level}。`);
    playSfx('level'); vibrate([15, 20, 15]); render();
  }
  function deny(msg) {
    toast(msg); playSfx('deny'); vibrate(45);
    const card = document.querySelector(`[data-hero-id="${state.selectedHeroId}"]`);
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
  }

  function equipItem(uid, heroId = state.selectedHeroId) {
    const idx = state.inventory.findIndex(item => item.uid === uid);
    const hero = state.heroes[heroId];
    if (idx < 0 || !hero || !hero.unlocked) return deny('装备目标无效');
    const item = state.inventory[idx];
    const old = hero.equipment[item.slot];
    hero.equipment[item.slot] = item;
    state.inventory.splice(idx, 1);
    if (old) state.inventory.push(old);
    const maxHp = heroStats(hero).maxHp;
    hero.hp = Math.min(maxHp, hero.hp + item.hp + 10);
    state.selectedHeroId = heroId;
    state.selectedEquipId = null;
    log(`${hero.name} 装备 ${item.name}。`);
    playSfx('equip'); vibrate(22); render();
  }
  function autoEquipBest() {
    if (!state.inventory.length) return deny('还没有掉落装备');
    const heroes = party().length ? party() : Object.values(state.heroes).filter(h => h.unlocked);
    state.inventory.slice().sort((a, b) => b.power - a.power).forEach(item => {
      const target = heroes.slice().sort((a, b) => equippedPower(a, item.slot) - equippedPower(b, item.slot))[0];
      if (target && state.inventory.some(x => x.uid === item.uid)) equipItem(item.uid, target.id);
    });
  }
  function equippedPower(hero, slot) { return hero.equipment[slot]?.power || 0; }

  function combatTick(dt) {
    if (state.finished) return;
    if (gameSec() >= CONFIG.MAX_GAME_SEC) return endGame(false, '时间耗尽，远征失败。');
    if (!party().length) return;

    const dps = Math.max(1, partyPower());
    const damage = dps * dt;
    state.monsterHp -= damage;
    state.lastMonsterHit += damage;
    if (state.lastMonsterHit >= 12) {
      els.damageFloat.textContent = `-${Math.round(state.lastMonsterHit)}`;
      els.damageFloat.hidden = false;
      clearTimeout(combatTick._dmgTimer);
      combatTick._dmgTimer = setTimeout(() => { els.damageFloat.hidden = true; }, 420);
      state.lastMonsterHit = 0;
      playSfx('hit');
    }

    const room = currentRoom();
    party().forEach(hero => {
      const stats = heroStats(hero);
      hero.hp = Math.max(0, hero.hp - (room.atk * dt / party().length));
      if (hero.hp <= 0 && hero.dispatched) {
        hero.dispatched = false;
        log(`${hero.name} 倒下了。`);
        vibrate(40);
      } else if (hero.hp > stats.maxHp) hero.hp = stats.maxHp;
    });
    if (!party().length) return endGame(false, '队伍全员倒下，远征失败。');
    if (state.monsterHp <= 0) clearRoom();
  }

  function clearRoom() {
    const room = currentRoom();
    state.kills += 1;
    state.gold += room.gold;
    const drop = makeDrop(state.roomIndex + state.kills);
    state.inventory.push(drop);
    log(`击败 ${room.name}，获得 ${room.gold} 金币与 ${drop.name}。`);
    if (room.unlock) {
      const hero = state.heroes[room.unlock];
      hero.unlocked = true;
      hero.dispatched = true;
      hero.hp = heroStats(hero).maxHp;
      log(`新英雄 ${hero.name} 已解锁并自动派遣！`);
      toast(`新英雄 ${hero.name} 加入远征`);
    }
    playSfx(room.boss ? 'win' : 'equip');
    vibrate(room.boss ? [35, 35, 70] : [18, 18, 18]);
    if (state.roomIndex >= CONFIG.DUNGEONS.length - 1) return endGame(true, '副本通关！英雄小队带着闪亮套装凯旋。');
    state.roomIndex += 1;
    state.monsterHp = currentRoom().hp;
    party().forEach(hero => { hero.hp = Math.min(heroStats(hero).maxHp, hero.hp + 24); });
    render();
  }

  function computeScore(victory) {
    const progress = (state.roomIndex + (victory ? 1 : 0)) * 1000;
    const timeBonus = Math.floor(remainingSec() * 18);
    const setBonus = Object.values(state.heroes).reduce((sum, h) => sum + heroStats(h).setPieces * 80 + (heroStats(h).setBonus ? 220 : 0), 0);
    return Math.max(0, progress + timeBonus + setBonus + state.gold + state.kills * 180);
  }
  function endGame(victory, copy) {
    if (state.finished) return;
    state.finished = true;
    state.victory = victory;
    state.score = computeScore(victory);
    best.gamesPlayed += 1;
    if (victory) best.wins += 1;
    best.highestRoom = Math.max(best.highestRoom || 1, Math.min(CONFIG.DUNGEONS.length, state.roomIndex + (victory ? 1 : 0)));
    const clearSec = Math.floor(gameSec());
    if (victory && (best.bestClearTimeSec == null || clearSec < best.bestClearTimeSec)) best.bestClearTimeSec = clearSec;
    const newBest = state.score > (best.bestScore || 0);
    if (newBest) best.bestScore = state.score;
    lsSet(LS.BEST, best);
    playSfx(victory ? 'win' : 'fail');
    vibrate(victory ? [45, 30, 80] : [120]);
    showResult(victory, copy, newBest);
  }

  function showResult(victory, copy, newBest) {
    els.resultBadge.textContent = victory ? '🏆' : '💀';
    els.resultTitle.textContent = victory ? '副本通关！' : '远征失败';
    els.resultCopy.textContent = copy;
    els.resultScore.textContent = String(state.score);
    els.resultRoom.textContent = `${Math.min(CONFIG.DUNGEONS.length, state.roomIndex + (victory ? 1 : 0))} / ${CONFIG.DUNGEONS.length}`;
    els.resultTime.textContent = fmtTime(gameSec());
    els.resultBest.textContent = String(best.bestScore || 0);
    els.newBestText.hidden = !newBest;
    els.resultModal.hidden = false;
    els.restartBtn.focus();
  }

  function restartGame() {
    Object.assign(state, makeInitialState());
    best = lsGet(LS.BEST, best);
    els.resultModal.hidden = true;
    lastTs = 0; accumulator = 0;
    playSfx('dispatch'); vibrate(20);
    render();
  }

  function render() {
    const room = currentRoom();
    els.roomDisplay.textContent = `第 ${state.roomIndex + 1} / ${CONFIG.DUNGEONS.length} 层`;
    els.timerDisplay.textContent = fmtTime(remainingSec());
    els.goldDisplay.textContent = String(Math.floor(state.gold));
    els.bestDisplay.textContent = String(best.bestScore || 0);
    els.partyPower.textContent = `战力 ${partyPower()}`;
    els.monsterStage.textContent = room.boss ? 'Boss Room' : `Room ${state.roomIndex + 1}`;
    els.monsterTimer.textContent = `${Math.ceil(remainingSec())}s`;
    els.monsterName.textContent = room.name;
    els.monsterFigure.textContent = room.glyph;
    const maxHp = room.hp;
    const hp = Math.max(0, state.monsterHp);
    els.monsterHpBar.style.width = `${Math.max(0, Math.min(100, hp / maxHp * 100))}%`;
    els.monsterHpText.textContent = `HP ${Math.ceil(hp)} / ${maxHp}`;
    renderRooms(); renderHeroes(); renderLoot(); renderUpgrades(); renderLog();
  }
  function renderRooms() {
    els.roomTrack.innerHTML = CONFIG.DUNGEONS.map((room, i) => `<div class="room ${room.boss ? 'boss' : ''} ${i < state.roomIndex ? 'done' : ''} ${i === state.roomIndex ? 'active' : ''}"><strong>${i + 1}. ${room.name}</strong><span>${room.boss ? 'Boss' : 'Auto battle'} · HP ${room.hp}</span></div>`).join('');
    els.miniProgress.innerHTML = CONFIG.DUNGEONS.map((_, i) => `<span class="${i <= state.roomIndex ? 'on' : ''}"></span>`).join('');
  }
  function renderHeroes() {
    els.partyList.innerHTML = CONFIG.HEROES.map(h0 => {
      const h = state.heroes[h0.id];
      const stats = heroStats(h);
      const hpPct = h.unlocked ? Math.max(0, Math.min(100, h.hp / stats.maxHp * 100)) : 0;
      const eq = ['weapon', 'armor', 'relic'].map(slot => h.equipment[slot]?.name || slot).join(' · ');
      return `<div class="hero-token ${h.id === state.selectedHeroId ? 'selected' : ''} ${h.unlocked ? '' : 'locked'}" data-hero-id="${h.id}" tabindex="0" role="button" aria-label="选择 ${h.name}">
        <div class="avatar">${h.icon}</div><div><h3>${h.name} · ${h.role} Lv.${h.level}</h3>
        <p>${h.unlocked ? (h.dispatched ? '远征中' : '可派遣') : `第 ${h.unlockRoom} 层后解锁`} · ATK ${stats.atk}</p>
        <div class="bar"><i style="width:${hpPct}%"></i></div><div class="equip-line">${eq}</div></div></div>`;
    }).join('');
    els.partyList.querySelectorAll('[data-hero-id]').forEach(card => {
      const id = card.dataset.heroId;
      card.addEventListener('click', () => onHeroSelect(id));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeroSelect(id); } });
      card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drop-target'); });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', e => { e.preventDefault(); card.classList.remove('drop-target'); equipItem(e.dataTransfer.getData('text/plain'), id); });
      card.addEventListener('pointerup', () => { if (state.selectedEquipId) equipItem(state.selectedEquipId, id); });
    });
  }
  function onHeroSelect(id) {
    const hero = state.heroes[id];
    state.selectedHeroId = id;
    if (!hero.unlocked) return deny('这个英雄还在酒馆路上');
    if (state.selectedEquipId) equipItem(state.selectedEquipId, id);
    else dispatchHero(id);
  }
  function renderLoot() {
    els.lootList.innerHTML = state.inventory.length ? state.inventory.map(item => `<div class="loot-card ${item.uid === state.selectedEquipId ? 'selected' : ''}" draggable="true" data-equip-id="${item.uid}" tabindex="0" role="button" aria-label="选择装备 ${item.name}"><h3>${item.name}</h3><p>${item.rarity} · ${item.slot} · ${item.set} 套装</p><p>ATK +${item.atk} · HP +${item.hp}</p></div>`).join('') : '<div class="loot-card empty">击败怪物后掉落装备</div>';
    els.lootList.querySelectorAll('[data-equip-id]').forEach(card => {
      const uid = card.dataset.equipId;
      card.addEventListener('click', () => { state.selectedEquipId = state.selectedEquipId === uid ? null : uid; renderLoot(); toast('选择英雄即可装备'); });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selectedEquipId = uid; equipItem(uid, state.selectedHeroId); } });
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', uid); state.selectedEquipId = uid; });
      card.addEventListener('pointerdown', () => { state.selectedEquipId = uid; });
    });
  }
  function renderUpgrades() {
    els.upgradeList.innerHTML = CONFIG.HEROES.map(h0 => {
      const h = state.heroes[h0.id];
      const cost = levelCost(h);
      return `<div class="upgrade-row"><div><strong>${h.name} Lv.${h.level}</strong><span>${h.unlocked ? `攻击 ${heroStats(h).atk} → ${heroStats({ ...h, level: h.level + 1 }).atk}` : `第 ${h.unlockRoom} 层解锁`}</span></div><button data-upgrade-id="${h.id}" ${!h.unlocked || state.gold < cost ? 'disabled' : ''}>升级 ${cost}</button></div>`;
    }).join('');
    els.upgradeList.querySelectorAll('[data-upgrade-id]').forEach(btn => btn.addEventListener('click', () => upgradeHero(btn.dataset.upgradeId)));
  }
  function renderLog() {
    els.battleLog.innerHTML = state.log.map(item => `<li>${item}</li>`).join('');
  }

  function bindInputs() {
    els.dispatchBtn.addEventListener('click', () => dispatchHero());
    els.autoEquipBtn.addEventListener('click', autoEquipBest);
    els.restartBtn.addEventListener('click', restartGame);
    els.muteBtn.addEventListener('click', () => {
      settings.sfx = !settings.sfx;
      lsSet(LS.SETTINGS, settings);
      els.muteBtn.textContent = settings.sfx ? '🔊 音效' : '🔇 静音';
      els.muteBtn.setAttribute('aria-pressed', String(!settings.sfx));
      if (settings.sfx) playSfx('equip');
    });
    document.addEventListener('keydown', e => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (state.finished && (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'r')) { e.preventDefault(); restartGame(); return; }
      if (e.key >= '1' && e.key <= '3') { const h = CONFIG.HEROES[Number(e.key) - 1]; if (h) onHeroSelect(h.id); }
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); if (state.selectedEquipId) equipItem(state.selectedEquipId); else autoEquipBest(); }
      if (e.key.toLowerCase() === 'u' || e.key === 'Enter') { e.preventDefault(); upgradeHero(); }
      if (e.code === 'Space') { e.preventDefault(); dispatchHero(); }
      if (e.key.toLowerCase() === 'r') restartGame();
    });
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.2, (ts - lastTs) / 1000);
    lastTs = ts;
    accumulator += dt;
    const step = 1 / CONFIG.TICK_HZ;
    while (accumulator >= step) { combatTick(step); accumulator -= step; }
    render();
    rafId = requestAnimationFrame(loop);
  }

  function boot() {
    bindInputs();
    els.muteBtn.textContent = settings.sfx ? '🔊 音效' : '🔇 静音';
    setTimeout(() => { if (!state.finished && !party().length) dispatchHero('aria'); }, CONFIG.AUTO_DISPATCH_MS);
    render();
    rafId = requestAnimationFrame(loop);
  }

  boot();
  window.__idleDungeonHeroes = { CONFIG, state, restartGame, dispatchHero, upgradeHero, equipItem, autoEquipBest, computeScore };
})();
