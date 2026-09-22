package com.crabcli.library.web;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * BE-B13 验收（Issue #128）：丢失赔偿登记与闭环（F9 不对接支付，仅登记与结算）。
 * <ul>
 *   <li>登记丢失 200：status=LOST、compensationStatus=PENDING、compensationAmount
 *       已记录（响应与落库一致）；LOST 未赔副本仍占用（availableCopies 保持 0）；</li>
 *   <li>[假设 A8] LOST 未赔仍计配额：maxBorrow=1 的读者登记丢失后 activeBorrowCount
 *       仍为 1，再借新书 → 409 QUOTA_EXCEEDED；</li>
 *   <li>赔偿结算 200：status=LOST_PAID、compensationStatus=PAID、金额保留，闭环后
 *       不再占配额（activeBorrowCount 归 0）；重复结算 → 409
 *       COMPENSATION_ALREADY_PAID（中文直显）；</li>
 *   <li>非丢失待赔结算（BORROWED）→ 409 BORROW_NOT_ACTIVE；已还记录登记丢失 → 409
 *       BORROW_NOT_ACTIVE；缺失借阅 → 404 BORROW_NOT_FOUND；金额负数 / 非数字 →
 *       400 VALIDATION_ERROR。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：书号 / 证号带 nanoTime 后缀自建自清，
 * 自建读者 cardNo 恒带 B13T 前缀（清理按前缀删、永不触及种子 R0001）；
 * 配额用例的自建读者类型 code 带 B13QT 前缀，清理一并删除。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class LostCompensationControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    private final String unique = String.valueOf(System.nanoTime());

    @Test
    void lostSucceeds200RecordsFieldsAndCopyStaysOccupied() throws Exception {
        int readerId = readerIdOf(createReader());
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);

            lost(borrowId, "{\"compensationAmount\":45.00}")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(borrowId))
                    .andExpect(jsonPath("$.status").value("LOST"))
                    .andExpect(jsonPath("$.compensationStatus").value("PENDING"))
                    .andExpect(jsonPath("$.compensationAmount").value(45.00));

            // 落库一致：三字段均落账
            String status = jdbc.queryForObject(
                    "SELECT status FROM borrow_records WHERE id = ?", String.class, borrowId);
            String compensationStatus = jdbc.queryForObject(
                    "SELECT compensation_status FROM borrow_records WHERE id = ?",
                    String.class, borrowId);
            String amount = jdbc.queryForObject(
                    "SELECT compensation_amount FROM borrow_records WHERE id = ?",
                    String.class, borrowId);
            org.assertj.core.api.Assertions.assertThat(status).isEqualTo("LOST");
            org.assertj.core.api.Assertions.assertThat(compensationStatus).isEqualTo("PENDING");
            org.assertj.core.api.Assertions.assertThat(amount).isEqualTo("45.00");

            // LOST 未赔仍占副本：availableCopies 保持 0（不回池）
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void lostUnpaidStillCountsTowardQuota() throws Exception {
        String typeCode = "B13QT-" + unique;
        jdbc.update("INSERT INTO reader_types (code, name, max_borrow, loan_weeks) "
                + "VALUES (?, ?, 1, 4)", typeCode, "丢失配额验收类型-" + unique);
        String cardNo = createReaderOfType(typeCode);
        int readerId = readerIdOf(cardNo);
        int bookId = createBook(1);
        int secondBookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            lost(borrowId, "{\"compensationAmount\":30.00}").andExpect(status().isOk());

            // LOST 未赔计入 activeBorrowCount：配额 1 已占满
            mockMvc.perform(get("/api/readers?q=" + cardNo)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].activeBorrowCount").value(1));

            // 配额占满：借第二本 → 409 QUOTA_EXCEEDED
            borrowFor(readerId, secondBookId, status().isConflict())
                    .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                    .andExpect(jsonPath("$.message", containsString("最多借")));
        } finally {
            jdbc.update("DELETE FROM borrow_records WHERE book_id IN (?, ?)", bookId, secondBookId);
            jdbc.update("DELETE FROM books WHERE id IN (?, ?)", bookId, secondBookId);
            jdbc.update("DELETE FROM readers WHERE id = ?", readerId);
            jdbc.update("DELETE FROM reader_types WHERE code = ?", typeCode);
        }
    }

    @Test
    void compensateSucceeds200ClosesFlowAndReleasesQuota() throws Exception {
        String cardNo = createReader();
        int readerId = readerIdOf(cardNo);
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            lost(borrowId, "{\"compensationAmount\":45.00}").andExpect(status().isOk());

            compensate(borrowId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(borrowId))
                    .andExpect(jsonPath("$.status").value("LOST_PAID"))
                    .andExpect(jsonPath("$.compensationStatus").value("PAID"))
                    .andExpect(jsonPath("$.compensationAmount").value(45.00));

            // 落库一致：状态闭环、金额留痕
            String status = jdbc.queryForObject(
                    "SELECT status FROM borrow_records WHERE id = ?", String.class, borrowId);
            String compensationStatus = jdbc.queryForObject(
                    "SELECT compensation_status FROM borrow_records WHERE id = ?",
                    String.class, borrowId);
            org.assertj.core.api.Assertions.assertThat(status).isEqualTo("LOST_PAID");
            org.assertj.core.api.Assertions.assertThat(compensationStatus).isEqualTo("PAID");

            // 闭环后不占配额：activeBorrowCount 归 0
            mockMvc.perform(get("/api/readers?q=" + cardNo)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].activeBorrowCount").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void compensateAgainIs409AlreadyPaid() throws Exception {
        int readerId = readerIdOf(createReader());
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            lost(borrowId, "{\"compensationAmount\":45.00}").andExpect(status().isOk());
            compensate(borrowId).andExpect(status().isOk());
            compensate(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMPENSATION_ALREADY_PAID"))
                    .andExpect(jsonPath("$.message", containsString("重复赔偿")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void compensateOnNeverLostIs409BorrowNotActive() throws Exception {
        int readerId = readerIdOf(createReader());
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            compensate(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void lostOnReturnedIs409BorrowNotActive() throws Exception {
        int readerId = readerIdOf(createReader());
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            mockMvc.perform(post("/api/borrows/" + borrowId + "/return")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk());
            lost(borrowId, "{\"compensationAmount\":45.00}")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void lostWithNegativeAndNonNumericAmountAre400() throws Exception {
        int readerId = readerIdOf(createReader());
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            // 负数 → 校验注解拒绝
            lost(borrowId, "{\"compensationAmount\":-1}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            // 非数字 → JSON 反序列化失败，同样 400 VALIDATION_ERROR
            lost(borrowId, "{\"compensationAmount\":\"abc\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void lostAndCompensateMissingBorrowAre404() throws Exception {
        lost(999999, "{\"compensationAmount\":45.00}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BORROW_NOT_FOUND"));
        compensate(999999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BORROW_NOT_FOUND"));
    }

    // ---- 请求与数据构造 ----

    private ResultActions lost(int borrowId, String body) throws Exception {
        return mockMvc.perform(post("/api/borrows/" + borrowId + "/lost")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content(body));
    }

    private ResultActions compensate(int borrowId) throws Exception {
        return mockMvc.perform(post("/api/borrows/" + borrowId + "/compensate")
                        .header("Authorization", "Bearer " + adminToken()));
    }

    /** 馆员借出并返回借阅 id（信任成功路径，201 断言内置于返回）。 */
    private int borrowFor(int readerId, int bookId) throws Exception {
        MvcResult result = borrowFor(readerId, bookId, status().isCreated()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asInt();
    }

    private ResultActions borrowFor(int readerId, int bookId,
                                    org.springframework.test.web.servlet.ResultMatcher expected)
            throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)))
                .andExpect(expected);
    }

    /** 建一本自建自清的书（bookCode 每次调用独立 nanoTime 后缀），返回 id。 */
    private int createBook(int totalCopies) {
        String code = "B13-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "丢失赔偿验证书-" + unique, "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个 NORMAL 类型、自建自清的读者（cardNo 带 B13T 前缀，清理按前缀删），返回 cardNo。 */
    private String createReader() {
        return createReaderOfType("NORMAL");
    }

    /** 指定读者类型建读者：配额用例以 maxBorrow=1 的自建类型精确卡位，返回 cardNo。 */
    private String createReaderOfType(String typeCode) {
        String cardNo = "B13T-" + unique + "-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "丢失赔偿验收读者-" + unique, typeCode);
        return cardNo;
    }

    /** 按 cardNo 取读者 id（card_no 唯一索引，精确命中）。 */
    private int readerIdOf(String cardNo) {
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    /** 清理本用例牵出的数据：借阅行按书删，书按 id 删，自建读者按 cardNo 前缀删。 */
    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B13T-" + unique + "%");
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
