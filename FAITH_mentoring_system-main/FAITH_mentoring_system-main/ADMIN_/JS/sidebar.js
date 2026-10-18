/* ============================================================
   ASTRA — sidebar.js
   Handles: dynamic sidebar inject, session-based name/avatar,
            mobile toggle, active page highlighting, logout modal.
   ============================================================ */

(function () {
  'use strict';

  // ── Page → nav-id map ──
  const PAGE_NAV_MAP = {
    'dashboard.html':          'nav-dashboard',
    'user-management.html':    'nav-users',
    'attendance-logs.html':    'nav-attendance',
    'attendance-detail.html':  'nav-attendance',
    'sessions.html':           'nav-sessions',
    'sessions-detail.html':    'nav-sessions',
    'session-proofs.html':     'nav-proofs',
    'evaluation-ratings.html': 'nav-ratings',
    'announcements.html':             'nav-announce',
    'calendar-events.html':    'nav-calendar',
    'evaluation-forms.html':   'nav-eval',
    'profile.html':            'nav-profile',
    'settings.html':           'nav-settings',
  };

  // ── Inject sidebar.html into #sidebar-container if present ──
  function injectSidebar(callback) {
    const container = document.getElementById('sidebar-container');
    if (!container) { callback(); return; }

    const base = document.querySelector('base')?.href || window.location.href;
    const sidebarUrl = new URL('/ADMIN_/HTML/sidebar.html', base).href;

    fetch(sidebarUrl)
      .then(r => r.text())
      .then(html => {
        container.innerHTML = html;
        // Re-run any <script> tags inside the fetched HTML (none expected, but safe)
        callback();
      })
      .catch(() => callback());
  }

  // ── Enforce admin-only access ──
  function enforceRole() {
    const role = (typeof getSession === 'function' ? getSession()?.role : null) || '';
    if (role.toLowerCase() !== 'admin') {
      window.location.href = '/LOGIN/HTML/login.html';
    }
  }

  // ── Populate name & avatar from session ──
  function loadSession() {
    try {
      const session = typeof getSession === 'function' ? getSession() : null;
      if (!session?.user) return;

      const first    = session.user.firstName || session.user.FirstName || '';
      const last     = session.user.lastName  || session.user.LastName  || '';
      const name     = `${first} ${last}`.trim() || 'Admin User';
      const initials = (first[0] || '') + (last[0] || '');

      const nameEl   = document.getElementById('sidebarName');
      const avatarEl = document.getElementById('sidebarAvatar');
      const roleEl   = document.getElementById('sidebarRole');
      if (nameEl)   nameEl.textContent   = name;
      if (avatarEl) avatarEl.textContent = initials.toUpperCase() || 'AU';
      if (roleEl)   roleEl.textContent   = 'Administrator';
    } catch (e) {
      console.warn('Sidebar: could not load session.', e);
    }
  }

  // ── Set active nav item based on current page ──
  function setActiveNav() {
    const page     = window.location.pathname.split('/').pop() || 'dashboard.html';
    const navId    = PAGE_NAV_MAP[page];
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => item.classList.remove('active'));

    if (navId) {
      const el = document.getElementById(navId);
      if (el) { el.classList.add('active'); return; }
    }

    // Fallback: match by href
    navItems.forEach(item => {
      if (item.getAttribute('href') === page) item.classList.add('active');
    });
  }

  // ── Mobile sidebar toggle ──
  function initMobile() {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburger');
    if (!sidebar || !overlay || !hamburger) return;

    const hamburgerIcon = hamburger.querySelector('i');

    // Swaps to an X and slides to the drawer's open edge.
    function open() {
      sidebar.classList.add('open');
      overlay.classList.add('active');
      hamburger.classList.add('active');
      if (hamburgerIcon) hamburgerIcon.className = 'ti ti-x';
      document.body.style.overflow = 'hidden';
    }
    function close() {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
      hamburger.classList.remove('active');
      if (hamburgerIcon) hamburgerIcon.className = 'ti ti-menu-2';
      document.body.style.overflow = '';
    }

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

  // ── Announcement badge ──
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

      const [annRes, commentRes] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true),
      ]);

      // New announcements from others (e.g. Head Admin) — Admin's own
      // Announcements page shows every audience unfiltered (Admin
      // oversees all of them), so unlike Mentor/Mentee there's no
      // targetAudience check here, just "not posted by me".
      const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
      const visibleItems  = announcements.filter(a =>
        a.postedByUserID !== userId && a.isActive);
      const annCount = !lastRead
        ? visibleItems.length
        : visibleItems.filter(a => new Date(a.postedAt) > new Date(lastRead)).length;

      // New comments on Admin's own posts
      const latestCommentAt = commentRes.status === 'fulfilled' ? commentRes.value?.latestCommentAt : null;
      const hasNewComment   = latestCommentAt && (!lastRead || new Date(latestCommentAt) > new Date(lastRead));

      return annCount + (hasNewComment ? 1 : 0);
    } catch (e) {}
  }

  // ── Init ──
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

/* ── Logout modal (global, called from sidebar.html onclick) ── */
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