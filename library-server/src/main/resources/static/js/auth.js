// auth.js — token 存取 + 当前用户 + 角色守卫（Issue #131）。
// role/readerId 一律来自 GET /api/auth/me（登录响应含同形 user，见 #118），绝不解析 token。
(function () {
  'use strict';

  var Auth = {};

  Auth.setToken = function (token) {
    localStorage.setItem(Api.TOKEN_KEY, token);
  };

  Auth.clearToken = function () {
    localStorage.removeItem(Api.TOKEN_KEY);
  };

  Auth.loginUrl = function () {
    // next 供登录页登录成功后跳回原目标页（#132）
    return 'login.html?next=' + encodeURIComponent(location.pathname + location.search);
  };

  // 页面启动时调用：有 token 才拉 /api/auth/me；无 token 或已失效按未登录处理。
  // 返回当前用户（{userId, username, role, displayName, readerId}）或 null。
  Auth.init = function () {
    Auth.user = null;
    if (!localStorage.getItem(Api.TOKEN_KEY)) return Promise.resolve(null);
    return Api.get('/api/auth/me').then(function (data) {
      // 登录响应为 {token, expiresIn, user:{...}}（#118）；/me 直接返回用户或包一层 user，两者都兼容
      Auth.user = (data && data.user) ? data.user : data;
      return Auth.user;
    }, function (err) {
      // 401 已由 Api 清 token 并跳登录；其余错误视为未登录，不阻断页面自身的降级逻辑
      if (err instanceof Api.ApiError) return null;
      throw err;
    });
  };

  // 页面守卫：Auth.requireRole('LIBRARIAN', 'ADMIN')。
  // 未登录或登录态失效 -> 跳登录页；角色不符 -> 用无权限页替换当前文档；
  // 两种情况都 throw 以中断页面后续初始化，通过时 resolve 当前用户。
  Auth.requireRole = function () {
    var roles = Array.prototype.slice.call(arguments);
    if (!localStorage.getItem(Api.TOKEN_KEY)) {
      location.replace(Auth.loginUrl());
      return Promise.reject(new Error('未登录，已跳转登录页'));
    }
    return (Auth.user ? Promise.resolve(Auth.user) : Auth.init()).then(function (user) {
      if (!user) {
        location.replace(Auth.loginUrl());
        throw new Error('登录态失效，已跳转登录页');
      }
      if (roles.length && roles.indexOf(user.role) === -1) {
        document.title = '无权限';
        document.body.innerHTML =
          '<div class="no-permission">' +
          '<h2>无权限访问</h2>' +
          '<p>当前角色：' + UI.escapeHtml(Dict.text(user.role) || user.role) + '</p>' +
          '<p><a href="login.html">返回登录</a></p>' +
          '</div>';
        throw new Error('角色 ' + user.role + ' 无权访问本页');
      }
      return user;
    });
  };

  // 登出：清 token 回登录页
  Auth.logout = function () {
    Auth.clearToken();
    Auth.user = null;
    location.href = 'login.html';
  };

  window.Auth = Auth;
})();
