# Idle Lemonade Stand · 柠檬水帝国

> Issue #99 · 经营 / 放置 · 单局 ≤ 3 分钟 · IPO 上市通关

## 🎮 玩法

点击「卖一杯柠檬水」赚现金 → 招员工 → 解锁口味 / 门店 / 营销升级 → 帝国上市 (IPO $1,000,000) 通关。

- **首屏 3 秒进入**：无教程、无引导，主按钮立即可点
- **单局 2:30 ~ 3:00 完成 IPO**（最长 4 分钟兜底结算）
- **核心循环**：定价 → 招员 → 升级

## ⌨️ 操作

| 输入 | 动作 |
|---|---|
| 触屏点击 / 鼠标 | 卖一杯，购买员工 / 升级 |
| `Space` / `Enter` | 卖一杯 |
| `1` / `2` / `3` | 切换 价格 / 员工 / 升级 tab |
| `+` / `-` | 调价 |
| `M` | 静音切换 |

## ✨ 反馈

- 点击 / 升级 / 通关 各自的 Web Audio 音效
- `navigator.vibrate` 触觉震动（可在静音按钮关闭）
- Confetti 上市动画
- 数字浮字 + 摊位粒子
- `prefers-reduced-motion` 自动降级动画

## 💾 本地存储

`localStorage` key `idle_lemonade_best`：
```json
{ "fastestSec": 153, "maxEarn": 1234567, "gamesPlayed": 5, "ipoCount": 3 }
```

设置（音效）持久化到 `idle_lemonade_settings`。

## 📁 文件

```
games/099-idle-lemonade-stand/
├── index.html   # 结构 + 顶部 / Canvas / 主按钮 / 三 tab / 结算页
├── style.css    # 视觉 + 响应式 + a11y + reduced-motion
└── app.js       # GameState + Tick + 经济 + UI + Canvas + 音效
```

零外部依赖，可直接 GitHub Pages 托管或 `python -m http.server`。

## 🏆 验收对照

- [x] 首屏 3 秒内进入游玩，无教程
- [x] 单局时长 ≤ 3 分钟（IPO ~2:30，4 分钟兜底）
- [x] 触屏 + 鼠标 + 键盘 三种输入全支持
- [x] 胜利 / 时间到结算页有「再来一局」按钮（thumb-zone, ≥60px）
- [x] 关键音效 + 震动反馈
- [x] 通关 / 失败时记录最高分到 localStorage
