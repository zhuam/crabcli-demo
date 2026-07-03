# UX Analysis Report: Drift King Arena (Issue #86)

> **Analyst**: ux-analyst (UX perspective)
> **Technical counterpart**: tech-analyst (coordinated via swarm messaging)
> **Date**: 2026-07-03
> **Status**: Final (agreed: Canvas 2D gameplay + DOM HUD overlay)

---

## 1. Design Philosophy

Drift King Arena is an **arcade-first drift scoring game**. The UX philosophy centers on:

- **Instant gratification** — 3-second boot to gameplay (no tutorial, no loading screens)
- **Short, intense sessions** — ≤3 minutes per round (Astrocade category compliance)
- **Sensory feedback loop** — every drift earns immediate visual + audio + haptic confirmation
- **Progression through mastery** — score thresholds unlock content, creating FOMO-driven "one more try"

---

## 2. User Flow & Screen Map

```
[Splash Screen] --(auto, 1.5s)--> [Garage/Ready] --(tap/Enter)--> [Gameplay]
                                                                          |
                                                                      [Overtime]
                                                                          |
                                                                    [Result Modal]
                                                                     /           \
                                                              [Retry]       [Garage (new)]
```

### Key UX requirements per Acceptance Criteria:

| AC | UX Implication | Design Decision |
|---|---|---|
| **3s boot, no tutorial** | Splash is purely cosmetic; game state initializes immediately | Splash fades into "Ready" state; controls shown as 1-line overlay ("方向键漂移得分"), not a tutorial |
| **≤3 min sessions** | Clock is the primary tension driver | Prominent countdown timer; last-10s heartbeat pulse |
| **Touch/mouse/kbd (≥2)** | All input types must feel native | Arrow keys + on-screen drift button + touch swipe detection |
| **Clear "Play Again" button** | Zero friction in result → retry flow | Large CTA button + Enter/Space rebound in result modal |
| **Sound + haptic feedback** | Every action has sensory confirmation | Web Audio API synth sounds; Navigator.vibrate() patterns per event |
| **High score → localStorage** | Best score tracked, displayed, shown on result | LS key: `drift_king_arena_best` |

---

## 3. Core Loop UX: Accelerate + Drift

### 3.1 The Drift Scoring Loop

```
Player presses Arrow (turn)
  → Car skids (visual: tire smoke + skid marks)
  → Drift angle calculated
  → Score increments proportionally to angle × speed
  → HUD shows live score + rank grade
  → Audio: skid loop sfx
  → Haptic: short buzz (proportional to drift intensity)
```

### 3.2 Graded Rank System (UX-recommended)

Tech-analyst agreed this is the right approach. I propose a **D→C→B→A→S** rank system:

| Rank | Threshold (score/sec) | Visual | Audio cue | Purpose |
|---|---|---|---|---|
| **D** | 0-5 | Gray, minimal | - | Starting point — discourages nothing |
| **C** | 6-15 | Bronze | Short chime | "You're drifting!" feedback |
| **B** | 16-30 | Silver | Rising tone | "Good run" — satisfaction |
| **A** | 31-50 | Gold | Fanfare | "Excellent!" — dopamine hit |
| **S** | 51+ | Rainbow/pulse | Extended fanfare | "God-like" — rare, memorable |

**Why this works**: Graded feedback creates **micro-goals within the 3-minute window**. A player who can't reach the target score still feels progress ("I got A grade on that drift!"). This is critical for the retry loop.

### 3.3 Combo / Chain System

Suggested additive mechanic:
- Consecutive drifts within 2s gap build a **combo multiplier** (×1, ×2, ×3, ×5)
- Break (straight line >2s) resets combo
- Combo displayed prominently near score with growing animation
- Audio pitch increases per combo level

**UX rationale**: Prevents the game from being "just hold arrow key" — rewards active steering modulation.

---

## 4. HUD Layout (Canvas gameplay + DOM overlay)

Agreed with tech-analyst: **Canvas 2D for gameplay rendering, DOM overlay for HUD elements**.

```
┌────────────────────────────────┐
│ [Rank: A] [Score: 2480] [⏱ 2:34] │  ← DOM top bar (fixed position)
│                                │
│       ┌──────────────┐        │
│       │   CANVAS     │        │
│       │  (top-down   │        │
│       │   track)     │        │
│       │              │        │
│       └──────────────┘        │
│                                │
│    [Combo: ×3] [⚡ Drift!]     │  ← DOM lower overlay
│                                │
│    ← drift trail / skid marks →│  ← Canvas rendering
└────────────────────────────────┘
```

### HUD Elements (priority order):

1. **Score** — top-center, largest font, rapid number animation on increment
2. **Timer** — top-right, red pulse under 30s, "⏱" icon
3. **Drift Rank** — top-left, color-coded letter, glow effect on rank-up
4. **Combo** — bottom-left, grows on combo build, fades on reset
5. **Speed** — bottom-right, simple bar or number (not critical, can be minimal)

### Accessibility concerns:
- HUD uses semantic HTML with `aria-live="polite"` for score/timer updates
- High-contrast mode via `prefers-contrast` media query
- Rank indication also in text (not just color)

---

## 5. Controls UX

### Arrow Keys (primary)
- ↑ : Accelerate
- ↓ : Brake/reverse
- ← → : Steer (left/right)
- Drift triggered automatically when steering at speed (threshold-based)
- Space : Quick restart from result screen

### Touch (secondary)
- Left/right screen zones for steering
- Top zone for accelerate
- Swipe detection for drift initiation

### Mouse (tertiary)
- Click-drag steering (left/right relative to car)
- Click to accelerate

### Control mapping screen:
- 1-line overlay shown on Ready screen only (not full tutorial)
- Text: `↑ 加速 · ← → 漂移 | 触屏点击左右侧`
- Auto-dismisses on first input

---

## 6. Track & Car Progression UX

### Unlock System

| Condition | Reward | UX Treatment |
|---|---|---|
| Reach 5000 pts (cumulative) | Unlock Track 2: "Neon Expressway" | Celebration modal + track select unlocked |
| Reach 15000 pts (cumulative) | Unlock Track 3: "Volcano Drift" | Same; track select shows lock/unlock |
| Reach 20000 pts (cumulative) | Unlock Car 2: "Widowmaker" | Garage tab shows new car with animation |
| Reach 50000 pts (cumulative) | Unlock Car 3: "Phantom" | Same |

### Track Selection UX
- Simple horizontal carousel (swipeable on touch)
- Locked tracks shown as silhouette + star count
- Tracks differ in: layout complexity, drift-optimal corners, visual theme

### Car Select UX (minimal)
- Named cars with different drift stats (handling vs speed bias)
- Stats shown as simple bars (Speed | Handling | Drift)
- 3 cars total (1 unlocked by default, 2 unlockable)

---

## 7. Result Screen & Retry Flow

### Layout (follows existing project pattern from `games/096-word-ladder-climb`)

```
┌────────────────────────────────┐
│  ┌─────────────────────────┐  │
│  │    🏆 / 💥              │  │  ← Win/loss tone indicator
│  │                          │  │
│  │    DRIFT KING! or        │  │  ← Title (win/fail)
│  │    CRASHED OUT           │  │
│  │                          │  │
│  │    分数: 3,420           │  │  ← Large score display
│  │    最高分: 3,420 ★ NEW  │  │  ← New best indicator
│  │                          │  │
│  │    最高漂移等级: S       │  │  ← Best rank achieved
│  │    最高连击: ×5          │  │  ← Best combo
│  │    漂移次数: 28          │  │  ← Drift count (trackable stat)
│  └─────────────────────────┘  │
│                                │
│  [再来一局]   [🏁 下一赛道]   │  ← Primary & secondary CTAs
│                                │
│  Enter / Space 快速重开        │  ← Keyboard hint
└────────────────────────────────┘
```

### Restart UX decisions:
- **"再来一局"** is the primary, most prominent button (large, colored, centered)
- Enter/Space works from result modal (existing project pattern)
- Timer auto-restart: after 10s idle on result screen, briefly flash "按 Enter 再来一局"
- No confirmation dialog on retry

---

## 8. Sound & Haptic Design

### Sound Map (via Web Audio API — follows project convention)

| Event | Sound | Duration |
|---|---|---|
| Drift start | Screech (noise → filter sweep) | continuous |
| Drift score tick | Short click/plink | 80ms |
| Rank up (C/B/A/S) | Ascending chime | 300-800ms |
| Combo increment | Pitch rise | 100ms |
| Combo reset | Descending slide | 200ms |
| Timer <30s | Tick (heartbeat) | 50ms |
| Win | Fanfare chord | 1.5s |
| Fail | Descending tone | 800ms |
| Unlock new content | Triumphant chord | 1s |

### Haptic Map (Navigator.vibrate)

| Event | Pattern | Meaning |
|---|---|---|
| Drift start | [30] | Light touch |
| Drift scoring (sustained) | [15, 15, 15, ...] | Continuous buzz at drift rate |
| Rank up | [50, 30, 80] | Rising intensity |
| Combo max | [100, 50, 100] | Peak excitement |
| Timer warning | [100] | Urgent pulse |
| Win | [60, 35, 90] | Success pattern (project convention) |
| Fail | [120, 50, 120] | Failure pattern (project convention) |

---

## 9. LocalStorage Strategy

Following the project pattern (`096-word-ladder-climb`):

```javascript
const LS = {
  BEST: 'drift_king_arena_best',
  SETTINGS: 'drift_king_arena_settings',
  UNLOCKS: 'drift_king_arena_unlocks'
};
```

### Stored data shape:

```javascript
// Best score record
{
  bestScore: 3420,
  highestRank: 'S',
  bestCombo: 5,
  gamesPlayed: 12,
  wins: 3          // score >= target
}

// Settings
{
  sfx: true,
  haptic: true
}

// Unlocks
{
  unlockedTracks: ['drift-arena'],  // first track always unlocked
  unlockedCars: ['starter'],
  cumulativeScore: 28400
}
```

---

## 10. Acceptance Criteria Mapping

| AC # | Requirement | UX Solution |
|---|---|---|
| AC1 | 3s boot, no tutorial | Splash screen (1.5s) → Ready state with 1-line control hint (auto-dismiss) → player taps Enter |
| AC2 | ≤3 min rounds | Timer starts at 3:00, counts down; game ends at 0:00 |
| AC3 | Touch/mouse/kbd (≥2 of 3) | Arrow keys (kbd) + touch zones (touch) both fully supported; mouse also supported via click-drag |
| AC4 | Clear "Play Again" button | Large "再来一局" primary button in result modal; Enter/Space also restart |
| AC5 | Sound + haptic | Full sound map + vibration patterns per event |
| AC6 | High score → localStorage | `drift_king_arena_best` key, displayed in result modal, new-best highlight |

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| **Drift physics feels wrong** | Core gameplay broken | Tune drift angle threshold & score ramp; playtest early |
| **Canvas performance on mobile** | Low FPS, poor UX | Limit particle count; use `requestAnimationFrame` + frame skip |
| **HUD occlusion on small screens** | Score/timer hard to read | Responsive sizing; critical HUD stays within safe area |
| **Touch controls vs arrow keys** | Imbalanced difficulty | Same drift angle math; touch zones configurable size |
| **Unlocks too grindy** | Player churn | First unlock at 5000 pts (~3-4 games); preview locked tracks as silhouettes |

---

## 12. Consensus with Tech-Analyst

**Agreed decisions** (via swarm messaging):
- ✅ **Canvas 2D** for gameplay rendering → enables smooth drift effects, tire marks, particle system
- ✅ **DOM overlay** for HUD elements → accessible, responsive, easier to style
- ✅ **Graded rank system** (D→C→B→A→S) → tech-analyst confirmed feasible via score-per-second threshold checks
- ✅ Shared project conventions: `game-frame.css`, IIFE pattern, Web Audio API, `Navigator.vibrate()`
