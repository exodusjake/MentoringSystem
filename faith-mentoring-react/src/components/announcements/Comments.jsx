import { useRef, useState } from 'react';
import { sanitizeHtml } from '../../lib/security-utils.js';

// Class comments under an announcement card: a collapsible list (first two, then "View N more"),
// the rich-text "Add comment" bar with its format toolbar, replies, and edit/delete for one's own.
export default function Comments({ annId, data, me, initials, openKebab, setOpenKebab, activeFormats, onPost, onSaveEdit, onDelete, onShowAll }) {
  const [listShown, setListShown] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(null);         // commentID being edited
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const comments = data?.state === 'ok' ? data.list : [];
  const total = comments.length;
  const visible = data?.showAll ? comments : comments.slice(0, 2);
  const remaining = total - visible.length;

  function expand() {
    setBarOpen(true);
    setTimeout(() => inputRef.current?.focus());
  }

  function onBlur() {
    setTimeout(() => {
      const wrap = wrapRef.current;
      if (!wrap || wrap.contains(document.activeElement)) return;
      setToolbarVisible(false);
      const content = inputRef.current?.innerHTML?.trim();
      if (!content || content === '<br>') setBarOpen(false);
    }, 150);
  }

  async function post() {
    const content = (inputRef.current?.innerHTML || '').trim();
    if (!content || content === '<br>') return;
    setPosting(true);
    const ok = await onPost(content);
    setPosting(false);
    if (ok) {
      inputRef.current.innerHTML = '';
      setToolbarVisible(false);
      setBarOpen(false);
    }
  }

  function reply(name) {
    setBarOpen(true);
    setListShown(true);
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
    });
  }

  const fmt = (cmd, label, inner) => (
    <button type="button" className={'cfmt-btn' + (activeFormats.has(cmd) ? ' fmt-active' : '')} data-cmd={cmd} data-tooltip={label} aria-label={label}
      onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false, null); document.dispatchEvent(new Event('selectionchange')); }}>{inner}</button>
  );

  return (
    <div className="card-comments">
      <button className="class-comments-toggle" id={`cctoggle-${annId}`} style={total > 0 ? undefined : { display: 'none' }}
        onClick={() => setListShown(s => !s)}>
        <i className="ti ti-messages"></i>
        {' '}
        <span id={`cccount-${annId}`}>{data?.state === 'ok' ? `${total} class comment${total !== 1 ? 's' : ''}` : ''}</span>
      </button>
      {' '}
      <div className="card-comments-list" id={`clist-${annId}`} style={listShown ? undefined : { display: 'none' }}>
        {data?.state === 'error' && <div className="comments-empty">Failed to load comments.</div>}
        {visible.map(c => (
          <CommentItem key={c.commentID} c={c} mine={c.postedByUserID === me} kebabOpen={openKebab === c.commentID}
            editing={editing === c.commentID}
            onKebab={e => { e.stopPropagation(); setOpenKebab(openKebab === c.commentID ? null : c.commentID); }}
            onEdit={() => { setOpenKebab(null); setEditing(c.commentID); }}
            onCancelEdit={() => setEditing(null)}
            // A successful save reloads the thread, which closes the edit row.
            onSaveEdit={async html => { if (await onSaveEdit(c.commentID, html)) setEditing(null); }}
            onDelete={() => { setOpenKebab(null); onDelete(c.commentID); }}
            // (The original's inline onclick broke on names with an apostrophe — Reply did nothing.)
            onReply={() => reply(`${c.firstName || ''} ${c.lastName || ''}`.trim() || 'User')} />
        ))}
        {remaining > 0 && (
          <button className="btn-view-more-comments" onClick={onShowAll}>
            View {remaining} more comment{remaining !== 1 ? 's' : ''}
          </button>
        )}
      </div>
      {' '}
      <button className="add-comment-trigger" id={`ctrigger-${annId}`} style={barOpen ? { display: 'none' } : undefined} onClick={expand}>
        <i className="ti ti-message"></i> Add comment
      </button>
      {' '}
      <div className="add-comment-bar" id={`cbar-${annId}`} style={{ display: barOpen ? 'flex' : 'none' }}>
        <div className="add-comment-avatar">{initials}</div>
        {' '}
        <div className={'rich-comment-wrap' + (toolbarVisible ? ' toolbar-visible' : '')} id={`cwrap-${annId}`} ref={wrapRef}>
          <div className="add-comment-input" id={`cinput-${annId}`} ref={inputRef} contentEditable="true" suppressContentEditableWarning
            data-placeholder="Add comment…" onFocus={() => setToolbarVisible(true)} onBlur={onBlur}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); post(); } }}></div>
          {' '}
          <div className="comment-format-toolbar" id={`ctoolbar-${annId}`}>
            {fmt('bold', 'Bold', <b>B</b>)}
            {' '}
            {fmt('italic', 'Italic', <i>I</i>)}
            {' '}
            {fmt('underline', 'Underline', <u>U</u>)}
            {' '}
            {fmt('strikeThrough', 'Strikethrough', <s>S</s>)}
            {' '}
            <span className="cfmt-sep"></span>
            {' '}
            {fmt('insertUnorderedList', 'Bullet list', <i className="ti ti-list"></i>)}
          </div>
        </div>
        {' '}
        <button className="btn-send-comment" id={`cbtn-${annId}`} disabled={posting} onMouseDown={e => e.preventDefault()} onClick={post}>
          <i className="ti ti-send"></i>
        </button>
      </div>
    </div>
  );
}

function CommentItem({ c, mine, kebabOpen, editing, onKebab, onEdit, onCancelEdit, onSaveEdit, onDelete, onReply }) {
  const editRef = useRef(null);
  const initials = (((c.firstName || '')[0] || '') + ((c.lastName || '')[0] || '')).toUpperCase() || '?';
  const name = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'User';
  const time = new Date(c.postedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="comment-item" id={`citem-${c.commentID}`}>
      <div className="comment-avatar">{initials}</div>
      {' '}
      <div className="comment-bubble">
        <div className="comment-meta">
          <span className="comment-author">{name}</span>
          {' '}
          <span className="comment-time">{time}</span>
          {mine && <>{' '}
            <div className="comment-kebab-wrap">
              <button className="comment-kebab-btn" onClick={onKebab}>
                <i className="ti ti-dots-vertical"></i>
              </button>
              {' '}
              <div className={'comment-kebab-menu' + (kebabOpen ? ' open' : '')} id={`ckebab-${c.commentID}`}>
                <button onClick={() => { onEdit(); setTimeout(() => editRef.current?.focus()); }}>
                  <i className="ti ti-pencil"></i> Edit
                </button>
                {' '}
                <button className="ckebab-danger" onClick={onDelete}>
                  <i className="ti ti-trash"></i> Delete
                </button>
              </div>
            </div></>}
        </div>
        {' '}
        <div className="comment-text" id={`ctext-${c.commentID}`} style={editing ? { display: 'none' } : undefined}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }} />
        {mine && <>{' '}
          <div className="comment-edit-row" id={`cedit-${c.commentID}`} style={editing ? undefined : { display: 'none' }}>
            <div className="comment-edit-input" id={`cedit-input-${c.commentID}`} contentEditable="true" suppressContentEditableWarning ref={editRef}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }} />
            {' '}
            <div className="comment-edit-actions">
              <button className="btn-cedit-cancel" onClick={onCancelEdit}>Cancel</button>
              {' '}
              <button className="btn-cedit-save" onClick={() => {
                const html = editRef.current?.innerHTML?.trim();
                if (html && html !== '<br>') onSaveEdit(html);
              }}>Save</button>
            </div>
          </div></>}
      </div>
      {' '}
      <div className="comment-reply-wrap">
        <button className="comment-reply-btn" data-tooltip={`Reply to ${name}`} aria-label={`Reply to ${name}`} onClick={onReply}>
          <i className="ti ti-corner-up-left"></i>
        </button>
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
