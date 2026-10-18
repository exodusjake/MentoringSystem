/* ============================================================
   MENTOR — setup.js  (first-login onboarding)
   ============================================================ */

(function () {
  'use strict';

  const session = typeof getSession === 'function' ? getSession() : null;
  if (!session || !session.token) {
    window.location.href = '/LOGIN/HTML/login.html';
    return;
  }
  if (!session.user?.setupRequired) {
    window.location.href = '/MENTOR/HTML/mentor-dashboard.html';
    return;
  }

  const userId = session.user?.userID;

  // ── Drag-and-drop ──────────────────────────────────────────
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('sigFile');

  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  const consentBox = document.getElementById('sigConsent');
  consentBox.addEventListener('change', updateContinueState);

  // ── File selection ─────────────────────────────────────────
  let selectedFile = null;

  // Continue only unlocks once a file is picked AND the mentor has
  // confirmed (via the consent checkbox) that it's genuinely their own
  // signature — a picked file alone used to be enough.
  function updateContinueState() {
    document.getElementById('btnContinue').disabled = !(selectedFile && consentBox.checked);
  }

  function handleFile(file) {
    // PNG only — a signature prints small, over a line, so it needs a
    // transparent background to blend in cleanly. JPG/GIF/WEBP-without-
    // alpha can't carry transparency, so they'd always print with a
    // visible background box no matter how the logsheet styles it.
    if (file.type !== 'image/png') {
      showError('Please upload a PNG file with a transparent background.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError('File is too large. Maximum size is 5 MB.');
      return;
    }
    clearError();
    selectedFile = file;

    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('sigPreview').src = e.target.result;
      document.getElementById('sigPreview').style.display = 'block';
      document.getElementById('dropzone-idle').style.display = 'none';
    };
    reader.readAsDataURL(file);

    updateContinueState();
    document.getElementById('btnRetake').style.display = '';
  }

  window.clearSignature = function () {
    selectedFile = null;
    fileInput.value = '';
    document.getElementById('sigPreview').style.display = 'none';
    document.getElementById('dropzone-idle').style.display = '';
    updateContinueState();
    document.getElementById('btnRetake').style.display = 'none';
    clearError();
  };

  // ── Upload and go to dashboard ─────────────────────────────
  window.uploadAndFinish = async function () {
    if (!selectedFile || !consentBox.checked) return;
    clearError();

    const btn = document.getElementById('btnContinue');
    btn.textContent = 'Uploading…';
    btn.disabled = true;

    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const saved = await apiRequest(`ESignature/${userId}`, 'POST', form, true);
      if (!saved?.signatureFilePath) throw new Error('Signature could not be confirmed. Please try again.');

      if (session.user) session.user.setupRequired = false;
      localStorage.setItem('user', JSON.stringify(session.user));

      window.location.href = '/MENTOR/HTML/mentor-dashboard.html';

    } catch (err) {
      showError(err.message || 'Upload failed. Please try again.');
      btn.textContent = 'Continue';
      btn.disabled = false;
    }
  };

  // ── Eye toggle (kept for any future use) ───────────────────
  window.toggleEye = function (inputId, btn) {
    const input = document.getElementById(inputId);
    const isHide = input.type === 'password';
    input.type = isHide ? 'text' : 'password';
    btn.querySelector('.eye-on').style.display  = isHide ? 'none' : '';
    btn.querySelector('.eye-off').style.display = isHide ? '' : 'none';
  };

  // ── Helpers ────────────────────────────────────────────────
  function showError(msg) {
    const el = document.getElementById('step1Error');
    el.textContent   = msg;
    el.style.display = 'block';
  }
  function clearError() {
    const el = document.getElementById('step1Error');
    el.style.display = 'none';
    el.textContent   = '';
  }

})();
