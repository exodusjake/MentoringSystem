import { useCallback, useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import ProfileEditModal from '../../components/ProfileEditModal.jsx';
import { showToast } from '../../components/Notify.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { getSession } from '../../lib/session.js';

const fullName = u => `${u?.firstName || u?.FirstName || ''} ${u?.lastName || u?.LastName || ''}`.trim();
const initial = u => `${u?.firstName?.[0] || u?.FirstName?.[0] || ''}${u?.lastName?.[0] || u?.LastName?.[0] || ''}`.toUpperCase() || '?';

export default function AdminProfile() {
  const userId = getSession()?.user?.userID || getSession()?.user?.UserID;
  const [user, setUser] = useState(null);
  const [signature, setSignature] = useState(null);
  const [state, setState] = useState('loading');
  const [editOpen, setEditOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [signatureConsent, setSignatureConsent] = useState(false);
  const [signatureConfirmOpen, setSignatureConfirmOpen] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  useEffect(() => {
    if (!file) { setFilePreview(''); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const load = useCallback(async () => {
    setState('loading');
    try {
      const details = userId ? await apiRequest(`Users/${userId}`, 'GET', null, true) : getSession()?.user;
      setUser(details || {});
      if (userId) {
        const sig = await apiRequest(`ESignature/${userId}`, 'GET', null, true);
        setSignature(sig?.signatureFilePath || null);
      }
      setState('ready');
    } catch (e) { setState('error'); showToast(e.message || 'Could not load your account.'); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  function saveSignature() {
    if (!file || !userId) { showToast('Choose a PNG signature image to upload.'); return; }
    if (!signatureConsent) { showToast('Confirm signature ownership and read the privacy notice before continuing.'); return; }
    const validation = file.type !== 'image/png' ? 'Your signature must be a PNG image.' : file.size > 5 * 1024 * 1024 ? 'Signature must be 5 MB or smaller.' : '';
    if (validation) { showToast(validation); return; }
    setSignatureConfirmOpen(true);
  }

  async function confirmSignatureUpload() {
    setSignatureConfirmOpen(false);
    setSavingSignature(true);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await apiRequest(`ESignature/${userId}`, 'POST', form, true);
      setSignature(response?.signatureFilePath || signature);
      setSignatureOpen(false); setFile(null); showToast('Signature uploaded.', 'success');
    } catch (e) { showToast(e.message || 'Could not upload signature.'); }
    finally { setSavingSignature(false); }
  }

  return <Page id="ADMIN_/profile"><main className="main-wrapper"><div className="page-content">
    <header className="page-header"><div className="page-header-top"><div><h1>My Account</h1><p>Review and update your profile information.</p></div></div></header>
    {state === 'loading' ? <Empty className="empty-state">Loading account…</Empty> : state === 'error' ? <Empty className="empty-state">Could not load your profile.</Empty> : <>
      <section className="profile-card">
        <div className="profile-cover" />
        <div className="profile-identity"><div className="profile-avatar">{initial(user)}</div><div className="profile-name-block"><h2>{fullName(user) || 'Administrator'}</h2><span className="profile-role">{user.role || user.Role || 'Admin'}</span><span>{user.email || user.Email}</span></div>
          <button className="btn-primary" onClick={() => setEditOpen(true)}><i className="ti ti-edit" /> Edit Profile</button></div>
        <div className="profile-details-grid">
          <div className="profile-detail"><span>First Name</span><b>{user.firstName || user.FirstName || '—'}</b></div>
          <div className="profile-detail"><span>Last Name</span><b>{user.lastName || user.LastName || '—'}</b></div>
          <div className="profile-detail"><span>Email Address</span><b>{user.email || user.Email || '—'}</b></div>
          <div className="profile-detail"><span>Contact Number</span><b>{user.contactNumber || user.ContactNumber || '—'}</b></div>
          <div className="profile-detail"><span>ID Number</span><b>{user.studentNumber || user.StudentNumber || '—'}</b></div>
          <div className="profile-detail"><span>Gender</span><b>{user.gender || user.Gender || '—'}</b></div>
        </div>
      </section>
      <section className="signature-card">
        <div className="signature-card-header"><div><h2>Electronic Signature</h2><p>Your signature may appear on calendar sheets and official forms.</p></div><button className="btn-outline" onClick={() => { setFile(null); setSignatureConsent(false); setSignatureOpen(true); }}><i className="ti ti-upload" /> Upload / Replace</button></div>
        <p><b>Privacy Notice.</b> Your signature is personal data used only to appear on your generated documents, per the Data Privacy Act of 2012 (RA 10173). It is only visible to authorized users of this system.</p>
        <div className="signature-preview">{signature ? <img src={CONFIG.getFileUrl(signature)} alt="Your electronic signature" /> : <Empty className="signature-empty">No signature on file yet. Upload a transparent PNG image (5 MB maximum).</Empty>}</div>
      </section>
    </>}
  </div></main>
  {user && <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} user={user} onSaved={load} />}
  {signatureOpen && <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setSignatureOpen(false)}><section className="modal-card signature-modal">
    <header className="modal-header"><h2>Upload Electronic Signature</h2><button onClick={() => setSignatureOpen(false)} aria-label="Close">×</button></header>
    <p>Select a transparent PNG file. Maximum file size: 5 MB.</p>
    <input type="file" accept="image/png,.png" onChange={e => setFile(e.target.files?.[0] || null)} />
    {filePreview && <div className="signature-preview"><img src={filePreview} alt="Signature preview" /></div>}
    <label className="signature-consent"><input type="checkbox" checked={signatureConsent} onChange={e => setSignatureConsent(e.target.checked)} /> I confirm this is my own signature and I authorize its use on my generated documents, and I have read and agree to the Privacy Notice above.</label>
    <div className="modal-actions"><button className="btn-outline" onClick={() => setSignatureOpen(false)}>Cancel</button><button className="btn-primary" onClick={saveSignature} disabled={!file || !signatureConsent || savingSignature}>{savingSignature ? 'Uploading…' : 'Continue'}</button></div>
  </section></div>}
  {signatureConfirmOpen && <div className="modal-overlay open" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="signature-confirm-title">
    <header className="modal-header"><h2 id="signature-confirm-title">Confirm signature upload</h2><button onClick={() => setSignatureConfirmOpen(false)} aria-label="Close">×</button></header>
    <p>Upload this signature for use on your generated documents? You can replace it later.</p>
    <div className="modal-actions"><button className="btn-outline" onClick={() => setSignatureConfirmOpen(false)}>Review</button><button className="btn-primary" onClick={confirmSignatureUpload} disabled={savingSignature}>{savingSignature ? 'Uploading…' : 'Confirm Upload'}</button></div>
  </section></div>}
  </Page>;
}
