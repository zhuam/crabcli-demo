package com.crabcli.library.repo;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 预约仓储（BE-B07 口径锚点 + BE-B08 借书预约归属校验 / Issue #122、#123）：
 * reservations 表（schema.sql:92 建表，FK→readers/books，索引 (book_id,status)
 * 支撑 HELD 占用统计）。B07 交付可借副本口径所需的 HELD 占用子查询；B08 增补
 * 借书校验链所需的 HELD 归属只读查询；预约写路径与逐行读写归 B09。
 * <p>{@link #HELD_COUNT_SUBQUERY} 是「保留中预约」唯一字面来源：HELD 副本不放回可借池
 * （契约定稿项），WAITING / EXPIRED / FULFILLED / CANCELLED 均不占。
 */
@Repository
public class ReservationRepository {

    /**
     * 单书 HELD 预约计数子查询：books 行以别名 b 关联，供
     * AvailableCopiesService#AVAILABLE_COPIES_SQL 内联（列表行零额外查询）。
     */
    public static final String HELD_COUNT_SUBQUERY =
            "SELECT COUNT(*) FROM reservations rv WHERE rv.book_id = b.id AND rv.status = 'HELD'";

    private final JdbcTemplate jdbc;

    public ReservationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 该书是否存在「其他读者」的 HELD 保留预约（BE-B08 预约归属校验）：
     * 本人 HELD 放行（F5 预约人可借），他人的 HELD 拒借。失效判定（超保留期转
     * EXPIRED）是写路径，归 B09；在此之前过期 HELD 行与可借副本口径同样占着
     * 那份副本（#122 口径即按 HELD 字面扣减，不按时间过滤），两处一致。
     */
    public boolean existsHeldByOther(int bookId, int readerId) {
        List<Integer> counts = jdbc.query(
                "SELECT COUNT(*) FROM reservations WHERE book_id = ? AND status = 'HELD' "
                        + "AND reader_id <> ?",
                (rs, i) -> rs.getInt(1), bookId, readerId);
        return counts.get(0) > 0;
    }
}
