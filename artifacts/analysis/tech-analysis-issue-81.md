# Speed Cube Solver — Technical Analysis Report

**Issue**: #81 — [Game 081] Speed Cube Solver
**Analyst**: tech-analyst (swarm `t1a-tech-analysis`)
**Date**: 2026-07-10
**Status**: ✅ Complete

---

## 1. 3D Rendering Approach

### Recommendation: Three.js via importmap CDN

Use **Three.js r0.160+** loaded from CDN via importmap (proven pattern in this repo — see `005-sky-guardian-3d/index.html:400-406`):

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
  }
}
</script>
```

**Rationale**: This repo already uses Three.js for 3D games. Keeps build-free workflow (no bundler needed) and the module importmap works in all evergreen browsers.

### Initial Camera Setup

- Position: `Camera.position.set(4, 4, 4)` — isometric 45° down angle
- Target: `camera.lookAt(0, 0, 0)` — cube center
- OrbitControls with `controls.enableRotate = false` — lock orbit to prevent accidental view drift
- Lighting: 1 ambient + 1 directional from upper-right for sticker clarity

### Render Loop

- Use `requestAnimationFrame` for the main loop
- Three scenes: UI overlay (CSS/DOM), cube canvas (Three.js), particle/effects (optional second renderer layer)
- Anti-aliasing: enabled with `{ antialias: true }` in WebGLRenderer constructor

---

## 2. Cube Data Model & Rotation Mechanics

### Core Data Structure

**Flat array + lookup table** (recommended over nested objects for performance):

```js
// 3×3 Cube: 6 faces × 9 stickers = 54 elements
// Each element: { color, mesh, faceId, row, col }
// Index formula: faceId * 9 + row * 3 + col

const CUBE_CONFIG = {
  3: { size: 3, stickers: 54, layers: 3 },
  4: { size: 4, stickers: 96, layers: 4 },
  5: { size: 5, stickers: 150, layers: 5 }
};
```

**Face mapping**:
| Face | Axis | Direction |
|------|------|-----------|
| U (up) | Y | +Y |
| D (down) | Y | -Y |
| F (front) | Z | +Z |
| B (back) | Z | -Z |
| R (right) | X | +X |
| L (left) | X | -X |

### Rotation Mechanics

**Layer rotation pipeline**:
1. **Selection**: Raycaster detects clicked face → determine which face/layer was hit
2. **Layer gather**: Collect all 9 (3×3) / 16 (4×4) / 25 (5×5) cubelets in the target layer
3. **Group**: Create a temporary `THREE.Group` parent, add selected cubelets
4. **Animate**: Rotate group 90° around face normal axis with `easeInOutCubic` easing (250-350ms)
5. **Detach**: After animation completes, detach cubelets from group, update each cubelet's world matrix
6. **Resticker**: Recalculate face colors based on new world positions

**Drag threshold**: Trigger rotation when drag delta exceeds **25% of face width** rather than on drag-end. Prevents accidental quarter-turns from micro-drags.

**Scramble sequence**: Pre-compute 20-25 random moves, animate each with 150ms interval using `setTimeout` chain. Disable user interaction during scramble. Validate final state is solvable.

### Multi-layer Support for 4×4 and 5×5

- Differentiate "outer layer" vs "inner layer" rotation
- For 4×4: R (outer right), r (inner right) — detected based on which sticker row/column was clicked
- Use face-relative coordinate system: each face has (row, col) where an inner click (< 1 or > size-2) triggers inner-layer rotation

---

## 3. Scramble Algorithm

### Approach: Kociemba-like simplification for 3×3, reduction method for 4×5×5

**3×3**: Use a pre-computed random 20-25 move sequence in Singmaster notation (U, D, L, R, F, B, U', D', L', R', F', B'). Reject sequences that cancel consecutive same-face moves (e.g., U U').

**4×4 / 5×5**: Extend notation to include inner-layer moves: Uw, Dw, Rw, Lw, Fw, Bw for wide moves. Generate 30-40 random moves for adequate scrambling depth.

**Redundancy detection**:
- Strip adjacent inverse pairs (R R' → no-op)
- Strip quadruplets of same face (R R R R → no-op)
- After scramble, verify no face is already solved (all stickers same color)

---

## 4. Timer System

### Implementation Pattern

Use **`setInterval` at 1000ms granularity** (matching existing game patterns like `word-ladder-climb` at `app.js:43`, 116-121):

```js
let timerId = 0;
let startTime = 0;

function startTimer() {
  startTime = Date.now();
  timerId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, MAX_GAME_SEC - elapsed);
    updateTimerDisplay(remaining);
    if (remaining <= 0) finishGame('failed');
  }, 200); // 200ms for smooth UI updates despite 1s precision
}

function stopTimer() {
  clearInterval(timerId);
}
```

**Time limit**: 180 seconds (3 minutes) per the AC "single session ≤ 3 min".

### Timer Display

- **Position**: Center-top above the cube (CSS absolute overlay)
- **Visual**: Radial progress ring (CSS `conic-gradient`) around the time number
- **Warning**: < 30s → turn red + pulse animation
- **Critical**: < 10s → add shake animation + audio tick

---

## 5. Input Handling (Keyboard / Mouse / Touch)

### Three Input Modes (per AC: "support at least 2 of 3")

| Input | Detection | Action |
|-------|-----------|--------|
| **Mouse** | `pointerdown/pointermove/pointerup` on canvas | Drag to rotate selected face |
| **Touch** | Same as mouse (`pointer` events unify both) | Drag to rotate; disable page scroll with `touch-action: none` |
| **Keyboard** | `keydown` listeners | Arrow keys / WASD to select face, Q/E for CW/CCW |

### Pointer Events (mouse + touch unified)

```js
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.style.touchAction = 'none';
```

### Interaction Flow

1. `pointerdown` → Raycaster detects which sticker/face was hit
2. `pointermove` → track drag direction (accumulate delta); when delta exceeds threshold, trigger rotation on the axis defined by drag direction
3. `pointerup` → if no threshold reached, treat as click (no rotation)
4. `contextmenu` → `e.preventDefault()` on canvas (prevents browser right-click menu on long-touch)

### Keyboard Mapping

| Key | Action |
|-----|--------|
| Arrow Up / W | Rotate front face CW |
| Arrow Down / S | Rotate front face CCW |
| Arrow Left / A | Rotate left face CW |
| Arrow Right / D | Rotate right face CCW |
| Q | Rotate up face CCW |
| E | Rotate up face CW |
| R | Reset view (if we enable orbit) |
| Space | "Again" / restart (on result screen) |

---

## 6. Local Storage for High Scores

### Storage Schema

```js
const LS_KEY = 'speed_cube_solver_best';

const defaultStats = {
  bestScore: 0,
  fastestSec: null,
  fewestMoves: null,
  bestSize: null,
  gamesPlayed: 0,
  wins: 0,
  sizeRecords: {
    3: { bestScore: 0, fastestSec: null, fewestMoves: null },
    4: { bestScore: 0, fastestSec: null, fewestMoves: null },
    5: { bestScore: 0, fastestSec: null, fewestMoves: null }
  }
};
```

### Scoring Formula

```
score = (180 - elapsed_sec) * 10 + (max_moves - actual_moves) * 5 + size_bonus
```

Where:
- `180` = time limit in seconds
- `max_moves` = estimated optimal moves for scramble length (e.g., scramble length × 1.5)
- `size_bonus` = 0 for 3×3, 200 for 4×4, 500 for 5×5

### Update Logic

On `finishGame('won')`:
1. Read current best from `localStorage`
2. Compare and update if new score higher / faster / fewer moves
3. Show `🏆 NEW HIGH SCORE!` badge when beaten
4. On `finishGame('failed')`: record `gamesPlayed++` but no best update

---

## 7. Code Structure Recommendations

### File Layout

Based on the repo's pattern (`games/081-speed-cube-solver/index.html` or multi-file):

```
games/081-speed-cube-solver/
  index.html          (entry point, DOM, importmap, <script module>)
  app.js              (all game logic — or keep inline in index.html like 3D games)
  style.css           (UI styling — or inline in <style>)
  thumb.svg           (hub thumbnail, 300×200)
  tests/
    static.test.cjs   (static HTML validation, pattern from 096-word-ladder-climb)
```

### Module Architecture (if using app.js)

```js
(async () => {
  // 1. CONFIG & Constants
  const CONFIG = { MAX_GAME_SEC: 180, CUBE_SIZES: [3, 4, 5], ... };

  // 2. DOM Refs
  const $ = s => document.querySelector(s);
  const els = { canvas: $('#c'), timer: $('#t'), ... };

  // 3. Local Storage helpers
  function lsGet(k, fallback) { ... }
  function lsSet(k, v) { ... }

  // 4. Three.js setup
  import * as THREE from 'three';
  const { scene, camera, renderer } = initScene();

  // 5. Cube model class
  class RubiksCube {
    constructor(size) { ... }
    build() { ... }         // create meshes
    rotate(axis, layer, dir) { ... }
    scramble(steps) { ... }
    isSolved() { ... }
    destroy() { ... }
  }

  // 6. Input handler
  class InputController { ... }

  // 7. Timer
  class GameTimer { ... }

  // 8. Screens: Title, Game, Result
  function showScreen(name) { ... }
  function startGame(size) { ... }
  function finishGame(result) { ... }

  // 9. Audio
  let audioCtx;
  function playSound(type) { ... }

  // 10. Bootstrap
  showScreen('title');
})();
```

### Singmaster Notation Parser (for scrambles)

```js
// Parse notation like "R U R' U' F' U' F2 D B' R2"
function parseMoves(notation) {
  return notation.split(' ').map(move => {
    const face = move[0];
    const dir = move.includes("'") ? -1 : 1;
    const count = move.includes("2") ? 2 : 1;
    const wide = move.length > 1 && move[1] === 'w';
    return { face, dir, count, wide };
  });
}
```

---

## 8. Performance & Optimization

### Keep It Fast

| Concern | Solution |
|---------|----------|
| Sticker mesh count | 54 (3×3) → 96 (4×4) → 150 (5×5) on a single geometry group |
| Rotation junk | Use `Object3D` groups (not `Scene` nesting) — lighter attach/detach |
| Memory | Destroy and recreate cube on size change (not rebuild in-place) |
| Render distance | Cube fits in ~6 units — no far-plane issues |
| Mobile GPU | Limit pixel ratio: `renderer.setPixelRatio(Math.min(2, devicePixelRatio))` |

### First Screen Loading

- **Target**: < 3 seconds to playable
- **Strategy**: 
  1. Inline critical CSS + Three.js CDN import
  2. Show title screen immediately (HTML renders before Three.js loads)
  3. Load Three.js + build cube in background
  4. When ready, enable "Start" button

---

## 9. Audio & Haptics

### Sound Effects (Web Audio API, no external files)

| Event | Sound | Implementation |
|-------|-------|----------------|
| Face rotation click | Short 440Hz sine 50ms | `osc.type='sine'; osc.frequency.value=440` |
| Face rotation complete | 880Hz sine 80ms | Higher pitch on rotation finish |
| Scramble tick | 220Hz triangle 30ms | Lower pitched, rapid |
| Win jingle | Ascending 3-note arpeggio | C5→E5→G5 150ms each |
| Lose buzz | Low 110Hz sawtooth 300ms | `osc.type='sawtooth'` |
| Timer <10s tick | 660Hz pulse 30ms | Repeating every second |

### Vibration (mobile)

```js
if ('vibrate' in navigator) {
  // Face rotation: navigator.vibrate(5)
  // Scramble step: navigator.vibrate(3)
  // Win: navigator.vibrate([20, 50, 20, 50, 50])
  // Timer warning: navigator.vibrate(15)
}
```

---

## 10. Implementation Phasing

### Phase 1 — Core 3×3
- Three.js renderer + scene setup
- 3×3 cube model with sticker meshes
- Basic face rotation (single face, CW/CCW)
- Drag-to-rotate input (mouse only)

### Phase 2 — Game Loop
- Scramble generator + animation
- Timer system with display
- Win detection (isSolved check)
- Result screen with scoring
- localStorage persistence

### Phase 3 — Polish
- Keyboard input
- Touch input optimization (friction, inertia)
- Audio + vibration
- Timer warnings (red <30s, pulse <10s)

### Phase 4 — Progression
- 4×4 cube model
- 5×5 cube model
- Size unlock system + unlock animation
- Per-size high score tracking

---

## Cross-Team Consensus

**Agreed with UX-analyst on**:
1. Initial camera: 45° isometric down-angle, orbit locked
2. Timer: radial progress + digital, centered above cube
3. Rotation animation: 250-350ms with easeInOutCubic
4. Scramble: animated step-by-step (not pre-scrambled) as implicit tutorial
5. Touch drag: threshold-based with inertia tuning to prevent over-rotation
6. Size unlock: animated celebration in result screen, not silent unlock
7. Keyboard: full key mapping for power users
8. 0 onboarding — hidden guidance via scramble animation

---

*Report prepared by tech-analyst for Issue #81 Speed Cube Solver implementation.*
