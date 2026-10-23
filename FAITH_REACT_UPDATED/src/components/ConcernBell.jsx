import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { useStyle } from '../lib/injectStyle.js';

// Top-right bell for the Admin and Head Admin portals: concerns that mentors flagged about their mentees
// (pages/mentor/MyMentees.jsx → POST MenteeConcerns). The list and unread count come from
// GET MenteeConcerns/notifications; opening a concern marks it read for this user only.

const POLL_MS = 60000;

const CSS = [
  // The page's own top band stays clear of the bell on desktop (on phones the hamburger band already does it).
  '@media (min-width:769px){body.has-concern-bell .main-wrapper{padding-top:52px}}',
  '.concern-bell{position:fixed;top:10px;right:18px;z-index:1200;font-family:"DM Sans",system-ui,sans-serif}',
  '@media (max-width:768px){.concern-bell{top:9px;right:10px}}',
  '.cb-btn{position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#1e3a8a;background:#fff;border:1px solid #dbe4f3;border-radius:50%;cursor:pointer;box-shadow:0 2px 8px rgba(30,58,138,.12);transition:background-color .18s,transform .15s,box-shadow .18s}',
  '.cb-btn:hover{background:#eff6ff;box-shadow:0 4px 14px rgba(30,58,138,.2)}',
  '.cb-btn:active{transform:scale(.94)}',
  '.cb-btn:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}',
  '.cb-btn.ring i{animation:cbRing 1.2s ease 1}',
  '@keyframes cbRing{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-6deg)}}',
  '.cb-badge{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;padding:0 5px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:#dc2626;border:2px solid #fff;border-radius:10px}',
  '.cb-panel{position:absolute;top:50px;right:0;width:380px;max-width:calc(100vw - 20px);max-height:min(560px,calc(100dvh - 76px));display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 18px 50px rgba(15,23,42,.22);overflow:hidden;transform-origin:top right;animation:cbPop .18s cubic-bezier(.22,1,.36,1) both}',
  '@keyframes cbPop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}',
  '.cb-panel::before{content:"";position:absolute;top:-7px;right:15px;width:13px;height:13px;background:#fff;border-left:1px solid #e5e7eb;border-top:1px solid #e5e7eb;transform:rotate(45deg)}',
  '.cb-head{position:relative;display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid #f1f5f9}',
  '.cb-head-icon{color:#2563eb;font-size:19px}',
  '.cb-title{flex:1;font-size:15px;font-weight:700;color:#111827}',
  '.cb-markall{font:inherit;font-size:12px;font-weight:600;color:#2563eb;background:none;border:none;padding:4px 6px;border-radius:6px;cursor:pointer}',
  '.cb-markall:hover{background:#eff6ff}.cb-markall:disabled{color:#9ca3af;cursor:default;background:none}',
  '.cb-list{overflow-y:auto;overscroll-behavior:contain}',
  '.cb-item{display:flex;gap:12px;width:100%;box-sizing:border-box;padding:13px 16px;text-align:left;font:inherit;background:#fff;border:none;border-bottom:1px solid #f1f5f9;border-left:4px solid transparent;cursor:pointer;transition:background-color .15s}',
  '.cb-item:hover{background:#f8fafc}',
  '.cb-item.unread{border-left-color:#2563eb;box-shadow:inset 0 0 0 100vmax rgba(37,99,235,.035)}',
  '.cb-avatar{flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;background:#dc2626;border-radius:50%}',
  '.cb-item:not(.unread) .cb-avatar{background:#9ca3af}',
  '.cb-main{flex:1;min-width:0}',
  '.cb-row{display:flex;align-items:baseline;gap:8px}',
  '.cb-name{flex:1;min-width:0;font-size:13.5px;font-weight:700;color:#2563eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.cb-item:not(.unread) .cb-name{color:#6b7280;font-weight:600}',
  '.cb-time{flex-shrink:0;font-size:11px;color:#9ca3af}',
  '.cb-meta{margin-top:1px;font-size:11.5px;color:#6b7280}',
  '.cb-cat{display:inline-block;margin-right:5px;padding:1px 7px;font-size:10.5px;font-weight:700;color:#b91c1c;background:#fee2e2;border-radius:6px}',
  '.cb-item:not(.unread) .cb-cat{color:#6b7280;background:#f1f5f9}',
  '.cb-msg{margin-top:4px;font-size:12.5px;line-height:1.45;color:#374151;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.cb-item:not(.unread) .cb-msg{color:#9ca3af}',
  '.cb-empty{padding:34px 20px;text-align:center;font-size:13px;color:#9ca3af}',
  '.cb-empty i{display:block;margin-bottom:8px;font-size:34px;opacity:.5}',
  '.cb-foot{padding:9px 16px;text-align:center;font-size:11.5px;color:#9ca3af;border-top:1px solid #f1f5f9}',
  // detail window
  '.cb-overlay{position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.6);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:cbPop .18s ease both}',
  '.cb-modal{width:100%;max-width:520px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;background:#fff;border-radius:18px;border-top:6px solid #dc2626;box-shadow:0 28px 70px rgba(127,29,29,.35);overflow:hidden}',
  '.cb-mhead{display:flex;align-items:center;gap:12px;padding:18px 20px 12px;background:linear-gradient(180deg,#fef2f2,#fff)}',
  '.cb-mhead-icon{width:42px;height:42px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;background:#dc2626;border-radius:13px}',
  '.cb-mtitle{flex:1;min-width:0;font-size:17px;font-weight:700;color:#7f1d1d}',
  '.cb-mclose{width:32px;height:32px;border:none;background:none;font-size:24px;line-height:1;color:#6b7280;border-radius:8px;cursor:pointer}',
  '.cb-mclose:hover{background:#fee2e2;color:#991b1b}',
  '.cb-mbody{padding:6px 20px 8px;overflow-y:auto}',
  '.cb-facts{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:6px 0 14px;font-size:13px}',
  '.cb-facts dt{color:#6b7280}.cb-facts dd{margin:0;color:#111827;font-weight:600}',
  '.cb-quote{white-space:pre-wrap;word-break:break-word;padding:13px 15px;font-size:14px;line-height:1.55;color:#1f2937;background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:10px}',
  '.cb-mfoot{display:flex;justify-content:flex-end;padding:14px 20px 18px}',
  '.cb-mbtn{font:inherit;font-size:14px;font-weight:600;padding:10px 20px;color:#fff;background:#2563eb;border:none;border-radius:10px;cursor:pointer}',
  '.cb-mbtn:hover{background:#1d4ed8}',
  '@media (prefers-reduced-motion:reduce){.cb-panel,.cb-overlay,.cb-btn.ring i{animation:none}}',
].join('');

const initials = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
};
function ago(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr${Math.floor(s / 3600) > 1 ? 's' : ''} ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
const fullDate = iso => new Date(iso).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ConcernBell() {
  useStyle('concern-bell', CSS);
  const [feed, setFeed] = useState({ unreadCount: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [ring, setRing] = useState(false);
  const rootRef = useRef(null);
  const lastUnread = useRef(0);

  useEffect(() => {
    document.body.classList.add('has-concern-bell');
    return () => document.body.classList.remove('has-concern-bell');
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest('MenteeConcerns/notifications', 'GET', null, true);
      if (!data) return;
      setFeed({ unreadCount: data.unreadCount || 0, items: data.items || [] });
      // Shake the bell when something new arrives while the page is open.
      if ((data.unreadCount || 0) > lastUnread.current && lastUnread.current !== null) { setRing(true); setTimeout(() => setRing(false), 1400); }
      lastUnread.current = data.unreadCount || 0;
    } catch (e) { /* the bell just stays as it was */ }
  }, []);

  useEffect(() => {
    lastUnread.current = null;   // the first load is not "new"
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

  function markReadLocal(id) {
    setFeed(f => {
      const hit = f.items.find(i => i.concernID === id);
      if (!hit || hit.isRead) return f;
      return { unreadCount: Math.max(0, f.unreadCount - 1), items: f.items.map(i => i.concernID === id ? { ...i, isRead: true } : i) };
    });
  }
  async function openConcern(item) {
    setOpen(false);
    setDetail(item);
    if (!item.isRead) {
      markReadLocal(item.concernID);
      try { await apiRequest(`MenteeConcerns/${item.concernID}/read`, 'PATCH', null, true); } catch (e) { load(); }
    }
  }
  async function markAll() {
    setFeed(f => ({ unreadCount: 0, items: f.items.map(i => ({ ...i, isRead: true })) }));
    try { await apiRequest('MenteeConcerns/read-all', 'PATCH', null, true); } catch (e) { load(); }
  }

  const { unreadCount, items } = feed;
  return (
    <>
      <div className="concern-bell" ref={rootRef}>
        <button type="button" className={`cb-btn${ring ? ' ring' : ''}`} aria-haspopup="true" aria-expanded={open}
          aria-label={unreadCount ? `Concerns, ${unreadCount} unread` : 'Concerns'} title="Mentor concerns"
          onClick={() => { setOpen(o => !o); if (!open) load(); }}>
          <i className="ti ti-bell"></i>
          {unreadCount > 0 ? <span className="cb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
        </button>
        {open ? (
          <div className="cb-panel" role="dialog" aria-label="Mentor concerns">
            <div className="cb-head">
              <i className="ti ti-bell cb-head-icon"></i>
              <div className="cb-title">Concerns from mentors</div>
              <button type="button" className="cb-markall" onClick={markAll} disabled={unreadCount === 0}>Mark all read</button>
            </div>
            <div className="cb-list">
              {items.length === 0 ? (
                <div className="cb-empty"><i className="ti ti-bell-off"></i>No concerns have been reported.</div>
              ) : items.map(item => (
                <button type="button" key={item.concernID} className={`cb-item${item.isRead ? '' : ' unread'}`} onClick={() => openConcern(item)}>
                  <span className="cb-avatar" aria-hidden="true">{initials(item.menteeName)}</span>
                  <span className="cb-main">
                    <span className="cb-row"><span className="cb-name">{item.menteeName}</span><span className="cb-time">{ago(item.createdAt)}</span></span>
                    <span className="cb-meta" style={{ display: 'block' }}><span className="cb-cat">{item.category}</span>flagged by {item.mentorName}</span>
                    <span className="cb-msg" style={{ display: '-webkit-box' }}>{item.message}</span>
                  </span>
                </button>
              ))}
            </div>
            {items.length > 0 ? <div className="cb-foot">Showing the latest {items.length} concern{items.length !== 1 ? 's' : ''}</div> : null}
          </div>
        ) : null}
      </div>

      {detail ? (
        <div className="cb-overlay" onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="cb-modal" role="dialog" aria-modal="true" aria-labelledby="cbDetailTitle">
            <div className="cb-mhead">
              <div className="cb-mhead-icon"><i className="ti ti-flag-filled"></i></div>
              <div className="cb-mtitle" id="cbDetailTitle">Concern about {detail.menteeName}</div>
              <button type="button" className="cb-mclose" onClick={() => setDetail(null)} aria-label="Close">&times;</button>
            </div>
            <div className="cb-mbody">
              <dl className="cb-facts">
                <dt>Category</dt><dd>{detail.category}</dd>
                <dt>Mentee</dt><dd>{detail.menteeName}{detail.course ? ` · ${detail.course}` : ''}</dd>
                <dt>Reported by</dt><dd>{detail.mentorName} (Mentor)</dd>
                <dt>Sent</dt><dd>{fullDate(detail.createdAt)}</dd>
              </dl>
              <div className="cb-quote">{detail.message}</div>
            </div>
            <div className="cb-mfoot"><button type="button" className="cb-mbtn" onClick={() => setDetail(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
