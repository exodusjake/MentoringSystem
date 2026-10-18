// Inertia smooth scrolling (Lenis). Skipped for reduced-motion users,
// and the page still scrolls natively if the CDN script fails to load.
(function () {
  if (typeof Lenis === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const lenis = new Lenis({
    duration: 1.2,                                            // glide length (higher = floatier)
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),   // ease-out expo
    smoothWheel: true,
  });
  window.lenis = lenis;

  function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  // In-page links (#features, table of contents...) glide too, clear of the sticky nav
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
    const target = document.querySelector(url.hash);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -72, duration: 1.4 });
    history.pushState(null, '', url.hash);
  });
})();
