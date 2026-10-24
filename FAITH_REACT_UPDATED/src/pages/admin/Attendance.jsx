import AttendanceOverview from '../shared/AttendanceOverview.jsx';

// ADMIN_/HTML/attendance-logs.html
const CFG = {
  pageId: 'ADMIN_/attendance-logs', base: '/admin', heading: 'Attendance Logs',
  loadingText: 'Loading…', emptyText: 'No mentors found.',
  sessionsSuffix: '', roleLabel: 'Admin',
};
export default function Attendance() {
  return <AttendanceOverview cfg={CFG} />;
}
