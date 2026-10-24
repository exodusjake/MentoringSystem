import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { useStayOnBack } from './useStayOnBack.js';

// My Mentees (MENTOR/HTML/my-mentees.html + my-mentees.js).
export default function MentorMentees() {
  useStayOnBack();
  const [data, setData] = useState({ state: 'loading' });   // loading | ok | error
  const [q, setQ] = useState('');
  const [sortMode, setSortMode] = useState('section');
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    (async () => {
      const mentorId = getSession().user?.userID;
      try {
        const [assignments, menteesWithDept, settings] = await Promise.all([
          apiRequest('Users/assignments', 'GET', null, true),
          apiRequest('Users/mentees-with-dept', 'GET', null, true),
          apiRequest('Settings', 'GET', null, true).catch(() => null),
        ]);
        let schoolYearLabel = '—';
        if (settings) {
          const semester = settings.Semester || settings.semester || '1st Semester';
          const schoolYear = settings.SchoolYear || settings.schoolYear || '—';
          schoolYearLabel = `SY ${schoolYear} · ${semester}`;
        }
        const details = {};
        (menteesWithDept || []).forEach(m => { details[m.userID] = m; });
        const mine = (assignments || [])
          .filter(a => a.mentorUserID === mentorId)
          .map(a => {
            const detail = details[a.menteeUserID] || {};
            return { ...a, sectionCode: detail.sectionCode || detail.section || '—', school: detail.school || a.menteeSchool || '—' };
          });
        setData(d => ({ ...d, count: mine.length }));
        // Pre-fetch all user details in parallel so cards show complete info
        const results = await Promise.allSettled(mine.map(a => apiRequest(`Users/${a.menteeUserID}`, 'GET', null, true)));
        const users = {};
        mine.forEach((a, i) => { if (results[i].status === 'fulfilled') users[a.menteeUserID] = results[i].value; });
        setData({ state: 'ok', count: mine.length, mentees: mine, details, users, schoolYearLabel });
      } catch (e) {
        console.error('Failed to load mentees:', e);
        setData(d => ({ ...d, state: 'error' }));
      }
    })();
  }, []);

  const sections = useMemo(() => {
    if (data.state !== 'ok') return [];
    const map = {};
    data.mentees.forEach(m => {
      const sec = m.sectionCode || '—';
      if (!map[sec]) map[sec] = { count: 0, course: m.course || '' };
      map[sec].count++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);
  const section = sections.length > 1 ? activeSection : null;

  const shown = useMemo(() => {
    if (data.state !== 'ok') return [];
    const { details, users } = data;
    let list = section ? data.mentees.filter(m => (m.sectionCode || '—') === section) : data.mentees;
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(m => {
        const email = (users[m.menteeUserID]?.email || '').toLowerCase();
        return (m.menteeName || '').toLowerCase().includes(query) || (m.course || '').toLowerCase().includes(query) || email.includes(query);
      });
    }
    // Group by section, then use stored surnames (including compound surnames).
    const nameKey = m => {
      const user = users[m.menteeUserID] || {}, detail = details[m.menteeUserID] || {};
      return [user.lastName || detail.lastName || m.menteeLastName || '',
        user.firstName || detail.firstName || m.menteeFirstName || m.menteeName || ''].join(' ').trim();
    };
    const byName = (a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' });
    // A–Z / Z–A follow the name as shown on the card.
    const byDisplayName = (a, b) => (a.menteeName || '').localeCompare(b.menteeName || '', undefined, { sensitivity: 'base' });
    const bySection = (a, b) => (a.sectionCode || '').localeCompare(b.sectionCode || '', undefined, { numeric: true, sensitivity: 'base' });
    const bySchool = (a, b) => (a.school || '').localeCompare(b.school || '', undefined, { sensitivity: 'base' });
    const byId = (a, b) => Number(a.menteeUserID) - Number(b.menteeUserID);
    const comparators = {
      section: [bySection, byName, byId],
      az: [byDisplayName, byId],
      za: [(a, b) => byDisplayName(b, a), byId],
      school: [bySchool, byName, byId],
    };
    const cmps = comparators[sortMode] || comparators.section;
    return [...list].sort((a, b) => {
      for (const c of cmps) { const r = c(a, b); if (r) return r; }
      return 0;
    });
  }, [data, section, q, sortMode]);

  let grid;
  if (data.state === 'loading') {
    grid = <Empty className="mentees-empty"><span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2.5px', display: 'block', margin: '0 auto 12px' }}></span>Loading...</Empty>;
  } else if (data.state === 'error') {
    grid = <Empty key="error" className="mentees-empty"><i className="ti ti-alert-circle"></i>Failed to load mentees. Please refresh.</Empty>;
  } else if (!shown.length) {
    grid = <Empty key="none" className="mentees-empty"><i className="ti ti-users-off"></i>No mentees found.</Empty>;
  } else {
    grid = shown.map(m => <MenteeCard key={m.menteeUserID} m={m} data={data} />);
  }

  return (
    <Page id="MENTOR/my-mentees">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>My Mentees</h1>
            {' '}
            <p id="menteeSubtitle">{data.count == null ? 'Loading your assigned mentees...' : `${data.count} mentee${data.count !== 1 ? 's' : ''} assigned to you`}</p>
          </div>
          {' '}
          {/* Section filter cards — shown only for a mentor with more than one section. */}
          <div id="sectionCards" className="section-cards-grid" style={sections.length > 1 ? undefined : { display: 'none' }}>
            {sections.length > 1 && sections.map(([sec, info]) => (
              <div key={sec} className={'section-card' + (section === sec ? ' active' : '')} onClick={() => setActiveSection(a => a === sec ? null : sec)}>
                <div className="sc-top"><i className="ti ti-users"></i></div>
                {' '}
                <div className="sc-section">{sec}</div>
                {' '}
                <div className="sc-count">{info.count} mentee{info.count !== 1 ? 's' : ''}</div>
                {' '}
                {info.course && <div className="sc-course">{info.course}</div>}
              </div>
            ))}
          </div>
          {' '}
          {/* Mentee List */}
          <div id="menteeListPanel">
            {/* Search */}
            <div className="toolbar">
              <div className="search-wrap">
                <i className="ti ti-search"></i>
                {' '}
                <input type="text" id="searchInput" placeholder="Search by name or course..." value={q}
                  onChange={e => setQ(e.target.value)} />
              </div>
              {' '}
              <div className="filter-wrap">
                <i className="ti ti-arrows-sort"></i>
                {' '}
                <Select className="mentee-filter" id="sortFilter" aria-label="Sort mentees" value={sortMode} onChange={e => setSortMode(e.target.value)}>
                  <option value="section">Sort: By Section</option>
                  <option value="az">Sort: Name A–Z</option>
                  <option value="za">Sort: Name Z–A</option>
                  <option value="school">Sort: By School</option>
                </Select>
              </div>
            </div>
            {' '}
            {/* Mentee Cards */}
            <div id="menteesGrid" className="mentees-grid">{grid}</div>
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

function MenteeCard({ m, data }) {
  const name = m.menteeName || '—';
  const parts = name.split(' ');
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  const user = data.users[m.menteeUserID] || {};
  const detail = data.details[m.menteeUserID] || {};
  const photoURL = user.photoURL || user.profilePicture || null;
  const studentNo = user.studentNumber || null;
  const isDropOut = detail.isDropOut || false;
  return (
    <div className={'mentee-card' + (isDropOut ? ' is-dropout' : '')}>
      <div className="mc-identity">
        <div className="mc-avatar">{photoURL ? <img src={photoURL} alt={name} /> : initials}</div>
        {' '}
        <div className="mc-name-block">
          <div className="mc-name">{name}</div>
          {' '}
          <div className="mc-email">{user.email || '—'}</div>
          {' '}
          <div className="mc-role-badge">Mentee</div>
        </div>
      </div>
      {' '}
      <div className="mc-body">
        <div className="mc-chips">
          <span className="mc-chip course">{m.course || '—'}</span>
          {' '}
          <span className="mc-chip">{m.yearLevel || '—'}</span>
          {' '}
          <span className="mc-chip section">{m.sectionCode || '—'}</span>
          {' '}
          {isDropOut && <span className="mc-chip dropout-chip">Drop Out</span>}
        </div>
        {' '}
        <div className="mc-info-row">
          <i className="ti ti-building"></i>
          {' '}
          <span>{m.departmentName || detail.departmentName || '—'} &middot; {m.school || '—'}</span>
        </div>
        {' '}
        <div className="mc-info-row">
          <i className="ti ti-phone"></i>
          {' '}
          <span>{user.contactNumber || 'N/A'}</span>
        </div>
        {' '}
        <div className="mc-bottom-row">
          {studentNo
            ? <span className="mc-student-no"><i className="ti ti-id-badge"></i>{studentNo}</span>
            : <span className="mc-student-no no-id">No student number</span>}
          {' '}
          <span className="mc-school-year">{data.schoolYearLabel}</span>
        </div>
      </div>
    </div>
  );
}
