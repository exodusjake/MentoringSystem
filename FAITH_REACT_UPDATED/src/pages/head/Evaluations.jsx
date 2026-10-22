import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import AnnounceContent from '../../components/announcements/AnnounceContent.jsx';
import Overlay from '../../components/Overlay.jsx';
import ProofLightbox from '../../components/ProofLightbox.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { evaluationDeadline, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/evaluation-forms.html + HEAD/JS/evaluation-forms.js
// Head can see every posted evaluation form and who has self-reported submitting it, same data as Admin's page,
// but with no create/edit/delete/pin controls — Admin is the only one who posts these.

function fileUrl(path) {
  return CONFIG.API_BASE_URL.replace('/api', '') + path;
}

function attachIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'ti-photo';
  if (ext === 'pdf') return 'ti-file-type-pdf';
  if (['doc','docx'].includes(ext)) return 'ti-file-type-doc';
  if (['xls','xlsx'].includes(ext)) return 'ti-file-spreadsheet';
  if (['ppt','pptx'].includes(ext)) return 'ti-presentation';
  if (['zip','rar','7z'].includes(ext)) return 'ti-file-zip';
  return 'ti-paperclip';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HeadEvaluations() {
  useBackGuard();
  const [allForms, setAllForms] = useState([]);
  const [allEvalAttach, setAllEvalAttach] = useState([]);
  const [submissionSummary, setSubmissionSummary] = useState({});   // { [linkID]: { submittedCount, totalMentees } }
  const [state, setState] = useState('loading');
  const [detail, setDetail] = useState(null);                       // { title, rows: null (loading) | 'error' | [] }
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [formsData, attachData, summaryData] = await Promise.allSettled([
          apiRequest('EvaluationLinks',               'GET', null, true),
          apiRequest('EvaluationAttachments',         'GET', null, true),
          apiRequest('EvaluationSubmissions/summary', 'GET', null, true),
        ]);
        setAllForms(formsData.status === 'fulfilled' ? (formsData.value || []) : []);
        setAllEvalAttach(attachData.status === 'fulfilled' ? (attachData.value || []) : []);
        const summary = {};
        if (summaryData.status === 'fulfilled') {
          (summaryData.value || []).forEach(s => { summary[s.linkID] = s; });
        }
        setSubmissionSummary(summary);
        setState('ready');
      } catch (e) {
        console.error('Error loading evaluation forms:', e);
        setState('failed');
      }
    })();
  }, []);

  const sorted = [...allForms].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0;
    const pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const dA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const dB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    if (dA !== dB) return dB - dA;
    return (b.linkID || 0) - (a.linkID || 0);
  });

  // ── Submission detail (who has self-reported as submitted) ──
  async function openSubmissionDetail(linkId) {
    const form = allForms.find(f => f.linkID === linkId);
    setDetail({ title: form ? form.title : 'Submissions', rows: null });
    try {
      const rows = await apiRequest(`EvaluationSubmissions/${linkId}`, 'GET', null, true);
      setDetail(d => ({ ...d, rows: rows || [] }));
    } catch (e) {
      setDetail(d => ({ ...d, rows: 'error' }));
    }
  }

  let detailBody;
  if (!detail || detail.rows === null) detailBody = <div className="eval-empty"><i className="ti ti-loader-2"></i> Loading…</div>;
  else if (detail.rows === 'error') detailBody = <div className="eval-empty"><i className="ti ti-alert-circle"></i> Failed to load. Please try again.</div>;
  else if (!detail.rows.length) detailBody = <div className="eval-empty"><i className="ti ti-users"></i> No active mentees to show.</div>;
  else {
    detailBody = (
      <div className="submit-detail-list">
        {detail.rows.map((r, i) => {
          const name = `${r.firstName} ${r.lastName}`;
          const when = r.submittedAt
            ? new Date(r.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            : null;
          return (
            <div className={`submit-detail-row ${r.hasSubmitted ? 'is-done' : ''}`} key={i}>
              <div className="submit-detail-status">
                <i className={`ti ${r.hasSubmitted ? 'ti-circle-check-filled' : 'ti-circle-dashed'}`}></i>
              </div>
              <div className="submit-detail-name">
                <div>{name}</div>
                {r.studentNumber ? <div className="submit-detail-sub">{r.studentNumber}</div> : null}
              </div>
              <div className="submit-detail-meta">
                <div className="submit-detail-when">{r.hasSubmitted ? `Marked ${when}` : '—'}</div>
                {r.hasSubmitted && r.proofFilePath
                  ? <button type="button" className="submit-detail-proof-view" onClick={() => setLightbox({ filePath: r.proofFilePath, title: `Proof — ${name}`, downloadUrl: CONFIG.getFileUrl(r.proofFilePath), download: true })}><i className="ti ti-photo"></i> View</button>
                  : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const now = new Date();
  let list;
  if (state === 'loading') list = <div className="eval-loading"><span className="spinner"></span> Loading...</div>;
  else if (state === 'failed') list = <div className="eval-empty"><i className="ti ti-alert-circle"></i><p>Failed to load evaluation forms. Please refresh.</p></div>;
  else if (!sorted.length) list = <div className="eval-empty"><i className="ti ti-clipboard-off"></i><p>No evaluation forms posted yet.</p></div>;
  else {
    list = sorted.map(f => {
      const pinned = !!f.isPinned;
      const postedDate = f.postedAt
        ? new Date(f.postedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';
      const deadlineDate = evaluationDeadline(f.deadline);
      const isPast = deadlineDate && deadlineDate <= now;
      const isSoon = deadlineDate && !isPast && (deadlineDate - now) < 3 * 24 * 60 * 60 * 1000;
      const deadlineStr = evaluationDeadlineLabel(f.deadline);
      const description = f.description || '';
      // Self-reported count — mentees mark themselves as submitted (this system has no access to actual Google
      // Form responses), so treat this as a rough tally, not a verified one.
      const sub = submissionSummary[f.linkID] || { submittedCount: 0, totalMentees: 0 };
      const atts = allEvalAttach.filter(a => a.linkID === f.linkID);

      return (
        <div className={`announce-card announce-card--eval${pinned ? ' announce-card--pinned' : ''}`} key={f.linkID}>
          {pinned ? <div className="ann-pin-banner"><i className="ti ti-pinned"></i> Pinned</div> : null}
          <div className="ann-card-top">
            <div className="ann-avatar ann-avatar-amber"><i className="ti ti-clipboard-check"></i></div>
            <div className="ann-card-info">
              <div className="ann-card-name evaluation-author"><strong>{f.postedByName || 'Name unavailable'}</strong></div>
              <div className="ann-card-date">{postedDate}</div>
            </div>
            {deadlineStr ? (
              <span className={`eval-deadline-badge ${isPast ? 'past' : isSoon ? 'soon' : ''}`}>
                <i className="ti ti-clock"></i> Due {deadlineStr}{isPast ? ' · Overdue' : ''}
              </span>
            ) : null}
          </div>
          <div className="announce-title">{f.title}</div>
          {description ? <AnnounceContent html={description} id={`eval-content-${f.linkID}`} ariaControls={`eval-content-${f.linkID}`} /> : null}
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
          <div className="eval-form-footer">
            <button type="button" className="eval-submit-count-btn" onClick={() => openSubmissionDetail(f.linkID)} title="View who has marked this as submitted">
              <i className="ti ti-users"></i> {sub.submittedCount} / {sub.totalMentees} submitted
            </button>
            <a href={f.googleFormURL} target="_blank" rel="noopener" className="btn-open-form">
              <i className="ti ti-external-link"></i> Open Form
            </a>
          </div>
        </div>
      );
    });
  }

  return (
    <Page id="HEAD/evaluation-forms">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Evaluation Forms</h1>
            </div>
          </div>

          <div className="forms-section">
            <div className="forms-section-header">
              <h2>All Evaluation Forms</h2>
              <span className="eval-count" id="evalCount">{state === 'ready' ? `${sorted.length} result${sorted.length !== 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="forms-list" id="formsList">{list}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Submission detail modal — who has self-reported as submitted */}
      <Overlay open={!!detail} className="modal-overlay" activeClass="active" id="submitDetailOverlay"
        onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="submitDetailTitle">{detail?.title ?? 'Submissions'}</h3>
            <button className="modal-close" onClick={() => setDetail(null)}>&times;</button>
          </div>
          <p className="submit-detail-note">
            Each mentee uploads a screenshot as proof of submission — not cross-checked against the actual Google Form responses.
          </p>
          <div className="modal-body" id="submitDetailBody">{detailBody}</div>
        </div>
      </Overlay>

      {/* Proof screenshot lightbox — same pattern as Sessions' proof viewer */}
      <ProofLightbox proof={lightbox} onClose={() => setLightbox(null)} />
    </Page>
  );
}
