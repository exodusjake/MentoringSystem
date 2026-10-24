import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';

// "Update Signature" modal on the profile pages: PNG with a transparent background (max 5 MB),
// saved only after the consent box is ticked. `onSaved(path)` receives the new signature path.
// `icon`: the mentee page's modal has a signature icon above the title; the mentor's doesn't.
export default function SignatureModal({ open, onClose, userId, privacy, consent, onSaved, icon = true }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFile(null); setPreview(null); setAgree(false); setError('');
    if (input.current) input.current.value = '';
  }, [open]);

  function handleFile(f) {
    // PNG only — a signature prints small, over a line, so it needs a transparent background.
    if (f.type !== 'image/png') { setError('Please upload a PNG file with a transparent background.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('File too large. Maximum 5 MB.'); return; }
    setFile(f);
    setError('');
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }

  async function save() {
    if (!file || !agree) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiRequest(`ESignature/${userId}`, 'POST', form, true);
      if (res?.signatureFilePath) onSaved(res.signatureFilePath);
      onClose();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="sigModal" className={'modal-overlay' + (open ? ' open' : '')} style={{ display: open ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="ti ti-x"></i>
        </button>
        {' '}
        {icon && <><div className="confirm-icon">
          <i className="ti ti-signature"></i>
        </div>
        {' '}</>}
        <h2 className="modal-title">Update Signature</h2>
        {' '}
        <p className="modal-subtitle">Upload a clear PNG of your handwritten signature with a transparent background.</p>
        {' '}
        <div id="sigModalError" className="edit-error" style={{ display: error ? 'block' : 'none' }}>{error}</div>
        {' '}
        <label className={'sig-dz' + (dragOver ? ' drag-over' : '')} id="sigDz"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}>
          <input type="file" id="sigFileInput" accept="image/png" className="sig-dz-input" ref={input}
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
          {' '}
          <div id="sigDzIdle" className="sig-dz-idle" style={preview ? { display: 'none' } : undefined}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            {' '}
            <span className="sig-dz-main">Click or drag image here</span>
            {' '}
            <span className="sig-dz-hint">PNG with transparent background — max 5 MB</span>
          </div>
          {' '}
          <img id="sigDzPreview" className="sig-dz-preview" src={preview || undefined} alt="Preview" style={{ display: preview ? 'block' : 'none' }} />
        </label>
        {' '}
        <div className="setup-privacy-notice">
          <svg className="pn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          {' '}
          <p>
            <strong>Privacy Notice.</strong>
            {' '}{privacy}
          </p>
        </div>
        {' '}
        <label className="setup-consent">
          <input type="checkbox" id="sigConsentModal" checked={agree} onChange={e => setAgree(e.target.checked)} />
          {' '}
          <span>{consent}</span>
        </label>
        {' '}
        <div className="edit-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          {' '}
          <button className="btn-save" id="btnSaveSig" disabled={saving || !(file && agree)} onClick={save}>{saving ? 'Saving…' : 'Save Signature'}</button>
        </div>
      </div>
    </div>
  );
}
