import { useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { useLenis, useNavScrolled, usePublicEffects } from './publicEffects.js';

// LANDING/HTML/privacy.html
export default function Privacy() {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  usePublicEffects();
  useLenis();
  useNavScrolled(setScrolled);

  return (
    <Page id="LANDING/privacy">
      <>
        <div className="scroll-progress" aria-hidden="true"></div>
        <header className={'nav' + (scrolled ? ' scrolled' : '')}>
          <div className="container nav-inner">
            <Link to="/landing" className="brand">
              <img src="/IMAGES/LOGO-mark.png" alt="Astra Mentoring logo" />
              {' '}
              <span>
                Astra Mentoring
                <small>MENTORING SESSION MANAGEMENT</small>
              </span>
            </Link>
            {' '}
            <button className="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded={navOpen ? 'true' : 'false'} onClick={() => setNavOpen(o => !o)}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <nav className="nav-links" id="navLinks">
              <Link to="/landing#home">Home</Link>
              {' '}
              <Link to="/landing#features">Features</Link>
              {' '}
              <Link to="/landing#faq">FAQs</Link>
              {' '}
              <Link to="/privacy" className="active">Privacy</Link>
              {' '}
              <Link to="/terms">Terms</Link>
              {' '}
              <Link to="/login" className="btn btn-gold">Log in</Link>
            </nav>
          </div>
        </header>
        <div className="legal-hero">
          <div className="container">
            <span className="eyebrow">Legal</span>
            <h1>Privacy Policy</h1>
            <p>Last updated: October 18, 2026</p>
          </div>
        </div>
        <main className="container legal-layout">
          <aside className="toc" aria-label="On this page">
            <h4>On this page</h4>
            <ol>
              <li>
                <a href="#about">About this policy</a>
              </li>
              <li>
                <a href="#collect">Information we collect</a>
              </li>
              <li>
                <a href="#use">How we use it</a>
              </li>
              <li>
                <a href="#access">Who can see it</a>
              </li>
              <li>
                <a href="#storage">Storage &amp; security</a>
              </li>
              <li>
                <a href="#retention">Retention</a>
              </li>
              <li>
                <a href="#rights">Your rights</a>
              </li>
              <li>
                <a href="#cookies">Cookies &amp; local storage</a>
              </li>
              <li>
                <a href="#changes">Changes</a>
              </li>
              <li>
                <a href="#contact">Contact</a>
              </li>
            </ol>
          </aside>
          <article className="legal">
            <h2 id="about">About this policy</h2>
            <p>
              Astra Mentoring is a web-based mentoring management and monitoring system used by FAITH Colleges to schedule mentoring sessions, record attendance, document sessions and monitor progress. This policy explains what personal information the system handles, why, who can see it and how it is protected.
            </p>
            <p>
              By signing in and using the system you acknowledge this policy. We handle personal data in line with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules.
            </p>
            <h2 id="collect">Information we collect</h2>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Examples</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Account details</td>
                  <td>
                    Name, institutional email, role, student or employee number, gender, school, department, course and section
                  </td>
                  <td>Entered or imported by an authorized administrator</td>
                </tr>
                <tr>
                  <td>Credentials</td>
                  <td>Your password, stored only as a one-way hash, never as plain text</td>
                  <td>You, at account creation or password change</td>
                </tr>
                <tr>
                  <td>E-signature</td>
                  <td>The signature image you upload (PNG) on first login</td>
                  <td>You</td>
                </tr>
                <tr>
                  <td>Mentoring records</td>
                  <td>
                    Mentor–mentee assignments, availability slots, booked sessions, attendance status, QR scan time, logsheet notes and remarks
                  </td>
                  <td>Generated as you use the system</td>
                </tr>
                <tr>
                  <td>Uploaded files</td>
                  <td>Session proof (photo or PDF), announcement attachments, evaluation proof</td>
                  <td>You</td>
                </tr>
                <tr>
                  <td>Posts and activity</td>
                  <td>Announcements, comments, notifications, evaluation responses links</td>
                  <td>You</td>
                </tr>
                <tr>
                  <td>Technical data</td>
                  <td>Sign-in session token, login attempts for rate-limiting, server logs</td>
                  <td>Your browser and our servers</td>
                </tr>
              </tbody>
            </table>
            <p>We do not collect payment information, and we do not sell personal data.</p>
            <h2 id="use">How we use it</h2>
            <ul>
              <li>To create and secure your account and show the portal for your role.</li>
              <li>To match mentors and mentees, schedule sessions and record attendance.</li>
              <li>
                To produce logsheets, calendar sheets and reports that carry the required signatures.
              </li>
              <li>
                To let administrators and heads monitor progress, timeliness and completeness of mentoring.
              </li>
              <li>
                To show announcements and in-system notifications, and, if your school has enabled email, to send transactional emails such as session notices.
              </li>
              <li>To prevent misuse, investigate errors and keep the system reliable.</li>
            </ul>
            <h2 id="access">Who can see it</h2>
            <p>
              Access depends on role and is limited to what is needed for the mentoring program.
            </p>
            <ul>
              <li>
                <strong>Mentees</strong>
                {' '}
                see their own profile, sessions and attendance, and their assigned mentor's contact details.
              </li>
              <li>
                <strong>Mentors</strong>
                {' '}
                see their assigned mentees and the sessions, attendance and logsheets they handle.
              </li>
              <li>
                <strong>Administrators</strong>
                {' '}
                manage users and can view attendance, sessions, proofs and logsheets across the program.
              </li>
              <li>
                <strong>Heads</strong>
                {' '}
                have read-only, institution-level monitoring views and reports.
              </li>
            </ul>
            <p>
              Printed logsheets and exported reports (CSV or PDF) may contain names, attendance and signatures. Handle them only as authorized and do not share them outside the program. We do not disclose personal data to third parties except where required by law, or to service providers that host or deliver the system on behalf of the school, such as the hosting, database and email-delivery providers.
            </p>
            <h2 id="storage">Storage &amp; security</h2>
            <ul>
              <li>
                Data is stored in a Microsoft SQL Server database. Uploaded files are stored on the application server.
              </li>
              <li>
                Passwords are hashed. Sessions use signed tokens, and repeated failed logins are rate-limited.
              </li>
              <li>
                Each portal restricts access by role, and the server checks your identity on every request instead of trusting values sent by the browser.
              </li>
              <li>
                Production deployments should use HTTPS. Please use a private device, keep your password to yourself and sign out on shared computers.
              </li>
            </ul>
            <div className="note">
              No system can be completely secure. If you think your account has been compromised, change your password and tell the administrator right away.
            </div>
            <h2 id="retention">Retention</h2>
            <p>
              Mentoring records are kept for as long as they are needed for the program and for the academic and reporting periods they belong to. Records are organized by school year and semester. When an account is removed by an administrator, its associated data is cleaned up according to the system's deletion rules, except where records must be kept for documentation or audit purposes.
            </p>
            <h2 id="rights">Your rights</h2>
            <p>Under the Data Privacy Act you may, subject to the law:</p>
            <ul>
              <li>be informed about how your data is processed;</li>
              <li>access the personal data we hold about you;</li>
              <li>ask us to correct inaccurate or outdated data;</li>
              <li>
                object to processing, or ask for blocking or removal where it is no longer necessary or is unlawfully processed;
              </li>
              <li>file a complaint with the National Privacy Commission.</li>
            </ul>
            <p>
              To use any of these rights, contact us using the details below. Some records, such as signed logsheets and attendance that form part of an academic requirement, may need to be retained.
            </p>
            <h2 id="cookies">Cookies &amp; local storage</h2>
            <p>
              The system does not use advertising or tracking cookies. It stores your sign-in session (token and basic profile such as your role) in your browser's local storage so you stay signed in, and may cache static files for faster loading as a Progressive Web App. Signing out clears your session. Clearing your browser data removes the rest.
            </p>
            <h2 id="changes">Changes to this policy</h2>
            <p>
              We may update this policy as the system changes. The "Last updated" date at the top shows the latest version. Continued use after an update means you accept the revised policy.
            </p>
            <h2 id="contact">Contact</h2>
            <p>
              Questions or requests about your personal data? Contact the Astra Mentoring system administrator at
              {' '}
              <a href="mailto:astramentoring.iot@gmail.com">astramentoring.iot@gmail.com</a>
              {' '}
              or the mentoring program contact designated by your department at FAITH Colleges. Please do not include your password in any message.
            </p>
            <p>
              See also our
              {' '}
              <Link to="/terms">Terms of Service</Link>
              .
            </p>
          </article>
        </main>
        <footer>
          <div className="container foot-bottom" style={{ borderTop: "0" }}>
            <span>
              ©
              {' '}
              <span id="yr">{new Date().getFullYear()}</span>
              {' '}
              Astra Mentoring. All rights reserved.
            </span>
            {' '}
            <span className="legal-links">
              <Link to="/landing">Home</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
            </span>
          </div>
        </footer>
      </>
    </Page>
  );
}
