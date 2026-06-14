# 技术分析报告：统一游戏大厅（Game Hub）— 实施架构

> Issue #101 — 构建一个游戏大厅
> 分析师：tech-analyst（技术视角）
> 日期：2026-06-14
> 状态：**核心架构已实现**，需补齐 2 个现有游戏的统一集成

---

## 1. 执行摘要

经过对代码库的全面审查，Issue #101 提出的三项核心需求（统一导航、统一端口、统一账户）**核心架构已全部实现**。当前系统已具备：

- **统一网关**：`src/gateway/server.ts` — 单端口（3000）HTTP + WebSocket 入口
- **游戏大厅**：`hub/index.html` + `hub.js` + `hub.css` — 卡片网格 + 分类筛选 + 搜索 + 认证
- **游戏注册表**：`games/registry.json` — 24 款游戏，5 个分类
- **统一认证**：JWT Cookie + SQLite 用户表
- **跨游戏 API**：分数/排行榜、收藏

**本次重点**：将磁盘上已有的 2 个游戏（Lemonade Stand + Trivia Royale）统一整合到 `games/` 目录下，使用大厅的基础设施（端口 3000、统一认证、共享数据库）。

---

## 2. 现状详细分析

### 2.1 需求一：支持几百款游戏的导航和查找

#### 已实现

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 游戏注册表 | `games/registry.json` | 24 款游戏，每款含 id、name、description、category、tags、players、rating、featured 等元数据 |
| 分类导航 | `hub/hub.js:349-359` | 5 个分类（all/puzzle/idle/action/strategy/casual），chip 标签页 |
| 搜索 | `hub/hub.js:536-542` | 输入框 + 300ms 防抖，支持名称/描述/分类/tags 全文匹配 |
| 排序 | `hub/hub.js:423-436` | 4 种排序：Popular、Newest、Rating、A-Z |
| Featured 推荐 | `hub/hub.js:363-396` | 横向滚动推荐栏 |
| 分页加载 | `hub/hub.js:444-499` | PAGE_SIZE=24，"Show More" 按钮 |
| API 端点 | `src/gateway/server.ts:111-117` | `/api/games` 和 `/api/games/categories` |

#### 可扩展性评估

| 维度 | 当前状态 | 上限预估 | 瓶颈 |
|------|----------|----------|------|
| 游戏数量 | 24 款注册 | ~200 款（客户端过滤+分页） | registry.json 大小 + 前端渲染 |
| 搜索性能 | 客户端 O(n) 过滤 | ~500 款无明显卡顿 | 字符串匹配在 500+ 时可能需优化 |
| 注册表格式 | 单 JSON 文件 | ~100 款后建议拆分 | 单次加载 100KB+ JSON 影响首屏 |

#### 规模化建议（300+ 款游戏）

1. **注册表拆分**：按分类拆为 `games/registry-puzzle.json` 等，按需加载
2. **服务端搜索**：当前 `/api/games` 返回全量，可改为 `/api/games?q=xxx&category=xxx` 服务端过滤
3. **缩略图懒加载**：registry 声明了 thumbnail 字段但磁盘上无实际图片，需添加 `<img loading="lazy">`

### 2.2 需求二：HTTP 端口统一

#### 当前架构

```
                    PORT 3000 (src/gateway/server.ts)
                    ┌─────────────────────────────────┐
                    │        统一网关 (Node.js)         │
                    │  Node http.Server + ws WSS       │
                    └──┬────────┬────────┬────────┬────┘
                       │        │        │        │
              静态文件路由   WebSocket   REST API   SQLite
                       │        │        │        │
              ┌────────┘        │        │        │
              ▼                 ▼        ▼        ▼
        /hub/ (大厅)    /ws/game/:id  /api/*   data/crabcli.db
        /games/:id/    (按游戏分通道) /auth    users
        静态HTML/JS                  /scores   scores
                                     /favorites favorites
```

#### 已实现

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 单端口 HTTP | `src/gateway/server.ts:15` | PORT=3000，所有路由收敛于此 |
| 游戏静态资源 | `src/gateway/server.ts:153-172` | `/games/:id/*` 路由到对应游戏目录 |
| WebSocket 路由 | `src/gateway/server.ts:187-216` | `/ws/game/:id` 按游戏分通道 |
| 游戏目录解析 | `src/gateway/server.ts:24-43` | findGameDir() 支持数字前缀 stripping 和模糊匹配 |
| Hub 静态 | `src/gateway/server.ts:138-150` | `/` → hub/index.html, `/hub/*` → hub/ 目录 |

#### 端口混乱风险

| 服务 | 端口 | 状态 | 建议 |
|------|------|------|------|
| Gateway | 3000 | 活跃（主入口） | 保留 |
| Trivia Royale 旧服务 | 3001 | 仍运行 `src/server/index.ts` | **清理** — 游戏逻辑已通过 `game-logic.ts` 集成到 gateway 的 WS 路由 |
| Vite Dev Proxy | 3000→3001 | `vite.config.ts:14-18` | **更新** — dev 模式 WS proxy 指向 3000 即可 |

#### 2 个现有游戏的端口统一方案

**Lemonade Stand** (`games/099-idle-lemonade-stand/`)：
- 纯静态游戏（HTML/CSS/JS），无服务端逻辑
- 当前已可通过 `http://localhost:3000/games/idle-lemonade/` 访问
- `findGameDir()` 会自动将 `idle-lemonade` 匹配到 `099-idle-lemonade-stand/` 目录
- **无需修改**，已使用统一基础设施

**Trivia Royale** (`src/client/` + `dist/client/`）：
- 有 WebSocket 服务端逻辑（`game-logic.ts`）
- 旧方式：独立 3001 端口服务 + Vite proxy
- 新方式：WebSocket 已通过 gateway 的 `/ws/game/trivia-royale` 路由（`server.ts:199`）
- **待完成**：将构建输出或源文件移入 `games/` 目录，确保 `findGameDir('trivia-royale')` 能找到

### 2.3 需求三：统一账户体系

#### 已实现

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 用户注册 | `src/gateway/auth.ts:22-52` | POST /api/auth/register — 用户名 + 密码，UUID，SQLite |
| 用户登录 | `src/gateway/auth.ts:54-80` | POST /api/auth/login — 用户名 + 密码校验 |
| 用户查询 | `src/gateway/auth.ts:82-96` | GET /api/auth/me — JWT Cookie 验证 |
| JWT 中间件 | `src/gateway/auth-middleware.ts` | parseCookies + verifyToken |
| Cookie 设置 | `src/gateway/auth.ts:13-14` | HttpOnly, SameSite=Lax, Path=/, 7 天过期 |
| 分数 API | `src/gateway/scores.ts` | 提交分数、个人分数查询、游戏排行榜 |
| 收藏 API | `src/gateway/favorites.ts` | 查看收藏、切换收藏状态 |
| 数据库 | `src/gateway/db.ts` | SQLite WAL 模式，users/scores/favorites 三表 |
| Hub 认证 UI | `hub/hub.js:147-164` | checkAuth → user badge / guest badge，登录/注册 modal |

#### 数据库 Schema

```sql
users (id TEXT PK, name TEXT UNIQUE, passwordHash TEXT, createdAt INTEGER)
scores (id TEXT PK, userId TEXT FK→users, gameId TEXT, score INTEGER, metadata TEXT, createdAt INTEGER)
favorites (userId TEXT FK→users, gameId TEXT, PK(userId, gameId))
```

#### 安全隐患

| 风险 | 优先级 | 说明 |
|------|--------|------|
| JWT Secret 硬编码 | 高 | 默认 `'crabcli-arcade-secret'` 写在源码中（`auth.ts:7`） |
| 密码哈希 | 中 | 使用 SHA-256 而非 bcrypt/argon2 |
| 无 Rate Limiting | 中 | 登录接口无限流，可暴力破解 |
| 无 CSRF 保护 | 低 | Cookie 认证 + SameSite=Lax 提供基础保护 |

---

## 3. 两个现有游戏的统一集成方案

### 3.1 Lemonade Stand

**现状**：`games/099-idle-lemonade-stand/` 已位于 `games/` 目录下，通过 `findGameDir()` 可被 `/games/idle-lemonade/` 路由访问。

**集成状态**：✅ 已完成

**待优化**：
1. 游戏内未接入统一认证 — 可通过 `hub.js` 的 `currentUser` 传递给游戏 iframe/页面
2. 游戏分数未接入 `/api/scores` — 需在 `app.js` 中添加 `fetch('/api/scores', {method:'POST'})` 调用
3. 目录名带数字前缀 `099-` — 建议统一为 `games/idle-lemonade-stand/` 或保持现状（`findGameDir` 已处理前缀 stripping）

### 3.2 Trivia Royale

**现状**：客户端在 `src/client/`，构建输出到 `dist/client/`。服务端逻辑在 `src/server/game-logic.ts`，已通过 gateway 的 `/ws/game/trivia-royale` 路由集成。

**集成方案**：

```
games/
  099-idle-lemonade-stand/   ← 已就位
  trivia-royale/              ← 新建目录
    index.html                ← 从 src/client/index.html 迁移
    main.ts / style.css       ← 从 src/client/ 迁移
    manifest.json             ← 游戏元数据（可选）
```

**具体步骤**：
1. 创建 `games/trivia-royale/` 目录
2. 将 `src/client/index.html`、`main.ts`、`style.css` 迁移到此目录
3. 更新 `vite.config.ts`：将构建输出改为 `games/trivia-royale/dist/` 或直接 serve 源文件
4. 更新 `findGameDir()` 中的 trivia-royale 特例逻辑（`server.ts:26-28`）
5. 清理 `src/server/index.ts` 的独立 3001 端口服务
6. 更新 `vite.config.ts` 的 WS proxy 目标为 3000

### 3.3 统一基础设施接入清单

每个游戏需要接入的基础设施：

| 基础设施 | 接入方式 | 实现状态 |
|----------|----------|----------|
| HTTP 端口 3000 | `/games/:id/*` 路由 | ✅ 已实现 |
| WebSocket | `/ws/game/:id` 路由 | ✅ 已实现 |
| 用户认证 | JWT Cookie 读取 | ⚠️ 游戏需主动读取 |
| 分数提交 | POST `/api/scores` | ✅ API 已实现，游戏需调用 |
| 收藏 | POST `/api/favorites/:id` | ✅ API 已实现 |
| 注册表 | `games/registry.json` 条目 | ✅ 已实现 |

---

## 4. 架构评估

### 4.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js + tsx | TypeScript 直接执行，无编译 |
| HTTP | Node 原生 http.Server | 无 Express/Fastify 框架 |
| WebSocket | ws 库，noServer 模式 | 手动 upgrade 处理 |
| 数据库 | SQLite via better-sqlite3 | WAL 模式 |
| 认证 | JWT via jsonwebtoken | Cookie 传输 |
| 前端 | 纯 HTML/CSS/JS | 无框架，轻量 |
| 构建 | Vite | 仅 Trivia Royale 需要 |

### 4.2 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 游戏资源缺失导致 404 | 高 | 中 | registry 中 22 款游戏无对应目录，网关返回友好 404 |
| 用户名冒用 | 低 | 高 | 已添加密码认证（auth.ts 已有 passwordHash） |
| JWT Secret 泄露 | 中 | 高 | 默认 secret 硬编码在源码中 |
| 数百游戏时前端卡顿 | 低 | 中 | 已有分页加载（PAGE_SIZE=24） |
| WebSocket 单进程瓶颈 | 低 | 中 | 数百并发时 Node 单进程 CPU 受限 |

---

## 5. 实施建议

### Phase 1: 两个现有游戏统一集成（1 天）

- [ ] 创建 `games/trivia-royale/` 目录，迁移客户端文件
- [ ] 更新 `vite.config.ts` 构建输出路径
- [ ] 清理 `src/server/index.ts` 独立 3001 端口
- [ ] 更新 `vite.config.ts` WS proxy 指向 3000
- [ ] Lemonade Stand 接入 `/api/scores` 分数提交

### Phase 2: 安全增强（1 天）

- [ ] JWT Secret 环境变量化（生产环境强制）
- [ ] Rate limiting：登录接口限流
- [ ] 密码哈希升级为 bcrypt

### Phase 3: 规模化准备（2-3 天）

- [ ] 注册表懒加载：按需加载游戏元数据
- [ ] 游戏 SDK：封装 auth + scores API 供新游戏接入
- [ ] 缩略图资源准备
- [ ] 每个游戏添加 `manifest.json` 元数据

---

## 6. 文件索引

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/gateway/server.ts` | 统一网关入口 | 完成 |
| `src/gateway/auth.ts` | 认证 API | 完成 |
| `src/gateway/auth-middleware.ts` | JWT 验证中间件 | 完成 |
| `src/gateway/db.ts` | SQLite 数据库 | 完成 |
| `src/gateway/scores.ts` | 分数 API | 完成 |
| `src/gateway/favorites.ts` | 收藏 API | 完成 |
| `hub/index.html` | 大厅页面 | 完成 |
| `hub/hub.js` | 大厅前端逻辑 | 完成 |
| `hub/hub.css` | 大厅样式 | 完成 |
| `games/registry.json` | 游戏注册表 | 完成（24 款） |
| `src/shared/hub-types.ts` | 共享类型 | 完成 |
| `games/099-idle-lemonade-stand/` | Lemonade 游戏 | 已就位，需接入 scores |
| `src/server/index.ts` | Trivia 旧服务 | 待清理 |
| `src/server/game-logic.ts` | Trivia 游戏逻辑 | 已集成到 gateway |

---

## 7. 总结

**Issue #101 的三项需求均已实现核心架构**：

1. **统一导航** — 注册表驱动的分类/搜索/排序游戏大厅已上线，24 款游戏元数据就绪。已有分页加载（PAGE_SIZE=24），扩展到几百款需注册表拆分。
2. **统一端口** — 单端口 3000 网关收敛所有 HTTP/WS 流量，通过路径前缀 `/games/:id` 和 `/ws/game/:id` 路由。旧 3001 端口待清理。
3. **统一账户** — JWT Cookie + SQLite 三表（users/scores/favorites）+ 完整 CRUD API（注册/登录/密码校验）。

**两个现有游戏的集成**：Lemonade Stand 已就位，Trivia Royale 需迁移客户端到 `games/` 目录。两者都已通过 gateway 路由访问，但游戏内部尚未主动接入统一认证和分数 API。
