package com.crabcli.library.auth;

import com.crabcli.library.service.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 登录契约（BE-B03 / Issue #118，端点命名对齐历史网关 auth.ts:55/140）：
 * <ul>
 *   <li>{@code POST /api/auth/login}：{@code {username,password}} →
 *       {@code {token,expiresIn,user:{userId,username,role,displayName,readerId}}}；</li>
 *   <li>{@code GET /api/auth/me}：携带 Bearer token，返回当前登录用户（形状同 user）。</li>
 * </ul>
 */
@RestController
public class AuthController {

    /** 登录请求体。 */
    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    /** 登录响应体（验收第 3 条契约形状）。 */
    public record LoginResponse(String token, long expiresIn, LoginUser user) {
    }

    private final UserService userService;
    private final JwtService jwtService;

    public AuthController(UserService userService, JwtService jwtService) {
        this.userService = userService;
        this.jwtService = jwtService;
    }

    @PostMapping("/api/auth/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        LoginUser user = userService.authenticate(request.username(), request.password());
        return new LoginResponse(jwtService.issue(user), jwtService.expiresInSeconds(), user);
    }

    @GetMapping("/api/auth/me")
    public LoginUser me(@AuthenticationPrincipal LoginUser user) {
        return user;
    }
}
