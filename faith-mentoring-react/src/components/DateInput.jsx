import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEnhancer } from '../app/Page.jsx';
import { useStyle } from '../lib/injectStyle.js';
import { DATE_CSS } from './dateCss.js';
import { commitValue, h12, pad, useNativeSync, usePopup, useTriggerLook } from './pickerBase.js';

// Drop-in <input type="date"> / <input type="datetime-local">. On pages that loaded
// ui-datepicker.js in the original it gets the themed calendar (month navigation, Today / Clear,
// and an hour/minute/AM-PM row for datetime-local); elsewhere it's the plain native input.
// The input keeps the value ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"), so value/onChange/min/max/
// disabled behave as usual.
const DateInput = forwardRef(function DateInput(props, ref) {
  const themed = useEnhancer('date');
  if (!themed || props['data-native']) return <input ref={ref} {...props} />;
  return <ThemedDate {...props} forwardedRef={ref} />;
});
export default DateInput;

const CAL = (
  <svg className="dp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
);
const PREV = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>;
const NEXT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const iso = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
function parse(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const dt = new Date(y, mo, d);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? { y, m: mo, d } : null;
}
function today() { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; }
function parseTime(v) {
  const m = /T(\d{2}):(\d{2})/.exec(v || '');
  return m ? { h: +m[1], mi: +m[2] } : null;
}
function fmt(p, t) {
  let out = MONTHS[p.m].slice(0, 3) + ' ' + p.d + ', ' + p.y;
  if (t) out += ', ' + h12(t.h) + ':' + pad(t.mi) + ' ' + (t.h >= 12 ? 'PM' : 'AM');
  return out;
}

function ThemedDate({ forwardedRef, className = '', onFocus, ...props }) {
  useStyle('ui-datepicker', DATE_CSS);
  const inpRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useImperativeHandle(forwardedRef, () => inpRef.current);
  useNativeSync(inpRef);
  const look = useTriggerLook(inpRef, true);
  const dt = props.type === 'datetime-local';
  const timeRef = useRef({ h: 23, mi: 59 });       // time used when a day is picked (datetime-local)
  // Popup state: { view: {y, m}, time, seq } — seq bumps when the popup should be re-positioned.
  const { state, setState, open, close, shown, position, painted } = usePopup('date', btnRef, menuRef);

  const value = props.value !== undefined ? String(props.value ?? '') : (inpRef.current ? inpRef.current.value : String(props.defaultValue ?? ''));
  const p = parse(value);
  const placeholder = props.placeholder || (dt ? 'Select date & time' : 'Select date');
  const labelText = p ? fmt(p, dt ? parseTime(value) : null) : placeholder;

  useLayoutEffect(() => { if (state) position(); }, [state?.seq]);

  const inp = () => inpRef.current;
  const inRange = s => {
    const min = (inp().min || '').slice(0, 10), max = (inp().max || '').slice(0, 10);
    return !(min && s < min) && !(max && s > max);
  };
  function doOpen() {
    if (inp().disabled || state) return;
    const cur = parse(inp().value) || today();
    if (dt) { const pt = parseTime(inp().value); if (pt) timeRef.current = pt; }
    open({ view: { y: cur.y, m: cur.m }, time: { ...timeRef.current }, seq: 1 });
  }
  const setTime = t => { timeRef.current = t; setState(s => s && { ...s, time: t }); };
  const choose = v => { commitValue(inp(), v); close(true); };
  // datetime-local: set the date (keeping the chosen time) without closing.
  const pick = s => {
    if (!dt) { choose(s); return; }
    const t = timeRef.current;
    commitValue(inp(), s + 'T' + pad(t.h) + ':' + pad(t.mi));
    setState(st => st && { ...st });
  };
  const timeChanged = t => {
    setTime(t);
    const cur = inp().value;
    if (parse(cur)) commitValue(inp(), cur.slice(0, 10) + 'T' + pad(t.h) + ':' + pad(t.mi));
  };
  const setTimePart = (part, n) => {
    const t = { ...timeRef.current };
    if (isNaN(n)) { setState(s => s && { ...s }); return; }
    if (part === 'h') { n = Math.min(12, Math.max(1, n)); t.h = (n % 12) + (t.h >= 12 ? 12 : 0); }
    else t.mi = Math.min(59, Math.max(0, n));
    timeChanged(t);
  };
  const step = (part, dir) => {
    const t = timeRef.current;
    if (part === 'h') setTimePart('h', ((h12(t.h) - 1 + dir + 12) % 12) + 1);
    else setTimePart('mi', (t.mi + dir + 60) % 60);
  };
  const shift = d => setState(s => {
    let m = s.view.m + d, y = s.view.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    return { ...s, view: { y, m }, seq: s.seq + 1 };
  });
  const onToday = () => {
    const n = today(), s = iso(n.y, n.m, n.d);
    if (!inRange(s)) setState(st => st && { ...st, view: { y: n.y, m: n.m } });
    else if (dt) { pick(s); setState(st => st && { ...st, view: { y: n.y, m: n.m } }); }
    else choose(s);
  };

  const enhanced = !!look;
  const menu = painted && renderMenu(painted.state);

  function renderMenu(st) {
    const v = st.view, sel = (value || '').slice(0, 10), t = today();
    const start = new Date(v.y, v.m, 1).getDay();
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(v.y, v.m, 1 - start + i);
      const s = iso(d.getFullYear(), d.getMonth(), d.getDate());
      const cls = 'dp-day' + (d.getMonth() !== v.m ? ' out' : '') + (s === sel ? ' selected' : '') +
        (d.getFullYear() === t.y && d.getMonth() === t.m && d.getDate() === t.d ? ' today' : '');
      days.push(<button key={s} type="button" className={cls} data-date={s} disabled={!inRange(s)} onClick={() => pick(s)}>{d.getDate()}</button>);
    }
    const tm = st.time;
    return (
      <>
        <div className="dp-head">
          <button type="button" className="dp-nav" data-nav="-1" aria-label="Previous month" onClick={() => shift(-1)}>{PREV}</button>
          <div className="dp-title">{MONTHS[v.m] + ' ' + v.y}</div>
          <button type="button" className="dp-nav" data-nav="1" aria-label="Next month" onClick={() => shift(1)}>{NEXT}</button>
        </div>
        <div className="dp-grid">
          {DAYS.map(d => <div key={d} className="dp-dow">{d}</div>)}
          {days}
        </div>
        {dt && (
          <div className="dp-time" key={`${tm.h}:${tm.mi}:${value}`}>
            <TimeBox part="h" label="Hour" initial={String(h12(tm.h))} onSet={setTimePart} onStep={step} />
            <span className="dp-colon">:</span>
            <TimeBox part="mi" label="Minute" initial={pad(tm.mi)} onSet={setTimePart} onStep={step} />
            <button type="button" className="dp-ampm" data-act="ampm" aria-label="Toggle AM or PM"
              onClick={() => timeChanged({ ...timeRef.current, h: (timeRef.current.h + 12) % 24 })}>{tm.h >= 12 ? 'PM' : 'AM'}</button>
          </div>
        )}
        <div className="dp-foot">
          <button type="button" className="dp-link" data-act="clear" onClick={() => choose('')}>Clear</button>
          <button type="button" className="dp-link" data-act="today" onClick={onToday}>Today</button>
          {dt && <button type="button" className="dp-link" data-act="done" onClick={() => close(true)}>Done</button>}
        </div>
      </>
    );
  }

  return (
    <>
      <input ref={inpRef} {...props}
        className={className + (enhanced ? (className ? ' ' : '') + 'dp-native' : '')}
        tabIndex={enhanced ? -1 : props.tabIndex}
        aria-hidden={enhanced ? 'true' : props['aria-hidden']}
        data-dp={enhanced ? '1' : undefined}
        onFocus={e => { onFocus?.(e); if (enhanced) btnRef.current.focus(); }} />
      {enhanced && (
        <button type="button" ref={btnRef} className={'dp-trigger ' + className + (state ? ' open' : '')}
          aria-haspopup="dialog" aria-expanded={state ? 'true' : 'false'} data-for={props.id} title={props.title}
          style={look} disabled={!!props.disabled}
          onClick={() => (state ? close() : doOpen())}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!state) doOpen(); }
            else if (e.key === 'Escape' && state) { e.preventDefault(); e.stopPropagation(); close(true); }
          }}>
          <span className={'dp-label' + (p ? '' : ' is-placeholder')}>{labelText}</span>
          {CAL}
        </button>
      )}
      {menu && createPortal(
        <div ref={state ? menuRef : undefined} role="dialog" aria-label="Choose date"
          className={'dp-menu' + (painted.pos?.up ? ' up' : '') + (state && shown ? ' show' : '')}
          style={painted.pos?.style}>
          {menu}
        </div>,
        document.body,
      )}
    </>
  );
}

// Hour / minute box in the datetime row: commits on change (blur or Enter), arrows step.
function TimeBox({ part, label, initial, onSet, onStep }) {
  return (
    <input className="dp-tin" data-t={part} inputMode="numeric" maxLength={2} aria-label={label} defaultValue={initial}
      onFocus={e => e.target.select()}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onStep(part, e.key === 'ArrowUp' ? 1 : -1); }
      }}
      onBlur={e => { if (e.target.value !== initial) onSet(part, parseInt(e.target.value, 10)); }} />
  );
}
