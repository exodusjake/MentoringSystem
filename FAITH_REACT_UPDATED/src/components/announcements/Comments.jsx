import { useEffect, useRef, useState } from 'react';
import { showToast } from '../Notify.jsx';
import { apiRequest } from '../../lib/api.js';
import { escapeHtml, sanitizeHtml } from '../../lib/security-utils.js';
import { fmtMouseDown } from './richText.js';

// The inline "comments" strip under an announcement card (buildCommentsSection / loadCommentsInline / ... in the
// announcement scripts): collapsed comment count, first two comments, "View N more", add-comment bar with a small
// rich-text toolbar, and edit/delete for your own comments.
//   announcementId, currentUser, myInits, confirm(title, message, type, onConfirm)
//   variant 'classic' (Head / Admin: svg icons, "N comments") or 'class' (Mentor / Mentee: tabler icons, "N class
//   comments", a toast on every action)
export default function Comments({ announcementId, currentUser, myInits, confirm, variant = 'classic' }) {
  const cls = variant === 'class';
  const [comments, setComments] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [listOpen, setListOpen] = useState(false);       // the list starts collapsed behind the "N comments" button
  const [barOpen, setBarOpen] = useState(false);
  const [toolbar, setToolbar] = useState(false);
  const [sending, setSending] = useState(false);
  const [kebab, setKebab] = useState(null);
  const [editing, setEditing] = useState(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  async function load() {
    try {
      const data = await apiRequest(`AnnouncementComments/announcement/${announcementId}`, 'GET', null, true);
      setComments(data || []);
      setFailed(false);
    } catch (e) {
      setFailed(true);
    }
  }
  useEffect(() => { load(); }, [announcementId]);

  // a click anywhere closes an open comment menu
  useEffect(() => {
    if (kebab === null) return;
    const close = () => setKebab(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [kebab]);

  const total = comments ? comments.length : 0;
  const visible = comments ? (showAll ? comments : comments.slice(0, 2)) : [];
  const remaining = total - visible.length;

  function expandCommentBar() {
    setBarOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onBlur() {
    setTimeout(() => {
      const wrap = wrapRef.current;
      const input = inputRef.current;
      if (!wrap || wrap.contains(document.activeElement)) return;
      const content = input?.innerHTML?.trim();
      if (!content || content === '<br>') setBarOpen(false);
      setToolbar(false);
    }, 150);
  }

  function replyToComment(name) {
    if (!barOpen) setBarOpen(true);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.innerHTML = `<b>@${escapeHtml(name)}</b>&nbsp;`;
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
    setListOpen(true);
  }

  async function postComment() {
    const input = inputRef.current;
    const content = input?.innerHTML?.trim();
    if (!content || content === '<br>') return;

    setSending(true);
    try {
      await apiRequest('AnnouncementComments', 'POST', {
        AnnouncementID: announcementId,
        PostedByUserID: currentUser?.userID,
        Content:        content,
      }, true);
      input.innerHTML = '';
      setBarOpen(false);
      setShowAll(true);
      if (cls) showToast('Comment posted.', 'success');
      await load();
    } catch (e) {
      console.error('Post comment failed:', e);
      if (cls) showToast(e.message || 'Failed to post comment.');
    } finally {
      setSending(false);
    }
  }

  async function saveEditComment(commentId, el) {
    const content = el?.innerHTML?.trim();
    if (!content || content === '<br>') return;
    try {
      await apiRequest(`AnnouncementComments/${commentId}`, 'PUT', { Content: content }, true);
      setEditing(null);
      if (cls) showToast('Comment updated.', 'success');
      await load();
    } catch (e) { console.error('Edit comment failed:', e); if (cls) showToast(e.message || 'Failed to update comment.'); }
  }

  async function doDeleteComment(commentId) {
    try {
      await apiRequest(`AnnouncementComments/${commentId}`, 'DELETE', null, true);
      if (cls) showToast('Comment deleted.', 'success');
      await load();
    } catch (e) { console.error('Delete comment failed:', e); if (cls) showToast(e.message || 'Failed to delete comment.'); }
  }

  const renderComment = c => {
    const isMyComment = c.postedByUserID === currentUser?.userID;
    const initials = (((c.firstName || '')[0] || '') + ((c.lastName || '')[0] || '')).toUpperCase() || '?';
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'User';
    const time = new Date(c.postedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const isEditing = editing === c.commentID;
    return (
      <div className="comment-item" id={`citem-${c.commentID}`} key={c.commentID}>
        <div className="comment-avatar">{initials}</div>
        <div className="comment-bubble">
          <div className="comment-meta">
            <span className="comment-author">{name}</span>
            <span className="comment-time">{time}</span>
            {isMyComment ? (
              <div className="comment-kebab-wrap">
                <button className="comment-kebab-btn" onClick={e => { e.stopPropagation(); setKebab(kebab === c.commentID ? null : c.commentID); }}>
                  {cls ? <i className="ti ti-dots-vertical"></i> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>}
                </button>
                <div className={`comment-kebab-menu${kebab === c.commentID ? ' open' : ''}`} id={`ckebab-${c.commentID}`}>
                  <button onClick={() => { setKebab(null); setEditing(c.commentID); }}><i className="ti ti-pencil"></i> Edit</button>
                  <button className="ckebab-danger" onClick={() => {
                    setKebab(null);
                    confirm(cls ? 'Delete Comment?' : 'Delete Comment', 'Are you sure you want to delete this comment? This cannot be undone.', 'delete', () => doDeleteComment(c.commentID));
                  }}><i className="ti ti-trash"></i> Delete</button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="comment-text" id={`ctext-${c.commentID}`} style={isEditing ? { display: 'none' } : undefined}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }}></div>
          {isMyComment ? (
            <EditRow c={c} isEditing={isEditing} onCancel={() => setEditing(null)} onSave={el => saveEditComment(c.commentID, el)} />
          ) : null}
        </div>
        <div className="comment-reply-wrap">
          {cls ? (
            <button className="comment-reply-btn" data-tooltip={`Reply to ${name}`} aria-label={`Reply to ${name}`} onClick={() => replyToComment(name)}>
              <i className="ti ti-corner-up-left"></i>
            </button>
          ) : (
            <button className="comment-reply-btn" title={`Reply to ${name}`} onClick={() => replyToComment(name)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="card-comments">
      <button className="class-comments-toggle" id={`cctoggle-${announcementId}`} style={{ display: total > 0 ? '' : 'none' }}
        onClick={() => setListOpen(o => !o)}>
        {cls ? <i className="ti ti-messages"></i> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
        <span id={`cccount-${announcementId}`}>{total > 0 ? `${total} ${cls ? 'class comment' : 'comment'}${total !== 1 ? 's' : ''}` : ''}</span>
      </button>
      <div className="card-comments-list" id={`clist-${announcementId}`} style={{ display: listOpen ? '' : 'none' }}>
        {failed ? <div className="comments-empty">Failed to load comments.</div> : null}
        {!failed && total ? visible.map(renderComment) : null}
        {!failed && remaining > 0 ? (
          <button className="btn-view-more-comments" onClick={() => setShowAll(true)}>View {remaining} more comment{remaining !== 1 ? 's' : ''}</button>
        ) : null}
      </div>
      <button className="add-comment-trigger" id={`ctrigger-${announcementId}`} style={{ display: barOpen ? 'none' : '' }} onClick={expandCommentBar}>
        {cls ? <i className="ti ti-message"></i> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
        {cls ? ' ' : null}Add comment
      </button>
      <div className="add-comment-bar" id={`cbar-${announcementId}`} style={{ display: barOpen ? 'flex' : 'none' }}>
        <div className="add-comment-avatar">{myInits}</div>
        <div className={`rich-comment-wrap${toolbar ? ' toolbar-visible' : ''}`} id={`cwrap-${announcementId}`} ref={wrapRef}>
          <div className="add-comment-input" id={`cinput-${announcementId}`} ref={inputRef}
            contentEditable suppressContentEditableWarning data-placeholder="Add comment…"
            onFocus={() => setToolbar(true)} onBlur={onBlur}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); postComment(); } }}></div>
          <div className="comment-format-toolbar" id={`ctoolbar-${announcementId}`}>
            {cls ? (
              <>
                <button type="button" className="cfmt-btn" data-cmd="bold" data-tooltip="Bold" aria-label="Bold" onMouseDown={fmtMouseDown('bold')}><b>B</b></button>
                <button type="button" className="cfmt-btn" data-cmd="italic" data-tooltip="Italic" aria-label="Italic" onMouseDown={fmtMouseDown('italic')}><i>I</i></button>
                <button type="button" className="cfmt-btn" data-cmd="underline" data-tooltip="Underline" aria-label="Underline" onMouseDown={fmtMouseDown('underline')}><u>U</u></button>
                <button type="button" className="cfmt-btn" data-cmd="strikeThrough" data-tooltip="Strikethrough" aria-label="Strikethrough" onMouseDown={fmtMouseDown('strikeThrough')}><s>S</s></button>
                <span className="cfmt-sep"></span>
                <button type="button" className="cfmt-btn" data-cmd="insertUnorderedList" data-tooltip="Bullet list" aria-label="Bullet list" onMouseDown={fmtMouseDown('insertUnorderedList')}><i className="ti ti-list"></i></button>
              </>
            ) : (
              <>
                <button type="button" className="cfmt-btn" data-cmd="bold" onMouseDown={fmtMouseDown('bold')}><b>B</b></button>
                <button type="button" className="cfmt-btn" data-cmd="italic" onMouseDown={fmtMouseDown('italic')}><i>I</i></button>
                <button type="button" className="cfmt-btn" data-cmd="underline" onMouseDown={fmtMouseDown('underline')}><u>U</u></button>
                <button type="button" className="cfmt-btn" data-cmd="insertUnorderedList" onMouseDown={fmtMouseDown('insertUnorderedList')}>&#8226; List</button>
              </>
            )}
          </div>
        </div>
        <button className="btn-send-comment" id={`cbtn-${announcementId}`} disabled={sending}
          onMouseDown={e => e.preventDefault()} onClick={postComment}>
          {cls ? <i className="ti ti-send"></i> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
        </button>
      </div>
    </div>
  );
}

// The inline editor shown in place of a comment's text while editing it.
function EditRow({ c, isEditing, onCancel, onSave }) {
  const ref = useRef(null);
  useEffect(() => { if (isEditing) ref.current?.focus(); }, [isEditing]);
  return (
    <div className="comment-edit-row" id={`cedit-${c.commentID}`} style={isEditing ? undefined : { display: 'none' }}>
      <div className="comment-edit-input" id={`cedit-input-${c.commentID}`} contentEditable suppressContentEditableWarning ref={ref}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }}></div>
      <div className="comment-edit-actions">
        <button className="btn-cedit-cancel" onClick={onCancel}>Cancel</button>
        <button className="btn-cedit-save" onClick={() => onSave(ref.current)}>Save</button>
      </div>
    </div>
  );
}
