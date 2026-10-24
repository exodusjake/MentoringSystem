import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page, { usePage } from '../../app/Page.jsx';
import { ConfirmX } from '../../components/ConfirmX.jsx';
import Empty from '../../components/Empty.jsx';
import { showToast } from '../../components/Notify.jsx';
import Select from '../../components/Select.jsx';
import { apiRequest } from '../../lib/api.js';
import { showDarkToast } from '../../lib/darkToast.js';
import {
  buildProgramReportGroups, byRank, checkpointDone, configureReports, exportProgramReportCSV, exportRatingsCsv, formatPeso,
  mentorCourseProgress, printProgramReport, printRatingsReport, programReportRow, slotsForSemester,
} from '../../lib/evaluationReports.js';
import { loadScript } from '../../lib/loadScript.js';
import { useStayOnBack } from '../mentor/useStayOnBack.js';

// Mentoring Program Report (Head: HEAD/HTML/evaluation-ratings.html, read-only; Admin:
// ADMIN_/HTML/evaluation-ratings.html, where the Evaluation Rating column is editable with one
// Save button). Two tabs: Rankings (chart, top 3, ranked table) and Program Report (honorarium).
const VARIANTS = {
  head: { page: 'HEAD/evaluation-ratings', portal: 'Head Admin', detail: '/head/monitoring', editable: false, toast: msg => showDarkToast(msg) },
  admin: { page: 'ADMIN_/evaluation-ratings', portal: 'Admin', detail: '/admin/monitoring', editable: true, toast: (msg, type) => showToast(msg, type) },
};
const PX_PER_BAR = 26;
const CHART_JS = '/ADMIN_/JS/chart.umd.min.js';
const HIDDEN = { display: 'none' };          // constant: React never re-applies it after the tab switch takes over
const CONTENTS = { display: 'contents' };    // the panels' wrapper is layout-neutral until the first switch
const NA_STYLE = { color: '#6b7280', background: '#f3f4f6' };

export default function ProgramReport({ variant }) {
  return (
    <Page id={VARIANTS[variant].page}>
      <ReportBody variant={variant} />
    </Page>
  );
}

function ReportBody({ variant }) {
  const v = VARIANTS[variant];
  useStayOnBack();
  const navigate = useNavigate();
  const { ready } = usePage();
  const [settings, setSettings] = useState(null);
  const [data, setData] = useState({ state: 'loading', mentors: [], rankMap: new Map() });
  const [q, setQ] = useState('');
  const [rated, setRated] = useState('');
  const [prQ, setPrQ] = useState('');
  const [tab, setTab] = useState('rankings');
  // Admin: mentorID -> edited rating (string, as typed) not yet saved.
  const [pending, setPending] = useState(() => new Map());
  const [saveError, setSaveError] = useState('');
  const [confirm, setConfirm] = useState({ open: false, message: 'Are you sure you want to save these changes?', busy: false });
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const tabsRef = useRef(null);
  const pillRef = useRef(null);
  const [pillOn, setPillOn] = useState(false);
  const wrapRef = useRef(null);
  const rankingsRef = useRef(null);
  const prRef = useRef(null);
  const switchState = useRef({ token: 0, timer: null });

  const sys = settings || { SchoolYear: '2026-2027', Semester: '1st Semester' };
  configureReports({ settings: sys, prQuery: prQ.trim().toLowerCase(), portalLabel: v.portal, toast: v.toast });

  async function loadMentors() {
    let mentors;
    try {
      const res = await apiRequest('MonitorActivities', 'GET', null, true);
      mentors = res?.mentors || res?.Mentors || [];
    } catch (e) {
      console.error('Failed to load mentors:', e);
      mentors = [];
    }
    const rankMap = configureReports({ mentors });
    setPending(new Map());
    setData({ state: 'ok', mentors, rankMap: new Map(rankMap) });
  }
  useEffect(() => {
    (async () => {
      let s = { SchoolYear: '2026-2027', Semester: '1st Semester' };
      try {
        const res = await apiRequest('Settings', 'GET', null, true);
        if (res) s = { ...s, ...res };
      } catch { /* defaults */ }
      setSettings(s);
      configureReports({ settings: s });
      await loadMentors();
    })();
    return () => { chartRef.current?.destroy(); clearTimeout(switchState.current.timer); };
  }, []);
  const { mentors, rankMap } = data;
  configureReports({ mentors });
  const loaded = data.state === 'ok';
  const slots = slotsForSemester(sys.Semester);
  const na = s => s === 'Mentoring Assembly' && sys.Semester === '2nd Semester';

  // ── Chart (horizontal bars, ranked order; gray = evaluation pending) ──
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    loadScript(CHART_JS).then(() => {
      if (cancelled || !canvasRef.current) return;
      const sorted = [...mentors].sort(byRank);
      chartRef.current?.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: sorted.map(m => `${m.firstName} ${m.lastName}`),
          datasets: [{
            label: 'Overall performance score',
            data: sorted.map(m => m.overallPercent ?? null),
            backgroundColor: sorted.map(m => m.evaluationRatingPercent != null ? '#2563eb' : '#d1d5db'),
            borderRadius: 4, borderSkipped: false, barPercentage: 0.5, categoryPercentage: 0.8,
          }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          scales: { x: { min: 0, max: 100, ticks: { callback: val => `${val}%` } }, y: { ticks: { autoSkip: false } } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const m = sorted[ctx.dataIndex];
                  return `Overall performance: ${m.overallPercent == null ? 'Pending' : m.overallPercent + '%'}${m.evaluationRatingPercent == null ? ' ? Evaluation pending' : ''}`;
                },
              },
            },
          },
        },
      });
    });
    return () => { cancelled = true; };
  }, [data]);

  // ── "Done x/y" cells: hovering shows which courses finished the checkpoint ──
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
    return () => {
      document.removeEventListener('mouseover', onOver);
      window.removeEventListener('scroll', onScroll, true);
      document.getElementById('slotPartialTip')?.remove();
    };
  }, []);

  // ── Sliding pill behind the active tab (placed instantly on load/resize/font load) ──
  function movePill(instant) {
    const bar = tabsRef.current;
    const active = bar?.querySelector('.rpt-tab.active');
    if (!bar || !active || !active.offsetWidth) return;
    const pill = pillRef.current;
    if (!pill) { setPillOn(true); return; }
    if (instant) pill.style.transition = 'none';
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
    if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
  }
  useLayoutEffect(() => { if (ready) movePill(true); }, [ready, pillOn]);
  useEffect(() => {
    const instant = () => movePill(true);
    window.addEventListener('load', instant);
    window.addEventListener('resize', instant);
    document.fonts?.ready.then(instant);
    // The tabs change width when the web font arrives (it can land after fonts.ready resolved).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(instant) : null;
    tabsRef.current?.querySelectorAll('.rpt-tab').forEach(t => ro?.observe(t));
    return () => { window.removeEventListener('load', instant); window.removeEventListener('resize', instant); ro?.disconnect(); };
  }, []);

  function switchTab(next) {
    const isRankings = next === 'rankings';
    setTab(next);
    requestAnimationFrame(() => movePill());
    const shown = isRankings ? rankingsRef.current : prRef.current;
    const hidden = isRankings ? prRef.current : rankingsRef.current;
    // The panels get a wrapper (once) so the switch animates the page height.
    const wrap = wrapRef.current;
    if (!wrap.classList.contains('rpt-panels')) { wrap.style.display = ''; wrap.className = 'rpt-panels'; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const st = switchState.current;
    const token = ++st.token;
    clearTimeout(st.timer);
    const finish = () => {
      wrap.style.height = '';
      wrap.classList.remove('rpt-switching');
      hidden.style.display = 'none';
      hidden.classList.remove('rpt-panel-out');
      shown.style.display = '';
      shown.classList.remove('rpt-panel-out');
    };
    if (shown.style.display !== 'none' && hidden.style.display === 'none') { finish(); return; }
    if (reduce) { finish(); return; }
    // Hold the height, fade the old panel out, then grow/shrink to the new one while it fades in.
    const fromH = wrap.offsetHeight;
    wrap.style.height = fromH + 'px';
    wrap.classList.add('rpt-switching');
    shown.classList.remove('rpt-panel-out');
    if (hidden.style.display === 'none') hidden.style.display = '';
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

  // ── Admin: staged rating edits, saved together after a confirmation ──
  function onRatingInput(m, val) {
    const original = String(m.evaluationRatingPercent ?? '');
    setPending(p => {
      const n = new Map(p);
      if (val === original) n.delete(m.mentorID); else n.set(m.mentorID, val);
      return n;
    });
  }
  function openSaveConfirm() {
    setSaveError('');
    const entries = [...pending.entries()];
    if (!entries.length) return;
    // A blank entry means "clear this rating" and skips the numeric check.
    for (const [, val] of entries) {
      if (val === '') continue;
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 100) { setSaveError('One or more ratings are invalid — each must be between 0 and 100.'); return; }
    }
    const clearCount = entries.filter(([, val]) => val === '').length;
    const setCount = entries.length - clearCount;
    const parts = [];
    if (setCount) parts.push(`save ${setCount} rating${setCount !== 1 ? 's' : ''}`);
    if (clearCount) parts.push(`clear ${clearCount} rating${clearCount !== 1 ? 's' : ''}`);
    setConfirm(c => ({ ...c, open: true, message: `Are you sure you want to ${parts.join(' and ')} for ${sys.Semester}, SY ${sys.SchoolYear}?` }));
  }
  async function confirmSave() {
    const entries = [...pending.entries()];
    setConfirm(c => ({ ...c, busy: true }));
    try {
      for (const [mentorId, val] of entries) {
        if (val === '') {
          const qs = `schoolYear=${encodeURIComponent(sys.SchoolYear)}&semester=${encodeURIComponent(sys.Semester)}`;
          await apiRequest(`EvaluationRatings/${mentorId}?${qs}`, 'DELETE', null, true);
        } else {
          await apiRequest(`EvaluationRatings/${mentorId}`, 'PUT', { SchoolYear: sys.SchoolYear, Semester: sys.Semester, RatingPct: parseFloat(val) }, true);
        }
      }
      await loadMentors();
      setConfirm(c => ({ ...c, open: false, busy: false }));
      const removed = entries.filter(([, x]) => x === '').length;
      const saved = entries.length - removed;
      const parts = [];
      if (saved) parts.push(`${saved} rating${saved !== 1 ? 's' : ''} saved`);
      if (removed) parts.push(`${removed} rating${removed !== 1 ? 's' : ''} removed`);
      showToast(parts.join(', ') + '.', 'success');
    } catch (err) {
      const msg = err.message || 'Failed to save one or more ratings. Please try again.';
      setConfirm(c => ({ ...c, open: false, busy: false }));
      setSaveError(msg);
      showToast(msg, 'error');
    }
  }

  // ── Derived views ──
  const query = q.trim().toLowerCase();
  const tableRows = [...mentors.filter(m => {
    if (query && !`${m.firstName} ${m.lastName}`.toLowerCase().includes(query)) return false;
    const isRated = m.evaluationRatingPercent != null;
    if (rated === 'rated' && !isRated) return false;
    if (rated === 'unrated' && isRated) return false;
    return true;
  })].sort(byRank);
  const top3 = [...mentors].filter(m => rankMap.has(m.mentorID)).sort((a, b) => rankMap.get(a.mentorID) - rankMap.get(b.mentorID)).slice(0, 3);
  const pr = loaded ? buildProgramReportGroups() : null;
  const prSummary = pr ? pr.filtered.reduce((t, m) => {
    const { sum, amount } = programReportRow(m, slots);
    return { attendance: t.attendance + sum, mentors: t.mentors + (amount > 0 ? 1 : 0), amount: t.amount + amount };
  }, { attendance: 0, mentors: 0, amount: 0 }) : { attendance: 0, mentors: 0, amount: 0 };
  const prTotal = pr ? pr.deptNames.reduce((n, d) => n + pr.groups.get(d).length, 0) : 0;
  const sessionsN = sys.Semester === '2nd Semester' ? 5 : 6;

  const periodSub = !settings ? 'Mentor performance rankings for the current semester'
    : tab === 'rankings' ? `Mentor performance rankings for ${sys.Semester}, SY ${sys.SchoolYear}`
      : `Per-checkpoint mentee attendance and honorarium computation for ${sys.Semester}, SY ${sys.SchoolYear}`;
  const ratedCount = mentors.filter(m => m.evaluationRatingPercent != null).length;
  const pct = x => x == null ? 'Pending' : x + '%';

  const courseChips = m => (
    <div className="mentor-course-progress">{mentorCourseProgress(m).map((label, i) => <span key={i} className="mentor-course-chip" title="Completed checkpoints / required checkpoints">{label}</span>)}</div>
  );
  const doneCell = (m, s) => {
    const d = checkpointDone(m, s);
    if (!d) return <span className="slot-empty">—</span>;
    if (!d.pending.length) return 'Done';
    return <span className="slot-partial" data-done={d.done.join(', ') || 'None'} data-pending={d.pending.join(', ')}>{d.text}</span>;
  };
  const exportBtns = (onCsv, onPrint, ids) => (
    <div className="table-card-actions">
      <button className="btn-export" id={ids ? 'exportBtn' : undefined} onClick={onCsv} title="Download as CSV">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        {' '}Export CSV
      </button>
      {' '}
      <button className="btn-primary" id={ids ? 'printBtn' : undefined} onClick={onPrint} title="Open printable report">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
        {' '}Print
      </button>
      {ids && v.editable && <>{' '}
        <button className="btn-save" id="saveAllBtn" onClick={openSaveConfirm} disabled={pending.size === 0}>
          {'Save Changes '}<span className="save-count" id="saveCount" style={pending.size ? undefined : HIDDEN}>{pending.size || ''}</span>
        </button></>}
    </div>
  );
  const searchBox = (id, placeholder, value, set) => (
    <div className="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      {' '}
      <input type="text" id={id} placeholder={placeholder} value={value} onChange={e => set(e.target.value)} />
    </div>
  );
  const loadingRow = <tr><Empty as="td" className="table-empty"><span className="spinner"></span>{' '}Loading…</Empty></tr>;

  return (
    <>
      <div className="main-wrapper">
        <main className="page-content">
          <div className="page-header">
            <div>
              <h1>Mentoring Program Report</h1>
              {' '}
              <p id="periodSub">{periodSub}</p>
            </div>
          </div>
          {' '}
          <div className={'rpt-tabs' + (pillOn ? ' has-pill' : '')} role="tablist" ref={tabsRef}>
            {pillOn && <span className="rpt-tab-pill" aria-hidden="true" ref={pillRef}></span>}
            <button type="button" className={'rpt-tab' + (tab === 'rankings' ? ' active' : '')} id="tabBtn-rankings" role="tab" aria-selected={String(tab === 'rankings')} onClick={() => switchTab('rankings')}>Rankings</button>
            {' '}
            <button type="button" className={'rpt-tab' + (tab === 'programreport' ? ' active' : '')} id="tabBtn-programreport" role="tab" aria-selected={String(tab === 'programreport')} onClick={() => switchTab('programreport')}>Program Report</button>
          </div>
          {' '}
          <div ref={wrapRef} style={CONTENTS}>
            <div id="tabPanel-rankings" ref={rankingsRef}>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top-row">
                    <div className="stat-label">Mentors with Evaluation Ratings</div>
                    {' '}
                    <div className="stat-icon green">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                    </div>
                  </div>
                  {' '}
                  <div className="stat-value" id="ratedValue">{`${ratedCount} / ${mentors.length}`}</div>
                </div>
                {' '}
                <div className="stat-card">
                  <div className="stat-top-row">
                    <div className="stat-label">Evaluation Ratings Pending</div>
                    {' '}
                    <div className="stat-icon amber">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    </div>
                  </div>
                  {' '}
                  <div className="stat-value" id="unratedValue">{mentors.length - ratedCount}</div>
                </div>
              </div>
              {' '}
              <div className="ranking-columns">
                <div className="chart-card">
                  <div className="chart-card-header">
                    <div className="table-card-title">Mentor Performance Scores</div>
                    {' '}
                    <div className="table-card-sub">Overall score: Timeliness (25%) + Completeness (25%) + Evaluation (50%). Gray bars: evaluation pending.</div>
                  </div>
                  {' '}
                  <div className="chart-body">
                    <div className="chart-scroll-inner" id="chartScrollInner" style={loaded ? { height: `${Math.max(220, mentors.length * PX_PER_BAR)}px` } : undefined}>
                      <canvas id="ratingsChart" ref={canvasRef}></canvas>
                    </div>
                  </div>
                </div>
                {' '}
                <div className="top3-card">
                  <div className="chart-card-header">
                    <div className="table-card-title">Top 3 Performers</div>
                    {' '}
                    <div className="table-card-sub">Ranked by current overall performance score</div>
                  </div>
                  {' '}
                  <div className="top3-list" id="top3List">
                    {loaded && (top3.length ? top3.map(m => {
                      const rank = rankMap.get(m.mentorID);
                      return (
                        <div key={m.mentorID} className="top3-row" onClick={() => navigate(`${v.detail}/${m.mentorID}`)}>
                          <div className={`top3-rank rank-${rank}`}>{rank}</div>
                          {' '}
                          <div className="top3-avatar">{((m.firstName?.[0] || '') + (m.lastName?.[0] || '')).toUpperCase() || '?'}</div>
                          {' '}
                          <div className="top3-info">
                            <div className="top3-name">{`${m.firstName} ${m.lastName}`}</div>
                            {' '}
                            <div className="top3-dept">{[m.departmentName, m.school].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                          {' '}
                          <div className="top3-pct">{pct(m.overallPercent)}</div>
                        </div>
                      );
                    }) : <Empty className="top3-empty">No mentors ranked yet this period.</Empty>)}
                  </div>
                </div>
              </div>
              {' '}
              <div className="table-card">
                <div className="table-card-head">
                  <div>
                    <span className="table-card-title">All Mentors</span>
                    {' '}
                    <span className="table-card-count" id="showingCount">{loaded ? `(${tableRows.length})` : ''}</span>
                  </div>
                  {' '}
                  {exportBtns(() => exportRatingsCsv(), () => printRatingsReport(), true)}
                </div>
                {' '}
                <div className="filter-bar">
                  {searchBox('searchInput', 'Search mentor name…', q, setQ)}
                  {' '}
                  <Select className="filter-select" id="ratedFilter" value={rated} onChange={e => setRated(e.target.value)}>
                    <option value="">All Mentors</option>
                    <option value="rated">Rated</option>
                    <option value="unrated">Not Yet Rated</option>
                  </Select>
                </div>
                {' '}
                {v.editable && <><div className="form-error" id="saveAllError" style={saveError ? { margin: '0 22px 14px' } : { display: 'none', margin: '0 22px 14px' }}>{saveError}</div>{' '}</>}
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr id="tableHeadRow">{loaded && <>
                        <th>Mentors</th>
                        {slots.map(s => <th key={s} className="td-center">{s}</th>)}
                        <th className="td-center">Timeliness of Submission (25%)</th>
                        <th className="td-center">Completeness of the Required Documents (25%)</th>
                        <th className={v.editable ? undefined : 'td-center'}>Evaluation Rating (50%)</th>
                        <th className="td-center">Performance Score</th>
                        <th className="td-center">Rank</th>
                      </>}</tr>
                    </thead>
                    {' '}
                    <tbody id="tableBody">
                      {!loaded ? loadingRow
                        : !tableRows.length ? <tr><Empty as="td" key={`none-${q}-${rated}`} colSpan={6 + slots.length} className="table-empty">No mentors match the current filter.</Empty></tr>
                          : tableRows.map(m => {
                            const rank = rankMap.get(m.mentorID);
                            const isRated = m.evaluationRatingPercent != null;
                            const hasEdit = pending.has(m.mentorID);
                            return (
                              <tr key={m.mentorID}>
                                <td className="td-primary">{`${m.firstName} ${m.lastName}`}{courseChips(m)}</td>
                                {slots.map(s => <td key={s} className="td-center">{!na(s) ? doneCell(m, s) : <span style={NA_STYLE}>N/A</span>}</td>)}
                                <td className="td-center">{pct(m.timelinessPercent)}</td>
                                <td className="td-center">{`${m.completenessPercent ?? 0}%`}</td>
                                {v.editable
                                  ? <td>
                                    <input type="number" className={'rating-input' + (hasEdit ? ' dirty' : '')} min="0" max="100" step="0.01" placeholder="—"
                                      value={hasEdit ? pending.get(m.mentorID) : (m.evaluationRatingPercent ?? '')} onChange={e => onRatingInput(m, e.target.value)} />
                                  </td>
                                  : <td className="td-center">
                                    <span className={`rating-chip ${isRated ? 'rated' : 'unrated'}`}>{isRated ? m.evaluationRatingPercent + '%' : 'Not yet rated'}</span>
                                  </td>}
                                <td className="td-primary td-center">{pct(m.overallPercent)}</td>
                                <td className="td-center">{rank ? `#${rank}` : '—'}</td>
                              </tr>
                            );
                          })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {' '}
            <div id="tabPanel-programreport" ref={prRef} style={HIDDEN}>
              <div className="table-card">
                <div className="table-card-head">
                  <div>
                    <span className="table-card-title">Mentoring Program Report</span>
                    {' '}
                    <span className="table-card-count" id="prShowingCount">{loaded ? `(${prTotal})` : ''}</span>
                  </div>
                  {' '}
                  {exportBtns(() => exportProgramReportCSV(), () => printProgramReport(), false)}
                </div>
                {' '}
                <div className="filter-bar">
                  {searchBox('prSearchInput', 'Search mentor name or department…', prQ, setPrQ)}
                </div>
                {' '}
                <div className="pr-summary" aria-label="Program report summary">
                  <div className="pr-summary-item">
                    <span className="pr-summary-label">Payable attendance instances</span>
                    {' '}
                    <strong className="pr-summary-value" id="prSummaryAttendance">{prSummary.attendance.toLocaleString('en-PH')}</strong>
                  </div>
                  {' '}
                  <div className="pr-summary-item">
                    <span className="pr-summary-label">Mentors with honorarium</span>
                    {' '}
                    <strong className="pr-summary-value" id="prSummaryMentors">{prSummary.mentors.toLocaleString('en-PH')}</strong>
                  </div>
                  {' '}
                  <div className="pr-summary-item">
                    <span className="pr-summary-label">Estimated total honorarium</span>
                    {' '}
                    <strong className="pr-summary-value" id="prSummaryAmount">{formatPeso(prSummary.amount)}</strong>
                    {' '}
                    <span className="pr-summary-note">At ₱50 per attendance instance</span>
                  </div>
                </div>
                {' '}
                <div className="table-wrapper">
                  <table id="prTable">
                    <thead>
                      <tr id="prTableHeadRow">{loaded && <>
                        <th>College Department</th>
                        <th className="pr-center">#</th>
                        <th>Mentors</th>
                        <th className="pr-center">Number of Mentees</th>
                        {slots.map(s => <th key={s} className="pr-center">{s}</th>)}
                        <th className="pr-center">{`No. of Mentees for ${sessionsN} sessions`}</th>
                        <th className="pr-center">{`Total Amount for ${sessionsN} sessions (×₱50)`}</th>
                      </>}</tr>
                    </thead>
                    {' '}
                    <tbody id="prTableBody">
                      {!loaded ? loadingRow
                        : !prTotal ? <tr><Empty as="td" key={`none-${prQ}`} colSpan={6 + slots.length} className="table-empty">No mentors match the current filter.</Empty></tr>
                          : (() => {
                            // Flat list sorted by department, then last name; numbering is continuous.
                            let n = 0;
                            return pr.deptNames.flatMap(dept => [...pr.groups.get(dept)].sort((a, b) => `${a.lastName || ''}`.localeCompare(b.lastName || '')).map(m => {
                              n++;
                              const { counts, sum, amount } = programReportRow(m, slots);
                              return (
                                <tr key={m.mentorID}>
                                  <td>{dept}</td>
                                  <td className="pr-center">{n}</td>
                                  <td className="td-primary">{`${m.firstName} ${m.lastName}`}</td>
                                  <td className="pr-center">{m.menteeCount ?? 0}</td>
                                  {counts.map((c, i) => <td key={i} className="pr-center" style={c === null ? NA_STYLE : undefined}>{c === null ? 'N/A' : c}</td>)}
                                  <td className="pr-center td-primary">{sum}</td>
                                  <td className="pr-center pr-amount">{formatPeso(amount)}</td>
                                </tr>
                              );
                            }));
                          })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
        {' '}
        <footer>
          <p>&copy; 2026 AstraMentoring. All rights reserved.</p>
        </footer>
      </div>

      {v.editable && (
        /* Confirm Rating Updates Modal (with the original confirm-dialog restyle) */
        <div className="info-modal-overlay" id="confirmSaveOverlay" style={{ display: confirm.open ? 'flex' : 'none' }}>
          <div className="info-modal" data-astra-confirm="1">
            <div className="info-modal-icon confirm" data-ac="icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" /></svg>
            </div>
            {' '}
            <h3 className="info-modal-title" data-ac="title">Save Rating Updates</h3>
            {' '}
            <p className="info-modal-message" id="confirmSaveMessage" data-ac="body">{confirm.message}</p>
            {' '}
            <div className="info-modal-actions" data-ac="actions">
              <button className="btn-outline" onClick={() => setConfirm(c => ({ ...c, open: false }))}>Cancel</button>
              {' '}
              <button className="btn-save" id="confirmSaveBtn" onClick={confirmSave} disabled={confirm.busy}>{confirm.busy ? 'Saving...' : 'Confirm & Save'}</button>
            </div>
            <ConfirmX onClick={() => setConfirm(c => ({ ...c, open: false }))} />
          </div>
        </div>
      )}
    </>
  );
}
