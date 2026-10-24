import { useRef, useState } from 'react';
import Page from '../../app/Page.jsx';
import { useLenis, useNavScrolled, useRipple, useScrollProgress } from './publicEffects.js';

// Terms page (LANDING/HTML/terms.html + its inline script, effects.js and smooth-scroll.js).
export default function Terms() {
  const progressRef = useScrollProgress();
  const navRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useRipple();
  useLenis();
  useNavScrolled(navRef);

  return (
    <Page id="LANDING/terms">
      <div className="scroll-progress" aria-hidden="true" ref={progressRef}></div>
      <header className="nav" ref={navRef}>
        <div className="container nav-inner">
          <a href="/landing" className="brand">
            <img src="/IMAGES/LOGO-mark.png" alt="Astra Mentoring logo" />
            {' '}
            <span>
              Astra Mentoring
              <small>MENTORING SESSION MANAGEMENT</small>
            </span>
          </a>
          {' '}
          <button className="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded={menuOpen ? 'true' : 'false'} onClick={() => setMenuOpen(o => !o)}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"></path>
            </svg>
          </button>
          {' '}
          <nav className={'nav-links' + (menuOpen ? ' open' : '')} id="navLinks">
            <a href="/landing#home">Home</a>
            {' '}
            <a href="/landing#features">Features</a>
            {' '}
            <a href="/landing#faq">FAQs</a>
            {' '}
            <a href="/privacy">Privacy</a>
            {' '}
            <a href="/terms" className="active">Terms</a>
            {' '}
            <a href="/login" className="btn btn-gold">Log in</a>
          </nav>
        </div>
      </header>
      <div className="legal-hero">
        <div className="container">
          <span className="eyebrow">Legal</span>
          {' '}
          <h1>Terms of Service</h1>
          {' '}
          <p>Last updated: October 18, 2026</p>
        </div>
      </div>
      <main className="container legal-layout">
        <aside className="toc" aria-label="On this page">
          <h4>On this page</h4>
          {' '}
          <ol>
            <li>
              <a href="#accept">Acceptance</a>
            </li>
            <li>
              <a href="#accounts">Accounts</a>
            </li>
            <li>
              <a href="#use">Acceptable use</a>
            </li>
            <li>
              <a href="#records">Mentoring records</a>
            </li>
            <li>
              <a href="#content">Your content</a>
            </li>
            <li>
              <a href="#privacy">Privacy</a>
            </li>
            <li>
              <a href="#availability">Availability</a>
            </li>
            <li>
              <a href="#ip">Ownership</a>
            </li>
            <li>
              <a href="#disclaimer">Disclaimers</a>
            </li>
            <li>
              <a href="#suspend">Suspension</a>
            </li>
            <li>
              <a href="#changes">Changes</a>
            </li>
            <li>
              <a href="#law">Governing law</a>
            </li>
            <li>
              <a href="#contact">Contact</a>
            </li>
          </ol>
        </aside>
        {' '}
        <article className="legal">
          <h2 id="accept">Acceptance of these terms</h2>
          {' '}
          <p>
            These terms govern your use of Astra Mentoring, the mentoring management and monitoring system used by FAITH Colleges. By signing in or using the system you agree to them. If you do not agree, please do not use the system and contact your administrator.
          </p>
          {' '}
          <h2 id="accounts">Accounts</h2>
          {' '}
          <ul>
            <li>
              Accounts are created by an authorized administrator and are meant for the named person only.
            </li>
            <li>You must give accurate information and keep it up to date.</li>
            <li>
              Keep your password confidential, never share your account, and sign out on shared devices.
            </li>
            <li>
              You are responsible for activity under your account. Tell the administrator immediately if you suspect unauthorized use.
            </li>
            <li>
              First-time users must upload an e-signature. It must be your own signature, and you agree it may appear on printed logsheets and reports that you sign.
            </li>
          </ul>
          {' '}
          <h2 id="use">Acceptable use</h2>
          {' '}
          <p>You agree not to:</p>
          {' '}
          <ul>
            <li>access records outside what your role needs, or try to see another user's data;</li>
            <li>
              attempt to bypass security, guess passwords or IDs, scrape the system, or interfere with how it works;
            </li>
            <li>upload malware, unlawful, offensive or unrelated content;</li>
            <li>impersonate another person or use someone else's signature;</li>
            <li>export, print or share student information unless you are authorized to.</li>
          </ul>
          {' '}
          <h2 id="records">Mentoring records</h2>
          {' '}
          <p>Mentoring records are used for academic documentation, so they must be honest.</p>
          {' '}
          <ul>
            <li>
              Attendance is recorded by QR code. Mentees must generate their own code and mentors must scan only for sessions that actually took place. Do not share, photograph or reuse QR codes to record someone else's attendance.
            </li>
            <li>
              Do not mark attendance, write notes or attach proof to the wrong session, and do not upload altered or fabricated proof.
            </li>
            <li>
              Report errors through the proper workflow instead of creating duplicate records.
            </li>
            <li>
              Submission deadlines and checkpoint windows set by the administrators apply to everyone.
            </li>
          </ul>
          {' '}
          <div className="note">
            Falsifying attendance, proof or signatures may lead to account suspension and disciplinary action under FAITH Colleges' policies.
          </div>
          {' '}
          <h2 id="content">Your content</h2>
          {' '}
          <p>
            You keep responsibility for the announcements, comments, notes and files you post. By posting, you allow the system to store, display and print that content for the mentoring program, to the audience you choose or your role allows. Administrators may remove content that breaks these terms.
          </p>
          {' '}
          <h2 id="privacy">Privacy</h2>
          {' '}
          <p>
            How we collect and use personal information is explained in our{' '}
            <a href="/privacy">Privacy Policy</a>
            , which forms part of these terms.
          </p>
          {' '}
          <h2 id="availability">Availability and changes to the service</h2>
          {' '}
          <p>
            We try to keep the system available, but we do not promise it will always be uninterrupted or error-free. Maintenance, updates or outside factors can cause downtime. Features may change, be added or be removed. Notifications shown in the system are the official notices. SMS delivery is not offered, and email delivery depends on your school's configuration.
          </p>
          {' '}
          <h2 id="ip">Ownership</h2>
          {' '}
          <p>
            The Astra Mentoring name, logo, design and software belong to their respective owners and developers. You receive a limited, non-transferable right to use the system for the mentoring program. You may not copy, resell or reverse engineer it except as the law allows or the owners agree in writing.
          </p>
          {' '}
          <h2 id="disclaimer">Disclaimers and liability</h2>
          {' '}
          <p>
            The system is provided "as is". To the fullest extent the law allows, the developers and FAITH Colleges are not liable for indirect or consequential loss arising from use of, or inability to use, the system, including data entered incorrectly by users. Nothing in these terms limits liability that cannot be limited by law.
          </p>
          {' '}
          <h2 id="suspend">Suspension and termination</h2>
          {' '}
          <p>
            An administrator may suspend or deactivate an account that breaks these terms, is no longer needed (for example after graduation or leaving the program), or poses a security risk. You may stop using the system at any time by asking the administrator to deactivate your account, subject to record-retention requirements in the Privacy Policy.
          </p>
          {' '}
          <h2 id="changes">Changes to these terms</h2>
          {' '}
          <p>
            We may update these terms. The "Last updated" date shows the latest version, and continuing to use the system after an update means you accept it.
          </p>
          {' '}
          <h2 id="law">Governing law</h2>
          {' '}
          <p>
            These terms are governed by the laws of the Republic of the Philippines. Disputes should first be raised with the program administrators and FAITH Colleges' regular channels.
          </p>
          {' '}
          <h2 id="contact">Contact</h2>
          {' '}
          <p>
            Questions about these terms? Contact the Astra Mentoring system administrator at{' '}
            <a href="mailto:astramentoring.iot@gmail.com">astramentoring.iot@gmail.com</a>
            {' '}or your department's mentoring program contact.
          </p>
        </article>
      </main>
      <footer>
        <div className="container foot-bottom" style={{ borderTop: "0" }}>
          <span>
            ©{' '}
            <span id="yr">{new Date().getFullYear()}</span>
            {' '}Astra Mentoring. All rights reserved.
          </span>
          {' '}
          <span className="legal-links">
            <a href="/landing">Home</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </span>
        </div>
      </footer>
    </Page>
  );
}
