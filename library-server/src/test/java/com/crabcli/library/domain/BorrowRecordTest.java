package com.crabcli.library.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/**
 * #122 契约字面与 OVERDUE 实时派生纯单测（无 Spring、无库，固定日期自证）：
 * 枚举字面逐一对照契约（验收 2）；逾期判定与天数按「当天 = 0、超 1 天 = 1」验收口径；
 * 已归还行恒不判逾期；LOST / LOST_PAID 存储态原样透传。
 */
class BorrowRecordTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 21);

    @Test
    void statusEnumLiteralsMatchContract() {
        assertThat(BorrowStatus.values()).extracting(Enum::name)
                .containsExactly("BORROWED", "OVERDUE", "RETURNED", "LOST", "LOST_PAID");
        assertThat(ReservationStatus.values()).extracting(Enum::name)
                .containsExactly("WAITING", "HELD", "EXPIRED", "FULFILLED", "CANCELLED");
    }

    @Test
    void borrowedDerivesOverdueInRealtime() {
        // due = 明天、due = 今天 → 未逾期（当天不算，超 1 天才 = 1）
        assertThat(borrowed("2026-09-22", null).effectiveStatus(TODAY)).isEqualTo(BorrowStatus.BORROWED);
        assertThat(borrowed("2026-09-21", null).effectiveStatus(TODAY)).isEqualTo(BorrowStatus.BORROWED);
        assertThat(borrowed("2026-09-21", null).overdueDays(TODAY)).isZero();
        // due = 昨天 → OVERDUE，逾期 1 天；再早 2 天 → 3 天
        assertThat(borrowed("2026-09-20", null).effectiveStatus(TODAY)).isEqualTo(BorrowStatus.OVERDUE);
        assertThat(borrowed("2026-09-20", null).overdueDays(TODAY)).isEqualTo(1);
        assertThat(borrowed("2026-09-18", null).overdueDays(TODAY)).isEqualTo(3);
    }

    @Test
    void returnedRowNeverDerivesOverdue() {
        BorrowRecord returned = record("RETURNED", "2026-06-20T00:00:00.000Z");
        assertThat(returned.effectiveStatus(TODAY)).isEqualTo(BorrowStatus.RETURNED);
        assertThat(returned.isOverdue(TODAY)).isFalse();
    }

    @Test
    void lostAndPaidStoredStatesPassThrough() {
        assertThat(record("LOST", null).effectiveStatus(TODAY)).isEqualTo(BorrowStatus.LOST);
        assertThat(record("LOST_PAID", null).effectiveStatus(TODAY)).isEqualTo(BorrowStatus.LOST_PAID);
    }

    /** 未归还借出记录：dueAt 传日期部分，时间统一补 00:00:00.000Z。 */
    private BorrowRecord borrowed(String dueDate, String returnedAt) {
        return new BorrowRecord(1, 1, 1, "2026-06-01T00:00:00.000Z", dueDate + "T00:00:00.000Z",
                returnedAt, 0, "BORROWED", null, "2026-06-01T00:00:00.000Z");
    }

    /** 指定存储态的借阅记录（due 已过，用于验证非 BORROWED 态透传不受逾期算式影响）。 */
    private BorrowRecord record(String status, String returnedAt) {
        return new BorrowRecord(1, 1, 1, "2026-06-01T00:00:00.000Z", "2026-06-29T00:00:00.000Z",
                returnedAt, 0, status, null, "2026-06-01T00:00:00.000Z");
    }
}
