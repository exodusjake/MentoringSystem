/* ============================================================
   ASTRA MENTOR — profile.js
   ============================================================ */

let currentUser = null;
let mentorProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession().user;
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

async function loadProfile() {
  const userId = currentUser?.userID;

  try {
    const [user, profiles] = await Promise.all([
      apiRequest(`Users/${userId}`, 'GET', null, true),
      apiRequest('MentorProfiles', 'GET', null, true),
    ]);

    mentorProfile = (profiles || []).find(p => p.userID === userId) || {};

    renderProfile(user, mentorProfile);
    document.getElementById('profileLoading').style.display = 'none';
    document.getElementById('profileCard').style.display = 'block';
    resetEditSection();
  } catch (e) {
    console.error('Profile load failed:', e);
    document.getElementById('profileLoading').textContent = 'Failed to load profile. Please refresh.';
  }
}

function renderProfile(user, mp) {
  const first = user.firstName || '';
  const last  = user.lastName  || '';
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();

  document.getElementById('profileAvatar').textContent  = initials || 'MU';
  document.getElementById('profileName').textContent    = `${first} ${last}`.trim() || '—';
  document.getElementById('profileEmail').textContent   = user.email         || '—';
  document.getElementById('profileContact').textContent = user.contactNumber || '—';
  document.getElementById('profileSchool').textContent  = mp.school          || '—';
  document.getElementById('profileDept').textContent    = mp.department      || '—';

  const nameEl   = document.getElementById('sidebarName');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl)   nameEl.textContent   = `${first} ${last}`.trim();
  if (avatarEl) avatarEl.textContent = initials || 'MU';
}

function togglePwVisibility(inputId, btn) {
  const input  = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.querySelector('.eye-icon').style.display     = isHidden ? 'none' : '';
  btn.querySelector('.eye-off-icon').style.display = isHidden ? '' : 'none';
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

// ── EDIT PROFILE SECTION (always visible inline, not a modal) ──
// Resets the form back to its just-loaded/just-saved state. Used on
// page load, after a successful save, and as "Cancel" (revert whatever
// the mentor typed but didn't save).
function resetEditSection() {
  document.getElementById('editContact').value = document.getElementById('profileContact').textContent.replace('—', '');
  ['editCurrentPassword', 'editPassword', 'editPasswordConfirm'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.type  = 'password';
  });
  document.querySelectorAll('#profileEditSection .btn-pw-eye').forEach(btn => {
    btn.querySelector('.eye-icon').style.display     = '';
    btn.querySelector('.eye-off-icon').style.display = 'none';
  });
  document.getElementById('editError').style.display = 'none';
  clearFieldErrors();
}

function confirmSave() {
  document.getElementById('editError').style.display = 'none';
  clearFieldErrors();

  const currentPw = document.getElementById('editCurrentPassword').value;
  const newPw     = document.getElementById('editPassword').value;
  const confirmPw = document.getElementById('editPasswordConfirm').value;

  if (currentPw || newPw || confirmPw) {
    let hasError = false;
    if (!currentPw)          { showFieldError('currentPwError', 'Please enter your current password.'); hasError = true; }
    if (!newPw)              { showFieldError('newPwError', 'Please enter a new password.'); hasError = true; }
    else if (newPw.length < 8) { showFieldError('newPwError', 'Must be at least 8 characters.'); hasError = true; }
    if (newPw && !confirmPw) { showFieldError('confirmPwError', 'Please confirm your new password.'); hasError = true; }
    else if (newPw && confirmPw && newPw !== confirmPw) { showFieldError('confirmPwError', 'Passwords do not match.'); hasError = true; }
    if (hasError) return;
  }

  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirmModal(e) {
  if (!e || e.target === document.getElementById('confirmModal')) {
    document.getElementById('confirmModal').classList.remove('open');
  }
}

async function saveProfile() {
  const userId = currentUser?.userID;
  const btn    = document.getElementById('confirmSaveBtn');

  const firstName = currentUser?.firstName || '';
  const lastName  = currentUser?.lastName  || '';
  const contact   = document.getElementById('editContact').value.trim();
  const currentPw = document.getElementById('editCurrentPassword').value;
  const newPw     = document.getElementById('editPassword').value;

  btn.textContent = 'Saving...';
  btn.disabled    = true;
  btn.classList.add('saving');

  try {
    await apiRequest(`Users/${userId}`, 'PUT', {
      FirstName:       firstName,
      LastName:        lastName,
      Email:           currentUser.email || '',
      ContactNumber:   contact,
      CurrentPassword: currentPw || null,
      NewPassword:     newPw || null,
      Role:            'Mentor',
      DepartmentID:  mentorProfile?.departmentID || null,
      School:        mentorProfile?.school || '',
    }, true);

    await loadProfile(); // re-renders the card and resets the edit section to the new saved state

    const session = getSession();
    if (session.user) {
      session.user.firstName = firstName;
      session.user.lastName  = lastName;
      const type    = localStorage.getItem('_sessionType');
      const storage = type === 'session' ? sessionStorage : localStorage;
      storage.setItem('user', JSON.stringify(session.user));
    }

    btn.textContent = 'Saved!';
    btn.classList.replace('saving', 'saved');
    await new Promise(r => setTimeout(r, 750));
    document.getElementById('confirmModal').classList.remove('open');
  } catch (err) {
    document.getElementById('confirmModal').classList.remove('open');
    const msg = err.message || 'Failed to save changes. Please try again.';
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

function showEditError(msg) {
  const el = document.getElementById('editError');
  el.textContent   = msg;
  el.style.display = 'block';
}

// ── Signature ──────────────────────────────────────────────

let selectedSigFile = null;

async function loadSignature() {
  const userId = currentUser?.userID;
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
  document.getElementById('sigFileInput').value        = '';
  document.getElementById('sigDzPreview').style.display = 'none';
  document.getElementById('sigDzIdle').style.display    = '';
  document.getElementById('sigModalError').style.display = 'none';
  document.getElementById('sigConsentModal').checked    = false;
  document.getElementById('btnSaveSig').disabled        = true;
  document.getElementById('sigModal').classList.add('open');
}

// Save only unlocks once a file is picked AND the mentor has confirmed
// (via the consent checkbox) that it's genuinely their own signature —
// a picked file alone used to be enough.
function updateSaveSigState() {
  document.getElementById('btnSaveSig').disabled =
    !(selectedSigFile && document.getElementById('sigConsentModal').checked);
}

function closeSigModal(e) {
  if (!e || e.target === document.getElementById('sigModal'))
    document.getElementById('sigModal').classList.remove('open');
}

function handleSigFile(file) {
  // PNG only — a signature prints small, over a line, so it needs a
  // transparent background to blend in cleanly. JPG/GIF/WEBP-without-
  // alpha can't carry transparency, so they'd always print with a
  // visible background box no matter how the logsheet styles it.
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
    document.getElementById('sigDzPreview').src          = e.target.result;
    document.getElementById('sigDzPreview').style.display = 'block';
    document.getElementById('sigDzIdle').style.display    = 'none';
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
    const res  = await apiRequest(`ESignature/${currentUser?.userID}`, 'POST', form, true);
    const path = res?.signatureFilePath;
    if (path) {
      document.getElementById('sigImg').src            = CONFIG.getFileUrl(path);
      document.getElementById('sigHasState').style.display  = '';
      document.getElementById('sigNoneState').style.display = 'none';
      document.getElementById('btnChangeSig').textContent   = 'Change Signature';
    }
    document.getElementById('sigModal').classList.remove('open');
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
