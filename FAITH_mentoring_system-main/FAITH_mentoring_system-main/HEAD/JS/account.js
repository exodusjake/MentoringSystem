/* ============================================================
   HEAD ADMIN — account.js  (profile + system info)
   ============================================================ */

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('head');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadSystemInfo();
  // loadSignature() reads currentUser, which loadProfile() only sets after
  // its own await resolves — calling both in parallel raced loadSignature()
  // ahead of it, so it fetched ESignature/undefined and silently fell back
  // to "No signature on file yet" even when one was actually on record.
  await loadProfile();
  loadSignature();

  const fi = document.getElementById('sigFileInput');
  const dz = document.getElementById('sigDz');
  fi.addEventListener('change', () => { if (fi.files[0]) handleSigFile(fi.files[0]); });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleSigFile(e.dataTransfer.files[0]);
  });
  document.getElementById('sigConsentModal').addEventListener('change', updateSaveSigState);
});

// ── PROFILE ───────────────────────────────────────────────────
async function loadProfile() {
  const session = getSession();
  if (!session?.user) { window.location.href = '/LOGIN/HTML/login.html'; return; }

  const user   = session.user;
  const userId = user.userID || user.UserID || user.userId;

  if (!userId) { currentUser = user; renderProfile(user); return; }

  try {
    const fullUser = await apiRequest(`Users/${userId}`, 'GET', null, true);
    currentUser = fullUser;
    renderProfile(fullUser);
  } catch (e) {
    currentUser = user;
    renderProfile(user);
  }
}

function renderProfile(user) {
  const first    = user.firstName     || user.FirstName     || '';
  const last     = user.lastName      || user.LastName      || '';
  const email    = user.email         || user.Email         || '—';
  const contact  = user.contactNumber || user.ContactNumber || '';
  const isActive = user.isActive      ?? user.IsActive      ?? true;

  const fullName = `${first} ${last}`.trim() || '—';
  const initials = (first.charAt(0) + last.charAt(0)).toUpperCase() || 'HA';

  document.getElementById('profileAvatar').textContent  = initials;
  document.getElementById('profileName').textContent    = fullName;
  document.getElementById('profileEmail').textContent   = email;
  document.getElementById('profileContact').textContent = contact || '—';

  const statusBadge = document.getElementById('profileStatus');
  statusBadge.textContent = isActive ? 'Active' : 'Inactive';
  statusBadge.className   = `status-badge ${isActive ? 'active' : 'inactive'}`;

  const sbAvatar = document.getElementById('sidebarAvatar');
  const sbName   = document.getElementById('sidebarName');
  if (sbAvatar) sbAvatar.textContent = initials;
  if (sbName)   sbName.textContent   = fullName;

  document.getElementById('profileLoading').style.display = 'none';
  document.getElementById('profileCard').style.display    = 'block';
}

// Mirrors AstraMentoring-Backend/AstraMentoring-Backend/Constants/MentoringSlots.cs
// — 1st Semester's count includes Mentoring Assembly, 2nd Semester's
// doesn't. Required-session counts now come from this fixed list instead
// of the old Admin-editable SessionLimit1stSem/2ndSem setting (removed
// from Admin Settings once the slot list became the real source of truth).
const MENTORING_SLOTS_COUNT_1ST = 6;
const MENTORING_SLOTS_COUNT_2ND = 5;

// ── SYSTEM INFO (read-only) ───────────────────────────────────
async function loadSystemInfo() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    const sy   = data?.SchoolYear || data?.schoolYear || null;
    const sem  = data?.Semester   || data?.semester   || null;

    setSysVal('valSchoolYear', sy);
    setSysVal('valSemester',   sem);
    setSysVal('valLimit1st',   MENTORING_SLOTS_COUNT_1ST + ' sessions');
    setSysVal('valLimit2nd',   MENTORING_SLOTS_COUNT_2ND + ' sessions');
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

function setSysVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val && val !== '—') el.textContent = val;
  // leave placeholder span if no value
}

// ── EDIT MODAL ────────────────────────────────────────────────
function openEditModal() {
  document.getElementById('editContact').value = currentUser?.contactNumber || currentUser?.ContactNumber || '';
  ['editCurrentPassword', 'editPassword', 'editPasswordConfirm'].forEach(id => {
    const el = document.getElementById(id);
    el.value = ''; el.type = 'password';
  });
  document.querySelectorAll('#editModal .btn-pw-eye').forEach(btn => {
    btn.querySelector('.eye-icon').style.display     = '';
    btn.querySelector('.eye-off-icon').style.display = 'none';
  });
  document.getElementById('editError').style.display = 'none';
  clearFieldErrors();
  resetPwFlow();
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
}

function clearFieldErrors() {
  ['currentPwError', 'newPwError', 'confirmPwError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function showEditError(msg) {
  const el = document.getElementById('editError');
  el.textContent   = msg;
  el.style.display = 'block';
}

// ── CHANGE PASSWORD: verify current password -> emailed code -> unlock new password ──
let pwChangeToken = null;
let pwCodeTimer = null;

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setPwIndicator(state, html) {
  const box = document.getElementById('codeIndicator');
  box.className = 'code-indicator' + (state ? ' ' + state : '');
  document.getElementById('codeIndicatorText').innerHTML = html;
  box.querySelector('i').className = 'ti ' + ({ sent: 'ti-mail-check', ok: 'ti-circle-check', err: 'ti-alert-circle' }[state] || 'ti-mail');
}

function setNewPwLocked(locked) {
  ['editPassword', 'editPasswordConfirm'].forEach(id => {
    const el = document.getElementById(id);
    el.disabled = locked;
    if (locked) { el.value = ''; el.type = 'password'; }
  });
  document.getElementById('newPwGroups').classList.toggle('locked', locked);
  document.getElementById('pwLockText').textContent = locked
    ? 'Locked until your current password is verified.'
    : 'Unlocked — choose your new password.';
}

function resetPwFlow() {
  pwChangeToken = null;
  clearInterval(pwCodeTimer);
  const cur = document.getElementById('editCurrentPassword');
  cur.disabled = false;
  const send = document.getElementById('btnSendCode');
  send.disabled = false; send.textContent = 'Send Code';
  const code = document.getElementById('editPwCode');
  code.value = ''; code.disabled = true;
  document.getElementById('btnVerifyCode').disabled = true;
  document.getElementById('btnVerifyCode').textContent = 'Verify';
  document.getElementById('codeError').textContent = '';
  setPwIndicator('', 'Enter your current password and tap <b>Send Code</b> — we’ll email a 6-digit verification code to your account email.');
  setNewPwLocked(true);
}

function startCodeCooldown(seconds) {
  const btn = document.getElementById('btnSendCode');
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
  clearFieldErrors();
  document.getElementById('codeError').textContent = '';
  const current = document.getElementById('editCurrentPassword').value;
  if (!current) { showFieldError('currentPwError', 'Please enter your current password.'); return; }

  const btn = document.getElementById('btnSendCode');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await apiRequest('Auth/password-code', 'POST', { currentPassword: current }, true);
    const code = document.getElementById('editPwCode');
    code.disabled = false; code.value = '';
    document.getElementById('btnVerifyCode').disabled = false;
    code.focus();
    setPwIndicator('sent', `Verification code sent to <b>${escHtml(res?.email || 'your email')}</b>. It expires in 10 minutes — check your spam folder if you don’t see it.`);
    startCodeCooldown(res?.resendAfterSeconds || 45);
  } catch (err) {
    const wait = err.status === 429 ? parseInt((err.message.match(/\d+/) || [15])[0], 10) : 0;
    showFieldError('currentPwError', err.message || 'Could not send the code. Please try again.');
    if (wait) startCodeCooldown(wait);
    else { btn.disabled = false; btn.textContent = 'Send Code'; }
  }
}

async function verifyPwCode() {
  const errEl = document.getElementById('codeError');
  errEl.textContent = '';
  const code = document.getElementById('editPwCode').value.trim();
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Enter the 6-digit code from your email.'; return; }

  const btn = document.getElementById('btnVerifyCode');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const res = await apiRequest('Auth/password-code/verify', 'POST', { code }, true);
    pwChangeToken = res?.token || null;
    clearInterval(pwCodeTimer);
    document.getElementById('editCurrentPassword').disabled = true;
    document.getElementById('btnSendCode').disabled = true;
    document.getElementById('btnSendCode').textContent = 'Verified';
    document.getElementById('editPwCode').disabled = true;
    btn.textContent = 'Verified';
    setPwIndicator('ok', '<b>Verified!</b> Your identity is confirmed — you can now choose a new password.');
    setNewPwLocked(false);
    document.getElementById('editPassword').focus();
  } catch (err) {
    errEl.textContent = err.message || 'Could not verify the code.';
    btn.disabled = false; btn.textContent = 'Verify';
    if (err.restart) {
      document.getElementById('editPwCode').value = '';
      setPwIndicator('err', 'That code can no longer be used. Tap <b>Send Code</b> to get a new one.');
      const send = document.getElementById('btnSendCode');
      clearInterval(pwCodeTimer); send.disabled = false; send.textContent = 'Send Code';
    }
  }
}

function confirmSave() {
  document.getElementById('editError').style.display = 'none';
  clearFieldErrors();

  const currentPw = document.getElementById('editCurrentPassword').value;
  const newPw     = document.getElementById('editPassword').value;
  const confirmPw = document.getElementById('editPasswordConfirm').value;

  if (newPw || confirmPw) {
    let hasError = false;
    if (!pwChangeToken)          { showFieldError('currentPwError', 'Verify your current password with the emailed code first.'); hasError = true; }
    if (!newPw)                  { showFieldError('newPwError', 'Please enter a new password.'); hasError = true; }
    else if (PasswordPolicy.validate(newPw)) { showFieldError('newPwError', PasswordPolicy.validate(newPw)); hasError = true; }
    if (newPw && !confirmPw)     { showFieldError('confirmPwError', 'Please confirm your new password.'); hasError = true; }
    else if (newPw && confirmPw && newPw !== confirmPw) { showFieldError('confirmPwError', 'Passwords do not match.'); hasError = true; }
    if (hasError) return;
  }

  document.getElementById('confirmModal').style.display = 'flex';
}

async function saveProfile() {
  const userId    = currentUser?.userID || currentUser?.UserID || currentUser?.userId;
  const contact   = document.getElementById('editContact').value.trim();
  const currentPw = document.getElementById('editCurrentPassword').value;
  const newPw     = document.getElementById('editPassword').value;
  const btn       = document.getElementById('confirmSaveBtn');

  btn.textContent = 'Saving...';
  btn.disabled    = true;
  btn.classList.add('saving');

  try {
    await apiRequest(`Users/${userId}`, 'PUT', {
      firstName:       currentUser.firstName || currentUser.FirstName,
      lastName:        currentUser.lastName  || currentUser.LastName,
      email:           currentUser.email     || currentUser.Email,
      contactNumber:   contact || null,
      studentNumber:   currentUser.studentNumber || currentUser.StudentNumber || null,
      role:            currentUser.role      || currentUser.Role,
    }, true);

    if (pwChangeToken && newPw) {
      await apiRequest('Auth/change-password', 'POST', { currentPassword: currentPw, newPassword: newPw, token: pwChangeToken }, true);
      pwChangeToken = null;
    }

    currentUser.contactNumber = contact;
    currentUser.ContactNumber = contact;

    const session = getSession();
    if (session?.user) {
      const updated = { ...session.user, contactNumber: contact, ContactNumber: contact };
      saveSession(session.token, session.role, updated);
    }

    renderProfile(currentUser);

    btn.textContent = 'Saved!';
    btn.classList.replace('saving', 'saved');
    await new Promise(r => setTimeout(r, 750));
    closeConfirmModal();
    closeEditModal();
  } catch (err) {
    closeConfirmModal();
    const msg = err.message || 'Failed to update profile. Please try again.';
    if (msg.toLowerCase().includes('password')) {
      showFieldError('currentPwError', msg);
    } else {
      showEditError(msg);
    }
    document.getElementById('editModal').style.display = 'flex';
  } finally {
    btn.textContent = 'Yes, Save';
    btn.disabled    = false;
    btn.classList.remove('saving', 'saved');
  }
}

// ── SIGNATURE ────────────────────────────────────────────────

let selectedSigFile = null;

function currentUserId() {
  return currentUser?.userID || currentUser?.UserID || currentUser?.userId;
}

async function loadSignature() {
  const userId = currentUserId();
  try {
    const res  = await apiRequest(`ESignature/${userId}`, 'GET', null, true);
    const path = res?.signatureFilePath;
    if (path) {
      document.getElementById('sigImg').src            = CONFIG.getFileUrl(path);
      document.getElementById('sigHasState').style.display  = '';
      document.getElementById('sigNoneState').style.display = 'none';
      document.getElementById('btnChangeSig').textContent   = 'Change Signature';
    } else {
      document.getElementById('sigHasState').style.display  = 'none';
      document.getElementById('sigNoneState').style.display = '';
      document.getElementById('btnChangeSig').textContent   = 'Upload Signature';
    }
  } catch {
    document.getElementById('sigHasState').style.display  = 'none';
    document.getElementById('sigNoneState').style.display = '';
  }
  document.getElementById('sigSection').style.display = '';
}

function openSigModal() {
  selectedSigFile = null;
  document.getElementById('sigFileInput').value         = '';
  document.getElementById('sigDzPreview').style.display  = 'none';
  document.getElementById('sigDzIdle').style.display     = '';
  document.getElementById('sigModalError').style.display = 'none';
  document.getElementById('sigConsentModal').checked     = false;
  document.getElementById('btnSaveSig').disabled         = true;
  document.getElementById('sigModal').style.display      = 'flex';
}

// Save only unlocks once a file is picked AND the Head Admin has
// confirmed (via the consent checkbox) that it's genuinely their own
// signature — a picked file alone used to be enough.
function updateSaveSigState() {
  document.getElementById('btnSaveSig').disabled =
    !(selectedSigFile && document.getElementById('sigConsentModal').checked);
}

function closeSigModal() {
  document.getElementById('sigModal').style.display = 'none';
}

function handleSigFile(file) {
  // PNG only — a signature prints small, over a line, so it needs a
  // transparent background to blend in cleanly. JPG/GIF/WEBP-without-
  // alpha can't carry transparency, so they'd always print with a
  // visible background box no matter how the document styles it.
  if (file.type !== 'image/png') {
    showSigError('Please upload a PNG file with a transparent background.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showSigError('File too large. Maximum 5 MB.');
    return;
  }
  selectedSigFile = file;
  document.getElementById('sigModalError').style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('sigDzPreview').src            = e.target.result;
    document.getElementById('sigDzPreview').style.display  = 'block';
    document.getElementById('sigDzIdle').style.display     = 'none';
  };
  reader.readAsDataURL(file);
  updateSaveSigState();
}

async function saveSig() {
  if (!selectedSigFile || !document.getElementById('sigConsentModal').checked) return;
  const btn = document.getElementById('btnSaveSig');
  btn.textContent = 'Saving…';
  btn.disabled    = true;
  try {
    const form = new FormData();
    form.append('file', selectedSigFile);
    const res  = await apiRequest(`ESignature/${currentUserId()}`, 'POST', form, true);
    const path = res?.signatureFilePath;
    if (path) {
      document.getElementById('sigImg').src            = CONFIG.getFileUrl(path);
      document.getElementById('sigHasState').style.display  = '';
      document.getElementById('sigNoneState').style.display = 'none';
      document.getElementById('btnChangeSig').textContent   = 'Change Signature';
    }
    document.getElementById('sigModal').style.display = 'none';
  } catch (err) {
    showSigError(err.message || 'Upload failed. Please try again.');
  } finally {
    btn.textContent = 'Save Signature';
    btn.disabled    = false;
  }
}

function showSigError(msg) {
  const el = document.getElementById('sigModalError');
  el.textContent   = msg;
  el.style.display = 'block';
}
