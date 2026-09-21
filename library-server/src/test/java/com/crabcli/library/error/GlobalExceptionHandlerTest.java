package com.crabcli.library.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * BE-B02 验收（Issue #117）：ApiException 平铺透传、校验失败 400 + fields[]、
 * 未捕获异常 500 且响应体不回显堆栈/类名【安全】、/api/health 回归。
 * 与 LibrarySchemaTest 共用同一测试库与 Spring 上下文。
 * <p>BE-B03（Issue #118）落地安全链后 {@code /api/**} 需登录：探针请求改为携带
 * 真实登录所得 ADMIN token，安全链语义一并回归。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class GlobalExceptionHandlerTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void apiExceptionMapsToItsHttpStatusAndFlatBody() throws Exception {
        mockMvc.perform(post("/api/test-error-probe/api-exception")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BOOK_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("书籍不存在"))
                .andExpect(jsonPath("$.fields").doesNotExist());
    }

    @Test
    void validationErrorListsEachViolatedField() throws Exception {
        mockMvc.perform(post("/api/test-error-probe/validated")
                        .header("Authorization", "Bearer " + adminToken())
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("请求参数校验失败"))
                .andExpect(jsonPath("$.fields.length()").value(2))
                .andExpect(jsonPath("$.fields[?(@.field == 'title')].message").value("书名不能为空"))
                .andExpect(jsonPath("$.fields[?(@.field == 'copies')].message").value("册数不能为空"));
    }

    @Test
    void unexpectedExceptionReturnsSanitizedInternalServerError() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/test-error-probe/unexpected")
                        .header("Authorization", "Bearer " + adminToken()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message").value("服务器内部错误"))
                .andExpect(jsonPath("$.fields").doesNotExist())
                .andReturn();

        // 【安全】响应体不含异常类名、堆栈行、异常消息（内部细节）与 java.* 包名
        String body = result.getResponse().getContentAsString();
        assertThat(body)
                .doesNotContain("IllegalStateException")
                .doesNotContain("模拟未捕获异常")
                .doesNotContain("java.lang")
                .doesNotContain("\tat ");
    }

    @Test
    void healthEndpointStillUp() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    private String adminToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return JsonPath.read(result.getResponse().getContentAsString(), "$.token");
    }
}
