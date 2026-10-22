import { apiRequest } from './api.js';
import { CONFIG } from './config.js';
/* ============================================================
   calendar-sheet.js — SHARED between ADMIN_ and HEAD
   ============================================================
   The "Mentoring Program Calendar of Activities" print sheet is the
   exact same document on both portals (ADMIN_'s Calendar & Events page
   and HEAD's read-only Calendar page) — same header, same table, same
   Prepared By / Approved By signature blocks. Before this file existed,
   each portal had its own full copy of this logic; a signature-image
   feature added to one copy and forgotten on the other silently left
   HEAD printing a sheet with no signatures for weeks. Load this file
   alongside config.js (`<script src="/calendar-sheet.js"></script>`,
   after config.js) on any page that needs it, then call:

     const data = await fetchCalendarSheetData();
     const html = buildCalendarSheetPrintHtml({ ...data, events });
     openCalendarSheetPrintWindow(html);  // returns false if pop-up blocked

   Each portal still owns its own trigger button, its own event list
   (ADMIN_'s includes unpublished drafts; HEAD's is published-only —
   that filtering happens before `events` is passed in here), and its
   own error UI (showErrorModal vs an alert) for a blocked pop-up.
   ============================================================ */

// ── FETCH: current period + signatories + resolved signature images ──
// Every failure here is non-fatal by design — a sheet with no signature
// images, or default period text, still prints something the mentor
// program can hand out. Never throws.
async function fetchCalendarSheetData() {
  const result = {
    semester:   '1st Semester',
    schoolYear: '2026-2027',
    prepName:   '', prepTitle: '', prepSig: null,
    appName:    '', appTitle:  '', appSig:  null,
  };

  try {
    const s = await apiRequest('Settings', 'GET', null, true);
    if (s?.semester   || s?.Semester)   result.semester   = s.semester   || s.Semester;
    if (s?.schoolYear || s?.SchoolYear) result.schoolYear = s.schoolYear || s.SchoolYear;
    result.prepName  = s?.calPreparedByName  || s?.CalPreparedByName  || '';
    result.prepTitle = s?.calPreparedByTitle || s?.CalPreparedByTitle || '';
    result.appName   = s?.calApprovedByName  || s?.CalApprovedByName  || '';
    result.appTitle  = s?.calApprovedByTitle || s?.CalApprovedByTitle || '';
  } catch (e) { /* keep defaults */ }

  // Resolved from calPreparedByEmail/calApprovedByEmail (Settings, Admin-
  // managed) — whatever real signature that account has on file, same
  // image already shown on Logsheet. Admin and Head can both call this
  // endpoint; only Admin can change the emails it reads.
  try {
    const sig = await apiRequest('Settings/calendar-signatures', 'GET', null, true);
    result.prepSig = sig?.preparedBySignature || null;
    result.appSig  = sig?.approvedBySignature || null;
  } catch (e) { /* nothing set yet, or not permitted — print name only */ }

  return result;
}

function calendarSheetEscape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function buildCalendarSheetBodyHtml({semester, schoolYear, events, prepName, prepTitle, prepSig, appName, appTitle, appSig}) {
 const signature = path => path ? '<img src="' + calendarSheetEscape(CONFIG.getFileUrl(path)) + '" style="max-height:50px;max-width:170px;object-fit:contain;display:block;margin:0 0 -10px;mix-blend-mode:multiply;position:relative;z-index:1;">' : '';
 const prepSigHtml=signature(prepSig), appSigHtml=signature(appSig);
 const sorted=[...(events || [])].sort((a,b)=>new Date(a.startDate || a.StartDate)-new Date(b.startDate || b.StartDate));
 const rows=sorted.length ? sorted.map(ev=>'<tr><td>'+calendarSheetEscape(ev.title || ev.Title)+'</td><td>'+calendarSheetEscape(fmtPrintDate(ev.startDate || ev.StartDate, ev.endDate || ev.EndDate))+'</td></tr>').join('') : '<tr><td colspan="2" style="text-align:center;padding:20px;">No activities added yet.</td></tr>';
  return `
    <div class="pp-header">
      <img src="${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png" class="pp-logo" onerror="this.style.display='none'"/>
      <div class="pp-dept">STUDENT AND ALUMNI SERVICES</div>
      <div class="pp-dept">STUDENT WELFARE SERVICES</div>
      <div class="pp-dept">GUIDANCE AND COUNSELING OFFICE</div>
      <div class="pp-title">MENTORING PROGRAM<br>CALENDAR OF ACTIVITIES</div>
      <div class="pp-sub">${calendarSheetEscape((semester || "").toUpperCase())}, A.Y. ${calendarSheetEscape(schoolYear)}</div>
    </div>
    <table class="pp-table">
      <thead><tr><th style="width:62%">ACTIVITY</th><th style="width:38%">DATE/S</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pp-sigs">
      <div class="pp-sig-block">
        <div class="pp-sig-label">Prepared by:</div>
        ${prepSigHtml}
        <div class="pp-sig-name">${calendarSheetEscape(prepName) || '&nbsp;'}</div>
        <div class="pp-sig-title">${calendarSheetEscape(prepTitle) || '&nbsp;'}</div>
      </div>
      <div class="pp-sig-block">
        <div class="pp-sig-label">Approved:</div>
        ${appSigHtml}
        <div class="pp-sig-name">${calendarSheetEscape(appName) || '&nbsp;'}</div>
        <div class="pp-sig-title">${calendarSheetEscape(appTitle) || '&nbsp;'}</div>
      </div>
    </div>`;
}

function buildCalendarSheetPrintHtml(data) {
 return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Mentoring Program Calendar of Activities</title><style>
 *{box-sizing:border-box;margin:0;padding:0} body{font-family:Arial,sans-serif;color:#111;background:#eef2f7}
 .print-body{background:white;width:680px;max-width:100%;padding:36px 44px 44px;margin:72px auto 24px}
 .pp-header { text-align: center; margin-bottom: 18px; }
.pp-logo { height: 64px; display: block; margin: 0 auto 10px; }
.pp-dept { font-size: 12px; line-height: 1.7; color: #111; }
.pp-title { font-size: 17px; font-weight: 700; margin-top: 12px; line-height: 1.4; color: #111; }
.pp-sub   { font-size: 13px; font-weight: 700; margin-top: 3px; color: #111; }

.pp-table { width: 100%; border-collapse: collapse; margin-top: 14px; }
.pp-table th { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
               padding: 8px 12px; border: 1px solid #000; text-align: center; }
.pp-table td { padding: 8px 12px; border: 1px solid #000; font-size: 13px; vertical-align: top; line-height: 1.5; }

.pp-sigs { margin-top: 40px; display: flex; justify-content: space-between; }
.pp-sig-block { font-size: 12px; line-height: 1.8; }
.pp-sig-label { margin-bottom: 28px; }
.pp-sig-name  { font-weight: 700; display: block; min-width: 190px; font-size: 13px; }
.pp-sig-title { font-style: italic; font-size: 11px; color: #444; }


 .pp-sigs{break-inside:avoid} tr{break-inside:avoid}
 .action-bar{position:fixed;top:0;left:0;right:0;display:flex;justify-content:flex-end;gap:8px;padding:12px;background:#1e293b}
 button{padding:9px 16px;border:0;border-radius:7px;cursor:pointer} .print-button{background:#2563eb;color:white}
 @page{size:A4 portrait;margin:15mm} @media print{body{background:white}.action-bar{display:none}.print-body{margin:0 auto;padding:36px 44px 44px}}
 </style></head><body><div class="action-bar"><button class="print-button" onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div><main class="print-body">${buildCalendarSheetBodyHtml(data)}</main></body></html>`;
}
function openCalendarSheetPrintWindow(html, existingWindow) {
 const w=existingWindow || window.open('', '_blank', 'width=900,height=700');
 if(!w || w.closed) return false;
 w.document.open(); w.document.write(html); w.document.close(); return true;
}

export { fetchCalendarSheetData, calendarSheetEscape, buildCalendarSheetBodyHtml, buildCalendarSheetPrintHtml, openCalendarSheetPrintWindow };
