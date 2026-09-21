package com.crabcli.library.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * JWT 签发与校验（BE-B03 / Issue #118），HS256 对称签名。
 * <p>【安全】密钥只能由环境变量 JWT_SECRET 显式提供（application.yml 的
 * {@code library.jwt.secret: ${JWT_SECRET:}} 故意留空默认），构造期即校验：
 * 缺失 / 空白 / 短于 32 字节直接抛异常令启动失败——不设任何默认密钥兜底，
 * 不重蹈 src/gateway/auth.ts:7 {@code JWT_SECRET || 'crabcli-arcade-secret'} 硬编码的覆辙。
 */
@Component
public class JwtService {

    /** HS256 要求密钥至少 256 位（32 字节），不足时 jjwt 会拒绝签名，这里提前给出可读错误。 */
    private static final int MIN_SECRET_BYTES = 32;

    private final SecretKey key;
    private final long ttlSeconds;

    public JwtService(@Value("${library.jwt.secret}") String secret,
                      @Value("${library.jwt.ttl-seconds}") long ttlSeconds) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "环境变量 JWT_SECRET 未设置：JWT 密钥必须显式提供，拒绝使用默认密钥启动");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "环境变量 JWT_SECRET 长度不足 " + MIN_SECRET_BYTES + " 字节，无法用于 HS256 签名");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttlSeconds = ttlSeconds;
    }

    /** 签发 token：sub=username，userId/role/displayName/readerId 为自定义 claims，readerId 仅 READER 写入。 */
    public String issue(LoginUser user) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(user.username())
                .claim("userId", user.userId())
                .claim("role", user.role().name())
                .claim("displayName", user.displayName())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key);
        if (user.readerId() != null) {
            builder.claim("readerId", user.readerId());
        }
        return builder.compact();
    }

    /**
     * 校验签名与有效期并还原登录身份；任何非法 / 过期 token 抛 {@link JwtException}，
     * 由 JwtAuthFilter 统一按未认证处理（401 UNAUTHENTICATED）。
     */
    public LoginUser parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();
        return new LoginUser(
                claims.get("userId", Integer.class),
                claims.getSubject(),
                Role.valueOf(claims.get("role", String.class)),
                claims.get("displayName", String.class),
                claims.get("readerId", Integer.class));
    }

    /** 登录响应里的 expiresIn（秒）。 */
    public long expiresInSeconds() {
        return ttlSeconds;
    }
}
