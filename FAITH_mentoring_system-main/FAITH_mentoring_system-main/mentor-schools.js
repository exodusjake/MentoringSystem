// School membership for mentors, based on their mentees' schools.
// A mentor can handle mentees from any school, so a school's cards and
// filters include every mentor who has at least one active mentee from
// that school. A mentor with no mentees falls back to their own school.
// Departments follow the mentees the same way (from their course).
// This holds for mentors with no school of their own (department-only, e.g.
// SAS) too; their department is also its own Department filter option.
// If assignments can't be loaded, everything falls back to the mentor's
// own school and department (the previous behavior).
const MentorSchools = (() => {
  // Department of every course, per school (same list as Admin User Management's
  // SCHOOL_COURSES / COLLEGE_DEPARTMENTS; keep them in sync).
  const COURSE_DEPARTMENTS = {
    'School of Technology': {
      COE:  ['BSECE', 'BSEE', 'BSCPE', 'BSIE'],
      CCIT: ['BSCS', 'BSIT', 'BSEMC'],
    },
    'School of Humanities': {
      CASE: ['BAC', 'BEEd', 'BSE-Eng', 'BSE-Math', 'BPE', 'BSESS'],
      CHC:  ['BSN', 'BSMLS', 'BSP'],
      CCJ:  ['BSCRIM', 'BFS'],
    },
    'School of Management': {
      CBMA: ['BSA', 'BSMA', 'BSENTREP', 'BSBA-MM', 'BSE'],
      CTHM: ['BSHM', 'BSTM'],
    },
  };
  // Departments under each school, in school-card order.
  const SCHOOL_DEPARTMENTS = Object.fromEntries(
    Object.entries(COURSE_DEPARTMENTS).map(([s, depts]) => [s, Object.keys(depts)]));
  const courseKey = c => String(c || '').trim().toUpperCase();
  const COURSE_INFO = new Map(); // course code -> { school, dept }
  Object.entries(COURSE_DEPARTMENTS).forEach(([school, depts]) =>
    Object.entries(depts).forEach(([dept, courses]) =>
      courses.forEach(c => COURSE_INFO.set(courseKey(c), { school, dept }))));
  const SCHOOL_DEPT_NAMES = new Set(Object.values(SCHOOL_DEPARTMENTS).flat());

  let byMentor = null; // mentorID -> Map(school -> active mentee count)
  let byMentorDept = null; // mentorID -> Map(department -> active mentee count)
  let byMentorCourse = null; // mentorID -> Set(course code) of active mentees
  let courseSchool = new Map(); // course code -> school
  let mentorOwnSchool = new Map(); // mentorID -> mentor's own school ('' if none)

  const idOf = m => m?.mentorID ?? m?.MentorID ?? m?.mentorId ?? m?.userID ?? m?.UserID;
  const ownSchool = m => m?.school ?? m?.School ?? '';
  const deptOf = m => m?.departmentName ?? m?.DepartmentName ?? m?.department ?? m?.Department ?? m?.mentorDepartment ?? '';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const courseDept = c => COURSE_INFO.get(courseKey(c))?.dept || '';
  const schoolOfCourse = c => COURSE_INFO.get(courseKey(c))?.school || courseSchool.get(courseKey(c)) || '';

  async function load() {
    try {
      const rows = await apiRequest('Users/assignments', 'GET', null, true);
      byMentor = new Map();
      byMentorDept = new Map();
      byMentorCourse = new Map();
      courseSchool = new Map();
      mentorOwnSchool = new Map();
      (rows || []).forEach(r => {
        mentorOwnSchool.set(r.mentorUserID, r.mentorSchool || '');
        const school = r.menteeSchool || '';
        if (!school) return;
        if (r.course) courseSchool.set(courseKey(r.course), school);
        if (r.isActive === false) return;
        if (!byMentor.has(r.mentorUserID)) byMentor.set(r.mentorUserID, new Map());
        const counts = byMentor.get(r.mentorUserID);
        counts.set(school, (counts.get(school) || 0) + 1);
        if (r.course) {
          if (!byMentorCourse.has(r.mentorUserID)) byMentorCourse.set(r.mentorUserID, new Set());
          byMentorCourse.get(r.mentorUserID).add(courseKey(r.course));
        }
        const dept = courseDept(r.course);
        if (!dept) return;
        if (!byMentorDept.has(r.mentorUserID)) byMentorDept.set(r.mentorUserID, new Map());
        const deptCounts = byMentorDept.get(r.mentorUserID);
        deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
      });
    } catch (e) {
      console.error('Could not load mentee schools; using mentor schools.', e);
      byMentor = null;
      byMentorDept = null;
      byMentorCourse = null;
    }
  }

  function hasSchool(mentor) {
    return !!(ownSchool(mentor) || mentorOwnSchool.get(idOf(mentor)));
  }

  function schoolsOf(mentor) {
    const counts = byMentor?.get(idOf(mentor));
    if (counts && counts.size) return [...counts.keys()];
    return ownSchool(mentor) ? [ownSchool(mentor)] : [];
  }

  function inSchool(mentor, school) {
    return !school || schoolsOf(mentor).includes(school);
  }

  // Mentees of this mentor who belong to the school.
  function menteesIn(mentor, school, fallbackCount = 0) {
    if (!byMentor) return ownSchool(mentor) === school ? fallbackCount : 0;
    return byMentor.get(idOf(mentor))?.get(school) || 0;
  }

  // Department of a mentor with no school (e.g. 'SAS'), or '' for everyone else.
  function noSchoolDept(mentor) {
    return hasSchool(mentor) ? '' : deptOf(mentor);
  }

  // A department option matches a mentor who has an active mentee whose course is
  // in that department; a mentor with no mentees matches their own department.
  // A no-school department (e.g. 'SAS') matches the mentors in it.
  function inDept(mentor, dept) {
    if (!dept) return true;
    if (!SCHOOL_DEPT_NAMES.has(dept)) return noSchoolDept(mentor) === dept;
    const counts = byMentorDept?.get(idOf(mentor));
    const hasMentees = !!byMentor?.get(idOf(mentor))?.size;
    if (byMentorDept && hasMentees) return !!counts?.has(dept);
    return deptOf(mentor) === dept;
  }

  // A session belongs to its course's school; sessions without a known
  // course (e.g. make-ups) follow the mentor.
  function sessionInSchool(record, school) {
    if (!school) return true;
    const mentor = { mentorID: record.mentorID, school: record.mentorSchool };
    const fromCourse = courseSchool.get(courseKey(record.sectionCode || record.courseCode));
    if (fromCourse) return fromCourse === school;
    return inSchool(mentor, school);
  }

  // Same idea for a department: the session's course decides it.
  function sessionInDept(record, dept) {
    if (!dept) return true;
    const mentor = { mentorID: record.mentorID, school: record.mentorSchool, department: record.mentorDepartment };
    if (!SCHOOL_DEPT_NAMES.has(dept)) return noSchoolDept(mentor) === dept;
    const fromCourse = courseDept(record.sectionCode || record.courseCode);
    if (fromCourse) return fromCourse === dept;
    return inDept(mentor, dept);
  }

  // The course tags to show for a mentor while a school and/or department is
  // selected: only courses in that school/department. Unknown codes are kept.
  function sectionsIn(sections, school, dept) {
    const list = (Array.isArray(sections) ? sections : String(sections || '').split(','))
      .map(s => String(s).trim()).filter(Boolean);
    const byDept = dept && SCHOOL_DEPT_NAMES.has(dept);
    if (!school && !byDept) return list;
    return list.filter(code => {
      const s = schoolOfCourse(code), d = courseDept(code);
      return (!school || !s || s === school) && (!byDept || !d || d === dept);
    });
  }

  // <option>s for a Department filter: every department of the selected
  // school, or all of them grouped by school (plus no-school departments)
  // when no school is selected. Option values are department names.
  function deptOptionsHtml(school, mentors = []) {
    const opt = d => `<option value="${esc(d)}">${esc(d)}</option>`;
    const deptsIn = s => SCHOOL_DEPARTMENTS[s] || [];
    let html = '<option value="">All Departments</option>';
    if (school) return html + deptsIn(school).map(opt).join('');
    html += Object.keys(SCHOOL_DEPARTMENTS)
      .map(s => `<optgroup label="${esc(s)}">${deptsIn(s).map(opt).join('')}</optgroup>`).join('');
    const own = [...new Set(mentors.map(noSchoolDept).filter(Boolean))].sort();
    if (own.length) html += `<optgroup label="School Department">${own.map(opt).join('')}</optgroup>`;
    return html;
  }

  // Fills a Department <select>, keeping the current choice when it is still listed.
  function fillDeptSelect(select, school, mentors = []) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = deptOptionsHtml(school, mentors);
    select.value = [...select.options].some(o => o.value === current) ? current : '';
  }

  // ── Course filter ─────────────────────────────────────────────
  // One dropdown: the courses the listed mentors handle, grouped by
  // department, plus no-school departments (e.g. SAS) as "dept:<name>".
  const sectionList = m => String(m?.sections ?? m?.Sections ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const coursesOf = m => byMentorCourse ? [...(byMentorCourse.get(idOf(m)) || [])] : sectionList(m).map(courseKey);
  const COURSE_LABEL = new Map([...COURSE_INFO.keys()].map(k => [k, k]));
  Object.values(COURSE_DEPARTMENTS).forEach(depts => Object.values(depts).flat().forEach(c => COURSE_LABEL.set(courseKey(c), c)));

  // { dept, course } for a Course filter value.
  function courseFilter(value) {
    const v = String(value || '');
    return v.startsWith('dept:') ? { dept: v.slice(5), course: '' } : { dept: '', course: v };
  }

  function inCourse(mentor, value) {
    const { dept, course } = courseFilter(value);
    if (dept) return inDept(mentor, dept);
    if (!course) return true;
    return coursesOf(mentor).includes(courseKey(course));
  }

  function sessionInCourse(record, value) {
    const { dept, course } = courseFilter(value);
    if (dept) return sessionInDept(record, dept);
    if (!course) return true;
    const own = courseKey(record.sectionCode || record.courseCode);
    if (own) return own === courseKey(course);
    return inCourse({ mentorID: record.mentorID, school: record.mentorSchool }, value);
  }

  // Course tags for a mentor card under the selected school and course.
  function courseTags(sections, school, value) {
    const { course } = courseFilter(value);
    const list = sectionsIn(sections, school, '');
    return course ? list.filter(c => courseKey(c) === courseKey(course)) : list;
  }

  function courseOptionsHtml(school, mentors = []) {
    const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
    const used = new Set();
    mentors.filter(m => inSchool(m, school)).forEach(m => coursesOf(m).forEach(k => {
      const s = schoolOfCourse(k);
      if (!school || !s || s === school) used.add(k);
    }));
    let html = '<option value="">All Courses</option>';
    const schools = school ? [school] : Object.keys(SCHOOL_DEPARTMENTS);
    schools.forEach(sc => (SCHOOL_DEPARTMENTS[sc] || []).forEach(dept => {
      const codes = [...used].filter(k => courseDept(k) === dept && schoolOfCourse(k) === sc).sort();
      if (!codes.length) return;
      const label = school ? dept : `${dept} · ${sc}`;
      html += `<optgroup label="${esc(label)}">${codes.map(k => opt(COURSE_LABEL.get(k) || k, COURSE_LABEL.get(k) || k)).join('')}</optgroup>`;
    }));
    const other = [...used].filter(k => !courseDept(k)).sort();
    if (other.length) html += `<optgroup label="Other">${other.map(k => opt(k, k)).join('')}</optgroup>`;
    if (!school) {
      const own = [...new Set(mentors.map(noSchoolDept).filter(Boolean))].sort();
      if (own.length) html += `<optgroup label="School Department">${own.map(d => opt('dept:' + d, d)).join('')}</optgroup>`;
    }
    return html;
  }

  // Fills a Course <select>, keeping the current choice when it is still listed.
  function fillCourseSelect(select, school, mentors = []) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = courseOptionsHtml(school, mentors);
    select.value = [...select.options].some(o => o.value === current) ? current : '';
  }

  return { load, schoolsOf, inSchool, menteesIn, sessionInSchool, noSchoolDept, inDept, sessionInDept, sectionsIn, deptOptionsHtml, fillDeptSelect,
           courseFilter, inCourse, sessionInCourse, courseTags, courseOptionsHtml, fillCourseSelect };
})();
