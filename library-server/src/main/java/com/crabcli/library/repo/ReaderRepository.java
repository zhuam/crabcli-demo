package com.crabcli.library.repo;

import com.crabcli.library.domain.Reader;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * 读者档案仓储（BE-B05 / Issue #120）：读写 readers 表（schema.sql:19 建表，
 * card_no 唯一索引 idx_readers_card_no 兜底重复证号），不建表不改 schema。
 * <p>派生读数在 {@link #BASE_SELECT} 里一次带出，单行与列表共用，避免 N+1：
 * <ul>
 *   <li>{@code max_borrow} JOIN reader_types 实时读取（#119 参数化，PUT 后立即生效）；</li>
 *   <li>{@code active_borrow_count} 契约状态 ∈ {BORROWED, OVERDUE, LOST} 的借阅数
 *       （丢失未赔仍占配额，[假设 A8]；已赔 LOST_PAID 不占）——存储 BORROWED 覆盖
 *       BORROWED 与 OVERDUE（逾期由 due_at 实时算，#115 契约，不落状态）；#122 契约
 *       字面定稿后 LOST 即未赔（已赔转 LOST_PAID），占用字面唯一来源见
 *       {@link BorrowRepository#ACTIVE_STATUS_PREDICATE}，与可借副本口径同字面。</li>
 * </ul>
 */
@Repository
public class ReaderRepository {

    private static final String BASE_SELECT =
            "SELECT r.id, r.card_no, r.name, r.reader_type_code, r.phone, r.email, r.status, r.created_at, "
                    + "t.max_borrow, "
                    + "COALESCE(bc.active_count, 0) AS active_borrow_count "
                    + "FROM readers r "
                    + "JOIN reader_types t ON t.code = r.reader_type_code "
                    + "LEFT JOIN (SELECT reader_id, COUNT(*) AS active_count FROM borrow_records "
                    + "           WHERE " + BorrowRepository.ACTIVE_STATUS_PREDICATE + " "
                    + "           GROUP BY reader_id) bc ON bc.reader_id = r.id";

    private static final RowMapper<Reader> MAPPER = (rs, i) -> new Reader(
            rs.getInt("id"),
            rs.getString("card_no"),
            rs.getString("name"),
            rs.getString("reader_type_code"),
            rs.getString("phone"),
            rs.getString("email"),
            rs.getString("status"),
            rs.getInt("max_borrow"),
            rs.getInt("active_borrow_count"),
            rs.getString("created_at"));

    private final JdbcTemplate jdbc;

    public ReaderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 插入新档案（status 走 DEFAULT 'ACTIVE'），返回生成 id；card_no 重复由唯一索引拒绝。 */
    public int insert(String cardNo, String name, String readerTypeCode, String phone, String email) {
        jdbc.update(
                "INSERT INTO readers (card_no, name, reader_type_code, phone, email) VALUES (?, ?, ?, ?, ?)",
                cardNo, name, readerTypeCode, phone, email);
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    public Optional<Reader> findById(int id) {
        List<Reader> rows = jdbc.query(BASE_SELECT + " WHERE r.id = ?", MAPPER, id);
        return rows.stream().findFirst();
    }

    /**
     * 组合过滤查询：q 对 cardNo/name LIKE 模糊（SQLite LIKE 对 ASCII 不区分大小写），
     * readerTypeCode/status 精确等值；均可选。按 id 升序稳定输出。
     * 过滤值全部参数化绑定，无字符串内插。
     */
    public List<Reader> search(String q, String readerTypeCode, String status, int limit, long offset) {
        return jdbc.query(searchSql(q, readerTypeCode, status, " LIMIT ? OFFSET ?"),
                MAPPER, bindArgs(q, readerTypeCode, status, limit, offset));
    }

    /** 同一过滤条件下命中总数（分页 total = 过滤后总数，验收第 2 条）。 */
    public int count(String q, String readerTypeCode, String status) {
        // 过滤列全在 readers 上（FK 保证类型行必存在），计数无需 JOIN 派生读数
        Integer total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM readers r" + whereOf(q, readerTypeCode, status),
                Integer.class, bindArgs(q, readerTypeCode, status));
        return total == null ? 0 : total;
    }

    /** 修改档案（name/phone/email/reader_type_code；证号是身份键不参与修改）。 */
    public int updateProfile(int id, String name, String phone, String email, String readerTypeCode) {
        return jdbc.update(
                "UPDATE readers SET name = ?, phone = ?, email = ?, reader_type_code = ? WHERE id = ?",
                name, phone, email, readerTypeCode, id);
    }

    /** 注销（F1 柔性删除）：置 status=INACTIVE，档案与历史借阅保留。 */
    public int markInactive(int id) {
        return jdbc.update("UPDATE readers SET status = 'INACTIVE' WHERE id = ?", id);
    }

    private String searchSql(String q, String readerTypeCode, String status, String tail) {
        return BASE_SELECT + whereOf(q, readerTypeCode, status) + tail;
    }

    private String whereOf(String q, String readerTypeCode, String status) {
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (q != null && !q.isBlank()) {
            where.append(" AND (r.card_no LIKE ? OR r.name LIKE ?)");
        }
        if (readerTypeCode != null && !readerTypeCode.isBlank()) {
            where.append(" AND r.reader_type_code = ?");
        }
        if (status != null && !status.isBlank()) {
            where.append(" AND r.status = ?");
        }
        return where.toString();
    }

    /** 与 {@link #searchSql} 同序绑定过滤值；tail 为分页占位（LIMIT/OFFSET）追加参数。 */
    private Object[] bindArgs(String q, String readerTypeCode, String status, Object... tail) {
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            String like = "%" + q.trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (readerTypeCode != null && !readerTypeCode.isBlank()) {
            args.add(readerTypeCode);
        }
        if (status != null && !status.isBlank()) {
            args.add(status);
        }
        args.addAll(List.of(tail));
        return args.toArray();
    }
}
