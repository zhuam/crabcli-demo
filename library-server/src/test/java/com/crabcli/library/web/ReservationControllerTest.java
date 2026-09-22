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
 * BE-B09 验收（Issue #124）：预约全流程与 3 天保留结算。
 * <ul>
 *   <li>建预约 201：馆藏全借出（availableCopies=0）→ WAITING、queuePosition=1，
 *       第二位排队 queuePosition=2；</li>
 *   <li>409 契约逐码：RESERVATION_NOT_ALLOWED（含「可借」）/ DUPLICATE_RESERVATION /
 *       ALREADY_BORROWED / READER_INACTIVE；校验链顺序（读者状态 → 读者-书关系 →
 *       书副本）：已借 + 有可借副本同违 → ALREADY_BORROWED；</li>
 *   <li>取消：WAITING → CANCELLED；HELD → CANCELLED 且释放副本、递补下一位 WAITING
 *       （新 3 天保留窗口）；终态再取消 → RESERVATION_NOT_ACTIVE（含「已失效」）；</li>
 *   <li>READER 取消本人 200，取消他人 403 FORBIDDEN（契约定稿第 10 项）；</li>
 *   <li>惰性结算 [假设 B6]：GET /api/reservations 入口先 sweep——过期 HELD → EXPIRED
 *       副本回池（availableCopies +1），队首 WAITING 递补 HELD；</li>
 *   <li>缺失引用 404；请求体缺字段 400；READER 建预约 403。</li>
 * </ul>
 * 与其他 IT 共用同一测试库与 Spring 上下文：书号 / 证号带 nanoTime 后缀自建自清，
 * 种子读者 R0001（reader01 关联档案）只读不改动，自建读者 cardNo 恒带 B09T 前缀。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class ReservationControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    private final String unique = String.valueOf(System.nanoTime());

    @Test
    void fullyBorrowedBookAllowsReservation201WaitingQueuePosition1() throws Exception {
        int readerId = seedReaderId();
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            MvcResult result = reserve(readerId, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("WAITING"))
                    .andExpect(jsonPath("$.queuePosition").value(1))
                    .andExpect(jsonPath("$.holdExpiresAt").isEmpty())
                    .andReturn();
            JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());

            // 落库且为 WAITING（HELD 占用子查询不含 WAITING，可借副本已为 0 的前提不受影响）
            String statusInDb = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class,
                    body.get("id").asInt());
            assertThat(statusInDb).isEqualTo("WAITING");
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void secondWaitingReservationGetsQueuePosition2() throws Exception {
        int firstReaderId = seedReaderId();
        int secondReaderId = createReader();
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            reserve(firstReaderId, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.queuePosition").value(1));
            reserve(secondReaderId, bookId)
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.queuePosition").value(2));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void availableCopyRejectsWithReservationNotAllowed() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(2);
        try {
            reserve(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RESERVATION_NOT_ALLOWED"))
                    .andExpect(jsonPath("$.message", containsString("可借")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void duplicateReservationRejected() throws Exception {
        int readerId = seedReaderId();
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            reserve(readerId, bookId).andExpect(status().isCreated());
            reserve(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_RESERVATION"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void alreadyBorrowedRejected() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(1);
        try {
            // 读者本人借走唯一副本 → availableCopies=0 且已有在借 → ALREADY_BORROWED
            occupyOnlyCopy(readerId, bookId);
            reserve(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ALREADY_BORROWED"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void alreadyBorrowedWinsOverNotAllowed() throws Exception {
        int readerId = seedReaderId();
        int bookId = createBook(2);
        try {
            // 已借该书且仍有可借副本同违 → 校验链「读者-书关系先于书副本」
            insertBorrow(readerId, bookId, LocalDate.now().plusDays(7), "BORROWED");
            reserve(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("ALREADY_BORROWED"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void inactiveReaderRejected() throws Exception {
        int readerId = createReader();
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            jdbc.update("UPDATE readers SET status = 'INACTIVE' WHERE id = ?", readerId);
            reserve(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_INACTIVE"))
                    .andExpect(jsonPath("$.message", containsString("已注销")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void cancelWaitingReturns200Cancelled() throws Exception {
        int readerId = seedReaderId();
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            int reservationId = reserveFor(readerId, bookId);
            cancel(reservationId, adminToken())
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CANCELLED"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void cancelHeldReleasesCopyAndPromotesNextWaiting() throws Exception {
        int heldReaderId = createReader();
        int waitingReaderId = createReader();
        int bookId = createBook(1);
        try {
            int heldId = insertReservation(heldReaderId, bookId, "HELD",
                    LocalDate.now().plusDays(3) + "T00:00:00.000Z");
            int waitingId = insertReservation(waitingReaderId, bookId, "WAITING", null);

            cancel(heldId, adminToken())
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CANCELLED"));

            // 递补：下一位 WAITING → HELD，新 3 天保留窗口（日历日），queuePosition 消失
            String promotedStatus = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, waitingId);
            String promotedHold = jdbc.queryForObject(
                    "SELECT hold_expires_at FROM reservations WHERE id = ?", String.class, waitingId);
            assertThat(promotedStatus).isEqualTo("HELD");
            assertThat(promotedHold).isNotNull();
            assertThat(promotedHold.substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(3).toString());

            // 副本属转移而非回池：原 HELD 取消、新 HELD 递补，可借副本仍为 0
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(0));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void cancelledReservationCannotBeCancelledAgain() throws Exception {
        int readerId = seedReaderId();
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            int reservationId = reserveFor(readerId, bookId);
            cancel(reservationId, adminToken()).andExpect(status().isOk());
            cancel(reservationId, adminToken())
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("RESERVATION_NOT_ACTIVE"))
                    .andExpect(jsonPath("$.message", containsString("已失效")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void readerCanCancelOwnReservation() throws Exception {
        int readerId = seedReaderId(); // reader01 账号关联 R0001
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            occupyOnlyCopy(occupierId, bookId);
            int reservationId = reserveFor(readerId, bookId);
            cancel(reservationId, tokenFor("reader01"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CANCELLED"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void readerCannotCancelOthersReservation() throws Exception {
        int otherReaderId = createReader();
        int bookId = createBook(1);
        try {
            int reservationId = insertReservation(otherReaderId, bookId, "WAITING", null);
            cancel(reservationId, tokenFor("reader01"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void cancelMissingReservationIs404() throws Exception {
        cancel(999999, adminToken())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESERVATION_NOT_FOUND"));
    }

    @Test
    void sweeperExpiresHeldOnListEntryAndReleasesCopy() throws Exception {
        int heldReaderId = createReader();
        int bookId = createBook(1);
        try {
            // 过期 HELD（3 天保留期已过）：GET 入口惰性结算 → EXPIRED、副本回池
            int heldId = insertReservation(heldReaderId, bookId, "HELD",
                    LocalDate.now().minusDays(1) + "T00:00:00.000Z");

            mockMvc.perform(get("/api/reservations?bookId=" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk());

            String settled = jdbc.queryForObject(
                    "SELECT status FROM reservations WHERE id = ?", String.class, heldId);
            assertThat(settled).isEqualTo("EXPIRED");
            mockMvc.perform(get("/api/books/" + bookId)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.availableCopies").value(1));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void sweeperPromotesNextWaitingAfterExpiry() throws Exception {
        int heldReaderId = createReader();
        int waitingReaderId = createReader();
        int bookId = createBook(1);
        try {
            insertReservation(heldReaderId, bookId, "HELD",
                    LocalDate.now().minusDays(1) + "T00:00:00.000Z");
            int waitingId = insertReservation(waitingReaderId, bookId, "WAITING", null);

            JsonNode rows = listReservations(bookId);
            JsonNode promoted = findById(rows, waitingId);
            assertThat(promoted.get("status").asText()).isEqualTo("HELD");
            assertThat(promoted.get("holdExpiresAt").asText().substring(0, 10))
                    .isEqualTo(LocalDate.now().plusDays(3).toString());
            assertThat(promoted.hasNonNull("queuePosition")).isFalse();
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void createWithMissingReaderOrBookIs404() throws Exception {
        int bookId = createBook(1);
        try {
            reserve(999999, bookId)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("READER_NOT_FOUND"));
            reserve(seedReaderId(), 999999)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void createWithMissingFieldsIs400Validation() throws Exception {
        mockMvc.perform(post("/api/reservations")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"bookId\":1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields[0].field").value("readerId"));
    }

    @Test
    void readerRoleCreateIs403Forbidden() throws Exception {
        mockMvc.perform(post("/api/reservations")
                        .header("Authorization", "Bearer " + tokenFor("reader01"))
                        .contentType("application/json")
                        .content("{\"readerId\":1,\"bookId\":1}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    // ---- 请求与数据构造 ----

    private ResultActions reserve(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/reservations")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    /** 建预约并返回 id（201 断言内置于调用方；此处信任成功路径）。 */
    private int reserveFor(int readerId, int bookId) throws Exception {
        MvcResult result = reserve(readerId, bookId)
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asInt();
    }

    private ResultActions cancel(int reservationId, String token) throws Exception {
        return mockMvc.perform(post("/api/reservations/" + reservationId + "/cancel")
                        .header("Authorization", "Bearer " + token));
    }

    private JsonNode listReservations(int bookId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/reservations?bookId=" + bookId)
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode findById(JsonNode rows, int id) {
        for (JsonNode row : rows) {
            if (row.get("id").asInt() == id) {
                return row;
            }
        }
        throw new AssertionError("reservation " + id + " not in list response");
    }

    /** 唯一副本被占用（due 在未来、不触发逾期）：availableCopies 归 0 的最小摆设。 */
    private void occupyOnlyCopy(int readerId, int bookId) {
        insertBorrow(readerId, bookId, LocalDate.now().plusDays(7), "BORROWED");
    }

    private void insertBorrow(int readerId, int bookId, LocalDate dueDate, String status) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, status) "
                        + "VALUES (?, ?, ?, ?, ?)",
                readerId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z",
                dueDate + "T00:00:00.000Z", status);
    }

    private int insertReservation(int readerId, int bookId, String status, String holdExpiresAt) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                        + "VALUES (?, ?, ?, ?)",
                readerId, bookId, status, holdExpiresAt);
        return jdbc.queryForObject(
                "SELECT id FROM reservations WHERE reader_id = ? AND book_id = ? AND status = ?",
                Integer.class, readerId, bookId, status);
    }

    /** 建一本自建自清的书（bookCode 每次调用独立 nanoTime 后缀），返回 id。 */
    private int createBook(int totalCopies) {
        String code = "B09-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "预约验证书-" + unique, "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个自建自清的读者（cardNo 带 B09T 前缀，清理按前缀删、永不触及种子 R0001）。 */
    private int createReader() {
        String cardNo = "B09T-" + unique + "-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "预约验收读者-" + unique, "NORMAL");
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
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B09T-" + unique + "%");
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
