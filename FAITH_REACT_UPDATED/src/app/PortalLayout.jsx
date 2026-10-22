import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { refresh as refreshBadge } from '../lib/announcementBadge.js';
import { useStyle } from '../lib/injectStyle.js';
import { getSession } from '../lib/session.js';
import { RequirePortal } from './guards.jsx';
import Sidebar from './Sidebar.jsx';
import { SIDEBAR_INDICATOR_CSS } from './sidebarIndicatorCss.js';

const ChromeContext = createContext(null);
export const usePortalChrome = () => useContext(ChromeContext);

// Shell for every portal page except setup: guard, sidebar, skeleton screen, announcement badge and
// pull-to-refresh. The page itself renders through <Outlet/> inside its own <Page>.
export default function PortalLayout({ config, wrap: Wrap }) {
  const shell = <PortalShell config={config} />;
  return (
    <RequirePortal config={config}>
      {Wrap ? <Wrap>{shell}</Wrap> : shell}
    </RequirePortal>
  );
}

function PortalShell({ config }) {
  useStyle('sidebar-indicator', SIDEBAR_INDICATOR_CSS);
  const { pathname } = useLocation();
  const section = pathname.slice(config.base.length + 1).split('/')[0];
  const active = config.nav.find(item => item.to === section);
  const skelRef = useRef(null);
  // The sidebar's look comes from the page stylesheets; it measures itself once they are in.
  const [stylesReady, setStylesReady] = useState(false);

  // ── Skeleton screen over the content area while a page loads (sidebar-indicator.js) ──
  const showSkel = useCallback(() => {
    const skel = skelRef.current;
    skel.style.display = '';
    void skel.offsetWidth;   // restart from opacity 0 so the fade-in still plays
    skel.classList.add('show');
  }, []);
  const pageReady = useCallback(() => {
    setStylesReady(true);
    setTimeout(() => skelRef.current?.classList.remove('show'), 250);
  }, []);
  useEffect(() => {
    const skel = skelRef.current;
    // Once faded out, take it out of rendering (its shimmer would otherwise keep repainting).
    const onEnd = e => { if (e.target === skel && !skel.classList.contains('show')) skel.style.display = 'none'; };
    skel.addEventListener('transitionend', onEnd);
    const onPageShow = e => { if (e.persisted) skel.classList.remove('show'); };
    window.addEventListener('pageshow', onPageShow);
    return () => { skel.removeEventListener('transitionend', onEnd); window.removeEventListener('pageshow', onPageShow); };
  }, []);

  // ── Announcement badge: refreshed on every page, like each vanilla page load ──
  useEffect(() => {
    try {
      const user = getSession()?.user;
      const userId = config.pascalFallback ? (user?.userID || user?.UserID) : user?.userID;
      if (!userId) return;
      refreshBadge(userId, lastRead => config.freshBadge(userId, lastRead), section === 'announcements');
    } catch (e) {}
  }, [pathname]);

  usePullToRefresh();

  return (
    <ChromeContext.Provider value={{ pageReady }}>
      <Sidebar config={config} activeId={active?.id} onNavigate={showSkel} stylesReady={stylesReady} />
      <Outlet />
      <div className="page-skel show" aria-hidden="true" ref={skelRef}>
        <div className="sk sk-title"></div>
        <div className="sk-row"><div className="sk sk-card"></div><div className="sk sk-card"></div><div className="sk sk-card"></div><div className="sk sk-card"></div></div>
        <div className="sk sk-block"></div><div className="sk sk-block short"></div>
      </div>
    </ChromeContext.Provider>
  );
}

// Pull-to-refresh — only active when installed as a standalone PWA (it lived in each sidebar script).
function usePullToRefresh() {
  useEffect(() => {
    if (!('ontouchstart' in window)) return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
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
    const onStart = e => { if (window.scrollY === 0 && e.touches.length === 1) { startY = e.touches[0].clientY; active = true; } };
    const onMove = e => {
      if (!active || startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { reset(); return; }
      const pull = Math.min(dy, 120);
      indicator.style.transform = `translate(-50%, ${pull - 60}px)`;
      indicator.classList.toggle('ptr-ready', dy >= THRESHOLD);
    };
    const onEnd = () => {
      if (!active) return;
      if (indicator.classList.contains('ptr-ready')) location.reload();
      else reset();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      indicator.remove();
    };
  }, []);
}
