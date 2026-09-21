package com.crabcli.library.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * 借阅记录（F3 / Issue #122）：borrow_records 表一行（schema.sql:72 建表，FK→readers/books）。
 * 时间列统一 TEXT ISO-8601 UTC（schema.sql:5），原样携带由读方解析。
 * <p>status 存储态见 {@link BorrowStatus}；OVERDUE 不落库，由本类按契约定稿实时派生：
 * <ul>
 *   <li>{@link #effectiveStatus(LocalDate)}：存储 BORROWED 且 {@code returnedAt == null 且
 *       dueDate < today} 判 OVERDUE，其余存储态原样返回；</li>
 *   <li>{@link #overdueDays(LocalDate)}：{@code max(0, today − dueDate)}，当天 = 0、
 *       超 1 天 = 1；today 由调用方按业务时区给出。</li>
 * </ul>
 */
public record BorrowRecord(int id, int readerId, int bookId, String borrowedAt, String dueAt,
                           String returnedAt, int renewCount, String status,
                           String compensationStatus, String createdAt) {

    /** 实时派生后的契约状态：存储态非 BORROWED 原样返回，BORROWED 按逾期算式判 OVERDUE。 */
    public BorrowStatus effectiveStatus(LocalDate today) {
        if (!BorrowStatus.BORROWED.name().equals(status)) {
            return BorrowStatus.valueOf(status);
        }
        return isOverdue(today) ? BorrowStatus.OVERDUE : BorrowStatus.BORROWED;
    }

    /** 逾期判定（契约定稿）：未归还且 dueDate 早于 today。已归还行恒不判逾期。 */
    public boolean isOverdue(LocalDate today) {
        return returnedAt == null && dueDate().isBefore(today);
    }

    /** 逾期天数 = max(0, today − dueDate)：当天 = 0，超 1 天 = 1（#122 验收口径）。 */
    public long overdueDays(LocalDate today) {
        return Math.max(0, ChronoUnit.DAYS.between(dueDate(), today));
    }

    /** due_at 存 ISO-8601 UTC 文本，日期部分取前 10 字符（列约束 NOT NULL，无缺省分支）。 */
    private LocalDate dueDate() {
        return LocalDate.parse(dueAt.substring(0, 10));
    }
}
