import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import PasswordMeter from '../../components/PasswordMeter.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { useStyle } from '../../lib/injectStyle.js';
import { prefetchRoute } from '../../lib/prefetch.js';
import { validate as validatePassword } from '../../lib/passwordPolicy.js';
import { getSession, isLoggedIn, saveSession } from '../../lib/session.js';
import FadeLink from '../../components/FadeLink.jsx';
import OtpBoxes from './OtpBoxes.jsx';
import { usePublicEffects } from './publicEffects.js';

// Post-login loading screen (login.js goWithLoading): shown after a successful sign-in while the dashboard
// is being fetched, so the page doesn't just freeze on the form.
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

const SETUP_ROUTES = { mentor: '/mentor/setup', mentee: '/mentee/setup', admin: '/admin/setup', head: '/head/setup' };
const HOME_ROUTES = { head: '/head/dashboard', admin: '/admin/dashboard', mentor: '/mentor/dashboard', mentee: '/mentee/dashboard' };

const OTP_LIFETIME_SECONDS = 600;   // matches the server's 10-minute code lifetime
const fmtClock = left => Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');

const MAIL_ICON = (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
);
const LOCK_ICON = (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const EYE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const CHECK_LI = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);
const EMAIL_OTP_ICON = (
  <svg viewBox="0 0 64 64" fill="none">
    <rect x="10" y="18" width="44" height="30" rx="4" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"/>
    <path d="m12 21 20 16 20-16" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="49" cy="17" r="8" fill="#f0b429"/>
    <path d="m45.5 17 2.5 2.5 4.5-5" stroke="#0b1a5c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// LOGIN/HTML/login.html + LOGIN/JS/login.js + contact.js + fit-screen.js
export default function Login() {
  useStyle('loginLoadingCss', LOADING_CSS);
  useEffect(() => { prefetchRoute('landing', ['/LANDING/CSS/landing.css', '/LANDING/CSS/motion.css']); }, []);
  const navigate = useNavigate();
  usePublicEffects();

  // ── Auto-redirect if already logged in ──
  useEffect(() => {
    if (typeof isLoggedIn === 'function' && isLoggedIn()) {
      const session = getSession();
      const role = (session.role || '').toLowerCase();
      // Still owes the first-login signature? Send them back to setup, not the dashboard.
      if (session.user?.setupRequired === true && SETUP_ROUTES[role]) navigate(SETUP_ROUTES[role], { replace: true });
      else if (HOME_ROUTES[role]) navigate(HOME_ROUTES[role], { replace: true });
    }
  }, []);

  // Which step of the card is showing: 'login' | 'code' | 'forgot'
  const [step, setStep] = useState('login');
  const [loadingTo, setLoadingTo] = useState(null);
  const [loadingShow, setLoadingShow] = useState(false);

  // ── Log in ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [banner, setBanner] = useState({ text: '', ok: false });          // #errorBanner
  const [codeBanner, setCodeBanner] = useState({ text: '', ok: false });  // #codeErrorBanner
  const [signingIn, setSigningIn] = useState(false);
  const challengeRef = useRef(null);       // loginChallengeId
  const rememberRef = useRef(false);       // loginRemember
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  function goWithLoading(url) {
    setLoadingTo(url);
    requestAnimationFrame(() => setLoadingShow(true));
    setTimeout(() => navigate(url), 1100);
  }

  function finishLogin(data, rem) {
    saveSession(data.token, data.role, data.user || {}, rem);

    const role = (data.role || '').toLowerCase();

    if (data.user?.setupRequired === true && SETUP_ROUTES[role]) {
      goWithLoading(SETUP_ROUTES[role]);
      return;
    }
    goWithLoading(HOME_ROUTES[role] || '/login');
  }

  function showError(msg) {
    const next = { text: msg, ok: false };
    if (challengeRef.current) setCodeBanner(next); else setBanner(next);
  }
  function clearError() {
    setBanner({ text: '', ok: false });
    setCodeBanner({ text: '', ok: false });
  }

  async function handleSignIn() {
    const mail = email.trim();
    clearError();

    if (!mail || !password) {
      showError('Please fill in both email and password.');
      return;
    }

    setSigningIn(true);

    try {
      // `remember` controls the issued token's expiry.
      const data = await apiRequest('Auth/login', 'POST', { Email: mail, Password: password, RememberMe: remember });

      if (data.requiresCode) {
        challengeRef.current = data.challengeId;
        rememberRef.current = remember;
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

  // ── Verification code step ──
  const otpRef = useRef(null);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpLeft, setOtpLeft] = useState(OTP_LIFETIME_SECONDS);
  const [otpExpired, setOtpExpired] = useState(false);
  const otpTimerRef = useRef(null);
  const [verifying, setVerifying] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);
  const resendTimerRef = useRef(null);
  const [resendStarted, setResendStarted] = useState(false);

  function startOtpTimer() {
    clearInterval(otpTimerRef.current);
    let left = OTP_LIFETIME_SECONDS;
    setOtpExpired(false);
    const tick = () => {
      if (left <= 0) {
        clearInterval(otpTimerRef.current);
        setOtpExpired(true);
        return;
      }
      setOtpLeft(left);
      left--;
    };
    tick();
    otpTimerRef.current = setInterval(tick, 1000);
  }

  function startResendCooldown(seconds) {
    clearInterval(resendTimerRef.current);
    let left = seconds;
    setResendStarted(true);
    const tick = () => {
      if (left <= 0) {
        clearInterval(resendTimerRef.current);
        setResendLeft(0);
        return;
      }
      setResendLeft(left);
      left--;
    };
    tick();
    resendTimerRef.current = setInterval(tick, 1000);
  }

  function showCodeStep(maskedEmail) {
    clearError();
    setStep('code');
    setOtpEmail(maskedEmail || 'your email');
    // the boxes exist after this render
    setTimeout(() => otpRef.current?.clear(), 0);
    startOtpTimer();
    startResendCooldown(30);
  }

  function backToLogin() {
    challengeRef.current = null;
    clearInterval(otpTimerRef.current);
    clearError();
    setStep('login');
    setVerifying(false);
    setPassword('');
    setTimeout(() => passwordRef.current?.focus(), 0);
  }

  async function handleVerifyCode(codeArg) {
    const code = codeArg ?? otpRef.current?.value() ?? '';
    clearError();

    if (!/^\d{6}$/.test(code)) {
      showError('Please enter the 6-digit code from your email.');
      return;
    }

    setVerifying(true);

    try {
      const data = await apiRequest('Auth/verify-login-code', 'POST', { ChallengeId: challengeRef.current, Code: code });
      finishLogin(data, rememberRef.current);
    } catch (err) {
      showError(err.message || 'Could not verify the code.');
      setVerifying(false);
      otpRef.current?.shake();
      // Code expired or attempts used up: the challenge is gone, start over.
      if (err.restart) setTimeout(backToLogin, 2500);
      else otpRef.current?.clear();
    }
  }

  async function handleResendCode() {
    clearError();
    try {
      await apiRequest('Auth/resend-login-code', 'POST', { ChallengeId: challengeRef.current, Code: '' });
      startResendCooldown(30);
      startOtpTimer();
      otpRef.current?.clear();
    } catch (err) {
      showError(err.message || 'Could not resend the code.');
      if (err.restart) setTimeout(backToLogin, 2500);
    }
  }

  // ── Forgot password (inline in the login card) ──
  // Three steps in the same card: 1) email  2) the emailed code only  3) new password (after the code is verified).
  const [fpPane, setFpPane] = useState('email');
  const [fpEmail, setFpEmail] = useState('');
  const [fpEmailShown, setFpEmailShown] = useState('');
  const [fpMsgs, setFpMsgs] = useState({ 1: null, 2: null, 3: null });   // { text, ok }
  const [fpSending, setFpSending] = useState(false);
  const [fpVerifying, setFpVerifying] = useState(false);
  const [fpResetting, setFpResetting] = useState(false);
  const [fpNewPw, setFpNewPw] = useState('');
  const [fpNewPw2, setFpNewPw2] = useState('');
  const [fpShowPw1, setFpShowPw1] = useState(false);
  const [fpShowPw2, setFpShowPw2] = useState(false);
  const [fpResendLeft, setFpResendLeft] = useState(0);
  const [fpCodeLeft, setFpCodeLeft] = useState(OTP_LIFETIME_SECONDS);
  const [fpCodeExpired, setFpCodeExpired] = useState(false);
  const fpResendTimer = useRef(null);
  const fpCodeTimer = useRef(null);
  const fpToken = useRef(null);
  const fpBoxesRef = useRef(null);
  const fpEmailRef = useRef(null);
  const fpNewPwRef = useRef(null);

  const fpMsg = (n, text, ok) => setFpMsgs(m => ({ ...m, [n]: text ? { text, ok: !!ok } : null }));
  const fpClearMsgs = () => setFpMsgs({ 1: null, 2: null, 3: null });

  function fpGoPane(name) {
    setFpPane(name);
    fpClearMsgs();
  }

  function showForgotStep() {
    clearError();
    setStep('forgot');
    forgotShowEmail();
    const typed = email.trim();
    if (typed) setFpEmail(typed);
    setTimeout(() => fpEmailRef.current?.focus(), 60);
  }

  function forgotShowEmail() {
    clearInterval(fpResendTimer.current); clearInterval(fpCodeTimer.current);
    fpToken.current = null;
    fpGoPane('email');
    setTimeout(() => fpEmailRef.current?.focus(), 40);
  }

  function forgotBackToLogin() {
    clearInterval(fpResendTimer.current); clearInterval(fpCodeTimer.current);
    fpToken.current = null;
    setStep('login');
    fpClearMsgs();
    setFpNewPw(''); setFpNewPw2(''); setFpShowPw1(false); setFpShowPw2(false);
    fpBoxesRef.current?.clear();
    const typed = fpEmail.trim();
    if (typed) setEmail(typed);
    setTimeout(() => passwordRef.current?.focus(), 0);
  }

  function fpStartTimers() {
    clearInterval(fpResendTimer.current); clearInterval(fpCodeTimer.current);
    let left = 60;
    const tick = () => {
      if (left <= 0) { clearInterval(fpResendTimer.current); setFpResendLeft(0); return; }
      setFpResendLeft(left);
      left--;
    };
    tick();
    fpResendTimer.current = setInterval(tick, 1000);

    let life = 600;
    setFpCodeExpired(false);
    const tock = () => {
      if (life <= 0) { clearInterval(fpCodeTimer.current); setFpCodeExpired(true); return; }
      setFpCodeLeft(life);
      life--;
    };
    tock();
    fpCodeTimer.current = setInterval(tock, 1000);
  }

  // Step 1 -> 2 (also used by "Resend")
  async function handleForgotSend(isResend) {
    const mail = fpEmail.trim();
    const bannerN = isResend ? 2 : 1;
    fpClearMsgs();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { fpMsg(bannerN, 'Please enter a valid email address.'); return; }

    setFpSending(true);
    try {
      const res = await fetch(CONFIG.getUrl('Auth/forgot-password'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { fpMsg(bannerN, data.message || 'Something went wrong. Please try again.'); return; }
      setFpEmailShown(mail);
      fpGoPane('code');
      fpStartTimers();
      setTimeout(() => fpBoxesRef.current?.clear(), 0);
      if (isResend) fpMsg(2, 'A new code has been requested.', true);
    } catch (err) {
      fpMsg(bannerN, 'Could not reach the server. Please check your connection.');
    } finally {
      setFpSending(false);
    }
  }

  // Step 2 -> 3: check the code on its own; only then does the new-password step appear.
  async function handleVerifyResetCode(codeArg) {
    const mail = fpEmail.trim();
    const code = codeArg ?? fpBoxesRef.current?.value() ?? '';
    fpMsg(2, '');
    if (!/^\d{6}$/.test(code)) { fpMsg(2, 'Enter the 6-digit code from your email.'); return; }
    if (fpVerifying) return;

    setFpVerifying(true);
    try {
      const res = await fetch(CONFIG.getUrl('Auth/verify-reset-code'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fpMsg(2, data.message || 'Something went wrong. Please try again.');
        fpBoxesRef.current?.shake();
        if (data.restart) setTimeout(forgotShowEmail, 2200); else fpBoxesRef.current?.clear();
        return;
      }
      fpToken.current = data.token;
      clearInterval(fpResendTimer.current); clearInterval(fpCodeTimer.current);
      fpGoPane('new');
      setTimeout(() => fpNewPwRef.current?.focus(), 60);
    } catch (err) {
      fpMsg(2, 'Could not reach the server. Please check your connection.');
    } finally {
      setFpVerifying(false);
    }
  }

  // Step 3: set the new password.
  async function handleResetPassword() {
    const mail = fpEmail.trim();
    fpMsg(3, '');

    const policy = validatePassword(fpNewPw);
    if (policy) { fpMsg(3, policy); return; }
    if (fpNewPw !== fpNewPw2) { fpMsg(3, 'The passwords do not match.'); return; }

    setFpResetting(true);
    try {
      const res = await fetch(CONFIG.getUrl('Auth/reset-password'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, token: fpToken.current, newPassword: fpNewPw })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        fpMsg(3, data.message || 'Something went wrong. Please try again.');
        if (data.restart) setTimeout(forgotShowEmail, 2200);
        return;
      }

      forgotBackToLogin();
      setEmail(mail);
      setPassword('');
      setBanner({ text: 'Password reset! Log in with your new password.', ok: true });
      setTimeout(() => passwordRef.current?.focus(), 0);
    } catch (err) {
      fpMsg(3, 'Could not reach the server. Please check your connection.');
    } finally {
      setFpResetting(false);
    }
  }

  // ── Keyboard shortcut ──
  const keyHandlers = useRef(null);
  keyHandlers.current = { handleSignIn, handleVerifyCode, handleForgotSend, handleVerifyResetCode, handleResetPassword, forgotBackToLogin, step };
  useEffect(() => {
    const onKey = e => {
      const h = keyHandlers.current;
      if (e.key === 'Enter') {
        if (e.target.closest && e.target.closest('.contact-side')) return;
        if (e.target.closest && e.target.closest('#forgotStep')) {
          if (e.target.id === 'fpEmail') h.handleForgotSend();
          else if (e.target.closest('#fpCodePane')) h.handleVerifyResetCode();
          else if (e.target.tagName === 'INPUT' && e.target.closest('#fpNewPane')) h.handleResetPassword();
          return;
        }
        if (challengeRef.current) h.handleVerifyCode(); else h.handleSignIn();
      }
      if (e.key === 'Escape' && h.step === 'forgot') h.forgotBackToLogin();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Start with the email field ready (desktop only, so phones don't pop the keyboard)
  useEffect(() => {
    if (window.matchMedia('(hover: hover)').matches) emailRef.current?.focus();
  }, []);

  // Caps Lock hint (password field)
  const checkCaps = e => setCaps(!!(e.getModifierState && e.getModifierState('CapsLock')));

  // ── Contact panel (contact.js) ──
  const [contactOpen, setContactOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cTopic, setCTopic] = useState('General inquiry');
  const [cMessage, setCMessage] = useState('');
  const [cWebsite, setCWebsite] = useState('');
  const [cBanner, setCBanner] = useState(null);   // { text, ok }
  const [cSending, setCSending] = useState(false);
  const cNameRef = useRef(null);

  const toggleContact = () => setContactOpen(o => !o);
  useEffect(() => {
    if (contactOpen) { const id = setTimeout(() => cNameRef.current?.focus({ preventScroll: true }), 450); return () => clearTimeout(id); }
  }, [contactOpen]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && contactOpen) setContactOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contactOpen]);

  async function onContactSubmit(e) {
    e.preventDefault();
    setCBanner(null);

    const name = cName.trim();
    const mail = cEmail.trim();
    const topic = cTopic;
    const message = cMessage.trim();
    const show = (text, ok) => setCBanner({ text, ok: !!ok });

    if (name.length < 2) return show('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return show('Please enter a valid email address.');
    if (message.length < 10) return show('Please write a little more (at least 10 characters).');

    setCSending(true);
    try {
      const res = await fetch(CONFIG.getUrl('Contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: mail, topic, message, website: cWebsite })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return show(data.message || 'Something went wrong. Please try again.');
      show(data.message || 'Your message has been sent.', true);
      setCName(''); setCEmail(''); setCTopic('General inquiry'); setCMessage(''); setCWebsite('');
    } catch (err) {
      show('Could not reach the server. Please check your connection and try again.');
    } finally {
      setCSending(false);
    }
  }

  // ── Keeps the login screen fixed (fit-screen.js): scale the logo + form + footer down just enough to fit ──
  const wrapperRef = useRef(null);
  const fit = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const sides = Array.from(wrapper.querySelectorAll('.right-side')).map(side => ({
      side,
      parts: ['.right-logo', '.login-card', '.bottom-links'].map(s => side.querySelector(s)).filter(Boolean)
    })).filter(s => s.parts.length >= 2);
    sides.forEach(({ side, parts }) => {
      parts.forEach(p => p.style.zoom = 1);
      const cs = getComputedStyle(side);
      const avail = side.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need = parts.reduce((h, p) => {
        const m = getComputedStyle(p);
        return h + p.offsetHeight + (parseFloat(m.marginTop) || 0) * (m.marginTop.endsWith('px') ? 1 : 0) + (parseFloat(m.marginBottom) || 0) * (m.marginBottom.endsWith('px') ? 1 : 0);
      }, 0);
      const z = need > avail ? Math.max(0.45, avail / need) : 1;
      parts.forEach(p => p.style.zoom = z);
    });
  }, []);
  useEffect(() => {
    const sides = Array.from(wrapperRef.current.querySelectorAll('.right-side'));
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    let ro = null;
    if ('ResizeObserver' in window) { ro = new ResizeObserver(fit); sides.forEach(s => ro.observe(s)); }
    fit();
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('load', fit); ro?.disconnect(); };
  }, []);
  // refitLogin(): the forgot-password flow resizes the card, so fit again after it changes.
  useEffect(() => {
    requestAnimationFrame(fit);
    const id = setTimeout(fit, 80);
    return () => clearTimeout(id);
  }, [step, fpPane, fpMsgs]);

  useEffect(() => () => {
    clearInterval(otpTimerRef.current); clearInterval(resendTimerRef.current);
    clearInterval(fpResendTimer.current); clearInterval(fpCodeTimer.current);
  }, []);

  const showMain = step === 'login';
  const fpBanner = n => fpMsgs[n]
    ? <div className={`error-banner${fpMsgs[n].ok ? ' success' : ''}`} id={`fpBanner${n}`} style={{ display: 'block' }}>{fpMsgs[n].text}</div>
    : <div className="error-banner" id={`fpBanner${n}`} style={{ display: 'none' }}></div>;

  return (
    <Page id="LOGIN/login">
      <>
        <div className={`wrapper${contactOpen ? ' show-contact' : ''}`} ref={wrapperRef}>

          {/* Left panel */}
          <div className="left-side">
            <img src="/IMAGES/LOGO.png" alt="Astra Mentoring" className="left-logo-img" />
            <div className="left-divider"></div>
            <h2 className="left-school">FAITH Colleges</h2>
            <p className="left-tagline">
              Welcome to the <strong>HOME</strong> of the <strong>BRAVEHEARTS</strong>
            </p>

            <ul className="left-points">
              <li>{CHECK_LI}Book and track mentoring sessions</li>
              <li>{CHECK_LI}Secure QR-code attendance</li>
              <li>{CHECK_LI}E-signed logsheets and reports</li>
            </ul>

            <button type="button" className="slide-btn" id="slideBtn" aria-controls="contactPanel" aria-expanded={contactOpen ? 'true' : 'false'} onClick={toggleContact}>
              <span className="slide-btn-label" id="slideBtnLabel">Login now</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
            </button>

            {/* decorative shapes */}
            <span className="shape s1" aria-hidden="true"></span>
            <span className="shape s2" aria-hidden="true"></span>
            <span className="shape s3" aria-hidden="true"></span>
            <span className="shape s4" aria-hidden="true"></span>
          </div>

          {/* Right panel */}
          <div className="right-side" inert={contactOpen}>

            <FadeLink to="/landing" className="back-home" title="Home" aria-label="Home">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>
            </FadeLink>

            <div className="login-card">

              {showMain && <h1 className="card-title">Welcome Back</h1>}
              {showMain && <p className="card-subtitle">Log in with your institutional email address</p>}
              {showMain && (
                <div id="loginStep">

                  {/* Email */}
                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <div className="input-wrap">
                      {MAIL_ICON}
                      <input type="email" id="email" placeholder="yourname@faith.edu.ph" autoComplete="email" ref={emailRef}
                        value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                  </div>

                  {/* Password with show/hide toggle */}
                  <div className="form-group">
                    <label htmlFor="password">Password <span className="caps-hint" id="capsHint" style={{ display: caps ? '' : 'none' }}>Caps Lock is on</span></label>
                    <div className="pw-wrap input-wrap">
                      {LOCK_ICON}
                      <input type={showPw ? 'text' : 'password'} id="password" placeholder="••••••••••" autoComplete="current-password" ref={passwordRef}
                        value={password} onChange={e => setPassword(e.target.value)}
                        onKeyDown={checkCaps} onKeyUp={checkCaps} onBlur={() => setCaps(false)} />
                      <button type="button" className="pw-toggle" onClick={() => setShowPw(s => !s)} tabIndex={-1} aria-label="Toggle password visibility">
                        {/* Eye open */}
                        <svg id="eyeShow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: showPw ? 'none' : '' }}>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {/* Eye closed */}
                        <svg id="eyeHide" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: showPw ? '' : 'none' }}>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Options row */}
                  <div className="form-options">
                    <label className="remember-me">
                      <input type="checkbox" id="remember" checked={remember} onChange={e => setRemember(e.target.checked)} />
                      Remember me
                    </label>
                    <button type="button" className="forgot-link" onClick={showForgotStep}>Forgot Password?</button>
                  </div>

                  {/* Error banner (hidden by default) */}
                  <div className={`error-banner${banner.ok ? ' success' : ''}`} id="errorBanner" style={{ display: banner.text ? 'block' : 'none' }}>{banner.text}</div>

                  {/* Log in button */}
                  <button className="btn-signin" id="signinBtn" onClick={handleSignIn} disabled={signingIn}>
                    {signingIn ? 'Logging in…' : 'Log in'}
                  </button>
                </div>
              )}

              {/* Step 2: one-time email verification (first login only) */}
              {step === 'code' && (
                <div id="codeStep" className="otp-step">
                  <div className="otp-icon" aria-hidden="true">{EMAIL_OTP_ICON}</div>
                  <h1 className="card-title">Verify Your Email</h1>
                  <p className="otp-sub">A 6-digit code has been sent to<br /><strong id="otpEmail">{otpEmail}</strong>
                    <button type="button" className="forgot-link" onClick={backToLogin}>Change</button></p>

                  <OtpBoxes id="otpBoxes" ref={otpRef} onComplete={handleVerifyCode} />

                  <div className="error-banner" id="codeErrorBanner" style={{ display: codeBanner.text ? 'block' : 'none' }}>{codeBanner.text}</div>

                  <ul className="otp-notes">
                    <li>This code expires in <strong id="otpTimer">{otpExpired ? 'expired' : fmtClock(otpLeft)}</strong></li>
                    <li>Didn't receive the code? <button type="button" className="forgot-link" id="resendBtn" disabled={resendLeft > 0} onClick={handleResendCode}>{resendLeft > 0 ? 'Resend (' + resendLeft + 's)' : 'Resend'}</button></li>
                    <li>Check your spam folder if you can't find it.</li>
                  </ul>

                  <button className="btn-signin" id="verifyBtn" onClick={() => handleVerifyCode()} disabled={verifying}>{verifying ? 'Verifying…' : 'Verify'}</button>
                  <p className="otp-once">You only need to do this once. After your email is verified, you can log in with your password alone.</p>
                </div>
              )}

              {/* Forgot password (in the same card, like the email verification step) */}
              {step === 'forgot' && (
                <div id="forgotStep" className="otp-step">

                  {/* Step 1: ask for the email */}
                  <div id="fpEmailPane" style={{ display: fpPane === 'email' ? '' : 'none' }}>
                    <div className="otp-icon" aria-hidden="true">
                      <svg viewBox="0 0 64 64" fill="none">
                        <rect x="14" y="28" width="36" height="26" rx="5" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"/>
                        <path d="M22 28v-7a10 10 0 0 1 20 0v7" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round"/>
                        <circle cx="32" cy="41" r="4" fill="#f0b429"/>
                        <path d="M32 44v5" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <h1 className="card-title">Forgot Password?</h1>
                    <p className="otp-sub">Enter your email address and we’ll send you a code to reset your password.</p>
                    <div className="form-group">
                      <label htmlFor="fpEmail">Email Address</label>
                      <div className="input-wrap">
                        {MAIL_ICON}
                        <input type="email" id="fpEmail" placeholder="yourname@faith.edu.ph" autoComplete="email" ref={fpEmailRef}
                          value={fpEmail} onChange={e => setFpEmail(e.target.value)} />
                      </div>
                    </div>
                    {fpBanner(1)}
                    <button className="btn-signin" id="fpSendBtn" onClick={() => handleForgotSend()} disabled={fpSending}>{fpSending ? 'Sending…' : 'Send Code'}</button>
                    <p className="otp-once"><button type="button" className="forgot-link" onClick={forgotBackToLogin}>← Back to log in</button></p>
                  </div>

                  {/* Step 2: the emailed code only */}
                  <div id="fpCodePane" style={{ display: fpPane === 'code' ? '' : 'none' }}>
                    <div className="otp-icon" aria-hidden="true">{EMAIL_OTP_ICON}</div>
                    <h1 className="card-title">Enter Verification Code</h1>
                    <p className="otp-sub">If <strong id="fpEmailShown">{fpEmailShown}</strong> is registered, a 6-digit code is on its way.
                      <button type="button" className="forgot-link" onClick={forgotShowEmail}>Change</button></p>

                    <OtpBoxes id="fpBoxes" ref={fpBoxesRef} onComplete={handleVerifyResetCode} />

                    {fpBanner(2)}

                    <ul className="otp-notes">
                      <li>This code expires in <strong id="fpTimer">{fpCodeExpired ? 'expired' : fmtClock(fpCodeLeft)}</strong></li>
                      <li>Didn’t receive the code? <button type="button" className="forgot-link" id="fpResend" disabled={fpResendLeft > 0} onClick={() => handleForgotSend(true)}>{fpResendLeft > 0 ? 'Resend (' + fpResendLeft + 's)' : 'Resend'}</button></li>
                      <li>Check your spam folder if you can’t find it.</li>
                    </ul>

                    <button className="btn-signin" id="fpVerifyBtn" onClick={() => handleVerifyResetCode()} disabled={fpVerifying}>{fpVerifying ? 'Verifying…' : 'Verify'}</button>
                    <p className="otp-once"><button type="button" className="forgot-link" onClick={forgotBackToLogin}>← Back to log in</button></p>
                  </div>

                  {/* Step 3: new password (only after the code is verified) */}
                  <div id="fpNewPane" style={{ display: fpPane === 'new' ? '' : 'none' }}>
                    <div className="otp-icon" aria-hidden="true">
                      <svg viewBox="0 0 64 64" fill="none">
                        <rect x="14" y="28" width="36" height="26" rx="5" fill="#fff" stroke="#0b1a5c" strokeWidth="2.5"/>
                        <path d="M22 28v-7a10 10 0 0 1 20 0v7" stroke="#0b1a5c" strokeWidth="2.5" strokeLinecap="round"/>
                        <circle cx="46" cy="18" r="8" fill="#f0b429"/>
                        <path d="m42.5 18 2.5 2.5 4.5-5" stroke="#0b1a5c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h1 className="card-title">Create New Password</h1>
                    <p className="otp-sub">Code verified. Choose a new password for your account.</p>

                    <div className="form-group fp-pw">
                      <label htmlFor="fpNewPw">New Password</label>
                      <div className="pw-wrap input-wrap">
                        {LOCK_ICON}
                        <input type={fpShowPw1 ? 'text' : 'password'} id="fpNewPw" placeholder="Create a strong password" autoComplete="new-password" ref={fpNewPwRef}
                          value={fpNewPw} onChange={e => setFpNewPw(e.target.value)} />
                        <button type="button" className="pw-toggle" style={fpShowPw1 ? { opacity: '1' } : undefined} onClick={() => setFpShowPw1(s => !s)} tabIndex={-1} aria-label="Show or hide password">{EYE}</button>
                      </div>
                      <PasswordMeter value={fpNewPw} />
                    </div>
                    <div className="form-group fp-pw">
                      <label htmlFor="fpNewPw2">Repeat New Password</label>
                      <div className="pw-wrap input-wrap">
                        {LOCK_ICON}
                        <input type={fpShowPw2 ? 'text' : 'password'} id="fpNewPw2" placeholder="Repeat the password" autoComplete="new-password"
                          value={fpNewPw2} onChange={e => setFpNewPw2(e.target.value)} />
                        <button type="button" className="pw-toggle" style={fpShowPw2 ? { opacity: '1' } : undefined} onClick={() => setFpShowPw2(s => !s)} tabIndex={-1} aria-label="Show or hide password">{EYE}</button>
                      </div>
                    </div>

                    {fpBanner(3)}
                    <button className="btn-signin" id="fpResetBtn" onClick={handleResetPassword} disabled={fpResetting}>{fpResetting ? 'Resetting…' : 'Reset Password'}</button>
                    <p className="otp-once"><button type="button" className="forgot-link" onClick={forgotBackToLogin}>← Back to log in</button></p>
                  </div>
                </div>
              )}

              {showMain && (
                <p className="contact-text" id="contactText">
                  Cannot log in? <button type="button" className="forgot-link" data-contact-toggle onClick={toggleContact}>Contact us</button>
                </p>
              )}

            </div>

            <div className="bottom-links">
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/landing#faq">Help</Link>
            </div>

          </div>

          {/* Contact panel (revealed when the blue panel slides right) */}
          <div className="right-side contact-side" id="contactPanel" aria-hidden={contactOpen ? 'false' : 'true'} inert={!contactOpen}>

            <div className="login-card contact-card">
              <h1 className="card-title">Contact Us</h1>
              <p className="card-subtitle">Questions, concerns or feedback? Send the Guidance Office a message.</p>

              <form id="contactForm" noValidate onSubmit={onContactSubmit}>
                <div className="contact-row">
                  <div className="form-group">
                    <label htmlFor="cName">Full Name</label>
                    <input type="text" id="cName" maxLength={100} autoComplete="name" placeholder="Juan Dela Cruz" ref={cNameRef}
                      value={cName} onChange={e => setCName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cEmail">Email Address</label>
                    <input type="email" id="cEmail" maxLength={150} autoComplete="email" placeholder="you@email.com"
                      value={cEmail} onChange={e => setCEmail(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="cTopic">Topic</label>
                  <select id="cTopic" value={cTopic} onChange={e => setCTopic(e.target.value)}>
                    <option>General inquiry</option>
                    <option>Account or login help</option>
                    <option>Report a problem</option>
                    <option>Feedback or suggestion</option>
                    <option>Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="cMessage">Message <span className="char-count" id="cCount">{cMessage.length} / 2000</span></label>
                  <textarea id="cMessage" rows={3} maxLength={2000} placeholder="How can we help you?"
                    value={cMessage} onChange={e => setCMessage(e.target.value)}></textarea>
                </div>

                {/* honeypot: real users never see or fill this */}
                <div className="hp-field" aria-hidden="true"><input type="text" id="cWebsite" tabIndex={-1} autoComplete="off" value={cWebsite} onChange={e => setCWebsite(e.target.value)} /></div>

                <div className={`error-banner${cBanner?.ok ? ' success' : ''}`} id="contactBanner" style={{ display: cBanner ? 'block' : 'none' }}>{cBanner?.text}</div>

                <button type="submit" className="btn-signin" id="contactBtn" disabled={cSending}>{cSending ? 'Sending…' : 'Send Message'}</button>
              </form>
            </div>

            <div className="bottom-links">
              <Link to="/terms">Terms of Service</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/landing#faq">Help</Link>
              <a href="#" className="mobile-contact-link" data-contact-toggle onClick={e => { e.preventDefault(); toggleContact(); }}>Login now</a>
            </div>
          </div>

        </div>

        {loadingTo && (
          <div className={`login-loading${loadingShow ? ' show' : ''}`} role="status">
            <div className="ll-ring"></div><div className="ll-title">Signing you in…</div>
            <div className="ll-sub">Preparing your dashboard</div><div className="ll-bar"><i></i></div>
          </div>
        )}
      </>
    </Page>
  );
}
