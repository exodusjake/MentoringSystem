// The small dark toast a few Head pages defined for themselves (a local showToast(message) that shadowed
// notify.js's): bottom-centre, fades in, gone after 2.5s.
export function darkToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:#111827;color:#fff;padding:12px 24px;
    border-radius:8px;font-size:14px;font-weight:500;
    z-index:99999;opacity:0;transition:opacity 0.3s;
    box-shadow:0 4px 12px rgba(0,0,0,0.2);white-space:nowrap;`;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 10);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}
