import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnhancer, usePage } from '../app/Page.jsx';

// ui-dropdown.js: replaces the native <select> popup with a themed dropdown. The real <select> stays in
// the DOM (hidden) and remains the source of truth, so `value` / `onChange` work exactly like a normal
// <select>. Drop-in for <select>: pages that did not load ui-dropdown.js keep the native control.
// Opt out with data-native="1".
const CHEVRON = <svg className="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>;
const CHECK = <svg className="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>;

const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
let openClose = null; // closes the currently open dropdown

export default function Select(props) {
  const enhanced = useEnhancer('select') && !props['data-native'] && !props.multiple && !(props.size > 1);
  if (!enhanced) {
    const { children, ...rest } = props;
    return <select {...rest}>{children}</select>;
  }
  return <EnhancedSelect {...props} />;
}

function EnhancedSelect({ children, className = '', style, onChange, disabled, id, ...rest }) {
  const selRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [look, setLook] = useState(null);       // computed look copied from the native select
  const [label, setLabel] = useState({ text: ' ', placeholder: false });
  const [open, setOpen] = useState(false);
  const [menuShow, setMenuShow] = useState(false);
  const [active, setActive] = useState(-1);
  const [menuPos, setMenuPos] = useState(null);
  const [, bump] = useState(0);
  const typed = useRef({ text: '', timer: null });

  // Copy the native select's look onto the trigger (measured before it is hidden, via a probe sibling).
  const { ready } = usePage();
  useLayoutEffect(() => {
    if (!ready) return;   // the page stylesheets decide the look; wait until they are in
    const sel = selRef.current;
    const probe = document.createElement('select');
    probe.className = className;
    if (sel.getAttribute('style')) probe.setAttribute('style', sel.getAttribute('style'));
    sel.parentNode.insertBefore(probe, sel);
    const cs = getComputedStyle(probe);
    const bare = cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0;
    const st = { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color };
    if (!bare) {
      st.border = cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor;
      st.borderRadius = cs.borderTopLeftRadius;
      st.padding = cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft;
      st.backgroundColor = cs.backgroundColor;
      st.width = '100%';
    } else {
      st.border = '0'; st.background = 'transparent'; st.padding = '0'; st.flex = '1'; st.width = '100%';
    }
    if (cs.maxWidth && cs.maxWidth !== 'none') st.maxWidth = cs.maxWidth;
    probe.remove();
    setLook({ bare, style: st });
  }, [ready]);

  // Keep the trigger's label in sync with the native select after every render (value, options, disabled).
  useLayoutEffect(() => {
    const sel = selRef.current;
    const opt = sel.options[sel.selectedIndex];
    const text = opt ? opt.textContent.trim() : '';
    const next = { text: text || ' ', placeholder: !!opt && opt.value === '' && /^(select|choose|—|-|\.\.\.)/i.test(text) };
    setLabel(cur => (cur.text === next.text && cur.placeholder === next.placeholder ? cur : next));
  });

  const optionItems = () => {
    const sel = selRef.current;
    const out = [];
    if (!sel) return out;
    const addOption = o => { if (!o.hidden) out.push({ kind: 'opt', option: o }); };
    for (const c of sel.children) {
      if (c.tagName === 'OPTGROUP') {
        out.push({ kind: 'group', label: c.label });
        for (const o of c.children) addOption(o);
      } else if (c.tagName === 'OPTION') addOption(c);
    }
    return out;
  };
  const items = open ? optionItems() : [];
  const opts = items.filter(i => i.kind === 'opt');

  const close = focusBack => {
    if (!open) return;
    setMenuShow(false);
    setTimeout(() => setOpen(false), 180);
    if (openClose === closeRef.current) openClose = null;
    if (focusBack) btnRef.current?.focus();
  };
  const closeRef = useRef(null);
  closeRef.current = close;

  const doOpen = () => {
    const sel = selRef.current;
    if (sel.disabled || open) return;
    if (openClose) openClose();
    openClose = () => closeRef.current();
    setOpen(true);
    setMenuShow(false);
    const all = Array.from(sel.options).filter(o => !o.hidden);
    const selIdx = all.findIndex(o => o.selected);
    setActive(selIdx >= 0 ? selIdx : all.findIndex(o => !o.disabled));
  };

  // Position the menu, then fade it in (and wire the outside-click / reflow listeners).
  useLayoutEffect(() => {
    if (!open) return;
    const m = menuRef.current;
    const place = () => {
      const r = btnRef.current.getBoundingClientRect();
      const gap = 6;
      // Head portal on phones: rows are taller there, so the menu may be a little taller too.
      const cap = window.innerWidth <= 768 && document.body.classList.contains('head-polish') ? 340 : 300;
      m.style.minWidth = Math.max(r.width, 160) + 'px';
      m.style.maxWidth = Math.min(window.innerWidth - 16, 420) + 'px';
      const mh = Math.min(m.scrollHeight, cap);
      const below = window.innerHeight - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      const up = mh > below && above > below;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8);
      return {
        up,
        maxHeight: Math.max(120, Math.min(cap, up ? above : below)),
        left,
        ...(up ? { top: 'auto', bottom: window.innerHeight - r.top + gap } : { bottom: 'auto', top: r.bottom + gap }),
      };
    };
    setMenuPos(place());
    const raf = requestAnimationFrame(() => setMenuShow(true));
    const outside = e => { if (!m.contains(e.target) && !btnRef.current.contains(e.target)) closeRef.current(); };
    const startWidth = window.innerWidth;
    const reflow = e => {
      if (e && e.type === 'scroll' && m.contains(e.target)) return;
      // On a phone, the on-screen keyboard closing (after typing in a search box) or the address bar sliding away resizes
      // or nudges the page. That used to close the menu the instant it opened, so keep it attached to its trigger instead;
      // it closes only if the trigger leaves the screen or the width changes (rotation).
      if (window.innerWidth <= 768 && window.innerWidth === startWidth && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) { closeRef.current(); return; }
        setMenuPos(place());
        return;
      }
      closeRef.current();
    };
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', outside, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open]);

  useEffect(() => () => { if (openClose && openClose === closeRef.current) openClose = null; }, []);

  useEffect(() => {
    if (open && menuRef.current && active >= 0) {
      menuRef.current.querySelectorAll('.dd-opt')[active]?.scrollIntoView({ block: 'nearest' });
    }
  }, [active, open]);

  const choose = idx => {
    const sel = selRef.current;
    const item = opts[idx];
    if (item && !item.option.disabled) {
      const changed = sel.selectedIndex !== item.option.index;
      indexDesc.set.call(sel, item.option.index);
      if (changed) {
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      bump(n => n + 1);
    }
    close(true);
  };

  const move = dir => {
    const n = opts.length;
    if (!n) return;
    let i = active;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!opts[i].option.disabled) { setActive(i); return; }
    }
  };

  const typeAhead = ch => {
    const t = typed.current;
    t.text += ch.toLowerCase();
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { t.text = ''; }, 700);
    if (!open) doOpen();
    const list = optionItems().filter(i => i.kind === 'opt');
    const from = active >= 0 ? active : 0;
    for (let k = 0; k < list.length; k++) {
      const i = (from + (t.text.length > 1 ? 0 : 1) + k) % list.length;
      const it = list[i];
      if (!it.option.disabled && it.option.textContent.trim().toLowerCase().indexOf(t.text) === 0) { setActive(i); return; }
    }
  };

  const onKey = e => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!open) doOpen(); else move(1); break;
      case 'ArrowUp': e.preventDefault(); if (!open) doOpen(); else move(-1); break;
      case 'Home': if (open) { e.preventDefault(); setActive(0); } break;
      case 'End': if (open) { e.preventDefault(); setActive(opts.length - 1); } break;
      case 'Enter':
      case ' ':
        if (open) { e.preventDefault(); choose(active); }
        break;
      case 'Escape': if (open) { e.preventDefault(); e.stopPropagation(); close(true); } break;
      case 'Tab': if (open) close(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    }
  };

  let optIndex = -1;
  const menu = open ? createPortal(
    <div className={`dd-menu${menuPos?.up ? ' up' : ''}${menuShow ? ' show' : ''}`} role="listbox" ref={menuRef}
      style={menuPos ? { maxHeight: menuPos.maxHeight, left: menuPos.left, top: menuPos.top, bottom: menuPos.bottom } : undefined}>
      {items.length === 0 ? <div className="dd-empty">No options</div> : items.map((it, k) => {
        if (it.kind === 'group') return <div className="dd-group" key={'g' + k}>{it.label}</div>;
        const idx = ++optIndex;
        const o = it.option;
        return (
          <div key={'o' + k} role="option" aria-selected={o.selected ? 'true' : 'false'}
            className={`dd-opt${o.selected ? ' selected' : ''}${o.disabled ? ' disabled' : ''}${idx === active ? ' hover' : ''}`}
            onMouseEnter={o.disabled ? undefined : () => setActive(idx)}
            onMouseDown={o.disabled ? undefined : e => e.preventDefault()}
            onClick={o.disabled ? undefined : () => choose(idx)}>
            <span className="dd-opt-text">{o.textContent.trim() || ' '}</span>{CHECK}
          </div>
        );
      })}
    </div>, document.body) : null;

  return (
    <>
      <select {...rest} id={id} ref={selRef} className={`${className} dd-native`.trim()} style={style} disabled={disabled}
        onChange={onChange} tabIndex={-1} aria-hidden="true" data-dd="1"
        onFocus={() => btnRef.current?.focus()}>
        {children}
      </select>
      <button type="button" ref={btnRef}
        className={`dd-trigger ${look ? (look.bare ? 'dd-bare' : 'dd-boxed') : ''} ${className}${open ? ' open' : ''}`}
        style={look?.style} aria-haspopup="listbox" aria-expanded={open ? 'true' : 'false'} data-for={id || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : doOpen())} onKeyDown={onKey}>
        <span className={`dd-label${label.placeholder ? ' is-placeholder' : ''}`}>{label.text}</span>{CHEVRON}
      </button>
      {menu}
    </>
  );
}
