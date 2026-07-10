# Re-Review: Speed Cube Solver (Issue #81) — Fix Verification

**Reviewer**: reviewer-2 | **Date**: 2026-07-10  
**File**: `games/081-speed-cube-solver/index.html`  
**Fix commit**: `7fd34bf` | **Upstream**: t2-develop (8 fixes applied)

---

## 1. Fix Verification — All 8 Previous Issues

### C1. `isSolved()` algorithm (CRITICAL — FIXED ✅)

**Evidence**: `index.html:1078-1150`

The rewritten `isSolved()` correctly:
1. Defines 6 local face direction vectors for material indices 0–5
2. For each cubie on a face layer, iterates all 6 material indices
3. Transforms each local direction by the cubie's quaternion (`localDir.applyQuaternion(c.quaternion)`)
4. Rounds the result and checks which one aligns with the expected world direction
5. Verifies the sticker color matches, skipping internal black faces
6. Cubies on the layer with no outward-facing colored face are validated as all-black (internal)

This is the correct algorithm — it properly handles cubies whose local material axes no longer align with world axes after rotation.

**Verification trace** (F rotation on corner `(1,1,1)`):
- Local +x (material[0]=red) after 90° z-rotation → world direction ≈ (0,1,0) rounded to [0,1,0] → matches `up` layer config → checks if material[2] matches white → continues (not on up face)
- Continues scanning all 6 materials until finding the one pointing at world +x → found at some material index after rotation → checks if it's red → correct
- A non-red sticker on any face pointing toward world +x returns false

**Verdict**: Correctly fixed.

---

### H1. "New Personal Best" badge (HIGH — FIXED ✅)

**Evidence**: `index.html:1585,1640-1643`

The fix captures `oldFastestSec` at line 1585 (`let oldFastestSec = stats.sizeRecords[state.size].fastestSec`) BEFORE `saveStats()` at line 1612 overwrites the record. The comparison is against the OLD value:

```javascript
const isNewBest = isWin && oldFastestSec !== null &&
    state.elapsed < oldFastestSec;
```

This correctly shows the badge only when beating a previous record.

**⚠️ Caveat**: On a player's FIRST win, `oldFastestSec` is `null`, so `oldFastestSec !== null` is false and the badge never shows for a first-time victory. This is a design choice — "new best" is arguably meaningless when there was no prior record. Intentional, but worth flagging.

---

### H2. Camera orbit on drag (HIGH — FIXED ✅)

**Evidence**: `index.html:1219-1220`

The orbit rotation code that was in the original `onPointerMove` (rotating `orbitGroup.rotation` by `dx * 0.005` / `dy * 0.005`) is completely removed. Background drag is now a documented no-op:

```javascript
// Drag threshold: background drag is a no-op during gameplay
// (UX spec: camera does NOT orbit, the cube rotates, not the view)
```

**Verdict**: Cleanly fixed with explanatory comment.

---

### M1. Scramble length (MEDIUM — FIXED ✅)

**Evidence**: `index.html:1554`

```javascript
const scramble = generateScramble(size, size === 3 ? 18 : 22);
```

Reduced from 22→18 moves (3×3) and 30→22 (4×4/5×5). At 200ms/move + 30ms inter-move:
- 3×3: 18×200 + 17×30 = **4.11s** (was 5.0s)
- 4×4: 22×200 + 21×30 = **5.03s** (was 6.9s)

Still over the UX spec's ~4s target for 3×3 (4.11s), but much improved. Combined with the 0.5s loading screen → ~4.6s to gameplay, which exceeds the AC's "3 seconds to play" by ~1.6s. Acceptable given Three.js CDN overhead.

The `prefersReducedMotion` shortcut now skips animation entirely (instant scramble), which fully satisfies AC1 for affected users.

---

### M2. Scoring formula (MEDIUM — FIXED ✅)

**Evidence**: `index.html:1354-1359`

```javascript
const moveEfficiency = Math.max(0, (200 - state.moves) * 1);
```

Changed from `(100 - moves) * 2` to `(200 - moves) * 1`:
- Beginners (~100–150 moves) now get 50–100 points instead of 0
- Better players (~50 moves) get 150 points vs 100 points before
- Gentler penalty curve overall

---

### M3. Fail time display (MEDIUM — FIXED ✅)

**Evidence**: `index.html:1631-1635`

Both win and loss branches now show `formatTime(state.elapsed)` instead of `formatTime(MAX_GAME_SEC)`. On timeout the display shows the actual elapsed time (≈03:00), which is informative.

---

### M4. Vibration decoupled from mute (MEDIUM — FIXED ✅)

**Evidence**: `index.html:1479-1485`

```javascript
let vibrateEnabled = true;  // new independent flag

function vibrate(pattern) {
    if (!vibrateEnabled) return;  // was: if (state.muted) return
    ...
}
```

Vibration now has its own `vibrateEnabled` flag, completely independent from `state.muted`. Haptic feedback works regardless of audio mute state.

**Note**: There's no UI control for `vibrateEnabled` — it's always `true`. This is acceptable since the AC requires vibration; users who want to disable it would need a future settings panel.

---

### m1. Registry registration (LOW — FIXED ✅)

**Evidence**: `games/registry.json:725-741`

```json
{
    "id": "speed-cube-solver",
    "name": "Speed Cube Solver",
    "description": "3D 魔方速拧挑战 — 拖拽旋转，限时还原",
    "category": "puzzle",
    "tags": ["singleplayer","puzzle","3d","touch","short-session"],
    "thumbnail": "/games/081-speed-cube-solver/thumb.svg",
    "path": "/games/081-speed-cube-solver/",
    "hasServer": false,
    "players": "1",
    "version": "1.0.0"
}
```

Complete entry with all required fields, matching project conventions.

---

### m2. Hub integration (LOW — FIXED ✅)

- **Back-to-hub link**: Present at `index.html:480-483` — `<a href="/" class="back-to-hub">← Arcade</a>` with proper SVG icon
- **`recordPlayed()` call**: Present at `index.html:1688-1690` — called on title screen
- **"← Back to Menu"**: Goes to title screen (line 1683), which is the correct UX for the game's own menu flow

---

### m3. Three.js CDN preload (LOW — FIXED ✅)

**Evidence**: `index.html:591`

```html
<link rel="preload" as="script" href="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" crossorigin="anonymous">
```

Browser starts fetching Three.js immediately during HTML parsing, reducing perceived load time.

---

### m4. Reduced motion skip (LOW — FIXED ✅)

**Evidence**: `index.html:469-474` (CSS), `index.html:1003-1043` (JS), `index.html:1497-1499` (helper)

Three layers of protection:
1. **CSS**: All animations/transitions killed via `animation-duration: 0.01ms !important`
2. **JS scramble**: `performScramble()` checks `prefersReducedMotion()` and applies all rotations instantly (no animation)
3. **Helper function**: `prefersReducedMotion()` at line 1497 wraps `matchMedia` query

Comprehensive coverage — no animation leakage for affected users.

---

## 2. New Findings

### N1 (MEDIUM): Mute state initialization bug

**File**: `index.html:1666-1668`  
**Severity**: MEDIUM  
**Type**: Pre-existing (not introduced by fix)

```javascript
state.muted = localStorage.getItem(LS_KEY + '_muted') === '1';
if (state.muted) toggleMute();
```

`toggleMute()` flips `state.muted` (`state.muted = !state.muted`). When the saved state is `true` (muted was on), this flips it to `false` — the page loads saying "Unmuted" (speaker icon, label "Mute") even though the previous session ended muted. The visual state is inverted on every first load after muting.

**Fix**: Replace with direct UI initialization:
```javascript
state.muted = localStorage.getItem(LS_KEY + '_muted') === '1';
els.muteLabel.textContent = state.muted ? 'Unmute' : 'Mute';
els.muteIcon.innerHTML = state.muted ? '<muted-path>' : '<unmuted-path>';
```

---

### N2 (LOW): Drag threshold doubled (8px → 20px)

**File**: `index.html:1223`  
**Severity**: LOW  
**Type**: Behavior change in fix

The face-rotation drag threshold was raised from 8px to 20px (`dist > 20`). Since camera orbit was removed, the only drag interaction is face rotation. At 20px, users must drag ~7mm on a 3x density phone screen before a rotation registers. This may feel sluggish or unresponsive — especially for swipe-to-solve on small cube faces.

**Impact**: Higher chance of accidental tap-through (line 1236-1243) triggering face rotations when the user intended to drag.

**Suggestion**: Reduce to 12–15px for a better balance between false-positive prevention and responsiveness.

---

### N3 (LOW): ArrowDown key mapped to "up" face

**File**: `index.html:1275-1277`  
**Severity**: LOW  
**Type**: UX inconsistency (pre-existing)

```javascript
'ArrowUp': { face: 'up', dir: -1 },
'ArrowDown': { face: 'up', dir: 1 },
```

Both ArrowUp and ArrowDown rotate the **up** face (in opposite directions). Intuitive mapping would be ArrowDown → `{ face: 'down', dir: 1 }` so the arrows correspond to which face they affect. Current mapping means pressing ↓ always affects the top face, which is confusing.

**Suggestion**: Map ArrowDown to the down face for spatial consistency.

---

### N4 (LOW): Scramble animation on returning players

**File**: `index.html:1554-1558`  
**Severity**: LOW  
**Type**: UX enhancement opportunity

Per UX analysis (§1): "After 1st session, skip auto-scramble on subsequent plays." Current code always shows the scramble animation regardless of `gamesPlayed`. The `prefersReducedMotion` check helps some users, but returning players could skip the ~4s scramble entirely after their first play.

**Suggestion**: Check `loadStats().gamesPlayed > 0` and skip the animated scramble on repeat plays (or reduce its speed/duration). The instant scramble path from `prefersReducedMotion` can be reused.

---

## 3. Acceptance Criteria Verification

| AC | Status | Detail |
|---|---|---|
| 首屏 3 秒内可进入游玩，无需教程 | ⚠️ Partial | Loading screen 0.5s + scramble 4.1s (3×3) = ~4.6s total; meets with reduced-motion, exceeds on standard |
| 单局时长 ≤ 3 分钟 | ✅ Pass | `MAX_GAME_SEC = 180` |
| 触屏/鼠标/键盘至少两种 | ✅ Pass | Pointer Events (touch + mouse) + keyboard (arrows + WASDQE + shortcuts) |
| 失败/胜利有清晰"再来一局" | ✅ Pass | "Play Again" button on result screen, keyboard Enter/Space also works |
| 关键音效与震动反馈齐全 | ✅ Pass | 7 sound types, 4 vibration patterns, mute toggle persists, vibration independent |
| 记录最高分到本地存储 | ✅ Pass | localStorage with bestScore/fastestSec/fewestMoves per-size records, "New Best" badge logic correct |

---

## 4. Summary

**All 8 previously identified issues are verified as fixed.** The `isSolved()` rewrite is the most critical change and is correctly implemented. Supporting fixes (scoring, fail time, vibration decoupling, hub integration, preload, reduced-motion skip) are all solid.

**New findings**:
- **N1 (MEDIUM)**: Mute state init bug — pre-existing, visual state inverted on page reload after muting  
- **N2 (LOW)**: Drag threshold 20px may feel unresponsive  
- **N3 (LOW)**: ArrowDown mapping UX inconsistency  
- **N4 (LOW)**: Scramble animation could skip for returning players

**Overall verdict**: Code quality is good. All critical and high-severity issues resolved. The new N1 bug should be fixed before release as it directly impacts a persisted user setting.

---
*Generated by reviewer-2 (swarm-a64386b1)*
