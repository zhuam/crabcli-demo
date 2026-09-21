package com.crabcli.library.auth;

import com.crabcli.library.repo.AppUserRepository;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Bearer token 过滤器（BE-B03 / Issue #118）：解析 JWT 后按用户名回查账号现状再落
 * SecurityContext——账号被停用（DISABLED）后未过期的旧 token 立即失效，角色变更即时生效。
 * <p>解析失败只留空 SecurityContext，不在这里写响应：受保护路径由 SecurityConfig 的
 * 入口点统一回 401 UNAUTHENTICATED，permitAll 路径（/api/auth/login）不受影响。
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AppUserRepository repository;

    public JwtAuthFilter(JwtService jwtService, AppUserRepository repository) {
        this.jwtService = jwtService;
        this.repository = repository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                LoginUser fromToken = jwtService.parse(header.substring(BEARER_PREFIX.length()));
                AppUserRepository.AppUser current = repository.findByUsername(fromToken.username()).orElse(null);
                if (current != null && current.active()) {
                    LoginUser principal = current.toLoginUser();
                    var authentication = new UsernamePasswordAuthenticationToken(
                            principal, null, List.of(new SimpleGrantedAuthority(principal.role().authority())));
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            } catch (JwtException | IllegalArgumentException ex) {
                // 非法 / 过期 token：保持未认证，交由授权层统一回 401
            }
        }
        chain.doFilter(request, response);
    }
}
