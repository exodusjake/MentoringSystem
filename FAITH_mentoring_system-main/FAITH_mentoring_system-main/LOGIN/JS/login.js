// ── Post-login loading screen ─────────────────────────────
// Shown after a successful sign-in while the dashboard is being fetched, so
// the page doesn't just freeze on the form.
function goWithLoading(url) {
  if (!document.getElementById('loginLoadingCss')) {
    const st = document.createElement('style');
    st.id = 'loginLoadingCss';
    st.textContent =
      '.login-loading{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
      'background:rgba(255,255,255,.94);backdrop-filter:blur(6px);opacity:0;transition:opacity .3s ease;font-family:inherit}' +
      '.login-loading.show{opacity:1}' +
      '.login-loading .ll-ring{width:52px;height:52px;border-radius:50%;border:4px solid #e5e7eb;border-top-color:#2563eb;animation:ll-spin .8s linear infinite}' +
      '.login-loading .ll-title{font-size:16px;font-weight:600;color:#111827}' +
      '.login-loading .ll-sub{font-size:13px;color:#6b7280;margin-top:-10px}' +
      '.login-loading .ll-bar{width:180px;height:4px;border-radius:4px;background:#e5e7eb;overflow:hidden}' +
      '.login-loading .ll-bar i{display:block;height:100%;width:40%;border-radius:4px;background:#2563eb;animation:ll-bar 1.1s ease-in-out infinite}' +
      '@keyframes ll-spin{to{transform:rotate(360deg)}}' +
      '@keyframes ll-bar{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}';
    document.head.appendChild(st);
  }
  const ov = document.createElement('div');
  ov.className = 'login-loading';
  ov.setAttribute('role', 'status');
  ov.innerHTML = '<div class="ll-ring"></div><div class="ll-title">Signing you in…</div>' +
    '<div class="ll-sub">Preparing your dashboard</div><div class="ll-bar"><i></i></div>';
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  setTimeout(() => { window.location.href = url; }, 1100);
}

// ── Log in ────────────────────────────────────────────────
// Two steps: the password is checked first, then a code emailed to the
// account's address must be entered before a session is issued.
let loginChallengeId = null;
let loginRemember = false;

function finishLogin(data, remember) {
  saveSession(data.token, data.role, data.user || {}, remember);

  const role = (data.role || '').toLowerCase();

  const setupRoutes = {
    mentor: '/MENTOR/HTML/setup.html',
    mentee: '/MENTEE/HTML/setup.html',
    admin:  '/ADMIN_/HTML/setup.html',
    head:   '/HEAD/HTML/setup.html'
  };
  if (data.user?.setupRequired === true && setupRoutes[role]) {
    goWithLoading(setupRoutes[role]);
    return;
  }

  const routes = {
    head:   '/HEAD/HTML/head-dashboard.html',
    admin:  '/ADMIN_/HTML/dashboard.html',
    mentor: '/MENTOR/HTML/mentor-dashboard.html',
    mentee: '/MENTEE/HTML/mentee-dashboard.html'
  };

  goWithLoading(routes[role] || '/LOGIN/HTML/login.html');
}

async function handleSignIn() {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;
  const btn      = document.getElementById('signinBtn');

  clearError();

  if (!email || !password) {
    showError('Please fill in both email and password.');
    return;
  }

  btn.textContent = 'Logging in…';
  btn.disabled    = true;

  try {
    // `remember` controls the issued token's expiry.
    const data = await apiRequest('Auth/login', 'POST', { Email: email, Password: password, RememberMe: remember });

    if (data.requiresCode) {
      loginChallengeId = data.challengeId;
      loginRemember    = remember;
      showCodeStep(data.email);
      btn.textContent = 'Log in';
      btn.disabled    = false;
      return;
    }

    finishLogin(data, remember);
  } catch (err) {
    showError(err.message || 'Invalid email or password.');
    btn.textContent = 'Log in';
    btn.disabled    = false;
  }
}

// ── Verification code step ────────────────────────────────
const OTP_LIFETIME_SECONDS = 600;   // matches the server's 10-minute code lifetime
let otpTimer = null;

function otpInputs() { return Array.from(document.querySelectorAll('#otpBoxes input')); }
function otpValue()  { return otpInputs().map(i => i.value).join(''); }

function clearOtp() {
  otpInputs().forEach(i => { i.value = ''; i.classList.remove('filled'); });
  const first = otpInputs()[0];
  if (first) first.focus();
}

function startOtpTimer() {
  clearInterval(otpTimer);
  let left = OTP_LIFETIME_SECONDS;
  const el = document.getElementById('otpTimer');
  const tick = () => {
    if (left <= 0) {
      clearInterval(otpTimer);
      el.textContent = 'expired';
      return;
    }
    el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    left--;
  };
  tick();
  otpTimer = setInterval(tick, 1000);
}

function showCodeStep(maskedEmail) {
  clearError();
  document.getElementById('loginStep').style.display = 'none';
  document.getElementById('contactText').style.display = 'none';
  document.querySelector('.login-card > .card-title').style.display = 'none';
  document.querySelector('.login-card > .card-subtitle').style.display = 'none';
  document.getElementById('codeStep').style.display = '';
  document.getElementById('otpEmail').textContent = maskedEmail || 'your email';
  clearOtp();
  startOtpTimer();
  startResendCooldown(30);
}

function backToLogin() {
  loginChallengeId = null;
  clearInterval(otpTimer);
  clearError();
  document.getElementById('codeStep').style.display = 'none';
  document.getElementById('loginStep').style.display = '';
  document.getElementById('contactText').style.display = '';
  document.querySelector('.login-card > .card-title').style.display = '';
  document.querySelector('.login-card > .card-subtitle').style.display = '';
  const btn = document.getElementById('verifyBtn');
  btn.textContent = 'Verify';
  btn.disabled = false;
  document.getElementById('password').value = '';
  document.getElementById('password').focus();
}

async function handleVerifyCode() {
  const code = otpValue();
  const btn  = document.getElementById('verifyBtn');
  clearError();

  if (!/^\d{6}$/.test(code)) {
    showError('Please enter the 6-digit code from your email.');
    return;
  }

  btn.textContent = 'Verifying…';
  btn.disabled    = true;

  try {
    const data = await apiRequest('Auth/verify-login-code', 'POST', { ChallengeId: loginChallengeId, Code: code });
    finishLogin(data, loginRemember);
  } catch (err) {
    showError(err.message || 'Could not verify the code.');
    btn.textContent = 'Verify';
    btn.disabled    = false;
    const boxes = document.getElementById('otpBoxes');
    boxes.classList.remove('shake');
    void boxes.offsetWidth;
    boxes.classList.add('shake');
    // Code expired or attempts used up: the challenge is gone, start over.
    if (err.restart) setTimeout(backToLogin, 2500);
    else clearOtp();
  }
}

let resendTimer = null;
function startResendCooldown(seconds) {
  const btn = document.getElementById('resendBtn');
  clearInterval(resendTimer);
  let left = seconds;
  btn.disabled = true;
  const tick = () => {
    if (left <= 0) {
      clearInterval(resendTimer);
      btn.disabled = false;
      btn.textContent = 'Resend';
      return;
    }
    btn.textContent = 'Resend (' + left + 's)';
    left--;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

async function handleResendCode() {
  clearError();
  try {
    await apiRequest('Auth/resend-login-code', 'POST', { ChallengeId: loginChallengeId, Code: '' });
    startResendCooldown(30);
    startOtpTimer();
    clearOtp();
  } catch (err) {
    showError(err.message || 'Could not resend the code.');
    if (err.restart) setTimeout(backToLogin, 2500);
  }
}

// One-digit boxes: type to advance, Backspace to go back, paste a full code.
(function () {
  const boxes = otpInputs();
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      box.classList.toggle('filled', !!box.value);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (otpValue().length === boxes.length) handleVerifyCode();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener('paste', e => {
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, boxes.length);
      if (!digits) return;
      e.preventDefault();
      digits.split('').forEach((d, k) => { boxes[k].value = d; boxes[k].classList.add('filled'); });
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
      if (digits.length === boxes.length) handleVerifyCode();
    });
  });
})();

// ── Password toggle ────────────────────────────────────────
function togglePassword() {
  const input   = document.getElementById('password');
  const eyeShow = document.getElementById('eyeShow');
  const eyeHide = document.getElementById('eyeHide');
  const isHidden = input.type === 'password';

  input.type        = isHidden ? 'text' : 'password';
  eyeShow.style.display = isHidden ? 'none'  : '';
  eyeHide.style.display = isHidden ? ''      : 'none';
}

// ── Error banner ───────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById(loginChallengeId ? 'codeErrorBanner' : 'errorBanner');
  el.classList.remove('success');
  el.textContent    = msg;
  el.style.display  = 'block';
}

function clearError() {
  for (const id of ['errorBanner', 'codeErrorBanner']) {
    const el = document.getElementById(id);
    el.style.display = 'none';
    el.textContent   = '';
  }
}

// ── Forgot password (inline in the login card) ──────────────
// Step 1: email -> emailed 6-digit code. Step 2: code + new password. Same look as the email-verification step.
let fpResendTimer = null;
let fpCodeTimer = null;

function fpBoxes() { return Array.from(document.querySelectorAll('#fpBoxes input')); }
function fpCode()  { return fpBoxes().map(i => i.value).join(''); }
function fpClearBoxes() {
  fpBoxes().forEach(i => { i.value = ''; i.classList.remove('filled'); });
  const first = fpBoxes()[0]; if (first) first.focus();
}

function fpMsg(n, text, ok) {
  const el = document.getElementById('fpBanner' + n);
  if (!text) { el.style.display = 'none'; return; }
  el.textContent = text;
  el.classList.toggle('success', !!ok);
  el.style.display = 'block';
}

function fpTogglePw(id, btn) {
  const input = document.getElementById(id);
  const hide = input.type === 'password';
  input.type = hide ? 'text' : 'password';
  btn.style.opacity = hide ? '1' : '';
}

function fpShowCard(on) {
  document.getElementById('loginStep').style.display = on ? 'none' : '';
  document.getElementById('contactText').style.display = on ? 'none' : '';
  document.querySelector('.login-card > .card-title').style.display = on ? 'none' : '';
  document.querySelector('.login-card > .card-subtitle').style.display = on ? 'none' : '';
  document.getElementById('forgotStep').style.display = on ? '' : 'none';
}

function showForgotStep() {
  clearError();
  fpShowCard(true);
  forgotShowEmail();
  const typed = document.getElementById('email').value.trim();
  if (typed) document.getElementById('fpEmail').value = typed;
  setTimeout(() => document.getElementById('fpEmail').focus(), 60);
}
function showForgotModal() { showForgotStep(); }   // kept for older markup

function forgotShowEmail() {
  clearInterval(fpResendTimer); clearInterval(fpCodeTimer);
  document.getElementById('fpEmailPane').style.display = '';
  document.getElementById('fpResetPane').style.display = 'none';
  fpMsg(1, ''); fpMsg(2, '');
  setTimeout(() => document.getElementById('fpEmail').focus(), 40);
}

function forgotBackToLogin() {
  clearInterval(fpResendTimer); clearInterval(fpCodeTimer);
  fpShowCard(false);
  fpMsg(1, ''); fpMsg(2, '');
  ['fpNewPw', 'fpNewPw2'].forEach(id => { const el = document.getElementById(id); el.value = ''; el.type = 'password'; });
  fpClearBoxes();
  const typed = document.getElementById('fpEmail').value.trim();
  if (typed) document.getElementById('email').value = typed;
  document.getElementById('password').focus();
}
function closeForgotModal() { forgotBackToLogin(); }   // kept for older markup

function fpStartTimers() {
  clearInterval(fpResendTimer); clearInterval(fpCodeTimer);
  const resend = document.getElementById('fpResend');
  let left = 60;
  resend.disabled = true;
  const tick = () => {
    if (left <= 0) { clearInterval(fpResendTimer); resend.disabled = false; resend.textContent = 'Resend'; return; }
    resend.textContent = 'Resend (' + left + 's)';
    left--;
  };
  tick();
  fpResendTimer = setInterval(tick, 1000);

  let life = 600;
  const el = document.getElementById('fpTimer');
  const tock = () => {
    if (life <= 0) { clearInterval(fpCodeTimer); el.textContent = 'expired'; return; }
    el.textContent = Math.floor(life / 60) + ':' + String(life % 60).padStart(2, '0');
    life--;
  };
  tock();
  fpCodeTimer = setInterval(tock, 1000);
}

async function handleForgotSend(isResend) {
  const email = document.getElementById('fpEmail').value.trim();
  const banner = isResend ? 2 : 1;
  fpMsg(1, ''); fpMsg(2, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fpMsg(banner, 'Please enter a valid email address.'); return; }

  const btn = document.getElementById('fpSendBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch(CONFIG.getUrl('Auth/forgot-password'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { fpMsg(banner, data.message || 'Something went wrong. Please try again.'); return; }
    document.getElementById('fpEmailShown').textContent = email;
    document.getElementById('fpEmailPane').style.display = 'none';
    document.getElementById('fpResetPane').style.display = '';
    fpStartTimers();
    fpClearBoxes();
    if (isResend) fpMsg(2, 'A new code has been requested.', true);
  } catch (err) {
    fpMsg(banner, 'Could not reach the server. Please check your connection.');
  } finally {
    btn.disabled = false; btn.textContent = 'Send Code';
  }
}

async function handleResetPassword() {
  const email = document.getElementById('fpEmail').value.trim();
  const code = fpCode();
  const pw = document.getElementById('fpNewPw').value;
  const pw2 = document.getElementById('fpNewPw2').value;
  fpMsg(2, '');

  if (!/^\d{6}$/.test(code)) { fpMsg(2, 'Enter the 6-digit code from your email.'); return; }
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { fpMsg(2, 'Password must be at least 8 characters and include a letter and a number.'); return; }
  if (pw !== pw2) { fpMsg(2, 'The passwords do not match.'); return; }

  const btn = document.getElementById('fpResetBtn');
  btn.disabled = true; btn.textContent = 'Resetting…';
  try {
    const res = await fetch(CONFIG.getUrl('Auth/reset-password'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword: pw })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      fpMsg(2, data.message || 'Something went wrong. Please try again.');
      const boxes = document.getElementById('fpBoxes');
      boxes.classList.remove('shake'); void boxes.offsetWidth; boxes.classList.add('shake');
      if (!data.restart) fpClearBoxes();
      return;
    }

    forgotBackToLogin();
    document.getElementById('email').value = email;
    document.getElementById('password').value = '';
    const banner = document.getElementById('errorBanner');
    banner.textContent = 'Password reset! Log in with your new password.';
    banner.classList.add('success');
    banner.style.display = 'block';
    document.getElementById('password').focus();
  } catch (err) {
    fpMsg(2, 'Could not reach the server. Please check your connection.');
  } finally {
    btn.disabled = false; btn.textContent = 'Reset Password';
  }
}

// One-digit code boxes (same behaviour as the email-verification step).
(function () {
  const boxes = fpBoxes();
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      box.classList.toggle('filled', !!box.value);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      else if (box.value && fpCode().length === boxes.length) document.getElementById('fpNewPw').focus();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled'); }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener('paste', e => {
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, boxes.length);
      if (!digits) return;
      e.preventDefault();
      digits.split('').forEach((d, k) => { boxes[k].value = d; boxes[k].classList.add('filled'); });
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
    });
  });
})();

// ── Keyboard shortcut ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') { if (e.target.closest && e.target.closest('.contact-side')) return;
    if (e.target.closest && e.target.closest('#forgotStep')) { if (e.target.id === 'fpEmail') handleForgotSend(); else if (e.target.tagName === 'INPUT' && e.target.closest('#fpResetPane')) handleResetPassword(); return; } if (loginChallengeId) handleVerifyCode(); else handleSignIn(); }
  if (e.key === 'Escape' && document.getElementById('forgotStep').style.display !== 'none') forgotBackToLogin();
});

// ── Auto-redirect if already logged in ────────────────────
if (typeof isLoggedIn === 'function' && isLoggedIn()) {
  const session = getSession();
  const role    = (session.role || '').toLowerCase();

  // Still owes the first-login signature? Send them back to setup, not
  // the dashboard — this is what "Back to Login" on the setup page was
  // silently bypassing (a signed-in account landing here just got routed
  // straight past the gate).
  const setupRoutes = {
    mentor: '/MENTOR/HTML/setup.html',
    mentee: '/MENTEE/HTML/setup.html',
    admin:  '/ADMIN_/HTML/setup.html',
    head:   '/HEAD/HTML/setup.html'
  };
  if (session.user?.setupRequired === true && setupRoutes[role]) {
    window.location.href = setupRoutes[role];
  } else {
    const routes = {
      head:   '/HEAD/HTML/head-dashboard.html',
      admin:  '/ADMIN_/HTML/dashboard.html',
      mentor: '/MENTOR/HTML/mentor-dashboard.html',
      mentee: '/MENTEE/HTML/mentee-dashboard.html'
    };
    window.location.href = routes[role] || '/LOGIN/HTML/login.html';
  }
}

// ── Caps Lock hint (password field) ───────────────────────
(function () {
  const pw   = document.getElementById('password');
  const hint = document.getElementById('capsHint');
  if (!pw || !hint) return;
  const check = e => { hint.style.display = e.getModifierState && e.getModifierState('CapsLock') ? '' : 'none'; };
  pw.addEventListener('keydown', check);
  pw.addEventListener('keyup', check);
  pw.addEventListener('blur', () => { hint.style.display = 'none'; });
})();

// ── Start with the email field ready (desktop only, so phones don't pop the keyboard) ──
if (window.matchMedia('(hover: hover)').matches) {
  const first = document.getElementById('email');
  if (first && !first.value) first.focus();
}
