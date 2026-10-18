const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function context(file) {
  const nodes={};
  const c=vm.createContext({console,Intl,Date,URLSearchParams,setTimeout,clearTimeout,
    document:{addEventListener(){},getElementById(id){return nodes[id]??={innerHTML:'',textContent:'',value:''};}},
    window:{addEventListener(){},location:{origin:'https://test.local'}},
    CONFIG:{getFileUrl:p=>p}});
  vm.runInContext(fs.readFileSync('logsheet-data.js','utf8'),c);
  if(file) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  return {c,nodes,data:vm.runInContext('LogsheetData',c)};
}
test('evidence distinguishes verified, unsupported, explicit absent and missing rows',()=>{
  const {data}=context();
  for(const scannedAt of [null,'','invalid']) {
    assert.equal(data.attendanceState({attendanceID:7,isPresent:true,scannedAt}),null);
  }
  assert.equal(data.attendanceState({attendanceID:7,isPresent:true,scannedAt:'2026-09-28T08:00:00Z'}),true);
  assert.equal(data.attendanceState({attendanceID:7,isPresent:false,scannedAt:null}),false);
  assert.equal(data.attendanceState({attendanceID:0,isPresent:false}),null);
  assert.equal(data.attendanceState({attendanceID:0,isPresent:true,scannedAt:'2026-09-28'}),null);
});
test('historical records and notes survive classification; sections and periods stay separate',()=>{
  const {data}=context();
  const m={menteeID:1,attendanceID:9,isPresent:true,scannedAt:null,sectionCode:'IT-A',remarks:'Historical note'};
  const s={sessionID:1,sessionSectionCode:'IT-A',slotName:'Before Prelims',schoolYear:'Y1',semester:'S1',sessionStatus:'Completed',mentees:[m]};
  const input=[s,{...s,sessionID:2,semester:'S2'},{...s,sessionID:3,sessionSectionCode:'ENG-A',mentees:[{...m,menteeID:2,sectionCode:'ENG-A'}]}];
  const before=JSON.stringify(input), rows=data.merge(input);
  assert.equal(rows.length,3); assert.equal(JSON.stringify(input),before);
  for(const row of rows) {
    assert.equal(row.presentCount,0); assert.equal(row.mentees[0].attendanceUnverified,true);
    assert.equal(data.attendanceState(row.mentees[0]),null);
    assert.equal(row.mentees[0].remarks,'Historical note'); assert.equal(row.mentees[0].attendanceID,9);
  }
});
test('valid makeup evidence wins over unsupported regular presence without duplicate credit',()=>{
  const {data}=context();
  const base={sessionSectionCode:'IT-A',slotName:'Before Prelims',schoolYear:'Y',semester:'S',sessionStatus:'Completed'};
  const m={menteeID:1,sectionCode:'IT-A',attendanceID:1,isPresent:true,scannedAt:null};
  const result=data.merge([{...base,sessionID:1,mentees:[m]},
    {...base,sessionID:2,isMakeup:true,mentees:[{...m,attendanceID:2,scannedAt:'2026-09-28T08:00:00Z'}]},
    {...base,sessionID:3,isMakeup:true,mentees:[{...m,attendanceID:3,scannedAt:'2026-09-28T09:00:00Z'}]}]);
  assert.equal(result.length,1); assert.equal(result[0].presentCount,1);
  assert.equal(result[0].mentees[0]._sourceSessionID,2);
});
test('cancelled-only history gives no verified or absent credit',()=>{
  const {data}=context();
  const row=data.merge([{sessionID:1,sessionStatus:'Cancelled',mentees:[{menteeID:1,attendanceID:1,isPresent:true,scannedAt:'2026-09-28'}]}])[0];
  assert.equal(row.presentCount,0); assert.equal(data.attendanceState(row.mentees[0]),null);
});
test('Mentor scanner presents unsupported history as Unverified, not Present or Absent',()=>{
  const {c,nodes}=context('MENTOR/JS/sessions.js');
  vm.runInContext("attendanceRows=[{menteeID:1,menteeName:'Legacy Row',attendanceRecorded:true,attendanceUnverified:true,isPresent:false},{menteeID:2,menteeName:'Scanned Row',attendanceRecorded:true,isPresent:true}];renderQrAttList()",c);
  assert.equal(nodes.qrAttCount.textContent,'1 / 2 present');
  assert.match(nodes.qrAttList.innerHTML,/Unverified/);
});
test('all changed portal pages load shared evidence before page scripts',()=>{
  for(const [portal,page] of [['MENTOR','sessions'],['MENTOR','logsheet'],['MENTEE','sessions'],['MENTEE','mentee-dashboard'],['ADMIN_','sessions-detail'],['HEAD','mentor-detail']]) {
    const html=fs.readFileSync(`${portal}/HTML/${page}.html`,'utf8');
    assert(html.indexOf('/logsheet-data.js')>=0);
    assert(html.indexOf('/logsheet-data.js')<html.indexOf(`/${portal}/JS/${page}.js`));
  }
});
