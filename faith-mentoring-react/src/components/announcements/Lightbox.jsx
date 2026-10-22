import { CONFIG } from '../../lib/config.js';
import { fileUrl } from './attachments.jsx';

// Attachment lightbox: images preview inline (falling back to "Preview not available" if the image
// fails), everything else offers Open File / Download. `state` = { attachment, failed } or null.
export default function Lightbox({ state, onClose, onFail }) {
  const a = state?.attachment;
  const downloadUrl = a ? `${CONFIG.API_BASE_URL}/AnnouncementAttachments/${a.attachmentID}/download` : '#';
  const isImage = a && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.fileName || '');
  const noPreview = (
    <div className="lightbox-no-preview">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      {' '}
      <p>Preview not available for this file type.</p>
      {' '}
      <a href={downloadUrl} target="_blank" rel="noopener" className="lightbox-open-btn">Open File</a>
    </div>
  );
  return (
    <div id="lightboxOverlay" className="lightbox-overlay" style={{ display: a ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title" id="lightboxTitle">{a ? (a.fileName || 'Attachment') : 'Attachment'}</span>
          {' '}
          <button className="lightbox-close" onClick={onClose}>&times;</button>
        </div>
        {' '}
        <div className="lightbox-body" id="lightboxBody">
          {a && (isImage && !state.failed
            ? <img src={fileUrl(a.filePath)} alt={a.fileName || 'Attachment'} onError={onFail} />
            : noPreview)}
        </div>
        {' '}
        <div className="lightbox-footer">
          <a className="lightbox-download" id="lightboxDownload" href={downloadUrl} style={{ display: a ? 'inline-flex' : 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            {' '}Download
          </a>
        </div>
      </div>
    </div>
  );
}
