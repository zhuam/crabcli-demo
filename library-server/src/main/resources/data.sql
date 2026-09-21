-- data.sql — 默认数据播种（BE-B01 / Issue #116），全部 OR IGNORE，重复启动幂等。
-- 种子账号（仅骨架联调用，登录契约见 #118）：用户名 / 明文密码 / 角色
--   admin     / admin123    ADMIN     系统管理员
--   librarian / lib123456   LIBRARIAN 馆员
--   reader01  / reader123   READER    张小明（读者档案 card_no=R0001）
-- 密码只存 bcrypt 哈希（F10），由 LibrarySchemaTest 用明文逐一验证 matches()。

-- 读者类型（F1/F11 参数化：NORMAL 3 本 / 4 周，TEACHER 6 本 / 8 周）
INSERT OR IGNORE INTO reader_types (code, name, max_borrow, loan_weeks) VALUES
    ('NORMAL',  '普通读者',      3, 4),
    ('TEACHER', '教师·管理员类', 6, 8);

-- 默认类别
INSERT OR IGNORE INTO categories (name) VALUES
    ('计算机技术'),
    ('文学'),
    ('历史'),
    ('自然科学'),
    ('艺术'),
    ('少儿读物');

-- 演示读者档案（与 reader01 账号关联）
INSERT OR IGNORE INTO readers (card_no, name, reader_type_code, phone) VALUES
    ('R0001', '张小明', 'NORMAL', NULL);

INSERT OR IGNORE INTO app_users (username, password_hash, role, display_name, reader_id) VALUES
    ('admin',     '$2a$10$Ya/6ng8LWRMJYvbqhhxRMeZuYyawDU0jrR9htUFlJ0605DDn00UJS', 'ADMIN',     '系统管理员', NULL),
    ('librarian', '$2a$10$zIaz7oxxx6pOJ3GWyuHPs.7h0ScID627xX7aRj.a.X0ogrDmopDy.', 'LIBRARIAN', '馆员',       NULL);

INSERT OR IGNORE INTO app_users (username, password_hash, role, display_name, reader_id)
    SELECT 'reader01', '$2a$10$yax2woBINb4YMhduJGZKLOo6BBtboN5DKeLFPKy3Lcn2JF4dzRYni', 'READER', '张小明', id
    FROM readers WHERE card_no = 'R0001';
