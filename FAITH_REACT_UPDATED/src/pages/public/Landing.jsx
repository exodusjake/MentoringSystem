import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { useLenis, useNavScrolled, usePublicEffects } from './publicEffects.js';

// LANDING/HTML/landing.html
export default function Landing() {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [spy, setSpy] = useState('#home');
  usePublicEffects();
  useLenis();
  useNavScrolled(setScrolled);

  // Arriving with #faq etc. (e.g. the login page's Help link) scrolls to that section, as a page load did.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.querySelector(hash)?.scrollIntoView();
  }, []);

  // Scroll-spy: highlight the nav button for the section in view
  useEffect(() => {
    const links = ['#home', '#features', '#why', '#roles', '#how', '#faq', '#contact'];
    const sections = links.map(h => document.querySelector(h)).filter(Boolean);
    function onSpy() {
      const line = window.scrollY + 120;                       // just below the sticky nav
      let current = sections[0];
      sections.forEach(s => { if (s.offsetTop <= line) current = s; });
      // Bottom of page: the footer is short, so force the last link
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1];
      setSpy('#' + current.id);
    }
    onSpy();
    window.addEventListener('scroll', onSpy, { passive: true });
    window.addEventListener('resize', onSpy);

    // Fade-in on scroll
    const targets = document.querySelectorAll('.sec-head, .card, .panel, .why > div, .role, .step, .cta');
    targets.forEach(el => el.classList.add('reveal'));
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
      targets.forEach(el => io.observe(el));
    } else targets.forEach(el => el.classList.add('in'));
    return () => { window.removeEventListener('scroll', onSpy); window.removeEventListener('resize', onSpy); io?.disconnect(); };
  }, []);

  return (
    <Page id="LANDING/landing">
      <>
        <div className="scroll-progress" aria-hidden="true"></div>
        {/* NAV */}
        <header className={'nav' + (scrolled ? ' scrolled' : '')}>
          <div className="container nav-inner">
            <a href="#home" className="brand">
              <img src="/IMAGES/LOGO-mark.png" alt="Astra Mentoring logo" />
              {' '}
              <span>
                Astra Mentoring
                <small>MENTORING SESSION MANAGEMENT</small>
              </span>
            </a>
            {' '}
            <button className="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded={navOpen ? 'true' : 'false'} onClick={() => setNavOpen(o => !o)}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <nav className={'nav-links' + (navOpen ? ' open' : '')} id="navLinks" onClick={e => { if (e.target.tagName === 'A') setNavOpen(false); }}>
              <a href="#home" className={spy === '#home' ? 'active' : undefined}>Home</a>
              {' '}
              <a href="#features" className={spy === '#features' ? 'active' : undefined}>Features</a>
              {' '}
              <a href="#why" className={spy === '#why' ? 'active' : undefined}>Why Us</a>
              {' '}
              <a href="#roles" className={spy === '#roles' ? 'active' : undefined}>Portals</a>
              {' '}
              <a href="#how" className={spy === '#how' ? 'active' : undefined}>How It Works</a>
              {' '}
              <a href="#faq" className={spy === '#faq' ? 'active' : undefined}>FAQs</a>
              {' '}
              <a href="#contact" className={spy === '#contact' ? 'active' : undefined}>Contact</a>
              {' '}
              <Link to="/login" className="btn btn-gold">Log in</Link>
            </nav>
          </div>
        </header>
        {/* HERO */}
        <section className="hero" id="home" style={{ padding: "0" }}>
          <div className="container hero-inner">
            <div>
              <span className="eyebrow">Mentoring made simple</span>
              <h1>
                Better Mentoring.
                <br />
                <span>Brighter Future.</span>
              </h1>
              <p className="lead">
                Book sessions, record attendance with a dynamic QR code, and submit e-signed logsheets, all in one place for FAITH Colleges.
              </p>
              <div className="hero-actions">
                <Link to="/login" className="btn btn-gold">Log in to your portal</Link>
                {' '}
                <a href="#features" className="btn btn-ghost">Explore features</a>
              </div>
              <p className="hero-note">
                For
                {' '}
                <strong>Admins, Heads, Mentors and Mentees</strong>
                . Use your institutional email.
              </p>
            </div>
            <div className="hero-visual">
              <div className="logo-card">
                <img src="/IMAGES/LOGO.png" alt="Astra Mentoring" />
              </div>
              <div className="chip c1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
                </svg>
                <div>
                  <b>QR</b>
                  Attendance
                </div>
              </div>
              <div className="chip c2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <div>
                  <b>E-signed</b>
                  Logsheets
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* STRIP */}
        <div className="strip">
          <div className="container strip-inner">
            <div className="strip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div>
                <b>4 Portals</b>
                <span>Admin, Head, Mentor, Mentee</span>
              </div>
            </div>
            <div className="strip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <div>
                <b>90-second QR</b>
                <span>Single-use attendance codes</span>
              </div>
            </div>
            <div className="strip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8" />
              </svg>
              <div>
                <b>Auto logsheets</b>
                <span>Printable with signatures</span>
              </div>
            </div>
            <div className="strip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <div>
                <b>Live calendar</b>
                <span>Slots, deadlines, make-ups</span>
              </div>
            </div>
          </div>
        </div>
        {/* FEATURES */}
        <section id="features">
          <div className="container">
            <div className="sec-head">
              <div>
                <span className="eyebrow">What you can do</span>
                <h2>Everything a mentoring program needs</h2>
              </div>
              <p>
                From booking to reporting, each step is tracked so nothing gets lost between mentors, mentees and administrators.
              </p>
            </div>
            <div className="cards">
              <div className="card">
                <div className="icon-bubble ib-blue">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <h3>Session Booking</h3>
                <p>
                  Mentees book open mentor slots. Approved instantly, with group bookings supported.
                </p>
              </div>
              <div className="card">
                <div className="icon-bubble ib-green">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <path d="M14 14h3v3h-3zM20 14v3M14 20h3" />
                  </svg>
                </div>
                <h3>QR Attendance</h3>
                <p>
                  Mentees show a short-lived QR code and mentors scan it. Presence can't be faked.
                </p>
              </div>
              <div className="card">
                <div className="icon-bubble ib-gold">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6M16 13H8M16 17H8" />
                  </svg>
                </div>
                <h3>Logsheets &amp; Proof</h3>
                <p>
                  Submit per-checkpoint logsheets with photo proof and e-signatures, ready to print.
                </p>
              </div>
              <div className="card">
                <div className="icon-bubble ib-violet">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                  </svg>
                </div>
                <h3>Monitoring</h3>
                <p>Admins and Heads track progress, timeliness and completeness for every mentor.</p>
              </div>
              <div className="card">
                <div className="icon-bubble ib-red">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                </div>
                <h3>Announcements</h3>
                <p>
                  Post updates, attach files and discuss with comments, targeted to the right audience.
                </p>
              </div>
            </div>
          </div>
        </section>
        {/* WHY */}
        <section className="alt" id="why">
          <div className="container why">
            <div className="panel" aria-hidden="true">
              <h4>Today's sessions</h4>
              <div className="session">
                <div>
                  Checkpoint 1 Session
                  <small>Mon · 9:00 AM</small>
                </div>
                <span className="pill ok">Completed</span>
              </div>
              <div className="session">
                <div>
                  Make-up Session
                  <small>Wed · 1:30 PM</small>
                </div>
                <span className="pill soon">Scheduled</span>
              </div>
              <div className="session">
                <div>
                  Group Mentoring
                  <small>Fri · 10:00 AM</small>
                </div>
                <span className="pill go">Open slot</span>
              </div>
            </div>
            <div>
              <span className="eyebrow">Why use it</span>
              <h2>We don't just track sessions. We make them count.</h2>
              <p>
                Astra Mentoring replaces paper forms and chat threads with one reliable record that mentors, mentees and administrators can all trust.
              </p>
              <ul className="checks">
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m8 12 3 3 5-6" />
                  </svg>
                  Verified attendance with single-use QR codes
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m8 12 3 3 5-6" />
                  </svg>
                  Deadlines and checkpoints enforced automatically
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m8 12 3 3 5-6" />
                  </svg>
                  Make-up sessions handled without extra paperwork
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m8 12 3 3 5-6" />
                  </svg>
                  Role-based access, so everyone sees only what they should
                </li>
              </ul>
              <Link to="/login" className="btn btn-primary">Get started</Link>
            </div>
          </div>
        </section>
        {/* ROLES */}
        <section id="roles">
          <div className="container">
            <div className="sec-head">
              <div>
                <span className="eyebrow">Portals</span>
                <h2>One system, four views</h2>
              </div>
              <p>Each role gets a portal built around its own tasks.</p>
            </div>
            <div className="role-grid">
              <div className="role">
                <h3>Admin</h3>
                <p>
                  Manage users, settings, calendar windows and deadlines. Monitor every session and proof.
                </p>
              </div>
              <div className="role">
                <h3>Head</h3>
                <p>Oversee mentors in your department, review progress and print reports.</p>
              </div>
              <div className="role">
                <h3>Mentor</h3>
                <p>Open availability slots, scan attendance, write notes and submit logsheets.</p>
              </div>
              <div className="role">
                <h3>Mentee</h3>
                <p>Book sessions, show your QR code, view history and submit evaluations.</p>
              </div>
            </div>
          </div>
        </section>
        {/* HOW */}
        <section className="alt" id="how">
          <div className="container">
            <div className="sec-head">
              <div>
                <span className="eyebrow">How it works</span>
                <h2>From booking to signed logsheet</h2>
              </div>
            </div>
            <div className="steps">
              <div className="step">
                <h3>Log in</h3>
                <p>Use your institutional email and finish the one-time e-signature setup.</p>
              </div>
              <div className="step">
                <h3>Book a slot</h3>
                <p>Mentees pick an open mentor slot, and it's confirmed instantly.</p>
              </div>
              <div className="step">
                <h3>Scan to attend</h3>
                <p>The mentee shows a QR code and the mentor scans it during the session.</p>
              </div>
              <div className="step">
                <h3>Submit &amp; sign</h3>
                <p>The mentor submits the logsheet with proof, and administrators review it.</p>
              </div>
            </div>
          </div>
        </section>
        {/* FAQ */}
        <section id="faq">
          <div className="container">
            <div className="sec-head">
              <div>
                <span className="eyebrow">FAQs</span>
                <h2>Frequently asked questions</h2>
              </div>
              <p>Quick answers for mentees, mentors and administrators.</p>
            </div>
            <div className="faq-wrap">
              <details className="faq-item">
                <summary>Can I use Astra Mentoring on a phone?</summary>
                <div className="faq-body">
                  <p>
                    Yes. The system runs in any modern mobile browser and supports installation as a Progressive Web App (PWA) on supported devices. How it looks and behaves depends on your device and browser.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>Who can get an account, and how do I sign in?</summary>
                <div className="faq-body">
                  <p>
                    Accounts are created by an authorized administrator, so there is no public sign-up. Log in with the institutional email and password you were given. On your first login you will be asked to upload an e-signature before you can continue.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>I can't log in. What should I do?</summary>
                <div className="faq-body">
                  <p>
                    Check your email and password for accidental spaces. After several wrong attempts you may be asked to wait a minute before trying again. If it still fails, ask the system administrator to verify your account. Never send your password to anyone.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>Why do I see different menus from another user?</summary>
                <div className="faq-body">
                  <p>
                    There is a separate portal for each role (Admin, Head, Mentor, Mentee), and the options you see depend on your account permissions.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>How do I book a mentoring session?</summary>
                <div className="faq-body">
                  <p>
                    Open
                    {' '}
                    <strong>Schedule a Session</strong>
                    {' '}
                    in the Mentee portal, pick one of your mentor's open slots and submit. A booked slot is confirmed straight away and appears in your Sessions page. If your mentor has no open slots, check back later or contact your mentor directly.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>How does QR attendance work?</summary>
                <div className="faq-body">
                  <p>
                    The mentee generates a QR code in their portal. It is valid for 90 seconds and can only be used once. The mentor scans it during the session to record the mentee as present. Notes in a logsheet never count as attendance on their own.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>My attendance looks wrong. What do I do?</summary>
                <div className="faq-body">
                  <p>
                    Note the session, the date and the status shown, then contact your mentor or the authorized administrator so it can be corrected through the proper workflow. Please don't create duplicate records.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>Will I get an SMS or email for every announcement?</summary>
                <div className="faq-body">
                  <p>
                    No. Announcements and notifications appear inside the system. SMS is not part of the project, and any emails sent (for example session notices) depend on how your school configured email delivery. Check
                    {' '}
                    <strong>Announcements</strong>
                    {' '}
                    and
                    {' '}
                    <strong>Sessions</strong>
                    {' '}
                    at least once a week.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>Where do I find evaluations?</summary>
                <div className="faq-body">
                  <p>
                    Mentees can open evaluation links from the portal when they are available. Administrators add and manage the evaluation form links and their deadlines.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>Can I edit someone else's information?</summary>
                <div className="faq-body">
                  <p>
                    Only use the editing functions your role provides and your institution has authorized. Mentor Monitoring and Mentor Detail views for Heads are read-only.
                  </p>
                </div>
              </details>
              <details className="faq-item">
                <summary>How is my personal information handled?</summary>
                <div className="faq-body">
                  <p>
                    Records are visible only to the roles that need them. Read how we collect, use and protect your data in our
                    {' '}
                    <Link to="/privacy" style={{ color: "var(--blue)", fontWeight: "600" }}>Privacy Policy</Link>
                    {' '}
                    and the rules for using the system in our
                    {' '}
                    <Link to="/terms" style={{ color: "var(--blue)", fontWeight: "600" }}>Terms of Service</Link>
                    .
                  </p>
                </div>
              </details>
            </div>
            <p className="faq-more">
              Still have a question? Contact the system administrator at
              {' '}
              <a href="mailto:astramentoring.iot@gmail.com">astramentoring.iot@gmail.com</a>
              .
            </p>
          </div>
        </section>
        {/* CTA */}
        <div className="container cta-wrap" style={{ paddingTop: "80px" }}>
          <div className="cta">
            <div>
              <h2>Ready to start your mentoring sessions?</h2>
              <p>Log in with your institutional account to open your portal.</p>
            </div>
            <Link to="/login" className="btn btn-gold">Log in now</Link>
          </div>
        </div>
        {/* FOOTER */}
        <footer id="contact">
          <div className="container foot-grid">
            <div className="foot-brand">
              <img src="/IMAGES/LOGO-mark.png" alt="Astra Mentoring logo" />
              <p>Mentoring session management for FAITH Colleges.</p>
            </div>
            <div>
              <h4>Quick links</h4>
              <ul>
                <li>
                  <a href="#features">Features</a>
                </li>
                <li>
                  <a href="#why">Why Us</a>
                </li>
                <li>
                  <a href="#roles">Portals</a>
                </li>
                <li>
                  <a href="#how">How It Works</a>
                </li>
                <li>
                  <a href="#faq">FAQs</a>
                </li>
              </ul>
            </div>
            <div>
              <h4>Access &amp; Legal</h4>
              <ul>
                <li>
                  <Link to="/login">Log in</Link>
                </li>
                <li>
                  <Link to="/privacy">Privacy Policy</Link>
                </li>
                <li>
                  <Link to="/terms">Terms of Service</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Contact</h4>
              <ul>
                <li>astramentoring.iot@gmail.com</li>
                <li>FAITH Colleges</li>
              </ul>
            </div>
          </div>
          <div className="container foot-bottom">
            <span>
              ©
              {' '}
              <span id="yr">{new Date().getFullYear()}</span>
              {' '}
              Astra Mentoring. All rights reserved.
            </span>
            {' '}
            <span className="legal-links">
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </span>
          </div>
        </footer>
      </>
    </Page>
  );
}
