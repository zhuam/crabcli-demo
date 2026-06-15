# Pomodoro · 25 分钟极简番茄钟

一个零依赖、纯前端的极简（modern-minimal）番茄钟 Web 应用。打开 `index.html` 即可使用。

## 功能

- **25 分钟倒计时**，专为单次专注会话设计。
- **三个核心操作**：开始（Start）、暂停（Pause / Resume）、重置（Reset）。
- **完成提示**（三层渐进、互不打扰）：
  1. **视觉**：整页柔和的金色径向脉冲 + 倒计时数字变金色。
  2. **声音**：Web Audio 合成两声短促蜂鸣（220Hz → 440Hz），可静音。
  3. **标题**：浏览器 tab 标题切换为 `✓ Done — Pomodoro …`，让后台 tab 也能感知。
- **键盘快捷键**：`Space` 开始/暂停，`R` 重置，`S` 切换静音。
- **暗色模式**：跟随系统 `prefers-color-scheme`，也可点右上角主题按钮手动切换（偏好持久化）。
- **可访问性**：语义化 ARIA、`role="timer"`、完成时通过 `aria-live="assertive"` 朗读一次；颜色对比满足 WCAG AA。
- **响应式**：桌面 / 平板 / 移动 / 横屏均自动适配，数字字号用 `clamp()` 平滑伸缩。

## 文件结构

```
games/pomodoro/
├── index.html   # 页面结构（语义化 main / button / timer）
├── style.css    # 设计 token、布局、状态样式、完成动画、暗色模式、响应式
├── app.js       # 计时引擎 + 状态机 + Web Audio + 快捷键 + 偏好持久化
└── README.md    # 本文件
```

## 使用方法

### 1. 直接打开

双击 `games/pomodoro/index.html`，或在终端：

```bash
open games/pomodoro/index.html        # macOS
xdg-open games/pomodoro/index.html    # Linux
```

### 2. 通过本地静态服务器

某些浏览器会限制 `file://` 协议下的部分 API。推荐起一个静态服务器：

```bash
cd games/pomodoro
python3 -m http.server 8080
# 然后访问 http://localhost:8080/
```

### 3. 通过项目 hub

本目录会被 hub 网关静态托管为 `/games/pomodoro/`。

## 操作说明

| 状态 | 主按钮文案 | 主按钮动作 | 重置按钮 |
| --- | --- | --- | --- |
| idle（初始） | Start | 开始 25:00 倒计时 | 禁用 |
| running（计时中） | Pause | 暂停 | 可用，回到 25:00 |
| paused（已暂停） | Resume | 从断点续计 | 可用，回到 25:00 |
| done（已完成） | Start new session | 重新开始一轮 | 可用，回到 25:00 |

### 快捷键

| 键 | 动作 |
| --- | --- |
| `Space` | 开始 / 暂停 / 续计（按当前状态） |
| `R` | 重置到 25:00 |
| `S` | 切换静音 |

## 设计原则

- **一个主角**：倒计时数字是页面唯一焦点，字号 `clamp(96px, 18vw, 184px)`，等宽字体（`tabular-nums`）防止数字跳动。
- **一个强调色**：运行中用单一强调色（蓝紫），完成用单一金色；其余全部中性灰阶。
- **零装饰**：无渐变堆叠、无阴影炫技、无 emoji 主图标、无外部字体或图片资源。
- **静默优先**：会话期间页面"不打扰"，只有完成那一刻打破宁静。
- **降级安全**：所有动效都尊重 `prefers-reduced-motion: reduce`；声音可关闭并持久化。

## 技术要点

- **wall-clock + rAF 计时**：内部维护 `endTime = Date.now() + remaining`，每帧用 `requestAnimationFrame` 重算 `remaining = endTime - Date.now()`。这意味着：
  - tab 切到后台被节流后，回到前台首帧立即同步真实剩余时间，**无累计误差**。
  - 暂停/恢复零误差：`endTime ⇄ remaining` 双形态切换。
  - 不依赖 `setInterval`（会因 jitter 漂移）。
- **状态机**：`idle / running / paused / done`，按钮文案与可用性由状态驱动，避免散落的 if 分支。
- **AudioContext 懒加载**：首次点击 Start 时才创建，绕过浏览器自动播放策略。Safari 走 `webkitAudioContext` 兜底。
- **零依赖**：纯 HTML + CSS + JS，无 npm、无 CDN、无外部字体或音频文件。

## 浏览器兼容

- Chrome / Edge / Safari / Firefox 现代版本（要求支持 `oklch()` / `color-mix()` / Web Audio）。
- 不支持 IE。

## 已知边界

- 系统时间被手动改动会影响 wall-clock 计时（生产取舍：MVP 不处理）。
- 通知（`Notification API`）默认不主动请求权限；如需系统通知，请在浏览器设置中手动允许本站。

— END —
