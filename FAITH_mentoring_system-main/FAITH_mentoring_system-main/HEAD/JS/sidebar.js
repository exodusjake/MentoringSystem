/* ============================================================
   HEAD ADMIN — sidebar.js
   ============================================================ */

(function () {
  'use strict';

  const PAGE_NAV_MAP = {
    'head-dashboard.html':    'nav-dashboard',
    'mentor-performance.html':'nav-performance',
    'mentor-detail.html':     'nav-performance',
    'attendance-summary.html':'nav-attendance',
    'attendance-detail.html': 'nav-attendance',
    'proof-tracking.html':    'nav-proof',
    'evaluation-ratings.html':'nav-ratings',
    'announcements.html':     'nav-announcements',
    'evaluation-forms.html':  'nav-eval',
    'calendar.html':          'nav-calendar',
    'account.html':           'nav-profile',
  };

  function enforceRole() {
    const role = (typeof getSession === 'function' ? getSession()?.role : null) || '';
    if (role.toLowerCase() !== 'head') {
      window.location.href = '/LOGIN/HTML/login.html';
    }
  }

  function injectSidebar(callback) {
    const container = document.getElementById('sidebar-container');
    if (!container) { callback(); return; }
    const base = document.querySelector('base')?.href || window.location.href;
    const sidebarUrl = new URL('/HEAD/HTML/sidebar.html', base).href;
    fetch(sidebarUrl)
      .then(r => r.text())
      .then(html => { container.innerHTML = html; callback(); })
      .catch(() => callback());
  }

  function loadSession() {
    try {
      const session = typeof getSession === 'function' ? getSession() : null;
      if (!session?.user) return;
      const first    = session.user.firstName || session.user.FirstName || '';
      const last     = session.user.lastName  || session.user.LastName  || '';
      const name     = `${first} ${last}`.trim() || 'Head Admin';
      const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'HA';
      const nameEl   = document.getElementById('sidebarName');
      const avatarEl = document.getElementById('sidebarAvatar');
      if (nameEl)   nameEl.textContent   = name;
      if (avatarEl) avatarEl.textContent = initials;
    } catch (e) {}
  }

  function setActiveNav() {
    const page  = window.location.pathname.split('/').pop() || 'head-dashboard.html';
    const navId = PAGE_NAV_MAP[page];
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (navId) {
      const el = document.getElementById(navId);
      if (el) el.classList.add('active');
    }
  }

  function initMobile() {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburger');
    if (!sidebar || !overlay || !hamburger) return;
    const hamburgerIcon = hamburger.querySelector('i');
    // Swaps to an X and slides to the drawer's open edge.
    const open  = () => {
      sidebar.classList.add('open');    overlay.classList.add('active');
      hamburger.classList.add('active');
      if (hamburgerIcon) hamburgerIcon.className = 'ti ti-x';
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      sidebar.classList.remove('open'); overlay.classList.remove('active');
      hamburger.classList.remove('active');
      if (hamburgerIcon) hamburgerIcon.className = 'ti ti-menu-2';
      document.body.style.overflow = '';
    };
    hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    overlay.addEventListener('click', close);
    // Esc closes the drawer for keyboard users, same as clicking the overlay.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
    });
    // Releases the scroll lock if resized past the desktop breakpoint while still open.
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && sidebar.classList.contains('open')) close();
    });
    document.querySelectorAll('.nav-item').forEach(item =>
      item.addEventListener('click', () => { if (window.innerWidth <= 768) close(); })
    );
  }

  // Head's own Announcements page only shows posts Head made themselves
  // ("HEAD admin only sees their own posts" — see HEAD/JS/announcements.js),
  // not a general inbox like Admin's — so unlike Admin/Mentor/Mentee this
  // only tracks new comments on Head's own posts, not new posts from
  // others, since the page has nowhere to show the latter.
  function refreshAnnBadge() {
    try {
      const session = typeof getSession === 'function' ? getSession() : null;
      const userId  = session?.user?.userID || session?.user?.UserID;
      if (!userId) return;

      AnnouncementBadge.refresh(userId, lastRead => computeFreshBadge(userId, lastRead));
    } catch (e) {}
  }

  async function computeFreshBadge(userId, lastRead) {
    try {
      if (typeof apiRequest !== 'function') return;
      const res = await apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true);
      const latestCommentAt = res?.latestCommentAt || null;

      const hasNewComment = latestCommentAt && (!lastRead || new Date(latestCommentAt) > new Date(lastRead));
      return hasNewComment ? 1 : 0;
    } catch (e) {}
  }

  function init() {
    enforceRole();
    injectSidebar(() => {
      loadSession();
      setActiveNav();
      initMobile();
      refreshAnnBadge();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

function showLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.classList.add('open');
}
function hideLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.classList.remove('open');
}
function handleLogout() {
  if (typeof clearSession === 'function') clearSession();
  window.location.href = '/LOGIN/HTML/login.html';
}

// Pull-to-refresh — only active when installed as a standalone PWA.
(function initPullToRefresh() {
  if (!('ontouchstart' in window)) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (!isStandalone) return;

  const THRESHOLD = 70;
  let startY = null;
  let active = false;

  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<span class="spinner"></span>';
  document.body.appendChild(indicator);

  function reset() {
    indicator.style.transform = 'translate(-50%, -60px)';
    indicator.classList.remove('ptr-ready');
    active = false;
    startY = null;
  }

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0 && e.touches.length === 1) {
      startY  = e.touches[0].clientY;
      active  = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!active || startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { reset(); return; }
    const pull = Math.min(dy, 120);
    indicator.style.transform = `translate(-50%, ${pull - 60}px)`;
    indicator.classList.toggle('ptr-ready', dy >= THRESHOLD);
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!active) return;
    if (indicator.classList.contains('ptr-ready')) {
      location.reload();
    } else {
      reset();
    }
  }, { passive: true });
})();
