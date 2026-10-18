/* ============================================================
   ADMIN — profile.js  (inline edit section, contact + password only)
   ============================================================ */

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });
  requireAuth('admin');
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

// ── LOAD / RENDER ─────────────────────────────────────────────
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
  const role     = user.role          || user.Role          || '—';
  const isActive = user.isActive      ?? user.IsActive      ?? true;

  const fullName = `${first} ${last}`.trim() || '—';
  const initials = (first.charAt(0) + last.charAt(0)).toUpperCase() || 'AU';

  document.getElementById('profileAvatar').textContent     = initials;
  document.getElementById('profileName').textContent       = fullName;
  document.getElementById('profileRole').textContent       = role;
  document.getElementById('profileEmail').textContent      = email;
  document.getElementById('profileContact').textContent    = contact || '—';
  document.getElementById('profileRoleDetail').textContent = role;

  const statusBadge = document.getElementById('profileStatus');
  statusBadge.textContent = isActive ? 'Active' : 'Inactive';
  statusBadge.className   = `status-badge ${isActive ? 'active' : 'inactive'}`;

  const sbAvatar = document.getElementById('sidebarAvatar');
  const sbName   = document.getElementById('sidebarName');
  if (sbAvatar) sbAvatar.textContent = initials;
  if (sbName)   sbName.textContent   = fullName;

  document.getElementById('profileLoading').style.display = 'none';
  document.getElementById('profileCard').style.display    = 'block';

  resetEditSection();
}

// ── EDIT PROFILE SECTION (always visible inline, not a modal/toggle) ──
// Resets the form back to its just-loaded/just-saved state: contact
// number from currentUser, password fields cleared. Used both on page
// load and as "Cancel" (revert whatever the admin typed but didn't save).
function resetEditSection() {
  document.getElementById('editContact').value = currentUser?.contactNumber || currentUser?.ContactNumber || '';
  ['editCurrentPassword', 'editPassword', 'editPasswordConfirm'].forEach(id => {
    const el = document.getElementById(id);
    el.value = ''; el.type = 'password';
  });
  document.querySelectorAll('#profileEditSection .btn-pw-eye').forEach(btn => {
    btn.querySelector('.eye-icon').style.display     = '';
    btn.querySelector('.eye-off-icon').style.display = 'none';
  });
  document.getElementById('editError').style.display = 'none';
  clearFieldErrors();
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
  el.textContent = msg;
  el.style.display = 'block';
}

function confirmSave() {
  document.getElementById('editError').style.display = 'none';
  clearFieldErrors();

  const currentPw = document.getElementById('editCurrentPassword').value;
  const newPw     = document.getElementById('editPassword').value;
  const confirmPw = document.getElementById('editPasswordConfirm').value;

  if (currentPw || newPw || confirmPw) {
    let hasError = false;
    if (!currentPw)              { showFieldError('currentPwError', 'Please enter your current password.'); hasError = true; }
    if (!newPw)                  { showFieldError('newPwError', 'Please enter a new password.'); hasError = true; }
    else if (newPw.length < 8)   { showFieldError('newPwError', 'Must be at least 8 characters.'); hasError = true; }
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
      FirstName:       currentUser.firstName     || currentUser.FirstName,
      LastName:        currentUser.lastName      || currentUser.LastName,
      Email:           currentUser.email         || currentUser.Email,
      ContactNumber:   contact || null,
      StudentNumber:   currentUser.studentNumber || currentUser.StudentNumber || null,
      Role:            currentUser.role          || currentUser.Role,
      CurrentPassword: currentPw || null,
      NewPassword:     newPw     || null,
    }, true);

    currentUser.contactNumber = contact;
    currentUser.ContactNumber = contact;

    const session = getSession();
    if (session?.user) {
      const updated = { ...session.user, contactNumber: contact, ContactNumber: contact };
      saveSession(session.token, session.role, updated);
    }

    await loadProfile(); // re-renders the card and resets the edit section to the new saved state

    btn.textContent = 'Saved!';
    btn.classList.replace('saving', 'saved');
    await new Promise(r => setTimeout(r, 750));
    closeConfirmModal();
  } catch (err) {
    closeConfirmModal();
    const msg = (err.message || 'Failed to save changes. Please try again.');
    if (msg.toLowerCase().includes('password')) {
      showFieldError('currentPwError', msg);
    } else {
      showEditError(msg);
    }
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

// Save only unlocks once a file is picked AND the admin has confirmed
// (via the consent checkbox) that it's genuinely their own signature —
// a picked file alone used to be enough.
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

function saveSig() {
  if (!selectedSigFile || !document.getElementById('sigConsentModal').checked) return;
  document.getElementById('sigConfirmModal').style.display = 'flex';
}

function closeSigConfirmModal() {
  document.getElementById('sigConfirmModal').style.display = 'none';
}

async function doSaveSig() {
  closeSigConfirmModal();
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
