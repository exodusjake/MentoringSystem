// Academic periods are ordered by school year ("2025-2026" starts 2025), then semester (1st before 2nd).
const rank = (schoolYear, semester) => {
  const year = parseInt(String(schoolYear).split('-')[0], 10);
  const sem = String(semester).startsWith('1') ? 1 : String(semester).startsWith('2') ? 2 : 0;
  return Number.isFinite(year) ? year * 10 + sem : NaN;
};

// A period belongs in a filter list only once the system has moved past it: strictly earlier than the current one.
// The current period has its own "(Current)" option, and a period that has not started yet is never offered.
export function isPastPeriod(period, settings) {
  const p = rank(period.schoolYear, period.semester);
  const cur = rank(settings.SchoolYear, settings.Semester);
  return Number.isFinite(p) && Number.isFinite(cur) && p < cur;
}
