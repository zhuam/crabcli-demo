package com.crabcli.library.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * BE-B11 验收（Issue #126）：续借规则校验与借期延长逐条自证。
 * <ul>
 *   <li>续借成功 200：dueDate = <b>原</b> dueDate + loanWeeks×7（NORMAL 28 天 / TEACHER
 *       56 天，从原到期日顺延而非当天）、renewCount 0 → 1、status 仍 BORROWED；</li>
 *   <li>409 契约逐码：RENEW_LIMIT_REACHED（第 2 次续借）/ RENEW_BLOCKED_BY_RESERVATION
 *       （他人 HELD 与 WAITING 均拦、本人预约不拦）/ RENEW_BLOCKED_BY_OVERDUE（[假设 B5]
 *       取从严）/ BORROW_NOT_ACTIVE（已还 / 已丢失 / 已赔共用同码）；</li>
 *   <li>过期 HELD 惰性结算后不误拦（#124 sweeper 惯例承接）；缺失记录 404；
 *       READER 角色续借 403。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：书号 / 证号带 nanoTime 后缀自建自清，
 * 不触碰种子读者 R0001（自建读者 cardNo 恒带 B11T 前缀，清理按前缀删）。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class RenewControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    private final String unique = String.valueOf(System.nanoTime());

    @Test
    void renewSucceeds200ExtendsFromOriginalDueDateAndBumpsRenewCount() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "BORROWED");
        try {
            MvcResult result = renew(borrowId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(borrowId))
                    .andExpect(jsonPath("$.status").value("BORROWED"))
                    .andExpect(jsonPath("$.renewCount").value(1))
                    .andReturn();
            JsonNode body = objectMapper.readTree(
                    result.getResponse().getContentAsString());

            // NORMAL loanWeeks=4：从「原到期日」顺延 28 天（而非从当天）→ 今天 + 5 + 28
            assertThat(body.get("dueAt").asText().substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(33).toString());

            assertThat(jdbc.queryForObject(
                    "SELECT renew_count FROM borrow_records WHERE id = ?", Integer.class, borrowId))
                    .isEqualTo(1);
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void teacherRenewExtendsByItsOwnLoanWeeks() throws Exception {
        int readerId = createReader("TEACHER");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "BORROWED");
        try {
            MvcResult result = renew(borrowId)
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(
                    result.getResponse().getContentAsString());
            // TEACHER loanWeeks=8 → 原到期日 + 56 天
            assertThat(body.get("dueAt").asText().substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(61).toString());
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void secondRenewIs409RenewLimitReached() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "BORROWED");
        try {
            renew(borrowId).andExpect(status().isOk());
            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_LIMIT_REACHED"))
                    .andExpect(jsonPath("$.message", containsString("限续借 1 次")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void othersHeldAndWaitingBlockRenewOwnReservationPasses() throws Exception {
        int readerId = createReader("NORMAL");
        int otherReaderId = createReader("NORMAL");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "BORROWED");
        try {
            // 他人 HELD → 拦
            insertReservation(otherReaderId, bookId, "HELD",
                    LocalDate.now().plusDays(3) + "T00:00:00.000Z");
            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_BLOCKED_BY_RESERVATION"))
                    .andExpect(jsonPath("$.message", containsString("预约或排队")));

            // 他人 WAITING → 同码同拦（排队者同样被续借推迟）
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            insertReservation(otherReaderId, bookId, "WAITING", null);
            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_BLOCKED_BY_RESERVATION"));

            // 本人 WAITING → 不拦（「他人」口径），续借成功
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            insertReservation(readerId, bookId, "WAITING", null);
            renew(borrowId).andExpect(status().isOk());
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void expiredHeldIsSweptThenDoesNotBlockRenew() throws Exception {
        int readerId = createReader("NORMAL");
        int otherReaderId = createReader("NORMAL");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "BORROWED");
        try {
            // 他人 HELD 但保留窗口已过 → 惰性结算转 EXPIRED 后放行（#124 惯例承接）
            insertReservation(otherReaderId, bookId, "HELD",
                    LocalDate.now().minusDays(1) + "T00:00:00.000Z");
            renew(borrowId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.renewCount").value(1));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void overdueRecordIs409RenewBlockedByOverdue() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().minusDays(1), "BORROWED");
        try {
            renew(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RENEW_BLOCKED_BY_OVERDUE"))
                    .andExpect(jsonPath("$.message", containsString("逾期")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void returnedLostAndPaidRecordsAre409BorrowNotActive() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook();
        int returnedId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "RETURNED");
        try {
            jdbc.update("UPDATE borrow_records SET returned_at = ? WHERE id = ?",
                    LocalDate.now() + "T00:00:00.000Z", returnedId);
            renew(returnedId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"))
                    .andExpect(jsonPath("$.message", containsString("已结束")));

            int lostId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "LOST");
            renew(lostId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"));

            int paidId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "LOST_PAID");
            renew(paidId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void missingRecordIs404BorrowNotFound() throws Exception {
        renew(999999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BORROW_NOT_FOUND"));
    }

    @Test
    void readerRoleIs403Forbidden() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook();
        int borrowId = insertBorrow(readerId, bookId, LocalDate.now().plusDays(5), "BORROWED");
        try {
            mockMvc.perform(put("/api/borrows/" + borrowId + "/renew")
                            .header("Authorization", "Bearer " + tokenFor("reader01")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        } finally {
            cleanup(bookId);
        }
    }

    private ResultActions renew(int borrowId) throws Exception {
        return mockMvc.perform(put("/api/borrows/" + borrowId + "/renew")
                        .header("Authorization", "Bearer " + adminToken()));
    }

    /** 插一条自建借阅行（borrowed_at 取昨天、renew_count 走 DEFAULT 0），返回生成 id。 */
    private int insertBorrow(int readerId, int bookId, LocalDate dueDate, String status) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "returned_at, status) VALUES (?, ?, ?, ?, ?, ?)",
                readerId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z",
                dueDate + "T00:00:00.000Z",
                "RETURNED".equals(status) ? LocalDate.now() + "T00:00:00.000Z" : null,
                status);
        return jdbc.queryForObject(
                "SELECT MAX(id) FROM borrow_records WHERE reader_id = ? AND book_id = ?",
                Integer.class, readerId, bookId);
    }

    private void insertReservation(int readerId, int bookId, String status, String holdExpiresAt) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                + "VALUES (?, ?, ?, ?)", readerId, bookId, status, holdExpiresAt);
    }

    /** 建一本自建自清的书（bookCode 每次 nanoTime 后缀，一用例一册）。 */
    private int createBook() {
        String code = "B11-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "续借验证书-" + unique, "测试作者", categoryId, 1);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个自建自清的读者（cardNo 带 B11T 前缀，清理按前缀删、永不触及种子 R0001）。 */
    private int createReader(String typeCode) {
        String cardNo = "B11T-" + unique + "-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "续借验收读者-" + unique, typeCode);
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    /**
     * 清理本用例牵出的数据：借阅 / 预约行按书删，书按 id 删，自建读者按 cardNo
     * 前缀删（B11T 前缀由 {@link #createReader} 保证，种子数据不会被误删）。
     */
    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B11T-" + unique + "%");
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
