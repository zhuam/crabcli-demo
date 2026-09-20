// ui.js — 全局反馈规范（Issue #131，UX U12）。
// 规范：toast 用于成功/提示类轻反馈（容器 + 类型 class + 自动移除）；
// 业务拒绝（409 等）一律行内文案呈现，不用 toast；
// 状态徽标六色：在借(绿)/已还(青)/逾期(红)/丢失(橙)/预约保留中(蓝)/预约失效(灰)；
// 任何 innerHTML 拼接前必须先经 UI.escapeHtml 转义。
// 依赖：dict.js（徽标文案走 Dict 单一来源）。
(function () {
  'use strict';

  // ---- 转义：innerHTML 拼接前必过（防注入） ----
  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- toast：容器 + 类型 class + 自动移除 ----
  var toastContainer = null;
  function ensureToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'lib-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function toast(message, type) {
    var node = document.createElement('div');
    node.className = 'lib-toast lib-toast-' + (type || 'info');
    node.textContent = message; // textContent 赋值，天然无注入面
    ensureToastContainer().appendChild(node);
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 3000);
  }

  // ---- 行内业务错误：业务拒绝一律行内呈现（非 toast） ----
  // inlineError(formEl, '后端文案') 追加/更新容器内 .lib-inline-error；传空 message 则清除。
  function inlineError(container, message) {
    if (!container) return;
    var box = container.querySelector('.lib-inline-error');
    if (!message) {
      if (box) box.parentNode.removeChild(box);
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.className = 'lib-inline-error';
      container.insertBefore(box, container.firstChild);
    }
    box.textContent = message;
  }

  // ---- 状态徽标 ----
  // 六色规范映射（#131）：在借绿 / 已还青 / 逾期红 / 丢失橙 / 预约保留中蓝 / 预约失效灰；
  // 其余枚举值复用同一色板（色值唯一，按值平铺无冲突）。
  var BADGE_COLOR = {
    BORROWED: 'green',   // 在借
    RETURNED: 'teal',    // 已还
    OVERDUE: 'red',      // 逾期（红）
    LOST: 'orange',      // 丢失（橙）
    LOST_PAID: 'teal',   // 已赔（闭环，同已还色系）
    WAITING: 'blue',     // 预约排队
    HELD: 'blue',        // 预约保留中（蓝）
    EXPIRED: 'gray',     // 预约失效（灰）
    FULFILLED: 'green',  // 已借出
    CANCELLED: 'gray',   // 已取消
    ACTIVE: 'green',     // 读者正常 / 图书在架
    INACTIVE: 'gray',    // 已注销
    WITHDRAWN: 'gray'    // 已下架（#137 置灰）
  };

  // badge('OVERDUE') -> 徽标 HTML 片段（文案经 Dict，插入 innerHTML 前已转义）
  function badge(value) {
    var color = BADGE_COLOR[value] || 'gray';
    var text = Dict.text(value) || value;
    return '<span class="lib-badge lib-badge-' + color + '">' + escapeHtml(text) + '</span>';
  }

  // ---- 共享样式（随 ui.js 注入一次，页面无需重复声明） ----
  function injectStyles() {
    var css =
      '.lib-toast-container{position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;}' +
      '.lib-toast{padding:10px 14px;border-radius:6px;color:#fff;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.15);}' +
      '.lib-toast-success{background:#16a34a;}' +
      '.lib-toast-error{background:#dc2626;}' +
      '.lib-toast-info{background:#2563eb;}' +
      '.lib-inline-error{color:#dc2626;font-size:13px;margin:6px 0;}' +
      '.lib-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;line-height:18px;white-space:nowrap;}' +
      '.lib-badge-green{background:#dcfce7;color:#166534;}' +
      '.lib-badge-teal{background:#ccfbf1;color:#115e59;}' +
      '.lib-badge-red{background:#fee2e2;color:#991b1b;}' +
      '.lib-badge-orange{background:#ffedd5;color:#9a3412;}' +
      '.lib-badge-blue{background:#dbeafe;color:#1e40af;}' +
      '.lib-badge-gray{background:#e5e7eb;color:#374151;}' +
      '.no-permission{max-width:420px;margin:80px auto;text-align:center;color:#374151;font-family:system-ui,sans-serif;}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  var UI = {
    escapeHtml: escapeHtml,
    toast: toast,
    inlineError: inlineError,
    badge: badge
  };

  injectStyles();
  window.UI = UI;
})();
