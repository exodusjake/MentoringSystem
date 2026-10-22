import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { AttendanceMetrics } from '../../lib/attendance-metrics.js';
import { navigateTo } from '../../lib/events.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// Attendance Overview (MENTOR/HTML/my-activities.html + my-activities.js).
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

function statusClass(status) {
  switch (status) {
    case 'Excellent': return 'excellent';
    case 'On Track': return 'on-track';
    case 'Behind': return 'behind';
    case 'At Risk': return 'at-risk';
    case 'Critical': return 'critical';
    case 'No Sessions': return 'no-sessions';
    case 'Needs Attention': return 'needsattention';
    case 'Not Started': return 'notstarted';
    default: return '';
  }
}

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0) return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

const byName = (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

export default function MentorAttendance() {
  useStayOnBack();
  const [data, setData] = useState({ state: 'loading' });   // loading | ok | error
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    const mentorId = getSession()?.user?.userID;
    if (!mentorId) { navigateTo('/login'); return; }
    apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true)
      .then(d => setData({ state: 'ok', hero: d, mentees: d.mentees ?? [] }))
      .catch(e => { console.error('Failed to load activities:', e); setData({ state: 'error' }); });
  }, []);

  // Native disclosure controls support mouse, touch, and keyboard; Escape or an outside click closes them.
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
    // Capture phase: the original's handler ran before the shared tooltip script's Escape handler.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('click', onClick); };
  }, []);

  const filtered = useMemo(() => {
    if (data.state !== 'ok') return null;
    const query = q.trim().toLowerCase();
    return data.mentees.filter(m => {
      const name = `${m.firstName} ${m.lastName}`.toLowerCase();
      if (query && !name.includes(query)) return false;
      if (status && AttendanceMetrics.completion(m.sessionsAttended ?? 0, m.totalSessions ?? 0) !== status) return false;
      return true;
    });
  }, [data, q, status]);

  const hero = data.state === 'ok' ? data.hero : null;
  let heroView = { avatar: '—', avatarCls: 'hero-avatar av-0', name: data.state === 'error' ? 'Failed to load activity data.' : 'Loading…', badge: '', badgeCls: 'hero-badge' };
  if (hero) {
    const done = hero.completedSessions ?? hero.CompletedSessions ?? 0;
    const tier = mentorTierGroup(hero.progressStatus ?? '', done);
    heroView = {
      avatar: initials(hero.firstName, hero.lastName),
      avatarCls: `hero-avatar av-${avatarIndex((hero.firstName ?? '') + (hero.lastName ?? ''))}`,
      name: `${hero.firstName} ${hero.lastName}`,
      badge: hero.progressStatus ? `Overall Performance: ${tier}` : '',
      badgeCls: hero.progressStatus ? `hero-badge ${statusClass(tier)}` : 'hero-badge',
    };
  }

  let accordion = null;
  if (data.state === 'error') {
    accordion = <Empty className="mentee-card-empty">Could not load mentees. Please refresh.</Empty>;
  } else if (filtered && !filtered.length) {
    if (open.size) setOpen(new Set());
    accordion = <Empty key="none" className="mentee-card-empty">No mentees match the current filter.</Empty>;
  } else if (filtered) {
    const sectionMap = {};
    filtered.forEach(m => {
      const sec = m.sectionCode || 'Unassigned';
      (sectionMap[sec] ||= []).push(m);
    });
    const sections = Object.entries(sectionMap).sort(([a], [b]) => a.localeCompare(b));
    if (sections.length === 1) {
      // The original read the open sections back from the accordion, so they're forgotten once
      // the list collapses to a single section.
      if (open.size) setOpen(new Set());
      // Single section — skip accordion, render cards directly
      accordion = (
        <div className="mentee-cards-grid single-section">
          {[...sections[0][1]].sort(byName).map((m, i) => <MenteeCard key={i} m={m} />)}
        </div>
      );
    } else {
      // Multiple sections — accordion with open state preserved
      accordion = sections.map(([section, list], idx) => (
        <div key={section} className={`sec-group sec-color-${idx % 5} ${open.has(section) ? 'open' : ''}`} data-section={section}>
          <button className="sec-group-header" type="button" onClick={() => setOpen(s => {
            const next = new Set(s);
            if (next.has(section)) next.delete(section); else next.add(section);
            return next;
          })}>
            <div className="sec-group-left">
              <span className="sec-group-name">{section}</span>
              {' '}
              <span className="sec-group-count">{list.length} mentee{list.length !== 1 ? 's' : ''}</span>
            </div>
            {' '}
            <svg className="sec-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {' '}
          <div className="sec-group-body">
            <div className="mentee-cards-grid">
              {[...list].sort(byName).map((m, i) => <MenteeCard key={i} m={m} />)}
            </div>
          </div>
        </div>
      ));
    }
  }

  return (
    <Page id="MENTOR/my-activities">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>Attendance Overview</h1>
            {' '}
            <p>Review mentee attendance toward the semester requirement.</p>
          </div>
          {' '}
          {/* Hero card */}
          <div className="mentor-hero" id="mentorHero">
            <div className={heroView.avatarCls} id="heroAvatar">{heroView.avatar}</div>
            {' '}
            <div className="hero-info" id="heroInfo">
              <div className="hero-name" id="heroName">{heroView.name}</div>
              {' '}
              <div className="hero-meta" id="heroMeta">
                {hero && [
                  hero.departmentName && ['ti-building', hero.departmentName],
                  hero.school && ['ti-school', hero.school],
                  hero.email && ['ti-mail', hero.email],
                  hero.contactNumber && ['ti-phone', hero.contactNumber],
                ].filter(Boolean).map(([icon, text]) => (
                  <div key={icon} className="hero-meta-item"><i className={'ti ' + icon}></i>{text}</div>
                ))}
              </div>
            </div>
            {' '}
            <div className="hero-tip-wrap">
              <span className={heroView.badgeCls} id="heroBadge">{heroView.badge}</span>
              {' '}
              <details className="attendance-help hero-help">
                <summary aria-label="Overall performance guide"><i className="ti ti-info-circle" aria-hidden="true"></i></summary>
                <div className="hero-tip-box" id="heroTipBox">
                  {hero && <>
                    <div className="info-tip-title">Overall Performance Guide</div>
                    {' '}
                    <div className="info-tip-row">Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
                    {' '}
                    <div className="info-tip-row"><span className="info-dot excellent"></span><span><strong>Excellent</strong> — ≥80%</span></div>
                    {' '}
                    <div className="info-tip-row"><span className="info-dot on-track"></span><span><strong>On Track</strong> — 50–79%</span></div>
                    {' '}
                    <div className="info-tip-row"><span className="info-dot needsattention"></span><span><strong>Needs Attention</strong> — below 50%, with at least one completed session</span></div>
                    {' '}
                    <div className="info-tip-row"><span className="info-dot notstarted"></span><span><strong>Not Started</strong> — no completed sessions this semester</span></div>
                  </>}
                </div>
              </details>
            </div>
          </div>
          {' '}
          {/* Mentee Attendance Overview */}
          <div className="section-card section-card--tip-overflow">
            <div className="section-card-head">
              <span className="section-card-title">Attendance Overview</span>
              {' '}
              <span id="menteeCount" className="section-card-count">{filtered ? `(${filtered.length})` : ''}</span>
            </div>
            {' '}
            <div className="section-filter-bar">
              <div className="search-box">
                <i className="ti ti-search"></i>
                {' '}
                <input type="text" id="menteeSearch" placeholder="Search mentee…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              {' '}
              <Select className="filter-select" id="menteeStatusFilter" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">All Completion Statuses</option>
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="not-configured">No Requirement Set</option>
              </Select>
              {' '}
              <details className="attendance-help">
                <summary aria-label="Semester completion guide"><i className="ti ti-info-circle" aria-hidden="true"></i></summary>
                <div className="info-tip-box">
                  {hero && <>
                    <div className="info-tip-title">Semester Completion</div>
                    <div className="info-tip-row">Checkpoints attended out of the semester requirement. Regular and make-up sessions for the same checkpoint count once.</div>
                  </>}
                </div>
              </details>
            </div>
            {' '}
            <div id="sectionAccordion" className="section-accordion">{accordion}</div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}

function MenteeCard({ m }) {
  const attended = m.sessionsAttended ?? 0;
  const total = m.totalSessions ?? 0;
  const pct = Math.round(AttendanceMetrics.percent(attended, total));
  const isDropOut = m.isDropOut || false;
  return (
    <div className={'mentee-card' + (isDropOut ? ' is-dropout' : '')}>
      <div className="mcard-identity">
        <div className={`mcard-avatar av-${avatarIndex((m.firstName ?? '') + (m.lastName ?? ''))}`}>{initials(m.firstName, m.lastName)}</div>
        {' '}
        <div className="mcard-name-block">
          <div className="mcard-name">{`${m.firstName} ${m.lastName}`}</div>
          {' '}
          <div className="mcard-sub">{m.studentNumber ?? '—'}</div>
          {' '}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {isDropOut && <span className="mcard-dropout-chip">Dropped Out</span>}
          </div>
        </div>
      </div>
      {' '}
      <div className="mcard-body">
        <div className="mcard-att">
          <div className="mcard-att-label">
            <span>Semester Completion</span>
            {' '}
            <span className="mcard-att-count">{attended} / {total > 0 ? total : '—'}</span>
          </div>
          {' '}
          <div className="mcard-bar-bg" role="progressbar" aria-label="Semester completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-valuetext={`${attended} of ${total} required checkpoints attended`}>
            <div className="mcard-bar-fill" style={{ width: `${pct}%` }}></div>
          </div>
        </div>
        {' '}
        <div className="mcard-date">
          <i className="ti ti-calendar-event"></i>
          {' '}
          <span>{m.lastAttended ? `Last attended: ${fmtDate(m.lastAttended)}` : 'No attendance recorded'}</span>
        </div>
      </div>
    </div>
  );
}
