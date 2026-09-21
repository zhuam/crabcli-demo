package com.crabcli.library.auth;

import static org.assertj.core.api.Assertions.assertThat;
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
 * BE-B03 验收第 1 条：三角色 401/403 鉴权矩阵，服务端强制。
 * <p>矩阵口径：
 * <ul>
 *   <li>无 token 打管理接口 → 401 UNAUTHENTICATED；</li>
 *   <li>READER 打馆员写接口 → 403 FORBIDDEN；</li>
 *   <li>LIBRARIAN 打馆员接口 → 通过鉴权（接口本体由 BE-B08 起交付，此处以放行到
 *       DispatcherServlet 后的 404 证明安全链放行）；</li>
 *   <li>ADMIN 打基础数据维护接口 → 通过鉴权；LIBRARIAN 打基础数据维护 → 403。</li>
 * </ul>
 * 与 GlobalExceptionHandlerTest 共用同一测试库与 Spring 上下文。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class RbacMatrixTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JwtService jwtService;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void noTokenOnManagedApiIs401Unauthenticated() throws Exception {
        mockMvc.perform(post("/api/books"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.message").value("未登录或登录凭证无效"));

        mockMvc.perform(get("/api/readers"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void garbageTokenIs401Unauthenticated() throws Exception {
        mockMvc.perform(post("/api/books").header("Authorization", "Bearer not.a.jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void readerPostBooksIs403Forbidden() throws Exception {
        mockMvc.perform(post("/api/books").header("Authorization", "Bearer " + tokenFor("reader01")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value("没有操作权限"));
    }

    @Test
    void librarianPostBorrowsPassesAuthChain() throws Exception {
        // 通过安全链后无控制器 → 404 NOT_FOUND（业务接口 BE-B08 / #123 交付）；
        // 非 401/403 即证明鉴权放行
        mockMvc.perform(post("/api/borrows").header("Authorization", "Bearer " + tokenFor("librarian")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void librarianPutReaderTypesIs403Forbidden() throws Exception {
        mockMvc.perform(put("/api/reader-types/NORMAL").header("Authorization", "Bearer " + tokenFor("librarian")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void adminPutReaderTypesPassesAuthChain() throws Exception {
        // BE-B04（#119）落地后端点已存在：空请求体在控制器边界被 400 拒——
        // 非 401/403 即证明 ADMIN 通过鉴权（原 404 断言只适用于端点未交付时）
        mockMvc.perform(put("/api/reader-types/NORMAL").header("Authorization", "Bearer " + tokenFor("admin")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void adminPostBooksPassesAuthChain() throws Exception {
        mockMvc.perform(post("/api/books").header("Authorization", "Bearer " + tokenFor("admin")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void disabledAccountTokenIsRejectedImmediately() throws Exception {
        String token = jwtService.issue(new LoginUser(3, "reader01", Role.READER, "张小明", 7));
        Integer before = statusOf("reader01");
        try {
            jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE username = 'reader01'");
            mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        } finally {
            jdbc.update("UPDATE app_users SET status = ? WHERE username = 'reader01'",
                    before == null ? "ACTIVE" : (before == 1 ? "ACTIVE" : "DISABLED"));
        }
        assertThat(statusOf("reader01")).isEqualTo(before);
    }

    @Test
    void staticSharedJsRemainsAnonymous() throws Exception {
        // #131 前端共享层落在 classpath static/：静态资源不因安全链引入而 401（回归）
        mockMvc.perform(get("/js/api.js"))
                .andExpect(status().isOk());
    }

    private String tokenFor(String username) throws Exception {
        String password = switch (username) {
            case "admin" -> "admin123";
            case "librarian" -> "lib123456";
            case "reader01" -> "reader123";
            default -> throw new IllegalArgumentException("未知测试账号 " + username);
        };
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }

    private Integer statusOf(String username) {
        return jdbc.queryForObject(
                "SELECT CASE status WHEN 'ACTIVE' THEN 1 WHEN 'DISABLED' THEN 0 END "
                        + "FROM app_users WHERE username = ?", Integer.class, username);
    }
}
