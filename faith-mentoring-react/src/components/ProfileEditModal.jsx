import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { validatePassword } from '../lib/passwordPolicy.js';
import { getSession } from '../lib/session.js';
import { ConfirmX } from './ConfirmX.jsx';
import PasswordMeter from './PasswordMeter.jsx';

// "Edit Profile" modal for the Admin, Mentor and Mentee profile pages (the original profile-edit.js):
// contact number, and change password: current password → emailed 6-digit code → new password unlocked.
// `user` is the signed-in session user; `studentNumber` is the profile page's displayed value (Mentee);
// `mentorProfile` carries department/school for a Mentor's save; `onSaved` reloads the profile.
const INDICATOR = {
  '': ['ti-mail', <>Enter your current password and tap <b>Send Code</b> — we’ll email a 6-digit verification code to your account email.</>],
  ok: ['ti-circle-check', <><b>Verified!</b> Your identity is confirmed — you can now choose a new password.</>],
  err: ['ti-alert-circle', <>That code can no longer be used. Tap <b>Send Code</b> to get a new one.</>],
};

const EYE = (
  <svg className="eye-icon" viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);
const EYE_OFF = (
  <svg className="eye-off-icon" viewBox="0 0 24 24">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

function PwField({ id, value, onChange, shown, onToggle, disabled, placeholder, autoComplete, inputRef, policy }) {
  return (
    <div className="pe-pw">
      <input type={shown ? 'text' : 'password'} id={id} placeholder={placeholder} autoComplete={autoComplete} disabled={disabled}
        ref={inputRef} value={value} onChange={e => onChange(e.target.value)} {...(policy ? { 'data-pw-policy': '', 'data-pw-attached': '1' } : {})} />
      {' '}
      <button type="button" className="btn-pw-eye" onClick={onToggle} tabIndex="-1" aria-label="Show or hide password">
        <EyeIcons shown={shown} />
      </button>
    </div>
  );
}
function EyeIcons({ shown }) {
  return <>
    <svg className="eye-icon" viewBox="0 0 24 24" style={shown ? { display: 'none' } : undefined}>{EYE.props.children}</svg>
    {' '}
    <svg className="eye-off-icon" viewBox="0 0 24 24" style={shown ? undefined : { display: 'none' }}>{EYE_OFF.props.children}</svg>
  </>;
}

export default function ProfileEditModal({ open, onClose, user, studentNumber, mentorProfile, onSaved }) {
  const [contact, setContact] = useState('');
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [shown, setShown] = useState({});
  const [errors, setErrors] = useState({});           // currentPwError, newPwError, confirmPwError, codeError
  const [formError, setFormError] = useState('');
  const [flow, setFlow] = useState('idle');            // idle | sent | verified
  const [indicator, setIndicator] = useState({ state: '', email: '' });
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(null);      // null: not started; else seconds left before "Resend Code"
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const token = useRef(null);
  const timer = useRef(null);
  const codeRef = useRef(null);
  const newPwRef = useRef(null);

  const stopTimer = () => clearInterval(timer.current);
  // Focus moves once the field has re-rendered as enabled (a disabled input can't take focus).
  const [focusTo, setFocusTo] = useState(null);
  useEffect(() => {
    if (focusTo === 'code') codeRef.current?.focus();
    if (focusTo === 'newPw') newPwRef.current?.focus();
    if (focusTo) setFocusTo(null);
  }, [focusTo]);
  useEffect(() => stopTimer, []);

  function resetPwFlow() {
    token.current = null;
    stopTimer();
    setFlow('idle');
    setCode('');
    setCooldown(null);
    setSending(false);
    setVerifying(false);
    setIndicator({ state: '', email: '' });
    setPw(''); setPw2('');
    setShown(s => ({ ...s, pw: false, pw2: false }));
  }

  // Opening resets the form to the session user's contact number and a fresh password flow.
  useEffect(() => {
    if (!open) return;
    setContact(user?.contactNumber || user?.ContactNumber || '');
    setCurrent(''); setShown({});
    setErrors({}); setFormError('');
    resetPwFlow();
  }, [open]);

  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (confirmOpen) setConfirmOpen(false);
      else if (open) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, confirmOpen]);

  function startCooldown(seconds) {
    let left = Math.max(1, seconds | 0);
    stopTimer();
    setCooldown(left);
    timer.current = setInterval(() => {
      left--;
      setCooldown(left);
      if (left <= 0) stopTimer();
    }, 1000);
  }

  async function sendPwCode() {
    setErrors({}); setFormError('');
    if (!current) { setErrors({ currentPwError: 'Please enter your current password.' }); return; }
    setSending(true);
    try {
      const res = await apiRequest('Auth/password-code', 'POST', { currentPassword: current }, true);
      setFlow('sent');
      setCode('');
      setFocusTo('code');
      setIndicator({ state: 'sent', email: res?.email || 'your email' });
      startCooldown(res?.resendAfterSeconds || 45);
    } catch (err) {
      const wait = err.status === 429 ? parseInt((err.message.match(/\d+/) || [15])[0], 10) : 0;
      setErrors({ currentPwError: err.message || 'Could not send the code. Please try again.' });
      if (wait) startCooldown(wait);
    } finally {
      setSending(false);
    }
  }

  async function verifyPwCode() {
    setErrors(e => ({ ...e, codeError: '' }));
    if (!/^\d{6}$/.test(code.trim())) { setErrors(e => ({ ...e, codeError: 'Enter the 6-digit code from your email.' })); return; }
    setVerifying(true);
    try {
      const res = await apiRequest('Auth/password-code/verify', 'POST', { code: code.trim() }, true);
      token.current = res?.token || null;
      stopTimer();
      setFlow('verified');
      setIndicator({ state: 'ok' });
      setFocusTo('newPw');
    } catch (err) {
      setErrors(e => ({ ...e, codeError: err.message || 'Could not verify the code.' }));
      if (err.restart) {
        setCode('');
        setIndicator({ state: 'err' });
        stopTimer();
        setCooldown(null);
        setFlow('restart');
      }
    } finally {
      setVerifying(false);
    }
  }

  function confirmSave() {
    setErrors({}); setFormError('');
    if (pw || pw2) {
      const next = {};
      if (!token.current) next.currentPwError = 'Verify your current password with the emailed code first.';
      if (!pw) next.newPwError = 'Please enter a new password.';
      else if (validatePassword(pw)) next.newPwError = validatePassword(pw);
      if (pw && !pw2) next.confirmPwError = 'Please confirm your new password.';
      else if (pw && pw2 && pw !== pw2) next.confirmPwError = 'Passwords do not match.';
      if (Object.keys(next).length) { setErrors(next); return; }
    }
    setConfirmOpen(true);
  }

  function payload() {
    const u = user || {};
    const role = u.role || u.Role;
    const p = { FirstName: u.firstName || u.FirstName || '', LastName: u.lastName || u.LastName || '', Email: u.email || u.Email || '', ContactNumber: contact.trim() || null, Role: role };
    if (role === 'Mentor' && mentorProfile) { p.DepartmentID = mentorProfile.departmentID || null; p.School = mentorProfile.school || ''; }
    if (role === 'Mentee') {
      const sn = (studentNumber || '').trim();
      p.StudentNumber = sn && sn !== '—' ? sn : (u.studentNumber || u.StudentNumber || null);
    } else if (u.studentNumber || u.StudentNumber) {
      p.StudentNumber = u.studentNumber || u.StudentNumber;
    }
    return p;
  }

  async function save() {
    const userId = user?.userID || user?.UserID || user?.userId;
    const c = contact.trim();
    setSaving(true);
    try {
      await apiRequest(`Users/${userId}`, 'PUT', payload(), true);
      if (token.current && pw) {
        await apiRequest('Auth/change-password', 'POST', { currentPassword: current, newPassword: pw, token: token.current }, true);
        token.current = null;
      }
      const session = getSession();
      if (session && session.user) {
        const storage = localStorage.getItem('_sessionType') === 'session' ? sessionStorage : localStorage;
        storage.setItem('user', JSON.stringify({ ...session.user, contactNumber: c, ContactNumber: c }));
      }
      await onSaved?.();
      setSavedFlash(true);
      await new Promise(r => setTimeout(r, 700));
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      setConfirmOpen(false);
      const msg = err.message || 'Failed to update profile. Please try again.';
      if (err.restart) resetPwFlow();
      if (msg.toLowerCase().includes('password')) setErrors({ currentPwError: msg }); else setFormError(msg);
    } finally {
      setSaving(false);
      setSavedFlash(false);
    }
  }

  const verified = flow === 'verified';
  const codeEnabled = flow === 'sent';
  const [icon, text] = indicator.state === 'sent'
    ? ['ti-mail-check', <>Verification code sent to <b>{indicator.email}</b>. It expires in 10 minutes — check your spam folder if you don’t see it.</>]
    : INDICATOR[indicator.state];
  const sendLabel = verified ? 'Verified' : sending ? 'Sending…' : cooldown === null ? 'Send Code' : cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend Code';

  return (
    <>
      <div id="peModal" className="pe-overlay" style={{ display: open ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="pe-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="peTitle">
          <button type="button" className="pe-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          {' '}
          <h2 className="pe-title" id="peTitle">Edit Profile</h2>
          {' '}
          <p className="pe-sub">Update your contact number or change your password.</p>
          {' '}
          <div id="editError" className="pe-error" style={{ display: formError ? 'block' : 'none' }}>{formError}</div>
          {' '}
          <div className="pe-form">
            <div className="pe-group">
              <label htmlFor="editContact">Contact Number{' '}<span className="pe-opt">(optional)</span></label>
              {' '}
              <input type="text" id="editContact" placeholder="09XXXXXXXXX" autoComplete="tel" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
            {' '}
            <div className="pe-section">Change Password</div>
            {' '}
            <div className="pe-group">
              <label htmlFor="editCurrentPassword">Current Password{' '}<span className="pe-req">*</span></label>
              {' '}
              <div className="pe-verify-row">
                <PwField id="editCurrentPassword" value={current} onChange={setCurrent} shown={!!shown.current} onToggle={() => setShown(s => ({ ...s, current: !s.current }))}
                  disabled={verified} placeholder="Enter your current password" autoComplete="current-password" />
                {' '}
                <button type="button" className="btn-verify-act" id="btnSendCode" disabled={verified || sending || cooldown > 0} onClick={sendPwCode}>{sendLabel}</button>
              </div>
              {' '}
              <span className="pe-field-error" id="currentPwError">{errors.currentPwError || ''}</span>
            </div>
            {' '}
            <div className="pe-group">
              <label htmlFor="editPwCode">Verification Code</label>
              {' '}
              <div className="pe-verify-row">
                <input type="text" id="editPwCode" inputMode="numeric" maxLength="6" autoComplete="one-time-code" placeholder="Enter 6-digit code"
                  disabled={!codeEnabled} ref={codeRef} value={code} onChange={e => setCode(e.target.value)} />
                {' '}
                <button type="button" className="btn-verify-act" id="btnVerifyCode" disabled={!codeEnabled || verifying} onClick={verifyPwCode}>
                  {verified ? 'Verified' : verifying ? 'Verifying…' : 'Verify'}
                </button>
              </div>
              {' '}
              <div className={'code-indicator' + (indicator.state ? ' ' + indicator.state : '')} id="codeIndicator">
                <i className={'ti ' + icon}></i>
                {' '}
                <span id="codeIndicatorText">{text}</span>
              </div>
              {' '}
              <span className="pe-field-error" id="codeError">{errors.codeError || ''}</span>
            </div>
            {' '}
            <div className={'pw-locked-wrap' + (verified ? '' : ' locked')} id="newPwGroups">
              <div className="pw-lock-hint">
                <i className="ti ti-lock"></i>
                {' '}
                <span id="pwLockText">{verified ? 'Unlocked — choose your new password.' : 'Locked until your current password is verified.'}</span>
              </div>
              {' '}
              <div className="pe-group">
                <label htmlFor="editPassword">New Password{' '}<span className="pe-req">*</span></label>
                {' '}
                <PwField id="editPassword" value={pw} onChange={setPw} shown={!!shown.pw} onToggle={() => setShown(s => ({ ...s, pw: !s.pw }))}
                  disabled={!verified} placeholder="Create a strong password" autoComplete="new-password" inputRef={newPwRef} policy />
                <PasswordMeter value={pw} />
                {' '}
                <span className="pe-field-error" id="newPwError">{errors.newPwError || ''}</span>
              </div>
              {' '}
              <div className="pe-group">
                <label htmlFor="editPasswordConfirm">Repeat New Password{' '}<span className="pe-req">*</span></label>
                {' '}
                <PwField id="editPasswordConfirm" value={pw2} onChange={setPw2} shown={!!shown.pw2} onToggle={() => setShown(s => ({ ...s, pw2: !s.pw2 }))}
                  disabled={!verified} placeholder="Repeat new password" autoComplete="new-password" />
                {' '}
                <span className="pe-field-error" id="confirmPwError">{errors.confirmPwError || ''}</span>
              </div>
            </div>
            {' '}
            <p className="pe-hint">Leave the password fields untouched to keep your current password.</p>
          </div>
          {' '}
          <div className="pe-footer">
            <button type="button" className="pe-btn-cancel" onClick={onClose}>Cancel</button>
            {' '}
            <button type="button" className="pe-btn-save" onClick={confirmSave}>Save Changes</button>
          </div>
        </div>
      </div>
      {/* Confirm save (restyled by the original confirm-dialog enhancer: data-ac + close X) */}
      <div id="peConfirm" className="pe-overlay" style={{ display: confirmOpen ? 'flex' : 'none' }} onClick={e => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
        <div className="pe-card confirm-card" data-astra-confirm="1" onClick={e => e.stopPropagation()}>
          <h2 className="pe-title" data-ac="title">Save Changes?</h2>
          {' '}
          <p className="pe-sub modal-subtitle" data-ac="body">Are you sure you want to save the changes to your profile?</p>
          {' '}
          <div className="pe-footer edit-modal-footer" data-ac="actions">
            <button type="button" className="pe-btn-cancel btn-cancel" onClick={() => setConfirmOpen(false)}>Go Back</button>
            {' '}
            <button type="button" className="pe-btn-save btn-save" id="peConfirmBtn" disabled={saving} onClick={save}>{savedFlash ? 'Saved!' : saving ? 'Saving...' : 'Save'}</button>
          </div>
          <ConfirmX onClick={() => setConfirmOpen(false)} />
        </div>
      </div>
    </>
  );
}
