import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { usePage } from '../app/Page.jsx';

// Shared plumbing for the themed date and time inputs (ports of ui-datepicker.js and
// ui-timepicker.js). The native <input> stays in the DOM as the source of truth; the trigger
// button copies its computed look and the popup writes back through the native value setter,
// firing input + change exactly as the originals did.

export const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
export const pad = n => (n < 10 ? '0' : '') + n;
export const h12 = h => h % 12 || 12;

// Write a value to the native input; fire input/change only when it actually changed.
export function commitValue(inp, value) {
  const changed = inp.value !== value;
  valueSetter.call(inp, value);
  if (changed) {
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// The element's final computed style. The page's stylesheet can arrive after the element first
// rendered, so a `transition` on it may still be animating (e.g. border-color); the original
// measured an element that was styled from the start. Suspend transitions while reading.
export function settledStyle(el) {
  const prev = el.style.transition;
  el.style.transition = 'none';
  const cs = getComputedStyle(el);
  const snapshot = {};
  for (const k of ['fontSize', 'fontWeight', 'color', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'backgroundColor', 'maxWidth']) snapshot[k] = cs[k];
  el.style.transition = prev;
  if (!el.getAttribute('style')) el.removeAttribute('style');
  return snapshot;
}

// The trigger's inline style, copied from the input once the page's stylesheets are in.
export function useTriggerLook(inpRef, withMaxWidth) {
  const { ready } = usePage();
  const [look, setLook] = useState(null);
  useLayoutEffect(() => {
    if (!ready || look) return;
    const cs = settledStyle(inpRef.current);
    const st = {
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      borderRadius: cs.borderTopLeftRadius,
      padding: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
      backgroundColor: cs.backgroundColor,
      width: '100%',
    };
    if (withMaxWidth && cs.maxWidth && cs.maxWidth !== 'none') st.maxWidth = cs.maxWidth;
    setLook(st);
  }, [ready, look]);
  return look;
}

// Re-render when the native input changes underneath us (uncontrolled inputs, page code).
export function useNativeSync(inpRef) {
  const [, force] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const inp = inpRef.current;
    inp.addEventListener('change', force);
    inp.addEventListener('input', force);
    return () => { inp.removeEventListener('change', force); inp.removeEventListener('input', force); };
  }, []);
}

// Open/close lifecycle shared by both popups: one open at a time, 180 ms fade-out, close on
// outside mousedown / resize / page scroll, Escape (captured) closes and refocuses the trigger.
const openPopups = { date: null, time: null };
export function usePopup(kind, btnRef, menuRef) {
  const [state, setState] = useState(null);     // popup-specific state while open
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState(null);
  const closingRef = useRef(null);
  const latest = useRef(null);
  latest.current = state;
  const [, rerender] = useReducer(n => n + 1, 0);

  const close = useCallback(focusBack => {
    if (!latest.current) return;
    closingRef.current = { state: latest.current, pos: posRef.current };
    setTimeout(() => { closingRef.current = null; rerender(); }, 180);
    latest.current = null;
    setState(null);
    setShown(false);
    if (openPopups[kind]?.close === close) openPopups[kind] = null;
    if (focusBack) btnRef.current?.focus();
  }, []);
  const posRef = useRef(null);
  posRef.current = pos;

  const open = initial => {
    if (latest.current) return;
    if (openPopups[kind] && openPopups[kind].close !== close) openPopups[kind].close();
    setPos(null);
    setState(initial);
    openPopups[kind] = { close };
    requestAnimationFrame(() => { if (latest.current) setShown(true); });
  };

  // Place the popup under (or above) the trigger.
  const position = useCallback(() => {
    const r = btnRef.current.getBoundingClientRect();
    const m = menuRef.current, gap = 6;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const up = m.offsetHeight > below && above > below;
    setPos({
      up,
      // Same declaration order as the original's inline style.
      style: up
        ? { left: Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8) + 'px', top: 'auto', bottom: (window.innerHeight - r.top + gap) + 'px' }
        : { left: Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8) + 'px', bottom: 'auto', top: (r.bottom + gap) + 'px' },
    });
  }, []);

  useEffect(() => {
    if (!state) return;
    const outside = e => { if (!menuRef.current?.contains(e.target) && !btnRef.current.contains(e.target)) close(); };
    const reflow = e => {
      if (e && e.type === 'scroll' && menuRef.current?.contains(e.target)) return;
      close();
    };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [!!state]);

  const painted = state ? { state, pos } : closingRef.current;
  return { state, setState, open, close, shown, position, painted };
}
