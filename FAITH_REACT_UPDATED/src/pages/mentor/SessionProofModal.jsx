import { useEffect, useRef, useState } from 'react';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import { apiRequest, validateUploadFile } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';

// The Upload Proof modal + upload confirmation of MENTOR/HTML/sessions.html (#proofModal, #uploadConfirmOverlay)
// and the proof section of sessions.js. Phones keep native capture; desktop browsers use a small webcam preview.

function usesProofNativeCamera() {
  return navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function SessionProofModal({ open, sessionId, dateStr, onClose, onUploaded, inFlightRef }) {
  const currentUser = getSession()?.user;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hint, setHint] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [accept, setAccept] = useState('image/*,application/pdf');
  const [capture, setCapture] = useState(null);
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const attemptRef = useRef(0);
  const capturedFileRef = useRef(null);
  const capturedUrlRef = useRef(null);
  const fileRef = useRef(null);
  const confirmResolve = useRef(null);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  fileRef.current = file;

  function stopProofCamera() {
    attemptRef.current++;
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    capturedFileRef.current = null;
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = null;
    setCapturedUrl(null);
  }

  function clearProofFile() {
    stopProofCamera();
    if (inputRef.current) inputRef.current.value = '';
    setAccept('image/*,application/pdf');
    setCapture(null);
    setHint('');
    setFile(null);
    setPreview(null);
  }

  // reset every time the modal opens
  useEffect(() => {
    if (open) { clearProofFile(); setError(''); setUploading(false); setConfirmOpen(false); }
    return () => { if (!open) return; };
  }, [open, sessionId]);
  useEffect(() => {
    const onHide = () => stopProofCamera();
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); stopProofCamera(); };
  }, []);

  function showProofError(msg) {
    setError(msg);
    showToast(msg);
  }

  function selectFile(f) {
    stopProofCamera();
    setCapture(null);
    if (!f) return;
    const err = validateUploadFile(f, 'ProofOfSession/upload');
    if (err) { clearProofFile(); showProofError(err); return; }
    setError('');
    setFile(f);
    showToast(`${f.name} attached.`, 'info', 2500);
    setPreview(null);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => { if (fileRef.current === f) setPreview(e.target.result); };
      reader.readAsDataURL(f);
    }
  }

  function proofCameraFailed() {
    stopProofCamera();
    setHint('Camera unavailable. Use Upload Photo to choose an existing image.');
  }

  async function openCamera() {
    if (inFlightRef.current) return;
    stopProofCamera();
    setError('');
    if (!usesProofNativeCamera()) {
      if (!navigator.mediaDevices?.getUserMedia) { proofCameraFailed(); return; }
      const attempt = attemptRef.current;
      setHint('Allow camera access, then Capture. Upload confirms submission separately.');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (attempt !== attemptRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        stream.getVideoTracks().forEach(track => { track.onended = () => { if (streamRef.current === stream) proofCameraFailed(); }; });
        setCameraOpen(true);
        setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
      } catch (err) {
        if (attempt !== attemptRef.current) return;
        proofCameraFailed();
        setHint(err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow access in your browser or use Upload Photo.'
          : 'Camera unavailable or already in use. Use Upload Photo to choose an existing image.');
      }
      return;
    }
    setAccept('image/*');
    setCapture('environment');
    setHint('On supported phones, your device camera opens. If this browser opens a file picker instead, choose an existing photo or use Upload Photo. Desktop websites cannot force-open the system Camera application.');
    setTimeout(() => inputRef.current?.click(), 0);
  }

  function captureProofPhoto() {
    const video = videoRef.current;
    if (!streamRef.current || !video.videoWidth || !video.videoHeight) {
      setHint('Camera is still loading. Try Capture again or use Upload Photo.'); return;
    }
    const attempt = attemptRef.current;
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    try {
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(blob => {
        if (attempt !== attemptRef.current) return;
        if (!blob) { proofCameraFailed(); return; }
        try {
          capturedFileRef.current = new File([blob], 'session-proof.jpg', { type: 'image/jpeg' });
          const err = validateUploadFile(capturedFileRef.current, 'ProofOfSession/upload');
          if (err) { proofCameraFailed(); showProofError(err); return; }
          if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null; video.srcObject = null;
          capturedUrlRef.current = URL.createObjectURL(blob);
          setCapturedUrl(capturedUrlRef.current);
        } catch (e) { proofCameraFailed(); }
      }, 'image/jpeg', 0.9);
    } catch (e) { proofCameraFailed(); }
  }

  function useProofPhoto() {
    if (!capturedFileRef.current) return;
    selectFile(capturedFileRef.current);
  }

  function openProofPicker() {
    stopProofCamera();
    setAccept('image/*,application/pdf');
    setCapture(null);
    setHint('');
    setTimeout(() => inputRef.current?.click(), 0);
  }

  function closeProofModal() {
    if (inFlightRef.current) return;
    clearProofFile();
    onClose();
  }

  function showUploadConfirmModal() {
    setConfirmOpen(true);
    return new Promise(resolve => { confirmResolve.current = resolve; });
  }
  function ucmResolve(confirmed) {
    setConfirmOpen(false);
    if (confirmResolve.current) { confirmResolve.current(confirmed); confirmResolve.current = null; }
  }

  async function submitProof() {
    if (inFlightRef.current) return;
    const sid = sessionRef.current;
    const f = fileRef.current;
    if (!f) { showToast('Please upload a file or capture your screen first.'); return; }

    const err = validateUploadFile(f, 'ProofOfSession/upload');
    if (err) { showProofError(err); return; }
    const confirmed = await showUploadConfirmModal();
    if (!confirmed) return;
    if (sessionRef.current !== sid) return;
    inFlightRef.current = true;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', f);
    formData.append('sessionId', sid);
    formData.append('uploadedByUserId', currentUser.userID);

    try {
      await apiRequest('ProofOfSession/upload', 'POST', formData, true);
      onClose();
      showToast('Proof uploaded. Session marked as completed.', 'success');
      await onUploaded();
    } catch (e) {
      console.error('Proof upload failed:', e);
      showProofError(e.message || 'Failed to upload proof. Please try again.');
    } finally {
      inFlightRef.current = false;
      setUploading(false);
    }
  }

  const optionsVisible = !file && !cameraOpen;

  return (
    <>
      <Overlay open={open} className="modal-overlay" activeClass="open" id="proofModal"
        onClick={e => { if (e.target === e.currentTarget) closeProofModal(); }}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={closeProofModal}>
            <i className="ti ti-x"></i>
          </button>
          <h2 className="modal-title">Upload Proof</h2>
          <p className="modal-subtitle" id="proofModalDate">{dateStr || '—'}</p>
          <details className="proof-tips">
            <summary><i className="ti ti-chevron-right"></i> Accepted Files and iPhone Guidelines</summary>
            <div className="proof-tips-body">
              <p>Please upload a clear photograph of the mentoring session or a PDF document. Accepted formats: JPG, JPEG, PNG, GIF, WEBP, and PDF, with a maximum file size of 20 MB.</p>
              <p>HEIC/HEIF and RAW image formats are not supported. Please export a JPG or PNG copy, or use the Take Photo option below. iPhone users may disable RAW capture under Settings &gt; Camera &gt; Formats &gt; Most Compatible. Files exceeding 20 MB should be resized or compressed while preserving image clarity.</p>
            </div>
          </details>
          <div id="proofErrorMsg" className="proof-error-msg" style={{ display: error ? 'flex' : 'none' }}><i className="ti ti-alert-circle"></i> {error}</div>
          <div className="proof-options" id="proofOptions" style={{ display: optionsVisible ? 'grid' : 'none' }}>
            <button type="button" className="proof-option-card" onClick={openProofPicker}>
              <i className="ti ti-cloud-upload"></i>
              <div className="proof-option-label">Upload Photo</div>
              <div className="proof-option-hint">JPG/JPEG, PNG, GIF, WEBP, PDF · Max 20 MB</div>
            </button>
            <button type="button" className="proof-option-card" onClick={openCamera}>
              <i className="ti ti-camera"></i>
              <div className="proof-option-label">Take Photo</div>
              <div className="proof-option-hint">Phone camera or desktop webcam</div>
            </button>
          </div>
          <p id="proofCameraHint" className="proof-camera-hint" role="status">{hint}</p>
          <div id="proofCameraPanel" hidden={!cameraOpen}>
            <video id="proofCameraVideo" ref={videoRef} autoPlay muted playsInline aria-label="Webcam preview" hidden={!!capturedUrl} onError={proofCameraFailed}></video>
            <img id="proofCameraStill" alt="Captured photo preview" src={capturedUrl || undefined} hidden={!capturedUrl} />
            <div className="proof-camera-actions" id="proofCameraLiveActions" hidden={!!capturedUrl}>
              <button type="button" className="proof-camera-primary" onClick={captureProofPhoto}>Capture</button>
              <button type="button" onClick={clearProofFile}>Cancel Camera</button>
            </div>
            <div className="proof-camera-actions" id="proofCameraCapturedActions" hidden={!capturedUrl}>
              <button type="button" onClick={() => { clearProofFile(); openCamera(); }}>Retake</button>
              <button type="button" className="proof-camera-primary" onClick={useProofPhoto}>Use Photo</button>
            </div>
          </div>
          <input type="file" id="proofFileInput" ref={inputRef} accept={accept} capture={capture || undefined}
            style={{ display: 'none' }} onChange={e => selectFile(e.target.files[0])} />
          <div id="proofPreviewWrap" style={{ display: file ? 'block' : 'none' }}>
            <img id="proofPreviewImg" className="proof-preview-img" alt="" src={preview || ''} style={{ display: preview ? 'block' : 'none' }} />
            <div className="proof-file-chosen">
              <i className="ti ti-file-check"></i>
              <span id="proofFileName">{file ? file.name : '—'}</span>
              <button type="button" className="proof-clear-btn" onClick={clearProofFile}>
                <i className="ti ti-x"></i>
              </button>
            </div>
          </div>
          <div className="form-actions" id="proofFormActions">
            <button type="button" className="btn-form-cancel" onClick={closeProofModal}>Cancel</button>
            <button type="button" className="btn-form-submit" id="submitProofBtn" onClick={submitProof} disabled={!file || uploading}>
              {uploading ? 'Uploading...' : <><i className="ti ti-upload"></i> Upload</>}
            </button>
          </div>
        </div>
      </Overlay>

      {/* Upload Confirmation Modal */}
      <Overlay open={confirmOpen} className="modal-overlay" activeClass="open" id="uploadConfirmOverlay"
        onClick={e => { if (e.target === e.currentTarget) ucmResolve(false); }}>
        <div className="modal-card modal-card-sm" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon confirm-icon-primary">
            <i className="ti ti-upload"></i>
          </div>
          <h3 className="confirm-title">Upload this as Session Proof?</h3>
          <p className="confirm-body">
            Once uploaded, this session will be marked <strong>Completed</strong> and visible to Admin and Head Admin.
          </p>
          <div className="confirm-actions">
            <button className="btn-form-cancel" onClick={() => ucmResolve(false)}>Cancel</button>
            <button className="btn-confirm-primary" onClick={() => ucmResolve(true)}>
              <i className="ti ti-upload"></i> Upload
            </button>
          </div>
        </div>
      </Overlay>
    </>
  );
}
