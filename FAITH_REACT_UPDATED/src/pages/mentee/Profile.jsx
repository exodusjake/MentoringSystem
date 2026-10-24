import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import { useTour } from '../../app/tour.js';
import Overlay from '../../components/Overlay.jsx';
import ProfileEditModal from '../../components/ProfileEditModal.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { getSession, saveSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTEE/HTML/profile.html + MENTEE/JS/profile.js + profile-edit.js

export default function MenteeProfile() {
  useBackGuard();
  const tour = useTour();
  const userId = getSession()?.user?.userID;
  const [data, setData] = useState(null);   // { user, assignment, detail, settings }
  const [loadFailed, setLoadFailed] = useState(false);
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

  async function loadProfile() {
    try {
      const [user, assignments, menteesWithDept, settings] = await Promise.all([
        apiRequest(`Users/${userId}`, 'GET', null, true),
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('Users/mentees-with-dept', 'GET', null, true),
        apiRequest('Settings', 'GET', null, true).catch(() => null),
      ]);
      const assignment = (assignments || []).find(a => a.menteeUserID === userId) || {};
      const detail = (menteesWithDept || []).find(m => m.userID === userId) || {};
      setData({ user, assignment, detail, settings });
      return true;
    } catch (e) {
      console.error('Profile load failed:', e);
      setLoadFailed(true);
      return false;
    }
  }

  useEffect(() => {
    (async () => {
      await loadProfile();
      try {
        const res = await apiRequest(`ESignature/${userId}`, 'GET', null, true);
        setSig({ loaded: true, path: res?.signatureFilePath || null });
      } catch {
        setSig({ loaded: true, path: null });
      }
    })();
  }, []);

  const user = data?.user;
  const first = user?.firstName || '';
  const last = user?.lastName || '';
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();

  // keep the sidebar's name/avatar in step with the profile
  useEffect(() => {
    if (!user) return;
    const nameEl = document.getElementById('sidebarName');
    const avatarEl = document.getElementById('sidebarAvatar');
    if (nameEl) nameEl.textContent = `${first} ${last}`.trim();
    if (avatarEl) avatarEl.textContent = initials || 'MU';
  }, [user]);

  // ── Edit profile (profile-edit.js's peProfilePayload / peSave) ──
  async function saveProfile(contactVal) {
    const u = user || {};
    const payload = {
      FirstName: u.firstName || u.FirstName || '',
      LastName: u.lastName || u.LastName || '',
      Email: u.email || u.Email || '',
      ContactNumber: contactVal || null,
      Role: u.role || u.Role,
    };
    if (u.studentNumber || u.StudentNumber) payload.StudentNumber = u.studentNumber || u.StudentNumber;
    await apiRequest(`Users/${userId}`, 'PUT', payload, true);
  }
  async function afterSave(contactVal) {
    const session = getSession();
    if (session && session.user) {
      saveSession(session.token, session.role, { ...session.user, contactNumber: contactVal, ContactNumber: contactVal });
    }
    await loadProfile();
  }

  // ── Signature ──
  function openSigModal() {
    setSigFile(null); setSigPreview(null); setSigError(''); setSigConsent(false);
    if (fileRef.current) fileRef.current.value = '';
    setSigModal(true);
  }
  function handleSigFile(file) {
    // PNG only — a signature prints small, over a line, so it needs a transparent background to blend in cleanly.
    if (file.type !== 'image/png') { setSigError('Please upload a PNG file with a transparent background.'); return; }
    if (file.size > 5 * 1024 * 1024) { setSigError('File too large. Maximum 5 MB.'); return; }
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
      const res = await apiRequest(`ESignature/${userId}`, 'POST', form, true);
      const path = res?.signatureFilePath;
      if (path) setSig({ loaded: true, path });
      setSigModal(false);
    } catch (err) {
      setSigError(err.message || 'Upload failed. Please try again.');
    } finally {
      setSigSaving(false);
    }
  }

  const a = data?.assignment || {};
  const d = data?.detail || {};
  const s = data?.settings;
  const course = a.course || d.course || '—';
  const year = a.yearLevel || d.yearLevel || '—';
  const section = d.sectionCode || d.section || a.sectionCode || '—';
  const semester = s?.Semester || s?.semester || '—';
  const schoolYear = s?.SchoolYear || s?.schoolYear || '—';
  const dept = a.departmentName || d.departmentName || '—';
  const school = a.menteeSchool || d.school || '—';

  return (
    <Page id="MENTEE/profile">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Profile</h1>
            <p>Your account and academic details</p>
          </div>

          <div id="profileLoading" className="loading-state" style={{ display: data ? 'none' : undefined }}>
            {loadFailed ? 'Failed to load profile. Please refresh.' : <><span className="spinner"></span> Loading profile...</>}
          </div>
          <div id="profileCard" className="profile-wrapper" style={{ display: data ? 'block' : 'none' }}>
            <div className="ph-card">
              <div className="ph-banner">
                <button type="button" className="edit-btn" onClick={() => setEditOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Edit
                </button>
              </div>

              <div className="ph-identity">
                <div className="profile-avatar" id="profileAvatar">{data ? (initials || 'MU') : 'MU'}</div>
                <div className="ph-identity-info">
                  <div className="ph-name" id="profileName">{data ? (`${first} ${last}`.trim() || '—') : '—'}</div>
                  <div className="ph-chips">
                    <span className="profile-role-badge">Mentee</span>
                  </div>
                </div>
              </div>

              <div className="ph-fields-strip">
                <div className="ph-strip-field">
                  <span className="ph-field-icon"><i className="ti ti-mail"></i></span>
                  <span className="ph-field-body">
                    <span className="ph-field-label">Email Address</span>
                    <span className="ph-field-value" id="profileEmail">{user?.email || '—'}</span>
                  </span>
                </div>
                <div className="ph-strip-divider"></div>
                <div className="ph-strip-field">
                  <span className="ph-field-icon"><i className="ti ti-phone"></i></span>
                  <span className="ph-field-body">
                    <span className="ph-field-label">Contact Number</span>
                    <span className="ph-field-value" id="profileContact">{user?.contactNumber || '—'}</span>
                  </span>
                </div>
                <div className="ph-strip-divider"></div>
                <div className="ph-strip-field">
                  <span className="ph-field-icon"><i className="ti ti-id"></i></span>
                  <span className="ph-field-body">
                    <span className="ph-field-label">Student Number</span>
                    <span className="ph-field-value" id="profileStudentNo">{user?.studentNumber || '—'}</span>
                  </span>
                </div>
                <div className="ph-strip-divider"></div>
                <div className="ph-strip-field">
                  <span className="ph-field-icon"><i className="ti ti-circle-check"></i></span>
                  <span className="ph-field-body">
                    <span className="ph-field-label">Account Status</span>
                    <span className="ph-field-value">
                      <span className="status-badge active">Active</span>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="profile-details-row">
              <div className="detail-card">
                <div className="detail-card-header">
                  <i className="ti ti-school"></i>
                  Academic Info
                </div>
                <div className="detail-grid" id="academicGrid">
                  {data ? <>
                    <div className="detail-row"><span className="detail-label">School Year</span><span className="detail-value">SY {schoolYear} · {semester}</span></div>
                    <div className="detail-row"><span className="detail-label">Course</span><span className="detail-value">{course}</span></div>
                    <div className="detail-row"><span className="detail-label">Year Level</span><span className="detail-value">{year}</span></div>
                    <div className="detail-row"><span className="detail-label">Section</span><span className="detail-value">{section}</span></div>
                  </> : <span className="stat-pulse">—</span>}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-header">
                  <i className="ti ti-building"></i>
                  Department &amp; School
                </div>
                <div className="detail-grid" id="deptGrid">
                  {data ? <>
                    <div className="detail-row"><span className="detail-label">Department</span><span className="detail-value">{dept}</span></div>
                    <div className="detail-row"><span className="detail-label">School</span><span className="detail-value">{school}</span></div>
                  </> : <span className="stat-pulse">—</span>}
                </div>
              </div>
            </div>

            <div className="walkthrough-card">
              <div className="walkthrough-card-icon"><i className="ti ti-route"></i></div>
              <div className="walkthrough-card-text">
                <div className="walkthrough-card-title">Portal Walkthrough</div>
                <div className="walkthrough-card-sub">New here or need a refresher? Take a quick guided tour of the Mentee Portal.</div>
              </div>
              <button type="button" className="btn-replay-tour" onClick={() => tour.start()}><i className="ti ti-player-play"></i> Replay Walkthrough</button>
            </div>

            <div className="ph-card">
              <div className="ph-edit-row">
                <div className="sig-section" id="sigSection" style={{ display: sig.loaded ? '' : 'none' }}>
                  <div className="sig-section-header">
                    <div className="sig-section-title">My Signature</div>
                    <div className="sig-section-sub">Used in generated logsheets and documents.</div>
                  </div>
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
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      <ProfileEditModal variant="pe" open={editOpen} onClose={() => setEditOpen(false)} currentUser={user}
        saveProfile={saveProfile} afterSave={afterSave} />

      {/* Signature Upload Modal */}
      <Overlay open={sigModal} className="modal-overlay" activeClass="open" id="sigModal"
        onClick={e => { if (e.target === e.currentTarget) setSigModal(false); }}>
        <div className="edit-modal-card" onClick={e => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setSigModal(false)}><i className="ti ti-x"></i></button>
          <div className="confirm-icon"><i className="ti ti-signature"></i></div>
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
            <p><strong>Privacy Notice.</strong> Your signature is personal data used only to verify your attendance on mentoring session logsheets, per the Data Privacy Act of 2012 (RA 10173). It is only visible to your assigned mentor and to program administrators.</p>
          </div>
          <label className="setup-consent">
            <input type="checkbox" id="sigConsentModal" checked={sigConsent} onChange={e => setSigConsent(e.target.checked)} />
            <span>I confirm this is my own signature and I authorize its use on my mentoring session logsheets, and I have read and agree to the Privacy Notice above.</span>
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
