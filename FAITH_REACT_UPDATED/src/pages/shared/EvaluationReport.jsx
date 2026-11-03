import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../../app/Page.jsx';
import { showToast as notifyToast } from '../../components/Notify.jsx';
import Overlay from '../../components/Overlay.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { darkToast } from '../../lib/darkToast.js';
import { checkpointWindow } from '../../lib/checkpoint-window.js';
import { loadScript } from '../../lib/loadScript.js';
import { isPastPeriod } from '../../lib/periods.js';
import { escapeHtml } from '../../lib/security-utils.js';
import { useBackGuard } from '../../lib/useBackGuard.js';

// HEAD/HTML/evaluation-ratings.html + HEAD/JS/evaluation-ratings.js  (read-only)
// ADMIN_/HTML/evaluation-ratings.html + ADMIN_/JS/evaluation-ratings.js (Evaluation Rating column is editable)
// `cfg` = { pageId, base, admin }

// Keep the handled-course workload visible beside each mentor's score.
function mentorCourseProgress(m) {
  return (m.sectionProgress || []).map(p => String(p.sectionCode || 'Unspecified') + ' ' + (p.completedSessions || 0) + '/' + (p.requiredSessions || 0));
}
// Same chips as markup (for the printable reports, which are standalone HTML documents).
function mentorCourseLabels(m) {
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<div class="mentor-course-progress">' + mentorCourseProgress(m).map(label => '<span class="mentor-course-chip" title="Completed sessions / required sessions">'+escape(label)+'</span>').join('') + '</div>';
}
// With 2+ courses, Done shows how many of them finished the checkpoint.
function checkpointDone(m, slot) {
  if (!(m.completedSlots || []).includes(slot)) return null;
  const courses = (m.sectionProgress || []).filter(p => p.sectionCode);
  if (courses.length < 2 || courses.some(p => !Array.isArray(p.completedSlots))) return { text: 'Done', done: [], pending: [] };
  const done = courses.filter(p => p.completedSlots.includes(slot)).map(p => p.sectionCode);
  const pending = courses.filter(p => !p.completedSlots.includes(slot)).map(p => p.sectionCode);
  return { text: pending.length ? `Done ${done.length}/${courses.length}` : 'Done', done, pending };
}
function CheckpointDone({ m, slot, empty }) {
  const d = checkpointDone(m, slot);
  if (!d) return empty;
  if (!d.pending.length) return 'Done';
  return <span className="slot-partial" data-done={d.done.join(', ') || 'None'} data-pending={d.pending.join(', ')}>{d.text}</span>;
}
// What an unfinished checkpoint cell says, from the published session calendar: Open (window running), Upcoming
// (not open yet), Closed (the window ended and the mentor did not conduct it), Not set (no schedule published).
const SLOT_STATE_COLOR = { Open: '#16a34a', Upcoming: '#94a3b8', Closed: '#ef4444', 'Not set': '#94a3b8' };
function slotState(events, slot, settings) {
  const w = checkpointWindow(events, slot, settings.SchoolYear, settings.Semester);
  if (w.label === 'Calendar unavailable') return '';
  if (w.label === 'Not scheduled') return 'Not set';
  if (w.disabled) return 'Closed';
  return w.upcoming ? 'Upcoming' : 'Open';
}
function SlotState({ state }) {
  if (!state) return <span className="slot-empty">—</span>;
  return <span style={{ color: SLOT_STATE_COLOR[state], fontWeight: 600, fontSize: '0.92em' }}>{state}</span>;
}
function checkpointDoneText(m, slot) {
  const d = checkpointDone(m, slot);
  if (!d) return '';
  return d.pending.length ? d.text + ' (' + (d.done.join(', ') || 'none') + ')' : 'Done';
}

// Shows which courses finished the checkpoint as soon as Done x/y is hovered.
function useSlotPartialTip() {
  useEffect(() => {
    const onOver = e => {
      const cell = e.target.closest?.('.slot-partial');
      let tip = document.getElementById('slotPartialTip');
      if (!cell) { if (tip) tip.style.display = 'none'; return; }
      if (!tip) { tip = document.createElement('div'); tip.id = 'slotPartialTip'; tip.className = 'slot-partial-tip'; document.body.appendChild(tip); }
      tip.innerHTML = '<div class="slot-tip-row"><span class="slot-tip-dot done"></span><span>Done: <b></b></span></div><div class="slot-tip-row"><span class="slot-tip-dot"></span><span>Not yet: <b></b></span></div>';
      const [doneEl, pendingEl] = tip.querySelectorAll('b');
      doneEl.textContent = cell.dataset.done; pendingEl.textContent = cell.dataset.pending;
      tip.style.display = 'block';
      const r = cell.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 8));
      const top = r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    };
    const onScroll = () => { const tip = document.getElementById('slotPartialTip'); if (tip) tip.style.display = 'none'; };
    document.addEventListener('mouseover', onOver);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mouseover', onOver); window.removeEventListener('scroll', onScroll, true); };
  }, []);
}

// Mirrors AstraMentoring-Backend/.../Constants/MentoringSlots.cs.
const MENTORING_SLOTS = [
  'Mentoring Assembly', 'Before Prelims', 'After Prelims',
  'Before Midterms', 'After Midterms', 'Before Finals'
];
function slotsForSemester(semester) {
  return MENTORING_SLOTS; // Keep the fixed report columns; inapplicable Assembly displays N/A.
}

// Parses "SlotName:Count, SlotName:Count" into a Map<string, number> — a slot absent from the map has no logged
// session at all (cell shows "—"), distinct from a logged session with 0 attendees (cell shows "0").
function parseSlotAttendance(raw) {
  const map = new Map();
  (raw || '').split(',').forEach(pair => {
    const idx = pair.lastIndexOf(':');
    if (idx === -1) return;
    const name  = pair.slice(0, idx).trim();
    const count = parseInt(pair.slice(idx + 1).trim(), 10);
    if (name && !Number.isNaN(count)) map.set(name, count);
  });
  return map;
}

function escCsv(val) {
  let s = String(val ?? '');
  // Stops spreadsheet apps from running a cell as a formula; numbers/phones pass through.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatPeso(n) {
  return '₱' + (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PX_PER_BAR = 26;

export default function EvaluationReport({ cfg }) {
  useBackGuard();
  useSlotPartialTip();
  const navigate = useNavigate();
  const toast = cfg.admin ? notifyToast : darkToast;

  const [sysSettings, setSysSettings] = useState({ SchoolYear: '2026-2027', Semester: '1st Semester' });
  const [allMentors, setAllMentors] = useState([]);
  const [calendar, setCalendar] = useState(null);   // published calendar events, for the Open / Upcoming / Closed labels
  const [mentorsLoaded, setMentorsLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [ratedFilter, setRatedFilter] = useState('');
  const [prSearch, setPrSearch] = useState('');
  // School Year / Semester filter: '' = the current period; a past period lists the mentors who had an account then
  // (Settings/period-history). The ratings and attendance figures always come from the current period.
  const [year, setYear] = useState('');
  const [periodOptions, setPeriodOptions] = useState(null);          // null until Settings loads: just "Current Semester"
  const [periodHistoryByUser, setPeriodHistoryByUser] = useState(() => new Map());
  const inPeriod = m => !year || !!periodHistoryByUser.get(m.mentorID)?.has(year);
  const [tab, setTab] = useState('rankings');
  const [pendingEdits, setPendingEdits] = useState(() => new Map());   // admin: mentorID -> typed value
  const [saveError, setSaveError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState(null);                  // admin: confirm modal text, null = closed
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // ── Load ──
  async function loadMentors() {
    try {
      const data = await apiRequest('MonitorActivities', 'GET', null, true);
      setAllMentors(data?.mentors || data?.Mentors || []);
    } catch (e) {
      console.error('Failed to load mentors:', e);
      setAllMentors([]);
    }
    setPendingEdits(new Map());
    setMentorsLoaded(true);
  }
  useEffect(() => {
    apiRequest('CalendarEvents', 'GET', null, true).then(setCalendar).catch(() => setCalendar(null));
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest('Settings', 'GET', null, true);
        if (data) setSysSettings(s => ({ ...s, ...data }));
      } catch (e) { /* use defaults */ }
      await loadMentors();
    })();
  }, []);

  // The School Year filter lists the current period and any period the system has already moved past.
  useEffect(() => {
    (async () => {
      try {
        const [settings, rows] = await Promise.all([
          apiRequest('Settings', 'GET', null, true),
          apiRequest('Settings/period-history', 'GET', null, true),
        ]);
        const byUser = new Map();
        const periods = [];
        const seen = new Set();
        (rows || []).forEach(r => {
          const key = `${r.schoolYear}|${r.semester}`;
          if (!byUser.has(r.userID)) byUser.set(r.userID, new Set());
          byUser.get(r.userID).add(key);
          if (!seen.has(key)) { seen.add(key); periods.push({ schoolYear: r.schoolYear, semester: r.semester, key }); }
        });
        periods.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.semester.localeCompare(a.semester));
        setPeriodHistoryByUser(byUser);
        if (!settings) return;
        setPeriodOptions([
          { value: '', label: `${settings.Semester}, SY ${settings.SchoolYear} (Current)` },
          ...periods.filter(p => isPastPeriod(p, settings)).map(p => ({ value: p.key, label: `${p.semester}, SY ${p.schoolYear}` })),
        ]);
      } catch (e) { console.warn('Could not load period history.'); }
    })();
  }, []);

  // Same comparator as ADMIN_/JS/evaluation-ratings.js's buildRankMap — computed once from EVERY mentor (not the
  // filtered/visible rows) so a mentor's rank here always matches Admin's Sessions, both Dashboards' Top 3, and
  // this same mentor's own detail page.
  const rankMap = new Map();
  [...allMentors]
    .filter(m => (m.overallPercent ?? 0) > 0)
    .sort((a, b) => {
      const pctA = a.overallPercent ?? 0, pctB = b.overallPercent ?? 0;
      const doneA = a.completedSessions ?? 0, doneB = b.completedSessions ?? 0;
      const menA = a.menteeCount ?? 0, menB = b.menteeCount ?? 0;
      return pctB - pctA || doneB - doneA || menB - menA
        || `${a.lastName || ''}`.localeCompare(b.lastName || '');
    })
    .forEach((m, i) => rankMap.set(m.mentorID, i + 1));

  // Ranked mentors first (by rank, ascending), unranked (0% overall) last. Shared by the table, exportCSV and
  // printRatings so all three list mentors in the same order.
  function byRank(a, b) {
    const rankA = rankMap.get(a.mentorID), rankB = rankMap.get(b.mentorID);
    if (rankA != null && rankB != null) return rankA - rankB;
    if (rankA != null) return -1;
    if (rankB != null) return 1;
    return `${a.lastName || ''}`.localeCompare(b.lastName || '');
  }

  const slots = slotsForSemester(sysSettings.Semester);
  const isAssemblyNA = s => s === 'Mentoring Assembly' && sysSettings.Semester === '2nd Semester';
  const periodSub = tab === 'rankings'
    ? `Mentor performance rankings for ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}`
    : `Per-session mentee attendance and honorarium computation for ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}`;

  // ── Stats ──
  const total = allMentors.length;
  const rated = allMentors.filter(m => m.evaluationRatingPercent != null).length;
  const ratedValue = `${rated} / ${total}`;

  // ── Top 3 ──
  const top3 = [...allMentors]
    .filter(m => rankMap.has(m.mentorID))
    .sort((a, b) => rankMap.get(a.mentorID) - rankMap.get(b.mentorID))
    .slice(0, 3);
  const top3Content = !mentorsLoaded ? null : !top3.length
    ? <div className="top3-empty">No mentors ranked yet this period.</div>
    : top3.map(m => {
      const rank = rankMap.get(m.mentorID);
      const inits = ((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || '?';
      const dept = [m.departmentName, m.school].filter(Boolean).join(' · ') || '—';
      return (
        <div className="top3-row" key={m.mentorID} onClick={() => navigate(`${cfg.base}/monitoring/detail?id=${m.mentorID}`)}>
          <div className={`top3-rank rank-${rank}`}>{rank}</div>
          <div className="top3-avatar">{inits}</div>
          <div className="top3-info">
            <div className="top3-name">{m.firstName} {m.lastName}</div>
            <div className="top3-dept">{dept}</div>
          </div>
          <div className="top3-pct">{m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</div>
        </div>
      );
    });

  // ── Bar chart ──
  useEffect(() => {
    if (!mentorsLoaded) return;
    let alive = true;
    loadScript('/ADMIN_/JS/chart.umd.min.js').then(() => {
      if (!alive || !canvasRef.current) return;
      const sorted = [...allMentors].sort(byRank);
      const labels = sorted.map(m => `${m.firstName} ${m.lastName}`);
      const values = sorted.map(m => m.overallPercent ?? null);
      const colors = sorted.map(m => m.evaluationRatingPercent != null ? '#2563eb' : '#d1d5db');
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Overall performance score',
            data: values,
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
            barPercentage: 0.5,
            categoryPercentage: 0.8,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { min: 0, max: 100, ticks: { callback: v => `${v}%` } },
            y: { ticks: { autoSkip: false } }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const m = sorted[ctx.dataIndex];
                  return `Overall performance: ${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}${m.evaluationRatingPercent == null ? ' ? Evaluation pending' : ''}`;
                }
              }
            }
          }
        }
      });
    });
    return () => { alive = false; };
  }, [allMentors, mentorsLoaded]);
  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);
  const chartHeight = `${Math.max(220, allMentors.length * PX_PER_BAR)}px`;

  // ── Table ──
  const q = search.trim().toLowerCase();
  const filtered = [...allMentors.filter(m => {
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (!inPeriod(m)) return false;
    const isRated = m.evaluationRatingPercent != null;
    if (ratedFilter === 'rated' && !isRated) return false;
    if (ratedFilter === 'unrated' && isRated) return false;
    return true;
  })].sort(byRank);
  const colCount = 6 + slots.length;

  const tableHead = (
    <>
      <th>Mentors</th>
      {slots.map(s => <th className="td-center" key={s}>{s}</th>)}
      <th className="td-center">Timeliness of Submission (25%)</th>
      <th className="td-center">Completeness of the Required Documents (25%)</th>
      <th className={cfg.admin ? undefined : 'td-center'}>Evaluation Rating (50%)</th>
      <th className="td-center">Performance Score</th>
      <th className="td-center">Rank</th>
    </>
  );

  // Admin: typing in a rating cell
  function onRatingInput(mentorId, val) {
    const mentor = allMentors.find(m => m.mentorID === mentorId);
    const original = mentor?.evaluationRatingPercent ?? '';
    setPendingEdits(prev => {
      const next = new Map(prev);
      if (val === String(original)) next.delete(mentorId); else next.set(mentorId, val);
      return next;
    });
  }

  let tableBody;
  if (!mentorsLoaded) {
    tableBody = <tr><td className="table-empty"><span className="spinner"></span> Loading…</td></tr>;
  } else if (!filtered.length) {
    tableBody = <tr><td colSpan={colCount} className="table-empty">No mentors match the current filter.</td></tr>;
  } else {
    tableBody = filtered.map(m => {
      const rank = rankMap.get(m.mentorID);
      const isRated = m.evaluationRatingPercent != null;
      const hasEdit = pendingEdits.has(m.mentorID);
      const inputVal = hasEdit ? pendingEdits.get(m.mentorID) : (m.evaluationRatingPercent ?? '');
      return (
        <tr key={m.mentorID}>
          <td className="td-primary">{m.firstName} {m.lastName}<div className="mentor-course-progress">{mentorCourseProgress(m).map((label, i) => <span className="mentor-course-chip" title="Completed sessions / required sessions" key={i}>{label}</span>)}</div></td>
          {slots.map(s => (
            <td className="td-center" key={s}>{!isAssemblyNA(s) ? <CheckpointDone m={m} slot={s} empty={<SlotState state={slotState(calendar, s, sysSettings)} />} /> : <span style={{ color: '#6b7280', background: '#f3f4f6' }}>N/A</span>}</td>
          ))}
          <td className="td-center">{m.timelinessPercent == null ? 'Pending' : m.timelinessPercent + '%'}</td>
          <td className="td-center">{m.completenessPercent ?? 0}%</td>
          {cfg.admin ? (
            <td>
              <input type="number" className={`rating-input${hasEdit ? ' dirty' : ''}`} min="0" max="100" step="0.01"
                placeholder="—" value={inputVal} onChange={e => onRatingInput(m.mentorID, e.target.value)} />
            </td>
          ) : (
            <td className="td-center">
              <span className={`rating-chip ${isRated ? 'rated' : 'unrated'}`}>{isRated ? m.evaluationRatingPercent + '%' : 'Not yet rated'}</span>
            </td>
          )}
          <td className="td-primary td-center">{m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</td>
          <td className="td-center">{rank ? `#${rank}` : 'Pending'}</td>
        </tr>
      );
    });
  }

  // ── Admin: save ratings ──
  function openSaveConfirm() {
    setSaveError('');
    const entries = [...pendingEdits.entries()];
    if (!entries.length) return;

    for (const [, val] of entries) {
      if (val === '') continue;
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 100) {
        setSaveError('One or more ratings are invalid — each must be between 0 and 100.');
        return;
      }
    }

    const clearCount = entries.filter(([, val]) => val === '').length;
    const setCount = entries.length - clearCount;
    const parts = [];
    if (setCount) parts.push(`save ${setCount} rating${setCount !== 1 ? 's' : ''}`);
    if (clearCount) parts.push(`clear ${clearCount} rating${clearCount !== 1 ? 's' : ''}`);
    setConfirmMsg(`Are you sure you want to ${parts.join(' and ')} for ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}?`);
  }

  async function saveRatings(entries) {
    for (const [mentorId, val] of entries) {
      if (val === '') {
        const qs = `schoolYear=${encodeURIComponent(sysSettings.SchoolYear)}&semester=${encodeURIComponent(sysSettings.Semester)}`;
        await apiRequest(`EvaluationRatings/${mentorId}?${qs}`, 'DELETE', null, true);
      } else {
        await apiRequest(`EvaluationRatings/${mentorId}`, 'PUT', {
          SchoolYear: sysSettings.SchoolYear,
          Semester:   sysSettings.Semester,
          RatingPct:  parseFloat(val),
        }, true);
      }
    }
    await loadMentors();
  }

  async function confirmSaveRatings() {
    const entries = [...pendingEdits.entries()];
    setSaving(true);
    try {
      await saveRatings(entries);
      setConfirmMsg(null);
      const removed = entries.filter(([, v]) => v === '').length;
      const saved = entries.length - removed;
      const parts = [];
      if (saved) parts.push(`${saved} rating${saved !== 1 ? 's' : ''} saved`);
      if (removed) parts.push(`${removed} rating${removed !== 1 ? 's' : ''} removed`);
      notifyToast(parts.join(', ') + '.', 'success');
    } catch (err) {
      setConfirmMsg(null);
      const msg = err.message || 'Failed to save one or more ratings. Please try again.';
      setSaveError(msg);
      notifyToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── EXPORT ──
  function exportCSV() {
    if (!allMentors.length) { return; }
    const header = ['Mentors', 'Course progress (completed/required)', ...slots, 'Timeliness of Submission (25%)',
                    'Completeness of the Required Documents (25%)', 'Evaluation Rating (50%)',
                    'Performance Score', 'Rank'];

    const sorted = [...allMentors].sort(byRank);

    const rows = sorted.map(m => {
      const rank = rankMap.get(m.mentorID);
      return [
        `${m.lastName}, ${m.firstName}`,
        mentorCourseProgress(m).join('; '),
        ...slots.map(s => !isAssemblyNA(s) ? (checkpointDoneText(m, s) || slotState(calendar, s, sysSettings)) : 'N/A'),
        m.timelinessPercent ?? 'Pending',
        m.completenessPercent ?? 0,
        m.evaluationRatingPercent ?? '',
        m.overallPercent ?? 'Pending',
        rank ? rank : 'Pending',
      ];
    });

    const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `evaluation-ratings-${sysSettings.SchoolYear}-${sysSettings.Semester}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  }

  const portalLabel = cfg.admin ? 'Admin Portal' : 'Head Admin Portal';

  // ── PRINT ── (a standalone printable HTML document opened in a new tab)
  function printRatings() {
    if (!allMentors.length) { toast('No mentors to print.', 'info'); return; }
    const now     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
    const sorted  = [...allMentors].sort(byRank);

    const slotHeaders = slots.map(s => `<th>${s}</th>`).join('');
    const tableRows = sorted.map(m => {
      const rank = rankMap.get(m.mentorID);
      const slotCells = slots.map(s =>
        `<td style="text-align:center">${!isAssemblyNA(s) ? checkpointDoneText(m, s) || slotState(calendar, s, sysSettings) || '&mdash;' : '<span style="color:#6b7280;background:#f3f4f6">N/A</span>'}</td>`
      ).join('');
      return `<tr>
      <td><strong>${escapeHtml(m.lastName)}, ${escapeHtml(m.firstName)}</strong><div style="font-size:10px;font-weight:normal">${mentorCourseLabels(m)}</div></td>
      ${slotCells}
      <td style="text-align:center">${m.timelinessPercent == null ? 'Pending' : m.timelinessPercent + '%'}</td>
      <td style="text-align:center">${m.completenessPercent ?? 0}%</td>
      <td style="text-align:center">${m.evaluationRatingPercent != null ? m.evaluationRatingPercent + '%' : '&mdash;'}</td>
      <td style="text-align:center;font-weight:700">${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}</td>
      <td style="text-align:center">${rank ? '#' + rank : 'Pending'}</td>
    </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Evaluation Ratings — ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}</title>
<style>
@page { margin: 14mm 12mm; size: landscape; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
/* Black borders, #f3f4f6 header fill, no colored blocks — matches the paper form. */
.rpt-header { text-align: center; margin-bottom: 14px; }
.rpt-logo  { height: 50px; margin-bottom: 6px; }
.rpt-dept  { font-size: 11px; font-weight: 600; color: #111; margin-top: 1px; }
.rpt-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #111; margin: 8px 0 4px; }
.rpt-meta  { font-size: 11px; color: #555; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { border: 1px solid #111; padding: 6px 8px; font-size: 9px; font-weight: 700; text-align: center; background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.02em; }
td { border: 1px solid #111; padding: 5px 8px; vertical-align: middle; }
.rpt-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10px; color: #555; text-align: center; }
@media print { button { display: none !important; } }
</style>
</head>
<body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-dept">Student and Alumni Services</div>
  <div class="rpt-dept">Guidance and Counseling Office</div>
  <div class="rpt-title">Mentor Monitoring Program</div>
  <div class="rpt-dept">${sysSettings.Semester}, AY ${sysSettings.SchoolYear}</div>
  <div class="rpt-meta">Generated: ${now} &nbsp;|&nbsp; Total Mentors: ${allMentors.length}</div>
</div>
<table>
  <thead>
    <tr>
      <th>Mentors</th>
      ${slotHeaders}
      <th>Timeliness of Submission (25%)</th>
      <th>Completeness of the Required Documents (25%)</th>
      <th>Evaluation Rating (50%)</th>
      <th>Performance Score</th>
      <th>Rank</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; ${portalLabel} &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1200,height=820');
    if (!w) { toast('Please allow pop-ups for this page to open the print report.'); return; }
    w.document.write(html);
    w.document.close();
  }

  // ── PROGRAM REPORT TAB ──
  // Digitizes the paper "Mentoring Program Report" Guidance & Counseling fills out by hand to compute each
  // mentor's honorarium. Reuses the mentor list the Rankings tab already fetched (no separate API call).
  const prQ = prSearch.trim().toLowerCase();
  const prFiltered = allMentors.filter(m => {
    if (!inPeriod(m)) return false;
    if (!prQ) return true;
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    const dept = (m.departmentName || '').toLowerCase();
    return name.includes(prQ) || dept.includes(prQ);
  });
  // Groups by DepartmentName (blank/null -> "Unassigned", sorted last).
  const prGroups = new Map();
  prFiltered.forEach(m => {
    const dept = (m.departmentName || '').trim() || 'Unassigned';
    if (!prGroups.has(dept)) prGroups.set(dept, []);
    prGroups.get(dept).push(m);
  });
  const prDeptNames = [...prGroups.keys()].sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  // The client's own confirmed formula: sum the attendee count across every checkpoint this semester, then
  // multiply by ₱50. A checkpoint with no logged session at all counts as 0 here.
  function programReportRow(m) {
    const slotAttendance = parseSlotAttendance(m.slotAttendance);
    const counts = slots.map(s => !isAssemblyNA(s) ? slotAttendance.get(s) || 0 : null);
    const sum    = counts.reduce((a, b) => a + b, 0);
    return { counts, sum, amount: sum * 50 };
  }
  const sessionsLabel = sysSettings.Semester === '2nd Semester' ? 5 : 6;
  const prTotalShown = prDeptNames.reduce((n, d) => n + prGroups.get(d).length, 0);
  const prSummary = prFiltered.reduce((totals, mentor) => {
    const { sum, amount } = programReportRow(mentor);
    totals.attendance += sum;
    totals.mentors += amount > 0 ? 1 : 0;
    totals.amount += amount;
    return totals;
  }, { attendance: 0, mentors: 0, amount: 0 });

  const prHead = (
    <>
      <th>College Department</th>
      <th className="pr-center">#</th>
      <th>Mentors</th>
      <th className="pr-center">Number of Mentees</th>
      {slots.map(s => <th className="pr-center" key={s}>{s}</th>)}
      <th className="pr-center">No. of Mentees for {sessionsLabel} sessions</th>
      <th className="pr-center">Total Amount for {sessionsLabel} sessions (×₱50)</th>
    </>
  );

  // Flat list, not grouped rows — department shows as its own column per mentor. Still sorted by department then
  // last name for a sensible reading order; numbering stays continuous.
  let prBody;
  if (!mentorsLoaded) prBody = <tr><td className="table-empty"><span className="spinner"></span> Loading…</td></tr>;
  else if (!prTotalShown) prBody = <tr><td colSpan={colCount} className="table-empty">No mentors match the current filter.</td></tr>;
  else {
    let n = 0;
    prBody = prDeptNames.map(dept => {
      const rows = [...prGroups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || ''));
      return rows.map(m => {
        n++;
        const { counts, sum, amount } = programReportRow(m);
        return (
          <tr key={m.mentorID}>
            <td>{dept}</td>
            <td className="pr-center">{n}</td>
            <td className="td-primary">{m.firstName} {m.lastName}</td>
            <td className="pr-center">{m.menteeCount ?? 0}</td>
            {counts.map((c, i) => <td className="pr-center" key={i} style={c === null ? { color: '#6b7280', background: '#f3f4f6' } : undefined}>{c === null ? 'N/A' : c}</td>)}
            <td className="pr-center td-primary">{sum}</td>
            <td className="pr-center pr-amount">{formatPeso(amount)}</td>
          </tr>
        );
      });
    });
  }

  function exportProgramReportCSV() {
    if (!allMentors.length) { return; }
    const header = ['College Department', '#', 'Mentors', 'Number of Mentees', ...slots,
                    `No. of Mentees for ${sessionsLabel} sessions`, `Total Amount for ${sessionsLabel} sessions`];
    const rows = [];
    let n = 0;
    prDeptNames.forEach(dept => {
      const list = [...prGroups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || ''));
      list.forEach(m => {
        n++;
        const { counts, sum, amount } = programReportRow(m);
        rows.push([dept, n, `${m.lastName}, ${m.firstName}`, m.menteeCount ?? 0, ...counts.map(c => c === null ? 'N/A' : c), sum, amount.toFixed(2)]);
      });
    });

    const csv  = [header, ...rows].map(r => r.map(escCsv).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mentoring-program-report-${sysSettings.SchoolYear}-${sysSettings.Semester}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  }

  function printProgramReport() {
    if (!allMentors.length) { toast('No mentors to print.', 'info'); return; }
    const now     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const logoUrl = `${window.location.origin}/IMAGES/FAITH-Colleges-Logo.png`;
    const slotHeaders = slots.map(s => `<th>${s}</th>`).join('');

    let n = 0;
    let grandTotal = 0;
    const bodyRows = prDeptNames.map(dept => {
      const list = [...prGroups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || ''));
      return list.map(m => {
        n++;
        const { counts, sum, amount } = programReportRow(m);
        grandTotal += amount;
        const countCells = counts.map(c => `<td style="text-align:center;${c === null ? 'color:#6b7280;background:#f3f4f6' : ''}">${c === null ? 'N/A' : c}</td>`).join('');
        return `<tr>
        <td>${escapeHtml(dept)}</td>
        <td style="text-align:center">${n}</td>
        <td><strong>${escapeHtml(m.lastName)}, ${escapeHtml(m.firstName)}</strong></td>
        <td style="text-align:center">${m.menteeCount ?? 0}</td>
        ${countCells}
        <td style="text-align:center;font-weight:700">${sum}</td>
        <td style="text-align:center;font-weight:700">${formatPeso(amount)}</td>
      </tr>`;
      }).join('');
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Mentoring Program Report — ${sysSettings.Semester}, SY ${sysSettings.SchoolYear}</title>
<style>
@page { margin: 14mm 12mm; size: landscape; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
/* Black borders, #f3f4f6 header fill, no colored blocks — matches the paper form. */
.rpt-header { text-align: center; margin-bottom: 14px; }
.rpt-logo  { height: 50px; margin-bottom: 6px; }
.rpt-dept  { font-size: 11px; font-weight: 600; color: #111; margin-top: 1px; }
.rpt-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #111; margin: 8px 0 4px; }
.rpt-meta  { font-size: 11px; color: #555; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { border: 1px solid #111; padding: 6px 8px; font-size: 9px; font-weight: 700; text-align: center; background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.02em; }
td { border: 1px solid #111; padding: 5px 8px; vertical-align: middle; }
.rpt-grand { text-align: right; font-size: 12px; font-weight: 700; color: #111; margin-top: 10px; }
.rpt-footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 10px; color: #555; text-align: center; }
@media print { button { display: none !important; } }
</style>
</head>
<body>
<div class="rpt-header">
  <img src="${logoUrl}" class="rpt-logo" onerror="this.style.display='none'"/>
  <div class="rpt-dept">Student and Alumni Services</div>
  <div class="rpt-dept">Guidance and Counseling Office</div>
  <div class="rpt-title">Mentoring Program Report</div>
  <div class="rpt-dept">${sysSettings.Semester}, AY ${sysSettings.SchoolYear}</div>
  <div class="rpt-meta">Generated: ${now} &nbsp;|&nbsp; Total Mentors: ${allMentors.length}</div>
</div>
<table>
  <thead>
    <tr>
      <th>College Department</th>
      <th>#</th>
      <th>Mentors</th>
      <th>Number of Mentees</th>
      ${slotHeaders}
      <th>No. of Mentees for ${sessionsLabel} sessions</th>
      <th>Total Amount for ${sessionsLabel} sessions</th>
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
<div class="rpt-grand">Grand Total: ${formatPeso(grandTotal)}</div>
<div class="rpt-footer">FAITH Colleges Mentoring System &mdash; ${portalLabel} &mdash; ${now}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1200,height=820');
    if (!w) { toast('Please allow pop-ups for this page to open the print report.'); return; }
    w.document.write(html);
    w.document.close();
  }

  // ── Tabs: sliding pill + animated panel switch ──
  const tabsRef = useRef(null);
  const pillRef = useRef(null);
  const rankingsRef = useRef(null);
  const prRef = useRef(null);
  const wrapRef = useRef(null);
  const switchState = useRef({ token: 0, timer: null });
  const firstTab = useRef(true);

  // Positioned from the active tab's own box, so it follows any label/width change; the first placement skips the
  // transition so it doesn't fly in from the left.
  const movePill = instant => {
    const bar = tabsRef.current;
    const active = bar && bar.querySelector('.rpt-tab.active');
    const pill = pillRef.current;
    if (!bar || !active || !pill || !active.offsetWidth) return;
    if (!bar.classList.contains('has-pill')) { bar.classList.add('has-pill'); instant = true; }
    if (instant) pill.style.transition = 'none';
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
    if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
  };
  useLayoutEffect(() => {
    movePill(true);
    const onResize = () => movePill(true);
    window.addEventListener('load', onResize);
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(true));
    // the page is hidden until its styles load; place the pill again once visible
    const id = setTimeout(() => movePill(true), 150);
    return () => { window.removeEventListener('load', onResize); window.removeEventListener('resize', onResize); clearTimeout(id); };
  }, []);

  useLayoutEffect(() => { if (prRef.current) prRef.current.style.display = 'none'; }, []);

  function switchRptTab(next) {
    setTab(next);
    const isRankings = next === 'rankings';
    const rankingsPanel = rankingsRef.current, prPanel = prRef.current, wrap = wrapRef.current;
    const shown = isRankings ? rankingsPanel : prPanel;
    const hidden = isRankings ? prPanel : rankingsPanel;
    requestAnimationFrame(() => movePill());

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st = switchState.current;
    const token = (st.token = st.token + 1);
    clearTimeout(st.timer);
    const finish = () => {
      wrap.style.height = '';
      wrap.classList.remove('rpt-switching');
      hidden.style.display = 'none';
      hidden.classList.remove('rpt-panel-out');
      shown.style.display = '';
      shown.classList.remove('rpt-panel-out');
    };

    // Already showing this panel (e.g. the user flipped back mid-switch).
    if (shown.style.display !== 'none' && hidden.style.display === 'none') { finish(); return; }
    if (reduce) { finish(); return; }

    // Hold the current height, fade the old panel out, then grow/shrink to the new panel's height while it
    // fades in.
    const fromH = wrap.offsetHeight;
    wrap.style.height = fromH + 'px';
    wrap.classList.add('rpt-switching');
    shown.classList.remove('rpt-panel-out');
    if (hidden.style.display === 'none') { hidden.style.display = ''; }
    hidden.classList.add('rpt-panel-out');

    st.timer = setTimeout(() => {
      if (token !== st.token) return;
      hidden.style.display = 'none';
      hidden.classList.remove('rpt-panel-out');
      shown.style.display = '';
      wrap.style.height = 'auto';
      const toH = wrap.offsetHeight;
      wrap.style.height = fromH + 'px';
      void wrap.offsetHeight;
      shown.classList.remove('rpt-panel-in');
      void shown.offsetWidth;
      shown.classList.add('rpt-panel-in');
      wrap.style.height = toH + 'px';
      st.timer = setTimeout(() => {
        if (token !== st.token) return;
        wrap.style.height = '';
        wrap.classList.remove('rpt-switching');
      }, 340);
    }, 140);
  }
  useEffect(() => () => clearTimeout(switchState.current.timer), []);

  return (
    <Page id={cfg.pageId}>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Mentoring Program Report</h1>
              <p id="periodSub">{periodSub}</p>
            </div>
          </div>
          {/* ── Tabs: Rankings vs Program Report — both read the same mentor list fetched on load. ── */}
          <div className="rpt-tabs" role="tablist" ref={tabsRef}>
            {<span className="rpt-tab-pill" aria-hidden="true" ref={pillRef}></span>}
            <button type="button" className={tab === 'rankings' ? 'rpt-tab active' : 'rpt-tab'} id="tabBtn-rankings" role="tab" aria-selected={tab === 'rankings' ? 'true' : 'false'} onClick={() => switchRptTab("rankings")}>Rankings</button>
            {' '}
            <button type="button" className={tab === 'programreport' ? 'rpt-tab active' : 'rpt-tab'} id="tabBtn-programreport" role="tab" aria-selected={tab === 'programreport' ? 'true' : 'false'} onClick={() => switchRptTab("programreport")}>Program Report</button>
          </div>
          <div className="rpt-panels" ref={wrapRef}>
            <div id="tabPanel-rankings" ref={rankingsRef}>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top-row">
                    <div className="stat-label">Mentors with Evaluation Ratings</div>
                    <div className="stat-icon green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                  </div>
                  <div className="stat-value" id="ratedValue">{ratedValue}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-top-row">
                    <div className="stat-label">Evaluation Ratings Pending</div>
                    <div className="stat-icon amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                  </div>
                  <div className="stat-value" id="unratedValue">{total - rated}</div>
                </div>
              </div>
              <div className="ranking-columns">
                <div className="chart-card">
                  <div className="chart-card-header">
                    <div className="table-card-title">Mentor Performance Scores</div>
                    <div className="table-card-sub">
                      Overall score: Timeliness (25%) + Completeness (25%) + Evaluation (50%). Gray bars: evaluation pending.
                    </div>
                  </div>
                  <div className="chart-body">
                    <div className="chart-scroll-inner" id="chartScrollInner" style={{ height: chartHeight }}>
                      <canvas id="ratingsChart" ref={canvasRef}></canvas>
                    </div>
                  </div>
                </div>
                <div className="top3-card">
                  <div className="chart-card-header">
                    <div className="table-card-title">Top 3 Performers</div>
                    <div className="table-card-sub">Ranked by current overall performance score</div>
                  </div>
                  <div className="top3-list" id="top3List">{top3Content}</div>
                </div>
              </div>
              <div className="table-card">
                <div className="table-card-head">
                  <div>
                    <span className="table-card-title">All Mentors</span>
                    {' '}
                    <span className="table-card-count" id="showingCount">{`(${filtered.length})`}</span>
                  </div>
                  <div className="table-card-actions">
                    <button className="btn-export" id="exportBtn" onClick={exportCSV} title="Download as CSV">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {' '}
                      Export CSV
                    </button>
                    {' '}
                    <button className="btn-primary" id="printBtn" onClick={printRatings} title="Open printable report">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                      {' '}
                      Print
                    </button>
                    {' '}
                    {cfg.admin ? <button className="btn-save" id="saveAllBtn" onClick={openSaveConfirm} disabled={pendingEdits.size === 0}>
                Save Changes <span className="save-count" id="saveCount" style={{ display: pendingEdits.size > 0 ? '' : 'none' }}>{pendingEdits.size > 0 ? pendingEdits.size : ''}</span>
              </button> : null}
                  </div>
                </div>
                <div className="filter-bar">
                  <div className="search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {' '}
                    <input type="text" id="searchInput" placeholder="Search mentor name…" value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  {<Select className="filter-select" id="ratedFilter" value={ratedFilter} onChange={e => setRatedFilter(e.target.value)}><option value="">All Mentors</option><option value="rated">Rated</option><option value="unrated">Not Yet Rated</option></Select>}
                  {<Select className="filter-select" id="schoolYearFilter" value={year} onChange={e => setYear(e.target.value)}>{periodOptions ? periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : <option value="">Current Semester</option>}</Select>}
                </div>
                {cfg.admin ? <div className="form-error" id="saveAllError" style={{ display: saveError ? '' : 'none', margin: '0 22px 14px' }}>{saveError}</div> : null}
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr id="tableHeadRow">{tableHead}</tr>
                    </thead>
                    <tbody id="tableBody">{tableBody}</tbody>
                  </table>
                </div>
              </div>
            </div>
            <div id="tabPanel-programreport" style={undefined} ref={prRef}>
              <div className="table-card">
                <div className="table-card-head">
                  <div>
                    <span className="table-card-title">Mentoring Program Report</span>
                    {' '}
                    <span className="table-card-count" id="prShowingCount">{`(${prTotalShown})`}</span>
                  </div>
                  <div className="table-card-actions">
                    <button className="btn-export" onClick={exportProgramReportCSV} title="Download as CSV">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {' '}
                      Export CSV
                    </button>
                    {' '}
                    <button className="btn-primary" onClick={printProgramReport} title="Open printable report">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                      {' '}
                      Print
                    </button>
                  </div>
                </div>
                <div className="filter-bar">
                  <div className="search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {' '}
                    <input type="text" id="prSearchInput" placeholder="Search mentor name or department…" value={prSearch} onChange={e => setPrSearch(e.target.value)} />
                  </div>
                  {<Select className="filter-select" id="prSchoolYearFilter" value={year} onChange={e => setYear(e.target.value)}>{periodOptions ? periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>) : <option value="">Current Semester</option>}</Select>}
                </div>
                <div className="pr-summary" aria-label="Program report summary">
                  <div className="pr-summary-item">
                    <span className="pr-summary-label">Payable attendance instances</span>
                    {' '}
                    <strong className="pr-summary-value" id="prSummaryAttendance">{prSummary.attendance.toLocaleString('en-PH')}</strong>
                  </div>
                  <div className="pr-summary-item">
                    <span className="pr-summary-label">Mentors with honorarium</span>
                    {' '}
                    <strong className="pr-summary-value" id="prSummaryMentors">{prSummary.mentors.toLocaleString('en-PH')}</strong>
                  </div>
                  <div className="pr-summary-item">
                    <span className="pr-summary-label">Estimated total honorarium</span>
                    {' '}
                    <strong className="pr-summary-value" id="prSummaryAmount">{formatPeso(prSummary.amount)}</strong>
                    {' '}
                    <span className="pr-summary-note">At ₱50 per attendance instance</span>
                  </div>
                </div>
                <div className="table-wrapper">
                  <table id="prTable">
                    <thead>
                      <tr id="prTableHeadRow">{prHead}</tr>
                    </thead>
                    <tbody id="prTableBody">{prBody}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>
      {/* ── Confirm Rating Updates Modal ─────────────────────────── */}
      {cfg.admin ? <Overlay open={confirmMsg !== null} className="info-modal-overlay" activeClass={null} display="flex" id="confirmSaveOverlay">
        <div className="info-modal">
          <div className="info-modal-icon confirm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" /></svg>
          </div>
          <h3 className="info-modal-title">Save Rating Updates</h3>
          <p className="info-modal-message" id="confirmSaveMessage">{confirmMsg ?? 'Are you sure you want to save these changes?'}</p>
          <div className="info-modal-actions">
            <button className="btn-outline" onClick={() => setConfirmMsg(null)}>Cancel</button>
            <button className="btn-save" id="confirmSaveBtn" onClick={confirmSaveRatings} disabled={saving}>{saving ? 'Saving...' : 'Confirm & Save'}</button>
          </div>
        </div>
      </Overlay> : null}
    </Page>
  );
}
