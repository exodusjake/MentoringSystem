import { apiRequest } from './api.js';

// Shared attendance semantics for Mentor, Admin and Head logsheet previews/prints.
const LogsheetData = (() => {
  const zone = 'Asia/Manila';
  function date(value, utc = false) {
    if (!value) return null;
    const text = String(value);
    const d = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : text + (utc ? 'Z' : '+08:00'));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const scanISO = value => date(value, true)?.toISOString() || null;
  // Record identity supports notes/absence; it is not evidence of presence.
  // A timestamp is necessary evidence, not proof of historical QR authorization.
  function attendanceState(m) {
    if (m.attendanceUnverified || m.attendanceExcluded) return null;
    if (m.isPresent === true) return (Number(m.attendanceID) > 0 || m.attendanceRecorded) && scanISO(m.scannedAt) ? true : null;
    return (Number(m.attendanceID) > 0 || m.attendanceRecorded) && m.isPresent === false ? false : null;
  }
  const time = value => date(value)?.toLocaleTimeString('en-PH', { timeZone: zone, hour:'numeric', minute:'2-digit', hour12:true }) || '—';
  const day = value => date(value)?.toLocaleDateString('en-US', { timeZone: zone, month:'short', day:'numeric', year:'numeric' }) || '—';
  const periodLabel = s => `${s.semester || 'Period unavailable'}, AY ${s.schoolYear || 'unavailable'}`;
  function reportStatus(s, events, now = new Date()) {
    if (s.reportStatus) return s.reportStatus;
    const matches = (events || []).filter(e => e.isPublished === true && e.eventType === 'Deadline'
      && e.schoolYear === s.schoolYear && e.semester === s.semester && e.slotName === s.slotName);
    // Missing/ambiguous deadlines never become invented due dates.
    const boundary = matches.length === 1 ? date(String(matches[0].startDate).slice(0,10) + 'T00:00:00') : null;
    if (boundary) boundary.setUTCDate(boundary.getUTCDate() + 1);
    const overdue = boundary && now >= boundary;
    if (s.needsUpdate) return overdue ? 'Needs Update — Overdue' : 'Needs Update';
    if (s.logStatus === 'Submitted' && s.documentsComplete == null) return 'Submitted — requirements unverified';
    // Do not guess whether an unzoned SQL timestamp is UTC or Philippine time.
    const hasOffset = /[zZ]$|[+-]\d\d:\d\d$/.test(String(s.submittedAt || ''));
    const submitted = hasOffset ? date(s.submittedAt) : null;
    if (s.logStatus === 'Submitted' && s.submittedAt && !hasOffset) return 'Submitted — timing unavailable';
    if (s.logStatus === 'Submitted' && submitted && s.documentsComplete === true) {
      if (!boundary) return 'Submitted — deadline unavailable';
      return submitted < boundary ? 'Submitted On Time' : 'Submitted Late';
    }
    return overdue ? 'Overdue' : 'Pending';
  }
  async function withReportStatuses(sessions, mentorId) {
    const periods = [...new Set(sessions.filter(s => s.schoolYear && s.semester).map(s => JSON.stringify([s.schoolYear,s.semester])))];
    const statuses = (await Promise.all(periods.map(async period => {
      const [schoolYear,semester] = JSON.parse(period);
      return apiRequest(`MonitorActivities/${mentorId}/reports?schoolYear=${encodeURIComponent(schoolYear)}&semester=${encodeURIComponent(semester)}`, 'GET', null, true).catch(() => []);
    }))).flat();
    return sessions.map(s => {
      const state = statuses.find(r => r.schoolYear === s.schoolYear && r.semester === s.semester && r.slotName === s.slotName && r.sectionCode === (s.sessionSectionCode || s.sectionCode)
        && (s.groupingMode!=='Course'||r.courseSchool===s.courseSchool));
      return state ? {...s,reportStatus:state.status} : s;
    });
  }
  const key = (s, section) => JSON.stringify([s.schoolYear, s.semester, s.slotName, section]);
  function merge(sessions) {
    const groups = new Map();
    for (const s of sessions) {
      const sections = s.isMakeup
        ? [...new Set((s.mentees || []).map(m => m.sectionCode).filter(v => v && v !== '-'))]
        : [s.sessionSectionCode || s.sectionCode];
      for (const section of (sections.length ? sections : [null])) {
        const schools=s.groupingMode==='Course'?(s.isMakeup?[...new Set((s.mentees||[]).filter(m=>m.sectionCode===section).map(m=>m.courseSchool))]:[s.courseSchool]):[null];
        for(const school of schools){
          const k = s.slotName && section ? key(s, s.groupingMode==='Course'?JSON.stringify([school,section]):section) : `session:${s.sessionID}`;
          if (!groups.has(k)) groups.set(k, {section,school,sources:[]});
          groups.get(k).sources.push(s);
        }
      }
    }
    const ids = new Set();
    return [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([groupKey,group]) => {
      const active = group.sources.filter(s=>(s.sessionStatus || s.status)!=='Cancelled');
      const sources = (active.length ? active : group.sources).sort((a,b) => Number(a.isMakeup)-Number(b.isMakeup) || new Date(a.sessionDate)-new Date(b.sessionDate) || a.sessionID-b.sessionID);
      const primary = sources[0];
      const state = (primary.checkpointStates || []).find(c=>c.sectionCode===group.section&&(primary.groupingMode!=='Course'||c.courseSchool===group.school));
      const mentees = new Map();
      for (const s of sources) {
        if ((s.sessionStatus || s.status) === 'Cancelled' && sources.length > 1) continue;
        for (const m of s.mentees || []) {
          if (group.section && m.sectionCode && m.sectionCode !== group.section) continue;
          if(primary.groupingMode==='Course'&&m.courseSchool!==group.school)continue;
          const old = mentees.get(m.menteeID);
          const scannedAt = scanISO(m.scannedAt);
          // A successful scan is the sole evidence of actual attendance.
          const attendanceRecorded = Number(m.attendanceID) > 0;
          const attendanceExcluded = (s.sessionStatus || s.status) === 'Cancelled';
          const present = !attendanceExcluded && attendanceState(m) === true;
          const attendanceUnverified = !!m.attendanceUnverified || (m.isPresent === true && attendanceState(m) !== true);
          if (!old || (attendanceRecorded && !old.attendanceRecorded) ||
              (attendanceRecorded === old.attendanceRecorded && present && !old.isPresent) ||
              (attendanceRecorded === old.attendanceRecorded && present && old.isPresent && scannedAt < old.scannedAt)) {
            mentees.set(m.menteeID, {...m, menteeFirstName:m.menteeFirstName || m.menteeName || '', menteeLastName:m.menteeLastName || '', scannedAt, attendanceRecorded, attendanceUnverified, attendanceExcluded, isPresent:present,
              _sourceSessionID:s.sessionID, _attendedDate:scannedAt,
              _attendedEndTime:present && (s.sessionStatus || s.status)==='Completed' ? s.timeEnd || null : null, _hasProof:!!s.proofFilePath});
          }
        }
      }
      const rows = [...mentees.values()];
      const scans = rows.filter(m=>m.isPresent).map(m=>m.scannedAt).filter(Boolean).sort();
      const ends = sources.filter(s=>(s.sessionStatus || s.status)==='Completed').map(s=>date(s.timeEnd)?.toISOString()).filter(Boolean).sort();
      const proofs = sources.filter(s=>s.proofFilePath).map(s=>({filePath:s.proofFilePath, fileType:s.proofFileType || '', label:`${s.isMakeup ? 'Make-up' : 'Session'} · ${day(s.sessionDate)}`, sessionID:s.sessionID}));
      let viewId = primary.sessionID;
      if (primary.isMakeup && group.section) {
        viewId = -1 - [...groupKey].reduce((hash,c)=>(Math.imul(hash,31)+c.charCodeAt(0))>>>0,0);
        while(ids.has(viewId)) viewId--;
      }
      ids.add(viewId);
      return {...primary, sessionID:viewId,
        sessionStatus:sources.some(s=>(s.sessionStatus || s.status)==='Completed') ? 'Completed' : primary.sessionStatus,
        logStatus:state?.logStatus || primary.logStatus, submittedAt:state?.submittedAt || primary.submittedAt,
        _sourceSessionID:primary.sessionID, isMakeup:!primary.slotName || !group.section ? primary.isMakeup : false,
        sessionSectionCode:group.section, sectionCode:group.section, sections:group.section || primary.sections,courseSchool:group.school||primary.courseSchool,
        mentees:rows, actualStart:scans[0] || null, actualEnd:ends.at(-1) || null,
        needsUpdate:state ? state.needsUpdate : primary.logStatus !== 'Submitted' && !!primary.submittedAt,
        roundDates:sources.filter(s=>(s.sessionStatus || s.status)==='Completed').map(s=>s.sessionDate), _proofSources:proofs, _anyProof:proofs.length > 0,
        _sources:sources, presentCount:rows.filter(m=>m.isPresent).length, totalAttendees:rows.length};
    });
  }
  function rows(sessions, raw) {
    return merge(sessions).map(s=>({...raw.find(r=>r.sessionID===s._sourceSessionID), ...s,
      status:s.sessionStatus, sectionCode:s.sessionSectionCode, _mergedMentees:s.mentees}));
  }
  return {date, scanISO, attendanceState, time, day, periodLabel, reportStatus, withReportStatuses, merge, rows};
})();

export { LogsheetData };
