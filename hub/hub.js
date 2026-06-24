/* ============================================================
   🎮 CrabCLI Arcade — Game Hub v3 (API-driven, Immersive Launcher)
   ============================================================ */
(function() {
  'use strict';

  // ─── State ───
  let games = [];
  let categories = [];
  let currentCategory = 'all';
  let currentTags = ['all'];
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

  // ─── Tag label mapping (Chinese) ───
  const TAG_LABELS = {
    singleplayer:'单人', multiplayer:'多人', competitive:'竞技', puzzle:'益智',
    action:'动作', strategy:'策略', casual:'休闲', shooter:'射击', racing:'赛车',
    arcade:'街机', board:'桌游', roguelike:'Roguelike', rpg:'RPG', word:'文字',
    idle:'放置', simulation:'模拟', defense:'防御', classic:'经典', logic:'逻辑',
    cards:'卡牌', chess:'象棋', clicker:'点击', runner:'跑酷', snake:'贪吃蛇',
    trivia:'问答', pvp:'对战', management:'经营', reading:'阅读', minimal:'极简',
    roguelite:'Roguelite', platformer:'平台', match3:'三消', tower:'塔防',
    number:'数字', retro:'复古', space:'太空', io:'IO', hangman:'猜词',
    ai:'AI', adventure:'冒险', websocket:'WebSocket', pets:'宠物',
    'short-session':'短局'
  };
  function tagLabel(t) { return TAG_LABELS[t] || t; }

  // ─── Stars helper ───
  function stars(rating) {
    if (rating == null) return '';
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '★';
    if (half) s += '☆';
    for (let i = s.length; i < 5; i++) s += '☆';
    return s;
  }

  // ─── Cover gradient palettes ───
  function getCoverGradients(seed) {
    const palettes = [
      ['rgba(0,212,255,0.25)','rgba(139,92,246,0.2)'],
      ['rgba(0,255,136,0.2)','rgba(0,212,255,0.18)'],
      ['rgba(139,92,246,0.2)','rgba(255,215,0,0.12)'],
      ['rgba(255,51,102,0.2)','rgba(255,140,0,0.15)'],
      ['rgba(0,212,255,0.15)','rgba(0,255,136,0.15)'],
      ['rgba(255,215,0,0.15)','rgba(255,51,102,0.12)'],
      ['rgba(139,92,246,0.18)','rgba(0,212,255,0.18)'],
      ['rgba(255,140,0,0.15)','rgba(255,215,0,0.12)']
    ];
    return palettes[Math.abs(seed) % palettes.length];
  }

  // ─── Toast ───
  function showToast(msg, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, duration);
  }

  // ─── Skeleton ───
  function showSkeleton() {
    const grid = $('gameGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const rand = Math.random().toString(36).slice(2, 6);
      grid.innerHTML +=
        '<div class="skeleton-card" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden">' +
        '<div class="skeleton-cover" style="height:140px;background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-card-hover) 50%,var(--bg-card) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite"></div>' +
        '<div class="skeleton-body" style="padding:12px 14px 14px">' +
        '<div class="skeleton-line" style="height:14px;margin-bottom:8px;background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-card-hover) 50%,var(--bg-card) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:4px;width:70%"></div>' +
        '<div class="skeleton-line" style="height:10px;background:linear-gradient(90deg,var(--bg-card) 25%,var(--bg-card-hover) 50%,var(--bg-card) 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:4px;width:50%"></div>' +
        '</div></div>';
    }
    const rc = $('resultsCount');
    if (rc) rc.textContent = '加载中...';
  }

  // ─── Escape HTML ───
  function esc(str) {
    if (str == null) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ─── Data Loading ───
  async function loadData() {
    showSkeleton();
    try {
      const res = await fetch('/api/games');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      games = data.games || [];
      categories = data.categories || [];

      // Ensure categories match registry
      if (categories.length === 0) {
        categories = [
          { id: 'all', name: '全部', icon: '🎮' },
          { id: 'puzzle', name: '益智', icon: '🧩' },
          { id: 'idle', name: '放置', icon: '🏪' },
          { id: 'action', name: '动作', icon: '⚡' },
          { id: 'strategy', name: '策略', icon: '♟️' },
          { id: 'casual', name: '休闲', icon: '🎯' }
        ];
      }

      updateStats();
      renderHero();
      renderTrending();
      renderCategories();
      applyFilters();
    } catch (err) {
      console.error('Failed to load games:', err);
      // Fallback: load from registry inline
      try {
        const regRes = await fetch('/games/registry.json');
        if (regRes.ok) {
          const regData = await regRes.json();
          games = regData.games || [];
          categories = regData.categories || [];
        }
      } catch (e2) { /* ignore */ }

      if (games.length === 0) {
        const grid = $('gameGrid');
        if (grid) grid.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-dim)">' +
          '<div style="font-size:48px;margin-bottom:16px;">🔌</div>' +
          '<div style="font-size:18px;font-weight:600;margin-bottom:6px;color:var(--text-secondary)">加载失败</div>' +
          '<div style="font-size:14px;">无法连接游戏服务器，请刷新重试。</div></div>';
        const rc = $('resultsCount');
        if (rc) rc.textContent = '加载失败';
        return;
      }

      // Ensure categories
      if (categories.length === 0) {
        categories = [
          { id: 'all', name: '全部', icon: '🎮' },
          { id: 'puzzle', name: '益智', icon: '🧩' },
          { id: 'idle', name: '放置', icon: '🏪' },
          { id: 'action', name: '动作', icon: '⚡' },
          { id: 'strategy', name: '策略', icon: '♟️' },
          { id: 'casual', name: '休闲', icon: '🎯' }
        ];
      }

      updateStats();
      renderHero();
      renderTrending();
      renderCategories();
      applyFilters();
    }
  }

  // ─── Stats ───
  function updateStats() {
    const total = games.length;
    const playable = games.filter(g => g.status === 'playable' || g.playable).length;
    const totalPlayers = games.reduce((s, g) => {
      const p = typeof g.players === 'number' ? g.players : (parseInt(g.players) || 0);
      return s + p;
    }, 0);
    const catSet = new Set(games.map(g => g.category));
    const comingSoon = games.filter(g => g.status === 'coming' || g.status === 'coming-soon' || !g.playable).length;

    animateCounter('statGames', 0, total);
    animateCounter('statPlayable', 0, playable);
    animateCounter('statOnline', 0, Math.round(totalPlayers / 3) || 42);
    animateCounter('statCategories', 0, catSet.size);
    const cs = $('csCount');
    if (cs) cs.textContent = comingSoon;
  }

  function animateCounter(id, from, to) {
    const el = $(id);
    if (!el) return;
    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(from + (to - from) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ─── Hero Carousel ───
  function renderHero() {
    const section = $('heroSection');
    const dotsContainer = $('heroDots');
    if (!section || !dotsContainer) return;

    // Remove old slides
    section.querySelectorAll('.hero-slide').forEach(el => el.remove());

    const featured = games.filter(g => g.featured).slice(0, 5);
    if (featured.length === 0) {
      // Pick top 5 by rating
      const sorted = [].concat(games).sort((a, b) => (b.rating || 0) - (a.rating || 0));
      featured.push.apply(featured, sorted.slice(0, 5));
    }
    if (featured.length === 0) return;

    const badgeMap = ['featured','new','top','featured','new'];
    const badgeLabels = ['🔥 热门推荐','🆕 精选新游','⭐ 评分最高','🔥 热门推荐','🆕 精选新游'];

    featured.forEach((g, i) => {
      const [c1, c2] = getCoverGradients(i * 7 + 3);
      const slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
      slide.dataset.slide = i;
      const icon = g.emoji || getCatIcon(g.category);
      slide.innerHTML =
        '<div class="hero-bg-glow">' +
          '<div class="glow" style="width:300px;height:300px;background:' + c1 + ';top:10%;left:20%;"></div>' +
          '<div class="glow" style="width:200px;height:200px;background:' + c2 + ';bottom:10%;right:20%;"></div>' +
        '</div>' +
        '<div class="hero-content">' +
          '<div class="hero-badge ' + badgeMap[i % badgeMap.length] + '">' + badgeLabels[i % badgeLabels.length] + '</div>' +
          '<h1 class="hero-title">' + esc(g.name) + '</h1>' +
          '<p class="hero-desc">' + esc(g.description || '') + '</p>' +
          '<div class="hero-meta">' +
            '<span class="stars">' + stars(g.rating) + ' ' + (g.rating || '') + '</span>' +
            '<span>👥 ' + (typeof g.players === 'number' ? (g.players >= 1000 ? (g.players/1000).toFixed(1)+'k' : g.players) : (g.players || 'N/A')) + ' 人在玩</span>' +
            '<span>📂 ' + getCatName(g.category) + '</span>' +
          '</div>' +
          '<div class="hero-actions">' +
            '<button class="btn btn-play" onclick="window.gameHub && window.gameHub.playGame(\'' + g.id + '\')">▶ 立即游玩</button>' +
            '<button class="btn btn-ghost" onclick="event.stopPropagation();window.gameHub && window.gameHub.toggleFav(\'' + g.id + '\')">❤ 收藏</button>' +
          '</div>' +
        '</div>' +
        '<div class="hero-art" style="background:linear-gradient(135deg,' + c1.replace('0.25','0.3').replace('0.2','0.25') + ',' + c2.replace('0.2','0.25') + ')">' +
          icon +
        '</div>';
      section.insertBefore(slide, dotsContainer);
    });

    // Dots
    dotsContainer.innerHTML = featured.map((_, i) =>
      '<button class="hero-dot' + (i === 0 ? ' active' : '') + '" data-slide="' + i + '"></button>'
    ).join('');

    // Bind dots
    dotsContainer.querySelectorAll('.hero-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        clearInterval(heroTimer);
        goToHero(parseInt(dot.dataset.slide));
        startHeroAuto();
      });
    });

    // Prev/Next arrows
    const prevBtn = section.querySelector('.hero-arrow.prev');
    const nextBtn = section.querySelector('.hero-arrow.next');
    if (prevBtn) prevBtn.onclick = () => { clearInterval(heroTimer); const slides = section.querySelectorAll('.hero-slide'); goToHero((heroIndex - 1 + slides.length) % slides.length); startHeroAuto(); };
    if (nextBtn) nextBtn.onclick = () => { clearInterval(heroTimer); const slides = section.querySelectorAll('.hero-slide'); goToHero((heroIndex + 1) % slides.length); startHeroAuto(); };

    heroIndex = 0;
    startHeroAuto();
  }

  function goToHero(idx) {
    const section = $('heroSection');
    if (!section) return;
    const slides = section.querySelectorAll('.hero-slide');
    const dots = section.querySelectorAll('.hero-dot');
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    heroIndex = idx;
  }

  function startHeroAuto() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
      const section = $('heroSection');
      if (!section) return;
      const slides = section.querySelectorAll('.hero-slide');
      if (slides.length === 0) return;
      goToHero((heroIndex + 1) % slides.length);
    }, 5000);
  }

  // ─── Trending Section ───
  function renderTrending() {
    const container = $('trendingScroll');
    if (!container) return;
    const topGames = [].concat(games).sort((a, b) => {
      const pa = typeof b.players === 'number' ? b.players : (parseInt(b.players) || 0);
      const pb = typeof a.players === 'number' ? a.players : (parseInt(a.players) || 0);
      return pa - pb;
    }).slice(0, 8);
    if (topGames.length === 0) return;

    container.innerHTML = topGames.map((g, i) => {
      const [c1, c2] = getCoverGradients(i * 11 + 5);
      const icon = g.emoji || getCatIcon(g.category);
      return '<div class="trend-card" onclick="window.gameHub && window.gameHub.playGame(\'' + g.id + '\')">' +
        '<div class="trend-cover" style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ')">' +
          (i < 3 ? '<span class="badge">TOP ' + (i + 1) + '</span>' : '') +
          '<span class="rank">' + (i + 1) + '</span>' +
          '<span style="position:relative;z-index:1;">' + icon + '</span>' +
        '</div>' +
        '<div class="trend-info">' +
          '<h4>' + esc(g.name) + '</h4>' +
          '<div class="stars">' + stars(g.rating) + ' ' + (g.rating || '') + '</div>' +
          '<div class="meta">' +
            '<span>' + getCatName(g.category) + '</span><span>·</span>' +
            '<span>👥 ' + (typeof g.players === 'number' ? (g.players >= 1000 ? (g.players/1000).toFixed(1)+'k' : g.players) : (g.players || 'N/A')) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ─── Categories ───
  function renderCategories() {
    const container = $('categoryPills');
    if (!container) return;

    if (categories.length === 0) {
      const catSet = {};
      games.forEach(g => { if (g.category) catSet[g.category] = true; });
      categories = [{ id: 'all', name: '全部', icon: '🎮' }];
      Object.keys(catSet).forEach(c => {
        categories.push({ id: c, name: getCatName(c), icon: getCatIcon(c) });
      });
    }

    // Ensure 'all' first
    const allCat = categories.find(c => c.id === 'all');
    const others = categories.filter(c => c.id !== 'all');

    container.innerHTML = (allCat ? [allCat] : [{ id: 'all', name: '全部', icon: '🎮' }]).concat(others).map(cat => {
      const count = cat.id === 'all' ? games.length : games.filter(g => g.category === cat.id).length;
      return '<button class="category-pill' + (currentCategory === cat.id ? ' active' : '') + '" data-cat="' + cat.id + '">' +
        (cat.icon || getCatIcon(cat.id)) + ' ' + cat.name + ' (' + count + ')</button>';
    }).join('');
  }

  function filterByCategory(cat) {
    document.querySelectorAll('.category-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    currentCategory = cat;
    currentPage = 1;
    applyFilters();
  }

  // ─── Helper: category name / icon ───
  function getCatName(cat) {
    if (!cat) return '';
    const c = categories.find(c => c.id === cat);
    if (c) return c.name;
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  function getCatIcon(cat) {
    if (!cat) return '🎮';
    const c = categories.find(c => c.id === cat);
    return c && c.icon ? c.icon : '🎮';
  }

  // ─── Render Game Card ───
  function renderCard(g) {
    const isFav = favoriteIds.has(g.id);
    const isHot = (g.rating || 0) >= 4.3 && (typeof g.players === 'number' ? g.players : (parseInt(g.players) || 0)) >= 500;
    const status = g.status === 'playable' || g.playable ? 'playable' : 'coming';
    const statusClass = status === 'playable' ? 'playable' : 'coming';
    const statusLabel = status === 'playable' ? 'PLAYABLE' : 'COMING SOON';
    const [c1, c2] = getCoverGradients(g.id.charCodeAt(0) + (g.id ? g.id.length : 0) || 0);
    const icon = g.emoji || getCatIcon(g.category);
    const players = typeof g.players === 'number' ? g.players : (parseInt(g.players) || 0);
    const playersDisplay = players >= 1000 ? (players / 1000).toFixed(1) + 'k' : players || 'N/A';

    return '<div class="game-card" data-game-id="' + esc(g.id) + '" data-cat="' + esc(g.category) + '" data-status="' + status + '">' +
      '<div class="game-card-cover" style="background:linear-gradient(135deg,' + c1 + ',' + c2 + ')">' +
        (isHot ? '<span class="hot-badge-top">🔥</span>' : '') +
        '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>' +
        '<span style="position:relative;z-index:1;">' + icon + '</span>' +
      '</div>' +
      '<div class="play-overlay">' +
        '<button class="play-btn-icon" onclick="event.stopPropagation();window.gameHub && window.gameHub.playGame(\'' + esc(g.id) + '\')">▶</button>' +
      '</div>' +
      '<div class="game-card-body">' +
        '<h3>' + esc(g.name) + '</h3>' +
        '<div class="subtitle">' + esc(g.description || '') + '</div>' +
        '<div class="game-card-tags">' +
          (g.tags ? g.tags.slice(0, 3).map(t => '<span class="tag">' + tagLabel(t) + '</span>').join('') : '') +
        '</div>' +
        '<div class="game-card-footer">' +
          '<div class="rating">' + stars(g.rating) + ' ' + (g.rating || '') + '</div>' +
          '<div class="players">👥 ' + playersDisplay + '</div>' +
          '<button class="fav-btn' + (isFav ? ' active' : '') + '" onclick="event.stopPropagation();window.gameHub && window.gameHub.toggleFav(\'' + esc(g.id) + '\')">' + (isFav ? '❤️' : '🤍') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ─── Filter, Sort, Paginate ───
  function applyFilters() {
    let list = [].concat(games);

    // Category
    if (currentCategory !== 'all') {
      list = list.filter(g => g.category === currentCategory);
    }

    // Tags
    if (!currentTags.includes('all')) {
      list = list.filter(g => currentTags.some(t => g.tags && g.tags.includes(t)));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g =>
        (g.name && g.name.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.tags && g.tags.some(t => t.toLowerCase().includes(q))) ||
        (g.category && g.category.toLowerCase().includes(q))
      );
    }

    // Sort
    if (currentSort === 'popular') {
      list.sort((a, b) => {
        const pa = typeof b.players === 'number' ? b.players : (parseInt(b.players) || 0);
        const pb = typeof a.players === 'number' ? a.players : (parseInt(a.players) || 0);
        return pa - pb;
      });
    } else if (currentSort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (currentSort === 'newest') {
      list.sort((a, b) => (b.version || '0.0.0').localeCompare(a.version || '0.0.0'));
    } else if (currentSort === 'alpha') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || 'zh'));
    }

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = list.slice(start, start + PAGE_SIZE);

    // Render grid
    const grid = $('gameGrid');
    if (grid) {
      grid.innerHTML = page.length
        ? page.map(renderCard).join('')
        : '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-dim)">' +
          '<div style="font-size:48px;margin-bottom:16px;">🔍</div>' +
          '<div style="font-size:18px;font-weight:600;margin-bottom:6px;color:var(--text-secondary)">没有找到匹配的游戏</div>' +
          '<div style="font-size:14px;">试试调整筛选条件或搜索其他关键词</div></div>';
    }

    const rc = $('resultsCount');
    if (rc) rc.textContent = '共 ' + total + ' 款游戏';

    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const prevBtn = $('prevPage');
    const nextBtn = $('nextPage');
    const pageNums = $('pageNumbers');
    if (!prevBtn || !nextBtn || !pageNums) return;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;

    let html = '';
    const show = 5;
    let from = Math.max(1, currentPage - Math.floor(show / 2));
    let to = Math.min(totalPages, from + show - 1);
    if (to - from + 1 < show) from = Math.max(1, to - show + 1);

    if (from > 1) {
      html += '<button class="page-btn" data-page="1">1</button>';
      if (from > 2) html += '<span style="color:var(--text-dim);padding:0 4px;">…</span>';
    }
    for (let i = from; i <= to; i++) {
      html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    if (to < totalPages) {
      if (to < totalPages - 1) html += '<span style="color:var(--text-dim);padding:0 4px;">…</span>';
      html += '<button class="page-btn" data-page="' + totalPages + '">' + totalPages + '</button>';
    }
    pageNums.innerHTML = html;

    // Bind page clicks
    pageNums.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => goToPage(parseInt(btn.dataset.page)));
    });
  }

  function goToPage(n) {
    currentPage = n;
    applyFilters();
    const filterBar = document.querySelector('.filter-bar');
    if (filterBar) filterBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Event Binding ───
  function bindEvents() {
    // Category pills
    const catPills = $('categoryPills');
    if (catPills) {
      catPills.addEventListener('click', e => {
        const pill = e.target.closest('.category-pill');
        if (!pill || !pill.dataset.cat) return;
        filterByCategory(pill.dataset.cat);
      });
    }

    // Tag chips
    $$('.tag-chip[data-tag]').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        if (tag === 'all') {
          $$('.tag-chip[data-tag]').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          currentTags = ['all'];
        } else {
          const allChip = document.querySelector('.tag-chip[data-tag="all"]');
          if (allChip) allChip.classList.remove('active');
          chip.classList.toggle('active');
          const activeTags = [...document.querySelectorAll('.tag-chip[data-tag].active')].map(c => c.dataset.tag);
          currentTags = activeTags.length ? activeTags : ['all'];
        }
        currentPage = 1;
        applyFilters();
      });
    });

    // Sort
    const sortSelect = $('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        currentPage = 1;
        applyFilters();
      });
    }

    // Search
    const searchInput = $('searchInput');
    if (searchInput) {
      let searchTimer;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          searchQuery = searchInput.value;
          currentPage = 1;
          applyFilters();
        }, 250);
      });
    }

    // Prev/Next page
    const prevBtn = $('prevPage');
    const nextBtn = $('nextPage');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; applyFilters(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      const total = Math.ceil(games.length / PAGE_SIZE);
      if (currentPage < total) { currentPage++; applyFilters(); }
    });

    // Nav links
    $$('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        $$('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const tab = link.dataset.tab;
        if (tab === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (tab === 'browse') {
          filterByCategory('all');
          const catSec = document.querySelector('.category-section');
          if (catSec) catSec.scrollIntoView({ behavior: 'smooth' });
        } else if (tab === 'favorites') {
          if (!currentUser) { showToast('请先登录查看收藏', 'info'); openAuth(); return; }
          filterByCategory('all');
          const favGames = games.filter(g => favoriteIds.has(g.id));
          if (favGames.length === 0) showToast('还没有收藏游戏', 'info');
          const catSec = document.querySelector('.category-section');
          if (catSec) catSec.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Auth
    const authBtn = $('authBtn');
    if (authBtn) authBtn.addEventListener('click', openAuth);

    // Modal overlay click to close
    const authModal = $('authModal');
    if (authModal) {
      authModal.addEventListener('click', e => {
        if (e.target === authModal) closeAuth();
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAuth();
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        const si = $('searchInput');
        if (si) si.focus();
      }
    });

    // Mobile bottom nav
    $$('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.mtab;
        $$('.mobile-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (tab === 'home') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (tab === 'search') {
          const si = $('searchInput');
          if (si) si.focus();
        } else if (tab === 'games') {
          filterByCategory('all');
          const catSec = document.querySelector('.category-section');
          if (catSec) catSec.scrollIntoView({ behavior: 'smooth' });
        } else if (tab === 'favorites') {
          if (!currentUser) { openAuth(); return; }
          filterByCategory('all');
        } else if (tab === 'profile') {
          if (currentUser) {
            showToast('已登录: ' + esc(currentUser.name), 'info');
          } else {
            openAuth();
          }
        }
      });
    });

    // Login/Register modal submission
    const loginBtn = $('loginBtn');
    const registerBtn = $('registerBtn');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);

    const loginPass = $('loginPass');
    if (loginPass) loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    const regPass2 = $('regPass2');
    if (regPass2) regPass2.addEventListener('keydown', e => { if (e.key === 'Enter') handleRegister(); });

    // User badge → logout
    const userBadge = $('userBadge');
    if (userBadge) {
      userBadge.addEventListener('click', () => {
        if (confirm('退出登录?')) handleLogout();
      });
    }

    // Promo cards
    $$('.promo-card[data-promo]').forEach(card => {
      card.addEventListener('click', () => {
        const type = card.dataset.promo;
        let sorted;
        if (type === 'hot') {
          sorted = [].concat(games).sort((a, b) => {
            const pa = typeof b.players === 'number' ? b.players : (parseInt(b.players) || 0);
            const pb = typeof a.players === 'number' ? a.players : (parseInt(a.players) || 0);
            return pa - pb;
          });
        } else {
          sorted = [].concat(games).sort((a, b) => (b.version || '0.0.0').localeCompare(a.version || '0.0.0'));
        }
        currentCategory = 'all';
        filterByCategory('all');
        currentPage = 1;
        // Override grid with promo sorted games
        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const start = 0;
        const page = sorted.slice(start, start + PAGE_SIZE);
        const grid = $('gameGrid');
        if (grid) grid.innerHTML = page.map(renderCard).join('');
        const rc = $('resultsCount');
        if (rc) rc.textContent = '共 ' + total + ' 款游戏';
        renderPagination(totalPages);
        const catSec = document.querySelector('.game-grid-section');
        if (catSec) catSec.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // CS Browse button
    const csBtn = $('csBrowseBtn');
    if (csBtn) {
      csBtn.addEventListener('click', () => {
        const browseTab = document.querySelector('.nav-link[data-tab="browse"]');
        if (browseTab) browseTab.click();
      });
    }
  }

  // ─── Auth ───
  function openAuth() {
    const modal = $('authModal');
    if (!modal) return;
    modal.classList.add('open');
    const loginForm = $('loginForm');
    const registerForm = $('registerForm');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
  }

  function closeAuth() {
    const modal = $('authModal');
    if (modal) modal.classList.remove('open');
  }

  function showRegister() {
    const loginForm = $('loginForm');
    const registerForm = $('registerForm');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
  }

  function showLogin() {
    const loginForm = $('loginForm');
    const registerForm = $('registerForm');
    if (registerForm) registerForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
  }

  async function handleLogin() {
    const user = $('loginUser');
    const pass = $('loginPass');
    const errorEl = $('authError');
    if (!user || !pass) return;
    const username = user.value.trim();
    const password = pass.value;
    if (!username) { if (errorEl) { errorEl.textContent = '请输入用户名'; errorEl.style.display = 'block'; } return; }
    if (!password || password.length < 4) { if (errorEl) { errorEl.textContent = '密码至少4位'; errorEl.style.display = 'block'; } return; }

    if (errorEl) errorEl.style.display = 'none';
    const btn = $('loginBtn');
    if (btn) { btn.disabled = true; btn.textContent = '登录中...'; }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, password: password })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        closeAuth();
        renderUserBadge();
        await loadFavorites();
        applyFilters();
        showToast('欢迎回来，' + esc(currentUser.name), 'success');
      } else {
        if (errorEl) { errorEl.textContent = data.error || '登录失败'; errorEl.style.display = 'block'; }
      }
    } catch (err) {
      if (errorEl) { errorEl.textContent = '网络错误，请重试'; errorEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '登录'; }
    }
  }

  async function handleRegister() {
    const user = $('regUser');
    const pass = $('regPass');
    const pass2 = $('regPass2');
    const errorEl = $('authError');
    if (!user || !pass || !pass2) return;
    const username = user.value.trim();
    if (!username || !pass.value) { if (errorEl) { errorEl.textContent = '请填写完整信息'; errorEl.style.display = 'block'; } return; }
    if (pass.value !== pass2.value) { if (errorEl) { errorEl.textContent = '两次密码不一致'; errorEl.style.display = 'block'; } return; }
    if (pass.value.length < 4) { if (errorEl) { errorEl.textContent = '密码至少4位'; errorEl.style.display = 'block'; } return; }

    if (errorEl) errorEl.style.display = 'none';
    const btn = $('registerBtn');
    if (btn) { btn.disabled = true; btn.textContent = '注册中...'; }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, password: pass.value })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
        closeAuth();
        renderUserBadge();
        await loadFavorites();
        applyFilters();
        showToast('🎉 注册成功！欢迎 ' + esc(currentUser.name), 'success');
      } else {
        if (errorEl) { errorEl.textContent = data.error || '注册失败'; errorEl.style.display = 'block'; }
      }
    } catch (err) {
      if (errorEl) { errorEl.textContent = '网络错误，请重试'; errorEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '注册'; }
    }
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        renderUserBadge();
        await loadFavorites();
      }
    } catch (e) {
      // Not logged in — this is expected
    }
  }

  function renderUserBadge() {
    if (!currentUser) { renderGuestBadge(); return; }
    const badge = $('userBadge');
    const avatar = $('userAvatar');
    const name = $('userName');
    const authBtn = $('authBtn');
    if (badge) badge.classList.add('logged-in');
    if (avatar) avatar.textContent = (currentUser.name || 'U')[0].toUpperCase();
    if (name) name.textContent = currentUser.name;
    if (authBtn) authBtn.style.display = 'none';
  }

  function renderGuestBadge() {
    const badge = $('userBadge');
    const authBtn = $('authBtn');
    if (badge) badge.classList.remove('logged-in');
    if (authBtn) { authBtn.style.display = 'inline-flex'; authBtn.textContent = '登录'; }
  }

  async function handleLogout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
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
      const res = await fetch('/api/favorites');
      if (res.ok) {
        const data = await res.json();
        const ids = data.favorites || [];
        favoriteIds = new Set(ids);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    }
  }

  // ─── Play Game ───
  function playGame(id) {
    const game = games.find(g => g.id === id);
    if (!game) return;
    const status = game.status === 'playable' || game.playable;
    if (!status) {
      showToast('🔔 ' + game.name + ' 即将上线，敬请期待！', 'info');
      return;
    }
    window.location.href = game.path || '/games/' + game.id + '/';
  }

  // ─── Toggle Favorites ───
  function toggleFav(id) {
    if (!currentUser) { showToast('请先登录以收藏游戏', 'info'); openAuth(); return; }
    const game = games.find(g => g.id === id);
    if (!game) return;

    if (favoriteIds.has(id)) {
      favoriteIds.delete(id);
      showToast('已取消收藏', 'info');
    } else {
      favoriteIds.add(id);
      showToast('❤️ 已添加收藏', 'success');
    }
    applyFilters();

    // Optimistic update — sync with server
    fetch('/api/favorites/' + id, { method: 'POST' }).catch(() => {});
  }

  // ─── Init ───
  async function init() {
    // Expose public API
    window.gameHub = {
      playGame: playGame,
      toggleFav: toggleFav,
      closeAuth: closeAuth,
      showRegister: showRegister,
      showLogin: showLogin
    };

    bindEvents();
    await checkAuth();
    await loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
