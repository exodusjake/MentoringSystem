import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import Select from '../../components/Select.jsx';
import { showConfirm, showToast } from '../../components/Notify.jsx';
import { apiRequest } from '../../lib/api.js';
import { parseCsv, serializeCsv } from '../../lib/csv.js';
import { getSession } from '../../lib/session.js';

const roleOf = u => u.role || u.Role || '';
const nameOf = u => `${u.firstName || u.FirstName || ''} ${u.lastName || u.LastName || ''}`.trim() || u.email || '—';
const idOf = u => u.userID ?? u.UserID;
const isOut = u => !!(u.isDropOut ?? u.IsDropOut);
const isActive = u => (u.isActive ?? u.IsActive) !== false;
const searchName = u => `${nameOf(u)} ${u.email || ''} ${u.studentNumber || ''} ${u.departmentName || ''}`.toLowerCase();
const ROW_CHOICES = [5, 10, 25];
const IMPORT_ROLES = ['Admin', 'Head', 'Mentor', 'Mentee'];
const SCHOOL_NAMES = ['School of Technology', 'School of Humanities', 'School of Management'];
const SCHOOL_ALIASES = { sot: SCHOOL_NAMES[0], soh: SCHOOL_NAMES[1], som: SCHOOL_NAMES[2] };
const MENTEE_COURSES = {
  [SCHOOL_NAMES[0]]: ['BSECE', 'BSEE', 'BSCPE', 'BSIE', 'BSCS', 'BSIT', 'BSEMC'],
  [SCHOOL_NAMES[1]]: ['BAC', 'BEEd', 'BSE-Eng', 'BSE-Math', 'BPE', 'BSESS', 'BSN', 'BSMLS', 'BSP', 'BSCRIM', 'BFS'],
  [SCHOOL_NAMES[2]]: ['BSA', 'BSMA', 'BSENTREP', 'BSBA-MM', 'BSE', 'BSHM', 'BSTM'],
};
function downloadCsv(rows, filename) {
  const blob = new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const BLANK = { firstName: '', lastName: '', email: '', password: '', contactNumber: '', studentNumber: '', gender: '', role: 'Mentee', school: '', course: '', yearLevel: '', departmentID: '' };

export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const roleFilter = params.get('role') || '';
  const engagement = params.get('engagement') || '';
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sections, setSections] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [engagementRows, setEngagementRows] = useState([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('loading');
  const [tab, setTab] = useState('users');
  const [userPage, setUserPage] = useState(1);
  const [userRows, setUserRows] = useState(() => {
    const saved = Number(localStorage.getItem('um_rows_users'));
    return ROW_CHOICES.includes(saved) ? saved : 5;
  });
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [assignmentRows, setAssignmentRows] = useState(() => {
    const saved = Number(localStorage.getItem('um_rows_assign'));
    return ROW_CHOICES.includes(saved) ? saved : 5;
  });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [assignMentee, setAssignMentee] = useState('');
  const [assignMentor, setAssignMentor] = useState('');
  const [sectionForm, setSectionForm] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserState, setSelectedUserState] = useState('idle');
  const sessionUser = getSession()?.user;
  const currentUserId = sessionUser?.userID ?? sessionUser?.UserID;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [u, a, s, d, mentorDetails, menteeDetails, engagementDetails] = await Promise.all([
        apiRequest('Users', 'GET', null, true),
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest('Sections', 'GET', null, true),
        apiRequest('Users/departments', 'GET', null, true),
        apiRequest('Users/mentors-with-dept', 'GET', null, true),
        apiRequest('Users/mentees-with-dept', 'GET', null, true),
        apiRequest('Users/engagement', 'GET', null, true),
      ]);
      const arrays = [u, a, s, d, mentorDetails, menteeDetails, engagementDetails];
      if (arrays.some(value => !Array.isArray(value))) throw new Error('The user management API returned an unexpected response. Refresh and try again.');
      const details = new Map([...mentorDetails, ...menteeDetails].map(user => [String(idOf(user)), user]));
      setUsers(u.map(user => ({ ...details.get(String(idOf(user))), ...user })));
      setAssignments(a); setSections(s); setDepartments(d); setEngagementRows(engagementDetails); setState('ready');
    } catch (error) { setState('error'); showToast(error.message || 'Could not load users.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => users.filter(u => {
    const role = roleOf(u);
    const engagementRow = engagementRows.find(row => String(row.menteeID) === String(idOf(u)));
    const assigned = engagementRow ? engagementRow.isAssigned === true : assignments.some(a => String(a.menteeUserID ?? a.menteeUserId) === String(idOf(u)) && (a.isActive ?? true));
    const dropped = engagementRow ? engagementRow.isDropOut === true : isOut(u);
    const attended = Number(engagementRow?.sessionsAttended ?? u.completedSessions ?? u.sessionCount ?? 0) > 0;
    const attendanceStatus = engagementRow?.attendanceStatus || u.engagementStatus || u.attendanceStatus || '';
    const completedCheckpoints = Number(engagementRow?.completedCheckpoints ?? u.completedCheckpoints ?? 0);
    if (roleFilter && role !== roleFilter) return false;
    if (engagement === 'all') return role === 'Mentee' && !dropped;
    if (engagement === 'dropped-out') return role === 'Mentee' && dropped;
    if (engagement === 'unassigned') return role === 'Mentee' && !dropped && !assigned;
    if (engagement === 'attended') return role === 'Mentee' && !dropped && assigned && attended;
    if (engagement === 'no-attendance') return role === 'Mentee' && !dropped && assigned && !attended;
    if (engagement === 'no-completed-sessions') return role === 'Mentee' && !dropped && assigned && completedCheckpoints === 0;
    if (engagement === 'excellent' || engagement === 'on-track' || engagement === 'needs-attention') return role === 'Mentee' && !dropped && assigned && attendanceStatus.toLowerCase().replaceAll(' ', '-') === engagement;
    return true;
  }).filter(u => !query.trim() || searchName(u).includes(query.trim().toLowerCase())), [users, assignments, engagementRows, roleFilter, engagement, query]);
  const userPageCount = Math.max(1, Math.ceil(filtered.length / userRows));
  const currentUserPage = Math.min(userPage, userPageCount);
  const visibleUsers = filtered.slice((currentUserPage - 1) * userRows, currentUserPage * userRows);
  const assignmentPageCount = Math.max(1, Math.ceil(assignments.length / assignmentRows));
  const currentAssignmentPage = Math.min(assignmentPage, assignmentPageCount);
  const visibleAssignments = assignments.slice((currentAssignmentPage - 1) * assignmentRows, currentAssignmentPage * assignmentRows);
  const selfId = String(getSession()?.user?.userID ?? getSession()?.user?.UserID ?? '');
  const selectedUsers = users.filter(user => selectedIds.has(String(idOf(user))) && String(idOf(user)) !== selfId);
  const bulkDropoutUsers = selectedUsers.filter(user => roleOf(user) === 'Mentee' && isActive(user) && !isOut(user));
  const bulkDeactivateUsers = selectedUsers.filter(isActive);
  const bulkReactivateUsers = selectedUsers.filter(user => !isActive(user));
  const pageSelectionComplete = visibleUsers.length > 0 && visibleUsers.every(user => selectedIds.has(String(idOf(user))));

  useEffect(() => { setUserPage(1); }, [query, roleFilter, engagement, userRows]);
  useEffect(() => { setAssignmentPage(1); }, [assignmentRows]);
  useEffect(() => { localStorage.setItem('um_rows_users', String(userRows)); }, [userRows]);
  useEffect(() => { localStorage.setItem('um_rows_assign', String(assignmentRows)); }, [assignmentRows]);

  function toggleUserSelection(id, checked) {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  }
  function toggleVisibleSelection(checked) {
    setSelectedIds(previous => {
      const next = new Set(previous);
      visibleUsers.forEach(user => checked ? next.add(String(idOf(user))) : next.delete(String(idOf(user))));
      return next;
    });
  }
  async function runBulkAction(action) {
    const targets = action === 'dropout' ? bulkDropoutUsers
      : action === 'deactivate' ? bulkDeactivateUsers
        : bulkReactivateUsers;
    if (!targets.length) return;
    const verb = action === 'dropout' ? 'mark the selected mentees as dropped out'
      : action === 'deactivate' ? 'deactivate the selected accounts'
        : 'reactivate the selected accounts';
    if (!await showConfirm(`Are you sure you want to ${verb}?`, { confirmText: 'Continue', variant: 'primary' })) return;
    const results = await Promise.allSettled(targets.map(user => {
      const id = idOf(user);
      const isDropout = action === 'dropout';
      return apiRequest(`Users/${id}/${isDropout ? 'dropout' : 'active'}`, 'PATCH',
        isDropout ? { isDropOut: true } : { isActive: action === 'reactivate' }, true);
    }));
    const failedIds = new Set(results.flatMap((result, index) => result.status === 'rejected' ? [String(idOf(targets[index]))] : []));
    setSelectedIds(failedIds);
    const updated = results.length - failedIds.size;
    if (failedIds.size) {
      const failure = results.find(result => result.status === 'rejected');
      showToast(`${updated} updated; ${failedIds.size} could not be updated. ${failure.reason?.message || 'Retry or refresh to review the remaining users.'}`);
    }
    else showToast(`${updated} user${updated === 1 ? '' : 's'} updated.`, 'success');
    await load();
  }

  const mutateStatus = async (user, action) => {
    const id = idOf(user);
    if (String(id) === selfId) { showToast('You cannot change your own account status.'); return; }
    const dropout = action === 'dropout';
    const next = dropout ? !isOut(user) : !isActive(user);
    const verb = dropout ? (next ? 'mark this mentee as dropped out' : 'restore this mentee') : (next ? 'reactivate this account' : 'deactivate this account');
    if (!await showConfirm(`Are you sure you want to ${verb}?`, { confirmText: 'Continue', variant: 'primary' })) return;
    try {
      await apiRequest(`Users/${id}/${dropout ? 'dropout' : 'active'}`, 'PATCH', dropout ? { isDropOut: next } : { isActive: next }, true);
      showToast('User status updated.', 'success'); await load();
    } catch (e) { showToast(e.message || 'Could not update user status.'); }
  };

  async function showUserDetails(user) {
    setSelectedUser(user);
    setSelectedUserState('loading');
    try {
      const details = await apiRequest(`Users/${idOf(user)}`, 'GET', null, true);
      setSelectedUser({ ...user, ...(details?.user || details || {}) });
      setSelectedUserState('ready');
    } catch (error) {
      setSelectedUserState('error');
      showToast(error.message || 'Could not load user details.');
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!form) return;
    const f = form;
    if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim() || !f.gender || !f.studentNumber.trim()) {
      showToast('Complete the required name, email, ID number, gender and role fields.'); return;
    }
    if (!f.userID && !f.password) { showToast('A password is required for a new account.'); return; }
    setSaving(true);
    const payload = {
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(),
      newPassword: f.password || null,
      contactNumber: f.contactNumber.trim(), studentNumber: f.studentNumber.trim(),
      role: f.role, gender: f.gender,
    };
    try {
      if (f.userID) {
        if (f.role === 'Mentor') Object.assign(payload, { school: f.school || null, departmentID: Number(f.departmentID) || null });
        if (f.role === 'Mentee') Object.assign(payload, { school: f.school || null, course: f.course.trim(), yearLevel: f.yearLevel || null });
        await apiRequest(`Users/${f.userID}`, 'PUT', payload, true);
      } else if (f.role === 'Mentor') {
        payload.password = f.password;
        await apiRequest('Auth/register-mentor', 'POST', { ...payload, school: f.school, departmentID: Number(f.departmentID) || null }, true);
      } else if (f.role === 'Mentee') {
        payload.password = f.password;
        await apiRequest('Auth/register-mentee', 'POST', { ...payload, school: f.school, course: f.course.trim(), yearLevel: f.yearLevel || null, section: null, sectionID: null }, true);
      } else {
        payload.password = f.password;
        await apiRequest('Auth/register', 'POST', payload, true);
      }
      setForm(null); showToast(f.userID ? 'User updated.' : 'User created.', 'success'); await load();
    } catch (e) { showToast(e.message || 'Could not save user.'); }
    finally { setSaving(false); }
  }

  async function assign() {
    if (!assignMentee || !assignMentor) { showToast('Choose a mentee and mentor.'); return; }
    try {
      await apiRequest('Users/assign', 'POST', { menteeUserId: Number(assignMentee), mentorUserId: Number(assignMentor) }, true);
      showToast('Mentor assigned.', 'success'); setAssignMentee(''); setAssignMentor(''); await load();
    } catch (e) { showToast(e.message || 'Could not assign mentor.'); }
  }
  async function removeAssignment(id) {
    if (!await showConfirm('Remove this mentor assignment?', { confirmText: 'Remove' })) return;
    try { await apiRequest(`Users/assignments/${id}`, 'DELETE', null, true); showToast('Assignment removed.', 'success'); await load(); }
    catch (e) { showToast(e.message || 'Could not remove assignment.'); }
  }
  async function createSection(event) {
    event.preventDefault();
    const course = sectionForm?.course.trim();
    if (!course || !sectionForm.school) { showToast('Enter a course and choose a school.'); return; }
    try {
      await apiRequest('Sections', 'POST', { course, school: sectionForm.school }, true);
      setSectionForm(null); showToast('Section course added.', 'success'); await load();
    } catch (e) { showToast(e.message || 'Could not add the course.'); }
  }
  function exportUsers() {
    if (!users.length) { showToast('No users to export.'); return; }
    const rows = [['Name', 'ID Number', 'Email', 'Role', 'School', 'Status']];
    for (const user of users) {
      rows.push([
        nameOf(user),
        user.studentNumber || user.StudentNumber || '—',
        user.email || user.Email || '',
        roleOf(user),
        user.school || user.School || user.departmentName || user.DepartmentName || '—',
        isOut(user) ? 'Dropped Out' : isActive(user) ? 'Active' : 'Inactive',
      ]);
    }
    downloadCsv(rows, 'users.csv');
  }
  function downloadImportTemplate() {
    downloadCsv([[
      'First Name', 'Last Name', 'Email', 'Password', 'Role', 'Gender', 'ID Number',
      'Contact Number', 'School', 'Department', 'Course', 'Assign to Mentor Email',
    ]], 'user-import-template.csv');
  }
    async function selectImportFile(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showToast('CSV files must be 10 MB or smaller.'); return;
      }
      if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
        showToast('Choose a CSV file.'); return;
      }
      try {
        const parsed = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
        if (parsed.length < 2) { showToast('The CSV has a header but no data rows.'); return; }
        if (parsed.length > 5001) { showToast('CSV imports are limited to 5,000 data rows.'); return; }
        const headers = parsed[0].map(header => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const findCol = (...names) => headers.findIndex(header => names.some(name => header.includes(name)));
        const cols = {
          firstName: findCol('firstname', 'first'), lastName: findCol('lastname', 'last'),
          email: findCol('email'), role: findCol('role'), password: findCol('password', 'pass'),
          gender: findCol('gender'), studentNumber: findCol('idnumber', 'studentnumber', 'student'),
          contact: findCol('contact', 'phone', 'mobile'), school: findCol('school'),
          department: findCol('department', 'dept'), course: findCol('course'),
          mentorEmail: findCol('assigntomentor', 'assignmentor', 'mentoremail'),
        };
        const missing = ['firstName', 'lastName', 'email', 'role'].filter(key => cols[key] < 0);
        if (missing.length) { showToast(`Missing required CSV columns: ${missing.map(v => v.replace(/[A-Z]/g, c => ` ${c}`).trim()).join(', ')}.`); return; }
        const seen = new Set();
        const rows = parsed.slice(1).map((cells, index) => {
          const get = key => cols[key] < 0 ? '' : String(cells[cols[key]] || '').trim();
          const row = {
            line: index + 2, firstName: get('firstName'), lastName: get('lastName'),
            email: get('email'), role: get('role'), password: get('password'), gender: get('gender'),
            studentNumber: get('studentNumber'), contactNumber: get('contact'),
            school: get('school'), department: get('department'), course: get('course'), mentorEmail: get('mentorEmail'),
          };
          const normalizedEmail = row.email.toLowerCase();
          const existing = users.find(user => String(user.email || user.Email || '').toLowerCase() === normalizedEmail);
          const problems = [];
          if (!row.firstName || !row.lastName) problems.push('First and last name are required.');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) problems.push('A valid email is required.');
          if (!IMPORT_ROLES.includes(row.role)) problems.push('Role must be Admin, Head, Mentor, or Mentee.');
          if (!existing && !row.password) problems.push('Password is required for new users.');
          if (seen.has(normalizedEmail)) problems.push('Email appears more than once in this file.');
          seen.add(normalizedEmail);
          if (row.school) row.school = SCHOOL_ALIASES[row.school.toLowerCase()] || row.school;
          const existingHasTargetRole = existing && roleOf(existing) === row.role;
          if (row.role === 'Mentor') {
            const school = row.school || (existingHasTargetRole && (existing.school || existing.School)) || '';
            const departmentName = row.department || (existingHasTargetRole && (existing.departmentName || existing.DepartmentName)) || '';
            const department = departments.find(item =>
              String(item.school || '').toLowerCase() === school.toLowerCase()
              && String(item.departmentName || '').toLowerCase() === departmentName.toLowerCase());
            if (!school || !department) problems.push(`Department "${departmentName || '(blank)'}" was not found for school "${school || '(blank)'}".`);
          }
          if (row.role === 'Mentee') {
            const school = row.school || (existingHasTargetRole && (existing.school || existing.School)) || '';
            const course = row.course || (existingHasTargetRole && (existing.course || existing.Course)) || '';
            const courses = MENTEE_COURSES[school] || [];
            if (!school || !courses.some(validCourse => validCourse.toLowerCase() === course.toLowerCase())) {
              problems.push(`Course "${course || '(blank)'}" is not valid for school "${school || '(blank)'}".`);
            }
          }
          return { ...row, existing, existingHasTargetRole, problems };
        }).filter(row => row.firstName || row.lastName || row.email);
        if (!rows.length) { showToast('No data rows were found in the CSV.'); return; }
        const mentorEmails = new Set([
          ...users.filter(user => roleOf(user) === 'Mentor').map(user => String(user.email || user.Email || '').toLowerCase()),
          ...rows.filter(row => row.role === 'Mentor').map(row => row.email.toLowerCase()),
        ]);
        rows.forEach(row => {
          if (row.role === 'Mentee' && row.mentorEmail && !mentorEmails.has(row.mentorEmail.toLowerCase())) {
            row.problems.push(`Mentor email "${row.mentorEmail}" is not a mentor in the current account list or this file.`);
          }
        });
        setImportPreview({ filename: file.name, rows });
      } catch (error) {
        showToast(error.message || 'Could not read the CSV file.');
      }
    }
    async function importUsers() {
      if (!importPreview || importing) return;
      const rows = importPreview.rows.filter(row => row.problems.length === 0 && !row.importStatus);
      if (!rows.length) return;
      setImporting(true);
      const results = [];
      for (const row of rows) {
        try {
          const payload = {
            firstName: row.firstName, lastName: row.lastName, email: row.email,
            contactNumber: row.contactNumber || row.existing?.contactNumber || row.existing?.ContactNumber || null,
            studentNumber: row.studentNumber || row.existing?.studentNumber || row.existing?.StudentNumber || null,
            role: row.role, gender: row.gender || row.existing?.gender || row.existing?.Gender || null,
          };
          if (row.role === 'Mentor' || row.role === 'Mentee') {
            payload.school = row.school || (row.existingHasTargetRole && (row.existing?.school || row.existing?.School)) || null;
          }
          if (row.role === 'Mentor') {
            const departmentName = row.department || (row.existingHasTargetRole && (row.existing?.departmentName || row.existing?.DepartmentName)) || '';
            const dept = departments.find(item =>
              String(item.school || '').toLowerCase() === String(payload.school || '').toLowerCase()
              && String(item.departmentName || '').toLowerCase() === departmentName.toLowerCase());
            payload.departmentID = dept?.departmentID ?? (row.existingHasTargetRole ? row.existing?.departmentID ?? row.existing?.DepartmentID : null) ?? null;
          }
          if (row.role === 'Mentee') {
            payload.course = row.course || (row.existingHasTargetRole && (row.existing?.course || row.existing?.Course)) || '';
            payload.yearLevel = (row.existingHasTargetRole && (row.existing?.yearLevel || row.existing?.YearLevel)) || null;
          }
          if (row.existing) {
            await apiRequest(`Users/${idOf(row.existing)}`, 'PUT', { ...payload, newPassword: null }, true);
            results.push({ row, status: 'Updated' });
          } else if (row.role === 'Mentor') {
            await apiRequest('Auth/register-mentor', 'POST', {
              ...payload, password: row.password, school: row.school,
            }, true);
            results.push({ row, status: 'Created' });
          } else if (row.role === 'Mentee') {
            await apiRequest('Auth/register-mentee', 'POST', {
              ...payload, password: row.password, school: row.school,
              section: null, sectionID: null, yearLevel: null,
            }, true);
            results.push({ row, status: 'Created' });
          } else {
            await apiRequest('Auth/register', 'POST', { ...payload, password: row.password }, true);
            results.push({ row, status: 'Created' });
          }
        } catch (error) {
          results.push({ row, status: 'Failed', message: error.message || 'Request failed.' });
        }
      }
      const assignmentRows = rows.filter(row => row.role === 'Mentee' && row.mentorEmail
        && results.some(result => result.row.line === row.line && result.status !== 'Failed'));
      if (assignmentRows.length) {
        try {
          const refreshedUsers = await apiRequest('Users', 'GET', null, true);
          for (const row of assignmentRows) {
            const mentee = refreshedUsers.find(user => String(user.email || user.Email || '').toLowerCase() === row.email.toLowerCase());
            const mentor = refreshedUsers.find(user => roleOf(user) === 'Mentor' && String(user.email || user.Email || '').toLowerCase() === row.mentorEmail.toLowerCase());
            const result = results.find(item => item.row.line === row.line);
            if (!mentee || !mentor) {
              if (result) result.assignmentError = !mentee ? 'Mentee record was not returned after import; mentor assignment was not attempted.' : 'Mentor record was not found; mentor assignment was not attempted.';
              continue;
            }
            try {
              await apiRequest('Users/assign', 'POST', { menteeUserId: Number(idOf(mentee)), mentorUserId: Number(idOf(mentor)) }, true);
            } catch (error) {
              if (result) result.assignmentError = error.message || 'Mentor assignment failed.';
            }
          }
        } catch (error) {
          results.forEach(result => {
            if (assignmentRows.some(row => row.line === result.row.line)) result.assignmentError = error.message || 'Could not refresh users to assign mentors.';
          });
        }
      }
      setImporting(false);
      const failures = results.filter(result => result.status === 'Failed');
      const assignmentFailures = results.filter(result => result.assignmentError);
      const skipped = importPreview.rows.filter(row => row.problems.length);
      if (!failures.length && !skipped.length && !assignmentFailures.length) {
        showToast(`${results.filter(r => r.status === 'Created').length} created, ${results.filter(r => r.status === 'Updated').length} updated, and ${assignmentRows.length} mentor assignments processed.`, 'success');
        setImportPreview(null);
      } else {
        setImportPreview(current => current && ({
          ...current,
          rows: current.rows.map(row => {
            const result = results.find(item => item.row.line === row.line);
            if (result?.status === 'Failed') return { ...row, problems: [result.message] };
            if (result?.assignmentError) return { ...row, problems: [result.assignmentError] };
            if (result) return { ...row, importStatus: result.status };
            return row;
          }),
        }));
        showToast(`${results.filter(r => r.status === 'Created').length} created, ${results.filter(r => r.status === 'Updated').length} updated, ${failures.length} failed, ${assignmentFailures.length} assignments failed, ${skipped.length} skipped.`);
      }
      await load();
    }
  async function permanentlyDeleteUser(user) {
    const userId = idOf(user);
    if (String(userId) === String(currentUserId)) { showToast('You cannot delete your own account.', 'error'); return; }
    if (!await showConfirm(`Permanently delete ${nameOf(user)} and all related data? This cannot be undone.`, { confirmText: 'Delete permanently' })) return;
    try {
      await apiRequest(`Users/${userId}`, 'DELETE', null, true);
      setSelectedIds(ids => { const next = new Set(ids); next.delete(String(userId)); return next; });
      showToast(`${nameOf(user)} was permanently deleted.`, 'success');
      await load();
    } catch (error) { showToast(error.message || `Could not delete ${nameOf(user)}.`); }
  }
  async function permanentlyDeleteSelected() {
    const selected = users.filter(user => selectedIds.has(String(idOf(user))));
    const targets = selected.filter(user => String(idOf(user)) !== String(currentUserId));
    if (!targets.length) { showToast('No selected accounts can be deleted.', 'error'); return; }
    if (!await showConfirm(`Permanently delete ${targets.length} selected account${targets.length === 1 ? '' : 's'} and all related data? This cannot be undone.`, { confirmText: 'Delete permanently' })) return;
    const failures = [];
    let deleted = 0;
    for (const user of targets) {
      try {
        await apiRequest(`Users/${idOf(user)}`, 'DELETE', null, true);
        deleted += 1;
      } catch (error) {
        failures.push(`${nameOf(user)}: ${error.message || 'Request failed.'}`);
      }
    }
    setSelectedIds(new Set());
    await load();
    if (failures.length) showToast(`${deleted} deleted; ${failures.length} failed. ${failures.join(' ')}`);
    else showToast(`${deleted} account${deleted === 1 ? '' : 's'} permanently deleted.`, 'success');
  }
  function exportAssignments() {
    if (!assignments.length) { showToast('No assignments to export.'); return; }
    const rows = [['Mentee', 'Mentee Email', 'Course', 'Year Level', 'Mentor', 'Mentor Email', 'Department', 'Status']];
    for (const assignment of assignments) {
      const menteeId = assignment.menteeUserID ?? assignment.menteeUserId;
      const mentorId = assignment.mentorUserID ?? assignment.mentorUserId;
      const mentee = users.find(user => String(idOf(user)) === String(menteeId));
      const mentor = users.find(user => String(idOf(user)) === String(mentorId));
      rows.push([
        assignment.menteeName || (mentee && nameOf(mentee)) || '—',
        mentee?.email || '—',
        assignment.course || mentee?.course || '—',
        assignment.yearLevel || mentee?.yearLevel || '—',
        assignment.mentorName || (mentor && nameOf(mentor)) || '—',
        mentor?.email || '—',
        mentor?.departmentName || mentor?.school || '—',
        (assignment.isActive ?? true) ? 'Active' : 'Previous',
      ]);
    }
    downloadCsv(rows, 'assignments.csv');
  }
  const startEdit = user => setForm(user ? {
    ...BLANK, userID: idOf(user), firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '',
    contactNumber: user.contactNumber || '', studentNumber: user.studentNumber || '', gender: user.gender || '',
    role: roleOf(user), school: user.school || '', course: user.course || '', yearLevel: user.yearLevel || '',
    departmentID: user.departmentID || '',
  } : { ...BLANK });
  const mentees = users.filter(u => roleOf(u) === 'Mentee' && !isOut(u));
  const mentors = users.filter(u => roleOf(u) === 'Mentor' && isActive(u));

  return <Page id="ADMIN_/user-management">
    <main className="main-wrapper"><div className="page-content">
      <header className="page-header"><div className="page-header-top"><div><h1>User Management</h1><p>Manage accounts, engagement and mentor assignments.</p></div><button className="btn-primary" onClick={() => startEdit(null)}><i className="ti ti-plus" /> Add User</button></div></header>
      <div className="um-tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
        <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>Mentor Assignments</button>
        <button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')}>Sections</button>
      </div>
      {tab === 'users' ? <>
        <div className="toolbar"><label className="search-box"><i className="ti ti-search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, email, ID…" /></label>
          <Select className="filter-select" value={roleFilter} onChange={e => { const next = new URLSearchParams(params); e.target.value ? next.set('role', e.target.value) : next.delete('role'); next.delete('engagement'); setParams(next); }}>
            <option value="">All Roles</option><option value="Mentor">Mentor</option><option value="Mentee">Mentee</option><option value="Admin">Admin</option><option value="Head">Head</option>
          </Select>
          {engagement && <button className="filter-reset" onClick={() => { const next = new URLSearchParams(params); next.delete('engagement'); setParams(next); }}>Clear {engagement} filter</button>}
          <button className="filter-reset" onClick={downloadImportTemplate}>CSV Template</button>
          <label className="filter-reset" style={{ cursor: 'pointer' }}>Import CSV<input type="file" accept=".csv,text/csv" onChange={selectImportFile} hidden /></label>
          <button className="filter-reset" onClick={exportUsers}>Export CSV</button>
          <button className="filter-reset" onClick={load}>Refresh</button>
        </div>
        {selectedIds.size > 0 && <div className="toolbar" aria-label="Bulk user actions">
          <span>{selectedIds.size} selected</span>
          {bulkDropoutUsers.length > 0 && <button className="filter-reset" onClick={() => runBulkAction('dropout')}>Drop Out ({bulkDropoutUsers.length})</button>}
          {bulkDeactivateUsers.length > 0 && <button className="filter-reset" onClick={() => runBulkAction('deactivate')}>Deactivate ({bulkDeactivateUsers.length})</button>}
          {bulkReactivateUsers.length > 0 && <button className="filter-reset" onClick={() => runBulkAction('reactivate')}>Reactivate ({bulkReactivateUsers.length})</button>}
          <button className="btn-danger" onClick={permanentlyDeleteSelected}>Delete permanently</button>
          <button className="filter-reset" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>}
        <div className="table-wrapper"><table className="data-table user-table"><thead><tr><th><input type="checkbox" aria-label="Select users on this page" checked={pageSelectionComplete} onChange={e => toggleVisibleSelection(e.target.checked)} /></th><th>Name</th><th>ID / Email</th><th>Role</th><th>Department / School</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {state === 'loading' ? <tr><td colSpan="7"><Empty className="table-empty">Loading users…</Empty></td></tr> : state === 'error' ? <tr><td colSpan="7"><Empty className="table-empty">Could not load users. Refresh to try again.</Empty></td></tr> : visibleUsers.map(u => <tr key={idOf(u)}>
            <td><input type="checkbox" aria-label={`Select ${nameOf(u)}`} checked={selectedIds.has(String(idOf(u)))} onChange={e => toggleUserSelection(idOf(u), e.target.checked)} /></td>
            <td><b>{nameOf(u)}</b></td><td>{u.studentNumber || '—'}<small>{u.email}</small></td><td><span className="role-badge">{roleOf(u)}</span></td><td>{[u.departmentName, u.school].filter(Boolean).join(' · ') || u.course || '—'}</td>
            <td><span className={`status-badge ${isOut(u) ? 'inactive' : isActive(u) ? 'active' : 'inactive'}`}>{isOut(u) ? 'Dropped Out' : isActive(u) ? 'Active' : 'Inactive'}</span></td>
            <td className="row-actions"><button className="btn-outline" onClick={() => showUserDetails(u)}>Details</button><button className="btn-outline" onClick={() => startEdit(u)}>Edit</button>{roleOf(u) === 'Mentee' ? <button className="btn-outline" onClick={() => mutateStatus(u, 'dropout')}>{isOut(u) ? 'Restore' : 'Drop Out'}</button> : <button className="btn-outline" onClick={() => mutateStatus(u, 'active')}>{isActive(u) ? 'Deactivate' : 'Reactivate'}</button>}<button className="btn-danger" disabled={String(idOf(u)) === String(currentUserId)} onClick={() => permanentlyDeleteUser(u)}>Delete</button></td>
          </tr>)}
          {state === 'ready' && !filtered.length && <tr><td colSpan="7"><Empty className="table-empty">No users match these filters.</Empty></td></tr>}
        </tbody></table></div>
        {state === 'ready' && filtered.length > 0 && <div className="toolbar" aria-label="User table pagination">
          <span>Showing {(currentUserPage - 1) * userRows + 1}–{Math.min(currentUserPage * userRows, filtered.length)} of {filtered.length}</span>
          <Select className="filter-select" aria-label="Users per page" value={userRows} onChange={e => setUserRows(Number(e.target.value))}>
            {ROW_CHOICES.map(count => <option key={count} value={count}>{count} per page</option>)}
          </Select>
          <button className="filter-reset" disabled={currentUserPage <= 1} onClick={() => setUserPage(page => Math.max(1, page - 1))}>Previous</button>
          <span>Page {currentUserPage} of {userPageCount}</span>
          <button className="filter-reset" disabled={currentUserPage >= userPageCount} onClick={() => setUserPage(page => Math.min(userPageCount, page + 1))}>Next</button>
        </div>}
      </> : tab === 'assignments' ? <section className="card user-assignment-card">
        <h2>Assign a mentee to a mentor</h2><div className="toolbar"><Select className="filter-select" value={assignMentee} onChange={e => setAssignMentee(e.target.value)}><option value="">Choose mentee</option>{mentees.map(u => <option key={idOf(u)} value={idOf(u)}>{nameOf(u)} · {u.studentNumber || u.email}</option>)}</Select>
          <Select className="filter-select" value={assignMentor} onChange={e => setAssignMentor(e.target.value)}><option value="">Choose mentor</option>{mentors.map(u => <option key={idOf(u)} value={idOf(u)}>{nameOf(u)} · {u.departmentName || u.school || ''}</option>)}</Select><button className="btn-primary" onClick={assign}>Assign</button></div>
        <div className="toolbar"><button className="filter-reset" onClick={exportAssignments}>Export CSV</button></div>
        <div className="table-wrapper"><table className="data-table"><thead><tr><th>Mentee</th><th>Mentor</th><th>Status</th><th /></tr></thead><tbody>{visibleAssignments.map(a => {
          const mentee = users.find(u => String(idOf(u)) === String(a.menteeUserID ?? a.menteeUserId));
          const mentor = users.find(u => String(idOf(u)) === String(a.mentorUserID ?? a.mentorUserId));
          return <tr key={a.assignmentID ?? a.assignmentId}><td>{mentee ? nameOf(mentee) : a.menteeName || a.menteeUserID}</td><td>{mentor ? nameOf(mentor) : a.mentorName || a.mentorUserID}</td><td>{(a.isActive ?? true) ? 'Active' : 'Previous'}</td><td>{(a.isActive ?? true) && <button className="btn-outline" onClick={() => removeAssignment(a.assignmentID ?? a.assignmentId)}>Remove</button>}</td></tr>;
        })}{!assignments.length && <tr><td colSpan="4"><Empty className="table-empty">No mentor assignments found.</Empty></td></tr>}</tbody></table></div>
        {assignments.length > 0 && <div className="toolbar" aria-label="Assignment table pagination">
          <span>Showing {(currentAssignmentPage - 1) * assignmentRows + 1}–{Math.min(currentAssignmentPage * assignmentRows, assignments.length)} of {assignments.length}</span>
          <Select className="filter-select" aria-label="Assignments per page" value={assignmentRows} onChange={e => setAssignmentRows(Number(e.target.value))}>
            {ROW_CHOICES.map(count => <option key={count} value={count}>{count} per page</option>)}
          </Select>
          <button className="filter-reset" disabled={currentAssignmentPage <= 1} onClick={() => setAssignmentPage(page => Math.max(1, page - 1))}>Previous</button>
          <span>Page {currentAssignmentPage} of {assignmentPageCount}</span>
          <button className="filter-reset" disabled={currentAssignmentPage >= assignmentPageCount} onClick={() => setAssignmentPage(page => Math.min(assignmentPageCount, page + 1))}>Next</button>
        </div>}
      </section> : <section className="card"><div className="card-header"><h2>Sections and Courses</h2><button className="btn-primary" onClick={() => setSectionForm({ course: '', school: '' })}><i className="ti ti-plus" /> Add Course</button></div><div className="table-wrapper"><table className="data-table"><thead><tr><th>Course</th><th>School</th><th>Section</th></tr></thead><tbody>{sections.map(s => <tr key={s.sectionID}><td>{s.course || '—'}</td><td>{s.school || '—'}</td><td>{s.sectionName || s.sectionCode || s.section || '—'}</td></tr>)}{!sections.length && <tr><td colSpan="3"><Empty className="table-empty">No sections available.</Empty></td></tr>}</tbody></table></div><p>Section membership is updated from mentee profiles and mentor assignments.</p></section>}
    </div></main>
    {sectionForm && <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && setSectionForm(null)}><section className="modal-card"><header className="modal-header"><h2>Add Course / Section</h2><button onClick={() => setSectionForm(null)} aria-label="Close">×</button></header><form onSubmit={createSection}><label>Course<input value={sectionForm.course} onChange={e => setSectionForm({ ...sectionForm, course: e.target.value })} placeholder="e.g. BS Information Technology" required /></label><label>School<input value={sectionForm.school} onChange={e => setSectionForm({ ...sectionForm, school: e.target.value })} required /></label><div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setSectionForm(null)}>Cancel</button><button className="btn-primary">Add Course</button></div></form></section></div>}
    {form && <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && setForm(null)}><section className="modal-card user-edit-modal"><header className="modal-header"><h2>{form.userID ? 'Edit User' : 'Add User'}</h2><button type="button" onClick={() => setForm(null)} aria-label="Close">×</button></header><form onSubmit={saveUser} className="user-form">
      <label>First Name *<input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required /></label><label>Last Name *<input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required /></label>
      <label>Email *<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label><label>{form.userID ? 'New Password (optional)' : 'Password *'}<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required={!form.userID} /></label>
      <label>ID Number *<input value={form.studentNumber} onChange={e => setForm({ ...form, studentNumber: e.target.value })} required /></label><label>Contact Number<input value={form.contactNumber} onChange={e => setForm({ ...form, contactNumber: e.target.value })} /></label>
      <label>Gender *<Select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} required><option value="">Choose gender</option><option>Female</option><option>Male</option><option>Other</option></Select></label>
      <label>Role *<Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option>Mentee</option><option>Mentor</option><option>Admin</option><option>Head</option></Select></label>
      {form.role === 'Mentor' && <><label>School<input value={form.school} onChange={e => setForm({ ...form, school: e.target.value })} required /></label><label>Department<Select value={form.departmentID} onChange={e => setForm({ ...form, departmentID: e.target.value })}><option value="">Choose department</option>{departments.map(d => <option key={d.departmentID} value={d.departmentID}>{d.departmentName}</option>)}</Select></label></>}
      {form.role === 'Mentee' && <><label>School<input value={form.school} onChange={e => setForm({ ...form, school: e.target.value })} /></label><label>Course<input value={form.course} onChange={e => setForm({ ...form, course: e.target.value })} /></label><label>Year Level<Select value={form.yearLevel} onChange={e => setForm({ ...form, yearLevel: e.target.value })}><option value="">Choose year</option>{['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map(x => <option key={x}>{x}</option>)}</Select></label></>}
      <div className="modal-actions"><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save User'}</button></div>
    </form></section></div>}
    {importPreview && <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && !importing && setImportPreview(null)}><section className="modal-card user-import-modal">
      <header className="modal-header"><h2>Import users from CSV</h2><button type="button" onClick={() => !importing && setImportPreview(null)} aria-label="Close" disabled={importing}>×</button></header>
      <p><b>{importPreview.filename}</b> · {importPreview.rows.filter(row => !row.problems.length && !row.importStatus).length} ready, {importPreview.rows.filter(row => row.problems.length).length} requiring correction. Invalid rows will be skipped; each valid row is submitted separately. Passwords in existing-user rows are ignored and never reset.</p>
      <div className="table-wrapper"><table className="data-table"><thead><tr><th>CSV row</th><th>Name</th><th>Email</th><th>Role</th><th>Action</th><th>Validation</th></tr></thead><tbody>
        {importPreview.rows.map(row => <tr key={row.line}><td>{row.line}</td><td>{`${row.firstName} ${row.lastName}`.trim() || '—'}</td><td>{row.email || '—'}</td><td>{row.role || '—'}</td><td>{row.problems.length ? 'Skipped' : row.importStatus || (row.existing ? 'Update' : 'Create')}</td><td>{row.problems.join(' ') || (row.importStatus ? 'Completed' : 'Ready')}</td></tr>)}
      </tbody></table></div>
      <div className="modal-actions"><button className="btn-outline" disabled={importing} onClick={() => setImportPreview(null)}>Close</button><button className="btn-primary" disabled={importing || !importPreview.rows.some(row => !row.problems.length && !row.importStatus)} onClick={importUsers}>{importing ? 'Importing…' : `Import ${importPreview.rows.filter(row => !row.problems.length && !row.importStatus).length} valid rows`}</button></div>
    </section></div>}
    {selectedUser && <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && setSelectedUser(null)}><section className="modal-card user-detail-modal">
      <header className="modal-header"><h2>{nameOf(selectedUser)}</h2><button onClick={() => setSelectedUser(null)} aria-label="Close">×</button></header>
      {selectedUserState === 'loading' ? <Empty className="empty-state">Loading user details…</Empty> : selectedUserState === 'error' ? <Empty className="empty-state">User details could not be loaded.</Empty> : <>
        <dl className="user-detail-list">
          <dt>Role</dt><dd>{roleOf(selectedUser) || '—'}</dd>
          <dt>Email</dt><dd>{selectedUser.email || selectedUser.Email || '—'}</dd>
          <dt>ID Number</dt><dd>{selectedUser.studentNumber || selectedUser.StudentNumber || '—'}</dd>
          <dt>Contact</dt><dd>{selectedUser.contactNumber || selectedUser.ContactNumber || '—'}</dd>
          <dt>Gender</dt><dd>{selectedUser.gender || selectedUser.Gender || '—'}</dd>
          <dt>School</dt><dd>{selectedUser.school || selectedUser.School || selectedUser.departmentName || selectedUser.DepartmentName || '—'}</dd>
          <dt>Course / Year</dt><dd>{[selectedUser.course || selectedUser.Course, selectedUser.yearLevel || selectedUser.YearLevel].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>Section</dt><dd>{selectedUser.sectionName || selectedUser.SectionName || selectedUser.sectionCode || selectedUser.SectionCode || selectedUser.section || selectedUser.Section || '—'}</dd>
          <dt>Account</dt><dd>{isOut(selectedUser) ? 'Dropped Out' : isActive(selectedUser) ? 'Active' : 'Inactive'}</dd>
          {roleOf(selectedUser) === 'Mentee' && <>
            <dt>Mentor</dt><dd>{assignments.filter(a => String(a.menteeUserID ?? a.menteeUserId) === String(idOf(selectedUser)) && (a.isActive ?? true)).map(a => a.mentorName || users.find(u => String(idOf(u)) === String(a.mentorUserID ?? a.mentorUserId)) && nameOf(users.find(u => String(idOf(u)) === String(a.mentorUserID ?? a.mentorUserId)))).filter(Boolean).join(', ') || 'Not assigned'}</dd>
            <dt>Sessions attended</dt><dd>{engagementRows.find(row => String(row.menteeID) === String(idOf(selectedUser)))?.sessionsAttended ?? selectedUser.completedSessions ?? selectedUser.sessionCount ?? '—'}</dd>
            <dt>Completed checkpoints</dt><dd>{engagementRows.find(row => String(row.menteeID) === String(idOf(selectedUser)))?.completedCheckpoints ?? selectedUser.completedCheckpoints ?? '—'}</dd>
            <dt>Attendance status</dt><dd>{engagementRows.find(row => String(row.menteeID) === String(idOf(selectedUser)))?.attendanceStatus || selectedUser.engagementStatus || '—'}</dd>
          </>}
        </dl>
        <div className="modal-actions"><button className="btn-outline" onClick={() => setSelectedUser(null)}>Close</button>{roleOf(selectedUser) === 'Mentee' && <button className="btn-primary" onClick={() => { setSelectedUser(null); startEdit(selectedUser); }}>Edit Mentee</button>}</div>
      </>}
    </section></div>}
  </Page>;
}
