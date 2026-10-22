// Old multi-page URLs → new routes, so bookmarks and links in old emails keep working.
// Query strings are kept; detail pages move ?id= into the path.
const MAP = {
  '/index.html': '/',
  '/LANDING/HTML/landing.html': '/landing',
  '/LANDING/HTML/privacy.html': '/privacy',
  '/LANDING/HTML/terms.html': '/terms',
  '/LOGIN/HTML/login.html': '/login',

  '/ADMIN_/HTML/dashboard.html': '/admin/dashboard',
  '/ADMIN_/HTML/user-management.html': '/admin/users',
  '/ADMIN_/HTML/attendance-logs.html': '/admin/attendance',
  '/ADMIN_/HTML/attendance-detail.html': '/admin/attendance/:id',
  '/ADMIN_/HTML/sessions.html': '/admin/monitoring',
  '/ADMIN_/HTML/sessions-detail.html': '/admin/monitoring/:id',
  '/ADMIN_/HTML/session-proofs.html': '/admin/proofs',
  '/ADMIN_/HTML/evaluation-ratings.html': '/admin/report',
  '/ADMIN_/HTML/announcements.html': '/admin/announcements',
  '/ADMIN_/HTML/calendar-events.html': '/admin/calendar',
  '/ADMIN_/HTML/evaluation-forms.html': '/admin/evaluations',
  '/ADMIN_/HTML/profile.html': '/admin/profile',
  '/ADMIN_/HTML/settings.html': '/admin/settings',
  '/ADMIN_/HTML/setup.html': '/admin/setup',

  '/HEAD/HTML/head-dashboard.html': '/head/dashboard',
  '/HEAD/HTML/mentor-performance.html': '/head/monitoring',
  '/HEAD/HTML/mentor-detail.html': '/head/monitoring/:id',
  '/HEAD/HTML/attendance-summary.html': '/head/attendance',
  '/HEAD/HTML/attendance-detail.html': '/head/attendance/:id',
  '/HEAD/HTML/proof-tracking.html': '/head/proofs',
  '/HEAD/HTML/evaluation-ratings.html': '/head/report',
  '/HEAD/HTML/announcements.html': '/head/announcements',
  '/HEAD/HTML/calendar.html': '/head/calendar',
  '/HEAD/HTML/evaluation-forms.html': '/head/evaluations',
  '/HEAD/HTML/account.html': '/head/account',
  '/HEAD/HTML/setup.html': '/head/setup',

  '/MENTOR/HTML/mentor-dashboard.html': '/mentor/dashboard',
  '/MENTOR/HTML/my-mentees.html': '/mentor/mentees',
  '/MENTOR/HTML/my-activities.html': '/mentor/attendance',
  '/MENTOR/HTML/sessions.html': '/mentor/sessions',
  '/MENTOR/HTML/availability.html': '/mentor/availability',
  '/MENTOR/HTML/logsheet.html': '/mentor/logsheet',
  '/MENTOR/HTML/announcements.html': '/mentor/announcements',
  '/MENTOR/HTML/calendar.html': '/mentor/calendar',
  '/MENTOR/HTML/profile.html': '/mentor/profile',
  '/MENTOR/HTML/setup.html': '/mentor/setup',

  '/MENTEE/HTML/mentee-dashboard.html': '/mentee/dashboard',
  '/MENTEE/HTML/schedule-session.html': '/mentee/schedule',
  '/MENTEE/HTML/sessions.html': '/mentee/sessions',
  '/MENTEE/HTML/announcements.html': '/mentee/announcements',
  '/MENTEE/HTML/profile.html': '/mentee/profile',
  '/MENTEE/HTML/setup.html': '/mentee/setup',
};

export const LEGACY_PATHS = Object.keys(MAP);

// e.g. ('/HEAD/HTML/mentor-detail.html', '?id=12&school=X') → '/head/monitoring/12?school=X'
export function legacyTarget(pathname, search) {
  const to = MAP[pathname];
  if (!to) return null;
  const params = new URLSearchParams(search);
  let path = to;
  if (to.includes(':id')) {
    const id = params.get('id');
    params.delete('id');
    path = id ? to.replace(':id', encodeURIComponent(id)) : to.replace('/:id', '');
  }
  const qs = params.toString();
  return path + (qs ? '?' + qs : '');
}
