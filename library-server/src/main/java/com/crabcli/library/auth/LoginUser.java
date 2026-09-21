package com.crabcli.library.auth;

/**
 * 已登录用户（BE-B03 / Issue #118）：JWT claims、SecurityContext principal、
 * 登录与 /api/auth/me 响应体三处共用同一形状——组件顺序即契约键序
 * {@code {userId,username,role,displayName,readerId}}。
 * readerId 仅 READER 关联读者档案（app_users.reader_id），其余角色为 null。
 */
public record LoginUser(Integer userId, String username, Role role, String displayName, Integer readerId) {
}
