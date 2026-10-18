// Click ripple on every button + a thin scroll-progress bar.
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ripple: expands from the click point on buttons and FAQ rows
  if (!reduce) {
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest('.btn, .btn-signin, .faq-item summary');
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement('span');
      dot.className = 'ripple';
      dot.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - r.left - size / 2) + 'px;top:' + (e.clientY - r.top - size / 2) + 'px';
      el.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());
    });
  }

  // Scroll progress (only on pages that include the bar)
  const bar = document.querySelector('.scroll-progress');
  if (bar) {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }
})();
