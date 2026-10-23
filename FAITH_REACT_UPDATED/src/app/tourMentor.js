// Mentor-portal walkthrough: the steps, icons and SAMPLE data for Tour.jsx's engine (same engine as the
// mentee tour, themed in the mentor portal's teal via the `wt-mentor` class). While it runs the pages below
// show the sample data from here (a brand-new mentor has no mentees, sessions or slots yet); nothing real is
// read, changed or saved.
//   - Runs once, right after the mentor finishes first-time setup (pages/mentor/Setup.jsx sets the flag).
//   - Replay any time from Profile → "Replay Walkthrough" (under Change Signature).

const STEPS = [
  // Welcome
  { page: 'dashboard', center: true, title: 'Welcome to the Mentor Portal', text: 'Let us show you around. This short tour uses sample data, so nothing you see is real and nothing will be changed. Use Next, or the arrow keys, to move on.' },
  // Dashboard
  { page: 'dashboard', sel: '#nav-dashboard', side: 'right', title: 'Dashboard', text: 'Your home base: your mentees, checkpoint progress, upcoming sessions, announcements and the program calendar at a glance.' },
  { page: 'dashboard', sel: '.stats-grid', sample: true, title: 'Your Numbers', text: 'How many mentees you have, how many course checkpoints you have completed this semester, your upcoming sessions and your overall semester completion.' },
  { page: 'dashboard', all: '.sessions-row .card', nth: 0, sample: true, title: 'Upcoming Sessions', text: 'Sessions that are scheduled or still waiting for attendance, with how many mentees are expected.' },
  { page: 'dashboard', all: '.sessions-row .card', nth: 1, sample: true, title: 'Recent Sessions', text: 'Your latest completed and cancelled sessions, with how many mentees attended.' },
  { page: 'dashboard', sel: '.announcements-card', sample: true, title: 'Dashboard Announcements', text: 'The latest posts from the administration. Click one to open it on the Announcements page.' },
  { page: 'dashboard', sel: '.calendar-overview-card', sample: true, title: 'Activities & Deadlines', text: 'Ongoing and upcoming items from the published program calendar, including report submission deadlines.' },
  // My Mentees
  { page: 'mentees', sel: '#nav-mentees', side: 'right', title: 'My Mentees', text: 'Everyone assigned to you this semester.' },
  { page: 'mentees', sel: '.mentee-card', sample: true, title: 'Mentee Card', text: 'Name, email, course, year, section, school, contact number and student number. A Drop Out tag appears if the mentee has dropped out.' },
  // Sessions
  { page: 'sessions', sel: '#nav-sessions', side: 'right', title: 'Sessions', text: 'Every mentoring session you have logged, with attendance and proof.' },
  { page: 'sessions', sel: '#logSessionBtn', title: 'Log Session', text: 'Create a session for a checkpoint slot: pick the slot, date and start time, and add notes. The end time is recorded when you save the end of the session.' },
  { page: 'sessions', sel: '.session-stats-strip', sample: true, title: 'Session Counts', text: 'Total, completed, scheduled and cancelled sessions, plus those in progress or closed.' },
  { page: 'sessions', sel: '.session-card', sample: true, title: 'Session Card', text: 'The checkpoint, status, section, date and time, notes and how many mentees were present.' },
  { page: 'sessions', sel: '.btn-sc-qr', sample: true, title: 'Attendance', text: 'Opens the attendance list. Attendance opens at the exact date and time of the session; then scan each mentee’s QR code to record them as present.' },
  { page: 'sessions', sel: '.btn-sc-proof-upload', sample: true, title: 'Upload Proof', text: 'After the session, upload a proof photo. Completed sessions without proof are flagged.' },
  // Availability
  { page: 'availability', sel: '#nav-availability', side: 'right', title: 'Availability', text: 'Open time slots that your mentees can book for their checkpoint sessions.' },
  { page: 'availability', sel: '.btn-post-slot', title: 'Post Slot', text: 'Choose a checkpoint, a date and one or more start times. Mentees see these slots on their Schedule page.' },
  { page: 'availability', sel: '.slot-card', sample: true, title: 'Open Slot', text: 'Open means nobody has booked it yet. Once a mentee books it, the card changes to Session Created and shows who is attending.' },
  // Logsheet / Attendance
  { page: 'logsheet', sel: '#nav-logsheet', side: 'right', title: 'Logsheet', text: 'Your logsheet is built automatically from your Sessions: attendance, time and mentees are filled in for you. Add remarks and mentor’s notes, submit each checkpoint and print the forms.' },
  { page: 'attendance', sel: '#nav-activities', side: 'right', title: 'Attendance Overview', text: 'See each mentee’s attendance toward the semester requirement, and your own overall performance.' },
  // Announcements
  { page: 'announcements', sel: '#nav-announce', side: 'right', title: 'Announcements', text: 'Posts from the administration and your own posts to your mentees. A red badge shows when something is new.' },
  { page: 'announcements', sel: '.announce-card', sample: true, enter: 'tabAdmin', title: 'Administration', text: 'Official announcements for mentors. Pinned posts stay on top.' },
  { page: 'announcements', sel: '.announce-card', sample: true, enter: 'tabMine', title: 'My Announcements', text: 'Post your own announcements here (use Post Announcement), pin them, edit them and read your mentees’ comments.' },
  // Calendar
  { page: 'calendar', sel: '#nav-calendar', side: 'right', title: 'Calendar', text: 'The program schedule, deadlines, your sessions and your availability in one calendar. Use the legend to show or hide each kind.' },
  // Profile + Logout
  { page: 'profile', sel: '#nav-profile', side: 'right', title: 'Profile', text: 'View your account details, update your contact number, change your password or replace your signature.' },
  { page: 'profile', sel: '.sig-tour', title: 'Replay Walkthrough', text: 'Want to see this tour again? Tap Replay Walkthrough here, under your signature, any time.' },
  { page: 'profile', sel: '.logout-btn', side: 'right', title: 'Logout', text: 'When you are done, use Logout to sign out safely, especially on a shared computer.' },
  { page: 'profile', center: true, title: 'You’re all set!', text: 'That is the whole Mentor Portal. Start by posting an availability slot so your mentees can book a session.' },
];

const ICONS = {
  'Welcome to the Mentor Portal': 'ti-hand-stop', 'You’re all set!': 'ti-circle-check',
  'Dashboard': 'ti-layout-dashboard', 'Your Numbers': 'ti-chart-bar', 'Upcoming Sessions': 'ti-calendar-event', 'Recent Sessions': 'ti-history',
  'Dashboard Announcements': 'ti-speakerphone', 'Activities & Deadlines': 'ti-calendar-time',
  'My Mentees': 'ti-users', 'Mentee Card': 'ti-id',
  'Sessions': 'ti-calendar-event', 'Log Session': 'ti-plus', 'Session Counts': 'ti-chart-bar', 'Session Card': 'ti-notes', 'Attendance': 'ti-qrcode', 'Upload Proof': 'ti-upload',
  'Availability': 'ti-clock-plus', 'Post Slot': 'ti-plus', 'Open Slot': 'ti-calendar-time',
  'Logsheet': 'ti-clipboard-list', 'Attendance Overview': 'ti-activity',
  'Announcements': 'ti-speakerphone', 'Administration': 'ti-building', 'My Announcements': 'ti-speakerphone',
  'Calendar': 'ti-calendar', 'Profile': 'ti-user-circle', 'Replay Walkthrough': 'ti-route', 'Logout': 'ti-logout',
};

export const MENTOR_TOUR = {
  base: '/mentor/', keyPrefix: 'astra_walkthrough_mentor', theme: 'wt-mentor', steps: STEPS, icons: ICONS,
  samplePages: ['dashboard', 'mentees', 'sessions', 'availability', 'announcements'],
};

// ── SAMPLE DATA (tour only) ────────────────────────────────
// Values follow a real mentor account (Nicole Mentor, BSIT, two mentees) so the sample reads like the real thing.
function dashSession(month, day, title, section, time, tag, att, cls) {
  return '<div class="session-item' + (cls || '') + '" data-wt="1"><div class="session-date-block"><div class="session-month">' + month +
    '</div><div class="session-day">' + day + '</div></div><div class="session-info"><div class="session-title">' + title +
    ' <span class="session-course-tag">' + section + '</span></div><div class="session-footer"><div class="session-time">' + time + ' ' + tag +
    '</div>' + att + '</div></div></div>';
}
const menteeCard = (name, email, studentNo) => {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2);
  return '<div class="mentee-card" data-wt="1"><div class="mc-identity"><div class="mc-avatar">' + initials + '</div><div class="mc-name-block"><div class="mc-name">' + name +
    '</div><div class="mc-email">' + email + '</div><div class="mc-role-badge">Mentee</div></div></div><div class="mc-body"><div class="mc-chips"><span class="mc-chip course">BSIT</span>' +
    '<span class="mc-chip">1st Year</span><span class="mc-chip section">BSIT</span></div>' +
    '<div class="mc-info-row"><i class="ti ti-building"></i><span>SAS &middot; School of Technology</span></div>' +
    '<div class="mc-info-row"><i class="ti ti-phone"></i><span>N/A</span></div>' +
    '<div class="mc-bottom-row"><span class="mc-student-no"><i class="ti ti-id-badge"></i>' + studentNo + '</span><span class="mc-school-year">SY 2025-2026 &middot; 1st Semester</span></div></div></div>';
};
const sessionCard = (slot, status, statusCls, date, time, topic, present, total, primary) =>
  '<div class="session-card" data-wt="1"><div class="sc-top"><div class="sc-badges"><span class="sc-session-num">' + slot +
  '</span><span class="session-status ' + statusCls + '">' + status + '</span><span class="sc-section-tag">BSIT</span></div><div class="sc-datetime"><i class="ti ti-calendar"></i><span class="sc-date-str">' +
  date + '</span><span class="sc-time-str">' + time + '</span></div></div>' + (topic ? '<div class="sc-topic">"' + topic + '"</div>' : '') +
  '<div class="sc-attendance"><div class="sc-att-row"><i class="ti ti-users"></i><span class="sc-att-count">' + present + ' / ' + total + ' present</span></div>' +
  '<div class="sc-att-bar"><div class="sc-att-fill" style="width:' + Math.round(present / total * 100) + '%"></div></div></div>' +
  '<div class="sc-actions"><div class="sc-primary-actions">' + primary + '</div><div class="sc-secondary-actions">' +
  '<button class="sc-action-btn btn-sc-edit" type="button" aria-label="Edit"><i class="ti ti-pencil"></i></button></div></div></div>';
const annCard = (mine, name, initials, date, title, body, pinned) =>
  '<div class="announce-card ' + (mine ? 'announce-card-mine' : 'announce-card-admin') + (pinned ? ' announce-card--pinned' : '') + '" data-wt="1">' +
  (pinned ? '<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>' : '') +
  '<div class="ann-card-top"><div class="ann-avatar ' + (mine ? 'ann-avatar-teal' : 'ann-avatar-indigo') + '">' + initials + '</div><div class="ann-card-info"><div class="ann-card-name">' + name +
  '</div><div class="ann-card-date">' + date + '</div></div></div><div class="announce-title">' + title + '</div><div class="announce-content">' + body + '</div></div>';

export const MENTOR_SAMPLE = {
  dashboard: {
    mentees: '2', completed: '1/6', upcoming: '1', attRate: '17%',
    upcomingList: dashSession('OCT', '26', 'After Prelims', 'BSIT', '9:00 AM', '',
      '<span class="sess-att-pill expected"><i class="ti ti-users"></i> 4 expected</span>'),
    recentList: dashSession('OCT', '21', 'Before Prelims', 'BSIT', '6:25 PM', '<span class="session-status-tag tag-completed">Completed</span>',
      '<span class="sess-att-pill"><i class="ti ti-users"></i> 1/2 attended</span>', ' session-item-completed'),
    announcements: '<div class="announce-item from-admin" data-wt="1"><div class="announce-author-row"><span class="announce-source-wrap"><span class="announce-poster-name">System Admin</span><span class="announce-source admin">Admin</span></span></div>' +
      '<div class="announce-title">Title: Mentoring Program – Welcome and Important Reminders</div><div class="announce-body">Good day, Mentors! Welcome to our Mentoring Program! As mentors, you play an important role in guiding, supporting, and inspiring your assigned mentees.</div><div class="announce-footer"><span class="announce-date">Oct 19, 2026</span></div></div>',
    calendar:
      '<a class="calendar-overview-item" data-wt="1"><span class="calendar-overview-type">Session Schedule</span><strong>Mentoring Session Before Prelims</strong><span class="calendar-overview-date"><i class="ti ti-calendar"></i> Oct 16, 2026 – Oct 21, 2026</span></a>' +
      '<a class="calendar-overview-item" data-wt="1"><span class="calendar-overview-type deadline">Submission Deadline</span><strong>Last Day of Submission of Mentoring Requisite Session Before Prelims</strong><span class="calendar-overview-date"><i class="ti ti-calendar"></i> Oct 22, 2026</span></a>',
  },
  mentees: {
    subtitle: '2 mentees assigned to you',
    grid: menteeCard('Charizze Mentee', 's2023101668@firstasia.edu.ph', 's2023101668') + menteeCard('Daniela Mentee', 'barrandadaniela@gmail.com', 's2023100108'),
  },
  sessions: {
    subtitle: '2 sessions on record',
    counts: { total: '2', completed: '1', scheduled: '1', cancelled: '0', inProgress: '0', closed: '0' },
    list:
      sessionCard('After Prelims', 'Scheduled', 'status-scheduled', 'October 26, 2026', '9:00 AM', '', 0, 4,
        '<button class="sc-action-btn btn-sc-qr" type="button"><i class="ti ti-qrcode"></i> View Attendance</button><button class="sc-action-btn btn-sc-proof-upload" type="button"><i class="ti ti-upload"></i> Upload Proof</button>') +
      sessionCard('Before Prelims', 'Completed', 'status-completed', 'October 21, 2026', '6:25 PM – 11:55 PM', 'Before Prelims Session.', 1, 2,
        '<button class="sc-action-btn btn-sc-qr" type="button"><i class="ti ti-qrcode"></i> View Attendance</button><button class="sc-action-btn btn-sc-proof-view" type="button">View Photo</button>'),
  },
  availability: {
    slots:
      '<div class="slot-card slot-open" data-wt="1"><button class="slot-delete-btn" type="button" title="Delete slot"><i class="ti ti-trash"></i></button><div class="slot-cal-block"><span class="slot-cal-month">OCT</span><span class="slot-cal-day">26</span></div>' +
      '<div class="slot-body"><div class="slot-status-row"><span class="slot-status-dot"></span><span class="slot-status-label">Open</span></div><div class="slot-time"><i class="ti ti-clock"></i> 10:00 AM</div><span class="slot-name-tag">After Prelims</span></div></div>',
  },
  announcements: tab => '<div data-wt-tab="' + tab + '">' + (tab === 'mine'
    ? annCard(true, 'Nicole Mentor', 'NM', 'Oct 21, 2026', 'Welcome and Guidance for My Mentees', 'Welcome to our Mentoring System! I am glad to be part of your learning journey. As your mentor, I am here to guide you, share my knowledge, and help you develop your skills and achieve your goals.', false)
    : annCard(false, 'System Admin', 'SA', 'Oct 19, 2026', 'Title: Mentoring Program – Welcome and Important Reminders', 'Good day, Mentors! Welcome to our Mentoring Program! As mentors, you play an important role in guiding, supporting, and inspiring your assigned mentees.', true)) + '</div>',
};
