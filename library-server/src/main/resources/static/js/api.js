// api.js — fetch 封装（Issue #131，契约见 #115/#117）。
// 契约要点：请求自动附 Authorization: Bearer <token>；分页参数 page（从 1 起）/ size（上限 100，服务端钳制）；
// 响应无 data 外壳，ok 时直接返回业务 JSON；错误体平铺 {"code","message"}（400 另有 fields[]），
// message 为后端中文文案、直接展示不映射。
// 页面加载顺序建议：dict.js -> api.js -> auth.js -> ui.js（本文件对 UI 仅为运行时弱依赖）。
(function () {
  'use strict';

  var TOKEN_KEY = 'lib.token';
  var LOGIN_PAGE = 'login.html';

  function ApiError(status, code, message, fields) {
    this.name = 'ApiError';
    this.status = status;
    this.code = code || '';
    this.message = message || '';
    this.fields = fields || [];
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function buildQuery(params) {
    if (!params) return '';
    var qs = new URLSearchParams();
    Object.keys(params).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') qs.append(key, value);
    });
    var str = qs.toString();
    return str ? '?' + str : '';
  }

  function request(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // 登录请求自身的 401（AUTH_INVALID_CREDENTIALS）要回给登录页行内展示，不触发跳转
    var isLogin = path.indexOf('/api/auth/login') === 0;

    return fetch(path + buildQuery(options.params), {
      method: options.method || 'GET',
      headers: headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    }).then(function (resp) {
      if (resp.status === 204) return null;
      return resp.json().catch(function () { return null; }).then(function (data) {
        if (resp.ok) return data; // 契约：响应无 data 外壳

        var message = (data && data.message) || '请求失败（HTTP ' + resp.status + '）';
        var err = new ApiError(resp.status, data && data.code, message, data && data.fields);
        if (resp.status === 401 && !isLogin) {
          // token 已失效：清掉避免后续请求反复 401，带 next 回跳参数去登录页（#132 登录后跳回原页）
          localStorage.removeItem(TOKEN_KEY);
          location.href = LOGIN_PAGE + '?next=' + encodeURIComponent(location.pathname + location.search);
        } else if (resp.status === 403 && window.UI && typeof UI.toast === 'function') {
          UI.toast('无权限执行该操作', 'error');
        }
        throw err;
      });
    });
  }

  var Api = {
    TOKEN_KEY: TOKEN_KEY,
    ApiError: ApiError,
    request: request,
    // 分页约定：params.page 从 1 起、params.size 上限 100，由后端钳制；此处原样透传
    get: function (path, params) { return request(path, { method: 'GET', params: params }); },
    post: function (path, body) { return request(path, { method: 'POST', body: body }); },
    put: function (path, body) { return request(path, { method: 'PUT', body: body }); },
    del: function (path) { return request(path, { method: 'DELETE' }); }
  };

  window.Api = Api;
})();
