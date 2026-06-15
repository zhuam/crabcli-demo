# Stopwatch · 极简秒表

> 一块数字。三颗按钮。其他什么都没有。

毫秒级精度（显示 1/100s）的极简风格秒表 Web 应用，纯静态 HTML + CSS + JS，
无构建、无依赖。视觉沿用项目「modern-minimal」设计令牌（OKLch 中性 + 单 accent，
等宽数字 `tabular-nums` 防抖动），随系统自动切换暗色。

## 功能

- **开始 / 暂停 / 继续**：主按钮一键切换
- **记圈**：仅运行中可用，新圈 unshift 置顶高亮
- **清零**：仅暂停且非零时可用，避免误清进行中的计时
- **毫秒级显示**：`MM:SS.cc`，跨 60 分钟自动扩展为 `H:MM:SS.cc`
- **键盘快捷键**：`Space` 主按钮 / `L` 记圈 / `R` 清零
- **暗色模式**：随 `prefers-color-scheme` 自动切换，不内置 toggle
- **A11y**：语义化 `<button>` + `disabled`、`focus-visible` 描边、对比度 ≥ AAA

## 快捷键

| 键 | 动作 | 生效条件 |
|---|---|---|
| `Space` | 主按钮（开始 / 暂停 / 继续） | 全局，输入框聚焦时不触发 |
| `L` | 记圈 | 仅 RUNNING |
| `R` | 清零 | 仅 PAUSED 且 elapsed > 0 |
| `Tab` | 焦点：主按钮 → 记圈 → 清零 | 全局 |

## 启动方式

零依赖，**直接打开 `index.html` 即可**：

```bash
# 方式 A：双击 / 浏览器拖入
open games/stopwatch/index.html       # macOS
xdg-open games/stopwatch/index.html   # Linux

# 方式 B：本地静态服务（任选其一）
python3 -m http.server 8000
# → 访问 http://localhost:8000/games/stopwatch/
```

也可以直接走仓库现有的 hub 入口（`games/registry.json` 已有同类条目示例）。

## 文件结构

```
games/stopwatch/
├── index.html   # 语义化结构（<time> 显示 + <button> 控制 + <ol> 圈表）
├── styles.css   # 设计令牌（OKLch）+ 状态样式 + 响应式 + 暗色
├── app.js       # 计时状态机 + rAF 节流渲染 + 快捷键守卫
└── README.md    # 本文
```

## 关键技术注释

- **抗漂移计时**：内部用 `performance.now()`，暂停模型 `startRef = now − elapsed`，
  恢复时一减就还原，切到后台再回前台不漂移。
- **渲染节流**：`requestAnimationFrame` 驱动，DOM 写入限定 ≥33ms（约 30 fps），
  cs 位人眼可读且不糊。
- **状态机**：`idle | running | paused`，按钮 `disabled` 与主按钮文案随状态自动切换。
- **laps 数据**：`[{idx, lapMs, totalMs}]`，新圈 `unshift` 后只插一个 `<li>`，无全量重排。
- **键盘守卫**：`keydown` 监听检查 `target.tagName ∉ {INPUT, TEXTAREA, SELECT}`
  且非 `contentEditable`，避免与未来表单/搜索框抢焦。
- **tabular-nums**：主时间与圈表均启用 `font-variant-numeric: tabular-nums`，
  数字翻动时宽度恒定。

## 浏览器要求

Chrome 90+ / Firefox 88+ / Safari 15+（`performance.now()` + OKLch + `clamp()`）。
