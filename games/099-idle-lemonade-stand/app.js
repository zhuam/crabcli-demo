/* ===== Idle Lemonade Stand · app.js =====
 * 经营/放置游戏 · IPO 上市通关 · 单局 ≤ 3 分钟
 */
(() => {
  'use strict';

  // ============= CONFIG =============
  const CONFIG = {
    IPO_GOAL: 1_000_000,
    MAX_GAME_SEC: 240,           // 4 分钟兜底（防卡死）
    COST_GROWTH: 1.15,
    TICK_HZ: 10,
    SAVE_INTERVAL_MS: 5000,
    CLICK_BASE: 1,

    EMPLOYEES: [
      { id: 'cashier', name: '收银员',  icon: '🧑‍💼', baseCost: 10,    baseProd: 1,    unlockAt: 0,
        desc: '每秒帮你卖出 1 杯' },
      { id: 'barista', name: '调酒师',  icon: '👨‍🍳', baseCost: 110,   baseProd: 8,    unlockAt: 30,
        desc: '配方大师，自动产出 +8' },
      { id: 'manager', name: '经理',    icon: '👔',   baseCost: 1200,  baseProd: 60,   unlockAt: 200,
        desc: '管理团队，自动产出 +60' },
      { id: 'franchise', name: '加盟商', icon: '🏢',  baseCost: 13000, baseProd: 500,  unlockAt: 5000,
        desc: '帝国扩张，自动产出 +500' },
      { id: 'investor', name: '投资人',  icon: '💼',  baseCost: 150000, baseProd: 5000, unlockAt: 50000,
        desc: '资本运作，自动产出 +5000' }
    ],

    UPGRADES: [
      { id: 'flavor1', kind: 'flavor',  name: '草莓口味',     icon: '🍓',  cost: 80,    mult: 2,   desc: '产出 ×2' },
      { id: 'flavor2', kind: 'flavor',  name: '蜜桃口味',     icon: '🍑',  cost: 1500,  mult: 2,   desc: '产出 ×2' },
      { id: 'flavor3', kind: 'flavor',  name: '抹茶口味',     icon: '🍵',  cost: 25000, mult: 2,   desc: '产出 ×2' },
      { id: 'store1',  kind: 'store',   name: '广场分店',     icon: '🏪',  cost: 600,   mult: 2,   desc: '产出 ×2' },
      { id: 'store2',  kind: 'store',   name: '商圈连锁',     icon: '🏬',  cost: 9000,  mult: 2,   desc: '产出 ×2' },
      { id: 'store3',  kind: 'store',   name: '全国直营',     icon: '🌆',  cost: 120000,mult: 2.5, desc: '产出 ×2.5' },
      { id: 'mkt1',    kind: 'mkt',     name: '社交媒体广告', icon: '📱',  cost: 2500,  mult: 1.5, desc: '所有产出 ×1.5' },
      { id: 'mkt2',    kind: 'mkt',     name: '明星代言',     icon: '⭐',  cost: 40000, mult: 1.8, desc: '所有产出 ×1.8' }
    ]
  };

  // ============= STATE =============
  const state = {
    cash: 0,
    totalEarned: 0,
    cupsSold: 0,
    pricePerCup: 1.0,
    employees: {},     // id -> count
    upgrades: {},      // id -> bool
    startTs: Date.now(),
    lastSaveTs: Date.now(),
    victory: false,
    finished: false,
    settings: { sfx: true, haptic: true }
  };
  CONFIG.EMPLOYEES.forEach(e => state.employees[e.id] = 0);
  CONFIG.UPGRADES.forEach(u => state.upgrades[u.id] = false);

  // ============= STORAGE =============
  const LS = {
    BEST: 'idle_lemonade_best',
    SETTINGS: 'idle_lemonade_settings'
  };
  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }
  let best = lsGet(LS.BEST, { fastestSec: null, maxEarn: 0, gamesPlayed: 0, ipoCount: 0 });
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

  function priceMultiplier(price) {
    // U 形曲线：$1.0 销量 ×1, 越偏离销量越下降但单杯收入上升
    // 总收入 = price * salesMult
    const p = price;
    let salesMult;
    if (p <= 0.5) salesMult = 1.8;
    else if (p <= 1.0) salesMult = 1.8 - (p - 0.5) * 1.6; // 1.8 -> 1.0
    else if (p <= 2.0) salesMult = 1.0 - (p - 1.0) * 0.5; // 1.0 -> 0.5
    else salesMult = Math.max(0.15, 0.5 - (p - 2.0) * 0.18);
    return { salesMult, revenue: p * salesMult };
  }

  function computeIncomePerSec() {
    let base = 0;
    CONFIG.EMPLOYEES.forEach(e => {
      base += (state.employees[e.id] || 0) * e.baseProd;
    });
    let mult = 1;
    CONFIG.UPGRADES.forEach(u => { if (state.upgrades[u.id]) mult *= u.mult; });
    const { revenue } = priceMultiplier(state.pricePerCup);
    return base * mult * revenue;
  }

  function computeClickValue() {
    let mult = 1;
    CONFIG.UPGRADES.forEach(u => { if (state.upgrades[u.id]) mult *= u.mult; });
    const { revenue } = priceMultiplier(state.pricePerCup);
    return CONFIG.CLICK_BASE * mult * revenue;
  }

  // ============= AUDIO =============
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch { return null; }
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
    if (now - lastSfx < 30) return; // 节流
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
  function sfxSell()    { playTone(880, 0.06, 'square', 0.12); }
  function sfxCoin()    { playTone(660, 0.05, 'triangle', 0.08); }
  function sfxUpgrade() { playTone(523, 0.08, 'sine', 0.18); setTimeout(() => playTone(784, 0.12, 'sine', 0.18), 70); }
  function sfxFanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sine', 0.22), i * 110));
  }

  function vibrate(pattern) {
    if (!state.settings.haptic) return;
    if (navigator.vibrate) try { navigator.vibrate(pattern); } catch {}
  }

  // ============= DOM REFS =============
  const $ = id => document.getElementById(id);
  const cashEl    = $('cashDisplay');
  const timeEl    = $('timeDisplay');
  const bestEl    = $('bestDisplay');
  const sellBtn   = $('sellBtn');
  const sellPrice = $('sellPrice');
  const cpsHint   = $('cpsHint');
  const progFill  = $('progressFill');
  const progLabel = $('progressLabel');
  const priceCur  = $('priceCur');
  const priceSub  = $('priceSub');
  const staffList = $('staffList');
  const upgList   = $('upgradeList');
  const resultModal = $('resultModal');
  const resultTitle = $('resultTitle');
  const resultEarn  = $('resultEarn');
  const resultTime  = $('resultTime');
  const resultBest  = $('resultBest');
  const newBestRow  = $('newBestRow');
  const restartBtn  = $('restartBtn');
  const toastEl     = $('toast');
  const muteBtn     = $('muteBtn');
  const muteIcon    = $('muteIcon');
  const floatLayer  = $('floatLayer');

  // ============= TAB SWITCHING =============
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    price: $('panel-price'),
    staff: $('panel-staff'),
    upgrade: $('panel-upgrade')
  };
  function switchTab(id) {
    tabs.forEach(t => {
      const sel = t.dataset.tab === id;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
    Object.entries(panels).forEach(([k, el]) => {
      if (k === id) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
  }
  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // ============= TOAST =============
  let toastTimer;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.removeAttribute('hidden');
    // re-trigger animation
    toastEl.style.animation = 'none';
    void toastEl.offsetHeight;
    toastEl.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.setAttribute('hidden', ''), 2500);
  }

  // ============= RENDERING =============
  function renderStaffList() {
    const sec = gameSec();
    const html = CONFIG.EMPLOYEES.map(emp => {
      const count = state.employees[emp.id] || 0;
      const cost = employeeCost(emp, count);
      const unlocked = state.totalEarned >= emp.unlockAt || count > 0;
      const afford = state.cash >= cost && unlocked;
      let cls = 'item';
      if (!unlocked) cls += ' locked';
      else if (afford) cls += ' affordable';
      const buyText = !unlocked ? `🔒 需 ${fmtMoney(emp.unlockAt)}` : `${fmtMoney(cost)}`;
      return `
        <div class="${cls}" data-emp="${emp.id}">
          <div class="item-ico">${emp.icon}</div>
          <div>
            <div class="item-name">${emp.name} <span style="color:var(--c-muted);font-weight:500;">×${count}</span></div>
            <div class="item-meta">${emp.desc} · 总产出 +${(emp.baseProd * count).toFixed(0)}/s</div>
          </div>
          <button class="item-buy" data-buy-emp="${emp.id}" ${!afford ? 'disabled' : ''} aria-label="招募 ${emp.name}, 花费 ${fmtMoney(cost)}">${buyText}</button>
        </div>`;
    }).join('');
    staffList.innerHTML = html;
  }

  function renderUpgradeList() {
    const html = CONFIG.UPGRADES.map(up => {
      const owned = state.upgrades[up.id];
      const afford = !owned && state.cash >= up.cost;
      let cls = 'item';
      if (owned) cls += ' maxed';
      else if (afford) cls += ' affordable';
      const buyText = owned ? '✓ 已拥有' : fmtMoney(up.cost);
      return `
        <div class="${cls}" data-up="${up.id}">
          <div class="item-ico">${up.icon}</div>
          <div>
            <div class="item-name">${up.name}</div>
            <div class="item-meta">${up.desc}</div>
          </div>
          <button class="item-buy" data-buy-up="${up.id}" ${owned || !afford ? 'disabled' : ''} aria-label="购买 ${up.name}">${buyText}</button>
        </div>`;
    }).join('');
    upgList.innerHTML = html;
  }

  function renderHeader() {
    cashEl.textContent = fmtMoney(state.cash);
    timeEl.textContent = fmtTime(gameSec());
    bestEl.textContent = best.fastestSec ? fmtTime(best.fastestSec) : '--:--';
    const pct = Math.min(100, (state.cash / CONFIG.IPO_GOAL) * 100);
    progFill.style.width = pct.toFixed(2) + '%';
    progLabel.textContent = `距离 IPO  ${fmtMoney(Math.max(0, CONFIG.IPO_GOAL - state.cash))} / ${fmtMoney(CONFIG.IPO_GOAL)}`;
  }

  function renderSell() {
    const click = computeClickValue();
    sellPrice.textContent = '+' + fmtMoney(click);
    cpsHint.textContent = `每秒收入：${fmtMoney(computeIncomePerSec())}`;
    const { salesMult } = priceMultiplier(state.pricePerCup);
    priceCur.textContent = '$' + state.pricePerCup.toFixed(2);
    priceSub.textContent = `当前 $${state.pricePerCup.toFixed(2)} · 销量乘数 ×${salesMult.toFixed(2)}`;
  }

  function renderBadges() {
    // 员工 / 升级 tab badge：是否有 affordable item
    const staffAfford = CONFIG.EMPLOYEES.some(e => {
      const c = state.employees[e.id] || 0;
      const unlocked = state.totalEarned >= e.unlockAt || c > 0;
      return unlocked && state.cash >= employeeCost(e, c);
    });
    const upgAfford = CONFIG.UPGRADES.some(u => !state.upgrades[u.id] && state.cash >= u.cost);
    $('badge-staff').hidden = !staffAfford;
    $('badge-upgrade').hidden = !upgAfford;
    $('badge-price').hidden = true;
  }

  let staffDirty = true, upgDirty = true;
  function renderAll() {
    renderHeader();
    renderSell();
    renderBadges();
    if (staffDirty) { renderStaffList(); staffDirty = false; }
    if (upgDirty) { renderUpgradeList(); upgDirty = false; }
  }

  // ============= ACTIONS =============
  function spawnFloatText(text, x, y) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function sellOne(evt) {
    if (state.finished) return;
    const gain = computeClickValue();
    state.cash += gain;
    state.totalEarned += gain;
    state.cupsSold += 1;
    sfxSell();
    vibrate(15);
    sellBtn.classList.add('pressed');
    setTimeout(() => sellBtn.classList.remove('pressed'), 80);

    // 浮字：从 stage 区域中下方
    const layer = floatLayer.getBoundingClientRect();
    const x = (evt && evt.clientX) ? (evt.clientX - layer.left) : (layer.width * (0.3 + Math.random() * 0.4));
    const y = layer.height * 0.7;
    spawnFloatText('+' + fmtMoney(gain), x, y);

    // dirty flags
    staffDirty = true; upgDirty = true;
    checkUnlocks();
  }

  function buyEmployee(id) {
    const emp = CONFIG.EMPLOYEES.find(e => e.id === id);
    if (!emp) return;
    const count = state.employees[id] || 0;
    const cost = employeeCost(emp, count);
    if (state.cash < cost) return;
    if (state.totalEarned < emp.unlockAt && count === 0) return;
    state.cash -= cost;
    state.employees[id] = count + 1;
    sfxUpgrade();
    vibrate([40, 25, 40]);
    if (count === 0) showToast(`☕ 雇佣了第一位${emp.name}！`);
    staffDirty = true; upgDirty = true;
  }

  function buyUpgrade(id) {
    const up = CONFIG.UPGRADES.find(u => u.id === id);
    if (!up || state.upgrades[id]) return;
    if (state.cash < up.cost) return;
    state.cash -= up.cost;
    state.upgrades[id] = true;
    sfxUpgrade();
    vibrate([60, 30, 60]);
    showToast(`✨ 解锁 ${up.name}！${up.desc}`);
    staffDirty = true; upgDirty = true;
  }

  function changePrice(delta) {
    const np = Math.max(0.5, Math.min(3.0, +(state.pricePerCup + delta).toFixed(2)));
    state.pricePerCup = np;
    sfxCoin();
    vibrate(10);
  }

  // ============= UNLOCK NOTIFICATIONS =============
  const announced = new Set();
  function checkUnlocks() {
    CONFIG.EMPLOYEES.forEach(e => {
      const k = 'emp:' + e.id;
      if (!announced.has(k) && state.totalEarned >= e.unlockAt && e.unlockAt > 0) {
        announced.add(k);
        showToast(`🔓 解锁新员工：${e.icon} ${e.name}`);
        sfxCoin();
        vibrate(30);
      }
    });
  }

  // ============= EVENTS =============
  sellBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    ensureAudio();
    sellOne(e);
  });
  // 防止双触发：禁用 click（pointerdown 已处理）
  sellBtn.addEventListener('click', e => e.preventDefault());

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
      e.preventDefault();
      ensureAudio();
      sellOne();
    } else if (e.key === '1') { switchTab('price'); }
    else if (e.key === '2') { switchTab('staff'); }
    else if (e.key === '3') { switchTab('upgrade'); }
    else if (e.key.toLowerCase() === 'm') { toggleMute(); }
    else if (e.key === '-' || e.key === '_') { changePrice(-0.5); }
    else if (e.key === '+' || e.key === '=') { changePrice(0.5); }
  });

  // 委托：员工列表 / 升级列表 / 价格按钮
  staffList.addEventListener('click', e => {
    const id = e.target.getAttribute('data-buy-emp');
    if (id) { ensureAudio(); buyEmployee(id); }
  });
  upgList.addEventListener('click', e => {
    const id = e.target.getAttribute('data-buy-up');
    if (id) { ensureAudio(); buyUpgrade(id); }
  });
  document.querySelectorAll('.price-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ensureAudio();
      changePrice(parseFloat(btn.dataset.delta));
    });
  });

  // mute
  function toggleMute() {
    state.settings.sfx = !state.settings.sfx;
    muteBtn.setAttribute('aria-pressed', String(!state.settings.sfx));
    muteIcon.textContent = state.settings.sfx ? '🔊' : '🔇';
    lsSet(LS.SETTINGS, state.settings);
  }
  muteBtn.addEventListener('click', toggleMute);
  // 初始
  muteIcon.textContent = state.settings.sfx ? '🔊' : '🔇';
  muteBtn.setAttribute('aria-pressed', String(!state.settings.sfx));

  restartBtn.addEventListener('click', restartGame);

  // ============= CANVAS =============
  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(300, r.width * dpr);
    canvas.height = Math.max(160, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 0);

  const particles = [];
  function spawnParticle() {
    if (particles.length > 30) return;
    const r = canvas.getBoundingClientRect();
    particles.push({
      x: 30 + Math.random() * Math.max(60, r.width - 60),
      y: r.height - 60,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -1.4 - Math.random() * 1.2,
      life: 1.0,
      type: Math.random() > 0.5 ? '🥤' : '🍋'
    });
  }

  let cpsParticleTimer = 0;
  function drawScene(dt) {
    const r = canvas.getBoundingClientRect();
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);

    // 背景：天空 + 草地
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#FFE9A0');
    sky.addColorStop(1, '#FFD56B');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // 草地
    ctx.fillStyle = '#88C66B';
    ctx.fillRect(0, H - 28, W, 28);

    // 太阳
    ctx.fillStyle = '#FFF4B0';
    ctx.beginPath();
    ctx.arc(W - 40, 40, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD400';
    ctx.beginPath();
    ctx.arc(W - 40, 40, 14, 0, Math.PI * 2);
    ctx.fill();

    // 摊位 (单个矩形 + 顶棚)
    const stallX = W / 2 - 70, stallY = H - 130, stallW = 140, stallH = 80;
    // 顶棚条纹
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#E26D5A' : '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(stallX - 10 + i * 27, stallY - 24);
      ctx.lineTo(stallX - 10 + (i + 1) * 27, stallY - 24);
      ctx.lineTo(stallX - 10 + (i + 1) * 27 - 10, stallY);
      ctx.lineTo(stallX - 10 + i * 27 - 10, stallY);
      ctx.closePath();
      ctx.fill();
    }
    // 招牌
    ctx.fillStyle = '#5C3A21';
    ctx.fillRect(stallX, stallY - 8, stallW, 8);
    // 摊位身
    ctx.fillStyle = '#F4D29B';
    ctx.fillRect(stallX, stallY, stallW, stallH);
    ctx.strokeStyle = '#8A5A2A';
    ctx.lineWidth = 2;
    ctx.strokeRect(stallX, stallY, stallW, stallH);
    // 柠檬水罐
    ctx.font = '36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍋', stallX + 30, stallY + 50);
    ctx.fillText('🥤', stallX + 70, stallY + 50);
    ctx.fillText('🍓', stallX + 110, stallY + 50);

    // 顾客（cps 视觉化，最多 6 个）
    const cps = computeIncomePerSec();
    const customerCount = Math.min(8, Math.floor(Math.log2(1 + cps)));
    ctx.font = '26px sans-serif';
    for (let i = 0; i < customerCount; i++) {
      const ox = stallX - 30 - i * 22 + Math.sin(performance.now() / 400 + i) * 2;
      ctx.fillText(['🧒', '👩', '🧑', '👨', '👵'][i % 5], ox, stallY + 70);
    }

    // 自动产出粒子
    cpsParticleTimer += dt;
    const particleInterval = Math.max(0.2, 1.5 - Math.log10(cps + 1) * 0.3);
    if (cpsParticleTimer > particleInterval && cps > 0) {
      cpsParticleTimer = 0;
      spawnParticle();
    }

    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;
      p.vy += 1.5 * dt;
      p.life -= dt * 1.1;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = '20px sans-serif';
      ctx.fillText(p.type, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // ============= MAIN LOOP =============
  let lastTs = performance.now();
  let saveAccum = 0;
  function loop(ts) {
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;

    if (!state.finished) {
      const inc = computeIncomePerSec() * dt;
      if (inc > 0) {
        state.cash += inc;
        state.totalEarned += inc;
        state.cupsSold += inc / Math.max(0.01, state.pricePerCup * priceMultiplier(state.pricePerCup).salesMult);
        staffDirty = true; upgDirty = true;
      }
      checkUnlocks();
      // 胜利
      if (state.cash >= CONFIG.IPO_GOAL && !state.victory) {
        state.victory = true;
        triggerEnd(true);
      }
      // 兜底超时（4 分钟仍未上市，按当前进度结算）
      if (gameSec() > CONFIG.MAX_GAME_SEC && !state.victory) {
        triggerEnd(false);
      }
    }

    drawScene(dt);
    renderAll();

    saveAccum += dt;
    if (saveAccum > 5) { saveAccum = 0; /* 暂无 mid-game 存档 */ }

    requestAnimationFrame(loop);
  }

  // ============= END / RESTART =============
  function triggerEnd(isVictory) {
    state.finished = true;
    sfxFanfare();
    vibrate([100, 50, 100, 50, 200]);

    const sec = Math.floor(gameSec());
    let isNewBest = false;
    if (isVictory) {
      best.ipoCount = (best.ipoCount || 0) + 1;
      if (!best.fastestSec || sec < best.fastestSec) {
        best.fastestSec = sec;
        isNewBest = true;
      }
    }
    if (state.totalEarned > (best.maxEarn || 0)) {
      best.maxEarn = Math.floor(state.totalEarned);
      if (!isVictory) isNewBest = true;
    }
    best.gamesPlayed = (best.gamesPlayed || 0) + 1;
    lsSet(LS.BEST, best);

    // 弹窗内容
    if (isVictory) {
      resultTitle.textContent = '🎉 IPO 上市成功! 🎉';
    } else {
      resultTitle.textContent = '⏰ 时间到，本局结算';
    }
    resultEarn.textContent = fmtMoney(state.totalEarned);
    resultTime.textContent = fmtTime(sec);
    resultBest.textContent = best.fastestSec ? fmtTime(best.fastestSec) : '--:--';
    newBestRow.hidden = !isNewBest;

    // confetti
    if (isVictory) spawnConfetti();

    resultModal.removeAttribute('hidden');
    setTimeout(() => restartBtn.focus(), 100);
  }

  function spawnConfetti() {
    const layer = $('confettiLayer');
    layer.innerHTML = '';
    const colors = ['#F9D423', '#6BCB77', '#E26D5A', '#5C3A21', '#FF8FAB', '#4D96FF'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      p.style.animationDelay = (Math.random() * 0.8) + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(p);
    }
  }

  function restartGame() {
    state.cash = 0;
    state.totalEarned = 0;
    state.cupsSold = 0;
    state.pricePerCup = 1.0;
    CONFIG.EMPLOYEES.forEach(e => state.employees[e.id] = 0);
    CONFIG.UPGRADES.forEach(u => state.upgrades[u.id] = false);
    state.startTs = Date.now();
    state.lastSaveTs = Date.now();
    state.victory = false;
    state.finished = false;
    announced.clear();
    particles.length = 0;
    staffDirty = true; upgDirty = true;
    resultModal.setAttribute('hidden', '');
    switchTab('staff'); // 进入下一局自然引导到员工 tab（招员工是上市关键）
    sellBtn.focus();
  }

  // ============= BOOT =============
  // 默认 tab：staff（按 tech-analyst P1：新手优先看到“招员工”而非价格滑块）
  switchTab('staff');
  renderAll();
  requestAnimationFrame(ts => { lastTs = ts; loop(ts); });

  // 防止 iOS 滚动 / 双击缩放
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if (e.target.closest('.panels')) return; // 允许面板内滚动
    e.preventDefault();
  }, { passive: false });

})();
