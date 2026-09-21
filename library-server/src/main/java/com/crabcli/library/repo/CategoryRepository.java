package com.crabcli.library.repo;

import com.crabcli.library.domain.Category;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * 书籍类别仓储（BE-B04 / Issue #119）：categories 表与名称唯一索引由
 * schema.sql:46-51 建立，这里只做 CRUD 与引用计数。
 */
@Repository
public class CategoryRepository {

    private final JdbcTemplate jdbc;

    public CategoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Category> findAll() {
        return jdbc.query(
                "SELECT id, name FROM categories ORDER BY id",
                (rs, i) -> new Category(rs.getInt("id"), rs.getString("name")));
    }

    public Optional<Category> findById(int id) {
        List<Category> rows = jdbc.query(
                "SELECT id, name FROM categories WHERE id = ?",
                (rs, i) -> new Category(rs.getInt("id"), rs.getString("name")),
                id);
        return rows.stream().findFirst();
    }

    public int insert(String name) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO categories (name) VALUES (?)", Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, name);
            return ps;
        }, keys);
        return keys.getKey().intValue();
    }

    public int rename(int id, String name) {
        return jdbc.update("UPDATE categories SET name = ? WHERE id = ?", name, id);
    }

    public int deleteById(int id) {
        return jdbc.update("DELETE FROM categories WHERE id = ?", id);
    }

    /**
     * 被书籍引用计数（CATEGORY_IN_USE 判据）：books 表由 schema.sql:54 建表
     * （category_id NOT NULL REFERENCES categories(id)），书籍业务 CRUD 属 #121，
     * 此处只数引用行数，不触碰书籍领域。
     */
    public int countBooksReferencing(int categoryId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM books WHERE category_id = ?", Integer.class, categoryId);
        return count == null ? 0 : count;
    }
}
