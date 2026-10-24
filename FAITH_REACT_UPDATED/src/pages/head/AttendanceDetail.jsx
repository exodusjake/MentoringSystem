import AttendanceDetail from '../shared/AttendanceDetail.jsx';

// HEAD/HTML/attendance-detail.html
const CFG = { pageId: 'HEAD/attendance-detail', base: '/head', admin: false };
export default function HeadAttendanceDetail() {
  return <AttendanceDetail cfg={CFG} />;
}
