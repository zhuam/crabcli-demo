package com.crabcli.library.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.Test;

/**
 * JwtService 纯单元测试（BE-B03 / Issue #118）：签发-解析往返、过期拒绝、
 * 篡改拒绝、密钥启动期校验【安全·无默认密钥兜底】。
 */
class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";

    private final JwtService jwt = new JwtService(SECRET, 7200);
    private final LoginUser reader = new LoginUser(3, "reader01", Role.READER, "张小明", 7);
    private final LoginUser admin = new LoginUser(1, "admin", Role.ADMIN, "系统管理员", null);

    @Test
    void roundTripPreservesUserClaims() {
        LoginUser parsed = jwt.parse(jwt.issue(reader));
        assertThat(parsed).isEqualTo(reader);
    }

    @Test
    void nonReaderTokenHasNoReaderIdClaim() {
        LoginUser parsed = jwt.parse(jwt.issue(admin));
        assertThat(parsed.readerId()).isNull();
        assertThat(parsed.role()).isEqualTo(Role.ADMIN);
    }

    @Test
    void expiredTokenIsRejected() {
        String expired = new JwtService(SECRET, -60).issue(reader);
        assertThatThrownBy(() -> jwt.parse(expired))
                .isInstanceOf(ExpiredJwtException.class);
    }

    @Test
    void tamperedSignatureIsRejected() {
        String token = jwt.issue(reader);
        String tampered = token.substring(0, token.length() - 4) + "AAAA";
        assertThatThrownBy(() -> jwt.parse(tampered))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void blankSecretFailsFastAtStartup() {
        assertThatThrownBy(() -> new JwtService("  ", 7200))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET")
                .hasMessageContaining("显式提供");
    }

    @Test
    void shortSecretFailsFastAtStartup() {
        assertThatThrownBy(() -> new JwtService("too-short-secret", 7200))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32")
                .hasMessageContaining("JWT_SECRET");
    }
}
