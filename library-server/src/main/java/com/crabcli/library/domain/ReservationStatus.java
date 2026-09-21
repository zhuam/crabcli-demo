package com.crabcli.library.domain;

/**
 * 预约状态契约字面（F4/F5 / Issue #122）：
 * {@code WAITING | HELD | EXPIRED | FULFILLED | CANCELLED}，与 schema.sql reservations
 * CHECK 完全一致，五态均落库。HELD = 还书触发预约后的保留中（hold_expires_at 截止），
 * 保留副本不放回可借池（契约定稿项，可借副本口径见 AvailableCopiesService）。
 */
public enum ReservationStatus {
    WAITING, HELD, EXPIRED, FULFILLED, CANCELLED
}
