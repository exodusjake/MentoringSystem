const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=p=>fs.readFileSync(p,'utf8');
const context=vm.createContext({Date,Intl});
vm.runInContext(src('logsheet-data.js')+';globalThis.rules=LogsheetData;',context);
const rules=context.rules;
test('missing, update and resubmitted states respect Philippine midnight and original period',()=>{
 const first={schoolYear:'2025-2026',semester:'1st Semester',slotName:'Before Prelims',logStatus:'Draft',documentsComplete:true};
 const events=[{...first,isPublished:true,eventType:'Deadline',startDate:'2025-10-10T00:00:00'}];
 assert.equal(rules.reportStatus(first,events,new Date('2025-10-10T15:59:59Z')),'Pending');
 assert.equal(rules.reportStatus(first,events,new Date('2025-10-10T16:00:00Z')),'Overdue');
 assert.equal(rules.reportStatus({...first,needsUpdate:true},events,new Date('2025-10-10T16:00:00Z')),'Needs Update — Overdue');
 assert.equal(rules.reportStatus({...first,logStatus:'Submitted',submittedAt:'2025-10-10T15:59:59Z'},events),'Submitted On Time');
 assert.equal(rules.reportStatus({...first,logStatus:'Submitted',submittedAt:'2025-10-10T16:00:00Z'},events),'Submitted Late');
 assert.equal(rules.reportStatus({...first,semester:'2nd Semester'},events,new Date('2026-01-01T00:00:00Z')),'Pending');
 assert.equal(rules.reportStatus({...first,logStatus:'Submitted',submittedAt:'2025-10-10T12:00:00'},events),'Submitted — timing unavailable');
 assert.equal(rules.reportStatus({...first,logStatus:'Submitted',submittedAt:'2025-10-10T12:00:00Z',documentsComplete:undefined},events),'Submitted — requirements unverified');
 assert.equal(rules.reportStatus(first,[...events,...events],new Date('2026-01-01T00:00:00Z')),'Pending');
});
test('historical print labels never depend on active settings',()=>{
 assert.equal(rules.periodLabel({schoolYear:'2025-2026',semester:'1st Semester'}),'1st Semester, AY 2025-2026');
 for(const p of ['MENTOR/JS/logsheet.js','ADMIN_/JS/sessions-detail.js','HEAD/JS/mentor-detail.js']){
   assert.match(src(p),/LogsheetData\.periodLabel/);
   assert.doesNotMatch(src(p),/\$\{sysSettings\.Semester\}, AY \$\{sysSettings\.SchoolYear\}/);
 }
});
test('period write is serializable, stale-protected and all writes share its transaction',()=>{
 const text=src('AstraMentoring-Backend/AstraMentoring-Backend/Services/SettingsService.cs');
 const body=text.slice(text.indexOf('public async Task<int> UpdateAcademicPeriodAsync'),text.indexOf('// SchoolYear is stored'));
 assert.match(body,/IsolationLevel\.Serializable/);
 assert.match(body,/UPDLOCK,HOLDLOCK/);
 assert.match(body,/oldYear != expectedSchoolYear \|\| oldSemester != expectedSemester/);
 assert.match(body,/IsForwardSchoolYearChange\(oldYear, schoolYear\)/);
 assert.match(body,/tx\.Commit\(\)/);assert.match(body,/catch \{ tx\.Rollback\(\); throw; \}/);
 assert.doesNotMatch(body,/DELETE|UPDATE Users|UPDATE Attendance|UPDATE Sessions/);
 assert.match(src('ADMIN_/JS/settings.js'),/Settings\/academic-period/);
});
test('own history is caller-scoped and preserves cancelled and unverified source evidence',()=>{
 const controller=src('AstraMentoring-Backend/AstraMentoringAPI/Controllers/SessionsAdminController.cs');
 assert.match(controller,/GetOwnAttendanceHistoryAsync\(CallerId, schoolYear, semester\)/);
 const service=src('AstraMentoring-Backend/AstraMentoring-Backend/Services/SessionsAdminService.cs');
 const body=service.slice(service.indexOf('public async Task<List<OwnAttendanceHistoryDto>>'),service.indexOf('public async Task<SessionsMentorDetailDto> GetSessionsForMenteeAsync'));
 assert.match(body,/a\.MenteeID=@MenteeID/);assert.doesNotMatch(body,/IsActive|Status='Completed'|UPDATE|DELETE/);
});
test('prepared history has no speculative backfill and rollback retains captured evidence',()=>{
 assert.match(src('SQL/20261009_assignment_history.prepare.sql'),/HistoryVerified bit NOT NULL/);
 assert.doesNotMatch(src('SQL/20261009_assignment_history.prepare.sql'),/UPDATE dbo\.MentorMentee|INSERT INTO/);
 assert.match(src('SQL/20261009_assignment_history.rollback.sql'),/Captured history exists; retain schema/);
 const credit=src('SQL/20261009_cross_mentor_credit.review.sql');
 assert.match(credit,/PARTITION BY MenteeID,SchoolYear,Semester,SlotName/);
 assert.match(credit,/s\.MentorID,s\.SessionID/);
 assert.match(credit,/HistoryVerified=1/);
});
test('shared report adapter passes each historical period and isolates sections and mentors',async()=>{
 const calls=[];
 const c=vm.createContext({Date,Intl,apiRequest:async(path)=>{calls.push(path);return [
   {schoolYear:'2025-2026',semester:'1st Semester',sectionCode:'IT-A',slotName:'Before Prelims',status:'Submitted On Time'},
   {schoolYear:'2025-2026',semester:'1st Semester',sectionCode:'IT-B',slotName:'Before Prelims',status:'Overdue'}];}});
 vm.runInContext(src('logsheet-data.js')+';globalThis.rules=LogsheetData;',c);
 const sessions=[{schoolYear:'2025-2026',semester:'1st Semester',sessionSectionCode:'IT-A',slotName:'Before Prelims'},
   {schoolYear:'2025-2026',semester:'1st Semester',sessionSectionCode:'IT-B',slotName:'Before Prelims'},
   {schoolYear:'2026-2027',semester:'2nd Semester',sessionSectionCode:'IT-A',slotName:'Before Prelims'}];
 const rows=await c.rules.withReportStatuses(sessions,17);
 assert.equal(rows[0].reportStatus,'Submitted On Time');assert.equal(rows[1].reportStatus,'Overdue');assert.equal(rows[2].reportStatus,undefined);
 assert.equal(calls.length,2);assert.ok(calls.every(p=>p.startsWith('MonitorActivities/17/reports?')));
 assert.ok(calls.some(p=>p.includes('schoolYear=2025-2026')&&p.includes('semester=1st%20Semester')));
 for(const portal of ['MENTOR/JS/logsheet.js','ADMIN_/JS/sessions-detail.js','HEAD/JS/mentor-detail.js']) assert.match(src(portal),/LogsheetData\.withReportStatuses/);
});
test('settings save sends the pair once and includes stale-period protection',async()=>{
 const calls=[];
 const elements={fieldSchoolYear:{value:'2027-2028'},fieldSemester:{value:'1st Semester'}};
 for(const el of Object.values(elements)) el.closest=()=>({querySelector:()=>({disabled:false})});
 const c=vm.createContext({document:{addEventListener(){},getElementById:id=>elements[id]},showConfirm:async()=>true,showToast(){},apiRequest:async(...args)=>{calls.push(args);return {message:'Saved'};}});
 vm.runInContext(src('ADMIN_/JS/settings.js')+`;isUnlocked=true;latestValues={SchoolYear:'2026-2027',Semester:'2nd Semester'};globalThis.save=saveAcademicPeriod;`,c);
 await c.save();assert.equal(calls.length,1);assert.equal(calls[0][0],'Settings/academic-period');
 assert.equal(calls[0][2].schoolYear,'2027-2028');assert.equal(calls[0][2].semester,'1st Semester');assert.equal(calls[0][2].expectedSemester,'2nd Semester');
});
