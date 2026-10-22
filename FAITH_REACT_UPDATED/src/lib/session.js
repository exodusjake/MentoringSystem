// Login session in localStorage (same keys as the vanilla app, so existing sessions carry over).
export function saveSession(token, role, user, rememberMe = true) {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("_sessionType", "local");
}

export function getSession() {
    return {
        token: localStorage.getItem("token"),
        role:  localStorage.getItem("role"),
        user:  JSON.parse(localStorage.getItem("user") || "null")
    };
}

export function clearSession() {
    ["token", "role", "user", "_sessionType"].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
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
