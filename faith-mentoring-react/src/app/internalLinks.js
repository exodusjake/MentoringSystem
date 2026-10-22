import { matchRoutes } from 'react-router-dom';

// Plain clicks on same-origin links to app routes go through the router instead of reloading the
// page, so static content (landing, legal pages, rendered rich text) can keep ordinary <a href>.
// In-page anchors (#faq), new-tab/modified clicks, downloads and target=_blank are left alone.
export function installInternalLinks(router) {
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return;
    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.hash) return;   // same-page anchor
    const matches = matchRoutes(router.routes, url.pathname);
    if (!matches || matches.some(m => m.route.path === '*')) return;
    e.preventDefault();
    router.navigate(url.pathname + url.search + url.hash);
  });
}
