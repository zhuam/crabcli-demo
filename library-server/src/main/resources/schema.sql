-- schema.sql — 图书馆管理系统建表脚本（BE-B01 / Issue #116）
-- 幂等：全部 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，重复启动直接跳过。
-- 外键：SQLite 的 foreign_keys 是连接级开关；运行期由 application.yml 的 Hikari
--       connection-init-sql 在每个连接上打开，这里的 PRAGMA 只覆盖初始化连接。
-- 时间：统一存 TEXT，ISO-8601 UTC 带毫秒（如 2026-09-21T08:30:00.123Z），Java 侧 Instant.parse 可读。

PRAGMA foreign_keys=ON;

-- 读者类型（F1/F11：配额与借期参数化，业务代码不硬编码）
CREATE TABLE IF NOT EXISTS reader_types (
    code        TEXT PRIMARY KEY,          -- NORMAL / TEACHER
    name        TEXT NOT NULL,
    max_borrow  INTEGER NOT NULL,          -- 可借册数上限
    loan_weeks  INTEGER NOT NULL,          -- 借期周数
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 读者档案（F1：注销 = status INACTIVE，契约字面 #120 / 前端 dict.js readerStatus 对称）
CREATE TABLE IF NOT EXISTS readers (
    id               INTEGER PRIMARY KEY,
    card_no          TEXT NOT NULL,        -- 借书证号
    name             TEXT NOT NULL,
    reader_type_code TEXT NOT NULL REFERENCES reader_types(code),
    phone            TEXT,
    email            TEXT,
    status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_readers_card_no ON readers(card_no);

-- 登录账号（F10：bcrypt 哈希 + 三角色；reader_id 仅 READER 角色关联读者档案，
-- 对应 #118 登录契约 user.readerId 仅 READER 有值）
CREATE TABLE IF NOT EXISTS app_users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('ADMIN','LIBRARIAN','READER')),
    display_name  TEXT NOT NULL,
    reader_id     INTEGER REFERENCES readers(id),
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);

-- 书籍类别（F11；重复类别名由唯一索引兜底，#119 服务层回 409）
CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- 书籍（F2：下架 = status WITHDRAWN，#121 契约定名；availableCopies 由借阅与预约状态推导，不落库）
CREATE TABLE IF NOT EXISTS books (
    id           INTEGER PRIMARY KEY,
    book_code    TEXT NOT NULL,            -- 馆藏编号
    title        TEXT NOT NULL,
    author       TEXT NOT NULL,
    category_id  INTEGER NOT NULL REFERENCES categories(id),
    keywords     TEXT,
    total_copies INTEGER NOT NULL CHECK (total_copies > 0),
    status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WITHDRAWN')),
    remark       TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_book_code ON books(book_code);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);

-- 借阅记录（F3/F6/F8/F9，#122 契约定稿存储字面：CHECK 接受 BORROWED/RETURNED/LOST/LOST_PAID；
-- 契约枚举中 OVERDUE 读时派生——returned_at IS NULL AND due_at < 当天，CHECK 拒绝写入；
-- LOST 赔付后流转为 LOST_PAID，compensation_status 记 UNPAID/PAID 留痕；
-- 续借至多 1 次由 CHECK 兜底。改字面前建的旧库需删除重建以拿到新 CHECK，当前无业务数据）
CREATE TABLE IF NOT EXISTS borrow_records (
    id                  INTEGER PRIMARY KEY,
    reader_id           INTEGER NOT NULL REFERENCES readers(id),
    book_id             INTEGER NOT NULL REFERENCES books(id),
    borrowed_at         TEXT NOT NULL,
    due_at              TEXT NOT NULL,
    returned_at         TEXT,              -- NULL = 未归还
    renew_count         INTEGER NOT NULL DEFAULT 0 CHECK (renew_count BETWEEN 0 AND 1),
    status              TEXT NOT NULL DEFAULT 'BORROWED'
                        CHECK (status IN ('BORROWED','RETURNED','LOST','LOST_PAID')),
    compensation_status TEXT CHECK (compensation_status IN ('UNPAID','PAID')),
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_borrow_records_reader ON borrow_records(reader_id);
CREATE INDEX IF NOT EXISTS idx_borrow_records_book ON borrow_records(book_id);
-- BE-B12 / Issue #127 多条件查询索引：状态列 + 借出日（borrowed_at 前 10 字符即
-- borrowDate，表达式索引供 substr 同式过滤走索引，避免全表扫描后内存过滤）
CREATE INDEX IF NOT EXISTS idx_borrow_records_status ON borrow_records(status);
CREATE INDEX IF NOT EXISTS idx_borrow_records_borrow_date
    ON borrow_records(substr(borrowed_at, 1, 10));

-- 预约（F4/F5：还回触发预约 → status HELD 并保留 3 天（hold_expires_at）；
-- availableCopies 不含 HELD 保留副本）
CREATE TABLE IF NOT EXISTS reservations (
    id              INTEGER PRIMARY KEY,
    reader_id       INTEGER NOT NULL REFERENCES readers(id),
    book_id         INTEGER NOT NULL REFERENCES books(id),
    status          TEXT NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING','HELD','FULFILLED','EXPIRED','CANCELLED')),
    hold_expires_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_reservations_book_status ON reservations(book_id, status);
