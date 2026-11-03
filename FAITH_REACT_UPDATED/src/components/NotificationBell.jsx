import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api.js';
import { useStyle } from '../lib/injectStyle.js';
import { CSS } from './ConcernBell.jsx';
import { ago } from './concernShared.jsx';

// Mentee-portal bell: what the mentor does: session scheduled / cancelled / changed, new availability, announcements.
// Same look as the Concern bell in the other portals; the red count is the unread notifications.

const POLL_MS = 60000;

// type -> [title, icon, red?, page to open]
const KINDS = {
  SessionCancelled: ['Session cancelled', 'ti-calendar-x', true, '/mentee/sessions'],
  SessionUpdated: ['Session updated', 'ti-calendar-event', false, '/mentee/sessions'],
  SessionScheduled: ['New session', 'ti-calendar-plus', false, '/mentee/sessions'],
  Availability: ['New available slot', 'ti-clock-plus', false, '/mentee/schedule'],
  Announcement: ['New announcement', 'ti-speakerphone', false, '/mentee/announcements'],
};

export default function NotificationBell() {
  useStyle('concern-bell', CSS);
  const [feed, setFeed] = useState({ count: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const navigate = useNavigate();
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

  function openItem(item) {
    markRead(item);
    const k = KINDS[item.type];
    if (k) { setOpen(false); navigate(k[3]); }
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
          </div>
          <div className="cb-list">
            {items.length === 0 ? (
              <div className="cb-empty"><i className="ti ti-bell-off"></i>No notifications yet.</div>
            ) : items.map(item => {
              const [label, icon, red] = KINDS[item.type] || ['Notification', 'ti-bell', false];
              return (
                <button type="button" key={item.notificationID} className={`cb-item ${item.isRead ? '' : 'fresh'}`} onClick={() => openItem(item)}>
                  <span className="cb-avatar" aria-hidden="true" style={red ? { background: '#dc2626' } : undefined}>
                    <i className={`ti ${icon}`}></i>
                  </span>
                  <span className="cb-main">
                    <span className="cb-row">
                      <span className="cb-name">{label}</span>
                      <span className="cb-time">{ago(item.createdAt)}</span>
                    </span>
                    <span className="cb-msg" style={{ WebkitLineClamp: 4 }}>{item.message}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
