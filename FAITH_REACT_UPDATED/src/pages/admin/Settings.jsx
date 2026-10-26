import { useEffect, useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import { showConfirm, showToast as notify } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import { apiRequest } from '../../lib/api.js';

// ADMIN_/HTML/settings.html + ADMIN_/JS/settings.js  (System Settings page: page-level lock)
// All fields load read-only/disabled. One password unlock (gated by Settings/verify-password) enables every field
// for the rest of this page load.

const SETTING_FIELDS = [
  'SchoolYear', 'Semester', 'GuidanceOfficer',
  'calPreparedByName', 'calPreparedByTitle', 'calPreparedByEmail',
  'calApprovedByName', 'calApprovedByTitle', 'calApprovedByEmail',
];

// Fields validated as an email address before saving — must match a real
// account for the Calendar Sheet to find that person's uploaded signature.
const EMAIL_SETTING_FIELDS = new Set(['calPreparedByEmail', 'calApprovedByEmail']);

const SETTING_GROUPS = {
  academic:    { button: 'academic', keys: ['SchoolYear', 'Semester'] },
  signatories: { button: 'signatories', keys: [
    'calPreparedByName', 'calPreparedByTitle', 'calPreparedByEmail',
    'calApprovedByName', 'calApprovedByTitle', 'calApprovedByEmail',
  ] },
};

function labelFor(key) {
  return {
    SchoolYear:           'School Year',
    Semester:             'Semester',
    GuidanceOfficer:      'Guidance Officer',
    calPreparedByName:    'Prepared By — Full Name',
    calPreparedByTitle:   'Prepared By — Title',
    calPreparedByEmail:   'Prepared By — Email',
    calApprovedByName:    'Approved By — Full Name',
    calApprovedByTitle:   'Approved By — Title',
    calApprovedByEmail:   'Approved By — Email',
  }[key] || key;
}

function startYear(schoolYear) {
  const m = /^(\d{4})-\d{4}$/.exec(schoolYear || '');
  return m ? Number(m[1]) : null;
}

function maintToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EYE_ON = <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const EYE_OFF = <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
const LOCK_PATH = <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>;
const UNLOCK_PATH = <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-3.4" /></>;
const CP_DEFAULT = <>Enter the current settings password and tap <b>Send Code</b> — we’ll email a 6-digit code to your account email.</>;

function PwdField({ id, className = 'settings-modal-input', value, onChange, placeholder, autoComplete = 'off', disabled, onEnter }) {
  const [show, setShow] = useState(false);
  // Resets with `disabled` re-locking (cpSetLocked sets type back to password)
  useEffect(() => { if (disabled) setShow(false); }, [disabled]);
  return (
    <div className="pwd-wrap">
      <input type={show ? 'text' : 'password'} id={id} className={className} placeholder={placeholder} autoComplete={autoComplete}
        disabled={disabled} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={onEnter ? e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } } : undefined} />
      <button type="button" className="pwd-eye" onClick={() => setShow(s => !s)} tabIndex={-1}>{show ? EYE_OFF : EYE_ON}</button>
    </div>
  );
}

export default function AdminSettings() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [latest, setLatest] = useState({});                  // last-loaded server values, keyed by SettingKey
  const latestRef = useRef({});
  const [vals, setVals] = useState({});                      // field values being edited
  const [maint, setMaint] = useState({ mentor: false, mentee: false, eta: '', message: '' });
  const [btn, setBtn] = useState({});                        // { [id]: { text, disabled, saved } }
  const [toast, setToast] = useState({ msg: '', type: 'success', show: false });
  const toastTimer = useRef(null);

  // unlock modal
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPw, setUnlockPw] = useState('');
  const [unlockErr, setUnlockErr] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);

  // change settings password modal
  const [cpOpen, setCpOpen] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpCode, setCpCode] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpToken, setCpToken] = useState(null);
  const [cpLocked, setCpLocked] = useState(true);
  const [cpErr, setCpErr] = useState('');
  const [cpInd, setCpInd] = useState({ state: '', node: CP_DEFAULT });
  const [cpSend, setCpSend] = useState({ text: 'Send Code', disabled: false });
  const [cpVerify, setCpVerify] = useState({ text: 'Verify', disabled: true });
  const [cpCurrentDisabled, setCpCurrentDisabled] = useState(false);
  const [cpCodeDisabled, setCpCodeDisabled] = useState(true);
  const [cpBusy, setCpBusy] = useState(false);
  const cpTimer = useRef(null);
  const cpTokenRef = useRef(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  }

  const setLatestBoth = v => { latestRef.current = v; setLatest(v); };

  function fieldsFrom(data) {
    const v = {};
    SETTING_FIELDS.forEach(key => { v[key] = data[key] != null ? data[key] : ''; });
    return v;
  }
  function maintFrom(data) {
    return { mentor: data.MaintenanceMentor === '1', mentee: data.MaintenanceMentee === '1', eta: maintToLocalInput(data.MaintenanceEta), message: data.MaintenanceMessage || '' };
  }

  async function loadSettings() {
    try {
      const data = await apiRequest('Settings', 'GET', null, true) || {};
      setLatestBoth(data);
      setVals(v => {
        // select: keeps the existing option when the server has no value
        const next = fieldsFrom(data);
        if (!data.Semester) next.Semester = v.Semester ?? '1st Semester';
        return next;
      });
      setMaint(maintFrom(data));
    } catch (e) {
      showToast('Failed to load settings.', 'error');
    }
  }
  useEffect(() => {
    setVals(v => ({ ...v, Semester: '1st Semester' }));
    loadSettings();
    return () => { clearTimeout(toastTimer.current); clearInterval(cpTimer.current); };
  }, []);

  const setVal = (key, v) => setVals(prev => ({ ...prev, [key]: v }));

  function flashBtn(id, text, ms = 1800) {
    setBtn(b => ({ ...b, [id]: { text, disabled: false, saved: true } }));
    setTimeout(() => setBtn(b => ({ ...b, [id]: { text: id === 'maintenance' ? 'Apply' : 'Save', disabled: false, saved: false } })), ms);
  }

  // ── SAVE (single field) ──
  async function saveSetting(key) {
    const raw = vals[key];
    const val = key === 'Semester' ? raw : String(raw ?? '').trim();
    if (!val) { showToast('Value cannot be empty.', 'error'); return; }
    if (EMAIL_SETTING_FIELDS.has(key) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    const lv = latestRef.current;
    if (val !== lv[key]) {
      if (key === 'SchoolYear' || key === 'Semester') {
        const ok = await showConfirm(
          `Change the Academic Period?\n\n${labelFor(key)}:  ${lv[key] || '—'}  →  ${val}\n\nThis updates every portal immediately.`,
          { confirmText: 'Change Period', cancelText: 'Cancel', variant: 'primary' }
        );
        if (!ok) return;
      } else {
        const ok = await showConfirm(
          `Save this change?\n\n${labelFor(key)}:  ${lv[key] || '—'}  →  ${val}`,
          { confirmText: 'Save', cancelText: 'Cancel', variant: 'primary' }
        );
        if (!ok) return;
      }
    }

    setBtn(b => ({ ...b, [key]: { text: 'Saving…', disabled: true, saved: false } }));
    try {
      await apiRequest(`Settings/${key}`, 'PUT', { value: val }, true);
      setLatestBoth({ ...latestRef.current, [key]: val });
      showToast(`${labelFor(key)} updated.`, 'success');
      flashBtn(key, 'Saved ✓');
    } catch (e) {
      showToast(`Failed to update ${labelFor(key)}.`, 'error');
      setBtn(b => ({ ...b, [key]: { text: 'Save', disabled: false, saved: false } }));
    }
  }

  // ── SAVE (per card) ──
  // One Save per card; only changed fields are sent, after one confirmation.
  // SchoolYear goes before Semester so the outgoing period is snapshotted with its own semester.
  async function saveGroup(group) {
    if (!isUnlocked) return;
    const { button, keys } = SETTING_GROUPS[group];
    const lv = latestRef.current;
    const changes = [];
    for (const key of keys) {
      const raw = vals[key];
      const val = key === 'Semester' ? raw : String(raw ?? '').trim();
      const isEmail = EMAIL_SETTING_FIELDS.has(key);
      if (!val && !isEmail) { showToast(`${labelFor(key)} cannot be empty.`, 'error'); document.getElementById(`field${key}`)?.focus(); return; }
      if (val && isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        showToast(`Please enter a valid ${labelFor(key)}.`, 'error'); document.getElementById(`field${key}`)?.focus(); return;
      }
      if (key === 'SchoolYear') {
        const m = /^(\d{4})-(\d{4})$/.exec(val);
        if (!m || Number(m[2]) !== Number(m[1]) + 1) {
          showToast('School Year must be consecutive years, e.g. 2026-2027.', 'error'); document.getElementById(`field${key}`)?.focus(); return;
        }
      }
      if (val !== (lv[key] ?? '')) changes.push({ key, val });
    }
    if (!changes.length) { showToast('No changes to save.', 'success'); return; }

    const lines = changes.map(c => `${labelFor(c.key)}:  ${lv[c.key] || '—'}  →  ${c.val || '(blank)'}`).join('\n');
    const yearChange = changes.find(c => c.key === 'SchoolYear');
    const forwardYear = yearChange && startYear(yearChange.val) > (startYear(lv.SchoolYear) ?? Infinity);
    let message;
    if (group === 'academic') {
      message = `Change the Academic Period?\n\n${lines}\n\nThis updates every portal immediately.`;
      if (forwardYear) message += '\n\nA new school year ends every current mentor–mentee assignment. Accounts and history are kept; assign mentees again for the new year.';
    } else {
      message = `Save these changes?\n\n${lines}`;
    }
    const ok = await showConfirm(message, {
      confirmText: group === 'academic' ? 'Change Period' : 'Save',
      cancelText: 'Cancel',
      variant: 'primary',
    });
    if (!ok) return;

    setBtn(b => ({ ...b, [button]: { text: 'Saving…', disabled: true, saved: false } }));
    try {
      let nextLatest = { ...latestRef.current };
      for (const c of changes) {
        await apiRequest(`Settings/${c.key}`, 'PUT', { value: c.val }, true);
        nextLatest = { ...nextLatest, [c.key]: c.val };
        latestRef.current = nextLatest;
      }
      setLatestBoth(nextLatest);
      showToast(group === 'academic' ? 'Academic period updated.' : 'Signatories updated.', 'success');
      flashBtn(button, 'Saved ✓');
    } catch (e) {
      showToast(`Some changes were not saved: ${e.message || 'please reload and try again.'}`, 'error');
      setBtn(b => ({ ...b, [button]: { text: 'Save', disabled: false, saved: false } }));
    }
  }

  // ── LOCK / UNLOCK ──
  function lockSettings() {
    // Discard any typed-but-unsaved edits by reloading the last known saved values before re-disabling the fields.
    const data = latestRef.current;
    setVals(v => { const next = fieldsFrom(data); if (!data.Semester) next.Semester = v.Semester; return next; });
    setMaint(maintFrom(data));
    setIsUnlocked(false);
  }

  function openUnlock() {
    setUnlockPw(''); setUnlockErr(''); setUnlockOpen(true);
    setTimeout(() => document.getElementById('unlockPasswordInput')?.focus(), 80);
  }
  async function submitUnlock() {
    if (unlockBusy) return;
    if (!unlockPw) { setUnlockErr('Please enter the settings password.'); return; }
    setUnlockBusy(true);
    setUnlockErr('');
    try {
      await apiRequest('Settings/verify-password', 'POST', { password: unlockPw }, true);
      setUnlockOpen(false);
      setIsUnlocked(true);
    } catch (error) {
      setUnlockErr(error.status === 400 ? error.message : 'Unable to verify the settings password. Please try again.');
      setTimeout(() => document.getElementById('unlockPasswordInput')?.select(), 0);
    } finally {
      setUnlockBusy(false);
    }
  }

  // ── CHANGE SETTINGS PASSWORD ──
  function cpReset() {
    cpTokenRef.current = null; setCpToken(null);
    clearInterval(cpTimer.current);
    setCpCurrent(''); setCpCurrentDisabled(false);
    setCpSend({ text: 'Send Code', disabled: false });
    setCpCode(''); setCpCodeDisabled(true);
    setCpVerify({ text: 'Verify', disabled: true });
    setCpErr('');
    setCpInd({ state: '', node: CP_DEFAULT });
    setCpNew(''); setCpConfirm(''); setCpLocked(true);
  }

  function cpCooldown(seconds) {
    let left = Math.max(1, seconds | 0);
    clearInterval(cpTimer.current);
    const tick = () => {
      if (left > 0) setCpSend({ text: `Resend (${left}s)`, disabled: true });
      else setCpSend({ text: 'Resend Code', disabled: true });
      if (left-- <= 0) { clearInterval(cpTimer.current); setCpSend({ text: 'Resend Code', disabled: false }); }
    };
    tick();
    cpTimer.current = setInterval(tick, 1000);
  }

  async function sendSettingsCode() {
    setCpErr('');
    if (!cpCurrent) { setCpErr('Please enter the current settings password.'); return; }
    setCpSend({ text: 'Sending…', disabled: true });
    try {
      const res = await apiRequest('Settings/password-code', 'POST', { password: cpCurrent }, true);
      setCpCodeDisabled(false); setCpCode('');
      setCpVerify(v => ({ ...v, disabled: false }));
      setTimeout(() => document.getElementById('cpCodeInput')?.focus(), 0);
      setCpInd({ state: 'sent', node: <>Verification code sent to <b>{res?.email || 'your email'}</b>. It expires in 10 minutes — check your spam folder if you don’t see it.</> });
      cpCooldown(res?.resendAfterSeconds || 45);
    } catch (err) {
      const wait = err.status === 429 ? parseInt((err.message.match(/\d+/) || [15])[0], 10) : 0;
      setCpErr(err.message || 'Could not send the code. Please try again.');
      if (wait) cpCooldown(wait); else setCpSend({ text: 'Send Code', disabled: false });
    }
  }

  async function verifySettingsCode() {
    setCpErr('');
    const code = cpCode.trim();
    if (!/^\d{6}$/.test(code)) { setCpErr('Enter the 6-digit code from your email.'); return; }
    setCpVerify({ text: 'Verifying…', disabled: true });
    try {
      const res = await apiRequest('Settings/password-code/verify', 'POST', { code }, true);
      cpTokenRef.current = res?.token || null; setCpToken(cpTokenRef.current);
      clearInterval(cpTimer.current);
      setCpCurrentDisabled(true);
      setCpSend({ text: 'Verified', disabled: true });
      setCpCodeDisabled(true);
      setCpVerify({ text: 'Verified', disabled: true });
      setCpInd({ state: 'ok', node: <><b>Verified!</b> You can now choose the new settings password.</> });
      setCpLocked(false);
      setTimeout(() => document.getElementById('cpNewInput')?.focus(), 0);
    } catch (err) {
      setCpErr(err.message || 'Could not verify the code.');
      setCpVerify({ text: 'Verify', disabled: false });
      if (err.restart) {
        setCpCode('');
        setCpInd({ state: 'err', node: <>That code can no longer be used. Tap <b>Send Code</b> to get a new one.</> });
        clearInterval(cpTimer.current);
        setCpSend({ text: 'Send Code', disabled: false });
      }
    }
  }

  function openChangePassword() {
    cpReset();
    setCpOpen(true);
    setTimeout(() => document.getElementById('cpCurrentInput')?.focus(), 80);
  }

  async function submitChangePassword() {
    if (cpBusy) return;
    setCpErr('');
    if (!cpTokenRef.current)          { setCpErr('Verify the current password with the emailed code first.'); return; }
    if (!cpNew || !cpConfirm)         { setCpErr('Please fill in all fields.'); return; }
    if (cpNew.length < 6)             { setCpErr('New password must be at least 6 characters.'); return; }
    if (cpNew !== cpConfirm)          { setCpErr('New passwords do not match.'); return; }

    setCpBusy(true);
    try {
      await apiRequest('Settings/change-password', 'PUT', { currentPassword: cpCurrent, newPassword: cpNew, token: cpTokenRef.current }, true);
      cpTokenRef.current = null; setCpToken(null);
      setCpOpen(false);
      showToast('Settings password changed successfully.', 'success');
    } catch (error) {
      setCpErr(error.status === 400 ? error.message : 'Unable to change the settings password. Please try again.');
      if (error.restart) cpReset();
    } finally {
      setCpBusy(false);
    }
  }

  // ── MAINTENANCE MODE ──
  function setMaintEta(minutesOrKey) {
    if (!isUnlocked) return;
    if (minutesOrKey == null) { setMaint(m => ({ ...m, eta: '' })); return; }
    const d = new Date();
    if (minutesOrKey === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
    else d.setMinutes(d.getMinutes() + minutesOrKey);
    setMaint(m => ({ ...m, eta: maintToLocalInput(d.toISOString()) }));
  }

  async function saveMaintenance() {
    if (!isUnlocked) return;
    const { mentor, mentee } = maint;
    const message = maint.message.trim();
    const lv = latestRef.current;

    let etaIso = '';
    if (maint.eta) {
      const d = new Date(maint.eta);
      if (isNaN(d.getTime())) { showToast('Please enter a valid estimated time.', 'error'); return; }
      if ((mentor || mentee) && d.getTime() < Date.now()) { showToast('The estimated time must be in the future.', 'error'); return; }
      etaIso = d.toISOString();
    }

    const wasOn = lv.MaintenanceMentor === '1' || lv.MaintenanceMentee === '1';
    const unchanged = (lv.MaintenanceMentor === '1') === mentor && (lv.MaintenanceMentee === '1') === mentee &&
      (lv.MaintenanceEta || '') === (etaIso ? new Date(etaIso).toISOString() : '') && (lv.MaintenanceMessage || '') === message;
    if (unchanged) { showToast('No changes to save.', 'success'); return; }

    const who = [mentor && 'Mentor', mentee && 'Mentee'].filter(Boolean).join(' and ');
    const prompt = (mentor || mentee)
      ? `Put the ${who} portal${mentor && mentee ? 's' : ''} under maintenance?\n\nEveryone in ${mentor && mentee ? 'those portals' : 'that portal'} will be stopped right away and shown the maintenance screen${etaIso ? ' with your estimated time' : ''}. Admin and Head are not affected.`
      : (wasOn ? 'Reopen the Mentor and Mentee portals?\n\nEveryone can log in and use the system again.' : 'Save these maintenance details?');
    const ok = await showConfirm(prompt, { confirmText: (mentor || mentee) ? 'Start Maintenance' : (wasOn ? 'Reopen Portals' : 'Save'), cancelText: 'Cancel', variant: (mentor || mentee) ? 'danger' : 'primary' });
    if (!ok) return;

    setBtn(b => ({ ...b, maintenance: { text: 'Applying…', disabled: true, saved: false } }));
    try {
      const res = await apiRequest('Settings/maintenance', 'PUT', { mentor, mentee, eta: etaIso || null, message }, true);
      setLatestBoth({
        ...latestRef.current,
        MaintenanceMentor: mentor ? '1' : '0',
        MaintenanceMentee: mentee ? '1' : '0',
        MaintenanceEta: res?.eta || '',
        MaintenanceMessage: message,
      });
      if (mentor || mentee) {
        const etaTxt = etaIso ? ` Back by ${new Date(etaIso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : '';
        notify(`${who} ${mentor && mentee ? 'portals are' : 'portal is'} now closed to users. Admin and Head can still sign in.${etaTxt}`, 'warning', 8000, 'Maintenance mode is on');
      } else {
        notify('The Mentor and Mentee portals are open again. Everyone can sign in and use the system.', 'success', 6000, 'Portals reopened');
      }
      flashBtn('maintenance', 'Applied ✓');
    } catch (e) {
      showToast(e.message || 'Failed to update maintenance mode.', 'error');
      setBtn(b => ({ ...b, maintenance: { text: 'Apply', disabled: false, saved: false } }));
    }
  }

  // Maintenance status line
  const mentorOn = latest.MaintenanceMentor === '1', menteeOn = latest.MaintenanceMentee === '1';
  let maintLine = 'Both portals are open.';
  if (mentorOn || menteeOn) {
    const who = [mentorOn && 'Mentor', menteeOn && 'Mentee'].filter(Boolean).join(' and ');
    maintLine = `${who} ${mentorOn && menteeOn ? 'portals are' : 'portal is'} under maintenance now.`;
    if (latest.MaintenanceEta) {
      const d = new Date(latest.MaintenanceEta);
      if (!isNaN(d.getTime())) maintLine += ` Estimated back ${d.toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`;
    }
  }

  const dis = !isUnlocked;
  const saveBtnProps = (id, label = 'Save') => {
    const b = btn[id];
    return {
      className: `btn-save${b?.saved ? ' btn-save-saved' : ''}`,
      disabled: b?.disabled || undefined,
      children: b?.text ?? label,
    };
  };
  const textInput = (key, props = {}) => (
    <input className="settings-input" id={`field${key}`} value={vals[key] ?? ''} onChange={e => setVal(key, e.target.value)} disabled={dis} {...props} />
  );

  return (
    <Page id="ADMIN_/settings">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>System Settings</h1>
            <p>School-wide configuration used across the system and on printed documents</p>
          </div>

          {/* Lock Banner */}
          <div className="settings-lock-banner" id="lockBanner">
            <div className="slb-left">
              <div className={`slb-icon ${isUnlocked ? 'unlocked' : 'locked'}`} id="lockIcon">
                <svg className="icon-locked" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: isUnlocked ? 'none' : undefined }}>{LOCK_PATH}</svg>
                <svg className="icon-unlocked" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: isUnlocked ? undefined : 'none' }}>{UNLOCK_PATH}</svg>
              </div>
              <div>
                <div className="slb-title" id="lockTitle">{isUnlocked ? 'Settings unlocked' : 'Settings are locked'}</div>
                <div className="slb-sub" id="lockSub">{isUnlocked ? 'You can now edit any field below.' : 'Enter the settings password to make changes.'}</div>
              </div>
            </div>
            <div className="slb-right">
              <div className="slb-actions-locked" id="lockActionsLocked" style={{ display: isUnlocked ? 'none' : '' }}>
                <button className="slb-btn unlock" onClick={openUnlock}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{UNLOCK_PATH}</svg>
                  Unlock to Edit
                </button>
              </div>
              <div className="slb-actions-unlocked" id="lockActionsUnlocked" style={{ display: isUnlocked ? '' : 'none' }}>
                <button className="slb-btn-change" onClick={openChangePassword}>Change Password</button>
                <button className="slb-btn lock-again" onClick={lockSettings}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{LOCK_PATH}</svg>
                  Lock
                </button>
              </div>
            </div>
          </div>

          <div className={`settings-grid${isUnlocked ? '' : ' settings-locked'}`} id="settingsGrid">
            <div className="settings-col">
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-icon blue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  </div>
                  <div>
                    <div className="settings-card-title">Academic Period</div>
                    <div className="settings-card-sub">Current school year and semester shown on logsheets, reports, and every portal's dashboard</div>
                  </div>
                </div>
                <div className="settings-fields">
                  <div className="settings-field">
                    <label className="settings-label">School Year</label>
                    {textInput('SchoolYear', { type: 'text', placeholder: 'e.g. 2025-2026' })}
                    <div className="settings-hint">Format: YYYY-YYYY (e.g. 2025-2026)</div>
                  </div>
                  <div className="settings-field">
                    <label className="settings-label">Semester</label>
                    <select className="settings-input" id="fieldSemester" value={vals.Semester ?? '1st Semester'} onChange={e => setVal('Semester', e.target.value)} disabled={dis}>
                      <option value="1st Semester">1st Semester</option>
                      <option value="2nd Semester">2nd Semester</option>
                      <option value="Summer">Summer</option>
                    </select>
                  </div>
                  <div className="settings-card-actions">
                    <button id="saveAcademicPeriodBtn" onClick={() => saveGroup('academic')} {...saveBtnProps('academic')} />
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-icon green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </div>
                  <div>
                    <div className="settings-card-title">Guidance Office</div>
                    <div className="settings-card-sub">Officer name printed on Non-Attendance forms submitted to the Guidance Office</div>
                  </div>
                </div>
                <div className="settings-fields">
                  <div className="settings-field">
                    <label className="settings-label">Guidance Officer</label>
                    {textInput('GuidanceOfficer', { type: 'text', placeholder: 'e.g. Ms. Ghenill R. Manto' })}
                    <div className="settings-hint">Full name with title (e.g. Ms. Juan Dela Cruz)</div>
                  </div>
                  <div className="settings-card-actions">
                    <button onClick={() => saveSetting('GuidanceOfficer')} {...saveBtnProps('GuidanceOfficer')} />
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-col">
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-icon indigo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M9 16l2 2 4-4" /></svg>
                  </div>
                  <div>
                    <div className="settings-card-title">Calendar Sheet Signatories</div>
                    <div className="settings-card-sub">Printed on the Calendar of Activities sheet (Calendar &amp; Events → Sheet Preview)</div>
                  </div>
                </div>
                <div className="settings-fields">
                  <div className="settings-fields-2col">
                    <div className="settings-group">
                      <div className="settings-group-title">Prepared By</div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="fieldcalPreparedByName">Full Name</label>
                        {textInput('calPreparedByName', { type: 'text', placeholder: 'e.g. Juan Dela Cruz, RPm' })}
                      </div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="fieldcalPreparedByTitle">Title</label>
                        {textInput('calPreparedByTitle', { type: 'text', placeholder: 'e.g. Assistant, Guidance and Counseling Office' })}
                      </div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="fieldcalPreparedByEmail">Email</label>
                        {textInput('calPreparedByEmail', { type: 'email', placeholder: 'e.g. juan.delacruz@firstasia.edu.ph' })}
                        <div className="settings-hint">Matches this person's own account — their uploaded e-signature is printed on the sheet automatically. Leave blank to print the name only.</div>
                      </div>
                    </div>
                    <div className="settings-group">
                      <div className="settings-group-title">Approved By</div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="fieldcalApprovedByName">Full Name</label>
                        {textInput('calApprovedByName', { type: 'text', placeholder: 'e.g. Maria Santos, EdD' })}
                      </div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="fieldcalApprovedByTitle">Title</label>
                        {textInput('calApprovedByTitle', { type: 'text', placeholder: 'e.g. Senior Vice President, Student and Alumni Services' })}
                      </div>
                      <div className="settings-field">
                        <label className="settings-label" htmlFor="fieldcalApprovedByEmail">Email</label>
                        {textInput('calApprovedByEmail', { type: 'email', placeholder: 'e.g. maria.santos@firstasia.edu.ph' })}
                        <div className="settings-hint">Matches this person's own account — their uploaded e-signature is printed on the sheet automatically. Leave blank to print the name only.</div>
                      </div>
                    </div>
                  </div>
                  <div className="settings-card-actions">
                    <button id="saveSignatoriesBtn" onClick={() => saveGroup('signatories')} {...saveBtnProps('signatories')} />
                  </div>
                </div>
              </div>
            </div>

            {/* Maintenance Mode (full width) */}
            <div className="settings-card settings-card-wide" id="maintenanceCard">
              <div className="settings-card-header">
                <div className="settings-card-icon amber">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                </div>
                <div>
                  <div className="settings-card-title">Maintenance Mode</div>
                  <div className="settings-card-sub">Temporarily close the Mentor and/or Mentee portal. Admin and Head stay available. Closed users see a maintenance screen with your message and estimated time.</div>
                </div>
              </div>
              <div className="settings-fields">
                <div className={`maint-status${mentorOn || menteeOn ? ' on' : ''}`} id="maintStatus"><span className="maint-dot"></span><span id="maintStatusText">{maintLine}</span></div>
                <div className="maint-body">
                  <div className="maint-col">
                    <div className="settings-label">Portals under maintenance</div>
                    <label className={`maint-toggle${maint.mentor ? ' on' : ''}`} id="maintMentorRow">
                      <span className="maint-toggle-text"><span className="maint-toggle-title">Mentor portal</span><span className="maint-toggle-sub">Mentors can’t log in or use their dashboard</span></span>
                      <span className="switch"><input type="checkbox" id="fieldMaintMentor" checked={maint.mentor} onChange={e => setMaint(m => ({ ...m, mentor: e.target.checked }))} disabled={dis} /><span className="slider"></span></span>
                    </label>
                    <label className={`maint-toggle${maint.mentee ? ' on' : ''}`} id="maintMenteeRow">
                      <span className="maint-toggle-text"><span className="maint-toggle-title">Mentee portal</span><span className="maint-toggle-sub">Mentees can’t log in or use their dashboard</span></span>
                      <span className="switch"><input type="checkbox" id="fieldMaintMentee" checked={maint.mentee} onChange={e => setMaint(m => ({ ...m, mentee: e.target.checked }))} disabled={dis} /><span className="slider"></span></span>
                    </label>
                    <div className="settings-hint">Turn on one or both. People already signed in are stopped on their next action.</div>
                  </div>
                  <div className="maint-col">
                    <div className="settings-field">
                      <label className="settings-label" htmlFor="fieldMaintEta">Estimated time to fix</label>
                      <input type="datetime-local" className="settings-input" id="fieldMaintEta" min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} value={maint.eta} onChange={e => setMaint(m => ({ ...m, eta: e.target.value }))} disabled={dis} />
                      <div className="maint-chips" id="maintChips">
                        <button type="button" className="maint-chip" onClick={() => setMaintEta(30)}>+30 min</button>
                        <button type="button" className="maint-chip" onClick={() => setMaintEta(60)}>+1 hr</button>
                        <button type="button" className="maint-chip" onClick={() => setMaintEta(180)}>+3 hrs</button>
                        <button type="button" className="maint-chip" onClick={() => setMaintEta('tomorrow')}>Tomorrow 8 AM</button>
                        <button type="button" className="maint-chip ghost" onClick={() => setMaintEta(null)}>Clear</button>
                      </div>
                    </div>
                    <div className="settings-field">
                      <label className="settings-label" htmlFor="fieldMaintMessage">Message to users <span className="settings-opt">(optional)</span></label>
                      <textarea className="settings-input settings-textarea" id="fieldMaintMessage" maxLength={250} rows={3}
                        placeholder="What’s being worked on? e.g. We’re upgrading the database to make things faster."
                        value={maint.message} onChange={e => setMaint(m => ({ ...m, message: e.target.value }))} disabled={dis}></textarea>
                      <div className="settings-hint"><span id="maintMsgCount">{maint.message.length}</span> / 250</div>
                    </div>
                  </div>
                </div>
                <div className="settings-card-actions">
                  <button id="saveMaintenanceBtn" onClick={saveMaintenance} {...saveBtnProps('maintenance', 'Apply')} />
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {/* Toast */}
      <div className={`toast${toast.msg ? ` ${toast.type}` : ''}${toast.show ? ' show' : ''}`} id="toast">{toast.msg}</div>

      {/* Settings Unlock Modal */}
      <Overlay open={unlockOpen} className="settings-modal-overlay" activeClass={null} display="flex" id="unlockOverlay">
        <div className="settings-modal">
          <div className="settings-modal-icon lock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{LOCK_PATH}</svg>
          </div>
          <h3 className="settings-modal-title">Settings Password</h3>
          <p className="settings-modal-sub">Enter the settings password to edit System Settings.</p>
          <div className="settings-modal-field">
            <PwdField id="unlockPasswordInput" value={unlockPw} onChange={setUnlockPw} placeholder="Settings password" onEnter={submitUnlock} />
            <div className="settings-modal-error" id="unlockError">{unlockErr}</div>
          </div>
          <div className="settings-modal-actions">
            <button type="button" className="smb-cancel" onClick={() => setUnlockOpen(false)}>Cancel</button>
            <button type="button" className="smb-confirm" id="unlockBtn" onClick={submitUnlock} disabled={unlockBusy}>{unlockBusy ? 'Verifying…' : 'Confirm'}</button>
          </div>
        </div>
      </Overlay>

      {/* Settings Change Password Modal */}
      <Overlay open={cpOpen} className="settings-modal-overlay" activeClass={null} display="flex" id="changePassOverlay">
        <div className="settings-modal">
          <div className="settings-modal-icon key">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
          </div>
          <h3 className="settings-modal-title">Change Settings Password</h3>
          <p className="settings-modal-sub">Choose a new password for unlocking System Settings.</p>
          <div className="settings-modal-field">
            <label className="settings-modal-label">Current Password <span className="req">*</span></label>
            <div className="cp-verify-row">
              <PwdField id="cpCurrentInput" value={cpCurrent} onChange={setCpCurrent} placeholder="Current settings password" disabled={cpCurrentDisabled} />
              <button type="button" className="cp-act" id="cpSendBtn" onClick={sendSettingsCode} disabled={cpSend.disabled}>{cpSend.text}</button>
            </div>
          </div>
          <div className="settings-modal-field">
            <label className="settings-modal-label">Verification Code</label>
            <div className="cp-verify-row">
              <input type="text" id="cpCodeInput" className="settings-modal-input" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="Enter 6-digit code"
                disabled={cpCodeDisabled} value={cpCode} onChange={e => setCpCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); verifySettingsCode(); } }} />
              <button type="button" className="cp-act" id="cpVerifyBtn" onClick={verifySettingsCode} disabled={cpVerify.disabled}>{cpVerify.text}</button>
            </div>
            <div className={`cp-indicator${cpInd.state ? ' ' + cpInd.state : ''}`} id="cpIndicator"><span id="cpIndicatorText">{cpInd.node}</span></div>
          </div>
          <div className={`cp-locked${cpLocked ? ' locked' : ''}`} id="cpLocked">
            <div className="cp-lock-hint" id="cpLockHint">{cpLocked ? 'Locked until the current password is verified.' : 'Unlocked — choose the new settings password.'}</div>
            <div className="settings-modal-field">
              <label className="settings-modal-label">New Password <span className="req">*</span></label>
              <PwdField id="cpNewInput" value={cpNew} onChange={setCpNew} placeholder="New password (min. 6 characters)" autoComplete="new-password" disabled={cpLocked} />
            </div>
            <div className="settings-modal-field">
              <label className="settings-modal-label">Confirm New Password <span className="req">*</span></label>
              <PwdField id="cpConfirmInput" value={cpConfirm} onChange={setCpConfirm} placeholder="Re-enter new password" autoComplete="new-password" disabled={cpLocked} onEnter={submitChangePassword} />
              <div className="settings-modal-error" id="cpError">{cpErr}</div>
            </div>
          </div>
          <div className="settings-modal-actions">
            <button type="button" className="smb-cancel" onClick={() => setCpOpen(false)}>Cancel</button>
            <button type="button" className="smb-confirm" id="cpBtn" onClick={submitChangePassword} disabled={cpBusy}>{cpBusy ? 'Saving…' : 'Change Password'}</button>
          </div>
        </div>
      </Overlay>
    </Page>
  );
}
