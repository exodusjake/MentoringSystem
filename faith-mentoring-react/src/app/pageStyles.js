// Route-scoped stylesheets. The portals reuse class names with different rules per page, so a
// page's stylesheets must be present only while it is shown, in its original order. Sheets the
// next page also uses (e.g. the portal's sidebar.css) are kept in place, so nothing flashes.
const marker = () => document.querySelector('meta[name="astra-page-styles"]');
const links = new Map();   // href -> <link>
const loaded = new WeakSet();

function linkFor(href) {
  let el = links.get(href);
  if (!el) {
    el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    const done = () => loaded.add(el);
    el.addEventListener('load', done, { once: true });
    el.addEventListener('error', done, { once: true });   // never block a page on a failed sheet
    links.set(href, el);
  }
  return el;
}

function whenLoaded(el) {
  if (loaded.has(el)) return Promise.resolve();
  return new Promise(resolve => {
    el.addEventListener('load', resolve, { once: true });
    el.addEventListener('error', resolve, { once: true });
  });
}

// Make `hrefs` the page stylesheets, in order. Resolves once all of them have loaded.
export function setPageStyles(hrefs) {
  const want = new Set(hrefs);
  for (const [href, el] of links) {
    if (!want.has(href)) { el.remove(); links.delete(href); }
  }
  // Lay the links out in order just before the marker, moving one only if it is out of place
  // (re-inserting a connected stylesheet can make the browser re-apply it).
  const anchor = marker();
  for (let i = hrefs.length - 1, next = anchor; i >= 0; i--) {
    const el = linkFor(hrefs[i]);
    if (el.nextSibling !== next) anchor.parentNode.insertBefore(el, next);
    next = el;
  }
  return Promise.all(hrefs.map(href => whenLoaded(links.get(href))));
}
