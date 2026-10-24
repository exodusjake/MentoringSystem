import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { apiRequest } from '../../lib/api.js';
import { clearSession, getSession } from '../../lib/session.js';

// First-login signature upload (the four */HTML/setup.html pages + setup.js). The page is only
// for a signed-in account that still owes its signature; afterwards it goes to the dashboard.
export const SETUP_TEXT = {
  logsheets: {
    sub: 'Your signature is used on session logsheets. Please upload a clear PNG with a transparent background.',
    consent: 'I confirm this is my own signature and I authorize its use on my mentoring session logsheets, and I have read and agree to the Privacy Notice above.',
  },
  documents: {
    sub: 'Your signature is used on your generated documents. Please upload a clear PNG with a transparent background.',
    consent: 'I confirm this is my own signature and I authorize its use on my generated documents, and I have read and agree to the Privacy Notice above.',
    privacy: 'Your signature is personal data collected and used only to appear on your generated documents, in line with the Data Privacy Act of 2012 (RA 10173). It will only be visible to authorized users of this system and will not be shared with anyone else.',
  },
};

export default function SetupPage({ pageId, dashboard, sub, privacy, consent: consentText, queueWalkthrough = false }) {
  const navigate = useNavigate();
  const [session] = useState(getSession);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [consent, setConsent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  if (!session || !session.token) return <Navigate to="/login" />;
  if (!session.user?.setupRequired) return <Navigate to={dashboard} />;
  const userId = session.user?.userID;

  function handleFile(f) {
    // PNG only — a signature prints small, over a line, so it needs a transparent background.
    if (f.type !== 'image/png') { setError('Please upload a PNG file with a transparent background.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('File is too large. Maximum size is 5 MB.'); return; }
    setError('');
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }

  function clearSignature() {
    setFile(null);
    fileInput.current.value = '';
    setPreview(null);
    setError('');
  }

  async function uploadAndFinish() {
    if (!file || !consent) return;
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const saved = await apiRequest(`ESignature/${userId}`, 'POST', form, true);
      if (!saved?.signatureFilePath) throw new Error('Signature could not be confirmed. Please try again.');
      session.user.setupRequired = false;
      localStorage.setItem('user', JSON.stringify(session.user));
      // Queue the one-time portal walkthrough for the dashboard.
      if (queueWalkthrough) {
        try { localStorage.setItem('astra_walkthrough_pending_' + userId, '1'); localStorage.removeItem('astra_walkthrough_done_' + userId); } catch (e) {}
      }
      navigate(dashboard);
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
      setUploading(false);
    }
  }

  return (
    <Page id={pageId}>
      <div className="setup-page">
        <div className="setup-brand">
          <img src="/IMAGES/LOGO-mark.png" alt="Astra Mentoring" className="brand-logo" />
          {' '}
          <span className="brand-name">AstraMentoring</span>
        </div>
        {' '}
        <div className="setup-card">
          <h1 className="setup-title">Upload Your Signature</h1>
          {' '}
          <p className="setup-sub">{sub}</p>
          {' '}
          <label id="dropzone" className={'sig-dropzone' + (dragOver ? ' drag-over' : '')}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}>
            <input type="file" id="sigFile" accept="image/png" className="sig-file-input" ref={fileInput}
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
            {' '}
            <div id="dropzone-idle" className="dz-idle" style={preview ? { display: 'none' } : undefined}>
              <svg className="dz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                {' '}
                <polyline points="17 8 12 3 7 8"></polyline>
                {' '}
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              {' '}
              <p className="dz-main">Tap or drag &amp; drop your signature</p>
              {' '}
              <p className="dz-hint">PNG with transparent background · Max 5 MB</p>
            </div>
            {' '}
            <img id="sigPreview" className="sig-preview" src={preview || undefined} alt="Signature preview" style={{ display: preview ? 'block' : 'none' }} />
          </label>
          {' '}
          <div id="step1Error" className="setup-error" style={{ display: error ? 'block' : 'none' }}>{error}</div>
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
            <input type="checkbox" id="sigConsent" checked={consent} onChange={e => setConsent(e.target.checked)} />
            {' '}
            <span>{consentText}</span>
          </label>
          {' '}
          <div className="setup-actions">
            {/* Back to Login clears the session first, or the setup gate would bounce straight back here. */}
            <a href="/login" className="btn-back" onClick={() => clearSession()}>Back to Login</a>
            {' '}
            <div className="actions-right">
              <button id="btnRetake" className="btn-retake" style={file ? undefined : { display: 'none' }} onClick={clearSignature}>Reupload</button>
              {' '}
              <button id="btnContinue" className="btn-primary" disabled={uploading || !(file && consent)} onClick={uploadAndFinish}>{uploading ? 'Uploading…' : 'Continue'}</button>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
