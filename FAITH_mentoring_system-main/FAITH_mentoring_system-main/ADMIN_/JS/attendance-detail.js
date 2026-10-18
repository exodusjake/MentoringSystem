// ===== ATTENDANCE DETAIL (mentor → sections → mentees) =====

let mentorId         = null;
let allMentees       = [];
let activeStatusFilter = null;
let semesterRequired = 0;

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('admin');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  const params = new URLSearchParams(window.location.search);
  mentorId = parseInt(params.get('id'), 10);
  if (!mentorId) { window.location.href = 'attendance-logs.html'; return; }

  loadDetail();

  document.getElementById('sectionSearch').addEventListener('input', applyAllFilters);
});

// ── LOAD ──────────────────────────────────────────────────────
async function loadDetail() {
  try {
    const data = await apiRequest(`AttendanceLogs/${mentorId}/mentees`, 'GET', null, true);
    renderHero(data.mentor);
    allMentees = data.mentees || [];
    semesterRequired = data.requiredSessions ?? 0;
    buildStatusTooltip(semesterRequired);
    renderSections(allMentees);
  } catch (e) {
    console.error('Error loading attendance detail:', e);
    showErrorModal('Failed to load data. Please refresh.');
  }
}

// ── STATUS TOOLTIP ─────────────────────────────────────────────
function buildStatusTooltip(n) {
  const box = document.getElementById('attTipBox');
  if (!box) return;

  box.innerHTML = `<div class="att-tip-title">Semester Completion</div><div class="att-tip-row">Checkpoints attended out of ${n} required this semester. Regular and make-up sessions for the same checkpoint count once. Present/Absent records are available in View History.</div>`;
}

// ── FILTERS ───────────────────────────────────────────────────
function applyAllFilters() {
  const q = document.getElementById('sectionSearch').value.trim().toLowerCase();

  let filtered = [...allMentees];

  if (q) {
    filtered = filtered.filter(m =>
      (m.sectionCode || '').toLowerCase().includes(q) ||
      (m.course      || '').toLowerCase().includes(q)
    );
  }

  if (activeStatusFilter) {
    filtered = filtered.filter(m => {
      return AttendanceMetrics.completion(m.presentCount, semesterRequired) === activeStatusFilter;
    });
  }

  renderSections(filtered);
}

function setStatusFilter(value) {
  activeStatusFilter = value || null;
  applyAllFilters();
}

function resetAllFilters() {
  document.getElementById('sectionSearch').value = '';
  document.getElementById('statusFilter').value  = '';
  activeStatusFilter = null;
  renderSections(allMentees);
}

// ── MENTOR HERO ───────────────────────────────────────────────
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function renderHero(mentor) {
  if (!mentor) return;
  const initials = ((mentor.firstName?.[0] || '') + (mentor.lastName?.[0] || '')).toUpperCase();
  const avIdx    = avatarIndex(mentor.firstName + mentor.lastName);

  document.getElementById('heroAvatar').textContent = initials;
  document.getElementById('heroAvatar').className   = `hero-avatar av-${avIdx}`;
  document.getElementById('heroName').textContent   = `${mentor.firstName} ${mentor.lastName}`;

  // Same icon-per-item layout as the Mentor Monitoring detail hero
  // (School, Department, Email), for visual consistency across every
  // "mentor detail" page in the system.
  document.getElementById('heroMeta').innerHTML = [
    mentor.school     && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>${escHtml(mentor.school)}</span>`,
    mentor.department && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>${escHtml(mentor.department)}</span>`,
    mentor.email      && `<span class="hero-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${escHtml(mentor.email)}</span>`,
  ].filter(Boolean).join('') || 'Mentor';

  // Only the section codes (e.g. "BS EE 1A") — the plain course codes
  // ("BS EE") were redundant, just a substring of the section right next
  // to them.
  const sectionTags = (mentor.sections || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(s => `<span class="hero-section-tag">${escHtml(s)}</span>`).join('');

  const heroInfo = document.querySelector('.hero-info');
  const existing = heroInfo.querySelector('.hero-tags');
  if (existing) existing.remove();
  if (sectionTags) {
    heroInfo.insertAdjacentHTML('beforeend', `<div class="hero-tags">${sectionTags}</div>`);
  }

  document.title = `${mentor.firstName} ${mentor.lastName} — Attendance`;
}

// ── GROUP MENTEES BY SECTION, RENDER SECTION CARDS ────────────
// Presentation fallback only; existing grouping keys and membership stay intact.
function attendanceGroupHeading(group) {
  if (group.sectionCode && group.sectionCode !== '—') return group.sectionCode;
  const courses = [...new Set(group.mentees.map(m => (m.course || '').trim()))];
  return courses.length === 1 && courses[0] && courses[0] !== '—' ? courses[0] : 'Unspecified group';
}

function renderSections(mentees) {
  const grid    = document.getElementById('sectionCardsGrid');
  const countEl = document.getElementById('sectionCount');

  if (!mentees.length) {
    countEl.textContent = '0 groups';
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No mentees assigned to this mentor.</div>`;
    return;
  }

  // Group by sectionCode
  const sectionMap = {};
  mentees.forEach(m => {
    const key = m.sectionCode || '—';
    if (!sectionMap[key]) {
      sectionMap[key] = {
        sectionCode: key,
        course:      m.course    || '—',
        yearLevel:   m.yearLevel || '',
        mentees:     []
      };
    }
    sectionMap[key].mentees.push(m);
  });

  const sections = Object.values(sectionMap).sort((a, b) =>
    a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true, sensitivity: 'base' }));
  countEl.textContent = `${sections.length} group${sections.length !== 1 ? 's' : ''}`;

  function secStats(sec) {
    const totalAtt  = sec.mentees.reduce((s, m) => s + m.totalSessions, 0);
    const present   = sec.mentees.reduce((s, m) => s + m.presentCount,  0);
    const rate      = clampPercent(totalAtt > 0 ? Math.round(present / totalAtt * 100) : 0);
    const rateCls   = rate >= 80 ? 'rate-high' : rate >= 60 ? 'rate-mid' : totalAtt === 0 ? 'rate-none' : 'rate-low';
    const barCls    = rate >= 80 ? 'full'       : rate >= 60 ? 'partial'  : 'none';
    const courseStr = [sec.course, sec.yearLevel].filter(Boolean).join(' · ');
    return { rate, rateCls, barCls, courseStr, totalAtt };
  }

  // Single section — show cards directly, no accordion toggle
  if (sections.length === 1) {
    const sec = sections[0];
    const { rate, rateCls, barCls, courseStr, totalAtt } = secStats(sec);
    const mCount = sec.mentees.length;
    grid.innerHTML = `
      <div class="section-card open">
        <div class="sec-header sec-header-static">
          <div class="sec-left">
            <div class="sec-code">${escHtml(attendanceGroupHeading(sec))}</div>
            <div class="sec-course">${escHtml(courseStr)}</div>
          </div>
          <div class="sec-right">
            <div class="sec-meta">${mCount} mentee${mCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="sec-body" style="display:block;">
          <div class="sec-mentee-grid">
            ${[...sec.mentees].sort((a, b) => `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`)).map(m => renderMenteeCard(m)).join('')}
          </div>
        </div>
      </div>`;
    return;
  }

  // Multiple sections — accordion
  grid.innerHTML = sections.map((sec, idx) => {
    const { rate, rateCls, barCls, courseStr, totalAtt } = secStats(sec);
    const mCount = sec.mentees.length;

    return `
      <div class="section-card" id="sec-${idx}">
        <div class="sec-header" onclick="toggleSection(${idx})">
          <div class="sec-left">
            <div class="sec-code">${escHtml(attendanceGroupHeading(sec))}</div>
            <div class="sec-course">${escHtml(courseStr)}</div>
          </div>
          <div class="sec-right">
            <div class="sec-meta">${mCount} mentee${mCount !== 1 ? 's' : ''}</div>
            <svg class="sec-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
        <div class="sec-body" id="sec-body-${idx}">
          <div class="sec-mentee-grid">
            ${[...sec.mentees].sort((a, b) => `${a.menteeLastName} ${a.menteeFirstName}`.localeCompare(`${b.menteeLastName} ${b.menteeFirstName}`)).map(m => renderMenteeCard(m)).join('')}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── INDIVIDUAL MENTEE CARD (inside section) ───────────────────
function menteeStatusInfo(rate, total) {
  return AttendanceMetrics.status(rate, total);
}

function renderMenteeCard(m) {
  const initials = ((m.menteeFirstName?.[0] || '') + (m.menteeLastName?.[0] || '')).toUpperCase();
  const avClass  = `av-${avatarIndex(m.menteeFirstName + m.menteeLastName)}`;
  const total    = semesterRequired;
  const present  = m.presentCount;
  const rate     = total > 0 ? Math.round(present / total * 100) : 0;
  const rateCls  = 'completion-rate';
  const barCls   = 'attendance-neutral';

  return `
    <div class="mentee-card${m.isDropOut ? ' att-dropout' : ''}" onclick="openHistory(${m.menteeID}, '${escapeAttr(m.menteeFirstName)}', '${escapeAttr(m.menteeLastName)}', '${escapeAttr(m.studentNumber || '')}')">
      <div class="mnc-avatar ${avClass}">${escHtml(initials)}</div>
      <div class="mnc-main">
        <div class="mnc-top-row">
          <div class="mnc-info">
            <div class="mnc-name">${escHtml(m.menteeFirstName)} ${escHtml(m.menteeLastName)}${m.isDropOut ? ' <span class="mnc-dropout-chip">Drop Out</span>' : ''}</div>
            <div class="mnc-sub">${escHtml(m.studentNumber || '—')}</div>
          </div>
        </div>
        <div class="mnc-bottom-row">
          <span class="mnc-cta">View History <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
        <div class="mnc-rate-label">Semester Completion <span>${present}/${total} attended</span></div>
        <div class="mnc-bar-row">
          <div class="mnc-bar-bg">
            <div class="mnc-bar-fill ${barCls}" style="width:${rate}%"></div>
          </div>
          <span class="mnc-rate-txt ${rateCls}">${total === 0 ? '—' : rate + '%'}</span>
        </div>
      </div>
    </div>`;
}

// ── TOGGLE SECTION EXPAND / COLLAPSE ─────────────────────────
function toggleSection(idx) {
  const body    = document.getElementById(`sec-body-${idx}`);
  const card    = document.getElementById(`sec-${idx}`);
  const chevron = card.querySelector('.sec-chevron');

  const isOpen = card.classList.contains('open');
  card.classList.toggle('open', !isOpen);
  chevron.classList.toggle('rotated', !isOpen);
  body.style.display = isOpen ? 'none' : 'block';
}

// ── ATTENDANCE HISTORY MODAL ──────────────────────────────────
async function openHistory(menteeId, firstName, lastName, studentNumber) {
  event.stopPropagation(); // prevent section toggle when clicking mentee card

  const menteeName = `${firstName} ${lastName}`;
  document.getElementById('hmTitle').textContent   = menteeName;
  document.getElementById('hmSub').textContent     = studentNumber || 'Mentee';
  document.getElementById('historyContent').innerHTML = `<div class="tab-loading"><span class="spinner"></span> Loading…</div>`;
  document.getElementById('historyOverlay').style.display = 'flex';

  try {
    const history = await apiRequest(
      `AttendanceLogs/mentee/${menteeId}?mentorId=${mentorId}`, 'GET', null, true);
    renderHistory(history);
  } catch (e) {
    document.getElementById('historyContent').innerHTML =
      `<div class="tab-loading">Failed to load history.</div>`;
  }
}

function renderHistory(records) {
  if (!records.length) {
    document.getElementById('historyContent').innerHTML =
      `<div class="tab-loading">No sessions found for this mentee.</div>`;
    return;
  }

  // Exclude future scheduled sessions — attendance hasn't been recorded yet
  const relevant = records.filter(r => r.sessionStatus !== 'Scheduled');

  if (!relevant.length) {
    document.getElementById('historyContent').innerHTML =
      `<div class="tab-loading">No completed sessions for this mentee yet.</div>`;
    return;
  }

  const rows = relevant.map(r => {
    const date = r.sessionDate
      ? new Date(r.sessionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const attendance = LogsheetData.attendanceState({...r, attendanceRecorded:r.isRecorded});
    const badge = !r.isRecorded
      ? `<span class="badge-unrecorded">Not recorded</span>`
      : attendance === true
        ? `<span class="badge-present">Present</span>`
        : attendance === false
          ? `<span class="badge-absent">Absent</span>`
          : `<span class="badge-unrecorded">Unverified</span>`;
    const statusCls      = (r.sessionStatus || '').toLowerCase();
    // A makeup row now carries its own real checkpoint (Sessions.SlotName,
    // propagated from its Availability booking) when one was picked at
    // posting time — shown alongside the "Make-up" tag instead of hiding
    // which checkpoint it was actually a catch-up for.
    const sessionNumCell = r.isMakeup
      ? `<span class="session-num session-num-makeup">Make-up${r.slotName ? `: ${r.slotName}` : ''}</span>`
      : `<span class="session-num">${r.slotName || 'Session'}</span>`;

    return `
      <tr>
        <td>${sessionNumCell}</td>
        <td class="td-primary td-nowrap">${date}</td>
        <td><span class="badge-status ${statusCls}">${r.sessionStatus}</span></td>
        <td>${badge}</td>
      </tr>`;
  }).join('');

  document.getElementById('historyContent').innerHTML = `
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Session</th><th>Date</th><th>Status</th><th>Attendance</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function closeHistory(e) {
  if (e && e.target !== document.getElementById('historyOverlay')) return;
  document.getElementById('historyOverlay').style.display = 'none';
}

// ── HELPERS ───────────────────────────────────────────────────
function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 6;
}

// For a '...' JS string inside an onclick="..." attribute.
function escapeAttr(str) {
  return escHtml(String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showErrorModal(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorModal').style.display = 'flex';
}
function hideErrorModal() { document.getElementById('errorModal').style.display = 'none'; }
