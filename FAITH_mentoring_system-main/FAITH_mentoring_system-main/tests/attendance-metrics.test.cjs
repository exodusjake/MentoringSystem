const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const metrics = require('../attendance-metrics.js');
function page(path) {
  const context = { AttendanceMetrics: metrics, document: { addEventListener() {} }, window: { addEventListener() {} }, console };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path, 'utf8'), context); return context;
}
test('attendance rate and semester completion have explicit different denominators', () => {
  assert.equal(metrics.percent(1, 2), 50);
  assert.equal(Math.round(metrics.percent(1, 6)), 17);
  assert.equal(metrics.percent(0, 0), 0);
  assert.equal(metrics.status(0, 0).label, 'No completed checkpoints yet');
  assert.equal(metrics.status(0, 2).label, 'Critical');
});
test('Admin and Head status thresholds match unrounded backend rates', () => {
  for (const file of ['ADMIN_/JS/attendance-detail.js', 'HEAD/JS/attendance-detail.js']) {
    const context = page(file);
    for (const [rate, label] of [[19.9,'Critical'],[20,'At Risk'],[39.9,'At Risk'],[40,'Behind'],[59.9,'Behind'],[60,'On Track'],[79.9,'On Track'],[80,'Excellent']]) {
      assert.equal(context.menteeStatusInfo(rate, 100).label, label);
    }
  }
});
test('Mentor completion uses the semester requirement without attendance badges', () => {
  const context = page('MENTOR/JS/my-activities.js');
  const card = context.menteeCardHtml({firstName:'Test',lastName:'Mentee', sessionsAttended:1,totalCompleted:2,totalSessions:6,status:'Behind'});
  assert.match(card,/width:17%/); assert.match(card,/1 \/ 6/); assert.doesNotMatch(card,/Attendance: Behind/);
  assert.doesNotMatch(card,/Attendance Rate/);
});
test('shared metrics load before all seven affected page scripts', () => {
  for (const [portal,pageName] of [['MENTOR','my-activities'],['MENTEE','mentee-dashboard'],['MENTEE','sessions'],['ADMIN_','attendance-detail'],['HEAD','attendance-detail'],['ADMIN_','attendance-logs'],['HEAD','attendance-summary']]) {
    const html=fs.readFileSync(`${portal}/HTML/${pageName}.html`,'utf8');
    assert(html.indexOf('/attendance-metrics.js')>=0);
    assert(html.indexOf('/attendance-metrics.js')<html.indexOf(`/${portal}/JS/${pageName}.js`));
  }
});
test('Admin and Head CSV/print keep checkpoint totals and status consistent', async () => {
  for (const file of ['ADMIN_/JS/attendance-logs.js','HEAD/JS/attendance-summary.js']) {
    let csv='', printed='';
    const data={requiredSessions:6,mentors:[{mentorID:1,firstName:'Test',lastName:'Mentor',totalSessions:3,mentees:[{menteeID:10,menteeFirstName:'Test',menteeLastName:'Mentee',totalSessions:2,presentCount:1}]}]};
    const context=page(file);
    context.apiRequest=async()=>data;
    context.Blob=class { constructor(parts){ csv=parts.join(''); } };
    context.URL={createObjectURL:()=>'',revokeObjectURL(){}};
    context.document.createElement=()=>({click(){}});
    context.window.location={origin:'http://localhost'};
    context.window.open=()=>({document:{write(html){printed=html;},close(){}},focus(){},print(){}});
    context.setTimeout=()=>{};
    vm.runInContext('currentFiltered = [{mentorID:1}]',context);
    await context.exportCSV();
    const rows=csv.trim().split('\r\n').map(line=>line.split(','));
    // Quoted mentor names contain a comma; compare header and literal columns instead.
    assert.match(csv,/Completed Sessions \(Mentor\)/); assert.match(csv,/Completed Checkpoints \(Mentee\)/);
    assert.match(csv,/Behind/); assert.match(csv,/50/);
    await context.printReport();
    assert.match(printed,/Completed Checkpoints/); assert.match(printed,/50%/); assert.match(printed,/Behind/);
    assert.match(printed,/same checkpoint count once per mentee/);
    assert(!printed.includes('NaN'));
  }
});
test('Mentee dashboard and sessions distinguish completion from attendance rate', async () => {
  for(const file of ['MENTEE/JS/mentee-dashboard.js','MENTEE/JS/sessions.js']) {
    const context=page(file); const elements={};
    context.document.getElementById=id=>elements[id]??=( {textContent:'',style:{}} );
    context.apiRequest=async()=>({mentees:[{menteeID:10,sessionsAttended:1,totalCompleted:2,totalSessions:6}]});
    vm.runInContext('currentUser={userID:10}; mentorUserId=1;',context);
    await context.loadAttendanceProgress();
    const subtitle=elements.statAttSub||elements.attProgressSub;
    assert.match(subtitle.textContent,/5 checkpoints remaining/);
    assert.doesNotMatch(subtitle.textContent,/Attendance Rate/);
    if(elements.attBarFill) assert.equal(elements.attBarFill.style.width,'17%');
  }
});
test('Admin and Head completion cards use configured requirement and preserve history', () => {
  for(const file of ['ADMIN_/JS/attendance-detail.js','HEAD/JS/attendance-detail.js']) {
    const context=page(file);
    vm.runInContext('semesterRequired=6',context);
    const card=context.renderMenteeCard({menteeID:10,menteeFirstName:'Test',menteeLastName:'Mentee',presentCount:1,totalSessions:2});
    assert.match(card,/1\/6 attended/); assert.match(card,/width:17%/);
    assert.doesNotMatch(card,/mnc-status-badge|Missed:|Attended:|Attendance Rate/);
    assert.match(card,/openHistory\(10/);
  }
  assert.equal(metrics.completion(0,6),'not-started');
  assert.equal(metrics.completion(1,6),'in-progress');
  assert.equal(metrics.completion(6,6),'complete');
  assert.equal(metrics.completion(0,0),'not-configured');
});
