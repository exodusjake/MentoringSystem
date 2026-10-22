// One route per vanilla HTML page. Query strings are kept as they were (?id=, ?school=, ?status= ...), so the
// page logic that reads them is unchanged. `toRoute('HEAD', 'mentor-detail.html?id=3')` turns a vanilla page
// URL into its route; it is also what the legacy `.html` redirects use.
export const ROUTE_TABLE = {
  'LANDING/landing.html': '/landing',
  'LANDING/privacy.html': '/privacy',
  'LANDING/terms.html': '/terms',
  'LOGIN/login.html': '/login',

  'HEAD/head-dashboard.html': '/head/dashboard',
  'HEAD/mentor-performance.html': '/head/monitoring',
  'HEAD/mentor-detail.html': '/head/monitoring/detail',
  'HEAD/attendance-summary.html': '/head/attendance',
  'HEAD/attendance-detail.html': '/head/attendance/detail',
  'HEAD/proof-tracking.html': '/head/proofs',
  'HEAD/evaluation-ratings.html': '/head/report',
  'HEAD/announcements.html': '/head/announcements',
  'HEAD/calendar.html': '/head/calendar',
  'HEAD/evaluation-forms.html': '/head/evaluations',
  'HEAD/account.html': '/head/account',
  'HEAD/setup.html': '/head/setup',

  'ADMIN_/dashboard.html': '/admin/dashboard',
  'ADMIN_/user-management.html': '/admin/users',
  'ADMIN_/attendance-logs.html': '/admin/attendance',
  'ADMIN_/attendance-detail.html': '/admin/attendance/detail',
  'ADMIN_/sessions.html': '/admin/monitoring',
  'ADMIN_/sessions-detail.html': '/admin/monitoring/detail',
  'ADMIN_/session-proofs.html': '/admin/proofs',
  'ADMIN_/evaluation-ratings.html': '/admin/report',
  'ADMIN_/announcements.html': '/admin/announcements',
  'ADMIN_/calendar-events.html': '/admin/calendar',
  'ADMIN_/evaluation-forms.html': '/admin/evaluations',
  'ADMIN_/profile.html': '/admin/profile',
  'ADMIN_/settings.html': '/admin/settings',
  'ADMIN_/setup.html': '/admin/setup',

  'MENTOR/mentor-dashboard.html': '/mentor/dashboard',
  'MENTOR/my-mentees.html': '/mentor/mentees',
  'MENTOR/my-activities.html': '/mentor/attendance',
  'MENTOR/sessions.html': '/mentor/sessions',
  'MENTOR/availability.html': '/mentor/availability',
  'MENTOR/logsheet.html': '/mentor/logsheet',
  'MENTOR/announcements.html': '/mentor/announcements',
  'MENTOR/calendar.html': '/mentor/calendar',
  'MENTOR/profile.html': '/mentor/profile',
  'MENTOR/setup.html': '/mentor/setup',

  'MENTEE/mentee-dashboard.html': '/mentee/dashboard',
  'MENTEE/schedule-session.html': '/mentee/schedule',
  'MENTEE/sessions.html': '/mentee/sessions',
  'MENTEE/announcements.html': '/mentee/announcements',
  'MENTEE/profile.html': '/mentee/profile',
  'MENTEE/setup.html': '/mentee/setup',
};

// Resolves a vanilla href ('mentor-detail.html?id=3', '/HEAD/HTML/account.html', '../../LOGIN/HTML/login.html#x')
// relative to the portal folder it was written in. Returns the new path (query/hash kept) or null.
export function toRoute(portal, href) {
  const m = /^(?:\.\.\/|\.\/|\/)*(?:(ADMIN_|HEAD|MENTOR|MENTEE|LOGIN|LANDING)\/(?:HTML\/)?)?([A-Za-z0-9_-]+\.html)([?#].*)?$/.exec(href || '');
  if (!m) return null;
  const route = ROUTE_TABLE[`${m[1] || portal}/${m[2]}`];
  return route ? route + (m[3] || '') : null;
}
