import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api.js';
import { showToast } from './Notify.jsx';
import { useStyle } from '../lib/injectStyle.js';
import { CSS } from './ConcernBell.jsx';
import { ago } from './concernShared.jsx';

// Mentee-portal bell: what the mentor does: session scheduled / cancelled / changed, new availability, announcements.
// Same look as the Concern bell in the other portals; the red count is the unread notifications.

const POLL_MS = 60000;
const REPLY_MAX = 400;

// type -> [title, icon, red?, page to open]
const KINDS = {
  SessionCancelled: ['Session cancelled', 'ti-calendar-x', true, '/mentee/sessions'],
  SessionUpdated: ['Session updated', 'ti-calendar-event', false, '/mentee/sessions'],
  SessionScheduled: ['New session', 'ti-calendar-plus', false, '/mentee/sessions'],
  Availability: ['New available slot', 'ti-clock-plus', false, '/mentee/schedule'],
  Announcement: ['New announcement', 'ti-speakerphone', false, '/mentee/announcements'],
  HeadConcern: ['Concern from the Head Admin', 'ti-flag', true, null],
  MenteeConcern: ['Concern from a mentee', 'ti-flag', true, null],
  DirectMessage: ['Message from your mentor', 'ti-message-circle', false, null],
  DirectMessageReplied: ['Message from your mentor', 'ti-message-circle', false, null],
  MenteeReply: ['Reply from a mentee', 'ti-message-circle-2', false, null],
};

export default function NotificationBell() {
  useStyle('concern-bell', CSS);
  const [feed, setFeed] = useState({ count: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const navigate = useNavigate();
  const [replyId, setReplyId] = useState(null);   // the direct message being answered
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const rootRef = useRef(null);
  const lastCount = useRef(null);

  useEffect(() => {
    document.body.classList.add('has-concern-bell');
    return () => document.body.classList.remove('has-concern-bell');
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest('MenteeNotifications/mine', 'GET', null, true);
      if (!data) return;
      setFeed({ count: data.count || 0, items: data.items || [] });
      if (lastCount.current !== null && (data.count || 0) > lastCount.current) { setRing(true); setTimeout(() => setRing(false), 1400); }
      lastCount.current = data.count || 0;
    } catch (e) { /* the bell just stays as it was */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function markRead(item) {
    if (item.isRead) return;
    setFeed(f => ({ count: Math.max(0, f.count - 1), items: f.items.map(i => i.notificationID === item.notificationID ? { ...i, isRead: true } : i) }));
    lastCount.current = Math.max(0, (lastCount.current ?? 1) - 1);
    try { await apiRequest(`MenteeNotifications/${item.notificationID}/read`, 'PATCH', null, true); } catch (e) { load(); }
  }

  async function remove(item) {
    setFeed(f => ({ count: item.isRead ? f.count : Math.max(0, f.count - 1), items: f.items.filter(i => i.notificationID !== item.notificationID) }));
    if (!item.isRead) lastCount.current = Math.max(0, (lastCount.current ?? 1) - 1);
    try { await apiRequest(`MenteeNotifications/${item.notificationID}`, 'DELETE', null, true); } catch (e) { load(); }
  }

  async function removeAll() {
    setFeed({ count: 0, items: [] });
    lastCount.current = 0;
    try { await apiRequest('MenteeNotifications', 'DELETE', null, true); } catch (e) { load(); }
  }

  async function sendReply(item) {
    const text = replyText.trim();
    if (!text || replyBusy) return;
    setReplyBusy(true);
    try {
      await apiRequest(`MenteeNotifications/${item.notificationID}/reply`, 'POST', { message: text }, true);
      setFeed(f => ({ ...f, items: f.items.map(i => i.notificationID === item.notificationID ? { ...i, type: 'DirectMessageReplied', isRead: true } : i) }));
      setReplyId(null); setReplyText('');
      showToast('Your reply was sent.', 'success');
    } catch (e) {
      showToast(e.message || 'Could not send your reply.');
      if (e.status === 409) load();
    } finally { setReplyBusy(false); }
  }

  function openItem(item) {
    markRead(item);
    const k = KINDS[item.type];
    if (k && k[3]) { setOpen(false); navigate(k[3]); }
  }

  async function markAll() {
    setFeed(f => ({ count: 0, items: f.items.map(i => ({ ...i, isRead: true })) }));
    lastCount.current = 0;
    try { await apiRequest('MenteeNotifications/read-all', 'PATCH', null, true); } catch (e) { load(); }
  }

  const { count, items } = feed;
  const title = 'Notifications';
  const countLabel = `${count} new`;

  return (
    <div className="concern-bell mentor" ref={rootRef}>
      <button type="button" className={`cb-btn${ring ? ' ring' : ''}`} aria-haspopup="true" aria-expanded={open}
        aria-label={count ? `${title}, ${countLabel}` : title} title={title}
        onClick={() => { setOpen(o => !o); if (!open) load(); }}>
        <i className="ti ti-bell"></i>
        {count > 0 ? <span className="cb-badge">{count > 99 ? '99+' : count}</span> : null}
      </button>
      {open ? (
        <div className="cb-panel" role="dialog" aria-label={title}>
          <div className="cb-head">
            <i className="ti ti-bell cb-head-icon"></i>
            <div className="cb-title">{title}</div>
            {count > 0 ? <button type="button" className="cb-pill-count" style={{ border: 'none', cursor: 'pointer' }} onClick={markAll}>Mark all read</button> : null}
            {items.length > 0 ? <button type="button" className="cb-pill-count" style={{ border: 'none', cursor: 'pointer', color: '#6b7280', background: '#f1f5f9' }} onClick={removeAll}>Clear all</button> : null}
          </div>
          <div className="cb-list">
            {items.length === 0 ? (
              <div className="cb-empty"><i className="ti ti-bell-off"></i>No notifications yet.</div>
            ) : items.map(item => {
              const [label, icon, red] = KINDS[item.type] || ['Notification', 'ti-bell', false];
              return (
                <div key={item.notificationID} style={{ position: 'relative' }}>
                <button type="button" className={`cb-item ${item.isRead ? '' : 'fresh'}`} onClick={() => openItem(item)}>
                  <span className="cb-avatar" aria-hidden="true" style={red ? { background: '#dc2626' } : undefined}>
                    <i className={`ti ${icon}`}></i>
                  </span>
                  <span className="cb-main">
                    <span className="cb-row">
                      <span className="cb-name">{label}</span>
                      <span className="cb-time">{ago(item.createdAt)}</span>
                    </span>
                    <span className="cb-msg" style={{ WebkitLineClamp: 4, paddingRight: 26 }}>{item.message}</span>
                  </span>
                </button>
                <button type="button" aria-label="Delete notification" title="Delete" onClick={() => remove(item)}
                  style={{ position: 'absolute', right: 10, bottom: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#9ca3af', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.background = '#fee2e2'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; }}>
                  <i className="ti ti-trash"></i>
                </button>
                {item.type === 'DirectMessageReplied' ? (
                  <div style={{ padding: '0 44px 10px 62px', fontSize: 12, fontWeight: 600, color: '#15803d' }}><i className="ti ti-check"></i> You replied</div>
                ) : item.type === 'DirectMessage' ? (
                  replyId === item.notificationID ? (
                    <div style={{ padding: '0 44px 12px 62px' }}>
                      <textarea rows={3} maxLength={REPLY_MAX} autoFocus disabled={replyBusy} placeholder="Write your reply (you can reply once)..."
                        value={replyText} onChange={e => setReplyText(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 13, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 10, resize: 'vertical' }} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                        <button type="button" disabled={replyBusy} onClick={() => { setReplyId(null); setReplyText(''); }}
                          style={{ font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#374151', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                        <button type="button" disabled={replyBusy || !replyText.trim()} onClick={() => sendReply(item)}
                          style={{ font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'var(--sb-active,#0f766e)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', opacity: replyBusy || !replyText.trim() ? 0.5 : 1 }}>{replyBusy ? 'Sending...' : 'Send reply'}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '0 44px 10px 62px' }}>
                      <button type="button" onClick={() => { setReplyId(item.notificationID); setReplyText(''); markRead(item); }}
                        style={{ font: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--sb-active,#0f766e)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}><i className="ti ti-arrow-back-up"></i> Reply</button>
                    </div>
                  )
                ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
