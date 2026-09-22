package com.crabcli.library.service;

import com.crabcli.library.domain.ReservationStatus;
import com.crabcli.library.repo.ReservationRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 预约过期惰性结算器（BE-B09 / Issue #124，[假设 B6]）：无定时任务，预约入口
 * （建 / 取消 / 列表——后续借阅查询入口同理）先 {@link #sweepExpiredHolds()} 再读写，
 * 前端永远拿到结算后状态，不自己判过期。逾期实时派生（[假设 A5]）同一思路。
 * <p>结算规则：HELD 且 hold_expires_at &lt; now → EXPIRED（保留副本回到可借池），
 * 并按队列序递补该书最早 WAITING → HELD（{@link #HOLD_RETENTION_DAYS} 天新保留窗口）。
 * 时间比较两侧均为恒 3 位毫秒的 ISO-8601 UTC 字面（schema.sql strftime 惯例），字典序
 * 即时间序；保留窗口沿用借期字面惯例 {@code LocalDate + "T00:00:00.000Z"}
 * （BorrowService dueAt 同款，日历日语义）。
 */
@Service
public class ReservationExpirySweeper {

    /** 保留期（天）：HELD 副本为预约人保留的最长时限，契约定稿 3 天。 */
    public static final int HOLD_RETENTION_DAYS = 3;

    private final JdbcTemplate jdbc;
    private final ReservationRepository reservationRepository;

    public ReservationExpirySweeper(JdbcTemplate jdbc, ReservationRepository reservationRepository) {
        this.jdbc = jdbc;
        this.reservationRepository = reservationRepository;
    }

    /**
     * 结算所有过期 HELD 并逐书递补，返回过期行数（幂等：已结算行不再命中）。
     * 先取受影响书号再批量置 EXPIRED（hold_expires_at 清空、updated_at 刷新），
     * 保证递补看到的是结算后的队列状态。
     */
    public int sweepExpiredHolds() {
        List<Integer> bookIds = jdbc.queryForList(
                "SELECT DISTINCT book_id FROM reservations "
                        + "WHERE status = 'HELD' AND hold_expires_at < "
                        + "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                Integer.class);
        if (bookIds.isEmpty()) {
            return 0;
        }
        jdbc.update("UPDATE reservations SET status = 'EXPIRED', hold_expires_at = NULL, "
                        + "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') "
                        + "WHERE status = 'HELD' AND hold_expires_at < "
                        + "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
        bookIds.forEach(this::promoteNextWaiting);
        return bookIds.size();
    }

    /**
     * 副本释放后的队列递补：该书最早 WAITING → HELD 并开新保留窗口；无 WAITING
     * 则无操作。取消 HELD 与过期结算两条释放路径共用，队列推进语义一处表达。
     */
    public void promoteNextWaiting(int bookId) {
        reservationRepository.findNextWaiting(bookId).ifPresent(next ->
                reservationRepository.updateStatus(next.id(), ReservationStatus.HELD.name(),
                        LocalDate.now().plusDays(HOLD_RETENTION_DAYS) + "T00:00:00.000Z"));
    }
}
