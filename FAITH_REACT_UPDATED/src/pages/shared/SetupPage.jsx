import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { apiRequest } from '../../lib/api.js';
import { clearSession, getSession } from '../../lib/session.js';

// First-login onboarding (signature upload): {HEAD,ADMIN_,MENTOR,MENTEE}/HTML/setup.html + JS/setup.js.
// The four portals' pages were identical apart from the wording below, the stylesheet set and the dashboard
// they continue to, so they share this component.
export const SETUP_TEXT = {
  generated: {
    sub: 'Your signature is used on your generated documents. Please upload a clear PNG with a transparent background.',
    privacy: 'Your signature is personal data collected and used only to appear on your generated documents, in line with the Data Privacy Act of 2012 (RA 10173). It will only be visible to authorized users of this system and will not be shared with anyone else.',
    consent: 'I confirm this is my own signature and I authorize its use on my generated documents, and I have read and agree to the Privacy Notice above.',
  },
  mentor: {
    sub: 'Your signature is used on session logsheets. Please upload a clear PNG with a transparent background.',
    privacy: 'Your signature is personal data collected and used only to verify your attendance on mentoring session logsheets, in line with the Data Privacy Act of 2012 (RA 10173). It will only be visible to your mentees and to program administrators, and will not be shared with anyone else.',
    consent: 'I confirm this is my own signature and I authorize its use on my mentoring session logsheets, and I have read and agree to the Privacy Notice above.',
  },
  mentee: {
    sub: 'Your signature is used on session logsheets. Please upload a clear PNG with a transparent background.',
    privacy: 'Your signature is personal data collected and used only to verify your attendance on mentoring session logsheets, in line with the Data Privacy Act of 2012 (RA 10173). It will only be visible to your assigned mentor and to program administrators, and will not be shared with anyone else.',
    consent: 'I confirm this is my own signature and I authorize its use on my mentoring session logsheets, and I have read and agree to the Privacy Notice above.',
  },
};

export default function SetupPage({ pageId, dashboard, text, afterSave }) {
  const navigate = useNavigate();
  const [session] = useState(() => getSession());
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  if (!session || !session.token) return <Navigate to="/login" replace />;
  if (!session.user?.setupRequired) return <Navigate to={dashboard} replace />;

  const userId = session.user?.userID;

  // ── File selection ──
  function handleFile(file) {
    // PNG only — a signature prints small, over a line, so it needs a transparent background to blend in
    // cleanly. JPG/GIF/WEBP-without-alpha can't carry transparency, so they'd always print with a visible
    // background box no matter how the logsheet styles it.
    if (file.type !== 'image/png') {
      setError('Please upload a PNG file with a transparent background.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Maximum size is 5 MB.');
      return;
    }
    setError('');
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  function clearSignature() {
    setSelectedFile(null);
    if (fileInput.current) fileInput.current.value = '';
    setPreview(null);
    setError('');
  }

  // ── Upload and go to dashboard ──
  async function uploadAndFinish() {
    if (!selectedFile || !consent) return;
    setError('');
    setUploading(true);

    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const saved = await apiRequest(`ESignature/${userId}`, 'POST', form, true);
      if (!saved?.signatureFilePath) throw new Error('Signature could not be confirmed. Please try again.');

      if (session.user) session.user.setupRequired = false;
      localStorage.setItem('user', JSON.stringify(session.user));

      if (afterSave) afterSave(userId);

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
          <span className="brand-name">AstraMentoring</span>
        </div>

        <div className="setup-card">

          <h1 className="setup-title">Upload Your Signature</h1>
          <p className="setup-sub">{text.sub}</p>

          <label id="dropzone" className={`sig-dropzone${dragOver ? ' drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}>
            <input type="file" id="sigFile" accept="image/png" className="sig-file-input" ref={fileInput}
              onChange={() => { if (fileInput.current.files[0]) handleFile(fileInput.current.files[0]); }} />
            <div id="dropzone-idle" className="dz-idle" style={{ display: preview ? 'none' : '' }}>
              <svg className="dz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="dz-main">Tap or drag &amp; drop your signature</p>
              <p className="dz-hint">PNG with transparent background · Max 5 MB</p>
            </div>
            <img id="sigPreview" className="sig-preview" src={preview || ''} alt="Signature preview" style={{ display: preview ? 'block' : 'none' }} />
          </label>

          <div id="step1Error" className="setup-error" style={{ display: error ? 'block' : 'none' }}>{error}</div>

          <div className="setup-privacy-notice">
            <svg className="pn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <p><strong>Privacy Notice.</strong> {text.privacy}</p>
          </div>

          <label className="setup-consent">
            <input type="checkbox" id="sigConsent" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>{text.consent}</span>
          </label>

          <div className="setup-actions">
            <Link to="/login" className="btn-back" onClick={() => clearSession()}>Back to Login</Link>
            <div className="actions-right">
              <button id="btnRetake" className="btn-retake" style={{ display: selectedFile ? '' : 'none' }} onClick={clearSignature}>Reupload</button>
              <button id="btnContinue" className="btn-primary" disabled={!(selectedFile && consent) || uploading} onClick={uploadAndFinish}>{uploading ? 'Uploading…' : 'Continue'}</button>
            </div>
          </div>

        </div>

      </div>
    </Page>
  );
}
