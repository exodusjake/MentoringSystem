import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import { ConfirmX } from '../../components/ConfirmX.jsx';
import ProfileEditModal from '../../components/ProfileEditModal.jsx';
import SignatureModal from '../../components/SignatureModal.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { emit } from '../../lib/events.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Mentor profile (MENTOR/HTML/profile.html + profile.js + profile-edit.js).
export default function MentorProfile() {
  useStayOnBack();
  const [user] = useState(() => getSession().user);
  const [profile, setProfile] = useState({ state: 'loading' });   // loading | ok | error
  const [mentorProfile, setMentorProfile] = useState(null);
  const [signature, setSignature] = useState({ loaded: false, path: null, button: 'Upload Signature' });
  const [editOpen, setEditOpen] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);

  async function loadProfile() {
    const userId = user?.userID;
    try {
      const [u, profiles] = await Promise.all([
        apiRequest(`Users/${userId}`, 'GET', null, true),
        apiRequest('MentorProfiles', 'GET', null, true),
      ]);
      const mp = (profiles || []).find(p => p.userID === userId) || {};
      setMentorProfile(mp);
      const first = u.firstName || '', last = u.lastName || '';
      const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();
      emit('sidebar:identity', { name: `${first} ${last}`.trim(), initials: initials || 'MU' });
      setProfile({
        state: 'ok',
        initials: initials || 'MU',
        name: `${first} ${last}`.trim() || '—',
        email: u.email || '—',
        contact: u.contactNumber || '—',
        school: mp.school || '—',
        dept: mp.department || '—',
      });
    } catch (e) {
      console.error('Profile load failed:', e);
      setProfile(p => p.state === 'ok' ? p : { state: 'error' });
    }
  }

  useEffect(() => {
    (async () => {
      await loadProfile();
      try {
        const res = await apiRequest(`ESignature/${user?.userID}`, 'GET', null, true);
        const path = res?.signatureFilePath || null;
        setSignature({ loaded: true, path, button: path ? 'Change Signature' : 'Upload Signature' });
      } catch {
        setSignature(s => ({ ...s, loaded: true, path: null }));
      }
    })();
  }, []);

  const p = profile.state === 'ok' ? profile : null;

  return (
    <Page id="MENTOR/profile">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Profile</h1>
            {' '}
            <p>Your mentoring profile and account details</p>
          </div>
          {' '}
          <div id="profileLoading" className="loading-state" style={p ? { display: 'none' } : undefined}>
            {profile.state === 'error' ? 'Failed to load profile. Please refresh.' : <><span className="spinner"></span>{' '}Loading profile...</>}
          </div>
          {' '}
          <div id="profileCard" className="profile-wrapper" style={{ display: p ? 'block' : 'none' }}>
            <div className="ph-card">
              {/* Banner */}
              <div className="ph-banner">
                <button type="button" className="edit-btn" onClick={() => setEditOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  {' '}Edit
                </button>
              </div>
              {' '}
              {/* Identity */}
              <div className="ph-identity">
                <div className="profile-avatar" id="profileAvatar">{p ? p.initials : 'MU'}</div>
                {' '}
                <div className="ph-identity-info">
                  <div className="ph-name" id="profileName">{p ? p.name : '—'}</div>
                  {' '}
                  <div className="ph-chips">
                    <span className="profile-role-badge">Mentor</span>
                  </div>
                </div>
              </div>
              {' '}
              {/* Fields Strip */}
              <div className="ph-fields-strip">
                <StripField icon="ti-mail" label="Email Address" id="profileEmail" value={p ? p.email : '—'} />
                {' '}
                <div className="ph-strip-divider"></div>
                {' '}
                <StripField icon="ti-phone" label="Contact Number" id="profileContact" value={p ? p.contact : '—'} />
                {' '}
                <div className="ph-strip-divider"></div>
                {' '}
                <StripField icon="ti-school" label="School" id="profileSchool" value={p ? p.school : '—'} />
                {' '}
                <div className="ph-strip-divider"></div>
                {' '}
                <StripField icon="ti-building" label="Department" id="profileDept" value={p ? p.dept : '—'} />
                {' '}
                <div className="ph-strip-divider"></div>
                {' '}
                <StripField icon="ti-circle-check" label="Account Status" value={<span className="status-badge active">Active</span>} />
              </div>
              {' '}
              {/* Inline Edit Section (was a modal) + Signature, side by side */}
              <div className="ph-edit-row">
                {/* Signature Section */}
                <div className="sig-section" id="sigSection" style={signature.loaded ? undefined : { display: 'none' }}>
                  <div className="sig-section-header">
                    <div className="sig-section-title">My Signature</div>
                    {' '}
                    <div className="sig-section-sub">Used in generated logsheets and documents.</div>
                  </div>
                  {' '}
                  <div id="sigHasState" style={signature.path ? undefined : { display: 'none' }}>
                    <div className="sig-img-wrap">
                      <img id="sigImg" src={signature.path ? CONFIG.getFileUrl(signature.path) : undefined} alt="My signature" className="sig-img" />
                    </div>
                  </div>
                  {' '}
                  <div id="sigNoneState" className="sig-none-state" style={signature.path ? { display: 'none' } : undefined}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    {' '}
                    <span>No signature on file yet.</span>
                  </div>
                  {' '}
                  <button className="btn-change-sig" id="btnChangeSig" onClick={() => setSigOpen(true)}>{signature.button}</button>
                </div>
              </div>
            </div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} user={user} mentorProfile={mentorProfile} onSaved={loadProfile} />
      {/* Older "Save Changes?" confirm, still present in the page (nothing opens it any more). */}
      <div id="confirmModal" className="modal-overlay">
        <div className="edit-modal-card confirm-card" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
          <div className="confirm-icon" data-ac="icon">
            <i className="ti ti-device-floppy"></i>
          </div>
          {' '}
          <h2 className="modal-title" data-ac="title">Save Changes?</h2>
          {' '}
          <p className="modal-subtitle" data-ac="body">Are you sure you want to save the changes to your profile?</p>
          {' '}
          <div className="edit-modal-footer" style={{ justifyContent: 'center', gap: '14px' }} data-ac="actions">
            <button className="btn-cancel">Go Back</button>
            {' '}
            <button className="btn-save" id="confirmSaveBtn">Save</button>
          </div>
          <ConfirmX onClick={() => {}} />
        </div>
      </div>
      <SignatureModal open={sigOpen} onClose={() => setSigOpen(false)} userId={user?.userID} icon={false}
        privacy="Your signature is personal data used only to verify attendance on mentoring session logsheets, per the Data Privacy Act of 2012 (RA 10173). It is only visible to your mentees and to program administrators."
        consent="I confirm this is my own signature and I authorize its use on my mentoring session logsheets, and I have read and agree to the Privacy Notice above."
        onSaved={path => setSignature({ loaded: true, path, button: 'Change Signature' })} />
    </Page>
  );
}

function StripField({ icon, label, id, value }) {
  return (
    <div className="ph-strip-field">
      <span className="ph-field-icon">
        <i className={'ti ' + icon}></i>
      </span>
      {' '}
      <span className="ph-field-body">
        <span className="ph-field-label">{label}</span>
        {' '}
        <span className="ph-field-value" id={id}>{value}</span>
      </span>
    </div>
  );
}
