import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { emit, on } from '../lib/events.js';
import { useStyle } from '../lib/injectStyle.js';
import { NOTIFY_CSS } from './notifyCss.js';

// Shared toast + confirm dialog (the original notify.js), replacing native alert()/confirm().
// showToast(message, type?, durationMs?) — type is 'error' (default), 'success' or 'info'.
// showConfirm(message, options?) -> Promise<boolean>.
export function showToast(message, type = 'error', durationMs = 4500) {
  emit('toast', { message, type, durationMs });
}
export function showConfirm(message, options = {}) {
  return new Promise(resolve => emit('confirm', { message, options, resolve }));
}

const ICONS = {
  error: <svg viewBox="0 0 24 24"><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  success: <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>,
  info: <svg viewBox="0 0 24 24"><line x1="12" y1="11" x2="12" y2="16" /><line x1="12" y1="7.5" x2="12.01" y2="7.5" /></svg>,
};

let nextId = 1;

export default function NotifyHost() {
  const [used, setUsed] = useState(false);        // CSS is added on first use, as before
  const [toasts, setToasts] = useState([]);
  const [stackUsed, setStackUsed] = useState(false);
  const [confirms, setConfirms] = useState([]);
  useStyle('notify', NOTIFY_CSS, used);

  useEffect(() => on('toast', t => { setUsed(true); setStackUsed(true); setToasts(list => [...list, { ...t, id: nextId++ }]); }), []);
  useEffect(() => on('confirm', c => { setUsed(true); setConfirms(list => [...list, { ...c, id: nextId++ }]); }), []);

  return (
    <>
      {/* Like the original, the stack stays in the page (empty) once the first toast has shown. */}
      {stackUsed && (
        <div id="nf-toast-stack">
          {toasts.map(t => <Toast key={t.id} {...t} onGone={() => setToasts(list => list.filter(x => x.id !== t.id))} />)}
        </div>
      )}
      {confirms.map(c => <Confirm key={c.id} {...c} onGone={() => setConfirms(list => list.filter(x => x.id !== c.id))} />)}
    </>
  );
}

function Toast({ message, type, durationMs, onGone }) {
  const kind = ICONS[type] ? type : 'info';
  const [phase, setPhase] = useState('');          // '' → 'nf-show' → 'nf-hide'
  const barRef = useRef(null);
  const gone = useRef(false);

  function dismiss() {
    if (gone.current) return;
    gone.current = true;
    setPhase('nf-hide');
    setTimeout(onGone, 240);
  }

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase(p => p || 'nf-show')));
  }, []);

  // The bar runs for the full duration; when it empties the toast leaves. Hovering pauses it.
  const anim = useRef(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (bar.animate) {
      anim.current = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: durationMs, easing: 'linear', fill: 'forwards' });
      anim.current.onfinish = dismiss;
    } else {
      const id = setTimeout(dismiss, durationMs);
      return () => clearTimeout(id);
    }
  }, []);

  return (
    <div className={`nf-toast nf-toast-${kind}` + (phase ? ' ' + phase : '')} role={type === 'error' ? 'alert' : 'status'}
      style={{ '--nf-dur': durationMs + 'ms' }}
      onMouseEnter={() => anim.current?.pause()}
      onMouseLeave={() => { if (!gone.current) anim.current?.play(); }}>
      <div className="nf-toast-progress"><span className="nf-toast-bar" ref={barRef}></span></div>
      <span className="nf-toast-icon">{ICONS[type] || ICONS.info}</span>
      <span className="nf-toast-body">{message}</span>
      <button className="nf-toast-close" aria-label="Dismiss" onClick={dismiss}>&times;</button>
    </div>
  );
}

function Confirm({ message, options, resolve, onGone }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setShown(true)); }, []);
  function close(result) {
    setShown(false);
    setTimeout(onGone, 150);
    resolve(result);
  }
  const primary = options.variant === 'primary';
  return (
    <div className={'nf-confirm-overlay' + (shown ? ' nf-show' : '')} onClick={e => { if (e.target === e.currentTarget) close(false); }}>
      {/* The original confirm-dialog restyler also enhanced this card (title, message, two actions). */}
      <div className="nf-confirm-card" data-astra-confirm="1">
        <h3 className="nf-confirm-title" data-ac="title">{options.title || (primary ? 'Please confirm' : 'Are you sure?')}</h3>
        <p className="nf-confirm-message" data-ac="body">{message}</p>
        <div className="nf-confirm-actions" data-ac="actions">
          <button className="nf-confirm-btn nf-confirm-cancel" onClick={() => close(false)}>{options.cancelText || 'Cancel'}</button>
          <button className={'nf-confirm-btn nf-confirm-ok' + (primary ? ' nf-confirm-primary' : '')} onClick={() => close(true)}>{options.confirmText || 'Delete'}</button>
        </div>
        <button type="button" className="astra-confirm-x" aria-label="Close" onClick={e => { e.stopPropagation(); close(false); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    </div>
  );
}
