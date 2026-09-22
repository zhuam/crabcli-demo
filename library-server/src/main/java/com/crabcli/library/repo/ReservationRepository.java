package com.crabcli.library.repo;

import com.crabcli.library.domain.Reservation;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * 预约仓储（BE-B07 口径锚点 + BE-B08 归属校验 + BE-B09 写路径 / Issue #122、#123、#124）：
 * reservations 表（schema.sql:92 建表，FK→readers/books，索引 (book_id,status)）。
 * B07 交付可借副本口径所需的 HELD 占用子查询；B08 增补借书校验链所需的 HELD 归属
 * 只读查询；B09 补齐预约写路径与逐行读写（建 / 查 / 状态流转 / 排位）。
 * <p>{@link #HELD_COUNT_SUBQUERY} 是「保留中预约」唯一字面来源：HELD 副本不放回可借池
 * （契约定稿项），WAITING / EXPIRED / FULFILLED / CANCELLED 均不占。
 * <p>{@link #ACTIVE_STATUS_PREDICATE} 是「读者名下仍生效的预约」唯一字面来源
 * （WAITING 排队中 / HELD 保留中），重复预约校验据此判定；EXPIRED / FULFILLED /
 * CANCELLED 为终态，可再次预约。
 */
@Repository
public class ReservationRepository {

    /**
     * 单书 HELD 预约计数子查询：books 行以别名 b 关联，供
     * AvailableCopiesService#AVAILABLE_COPIES_SQL 内联（列表行零额外查询）。
     */
    public static final String HELD_COUNT_SUBQUERY =
            "SELECT COUNT(*) FROM reservations rv WHERE rv.book_id = b.id AND rv.status = 'HELD'";

    /** 读者对某书仍生效的预约：status IN ('WAITING','HELD')。重复预约校验唯一字面来源。 */
    public static final String ACTIVE_STATUS_PREDICATE = "status IN ('WAITING','HELD')";

    private static final String SELECT_COLUMNS =
            "SELECT id, reader_id, book_id, status, hold_expires_at, created_at, updated_at "
                    + "FROM reservations";

    private static final RowMapper<Reservation> MAPPER = (rs, i) -> new Reservation(
            rs.getInt("id"), rs.getInt("reader_id"), rs.getInt("book_id"),
            rs.getString("status"), rs.getString("hold_expires_at"),
            rs.getString("created_at"), rs.getString("updated_at"));

    private final JdbcTemplate jdbc;

    public ReservationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 该书是否存在「其他读者」的 HELD 保留预约（BE-B08 预约归属校验）：
     * 本人 HELD 放行（F5 预约人可借），他人的 HELD 拒借。
     */
    public boolean existsHeldByOther(int bookId, int readerId) {
        List<Integer> counts = jdbc.query(
                "SELECT COUNT(*) FROM reservations WHERE book_id = ? AND status = 'HELD' "
                        + "AND reader_id <> ?",
                (rs, i) -> rs.getInt(1), bookId, readerId);
        return counts.get(0) > 0;
    }

    public Optional<Reservation> findById(int id) {
        return jdbc.query(SELECT_COLUMNS + " WHERE id = ?", MAPPER, id).stream().findFirst();
    }

    /** 按可选条件过滤（null 即不过滤），按 id 升序（预约创建序即队列序）。 */
    public List<Reservation> findByFilter(Integer readerId, Integer bookId, String status) {
        StringBuilder sql = new StringBuilder(SELECT_COLUMNS + " WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (readerId != null) {
            sql.append(" AND reader_id = ?");
            args.add(readerId);
        }
        if (bookId != null) {
            sql.append(" AND book_id = ?");
            args.add(bookId);
        }
        if (status != null) {
            sql.append(" AND status = ?");
            args.add(status);
        }
        sql.append(" ORDER BY id");
        return jdbc.query(sql.toString(), MAPPER, args.toArray());
    }

    /** 该书是否存在读者的仍生效预约（WAITING / HELD）——重复预约校验。 */
    public boolean existsActiveByReaderAndBook(int readerId, int bookId) {
        List<Integer> counts = jdbc.query(
                "SELECT COUNT(*) FROM reservations WHERE reader_id = ? AND book_id = ? AND "
                        + ACTIVE_STATUS_PREDICATE,
                (rs, i) -> rs.getInt(1), readerId, bookId);
        return counts.get(0) > 0;
    }

    /** 该读者对该书在 WAITING 队列中的排位（含自身，1 起）：id 升序即队列序。 */
    public int countWaitingUpTo(int bookId, int id) {
        List<Integer> counts = jdbc.query(
                "SELECT COUNT(*) FROM reservations WHERE book_id = ? AND status = 'WAITING' "
                        + "AND id <= ?",
                (rs, i) -> rs.getInt(1), bookId, id);
        return counts.get(0);
    }

    /** 该书最早的 WAITING（id 最小者），无则 empty——副本释放后的递补候选。 */
    public Optional<Reservation> findNextWaiting(int bookId) {
        return jdbc.query(
                        SELECT_COLUMNS + " WHERE book_id = ? AND status = 'WAITING' ORDER BY id LIMIT 1",
                        MAPPER, bookId)
                .stream().findFirst();
    }

    /**
     * 建预约行（BE-B09）：status 走 DEFAULT 'WAITING'，hold_expires_at 保持 NULL
     * （仅 HELD 有值，domain 契约），created_at / updated_at 走 DEFAULT strftime。
     */
    public int insert(int readerId, int bookId) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO reservations (reader_id, book_id) VALUES (?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, readerId);
            ps.setInt(2, bookId);
            return ps;
        }, keys);
        return keys.getKey().intValue();
    }

    /**
     * 状态流转（BE-B09 状态机：WAITING→CANCELLED、HELD→CANCELLED/EXPIRED、
     * WAITING→HELD）：holdExpiresAt 仅 HELD 传新保留窗口，其余终态传 null 清空。
     */
    public void updateStatus(int id, String status, String holdExpiresAt) {
        jdbc.update(
                "UPDATE reservations SET status = ?, hold_expires_at = ?, "
                        + "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
                status, holdExpiresAt, id);
    }
}
