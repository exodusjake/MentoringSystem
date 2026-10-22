import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEnhancer } from '../app/Page.jsx';
import { useStyle } from '../lib/injectStyle.js';
import { TIME_CSS } from './timeCss.js';
import { commitValue, h12, pad, useNativeSync, usePopup, useTriggerLook } from './pickerBase.js';

// Drop-in <input type="time">. On pages that loaded ui-timepicker.js in the original it gets the
// themed picker (hour / minute / AM-PM columns, Clear / Now); elsewhere the plain native input.
// The input keeps the value ("HH:mm").
const TimeInput = forwardRef(function TimeInput(props, ref) {
  const themed = useEnhancer('time');
  if (!themed || props['data-native']) return <input ref={ref} {...props} />;
  return <ThemedTime {...props} forwardedRef={ref} />;
});
export default TimeInput;

const CLOCK = (
  <svg className="tp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
);

function parse(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return { h: +m[1], mi: +m[2] };
}
const fmt = t => h12(t.h) + ':' + pad(t.mi) + ' ' + (t.h >= 12 ? 'PM' : 'AM');

function ThemedTime({ forwardedRef, className = '', onFocus, ...props }) {
  useStyle('ui-timepicker', TIME_CSS);
  const inpRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useImperativeHandle(forwardedRef, () => inpRef.current);
  useNativeSync(inpRef);
  const look = useTriggerLook(inpRef, false);
  // Popup state: { t: working time, scroll: bump to re-center the selected cells }
  const { state, setState, open, close, shown, position, painted } = usePopup('time', btnRef, menuRef);

  const value = props.value !== undefined ? String(props.value ?? '') : (inpRef.current ? inpRef.current.value : String(props.defaultValue ?? ''));
  const cur = parse(value);

  // On open: center the selected cells, then place the popup.
  useLayoutEffect(() => {
    if (!state) return;
    scrollSelected();
    if (state.scroll === 0) position();
  }, [state?.scroll]);

  function scrollSelected() {
    menuRef.current?.querySelectorAll('.tp-col[data-col]').forEach(col => {
      const s = col.querySelector('.selected');
      if (s) col.scrollTop = s.offsetTop - col.clientHeight / 2 + s.offsetHeight / 2;
    });
  }

  function doOpen() {
    if (inpRef.current.disabled || state) return;
    open({ t: parse(inpRef.current.value) || { h: 9, mi: 0 }, scroll: 0 });
  }
  const commit = (t, clear) => commitValue(inpRef.current, clear ? '' : pad(t.h) + ':' + pad(t.mi));

  function onCell(k, v) {
    const t = { ...state.t };
    if (k === 'h') t.h = (+v % 12) + (t.h >= 12 ? 12 : 0);
    else if (k === 'mi') t.mi = +v;
    else t.h = (t.h % 12) + (v === 'PM' ? 12 : 0);
    commit(t, false);
    setState(s => s && { t, scroll: s.scroll + 1 });
    if (k === 'mi') close(true); // minute is the last thing picked
  }

  const enhanced = !!look;
  const cell = (kind, val, text, sel) => (
    <button key={kind + val} type="button" className={'tp-cell' + (sel ? ' selected' : '')} data-k={kind} data-v={val} onClick={() => onCell(kind, val)}>{text}</button>
  );
  let menu = null;
  if (painted) {
    const t = painted.state.t;
    const hours = [], mins = [];
    for (let h = 1; h <= 12; h++) hours.push(cell('h', h, pad(h), h === h12(t.h)));
    for (let m = 0; m < 60; m += 1) mins.push(cell('mi', m, pad(m), m === t.mi));
    menu = (
      <>
        <div className="tp-cols">
          <div className="tp-col" data-col="h">{hours}</div>
          <div className="tp-col" data-col="mi">{mins}</div>
          <div className="tp-col">{cell('ap', 'AM', 'AM', t.h < 12)}{cell('ap', 'PM', 'PM', t.h >= 12)}</div>
        </div>
        <div className="tp-foot">
          <button type="button" className="tp-link" data-act="clear" onClick={() => { commit(null, true); close(true); }}>Clear</button>
          <button type="button" className="tp-link" data-act="now" onClick={() => { const n = new Date(); commit({ h: n.getHours(), mi: n.getMinutes() }, false); close(true); }}>Now</button>
        </div>
      </>
    );
  }

  return (
    <>
      <input ref={inpRef} {...props}
        className={className + (enhanced ? (className ? ' ' : '') + 'tp-native' : '')}
        tabIndex={enhanced ? -1 : props.tabIndex}
        aria-hidden={enhanced ? 'true' : props['aria-hidden']}
        data-tp={enhanced ? '1' : undefined}
        onFocus={e => { onFocus?.(e); if (enhanced) btnRef.current.focus(); }} />
      {enhanced && (
        <button type="button" ref={btnRef} className={'tp-trigger ' + className + (state ? ' open' : '')}
          aria-haspopup="dialog" aria-expanded={state ? 'true' : 'false'} data-for={props.id}
          style={look} disabled={!!props.disabled}
          onClick={() => (state ? close() : doOpen())}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!state) doOpen(); }
            else if (e.key === 'Escape' && state) { e.preventDefault(); e.stopPropagation(); close(true); }
          }}>
          <span className={'tp-label' + (cur ? '' : ' is-placeholder')}>{cur ? fmt(cur) : (props.placeholder || 'Select time')}</span>
          {CLOCK}
        </button>
      )}
      {menu && createPortal(
        <div ref={state ? menuRef : undefined} role="dialog" aria-label="Choose time"
          className={'tp-menu' + (painted.pos?.up ? ' up' : '') + (state && shown ? ' show' : '')}
          style={painted.pos?.style}>
          {menu}
        </div>,
        document.body,
      )}
    </>
  );
}
