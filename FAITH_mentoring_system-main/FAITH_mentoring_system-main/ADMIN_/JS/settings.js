/* ============================================================
   ADMIN — settings.js  (System Settings page: page-level lock)
   ============================================================
   All fields load read-only/disabled. One password unlock (gated
   by Settings/verify-password, same as before) enables every field
   for the rest of this page load — matches how "isUnlocked" already
   behaved, just surfaced as one clear banner instead of a surprise
   prompt behind each field's edit icon.
   ============================================================ */

let isUnlocked   = false;
let latestValues = {}; // last-loaded server values, keyed by SettingKey — used to reset on Lock

const SETTING_FIELDS = [
  'SchoolYear', 'Semester', 'GuidanceOfficer',
  'calPreparedByName', 'calPreparedByTitle', 'calPreparedByEmail',
  'calApprovedByName', 'calApprovedByTitle', 'calApprovedByEmail',
];

// Fields validated as an email address before saving — must match a real
// account for the Calendar Sheet to find that person's uploaded signature.
const EMAIL_SETTING_FIELDS = new Set(['calPreparedByEmail', 'calApprovedByEmail']);

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');
  loadSettings();
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    latestValues = data || {};
    SETTING_FIELDS.forEach(key => setFieldValue(key, latestValues[key]));
    loadMaintenanceFields();
  } catch (e) {
    showToast('Failed to load settings.', 'error');
  }
}

function setFieldValue(key, value) {
  const el = document.getElementById(`field${key}`);
  if (!el) return;
  if (el.tagName === 'SELECT') {
    if (value) [...el.options].forEach(opt => { opt.selected = opt.value === value; });
  } else {
    el.value = value != null ? value : '';
  }
}

// ── SAVE (per field) ─────────────────────────────────────────
async function saveSetting(key, fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const val = el.tagName === 'SELECT' ? el.value : el.value.trim();
  if (!val) { showToast('Value cannot be empty.', 'error'); return; }
  if (EMAIL_SETTING_FIELDS.has(key) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  // Only ask for confirmation on an actual change — a no-op resave of the
  // same value already on file needs no prompt.
  if (val !== latestValues[key]) {
    // SchoolYear/Semester affect the whole system for every user the
    // moment they're saved (every portal's "current period" banner,
    // required-session quotas, new sessions going forward) — its own
    // stronger warning, not just the generic confirm every other field
    // gets below.
    if (key === 'SchoolYear' || key === 'Semester') {
      const ok = await showConfirm(
        `Change the Academic Period?\n\n${labelFor(key)}:  ${latestValues[key] || '—'}  →  ${val}\n\nThis updates every portal immediately.`,
        { confirmText: 'Change Period', cancelText: 'Cancel', variant: 'primary' }
      );
      if (!ok) return;
    } else {
      const ok = await showConfirm(
        `Save this change?\n\n${labelFor(key)}:  ${latestValues[key] || '—'}  →  ${val}`,
        { confirmText: 'Save', cancelText: 'Cancel', variant: 'primary' }
      );
      if (!ok) return;
    }
  }

  const saveBtn = (el.closest('.settings-input-row') || el.closest('.settings-card'))?.querySelector('.btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.remove('btn-save-saved'); saveBtn.textContent = 'Saving…'; }

  try {
    await apiRequest(`Settings/${key}`, 'PUT', { value: val }, true);
    latestValues[key] = val;
    showToast(`${labelFor(key)} updated.`, 'success');
    // A toast alone is easy to miss since it appears away from where the
    // eye already is (the field/button just clicked) — hold a visible
    // "Saved" state on the button itself for a couple seconds too.
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Saved ✓';
      saveBtn.classList.add('btn-save-saved');
      setTimeout(() => {
        saveBtn.classList.remove('btn-save-saved');
        saveBtn.textContent = 'Save';
      }, 1800);
    }
  } catch (e) {
    showToast(`Failed to update ${labelFor(key)}.`, 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

// ── SAVE (per card) ──────────────────────────────────────────
// One Save per card; only changed fields are sent, after one confirmation.
// SchoolYear goes before Semester so the outgoing period is snapshotted
// with its own semester.
const SETTING_GROUPS = {
  academic:    { button: 'saveAcademicPeriodBtn', keys: ['SchoolYear', 'Semester'] },
  signatories: { button: 'saveSignatoriesBtn', keys: [
    'calPreparedByName', 'calPreparedByTitle', 'calPreparedByEmail',
    'calApprovedByName', 'calApprovedByTitle', 'calApprovedByEmail',
  ] },
};

function startYear(schoolYear) {
  const m = /^(\d{4})-\d{4}$/.exec(schoolYear || '');
  return m ? Number(m[1]) : null;
}

async function saveGroup(group) {
  if (!isUnlocked) return;
  const { button, keys } = SETTING_GROUPS[group];
  const changes = [];
  for (const key of keys) {
    const el  = document.getElementById(`field${key}`);
    const val = el.tagName === 'SELECT' ? el.value : el.value.trim();
    const isEmail = EMAIL_SETTING_FIELDS.has(key);
    if (!val && !isEmail) { showToast(`${labelFor(key)} cannot be empty.`, 'error'); el.focus(); return; }
    if (val && isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      showToast(`Please enter a valid ${labelFor(key)}.`, 'error'); el.focus(); return;
    }
    if (key === 'SchoolYear') {
      const m = /^(\d{4})-(\d{4})$/.exec(val);
      if (!m || Number(m[2]) !== Number(m[1]) + 1) {
        showToast('School Year must be consecutive years, e.g. 2026-2027.', 'error'); el.focus(); return;
      }
    }
    if (val !== (latestValues[key] ?? '')) changes.push({ key, val });
  }
  if (!changes.length) { showToast('No changes to save.', 'success'); return; }

  const lines = changes.map(c => `${labelFor(c.key)}:  ${latestValues[c.key] || '—'}  →  ${c.val || '(blank)'}`).join('\n');
  const yearChange = changes.find(c => c.key === 'SchoolYear');
  const forwardYear = yearChange && startYear(yearChange.val) > (startYear(latestValues.SchoolYear) ?? Infinity);
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

  const btn = document.getElementById(button);
  btn.disabled = true; btn.classList.remove('btn-save-saved'); btn.textContent = 'Saving…';
  try {
    for (const c of changes) {
      await apiRequest(`Settings/${c.key}`, 'PUT', { value: c.val }, true);
      latestValues[c.key] = c.val;
    }
    showToast(group === 'academic' ? 'Academic period updated.' : 'Signatories updated.', 'success');
    btn.textContent = 'Saved ✓';
    btn.classList.add('btn-save-saved');
    setTimeout(() => { btn.classList.remove('btn-save-saved'); btn.textContent = 'Save'; }, 1800);
  } catch (e) {
    showToast(`Some changes were not saved: ${e.message || 'please reload and try again.'}`, 'error');
    btn.textContent = 'Save';
  } finally {
    btn.disabled = false;
  }
}

// ── LOCK / UNLOCK (whole page) ──────────────────────────────────
function applyLockState(unlocked) {
  isUnlocked = unlocked;

  const grid = document.getElementById('settingsGrid');
  grid.classList.toggle('settings-locked', !unlocked);
  SETTING_FIELDS.forEach(key => {
    const el = document.getElementById(`field${key}`);
    if (el) el.disabled = !unlocked;
  });
  MAINT_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !unlocked; });

  document.getElementById('lockIcon').classList.toggle('locked',   !unlocked);
  document.getElementById('lockIcon').classList.toggle('unlocked', unlocked);
  document.getElementById('lockTitle').textContent = unlocked ? 'Settings unlocked' : 'Settings are locked';
  document.getElementById('lockSub').textContent   = unlocked
    ? 'You can now edit any field below.'
    : 'Enter the settings password to make changes.';

  document.getElementById('lockActionsLocked').style.display   = unlocked ? 'none' : '';
  document.getElementById('lockActionsUnlocked').style.display = unlocked ? '' : 'none';
}

function lockSettings() {
  // Discard any typed-but-unsaved edits by reloading the last known
  // saved values before re-disabling the fields.
  SETTING_FIELDS.forEach(key => setFieldValue(key, latestValues[key]));
  loadMaintenanceFields();
  applyLockState(false);
}

// ── UNLOCK MODAL (password gate) ────────────────────────────────
function openUnlock() {
  document.getElementById('unlockPasswordInput').value = '';
  document.getElementById('unlockError').textContent   = '';
  document.getElementById('unlockOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('unlockPasswordInput').focus(), 80);
}

function closeUnlock() {
  document.getElementById('unlockOverlay').style.display = 'none';
}

async function submitUnlock() {
  const password = document.getElementById('unlockPasswordInput').value;
  const errEl    = document.getElementById('unlockError');
  const btn      = document.getElementById('unlockBtn');

  if (btn.disabled) return;

  if (!password) { errEl.textContent = 'Please enter the settings password.'; return; }

  btn.disabled    = true;
  btn.textContent = 'Verifying…';
  errEl.textContent = '';

  try {
    await apiRequest('Settings/verify-password', 'POST', { password }, true);
    closeUnlock();
    applyLockState(true);
  } catch (error) {
    errEl.textContent = error.status === 400 ? error.message : 'Unable to verify the settings password. Please try again.';
    document.getElementById('unlockPasswordInput').select();
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Confirm';
  }
}

// ── CHANGE SETTINGS PASSWORD ──────────────────────────────────
let cpToken = null;
let cpTimer = null;
function cpEsc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }

function cpEl(id) { return document.getElementById(id); }

function cpIndicator(state, html) {
  const box = cpEl('cpIndicator');
  box.className = 'cp-indicator' + (state ? ' ' + state : '');
  cpEl('cpIndicatorText').innerHTML = html;
}

function cpSetLocked(locked) {
  ['cpNewInput', 'cpConfirmInput'].forEach(id => {
    const el = cpEl(id);
    el.disabled = locked;
    if (locked) { el.value = ''; el.type = 'password'; }
  });
  cpEl('cpLocked').classList.toggle('locked', locked);
  cpEl('cpLockHint').textContent = locked ? 'Locked until the current password is verified.' : 'Unlocked — choose the new settings password.';
}

function cpReset() {
  cpToken = null;
  clearInterval(cpTimer);
  cpEl('cpCurrentInput').value = ''; cpEl('cpCurrentInput').disabled = false;
  const send = cpEl('cpSendBtn'); send.disabled = false; send.textContent = 'Send Code';
  const code = cpEl('cpCodeInput'); code.value = ''; code.disabled = true;
  const verify = cpEl('cpVerifyBtn'); verify.disabled = true; verify.textContent = 'Verify';
  cpEl('cpError').textContent = '';
  cpIndicator('', 'Enter the current settings password and tap <b>Send Code</b> — we’ll email a 6-digit code to your account email.');
  cpSetLocked(true);
}

function cpCooldown(seconds) {
  const btn = cpEl('cpSendBtn');
  let left = Math.max(1, seconds | 0);
  btn.disabled = true;
  clearInterval(cpTimer);
  const tick = () => {
    btn.textContent = left > 0 ? `Resend (${left}s)` : 'Resend Code';
    if (left-- <= 0) { clearInterval(cpTimer); btn.disabled = false; }
  };
  tick();
  cpTimer = setInterval(tick, 1000);
}

async function sendSettingsCode() {
  const errEl = cpEl('cpError');
  errEl.textContent = '';
  const current = cpEl('cpCurrentInput').value;
  if (!current) { errEl.textContent = 'Please enter the current settings password.'; return; }
  const btn = cpEl('cpSendBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await apiRequest('Settings/password-code', 'POST', { password: current }, true);
    const code = cpEl('cpCodeInput');
    code.disabled = false; code.value = '';
    cpEl('cpVerifyBtn').disabled = false;
    code.focus();
    cpIndicator('sent', `Verification code sent to <b>${cpEsc(res?.email || 'your email')}</b>. It expires in 10 minutes — check your spam folder if you don’t see it.`);
    cpCooldown(res?.resendAfterSeconds || 45);
  } catch (err) {
    const wait = err.status === 429 ? parseInt((err.message.match(/\d+/) || [15])[0], 10) : 0;
    errEl.textContent = err.message || 'Could not send the code. Please try again.';
    if (wait) cpCooldown(wait); else { btn.disabled = false; btn.textContent = 'Send Code'; }
  }
}

async function verifySettingsCode() {
  const errEl = cpEl('cpError');
  errEl.textContent = '';
  const code = cpEl('cpCodeInput').value.trim();
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Enter the 6-digit code from your email.'; return; }
  const btn = cpEl('cpVerifyBtn');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const res = await apiRequest('Settings/password-code/verify', 'POST', { code }, true);
    cpToken = res?.token || null;
    clearInterval(cpTimer);
    cpEl('cpCurrentInput').disabled = true;
    const send = cpEl('cpSendBtn'); send.disabled = true; send.textContent = 'Verified';
    cpEl('cpCodeInput').disabled = true;
    btn.textContent = 'Verified';
    cpIndicator('ok', '<b>Verified!</b> You can now choose the new settings password.');
    cpSetLocked(false);
    cpEl('cpNewInput').focus();
  } catch (err) {
    errEl.textContent = err.message || 'Could not verify the code.';
    btn.disabled = false; btn.textContent = 'Verify';
    if (err.restart) {
      cpEl('cpCodeInput').value = '';
      cpIndicator('err', 'That code can no longer be used. Tap <b>Send Code</b> to get a new one.');
      const send = cpEl('cpSendBtn'); clearInterval(cpTimer); send.disabled = false; send.textContent = 'Send Code';
    }
  }
}

function openChangePassword() {
  cpReset();
  document.getElementById('changePassOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('cpCurrentInput').focus(), 80);
}

function closeChangePassword() {
  document.getElementById('changePassOverlay').style.display = 'none';
}

async function submitChangePassword() {
  const current = document.getElementById('cpCurrentInput').value;
  const newPass = document.getElementById('cpNewInput').value;
  const confirm = document.getElementById('cpConfirmInput').value;
  const errEl   = document.getElementById('cpError');
  const btn     = document.getElementById('cpBtn');

  if (btn.disabled) return;

  errEl.textContent = '';
  if (!cpToken)                         { errEl.textContent = 'Verify the current password with the emailed code first.'; return; }
  if (!newPass || !confirm)             { errEl.textContent = 'Please fill in all fields.'; return; }
  if (newPass.length < 6)               { errEl.textContent = 'New password must be at least 6 characters.'; return; }
  if (newPass !== confirm)              { errEl.textContent = 'New passwords do not match.'; return; }

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    await apiRequest('Settings/change-password', 'PUT', { currentPassword: current, newPassword: newPass, token: cpToken }, true);
    cpToken = null;
    closeChangePassword();
    showToast('Settings password changed successfully.', 'success');
  } catch (error) {
    errEl.textContent = error.status === 400 ? error.message : 'Unable to change the settings password. Please try again.';
    if (error.restart) cpReset();
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Change Password';
  }
}

// ── MAINTENANCE MODE ─────────────────────────────────────────────
const MAINT_FIELDS = ['fieldMaintMentor', 'fieldMaintMentee', 'fieldMaintEta', 'fieldMaintMessage'];

function maintToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadMaintenanceFields() {
  document.getElementById('fieldMaintMentor').checked = latestValues.MaintenanceMentor === '1';
  document.getElementById('fieldMaintMentee').checked = latestValues.MaintenanceMentee === '1';
  document.getElementById('fieldMaintEta').value = maintToLocalInput(latestValues.MaintenanceEta);
  const msg = document.getElementById('fieldMaintMessage');
  msg.value = latestValues.MaintenanceMessage || '';
  document.getElementById('maintMsgCount').textContent = msg.value.length;
  renderMaintStatus();
}

function renderMaintStatus() {
  const mentor = latestValues.MaintenanceMentor === '1', mentee = latestValues.MaintenanceMentee === '1';
  const box = document.getElementById('maintStatus');
  const text = document.getElementById('maintStatusText');
  document.getElementById('maintMentorRow').classList.toggle('on', document.getElementById('fieldMaintMentor').checked);
  document.getElementById('maintMenteeRow').classList.toggle('on', document.getElementById('fieldMaintMentee').checked);
  if (!mentor && !mentee) {
    box.classList.remove('on');
    text.textContent = 'Both portals are open.';
    return;
  }
  const who = [mentor && 'Mentor', mentee && 'Mentee'].filter(Boolean).join(' and ');
  let line = `${who} ${mentor && mentee ? 'portals are' : 'portal is'} under maintenance now.`;
  if (latestValues.MaintenanceEta) {
    const d = new Date(latestValues.MaintenanceEta);
    if (!isNaN(d.getTime())) line += ` Estimated back ${d.toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`;
  }
  box.classList.add('on');
  text.textContent = line;
}

function setMaintEta(minutesOrKey) {
  if (!isUnlocked) return;
  const input = document.getElementById('fieldMaintEta');
  if (minutesOrKey == null) { input.value = ''; return; }
  const d = new Date();
  if (minutesOrKey === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
  else d.setMinutes(d.getMinutes() + minutesOrKey);
  input.value = maintToLocalInput(d.toISOString());
}

async function saveMaintenance() {
  if (!isUnlocked) return;
  const mentor = document.getElementById('fieldMaintMentor').checked;
  const mentee = document.getElementById('fieldMaintMentee').checked;
  const etaLocal = document.getElementById('fieldMaintEta').value;
  const message = document.getElementById('fieldMaintMessage').value.trim();

  let etaIso = '';
  if (etaLocal) {
    const d = new Date(etaLocal);
    if (isNaN(d.getTime())) { showToast('Please enter a valid estimated time.', 'error'); return; }
    if ((mentor || mentee) && d.getTime() < Date.now()) { showToast('The estimated time must be in the future.', 'error'); return; }
    etaIso = d.toISOString();
  }

  const wasOn = latestValues.MaintenanceMentor === '1' || latestValues.MaintenanceMentee === '1';
  const unchanged = (latestValues.MaintenanceMentor === '1') === mentor && (latestValues.MaintenanceMentee === '1') === mentee &&
    (latestValues.MaintenanceEta || '') === (etaIso ? new Date(etaIso).toISOString() : '') && (latestValues.MaintenanceMessage || '') === message;
  if (unchanged) { showToast('No changes to save.', 'success'); return; }

  const who = [mentor && 'Mentor', mentee && 'Mentee'].filter(Boolean).join(' and ');
  const prompt = (mentor || mentee)
    ? `Put the ${who} portal${mentor && mentee ? 's' : ''} under maintenance?\n\nEveryone in ${mentor && mentee ? 'those portals' : 'that portal'} will be stopped right away and shown the maintenance screen${etaIso ? ' with your estimated time' : ''}. Admin and Head are not affected.`
    : (wasOn ? 'Reopen the Mentor and Mentee portals?\n\nEveryone can log in and use the system again.' : 'Save these maintenance details?');
  const ok = await showConfirm(prompt, { confirmText: (mentor || mentee) ? 'Start Maintenance' : (wasOn ? 'Reopen Portals' : 'Save'), cancelText: 'Cancel', variant: (mentor || mentee) ? 'danger' : 'primary' });
  if (!ok) return;

  const btn = document.getElementById('saveMaintenanceBtn');
  btn.disabled = true; btn.classList.remove('btn-save-saved'); btn.textContent = 'Applying…';
  try {
    const res = await apiRequest('Settings/maintenance', 'PUT', { mentor, mentee, eta: etaIso || null, message }, true);
    latestValues.MaintenanceMentor = mentor ? '1' : '0';
    latestValues.MaintenanceMentee = mentee ? '1' : '0';
    latestValues.MaintenanceEta = res?.eta || '';
    latestValues.MaintenanceMessage = message;
    renderMaintStatus();
    showToast((mentor || mentee) ? 'Maintenance mode is on.' : 'Portals reopened.', 'success');
    btn.textContent = 'Applied ✓'; btn.classList.add('btn-save-saved');
    setTimeout(() => { btn.classList.remove('btn-save-saved'); btn.textContent = 'Apply'; }, 1800);
  } catch (e) {
    showToast(e.message || 'Failed to update maintenance mode.', 'error');
    btn.textContent = 'Apply';
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const msg = document.getElementById('fieldMaintMessage');
  if (msg) msg.addEventListener('input', () => { document.getElementById('maintMsgCount').textContent = msg.value.length; });
  ['fieldMaintMentor', 'fieldMaintMentee'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
      document.getElementById('maintMentorRow').classList.toggle('on', document.getElementById('fieldMaintMentor').checked);
      document.getElementById('maintMenteeRow').classList.toggle('on', document.getElementById('fieldMaintMentee').checked);
    });
  });
});

// ── HELPERS ───────────────────────────────────────────────────
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

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
