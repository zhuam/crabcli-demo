package com.crabcli.library.domain;

/**
 * 书籍类别（F11 / Issue #119）：books.category_id 的引用目标（schema.sql:54）。
 * <p>名称唯一（idx_categories_name），重复由服务层回 409 DUPLICATE_CATEGORY；
 * 被书籍引用时禁止删除（409 CATEGORY_IN_USE，业务 CRUD 见 #121）。
 */
public record Category(Integer id, String name) {
}
