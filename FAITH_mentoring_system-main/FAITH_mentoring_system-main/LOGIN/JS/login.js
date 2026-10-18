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
      window.location.href = setupRoutes[role];
      return;
    }

    const routes = {
      head:   '/HEAD/HTML/head-dashboard.html',
      admin:  '/ADMIN_/HTML/dashboard.html',
      mentor: '/MENTOR/HTML/mentor-dashboard.html',
      mentee: '/MENTEE/HTML/mentee-dashboard.html'
    };

    window.location.href = routes[role] || '/LOGIN/HTML/login.html';

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
