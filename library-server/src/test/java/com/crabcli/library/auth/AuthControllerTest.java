package com.crabcli.library.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
 * BE-B03 验收第 2/3 条：登录契约、bcrypt 凭据、防枚举统一 401、
 * {@code /api/auth/me}。与 GlobalExceptionHandlerTest 共用同一测试库与 Spring 上下文。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;
    @Autowired
    JdbcTemplate jdbc;

    @Test
    void adminLoginReturnsContractShapeWithoutReaderId() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.expiresIn").value(7200))
                .andExpect(jsonPath("$.user.userId").isNumber())
                .andExpect(jsonPath("$.user.username").value("admin"))
                .andExpect(jsonPath("$.user.role").value("ADMIN"))
                .andExpect(jsonPath("$.user.displayName").value("系统管理员"))
                .andExpect(jsonPath("$.user.readerId").value(nullValue()));
    }

    @Test
    void readerLoginCarriesLinkedReaderId() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"reader01\",\"password\":\"reader123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("READER"))
                .andExpect(jsonPath("$.user.readerId").value(notNullValue()))
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("user").get("readerId").asInt()).isPositive();
    }

    @Test
    void wrongPasswordAndUnknownUserShareIdenticalBody() throws Exception {
        // 【安全·防枚举】两种失败完全同体：同 code 同 message
        String wrongPassword = loginBody("admin", "no-such-password");
        String unknownUser = loginBody("ghost-user", "whatever");
        assertThat(unknownUser).isEqualTo(wrongPassword);

        JsonNode node = objectMapper.readTree(wrongPassword);
        assertThat(node.get("code").asText()).isEqualTo("AUTH_INVALID_CREDENTIALS");
        assertThat(node.get("message").asText()).isEqualTo("用户名或密码错误");
    }

    @Test
    void disabledAccountCannotLogin() throws Exception {
        // 直接在库层停用再恢复：账号 DISABLED 与凭据错误同响应（不泄露账号状态）
        jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE username = 'reader01'");
        try {
            mockMvc.perform(post("/api/auth/login")
                            .contentType("application/json")
                            .content("{\"username\":\"reader01\",\"password\":\"reader123\"}"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_INVALID_CREDENTIALS"))
                    .andExpect(jsonPath("$.message").value("用户名或密码错误"));
        } finally {
            jdbc.update("UPDATE app_users SET status = 'ACTIVE' WHERE username = 'reader01'");
        }
    }

    @Test
    void meReturnsCurrentLoginUser() throws Exception {
        String token = login("reader01", "reader123");
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("reader01"))
                .andExpect(jsonPath("$.role").value("READER"))
                .andExpect(jsonPath("$.displayName").value("张小明"))
                .andExpect(jsonPath("$.readerId").isNumber());
    }

    @Test
    void meWithoutTokenIs401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void blankCredentialsFailValidation() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"\",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private String login(String username, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private String loginBody(String username, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andReturn();
        return result.getResponse().getContentAsString();
    }
}
