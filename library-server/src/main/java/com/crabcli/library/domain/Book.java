package com.crabcli.library.domain;

import java.util.List;

/**
 * 书籍（F2 / Issue #121）：书籍管理 CRUD 与下架的领域载体。
 * <p>status 取值 ACTIVE / WITHDRAWN（下架，#121 契约定名，schema.sql:62 CHECK 同步）；
 * bookCode 全馆唯一（idx_books_book_code 兜底，重复回 409 DUPLICATE_BOOK_CODE）。
 * <p>availableCopies 为读时推导值（不落库），正式口径已收口 AvailableCopiesService
 * （BE-B07 / #122）：ACTIVE = totalCopies − 占用借阅（存储 BORROWED/LOST）− HELD 预约，
 * WITHDRAWN = 0；列表行与单书查询共用其 AVAILABLE_COPIES_SQL 片段，全仓一个口径来源。
 */
public record Book(Integer id, String bookCode, String title, String author, Integer categoryId,
                   List<String> keywords, int totalCopies, int availableCopies,
                   String status, String remark, String createdAt, String updatedAt) {

    public static final String STATUS_WITHDRAWN = "WITHDRAWN";
}
