// Sample dashboard data for the Administrator and Super Administrator walkthroughs (tourAdmin.js). While the tour runs, the
// two dashboards render this instead of the real data (same shapes the API returns); nothing real is read,
// changed or saved. Names and numbers follow a real program snapshot: 6 mentors, 7 mentees, 1 unassigned,
// 1 dropped out, 1 completed session without proof. A few mentors are given finalized scores so Mentor
// Performance, Top 3 and the alerts all show something.

const mentor = (id, firstName, lastName, school, departmentName, extra) => ({
  mentorID: id, firstName, lastName, email: `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, '') + '@sample.edu', school, departmentName,
  isActive: true, menteeCount: 1, sectionCount: 1, sections: 'BSIT', completedSessions: 0, requiredSessions: 6, onTimeCount: 0, completeCount: 0,
  progressPercent: 0, timelinessPercent: null, timelinessPending: true, lateReportCount: 0, missingReportCount: 0, completenessPercent: 0,
  evaluationRatingPercent: null, overallPercent: null, progressStatus: 'Pending', sectionProgress: [], completedSlots: [], ...extra,
});
const withSections = (m, rows) => ({
  ...m,
  sections: rows.map(r => r.sectionCode).join(', '),
  sectionCount: rows.length,
  sectionProgress: rows.map(r => ({ mentorID: m.mentorID, sectionCode: r.sectionCode, completedSessions: r.done, requiredSessions: r.required, isCurrentlyHandled: true })),
});

const MENTORS = [
  withSections(mentor(1, 'Nicole', 'Mentor', 'School of Technology', 'CCIT', {
    menteeCount: 2, completedSessions: 3, requiredSessions: 6, progressPercent: 50, progressStatus: 'Excellent', overallPercent: 86.5,
    timelinessPending: false, timelinessPercent: 100, completenessPercent: 100, evaluationRatingPercent: 75,
  }), [{ sectionCode: 'BSIT', done: 3, required: 6 }]),
  withSections(mentor(2, 'dave', 'mendoza', 'School of Humanities', 'CASE', {
    menteeCount: 2, completedSessions: 4, requiredSessions: 12, progressPercent: 33, progressStatus: 'On Track', overallPercent: 64,
    timelinessPending: false, timelinessPercent: 80, completenessPercent: 70, evaluationRatingPercent: 60,
  }), [{ sectionCode: 'BEED', done: 2, required: 6 }, { sectionCode: 'BSIT', done: 2, required: 6 }]),
  withSections(mentor(3, 'Juan Carlo', 'De Leon', 'School of Technology', 'CCIT', {
    completedSessions: 2, progressPercent: 33, progressStatus: 'On Track', overallPercent: 55,
    timelinessPending: false, timelinessPercent: 70, completenessPercent: 60, evaluationRatingPercent: 50,
  }), [{ sectionCode: 'BSIT', done: 2, required: 6 }]),
  mentor(4, 'carl', 'los', 'School of Technology', 'CCIT', { menteeCount: 0 }),
  mentor(5, 'test', 'mentor', 'School of Technology', 'CCIT', {}),
  mentor(6, 'Miguel', 'Santos', 'School of Technology', 'CCIT', {}),
];

const stats = {
  totalMentors: 6, totalMentees: 7, unassigned: 1, droppedOut: 1, assigned: 5, activeMentees: 2, sessionsWithoutProof: 1,
  menteeStatusDistribution: { Excellent: 1, OnTrack: 0, Behind: 0, AtRisk: 0, Critical: 0, NoSessions: 4 },
};
const monitor = { mentors: MENTORS, critical: 0, behind: 0, onTrack: 2, excellent: 1 };
const activities = [
  { sessionID: -1, description: 'Nicole Mentor scheduled a session for Before Prelims', createdAt: '2026-10-21T18:25:00', menteeCount: 1 },
  { sessionID: -2, description: 'dave mendoza uploaded session proof for Before Prelims', createdAt: '2026-10-19T09:43:00', menteeCount: 1 },
  { sessionID: -3, description: 'dave mendoza uploaded session proof for Mentoring Assembly', createdAt: '2026-10-19T09:12:00' },
];

export const TOUR_SAMPLE = {
  stats, monitor, activities,
  // Admin dashboard keeps users/stats/monitor together in one object.
  adminData: { users: [], stats, monitor },
};
