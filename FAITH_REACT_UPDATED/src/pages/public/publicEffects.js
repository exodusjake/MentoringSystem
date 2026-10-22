import { useEffect } from 'react';
import { loadScript } from '../../lib/loadScript.js';

// LANDING/JS/effects.js — click ripple on every button + a thin scroll-progress bar.
// Included on landing, privacy, terms and login.
export function usePublicEffects() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Ripple: expands from the click point on buttons and FAQ rows
    let onDown = null;
    if (!reduce) {
      onDown = e => {
        const el = e.target.closest('.btn, .btn-signin, .faq-item summary');
        if (!el || el.disabled) return;
        const r = el.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2;
        const dot = document.createElement('span');
        dot.className = 'ripple';
        dot.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (e.clientX - r.left - size / 2) + 'px;top:' + (e.clientY - r.top - size / 2) + 'px';
        el.appendChild(dot);
        dot.addEventListener('animationend', () => dot.remove());
      };
      document.addEventListener('pointerdown', onDown);
    }

    // Scroll progress (only on pages that include the bar)
    const bar = document.querySelector('.scroll-progress');
    let update = null;
    if (bar) {
      update = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
      };
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
    }
    return () => {
      if (onDown) document.removeEventListener('pointerdown', onDown);
      if (update) { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); }
    };
  }, []);
}

// LANDING/JS/smooth-scroll.js — inertia smooth scrolling (Lenis, loaded from the same CDN as before).
// Skipped for reduced-motion users, and the page still scrolls natively if the CDN script fails to load.
export function useLenis() {
  useEffect(() => {
    let lenis = null;
    let raf = null;
    let onClick = null;
    let alive = true;
    loadScript('https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js').then(() => {
      if (!alive || typeof window.Lenis === 'undefined') return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      lenis = new window.Lenis({
        duration: 1.2,                                            // glide length (higher = floatier)
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),   // ease-out expo
        smoothWheel: true,
      });
      window.lenis = lenis;

      const frame = time => { lenis.raf(time); raf = requestAnimationFrame(frame); };
      raf = requestAnimationFrame(frame);

      // In-page links (#features, table of contents...) glide too, clear of the sticky nav
      onClick = e => {
        const a = e.target.closest('a[href*="#"]');
        if (!a) return;
        const url = new URL(a.href, location.href);
        if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
        const target = document.querySelector(url.hash);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: -72, duration: 1.4 });
        history.pushState(null, '', url.hash);
      };
      document.addEventListener('click', onClick);
    }).catch(() => {});
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      if (onClick) document.removeEventListener('click', onClick);
      if (lenis) { lenis.destroy(); window.lenis = undefined; }
    };
  }, []);
}

// Landing/privacy/terms nav bar: shadow once scrolled.
export function useNavScrolled(setScrolled) {
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
}
