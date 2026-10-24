import { CONFIG } from './config.js';
import { LogsheetData } from './logsheet-data.js';
import { getLogsheetPrintStyles } from './print-logsheet-styles.js';
import { escapeHtml } from './security-utils.js';

// Printable logsheet forms (HEAD/JS/mentor-detail.js: buildPrintForm / buildMentorNotesForm /
// buildNonAttendanceForm / headOpenPrintWindow). These build standalone HTML documents that are written into a
// print window, so they stay string builders. The on-screen preview in the viewer modal is React.
export function lsFmtDateShort(value) { return LogsheetData.day(value); }
export function lsEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function lsIsMakeup(session) {
  return session.isMakeup === true || session.IsMakeup === true;
}

const sigImg = (mentor) => mentor?.signatureFilePath
  ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
  : '';

export function buildPrintForm(session, mentor, label) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = sigImg(mentor);
  const dateStr      = lsFmtDateShort(session.sessionDate);
  const logoUrl      = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const sessionLabel = lsIsMakeup(session)
    ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
    : (session.slotName || 'Session');

  // Matches Mentor's and Admin's own print forms: a mentee's signature only ever appears once the mentor has
  // uploaded a proof photo for this session.
  const hasProof = !!session.proofFilePath;

  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);
  const rows = presentMentees.map(m => {
    // A merged mentee carries the date of the round they actually attended, which may differ from round 1's
    // date shown at the top of the form.
    const mDateStr  = m._attendedDate ? lsFmtDateShort(m._attendedDate) : dateStr;
    const mHasProof = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
    <tr>
      <td>${mDateStr}</td>
      <td>${lsEsc(m.menteeName)}</td>
      <td>${LogsheetData.time(m.scannedAt)}</td>
      <td>${LogsheetData.time(m._attendedEndTime)}</td>
      <td class="sig-cell">${sigHtml}</td>
      <td>${lsEsc(m.remarks || '')}</td>
    </tr>`;
  }).join('');

  const blankCount = Math.max(0, (session.mentees || []).length - presentMentees.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>').join('');

  return `
    <div class="form-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub">MENTORING PROGRAM</div>
        <div class="sub">${label}</div>
        <div class="doc-title">MENTORING LOGSHEET</div>
      </div>
      <div class="session-label">
        <span class="session-underline">${sessionLabel}</span> Session
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:80px">DATE</th>
            <th style="width:200px">MENTEE'S NAME</th>
            <th style="width:90px">TIME START</th>
            <th style="width:90px">TIME END</th>
            <th style="width:90px">SIGNATURE</th>
            <th>REMARKS</th>
          </tr>
        </thead>
        <tbody>${rows}${blankRows}</tbody>
      </table>
      <div class="form-footer">
        <div class="sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${lsEsc(mentorName)}</div></div>
          <div class="sig-line"></div>
          <div class="sig-role">Mentor's Signature over printed name</div>
        </div>
        <div class="sig-block date-block">
          <div class="sig-line"></div>
          <div class="sig-role">DATE</div>
        </div>
      </div>
    </div>`;
}

export function buildMentorNotesForm(session, mentor, label) {
  const mentorName     = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml  = sigImg(mentor);
  const dateStr        = lsFmtDateShort(session.sessionDate);
  const logoUrl        = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);

  const entries = presentMentees.map(m => {
    const mDateStr  = m._attendedDate ? lsFmtDateShort(m._attendedDate) : dateStr;
    const notesLine = m.mentorNotes
      ? `<div class="note-line-pre">${lsEsc(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${lsEsc(m.menteeName)}</span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-val">${mDateStr}</span></div>
        </div>
        ${notesLine}
      </div>`;
  });

  const blankCount = Math.max(0, (session.mentees || []).length - presentMentees.length);
  for (let i = 0; i < blankCount; i++) {
    entries.push(`
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-blank"></span></div>
          <div class="note-field"><strong>Date of Mentoring:</strong> <span class="note-field-blank"></span></div>
        </div>
        <div class="note-line"></div><div class="note-line"></div>
      </div>`);
  }

  return `
    <div class="notes-page">
      <div class="guidance-copy">GUIDANCE COPY</div>
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="doc-title" style="text-decoration:none;margin-top:2px;font-size:13px;">MENTOR'S NOTES</div>
        <div class="sub">${label}</div>
      </div>
      <div class="note-entries">${entries.join('')}</div>
      <div class="notes-footer">
        <div class="notes-sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="notes-sig-name">${lsEsc(mentorName)}</div></div>
          <div class="notes-sig-line"></div>
          <div class="notes-sig-role">Mentor's Signature over printed name</div>
        </div>
        <div class="notes-sig-block notes-date-block">
          <div class="notes-sig-line"></div>
          <div class="notes-sig-role">DATE</div>
        </div>
      </div>
    </div>`;
}

export function buildNonAttendanceForm(session, mentor, label, guidanceOfficer) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = sigImg(mentor);
  const dateStr       = lsFmtDateShort(session.sessionDate);
  // Distinct from dateStr (the session's own date) — this is when it was submitted.
  const submittedDateStr = session.submittedAt ? lsFmtDateShort(session.submittedAt) : '—';
  const logoUrl       = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const absentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);
  const sessionRef    = lsIsMakeup(session)
    ? (session.slotName ? `Make-Up Session: ${session.slotName}` : 'Make-Up Session')
    : (session.slotName || 'Session');

  const dataRows = absentMentees.map(m => `
    <tr>
      <td>${lsEsc(m.menteeName)}</td>
      <td>${lsEsc(m.sectionCode || '')}</td>
      <td>${lsEsc(m.absenceReason || '')}</td>
    </tr>`).join('');

  const blankRows = Array(Math.max(0, 15 - absentMentees.length))
    .fill('<tr><td></td><td></td><td></td></tr>').join('');

  return `
    <div class="na-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub">MENTORING PROGRAM</div>
        <div class="doc-title">NON-ATTENDANCE OF MENTEES</div>
        <div class="sub">${label}</div>
      </div>
      <div class="na-letter">
        <p><strong>Dear Mentors,</strong></p>
        <p>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to ${lsEsc(guidanceOfficer)} at the Guidance Office. Thank you!</p>
      </div>
      <div class="sig-block" style="max-width:240px;margin:10px 0 16px;">
        <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${lsEsc(mentorName)}</div></div>
        <div class="sig-line"></div>
        <div class="sig-role">Mentor's Signature over printed name</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:40%">NAME</th>
            <th style="width:25%">COURSE</th>
            <th>REASON</th>
          </tr>
        </thead>
        <tbody>${dataRows}${blankRows}</tbody>
      </table>
      <p class="na-note">Please use another separate sheet if the space provided is not enough.</p>
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="na-field-label">NAME OF MENTOR:</span><span class="ack-val">${lsEsc(mentorName)}</span></div>
          <div class="na-ack-field"><span class="na-field-label">MENTORING SESSION:</span><span class="ack-val">${sessionRef} — ${dateStr}</span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDateStr}</span></div>
          <div class="na-ack-field"><span class="na-field-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="na-field-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>`;
}

// Delegates to the shared print stylesheet so Mentor, Admin, and Head all print from the same CSS source.
export function openLogsheetPrintWindow(title, body, onBlocked, accent = ['#0f766e', '#0d6560']) {
  const w = window.open('', '_blank', 'width=960,height=760');
  if (!w) { onBlocked?.(); return; }
  w.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title>
<style>${getLogsheetPrintStyles(accent[0], accent[1])}</style></head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">${escapeHtml(title)}</span>
    <div style="display:flex;gap:8px;">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-wrap">${body}</div>
</body></html>`);
  w.document.close();
}
