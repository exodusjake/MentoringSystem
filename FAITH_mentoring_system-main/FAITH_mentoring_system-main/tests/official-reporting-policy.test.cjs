const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const service=fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/MonitorActivitiesService.cs','utf8');
const booking=fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/AvailabilityWorkflowService.cs','utf8');
const migration=fs.readFileSync('SQL/20261009_qr_calendar_attendance.sql','utf8');
const rollback=fs.readFileSync('SQL/20261009_qr_calendar_attendance.rollback.sql','utf8');
const extract=name=>service.match(new RegExp(`${name} = """([\\s\\S]*?)""";`))[1];
const modules=[...migration.matchAll(/EXEC sys\.sp_executesql N'((?:''|[^'])*)';/g)].map(m=>m[1].replaceAll("''","'"));

test('official completion and payment require published matching-period schedule, not current time',()=>{
  for(const sql of [extract('SectionProgressSql'),extract('CheckpointSummarySql'),modules[0]]) {
    assert.match(sql,/e\.IsPublished\s*=\s*1/);
    assert.match(sql,/e\.SchoolYear\s*=\s*s\.SchoolYear/);
    assert.match(sql,/e\.Semester\s*=\s*s\.Semester/);
    assert.match(sql,/e\.SlotName\s*=\s*s\.SlotName/);
    assert.match(sql,/CAST\(s\.SessionDate AS date\) BETWEEN/);
    assert.match(sql,/COALESCE\(e\.EndDate,\s*e\.StartDate\)/);
    assert.match(sql,/EXISTS \(SELECT 1 FROM (?:dbo\.)?CalendarEvents/);
  }
});

test('completeness requires submitted state, mentor signature and proof from the eligible section/checkpoint',()=>{
  const sql=extract('SectionProgressSql');
  const documents=sql.split('), Documents AS (')[1].split('), Metrics AS (')[0];
  assert.match(documents,/LogStatus='Submitted'/);
  assert.match(documents,/SignatureFilePath/);
  assert.match(documents,/src\.SectionCode=c\.SectionCode AND src\.SlotName=c\.SlotName/);
  assert.match(documents,/JOIN ProofOfSession p ON p\.SessionID=src\.SessionID/);
  assert.doesNotMatch(documents,/Remarks|MentorNotes|Worksheet|OnTime/);
  assert.match(sql,/SUM\(m\.DocumentsComplete\)/);
  assert.match(sql,/c\.DocumentsComplete=1 AND EXISTS/);
});

test('one completed section checkpoint and one payable mentee credit remain different aggregations',()=>{
  assert.match(extract('SectionProgressSql'),/PARTITION BY MentorID,SectionCode,SlotName/);
  const payable=extract('CheckpointSummarySql');
  assert.match(payable,/COUNT\(DISTINCT CASE WHEN s\.Status='Completed'/);
  assert.match(payable,/a\.IsPresent=1 AND a\.ScannedAt IS NOT NULL/);
  assert.match(payable,/mm\.AssignedDate<=s\.SessionDate/);
  assert.match(payable,/GROUP BY s\.MentorID,s\.SlotName/);
  assert.doesNotMatch(payable,/GROUP BY[^\n]*SectionCode/);
  assert.doesNotMatch(payable.match(/COUNT\(DISTINCT CASE([\s\S]*?)END\)/)[1],/EXISTS/,
    'SQL Server cannot aggregate an expression containing a subquery');
});

test('assembly earns first-semester document credit and is excluded from second semester',()=>{
  assert.match(extract('SectionProgressSql'),/s\.Semester<>'2nd Semester' OR s\.SlotName<>'Mentoring Assembly'/);
  assert.match(service,/e\.SlotName='Mentoring Assembly' AND @Semester<>'2nd Semester'/);
});

test('unverified or out-of-window history cannot block make-up eligibility',()=>{
  for(const name of ['CompletedCheckpointSql','CompletedCheckpointAvailabilitySql']) {
    const sql=booking.match(new RegExp(`${name} = """([\\s\\S]*?)""";`))[1];
    assert.match(sql,/att\.IsPresent = 1/);
    assert.match(sql,/att\.ScannedAt IS NOT NULL/);
    assert.match(sql,/e\.IsPublished=1/);
    assert.match(sql,/CAST\(s\.SessionDate AS date\) BETWEEN/);
  }
});

test('migration alters only verified exported modules and preserves history and result contracts',()=>{
  assert.equal(modules.length,4);
  assert.match(modules[0],/FUNCTION dbo\.fn_MenteeCheckpointAttendance/);
  assert.match(modules[1],/PROCEDURE dbo\.sp_GetMentorDetail/);
  assert.match(modules[2],/PROCEDURE dbo\.sp_GetMentorMenteeAttendance/);
  assert.match(modules[3],/PROCEDURE dbo\.sp_GetAttendanceFullReport/);
  for(const sql of modules.slice(2))
    assert.match(sql,/CASE WHEN @Semester='2nd Semester' THEN 5 ELSE 6 END AS RequiredSessions/);
  for(const sql of modules) {
    for(const present of sql.matchAll(/\b(\w+)\.IsPresent\s*=\s*1/g))
      assert.match(sql.slice(present.index,present.index+100),new RegExp(`${present[1]}\\.ScannedAt IS NOT NULL`));
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i);
  }
  assert.doesNotMatch(modules[0].match(/MAX\(CASE([\s\S]*?)END\)/)[1],/EXISTS/);
  for(const sql of modules) assert.match(sql,/^CREATE OR ALTER (?:FUNCTION|PROCEDURE)[^]*\n/,
    'Executable SQL must retain line breaks so comments cannot swallow the definition');
  for(const script of [migration,rollback]) {
    assert.match(script,/Definition drift or VIEW DEFINITION unavailable/);
    assert.match(script,/BEGIN TRANSACTION/);
    assert.match(script,/ROLLBACK TRANSACTION/);
  }
});

test('evaluation weighting and approved late-report brackets stay intact',()=>{
  assert.match(service,/timelinessScore \+ completeness \* 0\.25 \+ rating \* 0\.50/);
  assert.match(service,/lateCount >= totalRequired\) return 7;[\s\S]*?<= 0 => 25,[\s\S]*?<= 2 => 21,[\s\S]*?3 => 19,[\s\S]*?<= 5 => 11/);
});

test('second-semester Assembly is rejected by browser and server guards even if published',()=>{
  const context=vm.createContext({Intl,Date});
  vm.runInContext(fs.readFileSync('checkpoint-window.js','utf8'),context);
  context.events=[{isPublished:true,eventType:'Session Schedule',slotName:'Mentoring Assembly',schoolYear:'Y',semester:'2nd Semester',startDate:'2026-10-01',endDate:'2026-10-31'}];
  assert.equal(vm.runInContext("checkpointWindow(events,'Mentoring Assembly','Y','2nd Semester','2026-10-09').label",context),'N/A');
  const policy=fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/CheckpointWindowPolicy.cs','utf8');
  assert.match(policy,/SlotName<>'Mentoring Assembly' OR Semester<>'2nd Semester'/);
  assert.match(policy,/s\.SlotName<>'Mentoring Assembly' OR s\.Semester<>'2nd Semester'/);
});

for(const portal of ['ADMIN_','HEAD']) test(`${portal} multiple mentors preserve first-period Assembly, second-period N/A, payment and pending ranks`,()=>{
  const nodes={};
  const context=vm.createContext({document:{addEventListener(){},getElementById(id){return nodes[id]??={value:'',innerHTML:'',textContent:'',style:{}};}},window:{addEventListener(){}},console});
  vm.runInContext(fs.readFileSync('security-utils.js','utf8'),context);
  vm.runInContext(fs.readFileSync(`${portal}/JS/evaluation-ratings.js`,'utf8'),context);
  vm.runInContext(`allMentors=[
    {mentorID:1,firstName:'A',lastName:'Mentor',slotAttendance:'Mentoring Assembly:4, Before Prelims:2',completedSlots:['Mentoring Assembly','Before Prelims'],overallPercent:76,timelinessPercent:11},
    {mentorID:2,firstName:'B',lastName:'Mentor',slotAttendance:'Before Prelims:3',completedSlots:['Before Prelims'],overallPercent:72,timelinessPercent:7},
    {mentorID:3,firstName:'C',lastName:'Mentor',slotAttendance:'',completedSlots:[],overallPercent:null,timelinessPercent:null,timelinessPending:true}
  ];buildRankMap();renderTable();renderProgramReportTable()`,context);
  assert.equal(nodes.prSummaryAmount.textContent,'\u20b1450.00');
  assert.equal(vm.runInContext('rankMap.has(3)',context),false);
  assert.match(nodes.tableBody.innerHTML,/Pending/);
  vm.runInContext("sysSettings.Semester='2nd Semester';renderTable();renderProgramReportTable()",context);
  assert.equal(nodes.prSummaryAmount.textContent,'\u20b1250.00');
  assert.match(nodes.tableBody.innerHTML,/color:#6b7280;background:#f3f4f6[^]*N\/A/);
  assert.match(nodes.prTableBody.innerHTML,/N\/A/);
  assert.match(nodes.prTableHeadRow.innerHTML,/for 5 sessions/);
  vm.runInContext("sysSettings.Semester='1st Semester';renderProgramReportTable()",context);
  assert.equal(nodes.prSummaryAmount.textContent,'\u20b1450.00');
});

test('due missing submissions stay separate from actual late submissions and have no invented grade',()=>{
  assert.match(service,/AS MissingCount/);
  assert.match(service,/AS LateCount/);
  assert.match(service,/m\.LogStatus='Submitted' AND m\.SubmittedAt IS NOT NULL/);
  assert.match(service,/m\.TimelinessPercent = m\.TimelinessPending \? null/);
  assert.match(service,/m\.OverallPercent = m\.TimelinessPending \? null/);
  assert.equal((service.match(/int timelinessRequired = requiredSessions;/g)||[]).length,2);
});

for(const portal of ['ADMIN_','HEAD']) test(`${portal} history keeps verified, unverified, absent and missing attendance distinct`,()=>{
  const history={innerHTML:''};
  const context=vm.createContext({document:{addEventListener(){},getElementById(){return history;}},window:{},console});
  vm.runInContext(fs.readFileSync('logsheet-data.js','utf8'),context);
  vm.runInContext(fs.readFileSync(`${portal}/JS/attendance-detail.js`,'utf8'),context);
  for(const [row,label] of [
    [{isPresent:true,isRecorded:true,scannedAt:'2026-09-28T01:00:00Z'},'badge-present">Present'],
    [{isPresent:true,isRecorded:true,scannedAt:null},'badge-unrecorded">Unverified'],
    [{isPresent:true,isRecorded:true,scannedAt:'invalid'},'badge-unrecorded">Unverified'],
    [{isPresent:false,isRecorded:true,scannedAt:null},'badge-absent">Absent'],
    [{isPresent:false,isRecorded:false},'badge-unrecorded">Not recorded']
  ]) {
    context.rows=[{...row,sessionStatus:'Completed',slotName:'Before Prelims'}];
    vm.runInContext('renderHistory(rows)',context);
    assert.ok(history.innerHTML.includes(label),label);
  }
  const html=fs.readFileSync(`${portal}/HTML/attendance-detail.html`,'utf8');
  assert.ok(html.indexOf('/logsheet-data.js')<html.indexOf(`/${portal}/JS/attendance-detail.js`));
  const summary=fs.readFileSync(`${portal}/HTML/${portal==='ADMIN_'?'attendance-logs':'attendance-summary'}.html`,'utf8');
  assert.match(summary,/No verified credit/);
});
