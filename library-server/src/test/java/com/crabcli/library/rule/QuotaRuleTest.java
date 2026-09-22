package com.crabcli.library.rule;

import static org.hamcrest.Matchers.containsString;
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
 * BE-B14 / Issue #129：F3 配额规则套件。在既有先例（web/BorrowControllerTest 以
 * SQL 填充配额、service/AvailableCopiesServiceTest 口径自证）之上聚焦缺口：
 * <ul>
 *   <li>配额边界走全 API 正向链路：普通读者恰好第 3 本借出成功、第 4 本 409
 *       QUOTA_EXCEEDED（先例 fillQuota 用 SQL 插行，未证 API 连借到上限）；
 *       教师恰好第 6 本成功、第 7 本 409（maxBorrow=6，data.sql 播种）；</li>
 *   <li>借书校验链的读者状态 / 书状态两闸：已注销借书 409 READER_INACTIVE、
 *       下架借书 409 BOOK_WITHDRAWN（顺序契约定稿由 BorrowControllerTest
 *       orderInactiveBeforeWithdrawn 等已证，此处不重复）。</li>
 * </ul>
 * 与其他 IT 共用同一测试库：书号 / 证号带 nanoTime 后缀自建自清，配额基线
 * 全部用自建读者（不依赖种子 R0001 的在借数为 0）。清理按 B14Q 前缀删。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class QuotaRuleTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void normalExactThirdBorrowSucceedsFourthIs409QuotaExceeded() throws Exception {
        int readerId = createReader("NORMAL");
        int[] books = {createBook(1), createBook(1), createBook(1), createBook(1)};
        try {
            // 恰好借满 3 本（maxBorrow=3）：第 1-3 本逐本 201
            for (int i = 0; i < 3; i++) {
                borrow(readerId, books[i]).andExpect(status().isCreated());
            }

            // 第 4 本 409，文案含实时读数「最多借 3 本」（F11 参数化，BorrowRuleValidator:84-89）
            borrow(readerId, books[3])
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                    .andExpect(jsonPath("$.message", containsString("最多借 3 本")));
        } finally {
            cleanup(books);
        }
    }

    @Test
    void teacherExactSixthBorrowSucceedsSeventhIs409QuotaExceeded() throws Exception {
        int readerId = createReader("TEACHER");
        int[] books = new int[7];
        for (int i = 0; i < books.length; i++) {
            books[i] = createBook(1);
        }
        try {
            // 恰好借满 6 本（maxBorrow=6）：第 1-6 本逐本 201，配额按读者类型参数化
            for (int i = 0; i < 6; i++) {
                borrow(readerId, books[i]).andExpect(status().isCreated());
            }

            // 第 7 本才 409
            borrow(readerId, books[6])
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                    .andExpect(jsonPath("$.message", containsString("最多借 6 本")));
        } finally {
            cleanup(books);
        }
    }

    @Test
    void inactiveReaderBorrowIs409ReaderInactive() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            jdbc.update("UPDATE readers SET status = 'INACTIVE' WHERE id = ?", readerId);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("READER_INACTIVE"))
                    .andExpect(jsonPath("$.message", containsString("已注销")));
        } finally {
            cleanup(new int[]{bookId});
        }
    }

    @Test
    void withdrawnBookBorrowIs409BookWithdrawn() throws Exception {
        int readerId = createReader("NORMAL");
        int bookId = createBook(1);
        try {
            jdbc.update("UPDATE books SET status = 'WITHDRAWN' WHERE id = ?", bookId);
            borrow(readerId, bookId)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("BOOK_WITHDRAWN"));
        } finally {
            cleanup(new int[]{bookId});
        }
    }

    private ResultActions borrow(int readerId, int bookId) throws Exception {
        return mockMvc.perform(post("/api/borrows")
                        .header("Authorization", "Bearer " + tokenFor("admin"))
                        .contentType("application/json")
                        .content("{\"readerId\":%d,\"bookId\":%d}".formatted(readerId, bookId)));
    }

    /** 建一本自建自清的书（bookCode 每次调用独立 nanoTime 后缀），返回 id。 */
    private int createBook(int totalCopies) {
        String code = "B14Q-" + System.nanoTime();
        int categoryId = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                        + "VALUES (?, ?, ?, ?, ?)",
                code, "配额规则验证书", "测试作者", categoryId, totalCopies);
        return jdbc.queryForObject("SELECT id FROM books WHERE book_code = ?", Integer.class, code);
    }

    /** 建一个自建自清的读者（cardNo 带 B14Q 前缀，清理按前缀删）。 */
    private int createReader(String typeCode) {
        String cardNo = "B14Q-" + System.nanoTime();
        jdbc.update("INSERT INTO readers (card_no, name, reader_type_code) VALUES (?, ?, ?)",
                cardNo, "配额规则验收读者", typeCode);
        return jdbc.queryForObject("SELECT id FROM readers WHERE card_no = ?", Integer.class, cardNo);
    }

    /** 清理本用例牵出的数据：借阅 / 预约按书删，书按 id 删，读者按 B14Q 前缀删。 */
    private void cleanup(int... bookIds) {
        for (int bookId : bookIds) {
            jdbc.update("DELETE FROM borrow_records WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM reservations WHERE book_id = ?", bookId);
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        }
        jdbc.update("DELETE FROM readers WHERE card_no LIKE ?", "B14Q-%");
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
