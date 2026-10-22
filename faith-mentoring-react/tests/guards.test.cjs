const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

class MemoryStorage {
  values = new Map();

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('portal guard enforces authentication, role, and role-specific setup behavior', async () => {
  global.window = { location: { protocol: 'http:', hostname: 'localhost', pathname: '/' } };
  global.localStorage = new MemoryStorage();
  global.sessionStorage = new MemoryStorage();
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    configFile: path.join(root, 'vite.config.js'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  try {
    const { checkPortalAccess } = await vite.ssrLoadModule('/src/app/guards.jsx');
    const admin = { role: 'admin', onSetupRequired: 'setup' };
    const mentor = { role: 'mentor', onSetupRequired: 'logout' };
    const save = (role, setupRequired = false) => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('role', role);
      localStorage.setItem('user', JSON.stringify({ setupRequired }));
    };

    assert.deepEqual(checkPortalAccess(admin, '/admin/dashboard'), { to: '/login' });

    save('Mentor');
    assert.deepEqual(checkPortalAccess(admin, '/admin/dashboard'), { to: '/login' });

    save('Admin', true);
    assert.deepEqual(checkPortalAccess(admin, '/admin/dashboard'), { to: '/admin/setup' });
    assert.equal(checkPortalAccess(admin, '/admin/setup'), null);

    save('Mentor', true);
    assert.deepEqual(checkPortalAccess(mentor, '/mentor/dashboard'), { to: '/login' });
    assert.equal(localStorage.getItem('token'), null, 'mentor setup gating clears the session');

    save('Mentor');
    assert.equal(checkPortalAccess(mentor, '/mentor/dashboard'), null);
  } finally {
    await vite.close();
    delete global.window;
    delete global.localStorage;
    delete global.sessionStorage;
  }
});
