import { Fragment } from 'react';

// The three school summary cards used across the Head and Admin pages. Clicking a card toggles
// that school's filter. `stats` = [{ id: key => element id, label, values: { sot, soh, som } or
// null while loading }] (two per card).
export const SCHOOLS = [
  { key: 'sot', name: 'School of Technology', sub: <>COE &amp; CCIT</>,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg> },
  { key: 'soh', name: 'School of Humanities', sub: <>CASE, CHC &amp; CCJ</>,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg> },
  { key: 'som', name: 'School of Management', sub: <>CBMA &amp; CTHM</>,
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg> },
];

export default function SchoolCards({ active, onSelect, stats }) {
  return SCHOOLS.map((s, i) => (
    <Fragment key={s.key}>
      {i > 0 && ' '}
      <div className={`school-card school-card--${s.key}` + (active === s.name ? ' active' : '')} onClick={() => onSelect(s.name)}>
        <div className="school-card-icon">{s.icon}</div>
        {' '}
        <div className="school-card-body">
          <div className="school-card-name">{s.name}</div>
          {' '}
          <div className="school-card-sub">{s.sub}</div>
        </div>
        {' '}
        <div className="school-card-stats">
          {stats.map((st, j) => (
            <Fragment key={j}>
              {j > 0 && ' '}
              <div className="school-stat"><span id={st.id(s.key)}>{st.values ? st.values[s.key] : <span className="stat-pulse">—</span>}</span><small>{st.label}</small></div>
            </Fragment>
          ))}
        </div>
      </div>
    </Fragment>
  ));
}
