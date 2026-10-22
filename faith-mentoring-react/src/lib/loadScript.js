// Load a classic script (CDN or a vendored file in public/) once; resolves when it has run.
// Used for the libraries the original pages loaded with <script src>: Lenis, Chart.js,
// qrcode.js and html5-qrcode, which set globals (window.Lenis, window.Chart, …).
const pending = new Map();

export function loadScript(src) {
  if (!pending.has(src)) {
    pending.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => { pending.delete(src); el.remove(); reject(new Error(`Failed to load ${src}`)); };
      document.body.appendChild(el);
    }));
  }
  return pending.get(src);
}
