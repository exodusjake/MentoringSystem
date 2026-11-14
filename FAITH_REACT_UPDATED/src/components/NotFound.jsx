import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStyle } from '../lib/injectStyle.js';

const CSS = [
  '.nf-wrap{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;background:var(--nf-bg,#f4f7fb);font-family:"Poppins","DM Sans",system-ui,sans-serif;color:var(--nf-ink,#1f2937)}',
  '.nf-card{width:min(440px,100%);text-align:center;background:var(--nf-card,#fff);border:1px solid var(--nf-line,#e5e7eb);border-radius:20px;padding:36px 24px;box-shadow:0 14px 40px rgba(15,23,42,.10)}',
  '.nf-card img{width:72px;height:auto;margin-bottom:12px}',
  '.nf-code{font-size:64px;font-weight:700;line-height:1;color:#1e4b8c;margin:0}',
  '.nf-card h1{font-size:20px;margin:10px 0 8px}',
  '.nf-card p:not(.nf-code){font-size:14px;line-height:1.6;color:var(--nf-muted,#6b7280);margin:0 0 22px}',
  '.nf-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
  '.nf-btn{font:inherit;font-size:14px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:12px;background:#1e4b8c;color:#fff;border:1.5px solid #1e4b8c;cursor:pointer}',
  '.nf-btn.alt{background:transparent;color:#1e4b8c}',
  'html[data-theme="dark"] .nf-wrap{--nf-bg:#0f172a;--nf-card:#1e293b;--nf-line:#334155;--nf-ink:#e5e7eb;--nf-muted:#94a3b8}',
  'html[data-theme="dark"] .nf-code{color:#7aa7e6}',
  'html[data-theme="dark"] .nf-btn.alt{color:#7aa7e6;border-color:#7aa7e6}',
].join('');

// Shown for any URL that is not a real page (instead of silently bouncing to the home page).
export default function NotFound() {
  useStyle('not-found', CSS);
  useEffect(() => {
    const prev = document.title;
    document.title = 'Page not found – Astra Mentoring';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => { document.title = prev; robots.remove(); };
  }, []);
  return (
    <main className="nf-wrap">
      <div className="nf-card">
        <img src="/IMAGES/LOGO-mark.png" alt="Astra Mentoring logo" />
        <p className="nf-code">404</p>
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist, was moved, or the link is incorrect.</p>
        <div className="nf-actions">
          <Link className="nf-btn" to="/">Go to home</Link>
          <button type="button" className="nf-btn alt" onClick={() => window.history.back()}>Go back</button>
        </div>
      </div>
    </main>
  );
}
