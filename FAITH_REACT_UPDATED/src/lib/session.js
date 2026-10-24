// Login session in localStorage (same keys as the vanilla app, so existing sessions carry over).
export function saveSession(token, role, user, rememberMe = true) {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("_sessionType", "local");
}

// Claims inside the login token. The browser can't verify the signature, so these are only as trustworthy as the
// server's check (verifySession in app/guards.jsx), but unlike the localStorage copies they can't be changed
// without invalidating the token. JwtSecurityTokenHandler writes the short names (role / nameid).
export function tokenClaims(token = localStorage.getItem('token')) {
    try {
        const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const p = JSON.parse(decodeURIComponent(escape(atob(b64))));
        const pick = (short, long) => p[short] ?? p['http://schemas.microsoft.com/ws/2008/06/identity/claims/' + long] ?? null;
        return { role: pick('role', 'role'), userId: pick('nameid', 'nameidentifier'), exp: p.exp ?? null };
    } catch (e) { return null; }
}

export function getSession() {
    const token = localStorage.getItem('token');
    const claims = token ? tokenClaims(token) : null;
    return {
        token,
        // The role comes from the token, not the editable localStorage 'role' (kept only as a fallback).
        role:  claims?.role || localStorage.getItem('role'),
        user:  JSON.parse(localStorage.getItem('user') || 'null')
    };
}

export function clearSession() {
    ["token", "role", "user", "_sessionType"].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
    // Saved page data from swrRequest (lib/api.js) belongs to the user who just left.
    Object.keys(sessionStorage).filter(k => k.startsWith('swr:')).forEach(k => sessionStorage.removeItem(k));
}

export function isLoggedIn() {
    return !!localStorage.getItem("token");
}

// One route per vanilla portal page; these replace the vanilla `/<PORTAL>/HTML/*.html` redirects.
export const PORTALS = {
    admin:  { base: '/admin',  home: '/admin/dashboard',  setup: '/admin/setup' },
    head:   { base: '/head',   home: '/head/dashboard',   setup: '/head/setup' },
    mentor: { base: '/mentor', home: '/mentor/dashboard', setup: '/mentor/setup' },
    mentee: { base: '/mentee', home: '/mentee/dashboard', setup: '/mentee/setup' },
};

export const roleKey = role => (role || '').toLowerCase();
