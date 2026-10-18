const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function portal(file) {
  const nodes = {};
  const context = vm.createContext({console, Intl, Date,
    document: {addEventListener(){}, getElementById(id){return nodes[id] ??= {innerHTML:''};}},
    window: {addEventListener(){}}});
  vm.runInContext(fs.readFileSync('dashboard-sessions.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return {context, nodes};
}

test('dashboard keeps first-scan sessions open until Save and Close', () => {
  const {context:c, nodes} = portal('MENTEE/JS/mentee-dashboard.js');
  c.s = {sessionID:1, sessionDate:'2026-09-27T16:00:00', sessionStatus:'Completed', timeEnd:null};
  let html = vm.runInContext('sessionItemHtml(s, {1:false})', c);
  assert.match(html, /In Progress/);
  assert.doesNotMatch(html, />Completed<|>Absent</);
  assert.match(vm.runInContext('sessionItemHtml(s, {1:true})', c), />Present</);
  vm.runInContext('renderUpcomingSessions([s], {1:false})', c);
  assert.match(nodes.recentSessionsList.innerHTML, /In Progress/);
  assert.doesNotMatch(nodes.recentSessionsList.innerHTML, />Completed</);
  c.s.timeEnd = '2026-09-27T17:00:00';
  vm.runInContext('renderUpcomingSessions([s], {1:false})', c);
  assert.match(nodes.recentSessionsList.innerHTML, />Completed</);
  assert.match(nodes.recentSessionsList.innerHTML, />Absent</);
});

test('checkpoint history merges makeup within a period, never across periods', () => {
  const {context:c} = portal('MENTEE/JS/sessions.js');
  const base = {slotName:'Before Prelims', sessionStatus:'Completed', timeEnd:'2026-09-27T17:00:00', sessionDate:'2026-09-27'};
  c.sessions = [
    {...base, sessionID:1, schoolYear:'2025-2026', semester:'1st Semester'},
    {...base, sessionID:2, schoolYear:'2026-2027', semester:'1st Semester'},
    {...base, sessionID:3, schoolYear:'2026-2027', semester:'2nd Semester'},
    {...base, sessionID:4, schoolYear:'2026-2027', semester:'1st Semester', isMakeup:true}
  ];
  const result = vm.runInContext('mergeSessionsByCheckpoint(sessions,{2:false,4:true})', c);
  assert.equal(result.length, 3);
  assert.ok(result.some(s => s.sessionID === 4));
});

test('only published schedules enable checkpoints, including inclusive final day', () => {
  const {context:c} = portal('checkpoint-window.js');
  c.events = [{eventType:'Session Schedule', slotName:'Before Prelims', schoolYear:'2026', semester:'1',
    startDate:'2026-09-20', endDate:'2026-09-27', isPublished:false}];
  const state = () => vm.runInContext("checkpointWindow(events,'Before Prelims','2026','1','2026-09-27')",c);
  assert.equal(state().disabled, true);
  c.events[0].isPublished = true;
  assert.equal(state().disabled, false);
  assert.equal(vm.runInContext("checkpointWindow(events,'Before Prelims','2026','1','2026-09-28').disabled",c), true);
});
