/* ============================================================
   ASTRA MENTOR — my-activities.js
   ============================================================ */

const AVATAR_COLORS = 6;
let allMentees = [];

function avatarIndex(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % AVATAR_COLORS;
}

function initials(first, last) {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Shared by the mentor's own hero badge (mentorTierGroup) and mentee
// attendance cards (the backend's own unrelated tier system).
function statusClass(status) {
  switch (status) {
    case 'Excellent':       return 'excellent';
    case 'On Track':        return 'on-track';
    case 'Behind':          return 'behind';
    case 'At Risk':         return 'at-risk';
    case 'Critical':        return 'critical';
    case 'No Sessions':     return 'no-sessions';
    case 'Needs Attention': return 'needsattention';
    case 'Not Started':     return 'notstarted';
    default:                return '';
  }
}

// Groups the 4 backend tiers into the 4 the UI shows (Not Started = zero sessions this semester).
function mentorTierGroup(status, completedSessions) {
  const s = status || 'Critical';
  if ((s === 'Critical' || s === 'Behind') && (completedSessions ?? 0) === 0)
    return 'Not Started';
  if (s === 'Critical' || s === 'Behind') return 'Needs Attention';
  return s; // 'On Track' | 'Excellent'
}

// ── Status tooltip ────────────────────────────────────────────
function updateStatusTooltip() {
  const box = document.querySelector('.info-tip-box');
  if (box) box.innerHTML = '<div class="info-tip-title">Semester Completion</div><div class="info-tip-row">Checkpoints attended out of the semester requirement. Regular and make-up sessions for the same checkpoint count once.</div>';
}

// Describes your real overall score: Timeliness 25% + Completeness 25% + Evaluation Rating 50%.
function updateHeroTooltip() {
  const box = document.getElementById('heroTipBox');
  if (!box) return;

  box.innerHTML = `
    <div class="info-tip-title">Overall Performance Guide</div>
    <div class="info-tip-row">Timeliness (25%) + Completeness (25%) + Evaluation Rating (50%).</div>
    <div class="info-tip-row"><span class="info-dot excellent"></span><span><strong>Excellent</strong> — ≥80%</span></div>
    <div class="info-tip-row"><span class="info-dot on-track"></span><span><strong>On Track</strong> — 50–79%</span></div>
    <div class="info-tip-row"><span class="info-dot needsattention"></span><span><strong>Needs Attention</strong> — below 50%, with at least one completed session</span></div>
    <div class="info-tip-row"><span class="info-dot notstarted"></span><span><strong>Not Started</strong> — no completed sessions this semester</span></div>`;
}

// ── Hero ──────────────────────────────────────────────────────
function renderHero(data) {
  const idx  = avatarIndex((data.firstName ?? '') + (data.lastName ?? ''));
  const done = data.completedSessions ?? data.CompletedSessions ?? 0;
  const tier = mentorTierGroup(data.progressStatus ?? '', done);
  const sc   = statusClass(tier);

  const avatarEl = document.getElementById('heroAvatar');
  avatarEl.textContent = initials(data.firstName, data.lastName);
  avatarEl.className   = `hero-avatar av-${idx}`;

  document.getElementById('heroName').textContent = `${data.firstName} ${data.lastName}`;

  const items = [
    data.departmentName && `<div class="hero-meta-item"><i class="ti ti-building"></i>${data.departmentName}</div>`,
    data.school         && `<div class="hero-meta-item"><i class="ti ti-school"></i>${data.school}</div>`,
    data.email          && `<div class="hero-meta-item"><i class="ti ti-mail"></i>${data.email}</div>`,
    data.contactNumber  && `<div class="hero-meta-item"><i class="ti ti-phone"></i>${data.contactNumber}</div>`,
  ].filter(Boolean).join('');

  document.getElementById('heroMeta').innerHTML = items;

  if (data.progressStatus) {
    const badge = document.getElementById('heroBadge');
    badge.textContent = `Overall Performance: ${tier}`;
    badge.className   = `hero-badge ${sc}`;
  }

  updateHeroTooltip();
}


// ── Mentee cards (section accordion) ─────────────────────────
function menteeCardHtml(m) {
  const attended  = m.sessionsAttended ?? 0;
  const total     = m.totalSessions    ?? 0;
  const pct       = Math.round(AttendanceMetrics.percent(attended, total));
  const sc = '';
  const idx       = avatarIndex((m.firstName ?? '') + (m.lastName ?? ''));
  const ini       = initials(m.firstName, m.lastName);
  const isDropOut = m.isDropOut || false;

  return `
    <div class="mentee-card ${sc}${isDropOut ? ' is-dropout' : ''}">
      <div class="mcard-identity">
        <div class="mcard-avatar av-${idx}">${ini}</div>
        <div class="mcard-name-block">
          <div class="mcard-name">${m.firstName} ${m.lastName}</div>
          <div class="mcard-sub">${m.studentNumber ?? '—'}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${isDropOut ? '<span class="mcard-dropout-chip">Dropped Out</span>' : ''}
          </div>
        </div>
      </div>
      <div class="mcard-body">
        <div class="mcard-att">
          <div class="mcard-att-label">
            <span>Semester Completion</span>
            <span class="mcard-att-count">${attended} / ${total > 0 ? total : '—'}</span>
          </div>
          <div class="mcard-bar-bg" role="progressbar" aria-label="Semester completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${attended} of ${total} required checkpoints attended">
            <div class="mcard-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="mcard-date">
          <i class="ti ti-calendar-event"></i>
          <span>${m.lastAttended ? `Last attended: ${fmtDate(m.lastAttended)}` : 'No attendance recorded'}</span>
        </div>
      </div>
    </div>`;
}

function renderMentees(mentees) {
  const accordion = document.getElementById('sectionAccordion');
  const countEl   = document.getElementById('menteeCount');
  countEl.textContent = `(${mentees.length})`;

  if (!mentees.length) {
    accordion.innerHTML = '<div class="mentee-card-empty">No mentees match the current filter.</div>';
    return;
  }

  const sectionMap = {};
  mentees.forEach(m => {
    const sec = m.sectionCode || 'Unassigned';
    if (!sectionMap[sec]) sectionMap[sec] = [];
    sectionMap[sec].push(m);
  });

  const sections = Object.entries(sectionMap).sort(([a], [b]) => a.localeCompare(b));

  // Single section — skip accordion, render cards directly
  if (sections.length === 1) {
    accordion.innerHTML = `
      <div class="mentee-cards-grid single-section">
        ${[...sections[0][1]].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)).map(menteeCardHtml).join('')}
      </div>`;
    return;
  }

  // Multiple sections — accordion with open state preserved
  const openSections = new Set(
    [...accordion.querySelectorAll('.sec-group.open')].map(el => el.dataset.section)
  );

  accordion.innerHTML = sections
    .map(([section, list], idx) => {
      const isOpen = openSections.has(section);
      return `
        <div class="sec-group sec-color-${idx % 5} ${isOpen ? 'open' : ''}" data-section="${section}">
          <button class="sec-group-header" onclick="toggleSection(this)" type="button">
            <div class="sec-group-left">
              <span class="sec-group-name">${section}</span>
              <span class="sec-group-count">${list.length} mentee${list.length !== 1 ? 's' : ''}</span>
            </div>
            <svg class="sec-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="sec-group-body">
            <div class="mentee-cards-grid">
              ${[...list].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)).map(menteeCardHtml).join('')}
            </div>
          </div>
        </div>`;
    }).join('');
}

function toggleSection(btn) {
  btn.closest('.sec-group').classList.toggle('open');
}

function applyMenteeFilters() {
  const q      = document.getElementById('menteeSearch').value.trim().toLowerCase();
  const status = document.getElementById('menteeStatusFilter').value;

  const filtered = allMentees.filter(m => {
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    if (q && !name.includes(q))    return false;
    if (status && AttendanceMetrics.completion(m.sessionsAttended ?? 0, m.totalSessions ?? 0) !== status) return false;
    return true;
  });

  renderMentees(filtered);
}

// ── Load ──────────────────────────────────────────────────────
async function loadActivities() {
  const mentorId = getSession()?.user?.userID;
  if (!mentorId) {
    window.location.href = '/LOGIN/HTML/login.html';
    return;
  }

  try {
    const data = await apiRequest(`MonitorActivities/${mentorId}`, 'GET', null, true);

    renderHero(data);

    allMentees = data.mentees ?? [];

    updateStatusTooltip();

    renderMentees(allMentees);
  } catch (e) {
    console.error('Failed to load activities:', e);
    document.getElementById('heroName').textContent = 'Failed to load activity data.';
    document.getElementById('sectionAccordion').innerHTML =
      '<div class="mentee-card-empty">Could not load mentees. Please refresh.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuth('mentor');

  window.history.pushState(null, '', window.location.href);
  window.addEventListener('popstate', () => {
    if (!isLoggedIn()) window.location.href = '/LOGIN/HTML/login.html';
    else window.history.pushState(null, '', window.location.href);
  });

  loadActivities();

  document.getElementById('menteeSearch').addEventListener('input', applyMenteeFilters);
  document.getElementById('menteeStatusFilter').addEventListener('change', applyMenteeFilters);
});

// Native disclosure controls support mouse, touch, and keyboard.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('details.attendance-help[open]').forEach(help => {
    help.open = false;
    help.querySelector('summary').focus();
  });
});
document.addEventListener('click', event => {
  document.querySelectorAll('details.attendance-help[open]').forEach(help => {
    if (!help.contains(event.target)) help.open = false;
  });
});
