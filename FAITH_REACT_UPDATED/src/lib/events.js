// Tiny pub/sub plus a navigate hook, so non-React modules (the API client) can trigger routing and UI.
const listeners = new Map();

export function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name).delete(fn);
}
export function emit(name, payload) {
    (listeners.get(name) || []).forEach(fn => fn(payload));
}

let navigator = null;
export function setNavigator(fn) { navigator = fn; }
// Same effect as `window.location.href = ...` in the vanilla app, but through the router.
export function navigateTo(path, options) {
    if (navigator) navigator(path, options); else window.location.href = path;
}
