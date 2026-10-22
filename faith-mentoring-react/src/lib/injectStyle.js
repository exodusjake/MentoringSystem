import { useLayoutEffect } from 'react';

// Shared components bring their own CSS (verbatim from the original scripts that injected it).
// Like the originals, each <style> is appended to the end of <head>, so it follows the page
// stylesheets in the cascade. Styles are reference-counted: in the original each page only had
// the CSS of the scripts it loaded, and several of these rules target generic classes
// (e.g. modal-motion animates every .modal-overlay), so they must not outlive the pages using them.
const styles = new Map(); // id -> { el, count }

export function acquireStyle(id, css) {
  let entry = styles.get(id);
  if (!entry) {
    const el = document.createElement('style');
    el.dataset.astra = id;
    el.textContent = css;
    document.head.appendChild(el);
    entry = { el, count: 0 };
    styles.set(id, entry);
  }
  entry.count++;
  return () => {
    entry.count--;
    if (entry.count === 0) {
      entry.el.remove();
      styles.delete(id);
    }
  };
}

// Keep a style in the document while the calling component is mounted (and `enabled`).
export function useStyle(id, css, enabled = true) {
  useLayoutEffect(() => (enabled ? acquireStyle(id, css) : undefined), [id, css, enabled]);
}
