# 技术分析报告 — [Game 067] Stretch Arm Bank Job

## 1. 仓库基础信息

| 项目 | 内容 |
|------|------|
| 仓库 | `github.com/zhuam/crabcli-demo` |
| 游戏目录模式 | `games/067-stretch-arm-bank-job/index.html`（单文件） |
| 游戏 ID | `067-stretch-arm-bank-job` |
| 分类 | `action`（物理/搞笑） |
| 当前最新游戏 | `100-color-sort-balls`（目录 `games/100-color-sort-balls/`） |
| 共享样式 | `games/shared/game-frame.css`（back-to-hub 按钮） |

**技术结论：本项目采用单文件 HTML 游戏架构（所有 HTML/CSS/JS 内联于 `index.html`），游戏通过 `games/registry.json` 注册后由网关 `src/gateway/server.ts` 路由服务。**

证据来源：
- `games/registry.json` 中所有游戏均通过 `path` 指向 `/games/<id>/`（`code_file:416` 行）
- `games/100-color-sort-balls/index.html` 为 1906 行单文件（`code_file` 确认）
- `src/gateway/server.ts:33-53` 验证：路径以 `/games/` 开头则路由到对应目录

---

## 2. 技术选型分析

### 2.1 核心渲染方案：Canvas 2D + requestAnimationFrame ✅

**结论：采用 Canvas 2D + requestAnimationFrame 实现手臂物理。**

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| Canvas 2D + rAF | 像素级控制、碰撞检测精准、粒子/特效丰富 | 开发量较大 | ⭐⭐⭐⭐⭐ |
| DOM + CSS transform | 初始开发快 | 物理形变难以平滑、碰撞检测复杂 | ⭐⭐ |
| CSS 动画 + SVG | 无需 JS 渲染 | 无法实时响应拖拽路径 | ⭐ |

**理由**（与 UX 分析师达成共识）：
1. 手臂需要"拉伸→弯曲→缩回"的实时骨骼动画，Canvas 可逐帧控制
2. 金库内障碍物（激光/感应器）需要 AABB 碰撞检测，Canvas 通过坐标计算最直接
3. 警报触发时屏幕级闪烁/脉冲特效，Canvas 全域渲染更统一
4. 参见 `games/099-idle-lemonade-stand/app.js:458-468` 的 Canvas 实现模式（`code_file` 确认）

### 2.2 碰撞检测：AABB + 视觉警示区 ✅

**结论：采用 Axis-Aligned Bounding Box (AABB) 碰撞检测。**

与 UX 分析师一致认为：
- AABB 矩形碰撞计算量小（仅需 4 次比较/帧），60fps 下无性能压力
- 激光/感应器区域用红色半透明覆盖层标识，玩家可直观预判安全路径
- 像素级碰撞过于精确，玩家无法感知边界——增加挫败感（UX 视角意见）
- 手臂末端绘制 **抓取点圈指示器**，提升拖拽可预测性

### 2.3 交互模式：Pointer Events（触屏 + 鼠标双支持） ✅

**支持触屏/鼠标**（验收标准 AC#3 要求至少支持两种）：
- 使用 Pointer Events API（`pointerdown`/`pointermove`/`pointerup`），统一处理触屏和鼠标
- 参见 `games/100-color-sort-balls/index.html:1494-1641` 的拖拽实现模式（`code_file` 确认）
- `touch-action: none` 防止浏览器默认滚动
- 键盘支持：方向键控制瞄准方向 + Space 抓取/释放

### 2.4 音效方案：Web Audio API 合成 ✅

**采用 Web Audio API 合成音效（无外部音频文件）**：
- 参考 `games/100-color-sort-balls/index.html:1174-1225` 模式（`code_file` 确认）
- 所需音效类型：
  - `sfxExtend` — 手臂延伸（渐升音调）
  - `sfxGrab` — 抓取现金（短促高音）
  - `sfxRetract` — 缩回（渐降音调）
  - `sfxAlarm` — 警报触发（低频脉冲）
  - `sfxWin` — 通关音效（上升三连音）
  - `sfxFail` — 失败音效（下降音调）

### 2.5 震动反馈：navigator.vibrate()

- 参考 `games/100-color-sort-balls/index.html:1227-1229`
- 抓取现金：短震 20ms
- 触碰警报：长震 50ms
- 搬进金库成功：短促双震 30ms+30ms

### 2.6 本地存储：localStorage

- 存储键模式：`stretch_arm_best` / `stretch_arm_settings`
- 记录字段：`bestScore`（最高偷取额）、`gamesPlayed`、`wins`
- 参考 `games/100-color-sort-balls/index.html:1234-1289` 模式
- 验收标准 AC#6："通关或失败时记录最高分到本地存储"

---

## 3. 核心玩法技术方案

### 3.1 核心循环：延伸 → 抓取 → 撤回

```
玩家操作      技术实现                   状态
──────────────────────────────────────────────
① 触摸/点击起点 → pointerdown          瞄准状态（Aiming）
② 拖拽方向     → pointermove 更新向量   延伸状态（Extending）
③ 碰到目标/松开 → AABB 碰撞检测        抓取状态（Grabbing）
④ 自动缩回     → Canvas rAF 插值动画   缩回状态（Retracting）
⑤ 到达起点判定 → 坐标计算              收集状态（Collected）
```

### 3.2 三阶段交互帧（与 UX 分析师共同设计）

| 阶段 | 视觉反馈 | 技术控制 |
|------|----------|----------|
| **起点指示** | 玩家角色处发光的拖拽起点圈 + 脉动动画 | canvas arc() + 透明度渐变 |
| **延伸实时** | 手臂从起点到触点的线段 + 端点圈 + 距离指示器 | 实时 lineTo() + 弹性插值 |
| **抓取缩回** | 手臂携带现金沿路径自动缩回 + 现金缩小动画 | lerp 位置插值 + 缩放插值 |

### 3.3 手臂物理模型（简化）

```
手臂 = 多段铰链线段（3-5 段可弯曲）
延伸方向 = 从起点到当前拖拽点的向量
每帧更新：
  1. 计算目标点（限制在屏内 + 金库墙内）
  2. 各段均匀分布在起点到目标点的贝塞尔曲线上
  3. 与障碍物 AABB 检测 → 碰撞则触发警报
  4. 检测抓取点是否在现金物品的 AABB 内 → 抓取
```

### 3.4 警报系统

| 触发条件 | 后果 | 视觉反馈 |
|----------|------|----------|
| 手臂触碰红色感应区 | 警报进度 +10%，震动 50ms | 屏幕边缘红色脉冲光环 |
| 手臂触碰激光束 | 警报进度 +25%，报警音 | 闪烁红色 overlay |
| 警报进度达到 100% | 游戏失败 | 失败结算画面 |

### 3.5 关卡/Progression 系统

| 等级 | 设计 | 金库布局 |
|------|------|----------|
| L1（教程） | 无警报，1 叠现金，简单直线路径 | 1 个房间 |
| L2-L3 | 1 条激光障碍，2 叠现金 | 2 个房间 |
| L4-L5 | 2 条激光 + 感应器，3 叠现金 | 十字形走廊 |
| L6-L7 | 移动激光 + 限时窗口，4 叠现金 | 复合迷宫 |
| L8+ | 多重机关 + 守卫巡逻路径 | 多层金库 |

---

## 4. 文件结构规划

```
games/067-stretch-arm-bank-job/
  index.html              ← 游戏主文件（单文件，内联 HTML/CSS/JS）
  thumb.png               ← 缩略图（可选，建议 480×320）

games/registry.json 更新：
  {
    "id": "stretch-arm-bank-job",
    "name": "Stretch Arm Bank Job",
    "description": "手臂延伸偷取金库内现金，避开警报偷够金额即通关",
    "category": "action",
    "tags": ["singleplayer", "physics", "stealth", "short-session"],
    "thumbnail": "/games/067-stretch-arm-bank-job/thumb.png",
    "path": "/games/067-stretch-arm-bank-job/",
    "hasServer": false,
    "players": "1",
    "version": "1.0.0",
    "rating": 4.0
  }
```

---

## 5. 验收标准技术验证矩阵

| AC# | 内容 | 技术方案 | 验证方式 |
|-----|------|----------|----------|
| AC#1 | 首屏 3 秒内进入 | 首屏显示"开始游戏"按钮，loading 0 | 首屏动画+按钮可立即点击 |
| AC#2 | 单局 ≤ 3 分钟 | `CONFIG.MAX_GAME_SEC = 180` 超时自动失败 | 游戏定时器 180s 倒计时 |
| AC#3 | 触屏/鼠标/键盘 ≥2 | Pointer Events + 键盘方向键+Space | 三套控制绑定测试 |
| AC#4 | "再来一局"按钮 | 结果页 "Play Again" / "再来一局" 按钮 | UI 测试 |
| AC#5 | 音效/震动齐全 | Web Audio API + `navigator.vibrate()` | 6 种音效 + 3 种震动 |
| AC#6 | 本地最高分 | `localStorage` 存储 bestScore | 游戏重开读取验证 |

---

## 6. 与 UX 分析师讨论摘要

| 议题 | 技术视角立场 | UX 分析师反馈 | 共识 |
|------|------------|-------------|------|
| Canvas vs DOM | Canvas 更适合碰撞检测 | 同意，补充三阶段交互设计 | ✅ Canvas 2D |
| AABB vs 像素碰撞 | AABB 计算量小 | 同意，补充视觉警示区 | ✅ AABB + 视觉覆盖 |
| 警报指示器 | 屏幕边缘脉冲 + 进度条 | 同意，强调余光可感知 | ✅ 红脉冲光环 + 进度条 |
| 抓取点指示 | 拖拽实时显示端点圈 | 强调可预测性重要 | ✅ 拖拽时显示端点圈 |

---

## 7. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Canvas 性能 60fps 不稳定 | 游戏卡顿 | 限制手臂段数 ≤5, 碰撞检测间隔帧 |
| 触屏拖拽精度不足 | 玩家挫败 | 抓取 AABB 比视觉大 15% 缓冲区 |
| 单局超时体验不佳 | 玩家不满 | 180s 倒计时且有视觉/听觉预警（最后 30s 加速脉冲） |
| 移动端字体加载慢 | 首屏延迟 | Google Fonts fallback 到 system-ui |
