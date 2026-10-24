function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHtml(html) {
  if (!html) return '';
  const ALLOWED = new Set(['b','i','u','s','strike','strong','em','ul','ol','li','br','p','div','span']);
  // Inert document: nothing in it loads or runs while being cleaned.
  const el = new DOMParser().parseFromString(String(html), 'text/html').body;
  (function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName.toLowerCase())) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          [...child.attributes].forEach(a => child.removeAttribute(a.name));
          clean(child);
        }
      } else if (child.nodeType === 8) {
        node.removeChild(child);
      }
    });
  })(el);
  return el.innerHTML;
}

export { escapeHtml, sanitizeHtml };
