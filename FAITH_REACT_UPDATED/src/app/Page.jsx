import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { PAGE_META } from './pageMeta.js';
import { setPageStyles } from './pageStyles.js';
import { ENHANCER_STYLES } from './enhancerStyles.js';
import { pageFlags } from './globalBehaviors.js';
import { usePortalChrome } from './PortalLayout.jsx';

// Stylesheets the vanilla sidebar partial pulled in (it was injected into <body> after the page's own
// <head> styles), so they come last.
const PORTAL_PARTIAL_STYLES = [
  '/ADMIN_/CSS/tabler-icons.min.css',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
];

const PageContext = createContext({ id: null, enhancers: {}, ready: true });
export const usePage = () => useContext(PageContext);
export const useEnhancer = name => !!useContext(PageContext).enhancers[name];

// Every route renders inside <Page id="PORTAL/original-page-name">: it applies that page's <title>,
// description, <body class> and stylesheets exactly as the vanilla HTML did, exposes which shared UI
// scripts the page loaded (select / date / time / modalMotion / emptyStates ...), and keeps the content
// hidden until its stylesheets have loaded.
export default function Page({ id, onReady, children }) {
  const meta = PAGE_META[id];
  if (!meta) throw new Error(`Unknown page id: ${id}`);
  const [ready, setReady] = useState(false);
  const chrome = usePortalChrome();

  useLayoutEffect(() => {
    document.title = meta.title;
    setDescription(meta.description);
    document.body.className = meta.bodyClass;
    // theme.js picks the dark palette from this: hand-tuned for landing/login, inversion for the portals.
    document.documentElement.setAttribute('data-page', id.startsWith('LANDING/') ? 'landing' : id.startsWith('LOGIN/') ? 'login' : 'portal');
    // apiClient.js (every page except index/landing/privacy/terms) brought scroll containment, the modal
    // scroll lock, confirm-dialog restyling and tooltips; smooth-scroll.js was per page.
    pageFlags.api = !!meta.enhancers.tooltips;
    pageFlags.smoothScroll = !!meta.enhancers.smoothScroll;
    // Styles injected by the shared UI scripts this page loaded.
    const injected = [];
    for (const [flag, [styleId, css]] of Object.entries(ENHANCER_STYLES)) {
      if (!meta.enhancers[flag]) continue;
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = css;
      document.head.appendChild(st);
      injected.push(st);
    }
    // Public pages start at the top and fade in once styled (no blank flash / leftover scroll from the last page).
    const isPublic = !chrome;
    if (isPublic && !window.location.hash) window.scrollTo(0, 0);
    // While the page's stylesheets arrive its elements jump from unstyled to styled; with transitions on they
    // would visibly slide into place (the login card swept in from the side). Frozen until the page is ready.
    const root = document.documentElement;
    root.classList.add('page-loading');
    let alive = true;
    const hrefs = meta.styles;
    setPageStyles(chrome ? [...hrefs, ...PORTAL_PARTIAL_STYLES.filter(h => !hrefs.includes(h))] : hrefs)
      .then(() => {
        if (!alive) return;
        setReady(true);
        requestAnimationFrame(() => requestAnimationFrame(() => { if (alive) root.classList.remove('page-loading'); }));
        chrome?.pageReady();
        if (isPublic) {
          document.body.classList.add('page-enter');
          setTimeout(() => document.body.classList.remove('page-enter'), 400);
        }
      });
    return () => { alive = false; root.classList.remove('page-loading'); injected.forEach(st => st.remove()); };
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
