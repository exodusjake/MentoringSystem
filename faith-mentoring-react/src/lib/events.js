// Tiny pub/sub so non-React modules (api.js) can drive app-level UI (loading bar, maintenance
// screen) and navigation without importing React.
const listeners = new Map();

export function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
}

export function emit(type, payload) {
    (listeners.get(type) || []).forEach(fn => fn(payload));
}

// Router navigation for code outside components; falls back to a full page load before the
// router has mounted.
let navigator = null;
export function setNavigator(fn) { navigator = fn; }
export function navigateTo(path, options) {
    if (navigator) navigator(path, options);
    else if (options?.replace) window.location.replace(path);
    else window.location.href = path;
}
