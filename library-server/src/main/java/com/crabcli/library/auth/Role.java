package com.crabcli.library.auth;

/**
 * 三角色（BE-B03 / Issue #118）。Spring 鉴权约定使用带 ROLE_ 前缀的 authority，
 * {@link #authority()} 供 JwtAuthFilter 构建 Authentication 时使用。
 */
public enum Role {
    ADMIN, LIBRARIAN, READER;

    public String authority() {
        return "ROLE_" + name();
    }
}
