// Loads a vendored classic script (Chart.js, qrcode, html5-qrcode) from /public once, like the
// <script src> tags the vanilla pages used.
const pending = new Map();
export function loadScript(src) {
    if (!pending.has(src)) {
        pending.set(src, new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = () => resolve();
            el.onerror = () => { pending.delete(src); reject(new Error(`Failed to load ${src}`)); };
            document.head.appendChild(el);
        }));
    }
    return pending.get(src);
}
