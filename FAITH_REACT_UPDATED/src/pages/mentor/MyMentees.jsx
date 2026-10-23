import { useEffect, useMemo, useState } from 'react';
import Page from '../../app/Page.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';
import { sampleHtml, useTour } from '../../app/tour.js';
import { MENTOR_SAMPLE as SM } from '../../app/tourMentor.js';

// MENTOR/HTML/my-mentees.html + MENTOR/JS/my-mentees.js

// "Flag a mentee": a serious written report that goes straight to the Admin and Head Admin (their bell, top right).
const CONCERN_CATEGORIES = ['Attendance', 'Academic performance', 'Behavior or conduct', 'Personal or welfare', 'Safety', 'Other'];
const CONCERN_MIN = 10, CONCERN_MAX = 1000;

function ConcernModal({ target, onClose }) {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = !!target;
  useEffect(() => { if (open) { setCategory(''); setMessage(''); setUnderstood(false); setBusy(false); setError(''); } }, [target]);

  const trimmed = message.trim();
  const valid = !!category && trimmed.length >= CONCERN_MIN && trimmed.length <= CONCERN_MAX && understood;

  async function send() {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      await apiRequest('MenteeConcerns', 'POST', { menteeId: target.id, category, message: trimmed }, true);
      showToast('Your concern was sent to the Admin and Head Admin.', 'success');
      onClose();
    } catch (e) {
      setError(e.message || 'Could not send the concern. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Overlay open={open} className="concern-overlay" activeClass={null} display="flex" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="concern-modal" role="alertdialog" aria-modal="true" aria-labelledby="concernTitle">
        <div className="concern-head">
          <div className="concern-head-icon"><i className="ti ti-alert-triangle"></i></div>
          <div className="concern-head-text">
            <div className="concern-title" id="concernTitle">Report a concern</div>
            <div className="concern-sub">About <strong>{target?.name}</strong></div>
          </div>
          <button type="button" className="concern-close" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>
        <div className="concern-body">
          <div className="concern-warning">
            <i className="ti ti-shield-exclamation"></i>
            <span><strong>This is a serious report.</strong> It goes straight to the Admin and Head Admin, who will see your name, the mentee's name and everything you write. Use it for welfare, safety, repeated absences or conduct. For normal progress notes, use the Logsheet.</span>
          </div>
          <label className="concern-label" htmlFor="concernCategory">What is this about?</label>
          <Select id="concernCategory" className="concern-select" value={category} onChange={e => setCategory(e.target.value)} disabled={busy}>
            <option value="">Choose a category…</option>
            {CONCERN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <label className="concern-label" htmlFor="concernMessage">Describe your concern</label>
          <textarea id="concernMessage" className="concern-text" rows={6} maxLength={CONCERN_MAX} disabled={busy}
            placeholder="What happened or what have you noticed? Include dates, what the mentee said or did, and what you have already tried."
            value={message} onChange={e => setMessage(e.target.value)}></textarea>
          <div className={`concern-count${trimmed.length > 0 && trimmed.length < CONCERN_MIN ? ' short' : ''}`}>
            {trimmed.length < CONCERN_MIN ? `At least ${CONCERN_MIN} characters · ` : ''}{message.length}/{CONCERN_MAX}
          </div>
          <label className="concern-check">
            <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} disabled={busy} />
            <span>I understand this will be seen by the Admin and Head Admin.</span>
          </label>
          {error ? <div className="concern-error" role="alert">{error}</div> : null}
        </div>
        <div className="concern-foot">
          <button type="button" className="concern-btn concern-btn-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="concern-btn concern-btn-send" onClick={send} disabled={!valid || busy}>
            <i className="ti ti-send"></i> {busy ? 'Sending…' : 'Send to Admin & Head'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export default function MyMentees() {
  useBackGuard();
  const wt = useTour().active;   // walkthrough: show sample data
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
  const [concernTarget, setConcernTarget] = useState(null);   // { id, name } of the mentee being flagged

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
          <button type="button" className="mc-flag-btn" title="Report a concern to the Admin and Head Admin" aria-label={`Report a concern about ${name}`}
            onClick={() => setConcernTarget({ id: m.menteeUserID, name })}><i className="ti ti-flag"></i></button>
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
            <p id="menteeSubtitle">{wt ? SM.mentees.subtitle : subtitle}</p>
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

            <div id="menteesGrid" className="mentees-grid" key={wt ? 'wt' : 'real'} dangerouslySetInnerHTML={sampleHtml(wt, SM.mentees.grid)}>{wt ? undefined : grid}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      <ConcernModal target={concernTarget} onClose={() => setConcernTarget(null)} />
    </Page>
  );
}
