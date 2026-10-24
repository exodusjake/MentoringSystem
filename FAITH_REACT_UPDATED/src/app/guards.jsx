import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiRequest } from '../lib/api.js';
import { clearSession, getSession, isLoggedIn, PORTALS, roleKey, tokenClaims } from '../lib/session.js';

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

// The checks above only read what the browser holds, and anything in DevTools can be edited. The server is the one
// that knows who the token belongs to, so a portal stays blank until GET Users/<id from the token> comes back with
// this portal's role. A forged or edited token fails there (401) and the session is cleared.
let verifiedToken = null;
function useServerVerified(config) {
  const token = localStorage.getItem('token');
  const [ok, setOk] = useState(!!token && verifiedToken === token);
  useEffect(() => {
    if (!token || verifiedToken === token) { setOk(!!token); return undefined; }
    let live = true;
    const id = tokenClaims(token)?.userId ?? getSession().user?.userID;
    const deny = () => { clearSession(); window.location.replace('/login'); };
    apiRequest(`Users/${id}`, 'GET', null, true)
      .then(u => {
        if (roleKey(u?.role) !== config.role) return deny();
        verifiedToken = token;
        if (live) setOk(true);
      })
      .catch(e => {
        if (e?.status === 401 || e?.status === 403 || e?.status === 404) return deny();
        // Server unreachable / erroring: the API enforces access on every call anyway, so don't lock people out.
        if (live) setOk(true);
      });
    return () => { live = false; };
  }, [token, config.role]);
  return ok;
}

export function RequirePortal({ config, children }) {
  const { pathname } = useLocation();
  const denied = checkPortalAccess(config, pathname);
  const verified = useServerVerified(config);
  useRecheckOnReturn(config);
  if (denied) return <Navigate to={denied.to} replace />;
  return verified ? children : null;
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
