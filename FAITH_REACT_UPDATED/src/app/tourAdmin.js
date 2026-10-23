// Admin and Head Admin walkthroughs for Tour.jsx's engine (same engine as the mentor and mentee tours, themed
// in the portals' blue via `wt-admin`). Unlike the mentor/mentee tours there is no sample data: these portals
// show system-wide data that already exists, so the tour just highlights the real sidebar and dashboard.
//   - Runs once, right after the account finishes first-time setup (pages/{admin,head}/Setup.jsx set the flag).
//   - Replay any time from Profile → "Replay Walkthrough" (under Change Signature).

const nav = (page, id, title, text) => ({ page, sel: '#' + id, side: 'right', title, text });
const welcome = (portal, text) => ({ page: 'dashboard', center: true, title: 'Welcome to the ' + portal, text });

const ADMIN_STEPS = [
  welcome('Admin Portal', 'Let us show you around. This short tour walks through each part of the sidebar. Nothing will be changed. Use Next, or the arrow keys, to move on.'),
  nav('dashboard', 'nav-dashboard', 'Dashboard', 'A live overview of the whole program: mentors, mentees, engagement and alerts.'),
  { page: 'dashboard', sel: '.stats-grid', title: 'Key Numbers', text: 'Total mentors and mentees, and the mentee status counts. Click the Mentors card to jump to Mentor Monitoring.' },
  { page: 'dashboard', sel: '.engagement-card', title: 'Mentee Engagement', text: 'How many mentees are active, inactive or unassigned, and how many are doing well or need attention.' },
  { page: 'dashboard', sel: '.alerts-card', title: 'System Alerts', text: 'Things that need your attention, such as mentors who are behind on their sessions.' },
  { page: 'dashboard', sel: '.top3-card', title: 'Top 3 Mentors', text: 'The best-performing mentors this semester.' },
  { page: 'dashboard', sel: '.recent-card', title: 'Recent Activities', text: 'The latest sessions and updates across the program.' },
  nav('users', 'nav-users', 'User Management', 'Add or import users, edit or deactivate accounts, assign mentors to mentees, and mark mentees who dropped out.'),
  nav('attendance', 'nav-attendance', 'Attendance Logs', 'Attendance for every session and mentee, with the logsheet behind each record.'),
  nav('monitoring', 'nav-sessions', 'Mentor Monitoring', 'Each mentor’s progress and status (Excellent, On Track, Behind or Critical). Open a mentor to see their sessions and mentees.'),
  nav('proofs', 'nav-proofs', 'Proof Tracking', 'Review the proof photos mentors upload for completed sessions, and see which are still missing.'),
  nav('report', 'nav-ratings', 'Mentoring Program Report', 'Mentor performance scores and the top performers, and where evaluation ratings are entered.'),
  nav('announcements', 'nav-announce', 'Announcements', 'Post announcements to mentors, mentees or both, pin important ones and read the comments. A red badge shows when something is new.'),
  nav('calendar', 'nav-calendar', 'Calendar & Events', 'Publish the program schedule: session windows, report deadlines and evaluation periods that mentors and mentees see.'),
  nav('evaluations', 'nav-eval', 'Evaluation Forms', 'Create evaluation forms for mentors and mentees and review the submissions.'),
  nav('profile', 'nav-profile', 'Profile', 'Your account details, contact number, password and signature.'),
  { page: 'profile', sel: '.sig-tour', title: 'Replay Walkthrough', text: 'Want to see this tour again? Tap Replay Walkthrough here, under your signature, any time.' },
  nav('settings', 'nav-settings', 'System Settings', 'The academic period (school year and semester), calendar sheet signatories, the Guidance Office details and Maintenance Mode.'),
  { page: 'settings', sel: '.logout-btn', side: 'right', title: 'Logout', text: 'When you are done, use Logout to sign out safely, especially on a shared computer.' },
  { page: 'settings', center: true, title: 'You’re all set!', text: 'That is the whole Admin Portal. You can replay this tour from your Profile page at any time.' },
];

const HEAD_STEPS = [
  welcome('Head Admin Portal', 'Let us show you around. This short tour walks through each part of the sidebar. Nothing will be changed. Use Next, or the arrow keys, to move on.'),
  nav('dashboard', 'nav-dashboard', 'Dashboard', 'A live overview of the whole program: mentor performance, mentee engagement and alerts.'),
  { page: 'dashboard', sel: '.hd-performance-card', title: 'Mentor Performance', text: 'How mentors are doing this semester, grouped by status, with the breakdown by school.' },
  { page: 'dashboard', sel: '.alerts-card', title: 'System Alerts', text: 'Things that need attention, such as mentors who are behind on their sessions.' },
  { page: 'dashboard', sel: '.top3-card', title: 'Top 3 Mentors', text: 'The best-performing mentors this semester.' },
  { page: 'dashboard', sel: '.recent-card', title: 'Recent Activities', text: 'The latest sessions and updates across the program.' },
  nav('monitoring', 'nav-performance', 'Mentor Monitoring', 'Each mentor’s progress and status (Excellent, On Track, Behind or Critical). Open a mentor to see their sessions and mentees.'),
  nav('attendance', 'nav-attendance', 'Attendance Summary', 'Attendance for every session and mentee, with the logsheet behind each record.'),
  nav('proofs', 'nav-proof', 'Proof Tracking', 'Review the proof photos mentors upload for completed sessions, and see which are still missing.'),
  nav('report', 'nav-ratings', 'Mentoring Program Report', 'Mentor performance scores and the top performers across the program.'),
  nav('announcements', 'nav-announcements', 'Announcements', 'Post announcements to mentors, mentees or both, and read the comments. A red badge shows when something is new.'),
  nav('evaluations', 'nav-eval', 'Evaluation Forms', 'View the evaluation forms and their submissions.'),
  nav('calendar', 'nav-calendar', 'Calendar', 'The program schedule: session windows, report deadlines and evaluation periods.'),
  nav('account', 'nav-profile', 'Profile', 'Your account details, contact number, password, signature and the current system settings.'),
  { page: 'account', sel: '.sig-tour', title: 'Replay Walkthrough', text: 'Want to see this tour again? Tap Replay Walkthrough here, under your signature, any time.' },
  { page: 'account', sel: '.logout-btn', side: 'right', title: 'Logout', text: 'When you are done, use Logout to sign out safely, especially on a shared computer.' },
  { page: 'account', center: true, title: 'You’re all set!', text: 'That is the whole Head Admin Portal. You can replay this tour from your Profile page at any time.' },
];

const ICONS = {
  'Welcome to the Admin Portal': 'ti-hand-stop', 'Welcome to the Head Admin Portal': 'ti-hand-stop', 'You’re all set!': 'ti-circle-check',
  'Dashboard': 'ti-layout-dashboard', 'Key Numbers': 'ti-chart-bar', 'Mentee Engagement': 'ti-users', 'Mentor Performance': 'ti-chart-bar',
  'System Alerts': 'ti-alert-triangle', 'Top 3 Mentors': 'ti-trophy', 'Recent Activities': 'ti-history',
  'User Management': 'ti-users', 'Attendance Logs': 'ti-calendar-stats', 'Attendance Summary': 'ti-calendar-stats',
  'Mentor Monitoring': 'ti-activity', 'Proof Tracking': 'ti-photo-check', 'Mentoring Program Report': 'ti-report',
  'Announcements': 'ti-speakerphone', 'Calendar & Events': 'ti-calendar-event', 'Calendar': 'ti-calendar-event', 'Evaluation Forms': 'ti-clipboard-check',
  'Profile': 'ti-user-circle', 'Replay Walkthrough': 'ti-route', 'System Settings': 'ti-settings', 'Logout': 'ti-logout',
};

export const ADMIN_TOUR = { base: '/admin/', keyPrefix: 'astra_walkthrough_admin', theme: 'wt-themed wt-admin', steps: ADMIN_STEPS, icons: ICONS, samplePages: [] };
export const HEAD_TOUR = { base: '/head/', keyPrefix: 'astra_walkthrough_head', theme: 'wt-themed wt-admin', steps: HEAD_STEPS, icons: ICONS, samplePages: [] };
