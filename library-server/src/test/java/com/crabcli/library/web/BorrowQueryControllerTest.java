package com.crabcli.library.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * BE-B12 验收（Issue #127）：借阅记录多条件查询与逾期天数。
 * <ul>
 *   <li>readerId+status 组合过滤：仅命中该读者该生效态；total 为过滤后总数；</li>
 *   <li>OVERDUE 读时派生：dueDate=今日−2 → status=OVERDUE 且 overdueDays=2；
 *       生效 BORROWED 不含逾期行（派生区间两分）；</li>
 *   <li>from/to 对 borrowDate 闭区间（两端含）；</li>
 *   <li>READER 隔离（[安全] 服务端强制）：缺省即本人、仅本人记录；显式传他人
 *       readerId → 403 FORBIDDEN；</li>
 *   <li>分页窗口：page/size 生效、total 为过滤后总数；</li>
 *   <li>[性能] 复合条件查询计划走 idx_borrow_records_* 索引（EXPLAIN QUERY PLAN
 *       含 USING INDEX），SQL 层过滤 + 分页；</li>
 *   <li>参数边界 400：非法 status、from&gt;to、page&lt;1、size 越界、日期格式；</li>
 *   <li>查询入口挂 BE-B09 sweeper：入口调用后过期 HELD 被惰性结算。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：书号 / 证号带 nanoTime 后缀自建自清，
 * 种子读者 R0001（reader01 关联档案）只插入自身借阅行、不改档案，自建读者
 * cardNo 恒带 B12T 前缀（清理按前缀删）。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class BorrowQueryControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    private final String unique = String.valueOf(System.nanoTime());

    @Test
    void readerAndStatusComboReturnsOnlyMatchingRows() throws Exception {
        int readerA = createReader();
        int readerB = createReader();
        int bookA = createBook();
        int bookB = createBook();
        try {
            long borrowedId = insertBorrow(readerA, bookA, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");
            insertBorrow(readerA, bookB, LocalDate.now().minusDays(10),
                    LocalDate.now().plusDays(4), "RETURNED");
            insertBorrow(readerB, bookB, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");

            JsonNode body = bodyOf(query("?readerId=" + readerA + "&status=BORROWED")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1)));
            assertThat(body.get("items").size()).isEqualTo(1);
            assertThat(body.get("items").get(0).get("id").asLong()).isEqualTo(borrowedId);
            assertThat(body.get("items").get(0).get("readerId").asInt()).isEqualTo(readerA);
        } finally {
            cleanup(bookA, bookB);
        }
    }

    @Test
    void overdueRecordReportsOverdueStatusAndDays() throws Exception {
        int readerId = createReader();
        int bookId = createBook();
        try {
            // 验收口径：dueDate=今日−2 → OVERDUE 且 overdueDays=2（借出日在区间外不影响）
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(30),
                    LocalDate.now().minusDays(2), "BORROWED");

            JsonNode body = bodyOf(query("?readerId=" + readerId + "&status=OVERDUE")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1)));
            JsonNode row = body.get("items").get(0);
            assertThat(row.get("status").asText()).isEqualTo("OVERDUE");
            assertThat(row.get("overdueDays").asLong()).isEqualTo(2);

            // 派生区间两分：生效 BORROWED 不含逾期行
            query("?readerId=" + readerId + "&status=BORROWED")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void borrowDateIntervalFromToIsClosed() throws Exception {
        int readerId = createReader();
        int bookId = createBook();
        int book2 = createBook();
        int book3 = createBook();
        try {
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(5),
                    LocalDate.now().plusDays(7), "BORROWED");
            insertBorrow(readerId, book2, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");
            insertBorrow(readerId, book3, LocalDate.now(),
                    LocalDate.now().plusDays(7), "BORROWED");

            // 闭区间两端含：[今日−5, 今日−1] 命中前两条、不含今日
            String range = "&from=" + LocalDate.now().minusDays(5)
                    + "&to=" + LocalDate.now().minusDays(1);
            JsonNode body = bodyOf(query("?readerId=" + readerId + range)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(2)));
            assertThat(body.get("items").size()).isEqualTo(2);
        } finally {
            cleanup(bookId, book2, book3);
        }
    }

    @Test
    void readerSeesOnlyOwnRecordsAndOtherReaderIdIs403() throws Exception {
        int seedId = seedReaderId();
        int otherId = createReader();
        int seedBook = createBook();
        int otherBook = createBook();
        try {
            insertBorrow(seedId, seedBook, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");
            insertBorrow(otherId, otherBook, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");

            // READER 缺省 readerId 即查本人：返回行全部属于本人
            MvcResult result = mockMvc.perform(get("/api/borrows")
                            .header("Authorization", "Bearer " + tokenFor("reader01")))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
            assertThat(body.get("total").asLong()).isGreaterThanOrEqualTo(1);
            for (JsonNode row : body.get("items")) {
                assertThat(row.get("readerId").asInt()).isEqualTo(seedId);
            }

            // 显式传他人 readerId → 403 FORBIDDEN（服务端强制 token.readerId 隔离）
            mockMvc.perform(get("/api/borrows?readerId=" + otherId)
                            .header("Authorization", "Bearer " + tokenFor("reader01")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        } finally {
            cleanup(seedBook, otherBook);
        }
    }

    @Test
    void paginationWindowAndTotalRespectFilter() throws Exception {
        int readerId = createReader();
        int book1 = createBook();
        int book2 = createBook();
        int book3 = createBook();
        try {
            insertBorrow(readerId, book1, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");
            insertBorrow(readerId, book2, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");
            insertBorrow(readerId, book3, LocalDate.now().minusDays(1),
                    LocalDate.now().plusDays(7), "BORROWED");

            JsonNode page1 = bodyOf(query("?readerId=" + readerId + "&page=1&size=2")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(3)));
            assertThat(page1.get("items").size()).isEqualTo(2);
            JsonNode page2 = bodyOf(query("?readerId=" + readerId + "&page=2&size=2")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(3)));
            assertThat(page2.get("items").size()).isEqualTo(1);
        } finally {
            cleanup(book1, book2, book3);
        }
    }

    @Test
    void compositeQueryPlanUsesIndexNotFullScan() {
        // [性能] 验收：reader+status+from/to 复合条件走 idx_borrow_records_* 索引，
        // 无全表 SCAN（SQL 层过滤，禁止全表取回内存再 filter）
        var plan = jdbc.queryForList(
                "EXPLAIN QUERY PLAN SELECT id FROM borrow_records WHERE 1=1 "
                        + "AND reader_id = ? AND status = 'BORROWED' "
                        + "AND substr(borrowed_at, 1, 10) >= ? "
                        + "AND substr(borrowed_at, 1, 10) <= ?",
                1, LocalDate.now().minusDays(5).toString(), LocalDate.now().toString());
        String detail = plan.stream()
                .map(row -> String.valueOf(row.get("detail")))
                .collect(java.util.stream.Collectors.joining(" | "));
        assertThat(detail).contains("USING INDEX idx_borrow_records");
        assertThat(detail).doesNotContain("SCAN borrow_records");
    }

    @Test
    void invalidParamsAre400Validation() throws Exception {
        int bookId = createBook();
        try {
            query("?status=FOO")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            query("?from=" + LocalDate.now() + "&to=" + LocalDate.now().minusDays(1))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            query("?page=0")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            query("?size=101")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            query("?from=not-a-date")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void queryEntrySweepsExpiredHoldsLazily() throws Exception {
        int heldReaderId = createReader();
        int bookId = createBook();
        try {
            // 过期 HELD：任何借阅查询入口先惰性结算 → EXPIRED（[假设 B6] 同款接入）
            jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                            + "VALUES (?, ?, 'HELD', ?)",
                    heldReaderId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z");
            int heldId = jdbc.queryForObject(
                    "SELECT id FROM reservations WHERE reader_id = ? AND book_id = ? "
                            + "AND status = 'HELD'", Integer.class, heldReaderId, bookId);

            query("?status=RETURNED").andExpect(status().isOk());

            String settled = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, heldId);
            assertThat(settled).isEqualTo("EXPIRED");
        } finally {
            cleanup(bookId);
        }
    }

    // ---- 请求与数据构造 ----

    private ResultActions query(String queryString) throws Exception {
        return mockMvc.perform(get("/api/borrows" + queryString)
                .header("Authorization", "Bearer " + adminToken()));
    }

    private JsonNode bodyOf(ResultActions actions) throws Exception {
        MvcResult result = actions.andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** 插入一条借阅（borrowed_at / due_at 均走借期字面惯例 T00:00:00.000Z），返回 id。 */
    private long insertBorrow(int readerId, int bookId, LocalDate borrowedAt,
                              LocalDate dueAt, String status) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "returned_at, status) VALUES (?, ?, ?, ?, ?, ?)",
                readerId, bookId, borrowedAt + "T00:00:00.000Z", dueAt + "T00:00:00.000Z",
                "RETURNED".equals(status) ? LocalDate.now() + "T00:00:00.000Z" : null,
                status);
        return jdbc.queryForObject(
                "SELECT id FROM borrow_records WHERE reader_id = ? AND book_id = ? "
                        + "AND status = ?",
                Long.class, readerId, bookId, status);
    }

    /** 建一本自建自清的书（bookCode 每次调用独立 nanoTime 后缀），返回 id。 */
    private int createBook() {
        String code = "B12-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "借阅查询验证书-" + unique, "测试作者", categoryId, 1);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个自建自清的读者（cardNo 带 B12T 前缀，清理按前缀删、永不触及种子 R0001）。 */
    private int createReader() {
        String cardNo = "B12T-" + unique + "-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "借阅查询验收读者-" + unique, "NORMAL");
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    private int seedReaderId() {
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = 'R0001'", Integer.class);
    }

    /** 清理本用例牵出的数据：借阅 / 预约行按书删，书按 id 删，自建读者按 cardNo 前缀删。 */
    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B12T-" + unique + "%");
    }

    private String tokenFor(String username) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}"
                                .formatted(username, passwordOf(username))))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private String passwordOf(String username) {
        return switch (username) {
            case "admin" -> "admin123";
            case "librarian" -> "lib123456";
            default -> "reader123";
        };
    }

    private String adminToken() throws Exception {
        return tokenFor("admin");
    }
}
