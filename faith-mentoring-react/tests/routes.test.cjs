const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('every registered route loads a page instead of a not-ported placeholder', async () => {
  const pagesDir = path.join(root, 'src/pages');
  const registry = fs.readFileSync(path.join(pagesDir, 'index.js'), 'utf8');
  assert.match(registry, /export const PAGES\s*=\s*\{/);
  assert.doesNotMatch(registry, /notPorted|NotPorted/, 'all route entries must point to migrated pages');

  const entries = [...registry.matchAll(/^\s+(?:'([^']+)'|([A-Za-z]\w*)): \(\)\s*=>\s*import\('([^']+)'\),?$/gm)];
  assert.equal(entries.length, 46, 'all public and portal routes must be registered');
  for (const [, quotedRoute, unquotedRoute, importPath] of entries) {
    const route = quotedRoute || unquotedRoute;
    assert.ok(fs.existsSync(path.resolve(pagesDir, importPath)), `${route} must resolve to an existing page module`);
  }
});

test('every canonical HTML page has a legacy redirect entry', async () => {
  const canonicalRoot = path.resolve(root, '../FAITH_mentoring_system-main/FAITH_mentoring_system-main');
  const pageDirectories = [
    'LANDING/HTML',
    'LOGIN/HTML',
    'ADMIN_/HTML',
    'HEAD/HTML',
    'MENTOR/HTML',
    'MENTEE/HTML',
  ];
  const canonicalPages = pageDirectories.flatMap(directory => fs.readdirSync(path.join(canonicalRoot, directory))
    .filter(file => file.endsWith('.html') && !file.toLowerCase().includes('sidebar'))
    .map(file => `/${directory}/${file}`));
  const { LEGACY_PATHS, legacyTarget } = await import('../src/app/legacyRedirects.js');

  assert.equal(canonicalPages.length, 46);
  for (const oldPath of canonicalPages) {
    assert.ok(LEGACY_PATHS.includes(oldPath), `${oldPath} must be in the legacy redirect table`);
    assert.ok(legacyTarget(oldPath, '?parity-check=1')?.includes('parity-check=1'), `${oldPath} must preserve query parameters`);
  }
  assert.equal(legacyTarget('/index.html', ''), '/');
});

test('legacy deep links preserve non-id query parameters and move detail IDs into the route', async () => {
  const { legacyTarget } = await import('../src/app/legacyRedirects.js');

  assert.equal(
    legacyTarget('/HEAD/HTML/mentor-detail.html', '?id=42&school=Technology'),
    '/head/monitoring/42?school=Technology',
  );
  assert.equal(
    legacyTarget('/ADMIN_/HTML/user-management.html', '?role=mentor&engagement=active'),
    '/admin/users?role=mentor&engagement=active',
  );
});
