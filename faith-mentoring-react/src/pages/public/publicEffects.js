import { useEffect, useRef } from 'react';
import { loadScript } from '../../lib/loadScript.js';

const LENIS_JS = 'https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Click ripple on buttons and FAQ rows (the original LANDING/JS/effects.js, used by the landing,
// legal and login pages). The ripple is a transient decoration that removes itself.
export function useRipple() {
  useEffect(() => {
    if (reduceMotion()) return;
    const onDown = e => {
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
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
}

// Thin bar along the top showing how far the page is scrolled (effects.js). Attach the ref to
// the .scroll-progress element.
export function useScrollProgress() {
  const ref = useRef(null);
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return ref;
}

// Inertia smooth scrolling with Lenis (LANDING/JS/smooth-scroll.js). Skipped for reduced-motion
// users; the page still scrolls natively if the CDN script fails to load. In-page links glide
// too, clear of the sticky nav.
export function useLenis() {
  useEffect(() => {
    let lenis = null, raf = 0, alive = true;
    const onClick = e => {
      const a = e.target.closest('a[href*="#"]');
      if (!a || !lenis) return;
      const url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
      const target = document.querySelector(url.hash);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -72, duration: 1.4 });
      history.pushState(history.state, '', url.hash);
    };
    loadScript(LENIS_JS).then(() => {
      if (!alive || typeof window.Lenis === 'undefined' || reduceMotion()) return;
      lenis = new window.Lenis({
        duration: 1.2,                                            // glide length (higher = floatier)
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),   // ease-out expo
        smoothWheel: true,
      });
      window.lenis = lenis;
      const frame = time => { lenis.raf(time); raf = requestAnimationFrame(frame); };
      raf = requestAnimationFrame(frame);
      document.addEventListener('click', onClick);
    }).catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('click', onClick);
      if (lenis) { lenis.destroy(); if (window.lenis === lenis) delete window.lenis; }
    };
  }, []);
}

// Sticky nav: shadow once scrolled; mobile menu toggle (shared by landing and legal pages).
export function useNavScrolled(navRef) {
  useEffect(() => {
    const nav = navRef.current;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
}
