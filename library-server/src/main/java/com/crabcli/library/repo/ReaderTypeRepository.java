package com.crabcli.library.repo;

import com.crabcli.library.domain.ReaderType;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 读者类型仓储（BE-B04 / Issue #119）：行由 schema.sql:10 建表、data.sql:9 播种
 * （NORMAL 3 本/4 周、TEACHER 6 本/8 周），这里只做读写，不建表不改 schema。
 * <p>配额读取不做任何缓存——F11 参数化即时生效的前提是每次调用都打到 SQLite。
 */
@Repository
public class ReaderTypeRepository {

    private final JdbcTemplate jdbc;

    public ReaderTypeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ReaderType> findAll() {
        return jdbc.query(
                "SELECT code, name, max_borrow, loan_weeks FROM reader_types ORDER BY code",
                (rs, i) -> new ReaderType(
                        rs.getString("code"),
                        rs.getString("name"),
                        rs.getInt("max_borrow"),
                        rs.getInt("loan_weeks")));
    }

    public Optional<ReaderType> findByCode(String code) {
        List<ReaderType> rows = jdbc.query(
                "SELECT code, name, max_borrow, loan_weeks FROM reader_types WHERE code = ?",
                (rs, i) -> new ReaderType(
                        rs.getString("code"),
                        rs.getString("name"),
                        rs.getInt("max_borrow"),
                        rs.getInt("loan_weeks")),
                code);
        return rows.stream().findFirst();
    }

    /**
     * 部分更新配额：传 {@code null} 的列保持原值（验收用例只传 {maxBorrow:5}）。
     *
     * @return 受影响行数（0 = code 不存在）
     */
    public int updateQuota(String code, Integer maxBorrow, Integer loanWeeks) {
        return jdbc.update(
                "UPDATE reader_types "
                        + "SET max_borrow = COALESCE(?, max_borrow), loan_weeks = COALESCE(?, loan_weeks) "
                        + "WHERE code = ?",
                maxBorrow, loanWeeks, code);
    }
}
