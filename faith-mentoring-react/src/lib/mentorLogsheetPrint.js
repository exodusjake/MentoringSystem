import { CONFIG } from './config.js';
import { LogsheetData } from './logsheet-data.js';
import { getLogsheetPrintStyles } from './print-logsheet-styles.js';

// The mentor's printable forms (Logsheet, Mentor's Notes, Non-Attendance), opened in a new window.
// These are whole print documents, kept as the original's HTML templates (MENTOR/JS/logsheet.js);
// mentee names and remarks are escaped.
const escHtml = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const displayMenteeName = mentee => mentee.menteeName
  || `${mentee.menteeFirstName || ''} ${mentee.menteeLastName || ''}`.trim();

function buildPrintForm(session, mentor, semesterLabel) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const timeStart     = LogsheetData.time(session.actualStart) || '—';
  const timeEnd       = LogsheetData.time(session.actualEnd)   || '—';
  const dateStr       = LogsheetData.day(session.sessionDate);
  const logoUrl       = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const sessionLabel  = !!session.isMakeup
    ? (session.slotName ? `Make-Up: ${session.slotName}` : 'Make-Up')
    : (session.slotName || 'Session');

  // Only present mentees appear on the form (matching paper form usage)
  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);

  const hasProof = !!session.proofFilePath;

  const rows = presentMentees.map(m => {
    const mTimeStart = LogsheetData.time(m.scannedAt);
    // A merged mentee (see mergeRoundsForLogsheet) carries the date of the
    // round they actually attended, which may differ from round 1's date
    // shown at the top of the form — fall back to it for the normal,
    // unmerged case.
    const mDateStr   = m._attendedDate ? LogsheetData.day(m._attendedDate) : dateStr;
    // A merged mentee also carries which of their own source session had
    // proof uploaded (_hasProof) — falls back to the card's own session-
    // level proof for the normal, unmerged case where that's the only proof
    // there is.
    const mHasProof  = m._hasProof !== undefined ? m._hasProof : hasProof;
    const sigHtml    = (mHasProof && m.signatureFilePath)
      ? `<img src="${CONFIG.getFileUrl(m.signatureFilePath)}" style="max-height:44px;max-width:120px;object-fit:contain;" onerror="this.replaceWith(document.createTextNode('—'))">`
      : '';
    return `
        <tr>
          <td>${mDateStr}</td>
          <td>${escHtml(displayMenteeName(m))}</td>
          <td>${mTimeStart}</td>
          <td>${LogsheetData.time(m._attendedEndTime)}</td>
          <td class="sig-cell">${sigHtml}</td>
          <td>${escHtml(m.remarks || '')}</td>
        </tr>`;
  }).join('');

  // Blank rows to fill out the form (minimum 15 rows total like paper)
  const blankCount = Math.max(0, (session.mentees || []).length - presentMentees.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td><td></td><td class="sig-cell"></td><td></td></tr>').join('');

  return `
    <div class="form-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub">MENTORING PROGRAM</div>
        <div class="sub">${semesterLabel}</div>
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
        <tbody>
          ${rows}
          ${blankRows}
        </tbody>
      </table>

      <div class="form-footer">
        <div class="sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${mentorName}</div></div>
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

function buildMentorNotesForm(session, mentor, semLabel) {
  const mentorName     = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml  = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr        = LogsheetData.day(session.sessionDate);
  const logoUrl        = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const presentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === true);

  const entries = presentMentees.map(m => {
    const notesLine = m.mentorNotes
      ? `<div class="note-line-pre">${escHtml(m.mentorNotes)}</div><div class="note-line"></div>`
      : `<div class="note-line"></div><div class="note-line"></div>`;
    const mDateStr = m._attendedDate ? LogsheetData.day(m._attendedDate) : dateStr;
    return `
      <div class="note-entry">
        <div class="note-entry-header">
          <div class="note-field"><strong>Mentee's Name:</strong> <span class="note-field-val">${escHtml(displayMenteeName(m))}</span></div>
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
        <div class="sub">${semLabel}</div>
      </div>
      <div class="note-entries">${entries.join('')}</div>
      <div class="notes-footer">
        <div class="notes-sig-block">
          <div class="sig-fit">${mentorSigHtml}<div class="notes-sig-name">${escHtml(mentorName)}</div></div>
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

function buildNonAttendanceForm(session, mentor, semLabel, guidanceOfficer) {
  const mentorName    = mentor ? `${mentor.firstName} ${mentor.lastName}` : '—';
  const mentorSigHtml = mentor?.signatureFilePath
    ? `<img src="${CONFIG.getFileUrl(mentor.signatureFilePath)}" style="max-height:60px;max-width:190px;object-fit:contain;display:block;margin:0 auto -10px;mix-blend-mode:multiply;position:relative;z-index:1;" onerror="this.style.display='none'">`
    : '';
  const dateStr       = LogsheetData.day(session.sessionDate);
  // Distinct from dateStr (the session's own date) — this is when it was submitted.
  const submittedDateStr = session.submittedAt ? LogsheetData.day(session.submittedAt) : '—';
  const logoUrl       = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
  const absentMentees = (session.mentees || []).filter(m => LogsheetData.attendanceState(m) === false);

  const dataRows = absentMentees.map(m => `
    <tr>
      <td>${escHtml(displayMenteeName(m))}</td>
      <td>${escHtml(m.sectionCode || '')}</td>
      <td>${escHtml(m.absenceReason || '')}</td>
    </tr>`).join('');

  const blankCount = Math.max(0, 15 - absentMentees.length);
  const blankRows  = Array(blankCount).fill('<tr><td></td><td></td><td></td></tr>').join('');

  return `
    <div class="na-page">
      <div class="header">
        <img src="${logoUrl}" class="logo" onerror="this.style.display='none'"/>
        <div class="sub" style="font-weight:700">MENTORING PROGRAM</div>
        <div class="doc-title" style="text-decoration:none">NON-ATTENDANCE OF MENTEES</div>
        <div class="sub">${semLabel}</div>
      </div>
      <div class="na-letter">
        <p><strong>Dear Mentors,</strong></p>
        <p>Kindly list down the name/s of those who did not attend your scheduled mentoring session.
        Please submit this form to ${escHtml(guidanceOfficer)} at the Guidance Office. Thank you!</p>
      </div>
      <div class="sig-block" style="max-width:240px;margin:10px 0 16px;">
        <div class="sig-fit">${mentorSigHtml}<div class="sig-name">${escHtml(mentorName)}</div></div>
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
        <tbody>
          ${dataRows}
          ${blankRows}
        </tbody>
      </table>
      <p class="na-note">Please use another separate sheet if the space provided is not enough.</p>
      <p class="na-note">Thank you.</p>
      <div class="na-ack">
        <div class="na-ack-title">ACKNOWLEDGEMENT RECEIPT</div>
        <div class="na-ack-sub">MENTOR'S REPORT</div>
        <div class="na-ack-fields">
          <div class="na-ack-field"><span class="ack-label">NAME OF MENTOR:</span><span class="ack-val">${escHtml(mentorName)}</span></div>
          <div class="na-ack-field"><span class="ack-label">MENTORING SESSION:</span><span class="ack-val">${!!session.isMakeup ? (session.slotName ? `Make-Up Session: ${session.slotName}` : 'Make-Up Session') : (session.slotName || 'Session')} — ${dateStr}</span></div>
          <div class="na-ack-field"><span class="ack-label">DATE SUBMITTED:</span><span class="ack-val">${submittedDateStr}</span></div>
          <div class="na-ack-field"><span class="ack-label">RECEIVED BY:</span><span class="ack-val ack-blank"></span></div>
          <div class="na-ack-field"><span class="ack-label">DATE RECEIVED:</span><span class="ack-val ack-blank"></span></div>
        </div>
      </div>
    </div>`;
}

// Opens the print window (action bar + forms) with the shared logsheet print stylesheet.
// Returns false when the pop-up was blocked.
function openPrintWindow(title, body) {
  const w = window.open('', '_blank', 'width=960,height=760');
  if (!w) return false;
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>${getLogsheetPrintStyles('#0f766e', '#0d6560')}</style>
</head>
<body>
  <div class="action-bar">
    <span class="action-bar-title">${title}</span>
    <div style="display:flex;gap:8px;">
      <button class="ab-btn ab-btn-print" onclick="window.print()">&#128438; Print / Save as PDF</button>
      <button class="ab-btn ab-btn-close" onclick="window.close()">&#10005; Close</button>
    </div>
  </div>
  <div class="print-wrap">${body}</div>
</body>
</html>`);
  w.document.close();
  return true;
}

export { buildPrintForm, buildMentorNotesForm, buildNonAttendanceForm, openPrintWindow };
