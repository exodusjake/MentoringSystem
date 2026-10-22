import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { clearSession, getSession, isLoggedIn, PORTALS, roleKey } from '../lib/session.js';

// What the vanilla portal pages did on load, combined: requireAuth(role) in the page script (apiClient.js)
// plus the sidebar script's own guard. Mentor/Mentee sidebars ran first and, if setup was still pending,
// cleared the session and went to login; Admin/Head pages sent a pending setup to their setup page.
export function checkPortalAccess(config, pathname) {
  if (!isLoggedIn()) return { to: '/login' };
  const session = getSession();
  if (config.onSetupRequired === 'logout' && session.user?.setupRequired === true) {
    clearSession();
    return { to: '/login' };
  }
  if (roleKey(session.role) !== config.role) return { to: '/login' };
  if (session.user?.setupRequired === true && !pathname.endsWith('/setup')) {
    return { to: PORTALS[roleKey(session.role)].setup };
  }
  return null;
}

export function RequirePortal({ config, children }) {
  const { pathname } = useLocation();
  const denied = checkPortalAccess(config, pathname);
  useRecheckOnReturn(config);
  if (denied) return <Navigate to={denied.to} replace />;
  return children;
}

// Recheck restored pages (back/forward cache) and other tabs logging out, even with Remember me
// (apiClient.js recheckRestoredSession).
function useRecheckOnReturn(config) {
  useEffect(() => {
    const recheck = () => {
      if (!isLoggedIn()) {
        document.documentElement.style.visibility = 'hidden';
        window.location.replace('/login');
        return;
      }
      const denied = checkPortalAccess(config, window.location.pathname);
      if (denied) window.location.href = denied.to;
    };
    const onPageShow = () => recheck();
    const onStorage = e => { if (e.key === 'token' || e.key === null) recheck(); };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('pageshow', onPageShow); window.removeEventListener('storage', onStorage); };
  }, [config]);
}
