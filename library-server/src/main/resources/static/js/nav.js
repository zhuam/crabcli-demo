// nav.js — 角色路由 + 按角色导航（Issue #132，UX U2）。
// ROLE_HOME：登录成功 / 守卫跳板的 role → 首页分发唯一来源（#132 验收：READER→my.html、
// LIBRARIAN→circulation.html、ADMIN→books.html；目标页由 WEB-2~WEB-8 交付，此处只做 location 分发）。
// MENUS：全站菜单项与可见角色——馆员不见读者/基础数据菜单，读者只见自助页，管理员全见。
// 用法（业务页，WEB-2~8）：Auth.requireRole(...) 通过后调 Nav.render(user)，导航条插入 body 首位。
// 加载顺序：dict.js -> api.js -> auth.js -> ui.js -> nav.js（本文件对 Auth/Dict 为运行时弱依赖）。
(function () {
  'use strict';

  var ROLE_HOME = {
    READER: 'my.html',
    LIBRARIAN: 'circulation.html',
    ADMIN: 'books.html'
  };

  // href 与各任务交付的页面文件名一一对应（#133~#139）
  var MENUS = [
    { href: 'my.html', label: '我的借阅', roles: ['READER'] },
    { href: 'circulation.html', label: '借还操作台', roles: ['LIBRARIAN', 'ADMIN'] },
    { href: 'records.html', label: '借阅记录', roles: ['LIBRARIAN', 'ADMIN'] },
    { href: 'reservations.html', label: '预约管理', roles: ['LIBRARIAN', 'ADMIN'] },
    { href: 'readers.html', label: '读者管理', roles: ['ADMIN'] },
    { href: 'books.html', label: '书籍管理', roles: ['ADMIN'] },
    { href: 'admin-data.html', label: '基础数据', roles: ['ADMIN'] }
  ];

  // role → 首页；未映射角色返回 index.html（守卫跳板会清态回登录，避免跳板循环）
  function homeFor(role) {
    return ROLE_HOME[role] || 'index.html';
  }

  function buildLink(item, activeHref) {
    var a = document.createElement('a');
    a.href = item.href;
    a.className = 'lib-nav-link' + (item.href === activeHref ? ' active' : '');
    a.textContent = item.label;
    return a;
  }

  // Nav.render(user[, activeHref])：按 user.role 过滤菜单渲染导航条；
  // activeHref 缺省按当前页面文件名自动匹配。DOM 全部 createElement/textContent 构建，无注入面。
  function render(user, activeHref) {
    if (!user) return null;
    if (!activeHref) activeHref = location.pathname.split('/').pop();
    var bar = document.querySelector('.lib-nav');
    if (bar) bar.parentNode.removeChild(bar);

    bar = document.createElement('nav');
    bar.className = 'lib-nav';

    var brand = document.createElement('span');
    brand.className = 'lib-nav-brand';
    brand.textContent = '图书馆管理系统';
    bar.appendChild(brand);

    MENUS.forEach(function (item) {
      if (item.roles.indexOf(user.role) !== -1) bar.appendChild(buildLink(item, activeHref));
    });

    var spacer = document.createElement('span');
    spacer.className = 'lib-nav-spacer';
    bar.appendChild(spacer);

    var who = document.createElement('span');
    who.className = 'lib-nav-user';
    who.textContent = user.displayName + '（' + (Dict.text(user.role) || user.role) + '）';
    bar.appendChild(who);

    var logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'lib-nav-logout';
    logout.textContent = '登出';
    logout.addEventListener('click', function () { Auth.logout(); });
    bar.appendChild(logout);

    document.body.insertBefore(bar, document.body.firstChild);
    return bar;
  }

  function injectStyles() {
    var css =
      '.lib-nav{display:flex;align-items:center;gap:2px;padding:0 20px;height:48px;background:#fff;border-bottom:1px solid #e5e7eb;font-family:system-ui,sans-serif;box-sizing:border-box;}' +
      '.lib-nav-brand{font-weight:600;font-size:15px;color:#111827;margin-right:16px;white-space:nowrap;}' +
      '.lib-nav-link{padding:6px 12px;border-radius:6px;color:#374151;text-decoration:none;font-size:14px;line-height:20px;white-space:nowrap;}' +
      '.lib-nav-link:hover{background:#f3f4f6;}' +
      '.lib-nav-link.active{background:#dbeafe;color:#1e40af;font-weight:500;}' +
      '.lib-nav-spacer{flex:1;}' +
      '.lib-nav-user{color:#6b7280;font-size:13px;margin-right:12px;white-space:nowrap;}' +
      '.lib-nav-logout{border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:5px 12px;font-size:13px;color:#374151;cursor:pointer;}' +
      '.lib-nav-logout:hover{background:#f3f4f6;}' +
      '@media (max-width:720px){.lib-nav{height:auto;flex-wrap:wrap;padding:8px 12px;gap:4px;}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  injectStyles();
  window.Nav = { ROLE_HOME: ROLE_HOME, MENUS: MENUS, homeFor: homeFor, render: render };
})();
