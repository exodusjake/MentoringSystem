import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTOR/HTML/my-activities.html + MENTOR/JS/my-activities.js  (Attendance Overview)

const AVATAR_COLORS = 6;

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLORS;
}

function initials(first, last) {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Shared by the mentor's own hero badge (mentorTierGroup) and mentee attendance cards.
function statusClass(status) {
  switch (status) {
    case 'Excellent':       return 'excellent';
    case 'On Track':        return 'on-track';
    case 'Behind':          return 'behind';
    case 'At Risk':         return 'at-risk';
    case 'Critical':        return 'critical';
    case 'No Sessions':     return 'no-sessions';
    case 'Needs Attention': return 'needsattention';
    case 'Not Started':     return 'notstarted';
    default:                return '';
  }
}

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

const byLastFirst = (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

function MenteeCard({ m }) {
  const attended  = m.sessionsAttended ?? 0;
  const total     = m.totalSessions    ?? 0;
  const pct       = Math.round(AttendanceMetrics.percent(attended, total));
  const idx       = avatarIndex((m.firstName ?? '') + (m.lastName ?? ''));
  const ini       = initials(m.firstName, m.lastName);
  const isDropOut = m.isDropOut || false;

  return (
    <div className={`mentee-card ${isDropOut ? ' is-dropout' : ''}`.replace('card  ', 'card ')}>
      <div className="mcard-identity">
        <div className={`mcard-avatar av-${idx}`}>{ini}</div>
        <div className="mcard-name-block">
          <div className="mcard-name">{m.firstName} {m.lastName}</div>
          <div className="mcard-sub">{m.studentNumber ?? '—'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {isDropOut ? <span className="mcard-dropout-chip">Dropped Out</span> : null}
          </div>
        </div>
      </div>
      <div className="mcard-body">
        <div className="mcard-att">
          <div className="mcard-att-label">
            <span>Semester Completion</span>
            <span className="mcard-att-count">{attended} / {total > 0 ? total : '—'}</span>
          </div>
          <div className="mcard-bar-bg" role="progressbar" aria-label="Semester completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-valuetext={`${attended} of ${total} required checkpoints attended`}>
            <div className="mcard-bar-fill" style={{ width: `${pct}%` }}></div>
          </div>
        </div>
        <div className="mcard-date">
          <i className="ti ti-calendar-event"></i>
          <span>{m.lastAttended ? `Last attended: ${fmtDate(m.lastAttended)}` : 'No attendance recorded'}</span>
        </div>
      </div>
    </div>
  );
}

export default function MyActivities() {
  useBackGuard();
  const mentorId = getSession()?.user?.userID;

  const [hero, setHero] = useState(null);                  // loaded MonitorActivities data
  const [heroFailed, setHeroFailed] = useState(false);
  const [allMentees, setAllMentees] = useState(null);      // null until loaded, false when failed
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openSections, setOpenSections] = useState(() => new Set());

  useEffect(() => {
    if (!mentorId) { window.location.href = '/login'; return; }
    (async () => {
      try {
        const data = await apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true);
        setHero(data);
        setAllMentees(data.mentees ?? []);
      } catch (e) {
        console.error('Failed to load activities:', e);
        setHeroFailed(true);
        setAllMentees(false);
      }
    })();
  }, []);

  // Native disclosure controls support mouse, touch, and keyboard.
  useEffect(() => {
    const onKey = event => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('details.attendance-help[open]').forEach(help => {
        help.open = false;
        help.querySelector('summary').focus();
      });
    };
    const onClick = event => {
      document.querySelectorAll('details.attendance-help[open]').forEach(help => {
        if (!help.contains(event.target)) help.open = false;
      });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);

  const mentees = useMemo(() => {
    if (!allMentees) return [];
    const q = search.trim().toLowerCase();
    return allMentees.filter(m => {
      const name = `${m.firstName} ${m.lastName}`.toLowerCase();
      if (q && !name.includes(q)) return false;
      if (statusFilter && AttendanceMetrics.completion(m.sessionsAttended ?? 0, m.totalSessions ?? 0) !== statusFilter) return false;
      return true;
    });
  }, [allMentees, search, statusFilter]);

  const sections = useMemo(() => {
    const sectionMap = {};
    mentees.forEach(m => {
      const sec = m.sectionCode || 'Unassigned';
      if (!sectionMap[sec]) sectionMap[sec] = [];
      sectionMap[sec].push(m);
    });
    return Object.entries(sectionMap).sort(([a], [b]) => a.localeCompare(b));
  }, [mentees]);

  // The accordion keeps the open groups that are still shown after a re-render.
  const shownKey = sections.length > 1 ? sections.map(([s]) => s).join('\u0000') : '';
  useEffect(() => {
    const names = new Set(shownKey ? shownKey.split('\u0000') : []);
    setOpenSections(prev => {
      const next = new Set([...prev].filter(s => names.has(s)));
      return next.size === prev.size ? prev : next;
    });
  }, [shownKey]);

  // ── Hero ──
  let heroBlock;
  if (hero) {
    const idx  = avatarIndex((hero.firstName ?? '') + (hero.lastName ?? ''));
    const done = hero.completedSessions ?? hero.CompletedSessions ?? 0;
    const tier = mentorTierGroup(hero.progressStatus ?? '', done);
    const sc   = statusClass(tier);
    heroBlock = {
      avatarText: initials(hero.firstName, hero.lastName),
      avatarCls: `hero-avatar av-${idx}`,
      name: `${hero.firstName} ${hero.lastName}`,
      meta: [
        hero.departmentName && <div className="hero-meta-item" key="d"><i className="ti ti-building"></i>{hero.departmentName}</div>,
        hero.school         && <div className="hero-meta-item" key="s"><i className="ti ti-school"></i>{hero.school}</div>,
        hero.email          && <div className="hero-meta-item" key="e"><i className="ti ti-mail"></i>{hero.email}</div>,
        hero.contactNumber  && <div className="hero-meta-item" key="c"><i className="ti ti-phone"></i>{hero.contactNumber}</div>,
      ].filter(Boolean),
      badgeText: hero.progressStatus ? `Overall Performance: ${tier}` : '',
      badgeCls: hero.progressStatus ? `hero-badge ${sc}` : 'hero-badge',
    };
  } else {
    heroBlock = {
      avatarText: '—', avatarCls: 'hero-avatar av-0', name: heroFailed ? 'Failed to load activity data.' : 'Loading…', meta: null,
      badgeText: '', badgeCls: 'hero-badge',
    };
  }

  // ── Mentee accordion ──
  const sortedCards = list => [...list].sort(byLastFirst).map(m => <MenteeCard m={m} key={m.menteeID ?? m.userID ?? `${m.firstName}-${m.lastName}-${m.studentNumber}`} />);
  let accordion = null;
  if (allMentees === false) {
    accordion = <Empty className="mentee-card-empty">Could not load mentees. Please refresh.</Empty>;
  } else if (allMentees) {
    if (!mentees.length) accordion = <Empty className="mentee-card-empty">No mentees match the current filter.</Empty>;
    else if (sections.length === 1) {
      // Single section — skip accordion, render cards directly
      accordion = <div className="mentee-cards-grid single-section">{sortedCards(sections[0][1])}</div>;
    } else {
      accordion = sections.map(([section, list], idx) => {
        const isOpen = openSections.has(section);
        return (
          <div className={`sec-group sec-color-${idx % 5} ${isOpen ? 'open' : ''}`} data-section={section} key={section}>
            <button className="sec-group-header" type="button" onClick={() => setOpenSections(prev => { const n = new Set(prev); if (n.has(section)) n.delete(section); else n.add(section); return n; })}>
              <div className="sec-group-left">
                <span className="sec-group-name">{section}</span>
                <span className="sec-group-count">{list.length} mentee{list.length !== 1 ? 's' : ''}</span>
              </div>
              <svg className="sec-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div className="sec-group-body">
              <div className="mentee-cards-grid">{sortedCards(list)}</div>
            </div>
          </div>
        );
      });
    }
  }

  return (
    <Page id="MENTOR/my-activities">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Attendance Overview</h1>
            <p>Review mentee attendance toward the semester requirement.</p>
          </div>

          <div className="mentor-hero" id="mentorHero">
            <div className={heroBlock.avatarCls} id="heroAvatar">{heroBlock.avatarText}</div>
            <div className="hero-info" id="heroInfo">
              <div className="hero-name" id="heroName">{heroBlock.name}</div>
              <div className="hero-meta" id="heroMeta">{heroBlock.meta}</div>
            </div>
            <div className="hero-tip-wrap">
              <span className={heroBlock.badgeCls} id="heroBadge">{heroBlock.badgeText}</span>
              <details className="attendance-help hero-help">
                <summary aria-label="Overall performance guide"><i className="ti ti-info-circle" aria-hidden="true"></i></summary>
                <div className="hero-tip-box" id="heroTipBox">
                  {hero ? (
                    <>
                      <div className="info-tip-title">Overall Performance Guide</div>
                      <div className="info-tip-row">Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
                      <div className="info-tip-row"><span className="info-dot excellent"></span><span><strong>Excellent</strong> — ≥80%</span></div>
                      <div className="info-tip-row"><span className="info-dot on-track"></span><span><strong>On Track</strong> — 50–79%</span></div>
                      <div className="info-tip-row"><span className="info-dot needsattention"></span><span><strong>Needs Attention</strong> — below 50%, with at least one completed session</span></div>
                      <div className="info-tip-row"><span className="info-dot notstarted"></span><span><strong>Not Started</strong> — no completed sessions this semester</span></div>
                    </>
                  ) : null}
                </div>
              </details>
            </div>
          </div>

          <div className="section-card section-card--tip-overflow">
            <div className="section-card-head">
              <span className="section-card-title">Attendance Overview</span>
              <span id="menteeCount" className="section-card-count">{allMentees ? `(${mentees.length})` : ''}</span>
            </div>
            <div className="section-filter-bar">
              <div className="search-box">
                <i className="ti ti-search"></i>
                <input type="text" id="menteeSearch" placeholder="Search mentee…" autoComplete="off" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select className="filter-select" id="menteeStatusFilter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Completion Statuses</option>
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="not-configured">No Requirement Set</option>
              </Select>
              <details className="attendance-help">
                <summary aria-label="Semester completion guide"><i className="ti ti-info-circle" aria-hidden="true"></i></summary>
                <div className="info-tip-box">
                  {allMentees ? (
                    <>
                      <div className="info-tip-title">Semester Completion</div>
                      <div className="info-tip-row">Checkpoints attended out of the semester requirement. Regular and make-up sessions for the same checkpoint count once.</div>
                    </>
                  ) : null}
                </div>
              </details>
            </div>
            <div id="sectionAccordion" className="section-accordion">{accordion}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
