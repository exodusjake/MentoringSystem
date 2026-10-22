import { useEffect, useState } from 'react';
import Overlay from '../Overlay.jsx';
import { CONFIG } from '../../lib/config.js';
import { fileUrl } from '../../lib/attachments.js';

// The announcement attachment lightbox (#lightboxOverlay in the announcement pages): images inline, anything
// else a "Preview not available" panel with an Open File link. `attachment` is the row being viewed, or null.
export default function AttachmentLightbox({ attachment, onClose }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [attachment?.attachmentID]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const a = attachment;
  const downloadUrl = a ? `${CONFIG.API_BASE_URL}/AnnouncementAttachments/${a.attachmentID}/download` : '#';
  const isImage = a ? /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.fileName || '') : false;

  return (
    <Overlay open={!!a} className="lightbox-overlay" activeClass={null} display="flex" id="lightboxOverlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title" id="lightboxTitle">{a ? (a.fileName || 'Attachment') : 'Attachment'}</span>
          <button className="lightbox-close" onClick={() => onClose()}>&times;</button>
        </div>
        <div className="lightbox-body" id="lightboxBody">
          {a && isImage && !imgFailed
            ? <img src={fileUrl(a.filePath)} alt={a.fileName || 'Attachment'} onError={() => setImgFailed(true)} />
            : a ? (
              <div className="lightbox-no-preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <p>Preview not available for this file type.</p>
                <a href={downloadUrl} target="_blank" rel="noopener" className="lightbox-open-btn">Open File</a>
              </div>
            ) : null}
        </div>
        <div className="lightbox-footer">
          <a className="lightbox-download" id="lightboxDownload" href={downloadUrl} style={{ display: a ? 'inline-flex' : 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download
          </a>
        </div>
      </div>
    </Overlay>
  );
}
