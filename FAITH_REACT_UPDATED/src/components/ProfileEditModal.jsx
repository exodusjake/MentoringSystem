import { useEffect, useRef, useState } from 'react';
import Overlay from './Overlay.jsx';
import PasswordMeter from './PasswordMeter.jsx';
import { apiRequest } from '../lib/api.js';
import { validate as validatePassword } from '../lib/passwordPolicy.js';

// "Edit Profile" dialog + "Save changes?" confirmation: contact number, and change password
// (current password -> emailed 6-digit code -> new password unlocked).
//   HEAD/JS/account.js (variant 'head', .modal-overlay / .edit-modal-card markup) and
//   profile-edit.js for the Admin, Mentor and Mentee profile pages (variant 'pe', .pe-* markup).
//
// Props:
//   variant        'head' | 'pe'
//   open, onClose
//   currentUser    the loaded user (contact number prefill)
//   saveProfile(contact)   does the Users/{id} PUT
//   afterSave(contact)     what the page does after a successful save (session update, re-render / reload)
const CLS = {
  head: {
    overlay: 'modal-overlay', card: 'edit-modal-card', close: 'modal-close-btn', title: 'modal-title', sub: 'modal-subtitle',
    error: 'edit-error', form: 'edit-form', group: 'form-group', opt: 'optional', req: 'req', section: 'form-section-label',
    verifyRow: 'pw-verify-row', pw: 'pw-input-wrap', fieldError: 'field-error', footer: 'edit-modal-footer',
    cancel: 'btn-cancel', save: 'btn-save', hint: 'pw-hint',
  },
  pe: {
    overlay: 'pe-overlay', card: 'pe-card', close: 'pe-close', title: 'pe-title', sub: 'pe-sub',
    error: 'pe-error', form: 'pe-form', group: 'pe-group', opt: 'pe-opt', req: 'pe-req', section: 'pe-section',
    verifyRow: 'pe-verify-row', pw: 'pe-pw', fieldError: 'pe-field-error', footer: 'pe-footer',
    cancel: 'pe-btn-cancel', save: 'pe-btn-save', hint: 'pe-hint',
  },
};

const EYE = <svg className="eye-icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const EYE_OFF = <svg className="eye-off-icon" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
const CLOSE_ICON = <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const SAVE_ICON = <svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>;

const INDICATOR_DEFAULT = <>Enter your current password and tap <b>Send Code</b> — we’ll email a 6-digit verification code to your account email.</>;
const INDICATOR_ICON = { sent: 'ti-mail-check', ok: 'ti-circle-check', err: 'ti-alert-circle' };

function PwField({ id, value, onChange, show, onToggle, disabled, placeholder, autoComplete, dataPolicy, wrapClass, btnLabel }) {
  return (
    <div className={wrapClass}>
      <input type={show ? 'text' : 'password'} id={id} data-pw-policy={dataPolicy ? '' : undefined} placeholder={placeholder}
        autoComplete={autoComplete} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" className="btn-pw-eye" onClick={onToggle} tabIndex={-1} aria-label={btnLabel}>
        {show ? null : EYE}{show ? EYE_OFF : null}
      </button>
    </div>
  );
}

export default function ProfileEditModal({ variant = 'pe', open, onClose, currentUser, saveProfile, afterSave }) {
  const c = CLS[variant];
  const pe = variant === 'pe';

  const [contact, setContact] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showNew2, setShowNew2] = useState(false);
  const [editError, setEditError] = useState('');
  const [contactErr, setContactErr] = useState('');
  const [errs, setErrs] = useState({ currentPw: '', newPw: '', confirmPw: '', code: '' });
  const [token, setToken] = useState(null);                 // pwChangeToken
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);          // code input + Verify enabled
  const [verified, setVerified] = useState(false);
  const [indicator, setIndicator] = useState({ state: '', html: INDICATOR_DEFAULT });
  const [sendBtn, setSendBtn] = useState({ text: 'Send Code', disabled: false });
  const [verifyBtn, setVerifyBtn] = useState({ text: 'Verify', disabled: true });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveBtn, setSaveBtn] = useState({ text: 'Save', disabled: false, cls: '' });
  const timer = useRef(null);
  const savedOnce = useRef(false);
  const codeRef = useRef(null);
  const newPwRef = useRef(null);

  const resetPwFlow = () => {
    setToken(null);
    clearInterval(timer.current);
    setCode(''); setCodeSent(false); setVerified(false);
    setSendBtn({ text: 'Send Code', disabled: false });
    setVerifyBtn({ text: 'Verify', disabled: true });
    setIndicator({ state: '', html: INDICATOR_DEFAULT });
    setNewPw(''); setNewPw2(''); setShowNew(false); setShowNew2(false);
  };

  // openEditModal(): reset everything each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setContact(currentUser?.contactNumber || currentUser?.ContactNumber || '');
    setCurPw(''); setShowCur(false);
    setEditError(''); setContactErr('');
    setErrs({ currentPw: '', newPw: '', confirmPw: '', code: '' });
    resetPwFlow();
    setConfirmOpen(false);
    return () => clearInterval(timer.current);
  }, [open]);

  useEffect(() => {
    if (!pe || !open) return;
    const onKey = e => {
      if (e.key !== 'Escape') return;
      if (confirmOpen) setConfirmOpen(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pe, open, confirmOpen]);

  const clearErrors = () => { setErrs({ currentPw: '', newPw: '', confirmPw: '', code: '' }); setEditError(''); setContactErr(''); };
  const setErr = (k, msg) => setErrs(e => ({ ...e, [k]: msg }));

  function startCodeCooldown(seconds) {
    let left = Math.max(1, seconds | 0);
    clearInterval(timer.current);
    const tick = () => {
      setSendBtn({ text: left > 0 ? `Resend (${left}s)` : 'Resend Code', disabled: left > 0 });
      if (left-- <= 0) clearInterval(timer.current);
    };
    tick();
    timer.current = setInterval(tick, 1000);
  }

  async function sendPwCode() {
    clearErrors();
    if (!curPw) { setErr('currentPw', 'Please enter your current password.'); return; }
    setSendBtn({ text: 'Sending…', disabled: true });
    try {
      const res = await apiRequest('Auth/password-code', 'POST', { currentPassword: curPw }, true);
      setCode(''); setCodeSent(true);
      setVerifyBtn({ text: 'Verify', disabled: false });
      setTimeout(() => codeRef.current?.focus(), 0);
      setIndicator({ state: 'sent', html: <>Verification code sent to <b>{res?.email || 'your email'}</b>. It expires in 10 minutes — check your spam folder if you don’t see it.</> });
      startCodeCooldown(res?.resendAfterSeconds || 45);
    } catch (err) {
      const wait = err.status === 429 ? parseInt((err.message.match(/\d+/) || [15])[0], 10) : 0;
      setErr('currentPw', err.message || 'Could not send the code. Please try again.');
      if (wait) startCodeCooldown(wait);
      else setSendBtn({ text: 'Send Code', disabled: false });
    }
  }

  async function verifyPwCode() {
    setErr('code', '');
    const c6 = code.trim();
    if (!/^\d{6}$/.test(c6)) { setErr('code', 'Enter the 6-digit code from your email.'); return; }
    setVerifyBtn({ text: 'Verifying…', disabled: true });
    try {
      const res = await apiRequest('Auth/password-code/verify', 'POST', { code: c6 }, true);
      setToken(res?.token || null);
      clearInterval(timer.current);
      setVerified(true);
      setSendBtn({ text: 'Verified', disabled: true });
      setVerifyBtn({ text: 'Verified', disabled: true });
      setIndicator({ state: 'ok', html: <><b>Verified!</b> Your identity is confirmed — you can now choose a new password.</> });
      setTimeout(() => newPwRef.current?.focus(), 0);
    } catch (err) {
      setErr('code', err.message || 'Could not verify the code.');
      setVerifyBtn({ text: 'Verify', disabled: false });
      if (err.restart) {
        setCode('');
        setIndicator({ state: 'err', html: <>That code can no longer be used. Tap <b>Send Code</b> to get a new one.</> });
        clearInterval(timer.current);
        setSendBtn({ text: 'Send Code', disabled: false });
      }
    }
  }

  function confirmSave() {
    clearErrors();
    // Typing is free; the number is checked when Save is pressed.
    const contactVal = contact.trim();
    if (contactVal && !/^[0-9]+$/.test(contactVal)) { setContactErr('Only valid numbers are allowed.'); return; }
    if (newPw || newPw2) {
      let bad = false;
      const next = { currentPw: '', newPw: '', confirmPw: '', code: '' };
      if (!token) { next.currentPw = 'Verify your current password with the emailed code first.'; bad = true; }
      if (!newPw) { next.newPw = 'Please enter a new password.'; bad = true; }
      else if (validatePassword(newPw)) { next.newPw = validatePassword(newPw); bad = true; }
      if (newPw && !newPw2) { next.confirmPw = 'Please confirm your new password.'; bad = true; }
      else if (newPw && newPw2 && newPw !== newPw2) { next.confirmPw = 'Passwords do not match.'; bad = true; }
      if (bad) { setErrs(next); return; }
    }
    setConfirmOpen(true);
  }

  async function doSave() {
    const contactVal = contact.trim();
    setSaveBtn({ text: 'Saving...', disabled: true, cls: pe ? '' : ' saving' });
    try {
      await saveProfile(contactVal);

      if (token && newPw) {
        await apiRequest('Auth/change-password', 'POST', { currentPassword: curPw, newPassword: newPw, token }, true);
        setToken(null);
      }

      await afterSave(contactVal);

      setSaveBtn({ text: 'Saved!', disabled: true, cls: pe ? '' : ' saved' });
      await new Promise(r => setTimeout(r, pe ? 700 : 750));
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      setConfirmOpen(false);
      const msg = err.message || 'Failed to update profile. Please try again.';
      if (pe && err.restart) resetPwFlow();
      if (msg.toLowerCase().includes('password')) setErr('currentPw', msg);
      else setEditError(msg);
    } finally {
      savedOnce.current = true;
      setSaveBtn({ text: pe ? 'Save' : 'Yes, Save', disabled: false, cls: '' });
    }
  }

  const label = (id, children) => pe ? <label htmlFor={id}>{children}</label> : <label>{children}</label>;
  const eyeLabel = pe ? 'Show or hide password' : undefined;

  return (
    <>
      <Overlay open={open} className={c.overlay} activeClass={null} display="flex" id={pe ? 'peModal' : 'editModal'}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={c.card} onClick={e => e.stopPropagation()} {...(pe ? { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'peTitle' } : {})}>
          <button type="button" className={c.close} onClick={onClose} aria-label={pe ? 'Close' : undefined}>{CLOSE_ICON}</button>
          <h2 className={c.title} id={pe ? 'peTitle' : undefined}>Edit Profile</h2>
          <p className={c.sub}>Update your contact number or change your password.</p>
          <div id="editError" className={c.error} style={{ display: editError ? 'block' : 'none' }}>{editError}</div>
          <div className={c.form}>
            <div className={c.group}>
              {label('editContact', <>Contact Number <span className={c.opt}>(optional)</span></>)}
              <input type="text" id="editContact" placeholder="09XXXXXXXXX" autoComplete="tel" value={contact} onChange={e => { setContact(e.target.value); setContactErr(''); }} aria-invalid={contactErr ? 'true' : undefined} />
              <span className={c.fieldError} id="contactError">{contactErr}</span>
            </div>
            <div className={c.section}>Change Password</div>
            <div className={c.group}>
              {label('editCurrentPassword', <>Current Password <span className={c.req}>*</span></>)}
              <div className={c.verifyRow}>
                <PwField id="editCurrentPassword" wrapClass={c.pw} value={curPw} onChange={setCurPw} show={showCur} onToggle={() => setShowCur(s => !s)}
                  disabled={verified} placeholder="Enter your current password" autoComplete="current-password" btnLabel={eyeLabel} />
                <button type="button" className="btn-verify-act" id="btnSendCode" disabled={sendBtn.disabled} onClick={sendPwCode}>{sendBtn.text}</button>
              </div>
              <span className={c.fieldError} id="currentPwError">{errs.currentPw}</span>
            </div>
            <div className={c.group}>
              {label('editPwCode', 'Verification Code')}
              <div className={c.verifyRow}>
                <input type="text" id="editPwCode" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="Enter 6-digit code"
                  ref={codeRef} disabled={!codeSent || verified} value={code} onChange={e => setCode(e.target.value)} />
                <button type="button" className="btn-verify-act" id="btnVerifyCode" disabled={verifyBtn.disabled} onClick={verifyPwCode}>{verifyBtn.text}</button>
              </div>
              <div className={`code-indicator${indicator.state ? ' ' + indicator.state : ''}`} id="codeIndicator">
                <i className={`ti ${INDICATOR_ICON[indicator.state] || 'ti-mail'}`}></i>
                <span id="codeIndicatorText">{indicator.html}</span>
              </div>
              <span className={c.fieldError} id="codeError">{errs.code}</span>
            </div>
            <div className={`pw-locked-wrap${verified ? '' : ' locked'}`} id="newPwGroups">
              <div className="pw-lock-hint"><i className="ti ti-lock"></i> <span id="pwLockText">{verified ? 'Unlocked — choose your new password.' : 'Locked until your current password is verified.'}</span></div>
              <div className={c.group}>
                {label('editPassword', <>New Password <span className={c.req}>*</span></>)}
                <div className={c.pw}>
                  <input type={showNew ? 'text' : 'password'} id="editPassword" data-pw-policy="" placeholder="Create a strong password" autoComplete="new-password"
                    ref={newPwRef} disabled={!verified} value={newPw} onChange={e => setNewPw(e.target.value)} />
                  <button type="button" className="btn-pw-eye" onClick={() => setShowNew(s => !s)} tabIndex={-1} aria-label={eyeLabel}>{showNew ? EYE_OFF : EYE}</button>
                </div>
                <PasswordMeter value={newPw} />
                <span className={c.fieldError} id="newPwError">{errs.newPw}</span>
              </div>
              <div className={c.group}>
                {label('editPasswordConfirm', <>Repeat New Password <span className={c.req}>*</span></>)}
                <PwField id="editPasswordConfirm" wrapClass={c.pw} value={newPw2} onChange={setNewPw2} show={showNew2} onToggle={() => setShowNew2(s => !s)}
                  disabled={!verified} placeholder="Repeat new password" autoComplete="new-password" btnLabel={eyeLabel} />
                <span className={c.fieldError} id="confirmPwError">{errs.confirmPw}</span>
              </div>
            </div>
            <p className={c.hint}>Leave the password fields untouched to keep your current password.</p>
          </div>
          <div className={c.footer}>
            <button type="button" className={c.cancel} onClick={onClose}>Cancel</button>
            <button type="button" className={c.save} id={pe ? undefined : 'saveBtn'} onClick={confirmSave}>Save Changes</button>
          </div>
        </div>
      </Overlay>

      {/* Confirm save */}
      <Overlay open={open && confirmOpen} className={c.overlay} activeClass={null} display="flex" id={pe ? 'peConfirm' : 'confirmModal'}
        onClick={e => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
        {pe ? (
          <div className="pe-card confirm-card" onClick={e => e.stopPropagation()}>
            <h2 className="pe-title">Save Changes?</h2>
            <p className="pe-sub modal-subtitle">Are you sure you want to save the changes to your profile?</p>
            <div className="pe-footer edit-modal-footer">
              <button type="button" className="pe-btn-cancel btn-cancel" onClick={() => setConfirmOpen(false)}>Go Back</button>
              <button type="button" className="pe-btn-save btn-save" id="peConfirmBtn" disabled={saveBtn.disabled} onClick={doSave}>{saveBtn.text}</button>
            </div>
          </div>
        ) : (
          <div className="edit-modal-card confirm-card" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">{SAVE_ICON}</div>
            <h2 className="modal-title">Save Changes?</h2>
            <p className="modal-subtitle">Are you sure you want to save the changes to your profile?</p>
            <div className="edit-modal-footer" style={{ justifyContent: 'center', gap: '14px' }}>
              <button className="btn-cancel" onClick={() => setConfirmOpen(false)}>Go Back</button>
              <button className={`btn-save${saveBtn.cls}`} id="confirmSaveBtn" disabled={saveBtn.disabled} onClick={doSave}>{saveBtn.text === 'Save' && savedOnce.current ? 'Yes, Save' : saveBtn.text}</button>
            </div>
          </div>
        )}
      </Overlay>
    </>
  );
}
