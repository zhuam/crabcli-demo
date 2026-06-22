// CrabCLI Arcade — Hub Client Logic (v3 Glassmorphism)
(function() {
  'use strict';

  // ─── State ───
  let registry = { games: [], categories: [] };
  let filteredGames = [];
  let currentCategory = 'all';
  let currentSort = 'popular';
  let currentUser = null;
  let authAction = 'login';
  let searchQuery = '';
  let searchTimeout = null;

  // Lockout state
  let lockoutTimer = null;
  let lockoutRetryAfter = 0;

  // Pagination
  const PAGE_SIZE = 24;
  let visibleCount = PAGE_SIZE;

  // Favorites
  let favoriteIds = new Set();

  // Hero carousel
  let heroIndex = 0;
  let heroTimer = null;

  // ─── Category icons (matches registry) ───
  const CATEGORY_ICONS = {
    puzzle: '🧩', idle: '🏪', action: '⚡',
    strategy: '♟️', casual: '🎯', all: '🎮'
  };
  const CATEGORY_GRADIENTS = {
    puzzle: 'var(--cat-puzzle)',
    idle: 'var(--cat-idle)',
    action: 'var(--cat-action)',
    strategy: 'var(--cat-strategy)',
    casual: 'var(--cat-casual)'
  };
  const GAME_ICONS = {
    'idle-dungeon-heroes': '⚔️'
  };
  function gameIcon(game) {
    return GAME_ICONS[game.id] || CATEGORY_ICONS[game.category] || '🎮';
  }
  function getCatGradient(cat) {
    return CATEGORY_GRADIENTS[cat] || 'var(--cat-puzzle)';
  }

  // ─── DOM refs ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const el = (id) => document.getElementById(id);

  const searchInput = el('search-input');
  const searchClear = el('search-clear');
  const searchOverlay = el('search-overlay');
  const searchOverlayContent = el('search-overlay-content');
  const categoryScroll = el('category-scroll');
  const heroSlides = el('hero-slides');
  const heroDots = el('hero-dots');
  const gamesGrid = el('games-grid');
  const resultsCount = el('results-count');
  const loadMoreWrap = el('load-more-wrap');
  const loadMoreBtn = el('load-more-btn');
  const authArea = el('auth-area');
  const authModal = el('auth-modal');
  const modalTitle = el('modal-title');
  const modalClose = el('modal-close');
  const authForm = el('auth-form');
  const authSubmit = el('auth-submit');
  const authError = el('auth-error');
  const usernameInput = el('username-input');
  const passwordInput = el('password-input');

  // Profile panel
  const profilePanel = el('profile-panel');
  const profileAvatar = el('profile-avatar');
  const profileName = el('profile-name');
  const profileSince = el('profile-since');
  const profileSignout = el('profile-signout');
  const profileFavList = el('profile-fav-list');
  const statGames = el('stat-games');
  const statScores = el('stat-scores');
  const statFavorites = el('stat-favorites');
  let profileOpen = false;

  // Mobile
  const mobileSearchBtn = el('auth-btn');
  const mobileSearchBar = el('mobile-search-bar');
  const mobileSearchInput = el('mobile-search-input');
  const mobileSearchClose = el('mobile-search-close');
  const mobileNav = el('mobile-nav');

  // Toast
  const toastContainer = el('toast-container');

  // Guest banner
  const guestBanner = el('guest-banner');
  const guestBannerSignin = el('banner-signin');
  const guestBannerCloseBtn = el('banner-close');

  // ─── Boot ───
  async function init() {
    showSkeleton();
    await loadRegistry();
    hideSkeleton();
    checkGuestBanner();
    await checkAuth();
    renderHero();
    renderCategories();
    applyFilters();
    setupEvents();
    setupSearch();
    setupSortChips();
    setupMobileNav();
  }

  // ─── Toast System ───
  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = '<span style="font-weight:700">' + (icons[type] || 'ℹ') + '</span> ' + message;
    toastContainer.appendChild(toast);
    setTimeout(function() {
      toast.classList.add('toast-exit');
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 200);
    }, duration);
  }

  // ─── Skeleton ───
  function showSkeleton() {
    gamesGrid.innerHTML = '';
    gamesGrid.style.display = 'grid';
    var html = '';
    for (var i = 0; i < 8; i++) {
      html += '<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-body"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>';
    }
    gamesGrid.innerHTML = html;
  }

  function hideSkeleton() {
    // skeleton is replaced when renderGames runs
  }

  // ─── Load Registry ───
  async function loadRegistry() {
    try {
      var res = await fetch('/api/games');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      registry = await res.json();
    } catch (err) {
      console.error('Failed to load game registry:', err);
      gamesGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔌</div><div class="empty-title">Failed to load games</div><div class="empty-desc">Please refresh the page to try again.</div></div>';
      gamesGrid.style.display = 'grid';
    }
  }

  // ─── Guest Banner ───
  function checkGuestBanner() {
    if (!currentUser && !localStorage.getItem('guestBannerDismissed')) {
      guestBanner.style.display = 'flex';
    } else {
      guestBanner.style.display = 'none';
    }
  }

  // ─── Auth ───
  async function checkAuth() {
    try {
      var res = await fetch('/api/auth/me');
      if (res.ok) {
        var data = await res.json();
        currentUser = data.user;
        renderUserBadge();
        await loadFavorites();
        checkGuestBanner();
      } else {
        currentUser = null;
        renderGuestBadge();
      }
    } catch (e) {
      currentUser = null;
      renderGuestBadge();
    }
  }

  async function loadFavorites() {
    if (!currentUser) return;
    try {
      var res = await fetch('/api/favorites');
      if (res.ok) {
        var data = await res.json();
        favoriteIds = new Set(data.favorites || []);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    }
  }

  async function toggleFavorite(gameId) {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    try {
      var res = await fetch('/api/favorites/' + gameId, { method: 'POST' });
      if (res.ok) {
        var data = await res.json();
        if (data.favorite) {
          favoriteIds.add(gameId);
        } else {
          favoriteIds.delete(gameId);
        }
        // Update all fav buttons
        $$('.game-card-fav[data-game-id="' + gameId + '"]').forEach(function(btn) {
          btn.classList.toggle('active', data.favorite);
          btn.textContent = data.favorite ? '❤️' : '🤍';
        });
        if (currentCategory === 'favorites') applyFilters();
        showToast(data.favorite ? 'Added to favorites!' : 'Removed from favorites', data.favorite ? 'success' : 'info', 2000);
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }

  function renderUserBadge() {
    if (!currentUser) return;
    var initial = (currentUser.name || '?')[0].toUpperCase();
    authArea.innerHTML =
      '<button class="header-btn" id="fav-header-btn" title="Favorites">❤️</button>' +
      '<div class="user-badge" id="user-menu-btn">' +
        '<div class="user-avatar">' + initial + '</div>' +
        '<span class="user-name">' + escapeHtml(currentUser.name) + '</span>' +
      '</div>';
    el('user-menu-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      toggleProfilePanel();
    });
    el('fav-header-btn').addEventListener('click', function() {
      currentCategory = 'favorites';
      applyFilters();
      renderCategories();
      updateNavTabs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function renderGuestBadge() {
    authArea.innerHTML =
      '<button class="header-btn" id="fav-header-btn" title="Favorites">❤️</button>' +
      '<button class="header-btn" id="auth-btn" title="Profile">👤</button>';
    el('auth-btn').addEventListener('click', function() { openAuthModal('login'); });
    el('fav-header-btn').addEventListener('click', function() {
      currentCategory = 'favorites';
      applyFilters();
      renderCategories();
      updateNavTabs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    if (profileOpen) closeProfilePanel();
  }

  function toggleProfilePanel() {
    if (profileOpen) closeProfilePanel();
    else openProfilePanel();
  }

  async function openProfilePanel() {
    if (!currentUser) return;
    profileOpen = true;
    profilePanel.style.display = 'block';
    var initial = (currentUser.name || '?')[0].toUpperCase();
    profileAvatar.textContent = initial;
    profileName.textContent = currentUser.name;
    if (currentUser.createdAt) {
      var date = new Date(currentUser.createdAt);
      profileSince.textContent = 'Member since ' + date.toLocaleDateString();
    }
    try {
      var scoresRes = await fetch('/api/scores?userId=' + currentUser.id).catch(function() { return null; });
      if (scoresRes && scoresRes.ok) {
        var scoresData = await scoresRes.json();
        var scores = scoresData.scores || [];
        statGames.textContent = new Set(scores.map(function(s) { return s.gameId; })).size;
        statScores.textContent = scores.length;
      } else {
        statGames.textContent = '0';
        statScores.textContent = '0';
      }
    } catch (e) {
      statGames.textContent = '0';
      statScores.textContent = '0';
    }
    statFavorites.textContent = favoriteIds.size;
    renderProfileFavorites();
    setTimeout(function() {
      document.addEventListener('click', closeProfilePanelOutside);
    }, 0);
  }

  function renderProfileFavorites() {
    if (favoriteIds.size === 0) {
      profileFavList.innerHTML = '<div class="profile-fav-empty">No favorites yet.</div>';
      return;
    }
    var favGames = registry.games.filter(function(g) { return favoriteIds.has(g.id); });
    profileFavList.innerHTML = favGames.map(function(g) {
      return '<div class="profile-fav-item" data-game="' + g.id + '">' + escapeHtml(g.name) + '</div>';
    }).join('');
    profileFavList.querySelectorAll('.profile-fav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var gameId = item.dataset.game;
        navigateToGame(gameId);
      });
    });
  }

  function closeProfilePanel() {
    profileOpen = false;
    profilePanel.style.display = 'none';
    document.removeEventListener('click', closeProfilePanelOutside);
  }

  function closeProfilePanelOutside(e) {
    if (!profilePanel.contains(e.target) && e.target.id !== 'user-menu-btn' && !e.target.closest('#user-menu-btn')) {
      closeProfilePanel();
    }
  }

  async function signOut() {
    document.cookie = 'token=; Path=/; Max-Age=0';
    currentUser = null;
    favoriteIds.clear();
    closeProfilePanel();
    renderGuestBadge();
    if (currentCategory === 'favorites') {
      currentCategory = 'all';
      applyFilters();
    }
    showToast('Signed out successfully', 'info');
  }

  function openAuthModal(action) {
    authAction = action || 'login';
    authModal.style.display = 'flex';
    authError.style.display = 'none';
    authError.className = 'error-msg';
    modalTitle.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
    authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
    authSubmit.disabled = false;
    usernameInput.classList.remove('input-locked');
    usernameInput.readOnly = false;
    if (passwordInput) {
      passwordInput.classList.remove('input-locked');
      passwordInput.readOnly = false;
    }
    $$('.auth-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.action === authAction);
    });
    usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    usernameInput.focus();
  }

  function closeAuthModal() {
    authModal.style.display = 'none';
    clearLockoutTimer();
  }

  function clearLockoutTimer() {
    if (lockoutTimer) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
    }
    lockoutRetryAfter = 0;
  }

  function startLockoutCountdown(retryAfterSeconds) {
    clearLockoutTimer();
    lockoutRetryAfter = retryAfterSeconds;
    authSubmit.disabled = true;
    usernameInput.classList.add('input-locked');
    usernameInput.readOnly = true;
    if (passwordInput) {
      passwordInput.classList.add('input-locked');
      passwordInput.readOnly = true;
    }
    lockoutTimer = setInterval(function() {
      lockoutRetryAfter -= 1;
      if (lockoutRetryAfter <= 0) {
        clearLockoutTimer();
        authError.style.display = 'none';
        authError.className = 'error-msg';
        authSubmit.disabled = false;
        usernameInput.classList.remove('input-locked');
        usernameInput.readOnly = false;
        if (passwordInput) {
          passwordInput.classList.remove('input-locked');
          passwordInput.readOnly = false;
        }
        return;
      }
      var mins = Math.floor(lockoutRetryAfter / 60);
      var secs = lockoutRetryAfter % 60;
      authError.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        '<span class="error-msg__text">Account temporarily locked due to multiple failed attempts.' +
        '<span class="error-msg__countdown">' + mins + ':' + String(secs).padStart(2, '0') + '</span>' +
        '<span class="error-msg__countdown-label">until you can try again</span>' +
        '</span>';
      authError.style.display = 'flex';
    }, 1000);
    var mins = Math.floor(lockoutRetryAfter / 60);
    var secs = lockoutRetryAfter % 60;
    authError.className = 'error-msg error-msg--locked';
    authError.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      '<span class="error-msg__text">Account temporarily locked due to multiple failed attempts.' +
      '<span class="error-msg__countdown">' + mins + ':' + String(secs).padStart(2, '0') + '</span>' +
      '<span class="error-msg__countdown-label">until you can try again</span>' +
      '</span>';
    authError.style.display = 'flex';
  }

  // ─── Hero Carousel ───
  function renderHero() {
    var featured = registry.games.filter(function(g) { return g.featured; });
    if (!featured.length) {
      el('hero-section').style.display = 'none';
      return;
    }
    el('hero-section').style.display = 'block';

    heroSlides.innerHTML = featured.map(function(g, i) {
      var catName = '';
      registry.categories.forEach(function(c) { if (c.id === g.category) catName = c.name; });
      return '<div class="hero-slide' + (i === 0 ? ' active' : '') + '" data-index="' + i + '">' +
        '<div class="hero-bg" style="background:' + getCatGradient(g.category) + '"></div>' +
        '<div class="hero-bg-gradient"></div>' +
        '<div class="hero-content">' +
          '<span class="hero-category-tag">' + catName + '</span>' +
          '<h1 class="hero-title">' + escapeHtml(g.name) + '</h1>' +
          '<p class="hero-desc">' + escapeHtml(g.description) + '</p>' +
          '<div class="hero-meta">' +
            '<span class="hero-stars">' + starsHTML(g.rating) + ' ' + g.rating + '</span>' +
            '<span class="hero-players">👥 ' + g.players + '</span>' +
          '</div>' +
          '<a class="hero-btn" href="/games/' + g.id + '/">▶ Play Now</a>' +
        '</div>' +
      '</div>';
    }).join('');

    heroDots.innerHTML = featured.map(function(_, i) {
      return '<button class="hero-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" aria-label="Slide ' + (i+1) + '"></button>';
    }).join('');
  }

  function goHero(dir) {
    var slides = heroSlides.querySelectorAll('.hero-slide');
    var dots = heroDots.querySelectorAll('.hero-dot');
    var total = slides.length;
    var idx = heroIndex + dir;
    if (idx < 0) idx = total - 1;
    if (idx >= total) idx = 0;
    goToHero(idx);
  }

  function goToHero(idx) {
    var slides = heroSlides.querySelectorAll('.hero-slide');
    var dots = heroDots.querySelectorAll('.hero-dot');
    slides.forEach(function(s) { s.classList.remove('active'); });
    dots.forEach(function(d) { d.classList.remove('active'); });
    if (slides[idx]) slides[idx].classList.add('active');
    if (dots[idx]) dots[idx].classList.add('active');
    heroIndex = idx;
  }

  function startHeroAuto() {
    clearInterval(heroTimer);
    heroTimer = setInterval(function() { goHero(1); }, 6000);
    var carousel = el('hero-carousel');
    carousel.addEventListener('mouseenter', function() { clearInterval(heroTimer); });
    carousel.addEventListener('mouseleave', startHeroAuto);
  }

  // ─── Categories ───
  function renderCategories() {
    var cats = registry.categories || [];
    categoryScroll.innerHTML = cats.map(function(cat) {
      var count = cat.id === 'all' ? registry.games.length : registry.games.filter(function(g) { return g.category === cat.id; }).length;
      return '<button class="category-tile' + (currentCategory === cat.id ? ' active' : '') + '" data-cat="' + cat.id + '">' +
        '<span class="cat-icon">' + (cat.icon || CATEGORY_ICONS[cat.id] || '🎮') + '</span>' +
        '<span class="cat-name">' + cat.name + '</span>' +
        '<span class="cat-count">' + count + ' games</span>' +
      '</button>';
    }).join('');

    // Favorites tile if logged in
    if (currentUser) {
      var favTile = document.createElement('button');
      favTile.className = 'category-tile' + (currentCategory === 'favorites' ? ' active' : '');
      favTile.dataset.cat = 'favorites';
      favTile.innerHTML = '<span class="cat-icon">❤️</span><span class="cat-name">Favorites</span><span class="cat-count">' + favoriteIds.size + ' games</span>';
      categoryScroll.appendChild(favTile);
    }
  }

  // ─── Sort Chips ───
  function setupSortChips() {
    el('sort-chips').addEventListener('click', function(e) {
      var chip = e.target.closest('.sort-chip');
      if (!chip) return;
      el('sort-chips').querySelectorAll('.sort-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      currentSort = chip.dataset.sort;
      applyFilters();
    });
  }

  // ─── Filter & Sort ───
  function applyFilters() {
    filteredGames = [].concat(registry.games);

    if (currentCategory === 'favorites') {
      filteredGames = filteredGames.filter(function(g) { return favoriteIds.has(g.id); });
    } else if (currentCategory !== 'all') {
      filteredGames = filteredGames.filter(function(g) { return g.category === currentCategory; });
    }

    if (searchQuery.trim()) {
      var q = searchQuery.toLowerCase();
      filteredGames = filteredGames.filter(function(g) {
        return g.name.toLowerCase().indexOf(q) !== -1 ||
               g.description.toLowerCase().indexOf(q) !== -1 ||
               g.category.toLowerCase().indexOf(q) !== -1 ||
               (g.tags && g.tags.some(function(t) { return t.toLowerCase().indexOf(q) !== -1; }));
      });
    }

    switch (currentSort) {
      case 'popular':
        filteredGames.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
        break;
      case 'newest':
        filteredGames.sort(function(a, b) { return (b.version || '').localeCompare(a.version || ''); });
        break;
      case 'rating':
        filteredGames.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
        break;
      case 'az':
        filteredGames.sort(function(a, b) { return a.name.localeCompare(b.name); });
        break;
    }

    visibleCount = PAGE_SIZE;
    renderGames();
    updateLoadMore();
  }

  function starsHTML(rating) {
    if (!rating) return '';
    var full = Math.floor(rating);
    var half = rating % 1 >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function renderGames() {
    var visibleGames = filteredGames.slice(0, visibleCount);

    if (visibleGames.length === 0 && filteredGames.length === 0) {
      gamesGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No games found</div><div class="empty-desc">' +
        (currentCategory === 'favorites' ? 'You haven\'t favorited any games yet. Click 🤍 on a game card!' : (searchQuery ? 'No results for "' + escapeHtml(searchQuery) + '"' : 'Try a different category')) +
        '</div></div>';
      resultsCount.textContent = '0 games';
      return;
    }

    resultsCount.textContent = filteredGames.length + ' game' + (filteredGames.length !== 1 ? 's' : '');

    var html = '';
    for (var i = 0; i < visibleGames.length; i++) {
      var g = visibleGames[i];
      var isFav = favoriteIds.has(g.id);
      var catName = '';
      registry.categories.forEach(function(c) { if (c.id === g.category) catName = c.name; });
      var delay = (i % 24) * 30;

      html += '<a class="game-card" href="/games/' + g.id + '/" data-game-id="' + g.id + '" style="animation-delay:' + delay + 'ms">' +
        '<div class="game-card-cover" style="background:' + getCatGradient(g.category) + '">' +
          '<span class="cover-icon">' + gameIcon(g) + '</span>' +
          '<div class="play-overlay"><div class="play-btn-circle">▶</div></div>' +
        '</div>' +
        '<div class="game-card-body">' +
          '<div class="game-card-title-row">' +
            '<span class="game-card-title" title="' + escapeAttr(g.name) + '">' + escapeHtml(g.name) + '</span>' +
            '<button class="game-card-fav' + (isFav ? ' active' : '') + '" data-game-id="' + g.id + '" aria-label="Toggle favorite">' + (isFav ? '❤️' : '🤍') + '</button>' +
          '</div>' +
          '<div class="game-card-desc">' + escapeHtml(g.description) + '</div>' +
          '<div class="game-card-meta">' +
            '<span class="card-tag">' + catName + '</span>' +
            (g.rating ? '<span class="card-stars">' + starsHTML(g.rating) + '</span>' : '') +
            '<span class="card-players">👥 ' + g.players + '</span>' +
          '</div>' +
        '</div>' +
      '</a>';
    }
    gamesGrid.innerHTML = html;

    // Bind favorite buttons
    gamesGrid.querySelectorAll('.game-card-fav').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(btn.dataset.gameId);
      });
    });
  }

  function updateLoadMore() {
    if (visibleCount >= filteredGames.length) {
      loadMoreWrap.style.display = 'none';
      return;
    }
    loadMoreWrap.style.display = 'block';
    var remaining = filteredGames.length - visibleCount;
    var nextBatch = Math.min(PAGE_SIZE, remaining);
    loadMoreBtn.textContent = 'Show ' + nextBatch + ' more';
  }

  function loadMore() {
    visibleCount += PAGE_SIZE;
    renderGames();
    updateLoadMore();
  }

  function navigateToGame(gameId) {
    window.location.href = '/games/' + encodeURIComponent(gameId) + '/';
  }

  // ─── Search ───
  function setupSearch() {
    searchInput.addEventListener('input', function() {
      clearTimeout(searchTimeout);
      var q = searchInput.value;
      if (searchClear) searchClear.classList.toggle('visible', q.length > 0);

      searchTimeout = setTimeout(function() {
        searchQuery = q;
        applyFilters();
        renderSearchOverlay(q);
      }, 150);
    });

    if (searchClear) {
      searchClear.addEventListener('click', function() {
        searchInput.value = '';
        searchQuery = '';
        searchClear.classList.remove('visible');
        applyFilters();
        closeSearchOverlay();
        searchInput.focus();
      });
    }

    searchInput.addEventListener('focus', function() {
      if (searchInput.value.trim()) renderSearchOverlay(searchInput.value);
    });

    searchInput.addEventListener('blur', function() {
      setTimeout(closeSearchOverlay, 200);
    });

    // Keyboard shortcut: "/" to focus search
    document.addEventListener('keydown', function(e) {
      if (e.key === '/') {
        var tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          searchInput.focus();
        }
      }
      if (e.key === 'Escape') {
        closeSearchOverlay();
        searchInput.blur();
        if (authModal.style.display !== 'none') closeAuthModal();
        else if (profileOpen) closeProfilePanel();
      }
    });
  }

  function renderSearchOverlay(query) {
    if (!query.trim()) { closeSearchOverlay(); return; }
    if (!searchOverlay) return;

    var q = query.toLowerCase();
    var matchedGames = registry.games.filter(function(g) {
      return g.name.toLowerCase().indexOf(q) !== -1 || g.description.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 5);

    var matchedCats = (registry.categories || []).filter(function(c) {
      return c.id !== 'all' && c.name.toLowerCase().indexOf(q) !== -1;
    });

    if (!matchedGames.length && !matchedCats.length) {
      searchOverlayContent.innerHTML = '<div class="search-overlay-empty">No results for "' + escapeHtml(query) + '"</div>';
      searchOverlay.classList.add('active');
      return;
    }

    var html = '';
    if (matchedGames.length) {
      html += '<div class="search-overlay-section"><div class="search-overlay-section-title">Games</div>';
      matchedGames.forEach(function(g) {
        var catName = '';
        registry.categories.forEach(function(c) { if (c.id === g.category) catName = c.name; });
        var highlightedName = g.name.replace(new RegExp(escapeRegex(q), 'gi'), function(m) {
          return '<strong style="color:var(--primary)">' + m + '</strong>';
        });
        html += '<div class="search-overlay-item" data-game-id="' + g.id + '">' +
          '<div class="item-cover" style="background:' + getCatGradient(g.category) + '">' + gameIcon(g) + '</div>' +
          '<div class="item-info"><div class="item-name">' + highlightedName + '</div><div class="item-category">' + catName + '</div></div>' +
        '</div>';
      });
      html += '</div>';
    }

    if (matchedCats.length) {
      html += '<div class="search-overlay-section"><div class="search-overlay-section-title">Categories</div>';
      matchedCats.forEach(function(c) {
        html += '<div class="search-overlay-item" data-cat="' + c.id + '"><div class="item-info"><div class="item-name">' + (c.icon || CATEGORY_ICONS[c.id] || '🎮') + ' ' + c.name + '</div></div></div>';
      });
      html += '</div>';
    }

    html += '<div class="search-overlay-section" style="border-top:1px solid var(--glass-border);padding-top:8px;margin-top:4px">' +
      '<div class="search-overlay-item" style="color:var(--primary);font-weight:500;font-size:0.8rem" data-view-all>' +
        '<span>→ View all results</span>' +
      '</div>' +
    '</div>';

    searchOverlayContent.innerHTML = html;
    searchOverlay.classList.add('active');

    // Bind overlay clicks
    searchOverlayContent.querySelectorAll('[data-game-id]').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = item.dataset.gameId;
        navigateToGame(id);
        closeSearchOverlay();
      });
    });
    searchOverlayContent.querySelectorAll('[data-cat]').forEach(function(item) {
      item.addEventListener('click', function() {
        currentCategory = item.dataset.cat;
        applyFilters();
        renderCategories();
        closeSearchOverlay();
      });
    });
    var viewAll = searchOverlayContent.querySelector('[data-view-all]');
    if (viewAll) viewAll.addEventListener('click', closeSearchOverlay);
  }

  function closeSearchOverlay() {
    if (searchOverlay) searchOverlay.classList.remove('active');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── Mobile Bottom Nav ───
  function setupMobileNav() {
    if (!mobileNav) return;
    mobileNav.addEventListener('click', function(e) {
      var tab = e.target.closest('.nav-tab');
      if (!tab) return;

      mobileNav.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');

      switch (tab.dataset.tab) {
        case 'home':
          currentCategory = 'all';
          searchQuery = '';
          searchInput.value = '';
          applyFilters();
          renderCategories();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'search':
          searchInput.focus();
          break;
        case 'favorites':
          currentCategory = 'favorites';
          applyFilters();
          renderCategories();
          break;
        case 'profile':
          if (currentUser) {
            toggleProfilePanel();
          } else {
            openAuthModal('login');
          }
          break;
      }
    });
  }

  function updateNavTabs() {
    // Helper to sync nav tabs with current state
  }

  // ─── Events ───
  function setupEvents() {
    // Category scroll delegation
    if (categoryScroll) {
      categoryScroll.addEventListener('click', function(e) {
        var tile = e.target.closest('.category-tile');
        if (!tile) return;
        currentCategory = tile.dataset.cat;
        categoryScroll.querySelectorAll('.category-tile').forEach(function(t) { t.classList.remove('active'); });
        tile.classList.add('active');
        applyFilters();
        // Update mobile nav
        if (mobileNav) {
          mobileNav.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
          var homeTab = mobileNav.querySelector('[data-tab="home"]');
          if (homeTab) homeTab.classList.add('active');
        }
      });
    }

    // Hero controls
    var heroPrev = el('hero-prev');
    var heroNext = el('hero-next');
    if (heroPrev) heroPrev.addEventListener('click', function() { clearInterval(heroTimer); goHero(-1); });
    if (heroNext) heroNext.addEventListener('click', function() { clearInterval(heroTimer); goHero(1); });
    if (heroDots) {
      heroDots.addEventListener('click', function(e) {
        var dot = e.target.closest('.hero-dot');
        if (dot) {
          clearInterval(heroTimer);
          goToHero(parseInt(dot.dataset.index));
        }
      });
    }
    // Start auto-play after hero renders
    if (registry.games.filter(function(g) { return g.featured; }).length > 0) {
      startHeroAuto();
    }

    // Load more
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMore);
    }

    // Guest banner
    if (guestBannerCloseBtn) {
      guestBannerCloseBtn.addEventListener('click', function() {
        guestBanner.style.display = 'none';
        localStorage.setItem('guestBannerDismissed', '1');
      });
    }
    if (guestBannerSignin) {
      guestBannerSignin.addEventListener('click', function(e) {
        e.preventDefault();
        openAuthModal('login');
      });
    }

    // Auth modal
    if (modalClose) modalClose.addEventListener('click', closeAuthModal);
    if (authModal) {
      authModal.addEventListener('click', function(e) {
        if (e.target === authModal) closeAuthModal();
      });
    }

    // Auth tabs
    $$('.auth-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        authAction = tab.dataset.action;
        modalTitle.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
        authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
        $$('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        authError.style.display = 'none';
        if (passwordInput) {
          passwordInput.setAttribute('autocomplete', authAction === 'login' ? 'current-password' : 'new-password');
        }
      });
    });

    // Auth form submit
    if (authForm) {
      authForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var name = usernameInput.value.trim();
        var password = passwordInput ? passwordInput.value : '';
        if (!name) return;
        if (!password || password.length < 4) {
          authError.textContent = 'Password must be at least 4 characters';
          authError.className = 'error-msg error-msg--standard';
          authError.style.display = 'flex';
          return;
        }
        if (lockoutTimer) return;
        authSubmit.disabled = true;
        authSubmit.textContent = 'Loading...';
        authError.style.display = 'none';
        authError.className = 'error-msg';

        try {
          var endpoint = authAction === 'login' ? '/api/auth/login' : '/api/auth/register';
          var res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, password: password }),
          });
          var data = await res.json();
          if (!res.ok) {
            if (res.status === 423 && data.retryAfterSeconds) {
              startLockoutCountdown(data.retryAfterSeconds);
              authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
              return;
            }
            if (data.warning) {
              authError.className = 'error-msg error-msg--warning';
              authError.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
                '<span class="error-msg__text">' + escapeHtml(data.error) + ' ' + escapeHtml(data.message || '') + '</span>';
              authError.style.display = 'flex';
            } else {
              authError.className = 'error-msg error-msg--standard';
              authError.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
                '<span class="error-msg__text">' + escapeHtml(data.error || 'Something went wrong') + '</span>';
              authError.style.display = 'flex';
            }
            return;
          }
          currentUser = data.user;
          await loadFavorites();
          renderUserBadge();
          renderCategories();
          checkGuestBanner();
          closeAuthModal();
          if (currentCategory === 'favorites') applyFilters();
          showToast('Signed in as ' + escapeHtml(currentUser.name), 'success', 3000);
        } catch (err) {
          authError.className = 'error-msg error-msg--standard';
          authError.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>' +
            '<span class="error-msg__text">Network error. Please try again.</span>';
          authError.style.display = 'flex';
        } finally {
          if (!lockoutTimer) {
            authSubmit.disabled = false;
            authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
          }
        }
      });
    }

    // Profile signout
    if (profileSignout) {
      profileSignout.addEventListener('click', signOut);
    }

    // Mobile search
    if (mobileSearchBtn) {
      mobileSearchBtn.addEventListener('click', function(e) {
        // Only as fallback — header search is visible on mobile with new layout
        if (window.innerWidth <= 480) {
          searchInput.focus();
        }
      });
    }
    if (mobileSearchClose && mobileSearchBar) {
      mobileSearchClose.addEventListener('click', function() {
        mobileSearchBar.style.display = 'none';
        mobileSearchInput.value = '';
        searchQuery = '';
        applyFilters();
      });
    }
    if (mobileSearchInput) {
      mobileSearchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          searchQuery = mobileSearchInput.value;
          if (searchInput) searchInput.value = searchQuery;
          applyFilters();
        }, 300);
      });
    }
  }

  // ─── Utility ───
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Start ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
