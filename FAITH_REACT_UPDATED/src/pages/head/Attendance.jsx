import AttendanceOverview from '../shared/AttendanceOverview.jsx';

// HEAD/HTML/attendance-summary.html
const CFG = {
  pageId: 'HEAD/attendance-summary', base: '/head', heading: 'Attendance Summary',
  loadingText: 'Loading mentors…', emptyText: 'No mentors match the current filters.',
  sessionsSuffix: ' Conducted', roleLabel: 'Head Admin',
};
export default function Attendance() {
  return <AttendanceOverview cfg={CFG} />;
}
