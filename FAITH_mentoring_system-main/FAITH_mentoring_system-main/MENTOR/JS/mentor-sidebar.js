/* ============================================================
   ASTRA MENTOR — mentor-sidebar.js
   ============================================================ */

(function () {
  'use strict';

  (function guardSetup() {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      if (user && user.setupRequired === true) {
        ['token', 'role', 'user', '_sessionType'].forEach(k => {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        });
        window.location.href = '/LOGIN/HTML/login.html';
      }
    } catch (e) {}
  })();

  const PAGE_NAV_MAP = {
    'mentor-dashboard.html': 'nav-dashboard',
    'my-mentees.html':       'nav-mentees',
    'sessions.html':         'nav-sessions',
    'availability.html':     'nav-availability',
    'logsheet.html':         'nav-logsheet',
    'my-activities.html':    'nav-activities',
    'announcements.html':    'nav-announce',
    'calendar.html':         'nav-calendar',
    'profile.html':          'nav-profile',
  };

  function injectSidebar(callback) {
    const container = document.getElementById('sidebar-container');
    if (!container) { callback(); return; }

    const base = document.querySelector('base')?.href || window.location.href;
    const sidebarUrl = new URL('/MENTOR/HTML/mentor-sidebar.html', base).href;

    fetch(sidebarUrl)
      .then(r => r.text())
      .then(html => { container.innerHTML = html; callback(); })
      .catch(() => callback());
  }

  function loadSession() {
    try {
      const session = typeof getSession === 'function' ? getSession() : null;
      if (!session?.user) return;

      const first    = session.user.firstName || '';
      const last     = session.user.lastName  || '';
      const name     = `${first} ${last}`.trim() || 'Mentor User';
      const initials = (first[0] || '') + (last[0] || '');

      const nameEl   = document.getElementById('sidebarName');
      const avatarEl = document.getElementById('sidebarAvatar');
      if (nameEl)   nameEl.textContent   = name;
      if (avatarEl) avatarEl.textContent = initials.toUpperCase() || 'MU';

      loadDept(session.user.userID);
    } catch (e) {
      console.warn('Sidebar: could not load session.', e);
    }
  }

  async function loadDept(userId) {
    try {
      const profiles = await apiRequest('MentorProfiles', 'GET', null, true);
      const profile  = (profiles || []).find(p => p.userID === userId);
      if (!profile) return;

      const deptEl = document.getElementById('sidebarDept');
      if (deptEl && profile.school) deptEl.textContent = profile.school;
    } catch (e) { /* non-critical, fail silently */ }
  }

  function setActiveNav() {
    const page  = window.location.pathname.split('/').pop() || 'mentor-dashboard.html';
    const navId = PAGE_NAV_MAP[page];

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    if (navId) {
      const el = document.getElementById(navId);
      if (el) { el.classList.add('active'); return; }
    }

    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('href') === page) item.classList.add('active');
    });
  }

  function initMobile() {
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebarOverlay');
    const hamburger = document.getElementById('hamburger');
    if (!sidebar || !overlay || !hamburger) return;

    const hamburgerIcon = hamburger.querySelector('i');
    // Swaps to an X and slides to the drawer's open edge.
    function open() {
      sidebar.classList.add('open');    overlay.classList.add('active');
      hamburger.classList.add('active');
      if (hamburgerIcon) hamburgerIcon.className = 'ti ti-x';
      document.body.style.overflow = 'hidden';
    }
    function close() {
      sidebar.classList.remove('open'); overlay.classList.remove('active');
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

  function refreshAnnBadge() {
    try {
      const session = typeof getSession === 'function' ? getSession() : null;
      const userId  = session?.user?.userID;
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

      // New admin announcements visible to this mentor
      const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
      const visibleItems = announcements.filter(a => {
        if (a.postedByUserID === userId) return false;
        if (!a.isActive) return false;
        const ta = (a.targetAudience || '').toLowerCase();
        return ta === 'both' || ta === 'mentor';
      });
      const annCount = !lastRead
        ? visibleItems.length
        : visibleItems.filter(a => new Date(a.postedAt) > new Date(lastRead)).length;

      // New comments on mentor's own posts
      const latestCommentAt = commentRes.status === 'fulfilled' ? commentRes.value?.latestCommentAt : null;
      const hasNewComment   = latestCommentAt && (!lastRead || new Date(latestCommentAt) > new Date(lastRead));

      return annCount + (hasNewComment ? 1 : 0);
    } catch (e) {}
  }

  function init() {
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
  const btn = document.getElementById('btnLogoutConfirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Logging out…'; }
  if (typeof playLogoutEffect === 'function') { playLogoutEffect(); return; }
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
