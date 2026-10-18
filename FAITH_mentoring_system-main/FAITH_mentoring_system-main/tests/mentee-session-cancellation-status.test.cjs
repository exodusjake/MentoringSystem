const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadStatusHelper() {
  const context = vm.createContext({
    document: { addEventListener() {} },
    console,
    Date,
    Intl
  });
  const source = fs.readFileSync('MENTEE/JS/sessions.js', 'utf8');
  vm.runInContext(source, context);
  return context.menteeSessionStatus;
}

test('cancelled sessions stay cancelled whether or not they have an end time', () => {
  const status = loadStatusHelper();

  assert.equal(status({ sessionStatus: 'Cancelled' }), 'Cancelled');
  assert.equal(status({ sessionStatus: 'Cancelled', timeEnd: '2026-09-26T11:00:00' }), 'Cancelled');
  assert.equal(status({ sessionStatus: 'Cancelled', presentCount: 1 }), 'Cancelled');
  assert.equal(status({ sessionStatus: 'Cancelled', timeEnd: '2026-09-26T11:00:00', presentCount: 1 }), 'Cancelled');
});

test('scheduled, in-progress and completed status rules are unchanged', () => {
  const status = loadStatusHelper();

  assert.equal(status({ sessionStatus: 'Scheduled' }), 'Scheduled');
  assert.equal(status({ sessionStatus: 'Scheduled', presentCount: 1 }), 'In Progress');
  assert.equal(status({ sessionStatus: 'Completed' }), 'In Progress');
  assert.equal(status({ sessionStatus: 'Completed', timeEnd: '2026-09-26T11:00:00' }), 'Completed');
});
