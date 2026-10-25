import { useEffect, useRef, useState } from 'react';
import { useStyle } from '../lib/injectStyle.js';

// A card list inside a bordered panel: the list scrolls inside the panel (so a long list does not stretch the
// page), with the same "Showing x to y of n · Rows per page · page buttons" footer as User Management.
//   items:    array of card elements (null/undefined/empty -> the panel shows `message` instead, no footer)
//   message:  loading / failed / empty content
//   gridClass / gridId: the list's own class and id (the page stylesheets lay the cards out)
//   Paging starts again from page 1 whenever the set of cards changes (a filter was used); cards need a key.
const ROW_CHOICES = [
  { n: 6, lines: [5, 10] },
  { n: 12, lines: [5, 10, 15] },
  { n: 24, lines: [5, 10, 15, 20] },
];

const CSS = `
.pp-panel{display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid #dce3ec;border-radius:16px;box-shadow:0 2px 8px rgba(15,23,42,.07);overflow:hidden}
.pp-scroll{position:relative;padding:16px;background:#f6f8fb;max-height:clamp(380px,calc(100vh - 330px),780px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c3cddb transparent;scroll-behavior:smooth}
.pp-scroll::-webkit-scrollbar{width:10px}
.pp-scroll::-webkit-scrollbar-track{background:transparent}
.pp-scroll::-webkit-scrollbar-thumb{background:#c3cddb;border-radius:99px;border:3px solid #f6f8fb}
.pp-scroll::-webkit-scrollbar-thumb:hover{background:#9aa9be}
.pp-scroll.pp-in>*>*{animation:ppIn .32s cubic-bezier(.22,1,.36,1) both}
@keyframes ppIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.pp-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 20px;background:#fff;border-top:1px solid #e6ebf2}
.pp-showing{font-size:14px;color:#6b7280}
.pp-rpp-wrap{display:flex;align-items:center;gap:10px}
.pp-rpp-label{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#6b7280;white-space:nowrap}
.pp-ico{width:16px;height:16px;flex-shrink:0}
.pp-rpp{display:inline-flex;gap:2px;padding:3px;background:#eef2f7;border-radius:11px}
.pp-rpp button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:48px;height:32px;padding:0 10px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;transition:background .18s,color .18s,box-shadow .18s,transform .12s}
.pp-rpp button .pp-ico{width:14px;height:14px}
.pp-rpp button:hover:not(.active){background:rgba(255,255,255,.7);color:#374151}
.pp-rpp button.active{background:#fff;color:#2563eb;box-shadow:0 1px 4px rgba(15,23,42,.14)}
.pp-rpp button:active{transform:scale(.95)}
.pp-pages{display:flex;align-items:center;gap:6px}
.pp-btn{min-width:38px;height:38px;padding:0 10px;display:flex;align-items:center;justify-content:center;font:inherit;font-size:14px;font-weight:500;color:#374151;background:#fff;border:1px solid #dce3ec;border-radius:10px;cursor:pointer;transition:background .18s,border-color .18s,color .18s,transform .12s,box-shadow .18s}
.pp-btn svg{width:16px;height:16px}
.pp-btn.icon{padding:0;color:#6b7280}
.pp-btn:hover:not(:disabled):not(.active){background:#eff6ff;border-color:#bfdbfe;color:#2563eb}
.pp-btn:active:not(:disabled){transform:scale(.94)}
.pp-btn.active{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 4px 10px rgba(37,99,235,.28)}
.pp-btn:disabled{opacity:.4;cursor:not-allowed}
@media (max-width:700px){.pp-rpp-label{display:none}.pp-footer{justify-content:center}.pp-scroll{padding:12px}}
@media (prefers-reduced-motion:reduce){.pp-scroll{scroll-behavior:auto}.pp-scroll.pp-in>*>*{animation:none}}
`;

const IC = {
  first: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>,
  prev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  last: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>,
};

function smartPages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5];
  if (current >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
  return [current - 2, current - 1, current, current + 1, current + 2];
}

const read = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };

export default function PagedPanel({ items, message, gridClass, gridId, unit = 'entries', storageKey = 'pp-rows' }) {
  useStyle('paged-panel', CSS);
  const [rows, setRows] = useState(() => {
    const saved = parseInt(read(storageKey), 10);
    return ROW_CHOICES.some(c => c.n === saved) ? saved : 12;
  });
  const [page, setPage] = useState(1);
  const [animKey, setAnimKey] = useState(0);

  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / rows));
  const current = Math.min(page, pages);

  // Filters changed (different cards): back to the first page.
  const signature = list.map(el => el?.key ?? '').join('|');
  useEffect(() => { setPage(1); }, [signature]);
  // Page or size changed: the cards ease in from the top of the list.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setAnimKey(k => k + 1);
  }, [current, rows]);

  const go = p => setPage(Math.min(Math.max(1, p), pages));
  const pickRows = n => { setRows(n); setPage(1); write(storageKey, String(n)); };

  const from = total ? (current - 1) * rows + 1 : 0;
  const to = Math.min(total, current * rows);
  const visible = list.slice((current - 1) * rows, current * rows);

  return (
    <div className="pp-panel">
      <div className="pp-scroll pp-in" key={animKey}>
        <div className={gridClass} id={gridId}>{total ? visible : message}</div>
      </div>
      {total ? (
        <div className="pp-footer">
          <span className="pp-showing">Showing {from} to {to} of {total} {unit}</span>
          <div className="pp-rpp-wrap">
            <span className="pp-rpp-label">
              <svg className="pp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="15" x2="21" y2="15" />
              </svg>
              Rows per page
            </span>
            <div className="pp-rpp" role="group" aria-label="Rows per page">
              {ROW_CHOICES.map(({ n, lines }) => (
                <button type="button" key={n} className={rows === n ? 'active' : undefined} aria-pressed={rows === n} onClick={() => pickRows(n)}>
                  <svg className="pp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    {lines.map(y => <line key={y} x1="5" y1={y} x2="19" y2={y} />)}
                  </svg>{n}
                </button>
              ))}
            </div>
          </div>
          <div className="pp-pages">
            <button type="button" className="pp-btn icon" title="First page" aria-label="First page" disabled={current === 1} onClick={() => go(1)}>{IC.first}</button>
            <button type="button" className="pp-btn icon" title="Previous page" aria-label="Previous page" disabled={current === 1} onClick={() => go(current - 1)}>{IC.prev}</button>
            {smartPages(current, pages).map(p => (
              <button type="button" key={p} className={`pp-btn${p === current ? ' active' : ''}`} aria-current={p === current ? 'page' : undefined} onClick={() => go(p)}>{p}</button>
            ))}
            <button type="button" className="pp-btn icon" title="Next page" aria-label="Next page" disabled={current === pages} onClick={() => go(current + 1)}>{IC.next}</button>
            <button type="button" className="pp-btn icon" title="Last page" aria-label="Last page" disabled={current === pages} onClick={() => go(pages)}>{IC.last}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
