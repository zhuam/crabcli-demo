package com.crabcli.library.rule;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
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
 * BE-B14 / Issue #129：F4 续借规则套件。先例 web/RenewControllerTest 已逐码自证
 * 校验链（#126 交付），本套件在共用同一测试库的前提下独立复证验收主线并聚焦
 * 「借期锚定」证据强度：
 * <ul>
 *   <li>续借顺延自<strong>原到期日</strong>而非今日：TEACHER 借出 due=今日+56 天，
 *       续借后 due=今日+112 天——若实现误锚今日+56 会得到同一值，故用 8 周借期
 *       与 renewCount 联合钉死（RenewService:66-68 契约）；</li>
 *   <li>第 2 次续借 409 RENEW_LIMIT_REACHED（每本限 1 次边界）；</li>
 *   <li>逾期记录 409 RENEW_BLOCKED_BY_OVERDUE；他人排队预约 409
 *       RENEW_BLOCKED_BY_RESERVATION（HELD 同码已由先例覆盖）。</li>
 * </ul>
 * 读者 / 书自建自清（B14N 前缀），种子数据零触碰。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RenewRuleTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void teacherRenewExtendsFromOriginalDueDateOnce() throws Exception {
        int readerId = createReader("TEACHER");
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.dueAt",
                            startsWith(LocalDate.now().plusDays(56).toString())))
                    .andReturn());

            // 续借一次：due = 原到期日 + 8 周 = 今日 + 112 天，renewCount 0 → 1
            renew(borrowId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(borrowId))
                    .andExpect(jsonPath("$.status").value("BORROWED"))
                    .andExpect(jsonPath("$.renewCount").value(1))
                    .andExpect(jsonPath("$.dueAt",
                            startsWith(LocalDate.now().plusDays(112).toString())));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void secondRenewIs409RenewLimitReached() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andReturn());

            renew(borrowId).andExpect(status().isOk());
            // 第 2 次续借 → 409（每本限 1 次，schema CHECK renew_count BETWEEN 0 AND 1 兜底）
            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_LIMIT_REACHED"))
                    .andExpect(jsonPath("$.message",
                            containsString("上限")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void overdueRecordIs409RenewBlockedByOverdue() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            // 存储态 BORROWED、due 已过、未归还 → 读时派生 OVERDUE，续借被拦
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(1));
            int borrowId = jdbc.queryForObject(
                    "SELECT id FROM borrow_records WHERE reader_id = ? AND book_id = ?",
                    Integer.class, readerId, bookId);

            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_BLOCKED_BY_OVERDUE"))
                    .andExpect(jsonPath("$.message",
                            containsString("逾期")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void othersWaitingReservationIs409RenewBlockedByReservation() throws Exception {
        int readerId = createReader("NORMAL");
        int otherReaderId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andReturn());

            // 他人 WAITING 排队即拦（续借推迟副本回池，排队者被损害；RenewService:100-106）
            insertReservation(otherReaderId, bookId, "WAITING");
            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_BLOCKED_BY_RESERVATION"));

            // 本人预约不拦：清掉他人行、换本人 WAITING → 续借放行
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            insertReservation(readerId, bookId, "WAITING");
            renew(borrowId).andExpect(status().isOk());
        } finally {
            cleanup(bookId);
        }
    }

    private int borrowIdOf(MvcResult result) throws Exception {
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("id").asInt();
    }

    private ResultActions borrow(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    private ResultActions renew(int borrowId) throws Exception {
        return mockMvc.perform(put("/api/borrows/" + borrowId + "/renew")
                        .header("Authorization", "Bearer " + tokenFor("admin")));
    }

    private void insertBorrow(int readerId, int bookId, LocalDate dueDate) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "returned_at, status) VALUES (?, ?, ?, ?, NULL, 'BORROWED')",
                readerId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z",
                dueDate + "T00:00:00.000Z");
    }

    private void insertReservation(int readerId, int bookId, String status) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                        + "VALUES (?, ?, ?, ?)",
                readerId, bookId, status, null);
    }

    private int createBook(int totalCopies) {
        String code = "B14N-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "续借规则验证书", "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    private int createReader(String typeCode) {
        String cardNo = "B14N-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "续借规则验收读者", typeCode);
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    private void cleanup(int bookId) {
        jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B14N-%");
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
