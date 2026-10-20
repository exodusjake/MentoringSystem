const ROW_CHOICES = [5, 10, 25];
function loadRowsSetting(key) {
  try { const n = parseInt(localStorage.getItem(key), 10); return ROW_CHOICES.includes(n) ? n : 5; } catch (e) { return 5; }
}
let ROWS_PER_PAGE = loadRowsSetting('um_rows_users');

const SCHOOL_COURSES = {
  'School of Technology': [
    { group: 'College of Engineering',                          courses: ['BSECE', 'BSEE', 'BSCPE', 'BSIE'] },
    { group: 'College of Computing and Information Technology', courses: ['BSCS', 'BSIT', 'BSEMC'] },
  ],
  'School of Management': [
    { group: 'College of Business, Management and Accountancy', courses: ['BSA', 'BSMA', 'BSENTREP', 'BSBA-MM', 'BSE'] },
    { group: 'College of Tourism and Hospitality Management',   courses: ['BSHM', 'BSTM'] },
  ],
  'School of Humanities': [
    { group: 'College of Arts, Science and Education', courses: ['BAC', 'BEEd', 'BSE-Eng', 'BSE-Math', 'BPE', 'BSESS'] },
    { group: 'College of Health Care',                 courses: ['BSN', 'BSMLS', 'BSP'] },
    { group: 'College of Criminal Justice',            courses: ['BSCRIM', 'BFS'] },
  ],
};

function populateCourseSelect(selectEl, school) {
  selectEl.innerHTML = '<option value="" disabled selected>Choose course...</option>';
  (SCHOOL_COURSES[school] || []).forEach(({ group, courses }) => {
    const og = document.createElement('optgroup');
    og.label = group;
    courses.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      og.appendChild(o);
    });
    selectEl.appendChild(og);
  });
}

function toggleUMPassword() {
  const input    = document.getElementById('fieldPassword');
  const eyeShow  = document.getElementById('umEyeShow');
  const eyeHide  = document.getElementById('umEyeHide');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  eyeShow.classList.toggle('eye-hidden',  isHidden);
  eyeHide.classList.toggle('eye-hidden', !isHidden);
}
let currentPage        = 1;
let editingId          = null;
let allUsers           = [];
let allMentors         = [];
let allMentorsWithDept = [];
let allMenteesWithDept = [];
let allDepartments     = [];
let allSections        = [];
// UserID -> Set of "SchoolYear|Semester" keys the account was Active
// during (see Settings/period-history — a snapshot taken whenever Admin
// changes System Settings' SchoolYear/Semester to a new value). The
// CURRENT period is never in here; it's just whoever is Active right now.
let periodHistoryByUser = new Map();
let systemSettings     = { SchoolYear: '2026-2027', Semester: '1st Semester' };

// Sections tab state
let sectionMentorView  = [];
let expandedMentors    = new Set();
let activeSectionFilter = {};
let sectionsTabLoaded  = false;
let _importRows        = [];

let ASSIGNMENTS_PER_PAGE = loadRowsSetting('um_rows_assign');
let assignmentPage      = 1;
let allAssignments      = [];
let filteredAssignments = [];
let selectedUserIds     = new Set();
let dashboardEngagementFilter = '';
let dashboardEngagementByUser = new Map();

// ── TAB SWITCHING ──
let tabSwitchToken = 0;
const TAB_NAMES = ['users', 'assignments', 'sections'];

// Sliding highlight behind the active tab.
function updateTabPill(animate = true) {
  const bar = document.querySelector('.um-tabs');
  const btn = document.querySelector('.um-tab.active');
  if (!bar || !btn) return;
  let pill = bar.querySelector('.um-tab-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'um-tab-pill';
    bar.insertBefore(pill, bar.firstChild);
    bar.classList.add('has-pill');
    animate = false;
  }
  pill.style.transition = animate ? '' : 'none';
  pill.style.width = btn.offsetWidth + 'px';
  pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
  // Keep the active tab visible when the bar scrolls sideways on small screens.
  const left = btn.offsetLeft - 12, right = btn.offsetLeft + btn.offsetWidth + 12;
  if (left < bar.scrollLeft) bar.scrollTo({ left, behavior: 'smooth' });
  else if (right > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: right - bar.clientWidth, behavior: 'smooth' });
}

function switchTab(tab) {
  const nextPanel = document.getElementById('tab-' + tab);
  const current = TAB_NAMES.map(t => document.getElementById('tab-' + t)).find(p => p && p.style.display !== 'none');
  TAB_NAMES.forEach(t => document.getElementById('tab-btn-' + t).classList.toggle('active', t === tab));
  updateTabPill();

  if (tab === 'sections' && !sectionsTabLoaded) {
    sectionsTabLoaded = true;
    fetchSectionMentorView();
  }
  if (current === nextPanel) return;

  const token = ++tabSwitchToken;
  const show = () => {
    if (token !== tabSwitchToken) return;
    TAB_NAMES.forEach(t => {
      const p = document.getElementById('tab-' + t);
      p.classList.remove('tab-leave', 'tab-enter');
      p.style.display = t === tab ? '' : 'none';
    });
    nextPanel.classList.add('tab-enter');
  };
  if (current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    current.classList.add('tab-leave');       // fade the old panel out…
    setTimeout(show, 140);                    // …then bring the new one in
  } else {
    show();
  }
}

// ── GET SCHOOL FOR A USER ──
// Mentor/Mentee: '—' means the data is missing (should have a school but
// doesn't). Admin/Head: 'N/A' means the concept doesn't apply to that role
// at all — kept distinct so the two don't read as the same kind of gap.
function getUserDept(u) {
  if (u.role === 'Mentor') {
    const m = allMentorsWithDept.find(m => m.userID === u.userID);
    return m?.school || '—';
  }
  if (u.role === 'Mentee') {
    const m = allMenteesWithDept.find(m => m.userID === u.userID);
    return m?.school || '—';
  }
  return 'N/A';
}

// Table cell: school on top, department (mentor) or course (mentee) below.
// A department with no school (SAS) reads "School Department".
function schoolDeptCell(u) {
  if (u.role !== 'Mentor' && u.role !== 'Mentee') return 'N/A';
  const school = getUserSchool(u);
  const sub = u.role === 'Mentor'
    ? getUserDeptName(u)
    : allMenteesWithDept.find(m => m.userID === u.userID)?.course || null;
  const top = school !== '—' ? school : (u.role === 'Mentor' && sub ? 'School Department' : '—');
  return `<div class="user-name-cell"><div>${escapeHtml(top)}</div>${sub ? `<div class="u-id">${escapeHtml(sub)}</div>` : ''}</div>`;
}

// Read-only mentee profile opened from the Courses tab.
function openMenteeProfile(userId) {
  const u = allUsers.find(x => x.userID === userId);
  if (!u) return;
  const m = allMenteesWithDept.find(x => x.userID === userId) || {};
  const a = allAssignments.find(x => x.menteeUserID === userId && x.isActive);
  const status = getUserStatus(u);
  const rows = [
    ['ID Number', u.studentNumber],
    ['Email', u.email],
    ['Contact Number', u.contactNumber],
    ['Gender', u.gender],
    ['School', m.school],
    ['Course', m.course],
    ['Department', getUserDeptName(u)],
    ['Year Level', m.yearLevel],
    ['Mentor', a?.mentorName],
    ['Status', status.label === 'Inactive' ? 'Deactivated' : status.label],
    ['E-Signature', m.signatureFilePath ? 'Uploaded' : 'Missing'],
  ];
  document.getElementById('menteeProfileName').textContent = `${u.firstName} ${u.lastName}`;
  document.getElementById('menteeProfileBody').innerHTML = rows.map(([label, value]) =>
    `<div class="vp-label">${label}</div><div class="vp-value">${escapeHtml(value || '—')}</div>`).join('');
  document.getElementById('menteeProfileModal').classList.add('active');
}

function closeMenteeProfile() {
  document.getElementById('menteeProfileModal').classList.remove('active');
}

function getDeptClass(school) {
  if (!school) return '';
  const s = school.toLowerCase();
  if (s.includes('technology')) return 'dept-technology';
  if (s.includes('humanities')) return 'dept-humanities';
  if (s.includes('management')) return 'dept-management';
  return '';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showErrorModal(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorModal').style.display = 'flex';
}
// Success shows as a corner alert that closes by itself.
function showStatusSuccess(title, message) {
  showToast(message, 'success');
  const body = [...document.querySelectorAll('#nf-toast-stack .nf-toast-body')].pop();
  if (!body) return;
  const heading = document.createElement('strong');
  heading.textContent = title;
  heading.style.display = 'block';
  body.prepend(heading);
}
function hideErrorModal() {
  document.getElementById('errorModal').style.display = 'none';
}

// Disables the button and its sibling buttons while fn runs.
async function runBusy(btn, busyText, fn) {
  const group = btn ? [...btn.parentElement.querySelectorAll('button')] : [];
  const label = btn?.textContent;
  group.forEach(b => b.disabled = true);
  if (btn) btn.textContent = busyText;
  try { return await fn(); }
  finally {
    group.forEach(b => b.disabled = false);
    if (btn) btn.textContent = label;
  }
}

// "Are you sure?" step; the modal stays open with busyText until action finishes.
function confirmAction({ title, message, confirmText, busyText = 'Saving…', action }) {
  document.getElementById('umConfirmTitle').textContent = title;
  document.getElementById('umConfirmMsg').innerHTML = message;
  const ok = document.getElementById('umConfirmOk');
  const modal = document.getElementById('umConfirmModal');
  ok.textContent = confirmText;
  ok.onclick = async () => {
    await runBusy(ok, busyText, action);
    modal.style.display = 'none';
  };
  document.getElementById('umConfirmCancel').onclick = () => { modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

function friendlyError(err) {
  const msg = err?.message || '';
  if (msg.includes('already') || msg.includes('duplicate') || msg.includes('exists'))
                               return 'This email is already in use by another account.';
  if (msg.includes('not found') || msg === 'Error 404') return 'User not found. Please refresh and try again.';
  if (msg === 'Error 401')     return 'You are not authorized. Please log in again.';
  if (msg === 'Error 500')     return 'A server error occurred. Please try again or contact support.';
  return msg || 'Something went wrong. Please try again.';
}

async function fetchSettings() {
  try {
    const data = await apiRequest('Settings', 'GET', null, true);
    if (data) systemSettings = { ...systemSettings, ...data };
  } catch (e) { console.warn('Could not load system settings, using defaults.'); }
  await fetchPeriodHistory();
}

// Builds periodHistoryByUser + populates the School Year filter with every
// past period on record, plus one "Current" option for whoever is Active
// right now (never derived from history — that period hasn't ended yet).
// periodHistoryByUser: userID -> Map(periodKey -> {wasAssigned, wasDropOut}),
// so a past-period selection can show that mentee's status AS IT WAS THEN
// (e.g. "Assigned") instead of their CURRENT status (e.g. "Unassigned"
// after a later year-end reset, or "Drop Out" if they left since).
async function fetchPeriodHistory() {
  try {
    const rows = await apiRequest('Settings/period-history', 'GET', null, true);
    periodHistoryByUser = new Map();
    const periods = [];
    const seen = new Set();
    (rows || []).forEach(r => {
      const key = `${r.schoolYear}|${r.semester}`;
      if (!periodHistoryByUser.has(r.userID)) periodHistoryByUser.set(r.userID, new Map());
      periodHistoryByUser.get(r.userID).set(key, { wasAssigned: r.wasAssigned, wasDropOut: r.wasDropOut });
      if (!seen.has(key)) { seen.add(key); periods.push({ schoolYear: r.schoolYear, semester: r.semester, key }); }
    });
    periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));

    const sel = document.getElementById('schoolYearFilter');
    if (!sel) return;
    const currentKey = `${systemSettings.SchoolYear}|${systemSettings.Semester}`;
    const prevValue = sel.value;
    sel.innerHTML = '<option value="">All School Years</option>' +
      `<option value="__current__">${systemSettings.Semester}, SY ${systemSettings.SchoolYear} (Current)</option>` +
      periods.filter(p => p.key !== currentKey)
        .map(p => `<option value="${p.key}">${p.semester}, SY ${p.schoolYear}</option>`).join('');
    if ([...sel.options].some(o => o.value === prevValue)) sel.value = prevValue;
  } catch (e) { console.warn('Could not load period history.'); }
}

// ── SECTIONS: DATA ──────────────────────────────────────────────────────────
async function fetchSections() {
  try {
    const data = await apiRequest('Sections', 'GET', null, true);
    allSections = data || [];
  } catch (e) { console.error('Error loading sections:', e); }
}

async function fetchSectionMentorView() {
  const container = document.getElementById('sectionMentorList');
  if (container) container.innerHTML = '<div class="empty-state" style="padding:48px 0"><span class="spinner"></span> Loading...</div>';
  try {
    const data = await apiRequest('Sections/mentor-view', 'GET', null, true);
    sectionMentorView = data || [];
    populateSchoolCards();
    applyActiveSchoolCardHighlight();
    renderSectionTab();
  } catch (e) {
    console.error('Error loading mentor view:', e);
    if (container) container.innerHTML = '<div class="empty-state" style="padding:48px 0">Could not load data.</div>';
  }
}

function populateSchoolCards() {
  const schools = ['School of Technology', 'School of Humanities', 'School of Management'];
  const keys    = ['sot', 'soh', 'som'];
  schools.forEach((school, i) => {
    // Mentors = those listed when the card is selected; mentees exclude drop-outs.
    const mentorSet = new Set();
    const menteeSet = new Set();
    sectionMentorView.forEach(r => {
      if (r.menteeID) {
        if ((r.menteeSchool || r.mentorSchool) !== school) return;
        mentorSet.add(r.mentorID);
        if (!isMenteeDropOut(r.menteeID)) menteeSet.add(r.menteeID);
      } else if (r.mentorSchool === school) {
        mentorSet.add(r.mentorID);
      }
    });
    const k = keys[i];
    const mEl = document.getElementById(`${k}-mentors`);
    const eEl = document.getElementById(`${k}-mentees`);
    if (mEl) mEl.textContent = mentorSet.size;
    if (eEl) eEl.textContent = menteeSet.size;
  });
}

function isMenteeDropOut(userId) {
  return !!allMenteesWithDept.find(m => m.userID === userId)?.isDropOut;
}

// No school selected by default, so every mentor is listed; clicking a
// school card filters to it, clicking it again clears the filter.
let activeSchoolFilter = '';

function applyActiveSchoolCardHighlight() {
  document.querySelectorAll('.school-card').forEach(c => c.classList.remove('active'));
  if (activeSchoolFilter) {
    const idx = ['School of Technology','School of Humanities','School of Management'].indexOf(activeSchoolFilter);
    const cards = document.querySelectorAll('.school-card');
    if (cards[idx]) cards[idx].classList.add('active');
  }
}

function filterBySchool(school) {
  activeSchoolFilter = activeSchoolFilter === school ? '' : school;
  applyActiveSchoolCardHighlight();
  const deptFilter = document.getElementById('sectionDeptFilter');
  if (deptFilter) deptFilter.value = '';
  renderSectionTab();
}

// ── SECTIONS: RENDER ACCORDION ───────────────────────────────────────────────
function renderSectionTab() {
  const search = (document.getElementById('sectionSearch')?.value || '').toLowerCase();

  // Group flat rows by mentor
  const mentorMap = {};
  sectionMentorView.forEach(row => {
    if (!mentorMap[row.mentorID]) {
      mentorMap[row.mentorID] = {
        mentorID:      row.mentorID,
        firstName:     row.mentorFirstName,
        lastName:      row.mentorLastName,
        school:        row.mentorSchool,
        departmentName: row.departmentName,
        mentees:       []
      };
    }
    if (row.menteeID) {
      mentorMap[row.mentorID].mentees.push({
        menteeID:     row.menteeID,
        firstName:    row.menteeFirstName,
        lastName:     row.menteeLastName,
        studentNumber: row.studentNumber,
        course:       row.course,
        school:       row.menteeSchool || row.mentorSchool,
        department:   departmentForCourse(row.menteeSchool || row.mentorSchool, row.course),
        isDropOut:    isMenteeDropOut(row.menteeID),
        yearLevel:    row.yearLevel,
        section:      row.section,
        sectionID:    row.sectionID,
        sectionCode:  row.sectionCode
      });
    }
  });

  // School and Department follow the mentees; each mentor shows only the matching mentees.
  // Mentors with no school (e.g. SAS) count under their mentees' schools too, and also have their own Department option.
  let mentors = Object.values(mentorMap).map(m => ({
    ...m,
    shown: activeSchoolFilter ? m.mentees.filter(e => e.school === activeSchoolFilter) : m.mentees
  }));
  if (activeSchoolFilter) {
    mentors = mentors.filter(m => m.shown.length || (!m.mentees.length && m.school === activeSchoolFilter));
  }

  // Course filter: the courses the listed mentors' mentees take, grouped by department,
  // plus no-school departments (e.g. SAS) as "mentor:<name>".
  const deptSelect = document.getElementById('sectionDeptFilter');
  if (deptSelect) {
    const current = deptSelect.value;
    const opt = (value, label) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    const used = new Set(mentors.flatMap(m => m.shown.map(e => normCourse(e.course || e.sectionCode))).filter(Boolean));
    const values = [];
    let html = '';
    (activeSchoolFilter ? [activeSchoolFilter] : ['School of Technology', 'School of Humanities', 'School of Management']).forEach(sc =>
      (SCHOOL_COURSES[sc] || []).forEach(({ group, courses }) => {
        const list = courses.filter(c => used.has(normCourse(c)));
        if (!list.length) return;
        const dept = COLLEGE_DEPARTMENTS[group] || group;
        values.push(...list);
        html += `<optgroup label="${escapeHtml(activeSchoolFilter ? dept : `${dept} · ${sc}`)}">${list.map(c => opt(c, c)).join('')}</optgroup>`;
      }));
    if (!activeSchoolFilter) {
      const noSchoolDepts = [...new Set([
        ...allDepartments.filter(d => !d.school && d.isActive !== false).map(d => d.departmentName),
        ...mentors.filter(m => !m.school).map(m => m.departmentName),
      ].filter(Boolean))].sort();
      values.push(...noSchoolDepts.map(d => 'mentor:' + d));
      if (noSchoolDepts.length) html += `<optgroup label="School Department">${noSchoolDepts.map(d => opt('mentor:' + d, d)).join('')}</optgroup>`;
    }
    deptSelect.innerHTML = '<option value="">All Courses</option>' + html;
    deptSelect.value = values.includes(current) ? current : '';
  }
  const courseFilter = deptSelect?.value || '';
  if (courseFilter.startsWith('mentor:')) {
    mentors = mentors.filter(m => !m.school && m.departmentName === courseFilter.slice(7));
  } else if (courseFilter) {
    mentors = mentors
      .map(m => ({ ...m, shown: m.shown.filter(e => normCourse(e.course || e.sectionCode) === normCourse(courseFilter)) }))
      .filter(m => m.shown.length);
  }

  if (search) {
    mentors = mentors.filter(m => {
      const nameMatch    = `${m.firstName} ${m.lastName}`.toLowerCase().includes(search);
      const sectionMatch = m.shown.some(me => (me.sectionCode || me.course || '').toLowerCase().includes(search));
      const menteeMatch  = m.shown.some(me => `${me.firstName} ${me.lastName}`.toLowerCase().includes(search));
      return nameMatch || sectionMatch || menteeMatch;
    });
  }

  const container = document.getElementById('sectionMentorList');
  if (!container) return;

  if (mentors.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:48px 0">No mentors match the selected filters.</div>';
    return;
  }

  const AVATAR_COLORS = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#f43f5e'];

  container.innerHTML = [...mentors].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  ).map((m, idx) => {
    const initials  = `${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase();
    const color     = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    const expanded  = expandedMentors.has(m.mentorID);
    const activeSec = activeSectionFilter[m.mentorID] || null;

    const sections = [...new Set(m.shown.map(me => me.sectionCode).filter(Boolean))].sort();
    const dropOuts = m.shown.filter(me => me.isDropOut).length;
    const activeCount = m.shown.length - dropOuts;
    const pillsPreview = sections.map(s =>
      `<span class="section-pill-badge">${s}</span>`).join('');

    const filterPills = sections.length > 0 ? `
      <div class="section-filter-pills">
        <button class="section-pill${!activeSec ? ' active' : ''}"
          onclick="setSectionFilter(event,${m.mentorID},null)">All Sections</button>
        ${sections.map(s => `
          <button class="section-pill${activeSec === s ? ' active' : ''}"
            onclick="setSectionFilter(event,${m.mentorID},'${s}')">${s}</button>
        `).join('')}
      </div>` : '';

    const visibleMentees = (activeSec
      ? m.shown.filter(me => me.sectionCode === activeSec)
      : m.shown
    ).slice().sort((a, b) => (a.sectionCode || '').localeCompare(b.sectionCode || '', undefined, { numeric: true, sensitivity: 'base' }) || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

    const MENTEE_COLORS = [
      { bg: '#bbf7d0', text: '#14532d' },
      { bg: '#bfdbfe', text: '#1e3a8a' },
      { bg: '#fde68a', text: '#78350f' },
      { bg: '#fbcfe8', text: '#831843' },
      { bg: '#e9d5ff', text: '#4c1d95' },
      { bg: '#fed7aa', text: '#7c2d12' },
    ];

    const menteeRows = visibleMentees.map((me, mi_i) => {
      const initials = `${me.firstName?.[0] || ''}${me.lastName?.[0] || ''}`.toUpperCase();
      const color    = MENTEE_COLORS[mi_i % MENTEE_COLORS.length];
      const label    = me.sectionCode || me.section || '—';
      return `
        <div class="mentee-row">
          <div class="mentee-avatar" style="background:${color.bg};color:${color.text}">${initials}</div>
          <div class="mentee-info">
            <div class="mentee-name">${escapeHtml(me.firstName)} ${escapeHtml(me.lastName)}${me.isDropOut ? ' <span class="mentee-dropout-tag">Drop Out</span>' : ''}</div>
            <div class="mentee-meta">${escapeHtml(me.studentNumber || '—')} · ${escapeHtml(me.yearLevel || me.course || '—')} · ${escapeHtml(label)}</div>
          </div>
          <button class="mentee-view-btn" onclick="openMenteeProfile(${me.menteeID})" title="View Profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            View Profile
          </button>
        </div>`;
    }).join('');

    return `
      <div class="mentor-accordion-card" id="mentor-accordion-${m.mentorID}">
        <div class="mentor-accordion-header" onclick="toggleMentorCard(${m.mentorID})">
          <div class="mentor-acc-avatar" style="background:${color}">${initials}</div>
          <div class="mentor-info">
            <div class="mentor-name">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</div>
            <div class="mentor-dept">${escapeHtml(m.departmentName || m.school || '—')}</div>
          </div>
          <div class="mentor-section-pills-preview">${pillsPreview}</div>
          <div class="mentor-mentee-count">${activeCount} mentee${activeCount !== 1 ? 's' : ''}${dropOuts ? ` · ${dropOuts} drop out` : ''}</div>
          <svg class="accordion-chevron${expanded ? ' rotated' : ''}" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="mentor-accordion-body" style="display:${expanded ? 'block' : 'none'}">
          ${filterPills}
          <div class="mentor-mentee-list">
            ${menteeRows || '<div class="empty-state" style="padding:20px">No mentees in this section.</div>'}
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleMentorCard(mentorId) {
  const card    = document.getElementById(`mentor-accordion-${mentorId}`);
  const body    = card?.querySelector('.mentor-accordion-body');
  const chevron = card?.querySelector('.accordion-chevron');
  if (!body) return;
  if (expandedMentors.has(mentorId)) {
    expandedMentors.delete(mentorId);
    body.style.display = 'none';
    chevron?.classList.remove('rotated');
  } else {
    expandedMentors.add(mentorId);
    body.style.display = 'block';
    chevron?.classList.add('rotated');
  }
}

function setSectionFilter(event, mentorId, sectionCode) {
  event.stopPropagation();
  activeSectionFilter[mentorId] = sectionCode;
  expandedMentors.add(mentorId);
  renderSectionTab();
}

// ── SECTIONS: MENTEE MODAL DROPDOWN ─────────────────────────────────────────
function onMenteeSchoolChange() {
  loadMenteeMentors();
  loadMenteeCoursesForSchool();
}

function loadMenteeCoursesForSchool() {
  const school        = document.getElementById('fieldMenteeSchool')?.value || '';
  const courseSelect  = document.getElementById('fieldCourse');
  const sectionSelect = document.getElementById('fieldSectionID');
  if (!courseSelect) return;

  if (!school) {
    courseSelect.innerHTML  = '<option value="" disabled selected>Select school first...</option>';
    if (sectionSelect) sectionSelect.innerHTML = '<option value="" disabled selected>Select school first...</option>';
    return;
  }

  populateCourseSelect(courseSelect, school);

  // Reset section
  if (sectionSelect) sectionSelect.innerHTML = '<option value="" disabled selected>Choose course first...</option>';
}

function onMenteeCourseChange() {
  loadMenteeSections();
}

// Some existing Section records predate the current course-code dropdown
// and were saved with spaces (e.g. "BS IT") instead of the compact codes
// the Course dropdown now offers ("BSIT") — compare with spaces/case
// stripped so those older sections still match instead of vanishing from
// the list.
function normCourse(c) {
  return (c || '').toUpperCase().replace(/\s+/g, '');
}

function validSchoolCourse(school,course) {
  if(!school || !normCourse(course))return false;
  const approved=(SCHOOL_COURSES[school]||[]).flatMap(g=>g.courses);
  const custom=allSections.filter(s=>s.school===school && s.isActive!==false).map(s=>s.course);
  return [...approved,...custom].some(c=>normCourse(c)===normCourse(course));
}

// A Course maps to exactly one Section record now (Year+Letter
// sub-division removed system-wide), so this just auto-resolves the
// hidden #fieldSectionID to that single match — never shown as a picker.
function loadMenteeSections() {
  const school     = document.getElementById('fieldMenteeSchool')?.value || '';
  const course     = document.getElementById('fieldCourse')?.value || '';
  const select     = document.getElementById('fieldSectionID');
  if (!select) return;

  if (!course) {
    select.innerHTML = '<option value="" disabled selected>Choose course first...</option>';
    return;
  }

  const match = allSections.find(s => s.school === school && normCourse(s.course) === normCourse(course));
  select.innerHTML = match
    ? `<option value="${match.sectionID}" selected>${match.sectionCode}</option>`
    : '<option value="" disabled selected>No section yet for this course</option>';

}

async function fetchStats() {
  try {
    const data = await apiRequest('Users/stats', 'GET', null, true);
    const mentorCount = allUsers.filter(u => u.role === 'Mentor').length;
    const menteeCount = allUsers.filter(u => u.role === 'Mentee').length;
    document.getElementById('totalUsers').textContent      = data.totalUsers ?? (mentorCount + menteeCount);
    document.getElementById('statMentorCount').textContent = mentorCount;
    document.getElementById('statMenteeCount').textContent = menteeCount;
    document.getElementById('unassignedUsers').textContent = data.unassigned ?? '—';
  } catch (e) { console.error('Error loading stats:', e); }
}

async function fetchDepartments() {
  try {
    const data = await apiRequest('Users/departments', 'GET', null, true);
    allDepartments = data || [];
    const schoolSelect = document.getElementById('fieldMentorSchool');
    if (schoolSelect && allDepartments.some(d => !d.school) && !schoolSelect.querySelector(`option[value="${NO_SCHOOL}"]`))
      schoolSelect.insertAdjacentHTML('beforeend', `<option value="${NO_SCHOOL}">No school (department only)</option>`);
  } catch (e) { console.error('Error loading departments:', e); }
}

// Departments with no school (e.g. SAS) can mentor mentees of any school.
const NO_SCHOOL = '__no_school__';

function mentorSchoolValue() {
  const value = document.getElementById('fieldMentorSchool').value;
  return value === NO_SCHOOL ? null : (value || null);
}

function crossSchoolMentor(mentor) {
  return !mentor.school && allDepartments.some(d => d.departmentID === mentor.departmentID && !d.school && d.isActive !== false);
}

function loadMentorDepts() {
  const school = document.getElementById('fieldMentorSchool').value;
  const select = document.getElementById('fieldMentorDept');
  const depts  = allDepartments.filter(d => (school === NO_SCHOOL ? !d.school : d.school === school) && d.departmentName !== school);
  select.innerHTML = '<option value="" disabled selected>Select department...</option>';
  depts.forEach(d => {
    select.innerHTML += `<option value="${d.departmentID}">${d.departmentName}</option>`;
  });
}

// Any active mentor can take a mentee from any school. Mentors from the
// mentee's own school are listed first. Deactivated mentors are excluded.
function renderMentorOptions(select, menteeSchool, currentMentorId = null) {
  const byName = (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
  const active = allMentorsWithDept.filter(m => m.isActive !== false);
  const same   = active.filter(m => menteeSchool && m.school === menteeSchool).sort(byName);
  const others = active.filter(m => !(menteeSchool && m.school === menteeSchool)).sort(byName);
  const option = m => {
    const where = [m.departmentName, m.school].filter(Boolean).join(' · ') || 'No dept';
    const sel   = m.userID === currentMentorId ? ' selected' : '';
    return `<option value="${m.userID}"${sel}>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)} (${escapeHtml(where)})</option>`;
  };
  let html = `<option value="" disabled${currentMentorId ? '' : ' selected'}>Choose a mentor...</option>`;
  if (same.length)   html += `<optgroup label="${escapeHtml(menteeSchool)}">${same.map(option).join('')}</optgroup>`;
  if (others.length) html += `<optgroup label="${same.length ? 'Other schools and departments' : 'All mentors'}">${others.map(option).join('')}</optgroup>`;
  if (!active.length) html = '<option value="" disabled selected>No active mentors yet</option>';
  select.innerHTML = html;
}

function loadMenteeMentors() {
  const school = document.getElementById('fieldMenteeSchool').value;
  renderMentorOptions(document.getElementById('fieldMenteeAssignMentor'), school);
}

async function fetchUsers() {
  try {
    await fetchSettings();
    const data = await apiRequest('Users', 'GET', null, true);
    allUsers = (data || []).sort((a, b) => {
      const dateA = new Date(a.createdAt || a.CreatedAt || 0);
      const dateB = new Date(b.createdAt || b.CreatedAt || 0);
      return dateB - dateA; // newest first
    });
    allMentors = allUsers.filter(u => u.role === 'Mentor' && u.isActive);
    selectedUserIds.clear();
    updateBulkDeleteBtn();
    await Promise.all([
      fetchAssignments(),
      fetchMentorsWithDept(),
      fetchMenteesWithDept()
    ]);
    await loadDashboardEngagementRows();
    populateMentorFilterDropdown();
    populateSchoolFilter();
    filterAssignments();
    renderAssignmentStats();
    fetchStats();
    renderTable();
    if (sectionsTabLoaded) { populateSchoolCards(); renderSectionTab(); }
  } catch (error) {
    console.error('Error loading users:', error);
    allUsers = [];
    renderTable();
  }
}

async function loadDashboardEngagementRows() {
  if (!dashboardEngagementFilter) return;
  try {
    const rows = await apiRequest('Users/engagement', 'GET', null, true);
    dashboardEngagementByUser = new Map((rows || []).map(row => [row.menteeID, row]));
  } catch (error) {
    dashboardEngagementByUser = new Map();
    showErrorModal('Could not load current-semester attendance details. Please refresh and try again.');
  }
}

async function fetchMentorsWithDept() {
  try {
    const data = await apiRequest('Users/mentors-with-dept', 'GET', null, true);
    allMentorsWithDept = data || [];
  } catch (e) { console.error('Error loading mentors with dept:', e); }
}

function renderAssignmentStats() {
  const assignedIds = new Set(allAssignments.map(a => a.menteeUserID));

  const total = allAssignments.length;

  const unassigned = allUsers.filter(u =>
    u.role === 'Mentee' && u.isActive &&
    !assignedIds.has(u.userID) &&
    allMenteesWithDept.some(m => m.userID === u.userID)
  ).length;

  const pending = allUsers.filter(u =>
    (u.role === 'Mentor' || u.role === 'Mentee') && u.isActive &&
    !allMentorsWithDept.some(m => m.userID === u.userID) &&
    !allMenteesWithDept.some(m => m.userID === u.userID)
  ).length;

  const el = id => document.getElementById(id);
  if (el('assignStatTotal'))      el('assignStatTotal').textContent      = total;
  if (el('assignStatUnassigned')) el('assignStatUnassigned').textContent = unassigned;
  if (el('assignStatPending'))    el('assignStatPending').textContent    = pending;
}

// Requires a School to be picked first — with 22+ mentors across 3 schools,
// a single flat "All Mentors" list mixing everyone together only gets
// longer as the roster grows. Scoping to one school at a time keeps it
// short and grouped by Department; the free-text search box already covers
// "I don't know their school" lookups.
function populateMentorFilterDropdown() {
  const select = document.getElementById('assignmentMentorFilter');
  if (!select) return;
  const current      = select.value;
  const schoolFilter = document.getElementById('assignmentSchoolFilter')?.value || '';

  if (!schoolFilter) {
    select.innerHTML = '<option value="">Select a school first...</option>';
    select.disabled  = true;
    return;
  }
  select.disabled = false;

  // Mentors who handle a mentee from this school, whatever their own school or department.
  const handling = new Set(allAssignments.filter(a => a.isActive !== false && a.menteeSchool === schoolFilter).map(a => a.mentorUserID));
  const mentors = allMentorsWithDept
    .filter(m => handling.has(m.userID))
    .slice()
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

  const groups = {};
  mentors.forEach(m => {
    const dept = m.departmentName || 'No Department';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(m);
  });

  let html = '<option value="">All Mentors</option>';
  Object.keys(groups).sort().forEach(dept => {
    html += `<optgroup label="${dept}">`;
    groups[dept].forEach(m => {
      html += `<option value="${m.userID}">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</option>`;
    });
    html += '</optgroup>';
  });
  select.innerHTML = html;

  // Only keep the previous selection if it's still valid under the new
  // school scope — otherwise fall back to "All Mentors" rather than hold
  // onto a mentor who no longer matches the filter combination.
  if (current && mentors.some(m => String(m.userID) === current)) {
    select.value = current;
  }
}

function getUserSchool(u) {
  if (u.role === 'Mentor') {
    const m = allMentorsWithDept.find(m => m.userID === u.userID);
    return m?.school || '—';
  }
  if (u.role === 'Mentee') {
    const m = allMenteesWithDept.find(m => m.userID === u.userID);
    return m?.school || '—';
  }
  return 'N/A';
}

// Department code for each college group in SCHOOL_COURSES, so a mentee's
// department can be read from their course when the profile has none.
const COLLEGE_DEPARTMENTS = {
  'College of Engineering': 'COE',
  'College of Computing and Information Technology': 'CCIT',
  'College of Business, Management and Accountancy': 'CBMA',
  'College of Tourism and Hospitality Management': 'CTHM',
  'College of Arts, Science and Education': 'CASE',
  'College of Health Care': 'CHC',
  'College of Criminal Justice': 'CCJ',
};

function departmentForCourse(school, course) {
  const code = String(course || '').trim().toUpperCase();
  const group = (SCHOOL_COURSES[school] || []).find(g => g.courses.some(c => c.toUpperCase() === code));
  return group ? (COLLEGE_DEPARTMENTS[group.group] || null) : null;
}

function getUserDeptName(u) {
  if (u.role === 'Mentor') {
    const m = allMentorsWithDept.find(m => m.userID === u.userID);
    return m?.departmentName || null;
  }
  if (u.role === 'Mentee') {
    const m = allMenteesWithDept.find(m => m.userID === u.userID);
    return m?.department || departmentForCourse(m?.school, m?.course);
  }
  return null;
}

// A mentor in a department with no school (SAS, ASC, FCS, FSHS, ...).
function isSchoolDepartmentMentor(u) {
  if (u.role !== 'Mentor') return false;
  const m = allMentorsWithDept.find(m => m.userID === u.userID);
  return !!m && !m.school && allDepartments.some(d => !d.school && d.departmentName === m.departmentName);
}

function populateSchoolFilter() {
  const select = document.getElementById('schoolFilter');
  if (!select) return;
  const current = select.value;
  const schools = [
    'School of Technology',
    'School of Humanities',
    'School of Management'
  ];
  select.innerHTML = '<option value="">All Schools</option>';
  schools.forEach(s => {
    select.innerHTML += `<option value="${s}">${s}</option>`;
  });
  select.innerHTML += `<option value="${NO_SCHOOL}">School Department</option>`;
  if (current) select.value = current;
}

function populateDeptFilterForSchool(school) {
  const wrap   = document.getElementById('deptFilterWrap');
  const select = document.getElementById('deptFilter');
  if (!select || !wrap) return;
  if (!school) {
    wrap.style.display = 'none';
    select.value = '';
    return;
  }
  const depts = allDepartments
    .filter(d => (school === NO_SCHOOL ? !d.school : d.school === school) && d.departmentName !== school)
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  select.innerHTML = '<option value="">All Departments</option>';
  depts.forEach(d => {
    select.innerHTML += `<option value="${d.departmentName}">${d.departmentName}</option>`;
  });
  wrap.style.display = depts.length ? '' : 'none';
}

async function fetchMenteesWithDept() {
  try {
    const data = await apiRequest('Users/mentees-with-dept', 'GET', null, true);
    allMenteesWithDept = data || [];
  } catch (e) { console.error('Error loading mentees with dept:', e); }
}

async function fetchAssignments() {
  try {
    const data = await apiRequest('Users/assignments', 'GET', null, true);
    allAssignments = data || [];
  } catch (error) {
    console.error('Error loading assignments:', error);
    allAssignments = [];
  }
}

function filterAssignments() {
  const search       = (document.getElementById('assignmentSearch')?.value || '').toLowerCase();
  const school       = document.getElementById('assignmentSchoolFilter')?.value || '';
  const mentorFilter = document.getElementById('assignmentMentorFilter')?.value || '';
  const statusFilter = document.getElementById('assignmentStatusFilter')?.value || '';

  // Mentees who already have an active assignment
  const assignedIds = new Set(allAssignments.map(a => a.menteeUserID));

  // Build rows for mentees without an active assignment — drop-outs are
  // included too (getUserStatus() below correctly labels them "Drop Out"
  // instead of "Unassigned"), so the Drop Out filter actually has rows to match.
  const unassignedRows = allUsers
    .filter(u => (u.role || u.Role) === 'Mentee' && u.isActive && !assignedIds.has(u.userID))
    .map(u => {
      const profile = allMenteesWithDept.find(m => m.userID === u.userID);
      const st = getUserStatus(u);
      return {
        assignmentID:   null,
        menteeUserID:   u.userID,
        menteeName:     `${u.firstName} ${u.lastName}`,
        menteeSchool:   profile?.school    || '',
        course:         profile?.course    || '',
        yearLevel:      profile?.yearLevel || '',
        mentorName:     null,
        departmentName: null,
        assignedDate:   null,
        sortDate:       u.createdAt || u.CreatedAt || null,
        statusLabel:    st.label,
        statusCls:      st.cls
      };
    });

  // A mentee can drop out AFTER being assigned — their MentorMentee row
  // stays active, so without this check they'd keep showing "Assigned"
  // instead of the true "Drop Out" status.
  const assignedRows = allAssignments.map(a => {
    const menteeData = allMenteesWithDept.find(m => m.userID === a.menteeUserID);
    const isDropOut  = menteeData?.isDropOut || false;
    // A deactivated mentee keeps the assignment until it is removed or reassigned.
    const isDeactivated = allUsers.find(u => u.userID === a.menteeUserID)?.isActive === false;
    return {
      ...a,
      statusLabel: isDeactivated ? 'Deactivated' : isDropOut ? 'Drop Out' : 'Assigned',
      statusCls:   isDeactivated ? 'inactive'    : isDropOut ? 'drop-out' : 'assigned'
    };
  });

  const combined = [
    ...assignedRows,
    ...unassignedRows
  ];

  filteredAssignments = combined
    .filter(row => {
      const matchSearch = !search ||
        (row.menteeName || '').toLowerCase().includes(search) ||
        (row.mentorName || '').toLowerCase().includes(search);
      const matchSchool  = !school        || row.menteeSchool === school;
      const matchMentor  = !mentorFilter  || String(row.mentorUserID) === mentorFilter;
      const matchStatus  = !statusFilter  || row.statusLabel === statusFilter;
      return matchSearch && matchSchool && matchMentor && matchStatus;
    })
    .sort((a, b) => {
      const dateA = a.assignedDate || a.sortDate;
      const dateB = b.assignedDate || b.sortDate;
      if (!dateA && !dateB) return (b.menteeUserID || 0) - (a.menteeUserID || 0);
      if (!dateA) return 1;
      if (!dateB) return -1;
      const diff = new Date(dateB) - new Date(dateA);
      if (diff !== 0) return diff; // newest date first
      // Same date: higher assignmentID (or userID for unassigned) = more recently created
      const idA = a.assignmentID || a.menteeUserID || 0;
      const idB = b.assignmentID || b.menteeUserID || 0;
      return idB - idA;
    });

  assignmentPage = 1;
  renderAssignments();
}

function getUserStatus(u) {
  // Account access takes precedence over assignment and setup status.
  if ((u.isActive ?? u.IsActive) === false) return { label: 'Inactive', cls: 'inactive' };
  // Viewing a specific PAST School Year: show that mentee's status AS IT
  // WAS then (e.g. "Assigned"), not whatever it's become since (e.g.
  // "Unassigned" after a later year-end reset, or "Drop Out" if they left
  // afterward) — see AccountPeriodHistory's WasAssigned/WasDropOut. Falls
  // through to live status if there's no snapshot for this user+period
  // (they didn't have an account yet that year).
  const yearFilter = document.getElementById('schoolYearFilter')?.value || '';
  if (u.role === 'Mentee' && yearFilter && yearFilter !== '__current__') {
    const hist = periodHistoryByUser.get(u.userID)?.get(yearFilter);
    if (hist) {
      if (hist.wasDropOut) return { label: 'Drop Out', cls: 'drop-out' };
      return hist.wasAssigned
        ? { label: 'Assigned',   cls: 'assigned'   }
        : { label: 'Unassigned', cls: 'unassigned' };
    }
  }
  if (u.role === 'Mentee') {
    const menteeData = allMenteesWithDept.find(m => m.userID === u.userID);
    if (menteeData?.isDropOut) return { label: 'Drop Out',  cls: 'drop-out'       };
    const hasActive = allAssignments.some(a => a.menteeUserID === u.userID && a.isActive);
    if (hasActive) return { label: 'Assigned',   cls: 'assigned'       };
    if (!menteeData)       return { label: 'Incomplete Profile', cls: 'pending-status' };
    return                         { label: 'Unassigned',  cls: 'unassigned'     };
  }
  if (u.role === 'Mentor') {
    if (u.isActive === false) return { label: 'Inactive', cls: 'inactive' };
    const hasDept = allMentorsWithDept.some(m => m.userID === u.userID);
    if (!hasDept)  return { label: 'Incomplete Profile', cls: 'pending-status' };
    return           { label: 'Active',   cls: 'approved'       };
  }
  return u.isActive
    ? { label: 'Active',   cls: 'approved' }
    : { label: 'Inactive', cls: 'inactive' };
}

// Selected users each bulk action applies to; the caller's own account is never included.
function bulkTargets(mode) {
  const selfId = String(getSession()?.user?.userID ?? '');
  return allUsers.filter(u => selectedUserIds.has(u.userID) && String(u.userID) !== selfId && (
    mode === 'dropout'    ? u.role === 'Mentee' && u.isActive !== false && !allMenteesWithDept.find(m => m.userID === u.userID)?.isDropOut
    : mode === 'deactivate' ? u.isActive !== false
    : u.isActive === false));
}

function updateBulkDeleteBtn() {
  const count = selectedUserIds.size;
  const bar   = document.getElementById('bulkActions');
  if (!bar) return;
  document.getElementById('selectedCount').textContent = count;
  bar.classList.toggle('visible', count > 0);
  [['bulkDropOutBtn', 'dropout'], ['bulkDeactivateBtn', 'deactivate'], ['bulkReactivateBtn', 'reactivate']]
    .forEach(([id, mode]) => { document.getElementById(id).style.display = count > 0 && bulkTargets(mode).length ? '' : 'none'; });
  const permaLink = document.getElementById('bulkPermanentDeleteLink');
  if (permaLink) permaLink.style.display = count > 0 ? 'inline-flex' : 'none';
}

function toggleSelectUser(userId, checked) {
  if (checked) selectedUserIds.add(userId);
  else         selectedUserIds.delete(userId);
  updateBulkDeleteBtn();
  syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
  const filtered   = getFiltered();
  const start      = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems  = filtered.slice(start, start + ROWS_PER_PAGE);
  const allChecked = pageItems.length > 0 && pageItems.every(u => selectedUserIds.has(u.userID));
  const cb = document.getElementById('selectAllCheckbox');
  if (cb) cb.checked = allChecked;
}

function toggleSelectAll(checked) {
  const filtered  = getFiltered();
  const start     = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ROWS_PER_PAGE);
  pageItems.forEach(u => {
    if (checked) selectedUserIds.add(u.userID);
    else         selectedUserIds.delete(u.userID);
  });
  updateBulkDeleteBtn();
  renderTable();
}

// One explicit action per button; selected users it doesn't apply to are skipped and counted.
const BULK_ACTIONS = {
  dropout:    { title: 'Mark as Drop Out?',   verb: 'marked as Drop Out', button: 'Mark as Drop Out', skip: 'are not active mentees or are already Drop Out', positive: false },
  deactivate: { title: 'Deactivate Accounts?', verb: 'deactivated and unable to log in', button: 'Deactivate', skip: 'are already deactivated', positive: false },
  reactivate: { title: 'Reactivate Accounts?', verb: 'reactivated and able to log in again', button: 'Reactivate', skip: 'are already active', positive: true },
};
let bulkMode = null;

function openBulkStatusModal(mode) {
  const action  = BULK_ACTIONS[mode];
  const targets = bulkTargets(mode);
  if (!action || !targets.length) return;
  bulkMode = mode;
  const skipped = selectedUserIds.size - targets.length;
  const n = targets.length;
  document.getElementById('bulkDeleteTitle').textContent = action.title;
  document.getElementById('bulkDeleteMessage').textContent =
    `${n} account${n > 1 ? 's' : ''} will be ${action.verb}.` +
    (skipped > 0 ? ` ${skipped} selected account${skipped > 1 ? 's' : ''} will be skipped (yours or ones that ${action.skip}).` : '') +
    ' Records will be retained. This can be reversed.';
  const confirmBtn = document.getElementById('bulkDeleteConfirmBtn');
  confirmBtn.textContent = action.button;
  confirmBtn.className   = `${action.positive ? 'btn-primary' : 'btn-danger'} do-confirm-btn`;
  document.getElementById('bulkDeleteIcon').className = `info-modal-icon ${action.positive ? 'do-reactivate' : 'do-dropout'}`;
  document.getElementById('bulkDeleteModal').style.display = 'flex';
}

function hideBulkDeleteModal() {
  document.getElementById('bulkDeleteModal').style.display = 'none';
  bulkMode = null;
}

// Each action only ever moves users in one direction, never toggles.
async function confirmBulkDelete() {
  const mode    = bulkMode;
  const targets = mode ? bulkTargets(mode) : [];
  if (!targets.length) { hideBulkDeleteModal(); return; }
  let failed = 0;
  await runBusy(document.getElementById('bulkDeleteConfirmBtn'), 'Updating…', async () => {
    for (const user of targets) {
      try {
        if (mode === 'dropout') await apiRequest(`Users/${user.userID}/dropout`, 'PATCH', { isDropOut: true }, true);
        else await apiRequest(`Users/${user.userID}/active`, 'PATCH', { isActive: mode === 'reactivate' }, true);
      } catch (e) { failed++; }
    }
    selectedUserIds.clear();
    updateBulkDeleteBtn();
    await fetchUsers();
    if (sectionsTabLoaded) fetchSectionMentorView();
  });
  hideBulkDeleteModal();
  if (failed > 0) showErrorModal(`${targets.length - failed} account(s) updated. ${failed} account(s) could not be updated. Please try again.`);
  else showStatusSuccess('Status Updated', `${targets.length} account(s) ${BULK_ACTIONS[mode].verb}. Existing records have been retained.`);
}

function renderAssignments() {
  const tbody = document.getElementById('assignmentTableBody');

  if (filteredAssignments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No assignments found.</td></tr>`;
    document.getElementById('assignmentShowingText').textContent = '';
    document.getElementById('assignmentPagination').innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / ASSIGNMENTS_PER_PAGE));
  if (assignmentPage > totalPages) assignmentPage = totalPages;

  const start     = (assignmentPage - 1) * ASSIGNMENTS_PER_PAGE;
  const pageItems = filteredAssignments.slice(start, start + ASSIGNMENTS_PER_PAGE);
  const showEnd   = Math.min(start + ASSIGNMENTS_PER_PAGE, filteredAssignments.length);

  tbody.innerHTML = pageItems.map(row => {
    const isAssigned = row.assignmentID !== null;
    const deptClass  = (row.departmentName || '').toLowerCase() === 'tertiary' ? 'dept-tertiary'
                     : (row.departmentName || '').toLowerCase() === 'fidelis'  ? 'dept-fidelis'
                     : (row.departmentName || '').toLowerCase() === 'sas'      ? 'dept-sas'
                     : '';
    const deptHtml   = row.departmentName
      ? `<span class="badge ${deptClass}">${row.departmentName}</span>` : '—';
    const safeName   = escapeHtml(row.menteeName || '').replace(/'/g, "\\'");

    const actionHtml = isAssigned
      ? `<div class="action-cell">
           <button class="icon-edit"
             onclick="openEditAssignment(${row.assignmentID},'${safeName}',${row.menteeUserID},'${row.menteeSchool || ''}')"
             title="Reassign">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
           </button>
           <button class="icon-delete" onclick="confirmRemoveAssignment(${row.assignmentID})" title="Remove">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
           </button>
         </div>`
      : `<div class="action-cell">
           <button class="icon-edit"
             onclick="openEditAssignment(null,'${safeName}',${row.menteeUserID},'${row.menteeSchool || ''}')"
             title="Assign Mentor">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
           </button>
         </div>`;

    return `
      <tr>
        <td>${row.menteeName ? escapeHtml(row.menteeName) : '—'}</td>
        <td>${escapeHtml(row.course || '—')}</td>
        <td>${row.mentorName ? escapeHtml(row.mentorName) : '—'}</td>
        <td>${deptHtml}</td>
        <td>${row.assignedDate ? formatDate(row.assignedDate) : '—'}</td>
        <td><span class="badge ${row.statusCls}">${row.statusLabel}</span></td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('assignmentShowingText').textContent =
    `Showing ${start + 1} to ${showEnd} of ${filteredAssignments.length} entries`;
  renderAssignmentPagination(totalPages);
}

function smartPages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5];
  if (current >= total - 2) return [total-4, total-3, total-2, total-1, total];
  return [current-2, current-1, current, current+1, current+2];
}

function renderAssignmentPagination(totalPages) {
  const container = document.getElementById('assignmentPagination');
  const pages = smartPages(assignmentPage, totalPages);
  let html = `<button class="page-btn page-icon" title="First page" aria-label="First page" onclick="goAssignmentPage(1)" ${assignmentPage === 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg></button>`;
  html += `<button class="page-btn page-icon" title="Previous page" aria-label="Previous page" onclick="goAssignmentPage(${assignmentPage - 1})" ${assignmentPage === 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  pages.forEach(p => {
    html += `<button class="page-btn ${p === assignmentPage ? 'active' : ''}" onclick="goAssignmentPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn page-icon" title="Next page" aria-label="Next page" onclick="goAssignmentPage(${assignmentPage + 1})" ${assignmentPage === totalPages ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  html += `<button class="page-btn page-icon" title="Last page" aria-label="Last page" onclick="goAssignmentPage(${totalPages})" ${assignmentPage === totalPages ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg></button>`;
  container.innerHTML = html;
}

function goAssignmentPage(p) {
  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / ASSIGNMENTS_PER_PAGE));
  if (p < 1 || p > totalPages) return;
  assignmentPage = p;
  renderAssignments();
}

let removingAssignmentId = null;

function confirmRemoveAssignment(assignmentId) {
  removingAssignmentId = assignmentId;
  document.getElementById('removeAssignmentModal').style.display = 'flex';
}

function hideRemoveAssignmentModal() {
  document.getElementById('removeAssignmentModal').style.display = 'none';
  removingAssignmentId = null;
}

async function doRemoveAssignment() {
  if (!removingAssignmentId) return;
  try {
    await runBusy(document.getElementById('removeAssignmentConfirmBtn'), 'Removing…', async () => {
      await apiRequest(`Users/assignments/${removingAssignmentId}`, 'DELETE', null, true);
      await fetchUsers();
    });
    hideRemoveAssignmentModal();
    showStatusSuccess('Assignment Removed', 'The mentor-mentee assignment has been removed.');
  } catch (err) {
    hideRemoveAssignmentModal();
    showErrorModal('Failed to remove assignment. Please try again.');
  }
}

let editingAssignmentId           = null;
let editingAssignmentMenteeUserId = null;
let dropOutTargetId  = null;
let dropOutTargetNew = null;
let activeTargetId   = null;
let activeTargetNew  = null;

function openEditAssignment(assignmentId, menteeName, menteeUserId, menteeSchool) {
  editingAssignmentId           = assignmentId;
  editingAssignmentMenteeUserId = menteeUserId;

  document.getElementById('editAssignMenteeName').textContent = menteeName;
  document.getElementById('editAssignModalTitle').textContent = assignmentId ? 'Reassign Mentor' : 'Assign Mentor';
  document.getElementById('editAssignConfirmBtn').textContent = assignmentId ? 'Reassign' : 'Assign';

  renderMentorOptions(document.getElementById('editAssignMentorSelect'), menteeSchool);

  document.getElementById('editAssignModal').style.display = 'flex';
}

function closeEditAssignModal() {
  document.getElementById('editAssignModal').style.display = 'none';
  editingAssignmentId           = null;
  editingAssignmentMenteeUserId = null;
}

async function confirmEditAssign() {
  const mentorId = parseInt(document.getElementById('editAssignMentorSelect').value);
  if (!mentorId) { showErrorModal('Please select a mentor.'); return; }
  if (!editingAssignmentMenteeUserId) {
    showErrorModal('Could not identify the mentee. Please close and try again.');
    return;
  }
  const select     = document.getElementById('editAssignMentorSelect');
  const mentorName = select.options[select.selectedIndex]?.textContent.trim() || 'the selected mentor';
  const menteeName = document.getElementById('editAssignMenteeName').textContent;
  const menteeId   = editingAssignmentMenteeUserId;
  const isReassign = !!editingAssignmentId;
  confirmAction({
    title: isReassign ? 'Reassign Mentor?' : 'Assign Mentor?',
    message: `Are you sure you want to assign <strong>${escapeHtml(menteeName)}</strong> to <strong>${escapeHtml(mentorName)}</strong>?`,
    confirmText: isReassign ? 'Reassign' : 'Assign',
    action: async () => {
      try {
        await apiRequest('Users/assign', 'POST', { menteeUserId: menteeId, mentorUserId: mentorId }, true);
        closeEditAssignModal();
        await fetchUsers();
        showStatusSuccess(isReassign ? 'Mentor Reassigned' : 'Mentor Assigned', `${menteeName} is now assigned to ${mentorName}.`);
      } catch (err) {
        showErrorModal(friendlyError(err));
      }
    },
  });
}

// Quoted CSV cell; a leading = + - @ gets a ' so spreadsheet apps don't run it as a formula.
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportUsers() {
  if (allUsers.length === 0) { showErrorModal('No users to export.'); return; }
  const rows = [['Name', 'ID Number', 'Email', 'Role', 'School', 'Status']];
  allUsers.forEach(u => {
    const status = getUserStatus(u).label;
    rows.push([
      `${u.firstName} ${u.lastName}`,
      u.studentNumber || '—',
      u.email,
      u.role,
      getUserDept(u),
      status
    ]);
  });
  const csv  = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'users.csv'; a.click();
  URL.revokeObjectURL(url);
}

function exportAssignments() {
  if (allAssignments.length === 0) { showErrorModal('No assignments to export.'); return; }
  const rows = [['Mentee', 'Mentee Email', 'Course', 'Year Level', 'Mentor', 'Mentor Email', 'Department', 'Assigned Date', 'Status']];
  allAssignments.forEach(a => {
    const menteeData = allMenteesWithDept.find(m => m.userID === a.menteeUserID);
    const isDropOut  = menteeData?.isDropOut || false;
    // vw_AssignmentDetails (the source of allAssignments) has no email
    // column, only names/IDs — same reason downloadEditableUsers() already
    // resolves mentor email this way (see mentorEmailByMenteeId above).
    const menteeUser = allUsers.find(u => u.userID === a.menteeUserID);
    const mentorUser = allUsers.find(u => u.userID === a.mentorUserID);
    rows.push([
      a.menteeName     || '—',
      menteeUser?.email || '—',
      a.course         || '—',
      a.yearLevel      || '—',
      a.mentorName     || '—',
      mentorUser?.email || '—',
      a.departmentName || '—',
      formatDate(a.assignedDate),
      isDropOut ? 'Drop Out' : 'Assigned'
    ]);
  });
  const csv  = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'assignments.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── IMPORT ──────────────────────────────────────────────────────────────────

function downloadImportTemplate() {
  const rows = [
    [
      'First Name',
      'Last Name',
      'Email',
      'Password',
      'Role  (Admin / Mentor / Mentee)',
      'Gender  (Male / Female)',
      'ID Number',
      'Contact Number',
      'School  (SOT / SOH / SOM)',
      'Department  [Mentor ONLY - exact dept name from Import Reference Panel, e.g. CCIT]',
      'Course  [Mentee ONLY - exact course code from Import Reference Panel, e.g. BSIT]',
      'Assign to Mentor Email  [Mentee only - leave blank for Mentor/Admin]',
    ],
    [
      '*** DELETE THIS ROW - Maria (Mentor example)',
      'Santos',
      'maria.santos@faith.edu.ph',
      'Faith@2026',
      'Mentor',
      'Female',
      '',
      '09171234567',
      'SOT',
      'CCIT',
      '',
      '',
    ],
    [
      '*** DELETE THIS ROW - Juan (Mentee example)',
      'Dela Cruz',
      'juan.delacruz@faith.edu.ph',
      'Faith@2026',
      'Mentee',
      'Male',
      '2024-00101',
      '09181234567',
      'SOT',
      '',
      'BSIT',
      'maria.santos@faith.edu.ph  - mentor email to auto-assign',
    ],
    [
      '*** DELETE THIS ROW - Dan (Admin example)',
      'Rivera',
      'dan.rivera@faith.edu.ph',
      'Faith@2026',
      'Admin',
      'Male',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ];
  const csv  = rows.map(r => r.map(v => `"${String(v)}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'users_import_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

// Same column layout as the blank template, but pre-filled with every
// existing user's REAL current data, so updating someone means editing
// only the cells that need to change and re-importing the rest untouched —
// no need to remember to leave anything blank on purpose (re-import still
// treats a blank cell as "keep as-is" as a safety net, but this file
// starts you with nothing blank to begin with).
function downloadEditableUsers() {
  if (allUsers.length === 0) { showErrorModal('No users to download.'); return; }

  const schoolToAbbrev = {
    'School of Technology': 'SOT',
    'School of Humanities': 'SOH',
    'School of Management': 'SOM',
  };

  // Current mentor email per mentee, resolved from the live assignment list
  // (vw_AssignmentDetails has no email column, only names/IDs).
  const mentorEmailByMenteeId = {};
  allAssignments.forEach(a => {
    if (!a.isActive) return;
    const mentorUser = allUsers.find(u => u.userID === a.mentorUserID);
    if (mentorUser) mentorEmailByMenteeId[a.menteeUserID] = mentorUser.email;
  });

  const rows = [[
    'First Name',
    'Last Name',
    'Email',
    'Password',
    'Role  (Admin / Mentor / Mentee)',
    'Gender  (Male / Female)',
    'ID Number',
    'Contact Number',
    'School  (SOT / SOH / SOM)',
    'Department  [Mentor ONLY - exact dept name from Import Reference Panel, e.g. CCIT]',
    'Course  [Mentee ONLY - exact course code from Import Reference Panel, e.g. BSIT]',
    'Assign to Mentor Email  [Mentee only - leave blank for Mentor/Admin]',
  ]];

  allUsers.forEach(u => {
    let school = '', department = '', course = '', mentorEmail = '';
    if (u.role === 'Mentor') {
      const m = allMentorsWithDept.find(x => x.userID === u.userID);
      school     = schoolToAbbrev[m?.school] || m?.school || '';
      department = m?.departmentName || '';
    } else if (u.role === 'Mentee') {
      const m = allMenteesWithDept.find(x => x.userID === u.userID);
      school        = schoolToAbbrev[m?.school] || m?.school || '';
      course        = m?.course     || '';
      mentorEmail   = mentorEmailByMenteeId[u.userID] || '';
    }
    rows.push([
      u.firstName,
      u.lastName,
      u.email,
      '', // Password is always left blank — re-import never changes an existing
          // user's password (see "Resetting a password" note in the modal);
          // reset one deliberately from that user's Edit User modal instead.
      u.role,
      u.gender         || '',
      u.studentNumber  || '',
      u.contactNumber  || '',
      school,
      department,
      course,
      mentorEmail,
    ]);
  });

  const csv  = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'users_current_editable.csv'; a.click();
  URL.revokeObjectURL(url);
}

async function openImportModal() {
  document.getElementById('importStartModal').style.display = 'flex';

  const deptEl   = document.getElementById('importRefDepts');
  const mentorEl = document.getElementById('importRefMentors');
  if (deptEl)   deptEl.innerHTML   = '<div style="color:#9ca3af;">Loading...</div>';
  if (mentorEl) mentorEl.innerHTML = '<div style="color:#9ca3af;">Loading...</div>';

  // Always fetch fresh so newly added mentors/depts appear immediately
  await Promise.all([fetchDepartments(), fetchMentorsWithDept(), fetchUsers()]);

  // Departments
  if (deptEl) {
    if (allDepartments.length > 0) {
      const bySchool = {};
      // Each school also has a placeholder Department row whose name is
      // just the school's own name again (same quirk loadMentorDepts()
      // already filters out for the Add User modal) — skip it here too,
      // otherwise "School of Humanities" lists itself as one of its own
      // departments.
      allDepartments.forEach(d => {
        if (d.departmentName === d.school) return;
        const school = d.school || 'School Department';
        if (!bySchool[school]) bySchool[school] = [];
        bySchool[school].push(d.departmentName);
      });
      // School Department (SAS) is listed after the schools.
      deptEl.innerHTML = Object.entries(bySchool).sort(([a], [b]) => (a === 'School Department') - (b === 'School Department')).map(([school, depts], i) =>
        `<div style="position:relative;margin-bottom:4px;">
          <button class="dept-btn" onclick="toggleDeptDropdown(event,'deptDrop${i}')"
                  style="width:100%;display:flex;justify-content:space-between;align-items:center;
                         padding:6px 10px;background:#dde0e5;border:1px solid #c4c9d4;border-radius:6px;
                         cursor:pointer;font-weight:700;font-size:12px;color:#111827;text-align:left;">
            ${school}
            <span style="font-size:9px;color:#6b7280;">&#9660;</span>
          </button>
          <div id="deptDrop${i}" class="dept-dropdown"
               style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:30;
                      background:#fff;border:1px solid #c4c9d4;border-radius:6px;
                      box-shadow:0 6px 18px rgba(0,0,0,.16);padding:8px 10px;
                      flex-direction:column;gap:4px;">
            ${depts.map(d => `<span style="color:#1f2937;font-size:11.5px;">· ${d}</span>`).join('')}
          </div>
        </div>`
      ).join('');
      // Close dropdowns when clicking outside
      const modal = document.getElementById('importStartModal');
      if (!modal.dataset.deptListenerAdded) {
        modal.dataset.deptListenerAdded = '1';
        modal.addEventListener('click', e => {
          if (!e.target.closest('.dept-dropdown') && !e.target.closest('.dept-btn')) {
            document.querySelectorAll('.dept-dropdown').forEach(el => el.style.display = 'none');
          }
        });
      }
    } else {
      deptEl.innerHTML = '<div style="color:#9ca3af;">No departments found.</div>';
    }
  }

  // Courses — SCHOOL_COURSES is a hardcoded const, no fetch needed. Each
  // course line also shows which Department (College) it falls under, so
  // "CCIT groups BSIT/BSEMC/BSCS" reads directly from the same reference
  // instead of needing to cross-check the Departments box above.
  const courseEl = document.getElementById('importRefCourses');
  if (courseEl) {
    courseEl.innerHTML = Object.entries(SCHOOL_COURSES).map(([school, groups], i) =>
      `<div style="position:relative;margin-bottom:4px;">
        <button class="dept-btn" onclick="toggleDeptDropdown(event,'courseDrop${i}')"
                style="width:100%;display:flex;justify-content:space-between;align-items:center;
                       padding:6px 10px;background:#dde0e5;border:1px solid #c4c9d4;border-radius:6px;
                       cursor:pointer;font-weight:700;font-size:12px;color:#111827;text-align:left;">
          ${school}
          <span style="font-size:9px;color:#6b7280;">&#9660;</span>
        </button>
        <div id="courseDrop${i}" class="dept-dropdown"
             style="display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:30;
                    background:#fff;border:1px solid #c4c9d4;border-radius:6px;
                    box-shadow:0 6px 18px rgba(0,0,0,.16);padding:8px 10px;
                    flex-direction:column;gap:6px;">
          ${groups.map(g => `
            <div>
              <div style="font-weight:700;color:#374151;font-size:10.5px;margin-bottom:2px;">${g.group}</div>
              ${g.courses.map(c => `<span style="color:#1f2937;font-size:11.5px;display:block;">&middot; ${c}</span>`).join('')}
            </div>
          `).join('')}
        </div>
      </div>`
    ).join('');
  }

  // Mentors — only ones a mentee can actually be auto-assigned to;
  // a deactivated mentor still had an entry here before, so a CSV could
  // silently assign a new mentee to someone who can no longer log in.
  if (mentorEl) {
    _importMentorRefList = allMentorsWithDept
      .filter(m => m.isActive !== false)
      .map(m => {
        const u = allUsers.find(u => u.userID === m.userID);
        return { ...m, email: u?.email || '' };
      })
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    const searchEl = document.getElementById('importMentorSearch');
    if (searchEl) searchEl.value = '';
    renderImportMentorRef(_importMentorRefList);
  }
}

let _importMentorRefList = [];

function renderImportMentorRef(mentors) {
  const mentorEl = document.getElementById('importRefMentors');
  if (!mentorEl) return;
  if (mentors.length === 0) {
    mentorEl.innerHTML = '<div style="color:#9ca3af;">No mentors found.</div>';
    return;
  }
  mentorEl.innerHTML = mentors.map(m =>
    `<div>
      <strong style="color:#111827;">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</strong>
      <span style="color:#4b5563;font-size:11px;"> · ${m.school || (m.departmentName ? 'School Department' : '—')} · ${m.departmentName || '—'}</span><br/>
      <span style="font-size:11px;color:#374151;">${escapeHtml(m.email || '—')}</span>
    </div>`
  ).join('');
}

// Scanning a flat scroll box gets slower as the mentor roster grows —
// let the admin filter it down instead of hunting through everyone.
function filterImportMentorRef() {
  const q = (document.getElementById('importMentorSearch')?.value || '').toLowerCase().trim();
  if (!q) { renderImportMentorRef(_importMentorRefList); return; }
  const filtered = _importMentorRefList.filter(m =>
    `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
    (m.email || '').toLowerCase().includes(q) ||
    (m.school || '').toLowerCase().includes(q) ||
    (m.departmentName || '').toLowerCase().includes(q)
  );
  renderImportMentorRef(filtered);
}

function hideImportStartModal() {
  document.getElementById('importStartModal').style.display = 'none';
  document.querySelectorAll('.dept-dropdown').forEach(el => el.style.display = 'none');
}

function toggleDeptDropdown(event, id) {
  event.stopPropagation();
  const target = document.getElementById(id);
  const isOpen = target && target.style.display === 'flex';
  document.querySelectorAll('.dept-dropdown').forEach(el => el.style.display = 'none');
  if (!isOpen && target) target.style.display = 'flex';
}

function chooseImportFile() {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    processImportCSV(await file.text());
  };
  input.click();
}

function parseCSVRow(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function processImportCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    showErrorModal('The CSV file is empty or contains no data rows.');
    return;
  }

  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const col = (...names) => {
    for (const name of names) {
      const i = headers.findIndex(h => h.includes(name));
      if (i !== -1) return i;
    }
    return -1;
  };

  const idx = {
    firstName:     col('firstname', 'first'),
    lastName:      col('lastname', 'last'),
    email:         col('email'),
    password:      col('password', 'pass'),
    role:          col('role'),
    gender:        col('gender'),
    studentNumber: col('idnumber', 'id number', 'studentnumber', 'student'),
    contact:       col('contact', 'phone', 'mobile'),
    school:        col('school'),
    department:    col('department', 'dept'),
    course:        col('course'),
    mentorEmail:   col('assigntomentor', 'assignmentor', 'mentoremail', 'mentor'),
  };

  if (idx.firstName === -1 || idx.lastName === -1 || idx.email === -1 || idx.role === -1) {
    showErrorModal('CSV must include columns: First Name, Last Name, Email, and Role. Download the import template to see the required format.');
    return;
  }

  const validRoles = ['Admin', 'Head', 'Mentor', 'Mentee'];
  const emailRe    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const errors     = [];
  const rows       = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVRow(lines[i]);
    const get   = (ci) => (ci !== -1 && ci < cells.length) ? (cells[ci] || '').trim() : '';

    const row = {
      firstName:     get(idx.firstName),
      lastName:      get(idx.lastName),
      email:         get(idx.email),
      password:      get(idx.password),
      role:          get(idx.role),
      gender:        get(idx.gender)        || null,
      studentNumber: get(idx.studentNumber) || null,
      contact:       get(idx.contact)       || null,
      school:        get(idx.school)        || null,
      department:    get(idx.department)    || null,
      course:        get(idx.course)        || null,
      mentorEmail:   get(idx.mentorEmail)   || null,
      lineNum:       i + 1,
    };

    if (!row.firstName && !row.lastName && !row.email) continue;
    if (row.firstName.startsWith('***')) continue;

    // Resolve school abbreviations
    const schoolAbbrev = { sot: 'School of Technology', soh: 'School of Humanities', som: 'School of Management' };
    if (row.school) row.school = schoolAbbrev[row.school.toLowerCase()] || row.school;

    if (!row.firstName || !row.lastName) { errors.push(`Row ${row.lineNum}: First Name and Last Name are required.`); continue; }
    if (!row.email)                      { errors.push(`Row ${row.lineNum}: Email is required.`); continue; }
    if (!emailRe.test(row.email))        { errors.push(`Row ${row.lineNum}: Invalid email "${row.email}".`); continue; }
    if (!validRoles.includes(row.role))  { errors.push(`Row ${row.lineNum}: Invalid role "${row.role}". Must be Admin, Head, Mentor, or Mentee.`); continue; }

    const isNew = !allUsers.find(u => u.email.toLowerCase() === row.email.toLowerCase());
    if (isNew && !row.password) { errors.push(`Row ${row.lineNum}: Password is required for new user "${row.email}".`); continue; }

    rows.push({ ...row, isNew });
  }

  if (errors.length > 0) {
    const preview  = errors[0];
    const moreText = errors.length > 1 ? ` (and ${errors.length - 1} more error${errors.length > 2 ? 's' : ''})` : '';
    showErrorModal(`Fix errors before importing: ${preview}${moreText}`);
    return;
  }

  if (rows.length === 0) {
    showErrorModal('No valid data rows found in the CSV.');
    return;
  }

  _importRows = rows;
  const newCount    = rows.filter(r => r.isNew).length;
  const updateCount = rows.length - newCount;
  document.getElementById('importConfirmTotal').textContent   = rows.length;
  document.getElementById('importConfirmNew').textContent     = newCount;
  document.getElementById('importConfirmUpdate').textContent  = updateCount;
  document.getElementById('importConfirmModal').style.display = 'flex';
}

function hideImportConfirmModal() {
  document.getElementById('importConfirmModal').style.display = 'none';
  _importRows = [];
}

// Finds the existing Section matching (school, course), or creates one —
// same "+ Add new course" behavior as the single Add User form, just
// driven by CSV columns instead of the inline form. Keeps a per-import
// cache so 20 mentees landing on the same brand-new course only create
// it once instead of racing 20 near-simultaneous creates.
const _sectionCreateCache = {};
async function resolveOrCreateSectionId(school, course) {
  if (!school || !course) return null;
  const courseU  = course.toUpperCase().trim();
  const cacheKey = `${school}|${courseU}`;

  const existing = allSections.find(s => s.school === school && s.course.toUpperCase() === courseU);
  if (existing) return existing.sectionID;

  if (_sectionCreateCache[cacheKey]) return _sectionCreateCache[cacheKey];

  const created = await apiRequest('Sections', 'POST', { course: courseU, school }, true);
  const newID = created?.sectionID ?? null;
  if (newID) {
    _sectionCreateCache[cacheKey] = newID;
    await fetchSections(); // so the next row can find it via allSections too
  }
  return newID;
}

async function confirmImport() {
  const rows = _importRows;
  if (rows.length === 0) { hideImportConfirmModal(); return; }
  try {
    await runBusy(document.getElementById('importConfirmBtn'), 'Importing…', () => runImport(rows));
  } finally {
    hideImportConfirmModal();
  }
}

async function runImport(rows) {
  let created = 0, updated = 0, assigned = 0;
  const errors             = [];
  const pendingAssignments = []; // { menteeEmail, mentorEmail } — resolved after all registrations

  // ── Step 1: Register / update all users ─────────────────────────────────
  for (const row of rows) {
    // Pre-validate department for new mentors
    if (row.isNew && row.role === 'Mentor') {
      const dept = allDepartments.find(d =>
        d.school === row.school &&
        d.departmentName.toLowerCase() === (row.department || '').toLowerCase()
      );
      if (!dept) {
        const valid = allDepartments
          .filter(d => d.school === row.school)
          .map(d => d.departmentName)
          .join(', ') || 'none';
        errors.push(`${row.firstName} ${row.lastName}: Department "${row.department || '(blank)'}" not found under "${row.school}". Valid: ${valid}`);
        continue;
      }
    }

    // Pre-validate course for new mentees — same idea as the Mentor
    // department check above, catches a typo'd/wrong course code before
    // any API call instead of surfacing it as a confusing mid-import error.
    if (row.isNew && row.role === 'Mentee' && row.course) {
      const validCourses = (SCHOOL_COURSES[row.school] || []).flatMap(g => g.courses);
      if (!validSchoolCourse(row.school,row.course)) {
        errors.push(`${row.firstName} ${row.lastName}: Course "${row.course}" not found under "${row.school}". Valid: ${validCourses.join(', ') || 'none'}`);
        continue;
      }
    }

    try {
      if (!row.isNew) {
        const existing = allUsers.find(u => u.email.toLowerCase() === row.email.toLowerCase());

        // A CSV re-import is meant to update ONLY the columns you actually
        // filled in — everything left blank should carry its current value
        // forward untouched, same as if you never mentioned it. The PUT
        // endpoint itself doesn't work that way (it treats a provided
        // `school` as "this is a full profile save" and blanks out
        // whatever else isn't included), so every field below falls back
        // to the existing record when the CSV row leaves it blank —
        // exactly what the Edit User modal already does by always sending
        // complete data.
        const existingProfile = row.role === 'Mentor'
          ? allMentorsWithDept.find(m => m.userID === existing.userID)
          : row.role === 'Mentee'
            ? allMenteesWithDept.find(m => m.userID === existing.userID)
            : null;

        const payload = {
          firstName:     row.firstName,
          lastName:      row.lastName,
          email:         row.email,
          // Never touch password on a re-import, even if the CSV's Password
          // column has something in it (e.g. a stale copy of the original
          // temp password from when the row was first created) — bulk
          // re-importing a roster should never silently reset everyone's
          // password back to whatever the file happens to contain.
          // Resetting a specific person's password stays a deliberate,
          // one-at-a-time action in the Edit User modal.
          newPassword:   null,
          contactNumber: row.contact         || existing.contactNumber || null,
          studentNumber: row.studentNumber   || existing.studentNumber || null,
          role:          row.role,
          gender:        row.gender          || existing.gender        || null,
          school:        row.school          || existingProfile?.school || null,
        };

        if (row.role === 'Mentor') {
          const deptNameToUse = row.department || existingProfile?.departmentName || '';
          const dept = allDepartments.find(d =>
            d.school === payload.school && d.departmentName.toLowerCase() === deptNameToUse.toLowerCase()
          );
          payload.departmentID = dept ? dept.departmentID : (existingProfile?.departmentID ?? null);
        } else if (row.role === 'Mentee') {
          const courseToUse = row.course || existingProfile?.course || '';
          payload.course    = courseToUse;
          if (!validSchoolCourse(payload.school,courseToUse)) {
            errors.push('Mentee update requires a valid school and course. Existing data was preserved.');
            continue;
          }
          // Section metadata remains historical; import must not create or
          // remap Sections rows for course-only profiles.

        }

        await apiRequest(`Users/${existing.userID}`, 'PUT', payload, true);
        updated++;

        // Re-import with a new "Assign to Mentor Email" reassigns an
        // existing mentee too — sp_AssignMentor already deactivates any
        // prior assignment before creating the new one, same as the
        // Reassign action in the Assignments tab.
        if (row.role === 'Mentee' && row.mentorEmail) {
          pendingAssignments.push({ menteeEmail: row.email, mentorEmail: row.mentorEmail });
        }
      } else if (row.role === 'Mentor') {
        const dept = allDepartments.find(d =>
          d.school === row.school &&
          d.departmentName.toLowerCase() === (row.department || '').toLowerCase()
        );
        await safeRegister('Auth/register-mentor', {
          firstName:    row.firstName,
          lastName:     row.lastName,
          email:        row.email,
          password:     row.password,
          contactNumber: row.contact,
          studentNumber: row.studentNumber,
          school:       row.school,
          departmentID: dept.departmentID,
          gender:       row.gender,
        });
        created++;
      } else if (row.role === 'Mentee') {
        if(!validSchoolCourse(row.school,row.course))throw new Error('Choose a valid course for the selected school.');
        const sectionID = null;
        await safeRegister('Auth/register-mentee', {
          firstName:    row.firstName,
          lastName:     row.lastName,
          email:        row.email,
          password:     row.password,
          contactNumber: row.contact,
          studentNumber: row.studentNumber,
          school:       row.school,
          course:       row.course,
          sectionID,
          gender:       row.gender,
        });
        created++;
        if (row.mentorEmail) {
          pendingAssignments.push({ menteeEmail: row.email, mentorEmail: row.mentorEmail });
        }
      } else {
        await safeRegister('Auth/register', {
          firstName:    row.firstName,
          lastName:     row.lastName,
          email:        row.email,
          password:     row.password,
          contactNumber: row.contact,
          studentNumber: row.studentNumber,
          role:         row.role,
          gender:       row.gender,
        });
        created++;
      }
    } catch (err) {
      errors.push(`${row.firstName} ${row.lastName} (${row.email}): ${friendlyError(err)}`);
    }
  }

  // ── Step 2: Assign mentors (batch after all registrations) ───────────────
  if (pendingAssignments.length > 0) {
    const freshUsers = await apiRequest('Users', 'GET', null, true) || [];
    for (const { menteeEmail, mentorEmail } of pendingAssignments) {
      try {
        const mentee = freshUsers.find(u => u.email.toLowerCase() === menteeEmail.toLowerCase());
        const mentor = freshUsers.find(u => u.email.toLowerCase() === mentorEmail.toLowerCase() && u.role === 'Mentor');
        if (mentor && mentor.isActive === false) {
          errors.push(`Could not assign mentor for ${menteeEmail}: "${mentorEmail}" has been deactivated.`);
        } else if (!mentor) {
          errors.push(`Could not assign mentor for ${menteeEmail}: mentor "${mentorEmail}" not found or is not a Mentor.`);
        } else if (mentee && mentor) {
          await apiRequest('Users/assign', 'POST', { menteeUserId: mentee.userID, mentorUserId: mentor.userID }, true);
          assigned++;
        }
      } catch (err) {
        errors.push(`Mentor assignment failed for ${menteeEmail}: ${friendlyError(err)}`);
      }
    }
  }

  // ── Step 3: Refresh UI ───────────────────────────────────────────────────
  await fetchUsers();
  if (sectionsTabLoaded) fetchSectionMentorView();

  const total    = created + updated;
  const isSuccess = errors.length === 0;
  const isFailed  = errors.length > 0 && total === 0;
  const isPartial = errors.length > 0 && total > 0;

  // A clean import is a corner alert; results with errors keep the modal so the list can be read.
  if (isSuccess) {
    showStatusSuccess('Import Successful', `${created} created · ${updated} updated · ${assigned} assigned.`);
    return;
  }

  const card    = document.getElementById('importResultCard');
  const iconEl  = document.getElementById('importResultIcon');
  const titleEl = document.getElementById('importResultTitle');
  const errorsEl= document.getElementById('importResultErrors');
  const okBtn   = document.getElementById('importResultOkBtn');

  // Accent color
  const accentColor = isSuccess ? '#16a34a' : isFailed ? '#dc2626' : '#d97706';
  card.style.borderTopColor = accentColor;
  okBtn.style.background    = accentColor;
  okBtn.style.borderColor   = accentColor;

  // Icon
  if (isSuccess) {
    iconEl.style.background   = '#f0fdf4';
    iconEl.style.borderColor  = '#bbf7d0';
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (isFailed) {
    iconEl.style.background   = '#fef2f2';
    iconEl.style.borderColor  = '#fecaca';
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else {
    iconEl.style.background   = '#fffbeb';
    iconEl.style.borderColor  = '#fde68a';
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }

  // Title
  titleEl.textContent = isSuccess ? 'Import Successful' : isPartial ? 'Import Completed with Errors' : 'Import Failed';

  // Stats
  document.getElementById('importResultCreated').textContent  = created;
  document.getElementById('importResultUpdated').textContent  = updated;
  document.getElementById('importResultAssigned').textContent = assigned;

  // Errors
  if (errors.length > 0) {
    errorsEl.style.display = 'block';
    errorsEl.innerHTML = `<div style="font-weight:700;margin-bottom:6px;color:#991b1b;">Errors (${errors.length})</div><ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;">${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  } else {
    errorsEl.style.display = 'none';
  }

  document.getElementById('importResultModal').style.display = 'flex';
}

function hideImportResultModal() {
  document.getElementById('importResultModal').style.display = 'none';
}

function getFiltered() {
  const search        = document.getElementById('searchInput').value.toLowerCase();
  const role          = document.getElementById('roleFilter').value;
  const schoolFilter  = document.getElementById('schoolFilter')?.value || '';
  const deptFilter    = document.getElementById('deptFilter')?.value || '';
  const genderFilter  = document.getElementById('genderFilter')?.value || '';
  const statusFilter  = document.getElementById('userStatusFilter')?.value || '';
  const yearFilter    = document.getElementById('schoolYearFilter')?.value || '';
  return allUsers.filter(u => {
    const fullName    = `${u.firstName} ${u.lastName}`.toLowerCase();
    const matchSearch = fullName.includes(search) ||
      (u.email || '').toLowerCase().includes(search) ||
      (u.studentNumber || '').toLowerCase().includes(search);
    const matchRole   = !role || u.role === role;
    const matchSchool = !schoolFilter || (schoolFilter === NO_SCHOOL
      ? isSchoolDepartmentMentor(u)
      : getUserSchool(u) === schoolFilter);
    const matchDept   = !deptFilter || getUserDeptName(u) === deptFilter;
    const matchGender = !genderFilter || (u.gender || '') === genderFilter;
    const matchStatus = !statusFilter || getUserStatus(u).label === statusFilter;
    const matchYear   = matchesPeriodFilter(u, yearFilter);
    const matchEngagement = !dashboardEngagementFilter || matchesDashboardEngagement(u);
    return matchSearch && matchRole && matchSchool && matchDept && matchGender && matchStatus && matchYear && matchEngagement;
  });
}

function matchesDashboardEngagement(user) {
  if (user.role !== 'Mentee') return false;
  const row = dashboardEngagementByUser.get(user.userID);
  if (!row) return false;

  const assigned = row.isAssigned === true;
  const droppedOut = row.isDropOut === true;
  const attended = Number(row.sessionsAttended) > 0;
  const completed = Number(row.completedCheckpoints) || 0;

  switch (dashboardEngagementFilter) {
    case 'all': return true;
    case 'attended': return assigned && !droppedOut && attended;
    case 'no-attendance': return assigned && !droppedOut && !attended;
    case 'excellent': return assigned && !droppedOut && row.attendanceStatus === 'Excellent';
    case 'on-track': return assigned && !droppedOut && row.attendanceStatus === 'On Track';
    case 'needs-attention': return assigned && !droppedOut && row.attendanceStatus === 'Needs Attention';
    case 'no-completed-sessions': return assigned && !droppedOut && completed === 0;
    case 'unassigned': return !assigned && !droppedOut;
    case 'dropped-out': return droppedOut;
    default: return false;
  }
}

// "__current__" = whoever is Active right now (the period hasn't ended,
// so there's no snapshot for it yet — this is always a live check, never
// a history lookup). Any other value is a "SchoolYear|Semester" key from
// a past snapshot in periodHistoryByUser.
function matchesPeriodFilter(u, yearFilter) {
  if (!yearFilter) return true;
  if (yearFilter === '__current__') return true;
  const userPeriods = periodHistoryByUser.get(u.userID);
  return !!userPeriods && userPeriods.has(yearFilter);
}

// What the School Year/Semester COLUMN should show for every visible row.
// With no period filter (or "Current"), every row shows the live current
// setting (matches every account still Active). With a past period
// selected, every visible row necessarily belongs to that exact period
// (that's what the filter just matched on), so the column shows the
// filter's own value instead of today's live setting.
function displayedPeriod() {
  const yearFilter = document.getElementById('schoolYearFilter')?.value || '';
  if (yearFilter && yearFilter !== '__current__') {
    const [sy, sem] = yearFilter.split('|');
    return { schoolYear: sy, semester: sem };
  }
  return { schoolYear: systemSettings.SchoolYear, semester: systemSettings.Semester };
}

function renderTable() {
  const filtered   = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start     = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ROWS_PER_PAGE);
  const tbody     = document.getElementById('userTableBody');

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No users found.</td></tr>`;
  } else {
    const period = displayedPeriod();
    tbody.innerHTML = pageItems.map(u => {
      const status  = getUserStatus(u);
      const checked = selectedUserIds.has(u.userID) ? 'checked' : '';
      const sigStatus = (() => {
        const role = u.role || '';
        if (role === 'Mentor') {
          const p = allMentorsWithDept.find(m => m.userID === u.userID);
          if (!p) return null;
          return p.signatureFilePath
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;">Uploaded</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">Missing</span>';
        }
        if (role === 'Mentee') {
          const p = allMenteesWithDept.find(m => m.userID === u.userID);
          if (!p) return null;
          return p.signatureFilePath
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;">Uploaded</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">Missing</span>';
        }
        // Admin and Head keep their signature on the user record itself.
        if (role === 'Admin' || role === 'Head') {
          return u.signatureFilePath
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;">Uploaded</span>'
            : '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">Missing</span>';
        }
        return null;
      })();
      const statusCls = status.label === 'Assigned'   ? 'assigned'
                      : status.label === 'Active'    ? 'approved'
                      : status.label === 'Incomplete Profile' ? 'pending-status'
                      : status.label === 'Inactive'  ? 'inactive'
                      : status.label === 'Drop Out'  ? 'drop-out'
                      : 'unassigned';
      const rowCls = status.label === 'Drop Out' ? ' class="row-dropout"'
                   : status.label === 'Inactive' ? ' class="row-inactive"'
                   : '';
      // Was a true hard-delete icon; now routes to the reversible
      // Drop Out (Mentee) / Deactivate (everyone else) flow, so its label
      // reflects whichever direction that toggle would actually take.
      const isSelfRow  = String(u.userID) === String(getSession()?.user?.userID ?? '');
      const menuTitle  = isSelfRow ? 'Cannot modify your own account' : 'More actions';
      return `
        <tr${rowCls}>
          <td class="col-check">
            <input type="checkbox" class="row-checkbox" ${checked}
              onchange="toggleSelectUser(${u.userID}, this.checked)" />
          </td>
          <td>
            <div class="user-name-cell">
              <div class="u-name">${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</div>
              <div class="u-id">${u.studentNumber ? escapeHtml(u.studentNumber) : '—'}</div>
            </div>
          </td>
          <td class="td-left">${escapeHtml(u.email)}</td>
          <td>${period.schoolYear}</td>
          <td>${period.semester}</td>
          <td>${u.gender ? `<span class="badge gender-${escapeHtml((u.gender||'').toLowerCase())}">${escapeHtml(u.gender)}</span>` : '—'}</td>
          <td><span class="badge ${(u.role || '').toLowerCase()}">${u.role === 'Head' ? 'Head Admin' : u.role}</span></td>
          <td>${schoolDeptCell(u)}</td>
          <td><span class="badge ${statusCls}">${status.label === 'Inactive' ? 'Deactivated' : status.label}</span></td>
          <td style="text-align:center">${sigStatus ?? '—'}</td>
          <td>
            <div class="action-cell">
              <button class="icon-edit" onclick="openEdit(${u.userID})" title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="icon-more" onclick="openRowMenu(event, ${u.userID})" title="${menuTitle}" aria-label="${menuTitle}" aria-haspopup="menu" ${isSelfRow ? 'disabled style="opacity:.35;cursor:not-allowed;"' : ''}>
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  const totalEntries = filtered.length;
  const showEnd = Math.min(start + ROWS_PER_PAGE, totalEntries);
  document.getElementById('showingText').textContent =
    totalEntries === 0 ? 'No entries found' : `Showing ${start + 1} to ${showEnd} of ${totalEntries} entries`;

  syncSelectAllCheckbox();
  renderPagination(totalPages);
}

function updatePasswordHint(isEditing) {
  const field = document.getElementById('fieldPassword');
  field.placeholder = isEditing ? 'Leave blank to keep current password' : 'Temporary password';
  field.required = !isEditing;
  document.getElementById('passwordRequirement').textContent = isEditing ? '(optional)' : '*';
  document.getElementById('passwordRequirement').className = isEditing ? 'optional' : 'required';
  document.getElementById('passwordHelp').textContent = isEditing
    ? 'Leave blank to keep the current password. Enter a new password only to reset it.'
    : 'A password is required for new users.';
}

function openEdit(id) {
  const user = allUsers.find(u => u.userID === id);
  if (!user) return;
  editingId = id;
  updatePasswordHint(true);

  document.getElementById('modalTitle').textContent   = 'Edit User';
  document.getElementById('fieldFirstName').value     = user.firstName;
  document.getElementById('fieldLastName').value      = user.lastName;
  document.getElementById('fieldEmail').value         = user.email;
  document.getElementById('fieldPassword').value      = '';
  document.getElementById('fieldContact').value       = user.contactNumber || '';
  document.getElementById('fieldStudentNumber').value = user.studentNumber || '';
  document.getElementById('fieldRole').value          = user.role;
  document.getElementById('fieldGender').value        = user.gender || '';

  const isMentor = user.role === 'Mentor';
  const isMentee = user.role === 'Mentee';

  document.getElementById('mentorFields').style.display = isMentor ? 'block' : 'none';
  document.getElementById('menteeFields').style.display = isMentee ? 'block' : 'none';

  if (isMentor) {
    const mentorData = allMentorsWithDept.find(m => m.userID === user.userID);
    document.getElementById('fieldMentorSchool').value = mentorData?.school || (crossSchoolMentor(mentorData || {}) ? NO_SCHOOL : '');
    if (document.getElementById('fieldMentorSchool').value) {
      loadMentorDepts();
      setTimeout(() => {
        document.getElementById('fieldMentorDept').value = mentorData?.departmentID || '';
      }, 0);
    } else {
      document.getElementById('fieldMentorDept').innerHTML =
        '<option value="" disabled selected>Select school first...</option>';
    }
  }

  if (isMentee) {
    const menteeData = allMenteesWithDept.find(m => m.userID === user.userID);
    document.getElementById('fieldMenteeSchool').value = menteeData?.school    || '';
    document.getElementById('fieldYearLevel').value    = menteeData?.yearLevel || '1st Year';

    // Cascade: school → course → section
    loadMenteeCoursesForSchool();
    if (menteeData?.course) {
      const courseSelect = document.getElementById('fieldCourse');
      const exists = [...courseSelect.options].some(o => o.value === menteeData.course);
      if (!exists) courseSelect.innerHTML += `<option value="${menteeData.course}">${menteeData.course}</option>`;
      courseSelect.value = menteeData.course;
      loadMenteeSections();
    }
    if (menteeData?.sectionID) {
      setTimeout(() => {
        document.getElementById('fieldSectionID').value = menteeData.sectionID;
      }, 0);
    }

    document.getElementById('menteeAssignMentorGroup').style.display = 'none';
    document.getElementById('fieldMenteeAssignMentor').innerHTML =
      '<option value="" disabled selected>Select school first...</option>';
  }

  const assignSection = document.getElementById('editAssignSection');
  if (isMentee) {
    const status = getUserStatus(user);
    if (status.label === 'Drop Out') {
      assignSection.style.display = 'none';
    } else {
      const currentMentorId = allAssignments.find(a => a.menteeUserID === user.userID && a.isActive)?.mentorUserID || null;
      document.getElementById('editAssignTitle').textContent = currentMentorId ? 'Reassign Mentor' : 'Assign Mentor';
      assignSection.style.display = 'block';
      populateEditAssignMentorDropdown(user, currentMentorId);
    }
  } else {
    assignSection.style.display = 'none';
  }

  document.getElementById('modalOverlay').classList.add('active');
}

function populateEditAssignMentorDropdown(menteeUser, currentMentorId = null) {
  const menteeData      = allMenteesWithDept.find(m => m.userID === menteeUser.userID);
  renderMentorOptions(document.getElementById('editModalMentorSelect'), menteeData?.school || '', currentMentorId);
}


function openAdd() {
  editingId = null;
  updatePasswordHint(false);
  document.getElementById('modalTitle').textContent    = 'Add New User';
  document.getElementById('fieldFirstName').value      = '';
  document.getElementById('fieldLastName').value       = '';
  document.getElementById('fieldEmail').value          = '';
  document.getElementById('fieldPassword').value       = '';
  document.getElementById('fieldContact').value        = '';
  document.getElementById('fieldStudentNumber').value  = '';
  document.getElementById('fieldRole').value           = '';
  document.getElementById('fieldGender').value         = '';
  document.getElementById('fieldMentorSchool').value   = '';
  document.getElementById('fieldMentorDept').innerHTML = '<option value="" disabled selected>Select school first...</option>';
  document.getElementById('fieldMenteeSchool').value   = '';
  document.getElementById('fieldMenteeAssignMentor').innerHTML = '<option value="" disabled selected>Select school first...</option>';
  document.getElementById('fieldCourse').innerHTML     = '<option value="" disabled selected>Select school first...</option>';
  document.getElementById('fieldYearLevel').value      = '1st Year';
  document.getElementById('fieldSectionID').innerHTML  = '<option value="" disabled selected>Select school first...</option>';
  document.getElementById('mentorFields').style.display        = 'none';
  document.getElementById('menteeFields').style.display        = 'none';
  document.getElementById('editAssignSection').style.display   = 'none';
  document.getElementById('menteeAssignMentorGroup').style.display = '';
  document.getElementById('modalOverlay').classList.add('active');
}

function handleRoleChange() {
  const role = document.getElementById('fieldRole').value;
  document.getElementById('mentorFields').style.display      = role === 'Mentor' ? 'block' : 'none';
  document.getElementById('menteeFields').style.display      = role === 'Mentee' ? 'block' : 'none';
  document.getElementById('editAssignSection').style.display = 'none';
  document.getElementById('fieldMenteeSchool').value         = '';
  document.getElementById('fieldMenteeAssignMentor').innerHTML = '<option value="" disabled selected>Select school first...</option>';
  document.getElementById('menteeAssignMentorGroup').style.display = '';
}

async function safeRegister(endpoint, body) {
  const url   = CONFIG.getUrl(endpoint);
  const token = getSession()?.token;
  const res   = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  // Prefer explicit message; fall back to ASP.NET validation errors
  const errMsg = data.message
    || (data.errors ? Object.values(data.errors).flat().join('; ') : null)
    || data.title
    || `Error ${res.status}`;
  console.error(`[safeRegister] ${endpoint} →`, res.status, data);
  throw new Error(errMsg);
}

// Confirms before saveUser() — every account-changing action asks first, adds included.
function openSaveUserConfirm() {
  const firstName     = document.getElementById('fieldFirstName').value.trim();
  const lastName      = document.getElementById('fieldLastName').value.trim();
  const email         = document.getElementById('fieldEmail').value.trim();
  const password      = document.getElementById('fieldPassword').value;
  const role          = document.getElementById('fieldRole').value;
  const studentNumber = document.getElementById('fieldStudentNumber').value.trim();
  const gender        = document.getElementById('fieldGender').value;

  if (!firstName || !lastName || !email || !role) {
    showErrorModal('Please fill in all required fields (First Name, Last Name, Email, Role).');
    return;
  }
  if (!editingId && !password) {
    showErrorModal('A password is required when creating a new user.');
    return;
  }
  if (!gender) {
    showErrorModal('Please select a gender.');
    return;
  }
  if (!studentNumber) {
    showErrorModal('ID Number is required.');
    return;
  }

  if(role==='Mentee' && !validSchoolCourse(document.getElementById('fieldMenteeSchool').value,document.getElementById('fieldCourse').value)) {
    showErrorModal('Choose a valid course for the selected school. Sections are not required.');return;
  }

  const name = `${escapeHtml(firstName)} ${escapeHtml(lastName)}`;
  document.getElementById('saveUserConfirmTitle').textContent = editingId ? 'Save Changes?' : 'Add New User?';
  document.getElementById('saveUserConfirmMsg').innerHTML = editingId
    ? `Are you sure you want to save these changes to <strong>${name}</strong>'s account?`
    : `Are you sure you want to add <strong>${name}</strong> as a new ${escapeHtml(role)}?`;
  document.getElementById('saveUserConfirmBtn').textContent = editingId ? 'Save Changes' : 'Add User';
  document.getElementById('saveUserConfirmModal').style.display = 'flex';
}

function closeSaveUserConfirmModal() {
  document.getElementById('saveUserConfirmModal').style.display = 'none';
}

async function confirmSaveUser() {
  const isEdit = !!editingId;
  const saved  = await runBusy(document.getElementById('saveUserConfirmBtn'), 'Saving…', saveUser);
  closeSaveUserConfirmModal();
  if (saved) showStatusSuccess(isEdit ? 'Changes Saved' : 'User Added',
    isEdit ? 'The account has been updated.' : 'The new account has been created.');
}

async function saveUser() {
  const firstName     = document.getElementById('fieldFirstName').value.trim();
  const lastName      = document.getElementById('fieldLastName').value.trim();
  const email         = document.getElementById('fieldEmail').value.trim();
  const password      = document.getElementById('fieldPassword').value;
  const contactNumber = document.getElementById('fieldContact').value.trim();
  const role          = document.getElementById('fieldRole').value;
  const studentNumber = document.getElementById('fieldStudentNumber').value.trim() || null;
  const gender        = document.getElementById('fieldGender').value || null;

  if (!firstName || !lastName || !email || !role) {
    showErrorModal('Please fill in all required fields (First Name, Last Name, Email, Role).');
    return;
  }
  if (!editingId && !password) {
    showErrorModal('A password is required when creating a new user.');
    return;
  }
  if (!gender) {
    showErrorModal('Please select a gender.');
    return;
  }
  if (!studentNumber) {
    showErrorModal('ID Number is required.');
    return;
  }

  try {
    if (editingId) {
      const updatePayload = {
        firstName, lastName, email,
        newPassword:   password || null,
        contactNumber, studentNumber, role, gender
      };

      if (role === 'Mentor') {
        updatePayload.school       = mentorSchoolValue();
        updatePayload.departmentID = parseInt(document.getElementById('fieldMentorDept').value) || null;
      }

      if (role === 'Mentee') {
        const sectionID = parseInt(document.getElementById('fieldSectionID').value) || null;
        const selSec    = sectionID ? allSections.find(s => s.sectionID === sectionID) : null;
        updatePayload.school     = document.getElementById('fieldMenteeSchool').value || null;
        updatePayload.course     = document.getElementById('fieldCourse').value.trim();
        updatePayload.yearLevel  = document.getElementById('fieldYearLevel').value || null;
      }

      await apiRequest(`Users/${editingId}`, 'PUT', updatePayload, true);

      // Two different pickers can hold the chosen mentor: editModalMentorSelect
      // (an existing Unassigned/Pending mentee) or fieldMenteeAssignMentor
      // (switching a role to Mentee mid-edit shows this one instead, per
      // handleRoleChange). Whichever is actually visible is the one the
      // admin used.
      const assignSection = document.getElementById('editAssignSection');
      const assignGroup   = document.getElementById('menteeAssignMentorGroup');
      const mentorId = assignSection.style.display !== 'none'
        ? parseInt(document.getElementById('editModalMentorSelect').value)
        : assignGroup.style.display !== 'none'
          ? parseInt(document.getElementById('fieldMenteeAssignMentor').value)
          : NaN;
      if (mentorId) {
        await apiRequest('Users/assign', 'POST', {
          menteeUserId: editingId,
          mentorUserId: mentorId
        }, true);
      }

    } else if (role === 'Mentor') {
      const school       = mentorSchoolValue();
      const departmentID = parseInt(document.getElementById('fieldMentorDept').value) || null;
      if (!document.getElementById('fieldMentorSchool').value) { showErrorModal('Please select a school for the mentor.'); return; }
      if (!departmentID) { showErrorModal('Please select a department for the mentor.'); return; }
      await safeRegister('Auth/register-mentor', {
        firstName, lastName, email, password, contactNumber, studentNumber,
        school, departmentID, gender
      });

    } else if (role === 'Mentee') {
      const school    = document.getElementById('fieldMenteeSchool').value;
      const sectionID = parseInt(document.getElementById('fieldSectionID').value) || null;
      const selSec    = sectionID ? allSections.find(s => s.sectionID === sectionID) : null;
      const course    = document.getElementById('fieldCourse').value.trim();
      const yearLevel = document.getElementById('fieldYearLevel').value;
      const section   = null;
      const mentorId  = parseInt(document.getElementById('fieldMenteeAssignMentor').value) || null;
      if (!school) { showErrorModal('Please select a school for the mentee.'); return; }

      await safeRegister('Auth/register-mentee', {
        firstName, lastName, email, password, contactNumber, studentNumber,
        school, course, yearLevel, section, sectionID:null, gender
      });

      if (mentorId) {
        const freshUsers = await apiRequest('Users', 'GET', null, true);
        const newUser    = (freshUsers || []).find(u => u.email === email);
        if (newUser) {
          await apiRequest('Users/assign', 'POST', {
            menteeUserId: newUser.userID,
            mentorUserId: mentorId
          }, true);
        }
      }

    } else {
      await apiRequest('Auth/register', 'POST', {
        firstName, lastName, email, password, contactNumber, studentNumber, role, gender
      }, true);
    }

    closeModal();
    await fetchUsers();
    if (sectionsTabLoaded) fetchSectionMentorView();
    return true;

  } catch (err) {
    showErrorModal(friendlyError(err));
  }
}

// Used to be a true hard-delete (DELETE Users/{id} -> sp_DeleteUser) --
// permanently erased the account and every related record (sessions,
// attendance, assignment history), incompatible with everything this
// system now preserves on purpose. Routes to the same reversible
// Drop Out (Mentee) / Deactivate (everyone else) flow already used from
// the Edit modal instead — no new backend endpoint needed, both already
// existed (Users/{id}/dropout, Users/{id}/active).
// Row ⋮ menu: each item opens the existing confirmation for that action.
function openRowMenu(event, id) {
  event.stopPropagation();
  const user = allUsers.find(u => u.userID === id);
  if (!user) return;
  const isSelf = String(id) === String(getSession()?.user?.userID ?? '');
  if (isSelf) { showToast('You cannot modify your own account.', 'error'); return; }

  const menu = document.getElementById('rowActionMenu') || (() => {
    const el = document.createElement('div');
    el.id = 'rowActionMenu';
    el.className = 'row-action-menu';
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
    return el;
  })();
  const trigger = event.currentTarget;
  if (menu.style.display === 'block' && menu.dataset.userId === String(id)) { closeRowMenu(); return; }

  const items = [];
  if (user.role === 'Mentee' && user.isActive !== false) {
    const isDropOut = allMenteesWithDept.find(m => m.userID === id)?.isDropOut;
    items.push(['dropout', isDropOut ? 'Reinstate' : 'Mark as Drop Out', '']);
  }
  items.push(['active', user.isActive === false ? 'Reactivate account' : 'Deactivate account', '']);
  items.push(['delete', 'Permanently delete', 'danger']);
  menu.innerHTML = items.map(([action, label, cls]) =>
    `<button type="button" role="menuitem" class="row-action-item ${cls}" data-action="${action}">${label}</button>`).join('');
  menu.querySelectorAll('.row-action-item').forEach(btn =>
    btn.addEventListener('click', () => rowMenuAction(btn.dataset.action, id)));

  menu.dataset.userId = String(id);
  menu.style.display = 'block';
  const r = trigger.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8));
  const top  = r.bottom + 4 + menu.offsetHeight > innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom + 4;
  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;
}

function closeRowMenu() {
  const menu = document.getElementById('rowActionMenu');
  if (menu) { menu.style.display = 'none'; delete menu.dataset.userId; }
}

function rowMenuAction(action, id) {
  closeRowMenu();
  editingId = id;
  if (action === 'dropout') openDropOutConfirm();
  else if (action === 'active') openActiveConfirm();
  else if (action === 'delete') openPermanentDeleteConfirm();
}

document.addEventListener('click', e => { if (!e.target.closest('#rowActionMenu')) closeRowMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRowMenu(); });
window.addEventListener('scroll', closeRowMenu, true);
window.addEventListener('resize', closeRowMenu);

function openDropOutConfirm() {
  const user = allUsers.find(u => u.userID === editingId);
  if (!user) return;

  const menteeData        = allMenteesWithDept.find(m => m.userID === editingId);
  const isCurrentlyDropOut = menteeData?.isDropOut || false;
  const name              = `${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}`;

  dropOutTargetId  = editingId;
  dropOutTargetNew = !isCurrentlyDropOut;

  document.getElementById('modalOverlay').classList.remove('active');

  const icon    = document.getElementById('doModalIcon');
  const title   = document.getElementById('doModalTitle');
  const msg     = document.getElementById('doModalMsg');
  const confirm = document.getElementById('doConfirmBtn');

  confirm.disabled = false;

  if (dropOutTargetNew) {
    icon.className      = 'info-modal-icon do-dropout';
    icon.innerHTML      = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="17"/><line x1="23" y1="11" x2="17" y2="17"/></svg>';
    title.textContent   = 'Mark as Dropped Out';
    msg.innerHTML       = `Are you sure you want to mark <strong>${name}</strong> as Drop Out? Their status will be updated across the system.`;
    confirm.textContent = 'Mark as Dropped Out';
    confirm.className   = 'btn-danger do-confirm-btn';
  } else {
    icon.className      = 'info-modal-icon do-reactivate';
    icon.innerHTML      = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';
    title.textContent   = 'Reinstate Mentee';
    msg.innerHTML       = `Are you sure you want to reinstate <strong>${name}</strong>? Their Drop Out status will be removed.`;
    confirm.textContent = 'Reinstate';
    confirm.className   = 'btn-primary do-confirm-btn';
  }

  document.getElementById('dropOutModal').style.display = 'flex';
}

function closeDropOutModal() {
  document.getElementById('dropOutModal').style.display = 'none';
  dropOutTargetId = dropOutTargetNew = null;
}

async function confirmDropOut() {
  if (dropOutTargetId === null) return;
  const btn = document.getElementById('doConfirmBtn');
  btn.disabled = true;
  try {
    await apiRequest(`Users/${dropOutTargetId}/dropout`, 'PATCH', { isDropOut: dropOutTargetNew }, true);
    const droppedOut = dropOutTargetNew;
    closeDropOutModal();
    await fetchUsers();
    showStatusSuccess(droppedOut ? 'Mentee Marked as Dropped Out' : 'Mentee Reinstated',
      droppedOut ? 'The mentee is now marked as Dropped Out. Existing records have been retained.' : 'The mentee\'s Dropped Out status has been removed. Existing records have been retained.');
  } catch (err) {
    btn.disabled = false;
    showErrorModal('Failed to update Drop Out status. Please try again.');
  }
}

function openActiveConfirm() {
  const user = allUsers.find(u => u.userID === editingId);
  if (!user) return;

  const isCurrentlyActive = user.isActive !== false;
  const name               = `${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}`;

  activeTargetId  = editingId;
  activeTargetNew = !isCurrentlyActive;

  document.getElementById('modalOverlay').classList.remove('active');

  const icon    = document.getElementById('actModalIcon');
  const title   = document.getElementById('actModalTitle');
  const msg     = document.getElementById('actModalMsg');
  const confirm = document.getElementById('actConfirmBtn');

  confirm.disabled = false;

  if (!activeTargetNew) {
    // Deactivating
    icon.className      = 'info-modal-icon do-dropout';
    icon.innerHTML       = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
    title.textContent   = 'Deactivate Account';
    msg.innerHTML       = `Are you sure you want to deactivate <strong>${name}</strong>'s account? They will no longer be able to log in until reactivated.`;
    confirm.textContent = 'Deactivate';
    confirm.className   = 'btn-danger do-confirm-btn';
  } else {
    // Reactivating
    icon.className      = 'info-modal-icon do-reactivate';
    icon.innerHTML       = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';
    title.textContent   = 'Reactivate Account';
    msg.innerHTML       = `Are you sure you want to reactivate <strong>${name}</strong>'s account? They will be able to log in again.`;
    confirm.textContent = 'Reactivate';
    confirm.className   = 'btn-primary do-confirm-btn';
  }

  document.getElementById('activeModal').style.display = 'flex';
}

function closeActiveModal() {
  document.getElementById('activeModal').style.display = 'none';
  activeTargetId = activeTargetNew = null;
}

async function confirmActiveToggle() {
  if (activeTargetId === null) return;
  const btn = document.getElementById('actConfirmBtn');
  btn.disabled = true;
  try {
    await apiRequest(`Users/${activeTargetId}/active`, 'PATCH', { isActive: activeTargetNew }, true);
    const activated = activeTargetNew;
    closeActiveModal();
    // allMentorsWithDept is a separate cache from allUsers — without
    // refreshing it too, a just-deactivated mentor keeps showing up as
    // assignable in every "Assign Mentor" dropdown until the next full
    // page load, since those dropdowns read from this array, not allUsers.
    await Promise.all([fetchUsers(), fetchMentorsWithDept()]);
    showStatusSuccess(activated ? 'Account Reactivated' : 'Account Deactivated',
      activated ? 'The account can log in again. Existing records have been retained.' : 'The account can no longer log in. Existing records have been retained.');
  } catch (err) {
    btn.disabled = false;
    showErrorModal(err.message || 'Failed to update account status. Please try again.');
  }
}

// ── PERMANENT DELETE (true hard-delete, kept as a rare, deliberately
//    separate escape hatch — e.g. an accidental duplicate account with no
//    real history. Everyone else should use Drop Out / Deactivate above,
//    which preserve records and can be undone; this cannot. ─────────────
let permanentDeleteTargetId = null;

// Opened from the row ⋮ menu.
function openPermanentDeleteConfirm() {
  const user = allUsers.find(u => u.userID === editingId);
  if (!user) { showToast('Could not find this account. Please reopen it and try again.', 'error'); return; }
  const isSelf = String(editingId) === String(getSession()?.user?.userID ?? '');
  if (isSelf) { showDeleteBlocked({ user, kind: 'self' }); return; }
  const blocked = clientDeleteBlock(user);
  if (blocked) { showDeleteBlocked({ user, kind: blocked }); return; }

  permanentDeleteTargetId = editingId;
  document.getElementById('permanentDeleteMessage').innerHTML =
    `Are you sure you want to permanently delete <strong>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</strong>'s account? This erases all related data and cannot be undone.`;
  document.getElementById('permanentDeleteModal').style.display = 'flex';
}

function closePermanentDeleteModal() {
  document.getElementById('permanentDeleteModal').style.display = 'none';
  permanentDeleteTargetId = null;
}

async function confirmPermanentDelete() {
  if (permanentDeleteTargetId === null) return;
  const targetId = permanentDeleteTargetId;
  const user = allUsers.find(u => u.userID === targetId);
  const name = user ? `${user.firstName} ${user.lastName}` : 'The account';
  try {
    await runBusy(document.getElementById('permanentDeleteConfirmBtn'), 'Deleting…', async () => {
      await apiRequest(`Users/${targetId}`, 'DELETE', null, true);
      closeModal();
      await fetchUsers();
      if (sectionsTabLoaded) fetchSectionMentorView();
    });
    closePermanentDeleteModal();
    showStatusSuccess('Account Deleted', `${name}'s account has been permanently deleted.`);
  } catch (err) {
    closePermanentDeleteModal();
    if (err && err.status === 400 && user) {
      showDeleteBlocked({ user, kind: classifyDeleteBlock(user, err.message), message: err.message });
    } else {
      showErrorModal(err.message || 'Failed to delete account. Please try again.');
    }
  }
}

// ── "Can't delete" explainer ────────────────────────────────────────
// Turns the reasons an account can't be hard-deleted into a clear message
// with the next step, instead of a bare error popup.
const DB_ICONS = {
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
};

// Reasons we can tell from data the page already has (no server round trip).
function clientDeleteBlock(user) {
  if (user.role === 'Mentee') {
    const m = allMenteesWithDept.find(x => x.userID === user.userID);
    if (m?.isDropOut) return 'dropout';
  }
  return null;
}

// Maps the server's message to a scenario.
function classifyDeleteBlock(user, message = '') {
  const t = message.toLowerCase();
  if (t.includes('drop out') && t.includes('marked as')) return 'dropout';
  if (t.includes('only active administrator')) return 'lastAdmin';
  if (t.includes('assigned to a mentor') || t.includes('active mentee assignment')) return 'assigned';
  if (t.includes('announcements') || t.includes('evaluation links')) return 'posts';
  if (t.includes('sessions') || t.includes('makeup')) return user?.role === 'Mentee' ? 'sharedHistory' : 'history';
  return 'generic';
}

function deleteBlockContent(kind, user) {
  const name = user ? `${user.firstName} ${user.lastName}` : 'this account';
  const isMentee = user?.role === 'Mentee';
  const act = {
    reinstate:   { label: 'Reinstate student',  primary: true, run: () => { editingId = user.userID; openDropOutConfirm(); } },
    assignments: { label: 'Go to Assignments',  primary: true, run: () => switchTab('assignments') },
    deactivate:  { label: 'Deactivate instead', primary: true, run: () => { editingId = user.userID; openActiveConfirm(); } },
    dropout:     { label: 'Mark as Drop Out',   primary: true, run: () => { editingId = user.userID; openDropOutConfirm(); } }
  };
  switch (kind) {
    case 'self':
      return { icon: 'lock', tone: 'stop', title: "You can't delete your own account",
        reason: 'Deleting the account you are signed in with would lock you out of the system.',
        steps: ['Ask another administrator to remove this account if it is no longer needed.'], actions: [] };
    case 'dropout':
      return { icon: 'lock', tone: 'warn', title: "Can't delete a dropped-out student",
        reason: `${name} is marked as Drop Out. Their attendance and assignment history are kept for reporting, so a dropped-out student can't be permanently deleted.`,
        steps: ['Keep the student as Drop Out. Nothing else is needed.',
                'Only if the account must truly be erased (for example an accidental duplicate): reinstate the student first, then delete.'],
        actions: [act.reinstate] };
    case 'assigned':
      return { icon: 'info', tone: 'warn', title: isMentee ? 'Student is still assigned to a mentor' : 'Mentor still has active mentees',
        reason: isMentee
          ? `${name} is currently assigned to a mentor, so their account can't be deleted yet.`
          : `${name} still has mentees assigned to them, so their account can't be deleted yet.`,
        steps: ['Open the Assignments tab and remove or reassign the active assignments.',
                'Then try deleting again, or use ' + (isMentee ? 'Drop Out' : 'Deactivate') + ' to keep the history.'],
        actions: [act.assignments, isMentee ? act.dropout : act.deactivate] };
    case 'history':
      return { icon: 'lock', tone: 'warn', title: 'This mentor has session history',
        reason: `${name} has conducted sessions with mentee attendance on record. Deleting the account would also erase those mentees' records.`,
        steps: ['Deactivate the account. It keeps all history and can be reactivated later.'], actions: [act.deactivate] };
    case 'sharedHistory':
      return { icon: 'lock', tone: 'warn', title: 'Student shares records with others',
        reason: `${name} shares a makeup session with other students. Deleting the account would also affect their records.`,
        steps: ['Mark the student as Drop Out. It keeps the shared records intact.'], actions: [act.dropout] };
    case 'posts':
      return { icon: 'lock', tone: 'warn', title: 'This account has posted content',
        reason: `${name} has posted announcements or evaluation links that other users have commented on or answered. Deleting the account would erase those too.`,
        steps: ['Deactivate the account. The posts and replies stay.'], actions: [act.deactivate] };
    case 'lastAdmin':
      return { icon: 'lock', tone: 'stop', title: 'This is the only active admin',
        reason: 'Deleting the last active administrator would leave nobody able to manage the system.',
        steps: ['Create or activate another admin account first, then try again.'], actions: [] };
    default:
      return { icon: 'info', tone: 'warn', title: "This account can't be deleted",
        reason: null,
        steps: ['Use Deactivate' + (isMentee ? ' or Drop Out' : '') + ' instead. Both keep records and can be undone.'],
        actions: [act.deactivate] };
  }
}

function showDeleteBlocked({ user, kind, message, deleted, failures }) {
  const $ = id => document.getElementById(id);
  const esc = escapeHtml;
  $('dbList').style.display = 'none';
  $('dbList').innerHTML = '';
  const actions = [];

  if (kind === 'bulk') {
    $('dbIcon').className = 'db-icon warn';
    $('dbIcon').innerHTML = DB_ICONS.info;
    $('dbTitle').textContent = deleted > 0 ? 'Some accounts were deleted' : "These accounts can't be deleted";
    $('dbSubject').innerHTML = (deleted > 0 ? `<span class="db-chip role">${deleted} deleted</span>` : '') +
      `<span class="db-chip status">${failures.length} not deleted</span>`;
    $('dbReason').textContent = 'These accounts have records that must be kept, so they were left as they are:';
    $('dbList').style.display = '';
    $('dbList').innerHTML = failures.map(f =>
      `<li><strong>${esc(f.name)}${f.user ? ' · ' + esc(f.user.role) : ''}</strong>${esc(f.message)}</li>`).join('');
    $('dbSteps').innerHTML = '<h4>What you can do</h4><ol><li>Use <b>Deactivate</b> (or <b>Drop Out</b> for students). Both keep records and can be undone.</li></ol>';
  } else {
    const c = deleteBlockContent(kind, user);
    $('dbIcon').className = 'db-icon ' + c.tone;
    $('dbIcon').innerHTML = DB_ICONS[c.icon];
    $('dbTitle').textContent = c.title;
    const status = !user ? '' : (kind === 'dropout' ? '<span class="db-chip status">Drop Out</span>'
                   : user.isActive === false ? '<span class="db-chip status">Inactive</span>' : '');
    $('dbSubject').innerHTML = user
      ? `<span class="db-chip">${esc(user.firstName)} ${esc(user.lastName)}</span><span class="db-chip role">${esc(user.role)}</span>${status}` : '';
    // Use the server's own wording for a case that has no scripted explanation.
    $('dbReason').textContent = c.reason || message || 'This account has records that must be kept.';
    $('dbSteps').innerHTML = c.steps.length ? '<h4>What you can do</h4><ol>' + c.steps.map(s => `<li>${esc(s)}</li>`).join('') + '</ol>' : '';
    actions.push(...c.actions);
  }

  const box = $('dbActions');
  box.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.primary ? 'primary' : '';
    b.textContent = a.label;
    b.addEventListener('click', () => { hideDeleteBlocked(); a.run(); });
    box.appendChild(b);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', hideDeleteBlocked);
  box.appendChild(close);

  $('deleteBlockedModal').style.display = 'flex';
}

function hideDeleteBlocked() {
  document.getElementById('deleteBlockedModal').style.display = 'none';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideDeleteBlocked(); });

// ── BULK PERMANENT DELETE — same true hard-delete, applied to every
//    selected user. Excludes the caller's own row the same way the single
//    and soft bulk actions do. ────────────────────────────────────────
function openBulkPermanentDeleteModal() {
  if (selectedUserIds.size === 0) return;
  const selfId = String(getSession()?.user?.userID ?? '');
  const n = Array.from(selectedUserIds).filter(id => String(id) !== selfId).length;
  if (n === 0) { showToast('You cannot delete your own account.', 'error'); return; }

  document.getElementById('bulkPermanentDeleteMessage').innerHTML =
    `This permanently erases <strong>${n} account${n > 1 ? 's' : ''}</strong> and all related data. This cannot be undone.`;
  document.getElementById('bulkPermanentDeleteConfirmBtn').disabled = false;
  document.getElementById('bulkPermanentDeleteModal').style.display = 'flex';
}

function closeBulkPermanentDeleteModal() {
  document.getElementById('bulkPermanentDeleteModal').style.display = 'none';
}

async function confirmBulkPermanentDelete() {
  const selfId = String(getSession()?.user?.userID ?? '');
  const ids = Array.from(selectedUserIds).filter(id => String(id) !== selfId);
  // Collect WHY each one failed instead of just a count — the API already
  // returns a specific reason (e.g. "this mentor has session history"),
  // no reason to make the admin guess which of the selected accounts it
  // was or why.
  const failures = [];
  await runBusy(document.getElementById('bulkPermanentDeleteConfirmBtn'), 'Deleting…', async () => {
    for (const id of ids) {
      try {
        await apiRequest(`Users/${id}`, 'DELETE', null, true);
      } catch (e) {
        const user = allUsers.find(u => u.userID === id);
        const name = user ? `${user.firstName} ${user.lastName}` : `User #${id}`;
        failures.push({ name, user, message: e.message || 'Unknown error' });
      }
    }
    selectedUserIds.clear();
    updateBulkDeleteBtn();
    await fetchUsers();
    if (sectionsTabLoaded) fetchSectionMentorView();
  });
  closeBulkPermanentDeleteModal();
  const deleted = ids.length - failures.length;
  if (failures.length > 0) {
    showDeleteBlocked({ kind: 'bulk', deleted, failures });
  } else if (deleted > 0) {
    showStatusSuccess('Accounts Deleted', `${deleted} account(s) have been permanently deleted.`);
  }
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination');
  const pages = smartPages(currentPage, totalPages);
  let html = `<button class="page-btn page-icon" title="First page" aria-label="First page" onclick="goPage(1)" ${currentPage === 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg></button>`;
  html += `<button class="page-btn page-icon" title="Previous page" aria-label="Previous page" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>`;
  pages.forEach(p => {
    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn page-icon" title="Next page" aria-label="Next page" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`;
  html += `<button class="page-btn page-icon" title="Last page" aria-label="Last page" onclick="goPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg></button>`;
  container.innerHTML = html;
}

function goPage(p) {
  const totalPages = Math.max(1, Math.ceil(getFiltered().length / ROWS_PER_PAGE));
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  renderTable();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  const engagementLabels = {
    all: 'All active mentee accounts',
    attended: 'Attended this semester',
    'no-attendance': 'No attendance this semester',
    excellent: 'Excellent attendance',
    'on-track': 'On Track attendance',
    'needs-attention': 'Needs Attention',
    'no-completed-sessions': 'No Completed Sessions',
    unassigned: 'Unassigned mentees',
    'dropped-out': 'Dropped Out mentees',
  };
  const requestedEngagement = new URLSearchParams(window.location.search).get('engagement') || '';
  dashboardEngagementFilter = Object.hasOwn(engagementLabels, requestedEngagement) ? requestedEngagement : '';
  if (dashboardEngagementFilter) {
    document.getElementById('roleFilter').value = 'Mentee';
    const description = document.querySelector('#tab-users .tab-desc');
    if (description) description.textContent = `Mentees — ${engagementLabels[dashboardEngagementFilter]} · Current semester`;
  }

  const dateEl = document.getElementById('umDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  const searchInput = document.getElementById('searchInput');
  searchInput.value = '';
  setTimeout(() => { searchInput.value = ''; }, 100);
  setTimeout(() => { searchInput.value = ''; }, 300);

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) {
      window.location.href = '/LOGIN/HTML/login.html';
    } else {
      window.history.pushState(null, '', window.location.href);
    }
  });

  // Tooltip: position:fixed so it's never clipped by table overflow
  document.querySelectorAll('.status-th').forEach(th => {
    const icon    = th.querySelector('.status-tip-icon');
    const tooltip = th.querySelector('.status-tooltip');
    if (!icon || !tooltip) return;
    th.addEventListener('mouseenter', () => {
      const r = icon.getBoundingClientRect();
      tooltip.style.top       = (r.bottom + 6) + 'px';
      tooltip.style.left      = (r.left + r.width / 2) + 'px';
      tooltip.style.transform = 'translateX(-50%)';
      tooltip.style.display   = 'block';
    });
    th.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });

  fetchDepartments();
  fetchSections();
  fetchUsers();
  document.getElementById('addUserBtn').addEventListener('click', openAdd);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', openSaveUserConfirm);
  document.getElementById('fieldRole').addEventListener('change', handleRoleChange);
  document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderTable(); });
  document.getElementById('roleFilter').addEventListener('change', () => {
    if (dashboardEngagementFilter && document.getElementById('roleFilter').value !== 'Mentee') {
      dashboardEngagementFilter = '';
      dashboardEngagementByUser = new Map();
      const description = document.querySelector('#tab-users .tab-desc');
      if (description) description.textContent = 'Manage users, assignments, and view sections';
    }
    currentPage = 1;
    renderTable();
  });
  document.getElementById('schoolFilter')?.addEventListener('change', () => {
    const school = document.getElementById('schoolFilter').value;
    populateDeptFilterForSchool(school);
    document.getElementById('deptFilter').value = '';
    currentPage = 1;
    renderTable();
  });
  document.getElementById('deptFilter')?.addEventListener('change', () => { currentPage = 1; renderTable(); });
  document.getElementById('genderFilter')?.addEventListener('change', () => { currentPage = 1; renderTable(); });
  document.getElementById('userStatusFilter')?.addEventListener('change', () => { currentPage = 1; renderTable(); });
  document.getElementById('schoolYearFilter')?.addEventListener('change', () => { currentPage = 1; renderTable(); });
  document.getElementById('assignmentSearch')?.addEventListener('input', filterAssignments);
  document.getElementById('assignmentSchoolFilter')?.addEventListener('change', () => {
    populateMentorFilterDropdown();
    filterAssignments();
  });
  document.getElementById('assignmentMentorFilter')?.addEventListener('change', filterAssignments);
  document.getElementById('assignmentStatusFilter')?.addEventListener('change', filterAssignments);
  document.getElementById('selectAllCheckbox')?.addEventListener('change', e => toggleSelectAll(e.target.checked));
  document.getElementById('sectionSearch')?.addEventListener('input', renderSectionTab);
  document.getElementById('sectionDeptFilter')?.addEventListener('change', renderSectionTab);
  document.getElementById('fieldCourse')?.addEventListener('change', onMenteeCourseChange);
});

// Place the tab pill once layout (and fonts) are ready, and keep it aligned on resize.
window.addEventListener('load', () => updateTabPill(false));
window.addEventListener('resize', () => updateTabPill(false));
if (document.readyState !== 'loading') updateTabPill(false);
else document.addEventListener('DOMContentLoaded', () => updateTabPill(false));

// ── Rows per page (5 / 10 / 25), remembered per tab ──────────────────
function syncRowsPickers() {
  const set = (id, n) => document.querySelectorAll('#' + id + ' button').forEach(b => {
    const on = parseInt(b.dataset.n, 10) === n;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  set('rppUsers', ROWS_PER_PAGE);
  set('rppAssign', ASSIGNMENTS_PER_PAGE);
}
document.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('.rpp-group button');
  if (!btn) return;
  const n = parseInt(btn.dataset.n, 10);
  if (!ROW_CHOICES.includes(n)) return;
  const target = btn.closest('.rpp-group').dataset.target;
  try { localStorage.setItem(target === 'users' ? 'um_rows_users' : 'um_rows_assign', String(n)); } catch (err) {}
  if (target === 'users') { ROWS_PER_PAGE = n; currentPage = 1; renderTable(); }
  else { ASSIGNMENTS_PER_PAGE = n; assignmentPage = 1; renderAssignments(); }
  syncRowsPickers();
});
document.addEventListener('DOMContentLoaded', syncRowsPickers);

// ── Smooth table updates: rows ease in one by one and the table height animates ──
function smoothRender(wrap, render) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!wrap || reduce) { render(); return; }
  const from = wrap.offsetHeight;
  render();
  wrap.querySelectorAll('tbody tr').forEach((tr, i) => {
    tr.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
    tr.classList.remove('row-in');
    void tr.offsetWidth;
    tr.classList.add('row-in');
  });
  const to = wrap.offsetHeight;
  if (from === to) return;
  wrap.style.overflow = 'hidden';
  wrap.style.height = from + 'px';
  void wrap.offsetHeight;
  wrap.style.transition = 'height .34s cubic-bezier(.22, 1, .36, 1)';
  wrap.style.height = to + 'px';
  clearTimeout(wrap._smoothT);
  wrap._smoothT = setTimeout(() => {
    wrap.style.height = ''; wrap.style.transition = ''; wrap.style.overflow = '';
  }, 380);
}
(function patchTableRenders() {
  const baseUsers = renderTable;
  renderTable = function () {
    const body = document.getElementById('userTableBody');
    smoothRender(body && body.closest('.table-wrapper'), () => baseUsers.apply(this, arguments));
  };
  const baseAssign = renderAssignments;
  renderAssignments = function () {
    const body = document.getElementById('assignmentTableBody');
    smoothRender(body && body.closest('.table-wrapper'), () => baseAssign.apply(this, arguments));
  };
})();
