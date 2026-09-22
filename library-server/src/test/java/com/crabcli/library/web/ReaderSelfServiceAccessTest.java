package com.crabcli.library.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * WEB-8 / Issue #139：读者自助路由的放行与归属收权套件。SecurityConfig 对
 * PUT /api/borrows/&#42;/renew 与 GET /api/reservations 放行至 authenticated
 * （#124 预约取消同款例外），归属/隔离在服务层钉定：
 * <ul>
 *   <li>READER 续借本人借阅 → 200 且 renewCount 变 1（#126 规则链不变）；</li>
 *   <li>READER 续借他人借阅 → 403 FORBIDDEN「只能续借本人借阅」；</li>
 *   <li>READER 查预约：缺省即本人 / 显式本人 → 200；显式传他人 → 403 FORBIDDEN
 *       「只能查询本人预约」（镜像 BorrowQueryService 收权口径）；</li>
 *   <li>馆员列表权限回归：GET /api/reservations 对 LIBRARIAN 仍放行（例外
 *       只放宽 READER 场景，不收窄既有角色）。</li>
 * </ul>
 * 与其他 IT 共用同一测试库：读者 / 账号 / 书号带 W8S 前缀自建自清（不依赖种子）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReaderSelfServiceAccessTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    /** 读者账号（readerId + 登录用户名），账号密码复用 reader123 的哈希。 */
    private record ReaderAccount(int readerId, String username) {
    }

    @Test
    void readerRenewsOwnLoanSucceedsWithRenewCountOne() throws Exception {
        ReaderAccount account = createReaderWithAccount();
        int bookId = createBook();
        try {
            int borrowId = borrowViaApi(account.readerId(), bookId);

            mockMvc.perform(put("/api/borrows/" + borrowId + "/renew")
                            .header("Authorization", "Bearer " + tokenFor(account.username())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.renewCount").value(1));
        } finally {
            cleanup(account, bookId);
        }
    }

    @Test
    void readerRenewingForeignLoanIs403Forbidden() throws Exception {
        ReaderAccount owner = createReaderWithAccount();
        ReaderAccount other = createReaderWithAccount();
        int bookId = createBook();
        try {
            int borrowId = borrowViaApi(owner.readerId(), bookId);

            mockMvc.perform(put("/api/borrows/" + borrowId + "/renew")
                            .header("Authorization", "Bearer " + tokenFor(other.username())))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                    .andExpect(jsonPath("$.message").value("只能续借本人借阅"));
        } finally {
            cleanup(owner, bookId);
            cleanup(other);
        }
    }

    @Test
    void readerListsOwnReservationsAndForeignOnesAre403() throws Exception {
        ReaderAccount reader = createReaderWithAccount();
        ReaderAccount other = createReaderWithAccount();
        int bookId = createBook();
        try {
            // 预约前置：副本全部借出才可排队（RESERVATION_NOT_ALLOWED）——由 other 借出
            borrowViaApi(other.readerId(), bookId);
            reserveViaApi(reader.readerId(), bookId);

            // 缺省 readerId → 即本人；显式本人 → 200
            mockMvc.perform(get("/api/reservations")
                            .header("Authorization", "Bearer " + tokenFor(reader.username())))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].readerId").value(reader.readerId()));
            mockMvc.perform(get("/api/reservations")
                            .header("Authorization", "Bearer " + tokenFor(reader.username()))
                            .param("readerId", String.valueOf(reader.readerId())))
                    .andExpect(status().isOk());

            // 显式传他人 → 403 FORBIDDEN
            mockMvc.perform(get("/api/reservations")
                            .header("Authorization", "Bearer " + tokenFor(reader.username()))
                            .param("readerId", String.valueOf(other.readerId())))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        } finally {
            cleanup(reader, bookId);
            cleanup(other);
        }
    }

    @Test
    void librarianStillListsAllReservations() throws Exception {
        ReaderAccount reader = createReaderWithAccount();
        int bookId = createBook();
        try {
            // 该用例只回归馆员列表权限，预约行 SQL 直插（借出后再预约会 409 ALREADY_BORROWED）
            jdbc.update("INSERT INTO reservations (reader_id, book_id, status) VALUES (?, ?, 'WAITING')",
                    reader.readerId(), bookId);

            mockMvc.perform(get("/api/reservations")
                            .header("Authorization", "Bearer " + tokenFor("librarian")))
                    .andExpect(status().isOk());
        } finally {
            cleanup(reader, bookId);
        }
    }

    // ---- 造数 helpers（自建自清，W8S 前缀） ----

    private ReaderAccount createReaderWithAccount() {
        String suffix = Long.toHexString(System.nanoTime());
        String cardNo = "W8S-" + suffix;
        String username = "w8s_" + suffix;
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "自助权限验收读者", "NORMAL");
        int readerId = jdbc.queryForObject(
                "SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
        String hash = jdbc.queryForObject(
                "SELECT password_hash FROM app_users WHERE username = 'reader01'", String.class);
        jdbc.update("INSERT INTO app_users (username, password_hash, role, display_name, reader_id) "
                        + "VALUES (?, ?, 'READER', ?, ?)",
                username, hash, "自助权限验收账号", readerId);
        return new ReaderAccount(readerId, username);
    }

    private int createBook() {
        String code = "W8S-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "自助权限验证书", "测试作者", categoryId, 1);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    private int borrowViaApi(int readerId, int bookId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("id").asInt();
    }

    private void reserveViaApi(int readerId, int bookId) throws Exception {
        mockMvc.perform(post("/api/reservations")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)))
                .andExpect(status().isCreated());
    }

    private String tokenFor(String username) throws Exception {
        String password = username.startsWith("w8s_") || username.equals("reader01")
                ? "reader123" : ("admin".equals(username) ? "admin123" : "lib123456");
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}".formatted(username, password)))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    /** 清理本用例牵出的数据（账号 / 借阅 / 预约 / 书 / 读者，均按自建标识删）。 */
    private void cleanup(ReaderAccount account, int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM app_users WHERE username = ?", account.username());
        jdbc.update("DELETE FROM readers WHERE id = ?", account.readerId());
    }
}
