import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Overlay from '../../components/Overlay.jsx';
import ProfileEditModal from '../../components/ProfileEditModal.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { getSession, saveSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { useTour } from '../../app/tour.js';

// HEAD/HTML/account.html + HEAD/JS/account.js  (profile + system info)

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs — 1st Semester's count includes Mentoring
// Assembly, 2nd Semester's doesn't. Required-session counts come from this fixed list instead of the old
// Admin-editable setting.
const MENTORING_SLOTS_COUNT_1ST = 6;
const MENTORING_SLOTS_COUNT_2ND = 5;

const ph = text => <span className="sysinfo-placeholder">{text}</span>;

export default function Account() {
  useBackGuard();
  const tour = useTour();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [sig, setSig] = useState({ loaded: false, path: null });
  const [sigModal, setSigModal] = useState(false);
  const [sigFile, setSigFile] = useState(null);
  const [sigPreview, setSigPreview] = useState(null);
  const [sigConsent, setSigConsent] = useState(false);
  const [sigError, setSigError] = useState('');
  const [sigSaving, setSigSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // ── Profile + system info + signature ──
  // loadSignature() reads the user's id, which loadProfile() only has after its own await resolves — so the
  // signature is fetched after the profile (calling both in parallel used to fetch ESignature/undefined).
  useEffect(() => {
    (async () => {
      (async () => {
        try {
          const data = await apiRequest('Settings', 'GET', null, true);
          setSettings({ sy: data?.SchoolYear || data?.schoolYear || null, sem: data?.Semester || data?.semester || null });
        } catch (e) {
          console.error('Settings load error:', e);
        }
      })();

      const session = getSession();
      if (!session?.user) { window.location.href = '/login'; return; }
      const user = session.user;
      const userId = user.userID || user.UserID || user.userId;
      let loadedUser = user;
      if (userId) {
        try { loadedUser = await apiRequest(`Users/${userId}`, 'GET', null, true); } catch (e) { loadedUser = user; }
      }
      setCurrentUser(loadedUser);
      const uid = loadedUser?.userID || loadedUser?.UserID || loadedUser?.userId;
      try {
        const res = await apiRequest(`ESignature/${uid}`, 'GET', null, true);
        setSig({ loaded: true, path: res?.signatureFilePath || null });
      } catch {
        setSig({ loaded: true, path: null });
      }
    })();
  }, []);

  const user = currentUser;
  const first = user?.firstName || user?.FirstName || '';
  const last = user?.lastName || user?.LastName || '';
  const email = user?.email || user?.Email || '—';
  const contact = user?.contactNumber || user?.ContactNumber || '';
  const isActive = user ? (user.isActive ?? user.IsActive ?? true) : true;
  const fullName = `${first} ${last}`.trim() || '—';
  const initials = (first.charAt(0) + last.charAt(0)).toUpperCase() || 'HA';

  // keep the sidebar's name/avatar in step with an edited profile (renderProfile updated #sidebarName/#sidebarAvatar)
  useEffect(() => {
    if (!user) return;
    const sbAvatar = document.getElementById('sidebarAvatar');
    const sbName = document.getElementById('sidebarName');
    if (sbAvatar) sbAvatar.textContent = initials;
    if (sbName) sbName.textContent = fullName;
  }, [user]);

  // ── Edit profile (contact number / password) ──
  async function saveProfile(contactVal) {
    const userId = currentUser?.userID || currentUser?.UserID || currentUser?.userId;
    await apiRequest(`Users/${userId}`, 'PUT', {
      firstName:       currentUser.firstName || currentUser.FirstName,
      lastName:        currentUser.lastName  || currentUser.LastName,
      email:           currentUser.email     || currentUser.Email,
      contactNumber:   contactVal || null,
      studentNumber:   currentUser.studentNumber || currentUser.StudentNumber || null,
      role:            currentUser.role      || currentUser.Role,
    }, true);
  }
  function afterSave(contactVal) {
    const updatedUser = { ...currentUser, contactNumber: contactVal, ContactNumber: contactVal };
    const session = getSession();
    if (session?.user) {
      const updated = { ...session.user, contactNumber: contactVal, ContactNumber: contactVal };
      saveSession(session.token, session.role, updated);
    }
    setCurrentUser(updatedUser);
  }

  // ── Signature ──
  function openSigModal() {
    setSigFile(null); setSigPreview(null); setSigError(''); setSigConsent(false);
    if (fileRef.current) fileRef.current.value = '';
    setSigModal(true);
  }
  function handleSigFile(file) {
    // PNG only — a signature prints small, over a line, so it needs a transparent background to blend in cleanly.
    if (file.type !== 'image/png') {
      setSigError('Please upload a PNG file with a transparent background.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSigError('File too large. Maximum 5 MB.');
      return;
    }
    setSigFile(file);
    setSigError('');
    const reader = new FileReader();
    reader.onload = e => setSigPreview(e.target.result);
    reader.readAsDataURL(file);
  }
  async function saveSig() {
    if (!sigFile || !sigConsent) return;
    setSigSaving(true);
    try {
      const form = new FormData();
      form.append('file', sigFile);
      const uid = currentUser?.userID || currentUser?.UserID || currentUser?.userId;
      const res = await apiRequest(`ESignature/${uid}`, 'POST', form, true);
      const path = res?.signatureFilePath;
      if (path) setSig({ loaded: true, path });
      setSigModal(false);
    } catch (err) {
      setSigError(err.message || 'Upload failed. Please try again.');
    } finally {
      setSigSaving(false);
    }
  }

  const sysVal = (v, placeholder) => (v && v !== '—') ? v : ph(placeholder);

  return (
    <Page id="HEAD/account">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Account</h1>
            <p>Your profile and system information</p>
          </div>

          <div className="account-sections">
            {/* Profile Card */}
            <div id="profileLoading" className="profile-loading" style={{ display: user ? 'none' : undefined }}>
              <div className="loading-spinner"></div>
              <p>Loading profile…</p>
            </div>

            <div id="profileCard" className="profile-wrapper" style={{ display: user ? 'block' : 'none' }}>
              <div className="ph-card">
                <div className="ph-banner">
                  <button className="edit-btn" onClick={() => setEditOpen(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    Edit
                  </button>
                </div>
                <div className="ph-identity">
                  <div className="profile-avatar" id="profileAvatar">{user ? initials : 'HA'}</div>
                  <div className="ph-identity-info">
                    <div className="ph-name" id="profileName">{user ? fullName : '—'}</div>
                    <div className="ph-chips">
                      <span className="profile-role-badge">Super Administrator</span>
                    </div>
                  </div>
                </div>
                <div className="ph-fields-strip">
                  <div className="ph-strip-field ph-field-wide">
                    <span className="ph-field-icon"><i className="ti ti-mail"></i></span>
                    <span className="ph-field-body">
                      <span className="ph-field-label">Email Address</span>
                      <span className="ph-field-value" id="profileEmail">{user ? email : '—'}</span>
                    </span>
                  </div>
                  <div className="ph-strip-field">
                    <span className="ph-field-icon"><i className="ti ti-phone"></i></span>
                    <span className="ph-field-body">
                      <span className="ph-field-label">Contact Number</span>
                      <span className="ph-field-value" id="profileContact">{user ? (contact || '—') : '—'}</span>
                    </span>
                  </div>
                  <div className="ph-strip-field">
                    <span className="ph-field-icon"><i className="ti ti-user-shield"></i></span>
                    <span className="ph-field-body">
                      <span className="ph-field-label">Role</span>
                      <span className="ph-field-value">Super Administrator</span>
                    </span>
                  </div>
                  <div className="ph-strip-field">
                    <span className="ph-field-icon"><i className="ti ti-circle-check"></i></span>
                    <span className="ph-field-body">
                      <span className="ph-field-label">Account Status</span>
                      <span className="ph-field-value">
                        <span className={`status-badge ${isActive ? 'active' : 'inactive'}`} id="profileStatus">{isActive ? 'Active' : 'Inactive'}</span>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="walkthrough-card walkthrough-card--standalone">
              <div className="walkthrough-card-icon"><i className="ti ti-route"></i></div>
              <div className="walkthrough-card-text">
                <div className="walkthrough-card-title">Portal Walkthrough</div>
                <div className="walkthrough-card-sub">New here or need a refresher? Take a quick guided tour of the Super Administrator Portal.</div>
              </div>
              <button type="button" className="btn-replay-tour" onClick={() => tour.start()}><i className="ti ti-player-play"></i> Replay Walkthrough</button>
            </div>

            {/* Signature */}
            <div className="section-block" id="sigSection" style={{ display: sig.loaded ? '' : 'none' }}>
              <div className="section-block-head">
                <div className="section-block-title">My Signature</div>
                <div className="section-block-sub">Used on your generated documents.</div>
              </div>
              <div className="section-block-body sig-block-body">
                <div id="sigHasState" style={{ display: sig.path ? '' : 'none' }}>
                  <div className="sig-img-wrap">
                    <img id="sigImg" src={sig.path ? CONFIG.getFileUrl(sig.path) : ''} alt="My signature" className="sig-img" />
                  </div>
                </div>
                <div id="sigNoneState" className="sig-none-state" style={{ display: sig.path ? 'none' : '' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                  <span>No signature on file yet.</span>
                </div>
                <button className="btn-change-sig" id="btnChangeSig" onClick={openSigModal}>{sig.path ? 'Change Signature' : 'Upload Signature'}</button>
              </div>
            </div>

            {/* System Information */}
            <div className="section-block">
              <div className="section-block-head">
                <div className="section-block-title">System Information</div>
                <div className="section-block-sub">Current system configuration — managed by Administrator</div>
              </div>
              <div className="section-block-body">
                <div className="sysinfo-grid">
                  <div className="sysinfo-card">
                    <div className="sysinfo-card-head">
                      <div className="sysinfo-icon blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      </div>
                      <div className="sysinfo-card-title">Academic Period</div>
                    </div>
                    <div className="sysinfo-row">
                      <span className="sysinfo-label">School Year</span>
                      <span className="sysinfo-value" id="valSchoolYear">{sysVal(settings?.sy, 'e.g. 2026-2027')}</span>
                    </div>
                    <div className="sysinfo-row">
                      <span className="sysinfo-label">Semester</span>
                      <span className="sysinfo-value" id="valSemester">{sysVal(settings?.sem, 'e.g. 1st Semester')}</span>
                    </div>
                    <div className="ro-note"><i className="ti ti-lock"></i> Managed by Administrator</div>
                  </div>
                  <div className="sysinfo-card">
                    <div className="sysinfo-card-head">
                      <div className="sysinfo-icon green">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      </div>
                      <div className="sysinfo-card-title">Session Limits</div>
                    </div>
                    <div className="sysinfo-row">
                      <span className="sysinfo-label">1st Semester</span>
                      <span className="sysinfo-value" id="valLimit1st">{settings ? MENTORING_SLOTS_COUNT_1ST + ' sessions' : ph('e.g. 6 sessions')}</span>
                    </div>
                    <div className="sysinfo-row">
                      <span className="sysinfo-label">2nd Semester</span>
                      <span className="sysinfo-value" id="valLimit2nd">{settings ? MENTORING_SLOTS_COUNT_2ND + ' sessions' : ph('e.g. 5 sessions')}</span>
                    </div>
                    <div className="ro-note"><i className="ti ti-lock"></i> Managed by Administrator</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      <ProfileEditModal variant="head" open={editOpen} onClose={() => setEditOpen(false)} currentUser={currentUser}
        saveProfile={saveProfile} afterSave={afterSave} />

      {/* Signature Upload Modal */}
      <Overlay open={sigModal} className="modal-overlay" activeClass={null} display="flex" id="sigModal"
        onClick={e => { if (e.target === e.currentTarget) setSigModal(false); }}>
        <div className="edit-modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setSigModal(false)}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <h2 className="modal-title">Update Signature</h2>
          <p className="modal-subtitle">Upload a clear PNG of your handwritten signature with a transparent background.</p>
          <div id="sigModalError" className="edit-error" style={{ display: sigError ? 'block' : 'none' }}>{sigError}</div>
          <label className={`sig-dz${dragOver ? ' drag-over' : ''}`} id="sigDz"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleSigFile(e.dataTransfer.files[0]); }}>
            <input type="file" id="sigFileInput" accept="image/png" className="sig-dz-input" ref={fileRef}
              onChange={() => { if (fileRef.current.files[0]) handleSigFile(fileRef.current.files[0]); }} />
            <div id="sigDzIdle" className="sig-dz-idle" style={{ display: sigPreview ? 'none' : '' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span className="sig-dz-main">Click or drag image here</span>
              <span className="sig-dz-hint">PNG with transparent background — max 5 MB</span>
            </div>
            <img id="sigDzPreview" className="sig-dz-preview" src={sigPreview || ''} alt="Preview" style={{ display: sigPreview ? 'block' : 'none' }} />
          </label>
          <div className="setup-privacy-notice">
            <svg className="pn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <p><strong>Privacy Notice.</strong> Your signature is personal data used only to appear on your generated documents, per the Data Privacy Act of 2012 (RA 10173). It is only visible to authorized users of this system.</p>
          </div>
          <label className="setup-consent">
            <input type="checkbox" id="sigConsentModal" checked={sigConsent} onChange={e => setSigConsent(e.target.checked)} />
            <span>I confirm this is my own signature and I authorize its use on my generated documents, and I have read and agree to the Privacy Notice above.</span>
          </label>
          <div className="edit-modal-footer">
            <button className="btn-cancel" onClick={() => setSigModal(false)}>Cancel</button>
            <button className="btn-save" id="btnSaveSig" onClick={saveSig} disabled={!(sigFile && sigConsent) || sigSaving}>{sigSaving ? 'Saving…' : 'Save Signature'}</button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
