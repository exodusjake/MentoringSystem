import { useEffect, useState } from 'react';
import { showToast } from './Notify.jsx';
import Overlay from './Overlay.jsx';
import Select from './Select.jsx';
import { apiRequest } from '../lib/api.js';
import { useStyle } from '../lib/injectStyle.js';

// Mentee portal: "Raise a concern" goes straight to the Admin and Head Admin (their bell and email).

const CATEGORIES = ['About my mentor', 'Session problem', 'Attendance record', 'Personal or welfare', 'Safety', 'Other'];
const MIN = 10, MAX = 500;

export const CSS = [
  '.rc-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:700;color:#b91c1c;background:#fff;border:1px solid #fca5a5;border-radius:10px;padding:8px 13px;cursor:pointer;white-space:nowrap}',
  '.rc-btn:hover{color:#fff;background:#dc2626;border-color:#dc2626}',
  '.rc-overlay{position:fixed;inset:0;z-index:2500;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.5);font-family:"DM Sans",system-ui,sans-serif}',
  '.rc-modal{width:min(460px,100%);max-height:calc(100dvh - 28px);display:flex;flex-direction:column;overflow:hidden;color:var(--ink,#1f2937);background:var(--sb-bg,#fff);border-radius:16px;box-shadow:0 20px 60px rgba(15,23,42,.35)}',
  '.rc-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--sb-border,#e5e7eb)}',
  '.rc-head-icon{flex-shrink:0;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:19px;color:#b91c1c;background:#fee2e2;border-radius:10px}',
  '.rc-title{font-size:16px;font-weight:700}.rc-sub{margin-top:1px;font-size:12.5px;color:var(--muted,#6b7280)}',
  '.rc-head-text{flex:1;min-width:0}',
  '.rc-close{font-size:24px;line-height:1;color:var(--muted,#6b7280);background:none;border:none;cursor:pointer}',
  '.rc-body{padding:16px 18px;overflow-y:auto}',
  '.rc-label{display:block;margin:0 0 6px;font-size:13px;font-weight:700}',
  '.rc-body select,.rc-text{width:100%;box-sizing:border-box;font:inherit;font-size:14px;color:inherit;background:var(--sb-bg,#fff);border:1px solid var(--sb-border,#d1d5db);border-radius:10px;padding:10px 12px}',
  '.rc-text{display:block;margin-bottom:6px;resize:vertical;min-height:110px}',
  '.rc-gap{margin-bottom:14px}',
  '.rc-count{font-size:12px;color:var(--muted,#6b7280)}.rc-count.short{color:#b45309}',
  '.rc-error{margin-top:10px;padding:9px 12px;font-size:13px;color:#b91c1c;background:#fee2e2;border-radius:10px}',
  '.rc-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--sb-border,#e5e7eb)}',
  '.rc-cancel,.rc-send{font:inherit;font-size:13.5px;font-weight:700;border-radius:10px;padding:9px 16px;cursor:pointer}',
  '.rc-cancel{color:var(--ink,#1f2937);background:transparent;border:1px solid var(--sb-border,#d1d5db)}',
  '.rc-send{color:#fff;background:#dc2626;border:none}.rc-send:disabled,.rc-cancel:disabled{opacity:.5;cursor:not-allowed}',
].join('');

export function RaiseConcernButton({ onClick }) {
  useStyle('raise-concern', CSS);
  return (
    <button type="button" className="rc-btn" onClick={onClick} title="Send a concern to the Admin and Head Admin">
      <i className="ti ti-flag"></i> Raise a concern
    </button>
  );
}

export default function RaiseConcernModal({ open, onClose }) {
  useStyle('raise-concern', CSS);
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setCategory(''); setMessage(''); setBusy(false); setError(''); } }, [open]);

  const trimmed = message.trim();
  const valid = !!category && trimmed.length >= MIN && trimmed.length <= MAX;

  async function send() {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      await apiRequest('MenteeReports', 'POST', { category, message: trimmed }, true);
      showToast('Your concern was sent to the Admin and Head Admin.', 'success');
      onClose();
    } catch (e) {
      setError(e.message || 'Could not send your concern. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Overlay open={open} className="rc-overlay" activeClass={null} display="flex" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rcTitle">
        <div className="rc-head">
          <div className="rc-head-icon"><i className="ti ti-flag"></i></div>
          <div className="rc-head-text">
            <div className="rc-title" id="rcTitle">Raise a concern</div>
            <div className="rc-sub">Goes straight to the Admin and Head Admin</div>
          </div>
          <button type="button" className="rc-close" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>
        <div className="rc-body">
          <label className="rc-label" htmlFor="rcCategory">What is this about?</label>
          <div className="rc-gap">
            <Select id="rcCategory" value={category} onChange={e => setCategory(e.target.value)} disabled={busy}>
              <option value="" disabled>Choose...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <label className="rc-label" htmlFor="rcMessage">Tell us what happened</label>
          <textarea id="rcMessage" className="rc-text" maxLength={MAX} disabled={busy} placeholder="Describe your concern..."
            value={message} onChange={e => setMessage(e.target.value)} />
          <div className={`rc-count${trimmed.length > 0 && trimmed.length < MIN ? ' short' : ''}`}>
            {trimmed.length < MIN ? `At least ${MIN} characters · ` : ''}{message.length}/{MAX}
          </div>
          {error ? <div className="rc-error" role="alert">{error}</div> : null}
        </div>
        <div className="rc-foot">
          <button type="button" className="rc-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="rc-send" onClick={send} disabled={!valid || busy}>{busy ? 'Sending...' : 'Send concern'}</button>
        </div>
      </div>
    </Overlay>
  );
}
