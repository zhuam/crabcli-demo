# Drift King Arena — 技术分析报告

> Issue #86 | `zhuam/crabcli-demo` | 技术视角分析
> 分析师: tech-analyst | 并行: ux-analyst (Canvas 2D + DOM HUD 已对齐)

---

## 1. 技术栈判定

| 维度 | 决策 | 依据 |
|---|---|---|
| 渲染 | **Canvas 2D** | 俯视赛道需大量动态绘制（车体旋转、漂移尾迹、赛道标记），DOM 无法达到 60fps；pet-run-io (`games/097-pet-run-io/index.html`) 已验证 Canvas 2D 模式 |
| HUD 覆盖 | **DOM overlay** | 分数/计时/排名使用绝对定位 DOM 元素，accessibility 更好，UX 侧已对齐 |
| 游戏循环 | **rAF + 固定步长累加器** | pet-run-io `index.html:1276-1295` 已实现 accumulator 模式，dt clamp 0.1s 防 tab 切换瞬移 |
| 音效 | **Web Audio API** | `AudioContext` + `OscillatorNode` 合成音效，零依赖；word-ladder `app.js` 已验证 `webkitAudioContext` 降级 |
| 震动 | **Navigator.vibrate()** | `try/catch` 包裹；word-ladder `app.js` 已验证 |
| 持久化 | **localStorage** | 最高分/解锁记录；多 game 已实现同模式 |
| 样式 | **CSS + OKLch tokens** | 遵循 `concept-vanilla-web-stack` 规范 |

### 已验证的参照实现

- **pet-run-io** (`games/097-pet-run-io/index.html`): Canvas 2D 渲染 + rAF 固定步长循环 + 碰撞检测 + 多状态机 + 宠物/金币收集 + 本地持久化
- **knight-vs-slime** (`games/095-knight-vs-slime/index.html`): Canvas 2D 动作游戏 + 响应式 canvas 尺寸 (`:276-430`)
- **idle-lemonade-stand** (`games/099-idle-lemonade-stand/app.js`): Canvas 2D + DPR 适配 (`:458-469`)
- **word-ladder-climb** (`games/096-word-ladder-climb/app.js`): Web Audio + localStorage + IIFE 模式 + 180 秒计时器

---

## 2. 文件结构

```
games/086-drift-king-arena/
├── index.html          ← 主页面，引入 CSS/JS，含 Canvas + DOM HUD
├── style.css           ← 全部样式（HUD、结果弹窗、响应式）
├── app.js              ← 游戏逻辑（IIFE + 'use strict' 模式）
└── README.md           ← 验收对照
```

**注册表条目** (`games/registry.json`):
```json
{
  "id": "drift-king-arena",
  "name": "Drift King Arena",
  "description": "限定赛道漂移积分 — 方向键操控，漂移攒分，解锁新车与赛道",
  "category": "action",
  "tags": ["singleplayer", "action", "racing", "drift", "short-session"],
  "path": "/games/086-drift-king-arena/",
  "hasServer": false,
  "players": "1",
  "version": "1.0.0",
  "rating": 4.0
}
```

---

## 3. 核心架构设计

### 3.1 游戏状态机

```
MENU → COUNTDOWN(3-2-1) → PLAYING → RESULT(won/lost) → MENU
```

```
state = {
  phase: 'menu' | 'countdown' | 'playing' | 'result',
  // Player
  car: { x, y, angle, speed, driftAngle, driftAccumulator },
  // Track
  trackId: 0,
  track: { checkpoints, gates, width, layout },
  // Scoring
  score: 0,
  targetScore: 1500,      // 当前关卡目标
  driftScore: 0,          // 本局漂移总积分
  comboTimer: 0,          // combo 计时
  combo: 0,
  // Timer
  startTs: 0,
  remainingSec: 180,
  // Progression
  unlockedTracks: [0],
  unlockedCars: [0],
  // Settings
  sfx: true,
};
```

### 3.2 游戏循环 (rAF + 固定步长)

```javascript
const STEP = 1/60;
let lastTs = 0, acc = 0;

function loop(ts) {
  if (state.phase !== 'playing') {
    rafId = requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;
  acc += dt;
  if (acc > 0.25) acc = 0.25; // 防止长时间挂起后追赶
  while (acc >= STEP) {
    update(STEP);
    acc -= STEP;
  }
  render();
  rafId = requestAnimationFrame(loop);
}
```

### 3.3 Canvas 渲染管线

每帧渲染顺序（painter's algorithm）:

1. **赛道背景** — 灰色沥青 + 赛道边界标记
2. **漂移胎痕** — 半透明黑色弧线数组（带淡出 alpha）
3. **NPC 车辆** (可选) — 简单方块车，简化物理
4. **玩家车辆** — 旋转矩形 + 车灯标记
5. **赛道门柱 / 检查点** — 积分区域标记
6. **DOM HUD 覆盖** — `scoreDisplay.textContent = state.score`

### 3.4 Canvas DPR 适配

```javascript
const dpr = window.devicePixelRatio || 1;
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
canvas.style.width = rect.width + 'px';
canvas.style.height = rect.height + 'px';
ctx.scale(dpr, dpr);
```

---

## 4. 漂移物理算法

### 4.1 车辆运动模型

```
每帧更新:
  if (keys.up)    speed += ACCEL * dt
  if (keys.down)  speed -= BRAKE * dt
  speed *= DRAG   // 自然减速 drag 系数
  speed = clamp(speed, -MAX_SPEED, MAX_SPEED)

  if (keys.left)  angle -= TURN_SPEED * dt * (speed / MAX_SPEED)
  if (keys.right) angle += TURN_SPEED * dt * (speed / MAX_SPEED)

  x += sin(angle) * speed * dt
  y -= cos(angle) * speed * dt   // 俯视图上方向为 -y
```

### 4.2 漂移检测与积分

核心判定：**横向速度 / 车辆朝向的夹角**。

```javascript
// 车速方向向量
const velDir = { x: sin(car.angle), y: -cos(car.angle) };
// 车头朝向向量 = velDir（简化模型）
const headingDir = velDir;

// 漂移角 = 速度方向与车头朝向的差异
// 车辆实际横向滑移量
const lateralSpeed = abs(speed) * abs(sin(steerAngle - car.angle));

// 阈值判定
if (lateralSpeed > DRIFT_THRESHOLD && abs(speed) > MIN_DRIFT_SPEED) {
  // 正在漂移
  car.drifting = true;
  car.driftAccumulator += lateralSpeed * dt;

  // 漂移积分: 漂移距离越长，每秒得分越高
  const points = floor(lateralSpeed * DRIFT_SCORE_RATE * dt);

  // Combo 系统: 连续漂移叠加倍率
  if (comboActive) {
    combo += points;
    comboMultiplier = 1 + floor(combo / COMBO_STEP) * 0.5;
    points *= comboMultiplier;
  }
} else {
  car.drifting = false;
  // 漂移结束：结算 combo 奖励
}
```

**参数草案**:

| 参数 | 值 | 说明 |
|---|---|---|
| `ACCEL` | 180 px/s² | 加速率 |
| `BRAKE` | 120 px/s² | 减速率 |
| `DRAG` | 0.985 | 每帧速度衰减 |
| `MAX_SPEED` | 280 px/s | 最高速度 |
| `TURN_SPEED` | 2.8 rad/s | 转向速率 |
| `DRIFT_THRESHOLD` | 30 px/s² | 漂移判定阈值 |
| `DRIFT_SCORE_RATE` | 2.5 | 每单位侧滑的积分倍率 |
| `COMBO_STEP` | 100 | 每 100 漂移分提升一个 combo 等级 |
| `TARGET_SCORE_BASE` | 1500 | 第一关目标分 |

### 4.3 漂移尾迹 (Skid Marks)

```javascript
// 漂移中每帧记录胎痕
const SKID_LIFETIME = 300; // 帧数 (约 5 秒)
const MAX_SKIDS = 200;

if (car.drifting) {
  skidMarks.push({
    x: car.x, y: car.y,
    alpha: 0.5,
    lifetime: SKID_LIFETIME
  });
  if (skidMarks.length > MAX_SKIDS) skidMarks.shift();
}

// 渲染时，每帧衰减 alpha
skidMarks.forEach(m => {
  m.alpha = 0.5 * (m.lifetime / SKID_LIFETIME);
  m.lifetime--;
  ctx.globalAlpha = m.alpha;
  ctx.fillStyle = '#222';
  ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
});
skidMarks = skidMarks.filter(m => m.lifetime > 0);
```

---

## 5. 赛道系统

### 5.1 赛道数据结构

```javascript
const TRACKS = [
  {
    id: 0,
    name: '初学者赛道',
    targetScore: 1500,
    timeLimit: 180,
    layout: 'oval',          // oval | figure8 | S | custom
    checkpoints: [           // 检查点坐标（完成一圈加分）
      { x: 200, y: 300, w: 60, collected: false },
      { x: 400, y: 150, w: 60, collected: false },
    ],
    // 赛道边界（碰撞检测用）
    walls: [
      { x1: 50, y1: 50, x2: 550, y2: 50 },
      // ...
    ],
    color: '#4A90D9',
    unlockCondition: { type: 'score', trackId: 0, value: 1500 }
  },
  // ... 更多赛道
];
```

### 5.2 碰撞检测

- **赛道边界**: AABB + 线段相交检测，碰撞后速度归零 + 小角度反弹
- **检查点**: 圆形/矩形包含检测，每过门 +200 分奖励
- **碰撞惩罚**: 撞墙 -50 分 + 短暂速度归零（0.3 秒）

---

## 6. 赛车系统

```javascript
const CARS = [
  {
    id: 0, name: '原厂车',
    maxSpeed: 260, accel: 170, turnSpeed: 2.5, driftRate: 1.0,
    color: '#E53935', unlockCondition: null  // 默认解锁
  },
  {
    id: 1, name: '漂移大师',
    maxSpeed: 240, accel: 150, turnSpeed: 3.2, driftRate: 1.4,
    color: '#FFB300', unlockCondition: { type: 'totalScore', value: 5000 }
  },
  {
    id: 2, name: '速度狂魔',
    maxSpeed: 310, accel: 200, turnSpeed: 2.0, driftRate: 0.7,
    color: '#1E88E5', unlockCondition: { type: 'totalScore', value: 12000 }
  },
  {
    id: 3, name: '平衡之王',
    maxSpeed: 275, accel: 180, turnSpeed: 2.8, driftRate: 1.2,
    color: '#43A047', unlockCondition: { type: 'tracks', value: 3 }
  },
];
```

---

## 7. 输入处理

### 7.1 键盘

```javascript
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
    e.preventDefault();
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });
```

### 7.2 触屏

```javascript
// 虚拟摇杆 - 左侧半边为方向控制，右侧为加速/刹车
// 或: 四方向滑动手势 Area (上/下/左/右)
canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener('pointermove', handlePointer);
canvas.addEventListener('pointerup', clearPointer);

function handlePointer(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  
  // 左半屏: 虚拟摇杆
  if (x < cx) {
    const dx = (x - cx/2) / (cx/2);  // -1 to 1
    const dy = (y - cy) / cy;        // -1 to 1
    touchSteer = dx;  // 左负右正
    touchSpeed = dy;  // 上负下正
  }
}
```

### 7.3 鼠标

键盘模式+点击加速（空格/点击 Canvas 区域加速）。

---

## 8. 计分与结算

### 8.1 实时 HUD（DOM overlay）

```
+----------------------------------+
|  ← Arcade                        |
|  🏁 积分: 2450  目标: 1500       |
|  ⏱ 02:34                         |
|  🔥 Combo x2.5  漂移中!          |
|  🚗 原厂车  🏆 赛道1/5           |
+----------------------------------+
         [Canvas 游戏区域]
```

### 8.2 结算规则

```
胜利: score >= targetScore          → "通关！获得新车！"
失败: remainingSec <= 0 && score < targetScore → "时间到，再来一次！"

终局分数 = 漂移积分 + 过门奖励 + combo 奖励 - 碰撞惩罚

最高分持久化 → localStorage['drift_king_arena_best']
每局记录 → localStorage['drift_king_arena_stats'] = {
  totalScore, gamesPlayed, wins, maxCombo, totalDriftScore, unlockedCars, unlockedTracks
}
```

### 8.3 Accolade 等级反馈（与 UX 对齐）

```
得分区间→等级:
  < 500   → D
  < 1000  → C
  < 2000  → B
  < 3500  → A
  >= 3500 → S (金色特效)
```

---

## 9. 音效与震动

| 事件 | 音效 (Web Audio) | 震动模式 |
|---|---|---|
| 漂移开始 | 低频嗡声 (80Hz 三角波) | 短震 15ms |
| 持续漂移 | 连续扫频 (200→400Hz) | - |
| 过检查点 | 上升音阶 (440→660Hz) | 双震 [15, 30] |
| combo 升级 | 高音短促 (880Hz) | 三连震 |
| 撞墙 | 低沉碰撞 (100Hz 锯齿) | 重震 80ms |
| 通关 | 胜利上升音阶 | 节奏震 |
| 时间到 | 下降音阶 | 长震 200ms |
| 按钮交互 | 短 click (360Hz 方波) | 轻震 5ms |

---

## 10. 验收标准对照

| AC | 技术要求 | 方案 |
|---|---|---|
| 首屏 3 秒内进入游玩 | 菜单仅一条"开始"按钮，0 外部依赖 | 所有资源内联或单次加载，无网络请求 |
| 单局 ≤ 3 分钟 | 180 秒倒计时硬限制 | `CONFIG.MAX_GAME_SEC = 180`，与 word-ladder 一致 |
| 触屏/鼠标/键盘 ≥2 种 | 方向键 + 触屏虚拟摇杆 + 鼠标点击加速 | 输入管理器统一抽象 |
| 结算页有"再来一局" | 结果 modal + restartBtn | word-ladder `restartBtn` 模式复用 |
| 关键音效与震动 | Web Audio + Navigator.vibrate() | 已规划 8 种音效事件 |
| 最高分本地存储 | localStorage | `LS.BEST` + `LS.STATS` 双键 |

---

## 11. 实现建议优先级

### P0 - 核心可玩 (完成需 ~4 小时)
1. Canvas 渲染管线 + 车辆运动模型
2. 漂移检测 + 积分算法
3. 180 秒倒计时 + 胜利/失败结算
4. 键盘输入 (方向键 + 空格加速)
5. 基本赛道 + 碰撞检测

### P1 - 体验升级 (~2 小时)
6. 漂移尾迹渲染
7. Combo 系统 + 等级反馈 (D/C/B/A/S)
8. Web Audio 音效
9. 触屏虚拟摇杆
10. 结果弹窗 + "再来一局"

### P2 - 完整闭环 (~3 小时)
11. 多赛道解锁系统
12. 多赛车解锁系统
13. localStorage 持久化
14. 首页/菜单/赛道选择
15. 响应式布局适配

---

## 12. 关键依赖 & 兼容性

| 特性 | 最低版本 | 回退策略 |
|---|---|---|
| Canvas 2D | 所有现代浏览器 | N/A (核心依赖) |
| AudioContext / webkitAudioContext | Chrome 49+ / Safari 12+ | 静默降级 (无音效) |
| Navigator.vibrate | 大部分移动端 | try/catch 静默忽略 |
| localStorage | 所有现代浏览器 | 内存模式 (不持久化) |
| requestAnimationFrame | Chrome 31+ / Safari 7+ | setInterval 20ms fallback |
| devicePixelRatio | 所有现代浏览器 | 默认 1 |
| oklch() / color-mix() | Chrome 111+ / FF 113+ | 十六进制回退 |

---

## 13. 风险评估

| 风险 | 影响 | 缓解 |
|---|---|---|
| Canvas 性能在低端手机不足 | 游戏卡顿，体验差 | 固定步长 + dt clamp + 限制胎痕数量 (MAX_SKIDS=200) |
| 漂移手感调优困难 | 反馈"飘"或"粘" | 参数化所有物理常量，通过配置快速迭代 |
| 触屏虚拟摇杆与 UI 冲突 | 误触 HUD | pointer-events 分层管理 + safe-area 适配 |
| 同时多人沙箱冲突 | N/A (本游戏纯单机) | 无需服务端，无竞态 |

---

*分析日期: 2026-07-03 | 作者: tech-analyst*
