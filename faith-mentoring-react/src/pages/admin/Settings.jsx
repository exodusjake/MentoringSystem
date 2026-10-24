import { useEffect, useState } from 'react';
import Page from '../../app/Page.jsx';
import DateInput from '../../components/DateInput.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { showConfirm, showToast } from '../../components/Notify.jsx';
import { apiRequest } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';

const KEYS = ['SchoolYear', 'Semester', 'GuidanceOfficer', 'calPreparedByName', 'calPreparedByTitle', 'calPreparedByEmail', 'calApprovedByName', 'calApprovedByTitle', 'calApprovedByEmail'];
const GROUPS = {
  academic: ['SchoolYear', 'Semester'],
  signatories: ['calPreparedByName', 'calPreparedByTitle', 'calPreparedByEmail', 'calApprovedByName', 'calApprovedByTitle', 'calApprovedByEmail'],
};
const LABELS = {
  SchoolYear: 'School Year', Semester: 'Semester', GuidanceOfficer: 'Guidance Officer',
  calPreparedByName: 'Prepared By — Full Name', calPreparedByTitle: 'Prepared By — Title', calPreparedByEmail: 'Prepared By — Email',
  calApprovedByName: 'Approved By — Full Name', calApprovedByTitle: 'Approved By — Title', calApprovedByEmail: 'Approved By — Email',
};
const blankMaintenance = { mentor: false, mentee: false, eta: '', message: '' };
const localInput = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AdminSettings() {
  const [values, setValues] = useState({});
  const [draft, setDraft] = useState({});
  const [maintenance, setMaintenance] = useState(blankMaintenance);
  const [state, setState] = useState('loading');
  const [unlocked, setUnlocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pwFlow, setPwFlow] = useState({ current: '', code: '', next: '', confirm: '', token: null, sent: false, verified: false });

  async function load() {
    setState('loading');
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      const next = Object.fromEntries(KEYS.map(key => [key, data?.[key] ?? '']));
      setValues({ ...(data || {}), ...next }); setDraft(next);
      setMaintenance({
        mentor: data?.MaintenanceMentor === '1', mentee: data?.MaintenanceMentee === '1',
        eta: localInput(data?.MaintenanceEta), message: data?.MaintenanceMessage || '',
      });
      setState('ready');
    } catch (e) { setState('error'); showToast(e.message || 'Could not load system settings.'); }
  }
  useEffect(() => { load(); }, []);
  const field = (key, value) => setDraft(d => ({ ...d, [key]: value }));

  async function unlock() {
    if (!password) { showToast('Enter the settings password.'); return; }
    setSaving(true);
    try {
      await apiRequest('Settings/verify-password', 'POST', { password }, true);
      setUnlocked(true); setUnlockOpen(false); setPassword(''); showToast('Settings unlocked.', 'success');
    } catch (e) { showToast(e.status === 400 ? e.message : 'Unable to verify the settings password.'); }
    finally { setSaving(false); }
  }
  function lock() { setDraft(values); setMaintenance({ mentor: values.MaintenanceMentor === '1', mentee: values.MaintenanceMentee === '1', eta: localInput(values.MaintenanceEta), message: values.MaintenanceMessage || '' }); setUnlocked(false); }

  async function saveKeys(keys) {
    if (!unlocked) return;
    const changes = keys.map(key => [key, String(draft[key] ?? '').trim()]).filter(([key, value]) => value !== values[key]);
    if (!changes.length) { showToast('No changes to save.', 'info'); return; }
    for (const [key, value] of changes) {
      if (!value && key !== 'calPreparedByEmail' && key !== 'calApprovedByEmail') { showToast(`${LABELS[key]} cannot be empty.`); return; }
      if (value && key.toLowerCase().endsWith('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { showToast(`Enter a valid ${LABELS[key]} address.`); return; }
      if (key === 'SchoolYear' && !/^\d{4}-\d{4}$/.test(value)) { showToast('School Year must use YYYY-YYYY format.'); return; }
    }
    if (changes.some(([key]) => key === 'SchoolYear' || key === 'Semester') && !await showConfirm('Changing the academic period updates every portal immediately. Continue?', { confirmText: 'Change Period', variant: 'primary' })) return;
    setSaving(true);
    try {
      for (const [key, value] of changes) await apiRequest(`Settings/${key}`, 'PUT', { value }, true);
      const updated = { ...values, ...Object.fromEntries(changes) };
      setValues(updated); setDraft(updated); showToast('Settings saved.', 'success');
    } catch (e) { showToast(e.message || 'Could not save settings.'); }
    finally { setSaving(false); }
  }
  async function saveMaintenance() {
    if (!unlocked) return;
    const eta = maintenance.eta ? new Date(maintenance.eta) : null;
    if (maintenance.eta && Number.isNaN(eta.getTime())) { showToast('Enter a valid estimated time.'); return; }
    if (eta && (maintenance.mentor || maintenance.mentee) && eta.getTime() < Date.now()) { showToast('The estimated time must be in the future.'); return; }
    if (!await showConfirm(maintenance.mentor || maintenance.mentee ? 'Put the selected portals under maintenance? Users in those portals will see a maintenance page.' : 'Reopen the Mentor and Mentee portals?', { confirmText: maintenance.mentor || maintenance.mentee ? 'Start Maintenance' : 'Reopen Portals', variant: maintenance.mentor || maintenance.mentee ? 'danger' : 'primary' })) return;
    setSaving(true);
    try {
      const result = await apiRequest('Settings/maintenance', 'PUT', {
        mentor: maintenance.mentor, mentee: maintenance.mentee, eta: eta?.toISOString() || null, message: maintenance.message.trim(),
      }, true);
      setValues(v => ({ ...v, MaintenanceMentor: maintenance.mentor ? '1' : '0', MaintenanceMentee: maintenance.mentee ? '1' : '0', MaintenanceEta: result?.eta || eta?.toISOString() || '', MaintenanceMessage: maintenance.message.trim() }));
      showToast(maintenance.mentor || maintenance.mentee ? 'Maintenance mode is on.' : 'Portals reopened.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update maintenance mode.'); }
    finally { setSaving(false); }
  }
  async function sendPasswordCode() {
    if (!pwFlow.current) { showToast('Enter the current settings password.'); return; }
    setSaving(true);
    try { await apiRequest('Settings/password-code', 'POST', { password: pwFlow.current }, true); setPwFlow(f => ({ ...f, sent: true })); showToast('Verification code sent to your account email.', 'success'); }
    catch (e) { showToast(e.message || 'Could not send verification code.'); }
    finally { setSaving(false); }
  }
  async function verifyPasswordCode() {
    if (!/^\d{6}$/.test(pwFlow.code.trim())) { showToast('Enter the 6-digit verification code.'); return; }
    setSaving(true);
    try {
      const result = await apiRequest('Settings/password-code/verify', 'POST', { code: pwFlow.code.trim() }, true);
      setPwFlow(f => ({ ...f, token: result?.token || null, verified: true })); showToast('Password verified.', 'success');
    } catch (e) { showToast(e.message || 'Could not verify the code.'); }
    finally { setSaving(false); }
  }
  async function changePassword(event) {
    event.preventDefault();
    if (pwFlow.next.length < 8 || pwFlow.next !== pwFlow.confirm) { showToast('New password must be at least 8 characters and match the confirmation.'); return; }
    setSaving(true);
    try {
      await apiRequest('Settings/change-password', 'PUT', { currentPassword: pwFlow.current, newPassword: pwFlow.next, token: pwFlow.token }, true);
      setPasswordOpen(false); setPwFlow({ current: '', code: '', next: '', confirm: '', token: null, sent: false, verified: false });
      showToast('Settings password changed.', 'success');
    } catch (e) { showToast(e.message || 'Could not change the settings password.'); }
    finally { setSaving(false); }
  }

  const maintenanceOn = maintenance.mentor || maintenance.mentee;
  const activeWho = [maintenance.mentor && 'Mentor', maintenance.mentee && 'Mentee'].filter(Boolean).join(' and ');
  const statusMessage = maintenanceOn ? `${activeWho} ${maintenance.mentor && maintenance.mentee ? 'portals are' : 'portal is'} under maintenance${maintenance.eta ? ` until ${new Date(maintenance.eta).toLocaleString()}` : ''}.` : 'Both portals are open.';

  return <Page id="ADMIN_/settings"><main className="main-wrapper"><div className="page-content">
    <header className="page-header"><div className="page-header-top"><div><h1>System Settings</h1><p>Configure academic periods, calendar signatories and portal availability.</p></div></div></header>
    <section className={`settings-lock-banner ${unlocked ? 'unlocked' : ''}`}>
      <div><span className={`settings-lock-icon ${unlocked ? 'unlocked' : 'locked'}`}><i className={`ti ${unlocked ? 'ti-lock-open' : 'ti-lock'}`} /></span><div><h2>{unlocked ? 'Settings unlocked' : 'Settings are locked'}</h2><p>{unlocked ? 'You can now edit the settings below.' : 'Verify the settings password to make changes.'}</p></div></div>
      {unlocked ? <div className="slb-actions-unlocked"><button className="slb-btn-change" onClick={() => { setPwFlow({ current: '', code: '', next: '', confirm: '', token: null, sent: false, verified: false }); setPasswordOpen(true); }}>Change Settings Password</button><button className="slb-btn lock-again" onClick={lock}><i className="ti ti-lock" /> Lock</button></div> : <button className="slb-btn unlock" onClick={() => setUnlockOpen(true)}><i className="ti ti-lock-open" /> Unlock to Edit</button>}
    </section>
    {state === 'loading' ? <Empty className="empty-state">Loading settings…</Empty> : state === 'error' ? <Empty className="empty-state">Could not load system settings.</Empty> : <div className={`settings-grid ${unlocked ? '' : 'settings-locked'}`}>
      <div className="settings-col">
        <section className="settings-card"><div className="settings-card-header"><div className="settings-card-icon blue"><i className="ti ti-calendar" /></div><div><h2 className="settings-card-title">Academic Period</h2><p className="settings-card-sub">Current school year and semester displayed throughout the system.</p></div></div>
          <div className="settings-fields"><label className="settings-field"><span className="settings-label">School Year</span><input className="settings-input" disabled={!unlocked} value={draft.SchoolYear || ''} placeholder="e.g. 2025-2026" onChange={e => field('SchoolYear', e.target.value)} /></label>
            <label className="settings-field"><span className="settings-label">Semester</span><Select className="settings-input" disabled={!unlocked} value={draft.Semester || ''} onChange={e => field('Semester', e.target.value)}><option value="">Choose semester</option><option>1st Semester</option><option>2nd Semester</option><option>Summer</option></Select></label>
            <div className="settings-card-actions"><button className="btn-save" disabled={!unlocked || saving} onClick={() => saveKeys(GROUPS.academic)}>Save</button></div>
          </div>
        </section>
        <section className="settings-card"><div className="settings-card-header"><div className="settings-card-icon green"><i className="ti ti-user" /></div><div><h2 className="settings-card-title">Guidance Office</h2><p className="settings-card-sub">Officer name printed on Non-Attendance forms.</p></div></div>
          <div className="settings-fields"><label className="settings-field"><span className="settings-label">Guidance Officer</span><input className="settings-input" disabled={!unlocked} value={draft.GuidanceOfficer || ''} placeholder="Full name with title" onChange={e => field('GuidanceOfficer', e.target.value)} /></label><div className="settings-card-actions"><button className="btn-save" disabled={!unlocked || saving} onClick={() => saveKeys(['GuidanceOfficer'])}>Save</button></div></div>
        </section>
      </div>
      <div className="settings-col">
        <section className="settings-card"><div className="settings-card-header"><div className="settings-card-icon indigo"><i className="ti ti-signature" /></div><div><h2 className="settings-card-title">Calendar Sheet Signatories</h2><p className="settings-card-sub">Printed on the Calendar of Activities sheet.</p></div></div>
          <div className="settings-fields settings-fields-2col">{['PreparedBy', 'ApprovedBy'].map(person => <div className="settings-group" key={person}><h3 className="settings-group-title">{person === 'PreparedBy' ? 'Prepared By' : 'Approved By'}</h3>
            {['Name', 'Title', 'Email'].map(type => { const key = `cal${person}${type}`; return <label className="settings-field" key={key}><span className="settings-label">{type === 'Name' ? 'Full Name' : type}</span><input type={type === 'Email' ? 'email' : 'text'} className="settings-input" disabled={!unlocked} value={draft[key] || ''} placeholder={type === 'Email' ? 'name@firstasia.edu.ph' : ''} onChange={e => field(key, e.target.value)} /></label>; })}
          </div>)}</div><div className="settings-card-actions"><button className="btn-save" disabled={!unlocked || saving} onClick={() => saveKeys(GROUPS.signatories)}>Save</button></div>
        </section>
      </div>
      <section className="settings-card settings-card-wide" id="maintenanceCard"><div className="settings-card-header"><div className="settings-card-icon amber"><i className="ti ti-tool" /></div><div><h2 className="settings-card-title">Portal Maintenance</h2><p className="settings-card-sub">Temporarily restrict Mentor and/or Mentee portal access.</p></div></div>
        <div className={`maint-status ${maintenanceOn ? 'on' : ''}`}><b>{maintenanceOn ? 'Maintenance active' : 'Portals available'}</b><p>{statusMessage}</p></div>
        <div className="settings-fields"><label className={`maint-toggle-row ${maintenance.mentor ? 'on' : ''}`}><input type="checkbox" disabled={!unlocked} checked={maintenance.mentor} onChange={e => setMaintenance(m => ({ ...m, mentor: e.target.checked }))} /> Mentor Portal</label>
          <label className={`maint-toggle-row ${maintenance.mentee ? 'on' : ''}`}><input type="checkbox" disabled={!unlocked} checked={maintenance.mentee} onChange={e => setMaintenance(m => ({ ...m, mentee: e.target.checked }))} /> Mentee Portal</label>
          <label className="settings-field"><span className="settings-label">Estimated Reopening</span><DateInput type="datetime-local" className="settings-input" disabled={!unlocked} value={maintenance.eta} onChange={e => setMaintenance(m => ({ ...m, eta: e.target.value }))} /></label>
          <label className="settings-field"><span className="settings-label">Maintenance Message</span><textarea className="settings-input" rows="3" maxLength="500" disabled={!unlocked} value={maintenance.message} onChange={e => setMaintenance(m => ({ ...m, message: e.target.value }))} /></label>
          <div className="settings-card-actions"><button className="btn-save" disabled={!unlocked || saving} onClick={saveMaintenance}>{saving ? 'Applying…' : 'Apply'}</button></div>
        </div>
      </section>
    </div>}
  </div></main>
  {unlockOpen && <div className="modal-overlay open"><section className="modal-card unlock-modal"><header className="modal-header"><h2>Unlock System Settings</h2><button onClick={() => setUnlockOpen(false)} aria-label="Close">×</button></header><p>Enter your settings password to make changes.</p><form onSubmit={e => { e.preventDefault(); unlock(); }}><label>Password<input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} /></label><div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setUnlockOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Verifying…' : 'Confirm'}</button></div></form></section></div>}
  {passwordOpen && <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && setPasswordOpen(false)}><section className="modal-card change-password-modal"><header className="modal-header"><h2>Change Settings Password</h2><button onClick={() => setPasswordOpen(false)} aria-label="Close">×</button></header>
    {!pwFlow.verified ? <div className="password-code-flow"><label>Current Settings Password<input type="password" disabled={pwFlow.sent} value={pwFlow.current} onChange={e => setPwFlow(f => ({ ...f, current: e.target.value }))} /></label><button className="btn-outline" onClick={sendPasswordCode} disabled={saving || pwFlow.sent}>{pwFlow.sent ? 'Code Sent' : 'Send Code'}</button>
      {pwFlow.sent && <><label>6-digit Verification Code<input inputMode="numeric" maxLength="6" value={pwFlow.code} onChange={e => setPwFlow(f => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} /></label><button className="btn-primary" onClick={verifyPasswordCode} disabled={saving}>Verify Code</button></>}
    </div> : <form onSubmit={changePassword}><p>Identity verified for {getSession()?.user?.email || 'your account'}.</p><label>New Password<input type="password" value={pwFlow.next} onChange={e => setPwFlow(f => ({ ...f, next: e.target.value }))} minLength="8" required /></label><label>Confirm New Password<input type="password" value={pwFlow.confirm} onChange={e => setPwFlow(f => ({ ...f, confirm: e.target.value }))} required /></label><div className="modal-actions"><button className="btn-outline" type="button" onClick={() => setPasswordOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving}>Change Password</button></div></form>}
  </section></div>}
  </Page>;
}
