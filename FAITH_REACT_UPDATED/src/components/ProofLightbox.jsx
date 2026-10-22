import { useEffect, useState } from 'react';
import Overlay from './Overlay.jsx';
import { CONFIG } from '../lib/config.js';

// The proof lightbox shared by Proof Tracking, Head/Admin mentor detail and the evaluation pages
// (#lightboxOverlay in the vanilla markup).
//   proof = { filePath, fileType, title, downloadUrl?, download? }             one photo / file
//         | { sources: [{ filePath, fileType, label }], title }                 thumbnail gallery (2+ proofs)
//         | null when closed.
//   onSelect(photo) is called when a gallery thumbnail is clicked (the page then opens that single photo).
export default function ProofLightbox({ proof, onClose, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => { setImgFailed(false); }, [proof?.filePath]);

  const gallery = !!proof?.sources;
  const filePath = proof?.filePath;
  const downloadUrl = filePath ? (proof.downloadUrl || CONFIG.getUrl('ProofOfSession/download?path=' + encodeURIComponent(filePath))) : '#';
  const fullUrl = filePath ? CONFIG.getFileUrl(filePath) : '';
  const isImage = filePath ? (/image/i.test(proof.fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filePath)) : false;

  return (
    <Overlay open={!!proof} className="lightbox-overlay" activeClass={null} display="flex" id="lightboxOverlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-title" id="lightboxTitle">{proof?.title ?? 'Proof of Session'}</span>
          <button className="lightbox-close" onClick={() => onClose()}>&times;</button>
        </div>
        <div className="lightbox-body" id="lightboxBody">
          {gallery ? (
            <div className="proof-gallery-grid">
              {proof.sources.map((p, i) => <GalleryItem key={i} p={p} onClick={() => onSelect?.({ filePath: p.filePath, fileType: p.fileType || '', title: (proof.title || 'Session Proof') + (p.label ? ' — ' + p.label : '') })} />)}
            </div>
          ) : proof && isImage && !imgFailed
            ? <img src={fullUrl} alt="Proof of session" onError={() => setImgFailed(true)} />
            : proof ? <NoPreview url={fullUrl} /> : null}
        </div>
        <div className="lightbox-footer">
          <a className="lightbox-download" id="lightboxDownload" href={downloadUrl} download={proof?.download ? '' : undefined} style={{ display: proof && !gallery ? 'inline-flex' : 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download
          </a>
        </div>
      </div>
    </Overlay>
  );
}

function GalleryItem({ p, onClick }) {
  const [failed, setFailed] = useState(false);
  const isImage = /image/i.test(p.fileType || '') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(p.filePath);
  const showImg = isImage && !failed;
  return (
    <button type="button" className="proof-gallery-item" onClick={onClick}>
      {showImg ? <img src={CONFIG.getFileUrl(p.filePath)} alt={p.label || 'Proof'} onError={() => setFailed(true)} /> : null}
      <div className="proof-gallery-item-icon" style={showImg ? { display: 'none' } : undefined}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      </div>
      {p.label ? <span className="proof-gallery-item-label">{p.label}</span> : null}
    </button>
  );
}

function NoPreview({ url }) {
  return (
    <div className="lightbox-no-preview">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      <p>Preview not available for this file type.</p>
      <a href={url} target="_blank" rel="noopener" className="lightbox-open-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
        Open File
      </a>
    </div>
  );
}
