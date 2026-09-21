package com.crabcli.library.repo;

/**
 * 借阅记录仓储（BE-B07 / Issue #122）：borrow_records 表（schema.sql:72 建表，
 * FK→readers/books）的口径锚点。B07 只交付可借副本口径所需的占用判定字面与子查询，
 * 借还写路径与逐行读写归 B08（届时再补 @Repository 与 JdbcTemplate 装配）。
 * <p>{@link #ACTIVE_STATUS_PREDICATE} 是「占用副本的借阅」唯一字面来源，勿在他处复写：
 * 存储 BORROWED 覆盖契约 BORROWED 与 OVERDUE（逾期读时派生不落库）；LOST 均为未赔——
 * 已赔即转 LOST_PAID（契约流转态）。两者计入占用，RETURNED / LOST_PAID 不占；
 * {@link ReaderRepository} 的 activeBorrowCount 与 {@code AvailableCopiesService}
 * 的可借副本口径均由此取字面，保证全仓一处改、处处生效。
 */
public final class BorrowRepository {

    /** 占用副本判定：status IN ('BORROWED','LOST')。口径唯一字面来源。 */
    public static final String ACTIVE_STATUS_PREDICATE = "status IN ('BORROWED','LOST')";

    /**
     * 单书占用借阅计数子查询：books 行以别名 b 关联，供
     * AvailableCopiesService#AVAILABLE_COPIES_SQL 内联（列表行零额外查询）。
     */
    public static final String ACTIVE_COUNT_SUBQUERY =
            "SELECT COUNT(*) FROM borrow_records br WHERE br.book_id = b.id "
                    + "AND " + ACTIVE_STATUS_PREDICATE;

    private BorrowRepository() {
    }
}
