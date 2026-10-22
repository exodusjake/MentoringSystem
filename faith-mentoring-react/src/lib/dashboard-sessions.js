// Shared display classification; does not alter session records or attendance.
function dashboardSessionState(s, events, now = new Date()) {
  if (s.sessionStatus === 'Cancelled') return 'Cancelled';
  if (s.sessionStatus === 'Completed' && s.timeEnd) return 'Completed';
  if (Number(s.presentCount) > 0) return 'In Progress';
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const event = (events || []).find(e => e.isPublished === true && e.eventType === 'Session Schedule' && e.slotName === s.slotName && e.schoolYear === s.schoolYear && e.semester === s.semester);
  if (event && String(event.endDate || event.startDate).slice(0,10) < today) return 'Closed';
  if (s.sessionStatus === 'Completed') return 'In Progress';
  const value = String(s.sessionDate || '');
  const start = new Date(value + (/Z$|[+-]\d{2}:\d{2}$/.test(value) ? '' : value.length === 10 ? 'T00:00:00+08:00' : '+08:00'));
  return start > now ? 'Upcoming' : 'Past Scheduled';
}

// Shared status wording for session lists; never changes the stored status.
function sessionDisplayStatus(s, events, now = new Date()) {
  const state = dashboardSessionState({...s, timeEnd: s.actualEnd ?? s.timeEnd}, events, now);
  return state === 'Upcoming' || state === 'Past Scheduled' ? 'Scheduled' : state;
}

export { dashboardSessionState, sessionDisplayStatus };
