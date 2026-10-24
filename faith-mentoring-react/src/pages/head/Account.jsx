import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import ProfileEditModal from '../../components/ProfileEditModal.jsx';
import SignatureModal from '../../components/SignatureModal.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { emit } from '../../lib/events.js';
import { getSession } from '../../lib/session.js';

const text = (user, ...keys) => keys.map(key => user?.[key]).find(value => value != null && value !== '') || '—';
const privacy = 'Your signature is used only on program documents, including logsheets and reports. It will be stored securely and handled according to the program privacy policy.';
const consent = 'I confirm that this is my signature and consent to its use on program documents.';

export default function HeadAccount() {
  const [sessionUser] = useState(() => getSession().user);
  const userId = sessionUser?.userID || sessionUser?.UserID || sessionUser?.userId;
  const [state, setState] = useState({ status: 'loading' });
  const [settingsState, setSettingsState] = useState({ status: 'loading' });
  const [signatureState, setSignatureState] = useState({ status: 'loading' });
  const [signature, setSignature] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const loadProfile = async () => {
    if (!userId) {
      if (sessionUser) setState({ status: 'ready', user: sessionUser });
      else setState({ status: 'error', error: 'Your account session could not be found.' });
      return;
    }
    try {
      const user = await apiRequest(`Users/${userId}`, 'GET', null, true);
      const profile = user?.data || user;
      setState({ status: 'ready', user: profile });
      const first = profile?.firstName || profile?.FirstName || '';
      const last = profile?.lastName || profile?.LastName || '';
      emit('sidebar:identity', { name: `${first} ${last}`.trim(), initials: `${first[0] || ''}${last[0] || ''}`.toUpperCase() || 'HA' });
    } catch (error) {
      if (sessionUser) {
        setState({ status: 'ready', user: sessionUser, warning: error?.message || 'Unable to refresh account details. Showing your session profile.' });
        const first = sessionUser.firstName || sessionUser.FirstName || '';
        const last = sessionUser.lastName || sessionUser.LastName || '';
        emit('sidebar:identity', { name: `${first} ${last}`.trim(), initials: `${first[0] || ''}${last[0] || ''}`.toUpperCase() || 'HA' });
      } else {
        setState({ status: 'error', error: error?.message || 'Unable to load account.' });
      }
    }
    try {
      const settings = await apiRequest('Settings', 'GET', null, true);
      setSettingsState({ status: 'ready', data: settings || {} });
    } catch (error) {
      setSettingsState({ status: 'error', error: error?.message || 'Unable to load system information.' });
    }
  };
  useEffect(() => {
    let alive = true;
    loadProfile();
    if (userId) {
      apiRequest(`ESignature/${userId}`, 'GET', null, true)
        .then(result => {
          if (!alive) return;
          setSignature(result?.signatureFilePath || result?.SignatureFilePath || null);
          setSignatureState({ status: 'ready' });
        })
        .catch(error => {
          if (alive) setSignatureState({ status: 'error', error: error?.message || 'Unable to load your signature.' });
        });
    }
    return () => { alive = false; };
  }, [userId]);

  const user = state.user || {};
  const first = user.firstName || user.FirstName || '';
  const last = user.lastName || user.LastName || '';
  const initials = `${first[0] || ''}${last[0] || ''}`.toUpperCase() || 'HA';
  const name = `${first} ${last}`.trim() || '—';
  return <Page id="HEAD/account"><div className="main-wrapper"><main className="page-content">
    <div className="page-header"><h1>Account</h1><p>Manage your personal details and account signature.</p></div>
    {state.status === 'loading' ? <div className="profile-loading" role="status">Loading account…</div> : state.status === 'error' ? <div className="error-message" role="alert">{state.error}<button onClick={loadProfile}>Retry</button></div> : <>
      {state.warning && <div className="error-message" role="status">Showing your session profile because current account details could not be refreshed: {state.warning}<button type="button" onClick={loadProfile}>Retry</button></div>}
      <section className="profile-wrapper">
        <article className="ph-card">
          <div className="ph-banner"><button type="button" className="edit-btn" onClick={() => setEditOpen(true)}>Edit profile</button></div>
          <div className="ph-identity"><div className="profile-avatar">{initials}</div><div className="ph-identity-info"><div className="ph-name">{name}</div><div className="ph-chips"><span className="profile-role-badge">Head</span></div></div></div>
          <div className="ph-fields-strip">
            <div className="ph-strip-field ph-field-wide"><span className="ph-field-icon"><i className="ti ti-mail" /></span><span className="ph-field-body"><span className="ph-field-label">Email Address</span><span className="ph-field-value">{text(user, 'email', 'Email')}</span></span></div>
            <div className="ph-strip-field"><span className="ph-field-icon"><i className="ti ti-phone" /></span><span className="ph-field-body"><span className="ph-field-label">Contact Number</span><span className="ph-field-value">{text(user, 'contactNumber', 'ContactNumber', 'phone', 'Phone')}</span></span></div>
            <div className="ph-strip-field"><span className="ph-field-icon"><i className="ti ti-user-shield" /></span><span className="ph-field-body"><span className="ph-field-label">Role</span><span className="ph-field-value">Head Admin</span></span></div>
            <div className="ph-strip-field"><span className="ph-field-icon"><i className="ti ti-circle-check" /></span><span className="ph-field-body"><span className="ph-field-label">Account Status</span><span className="ph-field-value"><span className={`status-badge ${(user.isActive ?? user.IsActive ?? true) ? 'active' : 'inactive'}`}>{(user.isActive ?? user.IsActive ?? true) ? 'Active' : 'Inactive'}</span></span></span></div>
          </div>
          <div className="ph-edit-row">
            <section className="sig-section">
              <header className="sig-section-header"><div className="sig-section-title">My Signature</div><div className="sig-section-sub">Used in generated logsheets and documents.</div></header>
              {signatureState.status === 'loading' ? <div className="sig-none-state" role="status">Loading signature…</div>
                : signatureState.status === 'error' ? <div className="error-message" role="alert">{signatureState.error}<button type="button" onClick={() => {
                  setSignatureState({ status: 'loading' });
                  apiRequest(`ESignature/${userId}`, 'GET', null, true)
                    .then(result => { setSignature(result?.signatureFilePath || result?.SignatureFilePath || null); setSignatureState({ status: 'ready' }); })
                    .catch(error => setSignatureState({ status: 'error', error: error?.message || 'Unable to load your signature.' }));
                }}>Retry</button></div>
                  : signature ? <div className="sig-img-wrap"><img className="sig-img" src={CONFIG.getFileUrl(signature)} alt="Signature on file" /></div>
                    : <div className="sig-none-state"><span>No signature on file yet.</span></div>}
              <button className="btn-change-sig" onClick={() => setSignatureOpen(true)} disabled={signatureState.status !== 'ready'}>{signature ? 'Change Signature' : 'Upload Signature'}</button>
            </section>
          </div>
        </article>
      </section>
      <section className="section-block">
        <header className="section-block-head"><div className="section-block-title">System Information</div><div className="section-block-sub">Current system configuration — managed by Admin</div></header>
        {settingsState.status === 'loading' ? <div className="section-block-body" role="status">Loading system information…</div>
          : settingsState.status === 'error' ? <div className="section-block-body error-message" role="alert">{settingsState.error}<button type="button" onClick={() => {
            setSettingsState({ status: 'loading' });
            apiRequest('Settings', 'GET', null, true)
              .then(settings => setSettingsState({ status: 'ready', data: settings || {} }))
              .catch(error => setSettingsState({ status: 'error', error: error?.message || 'Unable to load system information.' }));
          }}>Retry</button></div>
            : <div className="section-block-body"><div className="sysinfo-grid">
          <article className="sysinfo-card"><header className="sysinfo-card-head"><span className="sysinfo-icon blue"><i className="ti ti-calendar" /></span><strong className="sysinfo-card-title">Academic Period</strong></header>
            <div className="sysinfo-row"><span className="sysinfo-label">School Year</span><span className="sysinfo-value">{text(settingsState.data, 'schoolYear', 'SchoolYear') === '—' ? <span className="sysinfo-placeholder">e.g. 2026-2027</span> : text(settingsState.data, 'schoolYear', 'SchoolYear')}</span></div>
            <div className="sysinfo-row"><span className="sysinfo-label">Semester</span><span className="sysinfo-value">{text(settingsState.data, 'semester', 'Semester') === '—' ? <span className="sysinfo-placeholder">e.g. 1st Semester</span> : text(settingsState.data, 'semester', 'Semester')}</span></div>
            <div className="ro-note"><i className="ti ti-lock" /> Managed by Admin</div>
          </article>
          <article className="sysinfo-card"><header className="sysinfo-card-head"><span className="sysinfo-icon green"><i className="ti ti-users" /></span><strong className="sysinfo-card-title">Session Limits</strong></header>
            <div className="sysinfo-row"><span className="sysinfo-label">1st Semester</span><span className="sysinfo-value">6 sessions</span></div>
            <div className="sysinfo-row"><span className="sysinfo-label">2nd Semester</span><span className="sysinfo-value">5 sessions</span></div>
            <div className="ro-note"><i className="ti ti-lock" /> Managed by Admin</div>
          </article>
        </div></div>}
      </section>
    </>}
  </main><footer><p>&copy; 2026 AstraMentoring. All rights reserved.</p></footer></div>
    <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} user={user} onSaved={loadProfile} />
    <SignatureModal open={signatureOpen} onClose={() => setSignatureOpen(false)} userId={userId} privacy={privacy} consent={consent} icon={false} onSaved={setSignature} />
  </Page>;
}
