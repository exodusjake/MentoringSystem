const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadDashboard(file) {
  const nodes = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!nodes.has(id)) {
        nodes.set(id, {
          textContent: '',
          innerHTML: '',
          style: {},
          classList: { toggle() {} },
        });
      }
      return nodes.get(id);
    },
  };
  const context = vm.createContext({
    document,
    window: { addEventListener() {}, history: { pushState() {} } },
    console,
    Date,
    Intl,
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return { context, nodes };
}

const stats = {
  activeMentees: 1,
  assigned: 3,
  totalMentees: 6,
  unassigned: 2,
  droppedOut: 1,
  menteeStatusDistribution: {
    Excellent: 1,
    OnTrack: 1,
    NoSessions: 1,
  },
};

test('Admin engagement displays same-semester attendance and assigned counts', () => {
  const { context, nodes } = loadDashboard('ADMIN_/JS/dashboard.js');
  context.renderEngagement(stats);

  assert.equal(nodes.get('engAssignedActive').textContent, 1);
  assert.equal(nodes.get('engAssignedInactive').textContent, 2);
  assert.equal(nodes.get('engUnassigned').textContent, 2);
  assert.equal(nodes.get('engDroppedOut').textContent, 1);
  assert.match(nodes.get('engTipBox').innerHTML, /completed checkpoints this semester/);
  assert.match(nodes.get('engTipBox').innerHTML, /Future checkpoints are not counted/);
});

test('Head engagement uses the same current-period stats and definitions', () => {
  const { context, nodes } = loadDashboard('HEAD/JS/dashboard.js');
  context.renderMenteeEngagement(stats);

  assert.equal(nodes.get('engActive').textContent, 1);
  assert.equal(nodes.get('engInactive').textContent, 2);
  assert.equal(nodes.get('totalMentees').textContent, 6);
  assert.equal(nodes.get('totalDropout').textContent, 1);
});

test('SQL migration scopes assigned, unassigned, active, and tiers to the same cohort', () => {
  const sql = fs.readFileSync('SQL/fix_dashboard_mentee_engagement_period.sql', 'utf8');

  assert.match(sql, /mm\.IsActive = 1 AND u\.IsActive = 1 AND u\.Role = 'Mentee'\s+AND me\.IsDropOut = 0/);
  assert.match(sql, /fn_MenteeCheckpointAttendance\(@SchoolYear, @Semester\) c[\s\S]*?WHERE c\.Attended = 1/);
  assert.match(sql, /COUNT\(c\.CheckpointKey\)[\s\S]*?SUM\(c\.Attended\)[\s\S]*?mp\.IsDropOut = 0/);
  assert.doesNotMatch(sql, /me\.School IS NOT NULL/);
});

test('Admin dashboard mentee-engagement groups deep-link into User Management in the same tab', () => {
  const html = fs.readFileSync('ADMIN_/HTML/dashboard.html', 'utf8');
  const links = [...html.matchAll(/<a[^>]*href="user-management\.html\?role=Mentee&amp;engagement=([a-z-]+)"[^>]*>/g)];
  const keys = links.map(m => m[1]);

  assert.deepEqual(keys.sort(), [
    'all', 'attended', 'dropped-out', 'excellent', 'needs-attention',
    'no-attendance', 'no-completed-sessions', 'on-track', 'unassigned',
  ].sort());
  // Same-tab navigation: no target="_blank" (that can hand the new tab to
  // the OS's separately-configured default browser instead of the one the
  // user is already in).
  for (const link of links) {
    assert.doesNotMatch(link[0], /target=/);
  }
  assert.doesNotMatch(html, /<dialog/);
});

test('User Management mentee roster filter keeps attendance, assignment, and dropout groups distinct', () => {
  const nodes = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '' });
      return nodes.get(id);
    },
    querySelector() { return null; },
  };
  const context = vm.createContext({
    document,
    window: { addEventListener() {}, location: { search: '' } },
    console,
    URLSearchParams,
  });
  vm.runInContext(fs.readFileSync('ADMIN_/JS/user-management.js', 'utf8'), context);

  const mentees = [
    { userID: 1, role: 'Mentee' }, { userID: 2, role: 'Mentee' }, { userID: 3, role: 'Mentee' },
    { userID: 4, role: 'Mentee' }, { userID: 5, role: 'Mentee' },
  ];
  const rows = new Map([
    [1, { isAssigned: true, isDropOut: false, sessionsAttended: 1, completedCheckpoints: 1, attendanceStatus: 'Excellent' }],
    [2, { isAssigned: true, isDropOut: false, sessionsAttended: 0, completedCheckpoints: 2, attendanceStatus: 'Needs Attention' }],
    [3, { isAssigned: true, isDropOut: false, sessionsAttended: 0, completedCheckpoints: 0, attendanceStatus: 'No Completed Sessions' }],
    [4, { isAssigned: false, isDropOut: false, sessionsAttended: 0, completedCheckpoints: 0, attendanceStatus: 'Unassigned' }],
    [5, { isAssigned: true, isDropOut: true, sessionsAttended: 0, completedCheckpoints: 1, attendanceStatus: 'Dropped Out' }],
  ]);
  vm.runInContext('dashboardEngagementByUser = testRows', Object.assign(context, { testRows: rows }));

  vm.runInContext("dashboardEngagementFilter = 'attended'", context);
  assert.deepEqual(mentees.filter(m => context.matchesDashboardEngagement(m)).map(m => m.userID), [1]);
  vm.runInContext("dashboardEngagementFilter = 'no-attendance'", context);
  assert.deepEqual(mentees.filter(m => context.matchesDashboardEngagement(m)).map(m => m.userID), [2, 3]);
  vm.runInContext("dashboardEngagementFilter = 'unassigned'", context);
  assert.deepEqual(mentees.filter(m => context.matchesDashboardEngagement(m)).map(m => m.userID), [4]);
  vm.runInContext("dashboardEngagementFilter = 'dropped-out'", context);
  assert.deepEqual(mentees.filter(m => context.matchesDashboardEngagement(m)).map(m => m.userID), [5]);

  const mentor = { userID: 6, role: 'Mentor' };
  assert.equal(context.matchesDashboardEngagement(mentor), false);
});

test('Admin mentor chart bars navigate to the matching monitoring status filter', () => {
  const { context } = loadDashboard('ADMIN_/JS/dashboard.js');
  let chartConfig;
  context.window.location = { href: '' };
  context.getComputedStyle = () => ({ getPropertyValue: () => '#000' });
  context.Chart = class {
    constructor(_canvas, config) { chartConfig = config; }
  };

  context.renderChart({}, { mentors: [{ progressStatus: 'On Track', completedSessions: 1 }] });
  chartConfig.options.onClick({}, [{ index: 1 }]);

  assert.equal(context.window.location.href, 'sessions.html?status=Needs%20Attention');
});

test('Mentor Monitoring selects only recognized status deep-links', () => {
  const statusSelect = {
    value: '',
    options: ['Not Started', 'Needs Attention', 'On Track', 'Excellent'].map(value => ({ value })),
  };
  const context = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: id => id === 'statusFilter' ? statusSelect : null,
    },
    window: { location: { search: '' }, addEventListener() {} },
    console,
    Date,
    URLSearchParams,
  });
  vm.runInContext(fs.readFileSync('ADMIN_/JS/sessions.js', 'utf8'), context);

  assert.equal(context.applyInitialStatusFilter('?status=Needs%20Attention'), 'Needs Attention');
  statusSelect.value = 'On Track';
  assert.equal(context.applyInitialStatusFilter('?status=Unknown'), 'On Track');
});

test('User Management only fetches the protected roster when a hidden engagement filter is active', async () => {
  const nodes = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '' });
      return nodes.get(id);
    },
  };
  const context = vm.createContext({
    document, window: { addEventListener() {}, location: { search: '' } }, console, URLSearchParams,
  });
  vm.runInContext(fs.readFileSync('ADMIN_/JS/user-management.js', 'utf8'), context);

  let requested = false;
  context.apiRequest = async (...args) => { requested = true; return [{ menteeID: 7, attendanceStatus: 'Excellent' }]; };

  vm.runInContext("dashboardEngagementFilter = ''", context);
  await context.loadDashboardEngagementRows();
  assert.equal(requested, false);

  vm.runInContext("dashboardEngagementFilter = 'excellent'", context);
  await context.loadDashboardEngagementRows();
  assert.equal(requested, true);
  const byUser = vm.runInContext('dashboardEngagementByUser', context);
  assert.equal(byUser.size, 1);
  assert.equal(byUser.get(7).attendanceStatus, 'Excellent');
});

// Regression: Admin Dashboard links ADMIN_/CSS/dashboard-approved.css, a
// SEPARATE file from ADMIN_/CSS/dashboard.css (which Head Dashboard shares).
// A rule added only to dashboard.css silently never applies on the Admin
// page — this caught exactly that (engagement links rendering with the
// browser's default underline because dashboard-approved.css had no
// text-decoration override for them).
test('every stylesheet Admin Dashboard actually links defines its clickable-card classes', () => {
  const html = fs.readFileSync('ADMIN_/HTML/dashboard.html', 'utf8');
  const sheetPaths = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  const adminCss = sheetPaths
    .filter(p => p.includes('/CSS/') && p.toLowerCase().includes('dashboard'))
    .map(p => p.replace(/^\//, ''));
  assert.ok(adminCss.length > 0, 'expected at least one dashboard stylesheet link');

  const combinedCss = adminCss.map(p => fs.readFileSync(p, 'utf8')).join('\n');
  for (const cls of ['stat-card-link', 'eng-cell-link', 'eng-breakdown-row', 'engagement-link', 'chart-action-item']) {
    const rule = new RegExp('\\.' + cls + '\\s*\\{[^}]*text-decoration:\\s*none', 's');
    assert.match(combinedCss, rule, `.${cls} should set text-decoration: none in ${adminCss.join(', ')}`);
  }
});