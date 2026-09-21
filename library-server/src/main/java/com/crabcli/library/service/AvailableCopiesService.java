package com.crabcli.library.service;

import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.BorrowRepository;
import com.crabcli.library.repo.ReservationRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 可借副本口径（BE-B07 / Issue #122，F3/F4/F5 共同底座）：
 * <pre>availableCopies = totalCopies − count(借阅 ∈ {BORROWED, OVERDUE, LOST})
 *                              − count(预约 = HELD)</pre>
 * 全仓唯一口径来源：SQL 以 {@link #AVAILABLE_COPIES_SQL} 一处表达，单书查询走本服务、
 * 书目列表行由 BookRepository 内联同一段 SQL，任何扣减调整只改子查询字面一处
 * （见 BorrowRepository / ReservationRepository）。
 * <ul>
 *   <li>借阅占用：存储 BORROWED（覆盖契约 BORROWED + OVERDUE，逾期读时派生不落库）
 *       与未赔 LOST；已赔 LOST_PAID 与 RETURNED 不占；</li>
 *   <li>HELD 保留副本不放回可借池（契约定稿项）：WAITING / EXPIRED / FULFILLED /
 *       CANCELLED 均不占；</li>
 *   <li>WITHDRAWN（已下架）恒 0，不做扣减；读时实时计算，无定时任务、不落库。</li>
 * </ul>
 */
@Service
public class AvailableCopiesService {

    /**
     * 口径 SQL（books 须以别名 b 引用）：列表行（BookRepository.SELECT_COLUMNS）内联
     * 此片段避免逐行回查（N+1），单书查询由本服务按主键点查同一段 SQL。
     */
    public static final String AVAILABLE_COPIES_SQL =
            "CASE WHEN b.status = 'ACTIVE' THEN b.total_copies "
            + "- (" + BorrowRepository.ACTIVE_COUNT_SUBQUERY + ") "
            + "- (" + ReservationRepository.HELD_COUNT_SUBQUERY + ") "
            + "ELSE 0 END";

    private final JdbcTemplate jdbc;

    public AvailableCopiesService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 单书可借副本数：与列表行同一 SQL 片段（主键点查，索引命中）。
     * 书不存在回 404 {@code BOOK_NOT_FOUND}（与 BookService 同码同语义）。
     */
    public int availableCopies(int bookId) {
        List<Integer> rows = jdbc.query(
                "SELECT " + AVAILABLE_COPIES_SQL + " FROM books b WHERE b.id = ?",
                (rs, i) -> rs.getInt(1), bookId);
        if (rows.isEmpty()) {
            throw new ApiException("BOOK_NOT_FOUND", "书籍不存在", HttpStatus.NOT_FOUND);
        }
        return rows.get(0);
    }
}
