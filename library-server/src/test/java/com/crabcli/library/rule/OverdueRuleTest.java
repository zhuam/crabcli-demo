package com.crabcli.library.rule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.crabcli.library.domain.BorrowRecord;
import com.crabcli.library.domain.BorrowStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * BE-B14 / Issue #129：F6 逾期规则套件。先例 domain/BorrowRecordTest（固定日期纯单测）
 * 与 web/BorrowQueryControllerTest（查询 API 展示）已证主线，本套件聚焦：
 * <ul>
 *   <li>逾期天数边界 <strong>0 / 1 / 2 天</strong>（动态今日，补先例未单列的 2 天档）：
 *       due = 今日 → 0 天且仍 BORROWED（当天不逾期）；今日 −1 → 1 天 OVERDUE；
 *       今日 −2 → 2 天 OVERDUE（BorrowRecord:38-41 算式）；</li>
 *   <li>逾期读者借书 409 READER_HAS_OVERDUE（F3 借书链第 ⑤ 闸）；</li>
 *   <li>查询 API 读时派生而<strong>存储不落库</strong>：列表行 status=OVERDUE、
 *       overdueDays=1，同一行 borrow_records.status 仍为 BORROWED（#123 契约）。</li>
 * </ul>
 * 读者 / 书自建自清（B14O 前缀），种子数据零触碰。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OverdueRuleTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void overdueDayBoundariesZeroOneTwo() {
        LocalDate today = LocalDate.now();
        assertThat(borrowed(today.toString()).effectiveStatus(today)).isEqualTo(BorrowStatus.BORROWED);
        assertThat(borrowed(today.toString()).overdueDays(today)).isZero();

        assertThat(borrowed(today.minusDays(1).toString()).effectiveStatus(today))
                .isEqualTo(BorrowStatus.OVERDUE);
        assertThat(borrowed(today.minusDays(1).toString()).overdueDays(today)).isEqualTo(1);

        assertThat(borrowed(today.minusDays(2).toString()).effectiveStatus(today))
                .isEqualTo(BorrowStatus.OVERDUE);
        assertThat(borrowed(today.minusDays(2).toString()).overdueDays(today)).isEqualTo(2);
    }

    @Test
    void overdueReaderBorrowIs409ReaderHasOverdue() throws Exception {
        int readerId = createReader();
        int overdueBookId = createBook(1);
        int targetBookId = createBook(1);
        try {
            // 一条逾期未还（配额未满、目标书有副本）→ 借书链第 ⑤ 闸先拦
            insertBorrow(readerId, overdueBookId, LocalDate.now().minusDays(1));
            borrow(readerId, targetBookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_HAS_OVERDUE"))
                    .andExpect(jsonPath("$.message", containsString("逾期")));
        } finally {
            cleanup(overdueBookId, targetBookId);
        }
    }

    @Test
    void queryApiDerivesOverdueWhileStorageStaysBorrowed() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(1));

            mockMvc.perform(get("/api/borrows?readerId=" + readerId + "&status=OVERDUE")
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].status").value("OVERDUE"))
                    .andExpect(jsonPath("$.items[0].overdueDays").value(1));

            // 契约：OVERDUE 为读时派生态不落库（#123），行仍存 BORROWED
            String stored = jdbc.queryForObject(
                    "SELECT status FROM borrow_records WHERE reader_id = ? AND book_id = ?",
                    String.class, readerId, bookId);
            assertThat(stored).isEqualTo("BORROWED");
        } finally {
            cleanup(bookId);
        }
    }

    /** 未归还借出记录：dueAt 传日期部分，时间统一补 00:00:00.000Z（域级纯断言用）。 */
    private BorrowRecord borrowed(String dueDate) {
        return new BorrowRecord(1, 1, 1, "2026-06-01T00:00:00.000Z", dueDate + "T00:00:00.000Z",
                null, 0, "BORROWED", null, null, "2026-06-01T00:00:00.000Z");
    }

    private ResultActions borrow(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    private void insertBorrow(int readerId, int bookId, LocalDate dueDate) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "status) VALUES (?, ?, ?, ?, 'BORROWED')",
                readerId, bookId, LocalDate.now().minusDays(30) + "T00:00:00.000Z",
                dueDate + "T00:00:00.000Z");
    }

    private int createBook(int totalCopies) {
        String code = "B14O-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "逾期规则验证书", "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    private int createReader() {
        String cardNo = "B14O-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, 'NORMAL')",
                cardNo, "逾期规则验收读者");
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B14O-%");
    }

    private String tokenFor(String username) throws Exception {
        String password = switch (username) {
            case "admin" -> "admin123";
            case "librarian" -> "lib123456";
            default -> "reader123";
        };
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}"
                                .formatted(username, password)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("token").asText();
    }
}
