package com.crabcli.library.service;

import com.crabcli.library.auth.LoginUser;
import com.crabcli.library.error.ApiException;
import com.crabcli.library.repo.AppUserRepository;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 登录凭证校验（BE-B03 / Issue #118）：bcrypt 比对密码。
 * <p>【安全·防枚举】用户名不存在、密码错误、账号已停用三种失败一律回同一
 * 401 {@code AUTH_INVALID_CREDENTIALS}「用户名或密码错误」，不区分原因；
 * 未知用户名也对占位哈希恒定执行一次 bcrypt 比对，抹平响应时序差。
 */
@Service
public class UserService {

    /** 启动期用随机串生成的占位 bcrypt 哈希：格式合法但不可能匹配任何真实口令。 */
    private static final PasswordEncoder TIMING_ENCODER = new BCryptPasswordEncoder();
    private static final String DUMMY_HASH = TIMING_ENCODER.encode(UUID.randomUUID().toString());

    private final AppUserRepository repository;
    private final PasswordEncoder passwordEncoder;

    public UserService(AppUserRepository repository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }

    public LoginUser authenticate(String username, String rawPassword) {
        AppUserRepository.AppUser user = repository.findByUsername(username).orElse(null);
        boolean ok = user != null && user.active() && passwordEncoder.matches(rawPassword, user.passwordHash());
        if (!ok) {
            if (user == null) {
                passwordEncoder.matches(rawPassword, DUMMY_HASH);
            }
            throw new ApiException("AUTH_INVALID_CREDENTIALS", "用户名或密码错误", HttpStatus.UNAUTHORIZED);
        }
        return user.toLoginUser();
    }
}
