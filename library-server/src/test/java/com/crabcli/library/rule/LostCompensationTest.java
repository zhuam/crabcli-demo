package com.crabcli.library.rule;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
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
 * BE-B14 / Issue #129：F8 丢失登记 + F9 赔偿结算套件。先例
 * web/LostCompensationControllerTest 已逐码自证（#128 交付），本套件独立复证
 * 两步闭环主线，并额外钉死闭环两端的副本口径：
 * <ul>
 *   <li>登记：借出行 → POST lost 金额 → status=LOST、compensationStatus=PENDING、
 *       compensationAmount 落账；<strong>未赔 LOST 仍占副本</strong>（availableCopies
 *       保持 0，[假设 A8]，AvailableCopiesService 口径）；</li>
 *   <li>结算：POST compensate → status=LOST_PAID、compensationStatus=PAID，
 *       <strong>副本回池</strong>（availableCopies 0 → 1）；</li>
 *   <li>重复结算 409 COMPENSATION_ALREADY_PAID（先于状态判定，#128 契约）；</li>
 *   <li>已归还行不能登记丢失 409 BORROW_NOT_ACTIVE。</li>
 * </ul>
 * 读者 / 书自建自清（B14L 前缀），种子数据零触碰。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LostCompensationTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void lostRecordsFieldsAndCopyStaysOccupiedUntilPaid() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andReturn());

            // 登记丢失：金额落账、两态字面（PENDING/LOST），未赔副本不回池
            mockMvc.perform(post("/api/borrows/" + borrowId + "/lost")
                            .header("Authorization", "Bearer " + tokenFor("admin"))
                            .contentType("application/json")
                            .content("{\"compensationAmount\":66.5}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("LOST"))
                    .andExpect(jsonPath("$.compensationStatus").value("PENDING"))
                    .andExpect(jsonPath("$.compensationAmount").value(66.5));
            availableCopies(bookId).andExpect(jsonPath("$.availableCopies").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void compensateClosesFlowAndReleasesCopy() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId).andReturn());
            markLost(borrowId).andExpect(status().isOk());

            // 结算闭环：LOST_PAID / PAID，副本回池
            mockMvc.perform(post("/api/borrows/" + borrowId + "/compensate")
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("LOST_PAID"))
                    .andExpect(jsonPath("$.compensationStatus").value("PAID"));
            availableCopies(bookId).andExpect(jsonPath("$.availableCopies").value(1));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void compensateTwiceIs409AlreadyPaid() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId).andReturn());
            markLost(borrowId).andExpect(status().isOk());
            mockMvc.perform(post("/api/borrows/" + borrowId + "/compensate")
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk());

            // 重复结算 → 409（先于状态判定，故非 BORROW_NOT_ACTIVE，#128 契约）
            mockMvc.perform(post("/api/borrows/" + borrowId + "/compensate")
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("COMPENSATION_ALREADY_PAID"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void lostAfterReturnIs409BorrowNotActive() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowIdOf(borrow(readerId, bookId).andReturn());
            mockMvc.perform(post("/api/borrows/" + borrowId + "/return")
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk());

            // 已归还行（RETURNED）再登记丢失 → 409
            markLost(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"));
        } finally {
            cleanup(bookId);
        }
    }

    private int borrowIdOf(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("id").asInt();
    }

    private ResultActions borrow(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    private ResultActions markLost(int borrowId) throws Exception {
        return mockMvc.perform(post("/api/borrows/" + borrowId + "/lost")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"compensationAmount\":66.5}"));
    }

    private ResultActions availableCopies(int bookId) throws Exception {
        return mockMvc.perform(get("/api/books/" + bookId)
                        .header("Authorization", "Bearer " + tokenFor("admin")))
                .andExpect(status().isOk());
    }

    private int createBook(int totalCopies) {
        String code = "B14L-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "丢失赔偿规则验证书", "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    private int createReader() {
        String cardNo = "B14L-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, 'NORMAL')",
                cardNo, "丢失赔偿规则验收读者");
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    private void cleanup(int bookId) {
        jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B14L-%");
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
