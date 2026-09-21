package com.crabcli.library.domain;

import java.util.List;

/**
 * 书籍（F2 / Issue #121）：书籍管理 CRUD 与下架的领域载体。
 * <p>status 取值 ACTIVE / WITHDRAWN（下架，#121 契约定名，schema.sql:62 CHECK 同步）；
 * bookCode 全馆唯一（idx_books_book_code 兜底，重复回 409 DUPLICATE_BOOK_CODE）。
 * <p>availableCopies 为读时推导值（不落库）：本任务口径 ACTIVE=totalCopies、
 * WITHDRAWN=0；借阅/预约扣减的正式口径收口到 AvailableCopiesService（BE-B07 / #122）。
 */
public record Book(Integer id, String bookCode, String title, String author, Integer categoryId,
                   List<String> keywords, int totalCopies, int availableCopies,
                   String status, String remark, String createdAt, String updatedAt) {

    public static final String STATUS_WITHDRAWN = "WITHDRAWN";
}
