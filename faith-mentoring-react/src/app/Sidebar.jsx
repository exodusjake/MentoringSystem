import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api.js';
import { on } from '../lib/events.js';
import { getSession } from '../lib/session.js';
import { playLogoutEffect } from '../components/LogoutEffect.js';
import { ConfirmX } from '../components/ConfirmX.jsx';
import { sidebarIdentity } from './portals.js';

const NAV_DELAY = 340;   // the pill glides before the next page shows (sidebar-indicator.js)
const PILL_KEY = 'sbIndicator';

const ss = {
  get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
};

// The portal sidebar (from the original *sidebar.html partials + sidebar scripts + sidebar-indicator.js).
export default function Sidebar({ config, activeId, onNavigate, stylesReady }) {
  const navigate = useNavigate();
  const [identityOverride, setIdentityOverride] = useState(null);   // profile pages refresh the name from the server
  const { name, initials } = identityOverride || sidebarIdentity(config);
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [badge, setBadge] = useState(0);
  const [dept, setDept] = useState('');
  const [pendingId, setPendingId] = useState(null);   // item clicked, highlighted while the pill glides
  const navRef = useRef(null);
  const sidebarRef = useRef(null);
  const pillRef = useRef(null);
  const [pill, setPill] = useState(null);            // { background, boxShadow } once set up

  const shownActive = pendingId || activeId;
  const scrollKey = 'sbScroll:' + config.role;

  // ── Mobile drawer ──
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => { if (window.innerWidth > 768) setOpen(false); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [open]);
  useEffect(() => () => { document.body.style.overflow = ''; }, []);

  // ── Badge + mentor department ──
  useEffect(() => on('annBadge', setBadge), []);
  useEffect(() => on('sidebar:identity', setIdentityOverride), []);
  // The Mentee walkthrough slides the drawer open for its sidebar steps (only the drawer itself, as before).
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => on('sidebar:tourOpen', setTourOpen), []);
  useEffect(() => {
    if (!config.showDept) return;
    const userId = getSession()?.user?.userID;
    apiRequest('MentorProfiles', 'GET', null, true)
      .then(profiles => {
        const profile = (profiles || []).find(p => p.userID === userId);
        if (profile?.school) setDept(profile.school);
      })
      .catch(() => {});   // non-critical, fail silently
  }, [config]);

  // ── Sidebar scroll position (kept across reloads) ──
  useLayoutEffect(() => {
    if (!stylesReady) return;
    const sb = sidebarRef.current;
    const y = parseInt(ss.get(scrollKey), 10);
    if (y > 0) sb.scrollTo({ top: y, behavior: 'instant' });
    const onScroll = () => ss.set(scrollKey, String(sb.scrollTop));
    sb.addEventListener('scroll', onScroll, { passive: true });
    return () => sb.removeEventListener('scroll', onScroll);
  }, [scrollKey, stylesReady]);

  // ── Sliding pill behind the active item ──
  useLayoutEffect(() => {
    if (!stylesReady) return;
    const nav = navRef.current;
    const active = nav.querySelector('.nav-item.active');
    if (!active) return;
    const el = pillRef.current;
    if (!pill) {
      // First paint: copy this portal's active colour, start where the previous page left the
      // pill (no transition), then glide to the active item.
      // Read the settled colour: the item's background transition may still be fading in from the
      // moment the stylesheet arrived.
      const prevTransition = active.style.transition;
      active.style.transition = 'none';
      const bg = getComputedStyle(active).backgroundColor;
      active.style.transition = prevTransition;
      const style = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
        ? { background: bg, boxShadow: '0 4px 12px ' + bg.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ', .28)') }
        : {};
      setPill(style);
      return;
    }
    const top = active.offsetTop, height = active.offsetHeight;
    if (!el.classList.contains('ready')) {
      let prev = null;
      try { prev = JSON.parse(ss.get(PILL_KEY)); } catch (e) {}
      place(el, prev && typeof prev.top === 'number' ? prev : { top, height });
      el.classList.add('ready');
      void el.offsetHeight;   // commit starting position
      el.classList.add('animate');
      requestAnimationFrame(() => place(el, { top, height }));
    } else {
      place(el, { top, height });
    }
    ss.set(PILL_KEY, JSON.stringify({ top, height }));
  }, [pill, shownActive, stylesReady]);

  useEffect(() => {
    const onResize = () => {
      const el = pillRef.current, a = navRef.current?.querySelector('.nav-item.active');
      if (!el || !a) return;
      el.classList.remove('animate');
      place(el, { top: a.offsetTop, height: a.offsetHeight });
      void el.offsetHeight;
      el.classList.add('animate');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { setPendingId(null); }, [activeId]);

  function go(e, item) {
    if (window.innerWidth <= 768) setOpen(false);
    if (!isPlainClick(e)) return;             // let the browser open new tabs etc.
    e.preventDefault();
    if (item.id === shownActive) return;
    setPendingId(item.id);
    ss.set(scrollKey, String(sidebarRef.current.scrollTop));
    onNavigate?.();                           // fade to skeleton while the pill glides
    setTimeout(() => navigate(`${config.base}/${item.path}`), NAV_DELAY);
  }

  function handleLogout() {
    setLoggingOut(true);
    playLogoutEffect();
  }

  return (
    <div id="sidebar-container">
      <button className={'hamburger' + (open ? ' active' : '')} id="hamburger" aria-label="Toggle menu" onClick={() => setOpen(o => !o)}>
        <i className={open ? 'ti ti-x' : 'ti ti-menu-2'}></i>
      </button>

      <div className={'sidebar-overlay' + (open ? ' active' : '')} id="sidebarOverlay" onClick={() => setOpen(false)}></div>

      <aside className={'sidebar' + (open || tourOpen ? ' open' : '')} id="sidebar" ref={sidebarRef}>
        <a href={`${config.base}/${config.profilePath}`} className="sb-profile" id="sbProfileLink"
          onClick={e => { if (isPlainClick(e)) { e.preventDefault(); navigate(`${config.base}/${config.profilePath}`); } }}>
          <div className="sb-avatar" id="sidebarAvatar">{initials}</div>
          <div className="sb-info">
            <div className="sb-name" id="sidebarName">{name}</div>
            {config.roleLabelId
              ? <div className="sb-role" id="sidebarRole">{config.roleLabel}</div>
              : <div className="sb-role">{config.roleLabel}</div>}
            {config.showDept && <div className="sb-dept" id="sidebarDept">{dept}</div>}
          </div>
        </a>

        <nav className={'sidebar-nav' + (pill ? ' has-indicator' : '')} aria-label="Main navigation" ref={navRef}>
          {pill && <div className="sb-indicator" ref={pillRef} style={pill}></div>}
          {config.nav.map(item => item.section
            ? <div key={item.section} className={'nav-section' + (item.normal ? ' nav-section--normal' : '')}>{item.section}</div>
            : (
              <a key={item.id} href={`${config.base}/${item.path}`} className={'nav-item' + (item.id === shownActive ? ' active' : '')}
                id={item.id} onClick={e => go(e, item)}>
                <i className={'ti ' + item.icon}></i>
                {' '}{item.label}{' '}
                {item.badge && <span className="nav-badge" id="annBadge" style={badge > 0 ? undefined : { display: 'none' }}>
                  {badge > 0 ? (badge > 99 ? '99+' : String(badge)) : ''}
                </span>}
              </a>
            ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={() => setLogoutOpen(true)}>
            <i className="ti ti-logout"></i>
            {' '}Log-out
          </button>
        </div>
      </aside>

      <div id="logoutModal" className={'logout-modal-overlay' + (logoutOpen ? ' open' : '')}>
        <div className="logout-modal" data-astra-confirm="1">
          <div className="logout-modal-icon" data-ac="icon">
            <i className="ti ti-logout"></i>
          </div>
          <h3 data-ac="title">Confirm Log-out</h3>
          <p data-ac="body">{config.logoutMessage}</p>
          <div className="logout-modal-btns" data-ac="actions">
            <button className="btn-cancel" onClick={() => setLogoutOpen(false)}>Cancel</button>
            <button className="btn-logout" id="btnLogoutConfirm" disabled={loggingOut} onClick={handleLogout}>
              {loggingOut ? 'Logging out…' : 'Log-out'}
            </button>
          </div>
          <ConfirmX onClick={() => setLogoutOpen(false)} />
        </div>
      </div>
    </div>
  );
}

const isPlainClick = e => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

function place(el, { top, height }) {
  el.style.height = height + 'px';
  el.style.transform = 'translateY(' + top + 'px)';
}
