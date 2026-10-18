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
    // `remember` was already being read from the checkbox and passed to
    // saveSession() below, but never actually sent to the backend — the
    // checkbox visually toggled but had zero effect on how long the
    // session actually lasted. Now it controls the issued token's expiry.
    const data = await apiRequest('Auth/login', 'POST', { Email: email, Password: password, RememberMe: remember });

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

  } catch (err) {
    showError(err.message || 'Invalid email or password.');
    btn.textContent = 'Log in';
    btn.disabled    = false;
  }
}

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
  const el = document.getElementById('errorBanner');
  el.textContent    = msg;
  el.style.display  = 'block';
}

function clearError() {
  const el = document.getElementById('errorBanner');
  el.style.display = 'none';
  el.textContent   = '';
}

// ── Forgot password modal ──────────────────────────────────
function showForgotModal() {
  document.getElementById('forgotModal').style.display = 'flex';
}

function closeForgotModal(e) {
  if (!e || e.target === document.getElementById('forgotModal')) {
    document.getElementById('forgotModal').style.display = 'none';
  }
}

// ── Keyboard shortcut ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSignIn();
  if (e.key === 'Escape') closeForgotModal();
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
