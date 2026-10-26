// Attendance Rate and Semester Completion use different denominators.
// Counts come from the backend's shared checkpoint attendance function.
function percent(attended, total) {
  return total > 0 ? Math.min(100, Math.max(0, attended / total * 100)) : 0;
}
function status(rate, total) {
  if (!(total > 0)) return { cls: 'no-sessions', label: 'No completed sessions yet' };
  if (rate >= 80) return { cls: 'excellent', label: 'Excellent' };
  if (rate >= 60) return { cls: 'on-track', label: 'On Track' };
  if (rate >= 40) return { cls: 'behind', label: 'Behind' };
  if (rate >= 20) return { cls: 'at-risk', label: 'At Risk' };
  return { cls: 'critical', label: 'Critical' };
}
function completion(attended, required) {
  if (!(required > 0)) return 'not-configured';
  return attended >= required ? 'complete' : attended > 0 ? 'in-progress' : 'not-started';
}
export const AttendanceMetrics = Object.freeze({ percent, status, completion });
