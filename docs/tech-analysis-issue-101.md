# 技术分析报告：统一游戏大厅（Game Hub）

> Issue #101 — 构建一个游戏大厅
> 分析师：tech-analyst（技术视角）
> 日期：2026-06-14

---

## 1. 现状分析

### 1.1 现有游戏清单

| # | 游戏 | 位置 | 架构 | 端口 | 账户 |
|---|------|------|------|------|------|
| 1 | Astrocade Trivia Royale | `index.html` + `src/` | WebSocket 多人游戏 (ws) | Vite 3000 + Server 3001 | 无（仅名字输入）|
| 2 | Idle Lemonade Stand | `games/099-idle-lemonade-stand/` | 纯前端单文件 (app.js) | 无（静态文件） | localStorage |

**代码引用**：
- Trivia Royale 端口：`src/server/index.ts:383` — `PORT = parseInt(process.env.PORT || '3001', 10)`
- Vite 代理配置：`vite.config.ts:11-19` — `server.port: 3000`, `proxy: { '/ws': { target: 'ws://localhost:3001' } }`
- Lemonade Stand 无后端：`games/099-idle-lemonade-stand/app.js` — 纯 IIFE，无 server 依赖
- Lemonade Stand 存档：`app.js:59-72` — `localStorage.getItem/setItem('idle_lemonade_best')`

### 1.2 已识别的核心问题

**问题 1 — 端口混乱**：每款新增游戏都需要独立端口，Trivia Royale 已占用 3000/3001 两个端口。扩展到几百款游戏时，端口管理将不可持续。

**问题 2 — 无统一导航**：Trivia Royale 直接作为 `index.html`（项目首页），Lemonade Stand 放在 `games/` 子目录下手动访问。没有游戏注册表、索引页或路由机制。

**问题 3 — 账户体系碎片化**：Trivia Royale 无认证（仅输入名字进入房间），Lemonade Stand 用 localStorage 存最佳成绩。两者完全不互通，无法实现跨游戏排行榜或用户偏好。

---

## 2. 技术架构设计

### 2.1 总体架构

```
                    ┌──────────────────────┐
                    │   统一网关 (Port 80) │
                    │   Express/Fastify    │
                    └──┬───────┬───────┬───┘
                       │       │       │
               静态文件路由  WebSocket路由  游戏API
                       │       │       │
              ┌────────┘       │       └────────┐
              ▼                ▼                ▼
        /hub/ (大厅)     /ws/game/:id     /api/*
        /games/:id/      (按游戏分通道)   /auth/*
        静态HTML/JS/CSS                  /scores/*
```

**核心原则**：所有流量收敛到 **单一 HTTP 端口**（生产环境 Port 80/443，开发环境 Port 3000），通过 URL 路径前缀区分游戏。

### 2.2 统一端口策略（解决 Issue 第 2 点）

#### 方案：统一网关 + 路径路由

**推荐方案 — 单服务器反向路由**：

用 Express 作为统一入口服务器，替代当前的 Vite dev server + 独立后端 的双端口架构：

```
生产/开发统一：PORT=3000 (单一入口)
├── GET /                    → 游戏大厅首页（hub）
├── GET /games/:id           → 游戏静态资源（每个游戏独立目录）
├── GET /games/:id/*         → 游戏子资源（CSS/JS/images）
├── WS  /ws/game/:id         → 游戏 WebSocket 通道
├── GET /api/auth/*          → 统一认证 API
├── GET /api/scores/*        → 统一分数/排行榜 API
└── GET /health              → 健康检查
```

**迁移路径**：
1. Trivia Royale 的 WebSocket 从 `/ws` 改为 `/ws/game/trivia`（`src/server/index.ts:430` 当前 `path: '/ws'`）
2. 静态资源从 Vite build output 改为网关统一 serve
3. 取消独立 `dev:server` 进程，`npm run dev` 只启动一个统一服务器

#### 备选方案评估

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| 单 Express 网关（推荐） | 简单、单端口、易部署 | 所有游戏跑在同一进程 | ★★★★★ |
| Nginx 反向代理 | 隔离性好、适合生产 | 开发环境配置重 | ★★★ |
| Docker + 端口映射 | 完全隔离 | 运维复杂、不适合 demo 项目 | ★★ |

### 2.3 游戏导航与注册机制（解决 Issue 第 1 点）

#### 2.3.1 游戏元数据注册表

创建 `games/registry.json` 作为所有游戏的统一注册表：

```json
{
  "games": [
    {
      "id": "trivia-royale",
      "name": "Astrocade Trivia Royale",
      "description": "多人实时答题竞技",
      "category": "puzzle",
      "tags": ["multiplayer", "websocket", "trivia"],
      "thumbnail": "/games/trivia-royale/thumb.png",
      "path": "/games/trivia-royale/",
      "hasServer": true,
      "players": "2-8",
      "version": "1.0.0"
    },
    {
      "id": "idle-lemonade",
      "name": "Idle Lemonade Stand",
      "description": "柠檬水摊位经营模拟",
      "category": "idle",
      "tags": ["singleplayer", "idle", "management"],
      "thumbnail": "/games/idle-lemonade/thumb.png",
      "path": "/games/idle-lemonade/",
      "hasServer": false,
      "players": "1",
      "version": "1.0.0"
    }
  ],
  "categories": [
    { "id": "puzzle", "name": "益智问答", "icon": "🧩" },
    { "id": "idle", "name": "放置经营", "icon": "🏪" },
    { "id": "action", "name": "动作", "icon": "⚡" },
    { "id": "strategy", "name": "策略", "icon": "♟️" },
    { "id": "casual", "name": "休闲", "icon": "🎮" }
  ]
}
```

#### 2.3.2 大厅页面架构

大厅页面 `index.html`（替换当前 Trivia Royale 首页）：

```
┌──────────────────────────────────────┐
│  🎮 CrabCLI Arcade    [搜索]  [登录] │
├──────────────────────────────────────┤
│  分类筛选: [全部] [益智] [放置] [动作]│
├──────────────────────────────────────┤
│                                      │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │  🧩 │ │  🏪 │ │  ⚡ │ │  ♟️ │   │
│  │问答 │ │经营 │ │ ... │ │ ... │   │
│  │2-8人│ │1人  │ │     │ │     │   │
│  └─────┘ └─────┘ └─────┘ └─────┘   │
│                                      │
│  分页: < 1 2 3 4 ... 20 >            │
└──────────────────────────────────────┘
```

**前端技术选择**：
- 纯 HTML/CSS/JS（与现有游戏风格一致）
- CSS Grid 卡片布局 + 虚拟滚动（支持几百款游戏）
- 客户端搜索（注册表 JSON 加载后过滤，几百项不需要后端搜索）
- 可选：IndexedDB 缓存注册表，减少加载

#### 2.3.3 可扩展性考虑（几百款游戏）

| 规模 | 方案 | 说明 |
|------|------|------|
| < 50 款 | 客户端过滤 | 注册表 JSON 一次性加载，JS 过滤排序 |
| 50-500 款 | 分页 + 懒加载 | 每页 24 款，滚动加载 |
| 500+ 款 | 后端搜索 API | `/api/games/search?q=...&category=...` |

当前阶段（< 50 款）无需后端搜索，客户端过滤即可满足。

### 2.4 统一账户体系（解决 Issue 第 3 点）

#### 2.4.1 轻量级认证方案

推荐 **JWT Cookie + 无状态 session**：

```
┌─────────────────────────────────────────┐
│  用户注册/登录                           │
│  POST /api/auth/register {name, email?} │
│  POST /api/auth/login     {name}        │
│  → 返回 Set-Cookie: token=<JWT>         │
│     HttpOnly, Secure, SameSite=Strict   │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  游戏内调用                              │
│  GET /api/auth/me  → {id, name, avatar} │
│  每个游戏通过统一 API 获取当前用户身份    │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│  跨游戏数据                              │
│  GET  /api/scores?gameId=xxx            │
│  POST /api/scores  {gameId, score, meta}│
│  GET  /api/scores/leaderboard?gameId=xx │
└─────────────────────────────────────────┘
```

**JWT Payload**：
```typescript
interface UserToken {
  userId: string;      // 用户唯一 ID
  name: string;        // 显示名称
  createdAt: number;   // 注册时间戳
  iat: number;         // issued at
  exp: number;         // expires at (7天)
}
```

#### 2.4.2 迁移现有游戏

| 游戏 | 当前 | 迁移后 |
|------|------|--------|
| Trivia Royale | 输入名字 → 随机 playerId | 自动获取 JWT name，保留房间逻辑 |
| Lemonade Stand | localStorage 存最佳成绩 | POST /api/scores 统一持久化 |

#### 2.4.3 数据库选择

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| SQLite（文件 DB） | 零配置、单文件、适合 demo | 并发写入有限 | ★★★★★ |
| PostgreSQL | 生产级、强一致 | 需要额外服务 | ★★★ |
| 纯内存 + 定期快照 | 最简单 | 重启丢失数据 | ★★ |

**推荐 SQLite**：零外部依赖，一个 `.db` 文件，通过 `better-sqlite3` 或 `sql.js` 集成。

---

## 3. 实施阶段规划

### Phase 1: 统一网关（1-2 天）
- [ ] 创建统一 Express 入口 `src/gateway/server.ts`
- [ ] 迁移 Trivia Royale 静态资源到 `/games/trivia-royale/`
- [ ] 配置路由：`/` → 大厅占位页，`/games/:id/*` → 静态文件
- [ ] WebSocket 统一前缀 `/ws/game/:id`
- [ ] 保留现有 Vite 构建流程，修改 output 到 `dist/games/:id/`

### Phase 2: 游戏大厅（2-3 天）
- [ ] 创建 `games/registry.json` 注册表
- [ ] 实现大厅首页 `src/hub/index.html`（卡片布局 + 分类筛选 + 搜索）
- [ ] 实现 `/api/games` 端点返回注册表
- [ ] 每个游戏添加 `thumb.png` 和 `manifest.json`

### Phase 3: 统一账户（2-3 天）
- [ ] SQLite 用户表 + JWT 认证中间件
- [ ] `/api/auth/register`、`/api/auth/login`、`/api/auth/me`
- [ ] 分数/排行榜 API：`/api/scores/*`
- [ ] Trivia Royale 迁移到统一 auth
- [ ] Lemonade Stand 迁移到统一 scores

### Phase 4: 扩展性（可选）
- [ ] 游戏 SDK：`game-sdk.js` 统一封装 auth + scores API
- [ ] 游戏接入指南 / 模板
- [ ] 管理后台：添加/编辑/下架游戏
- [ ] 虚拟滚动 + 懒加载（超过 50 款时）

---

## 4. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 游戏静态资源路径迁移导致 404 | 中 | 高 | 网关层兼容旧路径，逐步迁移 |
| WebSocket 多游戏路由冲突 | 低 | 高 | 严格按 `/ws/game/:id` 隔离 |
| 几百款游戏时前端渲染卡顿 | 中 | 中 | 虚拟滚动 + 分页 + 按需加载 |
| JWT 泄露（XSS） | 低 | 高 | HttpOnly cookie + SameSite=Strict |
| 现有 Trivia Royale  multiplayer 逻辑破坏 | 中 | 高 | 保留房间管理逻辑不变，只改入口路径 |

---

## 5. 文件结构规划（实施后）

```
crabcli-demo/
├── src/
│   ├── gateway/
│   │   └── server.ts              # 统一 Express 入口
│   ├── auth/
│   │   ├── middleware.ts          # JWT 验证中间件
│   │   └── routes.ts              # /api/auth/* 路由
│   ├── scores/
│   │   └── routes.ts              # /api/scores/* 路由
│   └── shared/
│       └── types.ts               # 共享类型
├── hub/
│   ├── index.html                 # 游戏大厅首页
│   ├── hub.js                     # 大厅前端逻辑
│   └── hub.css                    # 大厅样式
├── games/
│   ├── registry.json              # 游戏注册表
│   ├── trivia-royale/             # 迁移后的 Trivia
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── style.css
│   └── idle-lemonade/             # 迁移后的 Lemonade
│       ├── index.html
│       ├── app.js
│       └── style.css
├── questions/
│   └── bank.ts                    # 保持不变
├── db/
│   └── data.sqlite                # SQLite 数据库文件（gitignore）
├── package.json                   # 更新 scripts
├── vite.config.ts                 # 多入口配置
└── tsconfig.json
```

---

## 6. 总结

**核心结论**：
1. **端口统一**：单一 Express 网关收敛到 Port 3000，通过 URL 路径前缀 (`/games/:id`, `/ws/game/:id`) 路由到具体游戏，彻底消除端口混乱。
2. **导航统一**：`games/registry.json` 元数据注册表 + 大厅首页（卡片网格 + 分类筛选 + 客户端搜索），支持渐进扩展到几百款游戏。
3. **账户统一**：JWT Cookie 认证 + SQLite 持久化 + 跨游戏分数 API，轻量无外部依赖。

**与 UX 分析的接口点**：
- 大厅页面的卡片信息密度、分类标签展示 → UX 视角主导
- 登录/注册流程的交互细节 → UX 视角主导
- 技术侧保证：注册表 JSON 提供游戏名称、描述、分类、缩略图、玩家数等字段，供 UX 层灵活编排
