const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createBadgePage(pathname = '/MENTOR/HTML/mentor-dashboard.html') {
  const values = new Map();
  const badge = { textContent: '', style: { display: 'none' } };
  const localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const window = { location: { pathname }, addEventListener() {} };
  const document = {
    getElementById: id => id === 'annBadge' ? badge : null,
    createElement: () => ({}),
    head: { appendChild() {} },
  };
  const context = vm.createContext({ window, document, localStorage, console, Date });
  vm.runInContext(fs.readFileSync('apiClient.js', 'utf8'), context);
  return { badge, context, localStorage, window };
}

test('shared badge stores per-user counts, hides zero, and caps the display', () => {
  const { badge, context, localStorage } = createBadgePage();
  context.saveSession('token', 'mentor', { userID: 42 });
  context.updateSidebarAnnBadge(120);
  assert.equal(badge.textContent, '99+');
  assert.equal(badge.style.display, '');
  assert.equal(localStorage.getItem('ann_sidebar_badge_42'), '120');

  context.updateSidebarAnnBadge(0);
  assert.equal(badge.style.display, 'none');
  assert.equal(localStorage.getItem('ann_sidebar_badge_42'), '0');
});

test('opening announcements marks the page read and clears the sidebar badge', async () => {
  const { badge, localStorage, window } = createBadgePage('/MENTOR/HTML/announcements.html');
  let requested = false;
  await window.AnnouncementBadge.refresh(42, async () => { requested = true; return 3; });

  assert.equal(requested, false);
  assert.equal(localStorage.getItem('ann_sidebar_badge_42'), '0');
  assert.ok(Date.parse(localStorage.getItem('ann_sidebar_lastRead_42')));
  assert.equal(badge.style.display, 'none');
});

test('other pages show cached count, then replace it with the fresh role-specific count', async () => {
  const { badge, localStorage, window } = createBadgePage();
  localStorage.setItem('ann_sidebar_badge_42', '2');
  localStorage.setItem('ann_sidebar_lastRead_42', '2026-09-28T00:00:00');
  let resolveCount;
  const refresh = window.AnnouncementBadge.refresh(42, lastRead => {
    assert.equal(lastRead, '2026-09-28T00:00:00');
    return new Promise(resolve => { resolveCount = resolve; });
  });

  assert.equal(badge.textContent, '2');
  resolveCount(1);
  await refresh;
  assert.equal(badge.textContent, '1');
  assert.equal(localStorage.getItem('ann_sidebar_badge_42'), '1');
});

test('a failed fresh-count request leaves the cached badge in place', async () => {
  const { badge, localStorage, window } = createBadgePage();
  localStorage.setItem('ann_sidebar_badge_42', '2');

  await window.AnnouncementBadge.refresh(42, async () => { throw new Error('offline'); });

  assert.equal(badge.textContent, '2');
  assert.equal(localStorage.getItem('ann_sidebar_badge_42'), '2');
});