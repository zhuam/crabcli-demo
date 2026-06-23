/* ====================================================
   CrabCLI Arcade — Game Hub v2 (API-driven)
   ==================================================== */
(function() {
  'use strict';

  // ─── State ───
  let games = [];
  let categories = [];
  let filteredGames = [];
  let currentCategory = 'all';
  let currentFilter = 'all';    // tag filter: all, singleplayer, multiplayer, competitive, relax
  let currentDifficulty = 'all'; // all, easy, medium, hard
  let currentSort = 'popular';
  let searchQuery = '';
  let currentPage = 1;
  const PAGE_SIZE = 12;
  let currentUser = null;
  let favoriteIds = new Set();
  let heroIndex = 0;
  let heroTimer = null;

  // ─── DOM refs ───
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);
  const qs = (el, sel) => (el || document).querySelector(sel);
  const qsa = (el, sel) => (el || document).querySelectorAll(sel);

  const gameGrid = $('gameGrid');
  const resultsCount = $('resultsCount');
  const prevPage = $('prevPage');
  const nextPage = $('nextPage');
  const pageNumbers = $('pageNumbers');
  const searchInput = $('searchInput');
  const heroSlides = $('heroSlides');
  const heroDots = $('heroDots');
  const heroSection = $('heroSection');
  const trendingScroll = $('trendingScroll');
  const newGrid = $('newGrid');
  const categoryPills = $('categoryPills');
  const sortSelect = $('sortSelect');
  const toastContainer = $('toastContainer');
  const authModal = $('authModal');
  const authBtn = $('authBtn');
  const userBadge = $('userBadge');
  const userName = $('userName');
  const userAvatar = $('userAvatar');
  const loginBtn = $('loginBtn');
  const registerBtn = $('registerBtn');
  const authError = $('authError');
  const mobileNav = $('mobileNav');

  // ─── Tag / Difficulty label mapping ───
  const TAG_LABELS = {
    singleplayer: '单人', multiplayer: '多人', competitive: '竞技', relax: '放松',
    puzzle: '益智', action: '动作', strategy: '策略', casual: '休闲',
    idle: '放置', board: '桌游', rpg: 'RPG', word: '文字',
    arcade: '街机', classic: '经典', shooter: '射击', racing: '赛车',
    roguelike: 'Roguelike', runner: '跑酷', pvp: 'PVP', cards: '卡牌',
    logic: '逻辑', simulation: '模拟', management: '管理', clicker: '点击',
    retro: '复古', snake: '贪吃蛇', space: '太空', 'io': 'IO',
    hangman: '猜词', match3: '三消', tower: '塔防', defense: '防御',
    platformer: '平台', ai: 'AI', puzzle: '解谜', minimal: '极简',
    number: '数字', 'short-session': '短局', adventure: '冒险',
    reading: '阅读', productivity: '效率', utility: '工具', roguelite: 'Roguelite',
    pets: '宠物', trivia: '问答', websocket: 'WebSocket'
  };

  function tagLabel(t) { return TAG_LABELS[t] || t; }

  // ─── Stars helper ───
  function starsHTML(rating) {
    if (!rating && rating !== 0) return '';
    const full = Math.floor(rating);
    const half = (rating - full) >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '<span class="stars">' + '★'.repeat(full) + (half ? '★' : '') + '☆'.repeat(empty) + '</span>';
  }

  // ─── Toast ───
  function showToast(msg, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span style="font-weight:700">' + (icons[type] || 'ℹ') + '</span> ' + escapeHtml(msg);
    toastContainer.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, duration);
  }

  // ─── Skeleton ───
  function showSkeleton() {
    gameGrid.innerHTML = '';
    let html = '';
    for (let i = 0; i < 8; i++) {
      html += '<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line" style="width:60%"></div></div></div>';
    }
    gameGrid.innerHTML = html;
    resultsCount.textContent = '加载中...';
  }

  // ─── Data Loading ───
  async function loadData() {
    showSkeleton();
    try {
      var res = await fetch('/api/games');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      games = data.games || [];
      categories = data.categories || [];

      // Compute stats
      var playable = games.filter(function(g) { return g.status === 'playable' || g.playable; });
      var hot = games.filter(function(g) { return g.featured; });
      $('statGames').textContent = games.length;
      $('statPlayable').textContent = playable.length;
      $('statHot').textContent = hot.length;
      $('statCategories').textContent = categories.length > 0 ? categories.length - 1 : (function() { // minus "all"
        var set = new Set(); games.forEach(function(g) { if (g.category) set.add(g.category); }); return set.size;
      })();

      renderCategories();
      renderHero(hot);
      renderTrending(games);
      renderNewReleases(games);
      applyFilters();
      bindEvents();
    } catch (err) {
      console.error('Failed to load games:', err);
      gameGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔌</div><div class="empty-title">加载失败</div><div class="empty-desc">无法连接游戏服务器，请刷新重试。</div></div>';
      resultsCount.textContent = '加载失败';
    }
  }

  // ─── Category Gradients ───
  function getCatGradient(cat) {
    var map = {
      puzzle: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
      idle: 'linear-gradient(135deg, #00B894, #55EFC4)',
      action: 'linear-gradient(135deg, #E17055, #FD79A8)',
      strategy: 'linear-gradient(135deg, #FDCB6E, #F39C12)',
      casual: 'linear-gradient(135deg, #00D2FF, #6C5CE7)'
    };
    return map[cat] || 'linear-gradient(135deg, rgba(24,86,255,0.3), rgba(106,13,173,0.3))';
  }

  function getCatIcon(cat) {
    if (!cat) return '🎮';
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === cat) return categories[i].icon || '🎮';
    }
    return '🎮';
  }

  function getCatName(cat) {
    if (!cat) return '';
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === cat) return categories[i].name || cat;
    }
    return cat;
  }

  function getGameIcon(game) {
    if (game.icon) return game.icon;
    return getCatIcon(game.category);
  }

  // ─── Hero Carousel ───
  function renderHero(featuredGames) {
    if (!featuredGames || featuredGames.length === 0) {
      // Pick top 3 by rating
      featuredGames = [].concat(games).sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); }).slice(0, 3);
    }
    if (!featuredGames || featuredGames.length === 0) { heroSection.style.display = 'none'; return; }
    heroSection.style.display = 'block';

    var labels = ['🔥 热门推荐', '🆕 新游上线', '🏆 评分最高'];
    heroSlides.innerHTML = featuredGames.map(function(g, i) {
      var label = labels[i % labels.length];
      var catName = getCatName(g.category);
      var icon = getGameIcon(g);
      return '<div class="hero-slide' + (i === 0 ? ' active' : '') + '" data-slide="' + i + '">' +
        '<div class="hero-bg-glow"><div class="glow" style="width:300px;height:300px;background:rgba(24,86,255,0.12);top:10%;left:20%;"></div><div class="glow" style="width:200px;height:200px;background:rgba(106,13,173,0.15);bottom:10%;right:20%;"></div></div>' +
        '<div class="hero-content">' +
          '<div class="hero-badge">' + label + '</div>' +
          '<h1 class="hero-title">' + escapeHtml(g.name) + '</h1>' +
          '<p class="hero-desc">' + escapeHtml(g.description || '') + '</p>' +
          '<div class="hero-meta">' +
            '<span>⭐ ' + (g.rating || 'N/A') + '</span>' +
            '<span>👥 ' + (g.players || 'N/A') + ' 人在玩</span>' +
            '<span>🎯 ' + catName + '</span>' +
          '</div>' +
          '<div class="hero-actions">' +
            '<a class="btn btn-gold" href="' + (g.path || '/games/' + g.id + '/') + '">▶ 立即游玩</a>' +
          '</div>' +
        '</div>' +
        '<div class="hero-art" style="background:' + getCatGradient(g.category) + '">' + icon + '</div>' +
      '</div>';
    }).join('');

    heroDots.innerHTML = featuredGames.map(function(_, i) {
      return '<button class="hero-dot' + (i === 0 ? ' active' : '') + '" data-slide="' + i + '"></button>';
    }).join('');

    // Bind hero dots
    heroDots.querySelectorAll('.hero-dot').forEach(function(dot) {
      dot.addEventListener('click', function() {
        clearInterval(heroTimer);
        goToHero(parseInt(dot.dataset.slide));
        startHeroAuto();
      });
    });

    heroIndex = 0;
    startHeroAuto();
  }

  function goToHero(idx) {
    var slides = heroSlides.querySelectorAll('.hero-slide');
    var dots = heroDots.querySelectorAll('.hero-dot');
    slides.forEach(function(s, i) { s.classList.toggle('active', i === idx); });
    dots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
    heroIndex = idx;
  }

  function startHeroAuto() {
    clearInterval(heroTimer);
    heroTimer = setInterval(function() {
      var slides = heroSlides.querySelectorAll('.hero-slide');
      if (slides.length === 0) return;
      var next = (heroIndex + 1) % slides.length;
      goToHero(next);
    }, 5000);
  }

  // ─── Trending Section ───
  function renderTrending(allGames) {
    var trending = [].concat(allGames).sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); }).slice(0, 8);
    if (trending.length === 0) { $('trendingSection').style.display = 'none'; return; }
    $('trendingSection').style.display = 'block';

    trendingScroll.innerHTML = trending.map(function(g) {
      var icon = getGameIcon(g);
      var stars = starsHTML(g.rating);
      var isHot = g.featured || (g.rating && g.rating >= 4.3);
      return '<a class="trending-card" href="' + (g.path || '/games/' + g.id + '/') + '">' +
        '<div class="trending-card-cover" style="background:' + getCatGradient(g.category) + '">' +
          icon +
          (isHot ? '<span class="hot-badge">HOT</span>' : '') +
        '</div>' +
        '<div class="trending-card-body">' +
          '<h4>' + escapeHtml(g.name) + '</h4>' +
          '<div class="stars">' + stars + '</div>' +
          '<div class="meta"><span>' + getCatName(g.category) + '</span><span>·</span><span>👥 ' + (g.players || 'N/A') + '</span></div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  // ─── New Releases ───
  function renderNewReleases(allGames) {
    // Sort by version descending (highest version = newest)
    var sorted = [].concat(allGames).sort(function(a, b) {
      var va = (a.version || '0.0.0').split('.').map(Number);
      var vb = (b.version || '0.0.0').split('.').map(Number);
      for (var i = 0; i < 3; i++) {
        if ((va[i] || 0) !== (vb[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
      }
      return 0;
    });
    var newest = sorted.slice(0, 4);
    if (newest.length === 0) { $('newSection').style.display = 'none'; return; }
    $('newSection').style.display = 'block';

    var maxVersion = newest[0] && newest[0].version;
    newGrid.innerHTML = newest.map(function(g) {
      var isNew = g.version === maxVersion;
      var icon = getGameIcon(g);
      return '<a class="new-card" href="' + (g.path || '/games/' + g.id + '/') + '">' +
        '<div class="new-card-icon" style="background:' + (isNew ? 'rgba(7,202,107,0.12)' : 'rgba(24,86,255,0.12)') + '">' + icon + '</div>' +
        '<div class="new-card-info">' +
          '<h4>' + escapeHtml(g.name) + (isNew ? ' <span class="new-badge">NEW</span>' : '') + '</h4>' +
          '<div class="tag">' + getCatName(g.category) + '</div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  // ─── Categories ───
  function renderCategories() {
    if (!categories || categories.length === 0) {
      // Derive from games
      var catSet = {};
      games.forEach(function(g) { if (g.category) catSet[g.category] = true; });
      categories = [{ id: 'all', name: '全部', icon: '🎮' }];
      Object.keys(catSet).forEach(function(c) {
        categories.push({ id: c, name: c.charAt(0).toUpperCase() + c.slice(1), icon: '🎮' });
      });
    }

    // Ensure 'all' is first
    var allCat = categories.find(function(c) { return c.id === 'all'; });
    var others = categories.filter(function(c) { return c.id !== 'all'; });

    categoryPills.innerHTML = (allCat ? [allCat] : [{ id: 'all', name: '全部', icon: '🎮' }]).concat(others).map(function(cat) {
      var count = cat.id === 'all' ? games.length : games.filter(function(g) { return g.category === cat.id; }).length;
      return '<button class="category-pill' + (currentCategory === cat.id ? ' active' : '') + '" data-cat="' + cat.id + '">' +
        (cat.icon || getCatIcon(cat.id)) + ' ' + cat.name + ' (' + count + ')</button>';
    }).join('');
  }

  // ─── Filter, Sort, Paginate ───
  function applyFilters() {
    var list = [].concat(games);

    // Category filter
    if (currentCategory !== 'all') {
      list = list.filter(function(g) { return g.category === currentCategory; });
    }

    // Tag filter (g.tags is an array of strings)
    if (currentFilter !== 'all') {
      list = list.filter(function(g) {
        return g.tags && g.tags.some(function(t) { return t.indexOf(currentFilter) !== -1; });
      });
    }

    // Difficulty filter (based on rating)
    if (currentDifficulty === 'easy') {
      list = list.filter(function(g) { return (g.rating || 0) < 3.8; });
    } else if (currentDifficulty === 'medium') {
      list = list.filter(function(g) { return (g.rating || 0) >= 3.8 && (g.rating || 0) < 4.4; });
    } else if (currentDifficulty === 'hard') {
      list = list.filter(function(g) { return (g.rating || 0) >= 4.4; });
    }

    // Search
    if (searchQuery.trim()) {
      var q = searchQuery.toLowerCase();
      list = list.filter(function(g) {
        return (g.name && g.name.toLowerCase().indexOf(q) !== -1) ||
               (g.description && g.description.toLowerCase().indexOf(q) !== -1) ||
               (g.tags && g.tags.some(function(t) { return t.toLowerCase().indexOf(q) !== -1; })) ||
               (g.category && g.category.toLowerCase().indexOf(q) !== -1);
      });
    }

    // Sort
    if (currentSort === 'popular') {
      list.sort(function(a, b) {
        var pa = typeof a.players === 'number' ? a.players : (typeof a.players === 'string' ? parseInt(a.players) || 0 : 0);
        var pb = typeof b.players === 'number' ? b.players : (typeof b.players === 'string' ? parseInt(b.players) || 0 : 0);
        if (pb !== pa) return pb - pa;
        return (b.rating || 0) - (a.rating || 0);
      });
    } else if (currentSort === 'newest') {
      list.sort(function(a, b) {
        var va = (a.version || '0.0.0').split('.').map(Number);
        var vb = (b.version || '0.0.0').split('.').map(Number);
        for (var i = 0; i < 3; i++) {
          if ((va[i] || 0) !== (vb[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
        }
        return 0;
      });
    } else if (currentSort === 'rating') {
      list.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
    } else if (currentSort === 'alpha') {
      list.sort(function(a, b) { return (a.name || '').localeCompare(b.name || 'zh'); });
    }

    filteredGames = list;
    var total = list.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var page = list.slice(start, start + PAGE_SIZE);

    resultsCount.textContent = '显示 ' + total + ' 款游戏';

    if (total === 0) {
      gameGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">未找到游戏</div><div class="empty-desc">' +
        (currentCategory !== 'all' ? '切换分类试试？' : '换个关键词搜索？') + '</div></div>';
    } else {
      gameGrid.innerHTML = page.map(renderCard).join('');
    }

    renderPagination(totalPages);
  }

  function renderCard(g) {
    var isFav = favoriteIds.has(g.id);
    var isHot = (g.rating || 0) >= 4.3 && (typeof g.players === 'number' ? g.players : parseInt(g.players) || 0) >= 500;
    var statusClass = (g.status === 'playable' || g.playable) ? 'playable' : 'coming-soon';
    var statusLabel = (g.status === 'playable' || g.playable) ? '可游玩' : '即将上线';
    var icon = getGameIcon(g);
    var catName = getCatName(g.category);
    var desc = g.description || '';
    var gameUrl = g.path || '/games/' + g.id + '/';
    var players = typeof g.players === 'number' ? g.players : (parseInt(g.players) || 0);
    var playersDisplay = players >= 1000 ? (players / 1000).toFixed(1) + 'k' : players;

    return '<a class="game-card" href="' + gameUrl + '" data-game-id="' + g.id + '">' +
      '<div class="game-card-cover" style="background:' + getCatGradient(g.category) + '">' +
        (isHot ? '<span class="hot-badge">🔥</span>' : '') +
        '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>' +
        '<span style="position:relative;z-index:1;">' + icon + '</span>' +
      '</div>' +
      '<div class="play-overlay"><button class="play-btn-icon">▶</button></div>' +
      '<div class="game-card-body">' +
        '<h3>' + escapeHtml(g.name) + '</h3>' +
        '<p>' + escapeHtml(desc) + '</p>' +
        '<div class="game-card-tags">' +
          (g.tags ? g.tags.slice(0, 3).map(function(t) { return '<span class="tag">' + tagLabel(t) + '</span>'; }).join('') : '') +
        '</div>' +
        '<div class="game-card-footer">' +
          '<div class="rating">' + starsHTML(g.rating) + ' ' + (g.rating || '') + '</div>' +
          '<div class="players">👥 ' + playersDisplay + '</div>' +
          '<button class="fav-btn' + (isFav ? ' active' : '') + '" data-game-id="' + g.id + '">' + (isFav ? '❤️' : '🤍') + '</button>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function renderPagination(totalPages) {
    prevPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;

    var html = '';
    for (var i = 1; i <= totalPages; i++) {
      html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    pageNumbers.innerHTML = html;
  }

  function goToPage(n) {
    currentPage = n;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Search ───
  function setupSearch() {
    var timeout = null;
    searchInput.addEventListener('input', function() {
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        searchQuery = searchInput.value;
        currentPage = 1;
        applyFilters();
      }, 200);
    });

    // Keyboard shortcut
    document.addEventListener('keydown', function(e) {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === 'Escape') {
        closeAuth();
      }
    });
  }

  // ─── Auth ───
  function openAuth() {
    authModal.classList.add('open');
    $('loginForm').style.display = 'block';
    $('registerForm').style.display = 'none';
    authError.style.display = 'none';
  }

  window.gameHub = window.gameHub || {};
  window.gameHub.closeAuth = function() { authModal.classList.remove('open'); };
  window.gameHub.showRegister = function() {
    $('loginForm').style.display = 'none';
    $('registerForm').style.display = 'block';
    authError.style.display = 'none';
  };
  window.gameHub.showLogin = function() {
    $('registerForm').style.display = 'none';
    $('loginForm').style.display = 'block';
    authError.style.display = 'none';
  };

  function closeAuth() {
    authModal.classList.remove('open');
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.style.display = 'block';
  }

  function hideAuthError() {
    authError.style.display = 'none';
  }

  async function handleLogin() {
    var user = $('loginUser').value.trim();
    var pass = $('loginPass').value;
    if (!user) { showAuthError('请输入用户名'); return; }
    if (!pass || pass.length < 4) { showAuthError('密码至少4位'); return; }

    hideAuthError();
    loginBtn.disabled = true;
    loginBtn.textContent = '登录中...';

    try {
      var res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user, password: pass })
      });
      var data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        closeAuth();
        renderUserBadge();
        await loadFavorites();
        applyFilters();
        showToast('欢迎回来，' + escapeHtml(currentUser.name), 'success');
      } else {
        showAuthError(data.error || '登录失败');
      }
    } catch (err) {
      showAuthError('网络错误，请重试');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = '登录';
    }
  }

  async function handleRegister() {
    var user = $('regUser').value.trim();
    var pass = $('regPass').value;
    var pass2 = $('regPass2').value;
    if (!user || !pass) { showAuthError('请填写完整信息'); return; }
    if (pass !== pass2) { showAuthError('两次密码不一致'); return; }
    if (pass.length < 4) { showAuthError('密码至少4位'); return; }

    hideAuthError();
    registerBtn.disabled = true;
    registerBtn.textContent = '注册中...';

    try {
      var res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user, password: pass })
      });
      var data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        closeAuth();
        renderUserBadge();
        await loadFavorites();
        applyFilters();
        showToast('注册成功，欢迎 ' + escapeHtml(currentUser.name), 'success');
      } else {
        showAuthError(data.error || '注册失败');
      }
    } catch (err) {
      showAuthError('网络错误，请重试');
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = '注册';
    }
  }

  async function checkAuth() {
    try {
      var res = await fetch('/api/auth/me');
      if (res.ok) {
        var data = await res.json();
        currentUser = data.user;
        renderUserBadge();
        await loadFavorites();
      } else {
        renderGuestBadge();
      }
    } catch (e) {
      renderGuestBadge();
    }
  }

  function renderUserBadge() {
    if (!currentUser) { renderGuestBadge(); return; }
    var initial = (currentUser.name || 'U')[0].toUpperCase();
    userBadge.classList.add('visible');
    userAvatar.textContent = initial;
    userName.textContent = currentUser.name;
    authBtn.style.display = 'none';
  }

  function renderGuestBadge() {
    userBadge.classList.remove('visible');
    authBtn.style.display = 'inline-flex';
    authBtn.textContent = '登录';
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    currentUser = null;
    favoriteIds.clear();
    renderGuestBadge();
    applyFilters();
    showToast('已退出登录', 'info');
  }

  // ─── Favorites ───
  async function loadFavorites() {
    if (!currentUser) return;
    try {
      var res = await fetch('/api/favorites');
      if (res.ok) {
        var data = await res.json();
        var ids = data.favorites || [];
        favoriteIds = new Set(ids);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    }
  }

  async function toggleFavorite(gameId, btn) {
    if (!currentUser) {
      openAuth();
      showToast('请先登录以收藏游戏', 'info');
      return;
    }
    try {
      var res = await fetch('/api/favorites/' + gameId, { method: 'POST' });
      if (res.ok) {
        var data = await res.json();
        if (data.favorite) {
          favoriteIds.add(gameId);
          if (btn) { btn.classList.add('active'); btn.textContent = '❤️'; }
          showToast('已收藏', 'success', 1500);
        } else {
          favoriteIds.delete(gameId);
          if (btn) { btn.classList.remove('active'); btn.textContent = '🤍'; }
          showToast('已取消收藏', 'info', 1500);
        }
      }
    } catch (err) {
      console.error('Toggle favorite error:', err);
      showToast('操作失败', 'error');
    }
  }

  // ─── Event Binding ───
  function bindEvents() {
    // Category pills
    categoryPills.addEventListener('click', function(e) {
      var pill = e.target.closest('.category-pill');
      if (!pill) return;
      var cat = pill.dataset.cat;
      if (!cat) return;
      currentCategory = cat;
      currentPage = 1;
      categoryPills.querySelectorAll('.category-pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      applyFilters();
      // Switch nav tab
      if (cat === 'favorites') {
        setActiveNavTab('favorites');
      } else {
        setActiveNavTab('browse');
      }
    });

    // Tag filter chips
    $$('.tag-chip[data-filter]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var filter = chip.dataset.filter;
        if (filter === 'all') {
          $$('.tag-chip[data-filter]').forEach(function(c) { c.classList.remove('active'); });
          chip.classList.add('active');
          currentFilter = 'all';
        } else {
          $('.tag-chip[data-filter="all"]').classList.remove('active');
          chip.classList.toggle('active');
          var active = [];
          $$('.tag-chip[data-filter].active').forEach(function(c) { active.push(c.dataset.filter); });
          currentFilter = active.length > 0 ? active[0] : 'all';
        }
        currentPage = 1;
        applyFilters();
      });
    });

    // Difficulty chips
    $$('.tag-chip[data-difficulty]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        $$('.tag-chip[data-difficulty]').forEach(function(c) { c.classList.remove('active'); });
        chip.classList.add('active');
        currentDifficulty = chip.dataset.difficulty;
        currentPage = 1;
        applyFilters();
      });
    });

    // Sort
    sortSelect.addEventListener('change', function() {
      currentSort = sortSelect.value;
      currentPage = 1;
      applyFilters();
    });

    // Pagination
    prevPage.addEventListener('click', function() {
      if (currentPage > 1) { currentPage--; applyFilters(); }
    });
    nextPage.addEventListener('click', function() {
      var total = Math.ceil(filteredGames.length / PAGE_SIZE);
      if (currentPage < total) { currentPage++; applyFilters(); }
    });
    pageNumbers.addEventListener('click', function(e) {
      var btn = e.target.closest('.page-btn');
      if (btn && btn.dataset.page) goToPage(parseInt(btn.dataset.page));
    });

    // Game grid event delegation (favorites)
    gameGrid.addEventListener('click', function(e) {
      var favBtn = e.target.closest('.fav-btn');
      if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(favBtn.dataset.gameId, favBtn);
      }
    });

    // Auth
    authBtn.addEventListener('click', openAuth);

    // Close modal on overlay click
    authModal.addEventListener('click', function(e) {
      if (e.target === authModal) closeAuth();
    });

    // Login/Register buttons
    loginBtn.addEventListener('click', handleLogin);
    registerBtn.addEventListener('click', handleRegister);

    // Allow Enter key on auth inputs
    $('loginPass').addEventListener('keydown', function(e) { if (e.key === 'Enter') handleLogin(); });
    $('regPass2').addEventListener('keydown', function(e) { if (e.key === 'Enter') handleRegister(); });

    // User badge click → logout
    userBadge.addEventListener('click', function() {
      if (confirm('退出登录?')) handleLogout();
    });

    // Mobile nav
    mobileNav.addEventListener('click', function(e) {
      var item = e.target.closest('.mobile-nav-item');
      if (!item) return;
      var tab = item.dataset.mtab;
      if (tab === 'home') {
        currentCategory = 'all';
        currentFilter = 'all';
        searchQuery = '';
        searchInput.value = '';
        currentPage = 1;
        applyFilters();
        renderCategories();
        setActiveMobileTab(item);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (tab === 'search') {
        searchInput.focus();
      } else if (tab === 'games') {
        currentCategory = 'all';
        currentPage = 1;
        applyFilters();
        renderCategories();
        setActiveMobileTab(item);
        document.querySelector('.nav-link[data-tab="browse"]').click();
      } else if (tab === 'favorites') {
        if (!currentUser) { openAuth(); return; }
        currentCategory = 'favorites';
        currentPage = 1;
        applyFilters();
        renderCategories();
        setActiveMobileTab(item);
      } else if (tab === 'profile') {
        if (currentUser) {
          var initial = (currentUser.name || 'U')[0].toUpperCase();
          showToast('已登录: ' + escapeHtml(currentUser.name) + ' (点击头像可退出)', 'info');
        } else {
          openAuth();
        }
      }
    });

    // Top nav tabs
    $$('.nav-link').forEach(function(nl) {
      nl.addEventListener('click', function() {
        $$('.nav-link').forEach(function(n) { n.classList.remove('active'); });
        nl.classList.add('active');
        var tab = nl.dataset.tab;
        if (tab === 'home') {
          currentCategory = 'all';
          currentFilter = 'all';
          searchQuery = '';
          searchInput.value = '';
          currentPage = 1;
          applyFilters();
          renderCategories();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (tab === 'browse') {
          currentCategory = 'all';
          currentPage = 1;
          applyFilters();
          renderCategories();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (tab === 'favorites') {
          if (!currentUser) { openAuth(); return; }
          currentCategory = 'favorites';
          currentPage = 1;
          applyFilters();
          renderCategories();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  function setActiveMobileTab(item) {
    mobileNav.querySelectorAll('.mobile-nav-item').forEach(function(i) { i.classList.remove('active'); });
    if (item) item.classList.add('active');
  }

  function setActiveNavTab(tab) {
    $$('.nav-link').forEach(function(n) { n.classList.toggle('active', n.dataset.tab === tab); });
  }

  // ─── Utility ───
  function escapeHtml(str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Init ───
  async function init() {
    setupSearch();
    await checkAuth();
    await loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
