import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { apiRequest, postJson } from '../../lib/api.js';
import { useStyle } from '../../lib/injectStyle.js';
import { validatePassword } from '../../lib/passwordPolicy.js';
import { getSession, isLoggedIn, PORTALS, roleKey, saveSession } from '../../lib/session.js';
import PasswordMeter from '../../components/PasswordMeter.jsx';
import OtpBoxes from './OtpBoxes.jsx';
import { useRipple } from './publicEffects.js';

// Login page (LOGIN/HTML/login.html + login.js, contact.js, fit-screen.js, effects.js).
// Sign-in is two steps: the password is checked, then a code emailed to the account must be
// entered (first login). "Forgot password" runs inside the same card in three steps.
const OTP_LIFETIME_SECONDS = 600;   // matches the server's 10-minute code lifetime
const EMPTY6 = ['', '', '', '', '', ''];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOADING_CSS =
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

const fmtLeft = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

// A countdown in seconds; `start(n)` restarts it, `stop()` cancels. `left` is null when idle.
function useCountdown() {
  const [left, setLeft] = useState(null);
  const timer = useRef(null);
  const stop = useCallback(() => { clearInterval(timer.current); timer.current = null; }, []);
  const start = useCallback(seconds => {
    stop();
    let n = seconds;
    setLeft(n);
    timer.current = setInterval(() => {
      n--;
      setLeft(n);
      if (n <= 0) stop();
    }, 1000);
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { left, start, stop };
}

export default function Login() {
  const navigate = useNavigate();
  useRipple();

  // ── Already signed in: straight to the portal ──
  const [redirected] = useState(() => {
    if (!isLoggedIn()) return false;
    const portal = PORTALS[roleKey(getSession().role)];
    return portal ? portal.home : '/login';
  });
  useEffect(() => { if (redirected) navigate(redirected); }, []);

  // ── Step 1: email + password ──
  const [step, setStep] = useState('login');            // 'login' | 'code' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [banner, setBanner] = useState(null);            // { text, success } on #errorBanner
  const [codeBanner, setCodeBanner] = useState(null);    // #codeErrorBanner
  const [loadingTo, setLoadingTo] = useState(null);      // post-login overlay
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // ── Step 2: emailed code ──
  const challenge = useRef({ id: null, remember: false });
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState(EMPTY6);
  const [otpShake, setOtpShake] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const otpLife = useCountdown();
  const resendWait = useCountdown();
  const otpRef = useRef(null);

  // ── Forgot password ──
  const [fpPane, setFpPane] = useState('fpEmailPane');
  const [fpEmail, setFpEmail] = useState('');
  const [fpEmailShown, setFpEmailShown] = useState('');
  const [fpBanners, setFpBanners] = useState({});        // { 1|2|3: { text, ok } }
  const [fpSending, setFpSending] = useState(false);
  const [fpVerifying, setFpVerifying] = useState(false);
  const [fpResetting, setFpResetting] = useState(false);
  const [fpDigits, setFpDigits] = useState(EMPTY6);
  const [fpShake, setFpShake] = useState(0);
  const [fpPw, setFpPw] = useState({ a: '', b: '', showA: false, showB: false });
  const fpToken = useRef(null);
  const fpResend = useCountdown();
  const fpLife = useCountdown();
  const fpEmailRef = useRef(null);
  const fpNewPwRef = useRef(null);
  const fpCodeRef = useRef(null);

  // ── Contact panel ──
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState({ name: '', email: '', topic: 'General inquiry', message: '', website: '' });
  const [contactBanner, setContactBanner] = useState(null);
  const [contactSending, setContactSending] = useState(false);
  const cNameRef = useRef(null);

  // ── Error banners ──
  const showError = msg => (challenge.current.id ? setCodeBanner : setBanner)({ text: msg, success: false });
  const clearError = () => { setBanner(null); setCodeBanner(null); };

  // ── Post-login loading screen, then the portal ──
  function goWithLoading(url) {
    setLoadingTo(url);
    setTimeout(() => navigate(url), 1100);
  }
  function finishLogin(data, rememberMe) {
    saveSession(data.token, data.role, data.user || {}, rememberMe);
    const portal = PORTALS[roleKey(data.role)];
    if (data.user?.setupRequired === true && portal) { goWithLoading(portal.setup); return; }
    goWithLoading(portal ? portal.home : '/login');
  }

  async function handleSignIn() {
    clearError();
    const em = email.trim();
    if (!em || !password) { showError('Please fill in both email and password.'); return; }
    setSigningIn(true);
    try {
      // `remember` controls the issued token's expiry.
      const data = await apiRequest('Auth/login', 'POST', { Email: em, Password: password, RememberMe: remember });
      if (data.requiresCode) {
        challenge.current = { id: data.challengeId, remember };
        showCodeStep(data.email);
        setSigningIn(false);
        return;
      }
      finishLogin(data, remember);
    } catch (err) {
      showError(err.message || 'Invalid email or password.');
      setSigningIn(false);
    }
  }

  function showCodeStep(masked) {
    setBanner(null); setCodeBanner(null);
    setStep('code');
    setMaskedEmail(masked || 'your email');
    setOtp(EMPTY6);
    setTimeout(() => otpRef.current?.focusFirst());
    otpLife.start(OTP_LIFETIME_SECONDS);
    resendWait.start(30);
  }

  function backToLogin() {
    challenge.current = { id: null, remember: false };
    otpLife.stop();
    clearError();
    setStep('login');
    setVerifying(false);
    setPassword('');
    setTimeout(() => passwordRef.current?.focus());
  }

  async function handleVerifyCode(code = otp.join('')) {
    clearError();
    if (!/^\d{6}$/.test(code)) { showError('Please enter the 6-digit code from your email.'); return; }
    setVerifying(true);
    try {
      const data = await apiRequest('Auth/verify-login-code', 'POST', { ChallengeId: challenge.current.id, Code: code });
      finishLogin(data, challenge.current.remember);
    } catch (err) {
      showError(err.message || 'Could not verify the code.');
      setVerifying(false);
      setOtpShake(n => n + 1);
      // Code expired or attempts used up: the challenge is gone, start over.
      if (err.restart) setTimeout(backToLogin, 2500);
      else { setOtp(EMPTY6); otpRef.current?.focusFirst(); }
    }
  }

  async function handleResendCode() {
    clearError();
    try {
      await apiRequest('Auth/resend-login-code', 'POST', { ChallengeId: challenge.current.id, Code: '' });
      resendWait.start(30);
      otpLife.start(OTP_LIFETIME_SECONDS);
      setOtp(EMPTY6);
      otpRef.current?.focusFirst();
    } catch (err) {
      showError(err.message || 'Could not resend the code.');
      if (err.restart) setTimeout(backToLogin, 2500);
    }
  }

  // ── Forgot password ──
  const fpMsg = (n, text, ok) => { setFpBanners(b => ({ ...b, [n]: text ? { text, ok: !!ok } : null })); refit(); };
  const fpClearAll = () => setFpBanners({});
  function showFpPane(name) { setFpPane(name); fpClearAll(); refit(); }

  function showForgotStep() {
    clearError();
    setStep('forgot');
    forgotShowEmail();
    const typed = email.trim();
    if (typed) setFpEmail(typed);
    setTimeout(() => fpEmailRef.current?.focus(), 60);
  }
  function forgotShowEmail() {
    fpResend.stop(); fpLife.stop();
    fpToken.current = null;
    showFpPane('fpEmailPane');
    setTimeout(() => fpEmailRef.current?.focus(), 40);
  }
  function forgotBackToLogin() {
    fpResend.stop(); fpLife.stop();
    fpToken.current = null;
    setStep('login');
    fpClearAll();
    setFpPw({ a: '', b: '', showA: false, showB: false });
    setFpDigits(EMPTY6);
    const typed = fpEmail.trim();
    if (typed) setEmail(typed);
    setTimeout(() => passwordRef.current?.focus());
  }

  // Step 1 -> 2 (also used by "Resend")
  async function handleForgotSend(isResend) {
    const em = fpEmail.trim();
    const n = isResend ? 2 : 1;
    fpClearAll();
    if (!EMAIL_RE.test(em)) { fpMsg(n, 'Please enter a valid email address.'); return; }
    setFpSending(true);
    try {
      const res = await postJson('Auth/forgot-password', { email: em });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { fpMsg(n, data.message || 'Something went wrong. Please try again.'); return; }
      setFpEmailShown(em);
      showFpPane('fpCodePane');
      fpResend.start(60);
      fpLife.start(600);
      setFpDigits(EMPTY6);
      setTimeout(() => fpCodeRef.current?.focusFirst());
      if (isResend) fpMsg(2, 'A new code has been requested.', true);
    } catch (err) {
      fpMsg(n, 'Could not reach the server. Please check your connection.');
    } finally {
      setFpSending(false);
    }
  }

  // Step 2 -> 3: check the code on its own; only then does the new-password step appear.
  async function handleVerifyResetCode(code = fpDigits.join('')) {
    fpMsg(2, '');
    if (!/^\d{6}$/.test(code)) { fpMsg(2, 'Enter the 6-digit code from your email.'); return; }
    if (fpVerifying) return;
    setFpVerifying(true);
    try {
      const res = await postJson('Auth/verify-reset-code', { email: fpEmail.trim(), code });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fpMsg(2, data.message || 'Something went wrong. Please try again.');
        setFpShake(k => k + 1);
        if (data.restart) setTimeout(forgotShowEmail, 2200);
        else { setFpDigits(EMPTY6); fpCodeRef.current?.focusFirst(); }
        return;
      }
      fpToken.current = data.token;
      fpResend.stop(); fpLife.stop();
      showFpPane('fpNewPane');
      setTimeout(() => fpNewPwRef.current?.focus(), 60);
    } catch (err) {
      fpMsg(2, 'Could not reach the server. Please check your connection.');
    } finally {
      setFpVerifying(false);
    }
  }

  // Step 3: set the new password.
  async function handleResetPassword() {
    const em = fpEmail.trim();
    fpMsg(3, '');
    const policy = validatePassword(fpPw.a);
    if (policy) { fpMsg(3, policy); return; }
    if (fpPw.a !== fpPw.b) { fpMsg(3, 'The passwords do not match.'); return; }
    setFpResetting(true);
    try {
      const res = await postJson('Auth/reset-password', { email: em, token: fpToken.current, newPassword: fpPw.a });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fpMsg(3, data.message || 'Something went wrong. Please try again.');
        if (data.restart) setTimeout(forgotShowEmail, 2200);
        return;
      }
      forgotBackToLogin();
      setEmail(em);
      setPassword('');
      setBanner({ text: 'Password reset! Log in with your new password.', success: true });
    } catch (err) {
      fpMsg(3, 'Could not reach the server. Please check your connection.');
    } finally {
      setFpResetting(false);
    }
  }

  // ── Contact form ──
  function toggleContact(open) {
    setContactOpen(open);
    if (open) setTimeout(() => cNameRef.current?.focus({ preventScroll: true }), 450);
  }
  async function submitContact(e) {
    e.preventDefault();
    setContactBanner(null);
    const name = contact.name.trim(), em = contact.email.trim(), message = contact.message.trim();
    if (name.length < 2) return setContactBanner({ text: 'Please enter your name.' });
    if (!EMAIL_RE.test(em)) return setContactBanner({ text: 'Please enter a valid email address.' });
    if (message.length < 10) return setContactBanner({ text: 'Please write a little more (at least 10 characters).' });
    setContactSending(true);
    try {
      const res = await postJson('Contact', { name, email: em, topic: contact.topic, message, website: contact.website });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setContactBanner({ text: data.message || 'Something went wrong. Please try again.' });
      setContactBanner({ text: data.message || 'Your message has been sent.', ok: true });
      setContact({ name: '', email: '', topic: 'General inquiry', message: '', website: '' });
    } catch (err) {
      setContactBanner({ text: 'Could not reach the server. Please check your connection and try again.' });
    } finally {
      setContactSending(false);
    }
  }

  // ── Keyboard: Enter submits the current step; Escape leaves forgot-password / contact ──
  const keys = useRef();
  keys.current = { step, fpPane, contactOpen, handleSignIn, handleVerifyCode, handleForgotSend, handleVerifyResetCode, handleResetPassword, forgotBackToLogin, toggleContact };
  useEffect(() => {
    const onKey = e => {
      const k = keys.current;
      if (e.key === 'Enter') {
        if (e.target.closest && e.target.closest('.contact-side')) return;
        if (e.target.closest && e.target.closest('#forgotStep')) {
          if (e.target.id === 'fpEmail') k.handleForgotSend();
          else if (e.target.closest('#fpCodePane')) k.handleVerifyResetCode();
          else if (e.target.tagName === 'INPUT' && e.target.closest('#fpNewPane')) k.handleResetPassword();
          return;
        }
        if (challenge.current.id) k.handleVerifyCode(); else k.handleSignIn();
      }
      if (e.key === 'Escape') {
        if (k.step === 'forgot') k.forgotBackToLogin();
        if (k.contactOpen) k.toggleContact(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Fit the card to short windows (fit-screen.js): scale logo/card/links down just enough ──
  const wrapperRef = useRef(null);
  const fit = useCallback(() => {
    wrapperRef.current?.querySelectorAll('.right-side').forEach(side => {
      const parts = ['.right-logo', '.login-card', '.bottom-links'].map(s => side.querySelector(s)).filter(Boolean);
      if (parts.length < 2) return;
      parts.forEach(p => { p.style.zoom = 1; });
      const cs = getComputedStyle(side);
      const avail = side.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need = parts.reduce((h, p) => {
        const m = getComputedStyle(p);
        return h + p.offsetHeight + (parseFloat(m.marginTop) || 0) * (m.marginTop.endsWith('px') ? 1 : 0) + (parseFloat(m.marginBottom) || 0) * (m.marginBottom.endsWith('px') ? 1 : 0);
      }, 0);
      const z = need > avail ? Math.max(0.45, avail / need) : 1;
      parts.forEach(p => { p.style.zoom = z; });
    });
  }, []);
  const refit = useCallback(() => { requestAnimationFrame(fit); setTimeout(fit, 80); }, [fit]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    // The card's height depends on the web font; refit once it has loaded (the original's
    // window 'load' refit caught this, as the page loaded with its fonts).
    document.fonts?.ready.then(fit);
    // Also watch the card and links themselves: their height changes when the web font arrives
    // (fit() restores the same zoom, so this settles rather than loops).
    const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null;
    wrapperRef.current?.querySelectorAll('.right-side, .right-side > .login-card, .right-side > .bottom-links').forEach(s => ro?.observe(s));
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('load', fit); ro?.disconnect(); };
  }, [fit]);
  useLayoutEffect(() => { refit(); }, [step]);

  // Start with the email field ready (desktop only, so phones don't pop the keyboard).
  const focusFirst = () => { if (window.matchMedia('(hover: hover)').matches && !emailRef.current?.value) emailRef.current?.focus(); };

  if (redirected) return null;
  const hidden = { display: 'none' };
  const inLogin = step === 'login';
  const bannerEl = (id, b) => (
    <div className={'error-banner' + (b?.success || b?.ok ? ' success' : '')} id={id} style={{ display: b ? 'block' : 'none' }}>{b ? b.text : ''}</div>
  );
  const eye = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );
  const resendLabel = (left, word = 'Resend') => (left > 0 ? `${word} (${left}s)` : word);

  return (
    <Page id="LOGIN/login" onReady={() => { fit(); focusFirst(); }}>
      <div className={'wrapper' + (contactOpen ? ' show-contact' : '')} ref={wrapperRef}>
        {/* Left panel */}
        {' '}
        <div className="left-side">
          <img src="/IMAGES/LOGO.png" alt="Astra Mentoring" className="left-logo-img" />
          {' '}
          <div className="left-divider"></div>
          {' '}
          <h2 className="left-school">FAITH Colleges</h2>
          {' '}
          <p className="left-tagline">
            Welcome to the{' '}
            <strong>HOME</strong>
            {' '}of the{' '}
            <strong>BRAVEHEARTS</strong>
          </p>
          {' '}
          <ul className="left-points">
            {['Book and track mentoring sessions', 'Secure QR-code attendance', 'E-signed logsheets and reports'].map(text => (
              <li key={text}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
                {text}
              </li>
            ))}
          </ul>
          {' '}
          <button type="button" className="slide-btn" id="slideBtn" aria-controls="contactPanel" aria-expanded={String(contactOpen)}
            onClick={() => toggleContact(!contactOpen)}>
            <span className="slide-btn-label" id="slideBtnLabel">Login now</span>
            {' '}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14"></path>
              <path d="m13 6 6 6-6 6"></path>
            </svg>
          </button>
          {' '}
          {/* decorative shapes */}
          <span className="shape s1" aria-hidden="true"></span>
          {' '}
          <span className="shape s2" aria-hidden="true"></span>
          {' '}
          <span className="shape s3" aria-hidden="true"></span>
          {' '}
          <span className="shape s4" aria-hidden="true"></span>
        </div>
        {' '}
        {/* Right panel */}
        <div className="right-side" inert={contactOpen}>
          <a href="/landing" className="back-home" title="Home" aria-label="Home">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5 12 3l9 7.5"></path>
              <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"></path>
            </svg>
          </a>
          {' '}
          <div className="login-card">
            <h1 className="card-title" style={inLogin ? undefined : hidden}>Welcome Back</h1>
            {' '}
            <p className="card-subtitle" style={inLogin ? undefined : hidden}>Log in with your institutional email address</p>
            {' '}
            <div id="loginStep" style={inLogin ? undefined : hidden}>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                {' '}
                <div className="input-wrap">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    <path d="m22 7-10 6L2 7"></path>
                  </svg>
                  {' '}
                  <input type="email" id="email" placeholder="yourname@faith.edu.ph" autoComplete="email" ref={emailRef}
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
              {' '}
              <div className="form-group">
                <label htmlFor="password">
                  Password{' '}
                  <span className="caps-hint" id="capsHint" style={caps ? undefined : hidden}>Caps Lock is on</span>
                </label>
                {' '}
                <div className="pw-wrap input-wrap">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  {' '}
                  <input type={showPw ? 'text' : 'password'} id="password" placeholder="••••••••••" autoComplete="current-password" ref={passwordRef}
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => setCaps(!!(e.getModifierState && e.getModifierState('CapsLock')))}
                    onKeyUp={e => setCaps(!!(e.getModifierState && e.getModifierState('CapsLock')))}
                    onBlur={() => setCaps(false)} />
                  {' '}
                  <button type="button" className="pw-toggle" onClick={() => setShowPw(s => !s)} tabIndex="-1" aria-label="Toggle password visibility">
                    <svg id="eyeShow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={showPw ? hidden : undefined}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      {' '}
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    {' '}
                    <svg id="eyeHide" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={showPw ? undefined : hidden}>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                      {' '}
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
                      {' '}
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  </button>
                </div>
              </div>
              {' '}
              <div className="form-options">
                <label className="remember-me">
                  <input type="checkbox" id="remember" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  {' '}Remember me
                </label>
                {' '}
                <button type="button" className="forgot-link" onClick={showForgotStep}>Forgot Password?</button>
              </div>
              {' '}
              {bannerEl('errorBanner', banner)}
              {' '}
              <button className="btn-signin" id="signinBtn" disabled={signingIn} onClick={() => handleSignIn()}>{signingIn ? 'Logging in…' : 'Log in'}</button>
            </div>
            {' '}
            {/* Step 2: one-time email verification (first login only) */}
            <div id="codeStep" className="otp-step" style={step === 'code' ? undefined : hidden}>
              <div className="otp-icon" aria-hidden="true">
                <svg viewBox="0 0 64 64" fill="none">
                  <rect x="10" y="18" width="44" height="30" rx="4" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"></rect>
                  {' '}
                  <path d="m12 21 20 16 20-16" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                  {' '}
                  <circle cx="49" cy="17" r="8" fill="#f0b429"></circle>
                  {' '}
                  <path d="m45.5 17 2.5 2.5 4.5-5" stroke="#0b1a5c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </div>
              {' '}
              <h1 className="card-title">Verify Your Email</h1>
              {' '}
              <p className="otp-sub">
                A 6-digit code has been sent to
                <br />
                <strong id="otpEmail">{maskedEmail}</strong>
                {' '}
                <button type="button" className="forgot-link" onClick={backToLogin}>Change</button>
              </p>
              {' '}
              <OtpBoxes id="otpBoxes" ref={otpRef} digits={otp} setDigits={setOtp} shake={otpShake} onComplete={code => handleVerifyCode(code)} />
              {' '}
              {bannerEl('codeErrorBanner', codeBanner)}
              {' '}
              <ul className="otp-notes">
                <li>
                  This code expires in{' '}
                  <strong id="otpTimer">{otpLife.left === null ? '10:00' : otpLife.left <= 0 ? 'expired' : fmtLeft(otpLife.left)}</strong>
                </li>
                <li>
                  Didn't receive the code?{' '}
                  <button type="button" className="forgot-link" id="resendBtn" disabled={resendWait.left > 0} onClick={handleResendCode}>{resendLabel(resendWait.left)}</button>
                </li>
                <li>Check your spam folder if you can't find it.</li>
              </ul>
              {' '}
              <button className="btn-signin" id="verifyBtn" disabled={verifying} onClick={() => handleVerifyCode()}>{verifying ? 'Verifying…' : 'Verify'}</button>
              {' '}
              <p className="otp-once">
                You only need to do this once. After your email is verified, you can log in with your password alone.
              </p>
            </div>
            {' '}
            {/* Forgot password (in the same card, like the email verification step) */}
            <div id="forgotStep" className="otp-step" style={step === 'forgot' ? undefined : hidden}>
              {/* Step 1: ask for the email */}
              <div id="fpEmailPane" style={fpPane === 'fpEmailPane' ? undefined : hidden}>
                <div className="otp-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 64" fill="none">
                    <rect x="14" y="28" width="36" height="26" rx="5" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"></rect>
                    {' '}
                    <path d="M22 28v-7a10 10 0 0 1 20 0v7" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round"></path>
                    {' '}
                    <circle cx="32" cy="41" r="4" fill="#f0b429"></circle>
                    {' '}
                    <path d="M32 44v5" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round"></path>
                  </svg>
                </div>
                {' '}
                <h1 className="card-title">Forgot Password?</h1>
                {' '}
                <p className="otp-sub">Enter your email address and we’ll send you a code to reset your password.</p>
                {' '}
                <div className="form-group">
                  <label htmlFor="fpEmail">Email Address</label>
                  {' '}
                  <div className="input-wrap">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                      <path d="m22 7-10 6L2 7"></path>
                    </svg>
                    {' '}
                    <input type="email" id="fpEmail" placeholder="yourname@faith.edu.ph" autoComplete="email" ref={fpEmailRef}
                      value={fpEmail} onChange={e => setFpEmail(e.target.value)} />
                  </div>
                </div>
                {' '}
                {bannerEl('fpBanner1', fpBanners[1])}
                {' '}
                <button className="btn-signin" id="fpSendBtn" disabled={fpSending} onClick={() => handleForgotSend()}>{fpSending ? 'Sending…' : 'Send Code'}</button>
                {' '}
                <p className="otp-once">
                  <button type="button" className="forgot-link" onClick={forgotBackToLogin}>← Back to log in</button>
                </p>
              </div>
              {' '}
              {/* Step 2: the emailed code only */}
              <div id="fpCodePane" style={fpPane === 'fpCodePane' ? undefined : hidden}>
                <div className="otp-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 64" fill="none">
                    <rect x="10" y="18" width="44" height="30" rx="4" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"></rect>
                    {' '}
                    <path d="m12 21 20 16 20-16" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                    {' '}
                    <circle cx="49" cy="17" r="8" fill="#f0b429"></circle>
                    {' '}
                    <path d="m45.5 17 2.5 2.5 4.5-5" stroke="#0b1a5c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
                {' '}
                <h1 className="card-title">Enter Verification Code</h1>
                {' '}
                <p className="otp-sub">
                  If{' '}
                  <strong id="fpEmailShown">{fpEmailShown}</strong>
                  {' '}is registered, a 6-digit code is on its way.{' '}
                  <button type="button" className="forgot-link" onClick={forgotShowEmail}>Change</button>
                </p>
                {' '}
                <OtpBoxes id="fpBoxes" ref={fpCodeRef} digits={fpDigits} setDigits={setFpDigits} shake={fpShake} onComplete={code => handleVerifyResetCode(code)} />
                {' '}
                {bannerEl('fpBanner2', fpBanners[2])}
                {' '}
                <ul className="otp-notes">
                  <li>
                    This code expires in{' '}
                    <strong id="fpTimer">{fpLife.left === null ? '10:00' : fpLife.left <= 0 ? 'expired' : fmtLeft(fpLife.left)}</strong>
                  </li>
                  <li>
                    Didn’t receive the code?{' '}
                    <button type="button" className="forgot-link" id="fpResend" disabled={fpResend.left > 0} onClick={() => handleForgotSend(true)}>{resendLabel(fpResend.left)}</button>
                  </li>
                  <li>Check your spam folder if you can’t find it.</li>
                </ul>
                {' '}
                <button className="btn-signin" id="fpVerifyBtn" disabled={fpVerifying} onClick={() => handleVerifyResetCode()}>{fpVerifying ? 'Verifying…' : 'Verify'}</button>
                {' '}
                <p className="otp-once">
                  <button type="button" className="forgot-link" onClick={forgotBackToLogin}>← Back to log in</button>
                </p>
              </div>
              {' '}
              {/* Step 3: new password (only after the code is verified) */}
              <div id="fpNewPane" style={fpPane === 'fpNewPane' ? undefined : hidden}>
                <div className="otp-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 64" fill="none">
                    <rect x="14" y="28" width="36" height="26" rx="5" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"></rect>
                    {' '}
                    <path d="M22 28v-7a10 10 0 0 1 20 0v7" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round"></path>
                    {' '}
                    <circle cx="46" cy="18" r="8" fill="#f0b429"></circle>
                    {' '}
                    <path d="m42.5 18 2.5 2.5 4.5-5" stroke="#0b1a5c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
                {' '}
                <h1 className="card-title">Create New Password</h1>
                {' '}
                <p className="otp-sub">Code verified. Choose a new password for your account.</p>
                {' '}
                <div className="form-group fp-pw">
                  <label htmlFor="fpNewPw">New Password</label>
                  {' '}
                  <div className="pw-wrap input-wrap">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    {' '}
                    <input type={fpPw.showA ? 'text' : 'password'} id="fpNewPw" data-pw-policy="" data-pw-attached="1" placeholder="Create a strong password" autoComplete="new-password"
                      ref={fpNewPwRef} value={fpPw.a} onChange={e => setFpPw(p => ({ ...p, a: e.target.value }))} />
                    {' '}
                    <button type="button" className="pw-toggle" tabIndex="-1" aria-label="Show or hide password"
                      style={fpPw.showA ? { opacity: '1' } : undefined} onClick={() => setFpPw(p => ({ ...p, showA: !p.showA }))}>
                      {eye}
                    </button>
                  </div>
                  <PasswordMeter value={fpPw.a} />
                </div>
                {' '}
                <div className="form-group fp-pw">
                  <label htmlFor="fpNewPw2">Repeat New Password</label>
                  {' '}
                  <div className="pw-wrap input-wrap">
                    <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    {' '}
                    <input type={fpPw.showB ? 'text' : 'password'} id="fpNewPw2" placeholder="Repeat the password" autoComplete="new-password"
                      value={fpPw.b} onChange={e => setFpPw(p => ({ ...p, b: e.target.value }))} />
                    {' '}
                    <button type="button" className="pw-toggle" tabIndex="-1" aria-label="Show or hide password"
                      style={fpPw.showB ? { opacity: '1' } : undefined} onClick={() => setFpPw(p => ({ ...p, showB: !p.showB }))}>
                      {eye}
                    </button>
                  </div>
                </div>
                {' '}
                {bannerEl('fpBanner3', fpBanners[3])}
                {' '}
                <button className="btn-signin" id="fpResetBtn" disabled={fpResetting} onClick={handleResetPassword}>{fpResetting ? 'Resetting…' : 'Reset Password'}</button>
                {' '}
                <p className="otp-once">
                  <button type="button" className="forgot-link" onClick={forgotBackToLogin}>← Back to log in</button>
                </p>
              </div>
            </div>
            {' '}
            <p className="contact-text" id="contactText" style={inLogin ? undefined : hidden}>
              Cannot log in?{' '}
              <button type="button" className="forgot-link" data-contact-toggle="" onClick={e => { e.preventDefault(); toggleContact(!contactOpen); }}>Contact us</button>
            </p>
          </div>
          {' '}
          <div className="bottom-links">
            <a href="/terms">Terms of Service</a>
            {' '}
            <a href="/privacy">Privacy Policy</a>
            {' '}
            <a href="/landing#faq">Help</a>
          </div>
        </div>
        {' '}
        {/* Contact panel (revealed when the blue panel slides right) */}
        <div className="right-side contact-side" id="contactPanel" aria-hidden={String(!contactOpen)} inert={!contactOpen}>
          <div className="login-card contact-card">
            <h1 className="card-title">Contact Us</h1>
            {' '}
            <p className="card-subtitle">Questions, concerns or feedback? Send the Guidance Office a message.</p>
            {' '}
            <form id="contactForm" noValidate onSubmit={submitContact}>
              <div className="contact-row">
                <div className="form-group">
                  <label htmlFor="cName">Full Name</label>
                  {' '}
                  <input type="text" id="cName" maxLength="100" autoComplete="name" placeholder="Juan Dela Cruz" ref={cNameRef}
                    value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} />
                </div>
                {' '}
                <div className="form-group">
                  <label htmlFor="cEmail">Email Address</label>
                  {' '}
                  <input type="email" id="cEmail" maxLength="150" autoComplete="email" placeholder="you@email.com"
                    value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} />
                </div>
              </div>
              {' '}
              <div className="form-group">
                <label htmlFor="cTopic">Topic</label>
                {' '}
                <select id="cTopic" value={contact.topic} onChange={e => setContact(c => ({ ...c, topic: e.target.value }))}>
                  <option>General inquiry</option>
                  <option>Account or login help</option>
                  <option>Report a problem</option>
                  <option>Feedback or suggestion</option>
                  <option>Other</option>
                </select>
              </div>
              {' '}
              <div className="form-group">
                <label htmlFor="cMessage">
                  Message{' '}
                  <span className="char-count" id="cCount">{`${contact.message.length} / 2000`}</span>
                </label>
                {' '}
                <textarea id="cMessage" rows="3" maxLength="2000" placeholder="How can we help you?"
                  value={contact.message} onChange={e => setContact(c => ({ ...c, message: e.target.value }))} />
              </div>
              {' '}
              {/* honeypot: real users never see or fill this */}
              <div className="hp-field" aria-hidden="true">
                <input type="text" id="cWebsite" tabIndex="-1" autoComplete="off"
                  value={contact.website} onChange={e => setContact(c => ({ ...c, website: e.target.value }))} />
              </div>
              {' '}
              {bannerEl('contactBanner', contactBanner)}
              {' '}
              <button type="submit" className="btn-signin" id="contactBtn" disabled={contactSending}>{contactSending ? 'Sending…' : 'Send Message'}</button>
            </form>
          </div>
          {' '}
          <div className="bottom-links">
            <a href="/terms">Terms of Service</a>
            {' '}
            <a href="/privacy">Privacy Policy</a>
            {' '}
            <a href="/landing#faq">Help</a>
            {' '}
            <a href="#" className="mobile-contact-link" data-contact-toggle="" onClick={e => { e.preventDefault(); toggleContact(!contactOpen); }}>Login now</a>
          </div>
        </div>
      </div>
      {loadingTo && <LoginLoading />}
    </Page>
  );
}

// "Signing you in…" overlay shown while the dashboard loads.
function LoginLoading() {
  useStyle('login-loading', LOADING_CSS);
  const [shown, setShown] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setShown(true)); }, []);
  return (
    <div className={'login-loading' + (shown ? ' show' : '')} role="status">
      <div className="ll-ring"></div><div className="ll-title">Signing you in…</div>
      <div className="ll-sub">Preparing your dashboard</div><div className="ll-bar"><i></i></div>
    </div>
  );
}
