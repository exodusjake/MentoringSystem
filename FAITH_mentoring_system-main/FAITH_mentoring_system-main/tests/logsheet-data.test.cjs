const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function context(file) {
  const elements = {};
  const c = vm.createContext({console, URLSearchParams, setTimeout, clearTimeout,
    window:{location:{origin:'https://test.local'},addEventListener(){}},
    document:{addEventListener(){}, getElementById(id){return elements[id] ||= {innerHTML:''};}},
    CONFIG:{getFileUrl:p=>p}, escapeHtml:s=>String(s || ''),
  });
  vm.runInContext(fs.readFileSync('logsheet-data.js','utf8'),c);
  if(file) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  return {c, elements, data:vm.runInContext('LogsheetData',c)};
}
const base = {sessionID:1,schoolYear:'2026-2027',semester:'1st Semester',slotName:'Mentoring Assembly',sessionSectionCode:'IT1',sessionDate:'2026-09-26T08:00:00',sessionStatus:'Completed',timeStart:'08:00:00',timeEnd:'2026-09-26T16:07:00',isMakeup:false,logStatus:'Submitted',submittedAt:'2026-09-26T17:00:00',proofFilePath:'/regular.jpg'};
const mentee = {menteeID:1,menteeName:'Chad Lim',sectionCode:'IT1',isPresent:true,scannedAt:'2026-09-26T08:07:00',attendanceID:11,remarks:'Good',signatureFilePath:'/signature.png'};
test('UTC scan displays 4:07 PM in Philippines regardless of browser timezone',()=>{
 const {data}=context();assert.equal(data.time(data.scanISO(mentee.scannedAt)),'4:07 PM');
 assert.equal(data.time(data.scanISO('2026-09-26T08:07:00Z')),'4:07 PM');
 assert.equal(data.time(data.scanISO('2026-09-26T16:07:00+08:00')),'4:07 PM');
 assert.equal(data.day(data.scanISO('2026-09-26T17:00:00')),'Sep 27, 2026');
});
test('unscanned presence cannot fall back to scheduled start',()=>{
 const {data}=context();const s=data.merge([{...base,mentees:[{...mentee,scannedAt:null}]}])[0];
 assert.equal(s.presentCount,0);assert.equal(s.actualStart,null);assert.equal(data.time(s.mentees[0].scannedAt),'—');
});
test('make-up merges into checkpoint and retains its own scan, end and proof',()=>{
 const {data}=context();const s=data.merge([{...base,mentees:[{...mentee,isPresent:false,scannedAt:null}]},
 {...base,sessionID:2,isMakeup:true,sessionSectionCode:null,timeEnd:null,proofFilePath:null,
 mentees:[{...mentee,attendanceID:12,scannedAt:'2026-09-27T09:15:00'}]}]);
 assert.equal(s.length,1);assert.equal(s[0].mentees[0]._sourceSessionID,2);
 assert.equal(s[0].mentees[0]._attendedEndTime,null);assert.equal(s[0].mentees[0]._hasProof,false);
 assert.equal(s[0].mentees[0].attendanceID,12);assert.equal(data.time(s[0].mentees[0].scannedAt),'5:15 PM');
});
test('same checkpoint stays separate across sections and semesters, including make-up-only',()=>{
 const {data}=context();const s=data.merge([{...base,isMakeup:true,sessionSectionCode:null,mentees:[mentee,{...mentee,menteeID:2,sectionCode:'CS1'}]},
 {...base,sessionID:3,semester:'2nd Semester',mentees:[mentee]}]);
 assert.equal(s.length,3);assert.equal(new Set(s.map(x=>x.sessionID)).size,3);
 assert.ok(s.every(x=>!x.isMakeup));assert.ok(s.every(x=>x.mentees.length===1));
});
test('resubmission states are independent per section',()=>{
 const {data}=context();const s=data.merge([{...base,isMakeup:true,sessionSectionCode:null,
 checkpointStates:[{sectionCode:'IT1',logStatus:'Draft',needsUpdate:true},{sectionCode:'CS1',logStatus:'Submitted',needsUpdate:false}],
 mentees:[mentee,{...mentee,menteeID:2,sectionCode:'CS1'}]}]);
 assert.equal(s.find(x=>x.sessionSectionCode==='IT1').needsUpdate,true);
 assert.equal(s.find(x=>x.sessionSectionCode==='CS1').needsUpdate,false);
});
test('proof gallery retains separate regular and make-up uploads',()=>{
 const {data}=context();const s=data.merge([{...base,mentees:[mentee]},
 {...base,sessionID:2,isMakeup:true,sessionSectionCode:null,proofFilePath:'/makeup.jpg',mentees:[{...mentee,menteeID:2}]}])[0];
 assert.equal(s._proofSources.length,2);
 assert.equal(s._proofSources[0].filePath,'/regular.jpg');assert.equal(s._proofSources[1].filePath,'/makeup.jpg');
 assert.equal(s.mentees.find(m=>m.menteeID===2)._sourceSessionID,2);
});
test('cancelled rounds contribute neither attendance nor proof',()=>{
 const {data}=context();const s=data.merge([{...base,sessionStatus:'Cancelled',mentees:[mentee]},
 {...base,sessionID:2,proofFilePath:null,mentees:[{...mentee,menteeID:2}]}])[0];
 assert.equal(s.sessionID,2);assert.equal(s.mentees.length,1);assert.equal(s._proofSources.length,0);
});
for(const portal of ['MENTOR/JS/logsheet.js','HEAD/JS/mentor-detail.js']) test(`${portal}: printed actual scan/end and source proof`,()=>{
 const {c,data}=context(portal);c.fixture=data.merge([{...base,mentees:[mentee]}])[0];
 const html=vm.runInContext("buildPrintForm(fixture, {firstName:'Test',lastName:'Mentor'}, '1st Semester')",c);
 assert.ok(html.includes('4:07 PM'));assert.ok(!html.includes('8:00 AM'));assert.ok(!html.includes('8:07 AM'));
 assert.ok(html.includes('/signature.png'));
 c.fixture.mentees[0]._attendedEndTime=null;c.fixture.mentees[0]._hasProof=false;
 const pending=vm.runInContext("buildPrintForm(fixture, null, '1st Semester')",c);
 assert.ok(pending.includes('<td>—</td>'));assert.ok(!pending.includes('/signature.png'));
});
test('Admin logsheet preview uses shared actual times and QR-only presence',()=>{
 const {c,data,elements}=context('ADMIN_/JS/sessions-detail.js');c.fixture=data.merge([{...base,mentees:[mentee,{...mentee,menteeID:2,menteeName:'Unscanned',scannedAt:null}]}])[0];
 vm.runInContext("currentLogsheetData = {proofFilePath:'/regular.jpg'}; renderLogsheetTab(fixture.mentees, 'Mentoring Assembly', 'Sep 26, 2026', '', '', '', true)",c);
 const html=elements.tabContent.innerHTML;assert.ok(html.includes('4:07 PM'));assert.ok(html.includes('Chad Lim'));
 assert.ok(!html.includes('Unscanned'));assert.ok(!html.includes('undefined'));
});
