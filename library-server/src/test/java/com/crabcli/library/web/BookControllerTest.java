package com.crabcli.library.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * BE-B06 验收（Issue #121）：书籍管理 CRUD 与下架逐条自证。
 * <ul>
 *   <li>POST /api/books → 201 且 availableCopies=totalCopies，q 查询可见；</li>
 *   <li>POST /api/books/{id}/withdraw → 200 status=WITHDRAWN 且幂等；</li>
 *   <li>keywords 字符串数组往返不丢不串（含逗号等特殊字符）；</li>
 *   <li>重复 bookCode → 409 DUPLICATE_BOOK_CODE；q 命中 title/author/keywords；</li>
 *   <li>categoryId 不存在 → 400 VALIDATION_ERROR；分页 {items,total,page,size}。</li>
 * </ul>
 * 与其他测试共用同一测试库与 Spring 上下文：bookCode 全部带 nanoTime 后缀自建自清，
 * 断言一律走唯一前缀过滤，不依赖也不污染他类数据。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class BookControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void createBookIs201WithDerivedAvailabilityAndQueryable() throws Exception {
        String code = "B001-" + System.nanoTime();
        String title = "Java 入门-" + System.nanoTime();
        int categoryId = anyCategoryId();
        try {
            MvcResult created = mockMvc.perform(post("/api/books")
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("""
                                    {"bookCode":"%s","title":"%s","author":"张三",
                                     "categoryId":%d,"keywords":["Java","入门"],"totalCopies":2,
                                     "remark":"验收用书"}
                                    """.formatted(code, title, categoryId)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.bookCode").value(code))
                    .andExpect(jsonPath("$.status").value("ACTIVE"))
                    .andExpect(jsonPath("$.totalCopies").value(2))
                    // 验收口径：新建时 availableCopies=totalCopies
                    .andExpect(jsonPath("$.availableCopies").value(2))
                    .andReturn();

            int id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asInt();

            // 查询可见：按唯一书名过滤（q 契约口径命中 title）恰好 1 条
            mockMvc.perform(get("/api/books").param("q", title)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1))
                    .andExpect(jsonPath("$.items[0].id").value(id))
                    .andExpect(jsonPath("$.items[0].bookCode").value(code));
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code = ?", code);
        }
    }

    @Test
    void withdrawIsIdempotentAndPersists() throws Exception {
        String code = "W-" + System.nanoTime();
        try {
            int id = createBook(code, "下架验证书", "作者甲", 1, null);

            // 首次下架 → 200 status=WITHDRAWN
            mockMvc.perform(post("/api/books/" + id + "/withdraw")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(id))
                    .andExpect(jsonPath("$.status").value("WITHDRAWN"))
                    // 下架后不再可供借出
                    .andExpect(jsonPath("$.availableCopies").value(0));

            // 幂等：重复调仍 200 且状态不变
            mockMvc.perform(post("/api/books/" + id + "/withdraw")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("WITHDRAWN"));

            // 响应不是回声：已落库
            String persisted = jdbc.queryForObject(
                    "SELECT status FROM books WHERE id = ?", String.class, id);
            assertThat(persisted).isEqualTo("WITHDRAWN");
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code = ?", code);
        }
    }

    @Test
    void keywordsRoundTripLossless() throws Exception {
        String code = "K-" + System.nanoTime();
        List<String> keywords = List.of("C++", "机器学习", "带,逗号 与 空格 的关键词");
        try {
            int id = createBook(code, "关键词往返书", "作者乙", 2, keywords);

            MvcResult detail = mockMvc.perform(get("/api/books/" + id)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode body = objectMapper.readTree(detail.getResponse().getContentAsString());
            List<String> roundTripped = objectMapper.convertValue(
                    body.get("keywords"), new TypeReference<List<String>>() {
                    });
            // 往返不丢不串：数组逐元素一致（含逗号、空格、特殊字符）
            assertThat(roundTripped).containsExactlyElementsOf(keywords);

            // q 命中单个关键词
            mockMvc.perform(get("/api/books").param("q", "机器学习")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[?(@.id == " + id + ")]").isNotEmpty());
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code = ?", code);
        }
    }

    @Test
    void duplicateBookCodeIs409() throws Exception {
        String code = "DUP-" + System.nanoTime();
        try {
            createBook(code, "重复编号书", "作者丙", 1, null);
            mockMvc.perform(post("/api/books")
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("""
                                    {"bookCode":"%s","title":"再来一本","author":"作者丁",
                                     "categoryId":%d,"totalCopies":1}
                                    """.formatted(code, anyCategoryId())))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_BOOK_CODE"));
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code = ?", code);
        }
    }

    @Test
    void qMatchesTitleAuthorAndKeyword() throws Exception {
        String u = String.valueOf(System.nanoTime());
        try {
            createBook("Q1-" + u, "量子计算导论-" + u, "作者戊", 1, List.of("物理"));
            createBook("Q2-" + u, "普通书", "钱七-" + u, 1, List.of("化学"));
            createBook("Q3-" + u, "另一本书", "作者己", 1, List.of("信息论-" + u));

            // 命中 title
            mockMvc.perform(get("/api/books").param("q", "量子计算导论-" + u)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1));
            // 命中 author
            mockMvc.perform(get("/api/books").param("q", "钱七-" + u)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1));
            // 命中 keywords
            mockMvc.perform(get("/api/books").param("q", "信息论-" + u)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(1));
            // 无命中 → total 0
            mockMvc.perform(get("/api/books").param("q", "查无此书-" + u)
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(0))
                    .andExpect(jsonPath("$.items").isEmpty());
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code IN ('Q1-" + u + "','Q2-" + u + "','Q3-" + u + "')");
        }
    }

    @Test
    void unknownCategoryIdIs400Validation() throws Exception {
        mockMvc.perform(post("/api/books")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("""
                                {"bookCode":"NOPE-%d","title":"无类别书","author":"作者庚",
                                 "categoryId":999999,"totalCopies":1}
                                """.formatted(System.nanoTime())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("类别不存在：999999"));
    }

    @Test
    void createValidationRejectsBlanksAndZeroCopies() throws Exception {
        String token = adminToken();
        mockMvc.perform(post("/api/books")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"bookCode\":\"  \",\"title\":\"t\",\"author\":\"a\","
                                + "\"categoryId\":" + anyCategoryId() + ",\"totalCopies\":1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields[0].field").value("bookCode"));

        mockMvc.perform(post("/api/books")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"bookCode\":\"OK-" + System.nanoTime() + "\",\"title\":\"t\","
                                + "\"author\":\"a\",\"categoryId\":" + anyCategoryId()
                                + ",\"totalCopies\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields[0].field").value("totalCopies"));
    }

    @Test
    void paginationContract() throws Exception {
        String u = String.valueOf(System.nanoTime());
        try {
            // 书名带唯一后缀，q=u 以 title 命中（q 契约口径）圈定本用例数据
            createBook("P1-" + u, "分页书一-" + u, "作者辛", 1, null);
            createBook("P2-" + u, "分页书二-" + u, "作者壬", 1, null);

            mockMvc.perform(get("/api/books")
                            .param("q", u).param("page", "1").param("size", "1")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(2))
                    .andExpect(jsonPath("$.page").value(1))
                    .andExpect(jsonPath("$.size").value(1))
                    .andExpect(jsonPath("$.items.length()").value(1));

            mockMvc.perform(get("/api/books").param("q", u).param("page", "2").param("size", "1")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].bookCode").value("P1-" + u));

            // 越界分页参数 → 400（契约：page 从 1 起，size 上限 100）
            mockMvc.perform(get("/api/books").param("page", "0")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            mockMvc.perform(get("/api/books").param("size", "101")
                            .header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code IN ('P1-" + u + "','P2-" + u + "')");
        }
    }

    @Test
    void updatePartialKeepsUnmentionedFields() throws Exception {
        String code = "U-" + System.nanoTime();
        try {
            int id = createBook(code, "原书名", "原作者", 2, List.of("原关键词"));

            mockMvc.perform(put("/api/books/" + id)
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"title\":\"新书名\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.title").value("新书名"))
                    .andExpect(jsonPath("$.author").value("原作者"))
                    .andExpect(jsonPath("$.totalCopies").value(2))
                    .andExpect(jsonPath("$.keywords[0]").value("原关键词"));

            // 更新到不存在的类别 → 400
            mockMvc.perform(put("/api/books/" + id)
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"categoryId\":999999}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

            // 空更新体 → 400；非法值（0 册数、空白书名）→ 400
            mockMvc.perform(put("/api/books/" + id)
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            // 提供了空白书名 → 400（部分更新只在字段已提供时校验空白）
            mockMvc.perform(put("/api/books/" + id)
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"title\":\"   \"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
            mockMvc.perform(put("/api/books/" + id)
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"totalCopies\":0}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fields[0].field").value("totalCopies"));
        } finally {
            jdbc.update("DELETE FROM books WHERE book_code = ?", code);
        }
    }

    @Test
    void unknownBookIdIs404() throws Exception {
        String token = adminToken();
        mockMvc.perform(get("/api/books/999999").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"));
        mockMvc.perform(put("/api/books/999999")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"title\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"));
        mockMvc.perform(post("/api/books/999999/withdraw").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"));
    }

    /** 落一行合法书目，返回 id（keywords 传 null 即不填）。 */
    private int createBook(String code, String title, String author, int totalCopies,
                           List<String> keywords) throws Exception {
        String keywordsJson = keywords == null ? "null"
                : objectMapper.writeValueAsString(keywords);
        MvcResult created = mockMvc.perform(post("/api/books")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("""
                                        {"bookCode":"%s","title":"%s","author":"%s","categoryId":%d,
                                         "keywords":%s,"totalCopies":%d}
                                        """.formatted(code, title, author, anyCategoryId(),
                                keywordsJson, totalCopies)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asInt();
    }

    private int anyCategoryId() {
        Integer id = jdbc.queryForObject("SELECT MIN(id) FROM categories", Integer.class);
        assertThat(id).isNotNull();
        return id;
    }

    private String adminToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }
}
