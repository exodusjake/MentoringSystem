import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// MENTOR/HTML/my-mentees.html + MENTOR/JS/my-mentees.js

export default function MyMentees() {
  useBackGuard();
  const mentorId = getSession()?.user?.userID;

  const [state, setState] = useState('loading');        // 'loading' | 'ready' | 'failed'
  const [allMentees, setAllMentees] = useState([]);
  const [menteeDetails, setMenteeDetails] = useState({});   // menteeUserID → MenteeWithDeptDto
  const [userCache, setUserCache] = useState({});           // menteeUserID → Users/{id} response
  const [schoolYearLabel, setSchoolYearLabel] = useState('—');
  const [subtitle, setSubtitle] = useState('Loading your assigned mentees...');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('section');
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [assignments, menteesWithDept, settings] = await Promise.all([
          apiRequest('Users/assignments', 'GET', null, true),
          apiRequest('Users/mentees-with-dept', 'GET', null, true),
          apiRequest('Settings', 'GET', null, true).catch(() => null),
        ]);

        if (settings) {
          const semester   = settings.Semester   || settings.semester   || '1st Semester';
          const schoolYear = settings.SchoolYear || settings.schoolYear || '—';
          setSchoolYearLabel(`SY ${schoolYear} · ${semester}`);
        }

        const details = {};
        (menteesWithDept || []).forEach(m => { details[m.userID] = m; });

        const mine = (assignments || [])
          .filter(a => a.mentorUserID === mentorId)
          .map(a => {
            const detail = details[a.menteeUserID] || {};
            return {
              ...a,
              sectionCode: detail.sectionCode || detail.section || '—',
              school:      detail.school || a.menteeSchool || '—',
            };
          });

        setSubtitle(`${mine.length} mentee${mine.length !== 1 ? 's' : ''} assigned to you`);

        // Pre-fetch all user details in parallel so cards show complete info
        const userResults = await Promise.allSettled(
          mine.map(a => apiRequest(`Users/${a.menteeUserID}`, 'GET', null, true))
        );
        const users = {};
        mine.forEach((a, i) => {
          if (userResults[i].status === 'fulfilled') users[a.menteeUserID] = userResults[i].value;
        });

        setMenteeDetails(details);
        setUserCache(users);
        setAllMentees(mine);
        setState('ready');
      } catch (e) {
        console.error('Failed to load mentees:', e);
        setState('failed');
      }
    })();
  }, []);

  // A mentor handling more than one section gets a row of clickable filter cards (click to highlight +
  // filter in place, click again to clear). A single-section mentor never needed this choice.
  const sections = useMemo(() => {
    const sectionMap = {};
    allMentees.forEach(m => {
      const sec = m.sectionCode || '—';
      if (!sectionMap[sec]) sectionMap[sec] = { count: 0, course: m.course || '' };
      sectionMap[sec].count++;
    });
    return Object.entries(sectionMap).sort(([a], [b]) => a.localeCompare(b));
  }, [allMentees]);
  const showSections = sections.length > 1;
  const effSection = showSections ? activeSection : null;

  // ── filter + sort ──
  const q = search.trim().toLowerCase();
  let mentees = effSection ? allMentees.filter(m => (m.sectionCode || '—') === effSection) : allMentees;
  if (q) {
    mentees = mentees.filter(m => {
      const name   = (m.menteeName || '').toLowerCase();
      const course = (m.course     || '').toLowerCase();
      const user   = userCache[m.menteeUserID] || {};
      const email  = (user.email   || '').toLowerCase();
      return name.includes(q) || course.includes(q) || email.includes(q);
    });
  }

  // Group by section, then use stored surnames (including compound surnames).
  const nameKey = m => {
    const user = userCache[m.menteeUserID] || {};
    const detail = menteeDetails[m.menteeUserID] || {};
    return [user.lastName || detail.lastName || m.menteeLastName || '',
      user.firstName || detail.firstName || m.menteeFirstName || m.menteeName || ''].join(' ').trim();
  };
  const byName   = (a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' });
  // A–Z / Z–A follow the name as shown on the card.
  const byDisplayName = (a, b) => (a.menteeName || '').localeCompare(b.menteeName || '', undefined, { sensitivity: 'base' });
  const bySection = (a, b) => (a.sectionCode || '').localeCompare(b.sectionCode || '', undefined, { numeric: true, sensitivity: 'base' });
  const bySchool  = (a, b) => (a.school || '').localeCompare(b.school || '', undefined, { sensitivity: 'base' });
  const byId      = (a, b) => Number(a.menteeUserID) - Number(b.menteeUserID);
  const comparators = {
    section: [bySection, byName, byId],
    az:      [byDisplayName, byId],
    za:      [(a, b) => byDisplayName(b, a), byId],
    school:  [bySchool, byName, byId],
  };
  const cmps = comparators[sortMode] || comparators.section;
  mentees = [...mentees].sort((a, b) => {
    for (const c of cmps) { const r = c(a, b); if (r) return r; }
    return 0;
  });

  let grid;
  if (state === 'loading') {
    grid = <div className="mentees-empty"><span className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2.5px', display: 'block', margin: '0 auto 12px' }}></span>Loading...</div>;
  } else if (state === 'failed') {
    grid = <div className="mentees-empty"><i className="ti ti-alert-circle"></i>Failed to load mentees. Please refresh.</div>;
  } else if (!mentees.length) {
    grid = <div className="mentees-empty"><i className="ti ti-users-off"></i>No mentees found.</div>;
  } else {
    grid = mentees.map(m => {
      const name     = m.menteeName || '—';
      const parts    = name.split(' ');
      const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';

      const user       = userCache[m.menteeUserID] || {};
      const email      = user.email         || '—';
      const contact    = user.contactNumber || 'N/A';
      const studentNo  = user.studentNumber || null;
      const photoURL   = user.photoURL || user.profilePicture || null;

      const detail    = menteeDetails[m.menteeUserID] || {};
      const course    = m.course       || '—';
      const year      = m.yearLevel    || '—';
      const section   = m.sectionCode  || '—';
      const dept      = m.departmentName || detail.departmentName || '—';
      const school    = m.school       || '—';
      const isDropOut = detail.isDropOut || false;

      return (
        <div className={`mentee-card${isDropOut ? ' is-dropout' : ''}`} key={m.assignmentID ?? m.menteeUserID}>
          <div className="mc-identity">
            <div className="mc-avatar">{photoURL ? <img src={photoURL} alt={name} /> : initials}</div>
            <div className="mc-name-block">
              <div className="mc-name">{name}</div>
              <div className="mc-email">{email}</div>
              <div className="mc-role-badge">Mentee</div>
            </div>
          </div>
          <div className="mc-body">
            <div className="mc-chips">
              <span className="mc-chip course">{course}</span>
              <span className="mc-chip">{year}</span>
              <span className="mc-chip section">{section}</span>
              {isDropOut ? <span className="mc-chip dropout-chip">Drop Out</span> : null}
            </div>
            <div className="mc-info-row">
              <i className="ti ti-building"></i>
              <span>{dept} &middot; {school}</span>
            </div>
            <div className="mc-info-row">
              <i className="ti ti-phone"></i>
              <span>{contact}</span>
            </div>
            <div className="mc-bottom-row">
              {studentNo
                ? <span className="mc-student-no"><i className="ti ti-id-badge"></i>{studentNo}</span>
                : <span className="mc-student-no no-id">No student number</span>}
              <span className="mc-school-year">{schoolYearLabel}</span>
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <Page id="MENTOR/my-mentees">
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <h1>My Mentees</h1>
            <p id="menteeSubtitle">{subtitle}</p>
          </div>

          {/* Section filter cards — shown only for a mentor with more than one section. */}
          <div id="sectionCards" className="section-cards-grid" style={{ display: showSections ? '' : 'none' }}>
            {showSections ? sections.map(([section, info]) => (
              <div className={`section-card${effSection === section ? ' active' : ''}`} key={section}
                onClick={() => setActiveSection(cur => (cur === section ? null : section))}>
                <div className="sc-top"><i className="ti ti-users"></i></div>
                <div className="sc-section">{section}</div>
                <div className="sc-count">{info.count} mentee{info.count !== 1 ? 's' : ''}</div>
                {info.course ? <div className="sc-course">{info.course}</div> : null}
              </div>
            )) : null}
          </div>

          <div id="menteeListPanel">
            <div className="toolbar">
              <div className="search-wrap">
                <i className="ti ti-search"></i>
                <input type="text" id="searchInput" placeholder="Search by name or course..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="filter-wrap">
                <i className="ti ti-arrows-sort"></i>
                <Select className="mentee-filter" id="sortFilter" aria-label="Sort mentees" value={sortMode} onChange={e => setSortMode(e.target.value)}>
                  <option value="section">Sort: By Section</option>
                  <option value="az">Sort: Name A–Z</option>
                  <option value="za">Sort: Name Z–A</option>
                  <option value="school">Sort: By School</option>
                </Select>
              </div>
            </div>

            <div id="menteesGrid" className="mentees-grid">{grid}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
    </Page>
  );
}
