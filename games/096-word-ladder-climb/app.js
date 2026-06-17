(() => {
  'use strict';

  const CONFIG = {
    MAX_GAME_SEC: 180,
    POINTS_PER_RUNG: 180,
    TIME_BONUS: 8,
    INVALID_PENALTY: 25,
    THEMES: [
      {
        id: 'sky-camp', name: 'Sky Camp', start: 'pace', target: 'peak', path: ['pace', 'pack', 'peck', 'peek', 'peak'],
        words: ['pace', 'pack', 'pact', 'fact', 'fast', 'past', 'pest', 'peck', 'pick', 'pink', 'peek', 'peak', 'pear', 'hear', 'heat', 'heal']
      },
      {
        id: 'kitchen-heat', name: 'Kitchen Heat', start: 'cold', target: 'warm', path: ['cold', 'cord', 'word', 'worm', 'warm'],
        words: ['cold', 'cord', 'card', 'ward', 'word', 'worm', 'warm', 'farm', 'form', 'foam', 'roam', 'road', 'load', 'loan', 'loaf']
      },
      {
        id: 'neon-city', name: 'Neon City', start: 'dark', target: 'melt', path: ['dark', 'dank', 'rank', 'rant', 'rent', 'bent', 'belt', 'melt'],
        words: ['dark', 'dank', 'rank', 'rant', 'rent', 'bent', 'belt', 'melt', 'meow', 'glow', 'slow', 'slot', 'slit', 'slim', 'glim']
      }
    ]
  };

  const LS = {
    BEST: 'word_ladder_climb_best',
    SETTINGS: 'word_ladder_climb_settings'
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    themePill: $('themePill'), bestPill: $('bestPill'), targetTitle: $('targetTitle'), timerValue: $('timerValue'),
    ladderTrack: $('ladderTrack'), guessForm: $('guessForm'), guessInput: $('guessInput'), submitBtn: $('submitBtn'),
    feedbackText: $('feedbackText'), feedbackDot: $('feedbackDot'), slotRow: $('slotRow'), keyboardRow: $('keyboardRow'),
    scoreValue: $('scoreValue'), stepValue: $('stepValue'), invalidValue: $('invalidValue'), themeProgress: $('themeProgress'),
    hintBtn: $('hintBtn'), newThemeBtn: $('newThemeBtn'), muteBtn: $('muteBtn'), resultModal: $('resultModal'),
    resultTone: $('resultTone'), resultTitle: $('resultTitle'), resultScore: $('resultScore'), resultSummary: $('resultSummary'),
    resultPath: $('resultPath'), resultBest: $('resultBest'), newBestRow: $('newBestRow'), restartBtn: $('restartBtn'),
    modalThemeBtn: $('modalThemeBtn')
  };

  let audioCtx;
  let timerId = 0;
  let activeSlot = 0;
  let themeIndex = 0;
  let state;

  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  function defaultBest() {
    return { bestScore: 0, fastestSec: null, fewestSteps: null, longestLadder: 0, gamesPlayed: 0, wins: 0 };
  }

  function normalizeWord(word) {
    return String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function diffCount(a, b) {
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
    return diff;
  }

  function validateGuess(raw, currentWord, theme, usedWords) {
    const guess = normalizeWord(raw);
    if (guess.length !== currentWord.length) return { ok: false, guess, reason: `Use ${currentWord.length} letters / 请输入 ${currentWord.length} 个字母` };
    if (guess === currentWord) return { ok: false, guess, reason: 'Change one letter / 不能提交当前词' };
    if (diffCount(guess, currentWord) !== 1) return { ok: false, guess, reason: 'Change exactly one letter / 只能改一个字母' };
    if (!theme.words.includes(guess)) return { ok: false, guess, reason: 'Not in this theme word list / 不在本主题词库中' };
    if (usedWords.includes(guess)) return { ok: false, guess, reason: 'Already used / 这个词已经用过' };
    return { ok: true, guess, reason: 'Valid rung / 攀爬成功' };
  }

  function ensureAudio() {
    if (!state.settings.sfx) return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur = 0.08, type = 'square', gainValue = 0.035, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }
  function sfxValid() { tone(520, .08); tone(780, .1, 'square', .035, .07); }
  function sfxInvalid() { tone(160, .14, 'sawtooth', .025); }
  function sfxWin() { [523, 659, 784, 1046].forEach((f, i) => tone(f, .12, 'triangle', .04, i * .08)); }
  function sfxFail() { [330, 247, 165].forEach((f, i) => tone(f, .14, 'sawtooth', .03, i * .1)); }
  function sfxRestart() { tone(440, .06, 'triangle'); }
  function sfxKey() { tone(360, .025, 'square', .015); }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }

  function gameSec() {
    return Math.floor((Date.now() - state.startTs) / 1000);
  }

  function remainingSec() {
    return Math.max(0, CONFIG.MAX_GAME_SEC - gameSec());
  }

  function currentTheme() { return CONFIG.THEMES[themeIndex % CONFIG.THEMES.length]; }
  function currentWord() { return state.ladder[state.ladder.length - 1]; }

  function scoreNow(final = false) {
    const timeBonus = final ? remainingSec() * CONFIG.TIME_BONUS : 0;
    const rungPoints = (state.ladder.length - 1) * CONFIG.POINTS_PER_RUNG;
    const victoryBonus = state.result === 'won' ? 500 : 0;
    return Math.max(0, rungPoints + timeBonus + victoryBonus - state.invalid * CONFIG.INVALID_PENALTY);
  }

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function wordHtml(word) {
    return `<div class="word" style="--word-len:${word.length}">${word.split('').map(ch => `<span class="letter">${ch.toUpperCase()}</span>`).join('')}</div>`;
  }

  function renderLadder() {
    const theme = currentTheme();
    const target = theme.target;
    const blanks = Math.max(0, theme.path.length - state.ladder.length - 1);
    const rungs = [];
    rungs.push(`<div class="rung target"><span class="rung-label">Top</span>${wordHtml(target)}</div>`);
    for (let i = blanks; i > 0; i--) {
      rungs.push(`<div class="rung empty"><span class="rung-label">Rung ${state.ladder.length + i}</span>${wordHtml('?'.repeat(target.length))}</div>`);
    }
    [...state.ladder].reverse().forEach((word, idx) => {
      const label = idx === 0 ? 'Now' : (idx === state.ladder.length - 1 ? 'Start' : `Rung ${state.ladder.length - idx}`);
      const cls = idx === 0 ? 'current' : 'accepted';
      rungs.push(`<div class="rung ${cls}"><span class="rung-label">${label}</span>${wordHtml(word)}</div>`);
    });
    els.ladderTrack.innerHTML = rungs.join('');
  }

  function renderSlots() {
    const value = (els.guessInput.value || '').padEnd(currentWord().length, ' ');
    els.slotRow.innerHTML = '';
    for (let i = 0; i < currentWord().length; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slot${i === activeSlot ? ' active' : ''}`;
      btn.textContent = value[i].trim().toUpperCase() || '·';
      btn.setAttribute('aria-label', `编辑第 ${i + 1} 个字母`);
      btn.addEventListener('pointerdown', () => { activeSlot = i; renderSlots(); els.guessInput.focus(); });
      els.slotRow.appendChild(btn);
    }
  }

  function renderKeyboard() {
    const letters = Array.from(new Set(currentTheme().words.join('').split(''))).sort();
    els.keyboardRow.innerHTML = '';
    for (const ch of letters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key';
      btn.textContent = ch.toUpperCase();
      btn.addEventListener('pointerdown', () => setSlotLetter(ch));
      els.keyboardRow.appendChild(btn);
    }
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'key action'; del.textContent = '删除';
    del.addEventListener('pointerdown', () => setSlotLetter(''));
    els.keyboardRow.appendChild(del);
  }

  function render() {
    const theme = currentTheme();
    const best = lsGet(LS.BEST, defaultBest());
    const rem = remainingSec();
    document.documentElement.style.setProperty('--word-len', String(theme.target.length));
    els.themePill.textContent = `主题词库：${theme.name}`;
    els.bestPill.textContent = `本地最高分 ${best.bestScore || 0}`;
    els.targetTitle.textContent = theme.target.toUpperCase();
    els.timerValue.textContent = fmt(rem);
    els.scoreValue.textContent = String(scoreNow());
    els.stepValue.textContent = `${state.ladder.length - 1}/${theme.path.length - 1}`;
    els.invalidValue.textContent = String(state.invalid);
    els.themeProgress.style.width = `${Math.min(100, ((state.ladder.length - 1) / (theme.path.length - 1)) * 100)}%`;
    els.guessInput.maxLength = theme.target.length;
    els.muteBtn.setAttribute('aria-pressed', state.settings.sfx ? 'false' : 'true');
    els.muteBtn.textContent = state.settings.sfx ? '🔊 音效' : '🔇 静音';
    renderLadder();
    renderSlots();
  }

  function setFeedback(text, mode = 'neutral') {
    const box = els.feedbackText.parentElement;
    box.classList.toggle('ok', mode === 'ok');
    box.classList.toggle('bad', mode === 'bad');
    els.feedbackText.textContent = text;
  }

  function setSlotLetter(ch) {
    if (state.finished) return;
    const len = currentWord().length;
    const chars = (els.guessInput.value || '').toLowerCase().padEnd(len, ' ').slice(0, len).split('');
    chars[activeSlot] = ch;
    els.guessInput.value = chars.join('').replace(/\s/g, '').toUpperCase();
    activeSlot = Math.min(len - 1, activeSlot + (ch ? 1 : 0));
    sfxKey();
    renderSlots();
    els.guessInput.focus();
  }

  function submitGuess() {
    if (state.finished) return;
    const theme = currentTheme();
    const result = validateGuess(els.guessInput.value, currentWord(), theme, state.ladder);
    if (!result.ok) {
      state.invalid++;
      setFeedback(result.reason, 'bad');
      sfxInvalid();
      vibrate([35, 25, 35]);
      render();
      return;
    }
    state.ladder.push(result.guess);
    els.guessInput.value = result.guess.toUpperCase();
    activeSlot = 0;
    setFeedback(`锁定 ${result.guess.toUpperCase()}，继续向 ${theme.target.toUpperCase()} 攀登。`, 'ok');
    sfxValid();
    vibrate(18);
    if (result.guess === theme.target) {
      finishGame('won', 'Summit reached', '成功爬到顶层通关。');
      return;
    }
    render();
  }

  function updateBest(finalScore) {
    const best = lsGet(LS.BEST, defaultBest());
    const sec = gameSec();
    best.gamesPlayed += 1;
    best.longestLadder = Math.max(best.longestLadder || 0, state.ladder.length);
    if (finalScore > (best.bestScore || 0)) best.bestScore = finalScore;
    if (state.result === 'won') {
      best.wins += 1;
      if (best.fastestSec === null || sec < best.fastestSec) best.fastestSec = sec;
      const steps = state.ladder.length - 1;
      if (best.fewestSteps === null || steps < best.fewestSteps) best.fewestSteps = steps;
    }
    lsSet(LS.BEST, best);
    return best;
  }

  function finishGame(result, title, reason) {
    if (state.finished) return;
    state.finished = true;
    state.result = result;
    clearInterval(timerId);
    const finalScore = scoreNow(true);
    const previous = lsGet(LS.BEST, defaultBest()).bestScore || 0;
    const best = updateBest(finalScore);
    const won = result === 'won';
    won ? sfxWin() : sfxFail();
    vibrate(won ? [60, 35, 90] : [120, 50, 120]);
    els.resultTone.classList.toggle('win', won);
    els.resultTone.classList.toggle('fail', !won);
    els.resultTitle.textContent = title;
    els.resultScore.textContent = String(finalScore);
    els.resultSummary.textContent = `${reason} 用时 ${fmt(gameSec())}，无效尝试 ${state.invalid} 次。`;
    els.resultPath.textContent = state.ladder.map(w => w.toUpperCase()).join(' → ');
    els.resultBest.textContent = String(best.bestScore || 0);
    els.newBestRow.hidden = finalScore <= previous;
    els.resultModal.removeAttribute('hidden');
    els.restartBtn.focus();
    render();
  }

  function tick() {
    if (!state.finished && gameSec() >= CONFIG.MAX_GAME_SEC) {
      finishGame('failed', 'Climb failed', '时间归零，未能爬到顶层。');
      return;
    }
    render();
  }

  function restartGame(changeTheme = false) {
    const shouldPlayRestartSfx = !!state;
    if (changeTheme) themeIndex = (themeIndex + 1) % CONFIG.THEMES.length;
    const theme = currentTheme();
    const settings = lsGet(LS.SETTINGS, { sfx: true });
    state = { startTs: Date.now(), ladder: [theme.start], invalid: 0, finished: false, result: 'playing', settings };
    activeSlot = 0;
    els.guessInput.value = theme.start.toUpperCase();
    els.resultModal.setAttribute('hidden', '');
    setFeedback(`从 ${theme.start.toUpperCase()} 出发，目标 ${theme.target.toUpperCase()}。`, 'neutral');
    clearInterval(timerId);
    timerId = setInterval(tick, 250);
    renderKeyboard();
    render();
    if (shouldPlayRestartSfx) sfxRestart();
    setTimeout(() => els.guessInput.focus(), 0);
  }

  function hint() {
    const theme = currentTheme();
    const next = theme.path[state.ladder.length] || theme.target;
    const current = currentWord();
    const idx = [...next].findIndex((ch, i) => ch !== current[i]);
    setFeedback(`提示：可以尝试改第 ${idx + 1} 位字母，目标方向是 ${theme.target.toUpperCase()}。`, 'neutral');
    sfxKey();
  }

  function bindEvents() {
    els.guessForm.addEventListener('submit', (e) => { e.preventDefault(); submitGuess(); });
    els.guessInput.addEventListener('input', () => {
      els.guessInput.value = normalizeWord(els.guessInput.value).slice(0, currentWord().length).toUpperCase();
      renderSlots();
    });
    els.guessInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); els.guessInput.value = ''; renderSlots(); }
      if (e.key === 'ArrowLeft') { activeSlot = Math.max(0, activeSlot - 1); renderSlots(); }
      if (e.key === 'ArrowRight') { activeSlot = Math.min(currentWord().length - 1, activeSlot + 1); renderSlots(); }
    });
    document.addEventListener('keydown', (e) => {
      if (state.finished && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); restartGame(false); }
    });
    els.hintBtn.addEventListener('pointerdown', hint);
    els.newThemeBtn.addEventListener('pointerdown', () => restartGame(true));
    els.modalThemeBtn.addEventListener('click', () => restartGame(true));
    els.restartBtn.addEventListener('click', () => restartGame(false));
    els.muteBtn.addEventListener('click', () => {
      state.settings.sfx = !state.settings.sfx;
      lsSet(LS.SETTINGS, state.settings);
      render();
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  window.WordLadderClimb = { validateGuess, diffCount, normalizeWord, CONFIG, LS };
  bindEvents();
  restartGame(false);
})();
