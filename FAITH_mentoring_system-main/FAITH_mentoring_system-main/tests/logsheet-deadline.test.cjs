const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('fs');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('logsheet-data.js','utf8'),ctx);const data=vm.runInContext('LogsheetData',ctx);
const session={schoolYear:'2026-2027',semester:'1st Semester',slotName:'After Prelims',logStatus:'Draft'};
const event={...session,eventType:'Deadline',isPublished:true,startDate:'2026-10-16T00:00:00'};
test('October 12 is not overdue with October 16 submission deadline; next Manila midnight is boundary',()=>{
 assert.equal(data.reportStatus(session,[event],new Date('2026-10-12T12:00:00+08:00')),'Pending');
 assert.equal(data.reportStatus(session,[event],new Date('2026-10-16T23:59:59+08:00')),'Pending');
 assert.equal(data.reportStatus(session,[event],new Date('2026-10-17T00:00:00+08:00')),'Overdue');
});
test('separate earlier deadline governs status; missing or duplicate deadlines never invent overdue',()=>{
 assert.equal(data.reportStatus(session,[{...event,startDate:'2026-10-11'}],new Date('2026-10-12T12:00:00+08:00')),'Overdue');
 assert.equal(data.reportStatus(session,[],new Date('2026-10-12')),'Pending');
 assert.equal(data.reportStatus(session,[event,event],new Date('2026-10-20')),'Pending');
});
test('authoritative report response overrides local inference',()=>{
 assert.equal(data.reportStatus({...session,reportStatus:'Submitted On Time'},[],new Date()),'Submitted On Time');
});
