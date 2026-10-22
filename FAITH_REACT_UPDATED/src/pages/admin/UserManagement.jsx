import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Page, { usePage } from '../../app/Page.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import PasswordMeter from '../../components/PasswordMeter.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { CONFIG } from '../../lib/config.js';
import { validate as validatePassword } from '../../lib/passwordPolicy.js';
import { getSession } from '../../lib/session.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// ADMIN_/HTML/user-management.html + ADMIN_/JS/user-management.js

const ROW_CHOICES = [5, 10, 25];
function loadRowsSetting(key) {
  try { const n = parseInt(localStorage.getItem(key), 10); return ROW_CHOICES.includes(n) ? n : 5; } catch (e) { return 5; }
}

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
const SCHOOLS = ['School of Technology', 'School of Humanities', 'School of Management'];

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

// Departments with no school (e.g. SAS) can mentor mentees of any school.
const NO_SCHOOL = '__no_school__';

const TAB_NAMES = ['users', 'assignments', 'sections'];

const ENGAGEMENT_LABELS = {
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

const BULK_ACTIONS = {
  dropout:    { title: 'Mark as Drop Out?',   verb: 'marked as Drop Out', button: 'Mark as Drop Out', skip: 'are not active mentees or are already Drop Out', positive: false },
  deactivate: { title: 'Deactivate Accounts?', verb: 'deactivated and unable to log in', button: 'Deactivate', skip: 'are already deactivated', positive: false },
  reactivate: { title: 'Reactivate Accounts?', verb: 'reactivated and able to log in again', button: 'Reactivate', skip: 'are already active', positive: true },
};

const DB_ICONS = {
  info: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
  lock: <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
};

const sameName = (a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);

function normCourse(c) {
  return (c || '').toUpperCase().replace(/\s+/g, '');
}

function departmentForCourse(school, course) {
  const code = String(course || '').trim().toUpperCase();
  const group = (SCHOOL_COURSES[school] || []).find(g => g.courses.some(c => c.toUpperCase() === code));
  return group ? (COLLEGE_DEPARTMENTS[group.group] || null) : null;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
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

function smartPages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5];
  if (current >= total - 2) return [total-4, total-3, total-2, total-1, total];
  return [current-2, current-1, current, current+1, current+2];
}

// Quoted CSV cell; a leading = + - @ gets a ' so spreadsheet apps don't run it as a formula.
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(rows, filename, cell = csvCell, mime = 'text/csv') {
  const csv  = rows.map(r => r.map(cell).join(',')).join('\n');
  const blob = new Blob([csv], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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

const ICON_FIRST = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>;
const ICON_PREV = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
const ICON_NEXT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
const ICON_LAST = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>;
const ICON_EDIT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const ICON_TRASH = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>;
const ICON_DROPOUT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '26px', height: '26px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="11" x2="23" y2="17" /><line x1="23" y1="11" x2="17" y2="17" /></svg>;
const ICON_REINSTATE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '26px', height: '26px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>;
const ICON_DEACTIVATE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '26px', height: '26px' }}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;

const sigPillStyle = (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: bg, color: fg });
const SIG_UPLOADED = <span style={sigPillStyle('#d1fae5', '#065f46')}>Uploaded</span>;
const SIG_MISSING = <span style={sigPillStyle('#fef3c7', '#92400e')}>Missing</span>;

// Pagination buttons (First / Previous / pages / Next / Last).
function PageButtons({ current, total, onGo }) {
  const pages = smartPages(current, total);
  return (
    <>
      <button className="page-btn page-icon" title="First page" aria-label="First page" onClick={() => onGo(1)} disabled={current === 1}>{ICON_FIRST}</button>
      <button className="page-btn page-icon" title="Previous page" aria-label="Previous page" onClick={() => onGo(current - 1)} disabled={current === 1}>{ICON_PREV}</button>
      {pages.map(p => <button className={`page-btn ${p === current ? 'active' : ''}`} key={p} onClick={() => onGo(p)}>{p}</button>)}
      <button className="page-btn page-icon" title="Next page" aria-label="Next page" onClick={() => onGo(current + 1)} disabled={current === total}>{ICON_NEXT}</button>
      <button className="page-btn page-icon" title="Last page" aria-label="Last page" onClick={() => onGo(total)} disabled={current === total}>{ICON_LAST}</button>
    </>
  );
}

// smoothRender: rows ease in one by one and the table height animates.
function useSmoothTable(ref, token) {
  const last = useRef(null);
  useLayoutEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    const to = wrap.offsetHeight;
    const from = last.current;
    last.current = to;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    wrap.querySelectorAll('tbody tr').forEach((tr, i) => {
      tr.style.animationDelay = Math.min(i, 12) * 30 + 'ms';
      tr.classList.remove('row-in');
      void tr.offsetWidth;
      tr.classList.add('row-in');
    });
    if (from == null || from === to) return;
    wrap.style.overflow = 'hidden';
    wrap.style.height = from + 'px';
    void wrap.offsetHeight;
    wrap.style.transition = 'height .34s cubic-bezier(.22, 1, .36, 1)';
    wrap.style.height = to + 'px';
    clearTimeout(wrap._smoothT);
    wrap._smoothT = setTimeout(() => {
      wrap.style.height = ''; wrap.style.transition = ''; wrap.style.overflow = '';
    }, 380);
  }, [token]);
}

// Row ⋮ menu: each item opens the existing confirmation for that action.
function RowMenu({ menu, items, onAction, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = menu.rect;
    const left = Math.max(8, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 8));
    const top = r.bottom + 4 + el.offsetHeight > innerHeight ? r.top - el.offsetHeight - 4 : r.bottom + 4;
    setPos({ left, top });
  }, [menu]);
  useEffect(() => {
    const onDoc = e => { if (!e.target.closest('#rowActionMenu')) onClose(); };
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, []);
  return createPortal(
    <div id="rowActionMenu" className="row-action-menu" role="menu" ref={ref} data-user-id={String(menu.id)}
      style={{ display: 'block', left: `${pos.left}px`, top: `${pos.top}px` }}>
      {items.map(([action, label, cls]) => (
        <button type="button" role="menuitem" className={`row-action-item ${cls}`} data-action={action} key={action}
          onClick={() => onAction(action, menu.id)}>{label}</button>
      ))}
    </div>,
    document.body
  );
}

export default function AdminUserManagement() {
  useBackGuard();
  const { ready } = usePage();
  const [sp] = useSearchParams();

  // ── data ──
  const [allUsers, setAllUsers] = useState([]);
  const [allMentorsWithDept, setAllMentorsWithDept] = useState([]);
  const [allMenteesWithDept, setAllMenteesWithDept] = useState([]);
  const [allDepartments, setAllDepartments] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [periodHistoryByUser, setPeriodHistoryByUser] = useState(() => new Map());
  const [periodOptions, setPeriodOptions] = useState([]);
  const [systemSettings, setSystemSettings] = useState({ SchoolYear: '2026-2027', Semester: '1st Semester' });
  const [stats, setStats] = useState(null);
  const [usersRendered, setUsersRendered] = useState(false);
  const [assignLoaded, setAssignLoaded] = useState(false);
  const [sectionMentorView, setSectionMentorView] = useState([]);
  const [sectionsState, setSectionsState] = useState('idle');   // 'idle' | 'loading' | 'ready' | 'failed'

  const [engagementFilter, setEngagementFilter] = useState(() => {
    const req = sp.get('engagement') || '';
    return Object.hasOwn(ENGAGEMENT_LABELS, req) ? req : '';
  });
  const [engagementByUser, setEngagementByUser] = useState(() => new Map());

  // latest values for the async flows (the vanilla file's module-level variables)
  const D = useRef({});
  D.current = { allUsers, allMentorsWithDept, allMenteesWithDept, allDepartments, allSections, allAssignments, systemSettings, engagementFilter };
  const sectionsLoadedRef = useRef(false);

  // ── ui state ──
  const [tab, setTab] = useState('users');
  const [shownTab, setShownTab] = useState('users');
  const [panelCls, setPanelCls] = useState({ users: '', assignments: '', sections: '' });
  const tabToken = useRef(0);
  const tabsRef = useRef(null);
  const pillRef = useRef(null);

  const [search, setSearch] = useState('');
  const [searchRO, setSearchRO] = useState(true);
  const [roleFilter, setRoleFilter] = useState(engagementFilter ? 'Mentee' : '');
  const [genderFilter, setGenderFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [usersDesc, setUsersDesc] = useState(() => engagementFilter ? `Mentees — ${ENGAGEMENT_LABELS[engagementFilter]} · Current semester` : 'Manage users, assignments, and view courses');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => loadRowsSetting('um_rows_users'));
  const [selected, setSelected] = useState(() => new Set());
  const [selectAllTick, setSelectAllTick] = useState(0);

  const [aSearch, setASearch] = useState('');
  const [aSchool, setASchool] = useState('');
  const [aMentor, setAMentor] = useState('');
  const [aStatus, setAStatus] = useState('');
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [assignPerPage, setAssignPerPage] = useState(() => loadRowsSetting('um_rows_assign'));

  const [sSearch, setSSearch] = useState('');
  const [sCourse, setSCourse] = useState('');
  const [activeSchoolFilter, setActiveSchoolFilter] = useState('');
  const [expandedMentors, setExpandedMentors] = useState(() => new Set());
  const [activeSectionFilter, setActiveSectionFilter] = useState({});

  // modals
  const [menteeProfileId, setMenteeProfileId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [umConfirm, setUmConfirm] = useState(null);       // { title, message, confirmText, busyText, action }
  const [busy, setBusy] = useState(null);                 // which confirm button is mid-action
  const [rowMenu, setRowMenu] = useState(null);           // { id, rect }

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', contact: '', studentNumber: '', role: '', gender: '',
    mentorSchool: '', mentorDept: '', menteeSchool: '', menteeAssignMentor: '', course: '', editMentor: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [mentorFieldsOn, setMentorFieldsOn] = useState(false);
  const [menteeFieldsOn, setMenteeFieldsOn] = useState(false);
  const [editAssignOn, setEditAssignOn] = useState(false);
  const [editAssignTitle, setEditAssignTitle] = useState('Assign Mentor');
  const [assignGroupOn, setAssignGroupOn] = useState(true);
  const [extraCourse, setExtraCourse] = useState(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const [permDelete, setPermDelete] = useState(null);     // { id, name }
  const [bulkPermOpen, setBulkPermOpen] = useState(0);        // number of accounts, 0 = closed
  const [bulkInfo, setBulkInfo] = useState(null);       // { mode, msg }
  const [removeAssignId, setRemoveAssignId] = useState(null);
  const [editAssign, setEditAssign] = useState(null);     // { assignmentId, menteeUserId, menteeName, menteeSchool }
  const [editAssignMentor, setEditAssignMentor] = useState('');
  const [dropTarget, setDropTarget] = useState(null);     // { id, newVal, name }
  const [activeTarget, setActiveTarget] = useState(null); // { id, newVal, name }
  const [dropBusy, setDropBusy] = useState(false);
  const [activeBusy, setActiveBusy] = useState(false);
  const [blocked, setBlocked] = useState(null);           // { user, kind, message, deleted, failures }

  const [importStartOpen, setImportStartOpen] = useState(false);
  const [importRefLoading, setImportRefLoading] = useState(false);
  const [importMentorSearch, setImportMentorSearch] = useState('');
  const [deptDropOpen, setDeptDropOpen] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const usersWrapRef = useRef(null);
  const assignWrapRef = useRef(null);

  const showErrorModal = msg => setErrorMsg(msg);
  const showStatusSuccess = (title, message) => showToast(message, 'success', 4500, title);

  // ── derived lookups ──
  const mentorById = useMemo(() => { const m = new Map(); allMentorsWithDept.forEach(x => { if (!m.has(x.userID)) m.set(x.userID, x); }); return m; }, [allMentorsWithDept]);
  const menteeById = useMemo(() => { const m = new Map(); allMenteesWithDept.forEach(x => { if (!m.has(x.userID)) m.set(x.userID, x); }); return m; }, [allMenteesWithDept]);
  const activeAssignedMentees = useMemo(() => new Set(allAssignments.filter(a => a.isActive).map(a => a.menteeUserID)), [allAssignments]);

  function getUserSchool(u) {
    if (u.role === 'Mentor') return mentorById.get(u.userID)?.school || '—';
    if (u.role === 'Mentee') return menteeById.get(u.userID)?.school || '—';
    return 'N/A';
  }
  const getUserDept = getUserSchool;
  function getUserDeptName(u) {
    if (u.role === 'Mentor') return mentorById.get(u.userID)?.departmentName || null;
    if (u.role === 'Mentee') {
      const m = menteeById.get(u.userID);
      return m?.department || departmentForCourse(m?.school, m?.course);
    }
    return null;
  }
  // A mentor in a department with no school (SAS, ASC, FCS, FSHS, ...).
  function isSchoolDepartmentMentor(u) {
    if (u.role !== 'Mentor') return false;
    const m = mentorById.get(u.userID);
    return !!m && !m.school && allDepartments.some(d => !d.school && d.departmentName === m.departmentName);
  }
  function isMenteeDropOut(userId) { return !!menteeById.get(userId)?.isDropOut; }

  function getUserStatus(u) {
    // Account access takes precedence over assignment and setup status.
    if ((u.isActive ?? u.IsActive) === false) return { label: 'Inactive', cls: 'inactive' };
    // Viewing a specific PAST School Year: show that mentee's status AS IT WAS then.
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
      const menteeData = menteeById.get(u.userID);
      if (menteeData?.isDropOut) return { label: 'Drop Out',  cls: 'drop-out'       };
      if (activeAssignedMentees.has(u.userID)) return { label: 'Assigned',   cls: 'assigned'       };
      if (!menteeData)       return { label: 'Incomplete Profile', cls: 'pending-status' };
      return                         { label: 'Unassigned',  cls: 'unassigned'     };
    }
    if (u.role === 'Mentor') {
      if (u.isActive === false) return { label: 'Inactive', cls: 'inactive' };
      if (!mentorById.has(u.userID))  return { label: 'Incomplete Profile', cls: 'pending-status' };
      return           { label: 'Active',   cls: 'approved'       };
    }
    return u.isActive
      ? { label: 'Active',   cls: 'approved' }
      : { label: 'Inactive', cls: 'inactive' };
  }

  function matchesDashboardEngagement(user) {
    if (user.role !== 'Mentee') return false;
    const row = engagementByUser.get(user.userID);
    if (!row) return false;

    const assigned = row.isAssigned === true;
    const droppedOut = row.isDropOut === true;
    const attended = Number(row.sessionsAttended) > 0;
    const completed = Number(row.completedCheckpoints) || 0;

    switch (engagementFilter) {
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
  // "__current__" = whoever is Active right now; any other value is a "SchoolYear|Semester" key from a past snapshot.
  function matchesPeriodFilter(u) {
    if (!yearFilter) return true;
    if (yearFilter === '__current__') return true;
    const userPeriods = periodHistoryByUser.get(u.userID);
    return !!userPeriods && userPeriods.has(yearFilter);
  }
  function displayedPeriod() {
    if (yearFilter && yearFilter !== '__current__') {
      const [sy, sem] = yearFilter.split('|');
      return { schoolYear: sy, semester: sem };
    }
    return { schoolYear: systemSettings.SchoolYear, semester: systemSettings.Semester };
  }

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return allUsers.filter(u => {
      const fullName    = `${u.firstName} ${u.lastName}`.toLowerCase();
      const matchSearch = fullName.includes(s) ||
        (u.email || '').toLowerCase().includes(s) ||
        (u.studentNumber || '').toLowerCase().includes(s);
      const matchRole   = !roleFilter || u.role === roleFilter;
      const matchSchool = !schoolFilter || (schoolFilter === NO_SCHOOL
        ? isSchoolDepartmentMentor(u)
        : getUserSchool(u) === schoolFilter);
      const matchDept   = !deptFilter || getUserDeptName(u) === deptFilter;
      const matchGender = !genderFilter || (u.gender || '') === genderFilter;
      const matchStatus = !statusFilter || getUserStatus(u).label === statusFilter;
      const matchYear   = matchesPeriodFilter(u);
      const matchEngagement = !engagementFilter || matchesDashboardEngagement(u);
      return matchSearch && matchRole && matchSchool && matchDept && matchGender && matchStatus && matchYear && matchEngagement;
    });
  }, [allUsers, search, roleFilter, schoolFilter, deptFilter, genderFilter, statusFilter, yearFilter, engagementFilter, engagementByUser,
      mentorById, menteeById, activeAssignedMentees, allDepartments, periodHistoryByUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const page = Math.min(currentPage, totalPages);
  const pageStart = (page - 1) * rowsPerPage;
  const pageItems = useMemo(() => filtered.slice(pageStart, pageStart + rowsPerPage), [filtered, pageStart, rowsPerPage]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  useSmoothTable(usersWrapRef, pageItems);
  useSmoothTable(usersWrapRef, selectAllTick);

  // ── assignments ──
  const assignedIds = useMemo(() => new Set(allAssignments.map(a => a.menteeUserID)), [allAssignments]);

  // Requires a School to be picked first.
  const mentorFilterGroups = useMemo(() => {
    if (!aSchool) return null;
    const handling = new Set(allAssignments.filter(a => a.isActive !== false && a.menteeSchool === aSchool).map(a => a.mentorUserID));
    const mentors = allMentorsWithDept.filter(m => handling.has(m.userID)).slice().sort(sameName);
    const groups = {};
    mentors.forEach(m => {
      const dept = m.departmentName || 'No Department';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(m);
    });
    return { mentors, groups };
  }, [aSchool, allAssignments, allMentorsWithDept]);
  // Only keep the previous selection if it's still valid under the school scope.
  const effMentor = mentorFilterGroups && aMentor && mentorFilterGroups.mentors.some(m => String(m.userID) === aMentor) ? aMentor : '';

  const filteredAssignments = useMemo(() => {
    const q = aSearch.toLowerCase();
    // Build rows for mentees without an active assignment — drop-outs included.
    const unassignedRows = allUsers
      .filter(u => (u.role || u.Role) === 'Mentee' && u.isActive && !assignedIds.has(u.userID))
      .map(u => {
        const profile = menteeById.get(u.userID);
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
    const userById = new Map(allUsers.map(u => [u.userID, u]));
    const assignedRows = allAssignments.map(a => {
      const menteeData = menteeById.get(a.menteeUserID);
      const isDropOut  = menteeData?.isDropOut || false;
      const isDeactivated = userById.get(a.menteeUserID)?.isActive === false;
      return {
        ...a,
        statusLabel: isDeactivated ? 'Deactivated' : isDropOut ? 'Drop Out' : 'Assigned',
        statusCls:   isDeactivated ? 'inactive'    : isDropOut ? 'drop-out' : 'assigned'
      };
    });
    return [...assignedRows, ...unassignedRows]
      .filter(row => {
        const matchSearch = !q ||
          (row.menteeName || '').toLowerCase().includes(q) ||
          (row.mentorName || '').toLowerCase().includes(q);
        const matchSchool  = !aSchool        || row.menteeSchool === aSchool;
        const matchMentor  = !effMentor      || String(row.mentorUserID) === effMentor;
        const matchStatus  = !aStatus        || row.statusLabel === aStatus;
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
        const idA = a.assignmentID || a.menteeUserID || 0;
        const idB = b.assignmentID || b.menteeUserID || 0;
        return idB - idA;
      });
  }, [allUsers, allAssignments, assignedIds, menteeById, mentorById, activeAssignedMentees, yearFilter, periodHistoryByUser, aSearch, aSchool, effMentor, aStatus]);

  const aTotalPages = Math.max(1, Math.ceil(filteredAssignments.length / assignPerPage));
  const aPage = Math.min(assignmentPage, aTotalPages);
  const aStart = (aPage - 1) * assignPerPage;
  const assignItems = useMemo(() => filteredAssignments.slice(aStart, aStart + assignPerPage), [filteredAssignments, aStart, assignPerPage]);
  useSmoothTable(assignWrapRef, assignItems);

  // ── load data ──
  // Everything is applied to state in one go at the end, so the tables re-render once (like the vanilla render
  // after its last await) instead of once per response.
  async function fetchSettings() {
    let settings = D.current.systemSettings;
    try {
      const data = await apiRequest('Settings', 'GET', null, true);
      if (data) settings = { ...settings, ...data };
    } catch (e) { console.warn('Could not load system settings, using defaults.'); }
    return { settings, history: await fetchPeriodHistory(settings) };
  }

  // Builds periodHistoryByUser + the School Year filter options with every past period on record,
  // plus one "Current" option for whoever is Active right now.
  async function fetchPeriodHistory(settings) {
    try {
      const rows = await apiRequest('Settings/period-history', 'GET', null, true);
      const byUser = new Map();
      const periods = [];
      const seen = new Set();
      (rows || []).forEach(r => {
        const key = `${r.schoolYear}|${r.semester}`;
        if (!byUser.has(r.userID)) byUser.set(r.userID, new Map());
        byUser.get(r.userID).set(key, { wasAssigned: r.wasAssigned, wasDropOut: r.wasDropOut });
        if (!seen.has(key)) { seen.add(key); periods.push({ schoolYear: r.schoolYear, semester: r.semester, key }); }
      });
      periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));
      const currentKey = `${settings.SchoolYear}|${settings.Semester}`;
      const opts = [
        { value: '__current__', label: `${settings.Semester}, SY ${settings.SchoolYear} (Current)` },
        ...periods.filter(p => p.key !== currentKey).map(p => ({ value: p.key, label: `${p.semester}, SY ${p.schoolYear}` })),
      ];
      return { byUser, opts };
    } catch (e) { console.warn('Could not load period history.'); return null; }
  }

  async function fetchSections() {
    try {
      const data = await apiRequest('Sections', 'GET', null, true);
      setAllSections(data || []);
      D.current.allSections = data || [];
    } catch (e) { console.error('Error loading sections:', e); }
  }

  async function fetchSectionMentorView() {
    setSectionsState('loading');
    try {
      const data = await apiRequest('Sections/mentor-view', 'GET', null, true);
      setSectionMentorView(data || []);
      setSectionsState('ready');
    } catch (e) {
      console.error('Error loading mentor view:', e);
      setSectionsState('failed');
    }
  }

  async function fetchDepartments() {
    try {
      const data = await apiRequest('Users/departments', 'GET', null, true);
      setAllDepartments(data || []);
      D.current.allDepartments = data || [];
    } catch (e) { console.error('Error loading departments:', e); }
  }

  async function fetchMentorsWithDept() {
    try {
      const data = await apiRequest('Users/mentors-with-dept', 'GET', null, true);
      setAllMentorsWithDept(data || []);
      D.current.allMentorsWithDept = data || [];
    } catch (e) { console.error('Error loading mentors with dept:', e); }
  }

  async function fetchUsers() {
    try {
      const { settings, history } = await fetchSettings();
      const data = await apiRequest('Users', 'GET', null, true);
      const users = (data || []).sort((a, b) => {
        const dateA = new Date(a.createdAt || a.CreatedAt || 0);
        const dateB = new Date(b.createdAt || b.CreatedAt || 0);
        return dateB - dateA; // newest first
      });
      setSelected(new Set());
      const [assignments, mentors, mentees] = await Promise.all([
        apiRequest('Users/assignments', 'GET', null, true).then(d => d || []).catch(error => { console.error('Error loading assignments:', error); return []; }),
        apiRequest('Users/mentors-with-dept', 'GET', null, true).then(d => d || [], e => { console.error('Error loading mentors with dept:', e); return null; }),
        apiRequest('Users/mentees-with-dept', 'GET', null, true).then(d => d || [], e => { console.error('Error loading mentees with dept:', e); return null; }),
      ]);
      let engagement = null;
      if (D.current.engagementFilter) {
        try {
          const rows = await apiRequest('Users/engagement', 'GET', null, true);
          engagement = new Map((rows || []).map(row => [row.menteeID, row]));
        } catch (error) {
          engagement = new Map();
          showErrorModal('Could not load current-semester attendance details. Please refresh and try again.');
        }
      }
      // ── apply ──
      setSystemSettings(settings);
      D.current.systemSettings = settings;
      if (history) {
        setPeriodHistoryByUser(history.byUser);
        setPeriodOptions(history.opts);
        // keeps the previous selection only if it is still an option
        setYearFilter(prev => (prev && !history.opts.some(o => o.value === prev) ? '' : prev));
      }
      setAllUsers(users);
      D.current.allUsers = users;
      setAllAssignments(assignments);
      D.current.allAssignments = assignments;
      if (mentors) { setAllMentorsWithDept(mentors); D.current.allMentorsWithDept = mentors; }
      if (mentees) { setAllMenteesWithDept(mentees); D.current.allMenteesWithDept = mentees; }
      if (engagement) setEngagementByUser(engagement);
      setAssignmentPage(1);
      setAssignLoaded(true);
      fetchStats(users);
      setUsersRendered(true);
    } catch (error) {
      console.error('Error loading users:', error);
      setAllUsers([]);
      D.current.allUsers = [];
      setUsersRendered(true);
    }
  }

  async function fetchStats(users) {
    try {
      const data = await apiRequest('Users/stats', 'GET', null, true);
      const mentorCount = users.filter(u => u.role === 'Mentor').length;
      const menteeCount = users.filter(u => u.role === 'Mentee').length;
      setStats({ total: data.totalUsers ?? (mentorCount + menteeCount), mentors: mentorCount, mentees: menteeCount, unassigned: data.unassigned ?? '—' });
    } catch (e) { console.error('Error loading stats:', e); }
  }

  useEffect(() => {
    fetchDepartments();
    fetchSections();
    fetchUsers();
    const t1 = setTimeout(() => setSearch(''), 100);
    const t2 = setTimeout(() => setSearch(''), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // ── tab pill + switching ──
  function updateTabPill(animate = true) {
    const bar = tabsRef.current;
    const pill = pillRef.current;
    const btn = bar && bar.querySelector('.um-tab.active');
    if (!bar || !btn || !pill) return;
    pill.style.transition = animate ? '' : 'none';
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
    // Keep the active tab visible when the bar scrolls sideways on small screens.
    const left = btn.offsetLeft - 12, right = btn.offsetLeft + btn.offsetWidth + 12;
    if (left < bar.scrollLeft) bar.scrollTo({ left, behavior: 'smooth' });
    else if (right > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: right - bar.clientWidth, behavior: 'smooth' });
  }
  const firstPill = useRef(true);
  useLayoutEffect(() => {
    if (!ready) return;
    updateTabPill(!firstPill.current);
    firstPill.current = false;
  }, [tab, ready]);
  // the pill is placed once layout and fonts are ready
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => updateTabPill(false));
    if (document.fonts) document.fonts.ready.then(() => updateTabPill(false));
    // web fonts land after first layout: re-place the pill whenever a tab changes size
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && tabsRef.current) {
      ro = new ResizeObserver(() => updateTabPill(false));
      tabsRef.current.querySelectorAll('.um-tab').forEach(b => ro.observe(b));
    }
    return () => { cancelAnimationFrame(id); ro?.disconnect(); };
  }, [ready]);
  useEffect(() => {
    const onResize = () => updateTabPill(false);
    window.addEventListener('load', onResize);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('load', onResize); window.removeEventListener('resize', onResize); };
  }, []);

  function switchTab(next) {
    if (shownTab === next && tab === next) return;
    // Pill and tab colours move straight away, straight on the DOM: the heavy panel re-render below
    // must not hold them up (that wait was the stutter).
    const bar = tabsRef.current;
    if (bar) {
      bar.querySelectorAll('.um-tab').forEach(b => b.classList.toggle('active', b.id === 'tab-btn-' + next));
      updateTabPill(true);
    }
    if (next === 'sections' && !sectionsLoadedRef.current) {
      sectionsLoadedRef.current = true;
      fetchSectionMentorView();
    }
    const ORDER = ['users', 'assignments', 'sections'];
    const dir = ORDER.indexOf(next) >= ORDER.indexOf(shownTab) ? 'tab-fwd' : 'tab-back';   // slide direction follows the tab order
    const token = ++tabToken.current;
    const show = () => {
      if (token !== tabToken.current) return;
      // Let the pill start gliding before React renders the (large) panels.
      requestAnimationFrame(() => {
        if (token !== tabToken.current) return;
        setTab(next);
        setPanelCls({ users: '', assignments: '', sections: '', [next]: 'tab-enter ' + dir });
        setShownTab(next);
      });
    };
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPanelCls(c => ({ ...c, [shownTab]: 'tab-leave ' + dir }));       // slide + fade the old panel out…
      setTimeout(show, 170);                                        // …then bring the new one in
    } else {
      show();
    }
  }
  const panelProps = t => ({
    className: `tab-panel${panelCls[t] ? ' ' + panelCls[t] : ''}`,
    style: shownTab === t ? undefined : { display: 'none' },
  });

  // ── selection / bulk ──
  const selfId = String(getSession()?.user?.userID ?? '');
  function bulkTargets(mode) {
    return allUsers.filter(u => selected.has(u.userID) && String(u.userID) !== selfId && (
      mode === 'dropout'    ? u.role === 'Mentee' && u.isActive !== false && !menteeById.get(u.userID)?.isDropOut
      : mode === 'deactivate' ? u.isActive !== false
      : u.isActive === false));
  }
  const selCount = selected.size;
  function toggleSelectUser(userId, checked) {
    setSelected(prev => { const next = new Set(prev); if (checked) next.add(userId); else next.delete(userId); return next; });
  }
  const allPageChecked = pageItems.length > 0 && pageItems.every(u => selected.has(u.userID));
  function toggleSelectAll(checked) {
    setSelected(prev => { const next = new Set(prev); pageItems.forEach(u => { if (checked) next.add(u.userID); else next.delete(u.userID); }); return next; });
    setSelectAllTick(t => t + 1);
  }

  function openBulkStatusModal(mode) {
    const action = BULK_ACTIONS[mode];
    const targets = bulkTargets(mode);
    if (!action || !targets.length) return;
    const skipped = selected.size - targets.length;
    const n = targets.length;
    setBulkInfo({
      mode,
      msg: `${n} account${n > 1 ? 's' : ''} will be ${action.verb}.` +
        (skipped > 0 ? ` ${skipped} selected account${skipped > 1 ? 's' : ''} will be skipped (yours or ones that ${action.skip}).` : '') +
        ' Records will be retained. This can be reversed.',
    });
  }
  function hideBulkDeleteModal() { setBulkInfo(null); }
  // Each action only ever moves users in one direction, never toggles.
  async function confirmBulkDelete() {
    const mode = bulkInfo?.mode;
    const targets = mode ? bulkTargets(mode) : [];
    if (!targets.length) { hideBulkDeleteModal(); return; }
    let failed = 0;
    setBusy('bulk');
    try {
      for (const user of targets) {
        try {
          if (mode === 'dropout') await apiRequest(`Users/${user.userID}/dropout`, 'PATCH', { isDropOut: true }, true);
          else await apiRequest(`Users/${user.userID}/active`, 'PATCH', { isActive: mode === 'reactivate' }, true);
        } catch (e) { failed++; }
      }
      setSelected(new Set());
      await fetchUsers();
      if (sectionsLoadedRef.current) fetchSectionMentorView();
    } finally { setBusy(null); }
    hideBulkDeleteModal();
    if (failed > 0) showErrorModal(`${targets.length - failed} account(s) updated. ${failed} account(s) could not be updated. Please try again.`);
    else showStatusSuccess('Status Updated', `${targets.length} account(s) ${BULK_ACTIONS[mode].verb}. Existing records have been retained.`);
  }

  // ── mentor options ──
  // Any active mentor can take a mentee from any school. Mentors from the mentee's own school are listed first.
  function mentorOptions(menteeSchool, currentMentorId = null) {
    const active = allMentorsWithDept.filter(m => m.isActive !== false);
    const same   = active.filter(m => menteeSchool && m.school === menteeSchool).sort(sameName);
    const others = active.filter(m => !(menteeSchool && m.school === menteeSchool)).sort(sameName);
    const option = m => {
      const where = [m.departmentName, m.school].filter(Boolean).join(' · ') || 'No dept';
      return <option key={m.userID} value={m.userID}>{m.firstName} {m.lastName} ({where})</option>;
    };
    if (!active.length) return <option value="" disabled>No active mentors yet</option>;
    return (
      <>
        <option value="" disabled>Choose a mentor...</option>
        {same.length ? <optgroup label={menteeSchool}>{same.map(option)}</optgroup> : null}
        {others.length ? <optgroup label={same.length ? 'Other schools and departments' : 'All mentors'}>{others.map(option)}</optgroup> : null}
      </>
    );
  }
  const mentorSelectValue = (val, currentId) => (allMentorsWithDept.some(m => m.isActive !== false && String(m.userID) === String(val)) ? String(val) : '');
  void mentorSelectValue;

  // ── assignments tab actions ──
  function openEditAssignment(assignmentId, menteeName, menteeUserId, menteeSchool) {
    setEditAssign({ assignmentId, menteeUserId, menteeName, menteeSchool });
    setEditAssignMentor('');
  }
  function closeEditAssignModal() { setEditAssign(null); }

  async function runConfirm(action) {
    setBusy('um');
    try { await action(); } finally { setBusy(null); }
    setUmConfirm(null);
  }

  function confirmEditAssign() {
    const mentorId = parseInt(editAssignMentor);
    if (!mentorId) { showErrorModal('Please select a mentor.'); return; }
    if (!editAssign.menteeUserId) {
      showErrorModal('Could not identify the mentee. Please close and try again.');
      return;
    }
    const m = allMentorsWithDept.find(x => x.userID === mentorId);
    const where = m ? ([m.departmentName, m.school].filter(Boolean).join(' · ') || 'No dept') : '';
    const mentorName = m ? `${m.firstName} ${m.lastName} (${where})` : 'the selected mentor';
    const menteeName = editAssign.menteeName;
    const menteeId = editAssign.menteeUserId;
    const isReassign = !!editAssign.assignmentId;
    setUmConfirm({
      title: isReassign ? 'Reassign Mentor?' : 'Assign Mentor?',
      message: <>Are you sure you want to assign <strong>{menteeName}</strong> to <strong>{mentorName}</strong>?</>,
      confirmText: isReassign ? 'Reassign' : 'Assign',
      busyText: 'Saving…',
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

  async function doRemoveAssignment() {
    if (!removeAssignId) return;
    try {
      setBusy('remove');
      try {
        await apiRequest(`Users/assignments/${removeAssignId}`, 'DELETE', null, true);
        await fetchUsers();
      } finally { setBusy(null); }
      setRemoveAssignId(null);
      showStatusSuccess('Assignment Removed', 'The mentor-mentee assignment has been removed.');
    } catch (err) {
      setRemoveAssignId(null);
      showErrorModal('Failed to remove assignment. Please try again.');
    }
  }

  // ── exports / import ──
  function exportUsers() {
    if (allUsers.length === 0) { showErrorModal('No users to export.'); return; }
    const rows = [['Name', 'ID Number', 'Email', 'Role', 'School', 'Status']];
    allUsers.forEach(u => {
      rows.push([`${u.firstName} ${u.lastName}`, u.studentNumber || '—', u.email, u.role, getUserDept(u), getUserStatus(u).label]);
    });
    downloadCsv(rows, 'users.csv');
  }

  function exportAssignments() {
    if (allAssignments.length === 0) { showErrorModal('No assignments to export.'); return; }
    const rows = [['Mentee', 'Mentee Email', 'Course', 'Year Level', 'Mentor', 'Mentor Email', 'Department', 'Assigned Date', 'Status']];
    allAssignments.forEach(a => {
      const menteeData = menteeById.get(a.menteeUserID);
      const isDropOut  = menteeData?.isDropOut || false;
      // vw_AssignmentDetails has no email column, only names/IDs.
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
    downloadCsv(rows, 'assignments.csv');
  }

  const IMPORT_HEADER = [
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
  ];

  function downloadImportTemplate() {
    const rows = [
      IMPORT_HEADER,
      ['*** DELETE THIS ROW - Maria (Mentor example)', 'Santos', 'maria.santos@faith.edu.ph', 'Faith@2026', 'Mentor', 'Female', '', '09171234567', 'SOT', 'CCIT', '', ''],
      ['*** DELETE THIS ROW - Juan (Mentee example)', 'Dela Cruz', 'juan.delacruz@faith.edu.ph', 'Faith@2026', 'Mentee', 'Male', '2024-00101', '09181234567', 'SOT', '', 'BSIT', 'maria.santos@faith.edu.ph  - mentor email to auto-assign'],
      ['*** DELETE THIS ROW - Dan (Admin example)', 'Rivera', 'dan.rivera@faith.edu.ph', 'Faith@2026', 'Admin', 'Male', '', '', '', '', '', ''],
    ];
    downloadCsv(rows, 'users_import_template.csv', v => `"${String(v)}"`);
  }

  // Same column layout as the blank template, but pre-filled with every existing user's REAL current data.
  function downloadEditableUsers() {
    if (allUsers.length === 0) { showErrorModal('No users to download.'); return; }
    const schoolToAbbrev = {
      'School of Technology': 'SOT',
      'School of Humanities': 'SOH',
      'School of Management': 'SOM',
    };
    // Current mentor email per mentee, resolved from the live assignment list.
    const mentorEmailByMenteeId = {};
    allAssignments.forEach(a => {
      if (!a.isActive) return;
      const mentorUser = allUsers.find(u => u.userID === a.mentorUserID);
      if (mentorUser) mentorEmailByMenteeId[a.menteeUserID] = mentorUser.email;
    });
    const rows = [IMPORT_HEADER];
    allUsers.forEach(u => {
      let school = '', department = '', course = '', mentorEmail = '';
      if (u.role === 'Mentor') {
        const m = mentorById.get(u.userID);
        school     = schoolToAbbrev[m?.school] || m?.school || '';
        department = m?.departmentName || '';
      } else if (u.role === 'Mentee') {
        const m = menteeById.get(u.userID);
        school        = schoolToAbbrev[m?.school] || m?.school || '';
        course        = m?.course     || '';
        mentorEmail   = mentorEmailByMenteeId[u.userID] || '';
      }
      rows.push([
        u.firstName,
        u.lastName,
        u.email,
        '', // Password is always left blank — re-import never changes an existing user's password.
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
    downloadCsv(rows, 'users_current_editable.csv');
  }

  async function openImportModal() {
    setImportStartOpen(true);
    setImportRefLoading(true);
    setDeptDropOpen(null);
    // Always fetch fresh so newly added mentors/depts appear immediately
    await Promise.all([fetchDepartments(), fetchMentorsWithDept(), fetchUsers()]);
    setImportMentorSearch('');
    setImportRefLoading(false);
  }
  function hideImportStartModal() { setImportStartOpen(false); setDeptDropOpen(null); }

  const importMentorRefList = useMemo(() => allMentorsWithDept
    .filter(m => m.isActive !== false)
    .map(m => {
      const u = allUsers.find(u => u.userID === m.userID);
      return { ...m, email: u?.email || '' };
    })
    .sort(sameName), [allMentorsWithDept, allUsers]);
  const importMentorShown = useMemo(() => {
    const q = importMentorSearch.toLowerCase().trim();
    if (!q) return importMentorRefList;
    return importMentorRefList.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.school || '').toLowerCase().includes(q) ||
      (m.departmentName || '').toLowerCase().includes(q)
    );
  }, [importMentorRefList, importMentorSearch]);

  const importDeptGroups = useMemo(() => {
    const bySchool = {};
    // Each school also has a placeholder Department row whose name is the school's own name — skip it.
    allDepartments.forEach(d => {
      if (d.departmentName === d.school) return;
      const school = d.school || 'School Department';
      if (!bySchool[school]) bySchool[school] = [];
      bySchool[school].push(d.departmentName);
    });
    // School Department (SAS) is listed after the schools.
    return Object.entries(bySchool).sort(([a], [b]) => (a === 'School Department') - (b === 'School Department'));
  }, [allDepartments]);

  const DROP_BTN = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#dde0e5', border: '1px solid #c4c9d4', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', color: '#111827', textAlign: 'left' };
  const dropMenuStyle = (open, gap) => ({ display: open ? 'flex' : 'none', position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #c4c9d4', borderRadius: '6px', boxShadow: '0 6px 18px rgba(0,0,0,.16)', padding: '8px 10px', flexDirection: 'column', gap });
  const toggleDeptDropdown = (e, id) => { e.stopPropagation(); setDeptDropOpen(cur => (cur === id ? null : id)); };

  const importRefDepts = importRefLoading
    ? <div style={{ color: '#9ca3af' }}>Loading...</div>
    : allDepartments.length > 0
      ? importDeptGroups.map(([school, depts], i) => (
        <div style={{ position: 'relative', marginBottom: '4px' }} key={school}>
          <button className="dept-btn" onClick={e => toggleDeptDropdown(e, `deptDrop${i}`)} style={DROP_BTN}>
            {school}
            <span style={{ fontSize: '9px', color: '#6b7280' }}>&#9660;</span>
          </button>
          <div id={`deptDrop${i}`} className="dept-dropdown" style={dropMenuStyle(deptDropOpen === `deptDrop${i}`, '4px')}>
            {depts.map(d => <span style={{ color: '#1f2937', fontSize: '11.5px' }} key={d}>· {d}</span>)}
          </div>
        </div>
      ))
      : <div style={{ color: '#9ca3af' }}>No departments found.</div>;

  // Courses — SCHOOL_COURSES is a hardcoded const, no fetch needed.
  const importRefCourses = importRefLoading ? null : Object.entries(SCHOOL_COURSES).map(([school, groups], i) => (
    <div style={{ position: 'relative', marginBottom: '4px' }} key={school}>
      <button className="dept-btn" onClick={e => toggleDeptDropdown(e, `courseDrop${i}`)} style={DROP_BTN}>
        {school}
        <span style={{ fontSize: '9px', color: '#6b7280' }}>&#9660;</span>
      </button>
      <div id={`courseDrop${i}`} className="dept-dropdown" style={dropMenuStyle(deptDropOpen === `courseDrop${i}`, '6px')}>
        {groups.map(g => (
          <div key={g.group}>
            <div style={{ fontWeight: 700, color: '#374151', fontSize: '10.5px', marginBottom: '2px' }}>{g.group}</div>
            {g.courses.map(c => <span style={{ color: '#1f2937', fontSize: '11.5px', display: 'block' }} key={c}>&middot; {c}</span>)}
          </div>
        ))}
      </div>
    </div>
  ));

  const importRefMentors = importRefLoading
    ? <div style={{ color: '#9ca3af' }}>Loading...</div>
    : importMentorShown.length === 0
      ? <div style={{ color: '#9ca3af' }}>No mentors found.</div>
      : importMentorShown.map(m => (
        <div key={m.userID}>
          <strong style={{ color: '#111827' }}>{m.firstName} {m.lastName}</strong>
          <span style={{ color: '#4b5563', fontSize: '11px' }}> · {m.school || (m.departmentName ? 'School Department' : '—')} · {m.departmentName || '—'}</span><br />
          <span style={{ fontSize: '11px', color: '#374151' }}>{m.email || '—'}</span>
        </div>
      ));

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

  function validSchoolCourse(school, course) {
    if (!school || !normCourse(course)) return false;
    const approved = (SCHOOL_COURSES[school] || []).flatMap(g => g.courses);
    const custom = D.current.allSections.filter(s => s.school === school && s.isActive !== false).map(s => s.course);
    return [...approved, ...custom].some(c => normCourse(c) === normCourse(course));
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

      const isNew = !D.current.allUsers.find(u => u.email.toLowerCase() === row.email.toLowerCase());
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

    setImportRows(rows);
    setImportConfirmOpen(true);
  }

  function hideImportConfirmModal() { setImportConfirmOpen(false); setImportRows([]); }
  const importNewCount = importRows.filter(r => r.isNew).length;

  async function confirmImport() {
    const rows = importRows;
    if (rows.length === 0) { hideImportConfirmModal(); return; }
    setBusy('import');
    try {
      await runImport(rows);
    } finally {
      setBusy(null);
      hideImportConfirmModal();
    }
  }

  async function runImport(rows) {
    const { allDepartments: depts, allUsers: users, allMentorsWithDept: mentorsDept, allMenteesWithDept: menteesDept } = D.current;
    let created = 0, updated = 0, assigned = 0;
    const errors             = [];
    const pendingAssignments = []; // { menteeEmail, mentorEmail } — resolved after all registrations

    // ── Step 1: Register / update all users ──
    for (const row of rows) {
      // Pre-validate department for new mentors
      if (row.isNew && row.role === 'Mentor') {
        const dept = depts.find(d =>
          d.school === row.school &&
          d.departmentName.toLowerCase() === (row.department || '').toLowerCase()
        );
        if (!dept) {
          const valid = depts
            .filter(d => d.school === row.school)
            .map(d => d.departmentName)
            .join(', ') || 'none';
          errors.push(`${row.firstName} ${row.lastName}: Department "${row.department || '(blank)'}" not found under "${row.school}". Valid: ${valid}`);
          continue;
        }
      }

      // Pre-validate course for new mentees
      if (row.isNew && row.role === 'Mentee' && row.course) {
        const validCourses = (SCHOOL_COURSES[row.school] || []).flatMap(g => g.courses);
        if (!validSchoolCourse(row.school, row.course)) {
          errors.push(`${row.firstName} ${row.lastName}: Course "${row.course}" not found under "${row.school}". Valid: ${validCourses.join(', ') || 'none'}`);
          continue;
        }
      }

      try {
        if (!row.isNew) {
          const existing = users.find(u => u.email.toLowerCase() === row.email.toLowerCase());

          // A CSV re-import updates ONLY the columns you filled in — everything left blank carries its
          // current value forward untouched.
          const existingProfile = row.role === 'Mentor'
            ? mentorsDept.find(m => m.userID === existing.userID)
            : row.role === 'Mentee'
              ? menteesDept.find(m => m.userID === existing.userID)
              : null;

          const payload = {
            firstName:     row.firstName,
            lastName:      row.lastName,
            email:         row.email,
            // Never touch password on a re-import.
            newPassword:   null,
            contactNumber: row.contact         || existing.contactNumber || null,
            studentNumber: row.studentNumber   || existing.studentNumber || null,
            role:          row.role,
            gender:        row.gender          || existing.gender        || null,
            school:        row.school          || existingProfile?.school || null,
          };

          if (row.role === 'Mentor') {
            const deptNameToUse = row.department || existingProfile?.departmentName || '';
            const dept = depts.find(d =>
              d.school === payload.school && d.departmentName.toLowerCase() === deptNameToUse.toLowerCase()
            );
            payload.departmentID = dept ? dept.departmentID : (existingProfile?.departmentID ?? null);
          } else if (row.role === 'Mentee') {
            const courseToUse = row.course || existingProfile?.course || '';
            payload.course    = courseToUse;
            if (!validSchoolCourse(payload.school, courseToUse)) {
              errors.push('Mentee update requires a valid school and course. Existing data was preserved.');
              continue;
            }
          }

          await apiRequest(`Users/${existing.userID}`, 'PUT', payload, true);
          updated++;

          // Re-import with a new "Assign to Mentor Email" reassigns an existing mentee too.
          if (row.role === 'Mentee' && row.mentorEmail) {
            pendingAssignments.push({ menteeEmail: row.email, mentorEmail: row.mentorEmail });
          }
        } else if (row.role === 'Mentor') {
          const dept = depts.find(d =>
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
          if (!validSchoolCourse(row.school, row.course)) throw new Error('Choose a valid course for the selected school.');
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

    // ── Step 2: Assign mentors (batch after all registrations) ──
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

    // ── Step 3: Refresh UI ──
    await fetchUsers();
    if (sectionsLoadedRef.current) fetchSectionMentorView();

    const total    = created + updated;
    const isSuccess = errors.length === 0;
    const isFailed  = errors.length > 0 && total === 0;
    const isPartial = errors.length > 0 && total > 0;

    // A clean import is a corner alert; results with errors keep the modal so the list can be read.
    if (isSuccess) {
      showStatusSuccess('Import Successful', `${created} created · ${updated} updated · ${assigned} assigned.`);
      return;
    }
    setImportResult({ created, updated, assigned, errors, isFailed, isPartial });
  }

  // ── sections tab ──
  const sectionView = useMemo(() => {
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
    let mentors = Object.values(mentorMap).map(m => ({
      ...m,
      shown: activeSchoolFilter ? m.mentees.filter(e => e.school === activeSchoolFilter) : m.mentees
    }));
    if (activeSchoolFilter) {
      mentors = mentors.filter(m => m.shown.length || (!m.mentees.length && m.school === activeSchoolFilter));
    }

    // Course filter options: the courses the listed mentors' mentees take, grouped by department,
    // plus no-school departments (e.g. SAS) as "mentor:<name>".
    const used = new Set(mentors.flatMap(m => m.shown.map(e => normCourse(e.course || e.sectionCode))).filter(Boolean));
    const values = [];
    const groups = [];
    (activeSchoolFilter ? [activeSchoolFilter] : SCHOOLS).forEach(sc =>
      (SCHOOL_COURSES[sc] || []).forEach(({ group, courses }) => {
        const list = courses.filter(c => used.has(normCourse(c)));
        if (!list.length) return;
        const dept = COLLEGE_DEPARTMENTS[group] || group;
        values.push(...list);
        groups.push({ label: activeSchoolFilter ? dept : `${dept} · ${sc}`, options: list.map(c => ({ value: c, label: c })) });
      }));
    if (!activeSchoolFilter) {
      const noSchoolDepts = [...new Set([
        ...allDepartments.filter(d => !d.school && d.isActive !== false).map(d => d.departmentName),
        ...mentors.filter(m => !m.school).map(m => m.departmentName),
      ].filter(Boolean))].sort();
      values.push(...noSchoolDepts.map(d => 'mentor:' + d));
      if (noSchoolDepts.length) groups.push({ label: 'School Department', options: noSchoolDepts.map(d => ({ value: 'mentor:' + d, label: d })) });
    }
    const courseFilter = values.includes(sCourse) ? sCourse : '';
    if (courseFilter.startsWith('mentor:')) {
      mentors = mentors.filter(m => !m.school && m.departmentName === courseFilter.slice(7));
    } else if (courseFilter) {
      mentors = mentors
        .map(m => ({ ...m, shown: m.shown.filter(e => normCourse(e.course || e.sectionCode) === normCourse(courseFilter)) }))
        .filter(m => m.shown.length);
    }

    const q = sSearch.toLowerCase();
    if (q) {
      mentors = mentors.filter(m => {
        const nameMatch    = `${m.firstName} ${m.lastName}`.toLowerCase().includes(q);
        const sectionMatch = m.shown.some(me => (me.sectionCode || me.course || '').toLowerCase().includes(q));
        const menteeMatch  = m.shown.some(me => `${me.firstName} ${me.lastName}`.toLowerCase().includes(q));
        return nameMatch || sectionMatch || menteeMatch;
      });
    }
    return { mentors, groups, courseFilter };
  }, [sectionMentorView, activeSchoolFilter, sCourse, sSearch, allDepartments, menteeById]);

  function schoolStat(school, what) {
    if (sectionsState !== 'ready') return <span className="stat-pulse">—</span>;
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
    return what === 'mentors' ? mentorSet.size : menteeSet.size;
  }

  function filterBySchool(school) {
    setActiveSchoolFilter(cur => (cur === school ? '' : school));
    setSCourse('');
  }

  const AVATAR_COLORS = ['#6366f1','#0ea5e9','#f59e0b','#10b981','#f43f5e'];
  const MENTEE_COLORS = [
    { bg: '#bbf7d0', text: '#14532d' },
    { bg: '#bfdbfe', text: '#1e3a8a' },
    { bg: '#fde68a', text: '#78350f' },
    { bg: '#fbcfe8', text: '#831843' },
    { bg: '#e9d5ff', text: '#4c1d95' },
    { bg: '#fed7aa', text: '#7c2d12' },
  ];

  let sectionList;
  if (sectionsState === 'idle' || sectionsState === 'loading') sectionList = <Empty className="empty-state" style={{ padding: '48px 0' }}><span className="spinner"></span> Loading...</Empty>;
  else if (sectionsState === 'failed') sectionList = <Empty className="empty-state" style={{ padding: '48px 0' }}>Could not load data.</Empty>;
  else if (sectionView.mentors.length === 0) sectionList = <Empty className="empty-state" style={{ padding: '48px 0' }}>No mentors match the selected filters.</Empty>;
  else {
    sectionList = [...sectionView.mentors].sort((a, b) => sameName({ lastName: a.lastName, firstName: a.firstName }, { lastName: b.lastName, firstName: b.firstName })).map((m, idx) => {
      const initials  = `${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase();
      const color     = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      const expanded  = expandedMentors.has(m.mentorID);
      const activeSec = activeSectionFilter[m.mentorID] || null;

      const sections = [...new Set(m.shown.map(me => me.sectionCode).filter(Boolean))].sort();
      const dropOuts = m.shown.filter(me => me.isDropOut).length;
      const activeCount = m.shown.length - dropOuts;

      const visibleMentees = (activeSec
        ? m.shown.filter(me => me.sectionCode === activeSec)
        : m.shown
      ).slice().sort((a, b) => (a.sectionCode || '').localeCompare(b.sectionCode || '', undefined, { numeric: true, sensitivity: 'base' }) || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

      const setSectionFilter = (e, sectionCode) => {
        e.stopPropagation();
        setActiveSectionFilter(f => ({ ...f, [m.mentorID]: sectionCode }));
        setExpandedMentors(s => new Set(s).add(m.mentorID));
      };

      const menteeRows = visibleMentees.map((me, mi) => {
        const mInitials = `${me.firstName?.[0] || ''}${me.lastName?.[0] || ''}`.toUpperCase();
        const mColor    = MENTEE_COLORS[mi % MENTEE_COLORS.length];
        const label     = me.sectionCode || me.section || '—';
        return (
          <div className="mentee-row" key={me.menteeID}>
            <div className="mentee-avatar" style={{ background: mColor.bg, color: mColor.text }}>{mInitials}</div>
            <div className="mentee-info">
              <div className="mentee-name">{me.firstName} {me.lastName}{me.isDropOut ? <> <span className="mentee-dropout-tag">Drop Out</span></> : null}</div>
              <div className="mentee-meta">{me.studentNumber || '—'} · {me.yearLevel || me.course || '—'} · {label}</div>
            </div>
            <button className="mentee-view-btn" onClick={() => setMenteeProfileId(me.menteeID)} title="View Profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              View Profile
            </button>
          </div>
        );
      });

      return (
        <div className="mentor-accordion-card" id={`mentor-accordion-${m.mentorID}`} key={m.mentorID}>
          <div className="mentor-accordion-header" onClick={() => setExpandedMentors(s => { const n = new Set(s); if (n.has(m.mentorID)) n.delete(m.mentorID); else n.add(m.mentorID); return n; })}>
            <div className="mentor-acc-avatar" style={{ background: color }}>{initials}</div>
            <div className="mentor-info">
              <div className="mentor-name">{m.firstName} {m.lastName}</div>
              <div className="mentor-dept">{m.departmentName || m.school || '—'}</div>
            </div>
            <div className="mentor-section-pills-preview">{sections.map(s => <span className="section-pill-badge" key={s}>{s}</span>)}</div>
            <div className="mentor-mentee-count">{activeCount} mentee{activeCount !== 1 ? 's' : ''}{dropOuts ? ` · ${dropOuts} drop out` : ''}</div>
            <svg className={`accordion-chevron${expanded ? ' rotated' : ''}`} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <div className="mentor-accordion-body" style={{ display: expanded ? 'block' : 'none' }}>
            {sections.length > 0 ? (
              <div className="section-filter-pills">
                <button className={`section-pill${!activeSec ? ' active' : ''}`} onClick={e => setSectionFilter(e, null)}>All Sections</button>
                {sections.map(s => (
                  <button className={`section-pill${activeSec === s ? ' active' : ''}`} key={s} onClick={e => setSectionFilter(e, s)}>{s}</button>
                ))}
              </div>
            ) : null}
            <div className="mentor-mentee-list">
              {menteeRows.length ? menteeRows : <Empty className="empty-state" style={{ padding: '20px' }}>No mentees in this section.</Empty>}
            </div>
          </div>
        </div>
      );
    });
  }

  // Read-only mentee profile opened from the Courses tab.
  let menteeProfile = null;
  if (menteeProfileId !== null) {
    const u = allUsers.find(x => x.userID === menteeProfileId);
    if (u) {
      const m = menteeById.get(menteeProfileId) || {};
      const a = allAssignments.find(x => x.menteeUserID === menteeProfileId && x.isActive);
      const status = getUserStatus(u);
      menteeProfile = {
        name: `${u.firstName} ${u.lastName}`,
        rows: [
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
        ],
      };
    }
  }

  // ── users table rows ──
  const period = displayedPeriod();
  function sigStatusFor(u) {
    const role = u.role || '';
    if (role === 'Mentor') {
      const p = mentorById.get(u.userID);
      if (!p) return null;
      return p.signatureFilePath ? SIG_UPLOADED : SIG_MISSING;
    }
    if (role === 'Mentee') {
      const p = menteeById.get(u.userID);
      if (!p) return null;
      return p.signatureFilePath ? SIG_UPLOADED : SIG_MISSING;
    }
    // Admin and Head keep their signature on the user record itself.
    if (role === 'Admin' || role === 'Head') return u.signatureFilePath ? SIG_UPLOADED : SIG_MISSING;
    return null;
  }

  function schoolDeptCell(u) {
    if (u.role !== 'Mentor' && u.role !== 'Mentee') return 'N/A';
    const school = getUserSchool(u);
    const sub = u.role === 'Mentor' ? getUserDeptName(u) : menteeById.get(u.userID)?.course || null;
    const top = school !== '—' ? school : (u.role === 'Mentor' && sub ? 'School Department' : '—');
    return <div className="user-name-cell"><div>{top}</div>{sub ? <div className="u-id">{sub}</div> : null}</div>;
  }

  let userRows = null;
  if (usersRendered) {
    if (pageItems.length === 0) {
      userRows = <tr><Empty as="td" colSpan="10" className="empty-state">No users found.</Empty></tr>;
    } else {
      userRows = pageItems.map(u => {
        const status = getUserStatus(u);
        const statusCls = status.label === 'Assigned'   ? 'assigned'
                        : status.label === 'Active'    ? 'approved'
                        : status.label === 'Incomplete Profile' ? 'pending-status'
                        : status.label === 'Inactive'  ? 'inactive'
                        : status.label === 'Drop Out'  ? 'drop-out'
                        : 'unassigned';
        const rowCls = status.label === 'Drop Out' ? 'row-dropout'
                     : status.label === 'Inactive' ? 'row-inactive'
                     : undefined;
        const isSelfRow  = String(u.userID) === selfId;
        const menuTitle  = isSelfRow ? 'Cannot modify your own account' : 'More actions';
        const sig = sigStatusFor(u);
        return (
          <tr className={rowCls} key={u.userID}>
            <td className="col-check">
              <input type="checkbox" className="row-checkbox" checked={selected.has(u.userID)}
                onChange={e => toggleSelectUser(u.userID, e.target.checked)} />
            </td>
            <td>
              <div className="user-name-cell">
                <div className="u-name">{u.firstName} {u.lastName}</div>
                <div className="u-id">{u.studentNumber ? u.studentNumber : '—'}</div>
              </div>
            </td>
            <td className="td-left">{u.email}</td>
            <td>{period.schoolYear}</td>
            <td>{period.semester}</td>
            <td>{u.gender ? <span className={`badge gender-${(u.gender || '').toLowerCase()}`}>{u.gender}</span> : '—'}</td>
            <td><span className={`badge ${(u.role || '').toLowerCase()}`}>{u.role === 'Head' ? 'Head Admin' : u.role}</span></td>
            <td>{schoolDeptCell(u)}</td>
            <td><span className={`badge ${statusCls}`}>{status.label === 'Inactive' ? 'Deactivated' : status.label}</span></td>
            <td style={{ textAlign: 'center' }}>{sig ?? '—'}</td>
            <td>
              <div className="action-cell">
                <button className="icon-edit" onClick={() => openEdit(u.userID)} title="Edit">{ICON_EDIT}</button>
                <button className="icon-more" onClick={e => openRowMenu(e, u.userID)} title={menuTitle} aria-label={menuTitle} aria-haspopup="menu"
                  disabled={isSelfRow} style={isSelfRow ? { opacity: '.35', cursor: 'not-allowed' } : undefined}>
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                </button>
              </div>
            </td>
          </tr>
        );
      });
    }
  }
  const showingText = !usersRendered ? '' : filtered.length === 0 ? 'No entries found'
    : `Showing ${pageStart + 1} to ${Math.min(pageStart + rowsPerPage, filtered.length)} of ${filtered.length} entries`;

  // ── assignments table rows ──
  let assignRows;
  if (!assignLoaded) assignRows = <tr><Empty as="td" colSpan="8" className="empty-state"><span className="spinner"></span> Loading...</Empty></tr>;
  else if (filteredAssignments.length === 0) assignRows = <tr><Empty as="td" colSpan="8" className="empty-state">No assignments found.</Empty></tr>;
  else {
    assignRows = assignItems.map((row, i) => {
      const isAssigned = row.assignmentID !== null;
      const deptClass  = (row.departmentName || '').toLowerCase() === 'tertiary' ? 'dept-tertiary'
                       : (row.departmentName || '').toLowerCase() === 'fidelis'  ? 'dept-fidelis'
                       : (row.departmentName || '').toLowerCase() === 'sas'      ? 'dept-sas'
                       : '';
      return (
        <tr key={row.assignmentID ?? `u${row.menteeUserID}`}>
          <td>{row.menteeName ? row.menteeName : '—'}</td>
          <td>{row.course || '—'}</td>
          <td>{row.mentorName ? row.mentorName : '—'}</td>
          <td>{row.departmentName ? <span className={`badge ${deptClass}`}>{row.departmentName}</span> : '—'}</td>
          <td>{row.assignedDate ? formatDate(row.assignedDate) : '—'}</td>
          <td><span className={`badge ${row.statusCls}`}>{row.statusLabel}</span></td>
          <td>
            <div className="action-cell">
              <button className="icon-edit" onClick={() => openEditAssignment(isAssigned ? row.assignmentID : null, row.menteeName, row.menteeUserID, row.menteeSchool || '')}
                title={isAssigned ? 'Reassign' : 'Assign Mentor'}>{ICON_EDIT}</button>
              {isAssigned ? <button className="icon-delete" onClick={() => setRemoveAssignId(row.assignmentID)} title="Remove">{ICON_TRASH}</button> : null}
            </div>
          </td>
        </tr>
      );
    });
  }
  const assignShowing = assignLoaded && filteredAssignments.length
    ? `Showing ${aStart + 1} to ${Math.min(aStart + assignPerPage, filteredAssignments.length)} of ${filteredAssignments.length} entries` : '';

  // Assignment stat cards
  const aStat = (v) => (assignLoaded ? v : <span className="stat-pulse">—</span>);
  const aTotal = allAssignments.length;
  const aUnassigned = allUsers.filter(u =>
    u.role === 'Mentee' && u.isActive && !assignedIds.has(u.userID) && menteeById.has(u.userID)).length;
  const aPending = allUsers.filter(u =>
    (u.role === 'Mentor' || u.role === 'Mentee') && u.isActive && !mentorById.has(u.userID) && !menteeById.has(u.userID)).length;

  // ── Add / edit user modal ──
  const setF = (patch) => setForm(f => ({ ...f, ...patch }));

  function updatePasswordHint(isEditing) {
    return isEditing;
  }

  function openAdd() {
    setEditingId(null);
    setForm({
      firstName: '', lastName: '', email: '', password: '', contact: '', studentNumber: '', role: '', gender: '',
      mentorSchool: '', mentorDept: '', menteeSchool: '', menteeAssignMentor: '', course: '', editMentor: '',
    });
    setExtraCourse(null);
    setMentorFieldsOn(false); setMenteeFieldsOn(false); setEditAssignOn(false); setAssignGroupOn(true);
    setShowPw(false);
    setModalOpen(true);
  }

  function crossSchoolMentor(mentor) {
    return !mentor.school && allDepartments.some(d => d.departmentID === mentor.departmentID && !d.school && d.isActive !== false);
  }

  const mentorSchoolValues = new Set(['', ...SCHOOLS, ...(allDepartments.some(d => !d.school) ? [NO_SCHOOL] : [])]);

  function openEdit(id) {
    const user = allUsers.find(u => u.userID === id);
    if (!user) return;
    setEditingId(id);
    setShowPw(false);

    const isMentor = user.role === 'Mentor';
    const isMentee = user.role === 'Mentee';
    const next = {
      firstName: user.firstName, lastName: user.lastName, email: user.email, password: '',
      contact: user.contactNumber || '', studentNumber: user.studentNumber || '', role: user.role, gender: user.gender || '',
    };

    setMentorFieldsOn(isMentor);
    setMenteeFieldsOn(isMentee);

    setForm(f => {
      const out = { ...f, ...next };
      if (isMentor) {
        const mentorData = mentorById.get(user.userID);
        const sv = mentorData?.school || (crossSchoolMentor(mentorData || {}) ? NO_SCHOOL : '');
        out.mentorSchool = mentorSchoolValues.has(sv) ? sv : '';
        out.mentorDept = out.mentorSchool ? String(mentorData?.departmentID || '') : '';
      }
      if (isMentee) {
        const menteeData = menteeById.get(user.userID);
        out.menteeSchool = SCHOOLS.includes(menteeData?.school) ? menteeData.school : '';
        // the hidden Year Level select only carries a 1st Year option
        out.course = menteeData?.course || '';
        out.menteeAssignMentor = '';
      }
      return out;
    });

    if (isMentee) {
      const menteeData = menteeById.get(user.userID);
      const school = SCHOOLS.includes(menteeData?.school) ? menteeData.school : '';
      const inList = (SCHOOL_COURSES[school] || []).some(g => g.courses.includes(menteeData?.course));
      setExtraCourse(menteeData?.course && !inList ? menteeData.course : null);
      setAssignGroupOn(false);
    }

    if (isMentee) {
      const status = getUserStatus(user);
      if (status.label === 'Drop Out') {
        setEditAssignOn(false);
      } else {
        const currentMentorId = allAssignments.find(a => a.menteeUserID === user.userID && a.isActive)?.mentorUserID || null;
        setEditAssignTitle(currentMentorId ? 'Reassign Mentor' : 'Assign Mentor');
        setEditAssignOn(true);
        setForm(f => ({ ...f, editMentor: currentMentorId ? String(currentMentorId) : '' }));
      }
    } else {
      setEditAssignOn(false);
    }
    setModalOpen(true);
  }

  function handleRoleChange(role) {
    setMentorFieldsOn(role === 'Mentor');
    setMenteeFieldsOn(role === 'Mentee');
    setEditAssignOn(false);
    setForm(f => ({ ...f, role, menteeSchool: '', menteeAssignMentor: '', course: '' }));
    setExtraCourse(null);
    setAssignGroupOn(true);
  }

  function mentorSchoolValue() {
    return form.mentorSchool === NO_SCHOOL ? null : (form.mentorSchool || null);
  }

  const mentorDepts = form.mentorSchool
    ? allDepartments.filter(d => (form.mentorSchool === NO_SCHOOL ? !d.school : d.school === form.mentorSchool) && d.departmentName !== form.mentorSchool)
    : [];

  // Confirms before saveUser() — every account-changing action asks first, adds included.
  function openSaveUserConfirm() {
    const firstName     = form.firstName.trim();
    const lastName      = form.lastName.trim();
    const email         = form.email.trim();
    const password      = form.password;
    const role          = form.role;
    const studentNumber = form.studentNumber.trim();
    const gender        = form.gender;

    if (!firstName || !lastName || !email || !role) {
      showErrorModal('Please fill in all required fields (First Name, Last Name, Email, Role).');
      return;
    }
    if (!editingId && !password) {
      showErrorModal('A password is required when creating a new user.');
      return;
    }
    if (password) {
      const passwordProblem = validatePassword(password);
      if (passwordProblem) { showErrorModal(passwordProblem); return; }
    }
    if (!gender) {
      showErrorModal('Please select a gender.');
      return;
    }
    if (!studentNumber) {
      showErrorModal('ID Number is required.');
      return;
    }
    if (role === 'Mentee' && !validSchoolCourse(form.menteeSchool, form.course)) {
      showErrorModal('Choose a valid course for the selected school. Sections are not required.'); return;
    }
    setSaveConfirmOpen(true);
  }

  async function confirmSaveUser() {
    const isEdit = !!editingId;
    setBusy('save');
    let saved;
    try { saved = await saveUser(); } finally { setBusy(null); }
    setSaveConfirmOpen(false);
    if (saved) showStatusSuccess(isEdit ? 'Changes Saved' : 'User Added',
      isEdit ? 'The account has been updated.' : 'The new account has been created.');
  }

  async function saveUser() {
    const firstName     = form.firstName.trim();
    const lastName      = form.lastName.trim();
    const email         = form.email.trim();
    const password      = form.password;
    const contactNumber = form.contact.trim();
    const role          = form.role;
    const studentNumber = form.studentNumber.trim() || null;
    const gender        = form.gender || null;

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
          updatePayload.departmentID = parseInt(form.mentorDept) || null;
        }

        if (role === 'Mentee') {
          const menteeData = menteeById.get(editingId);
          // The hidden Year Level select only holds "1st Year": any other saved level reads back as blank.
          const yl = menteeData?.yearLevel || '1st Year';
          updatePayload.school     = form.menteeSchool || null;
          updatePayload.course     = form.course.trim();
          updatePayload.yearLevel  = (yl === '1st Year' ? '1st Year' : '') || null;
        }

        await apiRequest(`Users/${editingId}`, 'PUT', updatePayload, true);

        // Two different pickers can hold the chosen mentor: the edit-mode one (an existing mentee) or the
        // add-mode one (switching a role to Mentee mid-edit). Whichever is actually visible is the one used.
        const mentorId = editAssignOn
          ? parseInt(form.editMentor)
          : assignGroupOn
            ? parseInt(form.menteeAssignMentor)
            : NaN;
        if (mentorId) {
          await apiRequest('Users/assign', 'POST', {
            menteeUserId: editingId,
            mentorUserId: mentorId
          }, true);
        }

      } else if (role === 'Mentor') {
        const school       = mentorSchoolValue();
        const departmentID = parseInt(form.mentorDept) || null;
        if (!form.mentorSchool) { showErrorModal('Please select a school for the mentor.'); return; }
        if (!departmentID) { showErrorModal('Please select a department for the mentor.'); return; }
        await safeRegister('Auth/register-mentor', {
          firstName, lastName, email, password, contactNumber, studentNumber,
          school, departmentID, gender
        });

      } else if (role === 'Mentee') {
        const school    = form.menteeSchool;
        const course    = form.course.trim();
        const yearLevel = '1st Year';
        const section   = null;
        const mentorId  = parseInt(form.menteeAssignMentor) || null;
        if (!school) { showErrorModal('Please select a school for the mentee.'); return; }

        await safeRegister('Auth/register-mentee', {
          firstName, lastName, email, password, contactNumber, studentNumber,
          school, course, yearLevel, section, sectionID: null, gender
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

      setModalOpen(false);
      await fetchUsers();
      if (sectionsLoadedRef.current) fetchSectionMentorView();
      return true;

    } catch (err) {
      showErrorModal(friendlyError(err));
    }
  }

  // ── row ⋮ menu ──
  function openRowMenu(event, id) {
    event.stopPropagation();
    const user = allUsers.find(u => u.userID === id);
    if (!user) return;
    if (String(id) === selfId) { showToast('You cannot modify your own account.', 'error'); return; }
    if (rowMenu && rowMenu.id === id) { setRowMenu(null); return; }
    setRowMenu({ id, rect: event.currentTarget.getBoundingClientRect() });
  }
  const rowMenuUser = rowMenu ? allUsers.find(u => u.userID === rowMenu.id) : null;
  const rowMenuItems = [];
  if (rowMenuUser) {
    if (rowMenuUser.role === 'Mentee' && rowMenuUser.isActive !== false) {
      const isDropOut = menteeById.get(rowMenu.id)?.isDropOut;
      rowMenuItems.push(['dropout', isDropOut ? 'Reinstate' : 'Mark as Drop Out', '']);
    }
    rowMenuItems.push(['active', rowMenuUser.isActive === false ? 'Reactivate account' : 'Deactivate account', '']);
    rowMenuItems.push(['delete', 'Permanently delete', 'danger']);
  }
  function rowMenuAction(action, id) {
    setRowMenu(null);
    if (action === 'dropout') openDropOutConfirm(id);
    else if (action === 'active') openActiveConfirm(id);
    else if (action === 'delete') openPermanentDeleteConfirm(id);
  }

  function openDropOutConfirm(id) {
    const user = allUsers.find(u => u.userID === id);
    if (!user) return;
    const isCurrentlyDropOut = menteeById.get(id)?.isDropOut || false;
    setModalOpen(false);
    setDropBusy(false);
    setDropTarget({ id, newVal: !isCurrentlyDropOut, name: `${user.firstName} ${user.lastName}` });
  }
  function closeDropOutModal() { setDropTarget(null); }
  async function confirmDropOut() {
    if (!dropTarget) return;
    const { id, newVal } = dropTarget;
    setDropBusy(true);
    try {
      await apiRequest(`Users/${id}/dropout`, 'PATCH', { isDropOut: newVal }, true);
      closeDropOutModal();
      await fetchUsers();
      showStatusSuccess(newVal ? 'Mentee Marked as Dropped Out' : 'Mentee Reinstated',
        newVal ? 'The mentee is now marked as Dropped Out. Existing records have been retained.' : 'The mentee\'s Dropped Out status has been removed. Existing records have been retained.');
    } catch (err) {
      setDropBusy(false);
      showErrorModal('Failed to update Drop Out status. Please try again.');
    }
  }

  function openActiveConfirm(id) {
    const user = allUsers.find(u => u.userID === id);
    if (!user) return;
    const isCurrentlyActive = user.isActive !== false;
    setModalOpen(false);
    setActiveBusy(false);
    setActiveTarget({ id, newVal: !isCurrentlyActive, name: `${user.firstName} ${user.lastName}` });
  }
  function closeActiveModal() { setActiveTarget(null); }
  async function confirmActiveToggle() {
    if (!activeTarget) return;
    const { id, newVal } = activeTarget;
    setActiveBusy(true);
    try {
      await apiRequest(`Users/${id}/active`, 'PATCH', { isActive: newVal }, true);
      closeActiveModal();
      // The mentor list is a separate cache from allUsers — refresh both so a just-deactivated mentor
      // stops showing up as assignable.
      await Promise.all([fetchUsers(), fetchMentorsWithDept()]);
      showStatusSuccess(newVal ? 'Account Reactivated' : 'Account Deactivated',
        newVal ? 'The account can log in again. Existing records have been retained.' : 'The account can no longer log in. Existing records have been retained.');
    } catch (err) {
      setActiveBusy(false);
      showErrorModal(err.message || 'Failed to update account status. Please try again.');
    }
  }

  // ── permanent delete ──
  function clientDeleteBlock(user) {
    if (user.role === 'Mentee') {
      const m = menteeById.get(user.userID);
      if (m?.isDropOut) return 'dropout';
    }
    return null;
  }
  function classifyDeleteBlock(user, message = '') {
    const t = message.toLowerCase();
    if (t.includes('drop out') && t.includes('marked as')) return 'dropout';
    if (t.includes('only active administrator')) return 'lastAdmin';
    if (t.includes('assigned to a mentor') || t.includes('active mentee assignment')) return 'assigned';
    if (t.includes('announcements') || t.includes('evaluation links')) return 'posts';
    if (t.includes('sessions') || t.includes('makeup')) return user?.role === 'Mentee' ? 'sharedHistory' : 'history';
    return 'generic';
  }

  function openPermanentDeleteConfirm(id) {
    const user = allUsers.find(u => u.userID === id);
    if (!user) { showToast('Could not find this account. Please reopen it and try again.', 'error'); return; }
    if (String(id) === selfId) { setBlocked({ user, kind: 'self' }); return; }
    const b = clientDeleteBlock(user);
    if (b) { setBlocked({ user, kind: b }); return; }
    setPermDelete({ id, name: `${user.firstName} ${user.lastName}` });
  }
  async function confirmPermanentDelete() {
    if (!permDelete) return;
    const targetId = permDelete.id;
    const user = allUsers.find(u => u.userID === targetId);
    const name = user ? `${user.firstName} ${user.lastName}` : 'The account';
    try {
      setBusy('perm');
      try {
        await apiRequest(`Users/${targetId}`, 'DELETE', null, true);
        setModalOpen(false);
        await fetchUsers();
        if (sectionsLoadedRef.current) fetchSectionMentorView();
      } finally { setBusy(null); }
      setPermDelete(null);
      showStatusSuccess('Account Deleted', `${name}'s account has been permanently deleted.`);
    } catch (err) {
      setPermDelete(null);
      if (err && err.status === 400 && user) {
        setBlocked({ user, kind: classifyDeleteBlock(user, err.message), message: err.message });
      } else {
        showErrorModal(err.message || 'Failed to delete account. Please try again.');
      }
    }
  }

  function deleteBlockContent(kind, user) {
    const name = user ? `${user.firstName} ${user.lastName}` : 'this account';
    const isMentee = user?.role === 'Mentee';
    const act = {
      reinstate:   { label: 'Reinstate student',  primary: true, run: () => openDropOutConfirm(user.userID) },
      assignments: { label: 'Go to Assignments',  primary: true, run: () => switchTab('assignments') },
      deactivate:  { label: 'Deactivate instead', primary: true, run: () => openActiveConfirm(user.userID) },
      dropout:     { label: 'Mark as Drop Out',   primary: true, run: () => openDropOutConfirm(user.userID) }
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

  const hideDeleteBlocked = () => setBlocked(null);
  useEffect(() => {
    if (!blocked) return;
    const onKey = e => { if (e.key === 'Escape') hideDeleteBlocked(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [blocked]);

  let blockedView = null;
  if (blocked) {
    const { user, kind, message, deleted, failures } = blocked;
    if (kind === 'bulk') {
      blockedView = {
        icon: 'warn', iconSvg: DB_ICONS.info,
        title: deleted > 0 ? 'Some accounts were deleted' : "These accounts can't be deleted",
        subject: <>{deleted > 0 ? <span className="db-chip role">{deleted} deleted</span> : null}<span className="db-chip status">{failures.length} not deleted</span></>,
        reason: 'These accounts have records that must be kept, so they were left as they are:',
        list: failures.map((f, i) => <li key={i}><strong>{f.name}{f.user ? ' · ' + f.user.role : ''}</strong>{f.message}</li>),
        steps: <><h4>What you can do</h4><ol><li>Use <b>Deactivate</b> (or <b>Drop Out</b> for students). Both keep records and can be undone.</li></ol></>,
        actions: [],
      };
    } else {
      const c = deleteBlockContent(kind, user);
      const status = !user ? null : (kind === 'dropout' ? <span className="db-chip status">Drop Out</span>
                     : user.isActive === false ? <span className="db-chip status">Inactive</span> : null);
      blockedView = {
        icon: c.tone, iconSvg: DB_ICONS[c.icon],
        title: c.title,
        subject: user ? <><span className="db-chip">{user.firstName} {user.lastName}</span><span className="db-chip role">{user.role}</span>{status}</> : null,
        // Use the server's own wording for a case that has no scripted explanation.
        reason: c.reason || message || 'This account has records that must be kept.',
        list: null,
        steps: c.steps.length ? <><h4>What you can do</h4><ol>{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></> : null,
        actions: c.actions,
      };
    }
  }

  // ── bulk permanent delete ──
  function openBulkPermanentDeleteModal() {
    if (selected.size === 0) return;
    const n = Array.from(selected).filter(id => String(id) !== selfId).length;
    if (n === 0) { showToast('You cannot delete your own account.', 'error'); return; }
    setBulkPermOpen(n);
  }
  async function confirmBulkPermanentDelete() {
    const ids = Array.from(selected).filter(id => String(id) !== selfId);
    // Collect WHY each one failed instead of just a count.
    const failures = [];
    setBusy('bulkperm');
    try {
      for (const id of ids) {
        try {
          await apiRequest(`Users/${id}`, 'DELETE', null, true);
        } catch (e) {
          const user = D.current.allUsers.find(u => u.userID === id);
          const name = user ? `${user.firstName} ${user.lastName}` : `User #${id}`;
          failures.push({ name, user, message: e.message || 'Unknown error' });
        }
      }
      setSelected(new Set());
      await fetchUsers();
      if (sectionsLoadedRef.current) fetchSectionMentorView();
    } finally { setBusy(null); }
    setBulkPermOpen(0);
    const deleted = ids.length - failures.length;
    if (failures.length > 0) {
      setBlocked({ kind: 'bulk', deleted, failures });
    } else if (deleted > 0) {
      showStatusSuccess('Accounts Deleted', `${deleted} account(s) have been permanently deleted.`);
    }
  }

  // ── rows per page ──
  function setRows(target, n) {
    try { localStorage.setItem(target === 'users' ? 'um_rows_users' : 'um_rows_assign', String(n)); } catch (err) {}
    if (target === 'users') { setRowsPerPage(n); setCurrentPage(1); }
    else { setAssignPerPage(n); setAssignmentPage(1); }
  }
  const rppButtons = (target, current) => [
    { n: 5, lines: [5, 10] },
    { n: 10, lines: [5, 10, 15] },
    { n: 25, lines: [5, 10, 15, 20] },
  ].map(({ n, lines }) => (
    <button type="button" data-n={n} key={n} className={current === n ? 'active' : undefined} aria-pressed={current === n}
      onClick={() => setRows(target, n)}>
      <svg className="rpp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
        {lines.map(y => <line key={y} x1="5" y1={y} x2="19" y2={y} />)}
      </svg>{n}
    </button>
  ));

  // ── dropdown content ──
  const schoolOpts = [...SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)];
  const deptFilterList = schoolFilter
    ? allDepartments
        .filter(d => (schoolFilter === NO_SCHOOL ? !d.school : d.school === schoolFilter) && d.departmentName !== schoolFilter)
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName))
    : [];
  const courseOptions = form.menteeSchool
    ? (SCHOOL_COURSES[form.menteeSchool] || []).map(({ group, courses }) => (
        <optgroup label={group} key={group}>{courses.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
      ))
    : null;

  const dateStr = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const statCell = v => (stats ? v : <span className="stat-pulse">—</span>);
  const editingUserName = `${form.firstName.trim()} ${form.lastName.trim()}`;
  const eng = (s) => s;
  void eng;

  const btnBusy = key => busy === key;

    // ── controls (the vanilla <select>s are themed; options built from the loaded data) ──
  const resetUsersPage = () => setCurrentPage(1);

  const roleFilterSel = (
    <Select id="roleFilter" value={roleFilter} onChange={e => {
      const v = e.target.value;
      setRoleFilter(v);
      if (engagementFilter && v !== 'Mentee') {
        setEngagementFilter('');
        setEngagementByUser(new Map());
        setUsersDesc('Manage users, assignments, and view sections');
      }
      resetUsersPage();
    }}>
      <option value="">All Roles</option>
      <option value="Admin">Admin</option>
      <option value="Head">Head Admin</option>
      <option value="Mentor">Mentor</option>
      <option value="Mentee">Mentee</option>
    </Select>
  );
  const genderFilterSel = (
    <Select id="genderFilter" value={genderFilter} onChange={e => { setGenderFilter(e.target.value); resetUsersPage(); }}>
      <option value="">All Genders</option>
      <option value="Male">Male</option>
      <option value="Female">Female</option>
    </Select>
  );
  const schoolFilterSel = (
    <Select id="schoolFilter" value={schoolFilter} onChange={e => { setSchoolFilter(e.target.value); setDeptFilter(''); resetUsersPage(); }}>
      <option value="">All Schools</option>
      {schoolOpts}
      <option value={NO_SCHOOL}>School Department</option>
    </Select>
  );
  const deptFilterSel = (
    <Select id="deptFilter" value={deptFilter} onChange={e => { setDeptFilter(e.target.value); resetUsersPage(); }}>
      <option value="">All Departments</option>
      {deptFilterList.map(d => <option key={d.departmentID} value={d.departmentName}>{d.departmentName}</option>)}
    </Select>
  );
  const statusFilterSel = (
    <Select id="userStatusFilter" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); resetUsersPage(); }}>
      <option value="">All Statuses</option>
      <option value="Active">Active</option>
      <option value="Assigned">Assigned</option>
      <option value="Unassigned">Unassigned</option>
      <option value="Incomplete Profile">Incomplete Profile</option>
      <option value="Drop Out">Drop Out</option>
      <option value="Inactive">Deactivated</option>
    </Select>
  );
  const yearFilterSel = (
    <Select id="schoolYearFilter" value={yearFilter} onChange={e => { setYearFilter(e.target.value); resetUsersPage(); }}>
      <option value="">All School Years</option>
      {periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );

  const aSchoolSel = (
    <Select id="assignmentSchoolFilter" value={aSchool} onChange={e => {
      const school = e.target.value;
      setASchool(school);
      // keep the previous mentor only if they still match the new school
      const handling = new Set(allAssignments.filter(a => a.isActive !== false && a.menteeSchool === school).map(a => a.mentorUserID));
      setAMentor(prev => (school && prev && allMentorsWithDept.some(m => handling.has(m.userID) && String(m.userID) === prev) ? prev : ''));
      setAssignmentPage(1);
    }}>
      <option value="">All Schools</option>
      <option value="School of Technology">School of Technology</option>
      <option value="School of Humanities">School of Humanities</option>
      <option value="School of Management">School of Management</option>
    </Select>
  );
  const aMentorSel = (
    <Select id="assignmentMentorFilter" value={effMentor} disabled={!aSchool} onChange={e => { setAMentor(e.target.value); setAssignmentPage(1); }}>
      {!aSchool ? <option value="">Select a school first...</option> : <>
        <option value="">All Mentors</option>
        {Object.keys(mentorFilterGroups.groups).sort().map(dept => (
          <optgroup label={dept} key={dept}>
            {mentorFilterGroups.groups[dept].map(m => <option key={m.userID} value={m.userID}>{m.firstName} {m.lastName}</option>)}
          </optgroup>
        ))}
      </>}
    </Select>
  );
  const aStatusSel = (
    <Select id="assignmentStatusFilter" value={aStatus} onChange={e => { setAStatus(e.target.value); setAssignmentPage(1); }}>
      <option value="">All Statuses</option>
      <option value="Assigned">Assigned</option>
      <option value="Unassigned">Unassigned</option>
      <option value="Incomplete Profile">Incomplete Profile</option>
      <option value="Drop Out">Drop Out</option>
      <option value="Deactivated">Deactivated</option>
    </Select>
  );
  const sectionCourseSel = (
    <Select id="sectionDeptFilter" value={sectionView.courseFilter} onChange={e => setSCourse(e.target.value)}>
      <option value="">All Courses</option>
      {sectionView.groups.map(g => (
        <optgroup label={g.label} key={g.label}>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      ))}
    </Select>
  );

  const ph = (text) => <option value="" disabled>{text}</option>;
  const fieldRoleSel = (
    <Select id="fieldRole" required value={form.role} onChange={e => handleRoleChange(e.target.value)}>
      {ph('Select role...')}
      <option value="Admin">Admin</option>
      <option value="Head">Head Admin</option>
      <option value="Mentor">Mentor</option>
      <option value="Mentee">Mentee</option>
    </Select>
  );
  const fieldGenderSel = (
    <Select id="fieldGender" value={form.gender} onChange={e => setF({ gender: e.target.value })}>
      {ph('Select gender...')}
      <option value="Male">Male</option>
      <option value="Female">Female</option>
    </Select>
  );
  const fieldMentorSchoolSel = (
    <Select id="fieldMentorSchool" value={form.mentorSchool} onChange={e => setF({ mentorSchool: e.target.value, mentorDept: '' })}>
      {ph('Select school...')}
      {schoolOpts}
      {allDepartments.some(d => !d.school) ? <option value={NO_SCHOOL}>No school (department only)</option> : null}
    </Select>
  );
  const fieldMentorDeptSel = (
    <Select id="fieldMentorDept" value={form.mentorDept} onChange={e => setF({ mentorDept: e.target.value })}>
      {form.mentorSchool ? <>
        {ph('Select department...')}
        {mentorDepts.map(d => <option key={d.departmentID} value={d.departmentID}>{d.departmentName}</option>)}
      </> : ph('Select school first...')}
    </Select>
  );
  const fieldMenteeSchoolSel = (
    <Select id="fieldMenteeSchool" value={form.menteeSchool} onChange={e => { setF({ menteeSchool: e.target.value, menteeAssignMentor: '', course: '' }); setExtraCourse(null); }}>
      {ph('Select school...')}
      {schoolOpts}
    </Select>
  );
  const fieldMenteeAssignMentorSel = (
    <Select id="fieldMenteeAssignMentor" value={form.menteeAssignMentor} onChange={e => setF({ menteeAssignMentor: e.target.value })}>
      {form.menteeSchool ? mentorOptions(form.menteeSchool) : ph('Select school first...')}
    </Select>
  );
  const fieldCourseSel = (
    <Select id="fieldCourse" value={form.course} onChange={e => setF({ course: e.target.value })}>
      {form.menteeSchool ? ph('Choose course...') : ph('Select school first...')}
      {courseOptions}
      {extraCourse ? <option value={extraCourse}>{extraCourse}</option> : null}
    </Select>
  );
  const fieldYearLevelSel = (
    <select id="fieldYearLevel" defaultValue="1st Year">
      <option value="1st Year">1st Year</option>
    </select>
  );
  const fieldSectionSel = (
    <select id="fieldSectionID" defaultValue="">
      <option value="" disabled>Select school first...</option>
    </select>
  );
  const editModalMentorSel = (
    <Select id="editModalMentorSelect" value={form.editMentor} onChange={e => setF({ editMentor: e.target.value })}>
      {mentorOptions(menteeById.get(editingId)?.school || '')}
    </Select>
  );
  const editAssignMentorSel = (
    <Select id="editAssignMentorSelect" className="reassign-select" value={editAssignMentor} onChange={e => setEditAssignMentor(e.target.value)}>
      {mentorOptions(editAssign?.menteeSchool || '')}
    </Select>
  );

  // ── modal content kept through the exit animation ──
  const useLast = (v) => { const r = useRef(v); if (v != null) r.current = v; return v != null ? v : r.current; };
  const menteeProfileL = useLast(menteeProfile);
  const permDeleteL = useLast(permDelete);
  const editAssignL = useLast(editAssign);
  const dropTargetL = useLast(dropTarget);
  const activeTargetL = useLast(activeTarget);
  const bulkInfoL = useLast(bulkInfo);
  const umConfirmL = useLast(umConfirm);
  const blockedViewL = useLast(blockedView);
  const importResultL = useLast(importResult);
  const errorMsgL = useLast(errorMsg);

  const bulkAction = bulkInfoL ? BULK_ACTIONS[bulkInfoL.mode] : null;

  const profileRows = menteeProfileL ? menteeProfileL.rows.map(([label, value]) => (
    <Fragment key={label}>
      <div className="vp-label">{label}</div><div className="vp-value">{value || '—'}</div>
    </Fragment>
  )) : null;

  const dropIsOut = dropTargetL?.newVal;
  const actIsOn = activeTargetL?.newVal;

  const blockedActions = blockedViewL ? (
    <>
      {blockedViewL.actions.map(a => (
        <button type="button" key={a.label} className={a.primary ? 'primary' : ''} onClick={() => { hideDeleteBlocked(); a.run(); }}>{a.label}</button>
      ))}
      <button type="button" onClick={hideDeleteBlocked}>Close</button>
    </>
  ) : null;

  const importAccent = importResultL ? (importResultL.isFailed ? '#dc2626' : '#d97706') : '#16a34a';
  const importResultIcon = importResultL?.isFailed
    ? <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '26px', height: '26px' }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '26px', height: '26px' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;



  const bulkPermNL = useLast(bulkPermOpen || null);
  const importRowsL = useLast(importRows.length ? importRows : null) || [];
  const importNewL = importRowsL.filter(r => r.isNew).length;

  const nm = n => <strong>{n}</strong>;
  const dropMsg = dropTargetL ? (dropIsOut
    ? <>Are you sure you want to mark {nm(dropTargetL.name)} as Drop Out? Their status will be updated across the system.</>
    : <>Are you sure you want to reinstate {nm(dropTargetL.name)}? Their Drop Out status will be removed.</>) : null;
  const actMsg = activeTargetL ? (!actIsOn
    ? <>Are you sure you want to deactivate {nm(activeTargetL.name)}'s account? They will no longer be able to log in until reactivated.</>
    : <>Are you sure you want to reactivate {nm(activeTargetL.name)}'s account? They will be able to log in again.</>) : null;
  const saveConfirmMsg = editingId
    ? <>Are you sure you want to save these changes to {nm(editingUserName)}'s account?</>
    : <>Are you sure you want to add {nm(editingUserName)} as a new {form.role}?</>;
  const permMsg = permDeleteL
    ? <>Are you sure you want to permanently delete {nm(permDeleteL.name)}'s account? This erases all related data and cannot be undone.</>
    : null;
  const bulkPermMsg = bulkPermNL
    ? <>This permanently erases {nm(`${bulkPermNL} account${bulkPermNL > 1 ? 's' : ''}`)} and all related data. This cannot be undone.</>
    : null;
  const importErrorsView = importResultL ? (
    <>
      <div style={{ fontWeight: 700, marginBottom: '6px', color: '#991b1b' }}>Errors ({importResultL.errors.length})</div>
      <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {importResultL.errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </>
  ) : null;
  const goPage = p => { if (p >= 1 && p <= totalPages) setCurrentPage(p); };
  const goAssignPage = p => { if (p >= 1 && p <= aTotalPages) setAssignmentPage(p); };

  return (
    <Page id="ADMIN_/user-management">
      <div className="main-wrapper">
        <main className="page-content">
          {/* Page Header */}
          <div className="page-header">
            <h1>User Management</h1>
            <p id="umDate">{dateStr}</p>
          </div>
          {/* Tabs */}
          <div className={'um-tabs has-pill'} ref={tabsRef}>
            {<span className="um-tab-pill" ref={pillRef}></span>}
            <button className={'um-tab' + (tab === 'users' ? ' active' : '')} id="tab-btn-users" onClick={() => switchTab('users')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {' '}
              All Users
            </button>
            {' '}
            <button className={'um-tab' + (tab === 'assignments' ? ' active' : '')} id="tab-btn-assignments" onClick={() => switchTab('assignments')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {' '}
              Assignments
            </button>
            {' '}
            <button className={'um-tab' + (tab === 'sections' ? ' active' : '')} id="tab-btn-sections" onClick={() => switchTab('sections')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              {' '}
              Courses
            </button>
          </div>
          {/* ── ALL USERS TAB ── */}
          <div id="tab-users" className={panelProps('users').className} style={panelProps('users').style}>
            <p className="tab-desc">{usersDesc}</p>
            {/* Stat Cards */}
            <div className="stats-grid portal-summary-strip" tabIndex={0} role="region" aria-label="Summary cards">
              <div className="stat-card">
                <div className="stat-label">Total Users</div>
                <div className="stat-value" id="totalUsers">{statCell(stats?.total)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Mentors</div>
                <div className="stat-value" id="statMentorCount">{statCell(stats?.mentors)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Mentees</div>
                <div className="stat-value" id="statMenteeCount">{statCell(stats?.mentees)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Unassigned</div>
                <div className="stat-value" id="unassignedUsers">{statCell(stats?.unassigned)}</div>
              </div>
            </div>
            {/* Table Card */}
            <div className="table-card">
              {/* Top row: search/filters left, buttons right */}
              <div className="card-top-row">
                <div className="filters-left">
                  <div className="search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {' '}
                    <input type="text" id="searchInput" placeholder="Search by names or ID..." autoComplete="off" readOnly={searchRO} value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} onFocus={() => setSearchRO(false)} />
                  </div>
                  <div className="filter-btn-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    {' '}
                    {roleFilterSel}
                  </div>
                  <div className="filter-btn-wrap">{genderFilterSel}</div>
                  <div className="filter-btn-wrap">{schoolFilterSel}</div>
                  <div className="filter-btn-wrap" id="deptFilterWrap" style={{ display: deptFilterList.length ? '' : 'none' }}>{deptFilterSel}</div>
                  <div className="filter-btn-wrap">{statusFilterSel}</div>
                  <div className="filter-btn-wrap">{yearFilterSel}</div>
                </div>
                <div className="card-actions">
                  <div id="bulkActions" className={'bulk-actions' + (selCount > 0 ? ' visible' : '')}>
                    <span className="bulk-count">
                      <span id="selectedCount">{selCount}</span>
                      {' '}
                      selected
                    </span>
                    {' '}
                    <button type="button" id="bulkDropOutBtn" className="bulk-btn" onClick={() => openBulkStatusModal('dropout')} style={{ display: selCount > 0 && bulkTargets('dropout').length ? '' : 'none' }}>Mark as Drop Out</button>
                    {' '}
                    <button type="button" id="bulkDeactivateBtn" className="bulk-btn" onClick={() => openBulkStatusModal('deactivate')} style={{ display: selCount > 0 && bulkTargets('deactivate').length ? '' : 'none' }}>Deactivate</button>
                    {' '}
                    <button type="button" id="bulkReactivateBtn" className="bulk-btn bulk-btn-positive" onClick={() => openBulkStatusModal('reactivate')} style={{ display: selCount > 0 && bulkTargets('reactivate').length ? '' : 'none' }}>Reactivate</button>
                  </div>
                  <button type="button" id="bulkPermanentDeleteLink" className="perma-delete-link" onClick={openBulkPermanentDeleteModal} style={{ display: selCount > 0 ? 'inline-flex' : 'none' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                    {' '}
                    Permanently Delete Selected
                  </button>
                  {' '}
                  <button className="btn-outline" id="importBtn" onClick={openImportModal}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {' '}
                    Import
                  </button>
                  {' '}
                  <button className="btn-outline" onClick={exportUsers}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {' '}
                    Export
                  </button>
                  {' '}
                  <button className="btn-primary" id="addUserBtn" onClick={openAdd}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    {' '}
                    Add User
                  </button>
                </div>
              </div>
              <div className="table-wrapper" id="usersTableWrap" ref={usersWrapRef}>
                <table className="user-table">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input type="checkbox" className="row-checkbox" id="selectAllCheckbox" title="Select all" checked={allPageChecked} onChange={e => toggleSelectAll(e.target.checked)} />
                      </th>
                      <th className="th-left">Users</th>
                      <th className="th-left">Email</th>
                      <th>School Year</th>
                      <th>Semester</th>
                      <th>Gender</th>
                      <th>Role</th>
                      <th>School / Department</th>
                      <th>
                        <span className="status-th">
                          Status
                          {' '}
                          <svg className="status-tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <div className="status-tooltip">
                            <div className="status-tooltip-title">Status Guide</div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot green"></span>
                              {' '}
                              <span>
                                <span className="tip-label">Active:</span>
                                {' '}
                                Mentor/Admin — account is active
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot blue"></span>
                              {' '}
                              <span>
                                <span className="tip-label">Assigned:</span>
                                {' '}
                                Mentee — paired with a mentor
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot gray"></span>
                              {' '}
                              <span>
                                <span className="tip-label">Unassigned:</span>
                                {' '}
                                Mentee — no mentor yet
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot yellow"></span>
                              {' '}
                              <span>
                                <span className="tip-label">Incomplete Profile:</span>
                                {' '}
                                Account is missing school, course, or department details
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot red"></span>
                              {' '}
                              <span>
                                <span className="tip-label">Drop Out:</span>
                                {' '}
                                No longer in the program
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot orange"></span>
                              {' '}
                              <span>
                                <span className="tip-label">Deactivated:</span>
                                {' '}
                                Login disabled; records retained. Admin can reactivate.
                              </span>
                            </div>
                          </div>
                        </span>
                      </th>
                      <th>Signature</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="userTableBody">{userRows}</tbody>
                </table>
              </div>
              <div className="table-footer">
                <span id="showingText" className="showing-text">{showingText}</span>
                <div className="rpp-wrap">
                  <span className="rpp-label">
                    <svg className="rpp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                    </svg>
                    Rows per page
                  </span>
                  <div className="rpp-group" id="rppUsers" data-target="users" role="group" aria-label="Rows per page">{rppButtons('users', rowsPerPage)}</div>
                </div>
                <div className="pagination" id="pagination">{<PageButtons current={page} total={totalPages} onGo={goPage} />}</div>
              </div>
            </div>
          </div>
          {/* ── ASSIGNMENTS TAB ── */}
          <div id="tab-assignments" className={panelProps('assignments').className} style={panelProps('assignments').style}>
            <p className="tab-desc">View and manage mentor-mentee pairings</p>
            {/* Stat Cards */}
            <div className="assign-stats-grid portal-summary-strip" tabIndex={0} role="region" aria-label="Assignment summaries">
              <div className="stat-card">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <div className="stat-label">Total Assignments</div>
                <div className="stat-value" id="assignStatTotal">{aStat(aTotal)}</div>
              </div>
              <div className="stat-card stat-card--warning">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </div>
                <div className="stat-label">Unassigned Mentees</div>
                <div className="stat-value" id="assignStatUnassigned">{aStat(aUnassigned)}</div>
              </div>
              <div className="stat-card stat-card--danger">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="stat-label">Incomplete Profiles</div>
                <div className="stat-value" id="assignStatPending">{aStat(aPending)}</div>
              </div>
            </div>
            <div className="table-card">
              <div className="card-top-row">
                <div className="filters-left">
                  <div className="search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {' '}
                    <input type="text" id="assignmentSearch" placeholder="Search by mentee or mentor name..." value={aSearch} onChange={e => { setASearch(e.target.value); setAssignmentPage(1); }} />
                  </div>
                  <div className="filter-btn-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    {' '}
                    {aSchoolSel}
                  </div>
                  <div className="filter-btn-wrap">{aMentorSel}</div>
                  <div className="filter-btn-wrap">{aStatusSel}</div>
                </div>
                <div className="card-actions">
                  <button className="btn-outline" onClick={exportAssignments}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {' '}
                    Export CSV File
                  </button>
                </div>
              </div>
              <div className="table-wrapper" id="assignTableWrap" ref={assignWrapRef}>
                <table className="assignment-table">
                  <thead>
                    <tr>
                      <th className="th-left">Mentee</th>
                      <th>Course</th>
                      <th className="th-left">Mentor</th>
                      <th>Department</th>
                      <th>Assigned Date</th>
                      <th>
                        <span className="status-th">
                          Status
                          {' '}
                          <svg className="status-tip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <div className="status-tooltip">
                            <div className="status-tooltip-title">Status Guide</div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot blue"></span>
                              <span>
                                <span className="tip-label">Assigned:</span>
                                {' '}
                                Paired with a mentor
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot gray"></span>
                              <span>
                                <span className="tip-label">Unassigned:</span>
                                {' '}
                                No mentor yet
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot yellow"></span>
                              <span>
                                <span className="tip-label">Incomplete Profile:</span>
                                {' '}
                                Account is missing school, course, or department details
                              </span>
                            </div>
                            <div className="status-tooltip-row">
                              <span className="tip-dot red"></span>
                              <span>
                                <span className="tip-label">Drop Out:</span>
                                {' '}
                                No longer in the program
                              </span>
                            </div>
                          </div>
                        </span>
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="assignmentTableBody">{assignRows}</tbody>
                </table>
              </div>
              <div className="table-footer">
                <span id="assignmentShowingText" className="showing-text">{assignShowing}</span>
                <div className="rpp-wrap">
                  <span className="rpp-label">
                    <svg className="rpp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                    </svg>
                    Rows per page
                  </span>
                  <div className="rpp-group" id="rppAssign" data-target="assign" role="group" aria-label="Rows per page">{rppButtons('assign', assignPerPage)}</div>
                </div>
                <div className="pagination" id="assignmentPagination">
                  {assignLoaded && filteredAssignments.length ? <PageButtons current={aPage} total={aTotalPages} onGo={goAssignPage} /> : null}
                </div>
              </div>
            </div>
          </div>
          {/* ── SECTIONS TAB ── */}
          <div id="tab-sections" className={panelProps('sections').className} style={panelProps('sections').style}>
            <p className="tab-desc">View mentors and the courses of their assigned mentees</p>
            {/* Toolbar */}
            <div className="sections-toolbar">
              <div className="search-box sections-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {' '}
                <input type="text" id="sectionSearch" placeholder="Search name or course..." value={sSearch} onChange={e => setSSearch(e.target.value)} />
              </div>
              <div className="filter-btn-wrap">{sectionCourseSel}</div>
            </div>
            {/* School Overview Cards */}
            <div className="school-overview-grid portal-summary-strip" tabIndex={0} role="region" aria-label="School summaries" id="schoolOverviewGrid">
              <div className={'school-card school-card--sot' + (activeSchoolFilter === 'School of Technology' ? ' active' : '')} onClick={() => filterBySchool('School of Technology')}>
                <div className="school-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>
                <div className="school-card-body">
                  <div className="school-card-name">School of Technology</div>
                  <div className="school-card-sub">COE &amp; CCIT</div>
                </div>
                <div className="school-card-stats">
                  <div className="school-stat">
                    <span id="sot-mentors">{schoolStat('School of Technology', 'mentors')}</span>
                    <small>Mentors</small>
                  </div>
                  <div className="school-stat">
                    <span id="sot-mentees">{schoolStat('School of Technology', 'mentees')}</span>
                    <small>Assigned Mentees</small>
                  </div>
                </div>
              </div>
              <div className={'school-card school-card--soh' + (activeSchoolFilter === 'School of Humanities' ? ' active' : '')} onClick={() => filterBySchool('School of Humanities')}>
                <div className="school-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </div>
                <div className="school-card-body">
                  <div className="school-card-name">School of Humanities</div>
                  <div className="school-card-sub">CASE, CHC &amp; CCJ</div>
                </div>
                <div className="school-card-stats">
                  <div className="school-stat">
                    <span id="soh-mentors">{schoolStat('School of Humanities', 'mentors')}</span>
                    <small>Mentors</small>
                  </div>
                  <div className="school-stat">
                    <span id="soh-mentees">{schoolStat('School of Humanities', 'mentees')}</span>
                    <small>Assigned Mentees</small>
                  </div>
                </div>
              </div>
              <div className={'school-card school-card--som' + (activeSchoolFilter === 'School of Management' ? ' active' : '')} onClick={() => filterBySchool('School of Management')}>
                <div className="school-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  </svg>
                </div>
                <div className="school-card-body">
                  <div className="school-card-name">School of Management</div>
                  <div className="school-card-sub">CBMA &amp; CTHM</div>
                </div>
                <div className="school-card-stats">
                  <div className="school-stat">
                    <span id="som-mentors">{schoolStat('School of Management', 'mentors')}</span>
                    <small>Mentors</small>
                  </div>
                  <div className="school-stat">
                    <span id="som-mentees">{schoolStat('School of Management', 'mentees')}</span>
                    <small>Assigned Mentees</small>
                  </div>
                </div>
              </div>
            </div>
            {/* Mentor Accordion List */}
            <div id="sectionMentorList" className="mentor-accordion-list">{sectionList}</div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* Add/Edit User Modal */}
      {/* Mentee Profile (read-only, Courses tab) */}
      <Overlay className="modal-overlay" id="menteeProfileModal" onClick={e => { if (e.target === e.currentTarget) setMenteeProfileId(null); }} open={menteeProfile !== null} activeClass={'active'}>
        <div className="modal" style={{ maxWidth: "520px" }}>
          <div className="modal-header">
            <h3 id="menteeProfileName">{menteeProfileL?.name ?? 'Mentee Profile'}</h3>
            <button className="modal-close" onClick={() => setMenteeProfileId(null)} aria-label="Close">&times;</button>
          </div>
          <div className="modal-body">
            <div className="vp-grid" id="menteeProfileBody">{profileRows}</div>
          </div>
          <div className="modal-footer">
            <div className="modal-footer-right">
              <button className="btn-outline" onClick={() => setMenteeProfileId(null)}>Close</button>
            </div>
          </div>
        </div>
      </Overlay>
      <Overlay className="modal-overlay" id="modalOverlay" open={modalOpen} activeClass={'active'}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="modalTitle">{editingId ? 'Edit User' : 'Add New User'}</h3>
            <button className="modal-close" id="modalClose" onClick={() => setModalOpen(false)}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label>
                  First Name
                  {' '}
                  <span className="required">*</span>
                </label>
                {' '}
                <input type="text" id="fieldFirstName" placeholder="Enter first name" required value={form.firstName} onChange={e => setF({ firstName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>
                  Last Name
                  {' '}
                  <span className="required">*</span>
                </label>
                {' '}
                <input type="text" id="fieldLastName" placeholder="Enter last name" required value={form.lastName} onChange={e => setF({ lastName: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>
                  Email Address
                  {' '}
                  <span className="required">*</span>
                </label>
                {' '}
                <input type="email" id="fieldEmail" placeholder="user@firstasia.edu.ph" required value={form.email} onChange={e => setF({ email: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="fieldPassword">
                  Password
                  {' '}
                  <span id="passwordRequirement" className={editingId ? 'optional' : 'required'}>{editingId ? '(optional)' : '*'}</span>
                </label>
                <div className="pw-input-wrap">
                  <input type={showPw ? 'text' : 'password'} id="fieldPassword" data-pw-policy aria-describedby="passwordHelp" placeholder={editingId ? 'Leave blank to keep current password' : 'Temporary password'} autoComplete="new-password" value={form.password} onChange={e => setF({ password: e.target.value })} required={!editingId} />
                  {' '}
                  <button type="button" className="btn-pw-eye" onClick={() => setShowPw(s => !s)} tabIndex="-1" aria-label="Toggle password visibility">
                    <svg id="umEyeShow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showPw ? 'eye-hidden' : undefined}>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {' '}
                    <svg id="umEyeHide" className={showPw ? undefined : 'eye-hidden'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  </button>
                </div>
                {<PasswordMeter value={form.password} />}
              </div>
            </div>
            <p id="passwordHelp" className="field-help">
              {editingId ? 'Leave blank to keep the current password. Enter a new password only to reset it.' : 'A password is required for new users.'}
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>
                  System Role
                  {' '}
                  <span className="required">*</span>
                </label>
                {' '}
                {fieldRoleSel}
              </div>
              <div className="form-group">
                <label>
                  Gender
                  {' '}
                  <span className="required">*</span>
                </label>
                {' '}
                {fieldGenderSel}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>
                  ID Number
                  {' '}
                  <span className="required">*</span>
                </label>
                {' '}
                <input type="text" id="fieldStudentNumber" placeholder="e.g. 2021-00123" value={form.studentNumber} onChange={e => setF({ studentNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label>
                  Contact Number
                  {' '}
                  <span className="optional">(optional)</span>
                </label>
                {' '}
                <input type="text" id="fieldContact" placeholder="e.g. 09123456789" value={form.contact} onChange={e => setF({ contact: e.target.value })} />
              </div>
            </div>
            {/* Mentor Fields */}
            <div id="mentorFields" className="extra-fields" style={{ display: mentorFieldsOn ? 'block' : 'none' }}>
              <div className="extra-fields-title">Mentor Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label>School</label>
                  {' '}
                  {fieldMentorSchoolSel}
                </div>
                <div className="form-group">
                  <label>Department</label>
                  {' '}
                  {fieldMentorDeptSel}
                </div>
              </div>
            </div>
            {/* Mentee Fields */}
            <div id="menteeFields" className="extra-fields" style={{ display: menteeFieldsOn ? 'block' : 'none' }}>
              <div className="extra-fields-title">Mentee Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label>School</label>
                  {' '}
                  {fieldMenteeSchoolSel}
                </div>
                <div className="form-group" id="menteeAssignMentorGroup" style={{ display: assignGroupOn ? '' : 'none' }}>
                  <label>Assign Mentor</label>
                  {' '}
                  {fieldMenteeAssignMentorSel}
                </div>
              </div>
              <div className="form-row--3">
                <div className="form-group">
                  <label>Course</label>
                  {' '}
                  {fieldCourseSel}
                </div>
                {/* Hidden — driven automatically from Course, kept for save/edit-prefill logic below. */}
                <div className="form-group" style={{ display: "none" }}>
                  <label>Year Level</label>
                  {' '}
                  {fieldYearLevelSel}
                </div>
                <div className="form-group" style={{ display: "none" }}>
                  <label>Section</label>
                  {' '}
                  {fieldSectionSel}
                </div>
              </div>
            </div>
            {/* Assign Section (Edit mode — any non-Drop-Out mentee) */}
            <div id="editAssignSection" className="assign-section" style={{ display: editAssignOn ? 'block' : 'none' }}>
              <div className="assign-section-title" id="editAssignTitle">{editAssignTitle}</div>
              <p className="assign-section-hint">Select a mentor from the same school as this mentee.</p>
              <div className="form-group">
                <label>Select Mentor</label>
                {' '}
                {editModalMentorSel}
              </div>
            </div>
          </div>
          {/* Drop Out, Deactivate and Permanently Delete live in the row's ⋮ menu. */}
          <div className="modal-footer">
            <div className="modal-footer-right">
              <button className="btn-outline" id="modalCancel" onClick={() => setModalOpen(false)}>Cancel</button>
              {' '}
              <button className="btn-primary" id="modalSave" onClick={openSaveUserConfirm}>Save User</button>
            </div>
          </div>
        </div>
      </Overlay>
      {/* Permanent Delete Modal — irreversible hard-delete, distinct from Drop Out/Deactivate. */}
      <Overlay id="permanentDeleteModal" className="info-modal-overlay" open={!!permDelete} activeClass={null} display="flex">
        <div className="info-modal">
          <div className="info-modal-icon danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
          <h3 className="info-modal-title">Permanently Delete Account</h3>
          <p className="info-modal-message" id="permanentDeleteMessage">{permMsg}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" id="permCancel" onClick={() => setPermDelete(null)} disabled={busy === 'perm'}>Cancel</button>
            {' '}
            <button className="btn-danger" id="permanentDeleteConfirmBtn" onClick={confirmPermanentDelete} disabled={busy === 'perm'}>{busy === 'perm' ? 'Deleting…' : 'Delete Permanently'}</button>
          </div>
        </div>
      </Overlay>
      {/* Reassign Modal */}
      <Overlay id="editAssignModal" className="info-modal-overlay" open={!!editAssign} activeClass={null} display="flex">
        <div className="info-modal">
          <div className="info-modal-icon" style={{ background: "#eff6ff" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </div>
          <h3 className="info-modal-title" id="editAssignModalTitle">{editAssignL?.assignmentId ? 'Reassign Mentor' : 'Assign Mentor'}</h3>
          <p className="info-modal-message">
            Reassigning mentor for:
            {' '}
            <strong id="editAssignMenteeName">{editAssignL?.menteeName}</strong>
          </p>
          <div className="form-group" style={{ margin: "16px 0", textAlign: "left" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: "500", fontSize: "13px" }}>Select Mentor</label>
            {' '}
            {editAssignMentorSel}
          </div>
          <div className="info-modal-actions">
            <button className="btn-outline" onClick={closeEditAssignModal}>Cancel</button>
            {' '}
            <button className="btn-primary" id="editAssignConfirmBtn" onClick={confirmEditAssign}>{editAssignL?.assignmentId ? 'Reassign' : 'Assign'}</button>
          </div>
        </div>
      </Overlay>
      {/* Remove Assignment Modal */}
      <Overlay id="removeAssignmentModal" className="info-modal-overlay" open={removeAssignId !== null} activeClass={null} display="flex">
        <div className="info-modal">
          <div className="info-modal-icon danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
          <h3 className="info-modal-title">Remove Assignment</h3>
          <p className="info-modal-message">
            Are you sure you want to remove this mentor-mentee assignment? This action cannot be undone.
          </p>
          <div className="info-modal-actions">
            <button className="btn-outline" id="removeAssignCancel" onClick={() => setRemoveAssignId(null)} disabled={busy === 'remove'}>Cancel</button>
            {' '}
            <button className="btn-danger" id="removeAssignmentConfirmBtn" onClick={doRemoveAssignment} disabled={busy === 'remove'}>{busy === 'remove' ? 'Removing…' : 'Remove'}</button>
          </div>
        </div>
      </Overlay>
      {/* Bulk Remove Modal */}
      <Overlay id="bulkDeleteModal" className="info-modal-overlay" open={bulkInfo !== null} activeClass={null} display="flex">
        <div className="info-modal">
          <div className={'info-modal-icon ' + (bulkAction?.positive ? 'do-reactivate' : 'do-dropout')} id="bulkDeleteIcon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="17" y1="11" x2="23" y2="17" />
              <line x1="23" y1="11" x2="17" y2="17" />
            </svg>
          </div>
          <h3 className="info-modal-title" id="bulkDeleteTitle">{bulkAction?.title}</h3>
          <p className="info-modal-message" id="bulkDeleteMessage">{bulkInfoL?.msg}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" id="bulkCancel" onClick={hideBulkDeleteModal} disabled={busy === 'bulk'}>Cancel</button>
            {' '}
            <button className={(bulkAction?.positive ? 'btn-primary' : 'btn-danger') + ' do-confirm-btn'} onClick={confirmBulkDelete} id="bulkDeleteConfirmBtn" disabled={busy === 'bulk'}>{busy === 'bulk' ? 'Updating…' : bulkAction?.button}</button>
          </div>
        </div>
      </Overlay>
      {/* Bulk Permanent Delete Modal — same hard-delete, applied to every selected user. */}
      <Overlay id="bulkPermanentDeleteModal" className="info-modal-overlay" open={bulkPermOpen > 0} activeClass={null} display="flex">
        <div className="info-modal">
          <div className="info-modal-icon danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </div>
          <h3 className="info-modal-title">Permanently Delete Selected Accounts</h3>
          <p className="info-modal-message" id="bulkPermanentDeleteMessage">{bulkPermMsg}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" id="bulkPermCancel" onClick={() => setBulkPermOpen(0)} disabled={busy === 'bulkperm'}>Cancel</button>
            {' '}
            <button className="btn-danger" id="bulkPermanentDeleteConfirmBtn" onClick={confirmBulkPermanentDelete} disabled={busy === 'bulkperm'}>{busy === 'bulkperm' ? 'Deleting…' : 'Delete Permanently'}</button>
          </div>
        </div>
      </Overlay>
      {/* Error Modal */}
      <Overlay id="errorModal" className="info-modal-overlay" open={errorMsg !== null} activeClass={null} display="flex">
        <div className="info-modal" style={{ borderTop: "4px solid #dc2626", paddingTop: "28px" }}>
          <div className="info-modal-icon error" style={{ width: "58px", height: "58px", background: "#fef2f2", border: "2px solid #fecaca", marginBottom: "16px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "26px", height: "26px" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="info-modal-title" style={{ fontSize: "18px", color: "#111827", marginBottom: "8px" }}>Something went wrong</h3>
          <p className="info-modal-message" id="errorMessage" style={{ color: "#374151" }}>{errorMsgL}</p>
          <button className="btn-primary" onClick={() => setErrorMsg(null)} style={{ width: "100%", justifyContent: "center", padding: "11px 0", fontSize: "14px", fontWeight: "600", letterSpacing: ".2px" }}>OK</button>
        </div>
      </Overlay>
      {/* Can't-delete explainer */}
      <Overlay id="deleteBlockedModal" className="info-modal-overlay" onClick={e => { if (e.target === e.currentTarget) hideDeleteBlocked(); }} open={!!blocked} activeClass={null} display="flex">
        <div className="info-modal db-modal" role="dialog" aria-modal="true" aria-labelledby="dbTitle">
          <div className={'db-icon ' + (blockedViewL?.icon || '')} id="dbIcon">{blockedViewL?.iconSvg}</div>
          <h3 className="info-modal-title" id="dbTitle">{blockedViewL?.title}</h3>
          <div className="db-subject" id="dbSubject">{blockedViewL?.subject}</div>
          <p className="db-reason" id="dbReason">{blockedViewL?.reason}</p>
          <ul className="db-list" id="dbList" style={{ display: blockedViewL?.list ? '' : 'none' }}>{blockedViewL?.list}</ul>
          <div className="db-steps" id="dbSteps">{blockedViewL?.steps}</div>
          <div className="db-actions" id="dbActions">{blockedActions}</div>
        </div>
      </Overlay>
      {/* Import Start Modal */}
      <Overlay id="importStartModal" className="info-modal-overlay" onClick={e => { if (!e.target.closest('.dept-dropdown') && !e.target.closest('.dept-btn')) setDeptDropOpen(null); }} open={importStartOpen} activeClass={null} display="flex">
        <div className="import-start-dialog" style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "820px", width: "100%", margin: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.15)", maxHeight: "90vh", overflowY: "auto" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: "18px", fontWeight: "700", color: "#111827", textAlign: "center" }}>Import Users</h3>
          {/* Two-column body */}
          <div className="import-start-columns" style={{ display: "flex", gap: "24px", alignItems: "flex-start", marginBottom: "20px" }}>
            {/* LEFT — How it works */}
            <div style={{ flex: "1", minWidth: "0" }}>
              <div style={{ fontWeight: "700", fontSize: "13px", color: "#111827", marginBottom: "10px", textTransform: "uppercase", letterSpacing: ".4px" }}>How it works</div>
              <details style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px", marginBottom: "10px" }}>
                <summary style={{ cursor: "pointer", fontWeight: "700", fontSize: "12px", color: "#1d4ed8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Adding new users
                  {' '}
                  <span className="chevron" style={{ fontSize: "9px", color: "#1d4ed8" }}>&#9660;</span>
                </summary>
                <ol style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12.5px", color: "#1f2937", display: "flex", flexDirection: "column", gap: "7px", lineHeight: "1.5" }}>
                  <li>
                    <strong>Download the blank template</strong>
                    {' '}
                    below and open it in Excel.
                  </li>
                  <li>
                    <strong>Delete the 3 example rows</strong>
                    {' '}
                    (rows starting with *** DELETE THIS ROW).
                  </li>
                  <li>
                    Fill one user per row. Required:
                    {' '}
                    <strong>First Name, Last Name, Email, Password, Role</strong>
                    .
                  </li>
                  <li>
                    For
                    {' '}
                    <strong>Mentors</strong>
                    {' '}
                    — fill School and the exact Department name from the reference. Leave Course blank. For a mentor in a
                    {' '}
                    <strong>School Department</strong>
                    {' '}
                    (e.g. SAS, ASC, FCS, FSHS), leave School blank and put that department's name as the Department.
                  </li>
                  <li>
                    For
                    {' '}
                    <strong>Mentees</strong>
                    {' '}
                    — fill School and the exact Course code from the reference (leave Department blank) — use a course listed under the selected school; unrecognized course codes are rejected for new mentees. Put the
                    {' '}
                    <strong>mentor's email</strong>
                    {' '}
                    in the last column to assign one.
                  </li>
                  <li>
                    For
                    {' '}
                    <strong>Admins/Head</strong>
                    {' '}
                    — basic info only. Leave School, Department, Course, and Mentor Email blank.
                  </li>
                </ol>
              </details>
              <details style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px", marginBottom: "10px" }}>
                <summary style={{ cursor: "pointer", fontWeight: "700", fontSize: "12px", color: "#15803d", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Updating existing users
                  {' '}
                  <span className="chevron" style={{ fontSize: "9px", color: "#15803d" }}>&#9660;</span>
                </summary>
                <ol style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12.5px", color: "#1f2937", display: "flex", flexDirection: "column", gap: "7px", lineHeight: "1.5" }}>
                  <li>
                    <strong>Download Current Users</strong>
                    {' '}
                    below instead — each row is already filled in with everyone's real, current info.
                  </li>
                  <li>
                    A row updates the person it matches
                    {' '}
                    <strong>by Email</strong>
                    {' '}
                    — don't change that column, or it'll be treated as a different person.
                  </li>
                  <li>
                    Edit only the cells you want to change.
                    {' '}
                    <strong>Leave the rest exactly as downloaded</strong>
                    {' '}
                    — First Name, Last Name, Email, and Role must remain filled in. Blank optional fields keep their existing values.
                  </li>
                  <li>
                    <strong>Password stays blank</strong>
                    {' '}
                    and is never touched by import, even if you type something in it. To reset someone's password, use the ✏️ Edit action on that person instead.
                  </li>
                  <li>
                    Put a different email in the last column to
                    {' '}
                    <strong>reassign</strong>
                    {' '}
                    a mentee's mentor.
                  </li>
                </ol>
              </details>
              <div style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px" }}>
                <div style={{ fontWeight: "700", fontSize: "12px", color: "#111827", marginBottom: "6px" }}>Then, either way</div>
                <ol style={{ margin: "0", paddingLeft: "18px", fontSize: "12.5px", color: "#1f2937", display: "flex", flexDirection: "column", gap: "7px", lineHeight: "1.5" }}>
                  <li>
                    Save as
                    {' '}
                    <strong>CSV UTF-8</strong>
                    {' '}
                    in Excel (File → Save As → CSV UTF-8).
                  </li>
                  <li>
                    Click
                    {' '}
                    <strong>Step 2</strong>
                    {' '}
                    and select your file.
                  </li>
                </ol>
              </div>
              <div className="import-start-actions">
                {/* Action buttons */}
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "8px" }}>Step 1 — Download a starting point</div>
                <div className="import-download-actions" style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <button className="btn-outline" style={{ flex: "1", justifyContent: "center", borderColor: "#bfdbfe", color: "#1d4ed8" }} onClick={downloadImportTemplate}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px", marginRight: "6px", display: "inline-block", verticalAlign: "middle" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {' '}
                    Blank Template
                    {' '}
                    <span style={{ fontWeight: "400", opacity: ".75" }}>— new users</span>
                  </button>
                  {' '}
                  <button className="btn-outline" style={{ flex: "1", justifyContent: "center", borderColor: "#bbf7d0", color: "#15803d" }} onClick={downloadEditableUsers}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px", marginRight: "6px", display: "inline-block", verticalAlign: "middle" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {' '}
                    Current Users
                    {' '}
                    <span style={{ fontWeight: "400", opacity: ".75" }}>— updates</span>
                  </button>
                </div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "8px" }}>Step 2 — Upload your edited file</div>
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: "10px" }} onClick={() => { hideImportStartModal(); chooseImportFile(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px", marginRight: "6px", display: "inline-block", verticalAlign: "middle" }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {' '}
                  Choose CSV File
                </button>
              </div>
            </div>
            {/* Divider */}
            <div className="import-start-divider" style={{ width: "1px", background: "#d1d5db", alignSelf: "stretch", flexShrink: "0" }}></div>
            {/* RIGHT — Valid Values Reference */}
            <div style={{ flex: "1", minWidth: "0", fontSize: "12px" }}>
              <div style={{ fontWeight: "700", fontSize: "13px", color: "#111827", marginBottom: "10px", textTransform: "uppercase", letterSpacing: ".4px" }}>Valid Values</div>
              <div style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px", marginBottom: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px", color: "#111827", fontSize: "12.5px" }}>
                  <div>
                    <span style={{ fontWeight: "700" }}>Role:</span>
                    &nbsp; Admin &nbsp;·&nbsp; Head &nbsp;·&nbsp; Mentor &nbsp;·&nbsp; Mentee
                  </div>
                  <div>
                    <span style={{ fontWeight: "700" }}>Gender:</span>
                    &nbsp; Male &nbsp;·&nbsp; Female
                  </div>
                  <div>
                    <span style={{ fontWeight: "700" }}>School:</span>
                    &nbsp; SOT &nbsp;·&nbsp; SOH &nbsp;·&nbsp; SOM &nbsp;·&nbsp;
                    {' '}
                    <span style={{ color: "#6b7280" }}>blank for School Department mentors</span>
                  </div>
                </div>
              </div>
              <div style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px", marginBottom: "10px", overflow: "visible", position: "relative" }}>
                <div style={{ fontWeight: "700", color: "#111827", marginBottom: "6px", fontSize: "12px" }}>
                  Departments
                  {' '}
                  <span style={{ fontWeight: "400", color: "#6b7280", fontSize: "11px" }}>(Mentor — click to expand)</span>
                </div>
                <div id="importRefDepts" style={{ display: "flex", flexDirection: "column", gap: "0", fontSize: "11.5px" }}>{importRefDepts}</div>
              </div>
              <div style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px", marginBottom: "10px", overflow: "visible", position: "relative" }}>
                <div style={{ fontWeight: "700", color: "#111827", marginBottom: "6px", fontSize: "12px" }}>
                  Courses
                  {' '}
                  <span style={{ fontWeight: "400", color: "#6b7280", fontSize: "11px" }}>
                    (Mentee — click to expand. A Department, e.g. CCIT, groups several of these — use the Course code here, not the Department name.)
                  </span>
                </div>
                <div id="importRefCourses" style={{ display: "flex", flexDirection: "column", gap: "0", fontSize: "11.5px" }}>{importRefCourses}</div>
              </div>
              <div style={{ background: "#e8eaed", border: "1px solid #c4c9d4", borderRadius: "8px", padding: "10px" }}>
                <div style={{ fontWeight: "700", color: "#111827", marginBottom: "6px", fontSize: "12px" }}>
                  Available Mentors
                  {' '}
                  <span style={{ fontWeight: "400", color: "#6b7280", fontSize: "11px" }}>(use email for last column)</span>
                </div>
                <input type="text" id="importMentorSearch" placeholder="Search by name, school, or department..." onInput={e => setImportMentorSearch(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", marginBottom: "8px", fontSize: "11.5px", border: "1px solid #c4c9d4", borderRadius: "6px", fontFamily: "var(--font-main)" }} value={importMentorSearch} />
                <div id="importRefMentors" style={{ maxHeight: "160px", overflowY: "auto", color: "#1f2937", display: "flex", flexDirection: "column", gap: "8px", fontSize: "11.5px", paddingRight: "2px" }}>{importRefMentors}</div>
              </div>
            </div>
          </div>
          <button className="btn-outline" style={{ width: "100%", justifyContent: "center" }} onClick={hideImportStartModal}>Cancel</button>
        </div>
      </Overlay>
      {/* Import Confirm Modal */}
      <Overlay id="importConfirmModal" className="info-modal-overlay" open={importConfirmOpen} activeClass={null} display="flex">
        <div className="info-modal" style={{ borderTop: "4px solid #2563eb", paddingTop: "28px" }}>
          {/* Icon */}
          <div style={{ width: "58px", height: "58px", borderRadius: "50%", background: "#eff6ff", border: "2px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "26px", height: "26px" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 className="info-modal-title" style={{ fontSize: "18px", color: "#111827", marginBottom: "6px" }}>Confirm Import</h3>
          <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 18px" }}>Review the summary below before proceeding.</p>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "22px" }}>
            <div style={{ flex: "1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
              <div id="importConfirmNew" style={{ fontSize: "26px", fontWeight: "800", color: "#15803d", lineHeight: "1" }}>{importNewL}</div>
              <div style={{ fontSize: "11px", color: "#166534", fontWeight: "600", marginTop: "4px" }}>New Users</div>
            </div>
            <div style={{ flex: "1", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
              <div id="importConfirmUpdate" style={{ fontSize: "26px", fontWeight: "800", color: "#1d4ed8", lineHeight: "1" }}>{importRowsL.length - importNewL}</div>
              <div style={{ fontSize: "11px", color: "#1e40af", fontWeight: "600", marginTop: "4px" }}>Updates</div>
            </div>
            <div style={{ flex: "1", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
              <div id="importConfirmTotal" style={{ fontSize: "26px", fontWeight: "800", color: "#111827", lineHeight: "1" }}>{importRowsL.length}</div>
              <div style={{ fontSize: "11px", color: "#374151", fontWeight: "600", marginTop: "4px" }}>Total Rows</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn-outline" id="importCancel" onClick={hideImportConfirmModal} style={{ flex: "1", justifyContent: "center", padding: "11px 0", fontSize: "14px", fontWeight: "600" }} disabled={busy === 'import'}>Cancel</button>
            {' '}
            <button className="btn-primary" id="importConfirmBtn" onClick={confirmImport} style={{ flex: "1", justifyContent: "center", padding: "11px 0", fontSize: "14px", fontWeight: "600" }} disabled={busy === 'import'}>{busy === 'import' ? 'Importing…' : 'Import'}</button>
          </div>
        </div>
      </Overlay>
      {/* Import Result Modal */}
      <Overlay id="importResultModal" className="info-modal-overlay" open={!!importResult} activeClass={null} display="flex">
        <div className="info-modal" id="importResultCard" style={{ borderTop: '4px solid ' + importAccent, paddingTop: '28px' }}>
          {/* Icon (set by JS) */}
          <div id="importResultIcon" style={{ width: '58px', height: '58px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '2px solid', background: importResultL?.isFailed ? '#fef2f2' : '#fffbeb', borderColor: importResultL?.isFailed ? '#fecaca' : '#fde68a' }}>{importResultIcon}</div>
          <h3 className="info-modal-title" id="importResultTitle" style={{ fontSize: "18px", color: "#111827", marginBottom: "14px" }}>{importResultL?.isFailed ? 'Import Failed' : 'Import Completed with Errors'}</h3>
          {/* Stat cards */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
            <div style={{ flex: "1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
              <div id="importResultCreated" style={{ fontSize: "26px", fontWeight: "800", color: "#15803d", lineHeight: "1" }}>{importResultL?.created}</div>
              <div style={{ fontSize: "11px", color: "#166534", fontWeight: "600", marginTop: "4px" }}>Created</div>
            </div>
            <div style={{ flex: "1", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
              <div id="importResultUpdated" style={{ fontSize: "26px", fontWeight: "800", color: "#1d4ed8", lineHeight: "1" }}>{importResultL?.updated}</div>
              <div style={{ fontSize: "11px", color: "#1e40af", fontWeight: "600", marginTop: "4px" }}>Updated</div>
            </div>
            <div style={{ flex: "1", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "10px", padding: "12px 8px", textAlign: "center" }}>
              <div id="importResultAssigned" style={{ fontSize: "26px", fontWeight: "800", color: "#6d28d9", lineHeight: "1" }}>{importResultL?.assigned}</div>
              <div style={{ fontSize: "11px", color: "#5b21b6", fontWeight: "600", marginTop: "4px" }}>Assigned</div>
            </div>
          </div>
          {/* Errors */}
          <div id="importResultErrors" style={{ display: 'block', textAlign: 'left', fontSize: '12px', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', maxHeight: '140px', overflowY: 'auto', marginBottom: '4px' }}>{importErrorsView}</div>
          <button id="importResultOkBtn" className="btn-primary" onClick={() => setImportResult(null)} style={{ width: '100%', justifyContent: 'center', marginTop: '14px', padding: '11px 0', fontSize: '14px', fontWeight: 600, background: importAccent, borderColor: importAccent }}>OK</button>
        </div>
      </Overlay>
      {/* Drop Out / Reactivate Modal */}
      <Overlay id="dropOutModal" className="info-modal-overlay" open={!!dropTarget} activeClass={null} display="flex">
        <div className="info-modal">
          <div id="doModalIcon" className={'info-modal-icon ' + (dropIsOut ? 'do-dropout' : 'do-reactivate')}>{dropIsOut ? ICON_DROPOUT : ICON_REINSTATE}</div>
          <h3 className="info-modal-title" id="doModalTitle">{dropIsOut ? 'Mark as Dropped Out' : 'Reinstate Mentee'}</h3>
          <p className="info-modal-message" id="doModalMsg">{dropMsg}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" onClick={closeDropOutModal}>Cancel</button>
            {' '}
            <button id="doConfirmBtn" className={(dropIsOut ? 'btn-danger' : 'btn-primary') + ' do-confirm-btn'} onClick={confirmDropOut} disabled={dropBusy}>{dropIsOut ? 'Mark as Dropped Out' : 'Reinstate'}</button>
          </div>
        </div>
      </Overlay>
      {/* Deactivate / Reactivate Account Modal */}
      <Overlay id="activeModal" className="info-modal-overlay" open={!!activeTarget} activeClass={null} display="flex">
        <div className="info-modal">
          <div id="actModalIcon" className={'info-modal-icon ' + (actIsOn ? 'do-reactivate' : 'do-dropout')}>{actIsOn ? ICON_REINSTATE : ICON_DEACTIVATE}</div>
          <h3 className="info-modal-title" id="actModalTitle">{actIsOn ? 'Reactivate Account' : 'Deactivate Account'}</h3>
          <p className="info-modal-message" id="actModalMsg">{actMsg}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" onClick={closeActiveModal}>Cancel</button>
            {' '}
            <button id="actConfirmBtn" className={(actIsOn ? 'btn-primary' : 'btn-danger') + ' do-confirm-btn'} onClick={confirmActiveToggle} disabled={activeBusy}>{actIsOn ? 'Reactivate' : 'Deactivate'}</button>
          </div>
        </div>
      </Overlay>
      {/* Save/Add User Confirm Modal */}
      <Overlay id="saveUserConfirmModal" className="info-modal-overlay" open={saveConfirmOpen} activeClass={null} display="flex">
        <div className="info-modal">
          <div className="info-modal-icon do-reactivate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="info-modal-title" id="saveUserConfirmTitle">{editingId ? 'Save Changes?' : 'Add New User?'}</h3>
          <p className="info-modal-message" id="saveUserConfirmMsg">{saveConfirmMsg}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" id="saveCancel" onClick={() => setSaveConfirmOpen(false)} disabled={busy === 'save'}>Cancel</button>
            {' '}
            <button id="saveUserConfirmBtn" className="btn-primary do-confirm-btn" onClick={confirmSaveUser} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : (editingId ? 'Save Changes' : 'Add User')}</button>
          </div>
        </div>
      </Overlay>
      <Overlay id="umConfirmModal" className="info-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="umConfirmTitle" open={!!umConfirm} activeClass={null} display="flex">
        <div className="info-modal">
          <div className="info-modal-icon do-reactivate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="info-modal-title" id="umConfirmTitle">{umConfirmL?.title}</h3>
          <p className="info-modal-message" id="umConfirmMsg">{umConfirmL?.message}</p>
          <div className="info-modal-actions">
            <button type="button" className="btn-outline" id="umConfirmCancel" onClick={() => setUmConfirm(null)} disabled={busy === 'um'}>Cancel</button>
            {' '}
            <button type="button" className="btn-primary do-confirm-btn" id="umConfirmOk" onClick={() => runConfirm(umConfirmL.action)} disabled={busy === 'um'}>{busy === 'um' ? umConfirmL?.busyText : umConfirmL?.confirmText}</button>
          </div>
        </div>
      </Overlay>
      {rowMenu && rowMenuUser ? <RowMenu menu={rowMenu} items={rowMenuItems} onAction={rowMenuAction} onClose={() => setRowMenu(null)} /> : null}
    </Page>
  );
}
