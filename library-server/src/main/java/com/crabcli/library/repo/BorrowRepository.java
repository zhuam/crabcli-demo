package com.crabcli.library.repo;

import com.crabcli.library.domain.BorrowRecord;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * 借阅记录仓储（BE-B07 口径锚点 + BE-B08 借出写路径 + BE-B10 还书写路径
 * / Issue #122、#123、#125）：borrow_records 表（schema.sql:74 建表，FK→readers/books）。
 * B07 交付占用判定字面，B08 起本类承接借出写路径与按读者查询；B10 增补还书落账
 * （{@link #markReturned}）；续借、丢失赔偿写路径归后续。
 * <p>{@link #ACTIVE_STATUS_PREDICATE} 是「占用副本的借阅」唯一字面来源，勿在他处复写：
 * 存储 BORROWED 覆盖契约 BORROWED 与 OVERDUE（逾期读时派生不落库）；LOST 均为未赔——
 * 已赔即转 LOST_PAID（契约流转态）。两者计入占用，RETURNED / LOST_PAID 不占；
 * {@link ReaderRepository} 的 activeBorrowCount 与 {@code AvailableCopiesService}
 * 的可借副本口径均由此取字面，保证全仓一处改、处处生效。
 */
@Repository
public class BorrowRepository {

    /** 占用副本判定：status IN ('BORROWED','LOST')。口径唯一字面来源。 */
    public static final String ACTIVE_STATUS_PREDICATE = "status IN ('BORROWED','LOST')";

    /**
     * 单书占用借阅计数子查询：books 行以别名 b 关联，供
     * AvailableCopiesService#AVAILABLE_COPIES_SQL 内联（列表行零额外查询）。
     */
    public static final String ACTIVE_COUNT_SUBQUERY =
            "SELECT COUNT(*) FROM borrow_records br WHERE br.book_id = b.id "
                    + "AND " + ACTIVE_STATUS_PREDICATE;

    private static final String SELECT_COLUMNS =
            "SELECT id, reader_id, book_id, borrowed_at, due_at, returned_at, renew_count, "
                    + "status, compensation_status, created_at FROM borrow_records";

    private static final RowMapper<BorrowRecord> MAPPER = (rs, i) -> new BorrowRecord(
            rs.getInt("id"), rs.getInt("reader_id"), rs.getInt("book_id"),
            rs.getString("borrowed_at"), rs.getString("due_at"), rs.getString("returned_at"),
            rs.getInt("renew_count"), rs.getString("status"),
            rs.getString("compensation_status"), rs.getString("created_at"));

    private final JdbcTemplate jdbc;

    public BorrowRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<BorrowRecord> findById(int id) {
        return jdbc.query(SELECT_COLUMNS + " WHERE id = ?", MAPPER, id).stream().findFirst();
    }

    /**
     * 读者名下的存储 BORROWED 行（未还；其中逾期行由
     * {@code BorrowRecord#effectiveStatus} 按契约实时派生，SQL 不复写逾期算式）。
     */
    public List<BorrowRecord> findBorrowedByReader(int readerId) {
        return jdbc.query(SELECT_COLUMNS + " WHERE reader_id = ? AND status = 'BORROWED' ORDER BY id",
                MAPPER, readerId);
    }

    /** 读者是否仍占用某书的借阅（占用判定与 {@link #ACTIVE_STATUS_PREDICATE} 同一口径）——预约 ALREADY_BORROWED 校验（BE-B09）。 */
    public boolean existsActiveByReaderAndBook(int readerId, int bookId) {
        List<Integer> counts = jdbc.query(
                "SELECT COUNT(*) FROM borrow_records WHERE reader_id = ? AND book_id = ? AND "
                        + ACTIVE_STATUS_PREDICATE,
                (rs, i) -> rs.getInt(1), readerId, bookId);
        return counts.get(0) > 0;
    }

    /**
     * 借出落一行（BE-B08）：status 走 DEFAULT 'BORROWED'、renew_count 走 DEFAULT 0、
     * returned_at / compensation_status 保持 NULL，返回生成 id。
     */
    public int insert(int readerId, int bookId, String borrowedAt, String dueAt) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at) "
                            + "VALUES (?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, readerId);
            ps.setInt(2, bookId);
            ps.setString(3, borrowedAt);
            ps.setString(4, dueAt);
            return ps;
        }, keys);
        return keys.getKey().intValue();
    }

    /**
     * 还书落账（BE-B10 / Issue #125）：returned_at 置当日、status → RETURNED。
     * returned_at 沿借期字面惯例 {@code LocalDate + "T00:00:00.000Z"}（日历日语义，
     * 与 due_at / hold_expires_at 同款）。在借与否的判定归 {@link BorrowService#returnBook}，
     * 本方法只对已确认在借的行执行状态流转。调用方须处于事务内（还书 + 预约递补同事务）。
     */
    public void markReturned(int id, String returnedAt) {
        jdbc.update("UPDATE borrow_records SET returned_at = ?, status = 'RETURNED' WHERE id = ?",
                returnedAt, id);
    }

    /**
     * 多条件查询（BE-B12 / Issue #127）：readerId / 生效 status / borrowDate 闭区间
     * 可选组合，SQL 层过滤 + LIMIT/OFFSET 分页（契约禁止全表取回内存再 filter）。
     * 过滤走 schema 的 idx_borrow_records_{reader,status,borrow_date}（borrow_date 为
     * {@code substr(borrowed_at,1,10)} 表达式索引，过滤式须与其逐字同形方可命中）。
     * <p>status 传契约生效态（{@link com.crabcli.library.domain.BorrowStatus} 字面，
     * 调用方已做白名单校验）：BORROWED / OVERDUE 为存储 BORROWED 的两个派生区间，
     * 按 {@code BorrowStatus} 契约算式（returned_at IS NULL 且 dueDate < 当天判逾期）
     * 在 SQL 侧表达——查询侧与读侧 {@code BorrowRecord#effectiveStatus} 的唯一分歧
     * 风险点，两处口径均锚定 domain 契约字面。
     */
    public List<BorrowRecord> search(Integer readerId, String status, LocalDate from,
                                     LocalDate to, LocalDate today, int page, int size) {
        List<Object> args = new ArrayList<>();
        String where = where(readerId, status, from, to, today, args);
        args.add(size);
        args.add((long) (page - 1) * size);
        return jdbc.query(SELECT_COLUMNS + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                MAPPER, args.toArray());
    }

    /** 过滤后总数（分页 total 契约）：与 {@link #search} 同一 WHERE 构造、同一 today。 */
    public long countSearch(Integer readerId, String status, LocalDate from, LocalDate to,
                            LocalDate today) {
        List<Object> args = new ArrayList<>();
        String where = where(readerId, status, from, to, today, args);
        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM borrow_records" + where, Long.class, args.toArray());
        return total == null ? 0 : total;
    }

    /** WHERE 片段构造：条件全参数化，date 过滤取时间列前 10 字符（借出日口径）。 */
    private static String where(Integer readerId, String status, LocalDate from,
                                LocalDate to, LocalDate today, List<Object> args) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (readerId != null) {
            where.append(" AND reader_id = ?");
            args.add(readerId);
        }
        if (status != null) {
            where.append(" AND ").append(statusFilter(status, today, args));
        }
        if (from != null) {
            where.append(" AND substr(borrowed_at, 1, 10) >= ?");
            args.add(from.toString());
        }
        if (to != null) {
            where.append(" AND substr(borrowed_at, 1, 10) <= ?");
            args.add(to.toString());
        }
        return where.toString();
    }

    /**
     * 生效 status → SQL 过滤式：RETURNED / LOST / LOST_PAID 即存储态等值；BORROWED /
     * OVERDUE 为存储 BORROWED 的派生区间（BorrowStatus 契约算式，当天不逾期）。
     */
    private static String statusFilter(String status, LocalDate today, List<Object> args) {
        return switch (status) {
            case "BORROWED" -> {
                args.add(today.toString());
                yield "status = 'BORROWED' AND returned_at IS NULL "
                        + "AND substr(due_at, 1, 10) >= ?";
            }
            case "OVERDUE" -> {
                args.add(today.toString());
                yield "status = 'BORROWED' AND returned_at IS NULL "
                        + "AND substr(due_at, 1, 10) < ?";
            }
            default -> {
                args.add(status);
                yield "status = ?";
            }
        };
    }
}
