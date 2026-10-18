const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('HEAD: all-Pending mentors reconcile without inventing finalized grades', () => {
  const {context:c,elements}=dashboard('HEAD');
  const mentors=Array.from({length:6},(_,i)=>({mentorID:i+1,school:i<4?'School of Technology':'Unmapped school',progressStatus:'Pending',overallPercent:null,completedSessions:i===0?1:0,requiredSessions:6}));
  const before=JSON.stringify(mentors);
  c.renderMentorPerformanceCard({mentors});c.renderSchoolBreakdown({mentors});c.renderTop3Mentors({mentors});
  assert.equal(elements.get('totalMentors').textContent,6);
  for(const id of ['mNotStarted','mNeedsAttention','mOnTrack','mExcellent'])assert.equal(elements.get(id).textContent,0);
  assert.match(elements.get('progressChartDesc').textContent,/6 Pending/);
  assert.match(elements.get('mentorPendingCount').textContent,/6 Pending/);
  assert.match(elements.get('schoolBreakdown').innerHTML,/4 Pending/);
  assert.match(elements.get('schoolBreakdown').innerHTML,/Unmapped school/);
  assert.match(elements.get('top3List').innerHTML,/Checkpoint attendance alone does not finalize/);
  c.renderMenteeEngagement({activeMentees:2,assigned:25,totalMentees:25});
  assert.equal(elements.get('engActive').textContent,2);assert.equal(elements.get('engInactive').textContent,23);
  assert.equal(JSON.stringify(mentors),before);
});

test('HEAD: Pending mentor with a stale score is excluded from finalized ranking',()=>{
  const {context:c,elements}=dashboard('HEAD');
  c.renderTop3Mentors({mentors:[{progressStatus:'Pending',overallPercent:90,completedSessions:1}]});
  assert.match(elements.get('top3List').innerHTML,/No finalized positive performance/);
});

test('ADMIN_: six Pending mentors remain separate and unranked',()=>{
  const {context:c,elements,charts}=dashboard('ADMIN_');
  const mentors=Array.from({length:6},(_,i)=>({progressStatus:'Pending',completedSessions:i===0?1:0,requiredSessions:6,overallPercent:null}));
  const before=JSON.stringify(mentors);
  c.renderChart({}, {mentors});c.renderTop3Mentors({mentors});
  assert.deepEqual(Array.from(charts[0].data.datasets[0].data),[0,0,0,0,6]);
  assert.match(elements.get('top3List').innerHTML,/even when checkpoints have been completed/);
  assert.equal(JSON.stringify(mentors),before);
});

function dashboard(portal) {
  const elements = new Map();
  const document = {
    addEventListener() {}, querySelector() { return null; },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {},
        classList: { toggle() {} }, closest() { return null; } });
      return elements.get(id);
    }, documentElement: {}
  };
  const charts = [];
  function Chart(canvas, options) { charts.push(options); }
  Chart.getChart = () => null;
  const context = vm.createContext({ document, Chart, console,
    getComputedStyle: () => ({ getPropertyValue: () => '#000' }) });
  vm.runInContext(fs.readFileSync(`${portal}/JS/dashboard.js`, 'utf8'), context);
  return { context, elements, charts };
}

for (const portal of ['ADMIN_', 'HEAD']) {
  const head = portal === 'HEAD';
  test(`${portal}: unavailable monitoring never renders successful zero or empty ranking`, () => {
    const { context: c, elements, charts } = dashboard(portal);
    if (head) { c.renderMentorPerformanceCard(null); c.renderSchoolBreakdown(null); }
    else c.renderChart({}, null);
    c.renderTop3Mentors(null);
    assert.match(elements.get('top3List').innerHTML, /font-size:12px.*Unavailable/);
    if (head) assert.equal(elements.get('totalMentors').textContent, '\u2014');
    else assert.match(elements.get('chartDesc').innerHTML, /Unavailable/);
    assert.equal(charts.length, 0);
    // Successful independent engagement remains usable.
    (head ? c.renderMenteeEngagement : c.renderEngagement)({ activeMentees: 2, assigned: 25 });
    assert.equal(elements.get(head ? 'engActive' : 'engAssignedActive').textContent, 2);
  });
  test(`${portal}: real empty monitoring is valid zero data`, () => {
    const { context: c, elements, charts } = dashboard(portal);
    if (head) c.renderMentorPerformanceCard({ mentors: [] });
    else c.renderChart({}, { mentors: [] });
    c.renderTop3Mentors({ mentors: [] });
    if (head) assert.equal(elements.get('totalMentors').textContent, 0);
    else assert.deepEqual(Array.from(charts[0].data.datasets[0].data), [0,0,0,0,0]);
    assert.match(elements.get('top3List').innerHTML, /No finalized positive performance/);
  });
  test(`${portal}: Pending remains separate; all mentor counts reconcile`, () => {
    const { context: c, elements, charts } = dashboard(portal);
    const data = { mentors: [
      { progressStatus: 'Pending', completedSessions: 1, overallPercent: null },
      { progressStatus: 'Excellent', completedSessions: 6 },
      { progressStatus: 'Critical', completedSessions: 0 }
    ] };
    assert.equal(c.mentorTierGroup('Pending', 1), 'Pending');
    if (head) {
      c.renderMentorPerformanceCard(data); c.renderSchoolBreakdown(data);
      assert.equal(elements.get('totalMentors').textContent, 3);
      assert.equal(elements.get('mNotStarted').textContent, 1);
      assert.equal(elements.get('mExcellent').textContent, 1);
      assert.match(elements.get('schoolBreakdown').innerHTML, /1 Pending/);
    } else {
      c.renderChart({}, data);
      assert.deepEqual(Array.from(charts[0].data.datasets[0].data), [1,0,0,1,1]);
    }
    assert.match(elements.get(head ? 'progressChartDesc' : 'chartDesc').textContent, /1 Pending/);
  });
  test(`${portal}: failed stats and alerts remain unavailable`, () => {
    const { context: c, elements } = dashboard(portal);
    (head ? c.renderMenteeEngagement : c.renderEngagement)(null);
    c.renderSystemAlerts(null, null);
    assert.equal(elements.get(head ? 'engActive' : 'engAssignedActive').textContent, '\u2014');
    assert.equal(elements.get('alertTitle1').textContent, 'Unavailable');
    assert.equal(elements.get('alertTitle2').textContent, 'Unavailable');
  });
  test(`${portal}: failed/canceled requests follow the unavailable path`, async () => {
    const { context: c, elements } = dashboard(portal);
    c.apiRequest = async () => { throw new Error('API Timeout / canceled / failed'); };
    await c.loadDashboard();
    assert.match(elements.get('top3List').innerHTML, /font-size:12px.*Unavailable/);
    assert.equal(elements.get(head ? 'totalMentors' : 'statMentors').textContent, '\u2014');
  });
  test(`${portal}: recovery restores real counts without changing progress values`, () => {
    const { context: c, elements, charts } = dashboard(portal);
    const mentor = { completedSessions: 1, requiredSessions: 6,
      completenessPercent: 16.7, progressStatus: 'Pending', overallPercent: null };
    const data = { mentors: [mentor] };
    if (head) {
      c.renderMentorPerformanceCard(null);
      c.renderMentorPerformanceCard(data);
      assert.equal(elements.get('totalMentors').textContent, 1);
    } else {
      c.renderChart({}, null);
      c.renderChart({}, data);
      assert.deepEqual(Array.from(charts[0].data.datasets[0].data), [0,0,0,0,1]);
    }
    assert.equal(mentor.completedSessions, 1);
    assert.equal(mentor.requiredSessions, 6);
    assert.equal(mentor.completenessPercent, 16.7);
  });
}
