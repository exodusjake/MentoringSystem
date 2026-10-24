import { CONFIG } from './config.js';
import { clearSession, getSession } from './session.js';
import { emit, navigateTo } from './events.js';

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

// Identical GETs issued while one is still in flight (e.g. the sidebar badge and the page both
// loading Announcements at startup) share one network request. Each caller gets its own clone
// of the response and runs all handling below itself, so results and errors are unchanged.
const inflightGets = new Map();
function sharedFetch(url, options) {
    if (options.method.toUpperCase() !== 'GET' || options.body) return fetch(url, options);
    const key = url + '\n' + (options.headers.Authorization || '');
    let entry = inflightGets.get(key);
    if (!entry) {
        entry = { callers: 0, response: fetch(url, options) };
        inflightGets.set(key, entry);
        // Registered first, so the caller count is final before any caller's callback below runs.
        const forget = () => inflightGets.delete(key);
        entry.response.then(forget, forget);
    }
    entry.callers++;
    // A lone caller gets the response itself; shared callers each read their own clone.
    return entry.response.then(response => entry.callers > 1 ? response.clone() : response);
}

async function request(endpoint, method, body, requiresAuth) {
    const url = CONFIG.getUrl(endpoint);

    const isFormData = body instanceof FormData;
    if (isFormData && method.toUpperCase() === 'POST') {
        const validationError = validateUploadFile(body.get('file'), endpoint);
        if (validationError) throw new Error(validationError);
    }
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
    if (requiresAuth) {
        const token = getSession()?.token;
        if (token) headers.Authorization = `Bearer ${token}`;
    }
    const options = { method, headers };
    if (body) options.body = isFormData ? body : JSON.stringify(body);

    // A hung backend would otherwise leave the request pending forever. 35s gives the backend's
    // own ~30s SQL timeout room to answer first; uploads get two minutes for slow mobile links.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isFormData ? 120000 : 35000);
    options.signal = controller.signal;

    try {
        const response = await sharedFetch(url, options);
        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 413) throw new Error('File is too large. Please choose a smaller file within the upload limit.');
            if (response.status === 429 && ['auth/login', 'auth/verify-login-code'].includes(endpoint.toLowerCase())) {
                throw new Error('Too many login attempts. Please wait 1 minute before trying again.');
            }
            // An expired/invalid token can only be fixed by logging in again. The login request
            // itself (requiresAuth=false) is excluded so a wrong password isn't "session expired".
            if (response.status === 401 && requiresAuth) {
                clearSession();
                if (!window.location.pathname.toLowerCase().startsWith('/login')) navigateTo('/login');
            }
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 503 && errorData.maintenance) emit('maintenance', errorData);
            const error = new Error(errorData.message || `Error ${response.status}`);
            error.status = response.status;
            error.restart = errorData.restart === true;
            throw error;
        }

        if (response.status === 204) return null;
        // A 200 with an empty body (e.g. Settings/verify-password's bare Ok()) has nothing to parse.
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

// Every request drives the global loading bar (components/LoadingBar.jsx).
export function apiRequest(endpoint, method = 'GET', body = null, requiresAuth = false) {
    emit('request:begin');
    let p;
    try { p = request(endpoint, method, body, requiresAuth); } catch (e) { emit('request:end'); throw e; }
    return p.finally(() => emit('request:end'));
}

// Plain fetch for the few unauthenticated endpoints the login page calls directly
// (forgot/verify/reset password, contact), matching the original calls exactly.
export function postJson(endpoint, body) {
    return fetch(CONFIG.getUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
