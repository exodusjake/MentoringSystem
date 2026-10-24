// Where a session's date sits against its checkpoint's published "Session Schedule" window(s) on the calendar.
// A session outside the window is not counted toward the checkpoint (the backend's official-credit rule), which
// the Logsheet cards used to show only as "Pending". Dates are calendar days (YYYY-MM-DD), compared as text.
//   'inside'  the session date is within a window       'late'  after every window ended
//   'early'   before every window started               'outside' between two windows
//   'unknown' no published window for this checkpoint, or no usable date
const day = value => String(value || '').slice(0, 10);

export function windowState(session, events) {
  const date = day(session?.sessionDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !session?.slotName) return 'unknown';
  const windows = (events || []).filter(e => e.isPublished === true && e.eventType === 'Session Schedule'
    && e.slotName === session.slotName && e.schoolYear === session.schoolYear && e.semester === session.semester);
  if (!windows.length) return 'unknown';
  let before = false, after = false;
  for (const w of windows) {
    const start = day(w.startDate);
    const end = day(w.endDate) || start;
    if (date >= start && date <= end) return 'inside';
    if (date > end) after = true;
    if (date < start) before = true;
  }
  return after && !before ? 'late' : before && !after ? 'early' : 'outside';
}
