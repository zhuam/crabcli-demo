package com.crabcli.library.repo;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.auth.Role;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 登录账号只读仓储（BE-B03 / Issue #118）：账号由 schema.sql 建表、data.sql 幂等播种
 * （admin / librarian / reader01，bcrypt 哈希），后续账号管理需求再扩展写方法。
 */
@Repository
public class AppUserRepository {

    /** app_users 行；status 取值 ACTIVE / DISABLED（schema CHECK 约束，#116）。 */
    public record AppUser(Integer id, String username, String passwordHash, Role role,
                          String displayName, Integer readerId, String status) {

        public boolean active() {
            return "ACTIVE".equals(status);
        }

        public LoginUser toLoginUser() {
            return new LoginUser(id, username, role, displayName, readerId);
        }
    }

    private final JdbcTemplate jdbc;

    public AppUserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AppUser> findByUsername(String username) {
        List<AppUser> rows = jdbc.query(
                "SELECT id, username, password_hash, role, display_name, reader_id, status "
                        + "FROM app_users WHERE username = ?",
                (rs, i) -> new AppUser(
                        rs.getInt("id"),
                        rs.getString("username"),
                        rs.getString("password_hash"),
                        Role.valueOf(rs.getString("role")),
                        rs.getString("display_name"),
                        rs.getObject("reader_id") == null ? null : rs.getInt("reader_id"),
                        rs.getString("status")),
                username);
        return rows.stream().findFirst();
    }
}
