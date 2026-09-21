package com.crabcli.library.repo;

import com.crabcli.library.domain.Book;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * 书籍仓储（BE-B06 / Issue #121）：books 表、唯一索引 idx_books_book_code 与
 * 外键由 schema.sql:54-68 建立，这里只做 CRUD、下架与条件分页查询。
 * <p>keywords 为字符串数组，落库序列化为 JSON 文本（keywords TEXT 列）后原样反
 * 序列化——关键词本身可能含逗号等任意字符，JSON 保证往返不丢不串。
 * <p>availableCopies 读时推导（SELECT 里的 CASE）：ACTIVE=total_copies，WITHDRAWN=0；
 * 借阅/预约扣减的正式口径收口 #122（AvailableCopiesService），届时只需替换该推导。
 */
@Repository
public class BookRepository {

    private static final String SELECT_COLUMNS =
            "SELECT id, book_code, title, author, category_id, keywords, total_copies, "
            + "CASE WHEN status = 'ACTIVE' THEN total_copies ELSE 0 END AS available_copies, "
            + "status, remark, created_at, updated_at FROM books";

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public BookRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Optional<Book> findById(int id) {
        return jdbc.query(SELECT_COLUMNS + " WHERE id = ?", this::mapRow, id).stream().findFirst();
    }

    public int insert(String bookCode, String title, String author, int categoryId,
                      List<String> keywords, int totalCopies, String remark) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO books (book_code, title, author, category_id, keywords, total_copies, remark) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, bookCode);
            ps.setString(2, title);
            ps.setString(3, author);
            ps.setInt(4, categoryId);
            if (keywords == null) {
                ps.setNull(5, Types.NULL);
            } else {
                ps.setString(5, toJson(keywords));
            }
            ps.setInt(6, totalCopies);
            ps.setString(7, remark);
            return ps;
        }, keys);
        return keys.getKey().intValue();
    }

    public List<Book> search(String q, Integer categoryId, int page, int size) {
        List<Object> args = new ArrayList<>();
        String where = where(q, categoryId, args);
        args.add(size);
        args.add((long) (page - 1) * size);
        return jdbc.query(SELECT_COLUMNS + where + " ORDER BY id DESC LIMIT ? OFFSET ?",
                this::mapRow, args.toArray());
    }

    public long count(String q, Integer categoryId) {
        List<Object> args = new ArrayList<>();
        String where = where(q, categoryId, args);
        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM books" + where, Long.class, args.toArray());
        return total == null ? 0 : total;
    }

    /**
     * 部分更新：只改非 null 字段，updated_at 一并刷新；调用方（服务层）已保证
     * 至少一个业务字段非 null。返回受影响行数。
     */
    public int update(int id, String title, String author, Integer categoryId,
                      List<String> keywords, Integer totalCopies, String remark) {
        List<String> sets = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        if (title != null) {
            sets.add("title = ?");
            args.add(title);
        }
        if (author != null) {
            sets.add("author = ?");
            args.add(author);
        }
        if (categoryId != null) {
            sets.add("category_id = ?");
            args.add(categoryId);
        }
        if (keywords != null) {
            sets.add("keywords = ?");
            args.add(toJson(keywords));
        }
        if (totalCopies != null) {
            sets.add("total_copies = ?");
            args.add(totalCopies);
        }
        if (remark != null) {
            sets.add("remark = ?");
            args.add(remark);
        }
        sets.add("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
        args.add(id);
        return jdbc.update("UPDATE books SET " + String.join(", ", sets) + " WHERE id = ?",
                args.toArray());
    }

    public int markWithdrawn(int id) {
        return jdbc.update("UPDATE books SET status = ?, "
                + "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
                Book.STATUS_WITHDRAWN, id);
    }

    /** 行映射：keywords JSON 文本反序列化为数组（列值为 NULL 则保持 null）。 */
    private Book mapRow(ResultSet rs, int rowNum) throws SQLException {
        return new Book(rs.getInt("id"), rs.getString("book_code"), rs.getString("title"),
                rs.getString("author"), rs.getInt("category_id"),
                toKeywords(rs.getString("keywords")), rs.getInt("total_copies"),
                rs.getInt("available_copies"), rs.getString("status"), rs.getString("remark"),
                rs.getString("created_at"), rs.getString("updated_at"));
    }

    /**
     * 条件片段 + 参数收集（count 与 search 共用）：q 命中 title/author/keywords 子串，
     * categoryId 精确过滤。LIKE 通配符 % _ 与转义符 \ 以 ESCAPE 子句转为字面量，
     * 保证 q 按普通文本匹配（q="100%" 只命中含 "100%" 的行）。
     */
    private String where(String q, Integer categoryId, List<Object> args) {
        List<String> conditions = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            conditions.add("(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' "
                    + "OR keywords LIKE ? ESCAPE '\\')");
            String like = "%" + escapeLike(q.trim()) + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        if (categoryId != null) {
            conditions.add("category_id = ?");
            args.add(categoryId);
        }
        return conditions.isEmpty() ? "" : " WHERE " + String.join(" AND ", conditions);
    }

    private String escapeLike(String raw) {
        return raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private String toJson(List<String> keywords) {
        try {
            return objectMapper.writeValueAsString(keywords);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("keywords 序列化失败", e);
        }
    }

    private List<String> toKeywords(String text) {
        if (text == null) {
            return null;
        }
        try {
            return objectMapper.readValue(text, new TypeReference<List<String>>() {
            });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("books.keywords 列数据不是合法 JSON：" + text, e);
        }
    }
}
