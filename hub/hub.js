// CrabCLI Arcade — Hub Client Logic
(function() {
  'use strict';

  // ─── State ───
  let registry = { games: [], categories: [] };
  let filteredGames = [];
  let currentCategory = 'all';
  let currentSort = 'popular';
  let currentUser = null;
  let authAction = 'login'; // 'login' or 'register'
  let searchQuery = '';
  let searchTimeout = null;
  let multiplayerOnly = false;

  // Pagination state
  const PAGE_SIZE = 24;
  let visibleCount = PAGE_SIZE;

  // Favorites state
  let favoriteIds = new Set();
  let favoritesLoading = false;

  // Recently played (localStorage)
  let recentlyPlayed = [];

  // Implemented games (have directories on disk)
  let implementedGames = new Set();

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
  const gamesGrid = $('#games-grid');
  const gamesTitle = $('#games-title');
  const sortSelect = $('#sort-select');
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
  const multiplayerToggle = $('#multiplayer-toggle');

  // Recently played
  const recentlySection = $('#recently-section');
  const recentList = $('#recent-list');

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
  const guestBannerCloseBtn = $('#guest-banner-close');
  const guestBannerSignin = $('#guest-banner-signin');

  // ─── Boot ───
  async function init() {
    showSkeleton();
    await loadRegistry();
    loadRecentlyPlayed();
    hideSkeleton();
    checkGuestBanner();
    await checkAuth();
    renderCategories();
    renderFeatured();
    renderRecentlyPlayed();
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

      // Detect which games are actually implemented by trying to fetch them
      for (const game of registry.games) {
        try {
          const resp = await fetch(`/games/${game.id}/`, { method: 'HEAD' });
          if (resp.ok) {
            implementedGames.add(game.id);
          }
        } catch { /* not implemented */ }
      }
    } catch (err) {
      console.error('Failed to load game registry:', err);
      hideSkeleton();
      gamesGrid.innerHTML = '<div class="no-results"><div class="emoji">🔌</div><p>Failed to load games. Please refresh.</p></div>';
    }
  }

  // ─── Recently Played ───
  function loadRecentlyPlayed() {
    try {
      recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
    } catch {
      recentlyPlayed = [];
    }
  }

  function recordPlayed(gameId) {
    // Remove if already exists
    recentlyPlayed = recentlyPlayed.filter(p => p.id !== gameId);
    // Add to front with timestamp
    recentlyPlayed.unshift({ id: gameId, playedAt: Date.now() });
    // Keep last 10
    recentlyPlayed = recentlyPlayed.slice(0, 10);
    localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    renderRecentlyPlayed();
  }

  function renderRecentlyPlayed() {
    if (recentlyPlayed.length === 0) {
      recentlySection.style.display = 'none';
      return;
    }
    recentlySection.style.display = 'block';
    const games = recentlyPlayed
      .map(p => registry.games.find(g => g.id === p.id))
      .filter(Boolean);

    recentList.innerHTML = games.map(game => {
      const icon = game.icon || CATEGORY_ICONS[game.category] || '🎮';
      const played = recentlyPlayed.find(p => p.id === game.id);
      const timeLabel = timeAgo(played?.playedAt);
      return `
        <a class="recent-card" href="/games/${game.id}/" onclick="recordPlayed('${game.id}')">
          <div class="recent-thumb">${icon}</div>
          <div class="recent-name">${escapeHtml(game.name)}</div>
          <div class="recent-time">${timeLabel}</div>
        </a>
      `;
    }).join('');
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
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
        // Update heart button
        const btn = document.querySelector(`.fav-btn[data-game="${gameId}"]`);
        if (btn) {
          btn.classList.toggle('active', data.favorite);
          btn.classList.add('pulse');
          setTimeout(() => btn.classList.remove('pulse'), 300);
          btn.innerHTML = data.favorite ? '&#10084;' : '&#9825;';
        }
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
      profileFavList.innerHTML = '<div class="profile-fav-empty">No favorites yet. Click ♥ on a game card!</div>';
      return;
    }
    const favGames = registry.games.filter(g => favoriteIds.has(g.id));
    profileFavList.innerHTML = favGames.map(g =>
      `<div class="profile-fav-item" data-game="${g.id}">${g.name}</div>`
    ).join('');

    profileFavList.querySelectorAll('.profile-fav-item').forEach(item => {
      item.addEventListener('click', () => {
        const gameId = item.dataset.game;
        window.location.href = `/games/${gameId}/`;
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
    modalTitle.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
    authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
    $$('.auth-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.action === authAction);
    });
    usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    usernameInput.focus();
  }

  function closeAuthModal() {
    authModal.style.display = 'none';
  }

  // ─── Categories ───
  function renderCategories() {
    const chips = registry.categories.map(cat => `
      <button class="cat-chip ${cat.id === 'all' ? 'active' : ''}" data-category="${cat.id}">
        ${cat.icon || CATEGORY_ICONS[cat.id] || '🎮'} ${cat.name}
      </button>
    `).join('');
    // Add favorites chip for logged-in users
    const favChip = currentUser
      ? `<button class="cat-chip" data-category="favorites">❤️ Favorites</button>`
      : '';
    categoriesNav.innerHTML = chips + favChip;
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
      const icon = game.icon || CATEGORY_ICONS[game.category] || '🎮';
      const isFav = favoriteIds.has(game.id);
      const implemented = implementedGames.has(game.id);
      return `
        <a class="featured-card" href="/games/${game.id}/" onclick="recordPlayed('${game.id}')">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-game="${game.id}" data-featured="true" onclick="event.preventDefault(); event.stopPropagation();">
            ${isFav ? '&#10084;' : '&#9825;'}
          </button>
          <div class="game-icon">${icon}</div>
          <div class="game-name">${escapeHtml(game.name)}</div>
          <div class="game-desc">${escapeHtml(game.description)}</div>
          <div class="game-meta">
            <span>${game.players || '1'} player${(game.players || '1') !== '1' ? 's' : ''}</span>
            ${game.rating ? `<span>⭐ ${game.rating}</span>` : ''}
          </div>
          ${!implemented ? '<div class="coming-soon-badge">Coming Soon</div>' : ''}
        </a>
      `;
    }).join('');

    // Bind featured fav buttons
    featuredList.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(btn.dataset.game);
      });
    });
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

    // Multiplayer filter
    if (multiplayerOnly) {
      filteredGames = filteredGames.filter(g => {
        const p = g.players || '1';
        return p !== '1' && p !== 'single';
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredGames = filteredGames.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
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
      const icon = game.icon || CATEGORY_ICONS[game.category] || '🎮';
      const isFav = favoriteIds.has(game.id);
      const implemented = implementedGames.has(game.id);
      const cardClass = implemented ? 'game-card' : 'game-card coming-soon';

      return `
        <a class="${cardClass}" href="/games/${game.id}/" onclick="recordPlayed('${game.id}')">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-game="${game.id}" onclick="event.preventDefault(); event.stopPropagation();">
            ${isFav ? '&#10084;' : '&#9825;'}
          </button>
          ${!implemented ? '<span class="coming-soon-badge">Coming Soon</span>' : ''}
          <div class="game-icon">${icon}</div>
          <div class="game-name" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
          <div class="game-desc">${escapeHtml(game.description)}</div>
          <div class="game-tags">
            <span class="tag tag-${game.category}">${game.category}</span>
            ${game.rating ? `<span class="game-rating">⭐ ${game.rating}</span>` : ''}
          </div>
          <div class="game-players">👥 ${game.players || '1'}</div>
        </a>
      `;
    }).join('');

    // Bind fav buttons
    gamesGrid.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(btn.dataset.game);
      });
    });
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

    // Sort
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      applyFilters();
    });

    // Multiplayer toggle
    if (multiplayerToggle) {
      multiplayerToggle.addEventListener('click', () => {
        multiplayerOnly = !multiplayerOnly;
        multiplayerToggle.classList.toggle('active', multiplayerOnly);
        applyFilters();
      });
    }

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
        authError.style.display = 'block';
        return;
      }

      authSubmit.disabled = true;
      authSubmit.textContent = 'Loading...';
      authError.style.display = 'none';

      try {
        const endpoint = authAction === 'login' ? '/api/auth/login' : '/api/auth/register';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          authError.textContent = data.error || 'Something went wrong';
          authError.style.display = 'block';
          return;
        }

        currentUser = data.user;
        await loadFavorites();
        renderUserBadge();
        renderCategories();
        checkGuestBanner();
        closeAuthModal();
        // If was on favorites category, re-apply
        if (currentCategory === 'favorites') {
          applyFilters();
        }
      } catch (err) {
        authError.textContent = 'Network error. Please try again.';
        authError.style.display = 'block';
      } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
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
