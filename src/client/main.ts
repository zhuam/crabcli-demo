import { ClientMessage, ServerMessage, Player, GAME_CONFIG, HighScoreEntry } from '../shared/types.js';

// ─── DOM refs ───
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const nameInput = $<HTMLInputElement>('name-input');
const joinBtn = $<HTMLButtonElement>('join-btn');
const lobbyWaiting = $<HTMLDivElement>('lobby-waiting');
const roomIdEl = $<HTMLDivElement>('room-id');
const playerListEl = $<HTMLDivElement>('player-list');
const countdownValue = $<HTMLDivElement>('countdown-value');
const qCounter = $<HTMLDivElement>('q-counter');
const qText = $<HTMLDivElement>('q-text');
const optionsGrid = $<HTMLDivElement>('options-grid');
const timeText = $<HTMLSpanElement>('time-text');
const timerCircle = $<SVGCircleElement & HTMLElement>('timer-circle');
const timerRing = $<HTMLDivElement>('timer-ring');
const answeredBar = $<HTMLDivElement>('answered-bar');
const resultsTitle = $<HTMLDivElement>('results-title');
const resultsList = $<HTMLDivElement>('results-list');
const highScoreArea = $<HTMLDivElement>('high-score-area');
const playAgainBtn = $<HTMLButtonElement>('play-again-btn');

// ─── State ───
let ws: WebSocket | null = null;
let playerId = '';
let playerName = '';
let myScore = 0;
let myRank = 0;
let currentQuestionId = '';
let selectedOption = -1;
let hasAnswered = false;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timeLeft = 0;

// ─── Sound ───
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* silent fail */ }
}

function sfxClick() { playTone(800, 0.08, 'square', 0.1); }
function sfxCorrect() { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.15), 200); }
function sfxWrong() { playTone(200, 0.3, 'sawtooth', 0.1); }
function sfxCountdown() { playTone(440, 0.1, 'square', 0.08); }
function sfxGameOver() { playTone(784, 0.15); setTimeout(() => playTone(988, 0.15), 150); setTimeout(() => playTone(1175, 0.3), 300); }
function sfxTick() { playTone(600, 0.04, 'square', 0.05); }

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* silent */ }
}

// ─── Screen management ───
function showScreen(name: string) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

// ─── High Score ───
function getHighScores(): HighScoreEntry[] {
  try {
    return JSON.parse(localStorage.getItem('trivia_royale_highscores') || '[]');
  } catch { return []; }
}

function saveHighScore(score: number, rank: number, playerCount: number): boolean {
  const scores = getHighScores();
  const entry: HighScoreEntry = { score, rank, playerCount, date: new Date().toISOString() };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 10);
  localStorage.setItem('trivia_royale_highscores', JSON.stringify(top));
  return top[0]?.score === score && top[0]?.date === entry.date;
}

function getBestScore(): number {
  const scores = getHighScores();
  return scores.length > 0 ? scores[0].score : 0;
}

// ─── Connect ───
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to server');
  };

  ws.onmessage = (event) => {
    const msg: ServerMessage = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    console.log('Disconnected');
  };

  ws.onerror = (err) => {
    console.error('WebSocket error', err);
  };
}

function send(msg: ClientMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── Message Handler ───
function handleServerMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'joined':
      playerId = msg.playerId;
      playerName = msg.name;
      lobbyWaiting.style.display = 'block';
      roomIdEl.textContent = `Room: ${msg.roomId}`;
      joinBtn.style.display = 'none';
      nameInput.style.display = 'none';
      vibrate(50);
      break;

    case 'room_update':
      renderPlayerList(msg.roomState.players);
      break;

    case 'countdown':
      showScreen('countdown');
      countdownValue.textContent = String(msg.value);
      countdownValue.style.animation = 'none';
      void countdownValue.offsetHeight; // reflow
      countdownValue.style.animation = 'countPulse 1s ease';
      sfxCountdown();
      vibrate(100);
      break;

    case 'question':
      showScreen('question');
      currentQuestionId = msg.question.id;
      hasAnswered = false;
      selectedOption = -1;
      qCounter.textContent = `Q${msg.questionIndex + 1}/${msg.totalQuestions}`;
      qText.textContent = msg.question.text;
      renderOptions(msg.question.options);
      startTimer(msg.timeLeft);
      break;

    case 'time_sync':
      updateTimer(msg.timeLeft);
      break;

    case 'answer_result':
      clearTimer();
      revealAnswer(msg.correctIndex, msg.yourScore, msg.yourRank);
      myScore = msg.yourScore;
      myRank = msg.yourRank;
      if (selectedOption === msg.correctIndex) {
        sfxCorrect();
        vibrate([50, 50, 50]);
      } else {
        sfxWrong();
        vibrate(200);
      }
      break;

    case 'game_over':
      showScreen('results');
      renderResults(msg.rankings, msg.winnerId, msg.yourRank, msg.yourScore);
      sfxGameOver();
      vibrate([100, 50, 100, 50, 200]);
      const isNewHigh = saveHighScore(msg.yourScore, msg.yourRank, msg.rankings.length);
      if (isNewHigh) {
        highScoreArea.innerHTML = '<div class="high-score-badge">🎉 NEW HIGH SCORE!</div>';
      } else {
        highScoreArea.innerHTML = `<div style="color:var(--text-dim);font-size:0.85rem;">Best: ${getBestScore()} pts</div>`;
      }
      break;

    case 'error':
      console.error('Server error:', msg.code, msg.message);
      break;
  }
}

// ─── Rendering ───
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderPlayerList(players: Player[]) {
  playerListEl.innerHTML = players
    .map(p => `<span class="player-chip">${escapeHtml(p.name)}</span>`)
    .join('');
}

function renderOptions(options: [string, string, string, string]) {
  const labels = ['A', 'B', 'C', 'D'];
  const isDesktop = !('ontouchstart' in window);

  optionsGrid.innerHTML = options.map((opt, i) => `
    <button class="option-btn" data-index="${i}" tabindex="0" aria-label="Option ${labels[i]}: ${opt}">
      ${isDesktop ? `<span class="key-hint">${labels[i]}/${i + 1}</span>` : ''}
      ${opt}
    </button>
  `).join('');

  // Bind click/touch
  optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn as HTMLElement).dataset.index!);
      selectAnswer(idx);
    });
  });
}

function selectAnswer(index: number) {
  if (hasAnswered) return;
  hasAnswered = true;
  selectedOption = index;

  // Visual feedback
  optionsGrid.querySelectorAll('.option-btn').forEach((btn, i) => {
    if (i === index) btn.classList.add('selected');
  });

  sfxClick();
  vibrate(30);

  answeredBar.textContent = '✓ Answer locked in!';

  send({
    type: 'answer',
    questionId: currentQuestionId,
    optionIndex: index,
    timestamp: Date.now(),
  });
}

function revealAnswer(correctIndex: number, score: number, rank: number) {
  optionsGrid.querySelectorAll('.option-btn').forEach((btn, i) => {
    if (i === correctIndex) {
      btn.classList.add('reveal-correct');
    } else if (i === selectedOption && i !== correctIndex) {
      btn.classList.add('wrong');
    }
  });

  // Show score popup briefly
  const scorePopup = document.createElement('div');
  scorePopup.className = 'reveal-score';
  scorePopup.textContent = `${score} pts • Rank #${rank}`;
  const questionScreen = $('screen-question');
  questionScreen.appendChild(scorePopup);
  setTimeout(() => scorePopup.remove(), 2500);
}

function renderResults(rankings: Player[], winnerId: string, yourRank: number, yourScore: number) {
  const isWinner = winnerId === playerId;
  resultsTitle.textContent = isWinner ? '🏆 YOU WIN!' : 'GAME OVER';
  resultsTitle.className = `results-title ${isWinner ? 'winner' : ''}`;

  resultsList.innerHTML = rankings.map((p, i) => {
    const isYou = p.id === playerId;
    const rankClass = i < 3 ? `rank-${i + 1}` : '';
    return `
      <div class="result-row ${isYou ? 'you' : ''}" style="animation-delay:${i * 0.1}s">
        <span class="rank-badge ${rankClass}">${i + 1}</span>
        <span class="result-name">${escapeHtml(p.name)}${isYou ? ' (You)' : ''}</span>
        <span class="result-score">${p.score} pts</span>
      </div>
    `;
  }).join('');
}

// ─── Timer ───
const CIRCLE_CIRCUMFERENCE = 150.8; // 2 * PI * 24

function startTimer(seconds: number) {
  timeLeft = seconds;
  updateTimerDisplay();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearTimer();
      timeLeft = 0;
    }
    updateTimerDisplay();
    if (timeLeft <= 3 && timeLeft > 0) {
      sfxTick();
      timerRing.classList.add('urgent');
    }
  }, 1000);
}

function updateTimer(seconds: number) {
  timeLeft = seconds;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  timeText.textContent = String(Math.max(0, timeLeft));
  const total = GAME_CONFIG.SECONDS_PER_QUESTION;
  const offset = CIRCLE_CIRCUMFERENCE * (1 - timeLeft / total);
  timerCircle.style.strokeDashoffset = String(offset);
  timerRing.classList.toggle('urgent', timeLeft <= 3);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ─── Input: Keyboard ───
document.addEventListener('keydown', (e) => {
  // Resume audio context on first interaction
  if (audioCtx.state === 'suspended') audioCtx.resume();

  // Number keys 1-4
  if (e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    selectAnswer(parseInt(e.key) - 1);
    return;
  }

  // Letter keys A-D
  const letterMap: Record<string, number> = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
  const lower = e.key.toLowerCase();
  if (lower in letterMap) {
    e.preventDefault();
    selectAnswer(letterMap[lower]);
    return;
  }

  // Enter to join
  if (e.key === 'Enter' && $('screen-lobby').classList.contains('active')) {
    joinGame();
  }
});

// ─── Event bindings ───
joinBtn.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  joinGame();
});

function joinGame() {
  const name = nameInput.value.trim() || `Player-${Math.floor(Math.random() * 9000 + 1000)}`;
  playerName = name;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connect();
    // Wait for connection then join
    const waitJoin = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        clearInterval(waitJoin);
        send({ type: 'join', name });
      }
    }, 100);
  } else {
    send({ type: 'join', name });
  }
}

playAgainBtn.addEventListener('click', () => {
  sfxClick();
  send({ type: 'play_again' });
  // Reset UI
  showScreen('lobby');
  lobbyWaiting.style.display = 'none';
  joinBtn.style.display = '';
  nameInput.style.display = '';
  myScore = 0;
  myRank = 0;
  // Reconnect
  connect();
  const name = playerName;
  const waitJoin = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      clearInterval(waitJoin);
      send({ type: 'join', name });
    }
  }, 100);
});

// ─── Boot ───
connect();
