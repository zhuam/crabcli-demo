package com.crabcli.library.rule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/**
 * BE-B14 / Issue #129：F10 鉴权与越权套件。先例 auth/RbacMatrixTest 已证安全链
 * 矩阵（放行面以边界 400 证明），本套件按验收清单补足<strong>真实业务动作</strong>
 * 的授权证据与 READER 自助面的服务端收权：
 * <ul>
 *   <li>F10 四条：无 token 401 UNAUTHENTICATED；READER 写借阅 403 FORBIDDEN；
 *       <strong>馆员真实借出 + 归还</strong>（201/200 全链路，非 400 放行证明）；
 *       <strong>管理员真实修改基础数据</strong>（PUT reader-types 改后 finally 还原，
 *       先例同款）；</li>
 *   <li>READER 越权：查他人 borrows 403（服务层归属校验，BorrowQueryService:53-54）；
 *       查 reservations 403（安全链把 /api/reservations/** 收给馆员/管理员，
 *       SecurityConfig:85——服务端不存在「只看他人」的口子，整体 403 即收权形态）；
 *       取消他人预约 403（服务层归属校验，ReservationService:99-102）；取消本人
 *       预约 200（SecurityConfig:82-83 例外放行 + 归属校验通过）。</li>
 * </ul>
 * 读者 / 书自建自清（B14A 前缀）；reader01 只读其 reader_id（种子约定，与
 * ReservationControllerTest 同款），reader_types 改动 finally 还原。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthRbacTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void noTokenOnBorrowsIs401Unauthenticated() throws Exception {
        mockMvc.perform(get("/api/borrows"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.message").value("未登录或登录凭证无效"));
    }

    @Test
    void readerBorrowWriteIs403Forbidden() throws Exception {
        mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("reader01"))
                        .contentType("application/json")
                        .content("{\"readerId\":1,\"bookId\":1}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value("没有操作权限"));
    }

    @Test
    void librarianCanBorrowAndReturnEndToEnd() throws Exception {
        int readerId = createReader();
        int bookId = createBook(1);
        try {
            String librarianToken = tokenFor("librarian");

            // 馆员真实借出：201 全链路（非 400 放行证明）
            MvcResult result = mockMvc.perform(post("/api/borrows")
                            .header("Authorization", "Bearer " + librarianToken)
                            .contentType("application/json")
                            .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.status").value("BORROWED"))
                    .andReturn();
            int borrowId = objectMapper.readTree(result.getResponse().getContentAsString())
                    .get("id").asInt();

            // 馆员真实归还：200 RETURNED
            mockMvc.perform(post("/api/borrows/" + borrowId + "/return")
                            .header("Authorization", "Bearer " + librarianToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("RETURNED"));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void adminCanModifyBaseDataRealChangeRestoredAfterwards() throws Exception {
        Integer original = jdbc.queryForObject(
                "SELECT max_borrow FROM reader_types WHERE code = 'NORMAL'", Integer.class);
        try {
            // 管理员真实改基础数据：maxBorrow +1 写穿 鉴权 → 校验 → UPDATE → 持久层
            mockMvc.perform(put("/api/reader-types/NORMAL")
                            .header("Authorization", "Bearer " + tokenFor("admin"))
                            .contentType("application/json")
                            .content("{\"maxBorrow\":%d}".formatted(original + 1)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value("NORMAL"))
                    .andExpect(jsonPath("$.maxBorrow").value(original + 1));
            Integer persisted = jdbc.queryForObject(
                    "SELECT max_borrow FROM reader_types WHERE code = 'NORMAL'", Integer.class);
            assertThat(persisted).isEqualTo(original + 1);
        } finally {
            // 先例同款：finally 还原种子配置，测试不论成败零残留
            jdbc.update("UPDATE reader_types SET max_borrow = ? WHERE code = 'NORMAL'", original);
        }
    }

    @Test
    void readerQueryOthersBorrowsIs403() throws Exception {
        int otherReaderId = createReader();
        try {
            // 服务端强制本人可见：显式传他人 readerId → 403（token.readerId 为准）
            mockMvc.perform(get("/api/borrows?readerId=" + otherReaderId)
                            .header("Authorization", "Bearer " + tokenFor("reader01")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                    .andExpect(jsonPath("$.message", containsString("本人")));
        } finally {
            cleanup();
        }
    }

    @Test
    void readerListReservationsIsScopedToSelf() throws Exception {
        // WEB-8 / #139 契约翻转：GET /api/reservations 放行至 authenticated，READER
        // 由服务层钉定 readerId——缺省即本人（200），显式传他人 readerId → 403 FORBIDDEN
        // （旧契约「READER 整体 403」随自助页交付废止，SecurityConfig 例外注释同步）
        mockMvc.perform(get("/api/reservations")
                        .header("Authorization", "Bearer " + tokenFor("reader01")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/reservations")
                        .header("Authorization", "Bearer " + tokenFor("reader01"))
                        .param("readerId", "999999"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void readerCancelOthersReservationIs403() throws Exception {
        int otherReaderId = createReader();
        int bookId = createBook(1);
        try {
            int reservationId = insertReservation(otherReaderId, bookId, "WAITING");

            mockMvc.perform(post("/api/reservations/" + reservationId + "/cancel")
                            .header("Authorization", "Bearer " + tokenFor("reader01")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                    .andExpect(jsonPath("$.message", containsString("本人")));
        } finally {
            cleanup(bookId);
        }
    }

    @Test
    void readerCancelOwnReservationIs200Cancelled() throws Exception {
        int occupierId = createReader();
        int bookId = createBook(1);
        try {
            // 唯一副本被占 → seed 读者（reader01 档案）可排队预约
            insertBorrow(occupierId, bookId);
            int reservationId = insertReservation(seedReaderId(), bookId, "WAITING");

            // 本人取消：SecurityConfig 例外放行 + 服务层归属校验通过 → 200
            mockMvc.perform(post("/api/reservations/" + reservationId + "/cancel")
                            .header("Authorization", "Bearer " + tokenFor("reader01")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CANCELLED"));
        } finally {
            cleanup(bookId);
        }
    }

    private void insertBorrow(int readerId, int bookId) {
        jdbc.update("INSERT INTO borrow_records (reader_id, book_id, borrowed_at, due_at, "
                        + "status) VALUES (?, ?, ?, ?, 'BORROWED')",
                readerId, bookId, LocalDate.now().minusDays(1) + "T00:00:00.000Z",
                LocalDate.now().plusDays(7) + "T00:00:00.000Z");
    }

    private int insertReservation(int readerId, int bookId, String status) {
        jdbc.update("INSERT INTO reservations (reader_id, book_id, status, hold_expires_at) "
                        + "VALUES (?, ?, ?, ?)", readerId, bookId, status, null);
        return jdbc.queryForObject(
                "SELECT id FROM reservations WHERE reader_id = ? AND book_id = ? AND status = ?",
                Integer.class, readerId, bookId, status);
    }

    private int createBook(int totalCopies) {
        String code = "B14A-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "鉴权越权验证书", "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    private int createReader() {
        String cardNo = "B14A-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, 'NORMAL')",
                cardNo, "鉴权越权验收读者");
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    /** reader01 账号关联的读者档案 id（种子 R0001，只读不改）。 */
    private int seedReaderId() {
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = 'R0001'", Integer.class);
    }

    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B14A-%");
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
