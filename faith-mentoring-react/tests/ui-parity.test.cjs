const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('Admin user-management dialogs use the active class required by the legacy stylesheet', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/admin/Users.jsx'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(root, 'public/ADMIN_/CSS/user-management.css'), 'utf8');
  const activeModals = [...source.matchAll(/className="modal-overlay active"/g)];

  assert.equal(activeModals.length, 4, 'edit, section, import, and detail dialogs must all open');
  assert.match(stylesheet, /\.modal-overlay\.active\s*\{\s*display:\s*flex;\s*\}/);
  assert.doesNotMatch(source, /className="modal-overlay open"/);
});

test('Admin user-management tables use the legacy responsive scrolling wrapper', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/admin/Users.jsx'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(root, 'public/ADMIN_/CSS/user-management.css'), 'utf8');

  assert.equal([...source.matchAll(/className="table-wrapper"/g)].length, 4);
  assert.match(stylesheet, /\.table-wrapper\s*\{\s*overflow-x:\s*auto;/);
  assert.doesNotMatch(source, /className="table-responsive"/);
});
