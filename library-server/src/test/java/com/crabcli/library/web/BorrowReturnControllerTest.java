package com.crabcli.library.web;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;

import com.crabcli.library.service.ReservationExpirySweeper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * BE-B10 验收（Issue #125）：还书登记与预约递补衔接。
 * <ul>
 *   <li>正常归还 200：status=RETURNED、returnedAt=当日、落库一致；无预约时副本
 *       直接回可借池（availableCopies 0 → 1）；</li>
 *   <li>有预约归还：队首 WAITING → HELD（复用 {@link ReservationExpirySweeper
 *       #promoteNextWaiting}），holdUntil = 当日 + 3 天，保留副本不计入
 *       availableCopies（归还后仍为 0）；</li>
 *   <li>对已还记录再调 → 409 BORROW_NOT_ACTIVE（中文直显）；缺失借阅 → 404
 *       BORROW_NOT_FOUND；</li>
 *   <li>[并发] 还书落账与递补同事务：递补抛错 → 还书一并回滚（returned_at 仍
 *       NULL、记录仍 BORROWED、队列仍 WAITING），证明 SQLite 单写事务原子性。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：书号 / 证号带 nanoTime 后缀自建自清，
 * 自建读者 cardNo 恒带 B10T 前缀（清理按前缀删、永不触及种子 R0001）。
 * 事务回滚用例以 {@code @MockitoSpyBean} 包裹 sweeper 注入失败，派生独立上下文，
 * data.sql 全 OR IGNORE 幂等、共库安全；Mockito 每用例后自动 reset，不影响同文件
 * 其他用例与其余测试类。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class BorrowReturnControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoSpyBean
    ReservationExpirySweeper sweeper;

    private final String unique = String.valueOf(System.nanoTime());

    @Test
    void returnSucceeds200ReturnedTodayAndCopyBackToPool() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(0));

            returnBook(borrowId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(borrowId))
                    .andExpect(jsonPath("$.status").value("RETURNED"))
                    .andExpect(jsonPath("$.returnedAt", containsString(LocalDate.now().toString())));

            // 落库一致：status=RETURNED、returned_at 非空
            String status = jdbc.queryForObject(
                    "SELECT status FROM borrow_records WHERE id = ?", String.class, borrowId);
            String returnedAt = jdbc.queryForObject(
                    "SELECT returned_at FROM borrow_records WHERE id = ?", String.class, borrowId);
            org.assertj.core.api.Assertions.assertThat(status).isEqualTo("RETURNED");
            org.assertj.core.api.Assertions.assertThat(returnedAt).isNotNull();

            // 无预约：副本直接回可借池
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(1));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void returnWithWaitingReservationPromotesHeadToHeldAndHoldsCopy() throws Exception {
        int occupierId = createReader();
        int waitingReaderId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(occupierId, bookId);
            int waitingId = insertReservation(waitingReaderId, bookId, "WAITING");

            returnBook(borrowId)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("RETURNED"));

            // 队首 WAITING → HELD，holdUntil = 当日 + 3 天（借期字面惯例，日历日语义）
            String promotedStatus = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, waitingId);
            String promotedHold = jdbc.queryForObject(
                    "SELECT hold_expires_at FROM reservations WHERE id = ?", String.class, waitingId);
            org.assertj.core.api.Assertions.assertThat(promotedStatus).isEqualTo("HELD");
            org.assertj.core.api.Assertions.assertThat(promotedHold).isNotNull();
            org.assertj.core.api.Assertions.assertThat(promotedHold.substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(3).toString());

            // HELD 副本不放回可借池：BORROWED −1 与 HELD +1 相抵，仍为 0
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void returnAgainIs409BorrowNotActive() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(readerId, bookId);
            returnBook(borrowId).andExpect(status().isOk());
            returnBook(borrowId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BORROW_NOT_ACTIVE"))
                    .andExpect(jsonPath("$.message", containsString("重复还书")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void returnMissingBorrowIs404() throws Exception {
        returnBook(999999)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BORROW_NOT_FOUND"));
    }

    @Test
    void promotionFailureRollsBackReturnInSameTransaction() throws Exception {
        int occupierId = createReader();
        int waitingReaderId = createReader();
        int bookId = createBook(1);
        try {
            int borrowId = borrowFor(occupierId, bookId);
            int waitingId = insertReservation(waitingReaderId, bookId, "WAITING");
            doThrow(new IllegalStateException("模拟递补失败")).when(sweeper).promoteNextWaiting(anyInt());

            // 递补抛错 → 整个事务回滚：还书不得部分落账
            returnBook(borrowId)
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));

            String borrowStatus = jdbc.queryForObject(
                    "SELECT status FROM borrow_records WHERE id = ?", String.class, borrowId);
            String returnedAt = jdbc.queryForObject(
                    "SELECT returned_at FROM borrow_records WHERE id = ?", String.class, borrowId);
            org.assertj.core.api.Assertions.assertThat(borrowStatus).isEqualTo("BORROWED");
            org.assertj.core.api.Assertions.assertThat(returnedAt).isNull();
            String reservationStatus = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, waitingId);
            org.assertj.core.api.Assertions.assertThat(reservationStatus).isEqualTo("WAITING");
        } finally {
            cleanup(bookId);
        }
    }

    // ---- 请求与数据构造 ----

    private ResultActions returnBook(int borrowId) throws Exception {
        return mockMvc.perform(post("/api/borrows/" + borrowId + "/return")
                        .header("Authorization", "Bearer " + adminToken()));
    }

    /** 馆员借出并返回借阅 id（201 断言内置于调用方；此处信任成功路径）。 */
    private int borrowFor(int readerId, int bookId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asInt();
    }

    private int insertReservation(int readerId, int bookId, String status) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status) VALUES (?, ?, ?)",
                readerId, bookId, status);
        return jdbc.queryForObject(
                "SELECT id FROM reservations WHERE reader_id = ? AND book_id = ? AND status = ?",
                Integer.class, readerId, bookId, status);
    }

    /** 建一本自建自清的书（bookCode 每次调用独立 nanoTime 后缀），返回 id。 */
    private int createBook(int totalCopies) {
        String code = "B10-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "还书验证书-" + unique, "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个自建自清的读者（cardNo 带 B10T 前缀，清理按前缀删、永不触及种子 R0001）。 */
    private int createReader() {
        String cardNo = "B10T-" + unique + "-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "还书验收读者-" + unique, "NORMAL");
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    /** 清理本用例牵出的数据：借阅 / 预约行按书删，书按 id 删，自建读者按 cardNo 前缀删。 */
    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B10T-" + unique + "%");
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
