// Keeps the login screen fixed (no scrolling): if the window is too short for
// the logo + form + footer links, they are scaled down just enough to fit.
// Runs for both the login panel and the contact panel.
(function () {
  const sides = Array.from(document.querySelectorAll('.right-side')).map(side => ({
    side,
    parts: ['.right-logo', '.login-card', '.bottom-links'].map(s => side.querySelector(s)).filter(Boolean)
  })).filter(s => s.parts.length >= 2);
  if (!sides.length) return;

  function fit() {
    sides.forEach(({ side, parts }) => {
      parts.forEach(p => p.style.zoom = 1);
      const cs = getComputedStyle(side);
      const avail = side.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need = parts.reduce((h, p) => {
        const m = getComputedStyle(p);
        return h + p.offsetHeight + (parseFloat(m.marginTop) || 0) * (m.marginTop.endsWith('px') ? 1 : 0) + (parseFloat(m.marginBottom) || 0) * (m.marginBottom.endsWith('px') ? 1 : 0);
      }, 0);
      const z = need > avail ? Math.max(0.45, avail / need) : 1;
      parts.forEach(p => p.style.zoom = z);
    });
  }

  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
  if ('ResizeObserver' in window) sides.forEach(({ side }) => new ResizeObserver(fit).observe(side));
  fit();
})();
