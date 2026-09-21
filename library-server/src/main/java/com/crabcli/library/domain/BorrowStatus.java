package com.crabcli.library.domain;

/**
 * 借阅状态契约字面（F3 / Issue #122，前端 dict.js borrowStatus 对称）：
 * {@code BORROWED | OVERDUE | RETURNED | LOST | LOST_PAID}。
 * <p>存储口径（schema.sql borrow_records CHECK）：仅 BORROWED / RETURNED / LOST / LOST_PAID
 * 落库——OVERDUE 为读时派生态（{@code returned_at IS NULL AND due_at < 当天}，无定时任务），
 * CHECK 拒绝写入；LOST_PAID 为流转态（LOST 赔付后落库，B09 业务域）。丢失未赔仍占配额、
 * 已赔不占（[假设 A8]，占用字面唯一来源见 {@code BorrowRepository#ACTIVE_STATUS_PREDICATE}）。
 */
public enum BorrowStatus {
    BORROWED, OVERDUE, RETURNED, LOST, LOST_PAID
}
