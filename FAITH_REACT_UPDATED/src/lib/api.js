import { CONFIG } from './config.js';
import { clearSession, getSession } from './session.js';
import { emit } from './events.js';

export function validateUploadFile(file, endpoint) {
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

async function request(endpoint, method = "GET", body = null, requiresAuth = false) {
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

    // A hung backend would otherwise leave the fetch pending forever. 35s gives the backend's own
    // ~30s SQL command timeout room to answer first. Uploads get two minutes for slow mobile links.
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
            // An expired/invalid token on an authenticated request can only be fixed by logging in
            // again. Login's own request (requiresAuth=false) is excluded so a wrong password isn't
            // treated as "session expired".
            if (response.status === 401 && requiresAuth) {
                clearSession();
                if (!window.location.pathname.toLowerCase().startsWith('/login')) {
                    window.location.href = '/login';
                }
            }
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 503 && errorData.maintenance) emit('maintenance', errorData);
            const error = new Error(errorData.message || `Error ${response.status}`);
            error.status = response.status;
            error.restart = errorData.restart === true;
            throw error;
        }

        if (response.status === 204) return null;

        // A 200 OK with an empty body (e.g. Settings/verify-password's bare Ok()) has nothing to parse.
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

// Stale-while-revalidate GET for pages that can draw from the last response: onData(data) is called at once
// with the copy saved from this tab's previous visit (if any), then again with the fresh response. A failed
// refresh rejects and leaves whatever was shown. The copy is per user and cleared on logout (session.js).
export function swrRequest(endpoint, onData) {
    const key = `swr:${getSession()?.user?.userID ?? ''}:${endpoint}`;
    try {
        const saved = sessionStorage.getItem(key);
        if (saved) onData(JSON.parse(saved));
    } catch (e) { /* storage unavailable or corrupt: just wait for the network */ }
    return apiRequest(endpoint, 'GET', null, true).then(data => {
        try { sessionStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* quota: skip saving */ }
        onData(data);
        return data;
    });
}

// Identical GETs already in flight share one network call (several components ask for Settings etc. on the
// same page load). A few rarely-changing endpoints are also kept for a short time, so moving between pages
// doesn't refetch them. Any write clears everything, so this browser never sees its own changes late.
const CACHEABLE = /^(Settings|CalendarEvents|MentorProfiles)(\?|$)/i;
const CACHE_TTL = 30000;
const inflight = new Map();
const cache = new Map();

function cacheKey(endpoint, requiresAuth) {
    return `${requiresAuth ? getSession()?.token || '' : ''}|${endpoint}`;
}

// Every request drives the global loading bar (components/LoadingBar.jsx), as apiClient.js's wrapper did.
export function apiRequest(endpoint, method = "GET", body = null, requiresAuth = false) {
    const isGet = method.toUpperCase() === 'GET';
    if (!isGet) { cache.clear(); inflight.clear(); }
    const key = isGet ? cacheKey(endpoint, requiresAuth) : null;

    if (key) {
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(structuredClone(hit.data));
        const pending = inflight.get(key);
        if (pending) return pending.then(data => structuredClone(data));
    }

    emit('request:begin');
    let p;
    try { p = request(endpoint, method, body, requiresAuth); } catch (e) { emit('request:end'); throw e; }
    if (key) {
        const shared = p.then(data => {
            if (CACHEABLE.test(endpoint)) cache.set(key, { at: Date.now(), data });
            return data;
        });
        inflight.set(key, shared);
        const clear = () => { if (inflight.get(key) === shared) inflight.delete(key); };
        shared.then(clear, clear);
        p = shared.then(data => structuredClone(data));
    }
    return p.finally(() => emit('request:end'));
}
