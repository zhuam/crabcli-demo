/* ===== Sneak the Fart · app.js =====
 * 偷偷放屁 · 潜行搞笑游戏
 * 时机选择 → 释放 → 隐藏
 */
(() => {
  'use strict';

  // ============================================================
  // SCENE DEFINITIONS
  // ============================================================
  const SCENES = [
    {
      id: 'office', name: '办公室', icon: '🏢',
      bgClass: 'office', floorClass: 'office',
      target: 3,
      npcs: [
        { id: 0, emoji: '👩‍💼', x: 18, label: '同事 A' },
        { id: 1, emoji: '👨‍💼', x: 50, label: '同事 B' },
        { id: 2, emoji: '👩‍🔧', x: 78, label: '同事 C' },
      ],
      // Attention timing: [minMs, maxMs] per state
      timing: { away: [2800, 4200], around: [600, 1200], atPlayer: [500, 1000] },
      decor: 'office'
    },
    {
      id: 'library', name: '图书馆', icon: '📚',
      bgClass: 'library', floorClass: 'library',
      target: 4,
      npcs: [
        { id: 0, emoji: '🧑‍🏫', x: 14, label: '读者 A' },
        { id: 1, emoji: '👨‍🎓', x: 36, label: '读者 B' },
        { id: 2, emoji: '👩‍🎓', x: 62, label: '读者 C' },
        { id: 3, emoji: '🧓', x: 84, label: '读者 D' },
      ],
      timing: { away: [2000, 3500], around: [800, 1500], atPlayer: [600, 1200] },
      decor: 'library'
    },
    {
      id: 'elevator', name: '电梯', icon: '🛗',
      bgClass: 'elevator', floorClass: 'elevator',
      target: 4,
      npcs: [
        { id: 0, emoji: '👨‍💻', x: 22, label: '路人甲' },
        { id: 1, emoji: '👩‍🦰', x: 50, label: '路人乙' },
        { id: 2, emoji: '🧔', x: 76, label: '路人丙' },
      ],
      timing: { away: [1500, 2800], around: [400, 900], atPlayer: [800, 1500] },
      decor: 'elevator'
    },
    {
      id: 'meeting', name: '会议室', icon: '📋',
      bgClass: 'meeting', floorClass: 'meeting',
      target: 5,
      npcs: [
        { id: 0, emoji: '👨‍💼', x: 12, label: '经理' },
        { id: 1, emoji: '👩‍💼', x: 30, label: '主管' },
        { id: 2, emoji: '👨‍🔬', x: 48, label: '开发' },
        { id: 3, emoji: '👩‍🎨', x: 66, label: '设计' },
        { id: 4, emoji: '👨‍⚖️', x: 84, label: '老板' },
      ],
      timing: { away: [1200, 2200], around: [600, 1000], atPlayer: [1000, 2000] },
      decor: 'meeting'
    }
  ];

  const MAX_LIVES = 3;
  const LS_KEY = 'sneak_the_fart_data';

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    screen: 'title',       // title | intro | game | scene-done | victory | gameover
    currentSceneIdx: 0,
    sceneProgress: 0,      // successful farts in current scene
    lives: MAX_LIVES,
    totalSuccess: 0,
    settings: { sfx: true, haptic: true },

    // Per-NPC state (set up during scene init)
    npcStates: [],          // { lookState, timer, el, speechEl, indicatorEl }

    // Player state
    playerState: 'idle',   // idle | farting | caught
    canAct: true,
    riskLevel: 'safe',     // safe | warn | danger

    // Timers
    gameTimer: null,
    npcTimers: [],
    animFrame: null,

    // Best record
    best: { scenesCompleted: 0, totalSuccess: 0, gamesPlayed: 0 }
  };

  // ============================================================
  // DOM REFS
  // ============================================================
  const $ = id => document.getElementById(id);
  const dom = {};

  function cacheDom() {
    dom.screens = {
      title: $('screen-title'),
      intro: $('screen-intro'),
      game: $('screen-game'),
      sceneDone: $('screen-scene-done'),
      victory: $('screen-victory'),
      gameover: $('screen-gameover'),
      settings: $('screen-settings'),
    };
    dom.btnStart = $('btnStart');
    dom.btnBegin = $('btnBegin');
    dom.btnAction = $('actionBtn');
    dom.btnNextScene = $('btnNextScene');
    dom.btnReplay = $('btnReplay');
    dom.btnRetry = $('btnRetry');
    dom.titleBest = $('titleBest');
    dom.hudSceneIcon = $('hudSceneIcon');
    dom.hudSceneName = $('hudSceneName');
    dom.hudProgressFill = $('hudProgressFill');
    dom.hudProgressText = $('hudProgressText');
    dom.hudLives = $('hudLives');
    dom.sfxBtn = $('sfxBtn');
    dom.introIcon = $('introIcon');
    dom.introName = $('introName');
    dom.introTask = $('introTask');
    dom.introPreview = $('introPreview');
    dom.sceneArea = $('scene-area');
    dom.sceneDecor = $('sceneDecor');
    dom.npcContainer = $('npc-container');
    dom.playerChar = $('playerChar');
    dom.fartCloud = $('fartCloud');
    dom.caughtOverlay = $('caughtOverlay');
    dom.riskDot = $('riskDot');
    dom.riskLabel = $('riskLabel');
    dom.hintText = $('hintText');
    dom.sceneDoneIcon = $('sceneDoneIcon');
    dom.sceneDoneTitle = $('sceneDoneTitle');
    dom.sceneDoneDesc = $('sceneDoneDesc');
    dom.victoryStats = $('victoryStats');
    dom.gameoverStats = $('gameoverStats');
    dom.toggleSfx = $('toggleSfx');
    dom.toggleHaptic = $('toggleHaptic');
  }

  // ============================================================
  // AUDIO (Web Audio API)
  // ============================================================
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return audioCtx;
  }

  function playSound(name) {
    if (!state.settings.sfx) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();

    try {
      switch (name) {
        case 'fart': playFartSound(ctx); break;
        case 'caught': playCaughtSound(ctx); break;
        case 'success': playSuccessSound(ctx); break;
        case 'victory': playVictorySound(ctx); break;
        case 'gameover': playGameoverSound(ctx); break;
        case 'tick': playTickSound(ctx); break;
      }
    } catch {}
  }

  function playFartSound(ctx) {
    // Classic low-frequency fart: noise burst with resonance
    const dur = 0.35;
    // Noise
    const bufSize = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    // Low-pass filter
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 1.5;

    // Subtle oscillator for "bass" body
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 80;
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + dur * 0.6);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.5, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);

    noise.connect(lp); lp.connect(master);
    osc.connect(oscGain); oscGain.connect(master);
    master.connect(ctx.destination);
    noise.start(ctx.currentTime); noise.stop(ctx.currentTime + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
  }

  function playCaughtSound(ctx) {
    // Alarm: two alternating tones
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = i % 2 === 0 ? 440 : 660;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.1);
    }
  }

  function playSuccessSound(ctx) {
    // Pleasant ascending chime
    const t = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.2);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + i * 0.1); osc.stop(t + i * 0.1 + 0.25);
    });
  }

  function playVictorySound(ctx) {
    // Fanfare
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.15 + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + 0.4);
    });
  }

  function playGameoverSound(ctx) {
    // Descending sad trombone
    const t = ctx.currentTime;
    [400, 350, 300, 200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, t + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.2 + 0.25);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + i * 0.2); osc.stop(t + i * 0.2 + 0.3);
    });
  }

  function playTickSound(ctx) {
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.06);
  }

  // ============================================================
  // HAPTIC
  // ============================================================
  function vibrate(pattern) {
    if (!state.settings.haptic) return;
    try { navigator.vibrate && navigator.vibrate(pattern); } catch {}
  }

  // ============================================================
  // STORAGE
  // ============================================================
  function loadBest() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY));
      if (d) state.best = { ...state.best, ...d };
    } catch {}
  }

  function saveBest() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.best)); } catch {}
  }

  function updateBestDisplay() {
    if (state.best.scenesCompleted > 0 || state.best.totalSuccess > 0) {
      dom.titleBest.textContent =
        `🏆 最佳: 通过 ${state.best.scenesCompleted}/4 关 · 总计 ${state.best.totalSuccess} 次`;
    } else {
      dom.titleBest.textContent = '';
    }
  }

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(name) {
    Object.keys(dom.screens).forEach(k => {
      dom.screens[k].classList.toggle('active', k === name);
    });
    state.screen = name;
  }

  // ============================================================
  // SCENE DECORATIONS
  // ============================================================
  function buildDecor(scene) {
    dom.sceneDecor.innerHTML = '';
    dom.sceneArea.className = 'scene-bg-' + scene.bgClass;

    // Floor
    const floor = document.createElement('div');
    floor.className = 'scene-floor scene-floor-' + scene.floorClass;
    dom.sceneDecor.appendChild(floor);

    // Scene-specific decorations
    switch (scene.decor) {
      case 'office':
        // Desks
        for (let i = 0; i < 3; i++) {
          const desk = document.createElement('div');
          desk.className = 'decor-desk';
          if (i === 1) desk.style.left = '36%';
          else if (i === 2) desk.style.left = '68%';
          else desk.style.left = '5%';
          dom.sceneDecor.appendChild(desk);

          const mon = document.createElement('div');
          mon.className = 'decor-monitor';
          if (i === 1) { mon.style.left = '41%'; mon.style.width = '14%'; }
          else if (i === 2) { mon.style.left = '73%'; mon.style.width = '14%'; }
          else { mon.style.left = '11%'; }
          dom.sceneDecor.appendChild(mon);
        }
        // Window
        const win = document.createElement('div');
        win.className = 'decor-window'; win.style.right = '3%';
        dom.sceneDecor.appendChild(win);
        break;

      case 'library':
        // Bookshelves
        for (let side = 0; side < 2; side++) {
          const shelf = document.createElement('div');
          shelf.className = 'decor-bookshelf';
          if (side === 1) shelf.style.left = '80%';
          const colors = ['#E53E3E', '#DD6B20', '#D69E2E', '#38A169', '#319795', '#3182CE'];
          for (let b = 0; b < 8; b++) {
            const book = document.createElement('div');
            book.className = 'decor-book';
            book.style.background = colors[b % colors.length];
            if (b === 3 || b === 7) book.style.height = '12px';
            shelf.appendChild(book);
          }
          dom.sceneDecor.appendChild(shelf);
        }
        // Lamp
        const lamp = document.createElement('div');
        lamp.className = 'decor-lamp'; lamp.style.left = '46%';
        dom.sceneDecor.appendChild(lamp);
        break;

      case 'elevator':
        const door = document.createElement('div');
        door.className = 'decor-elevator-door';
        dom.sceneDecor.appendChild(door);
        const num = document.createElement('div');
        num.className = 'decor-elevator-num';
        num.textContent = '⬆ 3';
        dom.sceneDecor.appendChild(num);
        break;

      case 'meeting':
        // Whiteboard
        const wb = document.createElement('div');
        wb.className = 'decor-whiteboard';
        dom.sceneDecor.appendChild(wb);
        // Window
        const win2 = document.createElement('div');
        win2.className = 'decor-window'; win2.style.right = '3%';
        dom.sceneDecor.appendChild(win2);
        break;
    }
  }

  // ============================================================
  // NPC RENDERING
  // ============================================================
  function buildNPCs(scene) {
    dom.npcContainer.innerHTML = '';
    state.npcStates = [];

    scene.npcs.forEach((npcDef, i) => {
      const el = document.createElement('div');
      el.className = 'npc';
      el.style.left = npcDef.x + '%';
      el.style.bottom = (28 + Math.random() * 10) + '%';

      const charEl = document.createElement('div');
      charEl.className = 'npc-char';
      charEl.textContent = npcDef.emoji;
      el.appendChild(charEl);

      const speech = document.createElement('div');
      speech.className = 'npc-speech';
      el.appendChild(speech);

      const indicator = document.createElement('div');
      indicator.className = 'npc-attention-indicator safe';
      el.appendChild(indicator);

      dom.npcContainer.appendChild(el);

      // Initial NPC state
      state.npcStates.push({
        def: npcDef,
        el, charEl, speech, indicator,
        lookState: 'away',
        timer: randomTimer(scene, 'away'),
        lastReaction: null
      });
    });
  }

  function randomTimer(scene, lookState) {
    const range = scene.timing[lookState];
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  // ============================================================
  // NPC AI LOOP
  // ============================================================
  let npcLoopId = null;
  let riskCheckId = null;
  let lastRiskUpdate = 0;

  function startNPCLoop(scene) {
    stopNPCLoop();

    // Update NPC states periodically
    npcLoopId = setInterval(() => {
      state.npcStates.forEach((npc, i) => {
        npc.timer -= 100;
        if (npc.timer <= 0) {
          // Transition to next state
          const states = ['away', 'around', 'atPlayer'];
          const weights = getStateWeights(scene, i);
          const next = weightedRandom(states, weights);
          npc.lookState = next;
          npc.timer = randomTimer(scene, next);
          updateNPCDisplay(npc, scene, i);
        }
      });
      updateRisk();
    }, 100);

    // Refresh visuals at higher rate for smooth transitions
    riskCheckId = setInterval(() => {
      state.npcStates.forEach((npc, i) => {
        updateNPCDisplay(npc, scene, i);
      });
    }, 300);
  }

  function getStateWeights(scene, npcIdx) {
    // Weight transitions to make game fair but challenging
    const difficulty = state.currentSceneIdx;
    // Boss in meeting room stares more
    const isBoss = scene.id === 'meeting' && npcIdx === 4;

    if (isBoss) {
      // Boss looks at player more often
      return { away: 0.1, around: 0.2, atPlayer: 0.7 };
    }

    switch (difficulty) {
      case 0: return { away: 0.6, around: 0.25, atPlayer: 0.15 };  // Office - easy
      case 1: return { away: 0.4, around: 0.35, atPlayer: 0.25 };  // Library - medium
      case 2: return { away: 0.3, around: 0.3, atPlayer: 0.4 };    // Elevator - harder
      case 3: return { away: 0.2, around: 0.3, atPlayer: 0.5 };    // Meeting - hardest
      default: return { away: 0.4, around: 0.3, atPlayer: 0.3 };
    }
  }

  function weightedRandom(items, weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const item of items) {
      r -= weights[item];
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  function updateNPCDisplay(npc, scene, idx) {
    const char = npc.charEl;
    // Clear state classes
    char.className = 'npc-char';

    const stateClass = npc.lookState;
    char.classList.add(stateClass);

    // Indicator
    const ind = npc.indicator;
    ind.className = 'npc-attention-indicator';
    if (npc.lookState === 'away') ind.classList.add('safe');
    else if (npc.lookState === 'around') ind.classList.add('warn');
    else ind.classList.add('danger');
  }

  function stopNPCLoop() {
    if (npcLoopId) { clearInterval(npcLoopId); npcLoopId = null; }
    if (riskCheckId) { clearInterval(riskCheckId); riskCheckId = null; }
  }

  // ============================================================
  // RISK DETECTION
  // ============================================================
  function updateRisk() {
    const looking = state.npcStates.filter(n => n.lookState === 'atPlayer').length;
    const around = state.npcStates.filter(n => n.lookState === 'around').length;

    let level, dot, label, hint, hintClass;
    if (looking > 0) {
      level = 'danger';
      dot = '🔴'; label = '有人看着你！';
      hint = '⛔ 别放！'; hintClass = 'danger-text';
    } else if (around > 0) {
      level = 'warn';
      dot = '🟡'; label = '不太确定';
      hint = '⚠️ 小心...'; hintClass = '';
    } else {
      level = 'safe';
      dot = '🟢'; label = '安全！';
      hint = '💨 就是现在！'; hintClass = 'safe-text';
    }

    state.riskLevel = level;
    dom.riskDot.textContent = dot;
    dom.riskLabel.textContent = label;
    dom.hintText.textContent = hint;
    dom.hintText.className = 'hint-text' + (hintClass ? ' ' + hintClass : '');

    // Enable/disable action button based on safety
    if (state.screen === 'game' && state.canAct) {
      dom.btnAction.disabled = false;
    }
  }

  // ============================================================
  // PLAYER ACTIONS
  // ============================================================
  function doFart() {
    if (!state.canAct || state.screen !== 'game') return;
    if (state.playerState === 'farting' || state.playerState === 'caught') return;

    state.canAct = false;
    state.playerState = 'farting';

    // Player animation
    dom.playerChar.textContent = '😌';
    dom.playerChar.classList.remove('farting', 'caught');
    // Force reflow for animation restart
    void dom.playerChar.offsetWidth;
    dom.playerChar.classList.add('farting');

    // Sound
    playSound('fart');
    vibrate(80);

    // Show fart cloud
    showFartCloud();

    // Check if caught
    const lookingCount = state.npcStates.filter(n => n.lookState === 'atPlayer').length;

    if (lookingCount > 0) {
      // CAUGHT!
      setTimeout(() => onCaught(), 200);
    } else {
      // Success!
      setTimeout(() => onFartSuccess(), 300);
    }
  }

  function showFartCloud() {
    const cloud = dom.fartCloud;
    // Position above player
    const playerRect = dom.playerChar.getBoundingClientRect();
    const sceneRect = dom.sceneArea.getBoundingClientRect();
    cloud.style.left = '50%';
    cloud.style.bottom = '25%';
    cloud.style.transform = 'translateX(-50%)';
    cloud.className = 'fart-cloud';
    void cloud.offsetWidth;
    cloud.classList.add('show');

    // Spawn particles
    spawnFartParticles();

    // Reset cloud
    setTimeout(() => {
      cloud.className = 'fart-cloud';
    }, 1000);
  }

  function spawnFartParticles() {
    const emojis = ['💨', '🌫️', '😶‍🌫️', '💭'];
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('div');
      p.className = 'fart-particle';
      p.textContent = emojis[i % emojis.length];
      p.style.left = (35 + Math.random() * 30) + '%';
      p.style.bottom = (20 + Math.random() * 8) + '%';
      p.style.setProperty('--dx', (Math.random() * 40 - 20) + 'px');
      p.style.animationDelay = (i * 0.08) + 's';
      dom.sceneArea.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }
  }

  function onFartSuccess() {
    state.playerState = 'idle';
    dom.playerChar.textContent = '😏';
    setTimeout(() => {
      dom.playerChar.textContent = '😬';
      dom.playerChar.className = 'player-char';
    }, 600);

    // Increment progress
    state.sceneProgress++;
    state.totalSuccess++;
    updateHUD();

    // NPC reactions (mild - they might have smelled something)
    const nearby = state.npcStates.filter(n => n.lookState === 'around' || n.lookState === 'away');
    nearby.forEach((npc, i) => {
      setTimeout(() => {
        showSpeech(npc, '🤔 什么味道？', 1200);
        npc.charEl.classList.add('smelled');
        setTimeout(() => npc.charEl.classList.remove('smelled'), 800);
      }, i * 200);
    });

    playSound('success');
    vibrate(50);

    // Check scene complete
    const scene = SCENES[state.currentSceneIdx];
    if (state.sceneProgress >= scene.target) {
      setTimeout(() => onSceneComplete(), 800);
    } else {
      state.canAct = true;
    }
  }

  function onCaught() {
    state.playerState = 'caught';
    state.lives--;

    // Player reaction
    dom.playerChar.textContent = '😳';
    dom.playerChar.className = 'player-char';
    void dom.playerChar.offsetWidth;
    dom.playerChar.classList.add('caught');

    // Fart cloud fizzles
    dom.fartCloud.className = 'fart-cloud caught';

    // NPC reactions
    state.npcStates.forEach((npc, i) => {
      if (npc.lookState === 'atPlayer') {
        setTimeout(() => {
          npc.charEl.classList.add('shocked');
          showSpeech(npc, '😱 你！！！', 1500);
        }, i * 150);
      }
    });

    // Show caught overlay
    dom.caughtOverlay.classList.add('show');

    playSound('caught');
    vibrate([100, 80, 100, 80, 150]);

    // Hide caught overlay
    setTimeout(() => {
      dom.caughtOverlay.classList.remove('show');
    }, 1000);

    // Check game over
    if (state.lives <= 0) {
      setTimeout(() => onGameOver(), 1200);
    } else {
      setTimeout(() => {
        state.playerState = 'idle';
        dom.playerChar.textContent = '😬';
        dom.playerChar.className = 'player-char';
        updateHUD();
        state.canAct = true;
      }, 1200);
    }
  }

  function showSpeech(npc, text, duration) {
    npc.speech.textContent = text;
    npc.speech.classList.add('show');
    if (npc.lastReaction) clearTimeout(npc.lastReaction);
    npc.lastReaction = setTimeout(() => {
      npc.speech.classList.remove('show');
    }, duration);
  }

  // ============================================================
  // SCENE FLOW
  // ============================================================
  function startScene(sceneIdx) {
    const scene = SCENES[sceneIdx];
    state.currentSceneIdx = sceneIdx;
    state.sceneProgress = 0;
    state.canAct = true;
    state.playerState = 'idle';

    // Setup scene
    buildDecor(scene);
    buildNPCs(scene);

    // Reset player
    dom.playerChar.textContent = '😬';
    dom.playerChar.className = 'player-char';
    dom.fartCloud.className = 'fart-cloud';

    // Update HUD
    dom.hudSceneIcon.textContent = scene.icon;
    dom.hudSceneName.textContent = scene.name;
    updateHUD();

    // Show game screen
    showScreen('game');

    // Start NPC AI
    startNPCLoop(scene);
  }

  function updateHUD() {
    const scene = SCENES[state.currentSceneIdx];
    const progress = scene ? state.sceneProgress / scene.target : 0;
    dom.hudProgressFill.style.width = Math.min(progress * 100, 100) + '%';
    dom.hudProgressText.textContent = scene
      ? `${state.sceneProgress}/${scene.target}`
      : '0/0';

    // Lives
    const hearts = '❤️'.repeat(state.lives) + '🖤'.repeat(Math.max(0, MAX_LIVES - state.lives));
    dom.hudLives.textContent = hearts || '💀';
  }

  function onSceneComplete() {
    stopNPCLoop();
    state.canAct = false;

    const scene = SCENES[state.currentSceneIdx];
    dom.sceneDoneIcon.textContent = '🎉';
    dom.sceneDoneTitle.textContent = `${scene.icon} ${scene.name} 过关！`;
    dom.sceneDoneDesc.textContent = '完美潜行，无人发觉！';

    playSound('success');
    vibrate([50, 50, 100, 50, 150]);

    showScreen('scene-done');

    // Update best
    const isLast = state.currentSceneIdx >= SCENES.length - 1;
    if (isLast) {
      dom.btnNextScene.textContent = '🎊 查看结果';
    } else {
      dom.btnNextScene.textContent = '▶ 下一关';
    }
  }

  function nextScene() {
    const nextIdx = state.currentSceneIdx + 1;
    if (nextIdx >= SCENES.length) {
      onVictory();
    } else {
      // Show intro for next scene
      showSceneIntro(nextIdx);
    }
  }

  function showSceneIntro(idx) {
    const scene = SCENES[idx];
    dom.introIcon.textContent = scene.icon;
    dom.introName.textContent = scene.name;
    dom.introTask.innerHTML = `偷偷放屁 <strong>${scene.target}</strong> 次不被发现`;
    dom.introPreview.innerHTML = scene.npcs.map(n =>
      `<span class="intro-npc-preview">${n.emoji}</span>`
    ).join('');
    showScreen('intro');
  }

  // ============================================================
  // GAME END
  // ============================================================
  function onVictory() {
    stopNPCLoop();
    state.canAct = false;

    // Update best
    state.best.scenesCompleted = Math.max(state.best.scenesCompleted, SCENES.length);
    state.best.totalSuccess = Math.max(state.best.totalSuccess, state.totalSuccess);
    state.best.gamesPlayed++;
    saveBest();

    dom.victoryStats.innerHTML = `
      <span>✅ 通关全部 ${SCENES.length} 关</span>
      <span>💨 总计放屁 ${state.totalSuccess} 次</span>
      <span>❤️ 剩余生命 ${state.lives}</span>
    `;

    playSound('victory');
    vibrate([100, 50, 100, 50, 100, 100, 200]);

    showScreen('victory');
  }

  function onGameOver() {
    stopNPCLoop();
    state.canAct = false;

    dom.playerChar.textContent = '💀';

    // Update best
    state.best.scenesCompleted = Math.max(state.best.scenesCompleted, state.currentSceneIdx);
    state.best.totalSuccess = Math.max(state.best.totalSuccess, state.totalSuccess);
    state.best.gamesPlayed++;
    saveBest();

    const scene = SCENES[state.currentSceneIdx];
    dom.gameoverStats.innerHTML = `
      <span>💀 在 "${scene.icon} ${scene.name}" 翻车</span>
      <span>💨 成功放屁 ${state.sceneProgress}/${scene.target} 次</span>
      <span>🏆 总计 ${state.totalSuccess} 次</span>
    `;

    playSound('gameover');
    vibrate([200, 100, 200, 150, 300]);

    showScreen('gameover');
  }

  function resetGame() {
    stopNPCLoop();
    state.currentSceneIdx = 0;
    state.sceneProgress = 0;
    state.lives = MAX_LIVES;
    state.totalSuccess = 0;
    state.canAct = true;
    state.playerState = 'idle';

    dom.playerChar.textContent = '😬';
    dom.playerChar.className = 'player-char';
    dom.fartCloud.className = 'fart-cloud';
    dom.caughtOverlay.classList.remove('show');
  }

  function startGame() {
    resetGame();
    showSceneIntro(0);
  }

  // ============================================================
  // KEYBOARD & INPUT
  // ============================================================
  function handleKeyDown(e) {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();

      switch (state.screen) {
        case 'title':
          startGame();
          break;
        case 'intro':
          startScene(state.currentSceneIdx);
          break;
        case 'game':
          doFart();
          break;
        case 'scene-done':
          nextScene();
          break;
        case 'victory':
        case 'gameover':
          startGame();
          break;
      }
    }

    // M key for mute
    if (e.key === 'm' || e.key === 'M') {
      toggleSfx();
    }
  }

  function handleClickAction(e) {
    e.preventDefault();
    doFart();
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  function toggleSfx() {
    state.settings.sfx = !state.settings.sfx;
    dom.sfxBtn.textContent = state.settings.sfx ? '🔊' : '🔇';
    dom.toggleSfx.checked = state.settings.sfx;
    saveSettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem('sneak_the_fart_settings', JSON.stringify(state.settings));
    } catch {}
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('sneak_the_fart_settings'));
      if (s) Object.assign(state.settings, s);
    } catch {}
    dom.sfxBtn.textContent = state.settings.sfx ? '🔊' : '🔇';
    dom.toggleSfx.checked = state.settings.sfx;
    dom.toggleHaptic.checked = state.settings.haptic;
  }

  // ============================================================
  // RECENTLY PLAYED (hub tracking)
  // ============================================================
  function recordPlayed() {
    try {
      const recent = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
      const filtered = recent.filter(p => p.id !== 'sneak-the-fart');
      filtered.unshift({ id: 'sneak-the-fart', playedAt: Date.now() });
      localStorage.setItem('recentlyPlayed', JSON.stringify(filtered.slice(0, 10)));
    } catch {}
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    cacheDom();
    loadBest();
    loadSettings();
    updateBestDisplay();

    // Bind events
    document.addEventListener('keydown', handleKeyDown);

    dom.btnStart.addEventListener('click', startGame);
    dom.btnStart.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });

    dom.btnBegin.addEventListener('click', () => startScene(state.currentSceneIdx));
    dom.btnBegin.addEventListener('touchend', (e) => { e.preventDefault(); startScene(state.currentSceneIdx); });

    dom.btnAction.addEventListener('click', handleClickAction);
    dom.btnAction.addEventListener('touchend', (e) => { e.preventDefault(); doFart(); });

    dom.btnNextScene.addEventListener('click', nextScene);
    dom.btnNextScene.addEventListener('touchend', (e) => { e.preventDefault(); nextScene(); });

    dom.btnReplay.addEventListener('click', startGame);
    dom.btnReplay.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });

    dom.btnRetry.addEventListener('click', startGame);
    dom.btnRetry.addEventListener('touchend', (e) => { e.preventDefault(); startGame(); });

    dom.sfxBtn.addEventListener('click', toggleSfx);

    dom.toggleSfx.addEventListener('change', () => {
      state.settings.sfx = dom.toggleSfx.checked;
      dom.sfxBtn.textContent = state.settings.sfx ? '🔊' : '🔇';
      saveSettings();
    });
    dom.toggleHaptic.addEventListener('change', () => {
      state.settings.haptic = dom.toggleHaptic.checked;
      saveSettings();
    });

    // Touch-friendly: tap on scene area also triggers fart
    dom.sceneArea.addEventListener('click', (e) => {
      if (state.screen === 'game' && state.canAct) doFart();
    });
    dom.sceneArea.addEventListener('touchend', (e) => {
      if (state.screen === 'game' && state.canAct) {
        e.preventDefault();
        doFart();
      }
    });

    // Record play
    recordPlayed();

    console.log('💨 Sneak the Fart loaded!');
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
