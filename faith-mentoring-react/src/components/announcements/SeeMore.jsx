import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sanitizeHtml } from '../../lib/security-utils.js';

// Port of the shared evaluation-description.js: a long announcement body is clamped (.truncated)
// behind a "See more" button only when it actually overflows the clamp. The page keeps one
// { measured, overflow, expanded } per content element id; `deps` re-measure after list changes.
// `resetKey`: when it changes, expanded bodies collapse again (pages whose original rebuilt the
// whole list on every filter change).
export function useSeeMore(listRef, ready, deps, resetKey) {
  const [seeMore, setSeeMore] = useState({});
  const lastReset = useRef(resetKey);
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const next = {};
    list.querySelectorAll('.announce-content').forEach(content => {
      const button = content.nextElementSibling;
      if (!button || !button.classList.contains('btn-see-more')) return;
      const had = content.classList.contains('truncated');
      content.classList.add('truncated');
      next[content.id] = content.scrollHeight > content.clientHeight + 1;
      if (!had) content.classList.remove('truncated');
    });
    const reset = lastReset.current !== resetKeyRef.current;
    lastReset.current = resetKeyRef.current;
    setSeeMore(current => {
      const prev = reset ? {} : current;
      const out = {};
      let changed = Object.keys(prev).length !== Object.keys(next).length;
      for (const id in next) {
        const p = prev[id];
        out[id] = { measured: true, overflow: next[id], expanded: !!(p?.expanded && next[id]) };
        if (!p || !p.measured || p.overflow !== next[id] || p.expanded !== out[id].expanded) changed = true;
      }
      return changed || reset ? out : current;
    });
  }, []);
  const resetKeyRef = useRef(resetKey);
  resetKeyRef.current = resetKey;
  useLayoutEffect(() => { if (ready) measure(); }, [ready, resetKey, ...deps]);
  useEffect(() => {
    let frame, previousWidth;
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width !== previousWidth) { previousWidth = width; refresh(); }
    }) : null;
    const list = listRef.current;
    if (list) ro?.observe(list);
    window.addEventListener('resize', refresh);
    list?.addEventListener('load', refresh, true);
    document.fonts?.ready.then(refresh);
    return () => { ro?.disconnect(); window.removeEventListener('resize', refresh); list?.removeEventListener('load', refresh, true); cancelAnimationFrame(frame); };
  }, []);
  const toggle = contentId => setSeeMore(s => ({ ...s, [contentId]: { ...s[contentId], expanded: !s[contentId]?.expanded } }));
  return [seeMore, toggle];
}

// The (sanitized) rich-text body plus its "See more" button.
export function ContentBody({ id, html, seeMore, onToggle }) {
  const { measured, overflow, expanded } = seeMore || {};
  const truncated = !measured || (overflow && !expanded);
  return (
    <>
      <div className={'announce-content' + (truncated ? ' truncated' : '')} id={`ann-content-${id}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
      {' '}
      <button type="button" hidden={!measured || !overflow} aria-expanded={String(!!(overflow && expanded))} className="btn-see-more" onClick={onToggle}>
        {overflow && expanded ? 'See less' : 'See more'}
      </button>
    </>
  );
}

// Which rich-text commands are on at the caret inside the focused editor (bold, italic, ...);
// the format buttons show .fmt-active for them.
const FORMAT_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList'];
export function useActiveFormats() {
  const [active, setActive] = useState(new Set());
  useEffect(() => {
    const onSel = () => {
      const focused = document.activeElement;
      if (!focused?.hasAttribute('contenteditable')) return;
      const cmds = new Set();
      for (const cmd of FORMAT_CMDS) {
        try { if (document.queryCommandState(cmd)) cmds.add(cmd); } catch (e) {}
      }
      setActive(prev => (prev.size === cmds.size && [...cmds].every(c => prev.has(c)) ? prev : cmds));
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
  return active;
}
