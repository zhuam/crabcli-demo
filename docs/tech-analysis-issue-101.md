# 技术分析报告：统一游戏大厅（Game Hub）— 实施状态评估

> Issue #101 — 构建一个游戏大厅
> 分析师：tech-analyst（技术视角）
> 日期：2026-06-14
> 状态：**核心架构已实现**，部分功能待完善

---

## 1. 执行摘要

经过对代码库的全面审查，Issue #101 提出的三项需求（统一导航、统一端口、统一账户）**核心架构已全部实现**。当前系统已具备：

- **统一网关**：`src/gateway/server.ts` — 单端口（3000）HTTP + WebSocket 入口
- **游戏大厅**：`hub/index.html` + `hub.js` + `hub.css` — 卡片网格 + 分类筛选 + 搜索 + 认证
- **游戏注册表**：`games/registry.json` — 24 款游戏，5 个分类
- **统一认证**：JWT Cookie + SQLite 用户表
- **跨游戏 API**：分数/排行榜、收藏

**剩余工作**：Favorites UI 集成、Guest 模式、规模化到几百款游戏的性能优化、实际游戏资源迁移。

---

## 2. 现状详细分析

### 2.1 需求一：支持几百款游戏的导航和查找

#### 已实现

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 游戏注册表 | `games/registry.json` | 24 款游戏，每款含 id、name、description、category、tags、players、rating、featured 等元数据 |
| 分类导航 | `hub/hub.js:125-131` | 5 个分类（all/puzzle/idle/action/strategy/casual），chip 标签页 |
| 搜索 | `hub/hub.js:237-242` | 输入框 + 300ms 防抖，支持名称/描述/分类/tags 全文匹配 |
| 排序 | `hub/hub.js:175-188` | 4 种排序：Popular、Newest、Rating、A-Z |
| Featured 推荐 | `hub/hub.js:134-152` | 横向滚动推荐栏 |
| API 端点 | `src/gateway/server.ts:111-117` | `/api/games` 和 `/api/games/categories` |

#### 证据引用
- `games/registry.json:1-312` — 完整注册表，24 款游戏
- `hub/hub.js:44-51` — 初始化流程：loadRegistry → checkAuth → renderCategories → renderFeatured → applyFilters → bindEvents
- `src/gateway/server.ts:111-113` — `GET /api/games` 返回 REGISTRY

#### 剩余 Gap

| Gap | 优先级 | 说明 |
|-----|--------|------|
| 虚拟滚动/分页 | 中 | 当前无分页，24 款尚可，50+ 需虚拟滚动 |
| 收藏 UI 集成 | 中 | Favorites API 已实现（`src/gateway/favorites.ts`），但 hub 页面无收藏入口 |
| "最近游玩" | 低 | 无 recently-played 功能 |
| 游戏缩略图 | 低 | registry 声明了 thumbnail 字段但磁盘上无实际图片 |

### 2.2 需求二：HTTP 端口统一

#### 已实现

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 单端口 HTTP | `src/gateway/server.ts:15` | PORT=3000，所有路由收敛于此 |
| 游戏静态资源 | `src/gateway/server.ts:153-172` | `/games/:id/*` 路由到对应游戏目录 |
| WebSocket 路由 | `src/gateway/server.ts:187-216` | `/ws/game/:id` 按游戏分通道 |
| 游戏目录解析 | `src/gateway/server.ts:24-43` | findGameDir() 支持数字前缀 stripping 和模糊匹配 |
| Hub 静态 | `src/gateway/server.ts:138-150` | `/` → hub/index.html, `/hub/*` → hub/ 目录 |

#### 证据引用
- `src/gateway/server.ts:15` — `const PORT = parseInt(process.env.PORT || '3000', 10)`
- `src/gateway/server.ts:106-175` — 完整路由表：/health, /api/games, /api/auth/*, /api/scores/*, /api/favorites/*, /, /hub/*, /games/:id/*
- `src/gateway/server.ts:187-216` — WebSocket upgrade 处理，按 `/ws/game/:id` 分发
- `vite.config.ts:11-19` — Vite dev server 端口 3000，WS 代理到 3001

#### 剩余 Gap

| Gap | 优先级 | 说明 |
|-----|--------|------|
| 旧端口清理 | 中 | `src/server/index.ts` 仍有独立 3001 端口服务（Trivia Royale 旧入口） |
| 实际游戏资源迁移 | 高 | registry 有 24 款游戏，但磁盘上只有 `games/099-idle-lemonade-stand/` 一个实际游戏目录 |
| 生产环境部署 | 低 | `npm run start` → `tsx src/gateway/server.ts`，无 Nginx 层 |

### 2.3 需求三：统一账户体系

#### 已实现

| 功能 | 文件位置 | 说明 |
|------|----------|------|
| 用户注册 | `src/gateway/auth.ts:22-43` | POST /api/auth/register — 用户名，UUID，SQLite |
| 用户登录 | `src/gateway/auth.ts:46-59` | POST /api/auth/login — 用户名匹配 |
| 用户查询 | `src/gateway/auth.ts:63-76` | GET /api/auth/me — JWT Cookie 验证 |
| JWT 中间件 | `src/gateway/auth-middleware.ts` | parseCookies + verifyToken |
| Cookie 设置 | `src/gateway/auth.ts:9-11` | HttpOnly, SameSite=Lax, Path=/, 7 天过期 |
| 分数 API | `src/gateway/scores.ts` | 提交分数、个人分数查询、游戏排行榜 |
| 收藏 API | `src/gateway/favorites.ts` | 查看收藏、切换收藏状态 |
| 数据库 | `src/gateway/db.ts` | SQLite WAL 模式，users/scores/favorites 三表 |
| Hub 认证 UI | `hub/hub.js:67-105` | checkAuth → user badge / guest badge，登录/注册 modal |

#### 证据引用
- `src/gateway/db.ts:23-49` — 三表 schema：users (id, name, createdAt), scores (id, userId, gameId, score, metadata, createdAt), favorites (userId, gameId)
- `src/gateway/auth.ts:7` — `const JWT_SECRET = process.env.JWT_SECRET || 'crabcli-arcade-secret'`
- `src/gateway/auth.ts:40` — `jwt.sign({ userId: id, name, createdAt }, JWT_SECRET, { expiresIn: '7d' })`
- `hub/hub.js:270-305` — 登录/注册表单提交逻辑
- `src/shared/hub-types.ts` — 完整的 TypeScript 类型定义：GameEntry, User, ScoreEntry, LeaderboardEntry 等

#### 剩余 Gap

| Gap | 优先级 | 说明 |
|-----|--------|------|
| 无密码认证 | 高 | 当前仅用户名注册/登录，无密码校验，存在身份冒用风险 |
| 无 Guest 模式 | 中 | Hub 无 guest-first 流程，未登录时显示 "Sign In" 按钮 |
| 无 Guest→Account 迁移 | 低 | localStorage 数据无法合并到云端 |
| 无 Profile 页面 | 低 | 无用户资料页（统计、成就、设置） |
| JWT Secret 硬编码 | 低 | 默认 secret 为 `'crabcli-arcade-secret'`，生产环境需环境变量 |

---

## 3. 架构评估

### 3.1 当前架构

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

**技术栈**：
- 运行时：Node.js + tsx (TypeScript 直接执行)
- HTTP：Node 原生 `http.Server`（无 Express/Fastify 框架）
- WebSocket：`ws` 库，noServer 模式手动 upgrade
- 数据库：SQLite via `better-sqlite3`，WAL 模式
- 认证：JWT via `jsonwebtoken`，Cookie 传输
- 前端：纯 HTML/CSS/JS，无框架

### 3.2 可扩展性评估

| 维度 | 当前状态 | 上限预估 | 瓶颈 |
|------|----------|----------|------|
| 游戏数量 | 24 款注册，1 款有资源 | ~200 款（客户端过滤） | 注册表 JSON 大小 + 前端渲染性能 |
| 并发用户 | 单机 WebSocket | ~1000 连接（Node.js 单进程） | CPU + 内存，无水平扩展 |
| 数据库写入 | SQLite WAL | ~100 writes/s | 并发写入锁 |
| 认证安全 | 仅用户名 | 低 | 无密码，无 rate limiting |

### 3.3 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 游戏资源缺失导致 404 | 高 | 中 | registry 中 23 款游戏无对应目录，网关返回 404 |
| 用户名冒用 | 高 | 高 | 无密码认证，任何人可用他人用户名登录 |
| JWT Secret 泄露 | 中 | 高 | 默认 secret 硬编码在源码中 |
| 数百游戏时前端卡顿 | 中 | 中 | 当前无虚拟滚动，需添加分页/懒加载 |
| WebSocket 单进程瓶颈 | 低 | 中 | 数百并发时 Node 单进程 CPU 受限 |

---

## 4. 实施建议

### Phase 1: 补齐缺失功能（1-2 天）

- [ ] 收藏 UI 集成：在 hub 页添加收藏按钮和收藏列表页
- [ ] Guest 模式：允许未登录用户浏览和玩游戏
- [ ] 密码认证：为注册/登录添加 password 字段
- [ ] 清理旧端口：移除 `src/server/index.ts` 独立服务

### Phase 2: 规模化准备（2-3 天）

- [ ] 虚拟滚动或分页：超过 50 款游戏时启用
- [ ] 注册表懒加载：按需加载游戏元数据
- [ ] 图片懒加载：游戏缩略图按需加载
- [ ] 游戏 SDK：封装 auth + scores API 供新游戏接入

### Phase 3: 安全性增强（1-2 天）

- [ ] JWT Secret 环境变量化
- [ ] Rate limiting：登录接口限流
- [ ] CSRF 保护
- [ ] Input validation 加强

### Phase 4: 游戏资源迁移（持续）

- [ ] 为注册表中 23 款无资源的游戏添加实际内容
- [ ] 缩略图资源准备
- [ ] 每个游戏添加 manifest.json 元数据

---

## 5. 文件索引

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
| `games/099-idle-lemonade-stand/` | 实际游戏资源 | 仅 1 款 |

---

## 6. 总结

**Issue #101 的三项需求均已实现核心架构**：

1. **统一导航** — 注册表驱动的分类/搜索/排序游戏大厅已上线，24 款游戏元数据就绪。扩展到几百款需添加虚拟滚动。
2. **统一端口** — 单端口 3000 网关收敛所有 HTTP/WS 流量，通过路径前缀 `/games/:id` 和 `/ws/game/:id` 路由。旧 3001 端口待清理。
3. **统一账户** — JWT Cookie + SQLite 三表（users/scores/favorites）+ 完整 CRUD API。缺失密码认证和 Guest 模式。

**与 UX 分析的接口点**：
- Favorites API 已就绪但无 UI — UX 侧可设计收藏交互
- 无 Guest 流程 — UX 侧可定义 guest-first onboarding
- 无 Profile 页 — UX 侧可设计用户资料布局
- 注册表字段齐全 — 支持 UX 侧灵活编排游戏展示
