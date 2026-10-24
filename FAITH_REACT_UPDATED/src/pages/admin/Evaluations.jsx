import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import AnnounceContent from '../../components/announcements/AnnounceContent.jsx';
import DateInput from '../../components/DateInput.jsx';
import { ConfirmModal, ErrorModal } from '../../components/InfoModal.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import ProofLightbox from '../../components/ProofLightbox.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { evaluationDeadline, evaluationDeadlineInput, evaluationDeadlineLabel } from '../../lib/evaluation-deadline.js';
import { sanitizeHtml } from '../../lib/security-utils.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// ADMIN_/HTML/evaluation-forms.html + ADMIN_/JS/evaluation-forms.js

const MAX_ATTACHMENTS = 5;

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

// evalFormatDoc / updateEvalFormatButtons: execCommand on the focused instructions editor, highlighting the
// toolbar buttons for the current selection.
function updateEvalFormatButtons() {
  const wrap = document.querySelector('.rich-editor-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('.rfmt-btn[data-cmd]').forEach(btn => {
    try { btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd)); } catch (e) {}
  });
}
const evalFmt = cmd => e => { e.preventDefault(); document.execCommand(cmd, false, null); updateEvalFormatButtons(); };

export default function AdminEvaluations() {
  useBackGuard();
  const [allForms, setAllForms] = useState([]);
  const [allEvalAttach, setAllEvalAttach] = useState([]);
  const [submissionSummary, setSubmissionSummary] = useState({});
  const [state, setState] = useState('loading');
  const [openKebab, setOpenKebab] = useState(null);
  const [detail, setDetail] = useState(null);                // { title, rows: null | 'error' | [] }
  const [lightbox, setLightbox] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // create / edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [initialDesc, setInitialDesc] = useState('');
  const [fieldTitle, setFieldTitle] = useState('');
  const [fieldUrl, setFieldUrl] = useState('');
  const [fieldDeadline, setFieldDeadline] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const editingRef = useRef(null);                           // editingId as the save handler last saw it
  const pendingRef = useRef([]);
  const formsRef = useRef([]);
  editingRef.current = editingId;
  pendingRef.current = pendingFiles;
  formsRef.current = allForms;

  async function loadForms() {
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
      setErrorMsg('Failed to load evaluation forms. Please refresh.');
    }
  }
  useEffect(() => { loadForms(); }, []);

  // a click anywhere closes an open card menu
  useEffect(() => {
    if (openKebab === null) return;
    const close = () => setOpenKebab(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openKebab]);

  // the instructions editor starts with the form's description
  useEffect(() => { if (modalOpen && editorRef.current) editorRef.current.innerHTML = initialDesc; }, [modalOpen]);

  useEffect(() => {
    const onSel = () => { if (document.activeElement?.id === 'fieldDesc') updateEvalFormatButtons(); };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const showConfirmModal = (title, message, type, onConfirm) => setConfirmDlg({ title, message, type, onConfirm });

  const sorted = [...allForms].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0;
    const pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const dA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const dB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    if (dA !== dB) return dB - dA;
    return (b.linkID || 0) - (a.linkID || 0);
  });

  async function togglePin(id) {
    setOpenKebab(null);
    const wasPinned = !!allForms.find(x => x.linkID === id)?.isPinned;
    try {
      await apiRequest(`EvaluationLinks/${id}/pin`, 'PATCH', null, true);
      await loadForms();
      showToast(wasPinned ? 'Evaluation form unpinned.' : 'Evaluation form pinned.', 'success');
    } catch (e) {
      setErrorMsg('Failed to update pin status. Please try again.');
    }
  }

  function openCreate() {
    setEditingId(null);
    setPendingFiles([]);
    setFieldTitle(''); setFieldUrl(''); setFieldDeadline('');
    setInitialDesc('');
    setModalOpen(true);
  }
  function openEdit(id) {
    setOpenKebab(null);
    const f = allForms.find(x => x.linkID === id);
    if (!f) return;
    setEditingId(id);
    setPendingFiles([]);
    setFieldTitle(f.title);
    setFieldUrl(f.googleFormURL);
    setFieldDeadline(evaluationDeadlineInput(f.deadline));
    setInitialDesc(sanitizeHtml(f.description || ''));
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditingId(null); }

  // ── Submission detail ──
  async function openSubmissionDetail(linkId) {
    setOpenKebab(null);
    const form = allForms.find(f => f.linkID === linkId);
    setDetail({ title: form ? form.title : 'Submissions', rows: null });
    try {
      const rows = await apiRequest(`EvaluationSubmissions/${linkId}`, 'GET', null, true);
      setDetail(d => ({ ...d, rows: rows || [] }));
    } catch (e) {
      setDetail(d => ({ ...d, rows: 'error' }));
    }
  }

  // ── Save ──
  function saveForm() {
    const title = fieldTitle.trim();
    const url = fieldUrl.trim();
    if (!title) { setErrorMsg('Please enter an evaluation title.'); return; }
    if (!url)   { setErrorMsg('Please enter the Google Form link.'); return; }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      setErrorMsg('Please enter a valid http:// or https:// form link.'); return;
    }
    if (fieldDeadline && !evaluationDeadline(fieldDeadline)) {
      setErrorMsg('Please enter a valid deadline date and time.'); return;
    }

    const isEdit = editingId !== null;
    showConfirmModal(
      isEdit ? 'Update Evaluation Form' : 'Add Evaluation Form',
      isEdit ? 'Save changes to this evaluation form?' : 'Make this evaluation form available to mentees?',
      'save',
      doSaveForm
    );
  }

  async function doSaveForm() {
    const title = fieldTitle.trim();
    const desc = editorRef.current.innerHTML.trim();
    const url = fieldUrl.trim();
    const deadline = fieldDeadline || null;
    const session = getSession();
    const userId = session?.user?.UserID || session?.user?.userID || 0;
    const currentEditingId = editingRef.current;

    setSaving(true);
    try {
      let linkID = currentEditingId;

      if (currentEditingId) {
        const existing = formsRef.current.find(x => x.linkID === currentEditingId);
        await apiRequest(`EvaluationLinks/${currentEditingId}`, 'PUT', {
          linkID:         currentEditingId,
          postedByUserID: existing?.postedByUserID || userId,
          title,
          description:    desc || null,
          googleFormURL:  url,
          targetRole:     'Mentee',
          deadline,
          postedAt:       existing?.postedAt || new Date().toISOString(),
          isActive:       true,
          isPinned:       existing?.isPinned || false,
        }, true);
      } else {
        const res = await apiRequest('EvaluationLinks', 'POST', {
          postedByUserID: userId,
          title,
          description:    desc || null,
          googleFormURL:  url,
          targetRole:     'Mentee',
          deadline,
          isActive:       true,
          isPinned:       false,
        }, true);
        linkID = res?.linkID;
        // If an attachment fails, retry updates this form instead of creating a duplicate.
        if (linkID) {
          setEditingId(linkID);
          editingRef.current = linkID;
          const created = { linkID, postedByUserID: userId, title, description: desc || null,
            googleFormURL: url, deadline, postedAt: new Date().toISOString(), isPinned: false };
          formsRef.current = [...formsRef.current, created];
          setAllForms(formsRef.current);
        }
      }

      // Upload pending file attachments
      if (pendingRef.current.length > 0 && linkID) {
        while (pendingRef.current.length) {
          const file = pendingRef.current[0];
          const fd = new FormData();
          fd.append('linkId', linkID);
          fd.append('file', file);
          await apiRequest('EvaluationAttachments/upload', 'POST', fd, true);
          pendingRef.current = pendingRef.current.slice(1);
          setPendingFiles(pendingRef.current);
        }
        pendingRef.current = [];
        setPendingFiles([]);
      }

      closeModal();
      await loadForms();
      showToast(currentEditingId ? 'Evaluation form updated.' : 'Evaluation form added.', 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save form. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function askDelete(id) {
    setOpenKebab(null);
    showConfirmModal(
      'Delete Form Link',
      'Delete this evaluation form? This cannot be undone.',
      'delete',
      async () => {
        try {
          await apiRequest(`EvaluationLinks/${id}`, 'DELETE', null, true);
          await loadForms();
          showToast('Evaluation form deleted.', 'success');
        } catch (err) {
          setErrorMsg('Failed to delete form link. Please try again.');
        }
      }
    );
  }

  // ── Attachments ──
  const existingAtts = editingId ? allEvalAttach.filter(a => a.linkID === editingId) : [];
  function triggerEvalAttachFile() {
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }
  function handleEvalAttachFiles(e) {
    const room = MAX_ATTACHMENTS - existingAtts.length - pendingFiles.length;
    const files = Array.from(e.target.files || []);
    if (room <= 0) {
      showToast(`Maximum ${MAX_ATTACHMENTS} attachments per post.`, 'error');
      return;
    }
    if (files.length > room) {
      showToast(`Only ${room} more file${room === 1 ? '' : 's'} added — maximum ${MAX_ATTACHMENTS} attachments per post.`, 'info');
    }
    setPendingFiles(p => [...p, ...files.slice(0, room)]);
  }
  function deleteExistingEvalAttach(attachmentID) {
    showConfirmModal(
      'Remove Attachment',
      'Remove this attachment? This cannot be undone.',
      'delete',
      async () => {
        try {
          await apiRequest(`EvaluationAttachments/${attachmentID}`, 'DELETE', null, true);
          setAllEvalAttach(list => list.filter(a => a.attachmentID !== attachmentID));
        } catch (e) { console.error('Delete attachment failed', e); }
      }
    );
  }

  // ── Submission detail body ──
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

  // ── List ──
  const now = new Date();
  const myId = getSession()?.user?.UserID || getSession()?.user?.userID || 0;
  let list;
  if (state === 'loading') list = <div className="eval-loading"><span className="spinner"></span> Loading...</div>;
  else if (!sorted.length) list = <div className="eval-empty"><i className="ti ti-clipboard-off"></i><p>No evaluation forms yet. Click <strong>Add Evaluation Form</strong> to get started.</p></div>;
  else {
    list = sorted.map(f => {
      const pinned = !!f.isPinned;
      const isMine = f.postedByUserID === myId;
      const postedDate = f.postedAt
        ? new Date(f.postedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';
      const deadlineDate = evaluationDeadline(f.deadline);
      const isPast = deadlineDate && deadlineDate <= now;
      const isSoon = deadlineDate && !isPast && (deadlineDate - now) < 3 * 24 * 60 * 60 * 1000;
      const deadlineStr = evaluationDeadlineLabel(f.deadline);
      const description = f.description || '';
      const sub = submissionSummary[f.linkID] || { submittedCount: 0, totalMentees: 0 };
      const atts = allEvalAttach.filter(a => a.linkID === f.linkID);
      const id = f.linkID;

      return (
        <div className={`announce-card announce-card--eval${pinned ? ' announce-card--pinned' : ''}`} key={id}>
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
            <div className="ann-kebab-wrap">
              {isMine ? (
                <>
                  <button className="ann-kebab-btn" onClick={e => { e.stopPropagation(); setOpenKebab(openKebab === id ? null : id); }}>
                    <i className="ti ti-dots-vertical"></i>
                  </button>
                  <div className={`ann-kebab-menu${openKebab === id ? ' open' : ''}`} id={`kebab-${id}`}>
                    <button className={`kebab-pin${pinned ? ' active' : ''}`} onClick={() => togglePin(id)}>
                      <i className={`ti ${pinned ? 'ti-pinned-off' : 'ti-pin'}`}></i> {pinned ? 'Unpin' : 'Pin to top'}
                    </button>
                    <button onClick={() => openEdit(id)}>
                      <i className="ti ti-pencil"></i> Edit
                    </button>
                    <button className="kebab-danger" onClick={() => askDelete(id)}>
                      <i className="ti ti-trash"></i> Delete
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="announce-title">{f.title}</div>
          {description ? <AnnounceContent html={description} id={`eval-content-${id}`} ariaControls={`eval-content-${id}`} /> : null}
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
            <button type="button" className="eval-submit-count-btn" onClick={() => openSubmissionDetail(id)} title="View who has marked this as submitted">
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
    <Page id="ADMIN_/evaluation-forms">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Evaluation Forms</h1>
            </div>
            <button className="btn-primary" id="createFormBtn" onClick={openCreate}>
              <i className="ti ti-plus"></i> Add Evaluation Form
            </button>
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

      {/* Create / Edit Modal */}
      <Overlay open={modalOpen} className="modal-overlay" activeClass="active" id="modalOverlay"
        onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="modalTitle">{editingId !== null ? 'Edit Evaluation Form' : 'Add Evaluation Form'}</h3>
            <button className="modal-close" id="modalClose" onClick={closeModal}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label>Evaluation Title <span className="req">*</span></label>
              <input type="text" id="fieldTitle" placeholder="Example: End-of-Semester Mentoring Evaluation" autoComplete="off" value={fieldTitle} onChange={e => setFieldTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Instructions <span style={{ fontWeight: 400, color: '#64748b' }}>(optional)</span></label>
              <div className="rich-editor-wrap">
                <div className="rich-editor-body" id="fieldDesc" contentEditable suppressContentEditableWarning ref={editorRef}
                  data-placeholder="Provide instructions for completing the evaluation and submitting proof."></div>
                <div className="rich-editor-toolbar">
                  <button type="button" className="rfmt-btn" data-cmd="bold" onMouseDown={evalFmt('bold')}><b>B</b></button>
                  <button type="button" className="rfmt-btn" data-cmd="italic" onMouseDown={evalFmt('italic')}><i>I</i></button>
                  <button type="button" className="rfmt-btn" data-cmd="underline" onMouseDown={evalFmt('underline')}><u>U</u></button>
                  <button type="button" className="rfmt-btn" data-cmd="strikeThrough" onMouseDown={evalFmt('strikeThrough')}><s>S</s></button>
                  <span className="rfmt-sep"></span>
                  <button type="button" className="rfmt-btn" data-cmd="insertUnorderedList" onMouseDown={evalFmt('insertUnorderedList')}><i className="ti ti-list"></i></button>
                  <span className="rfmt-sep"></span>
                  <button type="button" className="rfmt-btn" title="Attach file" onClick={triggerEvalAttachFile}><i className="ti ti-paperclip"></i></button>
                  <input type="file" id="evalAttachFileInput" multiple ref={fileInputRef}
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                    style={{ display: 'none' }} onChange={handleEvalAttachFiles} />
                </div>
              </div>
              <div id="evalAttachList" className="attach-list">
                {existingAtts.map(att => (
                  <div className="attach-item" key={att.attachmentID}>
                    <i className={`ti ${attachIcon(att.fileName)} attach-icon`}></i>
                    <a className="attach-name" href={fileUrl(att.filePath)} target="_blank" rel="noopener">{att.fileName}</a>
                    <span className="attach-size">{formatFileSize(att.fileSize)}</span>
                    <button className="attach-remove" title="Remove" onClick={() => deleteExistingEvalAttach(att.attachmentID)}>×</button>
                  </div>
                ))}
                {pendingFiles.map((f, i) => (
                  <div className="attach-item" key={`p${i}`}>
                    <i className={`ti ${attachIcon(f.name)} attach-icon`}></i>
                    <span className="attach-name">{f.name}</span>
                    <span className="attach-size">{formatFileSize(f.size)}</span>
                    <button className="attach-remove" title="Remove" onClick={() => setPendingFiles(p => p.filter((_, k) => k !== i))}>×</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Google Form Link <span className="req">*</span></label>
              <input type="url" id="fieldUrl" placeholder="https://forms.gle/..." autoComplete="off" value={fieldUrl} onChange={e => setFieldUrl(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Evaluation Deadline <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
              <DateInput type="datetime-local" id="fieldDeadline" value={fieldDeadline} onChange={e => setFieldDeadline(e.target.value)} />
              <small>Specify when access to the form closes in this portal. Leave blank if no deadline applies.</small>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" id="modalCancel" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" id="modalSave" onClick={saveForm} disabled={saving}>
              {saving ? 'Saving...' : (editingId !== null ? 'Save Changes' : 'Add Evaluation Form')}
            </button>
          </div>
        </div>
      </Overlay>

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

      <ProofLightbox proof={lightbox} onClose={() => setLightbox(null)} />
      <ConfirmModal confirm={confirmDlg} onClose={() => setConfirmDlg(null)} />
      <ErrorModal message={errorMsg} onClose={() => setErrorMsg(null)} />
    </Page>
  );
}
