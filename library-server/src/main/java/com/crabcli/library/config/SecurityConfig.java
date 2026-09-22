package com.crabcli.library.config;

import com.crabcli.library.auth.JwtAuthFilter;
import com.crabcli.library.error.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.security.servlet.PathRequest;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * 安全链（BE-B03 / Issue #118）：无状态 JWT，权限在服务端强制。
 * <ul>
 *   <li>放行：{@code POST /api/auth/login}、{@code GET /api/health}；静态资源
 *       （css/js/images/webjars/favicon）与 static/ 根下 HTML 页面（含 welcome 页 /）
 *       匿名可取（前端托管收口 BE-B15 / #130）；</li>
 *   <li>管理写操作按角色收紧——基础数据维护（reader-types / categories / borrow-rules）
 *       仅 ADMIN；馆员业务（books / borrows / reservations / readers 的写操作）
 *       LIBRARIAN 或 ADMIN（例外：预约取消路由 POST /api/reservations/&#42;/cancel
 *       放行至 authenticated，READER 取消本人预约由服务层校验归属，#124）；</li>
 *   <li>读操作暂统一 authenticated，自助查询场景（#127 借阅查询、WEB-8 自助页）
 *       由后续 issue 按需收紧或定向放行；</li>
 *   <li>401 / 403 直接以统一错误体 {@code {"code","message"}} 落响应——过滤器层
 *       不经过 {@code GlobalExceptionHandler}，此处必须自行写出同形错误体。</li>
 * </ul>
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthFilter jwtAuthFilter,
                                            ObjectMapper objectMapper) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .requestMatchers("/api/health").permitAll()
                        // #131 前端共享层已在 classpath static/ 下：静态资源匿名可取（托管收口归 BE-B15 / #130）
                        .requestMatchers(PathRequest.toStaticResources().atCommonLocations()).permitAll()
                        // #130 托管收口：welcome 页（/ 转发 static/index.html）与 static/ 根下 HTML 页面
                        // 匿名可取，WEB-1~WEB-8 产出的页面直接落 static/ 即生效、无需改后端。
                        // PathRequest 的 COMMON 清单只覆盖 css/js/images/webjars/favicon，
                        // 不含根路径与 .html（PathPattern 也不支持 /**/*.html 中段 **）
                        .requestMatchers("/", "/*.html").permitAll()
                        // 容器错误页转发（ERROR dispatch）不再过授权，避免 404 被二次拦成 401
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        // 基础数据维护（#119）：仅 ADMIN
                        .requestMatchers(HttpMethod.POST, "/api/reader-types/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/reader-types/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/reader-types/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/categories/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/categories/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/categories/**").hasRole("ADMIN")
                        .requestMatchers("/api/borrow-rules/**").hasRole("ADMIN")
                        // 馆员业务写操作：LIBRARIAN 或 ADMIN
                        .requestMatchers(HttpMethod.POST, "/api/books/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/books/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/books/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/borrows/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/borrows/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        // 预约取消（BE-B09 / #124，契约定稿第 10 项）：READER 可取消本人预约，
                        // 归属校验在服务层（ReservationService#cancel）；须先于下方 blanket 规则命中
                        .requestMatchers(HttpMethod.POST, "/api/reservations/*/cancel")
                        .authenticated()
                        .requestMatchers("/api/readers/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        .requestMatchers("/api/reservations/**").hasAnyRole("LIBRARIAN", "ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(unauthenticated(objectMapper))
                        .accessDeniedHandler(forbidden(objectMapper)))
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /**
     * JwtAuthFilter 以 @Component 注册后会被 Boot 同时挂到容器全局过滤链，
     * 显式关闭该注册，保证每个请求只走安全链里这一份。
     */
    @Bean
    FilterRegistrationBean<JwtAuthFilter> jwtAuthFilterRegistration(JwtAuthFilter jwtAuthFilter) {
        FilterRegistrationBean<JwtAuthFilter> registration = new FilterRegistrationBean<>(jwtAuthFilter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** 未认证（无 token / token 非法或过期 / 账号已停用）→ 401 UNAUTHENTICATED。 */
    private AuthenticationEntryPoint unauthenticated(ObjectMapper objectMapper) {
        return (request, response, ex) ->
                writeFlatError(response, objectMapper,
                        HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "未登录或登录凭证无效");
    }

    /** 已认证但角色不足 → 403 FORBIDDEN。 */
    private AccessDeniedHandler forbidden(ObjectMapper objectMapper) {
        return (request, response, ex) ->
                writeFlatError(response, objectMapper,
                        HttpStatus.FORBIDDEN, "FORBIDDEN", "没有操作权限");
    }

    private void writeFlatError(HttpServletResponse response,
                                ObjectMapper objectMapper, HttpStatus status, String code, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(new ErrorResponse(code, message, null)));
    }
}
