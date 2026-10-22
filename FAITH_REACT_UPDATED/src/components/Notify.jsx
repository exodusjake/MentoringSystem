import { useEffect, useRef, useState } from 'react';
import { on, emit } from '../lib/events.js';
import { useStyle } from '../lib/injectStyle.js';
import { NOTIFY_CSS } from './notifyCss.js';

/* notify.js — shared toast + confirm dialog. `showToast` / `showConfirm` keep the vanilla signatures;
   <NotifyHost/> (mounted once in main.jsx) renders them. */

// showToast(message, type?, durationMs?) — type is 'error' (default), 'success', or 'info'.
export function showToast(message, type = 'error', durationMs = 4500, title = null) {
  emit('toast', { message, type, durationMs, title, id: Math.random() });
}

// showConfirm(message, options?) -> Promise<boolean>
export function showConfirm(message, options = {}) {
  return new Promise(resolve => emit('confirm', { message, options, resolve }));
}

const ICONS = {
  error:   <svg viewBox="0 0 24 24"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  success: <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  warning: <svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.4 2.4-2.1-.5-.5-2.1z"/></svg>,
  info:    <svg viewBox="0 0 24 24"><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.5" x2="12.01" y2="7.5"/></svg>,
};

function Toast({ toast, onGone }) {
  const [shown, setShown] = useState(false);
  const [hidden, setHidden] = useState(false);
  const barRef = useRef(null);
  const animRef = useRef(null);
  const goneRef = useRef(false);
  const type = ICONS[toast.type] ? toast.type : 'info';

  const dismiss = () => {
    if (goneRef.current) return;
    goneRef.current = true;
    setShown(false);
    setHidden(true);
    setTimeout(() => onGone(toast.id), 240);
  };

  useEffect(() => {
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
    // The bar runs for the full duration; when it empties the toast leaves. Hovering pauses it.
    const bar = barRef.current;
    let timer;
    if (bar && bar.animate) {
      animRef.current = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: toast.durationMs, easing: 'linear', fill: 'forwards' });
      animRef.current.onfinish = dismiss;
    } else {
      timer = setTimeout(dismiss, toast.durationMs);
    }
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(timer); };
  }, []);

  return (
    <div className={`nf-toast nf-toast-${type}${shown ? ' nf-show' : ''}${hidden ? ' nf-hide' : ''}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      style={{ '--nf-dur': toast.durationMs + 'ms' }}
      onMouseEnter={() => animRef.current?.pause()}
      onMouseLeave={() => { if (!goneRef.current) animRef.current?.play(); }}>
      <div className="nf-toast-progress"><span className="nf-toast-bar" ref={barRef}></span></div>
      <span className="nf-toast-icon">{ICONS[toast.type] || ICONS.info}</span>
      <span className="nf-toast-body">{toast.title ? <strong style={{ display: 'block' }}>{toast.title}</strong> : null}{toast.message}</span>
      <button className="nf-toast-close" aria-label="Dismiss" onClick={dismiss}>&times;</button>
    </div>
  );
}

function Confirm({ item, onDone }) {
  const [shown, setShown] = useState(false);
  const { message, options, resolve } = item;
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  const close = result => {
    setShown(false);
    setTimeout(() => onDone(item), 150);
    resolve(result);
  };
  return (
    <div className={`nf-confirm-overlay${shown ? ' nf-show' : ''}`} onClick={e => { if (e.target === e.currentTarget) close(false); }}>
      <div className="nf-confirm-card">
        <h3 className="nf-confirm-title">{options.title || (options.variant === 'primary' ? 'Please confirm' : 'Are you sure?')}</h3>
        <p className="nf-confirm-message">{message}</p>
        <div className="nf-confirm-actions">
          <button className="nf-confirm-btn nf-confirm-cancel" onClick={() => close(false)}>{options.cancelText || 'Cancel'}</button>
          <button className={`nf-confirm-btn nf-confirm-ok${options.variant === 'primary' ? ' nf-confirm-primary' : ''}`} onClick={() => close(true)}>{options.confirmText || 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

export default function NotifyHost() {
  useStyle('nf-styles', NOTIFY_CSS);
  const [toasts, setToasts] = useState([]);
  const [confirms, setConfirms] = useState([]);
  useEffect(() => {
    const offT = on('toast', t => setToasts(list => [...list, t]));
    const offC = on('confirm', c => setConfirms(list => [...list, c]));
    return () => { offT(); offC(); };
  }, []);
  return (
    <>
      {toasts.length > 0 && (
        <div id="nf-toast-stack">
          {toasts.map(t => <Toast key={t.id} toast={t} onGone={id => setToasts(list => list.filter(x => x.id !== id))} />)}
        </div>
      )}
      {confirms.map((c, i) => <Confirm key={i} item={c} onDone={item => setConfirms(list => list.filter(x => x !== item))} />)}
    </>
  );
}
