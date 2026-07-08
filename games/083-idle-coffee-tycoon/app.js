/* ===== Idle Coffee Tycoon · app.js =====
 * 放置/经营 · 全图开店通关 · 单局 ≤ 3 分钟
 * Design: cafe design system (#5D4432 + #E9E3DD)
 * Issue #83
 */
(() => {
  'use strict';

  // ============= CONFIG =============
  const CONFIG = {
    MAX_GAME_SEC: 180,            // 3 分钟兜底
    COST_GROWTH: 1.15,
    TICK_HZ: 10,
    CLICK_BASE: 1,

    MACHINES: [
      { id: 'pour-over',   name: '手冲壶',     icon: '☕', cost: 0,     clickBonus: 1,   autoProd: 0,   desc: '初始装备 · 点击 +$1', owned: true },
      { id: 'espresso',    name: '意式咖啡机',  icon: '☕', cost: 500,   clickBonus: 5,   autoProd: 2,   desc: '点击 +$5 · 自动 +2/s' },
      { id: 'roaster',     name: '商用烘焙机',  icon: '🏭', cost: 5000,  clickBonus: 0,   autoProd: 15,  desc: '自动 +15/s · 解锁第二城市' },
      { id: 'robot',       name: '全自动咖啡机器人', icon: '🔮', cost: 50000, clickBonus: 0, autoProd: 80, desc: '产出 ×3 · 需解锁第三城市',
        unlockRequires: 'harbour' }
    ],

    EMPLOYEES: [
      { id: 'trainee',   name: '见习咖啡师', icon: '🧑‍🍳', baseCost: 200,    baseProd: 1,   unlockAt: 0,       desc: '自动产出 +1/s' },
      { id: 'senior',    name: '资深咖啡师', icon: '👩‍🍳', baseCost: 2000,   baseProd: 8,   unlockAt: 2,       desc: '自动产出 +8/s' },
      { id: 'manager',   name: '店长',       icon: '👔',   baseCost: 20000,  baseProd: 60,  unlockAt: 5,       desc: '自动产出 +60/s' },
      { id: 'regional',  name: '区域经理',   icon: '💼',   baseCost: 200000, baseProd: 500, unlockAt: 'harbour', desc: '自动产出 +500/s',
        unlockRequires: 'harbour' }
    ],

    CITIES: [
      {
        id: 'downtown', name: '市中心', icon: '📍',
        stores: [
          { id: 'kiosk',     name: '街角咖啡摊',  cost: 0,     income: 10 },
          { id: 'cafe',      name: '精品咖啡店',   cost: 800,   income: 60 },
          { id: 'roastery',  name: '烘焙工坊',     cost: 6000,  income: 400 }
        ],
        unlockCondition: null // 起点
      },
      {
        id: 'riverside', name: '滨江新区', icon: '🌊',
        stores: [
          { id: 'rv-cafe',    name: '河景咖啡馆',   cost: 30000,  income: 1500 },
          { id: 'rv-drive',   name: '汽车咖啡站',   cost: 100000, income: 5000 },
          { id: 'rv-flagship',name: '滨江旗舰店',   cost: 400000, income: 20000 }
        ],
        unlockCondition: { type: 'stores', count: 3, city: 'downtown' }
      },
      {
        id: 'harbour', name: '港湾新城', icon: '⚓',
        stores: [
          { id: 'hb-espresso', name: '港景浓缩吧',   cost: 800000,  income: 50000 },
          { id: 'hb-cafe',     name: '港湾咖啡馆',   cost: 2000000, income: 150000 },
          { id: 'hb-roast',    name: '码头烘焙厂',   cost: 5000000, income: 500000 }
        ],
        unlockCondition: { type: 'stores', count: 6, city: 'riverside' }
      },
      {
        id: 'skycity', name: '云端都会', icon: '☁️',
        stores: [
          { id: 'sc-cloud',    name: '云巅咖啡屋',   cost: 8000000,  income: 300000 },
          { id: 'sc-tower',    name: '摩天旗舰店',   cost: 20000000, income: 1000000 },
          { id: 'sc-empire',   name: '咖啡帝国总部', cost: 50000000, income: 5000000 }
        ],
        unlockCondition: { type: 'stores', count: 9, city: 'harbour' }
      }
    ],

    DRINKS: [
      { id: 'espresso',  name: '浓缩咖啡', icon: '☕', cost: 100,    mult: 2,   unlockCity: 'downtown', desc: '产出 ×2' },
      { id: 'latte',     name: '拿铁',     icon: '🥛', cost: 2000,   mult: 2,   unlockCity: 'downtown', desc: '产出 ×2' },
      { id: 'frappe',    name: '星冰乐',   icon: '🧊', cost: 50000,  mult: 3,   unlockCity: 'riverside', desc: '产出 ×3' },
      { id: 'cold-brew', name: '冷萃咖啡', icon: '🧉', cost: 500000, mult: 2.5, unlockCity: 'harbour', desc: '产出 ×2.5' }
    ]
  };

  // ============= STATE =============
  const state = {
    cash: 50,
    totalEarned: 0,
    coffeesMade: 0,
    machines: {},      // id -> bool
    employees: {},     // id -> count
    stores: {},        // storeId -> bool
    drinks: {},        // id -> bool
    startTs: Date.now(),
    finished: false,
    victory: false,
    offlineCollected: false,
    settings: { sfx: true, haptic: true }
  };
  CONFIG.MACHINES.forEach(m => state.machines[m.id] = !!m.owned);
  CONFIG.EMPLOYEES.forEach(e => state.employees[e.id] = 0);
  CONFIG.DRINKS.forEach(d => state.drinks[d.id] = false);
  // owned stores
  CONFIG.CITIES.forEach(c => c.stores.forEach(s => {
    if (s.cost === 0) state.stores[s.id] = true;
  }));

  // ============= STORAGE =============
  const LS = {
    BEST: 'idle_coffee_best',
    SETTINGS: 'idle_coffee_settings',
    LAST_SEEN: 'idle_coffee_last_seen'
  };
  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }
  let best = lsGet(LS.BEST, { fastestSec: null, maxEarn: 0, gamesPlayed: 0, wins: 0, maxStores: 0, maxCities: 0 });
  const savedSettings = lsGet(LS.SETTINGS, null);
  if (savedSettings) Object.assign(state.settings, savedSettings);

  // ============= HELPERS =============
  function fmtMoney(n) {
    if (n < 1000) return '$' + n.toFixed(n < 10 ? 2 : 0);
    if (n < 1e6) return '$' + (n / 1000).toFixed(2) + 'K';
    if (n < 1e9) return '$' + (n / 1e6).toFixed(2) + 'M';
    return '$' + (n / 1e9).toFixed(2) + 'B';
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + s.toString().padStart(2, '0');
  }
  function gameSec() { return (Date.now() - state.startTs) / 1000; }

  function employeeCost(emp, count) {
    return Math.ceil(emp.baseCost * Math.pow(CONFIG.COST_GROWTH, count));
  }

  // ============= CORE ECONOMY =============
  function computeIncomePerSec() {
    let base = 0;
    // Machines auto prod
    CONFIG.MACHINES.forEach(m => {
      if (state.machines[m.id]) base += m.autoProd;
    });
    // Employees
    CONFIG.EMPLOYEES.forEach(e => {
      base += (state.employees[e.id] || 0) * e.baseProd;
    });
    // Stores income
    CONFIG.CITIES.forEach(c => c.stores.forEach(s => {
      if (state.stores[s.id]) base += s.income;
    }));
    // Drink multipliers
    let mult = 1;
    CONFIG.DRINKS.forEach(d => { if (state.drinks[d.id]) mult *= d.mult; });
    // Robot machine multiplier
    if (state.machines['robot']) mult *= 3;
    return base * mult;
  }

  function computeClickValue() {
    let val = CONFIG.CLICK_BASE;
    CONFIG.MACHINES.forEach(m => {
      if (state.machines[m.id]) val += m.clickBonus;
    });
    let mult = 1;
    CONFIG.DRINKS.forEach(d => { if (state.drinks[d.id]) mult *= d.mult; });
    if (state.machines['robot']) mult *= 3;
    return val * mult;
  }

  function ownedStoreCount() {
    let count = 0;
    CONFIG.CITIES.forEach(c => c.stores.forEach(s => { if (state.stores[s.id]) count++; }));
    return count;
  }

  function totalStoreCount() {
    let count = 0;
    CONFIG.CITIES.forEach(c => count += c.stores.length);
    return count;
  }

  function isCityUnlocked(city) {
    if (!city.unlockCondition) return true;
    if (city.unlockCondition.type === 'stores') {
      return ownedStoreCount() >= city.unlockCondition.count;
    }
    return false;
  }

  function isStoreBuyable(store, city) {
    if (state.stores[store.id]) return false;
    if (!isCityUnlocked(city)) return false;
    // Check if previous store in same city is owned
    const cityStores = city.stores;
    const idx = cityStores.indexOf(store);
    if (idx > 0 && !state.stores[cityStores[idx - 1].id]) return false;
    return true;
  }

  function isMachineBuyable(machine) {
    if (state.machines[machine.id]) return false;
    if (machine.cost === 0) return true;
    if (machine.unlockRequires) {
      const city = CONFIG.CITIES.find(c => c.id === machine.unlockRequires);
      if (city && !isCityUnlocked(city)) return false;
    }
    return true;
  }

  function isEmployeeBuyable(emp) {
    if (emp.unlockRequires) {
      const city = CONFIG.CITIES.find(c => c.id === emp.unlockRequires);
      if (city && !isCityUnlocked(city)) return false;
    }
    if (typeof emp.unlockAt === 'number' && state.totalEarned < emp.unlockAt) return false;
    return true;
  }

  function getDrinkUnlockProgress() {
    let unlocked = 0;
    CONFIG.DRINKS.forEach(d => { if (state.drinks[d.id]) unlocked++; });
    return { unlocked, total: CONFIG.DRINKS.length };
  }

  function getProgressPct() {
    const total = totalStoreCount();
    const owned = ownedStoreCount();
    return total > 0 ? (owned / total) * 100 : 0;
  }

  // ============= AUDIO =============
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  let lastSfx = 0;
  function playTone(freq, duration = 0.08, type = 'sine', vol = 0.18) {
    if (!state.settings.sfx) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = performance.now();
    if (now - lastSfx < 30) return;
    lastSfx = now;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }
  function sfxSell()    { playTone(1047, 0.05, 'square', 0.10); }
  function sfxCoin()    { playTone(660, 0.04, 'triangle', 0.07); }
  function sfxUpgrade() { playTone(523, 0.08, 'sine', 0.18); setTimeout(() => playTone(784, 0.10, 'sine', 0.18), 70); }
  function sfxFanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sine', 0.22), i * 110));
  }
  function sfxChime()   { playTone(660, 0.08, 'sine', 0.15); setTimeout(() => playTone(880, 0.10, 'sine', 0.15), 80); setTimeout(() => playTone(1047, 0.14, 'sine', 0.18), 160); }
  function sfxError()   { playTone(200, 0.12, 'sawtooth', 0.10); setTimeout(() => playTone(160, 0.18, 'sawtooth', 0.10), 100); }

  function vibrate(pattern) {
    if (!state.settings.haptic) return;
    if (navigator.vibrate) try { navigator.vibrate(pattern); } catch {}
  }

  // ============= DOM REFS =============
  const $ = id => document.getElementById(id);
  const moneyDisplay    = $('moneyDisplay');
  const timerDisplay    = $('timerDisplay');
  const bestDisplay     = $('bestDisplay');
  const brewBtn         = $('brewBtn');
  const brewEarn        = $('brewEarn');
  const cpsDisplay      = $('cpsDisplay');
  const sceneMoney      = $('sceneMoney');
  const sceneLevel      = $('sceneLevel');
  const storeCount      = $('storeCount');
  const storeTotal      = $('storeTotal');
  const progressFill    = $('progressFill');
  const progressLabel   = $('progressLabel');
  const toastEl         = $('toast');
  const muteBtn         = $('muteBtn');
  const muteIcon        = $('muteIcon');
  const kbdHint         = $('kbdHint');
  const offlineOverlay  = $('offlineOverlay');
  const offlineAmount   = $('offlineAmount');
  const collectBtn      = $('collectBtn');
  const endModal        = $('endModal');
  const endIcon         = $('endIcon');
  const endTitle        = $('endTitle');
  const endSub          = $('endSub');
  const endEarn         = $('endEarn');
  const endTime         = $('endTime');
  const endStores       = $('endStores');
  const endCities       = $('endCities');
  const newBestRow      = $('newBestRow');
  const restartBtn      = $('restartBtn');

  // ============= TAB SWITCHING =============
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = {
    machines:  $('panel-machines'),
    staff:     $('panel-staff'),
    expansion: $('panel-expansion')
  };
  function switchTab(id) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === id);
      b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false');
    });
    Object.entries(panels).forEach(([k, el]) => {
      el.classList.toggle('active', k === id);
    });
    renderTabs();
    announce(`已切换到 ${id === 'machines' ? '咖啡机' : id === 'staff' ? '员工' : '扩张'}面板`);
  }
  tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // ============= TOAST =============
  let toastTimer;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
  }

  // ============= FLOATING EARN TEXT =============
  function createFloatEarn(x, y, amount) {
    const el = document.createElement('div');
    el.className = 'float-earn';
    el.textContent = '+' + fmtMoney(amount);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ============= RENDERING =============
  let machinesDirty = true;
  let staffDirty = true;
  let expansionDirty = true;

  function renderHeader() {
    const cash = Math.floor(state.cash);
    moneyDisplay.textContent = '$' + cash.toLocaleString();
    const sec = gameSec();
    const min = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    timerDisplay.textContent = min + ':' + s.toString().padStart(2, '0');
    bestDisplay.textContent = best.fastestSec ? '🏆 ' + fmtTime(best.fastestSec) : '🏆 --:--';

    const pct = getProgressPct();
    progressFill.style.width = pct.toFixed(1) + '%';
    progressFill.setAttribute('aria-valuenow', Math.round(pct));
    const owned = ownedStoreCount();
    const total = totalStoreCount();
    storeCount.textContent = owned;
    storeTotal.textContent = total;
    progressLabel.textContent = `开店进度 ${owned}/${total}`;
  }

  function renderEconomy() {
    const click = computeClickValue();
    brewEarn.textContent = '+' + fmtMoney(click);
    const cps = computeIncomePerSec();
    cpsDisplay.textContent = fmtMoney(cps);
    sceneMoney.textContent = '+' + fmtMoney(cps) + '/s';

    // Scene level label - show best machine name
    let bestMachine = '手冲壶';
    CONFIG.MACHINES.forEach(m => {
      if (state.machines[m.id]) bestMachine = m.name;
    });
    sceneLevel.textContent = '☕ ' + bestMachine;
  }

  function renderTabs() {
    // Update badge indicators
    const machinesAfford = CONFIG.MACHINES.some(m => {
      if (state.machines[m.id]) return false;
      if (!isMachineBuyable(m)) return false;
      return state.cash >= m.cost;
    });
    const staffAfford = CONFIG.EMPLOYEES.some(e => {
      const count = state.employees[e.id] || 0;
      if (!isEmployeeBuyable(e)) return false;
      return state.cash >= employeeCost(e, count);
    });
    const expansionAfford = CONFIG.CITIES.some(c => {
      if (!isCityUnlocked(c)) return false;
      return c.stores.some(s => {
        if (state.stores[s.id]) return false;
        const idx = c.stores.indexOf(s);
        if (idx > 0 && !state.stores[c.stores[idx - 1].id]) return false;
        return state.cash >= s.cost;
      });
    });
    document.querySelectorAll('.badge-dot').forEach(el => el.remove());
    if (machinesAfford) {
      const btn = document.querySelector('[data-tab="machines"]');
      if (btn) { const d = document.createElement('span'); d.className = 'badge-dot'; btn.appendChild(d); }
    }
    if (staffAfford) {
      const btn = document.querySelector('[data-tab="staff"]');
      if (btn) { const d = document.createElement('span'); d.className = 'badge-dot'; btn.appendChild(d); }
    }
    if (expansionAfford) {
      const btn = document.querySelector('[data-tab="expansion"]');
      if (btn) { const d = document.createElement('span'); d.className = 'badge-dot'; btn.appendChild(d); }
    }
  }

  function renderMachines() {
    const el = $('machineList');
    const html = CONFIG.MACHINES.map(m => {
      const owned = state.machines[m.id];
      const buyable = isMachineBuyable(m);
      let cls = 'upgrade-item';
      if (owned) cls += ' owned';
      else if (!buyable) cls += ' locked';
      const costDisplay = owned ? '—' : fmtMoney(m.cost);
      const badgeHtml = owned ? '<span class="upgrade-badge">已拥有</span>' : '';
      const afford = buyable && state.cash >= m.cost;

      return `<div class="${cls}" data-machine="${m.id}">
        <div class="upgrade-icon ${owned ? 'owned' : ''}">${m.icon}</div>
        <div class="upgrade-info">
          <div class="upgrade-name">${m.name} ${badgeHtml}</div>
          <div class="upgrade-desc">${m.desc}</div>
        </div>
        <div class="upgrade-cost">${owned ? '—' : '<span class="currency">$</span>' + m.cost.toLocaleString()}</div>
      </div>`;
    }).join('');
    el.innerHTML = html;
    machinesDirty = false;
  }

  function renderStaff() {
    const el = $('staffList');
    const html = CONFIG.EMPLOYEES.map(e => {
      const count = state.employees[e.id] || 0;
      const cost = employeeCost(e, count);
      const unlocked = isEmployeeBuyable(e);
      const afford = unlocked && state.cash >= cost;
      let cls = 'staff-card';
      if (!unlocked) cls += ' locked';
      else if (afford) cls += ' affordable';
      const costDisplay = !unlocked ? ('🔒 条件不足') : (count > 0 ? '已雇佣' : fmtMoney(cost));
      const prod = (count * e.baseProd).toFixed(0);
      const prodText = count > 0 ? `+${prod}/s` : `+${e.baseProd}/s`;

      return `<div class="${cls}" data-employee="${e.id}">
        <div class="staff-avatar">${e.icon}</div>
        <div class="staff-name">${e.name} ${count > 0 ? '×' + count : ''}</div>
        <div class="staff-prod">${prodText}</div>
        <div class="staff-cost">${costDisplay}</div>
      </div>`;
    }).join('');
    el.innerHTML = html;
    staffDirty = false;
  }

  function renderExpansion() {
    const html = CONFIG.CITIES.map((c, ci) => {
      const unlocked = isCityUnlocked(c);
      let cls = 'city-row';
      if (!unlocked) cls += ' locked';
      else if (ownedStoreCount() >= c.stores.length && ci === CONFIG.CITIES.indexOf(c)) cls += ' active';
      else if (unlocked) cls += ' active';

      const storesHtml = c.stores.map((s, si) => {
        const owned = state.stores[s.id];
        const canBuy = isStoreBuyable(s, c);
        let sCls = 'store-node';
        if (owned) sCls += ' owned';
        else if (canBuy && state.cash >= s.cost) sCls += ' buyable';
        else sCls += ' locked';
        const label = owned ? (s.icon || '🏪') : (canBuy && state.cash >= s.cost ? '🏗️' : '🔒');
        const costLabel = !owned && canBuy ? fmtMoney(s.cost) : '';
        return `<div class="${sCls}" data-store="${s.id}">
          <span>${label}</span>
          ${costLabel ? `<span class="store-cost">${costLabel}</span>` : `<span class="store-label">${s.name.slice(0,2)}</span>`}
        </div>`;
      }).join('');

      const unlockText = !unlocked && c.unlockCondition
        ? `<span style="font-size:0.7rem;color:#7A5C44;font-weight:400;">(开店满 ${c.unlockCondition.count} 解锁)</span>`
        : '';

      return `<div class="${cls}" data-city="${c.id}">
        <div class="city-name">
          ${unlocked ? c.icon : '🔒'} ${c.name}
          ${unlocked ? '<span style="font-size:0.7rem;color:#16A34A;font-weight:500;">' + (ownedStoreCount() >= c.stores.length ? '(已占领)' : '(经营中)') + '</span>' : unlockText}
        </div>
        <div class="city-stores">${storesHtml}</div>
      </div>
      ${ci < CONFIG.CITIES.length - 1 ? `<div class="city-connector ${unlocked && isCityUnlocked(CONFIG.CITIES[ci+1]) ? 'open' : ''}">⬇</div>` : ''}`;
    }).join('');

    $('cityMap').innerHTML = html;

    // Drinks
    const drinksHtml = CONFIG.DRINKS.map(d => {
      const owned = state.drinks[d.id];
      const city = CONFIG.CITIES.find(c => c.id === d.unlockCity);
      const cityUnlocked = city ? isCityUnlocked(city) : false;
      let cls = 'drink-chip';
      if (owned) cls += ' unlocked';
      else if (!cityUnlocked) cls += ' locked';
      return `<div class="${cls}" data-drink="${d.id}">
        ${d.icon} ${d.name}
      </div>`;
    }).join('');
    $('drinkRow').innerHTML = drinksHtml;

    const dp = getDrinkUnlockProgress();
    $('drinkProgress').textContent = `已解锁 ${dp.unlocked}/${dp.total} 饮品`;

    expansionDirty = false;
  }

  function renderAll() {
    renderHeader();
    renderEconomy();
    renderTabs();
    if (machinesDirty) renderMachines();
    if (staffDirty) renderStaff();
    if (expansionDirty) renderExpansion();
  }

  // ============= ACTIONS =============
  function handleBrew(evt) {
    if (state.finished) return;
    const gain = computeClickValue();
    state.cash += gain;
    state.totalEarned += gain;
    state.coffeesMade++;
    sfxSell();
    vibrate(15);
    brewBtn.classList.add('pressed');
    setTimeout(() => brewBtn.classList.remove('pressed'), 80);

    if (evt) {
      const rect = brewBtn.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - 30 + Math.random() * 40;
      const y = rect.top - 10;
      createFloatEarn(x, y, gain);
    }
    machinesDirty = true;
    staffDirty = true;
    expansionDirty = true;
    checkUnlocks();
  }

  function buyStore(storeId) {
    let found = false;
    CONFIG.CITIES.forEach(c => c.stores.forEach(s => {
      if (s.id === storeId) {
        if (state.stores[s.id]) return;
        if (!isStoreBuyable(s, c)) { sfxError(); return; }
        if (state.cash < s.cost) { sfxError(); showToast('💰 资金不足！'); return; }
        state.cash -= s.cost;
        state.stores[s.id] = true;
        sfxChime();
        vibrate([60, 30, 60]);
        showToast(`🏪 新店开业：${s.name}！`);
        machinesDirty = true;
        staffDirty = true;
        expansionDirty = true;
        found = true;
      }
    }));
    if (found) checkUnlocks();
  }

  function buyMachine(id) {
    const m = CONFIG.MACHINES.find(x => x.id === id);
    if (!m || state.machines[id]) return;
    if (!isMachineBuyable(m)) { sfxError(); return; }
    if (state.cash < m.cost) { sfxError(); showToast('💰 资金不足！'); return; }
    state.cash -= m.cost;
    state.machines[id] = true;
    sfxUpgrade();
    vibrate([40, 25, 40]);
    showToast(`☕ 升级：${m.name}！`);
    machinesDirty = true;
    staffDirty = true;
    expansionDirty = true;
  }

  function buyEmployee(id) {
    const e = CONFIG.EMPLOYEES.find(x => x.id === id);
    if (!e) return;
    const count = state.employees[id] || 0;
    const cost = employeeCost(e, count);
    if (!isEmployeeBuyable(e)) { sfxError(); return; }
    if (state.cash < cost) { sfxError(); showToast('💰 资金不足！'); return; }
    state.cash -= cost;
    state.employees[id] = count + 1;
    sfxUpgrade();
    vibrate([40, 25, 40]);
    showToast(`👥 雇佣了 ${e.name}！`);
    staffDirty = true;
    expansionDirty = true;
  }

  function buyDrink(id) {
    const d = CONFIG.DRINKS.find(x => x.id === id);
    if (!d || state.drinks[id]) return;
    const city = CONFIG.CITIES.find(c => c.id === d.unlockCity);
    if (!city || !isCityUnlocked(city)) { sfxError(); return; }
    if (state.cash < d.cost) { sfxError(); showToast('💰 资金不足！'); return; }
    state.cash -= d.cost;
    state.drinks[id] = true;
    sfxUpgrade();
    vibrate([60, 30, 60]);
    showToast(`🥤 新饮品解锁：${d.name}！${d.desc}`);
    staffDirty = true;
    expansionDirty = true;
  }

  // ============= UNLOCK NOTIFICATIONS =============
  const announced = new Set();
  function checkUnlocks() {
    // Check city unlocks
    CONFIG.CITIES.forEach(c => {
      if (c.unlockCondition && isCityUnlocked(c) && !announced.has('city:' + c.id)) {
        announced.add('city:' + c.id);
        showToast(`🗺️ 解锁新城市：${c.name}！`);
        sfxChime();
        vibrate(80);
        expansionDirty = true;
      }
    });
    // Check employee unlocks
    CONFIG.EMPLOYEES.forEach(e => {
      if (typeof e.unlockAt === 'number' && e.unlockAt > 0 && state.totalEarned >= e.unlockAt && !announced.has('emp:' + e.id)) {
        announced.add('emp:' + e.id);
        showToast(`🔓 可雇佣：${e.icon} ${e.name}`);
        sfxCoin();
        staffDirty = true;
      }
    });
  }

  // ============= EVENT DELEGATION =============
  brewBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    ensureAudio();
    handleBrew(e);
  });
  brewBtn.addEventListener('click', e => e.preventDefault());

  // Panel clicks (one delegation per panel)
  $('machineList').addEventListener('click', e => {
    const item = e.target.closest('.upgrade-item');
    if (!item) return;
    const id = item.dataset.machine;
    if (id) { ensureAudio(); buyMachine(id); }
  });

  $('staffList').addEventListener('click', e => {
    const item = e.target.closest('.staff-card');
    if (!item) return;
    const id = item.dataset.employee;
    if (id) { ensureAudio(); buyEmployee(id); }
  });

  $('cityMap').addEventListener('click', e => {
    const node = e.target.closest('.store-node');
    if (!node) return;
    const storeId = node.dataset.store;
    if (storeId) { ensureAudio(); buyStore(storeId); }
  });

  $('drinkRow').addEventListener('click', e => {
    const chip = e.target.closest('.drink-chip');
    if (!chip) return;
    const id = chip.dataset.drink;
    if (id && !chip.classList.contains('locked')) { ensureAudio(); buyDrink(id); }
  });

  // keyboard
  document.addEventListener('keydown', e => {
    if (state.finished) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        restartGame();
      }
      return;
    }
    if (e.target.tagName === 'BUTTON' && e.key === ' ') return;
    if (e.code === 'Space' || e.key === 'Enter') {
      if (endModal.classList.contains('open') || offlineOverlay.classList.contains('open') || kbdHint.classList.contains('open')) return;
      e.preventDefault();
      ensureAudio();
      handleBrew();
    } else if (e.key === '1') switchTab('machines');
    else if (e.key === '2') switchTab('staff');
    else if (e.key === '3') switchTab('expansion');
    else if (e.key.toLowerCase() === 'm') toggleMute();
    else if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      kbdHint.classList.toggle('open');
    }
    else if (e.key === 'Escape') {
      offlineOverlay.classList.remove('open');
      endModal.classList.remove('open');
      kbdHint.classList.remove('open');
    }
  });

  // Close kbd on backdrop click
  kbdHint.addEventListener('click', e => {
    if (e.target === e.currentTarget) kbdHint.classList.remove('open');
  });

  // mute
  function toggleMute() {
    state.settings.sfx = !state.settings.sfx;
    muteBtn.setAttribute('aria-pressed', String(!state.settings.sfx));
    muteIcon.textContent = state.settings.sfx ? '🔊' : '🔇';
    lsSet(LS.SETTINGS, state.settings);
  }
  muteBtn.addEventListener('click', toggleMute);
  muteIcon.textContent = state.settings.sfx ? '🔊' : '🔇';

  // ============= OFFLINE EARNINGS =============
  function checkOfflineEarnings() {
    const lastSeen = lsGet(LS.LAST_SEEN, null);
    if (!lastSeen) {
      lsSet(LS.LAST_SEEN, Date.now());
      return;
    }
    const elapsed = Math.min(3600, (Date.now() - lastSeen) / 1000); // max 60 min
    if (elapsed < 10) return; // less than 10 seconds, skip

    const cps = computeIncomePerSec();
    const earned = cps * elapsed * 0.5; // 50% offline efficiency
    if (earned < 1) return;
    state.cash += earned;
    state.totalEarned += earned;
    offlineAmount.textContent = '$' + Math.floor(earned).toLocaleString();
    offlineOverlay.classList.add('open');
    state.offlineCollected = true;
  }

  collectBtn.addEventListener('click', () => {
    offlineOverlay.classList.remove('open');
    showToast('💰 离线收益已到账！');
    lsSet(LS.LAST_SEEN, Date.now());
  });

  // Track visibility
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !state.finished) {
      lsSet(LS.LAST_SEEN, Date.now());
    }
  });

  // ============= MAIN LOOP =============
  let lastTs = performance.now();
  let offlineChecked = false;

  function loop(ts) {
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;

    // Check offline on first tick
    if (!offlineChecked) {
      offlineChecked = true;
      checkOfflineEarnings();
    }

    if (!state.finished) {
      const inc = computeIncomePerSec() * dt;
      if (inc > 0) {
        state.cash += inc;
        state.totalEarned += inc;
        machinesDirty = true;
        staffDirty = true;
        expansionDirty = true;
      }
      checkUnlocks();

      // Victory: all stores owned
      const owned = ownedStoreCount();
      const total = totalStoreCount();
      if (owned >= total && !state.victory) {
        state.victory = true;
        triggerEnd(true);
      }
      // Timeout
      if (gameSec() > CONFIG.MAX_GAME_SEC && !state.victory) {
        triggerEnd(false);
      }
    }

    renderAll();
    requestAnimationFrame(loop);
  }

  // ============= END / RESTART =============
  function triggerEnd(isVictory) {
    state.finished = true;
    if (isVictory) sfxFanfare();
    else sfxError();
    vibrate(isVictory ? [100, 50, 100, 50, 200] : [50, 50, 100]);

    const sec = Math.floor(gameSec());
    const owned = ownedStoreCount();
    const citiesUnlocked = CONFIG.CITIES.filter(c => isCityUnlocked(c)).length;

    let isNewBest = false;
    if (isVictory) {
      best.wins = (best.wins || 0) + 1;
      if (!best.fastestSec || sec < best.fastestSec) {
        best.fastestSec = sec;
        isNewBest = true;
      }
    }
    if (state.totalEarned > (best.maxEarn || 0)) {
      best.maxEarn = Math.floor(state.totalEarned);
    }
    if (owned > (best.maxStores || 0)) best.maxStores = owned;
    if (citiesUnlocked > (best.maxCities || 0)) best.maxCities = citiesUnlocked;
    best.gamesPlayed = (best.gamesPlayed || 0) + 1;
    lsSet(LS.BEST, best);

    // Record recently played
    try {
      const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
      const filtered = recent.filter(p => p.id !== 'idle-coffee-tycoon');
      filtered.unshift({ id: 'idle-coffee-tycoon', playedAt: Date.now() });
      localStorage.setItem('recentlyPlayed', JSON.stringify(filtered.slice(0, 10)));
    } catch {}

    if (isVictory) {
      endIcon.textContent = '🎉';
      endTitle.textContent = '咖啡帝国建成！';
      endSub.textContent = '全城店铺已开满，你的咖啡帝国征服了整座城市！';
    } else {
      endIcon.textContent = '⏰';
      endTitle.textContent = '打烊时间到';
      endSub.textContent = `时间到了！已开店 ${owned}/${totalStoreCount()}，再试一次吧！`;
    }
    endEarn.textContent = '$' + Math.floor(state.totalEarned).toLocaleString();
    endTime.textContent = fmtTime(sec);
    endStores.textContent = `${owned}/${totalStoreCount()}`;
    endCities.textContent = citiesUnlocked;
    newBestRow.hidden = !isNewBest;

    if (isVictory) spawnConfetti();

    endModal.classList.add('open');
    setTimeout(() => restartBtn.focus(), 100);
  }

  function spawnConfetti() {
    const layer = $('confettiLayer');
    layer.innerHTML = '';
    const colors = ['#5D4432', '#C9A87C', '#FCD34D', '#16A34A', '#E9E3DD', '#D97706'];
    for (let i = 0; i < 50; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
      p.style.animationDelay = (Math.random() * 0.8) + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(p);
    }
  }

  function restartGame() {
    state.cash = 50;
    state.totalEarned = 0;
    state.coffeesMade = 0;
    CONFIG.MACHINES.forEach(m => state.machines[m.id] = !!m.owned);
    CONFIG.EMPLOYEES.forEach(e => state.employees[e.id] = 0);
    CONFIG.DRINKS.forEach(d => state.drinks[d.id] = false);
    // reset stores - only cost=0 ones
    Object.keys(state.stores).forEach(k => { state.stores[k] = false; });
    CONFIG.CITIES.forEach(c => c.stores.forEach(s => {
      if (s.cost === 0) state.stores[s.id] = true;
    }));
    state.startTs = Date.now();
    state.finished = false;
    state.victory = false;
    state.offlineCollected = false;
    announced.clear();
    machinesDirty = staffDirty = expansionDirty = true;
    endModal.classList.remove('open');
    offlineOverlay.classList.remove('open');
    lsSet(LS.LAST_SEEN, Date.now());
    switchTab('machines');
    brewBtn.focus();
  }

  restartBtn.addEventListener('click', restartGame);

  // ============= BOOT =============
  switchTab('machines');
  renderAll();
  requestAnimationFrame(ts => { lastTs = ts; loop(ts); });

  // Prevent iOS zoom / scroll
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if (e.target.closest('.panel')) return;
    e.preventDefault();
  }, { passive: false });

  // Announcer
  function announce(msg) {
    const el = $('announcer');
    if (el) el.textContent = msg;
  }

})();
