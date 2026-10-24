import { CONFIG } from '../../../lib/config.js';
import { evaluationDeadline, evaluationDeadlineLabel } from '../../../lib/evaluation-deadline.js';
import { AttachmentList } from '../../../components/announcements/attachments.jsx';
import { ContentBody as Body } from '../../../components/announcements/SeeMore.jsx';

const initialsOf = (name, fallback) =>
  name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || fallback;
const postedDate = a => new Date(a.postedAt || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

export function AnnouncementCard({ a, isMentor, fromName, attachments, onViewAttachment, seeMore, onToggleSeeMore, comments }) {
  // Head Admin posts get their own label instead of being folded into Administrator's.
  const isHead = !isMentor && (a.posterRole || '').toLowerCase() === 'head';
  const rawTitle = a.title || 'Announcement';
  const secMatch = isMentor ? rawTitle.match(/^\[([^\]]+)\]/) : null;
  const title = rawTitle.replace(/^\[[^\]]+\]\s*/, '');
  const pinned = !!a.isPinned;
  const roleClass = isMentor ? 'role-mentor' : isHead ? 'role-head' : 'role-admin';
  const roleLabel = isMentor ? 'Mentor' : isHead ? 'Head Admin' : 'Administrator';
  return (
    <div className={`announce-card ${isMentor ? 'announce-card-mentor' : 'announce-card-admin'}${pinned ? ' announce-card--pinned' : ''}`} id={`announce-card-${a.announcementID}`}>
      {pinned ? <><div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div>{' '}</> : null}
      <div className="ann-card-top">
        <div className={'ann-avatar ' + (isMentor ? 'ann-avatar-teal' : 'ann-avatar-indigo')}>{initialsOf(fromName, isMentor ? 'MT' : 'AD')}</div>
        {' '}
        <div className="ann-card-info">
          <div className="ann-card-name">
            {fromName}{' '}
            <span className={'ann-role-badge ' + roleClass}>{roleLabel}</span>
            {secMatch ? <>{' '}<span className="ann-badge ann-badge-section">{secMatch[1]}</span></> : null}
          </div>
          {' '}
          <div className="ann-card-date">{postedDate(a)}</div>
        </div>
      </div>
      {' '}
      <div className="announce-title">{title}</div>
      {' '}
      <Body id={a.announcementID} html={a.content || ''} seeMore={seeMore} onToggle={onToggleSeeMore} />
      {' '}
      <AttachmentList items={attachments} onView={onViewAttachment} downloadPath="AnnouncementAttachments" />
      {' '}
      {comments}
    </div>
  );
}

export function EvaluationCard({ e, fromName, attachments, seeMore, onToggleSeeMore, submitted, proofPath, statusAvailable, uploading, error, onRetry, onUpload, onUndo }) {
  const uniqueId = `eval-${e.linkID}`;
  const now = new Date();
  const dl = evaluationDeadline(e.deadline);
  const isPast = dl ? dl <= now : false;
  const isSoon = !isPast && dl && (dl - now) < 3 * 24 * 60 * 60 * 1000;
  const pinned = !!e.isPinned;

  // Uploading the proof screenshot IS the submit action (the answers live on Google Forms).
  const submit = !statusAvailable
    ? <><span role="status">Submission status unavailable.</span><button type="button" className="eval-mark-btn" onClick={onRetry}>Retry</button></>
    : submitted
      ? <><span className="eval-submitted-badge"><i className="ti ti-check"></i> Submitted</span>
        {' '}{proofPath ? <><a className="eval-view-proof-link" href={CONFIG.getFileUrl(proofPath)} target="_blank" rel="noopener">View</a>{' '}</> : null}
        <button type="button" className="eval-unmark-btn" onClick={onUndo}>Undo</button></>
      : <><label className={'eval-mark-btn eval-upload-label' + (uploading ? ' is-uploading' : '')}>
          <i className="ti ti-upload"></i> Upload proof screenshot{' '}
          <input type="file" accept="image/*" hidden onChange={ev => onUpload(ev.target)} />
        </label>{' '}
        <div className="eval-upload-error" id={`eval-upload-err-${e.linkID}`}>{error}</div></>;

  return (
    <div className={'announce-card announce-card-evaluation' + (pinned ? ' announce-card--pinned' : '')} id={`announce-card-${uniqueId}`}>
      {pinned ? <><div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div>{' '}</> : null}
      <div className="ann-card-top">
        <div className="ann-avatar ann-avatar-amber">{initialsOf(fromName, 'AD')}</div>
        {' '}
        <div className="ann-card-info">
          <div className="ann-card-name">
            <span className="evaluation-author"><strong>{fromName}</strong></span>
            {' '}
            <span className="ann-role-badge role-admin">Administrator</span>
            {' '}
            <span className="ann-badge ann-badge-evaluation"><i className="ti ti-clipboard-check"></i> Evaluation</span>
          </div>
          {' '}
          <div className="ann-card-date">{postedDate(e)}</div>
        </div>
      </div>
      {' '}
      <div className="announce-title">{e.title || 'Evaluation'}</div>
      {' '}
      {e.description ? <><Body id={uniqueId} html={e.description} seeMore={seeMore} onToggle={onToggleSeeMore} />{' '}</> : null}
      <AttachmentList items={attachments} downloadPath="EvaluationAttachments" />
      {' '}
      <div className="eval-footer">
        {e.deadline ? <><span className={isPast ? 'eval-deadline eval-deadline-past' : isSoon ? 'eval-deadline eval-deadline-soon' : 'eval-deadline'}>
          <i className="ti ti-clock"></i>{` Due ${evaluationDeadlineLabel(e.deadline)}${isPast ? ' · Overdue' : ''}`}</span>{' '}</> : null}
        {isPast ? <><span className="eval-deadline-note">You can still upload proof after the deadline.</span>{' '}</> : null}
        <div className="eval-footer-actions">
          {submit}
          {' '}
          {isPast
            ? <span className="btn-open-form btn-open-form-closed">Open Form</span>
            : <a href={e.googleFormURL} target="_blank" rel="noopener noreferrer" className="btn-open-form"><i className="ti ti-external-link"></i> Open Form</a>}
        </div>
      </div>
    </div>
  );
}
