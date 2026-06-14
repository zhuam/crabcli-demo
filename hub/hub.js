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

  // ─── Boot ───
  async function init() {
    await loadRegistry();
    checkAuth();
    renderCategories();
    renderFeatured();
    applyFilters();
    bindEvents();
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
      gamesGrid.innerHTML = '<div class="no-results"><div class="emoji">🔌</div><p>Failed to load games. Please refresh.</p></div>';
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
      } else {
        currentUser = null;
        renderGuestBadge();
      }
    } catch {
      currentUser = null;
      renderGuestBadge();
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
    $('#user-menu-btn').addEventListener('click', () => {
      if (confirm(`Sign out as "${currentUser.name}"?`)) {
        document.cookie = 'token=; Path=/; Max-Age=0';
        currentUser = null;
        renderGuestBadge();
      }
    });
  }

  function renderGuestBadge() {
    authArea.innerHTML = `<button id="auth-btn" class="btn btn-ghost">👤 Sign In</button>`;
    $('#auth-btn').addEventListener('click', openAuthModal);
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
    usernameInput.focus();
  }

  function closeAuthModal() {
    authModal.style.display = 'none';
  }

  // ─── Categories ───
  function renderCategories() {
    categoriesNav.innerHTML = registry.categories.map(cat => `
      <button class="cat-chip ${cat.id === 'all' ? 'active' : ''}" data-category="${cat.id}">
        ${cat.icon || CATEGORY_ICONS[cat.id] || '🎮'} ${cat.name}
      </button>
    `).join('');
  }

  // ─── Featured ───
  function renderFeatured() {
    const featured = registry.games.filter(g => g.featured);
    if (featured.length === 0) {
      featuredSection.style.display = 'none';
      return;
    }
    featuredSection.style.display = 'block';
    featuredList.innerHTML = featured.map(game => `
      <a class="featured-card" href="/games/${game.id}/">
        <div class="game-icon">${CATEGORY_ICONS[game.category] || '🎮'}</div>
        <div class="game-name">${escapeHtml(game.name)}</div>
        <div class="game-desc">${escapeHtml(game.description)}</div>
        <div class="game-meta">
          <span>${game.players || '1'} player${(game.players || '1') !== '1' ? 's' : ''}</span>
          ${game.rating ? `<span>⭐ ${game.rating}</span>` : ''}
        </div>
      </a>
    `).join('');
  }

  // ─── Filter & Sort ───
  function applyFilters() {
    filteredGames = [...registry.games];

    // Category filter
    if (currentCategory !== 'all') {
      filteredGames = filteredGames.filter(g => g.category === currentCategory);
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

    renderGames();
  }

  function renderGames() {
    if (filteredGames.length === 0) {
      gamesGrid.innerHTML = `
        <div class="no-results">
          <div class="emoji">🔍</div>
          <p>No games found${searchQuery ? ` for "${escapeHtml(searchQuery)}"` : ''}.</p>
        </div>
      `;
      gameCount.textContent = '0 games';
      return;
    }

    gameCount.textContent = `${filteredGames.length} game${filteredGames.length !== 1 ? 's' : ''}`;
    gamesGrid.innerHTML = filteredGames.map(game => {
      const catIcon = CATEGORY_ICONS[game.category] || '🎮';
      return `
        <a class="game-card" href="/games/${game.id}/">
          <div class="game-icon">${catIcon}</div>
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

    // Search with debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = searchInput.value;
        applyFilters();
      }, 300);
    });

    // Sort
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      applyFilters();
    });

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
      });
    });

    // Auth form submit
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = usernameInput.value.trim();
      if (!name) return;

      authSubmit.disabled = true;
      authSubmit.textContent = 'Loading...';
      authError.style.display = 'none';

      try {
        const endpoint = authAction === 'login' ? '/api/auth/login' : '/api/auth/register';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });

        const data = await res.json();

        if (!res.ok) {
          authError.textContent = data.error || 'Something went wrong';
          authError.style.display = 'block';
          return;
        }

        currentUser = data.user;
        renderUserBadge();
        closeAuthModal();
      } catch (err) {
        authError.textContent = 'Network error. Please try again.';
        authError.style.display = 'block';
      } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = authAction === 'login' ? 'Sign In' : 'Create Account';
      }
    });

    // Keyboard: Escape to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && authModal.style.display !== 'none') {
        closeAuthModal();
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
