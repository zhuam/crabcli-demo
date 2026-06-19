// CrabCLI Arcade — Hub Client Logic
(function() {
  'use strict';

  // ─── State ───
  let registry = { games: [], categories: [] };
  let filteredGames = [];
  let currentCategory = 'all';
  let currentSort = 'popular';
  let currentStatus = 'all';
  let currentUser = null;
  let authAction = 'login'; // 'login' or 'register'
  let searchQuery = '';
  let searchTimeout = null;

  // Lockout state
  let lockoutTimer = null;
  let lockoutRetryAfter = 0;

  // Pagination state
  const PAGE_SIZE = 24;
  let visibleCount = PAGE_SIZE;

  // Favorites state
  let favoriteIds = new Set();
  let favoritesLoading = false;

  // ─── Category Icons ───
  const CATEGORY_ICONS = {
    puzzle: '🧩', idle: '🏪', action: '⚡',
    strategy: '♟️', casual: '🎯', all: '🎮'
  };

  // ─── DOM refs ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const searchInput = $('#search-input');
  const categoriesNav = $('#categories');
  const featuredSection = $('#featured-section');
  const featuredList = $('#featured-list');
  const quickAccess = $('#quick-access');
  const quickAccessTitle = $('#quick-access-title');
  const quickAccessSubtitle = $('#quick-access-subtitle');
  const quickAccessList = $('#quick-access-list');
  const gamesGrid = $('#games-grid');
  const gamesTitle = $('#games-title');
  const sortSelect = $('#sort-select');
  const statusFilter = $('#status-filter');
  const gameCount = $('#game-count');
  const totalGames = $('#total-games');
  const authArea = $('#auth-area');
  const authModal = $('#auth-modal');
  const modalTitle = $('#modal-title');
  const modalClose = $('#modal-close');
  const authForm = $('#auth-form');
  const authSubmit = $('#auth-submit');
  const authError = $('#auth-error');
  const usernameInput = $('#username-input');
  const passwordInput = $('#password-input');

  // Skeleton
  const skeletonContainer = $('#skeleton-container');

  // Load more
  const loadMoreWrap = $('#load-more-wrap');
  const loadMoreBtn = $('#load-more-btn');

  // Profile panel
  const profilePanel = $('#profile-panel');
  const profileAvatar = $('#profile-avatar');
  const profileName = $('#profile-name');
  const profileSince = $('#profile-since');
  const profileSignout = $('#profile-signout');
  const profileFavList = $('#profile-fav-list');
  const statGames = $('#stat-games');
  const statScores = $('#stat-scores');
  const statFavorites = $('#stat-favorites');
  let profileOpen = false;

  // Mobile search
  const mobileSearchBtn = $('#mobile-search-btn');
  const mobileSearchBar = $('#mobile-search-bar');
  const mobileSearchInput = $('#mobile-search-input');
  const mobileSearchClose = $('#mobile-search-close');

  // Guest banner
  const guestBanner = $('#guest-banner');
  const guestBannerClose = $('#guest-banner-close');
  const guestBannerSignin = $('#guest-banner-signin') || $('#banner-signin');
  const guestBannerCloseBtn = $('#guest-banner-close') || $('#banner-close');

  // ─── Boot ───
  async function init() {
    showSkeleton();
    await loadRegistry();
    hideSkeleton();
    checkGuestBanner();
    await checkAuth();
    renderCategories();
    renderQuickAccess();
    renderFeatured();
    applyFilters();
    bindEvents();
  }

  // ─── Skeleton ───
  function showSkeleton() {
    gamesGrid.style.display = 'none';
    skeletonContainer.style.display = 'grid';
    skeletonContainer.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      skeletonContainer.innerHTML += `
        <div class="skeleton-card">
          <div class="skeleton skeleton-icon"></div>
          <div class="skeleton skeleton-name"></div>
          <div class="skeleton skeleton-desc"></div>
          <div class="skeleton skeleton-desc"></div>
          <div class="skeleton-tags">
            <div class="skeleton skeleton-tag"></div>
            <div class="skeleton skeleton-tag"></div>
          </div>
        </div>
      `;
    }
  }

  function hideSkeleton() {
    skeletonContainer.style.display = 'none';
    skeletonContainer.innerHTML = '';
    gamesGrid.style.display = '';
  }

  // ─── Load Registry ───
  async function loadRegistry() {
    try {
      const res = await fetch('/api/games');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      registry = await res.json();
      totalGames.textContent = registry.games.length;
    } catch (err) {
      console.error('Failed to load game registry:', err);
      hideSkeleton();
      gamesGrid.innerHTML = '<div class="no-results"><div class="emoji">🔌</div><p>Failed to load games. Please refresh.</p></div>';
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
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        renderUserBadge();
        await loadFavorites();
        checkGuestBanner();
      } else {
        currentUser = null;
        renderGuestBadge();
      }
    } catch {
      currentUser = null;
      renderGuestBadge();
    }
  }

  async function loadFavorites() {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/favorites');
      if (res.ok) {
        const data = await res.json();
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
      const res = await fetch(`/api/favorites/${gameId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.favorite) {
          favoriteIds.add(gameId);
        } else {
          favoriteIds.delete(gameId);
        }
        // Update all heart buttons for this game across cards, featured, and quick access
        document.querySelectorAll(`.fav-btn[data-game="${gameId}"]`).forEach(btn => {
          btn.classList.toggle('active', data.favorite);
          btn.classList.add('pulse');
          setTimeout(() => btn.classList.remove('pulse'), 300);
          btn.innerHTML = data.favorite ? '&#10084;' : '&#9825;';
          btn.setAttribute('aria-label', data.favorite ? 'Remove from favorites' : 'Save to favorites');
        });
        renderQuickAccess();
        // If in favorites category, re-render
        if (currentCategory === 'favorites') {
          applyFilters();
        }
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }

  function renderUserBadge() {
    if (!currentUser) return;
    const initial = (currentUser.name || '?')[0].toUpperCase();
    authArea.innerHTML = `
      <div class="user-badge" id="user-menu-btn" title="${escapeHtml(currentUser.name)}">
        <div class="user-avatar">${initial}</div>
        <span class="user-name">${escapeHtml(currentUser.name)}</span>
      </div>
    `;
    const menuBtn = $('#user-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProfilePanel();
      });
    }
  }

  function renderGuestBadge() {
    authArea.innerHTML = `<button id="auth-btn" class="btn btn-ghost">👤 Sign In</button>`;
    const btn = $('#auth-btn');
    if (btn) btn.addEventListener('click', () => openAuthModal('login'));
    // Close profile panel if open
    if (profileOpen) closeProfilePanel();
  }

  function toggleProfilePanel() {
    if (profileOpen) {
      closeProfilePanel();
    } else {
      openProfilePanel();
    }
  }

  async function openProfilePanel() {
    if (!currentUser) return;
    profileOpen = true;
    profilePanel.style.display = 'block';

    // Set header info
    const initial = (currentUser.name || '?')[0].toUpperCase();
    profileAvatar.textContent = initial;
    profileName.textContent = currentUser.name;
    if (currentUser.createdAt) {
      const date = new Date(currentUser.createdAt);
      profileSince.textContent = `Member since ${date.toLocaleDateString()}`;
    }

    // Fetch stats
    try {
      const [scoresRes] = await Promise.all([
        fetch(`/api/scores?userId=${currentUser.id}`).catch(() => null),
      ]);
      if (scoresRes && scoresRes.ok) {
        const scoresData = await scoresRes.json();
        const scores = scoresData.scores || [];
        statGames.textContent = new Set(scores.map(s => s.gameId)).size;
        statScores.textContent = scores.length;
      } else {
        statGames.textContent = '0';
        statScores.textContent = '0';
      }
    } catch {
      statGames.textContent = '0';
      statScores.textContent = '0';
    }

    // Render favorites
    statFavorites.textContent = favoriteIds.size;
    renderProfileFavorites();

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', closeProfilePanelOutside);
    }, 0);
  }

  function renderProfileFavorites() {
    if (favoriteIds.size === 0) {
      profileFavList.innerHTML = '<div class="profile-fav-empty">No favorites yet. Click ♥ on a game!</div>';
      return;
    }
    const favGames = registry.games.filter(g => favoriteIds.has(g.id));
    profileFavList.innerHTML = favGames.map(g =>
      `<div class="profile-fav-item" data-game="${g.id}">${g.name}</div>`
    ).join('');

    profileFavList.querySelectorAll('.profile-fav-item').forEach(item => {
      item.addEventListener('click', () => {
        const gameId = item.dataset.game;
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
    $$('.auth-tab').forEach(tab => {
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

    lockoutTimer = setInterval(() => {
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
      const mins = Math.floor(lockoutRetryAfter / 60);
      const secs = lockoutRetryAfter % 60;
      authError.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        '<span class="error-msg__text">Account temporarily locked due to multiple failed attempts.' +
        '<span class="error-msg__countdown">' + mins + ':' + String(secs).padStart(2, '0') + '</span>' +
        '<span class="error-msg__countdown-label">until you can try again</span>' +
        '</span>';
      authError.style.display = 'flex';
    }, 1000);

    // Show initial countdown immediately
    const mins = Math.floor(lockoutRetryAfter / 60);
    const secs = lockoutRetryAfter % 60;
    authError.className = 'error-msg error-msg--locked';
    authError.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      '<span class="error-msg__text">Account temporarily locked due to multiple failed attempts.' +
      '<span class="error-msg__countdown">' + mins + ':' + String(secs).padStart(2, '0') + '</span>' +
      '<span class="error-msg__countdown-label">until you can try again</span>' +
      '</span>';
    authError.style.display = 'flex';
  }

  // ─── Categories ───
  function renderCategories() {
    const chips = registry.categories.map(cat => `
      <button class="cat-chip ${cat.id === currentCategory ? 'active' : ''}" data-category="${cat.id}">
        ${cat.icon || CATEGORY_ICONS[cat.id] || '🎮'} ${cat.name}
      </button>
    `).join('');
    const favChip = currentUser
      ? `<button class="cat-chip ${currentCategory === 'favorites' ? 'active' : ''}" data-category="favorites">❤️ Favorites</button>`
      : '';
    categoriesNav.innerHTML = chips + favChip;
  }

  function bindFavoriteButtons(root) {
    root.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(btn.dataset.game);
      });
    });
  }

  function getGameStatus(game) {
    return game.playable || game.status === 'playable' ? 'playable' : 'coming-soon';
  }

  function statusLabel(game) {
    return getGameStatus(game) === 'playable' ? 'Playable' : 'Coming Soon';
  }

  function navigateToGame(gameId) {
    window.location.href = `/games/${encodeURIComponent(gameId)}/`;
  }

  function renderQuickAccess() {
    if (!quickAccess || !quickAccessList) return;
    const playable = registry.games.filter(g => getGameStatus(g) === 'playable');
    const favoriteGames = playable.filter(g => favoriteIds.has(g.id));
    const source = (currentUser && favoriteGames.length > 0 ? favoriteGames : playable)
      .slice()
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.rating || 0) - (a.rating || 0))
      .slice(0, 4);

    if (source.length === 0) {
      quickAccess.style.display = 'none';
      return;
    }

    quickAccess.style.display = 'block';
    quickAccessTitle.textContent = currentUser && favoriteGames.length > 0 ? 'Favorites Quick Access' : 'Quick Access';
    quickAccessSubtitle.textContent = currentUser && favoriteGames.length > 0
      ? 'Your saved playable games'
      : 'Playable picks ready to launch';
    quickAccessList.innerHTML = source.map(game => {
      const isFav = favoriteIds.has(game.id);
      return `
        <a class="quick-card" href="/games/${game.id}/" data-game="${game.id}">
          <span class="quick-icon">${CATEGORY_ICONS[game.category] || '🎮'}</span>
          <span class="quick-copy">
            <strong>${escapeHtml(game.name)}</strong>
            <small>${escapeHtml(game.players || '1')} player${(game.players || '1') !== '1' ? 's' : ''}</small>
          </span>
          <button class="fav-btn ${isFav ? 'active' : ''}" data-game="${game.id}" aria-label="${isFav ? 'Remove from favorites' : 'Save to favorites'}" onclick="event.preventDefault(); event.stopPropagation();">${isFav ? '&#10084;' : '&#9825;'}</button>
        </a>
      `;
    }).join('');
    bindFavoriteButtons(quickAccessList);
  }

  // ─── Featured ───
  function renderFeatured() {
    const featured = registry.games.filter(g => g.featured);
    if (featured.length === 0) {
      featuredSection.style.display = 'none';
      return;
    }
    featuredSection.style.display = 'block';
    featuredList.innerHTML = featured.map(game => {
      const isFav = favoriteIds.has(game.id);
      return `
        <a class="featured-card ${getGameStatus(game) === 'coming-soon' ? 'is-coming-soon' : ''}" href="/games/${game.id}/">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-game="${game.id}" data-featured="true" aria-label="${isFav ? 'Remove from favorites' : 'Save to favorites'}" onclick="event.preventDefault(); event.stopPropagation();">
            ${isFav ? '&#10084;' : '&#9825;'}
          </button>
          <div class="game-icon">${CATEGORY_ICONS[game.category] || '🎮'}</div>
          <div class="game-name">${escapeHtml(game.name)}</div>
          <div class="game-desc">${escapeHtml(game.description)}</div>
          <div class="game-meta">
            <span class="status-badge status-${getGameStatus(game)}">${statusLabel(game)}</span>
            <span>${game.players || '1'} player${(game.players || '1') !== '1' ? 's' : ''}</span>
            ${game.rating ? `<span>⭐ ${game.rating}</span>` : ''}
          </div>
        </a>
      `;
    }).join('');

    bindFavoriteButtons(featuredList);
  }

  // ─── Filter & Sort ───
  function applyFilters() {
    filteredGames = [...registry.games];

    // Favorites filter
    if (currentCategory === 'favorites') {
      filteredGames = filteredGames.filter(g => favoriteIds.has(g.id));
    }
    // Category filter
    else if (currentCategory !== 'all') {
      filteredGames = filteredGames.filter(g => g.category === currentCategory);
    }

    // Availability filter
    if (currentStatus !== 'all') {
      filteredGames = filteredGames.filter(g => getGameStatus(g) === currentStatus);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredGames = filteredGames.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        statusLabel(g).toLowerCase().includes(q) ||
        getGameStatus(g).replace('-', ' ').includes(q) ||
        (g.tags && g.tags.some(t => t.toLowerCase().includes(q)))
      );
    }

    // Sort
    switch (currentSort) {
      case 'popular':
        filteredGames.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'newest':
        filteredGames.sort((a, b) => (b.version || '').localeCompare(a.version || ''));
        break;
      case 'rating':
        filteredGames.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'az':
        filteredGames.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    // Reset pagination
    visibleCount = PAGE_SIZE;
    renderGames();
    updateLoadMore();
  }

  function renderGames() {
    const visibleGames = filteredGames.slice(0, visibleCount);

    if (visibleGames.length === 0 && filteredGames.length === 0) {
      gamesGrid.innerHTML = `
        <div class="no-results">
          <div class="emoji">🔍</div>
          <p>No games found${searchQuery ? ` for "${escapeHtml(searchQuery)}"` : ''}.</p>
          ${currentCategory === 'favorites' ? '<p class="sub">You haven\'t favorited any games yet. Click the heart on a game card!</p>' : ''}
        </div>
      `;
      gameCount.textContent = '0 games';
      return;
    }

    gameCount.textContent = `${filteredGames.length} game${filteredGames.length !== 1 ? 's' : ''}`;
    gamesGrid.innerHTML = visibleGames.map(game => {
      const catIcon = CATEGORY_ICONS[game.category] || '🎮';
      const isFav = favoriteIds.has(game.id);
      return `
        <a class="game-card ${getGameStatus(game) === 'coming-soon' ? 'is-coming-soon' : ''}" href="/games/${game.id}/" aria-label="${escapeHtml(game.name)} - ${statusLabel(game)}">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-game="${game.id}" aria-label="${isFav ? 'Remove from favorites' : 'Save to favorites'}" onclick="event.preventDefault(); event.stopPropagation();">
            ${isFav ? '&#10084;' : '&#9825;'}
          </button>
          <div class="game-icon">${catIcon}</div>
          <div class="card-title-row">
            <div class="game-name" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
            <span class="status-badge status-${getGameStatus(game)}">${statusLabel(game)}</span>
          </div>
          <div class="game-desc">${escapeHtml(game.description)}</div>
          <div class="game-tags">
            <span class="tag tag-${game.category}">${game.category}</span>
            ${game.rating ? `<span class="game-rating">⭐ ${game.rating}</span>` : ''}
          </div>
          <div class="game-players">${getGameStatus(game) === 'playable' ? '▶ Launch' : '⏳ View release page'} · 👥 ${game.players || '1'}</div>
        </a>
      `;
    }).join('');

    bindFavoriteButtons(gamesGrid);
  }

  function updateLoadMore() {
    if (visibleCount >= filteredGames.length) {
      loadMoreWrap.style.display = 'none';
      return;
    }
    loadMoreWrap.style.display = 'flex';
    const remaining = filteredGames.length - visibleCount;
    const nextBatch = Math.min(PAGE_SIZE, remaining);
    loadMoreBtn.textContent = `Show ${nextBatch} of ${remaining} more`;
  }

  function loadMore() {
    visibleCount += PAGE_SIZE;
    renderGames();
    updateLoadMore();
  }

  // ─── Mobile Search ───
  function openMobileSearch() {
    mobileSearchBar.classList.add('visible');
    mobileSearchBar.style.display = '';
    setTimeout(() => mobileSearchInput.focus(), 100);
  }

  function closeMobileSearch() {
    mobileSearchBar.classList.remove('visible');
    mobileSearchBar.style.display = 'none';
    mobileSearchInput.value = '';
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    applyFilters();
  }

  // ─── Events ───
  function bindEvents() {
    // Category chips (event delegation)
    categoriesNav.addEventListener('click', (e) => {
      const chip = e.target.closest('.cat-chip');
      if (!chip) return;
      currentCategory = chip.dataset.category;
      $$('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      gamesTitle.textContent = chip.textContent.trim();
      applyFilters();
    });

    // Desktop search with debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = searchInput.value;
        applyFilters();
      }, 300);
    });

    // Mobile search
    if (mobileSearchBtn) {
      mobileSearchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mobileSearchBar.classList.contains('visible')) {
          closeMobileSearch();
        } else {
          openMobileSearch();
        }
      });
    }
    if (mobileSearchClose) {
      mobileSearchClose.addEventListener('click', closeMobileSearch);
    }
    if (mobileSearchInput) {
      mobileSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchQuery = mobileSearchInput.value;
          // Sync desktop search
          if (searchInput) searchInput.value = searchQuery;
          applyFilters();
        }, 300);
      });
    }

    // Availability filter
    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        currentStatus = statusFilter.value;
        applyFilters();
      });
    }

    // Sort
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      applyFilters();
    });

    // Load more
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', loadMore);
    }

    // Guest banner
    if (guestBannerCloseBtn) {
      guestBannerCloseBtn.addEventListener('click', () => {
        guestBanner.style.display = 'none';
        localStorage.setItem('guestBannerDismissed', '1');
      });
    }
    if (guestBannerSignin) {
      guestBannerSignin.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal('login');
      });
    }

    // Auth modal
    modalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) closeAuthModal();
    });

    // Auth tabs
    $$('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        authAction = tab.dataset.action;
        modalTitle.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
        authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authError.style.display = 'none';
        // Update password autocomplete
        if (passwordInput) {
          passwordInput.setAttribute('autocomplete', authAction === 'login' ? 'current-password' : 'new-password');
        }
      });
    });

    // Auth form submit
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = usernameInput.value.trim();
      const password = passwordInput ? passwordInput.value : '';

      if (!name) return;
      if (!password || password.length < 4) {
        authError.textContent = 'Password must be at least 4 characters';
        authError.className = 'error-msg error-msg--standard';
        authError.style.display = 'flex';
        return;
      }

      // Prevent submit during lockout
      if (lockoutTimer) return;

      authSubmit.disabled = true;
      authSubmit.textContent = 'Loading...';
      authError.style.display = 'none';
      authError.className = 'error-msg';

      try {
        const endpoint = authAction === 'login' ? '/api/auth/login' : '/api/auth/register';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Handle 423 Locked response
          if (res.status === 423 && data.retryAfterSeconds) {
            startLockoutCountdown(data.retryAfterSeconds);
            authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
            return;
          }

          // Handle progressive warning (3-4 failures)
          if (data.warning) {
            authError.className = 'error-msg error-msg--warning';
            authError.innerHTML =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
              '<span class="error-msg__text">' + escapeHtml(data.error) + ' ' + escapeHtml(data.message || '') + '</span>';
            authError.style.display = 'flex';
          } else {
            // Standard error (1-2 failures or other errors)
            authError.className = 'error-msg error-msg--standard';
            authError.innerHTML =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
              '<span class="error-msg__text">' + escapeHtml(data.error || 'Something went wrong') + '</span>';
            authError.style.display = 'flex';
          }
          return;
        }

        currentUser = data.user;
        await loadFavorites();
        renderUserBadge();
        renderCategories();
        renderQuickAccess();
        renderFeatured();
        checkGuestBanner();
        closeAuthModal();
        // If was on favorites category, re-apply
        if (currentCategory === 'favorites') {
          applyFilters();
        }
      } catch (err) {
        authError.className = 'error-msg error-msg--standard';
        authError.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;margin-top:1px"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>' +
          '<span class="error-msg__text">Network error. Please try again.</span>';
        authError.style.display = 'flex';
      } finally {
        if (!lockoutTimer) {
          authSubmit.disabled = false;
          authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
        }
      }
    });

    // Profile signout
    if (profileSignout) {
      profileSignout.addEventListener('click', signOut);
    }

    // Keyboard: Escape to close modals/panels
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (authModal.style.display !== 'none') {
          closeAuthModal();
        } else if (profileOpen) {
          closeProfilePanel();
        } else if (mobileSearchBar && mobileSearchBar.classList.contains('visible')) {
          closeMobileSearch();
        }
      }
    });
  }

  // ─── Utility ───
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Start ───
  init();
})();
