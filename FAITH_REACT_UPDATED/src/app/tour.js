import { createContext, useContext } from 'react';

// MENTEE/JS/walkthrough.js — what the pages see of the tour. While the tour runs each page shows SAMPLE
// data (a new mentee usually has nothing yet); nothing real is read, changed or saved.
//   active          the tour is showing
//   scheduleApproved / modalOpen / annTab   state driven by the tour's step hooks
//   start()         "Replay Walkthrough"
export const TourContext = createContext({
  active: false, scheduleApproved: false, modalOpen: false, annTab: 'admin', start: () => {},
});
export const useTour = () => useContext(TourContext);

// A container whose children are replaced by sample HTML while the tour is active (walkthrough.js putHtml).
// Use as `<div key={wt ? "wt" : "real"} dangerouslySetInnerHTML={sampleHtml(wt, html)}>` — the key remounts it
// when switching between real and sample content.
export const sampleHtml = (on, html) => (on ? { __html: html } : undefined);

// ── SAMPLE DATA (tour only) ────────────────────────────────
const DONE_TAG = '<span class="session-completed-tag">Completed</span> <span class="session-att-tag att-present">Present</span>';
function dashSession(month, day, title, time, tag, cls) {
  return '<div class="session-item' + (cls || '') + '" data-wt="1"><div class="session-date-block"><div class="session-month">' + month +
    '</div><div class="session-day">' + day + '</div></div><div class="session-info"><div class="session-title">' + title +
    ' <span class="session-course-tag">BSIT</span></div><div class="session-time">' + time + ' ' + tag + '</div></div></div>';
}

export const SAMPLE = {
  dashboard: {
    mentorPreview:
      '<div class="mentor-avatar-lg" data-wt="1">MS</div><div class="mentor-info-block"><div class="mentor-info-name">Maria Santos</div>' +
      '<div class="mentor-info-dept">maria.santos@sample.edu</div><div class="mentor-info-tags"><span class="mentor-tag">CCIT</span><span class="mentor-tag">School of Technology</span></div></div>',
    attended: '3', required: '/6', attSub: '3 of 6 checkpoints attended',
    upcoming: dashSession('NOV', '12', 'Before Prelims', '9:00 AM', '<span class="session-completed-tag" style="background:#ede9fe;color:#6d28d9;border-color:#ddd6fe;">Today</span>'),
    recent:
      dashSession('OCT', '08', 'Mentoring Assembly', '10:00 AM', DONE_TAG, ' session-item-completed') +
      dashSession('SEP', '24', 'Goal Setting', '2:00 PM', '<span class="session-completed-tag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca;">Cancelled</span>', ' session-item-cancelled'),
    announcements: '<div class="announce-item" data-wt="1"><div class="announce-title">Prelim checkpoint window opens Nov 10</div><div class="announce-body">You can book your Before Prelims session from Nov 10.</div><div class="announce-footer"><span class="announce-date">Oct 15, 2026</span></div></div>',
    evaluations: '<div class="announce-item" data-wt="1"><div class="announce-title">Mentoring Program Evaluation</div><div class="announce-body">Share your feedback about your mentoring experience.</div><div class="announce-footer"><span class="announce-date">Oct 12, 2026</span></div></div>',
  },
  sessions: {
    subtitle: '4 sessions on record',
    sessionsBody: (() => {
      const scmCard = (label, num, dateStr, day, time, statusCls, status, att, actions, extra) =>
        '<div class="scm-card' + (extra || '') + '" data-wt="1"><div class="scm-num-block"><div class="scm-num-label">SESSION</div><div class="scm-num-value">' + label +
        '</div><div class="scm-num-total">' + num + ' of 6</div></div><div class="scm-body"><div class="scm-date-row"><span class="scm-date">' + dateStr + '</span></div>' +
        '<div class="scm-meta"><span><i class="ti ti-calendar-week"></i> ' + day + '</span><span><i class="ti ti-clock"></i> ' + time + '</span></div>' +
        '<div class="scm-tags"><span class="topic-section-tag">Scheduled Session</span></div>' +
        '<div class="scm-status-stack"><span class="session-status ' + statusCls + '">' + status + '</span>' + att + '</div><div class="scm-actions">' + actions + '</div></div></div>';
      return scmCard('Before Prelims', 4, 'November 12, 2026', 'Thursday', '9:00 AM', 'status-scheduled', 'Scheduled', '<span class="att-badge att-pending">Not recorded</span>',
        '<button class="btn-qr" type="button"><i class="ti ti-qrcode"></i> Show QR</button><button class="btn-detail" type="button"><i class="ti ti-info-circle"></i> Details</button>', ' scm-today') +
        scmCard('Mentoring Assembly', 1, 'October 8, 2026', 'Thursday', '10:00 AM', 'status-completed', 'Completed', '<span class="att-badge att-present"><i class="ti ti-check"></i> Present</span>',
          '<button class="btn-detail" type="button"><i class="ti ti-info-circle"></i> Details</button>', ' scm-completed');
    })(),
  },
  schedule: approved => {
    const badge = approved ? '<span class="sch-approved-badge"><i class="ti ti-check"></i> Session Approved</span>' : '<span class="sch-available-badge">Available</span>';
    const btn = approved
      ? '<button class="btn-request btn-request-approved" type="button" disabled><i class="ti ti-calendar-check"></i> Session Scheduled</button>'
      : '<button class="btn-request" type="button">Request This Slot</button>';
    return '<div class="sch-slot-card' + (approved ? ' already-approved' : '') + '" data-wt="' + (approved ? 'approved' : 'open') + '"><div class="sch-slot-header"><span class="sch-slot-mentor">Maria Santos</span>' + badge + '</div>' +
      '<div><div class="sch-slot-date">November 12, 2026</div><div class="sch-slot-day">Thursday</div><span class="sch-slot-name-tag">Before Prelims</span></div>' +
      '<div class="sch-slot-time"><i class="ti ti-clock"></i> 9:00 AM</div>' + btn + '</div>';
  },
  announcements: tab => {
    const annCard = (mentor, name, initials, roleCls, roleLbl, date, title, body, pinned) =>
      '<div class="announce-card ' + (mentor ? 'announce-card-mentor' : 'announce-card-admin') + (pinned ? ' announce-card--pinned' : '') + '" data-wt="1">' +
      (pinned ? '<div class="ann-pin-banner"><i class="ti ti-pinned"></i> Pinned</div>' : '') +
      '<div class="ann-card-top"><div class="ann-avatar ' + (mentor ? 'ann-avatar-teal' : 'ann-avatar-indigo') + '">' + initials + '</div><div class="ann-card-info"><div class="ann-card-name">' + name +
      ' <span class="ann-role-badge ' + roleCls + '">' + roleLbl + '</span></div><div class="ann-card-date">' + date + '</div></div></div>' +
      '<div class="announce-title">' + title + '</div><div class="announce-content">' + body + '</div></div>';
    return '<div data-wt-tab="' + tab + '">' + (tab === 'admin'
      ? annCard(false, 'Daniela Barranda', 'DB', 'role-admin', 'Administrator', 'Oct 15, 2026', 'Prelim checkpoint window opens Nov 10', 'Please be informed that the Before Prelims checkpoint opens on Nov 10. Book your session through Schedule Session before the window closes.', true)
      : annCard(true, 'Maria Santos', 'MS', 'role-mentor', 'Mentor', 'Oct 18, 2026', 'Bring your ID to the next session', 'Hello, Mentees! Please bring your school ID so your attendance can be verified.', false)) + '</div>';
  },
};
