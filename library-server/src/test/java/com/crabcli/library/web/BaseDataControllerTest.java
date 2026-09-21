package com.crabcli.library.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * BE-B04 验收（Issue #119）：基础数据维护端点逐条自证。
 * <ul>
 *   <li>GET /api/reader-types 非分页 {items:[...]} 含 maxBorrow/loanWeeks；</li>
 *   <li>PUT /api/reader-types/NORMAL {maxBorrow:5} → 200，DB 读数立即变 5
 *       （F11 参数化：借阅业务 #123 起每次经仓储实时读取，无缓存可绕）；</li>
 *   <li>类别 CRUD + 重复名 409 DUPLICATE_CATEGORY + 被引用删除 409 CATEGORY_IN_USE。</li>
 * </ul>
 * 与 RbacMatrixTest 等共用同一测试库与 Spring 上下文：只动自建数据，
 * NORMAL 配额在 finally 恢复 3，不删除种子类别（LibrarySchemaTest 断言 >= 6）。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class BaseDataControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void getReaderTypesReturnsSeededQuotasNonPaged() throws Exception {
        mockMvc.perform(get("/api/reader-types").header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                // 非分页：只有 items 键，无 page/total 等分页字段
                .andExpect(jsonPath("$.page").doesNotExist())
                .andExpect(jsonPath("$.total").doesNotExist())
                .andExpect(jsonPath("$.items[?(@.code == 'NORMAL')].maxBorrow").value(3))
                .andExpect(jsonPath("$.items[?(@.code == 'NORMAL')].loanWeeks").value(4))
                .andExpect(jsonPath("$.items[?(@.code == 'TEACHER')].maxBorrow").value(6))
                .andExpect(jsonPath("$.items[?(@.code == 'TEACHER')].loanWeeks").value(8));
    }

    @Test
    void putQuotaTakesEffectImmediatelyF11() throws Exception {
        try {
            // 验收用例：只传 maxBorrow，loanWeeks 保持 4
            mockMvc.perform(put("/api/reader-types/NORMAL")
                            .header("Authorization", "Bearer " + adminToken())
                            .contentType("application/json")
                            .content("{\"maxBorrow\":5}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value("NORMAL"))
                    .andExpect(jsonPath("$.maxBorrow").value(5))
                    .andExpect(jsonPath("$.loanWeeks").value(4));

            // F11「业务读数立即变 5」：响应不是回声，持久层已变更——
            // 借阅业务（#123 起）每次经 ReaderTypeRepository 实时读取的就是这行
            Integer persisted = jdbc.queryForObject(
                    "SELECT max_borrow FROM reader_types WHERE code = 'NORMAL'", Integer.class);
            assertThat(persisted).isEqualTo(5);

            // GET 立即反映新配额，无需重启
            mockMvc.perform(get("/api/reader-types").header("Authorization", "Bearer " + adminToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[?(@.code == 'NORMAL')].maxBorrow").value(5));
        } finally {
            jdbc.update("UPDATE reader_types SET max_borrow = 3 WHERE code = 'NORMAL'");
        }
    }

    @Test
    void putUnknownReaderTypeIs404() throws Exception {
        mockMvc.perform(put("/api/reader-types/NOPE")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"maxBorrow\":5}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("READER_TYPE_NOT_FOUND"));
    }

    @Test
    void putNonPositiveQuotaIs400WithFieldErrors() throws Exception {
        mockMvc.perform(put("/api/reader-types/NORMAL")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"maxBorrow\":0,\"loanWeeks\":-1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields.length()").value(2));
        // 校验失败必须拦在更新前：NORMAL 仍是种子值 3
        assertThat(quotaOfNormal()).isEqualTo(3);
    }

    @Test
    void putEmptyUpdateBodyIs400() throws Exception {
        mockMvc.perform(put("/api/reader-types/NORMAL")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        assertThat(quotaOfNormal()).isEqualTo(3);
    }

    @Test
    void postCategoryBlankNameIs400() throws Exception {
        mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fields[0].field").value("name"));
    }

    @Test
    void malformedBodyAndBadPathVarAre400Not500() throws Exception {
        // 非法 JSON 与非数字路径参数是客户端错误，不得落 500 INTERNAL_ERROR
        mockMvc.perform(put("/api/reader-types/NORMAL")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{oops"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        mockMvc.perform(delete("/api/categories/abc").header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void categoryCrudRoundTripWithDuplicateGuard() throws Exception {
        String token = adminToken();
        String name = "基数据测试类别-" + System.nanoTime();

        // POST 新建 → 200 且带 id
        MvcResult created = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value(name))
                .andReturn();
        int id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asInt();

        try {
            // GET 列表出现新类别
            mockMvc.perform(get("/api/categories").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[?(@.id == " + id + ")].name").value(name));

            // 重复类别名 → 409 DUPLICATE_CATEGORY
            mockMvc.perform(post("/api/categories")
                            .header("Authorization", "Bearer " + token)
                            .contentType("application/json")
                            .content("{\"name\":\"" + name + "\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_CATEGORY"));

            // 重命名 → 200
            String renamed = name + "-改";
            mockMvc.perform(put("/api/categories/" + id)
                            .header("Authorization", "Bearer " + token)
                            .contentType("application/json")
                            .content("{\"name\":\"" + renamed + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value(renamed));

            // 重命名为既有他类名 → 409
            mockMvc.perform(put("/api/categories/" + id)
                            .header("Authorization", "Bearer " + token)
                            .contentType("application/json")
                            .content("{\"name\":\"计算机技术\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("DUPLICATE_CATEGORY"));

            // 重命名为自身当前名 → 200（排除自身的唯一性判据）
            mockMvc.perform(put("/api/categories/" + id)
                            .header("Authorization", "Bearer " + token)
                            .contentType("application/json")
                            .content("{\"name\":\"" + renamed + "\"}"))
                    .andExpect(status().isOk());
        } finally {
            jdbc.update("DELETE FROM categories WHERE id = ?", id);
        }
    }

    @Test
    void deleteReferencedCategoryIs409AndUnblockedAfterReferenceRemoved() throws Exception {
        String token = adminToken();
        String name = "被引用类别-" + System.nanoTime();
        MvcResult created = mockMvc.perform(post("/api/categories")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        int id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asInt();

        Integer bookId = null;
        try {
            // 直接落一行 books（表由 schema.sql:54 建立；书籍业务属 #121），
            // 模拟「类别被书籍引用」的真实外键关系
            jdbc.update("INSERT INTO books (book_code, title, author, category_id, total_copies) "
                    + "VALUES (?, ?, ?, ?, ?)", "TEST-" + System.nanoTime(), "测试书", "测试作者", id, 1);
            bookId = jdbc.queryForObject(
                    "SELECT id FROM books WHERE category_id = ?", Integer.class, id);

            mockMvc.perform(delete("/api/categories/" + id).header("Authorization", "Bearer " + token))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("CATEGORY_IN_USE"));

            // 引用解除后删除成功（409 是实时判据，不是一次性快照）
            jdbc.update("DELETE FROM books WHERE id = ?", bookId);
            mockMvc.perform(delete("/api/categories/" + id).header("Authorization", "Bearer " + token))
                    .andExpect(status().isNoContent());
        } finally {
            if (bookId != null) {
                jdbc.update("DELETE FROM books WHERE id = ?", bookId);
            }
            jdbc.update("DELETE FROM categories WHERE id = ?", id);
        }
    }

    @Test
    void deleteUnknownCategoryIs404() throws Exception {
        mockMvc.perform(delete("/api/categories/999999")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CATEGORY_NOT_FOUND"));
    }

    @Test
    void getWithoutTokenIs401() throws Exception {
        // 读操作保持 authenticated（#118 矩阵口径），匿名访问统一 401
        mockMvc.perform(get("/api/categories"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    private Integer quotaOfNormal() {
        return jdbc.queryForObject(
                "SELECT max_borrow FROM reader_types WHERE code = 'NORMAL'", Integer.class);
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
