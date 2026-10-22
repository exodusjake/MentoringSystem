import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { PAGE_META } from './pageMeta.js';
import { setPageStyles } from './pageStyles.js';
import { pageFlags } from './globalBehaviors.js';
import { usePortalChrome } from './PortalLayout.jsx';

// Stylesheets the original sidebar partial pulled in (it was injected into <body> after the
// page's own <head> styles), so they come last.
const PORTAL_PARTIAL_STYLES = [
  '/ADMIN_/CSS/tabler-icons.min.css',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
];

const PageContext = createContext({ id: null, enhancers: {}, ready: true });
export const usePage = () => useContext(PageContext);
export const useEnhancer = name => !!useContext(PageContext).enhancers[name];

// Every route renders inside <Page id="PORTAL/original-page-name">: it applies that page's
// <title>, description, <body class> and stylesheets exactly as the original HTML did, exposes
// the page's enhancer flags, and keeps the content hidden until its stylesheets have loaded.
export default function Page({ id, portal = false, onReady, children }) {
  const meta = PAGE_META[id];
  if (!meta) throw new Error(`Unknown page id: ${id}`);
  const [ready, setReady] = useState(false);
  const chrome = usePortalChrome();
  portal = portal || !!chrome;

  useLayoutEffect(() => {
    document.title = meta.title;
    setDescription(meta.description);
    document.body.className = meta.bodyClass;
    // apiClient.js (loaded on every page but index/landing/privacy/terms) brought scroll
    // containment and the modal scroll lock; smooth-scroll.js was per page.
    pageFlags.api = !!meta.enhancers.tooltips;
    pageFlags.smoothScroll = !!meta.enhancers.smoothScroll;
    let alive = true;
    const hrefs = meta.styles.map(s => s.href);
    setPageStyles(portal ? [...hrefs, ...PORTAL_PARTIAL_STYLES.filter(h => !hrefs.includes(h))] : hrefs)
      .then(() => { if (alive) { setReady(true); chrome?.pageReady(); } });
    return () => { alive = false; };
  }, [id]);

  // After the content is visible (so focus() etc. work on it).
  useEffect(() => { if (ready) onReady?.(); }, [ready]);

  return (
    <PageContext.Provider value={{ id, enhancers: meta.enhancers, ready }}>
      <div style={{ display: 'contents', visibility: ready ? undefined : 'hidden' }}>{children}</div>
    </PageContext.Provider>
  );
}

function setDescription(text) {
  let el = document.querySelector('meta[name="description"]');
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('meta');
    el.name = 'description';
    document.head.insertBefore(el, document.querySelector('title'));
  }
  el.content = text;
}
