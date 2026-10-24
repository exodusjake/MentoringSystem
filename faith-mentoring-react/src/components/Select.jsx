import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnhancer, usePage } from '../app/Page.jsx';
import { useStyle } from '../lib/injectStyle.js';
import { settledStyle } from './pickerBase.js';
import { SELECT_CSS } from './selectCss.js';

// Drop-in <select>. On pages that loaded ui-dropdown.js in the original it renders the themed
// dropdown (blue accents, rounded panel, check on the selected item, keyboard support); elsewhere
// a plain native <select>. The native <select> stays in the DOM as the source of truth, so value,
// onChange, disabled, options and form validation behave exactly like a normal select.
const Select = forwardRef(function Select(props, ref) {
  const themed = useEnhancer('select');
  const { multiple, size } = props;
  if (!themed || props['data-native'] || multiple || size > 1) return <select ref={ref} {...props} />;
  return <ThemedSelect {...props} forwardedRef={ref} />;
});
export default Select;

const CHEVRON = (
  <svg className="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);
const CHECK = (
  <svg className="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
);

let openInstance = null;   // only one dropdown open at a time

function ThemedSelect({ forwardedRef, className = '', onFocus, ...props }) {
  useStyle('ui-dropdown', SELECT_CSS);
  const { ready } = usePage();
  const selRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useImperativeHandle(forwardedRef, () => selRef.current);

  const [look, setLook] = useState(null);          // trigger style copied from the native select
  const [label, setLabel] = useState({ text: ' ', placeholder: false });
  const [menu, setMenu] = useState(null);           // { items, active, up, pos } while open
  const [shown, setShown] = useState(false);        // .show (animated in)
  const closingRef = useRef(null);                  // menu kept for the 180 ms fade-out
  const typed = useRef({ text: '', timer: null });

  // Copy the select's computed look once the page's stylesheets are in (as the original did on load).
  useLayoutEffect(() => {
    if (!ready || look) return;
    const cs = settledStyle(selRef.current);
    const bare = cs.borderTopStyle === 'none' || parseFloat(cs.borderTopWidth) === 0;
    const st = { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color };
    if (!bare) {
      Object.assign(st, {
        border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
        borderRadius: cs.borderTopLeftRadius,
        padding: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
        backgroundColor: cs.backgroundColor,
        width: '100%',
      });
    } else {
      Object.assign(st, { border: '0', background: 'transparent', padding: '0', flex: '1', width: '100%' });
    }
    if (cs.maxWidth && cs.maxWidth !== 'none') st.maxWidth = cs.maxWidth;
    setLook({ bare, style: st });
  }, [ready, look]);

  // Label follows the select after every render (value, options, disabled may all change).
  useLayoutEffect(() => {
    const sel = selRef.current;
    const opt = sel.options[sel.selectedIndex];
    const text = opt ? opt.textContent.trim() : '';
    const placeholder = !!opt && opt.value === '' && /^(select|choose|—|-|\.\.\.)/i.test(text);
    if ((text || ' ') !== label.text || placeholder !== label.placeholder) setLabel({ text: text || ' ', placeholder });
    if (menu) {
      const items = readItems(sel);
      if (items.length !== menu.items.length || items.some((it, i) => it.selected !== menu.items[i].selected || it.text !== menu.items[i].text)) {
        setMenu(m => m && { ...m, items });
      }
    }
  });

  const latestMenu = useRef(null);
  latestMenu.current = menu;
  const [, rerender] = useState(0);
  const close = useCallback((focusBack) => {
    const m = latestMenu.current;
    if (!m) return;
    closingRef.current = m;                          // stays painted while it fades out
    setTimeout(() => { closingRef.current = null; rerender(n => n + 1); }, 180);
    setMenu(null);
    setShown(false);
    if (openInstance && openInstance.close === close) openInstance = null;
    if (focusBack) btnRef.current?.focus();
  }, []);

  function open() {
    const sel = selRef.current;
    if (sel.disabled || menu) return;
    if (openInstance && openInstance.close !== close) openInstance.close();
    const items = readItems(sel);
    let active = items.findIndex(it => it.selected && it.option);
    if (active < 0) active = items.findIndex(it => it.option && !it.disabled);
    setMenu({ items, active, scroll: true, pos: null });
    openInstance = { close };
    requestAnimationFrame(() => setShown(true));
  }

  // Position the open menu (and close it on outside click / resize / page scroll).
  useLayoutEffect(() => {
    if (!menu || menu.pos) return;
    const r = btnRef.current.getBoundingClientRect();
    const m = menuRef.current, gap = 6;
    m.style.minWidth = Math.max(r.width, 160) + 'px';
    m.style.maxWidth = Math.min(window.innerWidth - 16, 420) + 'px';
    const mh = Math.min(m.scrollHeight, 300);
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const up = mh > below && above > below;
    const pos = {
      minWidth: Math.max(r.width, 160) + 'px',
      maxWidth: Math.min(window.innerWidth - 16, 420) + 'px',
      maxHeight: Math.max(120, Math.min(300, up ? above : below)) + 'px',
      left: Math.min(Math.max(8, r.left), window.innerWidth - m.offsetWidth - 8) + 'px',
      top: up ? 'auto' : (r.bottom + gap) + 'px',
      bottom: up ? (window.innerHeight - r.top + gap) + 'px' : 'auto',
    };
    setMenu(cur => cur && { ...cur, pos, up });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const outside = e => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current.contains(e.target)) close();
    };
    const reflow = e => {
      if (e && e.type === 'scroll' && menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [!!menu]);

  // Keep the active option in view.
  useLayoutEffect(() => {
    if (!menu || !menu.scroll || menu.active < 0) return;
    menuRef.current?.querySelector(`[data-i="${menu.active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [menu?.active, menu?.pos]);

  const setActive = (i, scroll = true) => setMenu(m => {
    if (!m || i < 0 || i >= m.items.length || !m.items[i].option) return m;
    return { ...m, active: i, scroll };
  });

  function move(dir) {
    if (!menu) return;
    const opts = menu.items;
    const n = opts.length;
    if (!n) return;
    let i = menu.active;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (opts[i].option && !opts[i].disabled) { setActive(i); return; }
    }
  }

  function choose(item) {
    const sel = selRef.current;
    if (item && item.option && !item.disabled) {
      const changed = sel.selectedIndex !== item.index;
      sel.selectedIndex = item.index;
      if (changed) {
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    close(true);
  }

  function typeAhead(ch) {
    const t = typed.current;
    t.text += ch.toLowerCase();
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { t.text = ''; }, 700);
    const items = menu ? menu.items : readItems(selRef.current);
    if (!menu) open();
    const from = menu && menu.active >= 0 ? menu.active : 0;
    for (let k = 0; k < items.length; k++) {
      const i = (from + (t.text.length > 1 ? 0 : 1) + k) % items.length;
      const it = items[i];
      if (it.option && !it.disabled && it.text.toLowerCase().indexOf(t.text) === 0) { setActive(i); return; }
    }
  }

  function onKey(e) {
    const isOpen = !!menu;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!isOpen) open(); else move(1); break;
      case 'ArrowUp': e.preventDefault(); if (!isOpen) open(); else move(-1); break;
      case 'Home': if (isOpen) { e.preventDefault(); setActive(firstOption(menu.items, 1)); } break;
      case 'End': if (isOpen) { e.preventDefault(); setActive(firstOption(menu.items, -1)); } break;
      case 'Enter':
      case ' ':
        if (isOpen) { e.preventDefault(); choose(menu.items[menu.active]); }
        break;
      case 'Escape': if (isOpen) { e.preventDefault(); e.stopPropagation(); close(true); } break;
      case 'Tab': if (isOpen) close(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    }
  }

  const enhanced = !!look;
  const shownMenu = menu || closingRef.current;
  return (
    <>
      <select ref={selRef} {...props}
        className={className + (enhanced ? (className ? ' ' : '') + 'dd-native' : '')}
        tabIndex={enhanced ? -1 : props.tabIndex}
        aria-hidden={enhanced ? 'true' : props['aria-hidden']}
        data-dd={enhanced ? '1' : undefined}
        onFocus={e => { onFocus?.(e); if (enhanced) btnRef.current.focus(); }} />
      {enhanced && (
        <button type="button" ref={btnRef}
          className={'dd-trigger ' + (look.bare ? 'dd-bare' : 'dd-boxed') + ' ' + className + (menu ? ' open' : '')}
          aria-haspopup="listbox" aria-expanded={menu ? 'true' : 'false'} data-for={props.id}
          style={look.style} disabled={!!props.disabled}
          onClick={() => (menu ? close() : open())} onKeyDown={onKey}>
          <span className={'dd-label' + (label.placeholder ? ' is-placeholder' : '')}>{label.text}</span>
          {CHEVRON}
        </button>
      )}
      {shownMenu && createPortal(
        <div ref={menu ? menuRef : undefined} role="listbox"
          className={'dd-menu' + (shownMenu.up ? ' up' : '') + (menu && shown ? ' show' : '')}
          style={shownMenu.pos || undefined}>
          {shownMenu.items.length === 0 && <div className="dd-empty">No options</div>}
          {shownMenu.items.map((it, i) => it.group
            ? <div key={'g' + i} className="dd-group">{it.group}</div>
            : (
              <div key={i} data-i={i} role="option" aria-selected={it.selected ? 'true' : 'false'}
                className={'dd-opt' + (it.selected ? ' selected' : '') + (it.disabled ? ' disabled' : '') + (shownMenu.active === i ? ' hover' : '')}
                onMouseEnter={it.disabled ? undefined : () => setActive(i)}
                onMouseDown={it.disabled ? undefined : e => e.preventDefault()}
                onClick={it.disabled ? undefined : () => choose(it)}>
                <span className="dd-opt-text">{it.text || ' '}</span>{CHECK}
              </div>
            ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// Options/optgroups as the menu shows them (hidden options skipped).
function readItems(sel) {
  const items = [];
  const add = o => { if (!o.hidden) items.push({ option: true, index: o.index, text: o.textContent.trim(), selected: o.selected, disabled: o.disabled }); };
  for (const c of sel.children) {
    if (c.tagName === 'OPTGROUP') {
      items.push({ group: c.label });
      for (const o of c.children) add(o);
    } else if (c.tagName === 'OPTION') add(c);
  }
  return items.some(it => it.option) ? items : items.filter(it => it.option);
}

function firstOption(items, dir) {
  if (dir > 0) return items.findIndex(it => it.option);
  for (let i = items.length - 1; i >= 0; i--) if (items[i].option) return i;
  return -1;
}
