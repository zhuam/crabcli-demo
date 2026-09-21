package com.crabcli.library.domain;

/**
 * 读者档案（F1 / Issue #120）：readers 表一行 + 两个派生读数。
 * <p>status 契约字面为 {@code ACTIVE / INACTIVE}（#120 注销；dict.js readerStatus 对称），
 * 存储同字面（schema.sql CHECK）。maxBorrow 与 activeBorrowCount 不是表列，由
 * {@code ReaderRepository#BASE_SELECT} JOIN 带出：maxBorrow 经 reader_types 实时读取
 * （#119 参数化，PUT 后立即生效）；activeBorrowCount 口径 = 契约状态
 * ∈ {BORROWED, OVERDUE, LOST} 的借阅记录数（丢失未赔仍占配额，[假设 A8]；
 * 已赔 LOST_PAID 不占），前端直接消费不自行统计。
 */
public record Reader(int id, String cardNo, String name, String readerTypeCode,
                     String phone, String email, String status,
                     int maxBorrow, int activeBorrowCount, String createdAt) {
}
