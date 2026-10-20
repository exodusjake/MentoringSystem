function validateUploadFile(file, endpoint) {
    const signature = /^ESignature\//i.test(endpoint);
    const proof = /^(ProofOfSession|EvaluationSubmissions)\/upload$/i.test(endpoint);
    if (!signature && !proof) return null;
    const maxMB = signature ? 5 : 20;
    if (!file || !file.size) return 'Please choose a non-empty file.';
    if (file.size > maxMB * 1024 * 1024) return `File is too large. Maximum size is ${maxMB} MB. Please choose a smaller file.`;
    const formats = signature ? ['png'] : ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (/^ProofOfSession\//i.test(endpoint)) formats.push('pdf');
    const extension = (file.name || '').split('.').pop().toLowerCase();
    if (!formats.includes(extension)) return `File type not supported. Use ${formats.join(', ').toUpperCase()}. For HEIC photos, upload a JPG/PNG copy or screenshot.`;
    return null;
}

async function apiRequest(endpoint, method = "GET", body = null, requiresAuth = false) {
    const url = CONFIG.getUrl(endpoint);

    const isFormData = body instanceof FormData;
    if (isFormData && method.toUpperCase() === 'POST') {
        const validationError = validateUploadFile(body.get('file'), endpoint);
        if (validationError) throw new Error(validationError);
    }
    const headers = isFormData ? {} : { "Content-Type": "application/json" };

    // Attach JWT token if the request requires auth
    if (requiresAuth) {
        const token = getSession()?.token;
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
    }

    const options = { method, headers };

    if (body) {
        options.body = isFormData ? body : JSON.stringify(body);
    }

    // Without this, a hung backend (DB cold-start, network stall) leaves the
    // fetch promise pending forever — every .catch() on every page is
    // written correctly but never fires because nothing ever rejects, so
    // the UI is stuck on "Loading..." indefinitely with no indication
    // anything is wrong. 35s gives the backend's own ~30s SQL command
    // timeout room to fire first and return a proper error response,
    // rather than the frontend cutting off a request that would have
    // succeeded a few seconds later.
    // Uploads get two minutes to accommodate slower mobile connections.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isFormData ? 120000 : 35000);
    options.signal = controller.signal;

    try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 413) throw new Error('File is too large. Please choose a smaller file within the upload limit.');
            if (response.status === 429 && ['auth/login', 'auth/verify-login-code'].includes(endpoint.toLowerCase())) {
                throw new Error('Too many login attempts. Please wait 1 minute before trying again.');
            }
            // An expired/invalid token on an authenticated request has no
            // recovery path other than logging in again — every page used
            // to handle this differently (or not at all), leaving the user
            // stuck on a broken page with a dead token and no way back.
            // Login's own request (requiresAuth=false) is deliberately
            // excluded so a wrong password isn't treated as "session
            // expired," and this only fires once per page since the
            // redirect below navigates away immediately.
            if (response.status === 401 && requiresAuth) {
                clearSession();
                if (!window.location.pathname.toLowerCase().includes('/login/')) {
                    window.location.href = "/LOGIN/HTML/login.html";
                }
            }
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(errorData.message || `Error ${response.status}`);
            error.status = response.status;
            error.restart = errorData.restart === true;
            throw error;
        }

        if (response.status === 204) return null;

        // A 200 OK with an empty body (e.g. Settings/verify-password's bare
        // Ok()) has nothing for .json() to parse — it throws instead of
        // returning, which callers otherwise mistake for a failed request.
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (isFormData && error instanceof TypeError) {
            throw new Error('Upload could not reach the server. Check your internet connection and try again.');
        }
        if (error.name === 'AbortError') {
            console.error(`API Timeout (${endpoint})`);
            throw new Error('Request timed out. Please check your connection and try again.');
        }
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
}

window.AnnouncementBadge = (() => {
    const badgeKey = userId => `ann_sidebar_badge_${userId}`;
    const lastReadKey = userId => `ann_sidebar_lastRead_${userId}`;

    function update(count, userId) {
        let resolvedUserId = userId;
        if (!resolvedUserId) {
            const session = typeof getSession === 'function' ? getSession() : null;
            resolvedUserId = session?.user?.userID || session?.user?.UserID;
        }

        const parsedCount = Number(count);
        const safeCount = Number.isFinite(parsedCount) ? Math.max(0, Math.floor(parsedCount)) : 0;
        try {
            if (resolvedUserId) localStorage.setItem(badgeKey(resolvedUserId), String(safeCount));
        } catch (e) {}

        const badge = document.getElementById('annBadge');
        if (!badge) return;
        if (safeCount > 0) {
            badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    async function refresh(userId, getFreshCount) {
        if (!userId) return;

        if (window.location.pathname.split('/').pop() === 'announcements.html') {
            const now = new Date();
            const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
            try { localStorage.setItem(lastReadKey(userId), localNow); } catch (e) {}
            update(0, userId);
            return;
        }

        let lastRead = null;
        let cached = 0;
        try {
            lastRead = localStorage.getItem(lastReadKey(userId));
            cached = parseInt(localStorage.getItem(badgeKey(userId)) || '0', 10);
        } catch (e) {}
        update(cached, userId);

        if (typeof getFreshCount !== 'function') return;
        try {
            const freshCount = await getFreshCount(lastRead);
            if (freshCount !== null && freshCount !== undefined && Number.isFinite(Number(freshCount))) {
                update(freshCount, userId);
            }
        } catch (e) {}
    }

    return { refresh, update };
})();

function updateSidebarAnnBadge(count) {
    window.AnnouncementBadge.update(count);
}

// Auth helpers
function saveSession(token, role, user, rememberMe = true) {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("_sessionType", "local");
}

function getSession() {
    return {
        token: localStorage.getItem("token"),
        role:  localStorage.getItem("role"),
        user:  JSON.parse(localStorage.getItem("user") || "null")
    };
}

function clearSession() {
    ["token", "role", "user", "_sessionType"].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

function isLoggedIn() {
    return !!localStorage.getItem("token");
}

let guardedRole;
let isGuardedPage = false;

function requireAuth(allowedRole) {
    isGuardedPage = true;
    guardedRole = allowedRole;
    if (!isLoggedIn()) {
        window.location.href = "/LOGIN/HTML/login.html";
        return;
    }
    if (allowedRole) {
        const role = (getSession().role || '').toLowerCase();
        const allowed = (Array.isArray(allowedRole) ? allowedRole : [allowedRole]).map(r => r.toLowerCase());
        if (!allowed.includes(role)) {
            window.location.href = "/LOGIN/HTML/login.html";
            return;
        }
    }

    // First-login signature gate — every other page goes through here, so
    // this is the one place that actually enforces "mandatory": a signed-in
    // account that still owes its setup can't reach anything else, no
    // matter how it got the link (typed URL, browser back button, login's
    // own "already signed in" auto-redirect...). setup.html itself never
    // calls requireAuth(), but the path check below is a cheap safety net
    // against an infinite redirect loop if that ever changes.
    if (!window.location.pathname.toLowerCase().endsWith('/setup.html')) {
        const session = getSession();
        if (session.user?.setupRequired === true) {
            const setupRoutes = {
                mentor: '/MENTOR/HTML/setup.html',
                mentee: '/MENTEE/HTML/setup.html',
                admin:  '/ADMIN_/HTML/setup.html',
                head:   '/HEAD/HTML/setup.html'
            };
            const dest = setupRoutes[(session.role || '').toLowerCase()];
            if (dest) window.location.href = dest;
        }
    }
}
// Recheck restored pages and tabs after explicit logout, even with Remember me.
function recheckRestoredSession() {
    const protectedPortal = /^\/(ADMIN_|HEAD|MENTOR|MENTEE)\//i.test(window.location.pathname);
    if (!isGuardedPage && !protectedPortal) return;
    if (!isLoggedIn()) {
        document.documentElement.style.visibility = 'hidden';
        window.location.replace('/LOGIN/HTML/login.html');
        return;
    }
    if (isGuardedPage) requireAuth(guardedRole);
}
window.addEventListener('pageshow', recheckRestoredSession);
window.addEventListener('storage', event => {
    if (event.key === 'token' || event.key === null) recheckRestoredSession();
});

// Load shared help-tooltip behavior independently of API requests.
(() => {
    const script = document.createElement('script');
    script.src = '/tooltips.js';
    script.defer = true;
    document.head.appendChild(script);
})();

// Shared "logging out" effect used by every portal's handleLogout(): the page
// dims behind a centred card with a spinner, then the session is cleared and
// the user lands on the login page.
function playLogoutEffect() {
    if (document.getElementById('astra-logout-overlay')) return;
    if (!document.getElementById('astra-logout-css')) {
        const st = document.createElement('style');
        st.id = 'astra-logout-css';
        st.textContent =
            '.lo-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(255,255,255,.0);backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);' +
            'transition:background .45s ease,backdrop-filter .45s ease,-webkit-backdrop-filter .45s ease;font-family:inherit}' +
            '.lo-overlay.show{background:rgba(244,247,251,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
            '.lo-card{display:flex;flex-direction:column;align-items:center;gap:14px;padding:30px 40px;border-radius:20px;background:#fff;' +
            'border:1px solid #dce3ec;box-shadow:0 20px 60px rgba(11,26,92,.18);opacity:0;transform:translateY(14px) scale(.96);' +
            'transition:opacity .4s ease .1s,transform .45s cubic-bezier(.22,1,.36,1) .1s}' +
            '.lo-overlay.show .lo-card{opacity:1;transform:none}' +
            '.lo-ring{width:46px;height:46px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#2563eb;animation:lo-spin .8s linear infinite}' +
            '.lo-title{font-size:16px;font-weight:700;color:#111827}' +
            '.lo-sub{font-size:13px;color:#6b7280;margin-top:-8px}' +
            '.lo-bar{width:170px;height:4px;border-radius:4px;background:#e5e7eb;overflow:hidden}' +
            '.lo-bar i{display:block;height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#3b82f6,#f0b429);transition:width 1.05s cubic-bezier(.4,0,.2,1)}' +
            '.lo-overlay.go .lo-bar i{width:100%}' +
            'body.lo-leaving>*:not(.lo-overlay){transition:opacity .5s ease,transform .5s ease,filter .5s ease;opacity:.35;transform:scale(.985);filter:saturate(.7)}' +
            '@keyframes lo-spin{to{transform:rotate(360deg)}}' +
            '@media (prefers-reduced-motion:reduce){.lo-overlay,.lo-card,.lo-bar i{transition:none}.lo-ring{animation-duration:1.6s}body.lo-leaving>*:not(.lo-overlay){transition:none;transform:none}}';
        document.head.appendChild(st);
    }
    const ov = document.createElement('div');
    ov.id = 'astra-logout-overlay';
    ov.className = 'lo-overlay';
    ov.setAttribute('role', 'status');
    ov.innerHTML = '<div class="lo-card"><div class="lo-ring"></div><div class="lo-title">Logging you out…</div>' +
        '<div class="lo-sub">Securing your session</div><div class="lo-bar"><i></i></div></div>';
    document.body.appendChild(ov);
    document.body.classList.add('lo-leaving');
    requestAnimationFrame(() => requestAnimationFrame(() => { ov.classList.add('show', 'go'); }));
    if (typeof clearSession === 'function') clearSession();
    setTimeout(() => {
        const t = ov.querySelector('.lo-title'), s = ov.querySelector('.lo-sub');
        if (t) t.textContent = 'See you soon!';
        if (s) s.textContent = 'Taking you back to the login page';
    }, 800);
    setTimeout(() => { window.location.href = '/LOGIN/HTML/login.html'; }, 1300);
}
window.playLogoutEffect = playLogoutEffect;

// Scroll containment: wheel/touch over the sidebar or an open modal never scrolls the page behind it.
// If something inside can still scroll in that direction it does; otherwise the event is swallowed
// instead of chaining to the page.
(function scrollContainment() {
    if (window.__astraScrollContainment) return;
    window.__astraScrollContainment = true;

    const LAYER = '.sidebar, [class*="overlay"], [class*="modal"]';

    function canScroll(el, dy) {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll|overlay)/.test(cs.overflowY)) return false;
        if (el.scrollHeight <= el.clientHeight + 1) return false;
        return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    }

    // Returns true when the event should be blocked (it started inside a fixed sidebar/modal layer
    // and nothing between the target and that layer can scroll further in that direction).
    function shouldBlock(target, dy) {
        for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            if (el.nodeType !== 1) continue;
            if (canScroll(el, dy)) return false;
            if (el.matches(LAYER) && getComputedStyle(el).position === 'fixed') return true;
        }
        return false;
    }

    document.addEventListener('wheel', e => {
        if (e.ctrlKey || !e.deltaY) return;
        if (shouldBlock(e.target, e.deltaY)) e.preventDefault();
    }, { passive: false });

    let lastY = 0;
    document.addEventListener('touchstart', e => { lastY = e.touches[0] ? e.touches[0].clientY : 0; }, { passive: true });
    document.addEventListener('touchmove', e => {
        const y = e.touches[0] ? e.touches[0].clientY : lastY;
        const dy = lastY - y;               // finger up => content scrolls down
        lastY = y;
        if (dy && shouldBlock(e.target, dy)) e.preventDefault();
    }, { passive: false });
})();

// Global loading indicator: any apiRequest() that takes longer than a moment shows a slim progress bar
// along the top of the page, and a short "still loading" note if the server is slow to answer.
(function apiLoadingIndicator() {
    if (window.__astraLoadingIndicator || typeof apiRequest !== 'function') return;
    window.__astraLoadingIndicator = true;

    const SHOW_AFTER_MS = 300;     // quick requests never flash the bar
    const SLOW_AFTER_MS = 3500;    // first "taking longer" note
    const VERY_SLOW_MS  = 12000;   // second, reassuring note

    let active = 0, bar = null, fill = null, pill = null, pillText = null;
    let showTimer, slowTimer, verySlowTimer, hideTimer, progTimer, progress = 0;

    function build() {
        if (bar || !document.body) return;
        const st = document.createElement('style');
        st.textContent =
            '.astra-lbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483001;pointer-events:none;opacity:0;transition:opacity .25s ease}' +
            '.astra-lbar.on{opacity:1}' +
            '.astra-lbar i{display:block;height:100%;width:0;border-radius:0 3px 3px 0;background:linear-gradient(90deg,#3b82f6,#60a5fa 60%,#f0b429);' +
            'box-shadow:0 0 10px rgba(59,130,246,.55);transition:width .25s ease}' +
            '.astra-lbar.on::after{content:"";position:absolute;top:0;bottom:0;width:90px;left:-90px;' +
            'background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:astra-lbar-sheen 1.1s ease-in-out infinite}' +
            '@keyframes astra-lbar-sheen{to{left:100%}}' +
            '.astra-lpill{position:fixed;top:14px;left:50%;z-index:2147483001;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 28px);' +
            'padding:10px 16px;border-radius:999px;background:#fff;color:#374151;border:1px solid #dce3ec;box-shadow:0 10px 30px rgba(11,26,92,.16);' +
            'font:500 13px/1.3 "DM Sans","Poppins",system-ui,sans-serif;opacity:0;transform:translate(-50%,-12px);pointer-events:none;' +
            'transition:opacity .3s ease,transform .35s cubic-bezier(.22,1,.36,1)}' +
            '.astra-lpill.show{opacity:1;transform:translate(-50%,0)}' +
            '.astra-lpill b{width:16px;height:16px;border-radius:50%;border:2.5px solid #dbeafe;border-top-color:#2563eb;animation:astra-lspin .8s linear infinite;flex-shrink:0}' +
            '@keyframes astra-lspin{to{transform:rotate(360deg)}}' +
            '@media (prefers-reduced-motion:reduce){.astra-lbar.on::after,.astra-lpill b{animation-duration:2.4s}}';
        document.head.appendChild(st);
        bar = document.createElement('div');
        bar.className = 'astra-lbar';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-hidden', 'true');
        fill = document.createElement('i');
        bar.appendChild(fill);
        pill = document.createElement('div');
        pill.className = 'astra-lpill';
        pill.setAttribute('role', 'status');
        pill.setAttribute('aria-live', 'polite');
        pill.innerHTML = '<b></b><span></span>';
        pillText = pill.lastChild;
        document.body.appendChild(bar);
        document.body.appendChild(pill);
    }

    function show() {
        build();
        if (!bar) return;
        clearTimeout(hideTimer);
        progress = 8;
        fill.style.width = progress + '%';
        bar.classList.add('on');
        clearInterval(progTimer);
        progTimer = setInterval(() => {            // creeps toward 90% and waits for the response
            progress += (90 - progress) * 0.07;
            fill.style.width = progress.toFixed(1) + '%';
        }, 200);
        slowTimer = setTimeout(() => {
            pillText.textContent = 'Still loading… the server is taking longer than usual.';
            pill.classList.add('show');
        }, SLOW_AFTER_MS - SHOW_AFTER_MS);
        verySlowTimer = setTimeout(() => {
            pillText.textContent = 'Almost there — the server is responding slowly. Please keep this page open.';
            pill.classList.add('show');
        }, VERY_SLOW_MS - SHOW_AFTER_MS);
    }

    function begin() {
        active++;
        if (active === 1) { clearTimeout(hideTimer); showTimer = setTimeout(show, SHOW_AFTER_MS); }
    }

    function end() {
        active = Math.max(0, active - 1);
        if (active > 0) return;
        clearTimeout(showTimer); clearTimeout(slowTimer); clearTimeout(verySlowTimer); clearInterval(progTimer);
        if (pill) pill.classList.remove('show');
        if (bar && bar.classList.contains('on')) {
            fill.style.width = '100%';
            hideTimer = setTimeout(() => { bar.classList.remove('on'); setTimeout(() => { fill.style.width = '0'; }, 260); }, 280);
        }
    }

    const original = apiRequest;
    window.apiRequest = apiRequest = function (...args) {
        begin();
        let p;
        try { p = original.apply(this, args); } catch (e) { end(); throw e; }
        return p.finally(end);
    };
})();

// Confirmation dialogs (all portals): any small "title + message + Cancel/Confirm" dialog is restyled in one
// layout — left-aligned title with a close (X), message, and a grey footer bar with Cancel and the main action.
// Dialogs are recognised by structure, so existing markup and click handlers keep working unchanged.
(function confirmDialogs() {
    if (window.__astraConfirmDialogs) return;
    window.__astraConfirmDialogs = true;

    const CARD    = '.confirm-card,.logout-modal,.nf-confirm-card,.info-modal,.cal-info-modal,.modal-card,.modal-card-sm,.edit-modal-card,.modal';
    const ACTIONS = '.confirm-actions,.info-modal-actions,.logout-modal-btns,.edit-modal-footer,.nf-confirm-actions,.modal-footer,.modal-actions';
    const TITLE   = '.confirm-title,.info-modal-title,.cal-info-modal-title,.nf-confirm-title,.logout-modal h3,.modal-title,h3,h2';
    const BODY    = '.confirm-body,.info-modal-message,.cal-info-modal-message,.nf-confirm-message,.modal-subtitle,.logout-modal p';
    const ICON    = '.confirm-icon,.info-modal-icon,.cal-info-modal-icon,.logout-modal-icon';
    const ERR_RE  = /went wrong|error|failed|unable|couldn.t|cannot|can.t|invalid|not allowed|denied/i;
    const X_SVG   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    function enhance(card) {
        if (card.dataset.astraConfirm) return;
        if (card.querySelector('input:not([type="hidden"]),select,textarea,table,canvas,img,iframe')) return;   // forms / rich content stay as they are
        if ((card.textContent || '').length > 700) return;
        let actions = card.querySelector(ACTIONS);
        let btns = actions ? Array.prototype.filter.call(actions.children, n => n.tagName === 'BUTTON') : [];
        let single = false;
        if (btns.length < 2) {
            // "Something went wrong"-style alert: one OK button, error/danger icon or wording.
            const icon0 = card.querySelector(ICON), title0 = card.querySelector(TITLE);
            const isError = (icon0 && /danger|error/i.test(String(icon0.className))) || (title0 && ERR_RE.test(title0.textContent || ''));
            if (!isError) return;
            if (!actions) {
                const direct = Array.prototype.filter.call(card.children, n => n.tagName === 'BUTTON');
                if (direct.length !== 1) return;
                actions = document.createElement('div');
                card.insertBefore(actions, direct[0]);
                actions.appendChild(direct[0]);
                btns = direct;
            } else if (btns.length !== 1) return;
            single = true;
        } else if (btns.length > 3) return;
        const title = card.querySelector(TITLE);
        if (!title || actions.contains(title)) return;
        if (title.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_PRECEDING) return;   // title must come first

        card.dataset.astraConfirm = '1';
        title.dataset.ac = 'title';
        actions.dataset.ac = 'actions';
        if (single) actions.classList.add('astra-single');
        card.querySelectorAll(BODY).forEach(el => { if (!actions.contains(el) && el !== title) el.dataset.ac = 'body'; });
        card.querySelectorAll(ICON).forEach(el => { el.dataset.ac = 'icon'; });
        if (!card.querySelector('[data-ac="body"]')) card.classList.add('astra-confirm-nobody');

        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'astra-confirm-x';
        x.setAttribute('aria-label', 'Close');
        x.innerHTML = X_SVG;
        x.addEventListener('click', e => {
            e.stopPropagation();
            btns[0].click();            // the first button is always the Cancel / Go Back one
        });
        card.appendChild(x);
    }

    let queued = false;
    function scan() {
        queued = false;
        document.querySelectorAll(CARD).forEach(enhance);
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

    function start() {
        scan();
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
