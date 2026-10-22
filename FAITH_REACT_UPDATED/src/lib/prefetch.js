import { PAGES } from '../pages/index.js';

// Warm up the page the visitor is most likely to open next (its code chunk and stylesheets) while the
// browser is idle, so the switch is instant instead of blanking the screen while they load.
export function prefetchRoute(key, styles = []) {
  const run = () => {
    PAGES[key]?.().catch(() => {});
    styles.forEach(href => {
      if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;
      const l = document.createElement('link');
      l.rel = 'preload';
      l.as = 'style';
      l.href = href;
      document.head.appendChild(l);
    });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 800);
}
