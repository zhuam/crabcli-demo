package com.crabcli.library.domain;

/**
 * 预约（F4/F5 / Issue #122）：reservations 表一行（schema.sql:90 建表，FK→readers/books，
 * 索引 (book_id,status) 支撑 HELD 占用统计）。status 五态均落库（{@link ReservationStatus}）；
 * holdExpiresAt 仅 HELD 有值（还书触发后保留 3 天，B09 业务域）。时间列 TEXT ISO-8601 UTC。
 */
public record Reservation(int id, int readerId, int bookId, String status,
                          String holdExpiresAt, String createdAt, String updatedAt) {
}
