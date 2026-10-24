import AttendanceDetail from '../shared/AttendanceDetail.jsx';

// ADMIN_/HTML/attendance-detail.html
const CFG = { pageId: 'ADMIN_/attendance-detail', base: '/admin', admin: true };
export default function AdminAttendanceDetail() {
  return <AttendanceDetail cfg={CFG} />;
}
