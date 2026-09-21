package com.crabcli.library.web;


import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * BE-B15 验收（Issue #130）：静态前端托管与同源收口。
 * <ul>
 *   <li>{@code GET /} 返回前端页（非 401/404）；</li>
 *   <li>页面同源 {@code fetch('/api/books')} 无 CORS——由同一 Spring Boot 实例
 *       托管静态页与 API 保证，服务端无任何 CORS 配置；</li>
 *   <li>静态资源匿名可取，{@code /api/**} 仍强制鉴权。</li>
 *   <li>前端页面落 {@code static/} 即生效——由 classpath 资源机制保证，
 *       服务端不感知具体页面文件。</li>
 * </ul>
 * 与 RbacMatrixTest 共用同一测试库与 Spring 上下文。
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:target/test-library.db")
@AutoConfigureMockMvc
class StaticHostingTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void rootServesFrontendPageAnonymously() throws Exception {
        // spring-test 的 mock forward 只记录转发目标、不渲染目标资源（正文与 Content-Type
        // 由真容器按 static/index.html 输出，真机验收 curl 自证）；此处证明：
        // 匿名打 / 不被安全链拦截（非 401/404）且 welcome 映射转发到 index.html
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("index.html"));
    }

    @Test
    void indexHtmlServesAnonymously() throws Exception {
        mockMvc.perform(get("/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/html"));
    }

    @Test
    void staticSharedJsRemainsAnonymous() throws Exception {
        // 静态路径匿名可取（RbacMatrixTest 同款回归，此处作为 #130 验收口径一并自证）
        mockMvc.perform(get("/js/api.js"))
                .andExpect(status().isOk());
    }

    @Test
    void deliveredLoginPageServesAnonymously() throws Exception {
        // WEB-1（#132）交付 login.html：页面路径不因安全链 401，落进 static/ 即刻匿名可达
        mockMvc.perform(get("/login.html"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/html"));
    }

    @Test
    void futurePagesInStaticRootAreNotAuthBlocked() throws Exception {
        // WEB-2~8 页面（如 my.html）尚未交付：文件未落地按 404 呈现而非 401——静态路径
        // 不被安全链拦截（#130 验收第 4 条），页面落进 static/ 后即刻匿名可达，无需改后端
        mockMvc.perform(get("/my.html"))
                .andExpect(status().isNotFound());
    }

    @Test
    void apiBooksStillRequiresAuthentication() throws Exception {
        // 红线：放行静态路径与根路径，/api/** 不放松——未登录打 API 仍 401
        mockMvc.perform(get("/api/books"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }
}
