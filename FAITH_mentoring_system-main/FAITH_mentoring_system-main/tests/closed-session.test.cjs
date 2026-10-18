const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('MENTOR/JS/sessions.js','utf8');
test('closed sessions stay read-only unless valid attendance needs finishing',()=>{
 const c=vm.createContext({sessionCalendar:[],attendanceRows:[],checkpointWindow:()=>({disabled:true}),document:{getElementById:()=>({})}});
 vm.runInContext(source.slice(source.indexOf('function canFinishAttendance'),source.indexOf('async function openQrScanner')),c);
 c.session={sessionStatus:'Scheduled'};
 assert.equal(vm.runInContext('canFinishAttendance(session)',c),false);
 c.attendanceRows=[{isPresent:true,scannedAt:'2026-09-28'}];
 assert.equal(vm.runInContext('canFinishAttendance(session)',c),true);
 c.session.timeEnd='2026-09-28';
 assert.equal(vm.runInContext('canFinishAttendance(session)',c),false);
 c.session={sessionStatus:'Cancelled'};
 assert.equal(vm.runInContext('canFinishAttendance(session)',c),false);
});
test('closed message cancels the old timer and never schedules a reset',()=>{
 const el={_resetTimer:12};let cleared,scheduled=0;
 const c=vm.createContext({document:{getElementById:()=>el},clearTimeout:id=>cleared=id,setTimeout:()=>scheduled++});
 vm.runInContext(source.slice(source.indexOf('function showQrStatus'),source.indexOf('async function saveQrAttendance')),c);
 vm.runInContext("showQrStatus('Attendance closed.', 'error', true)",c);
 assert.equal(cleared,12);assert.equal(scheduled,0);assert.equal(el.textContent,'Attendance closed.');
});
