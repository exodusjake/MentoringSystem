import { apiRequest } from '../lib/api.js';

// Per-portal sidebar + guard configuration (HEAD/HTML/sidebar.html + sidebar.js, ADMIN_/HTML/sidebar.html + sidebar.js,
// MENTOR/HTML/mentor-sidebar.html + mentor-sidebar.js, MENTEE/HTML/mentee-sidebar.html + mentee-sidebar.js).
//
//   nav:     the sidebar markup in order. { section } is a .nav-section heading; items are
//            { id, to (route segment under the portal), icon (tabler), label, badge }.
//   freshBadge(userId, lastRead): the unread-count rule each sidebar script used for the Announcements badge.

const sectionItem = (label, className = '') => ({ section: label, className });

async function headFreshBadge(userId, lastRead) {
  try {
    const res = await apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true);
    const latestCommentAt = res?.latestCommentAt || null;

    const hasNewComment = latestCommentAt && (!lastRead || new Date(latestCommentAt) > new Date(lastRead));
    return hasNewComment ? 1 : 0;
  } catch (e) {}
}

async function adminFreshBadge(userId, lastRead) {
  try {
    const [annRes, commentRes] = await Promise.allSettled([
      apiRequest('Announcements', 'GET', null, true),
      apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true),
    ]);

    // New announcements from others (e.g. Super Administrator) — Admin's own Announcements page shows every
    // audience unfiltered (Admin oversees all of them), so there's no targetAudience check here,
    // just "not posted by me".
    const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
    const visibleItems = announcements.filter(a =>
      a.postedByUserID !== userId && a.isActive);
    const annCount = !lastRead
      ? visibleItems.length
      : visibleItems.filter(a => new Date(a.postedAt) > new Date(lastRead)).length;

    // New comments on Admin's own posts
    const latestCommentAt = commentRes.status === 'fulfilled' ? commentRes.value?.latestCommentAt : null;
    const hasNewComment = latestCommentAt && (!lastRead || new Date(latestCommentAt) > new Date(lastRead));

    return annCount + (hasNewComment ? 1 : 0);
  } catch (e) {}
}

async function mentorFreshBadge(userId, lastRead) {
  try {
    const [annRes, commentRes] = await Promise.allSettled([
      apiRequest('Announcements', 'GET', null, true),
      apiRequest(`AnnouncementComments/announcer/${userId}/latest`, 'GET', null, true),
    ]);

    // New admin announcements visible to this mentor
    const announcements = annRes.status === 'fulfilled' ? annRes.value || [] : [];
    const visibleItems = announcements.filter(a => {
      if (a.postedByUserID === userId) return false;
      if (!a.isActive) return false;
      const ta = (a.targetAudience || '').toLowerCase();
      return ta === 'both' || ta === 'mentor';
    });
    const annCount = !lastRead
      ? visibleItems.length
      : visibleItems.filter(a => new Date(a.postedAt) > new Date(lastRead)).length;

    // New comments on mentor's own posts
    const latestCommentAt = commentRes.status === 'fulfilled' ? commentRes.value?.latestCommentAt : null;
    const hasNewComment = latestCommentAt && (!lastRead || new Date(latestCommentAt) > new Date(lastRead));

    return annCount + (hasNewComment ? 1 : 0);
  } catch (e) {}
}

async function menteeFreshBadge(userId, lastRead) {
  try {
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

    // All active items visible to this mentee
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

    const annCount = !lastRead
      ? visibleItems.length
      : visibleItems.filter(a => new Date(a.postedAt) > new Date(lastRead)).length;

    // New @mention in any comment
    const latestMentionAt = mentionRes.status === 'fulfilled' ? mentionRes.value?.latestMentionAt : null;
    const hasNewMention = latestMentionAt && (!lastRead || new Date(latestMentionAt) > new Date(lastRead));

    return annCount + (hasNewMention ? 1 : 0);
  } catch (e) {}
}

export const PORTAL_CONFIG = {
  head: {
    role: 'head',
    base: '/head',
    // Admin/Head pages sent a pending setup to their setup page; Mentor/Mentee sidebars logged out instead.
    onSetupRequired: 'redirect',
    profilePath: 'account',
    roleLabel: 'Super Administrator',
    defaultName: 'Super Administrator',
    defaultInitials: 'HA',
    pascalFallback: true,
    logoutMessage: 'Are you sure you want to log out?',
    freshBadge: headFreshBadge,
    nav: [
      sectionItem('Overview'),
      { id: 'nav-dashboard', to: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      sectionItem('Monitoring'),
      { id: 'nav-performance', to: 'monitoring', icon: 'ti-activity', label: 'Mentor Monitoring' },
      { id: 'nav-attendance', to: 'attendance', icon: 'ti-calendar-stats', label: 'Attendance Summary' },
      { id: 'nav-proof', to: 'proofs', icon: 'ti-photo-check', label: 'Proof Tracking' },
      { id: 'nav-ratings', to: 'report', icon: 'ti-report', label: 'Mentoring Program Report' },
      sectionItem('Communication'),
      { id: 'nav-announcements', to: 'announcements', icon: 'ti-speakerphone', label: 'Announcements', badge: true },
      { id: 'nav-eval', to: 'evaluations', icon: 'ti-clipboard-check', label: 'Evaluation Forms' },
      sectionItem('Resources'),
      { id: 'nav-calendar', to: 'calendar', icon: 'ti-calendar-event', label: 'Calendar' },
      sectionItem('Account'),
      { id: 'nav-profile', to: 'account', icon: 'ti-user-circle', label: 'Profile' },
    ],
  },
  admin: {
    role: 'admin',
    base: '/admin',
    onSetupRequired: 'redirect',
    profilePath: 'profile',
    roleLabel: 'Administrator',
    defaultName: 'Administrator',
    defaultInitials: 'AU',
    pascalFallback: true,
    logoutMessage: 'Are you sure you want to log out of the admin portal?',
    freshBadge: adminFreshBadge,
    nav: [
      sectionItem('Overview'),
      { id: 'nav-dashboard', to: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      sectionItem('Management'),
      { id: 'nav-users', to: 'users', icon: 'ti-users', label: 'User Management' },
      sectionItem('Monitoring'),
      { id: 'nav-attendance', to: 'attendance', icon: 'ti-calendar-stats', label: 'Attendance Logs' },
      { id: 'nav-sessions', to: 'monitoring', icon: 'ti-activity', label: 'Mentor Monitoring' },
      { id: 'nav-proofs', to: 'proofs', icon: 'ti-photo-check', label: 'Proof Tracking' },
      { id: 'nav-ratings', to: 'report', icon: 'ti-report', label: 'Mentoring Program Report' },
      sectionItem('Content'),
      { id: 'nav-announce', to: 'announcements', icon: 'ti-speakerphone', label: 'Announcements', badge: true },
      { id: 'nav-calendar', to: 'calendar', icon: 'ti-calendar-event', label: 'Calendar & Events' },
      { id: 'nav-eval', to: 'evaluations', icon: 'ti-clipboard-check', label: 'Evaluation Forms' },
      sectionItem('System', 'nav-section--normal'),
      { id: 'nav-profile', to: 'profile', icon: 'ti-user-circle', label: 'Profile' },
      { id: 'nav-settings', to: 'settings', icon: 'ti-settings', label: 'System Settings' },
    ],
  },
  mentor: {
    role: 'mentor',
    base: '/mentor',
    onSetupRequired: 'logout',
    profilePath: 'profile',
    roleLabel: 'Mentor',
    defaultName: 'Mentor User',
    defaultInitials: 'MU',
    dept: true,
    logoutMessage: 'Are you sure you want to log out of the mentor portal?',
    freshBadge: mentorFreshBadge,
    nav: [
      sectionItem('Overview'),
      { id: 'nav-dashboard', to: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      sectionItem('Mentoring'),
      { id: 'nav-mentees', to: 'mentees', icon: 'ti-users', label: 'Mentees' },
      { id: 'nav-sessions', to: 'sessions', icon: 'ti-calendar-event', label: 'Sessions' },
      { id: 'nav-availability', to: 'availability', icon: 'ti-clock-plus', label: 'Availability' },
      { id: 'nav-logsheet', to: 'logsheet', icon: 'ti-clipboard-list', label: 'Logsheet' },
      { id: 'nav-activities', to: 'attendance', icon: 'ti-activity', label: 'Attendance Overview' },
      sectionItem('Content'),
      { id: 'nav-announce', to: 'announcements', icon: 'ti-speakerphone', label: 'Announcements', badge: true },
      { id: 'nav-calendar', to: 'calendar', icon: 'ti-calendar', label: 'Calendar' },
      sectionItem('Account'),
      { id: 'nav-profile', to: 'profile', icon: 'ti-user-circle', label: 'Profile' },
    ],
  },
  mentee: {
    role: 'mentee',
    base: '/mentee',
    onSetupRequired: 'logout',
    profilePath: 'profile',
    roleLabel: 'Mentee',
    defaultName: 'Mentee User',
    defaultInitials: 'MU',
    logoutMessage: 'Are you sure you want to log out?',
    freshBadge: menteeFreshBadge,
    nav: [
      sectionItem('Overview'),
      { id: 'nav-dashboard', to: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
      sectionItem('Mentoring'),
      { id: 'nav-sessions', to: 'sessions', icon: 'ti-calendar-event', label: 'Sessions' },
      { id: 'nav-schedule', to: 'schedule', icon: 'ti-clock-plus', label: 'Schedule Session' },
      sectionItem('Content'),
      { id: 'nav-announce', to: 'announcements', icon: 'ti-speakerphone', label: 'Announcements & Evaluations', badge: true },
      sectionItem('Account'),
      { id: 'nav-profile', to: 'profile', icon: 'ti-user-circle', label: 'Profile' },
    ],
  },
};
