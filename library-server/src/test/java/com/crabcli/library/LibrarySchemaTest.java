package com.crabcli.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.sqlite.SQLiteException;

/**
 * BE-B01 schema 验收（Issue #116）：
 * 七表齐全、种子数据正确、bcrypt 口令可验、唯一索引生效、外键真实生效、脚本幂等可重复执行。
 * 使用独立测试库，不污染 data/library.db。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
class LibrarySchemaTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void allSevenTablesExist() {
        List<String> tables = jdbc.queryForList(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                String.class);
        assertThat(tables).containsExactlyInAnyOrder(
                "app_users", "readers", "reader_types", "categories",
                "books", "borrow_records", "reservations");
    }

    @Test
    void readerTypesSeededWithContractQuotas() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT code, name, max_borrow, loan_weeks FROM reader_types ORDER BY code");
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0))
                .containsEntry("code", "NORMAL")
                .containsEntry("max_borrow", 3)
                .containsEntry("loan_weeks", 4);
        assertThat(rows.get(1))
                .containsEntry("code", "TEACHER")
                .containsEntry("max_borrow", 6)
                .containsEntry("loan_weeks", 8);
    }

    @Test
    void defaultCategoriesAndThreeAccountsSeeded() {
        Integer categories = jdbc.queryForObject("SELECT COUNT(*) FROM categories", Integer.class);
        assertThat(categories).isGreaterThanOrEqualTo(6);

        List<String> roles = jdbc.queryForList(
                "SELECT role FROM app_users ORDER BY role", String.class);
        assertThat(roles).containsExactly("ADMIN", "LIBRARIAN", "READER");
    }

    @Test
    void seedPasswordsAreValidBcrypt() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        assertThat(encoder.matches("admin123", hashOf("admin"))).isTrue();
        assertThat(encoder.matches("lib123456", hashOf("librarian"))).isTrue();
        assertThat(encoder.matches("reader123", hashOf("reader01"))).isTrue();
        assertThat(hashOf("reader01")).startsWith("$2a$");
    }

    @Test
    void readerAccountLinkedToReaderProfile() {
        Integer readerId = jdbc.queryForObject(
                "SELECT reader_id FROM app_users WHERE username = 'reader01'", Integer.class);
        assertThat(readerId).isNotNull();
        Integer matching = jdbc.queryForObject(
                "SELECT COUNT(*) FROM readers WHERE id = ? AND card_no = 'R0001'", Integer.class, readerId);
        assertThat(matching).isEqualTo(1);
    }

    @Test
    void foreignKeysEnforcedOnPooledConnection() {
        Integer fk = jdbc.queryForObject("PRAGMA foreign_keys", Integer.class);
        assertThat(fk).isEqualTo(1);

        // Spring 无 SQLite 错误码映射，约束违例统一包成 UncategorizedSQLException，
        // 故断言根因而非顶层类型；借此同时证明外键约束真实拒绝写入
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at) "
                        + "VALUES (999999, 999999, '2026-09-21T00:00:00.000Z', '2026-09-28T00:00:00.000Z')"))
                .hasRootCauseInstanceOf(SQLiteException.class)
                .getRootCause()
                .hasMessageContaining("FOREIGN KEY constraint failed");
    }

    @Test
    void uniqueIndexesRejectDuplicates() {
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO readers (card_no, name, reader_type_code) VALUES ('R0001', '重复证号', 'NORMAL')"))
                .hasRootCauseInstanceOf(SQLiteException.class)
                .getRootCause()
                .hasMessageContaining("UNIQUE constraint failed: readers.card_no");

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO categories (name) VALUES ('文学')"))
                .hasRootCauseInstanceOf(SQLiteException.class)
                .getRootCause()
                .hasMessageContaining("UNIQUE constraint failed: categories.name");
    }

    @Test
    void schemaAndDataScriptsAreIdempotent() {
        // 应用启动已执行过一遍 schema.sql + data.sql；再原样跑一遍，模拟重复启动
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                new ClassPathResource("schema.sql"), new ClassPathResource("data.sql"));
        populator.execute(jdbc.getDataSource());

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reader_types", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class)).isEqualTo(3);
    }

    private String hashOf(String username) {
        return jdbc.queryForObject(
                "SELECT password_hash FROM app_users WHERE username = ?", String.class, username);
    }
}
