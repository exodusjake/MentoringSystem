import { apiRequest } from '../lib/api.js';
import { getSession } from '../lib/session.js';

// Sidebar content per portal, transcribed from the original sidebar partials. `nav` paths are
// relative to the portal base; `match` lists the routes that highlight an item (detail pages
// highlight their list page, as PAGE_NAV_MAP did).
export const PORTAL_CONFIG = {
  admin: {
    role: 'admin',
    base: '/admin',
    profilePath: 'profile',
    defaultAvatar: 'AU',
    defaultName: 'Admin User',
    roleLabel: 'Administrator',
    roleLabelId: true,
    logoutMessage: 'Are you sure you want to log out of the admin portal?',
    onSetupRequired: 'setup',
    nav: [
      { section: 'Overview' },
      { id: 'nav-dashboard', path: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      { section: 'Management' },
      { id: 'nav-users', path: 'users', icon: 'ti-users', label: 'User Management' },
      { section: 'Monitoring' },
      { id: 'nav-attendance', path: 'attendance', icon: 'ti-calendar-stats', label: 'Attendance Logs' },
      { id: 'nav-sessions', path: 'monitoring', icon: 'ti-activity', label: 'Mentor Monitoring' },
      { id: 'nav-proofs', path: 'proofs', icon: 'ti-photo-check', label: 'Proof Tracking' },
      { id: 'nav-ratings', path: 'report', icon: 'ti-report', label: 'Mentoring Program Report' },
      { section: 'Content' },
      { id: 'nav-announce', path: 'announcements', icon: 'ti-speakerphone', label: 'Announcements', badge: true },
      { id: 'nav-calendar', path: 'calendar', icon: 'ti-calendar-event', label: 'Calendar & Events' },
      { id: 'nav-eval', path: 'evaluations', icon: 'ti-clipboard-check', label: 'Evaluation Forms' },
      { section: 'System', normal: true },
      { id: 'nav-profile', path: 'profile', icon: 'ti-user-circle', label: 'Profile' },
      { id: 'nav-settings', path: 'settings', icon: 'ti-settings', label: 'System Settings' },
    ],
    // New announcements from others + new comments on the admin's own posts.
    async freshBadge(userId, lastRead) {
      const [annRes, commentRes] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true),
      ]);
      const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
      const visibleItems = announcements.filter(a => a.postedByUserID !== userId && a.isActive);
      return countNew(visibleItems, lastRead) + (isNewer(commentRes.status === 'fulfilled' ? commentRes.value?.latestCommentAt : null, lastRead) ? 1 : 0);
    },
  },
  head: {
    role: 'head',
    base: '/head',
    profilePath: 'account',
    defaultAvatar: 'HA',
    defaultName: 'Head Admin',
    roleLabel: 'Head Mentoring Personnel',
    roleLabelId: true,
    logoutMessage: 'Are you sure you want to log out?',
    onSetupRequired: 'setup',
    nav: [
      { section: 'Overview' },
      { id: 'nav-dashboard', path: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      { section: 'Monitoring' },
      { id: 'nav-performance', path: 'monitoring', icon: 'ti-activity', label: 'Mentor Monitoring' },
      { id: 'nav-attendance', path: 'attendance', icon: 'ti-calendar-stats', label: 'Attendance Summary' },
      { id: 'nav-proof', path: 'proofs', icon: 'ti-photo-check', label: 'Proof Tracking' },
      { id: 'nav-ratings', path: 'report', icon: 'ti-report', label: 'Mentoring Program Report' },
      { section: 'Communication' },
      { id: 'nav-announcements', path: 'announcements', icon: 'ti-speakerphone', label: 'Announcements', badge: true },
      { id: 'nav-eval', path: 'evaluations', icon: 'ti-clipboard-check', label: 'Evaluation Forms' },
      { section: 'Resources' },
      { id: 'nav-calendar', path: 'calendar', icon: 'ti-calendar-event', label: 'Calendar' },
      { section: 'Account' },
      { id: 'nav-profile', path: 'account', icon: 'ti-user-circle', label: 'Profile' },
    ],
    // Head sees only new comments on its own posts.
    async freshBadge(userId, lastRead) {
      const res = await apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true);
      return isNewer(res?.latestCommentAt || null, lastRead) ? 1 : 0;
    },
  },
  mentor: {
    role: 'mentor',
    base: '/mentor',
    profilePath: 'profile',
    defaultAvatar: 'MU',
    defaultName: 'Mentor User',
    roleLabel: 'Mentor',
    showDept: true,
    logoutMessage: 'Are you sure you want to log out of the mentor portal?',
    onSetupRequired: 'logout',
    nav: [
      { section: 'Overview' },
      { id: 'nav-dashboard', path: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      { section: 'Mentoring' },
      { id: 'nav-mentees', path: 'mentees', icon: 'ti-users', label: 'My Mentees' },
      { id: 'nav-sessions', path: 'sessions', icon: 'ti-calendar-event', label: 'Sessions' },
      { id: 'nav-availability', path: 'availability', icon: 'ti-clock-plus', label: 'Availability' },
      { id: 'nav-logsheet', path: 'logsheet', icon: 'ti-clipboard-list', label: 'Logsheet' },
      { id: 'nav-activities', path: 'attendance', icon: 'ti-activity', label: 'Attendance Overview' },
      { section: 'Content' },
      { id: 'nav-announce', path: 'announcements', icon: 'ti-speakerphone', label: 'Announcements', badge: true },
      { id: 'nav-calendar', path: 'calendar', icon: 'ti-calendar', label: 'Calendar' },
      { section: 'Account' },
      { id: 'nav-profile', path: 'profile', icon: 'ti-user-circle', label: 'Profile' },
    ],
    // New admin announcements for mentors + new comments on the mentor's own posts.
    async freshBadge(userId, lastRead) {
      const [annRes, commentRes] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true),
      ]);
      const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
      const visibleItems = announcements.filter(a => {
        if (a.postedByUserID === userId) return false;
        if (!a.isActive) return false;
        const ta = (a.targetAudience || '').toLowerCase();
        return ta === 'both' || ta === 'mentor';
      });
      return countNew(visibleItems, lastRead) + (isNewer(commentRes.status === 'fulfilled' ? commentRes.value?.latestCommentAt : null, lastRead) ? 1 : 0);
    },
  },
  mentee: {
    role: 'mentee',
    base: '/mentee',
    profilePath: 'profile',
    defaultAvatar: 'MU',
    defaultName: 'Mentee User',
    roleLabel: 'Mentee',
    logoutMessage: 'Are you sure you want to log out?',
    onSetupRequired: 'logout',
    nav: [
      { section: 'Overview' },
      { id: 'nav-dashboard', path: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      { section: 'Mentoring' },
      { id: 'nav-sessions', path: 'sessions', icon: 'ti-calendar-event', label: 'Sessions' },
      { id: 'nav-schedule', path: 'schedule', icon: 'ti-clock-plus', label: 'Schedule Session' },
      { section: 'Content' },
      { id: 'nav-announce', path: 'announcements', icon: 'ti-speakerphone', label: 'Announcements & Evaluations', badge: true },
      { section: 'Account' },
      { id: 'nav-profile', path: 'profile', icon: 'ti-user-circle', label: 'Profile' },
    ],
    // Announcements/evaluations visible to this mentee + a new @mention in any comment.
    async freshBadge(userId, lastRead) {
      const [annRes, evalRes, assignRes, mentionRes] = await Promise.allSettled([
        apiRequest('Announcements', 'GET', null, true),
        apiRequest('EvaluationLinks', 'GET', null, true),
        apiRequest('Users/assignments', 'GET', null, true),
        apiRequest(`AnnouncementComments/mentioned/${userId}/latest`, 'GET', null, true),
      ]);
      const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
      const evalLinks = evalRes.status === 'fulfilled' ? evalRes.value || [] : [];
      const assignments = assignRes.status === 'fulfilled' ? assignRes.value || [] : [];
      const myAssignment = assignments.find(a => a.menteeUserID === userId);
      const mentorId = myAssignment?.mentorUserID ?? null;
      const allMentorIds = new Set(assignments.map(a => a.mentorUserID).filter(Boolean));
      const visibleItems = [
        ...announcements.filter(a => {
          if (!a.isActive) return false;
          if (a.postedByUserID === mentorId) return true;
          if (allMentorIds.has(a.postedByUserID)) return false;
          const aud = (a.targetAudience || '').toLowerCase();
          return aud === 'mentee' || aud === 'both';
        }),
        ...evalLinks.filter(e => {
          if (!e.isActive) return false;
          const r = (e.targetRole || '').toLowerCase();
          return r === 'mentee' || r === 'both';
        }),
      ];
      return countNew(visibleItems, lastRead) + (isNewer(mentionRes.status === 'fulfilled' ? mentionRes.value?.latestMentionAt : null, lastRead) ? 1 : 0);
    },
  },
};

const countNew = (items, lastRead) => !lastRead ? items.length : items.filter(a => new Date(a.postedAt) > new Date(lastRead)).length;
const isNewer = (at, lastRead) => !!at && (!lastRead || new Date(at) > new Date(lastRead));

// Name/initials shown in the sidebar header (each portal fell back to its own defaults).
export function sidebarIdentity(config) {
  const user = getSession()?.user;
  if (!user) return { name: config.defaultName, initials: config.defaultAvatar };
  const caseless = config.role === 'admin' || config.role === 'head';
  const first = user.firstName || (caseless ? user.FirstName : '') || '';
  const last = user.lastName || (caseless ? user.LastName : '') || '';
  return {
    name: `${first} ${last}`.trim() || config.defaultName,
    initials: ((first[0] || '') + (last[0] || '')).toUpperCase() || config.defaultAvatar,
  };
}
