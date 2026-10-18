const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
test('conducted regular and make-up records count separately; other states do not',()=>{
 const elements={};const c=vm.createContext({Intl,Date,console,window:{addEventListener(){}},document:{addEventListener(){},getElementById:id=>elements[id]??={}}});
 for(const file of ['dashboard-sessions.js','MENTOR/JS/sessions.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.rows=[{sessionStatus:'Completed',actualEnd:'2026-10-12T10:00:00',isMakeup:false},{sessionStatus:'Completed',actualEnd:'2026-10-12T11:00:00',isMakeup:true},{sessionStatus:'Cancelled',actualEnd:'2026-10-12T11:00:00'},{sessionStatus:'Scheduled',sessionDate:'2099-01-01'},{sessionStatus:'Completed',presentCount:1}];
 vm.runInContext('updateStats(rows)',c);
 a.equal(elements.sCompleted.textContent,2);a.equal(elements.sCancelled.textContent,1);a.equal(elements.sScheduled.textContent,1);a.equal(elements.sInProgress.textContent,1);a.equal(elements.sTotalSessions.textContent,5);
});
test('Head overview labels backend session records as conducted, not checkpoint progress',()=>{
 a.match(fs.readFileSync('HEAD/JS/attendance-summary.js','utf8'),/m.totalSessions\} Sessions Conducted/);
 a.match(fs.readFileSync('HEAD/JS/attendance-detail.js','utf8'),/Regular and make-up sessions for the same checkpoint count once/);
});
