package com.crabcli.library.repo;

/**
 * 预约仓储（BE-B07 / Issue #122）：reservations 表（schema.sql:90 建表，FK→readers/books）
 * 的口径锚点。B07 只交付可借副本口径所需的 HELD 占用子查询，预约写路径与逐行读写
 * 归 B09（届时再补 @Repository 与 JdbcTemplate 装配）。
 * <p>{@link #HELD_COUNT_SUBQUERY} 是「保留中预约」唯一字面来源：HELD 副本不放回可借池
 * （契约定稿项），WAITING / EXPIRED / FULFILLED / CANCELLED 均不占。
 */
public final class ReservationRepository {

    /**
     * 单书 HELD 预约计数子查询：books 行以别名 b 关联，供
     * AvailableCopiesService#AVAILABLE_COPIES_SQL 内联（列表行零额外查询）。
     */
    public static final String HELD_COUNT_SUBQUERY =
            "SELECT COUNT(*) FROM reservations rv WHERE rv.book_id = b.id AND rv.status = 'HELD'";

    private ReservationRepository() {
    }
}
