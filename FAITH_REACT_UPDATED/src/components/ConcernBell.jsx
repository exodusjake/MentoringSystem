import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { emit, on } from '../lib/events.js';
import { useStyle } from '../lib/injectStyle.js';
import { ConcernDetailModal, ago, initials, roleLabel } from './concernShared.jsx';

// Top-right bell for concerns that mentors flag about their mentees (pages/mentor/MyMentees.jsx).
//   role "staff"  (Admin and Head Admin portals): every concern, awaiting-response ones first. The red count stays
//                 until someone responds (viewing a concern does not clear it); responding is done in the detail window.
//   role "mentor" (Mentor portal): the mentor's own concerns. The count is the responses they have not opened yet.
// Other components that change a concern announce it with emit('concerns:changed') so the bell reloads.

const POLL_MS = 60000;

const CSS = [
  // The page's own top band stays clear of the bell on desktop (on phones the hamburger band already does it).
  '@media (min-width:769px){body.has-concern-bell .main-wrapper{padding-top:52px}}',
  '.concern-bell{position:fixed;top:10px;right:18px;z-index:1200;font-family:"DM Sans",system-ui,sans-serif}',
  '@media (max-width:768px){.concern-bell{top:9px;right:10px}}',
  '.cb-btn{position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#1e3a8a;background:#fff;border:1px solid #dbe4f3;border-radius:50%;cursor:pointer;box-shadow:0 2px 8px rgba(30,58,138,.12);transition:background-color .18s,transform .15s,box-shadow .18s}',
  '.concern-bell.mentor .cb-btn{color:#0f766e;border-color:#cfe9e5;box-shadow:0 2px 8px rgba(15,118,110,.14)}',
  '.cb-btn:hover{background:#eff6ff;box-shadow:0 4px 14px rgba(30,58,138,.2)}.concern-bell.mentor .cb-btn:hover{background:#f0fdfa}',
  '.cb-btn:active{transform:scale(.94)}',
  '.cb-btn:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}',
  '.cb-btn.ring i{animation:cbRing 1.2s ease 1}',
  '@keyframes cbRing{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(8deg)}60%{transform:rotate(-6deg)}}',
  '.cb-badge{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;padding:0 5px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:#dc2626;border:2px solid #fff;border-radius:10px}',
  '.concern-bell.mentor .cb-badge{background:#16a34a}',
  '.cb-panel{position:absolute;top:50px;right:0;width:390px;max-width:calc(100vw - 20px);max-height:min(580px,calc(100dvh - 76px));display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 18px 50px rgba(15,23,42,.22);overflow:hidden;transform-origin:top right;animation:cbPop .18s cubic-bezier(.22,1,.36,1) both}',
  '.cb-panel::before{content:"";position:absolute;top:-7px;right:15px;width:13px;height:13px;background:#fff;border-left:1px solid #e5e7eb;border-top:1px solid #e5e7eb;transform:rotate(45deg)}',
  '.cb-head{position:relative;display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff;border-bottom:1px solid #f1f5f9}',
  '.cb-head-icon{color:#2563eb;font-size:19px}.concern-bell.mentor .cb-head-icon{color:#0f766e}',
  '.cb-title{flex:1;font-size:15px;font-weight:700;color:#111827}',
  '.cb-pill-count{padding:2px 9px;font-size:11px;font-weight:700;color:#b91c1c;background:#fee2e2;border-radius:999px}',
  '.concern-bell.mentor .cb-pill-count{color:#15803d;background:#dcfce7}',
  '.cb-list{overflow-y:auto;overscroll-behavior:contain}',
  '.cb-item{display:flex;gap:12px;width:100%;box-sizing:border-box;padding:13px 16px;text-align:left;font:inherit;background:#fff;border:none;border-bottom:1px solid #f1f5f9;border-left:4px solid transparent;cursor:pointer;transition:background-color .15s}',
  '.cb-item:hover{background:#f8fafc}',
  '.cb-item.open{border-left-color:#dc2626;background:#fffafa}.cb-item.open:hover{background:#fef2f2}',
  '.cb-item.wait{border-left-color:#f59e0b}',
  '.cb-item.fresh{border-left-color:#16a34a;background:#f7fef9}.cb-item.fresh:hover{background:#ecfdf3}',
  '.cb-avatar{flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;background:#9ca3af;border-radius:50%}',
  '.cb-item.open .cb-avatar{background:#dc2626}.cb-item.wait .cb-avatar{background:#f59e0b}.cb-item.fresh .cb-avatar{background:#16a34a}',
  '.cb-main{flex:1;min-width:0}',
  '.cb-row{display:flex;align-items:baseline;gap:8px}',
  '.cb-name{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.cb-item.open .cb-name{color:#b91c1c;font-weight:700}.cb-item.fresh .cb-name{color:#15803d;font-weight:700}.cb-item.wait .cb-name{color:#92400e;font-weight:700}',
  '.cb-time{flex-shrink:0;font-size:11px;color:#9ca3af}',
  '.cb-meta{display:block;margin-top:2px;font-size:11.5px;color:#6b7280}',
  '.cb-pill{display:inline-block;margin-right:5px;padding:1px 7px;font-size:10.5px;font-weight:700;border-radius:6px;color:#6b7280;background:#f1f5f9}',
  '.cb-pill.open{color:#b91c1c;background:#fee2e2}.cb-pill.wait{color:#92400e;background:#fef3c7}.cb-pill.done{color:#15803d;background:#dcfce7}',
  '.cb-msg{display:-webkit-box;margin-top:4px;font-size:12.5px;line-height:1.45;color:#374151;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.cb-item:not(.open):not(.wait):not(.fresh) .cb-msg{color:#9ca3af}',
  '.cb-reply{display:-webkit-box;margin-top:5px;padding:6px 9px;font-size:12px;line-height:1.4;color:#166534;background:#f0fdf4;border-left:3px solid #22c55e;border-radius:6px;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.cb-item:not(.fresh):not(.open) .cb-reply{color:#6b7280;background:#f8fafc;border-left-color:#cbd5e1}',
  '.cb-empty{padding:34px 20px;text-align:center;font-size:13px;color:#9ca3af}',
  '.cb-empty i{display:block;margin-bottom:8px;font-size:34px;opacity:.5}',
  '.cb-foot{padding:9px 16px;text-align:center;font-size:11.5px;color:#9ca3af;border-top:1px solid #f1f5f9}',
  '@media (prefers-reduced-motion:reduce){.cb-panel,.cb-btn.ring i{animation:none}}',
].join('');

export default function ConcernBell({ role = 'staff' }) {
  useStyle('concern-bell', CSS);
  const staff = role === 'staff';
  const [feed, setFeed] = useState({ count: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [ring, setRing] = useState(false);
  const rootRef = useRef(null);
  const lastCount = useRef(null);

  useEffect(() => {
    document.body.classList.add('has-concern-bell');
    return () => document.body.classList.remove('has-concern-bell');
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest(staff ? 'MenteeConcerns/notifications' : 'MenteeConcerns/mine', 'GET', null, true);
      if (!data) return;
      setFeed({ count: data.count || 0, items: data.items || [] });
      // Shake the bell when something new arrives while the page is open.
      if (lastCount.current !== null && (data.count || 0) > lastCount.current) { setRing(true); setTimeout(() => setRing(false), 1400); }
      lastCount.current = data.count || 0;
    } catch (e) { /* the bell just stays as it was */ }
  }, [staff]);

  useEffect(() => {
    lastCount.current = null;   // the first load is not "new"
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    const off = on('concerns:changed', load);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); off(); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const patchItem = (updated) => setFeed(f => ({ ...f, items: f.items.map(i => i.concernID === updated.concernID ? updated : i) }));

  async function openConcern(item) {
    setOpen(false);
    setDetail(item);
    // A mentor opening an answered concern marks the response as seen (clears the notification).
    if (!staff && item.status === 'Responded' && !item.mentorSeen) {
      const seen = { ...item, mentorSeen: true };
      patchItem(seen);
      setFeed(f => ({ ...f, count: Math.max(0, f.count - 1) }));
      lastCount.current = Math.max(0, (lastCount.current ?? 1) - 1);
      try { await apiRequest(`MenteeConcerns/${item.concernID}/ack`, 'PATCH', null, true); emit('concerns:changed'); }
      catch (e) { load(); }
    }
  }

  async function respond(id, message) {
    try {
      const res = await apiRequest(`MenteeConcerns/${id}/respond`, 'POST', { message }, true);
      if (res?.item) { patchItem(res.item); setDetail(res.item); }
      setFeed(f => ({ ...f, count: Math.max(0, f.count - 1) }));
      lastCount.current = Math.max(0, (lastCount.current ?? 1) - 1);
      emit('concerns:changed');
    } catch (e) {
      if (e.status === 409) load();   // someone else already responded: show the up-to-date list
      throw e;
    }
  }

  const { count, items } = feed;
  const stateOf = item => staff
    ? (item.status === 'Responded' ? 'done' : 'open')
    : (item.status !== 'Responded' ? 'wait' : item.mentorSeen ? 'done' : 'fresh');
  const title = staff ? 'Concerns from mentors' : 'Your flagged concerns';
  const countLabel = staff ? `${count} awaiting response` : `${count} new response${count !== 1 ? 's' : ''}`;

  return (
    <>
      <div className={`concern-bell ${staff ? 'staff' : 'mentor'}`} ref={rootRef}>
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
              {count > 0 ? <span className="cb-pill-count">{countLabel}</span> : null}
            </div>
            <div className="cb-list">
              {items.length === 0 ? (
                <div className="cb-empty"><i className="ti ti-bell-off"></i>{staff ? 'No concerns have been reported.' : 'You have not flagged any mentee yet.'}</div>
              ) : items.map(item => {
                const st = stateOf(item);
                const answered = item.status === 'Responded';
                return (
                  <button type="button" key={item.concernID} className={`cb-item ${st}`} onClick={() => openConcern(item)}>
                    <span className="cb-avatar" aria-hidden="true">{initials(item.menteeName)}</span>
                    <span className="cb-main">
                      <span className="cb-row"><span className="cb-name">{item.menteeName}</span><span className="cb-time">{ago(answered && !staff ? item.respondedAt : item.createdAt)}</span></span>
                      <span className="cb-meta">
                        <span className={`cb-pill ${answered ? 'done' : staff ? 'open' : 'wait'}`}>{answered ? 'Responded' : 'Awaiting response'}</span>
                        {staff ? `${item.category} · flagged by ${item.mentorName}` : item.category}
                      </span>
                      <span className="cb-msg">{item.message}</span>
                      {answered ? <span className="cb-reply"><strong>{item.responderName} ({roleLabel(item.responderRole)}):</strong> {item.responseMessage}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {items.length > 0 ? <div className="cb-foot">Showing the latest {items.length} concern{items.length !== 1 ? 's' : ''}</div> : null}
          </div>
        ) : null}
      </div>

      <ConcernDetailModal item={detail} role={role} onClose={() => setDetail(null)} onRespond={respond} />
    </>
  );
}
