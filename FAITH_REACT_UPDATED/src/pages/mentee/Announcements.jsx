import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import { SAMPLE, sampleHtml, useTour } from '../../app/tour.js';
import AnnounceContent from '../../components/announcements/AnnounceContent.jsx';
import AttachmentCards from '../../components/announcements/AttachmentCards.jsx';
import AttachmentLightbox from '../../components/announcements/AttachmentLightbox.jsx';
import Comments from '../../components/announcements/Comments.jsx';
import { useToolbarState } from '../../components/announcements/richText.js';
import Overlay from '../../components/Overlay.jsx';
import { apiRequest, validateUploadFile } from '../../lib/api.js';
import { update as updateSidebarAnnBadge } from '../../lib/announcementBadge.js';
import { attachIcon, fileUrl, formatFileSize } from '../../lib/attachments.js';
import { CONFIG } from '../../lib/config.js';
import { evaluationDeadline, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTEE/HTML/announcements.html + MENTEE/JS/announcements.js

const initialsOf = name => name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
const nowLocalIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, -1); };

export default function MenteeAnnouncements() {
  useBackGuard();
  useToolbarState();
  const tour = useTour();
  const wt = tour.active;   // walkthrough: show sample data
  const currentUser = getSession()?.user;
  const userId = currentUser?.userID;

  const [state, setState] = useState('loading');            // 'loading' | 'ready' | 'failed'
  const [data, setData] = useState({ announcements: [], evaluations: [], attachments: [], names: {}, mentorUserId: null, mentorName: 'My Mentor', available: false });
  const [proofs, setProofs] = useState(new Map());          // linkID -> proof screenshot path (the mentee's own upload)
  const [subtitle, setSubtitle] = useState('Loading...');
  const [tab, setTab] = useState('admin');                  // highlighted tab
  const [shownTab, setShownTab] = useState('admin');        // tab whose list is shown (swaps after the fade-out)
  const [search, setSearch] = useState('');
  const [dots, setDots] = useState({ admin: false, mentor: false });
  const [lightbox, setLightbox] = useState(null);
  const [undoLink, setUndoLink] = useState(null);
  const [deleteComment, setDeleteComment] = useState(null);  // onConfirm fn
  const [uploading, setUploading] = useState({});
  const [uploadErr, setUploadErr] = useState({});
  const listRef = useRef(null);
  const tabsRef = useRef(null);
  const switchTimer = useRef(null);
  const tabRef = useRef('admin');
  const dataRef = useRef(data);
  dataRef.current = data;

  const lastReadKey = t => `ann_lastRead_${t}_${userId}`;
  const markTabRead = t => localStorage.setItem(lastReadKey(t), nowLocalIso());

  function computeDots(d, active) {
    const out = {};
    ['admin', 'mentor'].forEach(t => {
      const lastReadStr = localStorage.getItem(lastReadKey(t));
      const items = t === 'admin'
        ? [...d.announcements.filter(a => a.postedByUserID !== d.mentorUserId), ...d.evaluations]
        : d.announcements.filter(a => a.postedByUserID === d.mentorUserId);
      let hasNew;
      if (!lastReadStr) hasNew = items.length > 0;
      else { const lastRead = new Date(lastReadStr); hasNew = items.some(a => a.postedAt && new Date(a.postedAt) > lastRead); }
      out[t] = hasNew && t !== active;
    });
    // User is on the announcements page — suppress the sidebar badge
    updateSidebarAnnBadge(0);
    return out;
  }

  // ── LOAD ──
  async function loadMenteeInfo() {
    const info = { menteeSection: null, allMentorIds: new Set(), mentorUserId: null, mentorName: 'My Mentor' };
    try {
      const [assignments, menteesWithDept, mentorsWithDept] = await Promise.all([
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('Users/mentees-with-dept', 'GET', null, true),
        apiRequest('Users/mentors-with-dept', 'GET', null, true),
      ]);
      const myInfo = (menteesWithDept || []).find(m => m.userID === userId);
      info.menteeSection = myInfo?.sectionCode || myInfo?.section || null;
      info.allMentorIds = new Set((mentorsWithDept || []).map(m => m.userID).filter(Boolean));
      const myAssignment = (assignments || []).find(a => a.menteeUserID === userId);
      info.mentorUserId = myAssignment?.mentorUserID || null;
      if (info.mentorUserId) {
        const mentor = (mentorsWithDept || []).find(m => m.userID === info.mentorUserId);
        if (mentor) info.mentorName = `${mentor.firstName || ''} ${mentor.lastName || ''}`.trim() || 'My Mentor';
      }
    } catch (e) { /* non-critical */ }
    return info;
  }

  const infoRef = useRef(null);
  async function loadAnnouncements() {
    try {
      const info = infoRef.current;
      const [annResult, evalResult, attachResult, evalAttachResult, mySubsResult] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('EvaluationLinks', 'GET', null, true),
        apiRequest('AnnouncementAttachments', 'GET', null, true),
        apiRequest('EvaluationAttachments', 'GET', null, true),
        apiRequest('EvaluationSubmissions/mine', 'GET', null, true),
      ]);
      if (annResult.status === 'rejected') throw annResult.reason;
      const evalLinks = evalResult.status === 'fulfilled' ? evalResult.value : [];
      const annAtts = attachResult.status === 'fulfilled' ? attachResult.value : [];
      const evalAtts = evalAttachResult.status === 'fulfilled' ? evalAttachResult.value : [];
      const available = mySubsResult.status === 'fulfilled' && Array.isArray(mySubsResult.value);
      const mySubs = mySubsResult.status === 'fulfilled' ? (mySubsResult.value || []) : [];

      const announcements = (annResult.value || [])
        .filter(a => {
          if (!a.isActive) return false;
          if (a.postedByUserID === info.mentorUserId) {
            const secMatch = (a.title || '').match(/^\[([^\]]+)\]/);
            if (!secMatch) return true;
            return info.menteeSection && secMatch[1] === info.menteeSection;
          }
          if (info.allMentorIds.has(a.postedByUserID)) return false;   // posts from other mentors
          const ta = (a.targetAudience || '').toLowerCase();
          return ta === 'both' || ta === 'mentee';
        })
        .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      const evaluations = (evalLinks || [])
        .filter(e => {
          if (!e.isActive) return false;
          const role = (e.targetRole || '').toLowerCase();
          return role === 'mentee' || role === 'both';
        })
        .map(e => ({ ...e, _type: 'evaluation', content: e.description || '' }))
        .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

      const adminCount = announcements.filter(a => a.postedByUserID !== info.mentorUserId).length;
      const mentorCount = announcements.filter(a => a.postedByUserID === info.mentorUserId).length;
      const evalCount = evaluations.length;

      // Real names for admin posters (includes evaluation posters)
      const adminIds = [...new Set([
        ...announcements.filter(a => a.postedByUserID !== info.mentorUserId).map(a => a.postedByUserID).filter(Boolean),
        ...evaluations.map(e => e.postedByUserID).filter(Boolean),
      ])];
      const names = {};
      if (adminIds.length) {
        const results = await Promise.allSettled(adminIds.map(id => apiRequest(`Users/${id}`, 'GET', null, true)));
        adminIds.forEach((id, i) => {
          if (results[i].status === 'fulfilled') {
            const u = results[i].value;
            names[id] = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'Administrator';
          }
        });
      }

      const next = { announcements, evaluations, attachments: [...annAtts, ...evalAtts], names, mentorUserId: info.mentorUserId, mentorName: info.mentorName, available };
      markTabRead(tabRef.current);
      setData(next);
      setProofs(new Map(mySubs.map(s => [s.linkID, s.proofFilePath || null])));
      setSubtitle(evalCount > 0
        ? `${adminCount} from admin · ${evalCount} evaluation${evalCount !== 1 ? 's' : ''} · ${mentorCount} from your mentor`
        : `${adminCount} from admin · ${mentorCount} from your mentor`);
      setDots(computeDots(next, tabRef.current));
      setState('ready');
    } catch (e) {
      setState('failed');
    }
  }

  useEffect(() => {
    (async () => {
      // Sequential — announcements must know the mentor before filtering
      infoRef.current = await loadMenteeInfo();
      await loadAnnouncements();
    })();
    return () => clearTimeout(switchTimer.current);
  }, []);

  // ── TABS ──
  function switchTab(next) {
    const changed = next !== tabRef.current;
    tabRef.current = next;
    setTab(next);
    setSearch('');
    markTabRead(next);
    setDots(computeDots(dataRef.current, next));
    const list = listRef.current;
    if (!changed || !list) { setShownTab(next); return; }
    // fade the old list out, swap it, then let the new cards rise in one after another
    clearTimeout(switchTimer.current);
    list.classList.remove('ann-in');
    list.classList.add('ann-out');
    switchTimer.current = setTimeout(() => {
      setShownTab(next);
      list.classList.remove('ann-out');
      void list.offsetWidth;
      list.classList.add('ann-in');
    }, 140);
  }

  // ── Deep link (from the Dashboard's widgets): ?id=<announcementID> or eval-<linkID> scrolls to and highlights
  // that card, switching tabs first if the post is the mentor's own. ──
  useEffect(() => {
    if (state !== 'ready') return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const idNum = Number(id);
    const isFromMine = data.announcements.some(a => a.announcementID === idNum && a.postedByUserID === data.mentorUserId);
    if (isFromMine && tabRef.current !== 'mentor') switchTab('mentor');
    const card = document.getElementById(`announce-card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('deep-link-highlight');
    setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  }, [state]);

  // Sliding pill behind the active tab.
  const [pill, setPill] = useState(null);
  const effTab = wt ? tour.annTab : tab;
  const movePill = () => {
    const wrap = tabsRef.current;
    const active = wrap?.querySelector('.ann-tab.active');
    if (!wrap || !active) { setPill(null); return; }
    setPill({ width: active.offsetWidth, height: active.offsetHeight, x: active.offsetLeft, y: active.offsetTop });
  };
  useLayoutEffect(movePill, [effTab]);
  useEffect(() => {
    let frame;
    const again = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(movePill); };
    window.addEventListener('resize', again);
    const ro = typeof ResizeObserver !== 'undefined' && tabsRef.current ? new ResizeObserver(again) : null;
    ro?.observe(tabsRef.current);
    if (document.fonts) document.fonts.ready.then(again);
    again();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', again); ro?.disconnect(); };
  }, []);

  // ── EVALUATION SUBMISSION (proof screenshot) ──
  // Uploading the screenshot IS the submit action — no separate confirm step.
  async function uploadEvalProof(linkId, input) {
    if (!data.available) return;
    const file = input.files?.[0];
    if (!file) return;
    const setErr = msg => setUploadErr(e => ({ ...e, [linkId]: msg }));
    setErr('');
    const invalid = validateUploadFile(file, 'EvaluationSubmissions/upload');
    if (invalid) { setErr(invalid); input.value = ''; return; }
    if (file.size > 20 * 1024 * 1024) { setErr('File is too large. Maximum size is 20 MB.'); input.value = ''; return; }
    setUploading(u => ({ ...u, [linkId]: true }));
    try {
      const fd = new FormData();
      fd.append('linkId', linkId);
      fd.append('file', file);
      const res = await apiRequest('EvaluationSubmissions/upload', 'POST', fd, true);
      setProofs(p => new Map(p).set(linkId, res?.proofFilePath || null));
      setUploading(u => ({ ...u, [linkId]: false }));
    } catch (e) {
      console.error('Proof upload failed:', e);
      setErr(e.message || 'Upload failed. Please try again.');
      setUploading(u => ({ ...u, [linkId]: false }));
      input.value = '';
    }
  }

  async function doUnmarkEvalSubmitted(linkId) {
    setUndoLink(null);
    const prevProof = proofs.get(linkId);
    setProofs(p => { const m = new Map(p); m.delete(linkId); return m; });
    try {
      await apiRequest(`EvaluationSubmissions/${linkId}`, 'DELETE', null, true);
    } catch (e) {
      console.error('Unmark submitted failed:', e);
      setProofs(p => new Map(p).set(linkId, prevProof));
    }
  }

  // ── RENDER ──
  const menteeInitials = (((currentUser?.firstName || '')[0] || '') + ((currentUser?.lastName || '')[0] || '')).toUpperCase() || 'ME';

  function evaluationCard(e) {
    const fromName = e.postedByName || data.names[e.postedByUserID] || 'Name unavailable';
    const fromInitials = initialsOf(fromName) || 'AD';
    const date = new Date(e.postedAt || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    const uniqueId = `eval-${e.linkID}`;
    const now = new Date();
    const dlEOD = evaluationDeadline(e.deadline);
    const isPast = dlEOD ? dlEOD <= now : false;
    let deadline = null;
    if (e.deadline) {
      const isSoon = !isPast && (dlEOD - now) < 3 * 24 * 60 * 60 * 1000;
      const cls = isPast ? 'eval-deadline eval-deadline-past' : isSoon ? 'eval-deadline eval-deadline-soon' : 'eval-deadline';
      deadline = <span className={cls}><i className="ti ti-clock"></i> Due {evaluationDeadlineLabel(e.deadline)}{isPast ? ' · Overdue' : ''}</span>;
    }
    const atts = data.attachments.filter(a => a.linkID === e.linkID);
    const pinned = !!e.isPinned;

    // The real answers live entirely on Google Forms; a proof screenshot is the best verification available.
    const submitted = proofs.has(e.linkID);
    const proofPath = proofs.get(e.linkID);
    let submit;
    if (!data.available) submit = <><span role="status">Submission status unavailable.</span><button type="button" className="eval-mark-btn" onClick={loadAnnouncements}>Retry</button></>;
    else if (submitted) submit = (
      <>
        <span className="eval-submitted-badge"><i className="ti ti-check"></i> Submitted</span>
        {proofPath ? <a className="eval-view-proof-link" href={CONFIG.getFileUrl(proofPath)} target="_blank" rel="noopener">View</a> : null}
        <button type="button" className="eval-unmark-btn" onClick={() => setUndoLink(e.linkID)}>Undo</button>
      </>
    );
    else submit = (
      <>
        <label className={`eval-mark-btn eval-upload-label${uploading[e.linkID] ? ' is-uploading' : ''}`}>
          <i className="ti ti-upload"></i> Upload proof screenshot
          <input type="file" accept="image/*" hidden onChange={ev => uploadEvalProof(e.linkID, ev.target)} />
        </label>
        <div className="eval-upload-error" id={`eval-upload-err-${e.linkID}`}>{uploadErr[e.linkID] || ''}</div>
      </>
    );

    return (
      <div className={`announce-card announce-card-evaluation${pinned ? ' announce-card--pinned' : ''}`} id={`announce-card-${uniqueId}`} key={uniqueId}>
        {pinned ? <div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div> : null}
        <div className="ann-card-top">
          <div className="ann-avatar ann-avatar-amber">{fromInitials}</div>
          <div className="ann-card-info">
            <div className="ann-card-name">
              <span className="evaluation-author"><strong>{fromName}</strong></span>
              <span className="ann-role-badge role-admin">Administrator</span>
              <span className="ann-badge ann-badge-evaluation"><i className="ti ti-clipboard-check"></i> Evaluation</span>
            </div>
            <div className="ann-card-date">{date}</div>
          </div>
        </div>
        <div className="announce-title">{e.title || 'Evaluation'}</div>
        {e.description ? <AnnounceContent html={e.description} id={`ann-content-${uniqueId}`} /> : null}
        {atts.length ? (
          <div className="attach-list attach-list--card">
            {atts.map(a => (
              <div className="attach-item--card" key={a.attachmentID}>
                <a className="attach-item--card-link" href={fileUrl(a.filePath)} target="_blank" rel="noopener">
                  <i className={`ti ${attachIcon(a.fileName)} attach-icon`}></i>
                  <span className="attach-name">{a.fileName}</span>
                  <span className="attach-size">{formatFileSize(a.fileSize)}</span>
                </a>
                <button className="attach-download" title="Download" onClick={() => window.open(`${CONFIG.API_BASE_URL}/EvaluationAttachments/${a.attachmentID}/download`, '_blank')}>
                  <i className="ti ti-download"></i>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="eval-footer">
          {deadline}
          {isPast ? <span className="eval-deadline-note">You can still upload proof after the deadline.</span> : null}
          <div className="eval-footer-actions">
            {submit}
            {isPast
              ? <span className="btn-open-form btn-open-form-closed">Open Form</span>
              : <a href={e.googleFormURL} target="_blank" rel="noopener noreferrer" className="btn-open-form"><i className="ti ti-external-link"></i> Open Form</a>}
          </div>
        </div>
      </div>
    );
  }

  function announcementCard(a) {
    const id = a.announcementID;
    const isMentor = a.postedByUserID === data.mentorUserId;
    // Head Admin's posts get their own label instead of being folded into Admin's.
    const isHead = !isMentor && (a.posterRole || '').toLowerCase() === 'head';
    const rawTitle = a.title || 'Announcement';
    const secMatch = isMentor ? rawTitle.match(/^\[([^\]]+)\]/) : null;
    const sectionTag = secMatch ? secMatch[1] : null;
    const title = rawTitle.replace(/^\[[^\]]+\]\s*/, '');
    const date = new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    const fromName = isMentor ? data.mentorName : (data.names[a.postedByUserID] || 'Administrator');
    const fromInitials = initialsOf(fromName) || (isMentor ? 'MT' : 'AD');
    const pinned = !!a.isPinned;
    const roleClass = isMentor ? 'role-mentor' : isHead ? 'role-head' : 'role-admin';
    const roleLabel = isMentor ? 'Mentor' : isHead ? 'Head Admin' : 'Administrator';
    return (
      <div className={`announce-card ${isMentor ? 'announce-card-mentor' : 'announce-card-admin'}${pinned ? ' announce-card--pinned' : ''}`} id={`announce-card-${id}`} key={id}>
        {pinned ? <div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div> : null}
        <div className="ann-card-top">
          <div className={`ann-avatar ${isMentor ? 'ann-avatar-teal' : 'ann-avatar-indigo'}`}>{fromInitials}</div>
          <div className="ann-card-info">
            <div className="ann-card-name">
              {fromName}
              <span className={`ann-role-badge ${roleClass}`}>{roleLabel}</span>
              {sectionTag ? <span className="ann-badge ann-badge-section">{sectionTag}</span> : null}
            </div>
            <div className="ann-card-date">{date}</div>
          </div>
        </div>
        <div className="announce-title">{title}</div>
        <AnnounceContent html={a.content || ''} id={`ann-content-${id}`} />
        <AttachmentCards attachments={data.attachments.filter(x => x.announcementID === id)} onView={setLightbox} />
        <Comments announcementId={id} currentUser={currentUser} myInits={menteeInitials} variant="class"
          confirm={(t, m, type, onConfirm) => setDeleteComment(() => onConfirm)} />
      </div>
    );
  }

  let list;
  if (state === 'loading') list = <div className="list-skeleton"><span className="spinner"></span> Loading announcements and evaluations...</div>;
  else if (state === 'failed') list = <div className="list-skeleton">Failed to load announcements. Please refresh.</div>;
  else {
    const q = search.trim().toLowerCase();
    const match = x => (x.title || '').toLowerCase().includes(q) || (x.content || '').toLowerCase().includes(q);
    let items;
    if (shownTab === 'admin') {
      let adminAnns = data.announcements.filter(a => a.postedByUserID !== data.mentorUserId);
      let evals = data.evaluations.slice();
      if (q) { adminAnns = adminAnns.filter(match); evals = evals.filter(match); }
      items = [...adminAnns, ...evals];
    } else {
      items = data.announcements.filter(a => a.postedByUserID === data.mentorUserId);
      if (q) items = items.filter(match);
    }
    items = [...items].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt));
    list = !items.length
      ? (
        <div className="empty-state">
          <i className="ti ti-speakerphone-off"></i>
          <p>{shownTab === 'admin' ? 'No administration announcements yet.' : 'No announcements from your mentor yet.'}</p>
        </div>
      )
      : items.map(a => a._type === 'evaluation' ? evaluationCard(a) : announcementCard(a));
  }

  return (
    <Page id="MENTEE/announcements">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Announcements &amp; Evaluations</h1>
              <p id="announceSubtitle">{wt ? '1 from admin · 1 from your mentor' : subtitle}</p>
            </div>
          </div>

          <div className={`ann-tabs${pill ? ' has-indicator' : ''}`} ref={tabsRef}>
            <span className="ann-tab-indicator" style={pill ? { width: pill.width + 'px', height: pill.height + 'px', transform: `translate(${pill.x}px, ${pill.y}px)` } : undefined}></span>
            <button className={`ann-tab${effTab === 'admin' ? ' active' : ''}`} id="tab-admin" onClick={() => switchTab('admin')}>
              <i className="ti ti-building"></i> Administration
              <span className="ann-unread-dot" id="dot-admin" style={{ display: dots.admin ? '' : 'none' }}></span>
            </button>
            <button className={`ann-tab${effTab === 'mentor' ? ' active' : ''}`} id="tab-mentor" onClick={() => switchTab('mentor')}>
              <i className="ti ti-speakerphone"></i> From My Mentor
              <span className="ann-unread-dot" id="dot-mentor" style={{ display: dots.mentor ? '' : 'none' }}></span>
            </button>
          </div>

          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              <input type="text" id="searchInput" placeholder="Search announcements and evaluations..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div id="announcementsList" className="announcements-list" ref={listRef}
            key={wt ? `wt-${tour.annTab}` : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SAMPLE.announcements(tour.annTab))}>{wt ? undefined : list}</div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      <AttachmentLightbox attachment={lightbox} onClose={() => setLightbox(null)} />

      {/* Undo Evaluation Submission Modal */}
      <Overlay open={undoLink !== null} className="modal-overlay" activeClass="open" id="undoEvalModal"
        onClick={e => { if (e.target === e.currentTarget) setUndoLink(null); }}>
        <div className="edit-modal-card confirm-card" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon"><i className="ti ti-rotate-2"></i></div>
          <h2 className="modal-title">Undo Submission?</h2>
          <p className="modal-subtitle">This removes your submitted proof for this evaluation.</p>
          <div className="edit-modal-footer" style={{ justifyContent: 'center', gap: '14px' }}>
            <button className="btn-cancel" onClick={() => setUndoLink(null)}>Go Back</button>
            <button className="btn-save" onClick={() => doUnmarkEvalSubmitted(undoLink)}>Undo</button>
          </div>
        </div>
      </Overlay>

      {/* Delete Comment Modal */}
      <Overlay open={!!deleteComment} className="modal-overlay" activeClass="open" id="deleteCommentModal"
        onClick={e => { if (e.target === e.currentTarget) setDeleteComment(null); }}>
        <div className="edit-modal-card confirm-card" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-danger"><i className="ti ti-trash"></i></div>
          <h2 className="modal-title">Delete Comment?</h2>
          <p className="modal-subtitle">Are you sure you want to delete this comment? This cannot be undone.</p>
          <div className="edit-modal-footer" style={{ justifyContent: 'center', gap: '14px' }}>
            <button className="btn-cancel" onClick={() => setDeleteComment(null)}>Go Back</button>
            <button className="btn-save btn-danger" onClick={() => { const fn = deleteComment; setDeleteComment(null); fn(); }}>Delete</button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
