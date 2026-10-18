// Keeps the login screen fixed (no scrolling): if the window is too short for
// the logo + form + footer links, they are scaled down just enough to fit.
(function () {
  const side = document.querySelector('.right-side');
  const parts = side ? ['.right-logo', '.login-card', '.bottom-links'].map(s => side.querySelector(s)).filter(Boolean) : [];
  if (parts.length < 2) return;

  function fit() {
    parts.forEach(p => p.style.zoom = 1);
    const cs = getComputedStyle(side);
    const avail = side.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const need = parts.reduce((h, p) => {
      const m = getComputedStyle(p);
      return h + p.offsetHeight + (parseFloat(m.marginTop) || 0) * (m.marginTop.endsWith('px') ? 1 : 0) + (parseFloat(m.marginBottom) || 0) * (m.marginBottom.endsWith('px') ? 1 : 0);
    }, 0);
    const z = need > avail ? Math.max(0.45, avail / need) : 1;
    parts.forEach(p => p.style.zoom = z);
  }

  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(side);
  fit();
})();
