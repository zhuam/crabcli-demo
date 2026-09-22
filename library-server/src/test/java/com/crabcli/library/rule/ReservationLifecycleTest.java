package com.crabcli.library.rule;

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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * BE-B14 / Issue #129：F5 预约生命周期套件。先例 web/ReservationControllerTest 已证
 * 建约校验链 / 取消递补 / 过期结算（#124 交付），本套件聚焦其未钉死的时点边界：
 * <ul>
 *   <li>建约闸门：仍有可借副本 409 RESERVATION_NOT_ALLOWED → 占满后 WAITING
 *       queuePosition 按队序 1、2 递增；</li>
 *   <li><strong>HELD 第 3 天整点不结算</strong>：经真实递补路径（还书触发）产生的
 *       HELD，hold_expires_at = 今日+3 的 T00:00:00.000Z 整点字面；预约入口惰性
 *       结算对整点字面不做结算——sweeper 为严格小于（ReservationExpirySweeper:39-54
 *       {@code hold_expires_at < now}），整点时刻本身仍在保留窗口内，副本仍被
 *       HELD 占用（availableCopies=0）；</li>
 *   <li><strong>过整点即结算</strong>：hold_expires_at 已过（now − 1 秒，即整点后
 *       至少 1 秒）→ 入口结算置 EXPIRED（hold_expires_at 清空）并递补队首
 *       WAITING → HELD，新窗口仍为今日+3 整点字面。</li>
 * </ul>
 * 时点断言两侧均为同 JVM / SQLite now 的字面比较，跨日运行仍确定；读者 / 书
 * 自建自清（B14V 前缀）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReservationLifecycleTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void createGateRejectsWhileCopyAvailableThenQueuePositionsGrow() throws Exception {
        int occupierId = createReader();
        int waiter1 = createReader();
        int waiter2 = createReader();
        int bookId = createBook(1);
        try {
            // 仍有可借副本 → 不允许预约（ReservationService:81-85）
            reserve(waiter1, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RESERVATION_NOT_ALLOWED"));

            // 唯一副本被借走 → 排队预约成立，队序 1、2 递增
            insertBorrow(occupierId, bookId);
            reserve(waiter1, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("WAITING"))
                    .andExpect(jsonPath("$.queuePosition").value(1));
            reserve(waiter2, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("WAITING"))
                    .andExpect(jsonPath("$.queuePosition").value(2));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void holdFromRealPromotionSurvivesSweepAtThirdDayDeadline() throws Exception {
        int occupierId = createReader();
        int holderId = createReader();
        int bookId = createBook(1);
        try {
            // 真实递补路径：occupier 借走唯一副本 → holder 排队 → 还书触发队首 HELD
            int borrowId = borrowIdOf(borrow(occupierId, bookId).andReturn());
            int holdId = reserveIdOf(reserve(holderId, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.queuePosition").value(1))
                    .andReturn());
            mockMvc.perform(post("/api/borrows/" + borrowId + "/return")
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk());

            // 递补开出的保留窗口恰为第 3 天整点字面（ReservationExpirySweeper:60-64）
            String deadline = LocalDate.now().plusDays(3) + "T00:00:00.000Z";
            mockMvc.perform(get("/api/reservations?bookId=" + bookId)
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id == " + holdId + ")].status").value("HELD"))
                    .andExpect(jsonPath("$[?(@.id == " + holdId + ")].holdExpiresAt")
                            .value(deadline));

            // 第 3 天整点仍在窗口内：入口惰性结算不越界（严格小于），副本保持被 HELD 占用
            mockMvc.perform(get("/api/reservations?bookId=" + bookId)
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk());
            String status = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, holdId);
            assertThat(status).isEqualTo("HELD");
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void holdPastDeadlineIsSweptAndPromotesNextWaitingWithFreshWindow() throws Exception {
        int holderId = createReader();
        int nextId = createReader();
        int bookId = createBook(1);
        try {
            // 过整点的 HELD（now − 1 秒，即整点后至少 1 秒，SQLite now 同源）+ 一位排队者
            jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                            + "VALUES (?, ?, 'HELD', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 seconds'))",
                    holderId, bookId);
            int heldId = jdbc.queryForObject(
                    "SELECT id FROM reservations WHERE book_id = ? AND status = 'HELD'",
                    Integer.class, bookId);
            int waitingId = insertReservation(nextId, bookId, "WAITING", null);

            // 预约入口惰性结算：过期 HELD → EXPIRED（hold_expires_at 清空），
            // 队首 WAITING → HELD，新窗口仍为第 3 天整点字面
            mockMvc.perform(get("/api/reservations?bookId=" + bookId)
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk());

            String expiredStatus = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, heldId);
            String expiredHold = jdbc.queryForObject(
                    "SELECT hold_expires_at FROM reservations WHERE id = ?", String.class, heldId);
            assertThat(expiredStatus).isEqualTo("EXPIRED");
            assertThat(expiredHold).isNull();

            String freshWindow = jdbc.queryForObject(
                    "SELECT hold_expires_at FROM reservations WHERE id = ?", String.class, waitingId);
            assertThat(freshWindow)
                    .isEqualTo(LocalDate.now().plusDays(3) + "T00:00:00.000Z");

            // 递补出的 HELD 继续占用副本：total 1、无借出、1 HELD → 可借 0
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + tokenFor("admin")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    private int borrowIdOf(MvcResult result) throws Exception {
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("id").asInt();
    }

    private int reserveIdOf(MvcResult result) throws Exception {
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("id").asInt();
    }

    private ResultActions borrow(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    private ResultActions reserve(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/reservations")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    private void insertBorrow(int readerId, int bookId) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "status) VALUES (?, ?, ?, ?, 'BORROWED')",
                readerId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z",
                LocalDate.now().plusDays(7) + "T00:00:00.000Z");
    }

    private int insertReservation(int readerId, int bookId, String status, String holdExpiresAt) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                        + "VALUES (?, ?, ?, ?)", readerId, bookId, status, holdExpiresAt);
        return jdbc.queryForObject(
                "SELECT id FROM reservations WHERE reader_id = ? AND book_id = ? AND status = ?",
                Integer.class, readerId, bookId, status);
    }

    private int createBook(int totalCopies) {
        String code = "B14V-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "预约生命周期验证书", "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    private int createReader() {
        String cardNo = "B14V-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, 'NORMAL')",
                cardNo, "预约生命周期验收读者");
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    private void cleanup(int bookId) {
        jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
        jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B14V-%");
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
