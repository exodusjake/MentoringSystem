import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api.js';
import { subscribe as subscribeBadge } from '../lib/announcementBadge.js';
import { useStyle } from '../lib/injectStyle.js';
import { playLogoutEffect } from '../lib/logout.js';
import { getSession } from '../lib/session.js';
import { PORTAL_HEADER_CSS } from './portalHeaderCss.js';

const KEY = 'sbIndicator';
const NAV_DELAY = 340;
const sget = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };
const readPrev = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } };

// The portal sidebar: markup of sidebar.html / mentor-sidebar.html / mentee-sidebar.html, with the
// behaviour of the sidebar scripts (name/avatar, active item, mobile drawer, announcement badge,
// logout modal) and of sidebar-indicator.js (sliding highlight pill, scroll position).
export default function Sidebar({ config, activeId, onNavigate, stylesReady, bell }) {
  useStyle('portal-header', PORTAL_HEADER_CSS);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const userRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [badge, setBadge] = useState(0);
  const [dept, setDept] = useState('');
  const [pendingId, setPendingId] = useState(null);   // item just clicked, highlighted before the route changes
  const sidebarRef = useRef(null);
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const [hasIndicator, setHasIndicator] = useState(false);
  const pillColor = useRef(null);

  // ── Name & avatar from the session ──
  const user = getSession()?.user;
  const first = (config.pascalFallback ? (user?.firstName || user?.FirstName) : user?.firstName) || '';
  const last = (config.pascalFallback ? (user?.lastName || user?.LastName) : user?.lastName) || '';
  const name = user ? (`${first} ${last}`.trim() || config.defaultName) : config.defaultName;
  const initials = user ? (((first[0] || '') + (last[0] || '')).toUpperCase() || config.defaultInitials) : config.defaultInitials;

  useEffect(() => subscribeBadge(setBadge), []);

  // The header pushes the page down (see portalHeaderCss.js). The class goes on <html>: app/Page.jsx rewrites body's class on every route.
  useEffect(() => {
    document.documentElement.classList.add('portal-has-header');
    return () => document.documentElement.classList.remove('portal-has-header');
  }, []);
  // Profile menu: closes on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = e => { if (userRef.current && !userRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  useEffect(() => { setPendingId(null); }, [activeId]);

  // Mentor sidebar: school under the name (non-critical).
  useEffect(() => {
    if (!config.dept || !user?.userID) return;
    let alive = true;
    (async () => {
      try {
        const profiles = await apiRequest('MentorProfiles', 'GET', null, true);
        const profile = (profiles || []).find(p => p.userID === user.userID);
        if (alive && profile?.school) setDept(profile.school);
      } catch (e) { /* non-critical, fail silently */ }
    })();
    return () => { alive = false; };
  }, []);

  // ── Mobile drawer ──
  const close = () => { setOpen(false); };
  const openDrawer = () => { setOpen(true); };
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && open) close(); };
    // Releases the scroll lock if resized past the desktop breakpoint while still open.
    const onResize = () => { if (window.innerWidth > 768 && open) close(); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [open]);

  // ── Sliding indicator (sidebar-indicator.js) ──
  const place = (top, height) => {
    const pill = pillRef.current;
    pill.style.height = height + 'px';
    pill.style.transform = 'translateY(' + top + 'px)';
  };
  const activeEl = () => navRef.current?.querySelector('.nav-item.active');

  // First time the active item exists and the page styles are in: read the portal's active colour (before
  // the pill takes over the highlight), then start where the previous page left the pill and glide.
  useLayoutEffect(() => {
    if (!stylesReady || hasIndicator) return;
    const active = activeEl();
    if (!active) return;
    const pill = pillRef.current;
    const bg = getComputedStyle(active).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      pillColor.current = bg;
      pill.style.background = bg;
      pill.style.boxShadow = '0 4px 12px ' + bg.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ', .28)');
    }
    setHasIndicator(true);
    const sb = sidebarRef.current;
    const y = parseInt(sget('sbScroll:' + config.role), 10);
    if (y > 0) sb.scrollTo({ top: y, behavior: 'instant' });
    const top = active.offsetTop, height = active.offsetHeight;
    const prev = readPrev();
    if (prev && typeof prev.top === 'number') place(prev.top, prev.height);
    else place(top, height);
    pill.classList.add('ready');
    void pill.offsetHeight; // commit starting position
    pill.classList.add('animate');
    requestAnimationFrame(() => place(top, height));
    sset(KEY, JSON.stringify({ top, height }));
  }, [stylesReady, activeId]);

  // Later route changes (e.g. back/forward): glide to the new active item.
  useLayoutEffect(() => {
    if (!hasIndicator) return;
    const active = activeEl();
    if (!active) return;
    place(active.offsetTop, active.offsetHeight);
    sset(KEY, JSON.stringify({ top: active.offsetTop, height: active.offsetHeight }));
  }, [activeId, hasIndicator]);

  useEffect(() => {
    if (!hasIndicator) return;
    const onResize = () => {
      const a = activeEl();
      const pill = pillRef.current;
      if (!a || !pill) return;
      pill.classList.remove('animate');
      place(a.offsetTop, a.offsetHeight);
      void pill.offsetHeight;
      pill.classList.add('animate');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [hasIndicator]);

  // Remember the sidebar's scroll position.
  useEffect(() => {
    const sb = sidebarRef.current;
    const onScroll = () => sset('sbScroll:' + config.role, String(sb.scrollTop));
    sb.addEventListener('scroll', onScroll, { passive: true });
    return () => sb.removeEventListener('scroll', onScroll);
  }, []);

  // Slide immediately on click, hold navigation until the glide finishes.
  const onNavClick = (e, item) => {
    const el = e.currentTarget;
    if (window.innerWidth <= 768) close();
    if (hasIndicator) {
      place(el.offsetTop, el.offsetHeight);
      sset(KEY, JSON.stringify({ top: el.offsetTop, height: el.offsetHeight }));
    }
    const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    if (!plain) return;
    e.preventDefault();
    if (item.id === activeId) return;
    sset('sbScroll:' + config.role, String(sidebarRef.current.scrollTop));
    setPendingId(item.id);   // text/icon colours follow the pill straight away
    onNavigate();   // fade to skeleton while the pill glides
    setTimeout(() => navigate(`${config.base}/${item.to}`), NAV_DELAY);
  };

  // Everything the page stylesheets style stays hidden until they are in (no unstyled flash on load).
  const hide = stylesReady ? undefined : { visibility: 'hidden' };
  const profileHref = `${config.base}/${config.profilePath}`;

  // The profile card was a plain link in vanilla (a normal page load, with the skeleton showing while it loads).
  const onProfileClick = e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (window.location.pathname === profileHref) return;
    onNavigate();
    navigate(profileHref);
  };

  const goProfile = () => {
    setMenuOpen(false);
    if (window.location.pathname === profileHref) return;
    onNavigate();
    navigate(profileHref);
  };

  const handleLogout = () => {
    setLoggingOut(true);
    playLogoutEffect();
  };

  return (
    <>
      <button className={`hamburger${open ? ' active' : ''}`} id="hamburger" aria-label="Toggle menu" style={hide}
        onClick={() => (open ? close() : openDrawer())}>
        <i className={`ti ${open ? 'ti-x' : 'ti-menu-2'}`}></i>
      </button>

      <div className={`sidebar-overlay${open ? ' active' : ''}`} id="sidebarOverlay" onClick={close} style={hide}></div>

      <header className="portal-header" style={hide}>
        <div className="ph-brand">
          <img src="/IMAGES/LOGO-mark.png" alt="" />
          <div className="ph-brand-text">A Mentoring Management and Monitoring System</div>
        </div>
        <div className="ph-actions">
          <button type="button" className="ph-theme" aria-label="Switch light or dark mode" title="Light / dark mode"
            onClick={() => window.astraToggleTheme?.()}>
            <i className="ti ti-sun ic-sun"></i><i className="ti ti-moon ic-moon"></i>
          </button>
          {bell}
        <div className="ph-user" ref={userRef}>
          <button type="button" className="ph-user-btn" aria-label="Account menu" aria-haspopup="menu" aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}>
            <span className="ph-avatar" id="sidebarAvatar">{initials}</span>
            <span className="ph-user-text">
              <span className="ph-user-name" id="sidebarName">{name}</span>
              <span className="ph-user-role" id={config.role === 'head' || config.role === 'admin' ? 'sidebarRole' : undefined}>{config.roleLabel}{dept ? ` · ${dept}` : ''}</span>
            </span>
          </button>
          <div className={`ph-menu${menuOpen ? ' open' : ''}`} role="menu">
            <button type="button" className="ph-item" role="menuitem" onClick={goProfile}><i className="ti ti-user-circle"></i> Profile</button>
            <button type="button" className="ph-item danger" role="menuitem" onClick={() => { setMenuOpen(false); setLogoutOpen(true); }}><i className="ti ti-logout"></i> Log out</button>
          </div>
        </div>
        </div>
      </header>

      <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar" ref={sidebarRef}
        style={hide}>
        <nav className={`sidebar-nav${hasIndicator ? ' has-indicator' : ''}`} aria-label="Main navigation" ref={navRef}>
          <div className="sb-indicator" ref={pillRef}></div>
          {config.nav.map((item, i) => item.section ? (
            <div key={i} className={`nav-section${item.className ? ' ' + item.className : ''}`}>{item.section}</div>
          ) : (
            <a key={item.id} href={`${config.base}/${item.to}`} id={item.id}
              className={`nav-item${item.id === (pendingId || activeId) ? ' active' : ''}`}
              onClick={e => onNavClick(e, item)}>
              <i className={`ti ${item.icon}`}></i>
              {item.label}
              {item.badge ? (
                <span className="nav-badge" id="annBadge" style={badge > 0 ? undefined : { display: 'none' }}>
                  {badge > 99 ? '99+' : String(badge)}
                </span>
              ) : null}
            </a>
          ))}
        </nav>

      </aside>

      <div id="logoutModal" className={`logout-modal-overlay${logoutOpen ? ' open' : ''}`} style={hide}>
        <div className="logout-modal">
          <div className="logout-modal-icon">
            <i className="ti ti-logout"></i>
          </div>
          <h3>Confirm Log-out</h3>
          <p>{config.logoutMessage}</p>
          <div className="logout-modal-btns">
            <button className="btn-cancel" onClick={() => setLogoutOpen(false)}>Cancel</button>
            <button className="btn-logout" id="btnLogoutConfirm" disabled={loggingOut} onClick={handleLogout}>{loggingOut ? 'Logging out…' : 'Log-out'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
