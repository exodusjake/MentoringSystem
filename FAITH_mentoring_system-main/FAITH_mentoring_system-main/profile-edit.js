/* ============================================================
   profile-edit.js — "Edit Profile" modal for the Admin, Mentor and Mentee profile pages
   (same behaviour as the Head portal's Account page):
     • contact number
     • change password: current password -> emailed 6-digit code -> new password unlocked
   Loaded after the page's own profile.js. Uses that page's globals: currentUser, loadProfile(),
   and (Mentor) mentorProfile. The modal markup lives in each profile.html (ids: peModal, peConfirm).
   ============================================================ */
let pwChangeToken = null;
let pwCodeTimer = null;

function peEl(id) { return document.getElementById(id); }
function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function peTogglePw(inputId, btn) {
  const input = peEl(inputId);
  const hide = input.type === 'password';
  input.type = hide ? 'text' : 'password';
  btn.querySelector('.eye-icon').style.display = hide ? 'none' : '';
  btn.querySelector('.eye-off-icon').style.display = hide ? '' : 'none';
}

// ── password flow ────────────────────────────────────────────
function setPwIndicator(state, html) {
  const box = peEl('codeIndicator');
  box.className = 'code-indicator' + (state ? ' ' + state : '');
  peEl('codeIndicatorText').innerHTML = html;
  box.querySelector('i').className = 'ti ' + ({ sent: 'ti-mail-check', ok: 'ti-circle-check', err: 'ti-alert-circle' }[state] || 'ti-mail');
}

function setNewPwLocked(locked) {
  ['editPassword', 'editPasswordConfirm'].forEach(id => {
    const el = peEl(id);
    el.disabled = locked;
    if (locked) { el.value = ''; el.type = 'password'; }
  });
  peEl('newPwGroups').classList.toggle('locked', locked);
  peEl('pwLockText').textContent = locked ? 'Locked until your current password is verified.' : 'Unlocked — choose your new password.';
}

function peClearErrors() {
  ['currentPwError', 'newPwError', 'confirmPwError', 'codeError'].forEach(id => { const el = peEl(id); if (el) el.textContent = ''; });
  const e = peEl('editError'); if (e) e.style.display = 'none';
}
function peFieldError(id, msg) { const el = peEl(id); if (el) el.textContent = msg; }
function peShowError(msg) { const el = peEl('editError'); el.textContent = msg; el.style.display = 'block'; }

function resetPwFlow() {
  pwChangeToken = null;
  clearInterval(pwCodeTimer);
  peEl('editCurrentPassword').disabled = false;
  const send = peEl('btnSendCode'); send.disabled = false; send.textContent = 'Send Code';
  const code = peEl('editPwCode'); code.value = ''; code.disabled = true;
  const verify = peEl('btnVerifyCode'); verify.disabled = true; verify.textContent = 'Verify';
  setPwIndicator('', 'Enter your current password and tap <b>Send Code</b> — we’ll email a 6-digit verification code to your account email.');
  setNewPwLocked(true);
}

function startCodeCooldown(seconds) {
  const btn = peEl('btnSendCode');
  let left = Math.max(1, seconds | 0);
  btn.disabled = true;
  clearInterval(pwCodeTimer);
  const tick = () => {
    btn.textContent = left > 0 ? `Resend (${left}s)` : 'Resend Code';
    if (left-- <= 0) { clearInterval(pwCodeTimer); btn.disabled = false; }
  };
  tick();
  pwCodeTimer = setInterval(tick, 1000);
}

async function sendPwCode() {
  peClearErrors();
  const current = peEl('editCurrentPassword').value;
  if (!current) { peFieldError('currentPwError', 'Please enter your current password.'); return; }
  const btn = peEl('btnSendCode');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await apiRequest('Auth/password-code', 'POST', { currentPassword: current }, true);
    const code = peEl('editPwCode');
    code.disabled = false; code.value = '';
    peEl('btnVerifyCode').disabled = false;
    code.focus();
    setPwIndicator('sent', `Verification code sent to <b>${escHtml(res?.email || 'your email')}</b>. It expires in 10 minutes — check your spam folder if you don’t see it.`);
    startCodeCooldown(res?.resendAfterSeconds || 45);
  } catch (err) {
    const wait = err.status === 429 ? parseInt((err.message.match(/\d+/) || [15])[0], 10) : 0;
    peFieldError('currentPwError', err.message || 'Could not send the code. Please try again.');
    if (wait) startCodeCooldown(wait);
    else { btn.disabled = false; btn.textContent = 'Send Code'; }
  }
}

async function verifyPwCode() {
  const errEl = peEl('codeError');
  errEl.textContent = '';
  const code = peEl('editPwCode').value.trim();
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Enter the 6-digit code from your email.'; return; }
  const btn = peEl('btnVerifyCode');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const res = await apiRequest('Auth/password-code/verify', 'POST', { code }, true);
    pwChangeToken = res?.token || null;
    clearInterval(pwCodeTimer);
    peEl('editCurrentPassword').disabled = true;
    const send = peEl('btnSendCode'); send.disabled = true; send.textContent = 'Verified';
    peEl('editPwCode').disabled = true;
    btn.textContent = 'Verified';
    setPwIndicator('ok', '<b>Verified!</b> Your identity is confirmed — you can now choose a new password.');
    setNewPwLocked(false);
    peEl('editPassword').focus();
  } catch (err) {
    errEl.textContent = err.message || 'Could not verify the code.';
    btn.disabled = false; btn.textContent = 'Verify';
    if (err.restart) {
      peEl('editPwCode').value = '';
      setPwIndicator('err', 'That code can no longer be used. Tap <b>Send Code</b> to get a new one.');
      const send = peEl('btnSendCode'); clearInterval(pwCodeTimer); send.disabled = false; send.textContent = 'Send Code';
    }
  }
}

// ── modal ────────────────────────────────────────────────────
function openEditModal() {
  peEl('editContact').value = currentUser?.contactNumber || currentUser?.ContactNumber || '';
  ['editCurrentPassword', 'editPassword', 'editPasswordConfirm'].forEach(id => { const el = peEl(id); el.value = ''; el.type = 'password'; });
  document.querySelectorAll('#peModal .btn-pw-eye').forEach(b => {
    b.querySelector('.eye-icon').style.display = '';
    b.querySelector('.eye-off-icon').style.display = 'none';
  });
  peClearErrors();
  resetPwFlow();
  peEl('peModal').style.display = 'flex';
}
function closeEditModal() { peEl('peModal').style.display = 'none'; }
function closePeConfirm() { peEl('peConfirm').style.display = 'none'; }

function peConfirmSave() {
  peClearErrors();
  const newPw = peEl('editPassword').value;
  const confirmPw = peEl('editPasswordConfirm').value;
  if (newPw || confirmPw) {
    let bad = false;
    if (!pwChangeToken) { peFieldError('currentPwError', 'Verify your current password with the emailed code first.'); bad = true; }
    if (!newPw) { peFieldError('newPwError', 'Please enter a new password.'); bad = true; }
    else if (PasswordPolicy.validate(newPw)) { peFieldError('newPwError', PasswordPolicy.validate(newPw)); bad = true; }
    if (newPw && !confirmPw) { peFieldError('confirmPwError', 'Please confirm your new password.'); bad = true; }
    else if (newPw && confirmPw && newPw !== confirmPw) { peFieldError('confirmPwError', 'Passwords do not match.'); bad = true; }
    if (bad) return;
  }
  peEl('peConfirm').style.display = 'flex';
}

function peProfilePayload(contact) {
  const u = currentUser || {};
  const role = u.role || u.Role;
  const payload = {
    FirstName: u.firstName || u.FirstName || '',
    LastName: u.lastName || u.LastName || '',
    Email: u.email || u.Email || '',
    ContactNumber: contact || null,
    Role: role
  };
  if (role === 'Mentor' && typeof mentorProfile !== 'undefined' && mentorProfile) {
    payload.DepartmentID = mentorProfile.departmentID || null;
    payload.School = mentorProfile.school || '';
  }
  if (role === 'Mentee') {
    const sn = peEl('profileStudentNo') ? peEl('profileStudentNo').textContent.trim() : '';
    payload.StudentNumber = sn && sn !== '—' ? sn : (u.studentNumber || u.StudentNumber || null);
  } else if (u.studentNumber || u.StudentNumber) {
    payload.StudentNumber = u.studentNumber || u.StudentNumber;
  }
  return payload;
}

async function peSave() {
  const userId = currentUser?.userID || currentUser?.UserID || currentUser?.userId;
  const contact = peEl('editContact').value.trim();
  const currentPw = peEl('editCurrentPassword').value;
  const newPw = peEl('editPassword').value;
  const btn = peEl('peConfirmBtn');
  btn.textContent = 'Saving...'; btn.disabled = true;
  try {
    await apiRequest(`Users/${userId}`, 'PUT', peProfilePayload(contact), true);
    if (pwChangeToken && newPw) {
      await apiRequest('Auth/change-password', 'POST', { currentPassword: currentPw, newPassword: newPw, token: pwChangeToken }, true);
      pwChangeToken = null;
    }
    const session = getSession();
    if (session && session.user) {
      const type = localStorage.getItem('_sessionType');
      const storage = type === 'session' ? sessionStorage : localStorage;
      storage.setItem('user', JSON.stringify({ ...session.user, contactNumber: contact, ContactNumber: contact }));
    }
    await loadProfile();
    btn.textContent = 'Saved!';
    await new Promise(r => setTimeout(r, 700));
    closePeConfirm();
    closeEditModal();
  } catch (err) {
    closePeConfirm();
    const msg = err.message || 'Failed to update profile. Please try again.';
    if (err.restart) resetPwFlow();
    if (msg.toLowerCase().includes('password')) peFieldError('currentPwError', msg); else peShowError(msg);
  } finally {
    btn.textContent = 'Save'; btn.disabled = false;
  }
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const c = peEl('peConfirm'), m = peEl('peModal');
  if (c && c.style.display === 'flex') closePeConfirm();
  else if (m && m.style.display === 'flex') closeEditModal();
});
