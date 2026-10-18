/* ============================================================
   ASTRA MENTOR — my-mentees.js
   ============================================================ */

let allMentees      = [];
let currentUser     = null;
let menteeDetails   = {};  // menteeUserID → MenteeWithDeptDto
let userCache       = {};  // menteeUserID → Users/{id} response
let schoolYearLabel = '—';

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  currentUser = getSession().user;
  await loadMentees();

  document.getElementById('searchInput').addEventListener('input', applySearch);
  document.getElementById('sortFilter').addEventListener('change', applySearch);
});


// ── LOAD ──────────────────────────────────────────────────────
async function loadMentees() {
  const mentorId = currentUser?.userID;

  try {
    const [assignments, menteesWithDept, settings] = await Promise.all([
      apiRequest('Users/assignments', 'GET', null, true),
      apiRequest('Users/mentees-with-dept', 'GET', null, true),
      apiRequest('Settings', 'GET', null, true).catch(() => null),
    ]);

    if (settings) {
      const semester   = settings.Semester   || settings.semester   || '1st Semester';
      const schoolYear = settings.SchoolYear || settings.schoolYear || '—';
      schoolYearLabel  = `SY ${schoolYear} · ${semester}`;
    }

    (menteesWithDept || []).forEach(m => { menteeDetails[m.userID] = m; });

    const mine = (assignments || [])
      .filter(a => a.mentorUserID === mentorId)
      .map(a => {
        const detail = menteeDetails[a.menteeUserID] || {};
        return {
          ...a,
          sectionCode: detail.sectionCode || detail.section || '—',
          school:      detail.school || a.menteeSchool || '—',
        };
      });

    document.getElementById('menteeSubtitle').textContent =
      `${mine.length} mentee${mine.length !== 1 ? 's' : ''} assigned to you`;

    // Pre-fetch all user details in parallel so cards show complete info
    const userResults = await Promise.allSettled(
      mine.map(a => apiRequest(`Users/${a.menteeUserID}`, 'GET', null, true))
    );
    mine.forEach((a, i) => {
      if (userResults[i].status === 'fulfilled') {
        userCache[a.menteeUserID] = userResults[i].value;
      }
    });

    allMentees = mine;
    renderSectionCards(allMentees);
    renderCards(allMentees);
  } catch (e) {
    console.error('Failed to load mentees:', e);
    document.getElementById('menteesGrid').innerHTML =
      '<div class="mentees-empty"><i class="ti ti-alert-circle"></i>Failed to load mentees. Please refresh.</div>';
  }
}

// ── RENDER CARDS ──────────────────────────────────────────────
function renderCards(mentees) {
  const grid = document.getElementById('menteesGrid');

  // Group by section, then use stored surnames (including compound surnames).
  const nameKey = m => {
    const user = userCache[m.menteeUserID] || {};
    const detail = menteeDetails[m.menteeUserID] || {};
    return [user.lastName || detail.lastName || m.menteeLastName || '',
      user.firstName || detail.firstName || m.menteeFirstName || m.menteeName || ''].join(' ').trim();
  };
  const sortMode = document.getElementById('sortFilter')?.value || 'section';
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

  if (!mentees.length) {
    grid.innerHTML = '<div class="mentees-empty"><i class="ti ti-users-off"></i>No mentees found.</div>';
    return;
  }

  grid.innerHTML = mentees.map(m => {
    const name     = m.menteeName || '—';
    const parts    = name.split(' ');
    const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';

    const user       = userCache[m.menteeUserID] || {};
    const email      = user.email         || '—';
    const contact    = user.contactNumber || 'N/A';
    const studentNo  = user.studentNumber || null;
    const photoURL   = user.photoURL || user.profilePicture || null;
    const avatarHtml = photoURL
      ? `<img src="${photoURL}" alt="${name}" />`
      : initials;

    const detail    = menteeDetails[m.menteeUserID] || {};
    const course    = m.course       || '—';
    const year      = m.yearLevel    || '—';
    const section   = m.sectionCode  || '—';
    const dept      = m.departmentName || detail.departmentName || '—';
    const school    = m.school       || '—';
    const isDropOut = detail.isDropOut || false;
    const safeName  = name.replace(/'/g, "\\'");

    return `
      <div class="mentee-card${isDropOut ? ' is-dropout' : ''}">
        <div class="mc-identity">
          <div class="mc-avatar">${avatarHtml}</div>
          <div class="mc-name-block">
            <div class="mc-name">${name}</div>
            <div class="mc-email">${email}</div>
            <div class="mc-role-badge">Mentee</div>
          </div>
        </div>
        <div class="mc-body">
          <div class="mc-chips">
            <span class="mc-chip course">${course}</span>
            <span class="mc-chip">${year}</span>
            <span class="mc-chip section">${section}</span>
            ${isDropOut ? '<span class="mc-chip dropout-chip">Drop Out</span>' : ''}
          </div>
          <div class="mc-info-row">
            <i class="ti ti-building"></i>
            <span>${dept} &middot; ${school}</span>
          </div>
          <div class="mc-info-row">
            <i class="ti ti-phone"></i>
            <span>${contact}</span>
          </div>
          <div class="mc-bottom-row">
            ${studentNo
              ? `<span class="mc-student-no"><i class="ti ti-id-badge"></i>${studentNo}</span>`
              : `<span class="mc-student-no no-id">No student number</span>`}
            <span class="mc-school-year">${schoolYearLabel}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── SECTION CARDS ─────────────────────────────────────────────
// A mentor handling more than one section gets a row of clickable
// filter cards here — same pattern as User Management's Sections tab
// school-overview cards (click to highlight + filter in place, click
// again to clear). No separate "drill in" view or back button: the
// mentee list below just updates immediately. A single-section mentor
// never needed this choice, so the row stays hidden for them.
let activeSectionFilter = null;

function renderSectionCards(mentees) {
  const container = document.getElementById('sectionCards');

  const sectionMap = {};
  mentees.forEach(m => {
    const sec = m.sectionCode || '—';
    if (!sectionMap[sec]) sectionMap[sec] = { count: 0, course: m.course || '' };
    sectionMap[sec].count++;
  });
  const sections = Object.entries(sectionMap).sort(([a], [b]) => a.localeCompare(b));

  if (sections.length <= 1) {
    container.style.display = 'none';
    container.innerHTML = '';
    activeSectionFilter = null;
    return;
  }

  container.style.display = '';
  container.innerHTML = sections.map(([section, info]) => `
    <div class="section-card${activeSectionFilter === section ? ' active' : ''}" onclick="filterBySection('${section}')">
      <div class="sc-top"><i class="ti ti-users"></i></div>
      <div class="sc-section">${section}</div>
      <div class="sc-count">${info.count} mentee${info.count !== 1 ? 's' : ''}</div>
      ${info.course ? `<div class="sc-course">${info.course}</div>` : ''}
    </div>
  `).join('');
}

function filterBySection(section) {
  activeSectionFilter = activeSectionFilter === section ? null : section;
  document.querySelectorAll('.section-card').forEach(c => c.classList.remove('active'));
  if (activeSectionFilter) {
    [...document.querySelectorAll('.section-card')]
      .find(c => c.querySelector('.sc-section')?.textContent === activeSectionFilter)
      ?.classList.add('active');
  }
  applySearch();
}

// ── SEARCH ────────────────────────────────────────────────────
function applySearch() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();

  let filtered = activeSectionFilter
    ? allMentees.filter(m => (m.sectionCode || '—') === activeSectionFilter)
    : allMentees;


  if (q) {
    filtered = filtered.filter(m => {
      const name   = (m.menteeName || '').toLowerCase();
      const course = (m.course     || '').toLowerCase();
      const user   = userCache[m.menteeUserID] || {};
      const email  = (user.email   || '').toLowerCase();
      return name.includes(q) || course.includes(q) || email.includes(q);
    });
  }

  renderCards(filtered);
}
