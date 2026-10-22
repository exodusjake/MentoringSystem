// Login session in localStorage (same keys as the original app, so existing sessions carry over).
const KEYS = ['token', 'role', 'user', '_sessionType'];

export function saveSession(token, role, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('_sessionType', 'local');
}

export function getSession() {
    return {
        token: localStorage.getItem('token'),
        role:  localStorage.getItem('role'),
        user:  JSON.parse(localStorage.getItem('user') || 'null'),
    };
}

export function clearSession() {
    KEYS.forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

export function isLoggedIn() {
    return !!localStorage.getItem('token');
}

export const PORTALS = {
    admin:  { base: '/admin',  home: '/admin/dashboard',  setup: '/admin/setup' },
    head:   { base: '/head',   home: '/head/dashboard',   setup: '/head/setup' },
    mentor: { base: '/mentor', home: '/mentor/dashboard', setup: '/mentor/setup' },
    mentee: { base: '/mentee', home: '/mentee/dashboard', setup: '/mentee/setup' },
};

export const roleKey = role => (role || '').toLowerCase();

// The signed-in user's id, whichever casing the login response used.
export const currentUserId = () => {
    const u = getSession().user;
    return u?.userID || u?.UserID || null;
};
