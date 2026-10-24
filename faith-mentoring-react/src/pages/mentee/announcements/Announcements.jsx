import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Page, { usePage } from '../../../app/Page.jsx';
import { ConfirmX } from '../../../components/ConfirmX.jsx';
import { showToast } from '../../../components/Notify.jsx';
import { updateAnnBadge } from '../../../lib/announcementBadge.js';
import { apiRequest, validateUploadFile } from '../../../lib/api.js';
import { getSession, isLoggedIn } from '../../../lib/session.js';
import { SAMPLE } from '../tour/samples.js';
import { useTour } from '../tour/TourContext.js';
import { AnnouncementCard, EvaluationCard } from './Cards.jsx';
import Comments from '../../../components/announcements/Comments.jsx';
import Lightbox from '../../../components/announcements/Lightbox.jsx';
import { useActiveFormats, useSeeMore } from '../../../components/announcements/SeeMore.jsx';

// Mentee Announcements & Evaluations (MENTEE/HTML/announcements.html + announcements.js):
// Administration tab (admin/head posts + evaluation forms) and From My Mentor tab.
const nowLocalIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, -1); };
const byPinnedThenDate = (a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.postedAt) - new Date(a.postedAt);

export default function MenteeAnnouncements() {
  return (
    <Page id="MENTEE/announcements">
      <AnnouncementsBody />
    </Page>
  );
}

function AnnouncementsBody() {
  const navigate = useNavigate();
  const location = useLocation();
  const tour = useTour();
  const { ready } = usePage();
  const [user] = useState(() => getSession().user);
  const [data, setData] = useState({ state: 'loading' });     // loading | ok | error
  const [tab, setTab] = useState('admin');                     // active tab
  const [shownTab, setShownTab] = useState('admin');           // tab whose list is rendered (swaps after the fade)
  const [listAnim, setListAnim] = useState('');                // '' | 'ann-out' | 'ann-in'
  const [query, setQuery] = useState('');
  const [dots, setDots] = useState({ admin: false, mentor: false });
  const [proofs, setProofs] = useState(new Map());             // linkID -> proof path
  const [uploading, setUploading] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  const [comments, setComments] = useState({});                // annId -> { state, list, showAll }
  const [openKebab, setOpenKebab] = useState(null);
  const activeFormats = useActiveFormats();
  const [undoLinkId, setUndoLinkId] = useState(null);
  const [deleteComment, setDeleteComment] = useState(null);    // { commentId, annId }
  const [lightbox, setLightbox] = useState(null);              // { attachment, failed }
  const listRef = useRef(null);
  const tabsRef = useRef(null);
  const swapTimer = useRef(null);
  const deepLink = useRef(new URLSearchParams(location.search).get('id'));

  // Keep the mentee on this page when they press Back (and recheck the session).
  useEffect(() => {
    window.history.pushState(window.history.state, '', window.location.href);
    const onPop = () => {
      if (!isLoggedIn()) window.location.href = '/login';
      else window.history.pushState(window.history.state, '', window.location.href);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Unread dots per tab ──
  const lastReadKey = t => `ann_lastRead_${t}_${user?.userID}`;
  const computeDots = (d, active) => {
    const next = {};
    for (const t of ['admin', 'mentor']) {
      const items = t === 'admin'
        ? [...d.announcements.filter(a => a.postedByUserID !== d.mentorUserId), ...d.evaluations]
        : d.announcements.filter(a => a.postedByUserID === d.mentorUserId);
      const lastReadStr = localStorage.getItem(lastReadKey(t));
      const hasNew = !lastReadStr ? items.length > 0 : items.some(a => a.postedAt && new Date(a.postedAt) > new Date(lastReadStr));
      next[t] = hasNew && t !== active;
    }
    setDots(next);
    updateAnnBadge(0);   // the mentee is on the announcements page — no sidebar badge
  };

  // ── Load ──
  const loadComments = useCallback(async (annId, showAll) => {
    try {
      const list = await apiRequest(`AnnouncementComments/announcement/${annId}`, 'GET', null, true);
      setComments(c => ({ ...c, [annId]: { state: 'ok', list: list || [], showAll: showAll ?? c[annId]?.showAll ?? false } }));
    } catch (e) {
      setComments(c => ({ ...c, [annId]: { state: 'error', list: [], showAll: c[annId]?.showAll } }));
    }
  }, []);

  const load = useCallback(async () => {
    const info = await loadMenteeInfo(user);
    try {
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
      const statusAvailable = mySubsResult.status === 'fulfilled' && Array.isArray(mySubsResult.value);
      const mySubs = mySubsResult.status === 'fulfilled' ? (mySubsResult.value || []) : [];

      const announcements = (annResult.value || []).filter(a => {
        if (!a.isActive) return false;
        if (a.postedByUserID === info.mentorUserId) {
          // A mentor post tagged "[SECTION]" is only for that section.
          const secMatch = (a.title || '').match(/^\[([^\]]+)\]/);
          if (!secMatch) return true;
          return info.menteeSection && secMatch[1] === info.menteeSection;
        }
        if (info.allMentorIds.has(a.postedByUserID)) return false;   // other mentors' posts
        const ta = (a.targetAudience || '').toLowerCase();
        return ta === 'both' || ta === 'mentee';
      }).sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      const evaluations = (evalLinks || []).filter(e => {
        if (!e.isActive) return false;
        const role = (e.targetRole || '').toLowerCase();
        return role === 'mentee' || role === 'both';
      }).map(e => ({ ...e, _type: 'evaluation', content: e.description || '' }))
        .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

      // Real names for admin posters (evaluation posters included).
      const adminIds = [...new Set([
        ...announcements.filter(a => a.postedByUserID !== info.mentorUserId).map(a => a.postedByUserID).filter(Boolean),
        ...evaluations.map(e => e.postedByUserID).filter(Boolean),
      ])];
      const adminNames = {};
      if (adminIds.length) {
        const results = await Promise.allSettled(adminIds.map(id => apiRequest(`Users/${id}`, 'GET', null, true)));
        adminIds.forEach((id, i) => {
          if (results[i].status === 'fulfilled') {
            const u = results[i].value;
            adminNames[id] = `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'Administrator';
          }
        });
      }
      const d = { state: 'ok', ...info, announcements, evaluations, attachments: [...annAtts, ...evalAtts], statusAvailable, adminNames };
      setProofs(new Map(mySubs.map(s => [s.linkID, s.proofFilePath || null])));
      setData(d);
      return d;
    } catch (e) {
      setData({ state: 'error' });
      return null;
    }
  }, []);

  useEffect(() => {
    load().then(d => {
      if (!d) return;
      localStorage.setItem(lastReadKey('admin'), nowLocalIso());
      computeDots(d, 'admin');
    });
  }, []);

  // Comments load for every announcement card that is rendered.
  const visibleItems = data.state === 'ok' ? filterItems(data, shownTab, query) : [];
  useEffect(() => {
    visibleItems.filter(a => a._type !== 'evaluation').forEach(a => loadComments(a.announcementID));
  }, [data.state, shownTab, query]);

  // Dashboard links can point to an announcement or an evaluation. Switch tabs first if needed,
  // then wait for that tab's list to render before scrolling to the linked card.
  useEffect(() => {
    if (data.state !== 'ok' || !deepLink.current) return;
    const id = deepLink.current;
    const isEvaluation = id.startsWith('eval-');
    const linkedId = isEvaluation ? id.slice(5) : id;
    const linkedAnnouncement = isEvaluation ? null : data.announcements.find(a => String(a.announcementID) === linkedId);
    const linkedEvaluation = isEvaluation ? data.evaluations.find(e => String(e.linkID) === linkedId) : null;
    if (isEvaluation ? !linkedEvaluation : !linkedAnnouncement) return;
    const expectedTab = isEvaluation || linkedAnnouncement.postedByUserID !== data.mentorUserId ? 'admin' : 'mentor';
    if (expectedTab !== shownTab) {
      if (expectedTab !== tab) switchTab(expectedTab);
      return;
    }
    const card = document.getElementById(`announce-card-${id}`);
    if (!card) return;
    deepLink.current = null;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('deep-link-highlight');
    setTimeout(() => card.classList.remove('deep-link-highlight'), 2200);
    const params = new URLSearchParams(location.search);
    params.delete('id');
    navigate({ pathname: location.pathname, search: params.toString() ? '?' + params : '' }, { replace: true });
  }, [data.state, shownTab, tab]);

  // ── Tabs ──
  function switchTab(next) {
    const changed = next !== tab;
    setTab(next);
    setQuery('');
    localStorage.setItem(lastReadKey(next), nowLocalIso());
    if (data.state === 'ok') computeDots(data, next);
    if (!changed) return;
    // fade the old list out, swap it, then let the new cards rise in one after another
    clearTimeout(swapTimer.current);
    setListAnim('ann-out');
    swapTimer.current = setTimeout(() => {
      setShownTab(next);
      setListAnim('');
      requestAnimationFrame(() => setListAnim('ann-in'));
    }, 140);
  }
  useEffect(() => () => clearTimeout(swapTimer.current), []);

  // Sliding pill behind the active tab.
  const activeTabName = tour.sample ? tour.annTab : tab;
  const [pill, setPill] = useState(null);
  const placePill = useCallback(() => {
    const wrap = tabsRef.current;
    const active = wrap?.querySelector('.ann-tab.active');
    if (!active) { setPill(p => (p ? { ...p, on: false } : p)); return; }
    setPill({ on: true, style: { width: active.offsetWidth + 'px', height: active.offsetHeight + 'px', transform: `translate(${active.offsetLeft}px, ${active.offsetTop}px)` } });
  }, []);
  useLayoutEffect(() => { if (ready) placePill(); }, [ready, activeTabName]);
  useEffect(() => {
    window.addEventListener('resize', placePill);
    window.addEventListener('load', placePill);
    // Tab widths change when the web font arrives.
    document.fonts?.ready.then(placePill);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(placePill) : null;
    tabsRef.current?.querySelectorAll('.ann-tab').forEach(t => ro?.observe(t));
    return () => { window.removeEventListener('resize', placePill); window.removeEventListener('load', placePill); ro?.disconnect(); };
  }, []);

  // ── "See more": which bodies overflow their clamp ──
  const [seeMore, toggleSeeMore] = useSeeMore(listRef, ready, [data, shownTab, query, proofs, tour.sample]);

  // ── Close comment kebabs on any click; Escape closes the lightbox ──
  useEffect(() => {
    const closeKebab = () => setOpenKebab(null);
    document.addEventListener('click', closeKebab);
    const onKey = e => { if (e.key === 'Escape') setLightbox(null); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', closeKebab); document.removeEventListener('keydown', onKey); };
  }, []);

  // ── Comments ──
  async function postComment(annId, content) {
    try {
      await apiRequest('AnnouncementComments', 'POST', { AnnouncementID: annId, PostedByUserID: user.userID, Content: content }, true);
      showToast('Comment posted.', 'success');
      await loadComments(annId, true);
      return true;
    } catch (e) {
      console.error('Post comment failed:', e);
      showToast(e.message || 'Failed to post comment. Please try again.');
      return false;
    }
  }
  async function saveEditComment(commentId, annId, content) {
    try {
      await apiRequest(`AnnouncementComments/${commentId}`, 'PUT', { Content: content }, true);
      showToast('Comment updated.', 'success');
      await loadComments(annId);
      return true;
    } catch (e) {
      console.error('Edit comment failed:', e);
      showToast(e.message || 'Failed to update comment. Please try again.');
    }
  }
  async function confirmDeleteComment() {
    const target = deleteComment;
    setDeleteComment(null);
    if (!target) return;
    try {
      await apiRequest(`AnnouncementComments/${target.commentId}`, 'DELETE', null, true);
      showToast('Comment deleted.', 'success');
      await loadComments(target.annId);
    } catch (e) {
      console.error('Delete comment failed:', e);
      showToast(e.message || 'Failed to delete comment. Please try again.');
    }
  }

  // ── Evaluation proof ──
  async function uploadProof(linkId, input) {
    if (!data.statusAvailable) return;
    const file = input.files?.[0];
    if (!file) return;
    setUploadErrors(e => ({ ...e, [linkId]: '' }));
    const invalid = validateUploadFile(file, 'EvaluationSubmissions/upload');
    if (invalid) { setUploadErrors(e => ({ ...e, [linkId]: invalid })); input.value = ''; return; }
    if (file.size > 20 * 1024 * 1024) { setUploadErrors(e => ({ ...e, [linkId]: 'File is too large. Maximum size is 20 MB.' })); input.value = ''; return; }
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
      setUploadErrors(er => ({ ...er, [linkId]: e.message || 'Upload failed. Please try again.' }));
      setUploading(u => ({ ...u, [linkId]: false }));
      input.value = '';
    }
  }
  async function doUndo() {
    const linkId = undoLinkId;
    setUndoLinkId(null);
    const prevProof = proofs.get(linkId);
    setProofs(p => { const n = new Map(p); n.delete(linkId); return n; });
    try {
      await apiRequest(`EvaluationSubmissions/${linkId}`, 'DELETE', null, true);
    } catch (e) {
      console.error('Unmark submitted failed:', e);
      setProofs(p => new Map(p).set(linkId, prevProof));
    }
  }

  // ── Render ──
  const sample = tour.sample;
  const initials = (((user?.firstName || '')[0] || '') + ((user?.lastName || '')[0] || '')).toUpperCase() || 'ME';
  let subtitle = 'Loading...';
  if (sample) subtitle = '1 from admin · 1 from your mentor';
  else if (data.state === 'ok') {
    const adminCount = data.announcements.filter(a => a.postedByUserID !== data.mentorUserId).length;
    const mentorCount = data.announcements.filter(a => a.postedByUserID === data.mentorUserId).length;
    const evalCount = data.evaluations.length;
    subtitle = evalCount > 0
      ? `${adminCount} from admin · ${evalCount} evaluation${evalCount !== 1 ? 's' : ''} · ${mentorCount} from your mentor`
      : `${adminCount} from admin · ${mentorCount} from your mentor`;
  }

  return (
    <>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Announcements &amp; Evaluations</h1>
              {' '}
              <p id="announceSubtitle">{subtitle}</p>
            </div>
          </div>
          {' '}
          {/* Tabs */}
          <div className={'ann-tabs' + (pill?.on ? ' has-indicator' : '')} ref={tabsRef}>
            {pill && <span className="ann-tab-indicator" style={pill.style}></span>}
            <button className={'ann-tab' + (activeTabName === 'admin' ? ' active' : '')} id="tab-admin" onClick={() => switchTab('admin')}>
              <i className="ti ti-building"></i>
              {' '}Administration{' '}
              <span className="ann-unread-dot" id="dot-admin" style={dots.admin ? undefined : { display: 'none' }}></span>
            </button>
            {' '}
            <button className={'ann-tab' + (activeTabName === 'mentor' ? ' active' : '')} id="tab-mentor" onClick={() => switchTab('mentor')}>
              <i className="ti ti-speakerphone"></i>
              {' '}From My Mentor{' '}
              <span className="ann-unread-dot" id="dot-mentor" style={dots.mentor ? undefined : { display: 'none' }}></span>
            </button>
          </div>
          {' '}
          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-wrap">
              <i className="ti ti-search"></i>
              {' '}
              <input type="text" id="searchInput" placeholder="Search announcements and evaluations..." value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          {' '}
          {/* List */}
          {sample
            ? <div id="announcementsList" className="announcements-list" ref={listRef}
                dangerouslySetInnerHTML={{ __html: SAMPLE.announcements[tour.annTab] }} />
            : (
              <div id="announcementsList" className={'announcements-list' + (listAnim ? ' ' + listAnim : '')} ref={listRef}>
                {data.state === 'loading' && <div className="list-skeleton"><span className="spinner"></span>{' '}Loading announcements and evaluations...</div>}
                {data.state === 'error' && <div className="list-skeleton">Failed to load announcements. Please refresh.</div>}
                {data.state === 'ok' && (visibleItems.length === 0
                  ? (
                    <div className="empty-state">
                      <i className="ti ti-speakerphone-off"></i>
                      {' '}
                      <p>{shownTab === 'admin' ? 'No administration announcements yet.' : 'No announcements from your mentor yet.'}</p>
                    </div>
                  )
                  : visibleItems.map(a => a._type === 'evaluation'
                    ? <EvaluationCard key={`e${a.linkID}`} e={a} fromName={a.postedByName || data.adminNames[a.postedByUserID] || 'Name unavailable'}
                        attachments={data.attachments.filter(x => x.linkID === a.linkID)}
                        seeMore={seeMore[`ann-content-eval-${a.linkID}`]} onToggleSeeMore={() => toggleSeeMore(`ann-content-eval-${a.linkID}`)}
                        submitted={proofs.has(a.linkID)} proofPath={proofs.get(a.linkID)} statusAvailable={data.statusAvailable}
                        uploading={!!uploading[a.linkID]} error={uploadErrors[a.linkID] || ''}
                        onRetry={load} onUpload={input => uploadProof(a.linkID, input)} onUndo={() => setUndoLinkId(a.linkID)} />
                    : (() => {
                      const isMentor = a.postedByUserID === data.mentorUserId;
                      return (
                        <AnnouncementCard key={`a${a.announcementID}`} a={a} isMentor={isMentor}
                          fromName={isMentor ? data.mentorName : (data.adminNames[a.postedByUserID] || 'Administrator')}
                          attachments={data.attachments.filter(x => x.announcementID === a.announcementID)}
                          onViewAttachment={att => setLightbox({ attachment: att, failed: false })}
                          seeMore={seeMore[`ann-content-${a.announcementID}`]} onToggleSeeMore={() => toggleSeeMore(`ann-content-${a.announcementID}`)}
                          comments={<Comments annId={a.announcementID} data={comments[a.announcementID]} me={user?.userID} initials={initials}
                            openKebab={openKebab} setOpenKebab={setOpenKebab} activeFormats={activeFormats}
                            onPost={content => postComment(a.announcementID, content)}
                            onSaveEdit={(commentId, html) => saveEditComment(commentId, a.announcementID, html)}
                            onDelete={commentId => setDeleteComment({ commentId, annId: a.announcementID })}
                            onShowAll={() => loadComments(a.announcementID, true)} />} />
                      );
                    })()))}
              </div>
            )}
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* Attachment lightbox */}
      <Lightbox state={lightbox} onClose={() => setLightbox(null)} onFail={() => setLightbox(l => l && { ...l, failed: true })} />
      {/* Undo Evaluation Submission Modal */}
      <ConfirmModal id="undoEvalModal" open={undoLinkId !== null} onClose={() => setUndoLinkId(null)}
        icon="ti-rotate-2" title="Undo Submission?" body="This removes your submitted proof for this evaluation."
        confirmClass="btn-save" confirmLabel="Undo" onConfirm={doUndo} />
      {/* Delete Comment Modal */}
      <ConfirmModal id="deleteCommentModal" open={!!deleteComment} onClose={() => setDeleteComment(null)} danger
        icon="ti-trash" title="Delete Comment?" body="Are you sure you want to delete this comment? This cannot be undone."
        confirmClass="btn-save btn-danger" confirmLabel="Delete" onConfirm={confirmDeleteComment} />
    </>
  );
}

function filterItems(d, tab, query) {
  const q = query.trim().toLowerCase();
  const match = a => (a.title || '').toLowerCase().includes(q) || (a.content || '').toLowerCase().includes(q);
  if (tab === 'admin') {
    let anns = d.announcements.filter(a => a.postedByUserID !== d.mentorUserId);
    let evals = d.evaluations.slice();
    if (q) { anns = anns.filter(match); evals = evals.filter(match); }
    return [...anns, ...evals].sort(byPinnedThenDate);
  }
  let items = d.announcements.filter(a => a.postedByUserID === d.mentorUserId);
  if (q) items = items.filter(match);
  return [...items].sort(byPinnedThenDate);
}

async function loadMenteeInfo(user) {
  const info = { menteeSection: null, mentorUserId: null, mentorName: 'My Mentor', allMentorIds: new Set() };
  try {
    const [assignments, menteesWithDept, mentorsWithDept] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('Users/mentees-with-dept', 'GET', null, true),
      apiRequest('Users/mentors-with-dept', 'GET', null, true),
    ]);
    const myInfo = (menteesWithDept || []).find(m => m.userID === user?.userID);
    info.menteeSection = myInfo?.sectionCode || myInfo?.section || null;
    info.allMentorIds = new Set((mentorsWithDept || []).map(m => m.userID).filter(Boolean));
    const mine = (assignments || []).find(a => a.menteeUserID === user?.userID);
    info.mentorUserId = mine?.mentorUserID || null;
    if (info.mentorUserId) {
      const mentor = (mentorsWithDept || []).find(m => m.userID === info.mentorUserId);
      if (mentor) info.mentorName = `${mentor.firstName || ''} ${mentor.lastName || ''}`.trim() || 'My Mentor';
    }
  } catch (e) { /* non-critical */ }
  return info;
}

// Small confirm dialog (the original's confirm-dialog restyle is applied: data-ac + close X).
function ConfirmModal({ id, open, onClose, danger, icon, title, body, confirmClass, confirmLabel, onConfirm }) {
  return (
    <div id={id} className={'modal-overlay' + (open ? ' open' : '')} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-modal-card confirm-card" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
        <div className={'confirm-icon' + (danger ? ' confirm-icon-danger' : '')} data-ac="icon">
          <i className={'ti ' + icon}></i>
        </div>
        {' '}
        <h2 className="modal-title" data-ac="title">{title}</h2>
        {' '}
        <p className="modal-subtitle" data-ac="body">{body}</p>
        {' '}
        <div className="edit-modal-footer" style={{ justifyContent: 'center', gap: '14px' }} data-ac="actions">
          <button className="btn-cancel" onClick={onClose}>Go Back</button>
          {' '}
          <button className={confirmClass} onClick={onConfirm}>{confirmLabel}</button>
        </div>
        <ConfirmX onClick={onClose} />
      </div>
    </div>
  );
}
