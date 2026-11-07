import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStyle } from '../lib/injectStyle.js';

// Shared by the concern bells (Admin/Head and Mentor) and the mentor's My Mentees page: the detail window and helpers.
//   role "staff"  (Admin/Head): read the concern and, while it is Open, write the response that closes it.
//   role "mentor": read their own concern and, once answered, the response.

export const RESPONSE_MIN = 2;
export const RESPONSE_MAX = 1000;

const CSS = [
  '.cb-overlay{position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.6);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:cbPop .18s ease both;font-family:"DM Sans",system-ui,sans-serif}',
  '@keyframes cbPop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}',
  '.cb-modal{width:100%;max-width:540px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:#fff;border-radius:18px;border-top:6px solid #dc2626;box-shadow:0 28px 70px rgba(127,29,29,.35);overflow:hidden}',
  '.cb-modal.answered{border-top-color:#16a34a;box-shadow:0 28px 70px rgba(21,128,61,.28)}',
  '.cb-mhead{display:flex;align-items:center;gap:12px;padding:18px 20px 12px;background:linear-gradient(180deg,#fef2f2,#fff)}',
  '.cb-modal.answered .cb-mhead{background:linear-gradient(180deg,#f0fdf4,#fff)}',
  '.cb-mhead-icon{width:42px;height:42px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;background:#dc2626;border-radius:13px}',
  '.cb-modal.answered .cb-mhead-icon{background:#16a34a}',
  '.cb-mtitle{flex:1;min-width:0;font-size:17px;font-weight:700;color:#7f1d1d}',
  '.cb-modal.answered .cb-mtitle{color:#14532d}',
  '.cb-mclose{width:32px;height:32px;border:none;background:none;font-size:24px;line-height:1;color:#6b7280;border-radius:8px;cursor:pointer}',
  '.cb-mclose:hover{background:#fee2e2;color:#991b1b}',
  '.cb-mbody{padding:6px 20px 8px;overflow-y:auto}',
  '.cb-status{display:inline-flex;align-items:center;gap:6px;margin:6px 0 4px;padding:4px 11px;font-size:12px;font-weight:700;border-radius:999px}',
  '.cb-status.open{color:#b91c1c;background:#fee2e2}.cb-status.done{color:#15803d;background:#dcfce7}',
  '.cb-status i{font-size:14px}',
  '.cb-facts{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:10px 0 14px;font-size:13px}',
  '.cb-facts dt{color:#6b7280}.cb-facts dd{margin:0;color:#111827;font-weight:600}',
  '.cb-label{margin:12px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6b7280}',
  '.cb-quote{white-space:pre-wrap;word-break:break-word;padding:13px 15px;font-size:14px;line-height:1.55;color:#1f2937;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:10px}',
  '.cb-quote.reply{background:#f0fdf4;border-color:#bbf7d0;border-left-color:#16a34a}',
  '.cb-replymeta{margin-top:6px;font-size:12px;color:#6b7280}',
  '.cb-wait{display:flex;gap:9px;align-items:flex-start;margin-top:14px;padding:11px 13px;font-size:13px;line-height:1.45;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px}',
  '.cb-wait i{font-size:18px;margin-top:1px}',
  '.cb-text{width:100%;box-sizing:border-box;min-height:110px;resize:vertical;font:inherit;font-size:14px;line-height:1.5;color:#111827;background:#f4f7fb;border:1.5px solid #dce3ec;border-radius:10px;padding:10px 12px;outline:none;transition:border-color .15s,box-shadow .15s}',
  '.cb-text:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}',
  '.cb-hint{margin-top:5px;display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:#9ca3af}',
  '.cb-err{margin-top:10px;padding:9px 12px;font-size:13px;color:#991b1b;background:#fee2e2;border:1px solid #fecaca;border-radius:8px}',
  '.cb-mfoot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px 18px}',
  '.cb-mbtn{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:14px;font-weight:600;padding:10px 20px;color:#fff;background:#2563eb;border:none;border-radius:10px;cursor:pointer;transition:background-color .18s,opacity .18s,transform .15s}',
  '.cb-mbtn:hover:not(:disabled){background:#1d4ed8}.cb-mbtn:active:not(:disabled){transform:scale(.97)}.cb-mbtn:disabled{opacity:.5;cursor:not-allowed}',
  '.cb-mbtn.ghost{color:#374151;background:#fff;border:1.5px solid #dce3ec}.cb-mbtn.ghost:hover:not(:disabled){background:#f4f7fb}',
  // Phones: a compact bottom sheet (about three quarters of the screen at most, smaller type and spacing), and the floating
  // dark-mode button is hidden while it is open (it sits above everything and covered the Send button).
  '@media (max-width:768px){body.cb-modal-open .theme-toggle{display:none!important}}',
  '@media (max-width:520px){',
  '.cb-overlay{padding:0;align-items:flex-end}',
  '.cb-modal{max-width:none;max-height:76dvh;border-radius:16px 16px 0 0;border-top-width:5px}',
  '.cb-mhead{gap:10px;padding:12px 14px 8px}',
  '.cb-mhead-icon{width:34px;height:34px;font-size:18px;border-radius:10px}',
  '.cb-mtitle{font-size:15px;line-height:1.25}',
  '.cb-mclose{width:30px;height:30px}',
  '.cb-mbody{padding:2px 14px 6px}',
  '.cb-status{margin:2px 0;padding:3px 9px;font-size:11px}',
  '.cb-facts{gap:3px 10px;margin:8px 0 10px;font-size:12px}',
  '.cb-label{margin:9px 0 5px;font-size:10.5px}',
  '.cb-quote{padding:9px 11px;font-size:13px;line-height:1.5}',
  '.cb-wait{margin-top:10px;padding:9px 11px;font-size:12px}',
  '.cb-text{min-height:84px;padding:9px 10px;font-size:16px}',   // 16px keeps iPhones from zooming in on the field
  '.cb-hint{font-size:10.5px}',
  '.cb-mfoot{gap:8px;padding:10px 14px calc(12px + env(safe-area-inset-bottom))}',
  '.cb-mfoot .cb-mbtn{flex:1;justify-content:center;padding:10px 12px;font-size:13.5px}',
  '}',
  '@media (prefers-reduced-motion:reduce){.cb-overlay{animation:none}}',
].join('');
export const useConcernStyles = () => useStyle('concern-shared', CSS);

export const initials = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
};
export function ago(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hr${h > 1 ? 's' : ''} ago`; }
  if (s < 86400 * 7) { const d = Math.floor(s / 86400); return `${d} day${d > 1 ? 's' : ''} ago`; }
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
export const fullDate = iso => new Date(iso).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const roleLabel = role => (role === 'Head' ? 'Super Administrator' : role || 'Administrator');

export function ConcernDetailModal({ item, role, onClose, onRespond }) {
  useConcernStyles();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setText(''); setBusy(false); setError(''); }, [item?.concernID]);
  const isOpen = !!item;
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.classList.add('cb-modal-open');
    return () => document.body.classList.remove('cb-modal-open');
  }, [isOpen]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  if (!item) return null;

  const answered = item.status === 'Responded';
  const staff = role === 'staff';
  const trimmed = text.trim();
  const canSend = trimmed.length >= RESPONSE_MIN && trimmed.length <= RESPONSE_MAX && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true); setError('');
    try { await onRespond(item.concernID, trimmed); }
    catch (e) { setError(e.message || 'Could not send the response. Please try again.'); setBusy(false); }
  }

  // Rendered on <body>: inside the fixed header the window was trapped below the menu and could not cover it.
  return createPortal(
    <div className="cb-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`cb-modal${answered ? ' answered' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cbDetailTitle">
        <div className="cb-mhead">
          <div className="cb-mhead-icon"><i className={`ti ${answered ? 'ti-circle-check' : 'ti-flag-filled'}`}></i></div>
          <div className="cb-mtitle" id="cbDetailTitle">Concern about {item.menteeName}</div>
          <button type="button" className="cb-mclose" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>
        <div className="cb-mbody">
          {answered
            ? <span className="cb-status done"><i className="ti ti-circle-check"></i> Responded</span>
            : <span className="cb-status open"><i className="ti ti-clock-exclamation"></i> Awaiting response</span>}
          <dl className="cb-facts">
            <dt>Category</dt><dd>{item.category}</dd>
            <dt>Mentee</dt><dd>{item.menteeName}{item.course ? ` · ${item.course}` : ''}</dd>
            {staff ? <><dt>Reported by</dt><dd>{item.mentorName} (Mentor)</dd></> : null}
            <dt>Sent</dt><dd>{fullDate(item.createdAt)}</dd>
          </dl>
          <div className="cb-label">{staff ? `${item.mentorName}'s concern` : 'Your concern'}</div>
          <div className="cb-quote">{item.message}</div>

          {answered ? (
            <>
              <div className="cb-label">Response</div>
              <div className="cb-quote reply">{item.responseMessage}</div>
              <div className="cb-replymeta">{item.responderName} ({roleLabel(item.responderRole)}) · {item.respondedAt ? fullDate(item.respondedAt) : ''}</div>
            </>
          ) : staff ? (
            <>
              <div className="cb-label">Your response to {item.mentorName}</div>
              <textarea className="cb-text" maxLength={RESPONSE_MAX} disabled={busy} autoFocus
                placeholder="Tell the mentor what will be done, or what they should do next."
                value={text} onChange={e => setText(e.target.value)}></textarea>
              <div className="cb-hint"><span>The mentor is notified and sees this. Responding closes the concern for every Administrator and Super Administrator.</span><span>{text.length}/{RESPONSE_MAX}</span></div>
              {error ? <div className="cb-err" role="alert">{error}</div> : null}
            </>
          ) : (
            <div className="cb-wait"><i className="ti ti-hourglass"></i><span>Waiting for the Administrator or Super Administrator to respond. You will get a notification here when they do.</span></div>
          )}
        </div>
        <div className="cb-mfoot">
          {staff && !answered ? (
            <>
              <button type="button" className="cb-mbtn ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="cb-mbtn" onClick={send} disabled={!canSend}><i className="ti ti-send"></i> {busy ? 'Sending…' : 'Send response'}</button>
            </>
          ) : <button type="button" className="cb-mbtn" onClick={onClose}>{staff ? 'Close' : 'Got it'}</button>}
        </div>
      </div>
    </div>,
    document.body
  );
}
