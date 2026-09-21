package com.crabcli.library.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
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
 * BE-B08 验收（Issue #123）：借书规则校验链逐条自证。
 * <ul>
 *   <li>正常借出 201：dueDate = borrowDate + loanWeeks×7（NORMAL 28 天 / TEACHER 56 天），
 *       availableCopies 减 1，借阅行落库；</li>
 *   <li>409 契约逐码：QUOTA_EXCEEDED（含「最多借 3 本」）/ READER_HAS_OVERDUE（含「逾期」）/
 *       READER_INACTIVE（含「已注销」）/ BOOK_WITHDRAWN / NO_AVAILABLE_COPY /
 *       RESERVED_FOR_OTHER_READER（他人 HELD 拒、本人 HELD 放行）；</li>
 *   <li>配额边界：NORMAL 已借 3 拒第 4；TEACHER 第 6 本可借、第 7 本才拒（maxBorrow=6）；</li>
 *   <li>校验顺序契约定稿：未注销 → 未下架 → 无逾期 → 预约归属 → 配额 → 可借副本
 *       （配额先于副本），多规则同违时落在最先违反的那条；</li>
 *   <li>缺失引用 404；请求体缺字段 400；READER 角色借书 403。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：书号 / 证号带 nanoTime 后缀自建自清，
 * 种子读者 R0001 只读 id 绝不改动（自建读者 cardNo 恒带 B08T 前缀，清理按前缀删）。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class BorrowControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    private final String unique = String.valueOf(System.nanoTime());

    @Test
    void borrowSucceeds201PersistsDueDateAndLedger() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(2);
        try {
            MvcResult result = borrow(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.readerId").value(readerId))
                    .andExpect(jsonPath("$.bookId").value(bookId))
                    .andExpect(jsonPath("$.status").value("BORROWED"))
                    .andExpect(jsonPath("$.renewCount").value(0))
                    .andExpect(jsonPath("$.returnedAt").doesNotExist())
                    .andReturn();
            JsonNode body = objectMapper.readTree(
                    result.getResponse().getContentAsString());

            // dueDate = borrowDate + 4 周 × 7 天（NORMAL）
            assertThat(body.get("dueAt").asText().substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(28).toString());

            // 落库且可借副本减 1（B07 口径同一来源）
            String status = jdbc.queryForObject(
                    "SELECT status FROM borrow_records WHERE id = ?", String.class,
                    body.get("id").asInt());
            assertThat(status).isEqualTo("BORROWED");
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(1));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void teacherBorrowDueDateUsesItsOwnLoanWeeks() throws Exception {
        int readerId = createReader("TEACHER");
        int bookId = createBook(1);
        try {
            MvcResult result = borrow(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andReturn();
            JsonNode body = objectMapper.readTree(
                    result.getResponse().getContentAsString());
            // TEACHER loanWeeks=8 → 56 天
            assertThat(body.get("dueAt").asText().substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(56).toString());
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void normalReaderFourthBookIs409QuotaExceeded() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        int fillBookId = createBook(1);
        try {
            // 已借 3 本（占别的书）→ 借第 4 本拒，文案含「最多借 3 本」（maxBorrow 实时值）
            fillQuota(readerId, fillBookId, 3);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                    .andExpect(jsonPath("$.message", containsString("最多借 3 本")));
        } finally {
            cleanup(bookId, fillBookId);
        }
    }

    @Test
    void teacherSixthBorrowAllowedSeventhRejected() throws Exception {
        int readerId = createReader("TEACHER");
        int bookId = createBook(2);
        int fillBookId = createBook(1);
        try {
            fillQuota(readerId, fillBookId, 5);
            // 第 6 本可借（maxBorrow=6，配额参数化不硬编码 3）
            borrow(readerId, bookId)
                    .andExpect(status().isCreated());

            // 第 7 本才拒
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                    .andExpect(jsonPath("$.message", containsString("最多借 6 本")));
        } finally {
            cleanup(bookId, fillBookId);
        }
    }

    @Test
    void overdueReaderIs409ReaderHasOverdue() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        try {
            // 有一条逾期（due 已过、未归还）+ 配额与副本均有余 → 仍拒，文案含「逾期」
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(1), "BORROWED", null);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_HAS_OVERDUE"))
                    .andExpect(jsonPath("$.message", containsString("逾期")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void inactiveReaderIs409ReaderInactive() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            jdbc.update("UPDATE readers SET status = 'INACTIVE' WHERE id = ?", readerId);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_INACTIVE"))
                    .andExpect(jsonPath("$.message", containsString("已注销")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void withdrawnBookIs409BookWithdrawn() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        try {
            jdbc.update("UPDATE books SET status = 'WITHDRAWN' WHERE id = ?", bookId);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BOOK_WITHDRAWN"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void zeroAvailableCopyIs409NoAvailableCopy() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        int occupierId = createReader("NORMAL");
        try {
            // 唯一副本被他人借走 → availableCopies=0（B07 口径）
            insertBorrow(occupierId, bookId, LocalDate.now().plusDays(7), "BORROWED", null);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("NO_AVAILABLE_COPY"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void heldByOtherRejectedHeldBySelfPasses() throws Exception {
        int selfReaderId = seedReaderId();
        int otherReaderId = createReader("NORMAL");
        int bookId = createBook(2);
        try {
            // 他人 HELD → RESERVED_FOR_OTHER_READER
            insertReservation(otherReaderId, bookId, "HELD");
            borrow(selfReaderId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RESERVED_FOR_OTHER_READER"));

            // 本人 HELD → 预约归属放行（F5 预约人可借）：2 副本扣 1 份 HELD 保留
            // 仍余 1 份可借 → 借出成功
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            insertReservation(selfReaderId, bookId, "HELD");
            borrow(selfReaderId, bookId)
                    .andExpect(status().isCreated());
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void orderQuotaBeforeAvailableCopy() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        int fillBookId = createBook(1);
        int occupierId = createReader("NORMAL");
        try {
            // 配额满（占别的书）与目标书副本为 0 同时成立 → 契约定稿「配额先于副本」
            fillQuota(readerId, fillBookId, 3);
            insertBorrow(occupierId, bookId, LocalDate.now().plusDays(7), "BORROWED", null);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"));
        } finally {
            cleanup(bookId, fillBookId);
        }
    }

    @Test
    void orderInactiveBeforeWithdrawn() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            jdbc.update("UPDATE readers SET status = 'INACTIVE' WHERE id = ?", readerId);
            jdbc.update("UPDATE books SET status = 'WITHDRAWN' WHERE id = ?", bookId);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_INACTIVE"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void orderWithdrawnBeforeOverdue() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        try {
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(1), "BORROWED", null);
            jdbc.update("UPDATE books SET status = 'WITHDRAWN' WHERE id = ?", bookId);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BOOK_WITHDRAWN"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void orderOverdueBeforeHeldByOther() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        int otherReaderId = createReader("NORMAL");
        try {
            insertBorrow(readerId, bookId, LocalDate.now().minusDays(1), "BORROWED", null);
            insertReservation(otherReaderId, bookId, "HELD");
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_HAS_OVERDUE"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void missingReaderOrBookIs404() throws Exception {
        int bookId = createBook(1);
        try {
            borrow(999999, bookId)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("READER_NOT_FOUND"));
            borrow(seedReaderId(), 999999)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void missingOrIllegalFieldsIs400Validation() throws Exception {
        mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"bookId\":1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields[0].field").value("readerId"));

        mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"readerId\":0,\"bookId\":1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void readerRoleIs403Forbidden() throws Exception {
        mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("reader01"))
                        .contentType("application/json")
                        .content("{\"readerId\":1,\"bookId\":1}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    /** 给读者插 count 条在借（due 在未来、占 fillBook），占满配额但不触发逾期。 */
    private void fillQuota(int readerId, int fillBookId, int count) {
        for (int i = 0; i < count; i++) {
            insertBorrow(readerId, fillBookId, LocalDate.now().plusDays(7), "BORROWED", null);
        }
    }

    private ResultActions borrow(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    private void insertBorrow(int readerId, int bookId, LocalDate dueDate,
                              String status, String returnedAt) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "returned_at, status) VALUES (?, ?, ?, ?, ?, ?)",
                readerId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z",
                dueDate + "T00:00:00.000Z", returnedAt, status);
    }

    private void insertReservation(int readerId, int bookId, String status) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                        + "VALUES (?, ?, ?, ?)",
                readerId, bookId, status,
                "HELD".equals(status) ? LocalDate.now().plusDays(3) + "T00:00:00.000Z" : null);
    }

    /** 建一本自建自清的书（bookCode 每次调用独立 nanoTime 后缀，一用例可建多本），返回 id。 */
    private int createBook(int totalCopies) {
        String code = "B08-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "借书验证书-" + unique, "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个自建自清的读者（cardNo 带 B08T 前缀，清理按前缀删、永不触及种子 R0001）。 */
    private int createReader(String typeCode) {
        String cardNo = "B08T-" + unique;
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "借书验收读者-" + unique, typeCode);
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    private int seedReaderId() {
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = 'R0001'", Integer.class);
    }

    /**
     * 清理本用例牵出的数据：借阅 / 预约行按书删，书按 id 删，自建读者按 cardNo
     * 前缀删（B08T 前缀由 {@link #createReader} 保证，种子 R0001 不会被误删）。
     */
    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B08T-" + unique + "%");
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
